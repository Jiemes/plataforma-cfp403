// Lógica de inicio de sesión con Firebase Auth v9.16.2
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim(); // DNI por defecto o pass nueva

    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = 'Verificando...';
    btn.disabled = true;

    try {
        // 1. Caso especial: Administrador
        if (email === 'sanchezjuanmanuel@abc.gob.ar' && password === 'Perroloco2026') {
            try {
                await authFirebase.signInWithEmailAndPassword(email, password);
            } catch (err) {
                // Si el admin no existe en Auth (primera vez), lo creamos
                if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-login-credentials') {
                    await authFirebase.createUserWithEmailAndPassword(email, password);
                } else {
                    throw err;
                }
            }
            window.location.href = 'admin.html';
            return;
        }

        // 2. Intentar loguear con Firebase Auth (Alumnos)
        try {
            await authFirebase.signInWithEmailAndPassword(email, password);
        } catch (authError) {
            // Si el usuario no existe en Auth pero sí es un alumno válido, lo creamos
            // Firebase tira 'invalid-login-credentials' por seguridad en lugar de 'user-not-found'
            if (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-login-credentials') {
                // Verificar si existe como alumno en Firestore
                let info_alumno = null;
                const habSnapshot = await db.collection('alumnos_habilidades').doc(password).get();
                if (habSnapshot.exists) info_alumno = habSnapshot.data();
                else {
                    const progSnapshot = await db.collection('alumnos_programacion').doc(password).get();
                    if (progSnapshot.exists) info_alumno = progSnapshot.data();
                }

                if (info_alumno && info_alumno.email.toLowerCase() === email.toLowerCase()) {
                    await authFirebase.createUserWithEmailAndPassword(email, password);
                } else {
                    throw new Error("Credenciales no encontradas o incorrectas.");
                }
            } else if (authError.code === 'auth/wrong-password') {
                throw new Error("Contraseña incorrecta. Si es tu primer ingreso, usa tu DNI.");
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
            alert('Error: Usuario autenticado pero no encontrado en los listados de cursos.');
            btn.innerText = originalText;
            btn.disabled = false;
        }

    } catch (error) {
        console.error("Error en el login:", error);
        alert(error.message || 'Error al ingresar. Verifique sus datos.');
        btn.innerText = originalText;
        btn.disabled = false;
    }
});
