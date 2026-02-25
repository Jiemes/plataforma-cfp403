// Recuperar sesión del alumno
const userSession = JSON.parse(localStorage.getItem('user_session'));

if (!userSession) {
    window.location.href = 'index.html';
} else {
    document.getElementById('student-name').innerText = userSession.nombre;
    document.getElementById('course-title').innerText = userSession.curso;
}

// Lógica de subida de archivos a Firebase Storage
document.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', async function (e) {
        const file = e.target.files[0];
        const weekId = e.target.id.split('-')[1]; // Ejemplo: homework-1 -> 1

        if (file) {
            try {
                const fileInfo = document.getElementById('file-info-' + weekId);
                const fileNameSpan = fileInfo.querySelector('.file-name');
                const uploadBtn = e.target.parentElement.querySelector('.btn-upload');

                uploadBtn.innerText = 'Subiendo...';
                uploadBtn.disabled = true;

                // Crear ruta en Storage: /tareas/DNI/SemanaX/archivo.pdf
                const storageRef = storage.ref(`tareas/${userSession.dni}/Semana${weekId}/${file.name}`);

                await storageRef.put(file);
                const downloadURL = await storageRef.getDownloadURL();

                // Registrar entrega en Firestore
                await db.collection('entregas').add({
                    dni: userSession.dni,
                    nombre: userSession.nombre,
                    semana: weekId,
                    archivo: file.name,
                    url: downloadURL,
                    fecha: firebase.firestore.FieldValue.serverTimestamp(),
                    nota: 'Pendiente'
                });

                fileNameSpan.textContent = file.name;
                fileInfo.classList.remove('hidden');
                fileInfo.style.display = 'flex';
                uploadBtn.classList.add('hidden');
                uploadBtn.style.display = 'none';

                alert('¡Tarea entregada con éxito!');

            } catch (error) {
                console.error("Error al subir archivo:", error);
                alert('Error al subir el archivo. Intente de nuevo.');
                const uploadBtn = e.target.parentElement.querySelector('.btn-upload');
                uploadBtn.innerText = 'Subir Archivo';
                uploadBtn.disabled = false;
            }
        }
    });
});

function removeFile(id) {
    const fileInfo = document.getElementById('file-info-' + id);
    const uploadBtn = document.querySelector('#upload-zone-' + id + ' .btn-upload');
    const input = document.getElementById('homework-' + id);

    input.value = '';
    fileInfo.classList.add('hidden');
    fileInfo.style.display = 'none';
    uploadBtn.classList.remove('hidden');
    uploadBtn.style.display = 'block';
    uploadBtn.innerText = 'Subir Archivo';
    uploadBtn.disabled = false;
}

document.getElementById('btn-logout-student')?.addEventListener('click', () => {
    localStorage.removeItem('user_session');
    window.location.href = 'index.html';
});
