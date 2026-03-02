// Lógica de inicio de sesión con Firebase
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const dni = document.getElementById('password').value.trim();

    // Mostrar estado de carga si fuera necesario
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = 'Ingresando...';
    btn.disabled = true;

    try {
        // 1. Caso especial: Administrador
        if (email === 'sanchezjuanmanuel@abc.gob.ar' && dni === 'Perroloco2026') {
            window.location.href = 'admin.html';
            return;
        }

        // 2. Buscar al alumno en ambas colecciones de Firestore por DNI
        // Nota: En una plataforma real, primero crearíamos usuarios en Firebase Auth.
        // Aquí, como los importamos masivamente, verificaremos su existencia en Firestore.

        let cursos_inscrito = [];
        let info_alumno = null;

        const habSnapshot = await db.collection('alumnos_habilidades').doc(dni).get();
        if (habSnapshot.exists) {
            info_alumno = habSnapshot.data();
            cursos_inscrito.push({ id: 'habilidades', nombre: 'Formación en Habilidades Digitales e IA' });
        }

        const progSnapshot = await db.collection('alumnos_programacion').doc(dni).get();
        if (progSnapshot.exists) {
            if (!info_alumno) info_alumno = progSnapshot.data();
            cursos_inscrito.push({ id: 'programacion', nombre: 'Desarrollo de Software y Videojuegos' });
        }

        if (info_alumno && info_alumno.email.toLowerCase() === email.toLowerCase()) {
            localStorage.setItem('user_session', JSON.stringify({
                nombre: info_alumno.full_name,
                dni: info_alumno.dni,
                email: info_alumno.email,
                cursos: cursos_inscrito
            }));

            window.location.href = 'student.html';
        } else {
            alert('Credenciales incorrectas. Verifique su Usuario (Email) y Contraseña (DNI).');
            btn.innerText = originalText;
            btn.disabled = false;
        }

    } catch (error) {
        console.error("Error en el login:", error);
        alert('Hubo un error al intentar ingresar. Por favor, intente más tarde.');
        btn.innerText = originalText;
        btn.disabled = false;
    }
});
