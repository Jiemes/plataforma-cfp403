// Mi Aula Virtual - Lógica del Alumno v7.3.0 (Visor Integrado + Split View)
let studentSession = JSON.parse(localStorage.getItem('user_session'));
let currentCourseId = '';

if (!studentSession) { window.location.href = 'index.html'; }

function initStudentDashboard() {
    const homeName = document.getElementById('home-student-name');
    if (homeName) {
        const nombre = studentSession.nombre.split(',')[1] || studentSession.nombre.split(' ')[0];
        homeName.innerText = `¡Hola, ${nombre.trim()}!`;
    }

    const grid = document.getElementById('home-course-grid');
    if (!grid) return;

    grid.innerHTML = '';
    studentSession.cursos.forEach(curso => {
        const card = document.createElement('div');
        card.className = 'course-card animated-in';
        card.innerHTML = `
            <div class="course-icon">${curso.id === 'habilidades' ? '💻' : '🚀'}</div>
            <h3>${curso.nombre}</h3>
            <p style="font-size:0.9rem; color:#64748b; margin-bottom:25px;">Accede a tus materiales y realiza tus entregas.</p>
            <button class="btn-enter-course">INGRESAR AL CURSO</button>
        `;
        card.onclick = () => selectCourse(curso.id, curso.nombre);
        grid.appendChild(card);
    });
}

function selectCourse(courseId, courseName) {
    currentCourseId = courseId;
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('course-view').classList.remove('hidden');
    document.getElementById('course-title').innerText = courseName;
    document.getElementById('nav-course-name').innerText = courseName;

    // Reset visor
    closeViewer();
    loadContent();
}

