// Mi Aula Virtual - Lógica del Alumno 6.6.4 (Links Directos y Estabilidad)
let studentSession = JSON.parse(localStorage.getItem('user_session'));
let currentCourseId = '';

if (!studentSession) {
    window.location.href = 'index.html';
}

function initStudentDashboard() {
    document.getElementById('student-name').innerText = studentSession.nombre;
    const tabsContainer = document.getElementById('course-tabs');

    if (studentSession.cursos.length > 1) {
        tabsContainer.classList.remove('hidden');
        tabsContainer.innerHTML = '';
        studentSession.cursos.forEach((c, idx) => {
            const btn = document.createElement('button');
            btn.className = `tab-btn ${idx === 0 ? 'active' : ''}`;
            btn.innerText = c.id === 'habilidades' ? 'Habilidades Digitales' : 'Programación';
            btn.onclick = () => switchCourse(c.id, btn);
            tabsContainer.appendChild(btn);
        });
        currentCourseId = studentSession.cursos[0].id;
    } else {
        currentCourseId = studentSession.cursos[0].id;
        document.getElementById('course-title').innerText = studentSession.cursos[0].nombre;
    }
    loadContent();
}

function switchCourse(courseId, btn) {
    if (currentCourseId === courseId) return;
    currentCourseId = courseId;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cursoInfo = studentSession.cursos.find(c => c.id === courseId);
    document.getElementById('course-title').innerText = cursoInfo.nombre;
    loadContent();
}

async function loadContent() {
    try {
        const weeksContainer = document.getElementById('weeks-container');
        weeksContainer.innerHTML = '<p class="loader" style="text-align:center;">Organizando tu material de estudio...</p>';

        const configSnap = await db.collection('config_cursos').doc(currentCourseId).get();
        if (!configSnap.exists) {
            weeksContainer.innerHTML = '<p class="empty-msg">El curso aún no ha sido configurado.</p>';
            return;
        }
        const config = configSnap.data();
        const materiales = config.materiales || {};

        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .get();
        const entregas = entregasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        weeksContainer.innerHTML = '';

        const startDate = config.fecha_inicio ? new Date(config.fecha_inicio + "T08:00:00-03:00") : null;
        if (!startDate) {
            weeksContainer.innerHTML = '<p class="empty-msg">Esperando fecha de inicio confirmada.</p>';
            return;
        }

        const hoy = new Date();
        let semanasLiberadas = 0;
        let diffMs = hoy - startDate;
        let diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDias >= 0) {
            semanasLiberadas = Math.floor(diffDias / config.frecuencia_dias) + 1;
        }

        if (semanasLiberadas <= 0) {
            weeksContainer.innerHTML = `<p class="empty-msg">Tu curso comienza el ${startDate.toLocaleDateString()}.</p>`;
            return;
        }

        // --- SECCIÓN: INICIO Y BIENVENIDA (Día 1) ---
        if (config.syllabus_url || config.welcome_url) {
            const introCard = document.createElement('div');
            introCard.className = 'card week-card active animated-in';
            introCard.style.borderLeftColor = '#10b981';
            introCard.innerHTML = `
                <div class="week-header">
                    <h3>📚 Bienvenida y Programa</h3>
                </div>
                <div class="week-body" style="max-height:1000px; opacity:1; pointer-events:auto; padding:20px;">
                    ${config.welcome_url ? `
                        <div class="content-item clickable" onclick="visualizePdf('${config.welcome_url}', 'Bienvenida')">
                            <span class="icon">👋</span>
                            <div class="item-info">
                                <strong>Mensaje de Bienvenida</strong>
                                <p>Haz clic para leer el inicio del curso</p>
                            </div>
                        </div>
                    ` : ''}
                    ${config.syllabus_url ? `
                        <div class="content-item clickable" onclick="visualizePdf('${config.syllabus_url}', 'Programa')">
                            <span class="icon">📋</span>
                            <div class="item-info">
                                <strong>Programa del Curso</strong>
                                <p>Haz clic para ver los contenidos</p>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
            weeksContainer.appendChild(introCard);
        }

        const exceptions = config.excepciones || [];

        // Semanas (Orden descendente)
        for (let i = semanasLiberadas; i >= 1; i--) {
            if (exceptions.includes(i)) continue;

            const entrega = entregas.find(e => e.semana === i);
            const matSemana = materiales[`sem_${i}`] || {};
            const card = document.createElement('div');
            card.className = `card week-card animated-in ${i === semanasLiberadas ? 'active' : ''}`;

            card.innerHTML = `
                <div class="week-header" onclick="this.parentElement.classList.toggle('active')">
                    <h3>Semana ${i}</h3>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <span class="badge success">Disponible</span>
                        <span class="toggle-icon">▼</span>
                    </div>
                </div>
                <div class="week-body">
                    <div class="content-item clickable" onclick="visualizePdf('${matSemana.clase || ''}', 'Clase ${i}')">
                        <span class="icon">📖</span>
                        <div class="item-info">
                            <strong>Clase ${i}</strong>
                            <p>${matSemana.clase ? 'Haz clic para ver la teoría' : '⌛ Pendiente de carga'}</p>
                        </div>
                    </div>
                    <div class="content-item clickable" onclick="visualizePdf('${matSemana.actividad || ''}', 'Actividad ${i}')">
                        <span class="icon">🛠️</span>
                        <div class="item-info">
                            <strong>Actividad ${i}</strong>
                            <p>${matSemana.actividad ? 'Haz clic para ver la consigna' : '⌛ Pendiente de carga'}</p>
                        </div>
                    </div>
                    <div class="delivery-section" style="background:#f8fafc; padding:20px; border-radius:12px; margin-top:15px;">
                        <div style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                            <p style="font-size:0.9rem;">
                                <strong>Estado Entrega:</strong> 
                                <span class="status-badge ${entrega ? 'calificado' : 'pendiente'}">
                                    ${entrega ? 'Entregado' : 'Pendiente'}
                                </span>
                            </p>
                        </div>
                        
                        <input type="file" id="file-${i}" class="hidden-input" style="display:none" accept=".pdf" onchange="uploadHomework(${i})">
                        <button class="btn-upload" onclick="document.getElementById('file-${i}').click()">
                            ${entrega ? '📤 Corregir/Re-subir PDF' : 'Subir mi Actividad (PDF)'}
                        </button>
                        
                        ${entrega && entrega.nota ? `
                            <div class="grade-pill" style="margin-top:20px; border-top: 1px dashed #cbd5e1; padding-top:15px;">
                                <p>Nota: <strong style="color:var(--primary-color); font-size:1.3rem;">${entrega.nota}</strong></p>
                                ${entrega.comentario ? `<p class="comment" style="font-style:italic; margin-top:5px; color:#475569;">"${entrega.comentario}"</p>` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        }
    } catch (e) {
        console.error("Error cargando aula:", e);
    }
}

