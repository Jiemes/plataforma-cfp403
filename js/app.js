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

        let alumno = null;
        let curso = '';

        const habSnapshot = await db.collection('alumnos_habilidades').doc(dni).get();
        if (habSnapshot.exists) {
            alumno = habSnapshot.data();
            curso = 'Habilidades Digitales e IA';
        } else {
            const progSnapshot = await db.collection('alumnos_programacion').doc(dni).get();
            if (progSnapshot.exists) {
                alumno = progSnapshot.data();
                curso = 'Desarrollo de Software y Videojuegos';
            }
        }

        if (alumno && alumno.email.toLowerCase() === email.toLowerCase()) {
            // Guardar sesión local simple (Para producción usar Firebase Auth)
            localStorage.setItem('user_session', JSON.stringify({
                nombre: alumno.full_name,
                dni: alumno.dni,
                curso: curso
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
