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
    const rawEmailTyped = document.getElementById('email').value.trim();
    const email = rawEmailTyped.toLowerCase();
    const rawPass = document.getElementById('password').value.trim();
    // Limpiamos DNI de forma agresiva: solo números y letras (elimina espacios, puntos, guiones)
    const cleanDni = rawPass.replace(/[^a-zA-Z0-9]/g, '');

    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = 'Verificando...';
    btn.disabled = true;

    try {
        // 0. ADMIN MAESTRO
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

        // 1. LOGIN DIRECTO
        let isLoggedIn = false;
        try {
            await authFirebase.signInWithEmailAndPassword(email, rawPass);
            isLoggedIn = true;
        } catch(err) {
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
                const userRole = adminData.ui_role || (adminData.role === 'super-admin' && adminData.cursos === 'all' ? 'super-admin' : 'profesor');
                localStorage.setItem('admin_session', JSON.stringify({
                    email: email, role: userRole, nombre: adminData.nombre || 'Administrador', cursos: adminData.cursos || []
                }));
                window.location.href = 'admin.html';
                return;
            }
        }

        // 3. SI NO LOGUEÓ: PROCESAR REGISTRO INICIAL (DNI COMO CLAVE)
        if (!isLoggedIn) {
            // CASO A: Admin/Docente nuevo
            try {
                const adminCheck = await db.collection('usuarios_auth').doc(email).get();
                if (adminCheck.exists) {
                    const aData = adminCheck.data();
                    if (aData.password_init && (aData.password_init === cleanDni || aData.password_init === rawPass)) {
                        try {
                            await authFirebase.createUserWithEmailAndPassword(email, rawPass);
                        } catch(ee) {
                            if (ee.code !== 'auth/email-already-in-use') throw ee;
                            await authFirebase.signInWithEmailAndPassword(email, rawPass);
                        }
                        await db.collection('usuarios_auth').doc(email).update({ password_init: firebase.firestore.FieldValue.delete() });
                        const aDataCurrent = await db.collection('usuarios_auth').doc(email).get();
                        const finalAData = aDataCurrent.exists ? aDataCurrent.data() : aData;
                        
                        const userRole = finalAData.ui_role || (finalAData.role === 'super-admin' && finalAData.cursos === 'all' ? 'super-admin' : 'profesor');
                        localStorage.setItem('admin_session', JSON.stringify({
                            email: email, role: userRole, nombre: finalAData.nombre || 'Administrador', cursos: finalAData.cursos || []
                        }));
                        window.location.href = 'admin.html';
                        return;
                    }
                }
            } catch (e) { }

            // CASO B: Alumno nuevo
            let info_alumno = null;
            let currentCourses = ['habilidades', 'programacion'];
            try {
                const coursesSnap = await db.collection('cursos').get();
                if (!coursesSnap.empty) currentCourses = coursesSnap.docs.map(d => d.id);
            } catch (e) { }

            for (let cid of currentCourses) {
                try {
                    const snapCheck = await db.collection(`alumnos_${cid}`).doc(cleanDni).get();
                    if (snapCheck.exists) { 
                        const dataRead = snapCheck.data();
                        // Comparamos mail permitiendo variaciones de mayúsculas en DB
                        if (String(dataRead.email || "").toLowerCase() === email) {
                             info_alumno = dataRead; break; 
                        }
                    }
                } catch (e) { }
            }

            if (info_alumno) {
                try {
                    await authFirebase.createUserWithEmailAndPassword(email, rawPass);
                } catch(ee) {
                    if (ee.code === 'auth/email-already-in-use') {
                        throw new Error("🔑 Contraseña incorrecta o cuenta activa. Si no la recuerdas, usa el botón '¿Olvidaste tu contraseña?' abajo.");
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
                // Probamos variaciones de casing en el email para mayor robustez
                const qSnapLower = await db.collection(`alumnos_${doc.id}`).where('email', '==', email).get();
                const qSnapRaw = qSnapLower.empty ? await db.collection(`alumnos_${doc.id}`).where('email', '==', rawEmailTyped).get() : qSnapLower;
                
                if (!qSnapRaw.empty) {
                    const aluData = qSnapRaw.docs[0].data();
                    if (!info_final) info_final = aluData;
                    cursos_inscrito.push({ id: doc.id, nombre: doc.nombre });
                } else if (cleanDni.length >= 7 && cleanDni.length <= 11) {
                    // Fallback por DNI si la clave parece un documento
                    const aluDoc = await db.collection(`alumnos_${doc.id}`).doc(cleanDni).get();
                    if (aluDoc.exists && String(aluDoc.data().email || "").toLowerCase() === email) {
                        if (!info_final) info_final = aluDoc.data();
                        cursos_inscrito.push({ id: doc.id, nombre: doc.nombre });
                    }
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
            throw new Error("⚠️ Autenticado pero no encontrado en las planillas. Verifique su correo: " + email);
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
