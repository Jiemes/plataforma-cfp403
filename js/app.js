// Lógica de inicio de sesión con Firebase Auth v9.18.3
function cfpAlert(title, message) {
    const modal = document.getElementById('cfp-alert');
    if (!modal) return alert(message);
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    modal.classList.add('active');
}

function closeCfpAlert() {
    document.getElementById('cfp-alert').classList.remove('active');
}

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const rawPass = document.getElementById('password').value.trim();
    const cleanDni = rawPass.replace(/\./g, '').replace(/-/g, '');

    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = 'Verificando...';
    btn.disabled = true;

    try {
        // 0. ADMIN MAESTRO (Sanity check)
        if (email === 'sanchezjuanmanuel@abc.gob.ar' && rawPass === 'Perroloco2026') {
            try { 
                await authFirebase.signInWithEmailAndPassword(email, rawPass); 
            } catch(err) { 
                if(err.code === 'auth/user-not-found' || err.code === 'auth/invalid-login-credentials') {
                    await authFirebase.createUserWithEmailAndPassword(email, rawPass); 
                } else throw err; 
            }
            const mainAdmin = { role: 'super-admin', nombre: 'Admin Maestro', cursos: 'all' };
            await db.collection('usuarios_auth').doc(email).set(mainAdmin);
            localStorage.setItem('admin_session', JSON.stringify(mainAdmin));
            window.location.href = 'admin.html';
            return;
        }

        // 1. INTENTAR LOGIN DIRECTO (Cubre Alumnos ya registrados y Admins/Docs pre-existentes)
        let isLoggedIn = false;
        try {
            await authFirebase.signInWithEmailAndPassword(email, rawPass);
            isLoggedIn = true;
        } catch(err) {
            // Permitimos que 'invalid-login-credentials' pase al chequeo de Firestore, 
            // ya que Firebase ahora lo usa de forma genérica para usuario no encontrado o clave mal.
            if (err.code === 'auth/wrong-password') {
                throw new Error("🔑 Contraseña incorrecta. Si ya ingresaste antes y la cambiaste, usa 'Recuperar Contraseña'.");
            }
            if (err.code !== 'auth/user-not-found' && err.code !== 'auth/invalid-login-credentials' && err.code !== 'permission-denied') throw err;
        }

        // 2. SI LOGUEÓ: VERIFICAR SI ES ADMIN O ALUMNO
        if (isLoggedIn) {
            const adminDoc = await db.collection('usuarios_auth').doc(email).get();
            if (adminDoc.exists) {
                const adminData = adminDoc.data();
                localStorage.setItem('admin_session', JSON.stringify({
                    email: email, role: adminData.role, nombre: adminData.nombre || 'Administrador', cursos: adminData.cursos || []
                }));
                window.location.href = 'admin.html';
                return;
            }
        }

        // 3. SI NO LOGUEÓ: PROCESAR REGISTRO INICIAL (DNI COMO CLAVE)
        if (!isLoggedIn) {
            // CASO A: Es un Admin/Docente con clave temporal
            try {
                const adminCheck = await db.collection('usuarios_auth').doc(email).get();
                if (adminCheck.exists) {
                    const aData = adminCheck.data();
                    if (aData.password_init && (aData.password_init === cleanDni || aData.password_init === rawPass)) {
                        try {
                            await authFirebase.createUserWithEmailAndPassword(email, rawPass);
                        } catch(ee) {
                            if (ee.code !== 'auth/email-already-in-use') throw ee;
                            // Si ya existe pero el pass era init, intentamos login (por si se interrumpió la creación antes)
                            await authFirebase.signInWithEmailAndPassword(email, rawPass);
                        }
                        await db.collection('usuarios_auth').doc(email).update({ password_init: firebase.firestore.FieldValue.delete() });
                        localStorage.setItem('admin_session', JSON.stringify({
                            email: email, role: aData.role, nombre: aData.nombre || 'Administrador', cursos: aData.cursos || []
                        }));
                        window.location.href = 'admin.html';
                        return;
                    }
                }
            } catch (e) { }

            // CASO B: Es un Alumno nuevo
            let info_alumno = null;
            let currentCourses = ['habilidades', 'programacion'];
            try {
                const coursesSnap = await db.collection('cursos').get();
                currentCourses = coursesSnap.docs.map(d => d.id);
            } catch (e) { }

            for (let cid of currentCourses) {
                try {
                    const snapCheck = await db.collection(`alumnos_${cid}`).doc(cleanDni).get();
                    if (snapCheck.exists) { info_alumno = snapCheck.data(); break; }
                } catch (e) { }
            }

            if (info_alumno && info_alumno.email.toLowerCase() === email) {
                try {
                    await authFirebase.createUserWithEmailAndPassword(email, rawPass);
                } catch(ee) {
                    if (ee.code === 'auth/email-already-in-use') {
                        // Si llegamos acá es porque el signIn falló (paso 1) Y el usuario existe (email-already-in-use)
                        // Conclusión: La contraseña que ingresó es incorrectA.
                        throw new Error("🔑 Contraseña incorrecta. Ya tienes una cuenta activa en el sistema. Si no recuerdas tu clave, usa el botón '¿Olvidaste tu contraseña?' abajo.");
                    }
                    throw ee;
                }
            } else {
                throw new Error("❌ No se encontró registro con ese Email y DNI (" + cleanDni + "). Verifique sus datos.");
            }
        }

        // 4. PREPARAR SESIÓN DE ALUMNO 
        let cursos_inscrito = [];
        let info_final = null;
        let coursesDocs = [];
        try {
            const coursesList = await db.collection('cursos').get();
            coursesDocs = coursesList.docs.map(d => ({ id: d.id, nombre: d.data().nombre }));
        } catch (e) {
            coursesDocs = [ { id: 'habilidades', nombre: 'Habilidades Digitales' }, { id: 'programacion', nombre: 'Software & Videojuegos' } ];
        }

        for (let doc of coursesDocs) {
            try {
                const aluDoc = await db.collection(`alumnos_${doc.id}`).doc(cleanDni).get();
                if (aluDoc.exists && aluDoc.data().email.toLowerCase() === email) {
                    if (!info_final) info_final = aluDoc.data();
                    cursos_inscrito.push({ id: doc.id, nombre: doc.nombre });
                }
            } catch (e) { }
        }

        if (info_final) {
            localStorage.setItem('user_session', JSON.stringify({
                nombre: info_final.full_name,
                dni: info_final.dni,
                email: info_final.email,
                cursos: cursos_inscrito
            }));
            window.location.href = 'student.html';
        } else {
            throw new Error("Autenticado pero no encontrado en planillas. Contacte al docente.");
        }

    } catch (error) {
        let msg = error.message || 'Error al ingresar.';
        if (msg.includes('permission')) msg = "⚠️ ERROR: Se está actualizando el sistema o faltan permisos.";
        cfpAlert("ATENCIÓN", msg);
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

async function recuperarClave() {
    const email = document.getElementById('email').value.trim();
    if (!email) return cfpAlert("AVISO", "Escribe tu correo arriba para enviarte el enlace de recuperación.");
    try {
        await authFirebase.sendPasswordResetEmail(email);
        cfpAlert("ÉXITO", "📬 Enlace enviado a " + email + ". Revisa tu correo (y Spam).");
    } catch(e) {
        let msg = "No se pudo enviar.";
        if (e.code === 'auth/user-not-found') msg = "El correo no está registrado.";
        cfpAlert("ERROR", msg);
    }
}
