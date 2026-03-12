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
        if (email === 'sanchezjuanmanuel@abc.gob.ar' && rawPass === 'Perroloco2026') {
            try { await authFirebase.signInWithEmailAndPassword(email, rawPass); }
            catch(err) { 
                if(err.code === 'auth/user-not-found' || err.code === 'auth/invalid-login-credentials') await authFirebase.createUserWithEmailAndPassword(email, rawPass); 
                else throw err; 
            }
            const mainAdmin = { role: 'super-admin', nombre: 'Admin Maestro', cursos: 'all' };
            await db.collection('usuarios_auth').doc(email).set(mainAdmin);
            localStorage.setItem('admin_session', JSON.stringify(mainAdmin));
            window.location.href = 'admin.html';
            return;
        }

        let isLoggedIn = false;
        try {
            await authFirebase.signInWithEmailAndPassword(email, rawPass);
            isLoggedIn = true;
        } catch(err) {
            if (err.code === 'auth/wrong-password') throw new Error("🔑 Contraseña incorrecta.");
            if (err.code !== 'auth/user-not-found' && err.code !== 'auth/invalid-login-credentials' && err.code !== 'permission-denied') throw err;
        }

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

        if (!isLoggedIn) {
            let info_alumno = null;
            let currentCourses = ['habilidades', 'programacion'];

            try {
                const coursesSnap = await db.collection('cursos').get();
                currentCourses = coursesSnap.docs.map(d => d.id);
            } catch (e) {
                console.warn("Aviso: Reglas bloquean lectura de cursos no autenticada.");
            }

            for (let cid of currentCourses) {
                try {
                    const snapCheck = await db.collection(`alumnos_${cid}`).doc(cleanDni).get();
                    if (snapCheck.exists) { info_alumno = snapCheck.data(); break; }
                } catch (e) { }
            }

            if (info_alumno && info_alumno.email.toLowerCase() === email) {
                await authFirebase.createUserWithEmailAndPassword(email, rawPass);
            } else {
                throw new Error("❌ No se encontró ningún alumno con ese Email y DNI (" + cleanDni + "). Por favor verifique sus datos.");
            }
        }

        let cursos_inscrito = [];
        let info_final = null;
        let coursesDocs = [];

        try {
            const coursesList = await db.collection('cursos').get();
            coursesList.docs.forEach(doc => coursesDocs.push({ id: doc.id, nombre: doc.data().nombre }));
        } catch (e) {
            coursesDocs = [ { id: 'habilidades', nombre: 'Habilidades Digitales e IA' }, { id: 'programacion', nombre: 'Software y Videojuegos' } ];
        }

        for (let doc of coursesDocs) {
            const cid = doc.id;
            const cName = doc.nombre;
            try {
                const snap = await db.collection(`alumnos_${cid}`).doc(cleanDni).get();
                if (snap.exists) {
                    const data = snap.data();
                    if (data.email.toLowerCase() === email) {
                        if (!info_final) info_final = data;
                        cursos_inscrito.push({ id: cid, nombre: cName });
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
            throw new Error("Alumno autenticado pero NO encontrado en ninguna de las planillas.");
        }

    } catch (error) {
        let msg = error.message || 'Error al ingresar. Verifique sus datos.';
        if (msg.includes('permission')) msg = "⚠️ ERROR DE ACCESO: Se está realizando una actualización o faltan permisos.";
        cfpAlert("ATENCIÓN", msg);
        btn.innerText = originalText;
        btn.disabled = false;
    }
});
