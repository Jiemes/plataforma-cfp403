// La configuración ahora está en firebase-config.js
// No necesitamos inicializar aquí de nuevo.

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    console.log('Intento de login con Firebase:', email);

    // Lógica temporal para demostración
    if (email === 'admin@cfp403.edu.ar' && password === 'admin123') {
        window.location.href = 'admin.html';
    } else {
        // En una versión real usaríamos:
        // authFirebase.signInWithEmailAndPassword(email, password)
        window.location.href = 'student.html';
    }
});