function backToHome() {
    document.getElementById('course-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    currentCourseId = '';
}

async function loadContent() {
    try {
        const weeksContainer = document.getElementById('weeks-container');
        weeksContainer.innerHTML = '<div style="text-align:center; padding:30px;"><p style="font-size:0.9rem; color:#64748b;">⌛ Sincronizando contenidos...</p></div>';

        const configSnap = await db.collection('config_cursos').doc(currentCourseId).get();
        if (!configSnap.exists) return;

        const config = configSnap.data();
        let materiales = config.materiales || config.materials || {};

        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .get();
        const entregas = entregasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        weeksContainer.innerHTML = '';
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // 1. BIENVENIDA Y PROGRAMA
        const matInicio = materiales['inicio'] || {};
        const welcomeUrl = matInicio.welcome || config.welcome_url;
        const syllabusUrl = matInicio.syllabus || config.syllabus_url;
        const fInicioStr = matInicio.fecha || config.fecha_inicio;

        if (welcomeUrl || syllabusUrl) {
            const introCard = document.createElement('div');
            introCard.className = 'week-card opened';
            introCard.innerHTML = `
                <div class="week-header" onclick="this.parentElement.classList.toggle('opened')">
                    <h3>📚 Bienvenida y Programa</h3>
                </div>
                <div class="week-body">
                    ${welcomeUrl ? `
                        <div class="content-item" onclick="visualizePdf('${welcomeUrl}', 'Bienvenida', this)">
                            <span class="icon">👋</span>
                            <div class="item-info"><strong>Mensaje Inicial</strong><p>Lectura de bienvenida</p></div>
                        </div>
                    ` : ''}
                    ${syllabusUrl ? `
                        <div class="content-item" onclick="visualizePdf('${syllabusUrl}', 'Programa Académico', this)">
                            <span class="icon">📋</span>
                            <div class="item-info"><strong>Programa</strong><p>Contenidos del curso</p></div>
                        </div>
                    ` : ''}
                </div>
            `;
            weeksContainer.appendChild(introCard);
        }

        // 2. SEMANAS (Orden Inverso - Sin badge "Liberado")
        let weeksKeys = Object.keys(materiales)
            .filter(k => k.startsWith('sem_'))
            .map(k => parseInt(k.replace('sem_', '')))
            .sort((a, b) => b - a);

        weeksKeys.forEach(i => {
            const mat = materiales[`sem_${i}`] || {};
            const fechaLibStr = mat.fecha;
            if (!fechaLibStr) return;
            const fechaLib = new Date(fechaLibStr + "T00:00:00");
            if (hoy < fechaLib) return;

            const entrega = entregas.find(e => e.semana === i);
            const card = document.createElement('div');
            card.className = `week-card ${i === weeksKeys[0] ? 'opened' : ''}`;
            card.innerHTML = `
                <div class="week-header" onclick="this.parentElement.classList.toggle('opened')">
                    <h3>Semana ${i}</h3>
                </div>
                <div class="week-body">
                    ${mat.clase ? `
                        <div class="content-item" onclick="visualizePdf('${mat.clase}', 'Clase ${i}', this)">
                            <span class="icon">📖</span>
                            <div class="item-info"><strong>Clase ${i}</strong><p>Material de estudio</p></div>
                        </div>
                    ` : ''}
                    ${mat.actividad ? `
                        <div class="content-item" onclick="visualizePdf('${mat.actividad}', 'Actividad ${i}', this)">
                            <span class="icon">🛠️</span>
                            <div class="item-info"><strong>Actividad ${i}</strong><p>Consigna práctica</p></div>
                        </div>
                    ` : ''}
                    <div style="background:#f1f5f9; padding:15px; border-radius:12px; margin-top:10px; border: 1px dashed #cbd5e1; text-align:center;">
                        <p style="font-size:0.8rem; margin-bottom:10px;">${entrega ? '✅ Tarea Entregada' : '⌛ Entrega Pendiente'}</p>
                        <input type="file" id="file-${i}" style="display:none" accept=".pdf" onchange="uploadHomework(${i})">
                        <button style="background:var(--primary-color); color:white; border:none; padding:8px 15px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;" onclick="document.getElementById('file-${i}').click()">
                            ${entrega ? 'ACTUALIZAR' : 'ELEVADO ARCHIVO'}
                        </button>
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        });

    } catch (e) { console.error(e); }
}

function visualizePdf(url, title, element) {
    if (!url) return alert("Material no disponible.");

    // UI Feedback: Marcar item activo
    document.querySelectorAll('.content-item').forEach(el => el.classList.remove('active'));
    element?.classList.add('active');

    const placeholder = document.getElementById('viewer-placeholder');
    const container = document.getElementById('viewer-container');
    const viewer = document.getElementById('pdf-viewer');
    const titleEl = document.getElementById('pdf-title');
    const externalLink = document.getElementById('pdf-external-link');
    const loader = document.getElementById('pdf-loader');
    const retryBtn = document.getElementById('pdf-retry-btn');

    placeholder.classList.add('hidden');
    container.classList.remove('hidden');
    viewer.style.visibility = "hidden";
    if (loader) loader.style.display = "block";

    titleEl.innerText = title;
    externalLink.href = url;
    retryBtn.href = url;

    let finalUrl = url;
    if (url.includes('drive.google.com')) {
        const idMatch = url.match(/\/d\/(.+?)(\/|$)/) || url.match(/id=(.+?)(&|$)/);
        if (idMatch) finalUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview`;
    }

    viewer.onload = () => { if (loader) loader.style.display = "none"; viewer.style.visibility = "visible"; };
    viewer.src = finalUrl;
}

function closeViewer() {
    document.getElementById('viewer-container').classList.add('hidden');
    document.getElementById('viewer-placeholder').classList.remove('hidden');
    document.getElementById('pdf-viewer').src = "about:blank";
    document.querySelectorAll('.content-item').forEach(el => el.classList.remove('active'));
}

async function uploadHomework(semana) {
    const fileInput = document.getElementById(`file-${semana}`);
    const file = fileInput.files[0];
    if (!file) return;
    try {
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
            fecha_entrega: new Date().toISOString(),
            estado: 'Pendiente'
        });
        alert("✅ Tarea enviada.");
        loadContent();
    } catch (error) { alert("Error: " + error.message); }
}

document.getElementById('btn-logout-home')?.addEventListener('click', () => { localStorage.removeItem('user_session'); window.location.href = 'index.html'; });
document.getElementById('btn-back-home')?.addEventListener('click', backToHome);
document.getElementById('btn-close-viewer')?.addEventListener('click', closeViewer);

initStudentDashboard();
