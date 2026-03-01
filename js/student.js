// Mi Aula Virtual - Lógica del Alumno
const studentSession = JSON.parse(localStorage.getItem('userSession'));

if (!studentSession) {
    window.location.href = 'index.html';
}

document.getElementById('student-name').innerText = studentSession.nombre;
document.getElementById('course-title').innerText = studentSession.curso === 'habilidades' ?
    'Formación en Habilidades Digitales e IA' : 'Desarrollo de Software & Videojuegos';

// Cargar Clases y Entregas
async function loadContent() {
    try {
        const weeksContainer = document.getElementById('weeks-container');
        weeksContainer.innerHTML = '';

        // 1. Obtener Clases
        const clasesSnap = await db.collection('clases')
            .where('curso', '==', studentSession.curso)
            .where('visible', '==', true)
            .orderBy('semana', 'asc')
            .get();

        // 2. Obtener Entregas del Alumno
        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .get();
        const entregas = entregasSnap.docs.map(doc => doc.data());

        if (clasesSnap.empty) {
            weeksContainer.innerHTML = '<p class="empty-msg">Aún no hay clases publicadas.</p>';
            return;
        }

        clasesSnap.docs.forEach(doc => {
            const clase = doc.data();
            const entrega = entregas.find(e => e.semana === clase.semana);

            const card = document.createElement('div');
            card.className = 'card week-card';
            card.innerHTML = `
                <div class="week-header">
                    <h3>Semana ${clase.semana}: ${clase.nombre.replace('.pdf', '')}</h3>
                    <span class="badge success">Disponible</span>
                </div>
                <div class="week-body">
                    <div class="content-item">
                        <span class="icon">📄</span>
                        <div class="item-info">
                            <strong>Material de Estudio</strong>
                            <p>Teoría técnica de la semana.</p>
                        </div>
                        <button class="btn-view" onclick="openPDF('${clase.url}')">Ver PDF</button>
                    </div>
                    <div class="content-item tarea-section">
                        <span class="icon">✏️</span>
                        <div class="item-info">
                            <strong>Actividad de la Semana</strong>
                            <p>${entrega ? '✓ Archivo entregado' : 'Pendiente de entrega'}</p>
                        </div>
                        ${!entrega ? `
                            <div class="upload-zone">
                                <input type="file" id="file-${clase.semana}" class="hidden-input" accept=".pdf" onchange="uploadHomework(${clase.semana})">
                                <button class="btn-upload" onclick="document.getElementById('file-${clase.semana}').click()">Subir PDF</button>
                            </div>
                        ` : `
                            <div class="status-badge ${entrega.estado.toLowerCase()}">${entrega.estado}</div>
                        `}
                    </div>
                </div>
                ${entrega && entrega.nota ? `
                    <div class="week-footer">
                        <div class="grade-pill">
                            <span>Calificación: <strong>${entrega.nota}</strong></span>
                            ${entrega.comentario ? `<p class="comment">" ${entrega.comentario} "</p>` : ''}
                        </div>
                    </div>
                ` : ''}
            `;
            weeksContainer.appendChild(card);
        });

    } catch (error) {
        console.error("Error cargando contenido:", error);
    }
}

async function uploadHomework(semana) {
    const fileInput = document.getElementById(`file-${semana}`);
    const file = fileInput.files[0];
    if (!file) return;

    const btn = fileInput.nextElementSibling;
    const originalText = btn.innerText;

    try {
        btn.innerText = "⌛ Subiendo...";
        btn.disabled = true;

        const path = `entregas/${studentSession.dni}/Semana_${semana}/${Date.now()}_${file.name}`;
        const ref = storage.ref().child(path);

        console.log(`Subiendo entrega para DNI ${studentSession.dni}, semana ${semana}...`);
        await ref.put(file);
        const url = await ref.getDownloadURL();

        await db.collection('entregas').add({
            alumno_dni: studentSession.dni,
            alumno_nombre: studentSession.nombre,
            curso: studentSession.curso,
            semana: semana,
            archivo_url: url,
            archivo_nombre: file.name,
            fecha_entrega: new Date().toISOString(),
            estado: 'Pendiente',
            nota: '',
            comentario: ''
        });

        alert("¡Trabajo entregado con éxito!");
        loadContent();
    } catch (error) {
        console.error("Error en entrega:", error);
        alert("Error al subir el archivo: " + error.message);
    } finally {
        btn.innerText = "Subir PDF";
        btn.disabled = false;
    }
}

function openPDF(url) {
    window.open(url, '_blank');
}

document.getElementById('btn-logout-student').addEventListener('click', () => {
    localStorage.removeItem('userSession');
    window.location.href = 'index.html';
});

loadContent();
