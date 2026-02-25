document.getElementById('homework-1')?.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const fileInfo = document.getElementById('file-info-1');
        const fileName = fileInfo.querySelector('.file-name');
        const uploadBtn = document.querySelector('#upload-zone-1 .btn-upload');

        fileName.textContent = file.name;
        fileInfo.classList.remove('hidden');
        uploadBtn.classList.add('hidden');

        console.log('Archivo seleccionado para subir:', file.name);
        alert('Se ha seleccionado el archivo: ' + file.name + '. En una versión real, esto se subiría a Supabase.');
    }
});

function removeFile(id) {
    const fileInfo = document.getElementById('file-info-' + id);
    const uploadBtn = document.querySelector('#upload-zone-' + id + ' .btn-upload');
    const input = document.getElementById('homework-' + id);

    input.value = '';
    fileInfo.classList.add('hidden');
    uploadBtn.classList.remove('hidden');
}

document.getElementById('btn-logout-student')?.addEventListener('click', () => {
    window.location.href = 'index.html';
});
