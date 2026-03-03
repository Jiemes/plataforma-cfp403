// Mi Aula Virtual - Lógica del Alumno v7.2.0 (Armonía Visual + Fix Carga de Datos)
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
            <p style="font-size:0.95rem; color:#64748b; margin-bottom:25px;">Explora tus contenidos semanales y envía tus actividades.</p>
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
        weeksContainer.innerHTML = '<div style="text-align:center; padding:50px;"><p style="font-size:1.1rem; color:#64748b;">⌛ Sincronizando tu aula virtual...</p></div>';

        const configSnap = await db.collection('config_cursos').doc(currentCourseId).get();
        if (!configSnap.exists) {
            weeksContainer.innerHTML = '<p class="empty-msg" style="color:#1e293b; background:white;">El curso no tiene materiales cargados aún.</p>';
            return;
        }

        const config = configSnap.data();
        // UNIFICACIÓN DE CAMPOS: materiales vs materials
        let materiales = config.materiales || config.materials || {};

        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .get();
        const entregas = entregasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        weeksContainer.innerHTML = '';
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999); // Tolerancia para liberación en el mismo día

        // 1. BIENVENIDA Y PROGRAMA (Detección Ultra-Robusta)
        const matInicio = materiales['inicio'] || {};
        const welcomeUrl = matInicio.welcome || config.welcome_url || config.welcome;
        const syllabusUrl = matInicio.syllabus || config.syllabus_url || config.syllabus;
        const fInicioStr = matInicio.fecha || config.fecha_inicio || config.fecha;

        let shouldShowInicio = false;
        if (fInicioStr) {
            const fInicio = new Date(fInicioStr + "T00:00:00");
            if (hoy >= fInicio) shouldShowInicio = true;
        } else if (welcomeUrl || syllabusUrl) {
            shouldShowInicio = true; // Si hay archivos y no hay fecha, se muestra
        }

        if (shouldShowInicio) {
            const introCard = document.createElement('div');
            introCard.className = 'week-card animated-in opened'; // Forzado abierto
            introCard.innerHTML = `
                <div class="week-header"><h3>📚 Bienvenida y Programa</h3></div>
                <div class="week-body" style="display:flex;">
                    ${welcomeUrl ? `
                        <div class="content-item" onclick="visualizePdf('${welcomeUrl}', 'Bienvenida')">
                            <span class="icon">👋</span>
                            <div class="item-info"><strong>Mensaje de Bienvenida</strong><p>Haga clic para leer</p></div>
                        </div>
                    ` : '<p style="font-size:0.8rem; color:#94a3b8; padding:10px;">⌛ Bienvenida pendiente de carga</p>'}
                    ${syllabusUrl ? `
                        <div class="content-item" onclick="visualizePdf('${syllabusUrl}', 'Programa Académico')">
                            <span class="icon">📋</span>
                            <div class="item-info"><strong>Programa del Curso</strong><p>Haga clic para ver objetivos</p></div>
                        </div>
                    ` : '<p style="font-size:0.8rem; color:#94a3b8; padding:10px;">⌛ Programa pendiente de carga</p>'}
                </div>
            `;
            weeksContainer.appendChild(introCard);
        }

        // 2. SEMANAS (Orden Inverso)
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
            card.className = `week-card animated-in ${i === weeksKeys[0] ? 'opened' : ''}`;
            card.innerHTML = `
                <div class="week-header" onclick="this.parentElement.classList.toggle('opened')">
                    <h3>Semana ${i}</h3>
                    <span class="badge" style="background:#00B9E8; color:white; padding:4px 10px; border-radius:10px; font-size:0.7rem;">LIBERADO</span>
                </div>
                <div class="week-body">
                    ${mat.clase ? `
                        <div class="content-item" onclick="visualizePdf('${mat.clase}', 'Clase Semana ${i}')">
                            <span class="icon">📖</span>
                            <div class="item-info"><strong>Clase ${i}</strong><p>Material teórico</p></div>
                        </div>
                    ` : ''}
                    ${mat.actividad ? `
                        <div class="content-item" onclick="visualizePdf('${mat.actividad}', 'Actividad Semana ${i}')">
                            <span class="icon">🛠️</span>
                            <div class="item-info"><strong>Actividad ${i}</strong><p>Consigna práctica</p></div>
                        </div>
                    ` : ''}
                    <div class="delivery-area">
                        <p style="font-size:0.85rem; margin-bottom:12px; font-weight:600;">Estado: ${entrega ? '✅ Trabajo Entregado' : '⌛ Pendiente de Entrega'}</p>
                        <input type="file" id="file-${i}" style="display:none" accept=".pdf" onchange="uploadHomework(${i})">
                        <button class="btn-upload" onclick="document.getElementById('file-${i}').click()">
                            ${entrega ? 'RE-ENVIAR ACTIVIDAD' : 'SUBIR MI TRABAJO (PDF)'}
                        </button>
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        });

        if (weeksContainer.innerHTML === '') {
            weeksContainer.innerHTML = '<div class="empty-msg" style="padding:40px; text-align:center; background:white; border-radius:20px; color:#64748b;">No hay materiales disponibles para esta fecha.</div>';
        }

    } catch (e) {
        console.error("Error al cargar contenidos:", e);
        alert("Hubo un error de sincronización. Por favor, refresca la página.");
    }
}

function visualizePdf(url, title) {
    if (!url || url === 'undefined' || url === '') return alert("El archivo aún no ha sido vinculado por el administrador.");
    const modal = document.getElementById('pdf-modal');
    const viewer = document.getElementById('pdf-viewer');
    const titleEl = document.getElementById('pdf-title');
    const externalLink = document.getElementById('pdf-external-link');
    const retryBtn = document.getElementById('pdf-retry-btn');
    const loader = document.getElementById('pdf-loader');

    viewer.src = "about:blank";
    viewer.style.visibility = "hidden";
    if (loader) loader.style.display = "block";
    titleEl.innerText = title;
    externalLink.href = url;
    retryBtn.href = url;
    modal.classList.remove('hidden');

    let finalUrl = url;
    if (url.includes('drive.google.com')) {
        const idMatch = url.match(/\/d\/(.+?)(\/|$)/) || url.match(/id=(.+?)(&|$)/);
        if (idMatch) finalUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview`;
    }

    viewer.onload = () => { if (loader) loader.style.display = "none"; viewer.style.visibility = "visible"; };
    setTimeout(() => { viewer.style.visibility = "visible"; }, 5000); // Mayor margen de espera
    viewer.src = finalUrl;
}

