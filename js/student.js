// Mi Aula Virtual - Lógica del Alumno 6.5.2 (Soporte Multi-Curso)
let studentSession = JSON.parse(localStorage.getItem('user_session'));
let currentCourseId = '';

if (!studentSession) {
    window.location.href = 'index.html';
}

// Inicialización
function initStudentDashboard() {
    document.getElementById('student-name').innerText = studentSession.nombre;

    // Configurar Selector de Cursos (Tabs)
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

    // UI Update
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const cursoInfo = studentSession.cursos.find(c => c.id === courseId);
    document.getElementById('course-title').innerText = cursoInfo.nombre;

    loadContent();
}

async function loadContent() {
    try {
        const weeksContainer = document.getElementById('weeks-container');
        weeksContainer.innerHTML = '<p class="loader" style="color:white; text-align:center;">Organizando tus clases...</p>';

        // 1. Obtener Configuración del Curso
        const configSnap = await db.collection('config_cursos').doc(currentCourseId).get();
        if (!configSnap.exists) {
            weeksContainer.innerHTML = '<p class="empty-msg" style="color:white; background:rgba(0,0,0,0.3); padding:20px; border-radius:15px;">El cronograma de este curso aún no ha sido configurado.</p>';
            return;
        }
        const config = configSnap.data();

        // 2. Obtener Entregas
        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .get();
        const entregas = entregasSnap.docs.map(doc => doc.data());

        weeksContainer.innerHTML = '';

        // 3. Lógica de liberación
        const startDate = new Date(config.fecha_inicio + "T08:00:00-03:00");
        const hoy = new Date();
        let semanasLiberadas = 0;
        let diffMs = hoy - startDate;
        let diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDias >= 0) {
            semanasLiberadas = Math.floor(diffDias / config.frecuencia_dias) + 1;
        }

        if (semanasLiberadas <= 0) {
            weeksContainer.innerHTML = `<p class="empty-msg" style="color:white; background:rgba(0,0,0,0.3); padding:20px; border-radius:15px;">Este curso comienza el ${startDate.toLocaleDateString()}.</p>`;
            return;
        }

        for (let i = semanasLiberadas; i >= 1; i--) {
            const entrega = entregas.find(e => e.semana === i);
            const card = document.createElement('div');
            card.className = 'card week-card animated-in';
            card.style.animationDelay = `${(semanasLiberadas - i) * 0.1}s`;

            card.innerHTML = `
                <div class="week-header">
                    <h3>Semana ${i}</h3>
                    <span class="badge success">Disponible</span>
                </div>
                <div class="week-body">
                    <div class="content-item">
                        <span class="icon">📖</span>
                        <div class="item-info">
                            <strong>Clase ${i} (Teoría)</strong>
                            <p>clase ${i}.pdf</p>
                        </div>
                        <button class="btn-view" onclick="window.open('${config.drive_url}', '_blank')">Abrir Drive</button>
                    </div>
                    <div class="content-item">
                        <span class="icon">🛠️</span>
                        <div class="item-info">
                            <strong>Actividad ${i}</strong>
                            <p>actividad ${i}.pdf</p>
                        </div>
                    </div>
                    <div class="delivery-section" style="background:#f8fafc; padding:20px; border-radius:12px; margin-top:15px;">
                        ${!entrega ? `
                            <p style="font-size:0.9rem; margin-bottom:10px;"><strong>Tu Entrega:</strong> Pendiente</p>
                            <input type="file" id="file-${i}" class="hidden-input" style="display:none" accept=".pdf" onchange="uploadHomework(${i})">
                            <button class="btn-upload" onclick="document.getElementById('file-${i}').click()">Subir PDF</button>
                        ` : `
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <p><strong>Estado:</strong> <span class="status-badge ${entrega.estado.toLowerCase()}">${entrega.estado}</span></p>
                                    ${entrega.nota ? `<p style="margin-top:10px;">Nota: <strong style="color:var(--primary-color); font-size:1.2rem;">${entrega.nota}</strong></p>` : ''}
                                </div>
                                ${entrega.comentario ? `<div class="comment"><em>"${entrega.comentario}"</em></div>` : ''}
                            </div>
                        `}
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        }
    } catch (e) { console.error(e); }
}

async function uploadHomework(semana) {
    const fileInput = document.getElementById(`file-${semana}`);
    const file = fileInput.files[0];
    if (!file) return;
    const btn = fileInput.nextElementSibling;
    try {
        btn.innerText = "⌛ Enviando...";
        btn.disabled = true;
        const path = `entregas/${studentSession.dni}/${currentCourseId}/Semana_${semana}/${Date.now()}_${file.name}`;
        const ref = storage.ref().child(path);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        await db.collection('entregas').add({
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
        });
        alert("¡Actividad entregada!");
        loadContent();
    } catch (e) { alert("Error: " + e.message); }
    finally {
        btn.innerText = "Subir PDF";
        btn.disabled = false;
    }
}

document.getElementById('btn-logout-student')?.addEventListener('click', () => {
    localStorage.removeItem('user_session');
    window.location.href = 'index.html';
});

initStudentDashboard();