function visualizePdf(url, title) {
    if (!url) return alert("El material para esta sección aún no está disponible.");

    const modal = document.getElementById('pdf-modal');
    const viewer = document.getElementById('pdf-viewer');

    // Función para convertir link de Drive en link de previsualización directo
    let embedUrl = url;
    if (url.includes('drive.google.com')) {
        const fileIdMatch = url.match(/\/d\/(.+?)\//);
        if (fileIdMatch) {
            embedUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
        }
    } else {
        // Para otros links, intentar usar Google Viewer
        embedUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    }

    viewer.src = embedUrl;
    modal.classList.remove('hidden');
}

document.getElementById('close-pdf')?.addEventListener('click', () => {
    document.getElementById('pdf-modal').classList.add('hidden');
    document.getElementById('pdf-viewer').src = "";
});

async function uploadHomework(semana) {
    const fileInput = document.getElementById(`file-${semana}`);
    const file = fileInput.files[0];
    if (!file) return;
    const btn = fileInput.nextElementSibling;
    try {
        btn.innerText = "⌛ Enviando...";
        btn.disabled = true;
        const snap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .where('semana', '==', semana)
            .limit(1).get();
        const path = `entregas/${studentSession.dni}/${currentCourseId}/Semana_${semana}/${Date.now()}_${file.name}`;
        const ref = storage.ref().child(path);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        const data = {
            alumno_dni: studentSession.dni,
            alumno_nombre: studentSession.nombre,
            curso: currentCourseId,
            semana: semana,
            archivo_url: url,
            archivo_nombre: file.name,
            fecha_entrega: new Date().toISOString(),
            estado: 'Pendiente',
            nota: '',
            comentario: ''
        };
        if (!snap.empty) await db.collection('entregas').doc(snap.docs[0].id).update(data);
        else await db.collection('entregas').add(data);
        alert("¡Actividad enviada!");
        loadContent();
    } catch (error) { alert("Error: " + error.message); }
    finally { btn.innerText = "Subir Trabajo"; btn.disabled = false; }
}

document.getElementById('btn-logout-student')?.addEventListener('click', () => {
    localStorage.removeItem('user_session');
    window.location.href = 'index.html';
});

initStudentDashboard();
