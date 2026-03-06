// Mi Aula Virtual - Lógica del Alumno v9.7.0 (Smart Order & UI Symbols)
let studentSession = JSON.parse(localStorage.getItem('user_session'));
let currentCourseId = '';
let currentViewState = 'home'; // 'home', 'course', 'viewer'

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
            <h3 style="font-size:1.4rem; font-weight:800; margin-bottom:10px;">${curso.nombre}</h3>
            <p style="font-size:0.95rem; color:#64748b; margin-bottom:30px;">Accede a tus materiales y realiza tus entregas.</p>
            <button class="btn-enter-course">INGRESAR AL CURSO</button>
        `;
        card.onclick = () => selectCourse(curso.id, curso.nombre);
        grid.appendChild(card);
    });

    updateHeaderButton();
}

function updateHeaderButton() {
    const btn = document.getElementById('btn-header-action');
    if (!btn) return;

    // Remover listeners viejos para evitar duplicados
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    if (currentViewState === 'home') {
        newBtn.innerText = 'Salir';
        newBtn.onclick = () => {
            localStorage.removeItem('user_session');
            window.location.href = 'index.html';
        };
    } else if (currentViewState === 'course') {
        newBtn.innerText = 'Inicio';
        newBtn.onclick = backToHome;
    } else if (currentViewState === 'viewer') {
        newBtn.innerText = 'Volver';
        newBtn.onclick = closeViewer;
    }
}

function selectCourse(courseId, courseName) {
    currentCourseId = courseId;
    currentViewState = 'course';

    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('course-view').classList.remove('hidden');
    document.getElementById('course-title').innerText = courseName;

    updateHeaderButton();
    loadContent();
}

function backToHome() {
    currentCourseId = '';
    currentViewState = 'home';

    document.getElementById('course-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');

    updateHeaderButton();
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

        // 1. SEMANAS (Orden Inverso: 5, 4, 3...) - AHORA PRIMERO
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
            card.className = `week-card`;
            card.innerHTML = `
                <div class="week-header" onclick="this.parentElement.classList.toggle('opened')">
                    <h3>Semana ${i} ${entrega ? '✅' : '⌛'}</h3>
                    <span class="toggle-icon">▼</span>
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
                    
                    <!-- NUEVO SISTEMA DE ENTREGA POR LINK -->
                    <div class="assignment-container">
                        <div class="status-label ${entrega ? 'status-sent' : 'status-pending'}">
                            ${entrega ? '✅ Actividad Enviada' : '⌛ Entrega Pendiente'}
                        </div>
                        
                        <div class="input-group">
                            <label for="link-${i}">Pega aquí el link de Drive con tu actividad:</label>
                            <input type="text" id="link-${i}" class="input-premium-task" 
                                   placeholder="https://drive.google.com/..." 
                                   value="${entrega ? (entrega.archivo_url || '') : ''}">
                        </div>

                        <div class="help-text-task">
                            <p>💡 <strong>Ayuda:</strong> Sube tu archivo a Google Drive, asegúrate de que el acceso sea público (Cualquier persona con el enlace) y pega el link aquí. Si te equivocaste, pega el nuevo link y dale a ENVIAR nuevamente.</p>
                        </div>

                        <button class="btn-submit-task" onclick="submitTask(${i})">
                            ${entrega ? 'ACTUALIZAR ACTIVIDAD' : 'ENVIAR ACTIVIDAD'}
                        </button>
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        });

        // 2. BIENVENIDA Y PROGRAMA - AHORA AL FINAL
        const matInicio = materiales['inicio'] || {};
        const welcomeUrl = matInicio.welcome || config.welcome_url;
        const syllabusUrl = matInicio.syllabus || config.syllabus_url;

        if (welcomeUrl || syllabusUrl) {
            const introCard = document.createElement('div');
            introCard.className = 'week-card'; // Cerrado por defecto
            introCard.innerHTML = `
                <div class="week-header" onclick="this.parentElement.classList.toggle('opened')">
                    <h3>📚 Bienvenida y Programa</h3>
                    <span class="toggle-icon">▼</span>
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


    } catch (e) { console.error(e); }
}

function visualizePdf(url, title, element) {
    if (!url) return alert("Material no disponible.");

    currentViewState = 'viewer';
    updateHeaderButton();

    document.querySelectorAll('.content-item').forEach(el => el.classList.remove('active'));
    element?.classList.add('active');

    const container = document.getElementById('viewer-container');
    const viewer = document.getElementById('pdf-viewer');
    const loader = document.getElementById('pdf-loader');

    document.getElementById('course-view').classList.add('mode-viewer');

    container.classList.remove('hidden');
    viewer.style.visibility = "hidden";
    if (loader) loader.style.display = "block";

    let finalUrl = url;
    if (url.includes('drive.google.com')) {
        const idMatch = url.match(/\/d\/(.+?)(\/|$)/) || url.match(/id=(.+?)(&|$)/);
        // Agregamos ?view=fitH para que el visor de Google ajuste el ancho automáticamente
        if (idMatch) finalUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview?view=fitH`;
    }

    viewer.onload = () => { if (loader) loader.style.display = "none"; viewer.style.visibility = "visible"; };
    viewer.src = finalUrl;
}

function closeViewer() {
    currentViewState = 'course';
    updateHeaderButton();

    document.getElementById('course-view').classList.remove('mode-viewer');
    document.getElementById('viewer-container').classList.add('hidden');
    document.getElementById('pdf-viewer').src = "about:blank";
    document.querySelectorAll('.content-item').forEach(el => el.classList.remove('active'));
}

async function submitTask(semana) {
    const linkInput = document.getElementById(`link-${semana}`);
    const rawUrl = linkInput.value.trim();

    if (!rawUrl) return alert("Por favor, pega el link de tu actividad en Drive.");
    if (!rawUrl.includes('drive.google.com')) return alert("El link no parece ser de Google Drive. Por favor, verifica.");

    try {
        // Buscamos si ya existe una entrega para actualizarla
        const snapshot = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .where('semana', '==', semana)
            .get();

        if (!snapshot.empty) {
            // Actualizar existente
            const docId = snapshot.docs[0].id;
            await db.collection('entregas').doc(docId).update({
                archivo_url: rawUrl,
                fecha_entrega: new Date().toISOString(),
                estado: 'Pendiente' // Se vuelve a poner en pendiente para que el admin lo vea
            });
        } else {
            // Crear nueva
            await db.collection('entregas').add({
                alumno_dni: studentSession.dni,
                alumno_nombre: studentSession.nombre,
                curso: currentCourseId,
                semana: semana,
                archivo_url: rawUrl,
                fecha_entrega: new Date().toISOString(),
                estado: 'Pendiente'
            });
        }

        alert("🚀 ¡Actividad Enviada con éxito!");
        loadContent();
    } catch (error) {
        alert("Error al enviar: " + error.message);
    }
}

initStudentDashboard();
