// Configuración de Firebase para CFP 403
const firebaseConfig = {
    apiKey: "AIzaSyCf0uv7aAiPed1tvTQUIoiGihcf2r995JY",
    authDomain: "plataforma-cfp403.firebaseapp.com",
    projectId: "plataforma-cfp403",
    storageBucket: "plataforma-cfp403.firebasestorage.app",
    messagingSenderId: "928403211415",
    appId: "1:928403211415:web:a14d53b2d7cc034c0695d2",
    measurementId: "G-95YDH60VRE"
};

// Inicializar Firebase (Compatible con la versión compat/v9 que estamos usando en los scripts del HTML)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Exportar servicios para usar en toda la app
window.db = firebase.firestore();
window.authFirebase = firebase.auth();
window.storage = firebase.storage();
