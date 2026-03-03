// Mi Aula Virtual - Lógica del Alumno v7.1.0 (Corrección de carga y diseño unificado)
let studentSession = JSON.parse(localStorage.getItem('user_session'));
let currentCourseId = '';

if (!studentSession) { window.location.href = 'index.html'; }

function initStudentDashboard() {
    const homeName = document.getElementById('home-student-name');
    if (homeName) homeName.innerText = `¡Hola, ${studentSession.nombre.split(' ')[0]}!`;

    const grid = document.getElementById('home-course-grid');
    if (!grid) return;

    grid.innerHTML = '';
    studentSession.cursos.forEach(curso => {
        const card = document.createElement('div');
        card.className = 'course-card animated-in';
        card.innerHTML = `
            <div class="course-icon">${curso.id === 'habilidades' ? '💻' : '🚀'}</div>
            <h3>${curso.nombre}</h3>
            <p style="font-size:0.95rem; color:#64748b; margin-bottom:20px;">Accede a tus materiales de estudio y actividades prácticas semanalmente.</p>
            <button class="btn-enter-course">INGRESAR AHORA</button>
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
        weeksContainer.innerHTML = '<div style="text-align:center; padding:50px;"><p style="font-size:1.1rem; color:#64748b;">⏳ Cargando contenidos académicos...</p></div>';

        const configSnap = await db.collection('config_cursos').doc(currentCourseId).get();
        if (!configSnap.exists) {
            weeksContainer.innerHTML = '<p class="empty-msg" style="color:#1e293b; background:white;">El curso aún no ha sido configurado en el sistema.</p>';
            return;
        }

        const config = configSnap.data();
        let materiales = {};
        if (config.materiales) Object.assign(materiales, config.materiales);
        else if (config.materials) Object.assign(materiales, config.materials);

        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .get();
        const entregas = entregasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        weeksContainer.innerHTML = '';
        const hoy = new Date();

        // 1. BIENVENIDA Y PROGRAMA (Corregido: Forzar visibilidad)
        const matInicio = materiales['inicio'] || {};
        const welcomeUrl = matInicio.welcome || config.welcome_url;
        const syllabusUrl = matInicio.syllabus || config.syllabus_url;
        const fInicioStr = matInicio.fecha || config.fecha_inicio;

        if (fInicioStr) {
            const fInicio = new Date(fInicioStr + "T00:00:00");
            if (hoy >= fInicio) {
                const introCard = document.createElement('div');
                introCard.className = 'week-card animated-in';
                introCard.innerHTML = `
                    <div class="week-header"><h3>📚 Bienvenida y Programa</h3></div>
                    <div class="week-body">
                        ${welcomeUrl ? `
                            <div class="content-item" onclick="visualizePdf('${welcomeUrl}', 'Bienvenida')">
                                <span class="icon">👋</span>
                                <div class="item-info"><strong>Mensaje de Bienvenida</strong><p>Haga clic para ver el mensaje inicial</p></div>
                            </div>
                        ` : ''}
                        ${syllabusUrl ? `
                            <div class="content-item" onclick="visualizePdf('${syllabusUrl}', 'Programa Académico')">
                                <span class="icon">📋</span>
                                <div class="item-info"><strong>Programa del Curso</strong><p>Contenidos y objetivos del año</p></div>
                            </div>
                        ` : ''}
                    </div>
                `;
                weeksContainer.appendChild(introCard);
            }
        }

        // 2. SEMANAS LIBERADAS (Corregido: Mapeo de claves)
        const exceptions = config.excepciones || [];
        // Detectamos si las claves son "sem_X" o "semana_X"
        let weeksKeys = Object.keys(materiales)
            .filter(k => k.startsWith('sem_'))
            .map(k => parseInt(k.replace('sem_', '')))
            .sort((a, b) => b - a);

        weeksKeys.forEach(i => {
            if (exceptions.includes(i)) return;
            const mat = materiales[`sem_${i}`] || {};
            const fechaLibStr = mat.fecha;
            if (!fechaLibStr) return;

            const fechaLib = new Date(fechaLibStr + "T00:00:00");
            if (hoy < fechaLib) return;

            const entrega = entregas.find(e => e.semana === i);
            const card = document.createElement('div');
            card.className = 'week-card animated-in';
            card.innerHTML = `
                <div class="week-header" onclick="this.classList.toggle('opened')">
                    <h3>Semana ${i}</h3>
                    <span class="badge" style="background:#dcfce7; color:#166534; padding:5px 12px; border-radius:15px; font-size:0.75rem; font-weight:700;">CONTENIDO DISPONIBLE</span>
                </div>
                <div class="week-body">
                    <div class="content-item" onclick="visualizePdf('${mat.clase || ''}', 'Clase Semana ${i}')">
                        <span class="icon">📖</span>
                        <div class="item-info"><strong>Material Teórico ${i}</strong><p>Lectura recomendada del docente</p></div>
                    </div>
                    <div class="content-item" onclick="visualizePdf('${mat.actividad || ''}', 'Actividad Semana ${i}')">
                        <span class="icon">🛠️</span>
                        <div class="item-info"><strong>Consigna Práctica ${i}</strong><p>Actividad para realizar y entregar</p></div>
                    </div>
                    <div class="delivery-area">
                        <p style="font-size:0.9rem; margin-bottom:15px; color:#475569;">
                            <strong>Estado de Entrega:</strong> ${entrega ? '✅ Recibido' : '⌛ Pendiente de entrega'}
                        </p>
                        <input type="file" id="file-${i}" style="display:none" accept=".pdf" onchange="uploadHomework(${i})">
                        <button class="btn-upload" onclick="document.getElementById('file-${i}').click()">
                            ${entrega ? 'ACTUALIZAR ENTREGA (PDF)' : 'SUBIR MI TRABAJO (PDF)'}
                        </button>
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        });

        if (weeksContainer.innerHTML === '') {
            weeksContainer.innerHTML = '<div class="empty-msg" style="background:white; color:#64748b; border:1px solid #e2e8f0;">No hay contenidos liberados para tu perfil actualmente.</div>';
        }

    } catch (e) { console.error(e); }
}

function visualizePdf(url, title) {
    if (!url || url === 'undefined') return alert("El docente aún no ha cargado este archivo.");
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
    } else if (!url.toLowerCase().endsWith('.pdf')) {
        finalUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    }

    viewer.onload = () => { if (loader) loader.style.display = "none"; viewer.style.visibility = "visible"; };
    setTimeout(() => { viewer.style.visibility = "visible"; }, 4000);
    viewer.src = finalUrl;
}

async function uploadHomework(semana) {
    const fileInput = document.getElementById(`file-${semana}`);
    const file = fileInput.files[0];
    if (!file) return;
    const btn = fileInput.nextElementSibling;
    try {
        btn.innerText = "⏳ Enviando archivo...";
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

        alert("✅ ¡Tu actividad ha sido enviada correctamente!");
        loadContent();
    } catch (error) { alert("Error al subir: " + error.message); }
    finally { btn.innerText = "SUBIR MI TRABAJO (PDF)"; btn.disabled = false; }
}

document.getElementById('btn-logout-home')?.addEventListener('click', () => { localStorage.removeItem('user_session'); window.location.href = 'index.html'; });
document.getElementById('btn-back-home')?.addEventListener('click', backToHome);
document.getElementById('close-pdf')?.addEventListener('click', () => { document.getElementById('pdf-modal').classList.add('hidden'); document.getElementById('pdf-viewer').src = "about:blank"; });

initStudentDashboard();
