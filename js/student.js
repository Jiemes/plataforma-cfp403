// Mi Aula Virtual - Lógica del Alumno v6.9.0 (Soporte Universal de PDFs)
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
        weeksContainer.innerHTML = '<p class="loader" style="text-align:center; padding:40px;">⏳ Organizando tu material de estudio...</p>';

        const configSnap = await db.collection('config_cursos').doc(currentCourseId).get();
        if (!configSnap.exists) {
            weeksContainer.innerHTML = '<p class="empty-msg">El curso aún no ha sido configurado por el administrador.</p>';
            return;
        }
        const config = configSnap.data();
        let materiales = {};
        if (config.materials) Object.assign(materiales, config.materials);
        if (config.materiales) Object.assign(materiales, config.materiales);

        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .get();
        const entregas = entregasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        weeksContainer.innerHTML = '';
        const hoy = new Date();

        // 1. BIENVENIDA Y PROGRAMA
        const matInicio = materiales['inicio'] || { welcome: config.welcome_url || '', syllabus: config.syllabus_url || '', fecha: config.fecha_inicio || '' };
        const fechaInicio = matInicio.fecha ? new Date(matInicio.fecha + "T00:00:00") : null;

        if (fechaInicio && hoy >= fechaInicio) {
            const introCard = document.createElement('div');
            introCard.className = 'card week-card active animated-in';
            introCard.style.borderLeft = '6px solid #10b981';
            introCard.innerHTML = `
                <div class="week-header"><h3>📚 Bienvenida y Programa</h3></div>
                <div class="week-body" style="display:block; padding:20px;">
                    ${matInicio.welcome ? `
                        <div class="content-item clickable" onclick="visualizePdf('${matInicio.welcome}', 'Bienvenida')">
                            <span class="icon">👋</span>
                            <div class="item-info"><strong>Mensaje de Bienvenida</strong><p>Clic para leer</p></div>
                        </div>
                    ` : ''}
                    ${matInicio.syllabus ? `
                        <div class="content-item clickable" onclick="visualizePdf('${matInicio.syllabus}', 'Programa')">
                            <span class="icon">📋</span>
                            <div class="item-info"><strong>Programa Académico</strong><p>Clic para ver objetivos</p></div>
                        </div>
                    ` : ''}
                </div>
            `;
            weeksContainer.appendChild(introCard);
        }

        // 2. SEMANAS
        const exceptions = config.excepciones || [];
        let weeksKeys = Object.keys(materiales).filter(k => k.startsWith('sem_')).map(k => parseInt(k.replace('sem_', ''))).sort((a, b) => b - a);

        if (weeksKeys.length === 0 && (!fechaInicio || hoy < fechaInicio)) {
            weeksContainer.innerHTML = '<p class="empty-msg">¡Próximamente verás aquí tus contenidos!</p>';
            return;
        }

        weeksKeys.forEach(i => {
            if (exceptions.includes(i)) return;
            const mat = materiales[`sem_${i}`] || {};
            const fechaLib = mat.fecha ? new Date(mat.fecha + "T00:00:00") : null;
            if (!fechaLib || hoy < fechaLib) return;

            const entrega = entregas.find(e => e.semana === i);
            const card = document.createElement('div');
            card.className = `card week-card animated-in ${i === weeksKeys[0] ? 'active' : ''}`;
            card.innerHTML = `
                <div class="week-header" onclick="this.parentElement.classList.toggle('active')">
                    <h3>Semana ${i}</h3>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <span class="badge success">Disponible</span>
                        <span class="toggle-icon">▼</span>
                    </div>
                </div>
                <div class="week-body">
                    <div class="content-item clickable" onclick="visualizePdf('${mat.clase || ''}', 'Clase ${i}')">
                        <span class="icon">📖</span>
                        <div class="item-info"><strong>Clase ${i}</strong><p>${mat.clase ? 'Ver material teórico' : '⌛ Pendiente'}</p></div>
                    </div>
                    <div class="content-item clickable" onclick="visualizePdf('${mat.actividad || ''}', 'Actividad ${i}')">
                        <span class="icon">🛠️</span>
                        <div class="item-info"><strong>Actividad ${i}</strong><p>${mat.actividad ? 'Ver consigna' : '⌛ Pendiente'}</p></div>
                    </div>
                    <div class="delivery-section" style="background:#f8fafc; padding:20px; border-radius:12px; margin-top:15px;">
                        <p style="font-size:0.9rem; margin-bottom:10px;">
                            <strong>Estado Entrega:</strong> 
                            <span class="status-badge ${entrega ? 'calificado' : 'pendiente'}">${entrega ? 'Entregado' : 'Pendiente'}</span>
                        </p>
                        <input type="file" id="file-${i}" class="hidden-input" style="display:none" accept=".pdf" onchange="uploadHomework(${i})">
                        <button class="btn-upload" onclick="document.getElementById('file-${i}').click()">
                            ${entrega ? '📤 Re-enviar Actividad' : 'Subir mi Actividad (PDF)'}
                        </button>
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        });

    } catch (e) { console.error(e); }
}

/**
 * VISUALIZADOR DE PDF BLINDADO v6.9.0
 * Solución definitiva para bloqueos de Frame y Drive privado.
 */
function visualizePdf(url, title) {
    if (!url) return alert("El material solicitado aún no ha sido cargado.");

    const modal = document.getElementById('pdf-modal');
    const viewer = document.getElementById('pdf-viewer');
    const titleEl = document.getElementById('pdf-title');
    const externalLink = document.getElementById('pdf-external-link');
    const loader = document.getElementById('pdf-loader');

    // 1. Resetear visor y mostrar loader
    viewer.src = "about:blank";
    viewer.style.display = "none";
    if (loader) {
        loader.style.display = "block";
        loader.innerHTML = `
            <div style="padding:20px;">
                <p style="font-size: 1.1rem; color: #1e293b; font-weight: 700;">⌛ Cargando archivo...</p>
                <p style="font-size: 0.85rem; color: #64748b; margin-top: 10px;">Si el archivo tarda demasiado, asegúrate de que sea público en Google Drive.</p>
                <a href="${url}" target="_blank" style="display:inline-block; margin-top:20px; padding:12px 25px; background:#10b981; color:white; border-radius:10px; text-decoration:none; font-weight:800; font-size:0.9rem; box-shadow:0 4px 10px rgba(16,185,129,0.3);">
                    🔓 FORZAR APERTURA EXTERNA
                </a>
            </div>
        `;
    }
    if (titleEl) titleEl.innerText = title;
    if (externalLink) externalLink.href = url;

    modal.classList.remove('hidden');

    let embedUrl = "";
    // 2. Lógica de Enlace Inteligente
    if (url.includes('drive.google.com')) {
        let fileId = "";
        const idMatch = url.match(/\/d\/(.+?)(\/|$)/) || url.match(/id=(.+?)(&|$)/);
        fileId = idMatch ? idMatch[1] : "";
        // Usamos el visor de Google Docs para Drive también, suele ser más tolerante a cookies
        embedUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    } else {
        embedUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    }

    // 3. Control de Carga
    viewer.onload = () => {
        if (loader) loader.style.display = "none";
        viewer.style.display = "block";
    };

    // A los 3 segundos mostramos el iframe haga lo que haga, para que si Google muestra algo (así sea un error), el usuario lo vea
    setTimeout(() => {
        if (loader) loader.style.display = "none";
        viewer.style.display = "block";
    }, 4500);

    viewer.src = embedUrl;
}

document.getElementById('close-pdf')?.addEventListener('click', () => {
    document.getElementById('pdf-modal').classList.add('hidden');
    document.getElementById('pdf-viewer').src = "about:blank";
});

async function uploadHomework(semana) {
    const fileInput = document.getElementById(`file-${semana}`);
    const file = fileInput.files[0];
    if (!file) return;
    const btn = fileInput.nextElementSibling;
    try {
        btn.innerText = "⏳ Enviando...";
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

        alert("✅ ¡Actividad enviada!");
        loadContent();
    } catch (error) { alert("Error: " + error.message); }
    finally { btn.innerText = "Subir mi Actividad (PDF)"; btn.disabled = false; }
}

document.getElementById('btn-logout-student')?.addEventListener('click', () => {
    localStorage.removeItem('user_session');
    window.location.href = 'index.html';
});

initStudentDashboard();
