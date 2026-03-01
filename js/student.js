// Mi Aula Virtual - Lógica del Alumno 5.0
const studentSession = JSON.parse(localStorage.getItem('userSession'));

if (!studentSession) {
    window.location.href = 'index.html';
}

document.getElementById('student-name').innerText = studentSession.nombre;
document.getElementById('course-title').innerText = studentSession.curso === 'habilidades' ?
    'Formación en Habilidades Digitales e IA' : 'Desarrollo de Software & Videojuegos';

// Cargar Clases y Actividades
async function loadContent() {
    try {
        const weeksContainer = document.getElementById('weeks-container');
        weeksContainer.innerHTML = '<p class="loader">Organizando tus clases...</p>';

        // 1. Obtener Materiales (Filtrado por curso y fecha de publicación)
        const now = new Date().toISOString().split('T')[0];
        const materialesSnap = await db.collection('clases')
            .where('curso', '==', studentSession.curso)
            .where('fecha_publicacion', '<=', now) // Solo los publicados hasta hoy
            .orderBy('fecha_publicacion', 'desc')
            .get();

        // 2. Obtener Entregas del Alumno
        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .get();
        const entregas = entregasSnap.docs.map(doc => doc.data());

        weeksContainer.innerHTML = '';

        if (materialesSnap.empty) {
            weeksContainer.innerHTML = '<p class="empty-msg">Próximamente aparecerán tus primeras clases aquí. ¡Prepárate!</p>';
            return;
        }

        materialesSnap.docs.forEach(doc => {
            const mat = doc.data();
            const entrega = entregas.find(e => e.semana === mat.semana);

            const card = document.createElement('div');
            card.className = 'card week-card';
            card.innerHTML = `
                <div class="week-header">
                    <h3>Semana ${mat.semana}</h3>
                    <span class="badge success">Material Disponible</span>
                </div>
                <div class="week-body">
                    <!-- Sección Teoría -->
                    <div class="content-item">
                        <span class="icon">📖</span>
                        <div class="item-info">
                            <strong>Material de Estudio (Teoría)</strong>
                            <p>${mat.teoría_nombre || 'No hay material de lectura esta semana'}</p>
                        </div>
                        ${mat.teoria_url ? `<button class="btn-view" onclick="window.open('${mat.teoria_url}', '_blank')">Abrir PDF</button>` : ''}
                    </div>

                    <!-- Sección Actividad -->
                    <div class="content-item tarefa-row" style="margin-top:20px; border-top: 1px solid #f1f5f9; padding-top:20px;">
                        <span class="icon">🛠️</span>
                        <div class="item-info">
                            <strong>Actividad Práctica</strong>
                            <p>${mat.actividad_nombre || 'Actividad subida'}</p>
                        </div>
                        ${mat.actividad_url ? `<button class="btn-view secondary" onclick="window.open('${mat.actividad_url}', '_blank')">Ver Consigna</button>` : ''}
                    </div>

                    <!-- Sección Entrega del Alumno -->
                    <div class="delivery-section" style="background:#f8fafc; padding:20px; border-radius:12px; margin-top:15px;">
                        ${!entrega ? `
                            <p style="font-size:0.9rem; margin-bottom:10px;"><strong>Tu Entrega:</strong> Aún no has subido tu trabajo.</p>
                            <input type="file" id="file-${mat.semana}" class="hidden-input" accept=".pdf" onchange="uploadHomework(${mat.semana})">
                            <button class="btn-upload" onclick="document.getElementById('file-${mat.semana}').click()">Subir mi Actividad (PDF)</button>
                        ` : `
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <p><strong>Estado:</strong> <span class="status-badge ${entrega.estado.toLowerCase()}">${entrega.estado}</span></p>
                                    ${entrega.nota ? `<p style="margin-top:10px;">Calificación: <strong style="color:var(--primary-color); font-size:1.2rem;">${entrega.nota}</strong></p>` : ''}
                                </div>
                                ${entrega.comentario ? `<div class="teacher-feedback"><em>"${entrega.comentario}"</em></div>` : ''}
                            </div>
                        `}
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        });

    } catch (error) {
        console.error("Error cargando aula virtual:", error);
    }
}

async function uploadHomework(semana) {
    const fileInput = document.getElementById(`file-${semana}`);
    const file = fileInput.files[0];
    if (!file) return;

    const btn = fileInput.nextElementSibling;
    try {
        btn.innerText = "⌛ Enviando trabajo...";
        btn.disabled = true;

        const path = `entregas/${studentSession.dni}/Semana_${semana}/${Date.now()}_${file.name}`;
        const ref = storage.ref().child(path);
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

        alert("¡Felicidades! Tu actividad ha sido entregada correctamente.");
        loadContent();
    } catch (error) {
        alert("Hubo un problema: " + error.message);
    } finally {
        btn.innerText = "Subir mi Actividad (PDF)";
        btn.disabled = false;
    }
}

loadContent();
