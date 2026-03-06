// Lógica de inicio de sesión con Firebase Auth v9.16.5 (Clean & Resilient)
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
        // 1. Caso especial: Administrador
        if (email === 'sanchezjuanmanuel@abc.gob.ar' && rawPass === 'Perroloco2026') {
            try {
                await authFirebase.signInWithEmailAndPassword(email, rawPass);
            } catch (err) {
                // Si el admin no existe en Auth (primera vez), lo creamos
                if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-login-credentials') {
                    await authFirebase.createUserWithEmailAndPassword(email, rawPass);
                } else { throw err; }
            }
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
                    // Intentamos buscar por el DNI limpio (ID del documento)
                    const habSnapshot = await db.collection('alumnos_habilidades').doc(cleanDni).get();
                    if (habSnapshot.exists) info_alumno = habSnapshot.data();
                    else {
                        const progSnapshot = await db.collection('alumnos_programacion').doc(cleanDni).get();
                        if (progSnapshot.exists) info_alumno = progSnapshot.data();
                    }
                } catch (pErr) {
                    console.error("Fallo de permisos al buscar DNI:", pErr);
                    throw new Error("⚠️ ERROR DE SEGURIDAD: La plataforma no tiene permiso para verificar tu identidad. Por favor, avisar al docente que configure 'allow get: if true' en las Reglas de Firebase.");
                }

                if (info_alumno && info_alumno.email.toLowerCase() === email) {
                    // Si encontramos al alumno, le creamos la cuenta en Auth
                    await authFirebase.createUserWithEmailAndPassword(email, rawPass);
                } else {
                    throw new Error("❌ No se encontró ningún alumno con ese Email y DNI (" + cleanDni + "). Verifique con el docente si está correctamente inscripto.");
                }
            } else if (code === 'auth/wrong-password') {
                throw new Error("🔑 Contraseña incorrecta. Si es tu primer ingreso, recordá que tu contraseña es tu DNI sin puntos.");
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