async function uploadHomework(semana) {
    const fileInput = document.getElementById(`file-${semana}`);
    const file = fileInput.files[0];
    if (!file) return;
    const btn = fileInput.nextElementSibling;
    try {
        btn.innerText = "⏳ Subiendo...";
        btn.disabled = true;
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
            estado: 'Pendiente'
        };

        const q = await db.collection('entregas').where('alumno_dni', '==', studentSession.dni).where('curso', '==', currentCourseId).where('semana', '==', semana).get();
        if (!q.empty) await db.collection('entregas').doc(q.docs[0].id).update(data);
        else await db.collection('entregas').add(data);

        alert("✅ ¡Tarea enviada correctamente!");
        loadContent();
    } catch (error) { alert("Error: " + error.message); }
    finally { btn.innerText = "SUBIR MI TRABAJO (PDF)"; btn.disabled = false; }
}

document.getElementById('btn-logout-home')?.addEventListener('click', () => { localStorage.removeItem('user_session'); window.location.href = 'index.html'; });
document.getElementById('btn-back-home')?.addEventListener('click', backToHome);
document.getElementById('close-pdf')?.addEventListener('click', () => {
    document.getElementById('pdf-modal').classList.add('hidden');
    document.getElementById('pdf-viewer').src = "about:blank";
});

initStudentDashboard();
