// Mi Aula Virtual - Lógica del Alumno 6.0 (Cronograma Automático)
const studentSession = JSON.parse(localStorage.getItem('userSession'));

if (!studentSession) {
    window.location.href = 'index.html';
}

document.getElementById('student-name').innerText = studentSession.nombre;
document.getElementById('course-title').innerText = studentSession.curso === 'habilidades' ?
    'Formación en Habilidades Digitales e IA' : 'Desarrollo de Software & Videojuegos';

// Cargar Clases y Actividades basándose en el Cronograma
async function loadContent() {
    try {
        const weeksContainer = document.getElementById('weeks-container');
        weeksContainer.innerHTML = '<p class="loader">Organizando tus clases...</p>';

        // 1. Obtener Configuración del Curso
        const configSnap = await db.collection('config_cursos').doc(studentSession.curso).get();
        if (!configSnap.exists) {
            weeksContainer.innerHTML = '<p class="empty-msg">El cronograma del curso aún no ha sido configurado por el administrador.</p>';
            return;
        }
        const config = configSnap.data();

        // 2. Obtener Entregas del Alumno para mostrar estados
        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .get();
        const entregas = entregasSnap.docs.map(doc => doc.data());

        weeksContainer.innerHTML = '';

        // 3. Calcular semanas liberadas
        const startDate = new Date(config.fecha_inicio + "T08:00:00-03:00");
        const hoy = new Date();

        let semanasLiberadas = 0;
        let diffMs = hoy - startDate;
        let diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDias >= 0) {
            semanasLiberadas = Math.floor(diffDias / config.frecuencia_dias) + 1;
        }

        if (semanasLiberadas <= 0) {
            weeksContainer.innerHTML = `<p class="empty-msg">Tu curso comienza el ${startDate.toLocaleDateString()}. ¡Falta muy poco!</p>`;
            return;
        }

        // 4. Mostrar de forma descendente (la última semana arriba)
        for (let i = semanasLiberadas; i >= 1; i--) {
            const entrega = entregas.find(e => e.semana === i);

            // Generar enlaces directos basados en el patrón de nombres del usuario
            // Nota: Para Google Drive, se asume que los archivos están en la carpeta pública.
            // El usuario provee el link de la carpeta, pero para visualización directa necesitamos links de archivos.
            // Para simplificar, pondremos un botón que explique que los archivos están en el Drive del curso.

            const card = document.createElement('div');
            card.className = 'card week-card animated-in';
            card.innerHTML = `
                <div class="week-header">
                    <h3>Semana ${i}</h3>
                    <span class="badge success">Contenido Disponible</span>
                </div>
                <div class="week-body">
                    <div class="content-item">
                        <span class="icon">📖</span>
                        <div class="item-info">
                            <strong>Material de Estudio (Teoría)</strong>
                            <p>clase ${i}.pdf</p>
                        </div>
                        <button class="btn-view" onclick="window.open('${config.drive_url}', '_blank')">Abrir Carpeta Drive</button>
                    </div>

                    <div class="content-item tarefa-row" style="margin-top:20px; border-top: 1px solid #f1f5f9; padding-top:20px;">
                        <span class="icon">🛠️</span>
                        <div class="item-info">
                            <strong>Actividad Práctica</strong>
                            <p>actividad ${i}.pdf</p>
                        </div>
                    </div>

                    <div class="delivery-section" style="background:#f8fafc; padding:20px; border-radius:12px; margin-top:15px;">
                        ${!entrega ? `
                            <p style="font-size:0.9rem; margin-bottom:10px;"><strong>Tu Entrega:</strong> Aún no has subido tu trabajo.</p>
                            <input type="file" id="file-${i}" class="hidden-input" accept=".pdf" onchange="uploadHomework(${i})">
                            <button class="btn-upload" onclick="document.getElementById('file-${i}').click()">Subir mi Actividad (PDF)</button>
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
        }

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
