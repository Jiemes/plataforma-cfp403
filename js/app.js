// Lógica de inicio de sesión con Firebase Auth v9.16.6 (Query & Clean Fix)
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const rawPass = document.getElementById('password').value.trim();
    // Limpiar DNI de puntos o guiones para la búsqueda
    const cleanDni = rawPass.replace(/\./g, '').replace(/-/g, '');

    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = 'Verificando...';
    btn.disabled = true;

    try {
        // 1. Caso especial: Administrador y Gestión de Roles (v9.18.0)
        let authResult;
        try {
            authResult = await authFirebase.signInWithEmailAndPassword(email, rawPass);
        } catch (err) {
            // Si el admin hardcodeado no existe en Auth (primera vez o recovery), lo creamos
            if (email === 'sanchezjuanmanuel@abc.gob.ar' && rawPass === 'Perroloco2026' &&
                (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-login-credentials')) {
                authResult = await authFirebase.createUserWithEmailAndPassword(email, rawPass);
            } else {
                // Fallback a lógica de alumnos si no es el admin maestro
                throw err;
            }
        }

        // Verificar si el usuario es administrativo (Admin o Profesor)
        const adminDoc = await db.collection('usuarios_auth').doc(email).get();
        if (adminDoc.exists) {
            const adminData = adminDoc.data();
            localStorage.setItem('admin_session', JSON.stringify({
                email: email,
                role: adminData.role, // 'super-admin' o 'profesor'
                nombre: adminData.nombre || 'Administrador',
                cursos: adminData.cursos || [] // Cursos permitidos para este profesor
            }));
            window.location.href = 'admin.html';
            return;
        }

        // Si era el mail del admin maestro pero no está en Firestore aún (Primer arranque v9.18)
        if (email === 'sanchezjuanmanuel@abc.gob.ar') {
            const mainAdmin = { role: 'super-admin', nombre: 'Admin Maestro', cursos: 'all' };
            await db.collection('usuarios_auth').doc(email).set(mainAdmin);
            localStorage.setItem('admin_session', JSON.stringify(mainAdmin));
            window.location.href = 'admin.html';
            return;
        }

        // 2. Intentar loguear con Firebase Auth (Alumnos)
        try {
            await authFirebase.signInWithEmailAndPassword(email, rawPass);
        } catch (authError) {
            const code = authError.code;
            // Si el usuario no existe en Auth pero sí es un alumno válido, lo creamos
            // Firebase tira 'invalid-login-credentials' por seguridad en lugar de 'user-not-found'
            if (code === 'auth/user-not-found' || code === 'auth/invalid-login-credentials' || code === 'permission-denied') {

                let info_alumno = null;
                try {
                    // Intentamos buscar por el DNI limpio
                    let habSnapshot = await db.collection('alumnos_habilidades').doc(cleanDni).get();
                    if (habSnapshot.exists) info_alumno = habSnapshot.data();
                    else {
                        // Fallback: por si quedó alguno con puntos en Firestore
                        habSnapshot = await db.collection('alumnos_habilidades').doc(rawPass).get();
                        if (habSnapshot.exists) info_alumno = habSnapshot.data();
                    }

                    if (!info_alumno) {
                        let progSnapshot = await db.collection('alumnos_programacion').doc(cleanDni).get();
                        if (progSnapshot.exists) info_alumno = progSnapshot.data();
                        else {
                            progSnapshot = await db.collection('alumnos_programacion').doc(rawPass).get();
                            if (progSnapshot.exists) info_alumno = progSnapshot.data();
                        }
                    }
                } catch (pErr) {
                    console.error("Fallo de permisos al buscar DNI:", pErr);
                    throw new Error("⚠️ ERROR DE SEGURIDAD: Falta permiso 'get'. Verifique las Reglas de Firebase.");
                }

                if (info_alumno && info_alumno.email.toLowerCase() === email) {
                    await authFirebase.createUserWithEmailAndPassword(email, rawPass);
                } else {
                    throw new Error("❌ No se encontró ningún alumno con ese Email y DNI (" + cleanDni + ").");
                }
            } else if (code === 'auth/wrong-password') {
                throw new Error("🔑 Contraseña incorrecta.");
            } else {
                throw authError;
            }
        }

        // 3. Obtener info del alumno para la sesión local
        // Buscamos en qué cursos está (el DNI es el password si no lo cambió, o lo buscamos por email)
        // Optimizamos: buscamos en ambas colecciones por el email autenticado
        let cursos_inscrito = [];
        let info_final = null;

        const habQuery = await db.collection('alumnos_habilidades').where('email', '==', email).get();
        if (!habQuery.empty) {
            info_final = habQuery.docs[0].data();
            cursos_inscrito.push({ id: 'habilidades', nombre: 'Formación en Habilidades Digitales e IA' });
        }

        const progQuery = await db.collection('alumnos_programacion').where('email', '==', email).get();
        if (!progQuery.empty) {
            if (!info_final) info_final = progQuery.docs[0].data();
            cursos_inscrito.push({ id: 'programacion', nombre: 'Desarrollo de Software y Videojuegos' });
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
            alert('Error: Alumno autenticado pero NO encontrado en las planillas del CFP. Consulte al docente.');
            btn.innerText = originalText;
            btn.disabled = false;
        }

    } catch (error) {
        console.error("Error en el login:", error);
        if (error.code === 'permission-denied' || error.message.includes('permission')) {
            alert("⚠️ ERROR DE SEGURIDAD: Falta permiso para leer tu DNI. \n\nDocente: Verifique que las 'Reglas de Seguridad' en Firebase permitan 'get' en las colecciones de alumnos.");
        } else {
            alert(error.message || 'Error al ingresar. Verifique sus datos.');
        }
        btn.innerText = originalText;
        btn.disabled = false;
    }
});
