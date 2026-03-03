// Mi Aula Virtual - Lógica del Alumno v7.0.0 (Navegación Multinivel)
let studentSession = JSON.parse(localStorage.getItem('user_session'));
let currentCourseId = '';

if (!studentSession) {
    window.location.href = 'index.html';
}

function initStudentDashboard() {
    // 1. Mostrar nombre en pantalla de inicio
    const homeName = document.getElementById('home-student-name');
    if (homeName) homeName.innerText = `¡Hola, ${studentSession.nombre.split(' ')[0]}!`;

    // 2. Poblar cuadrícula de cursos
    const grid = document.getElementById('home-course-grid');
    if (!grid) return;

    grid.innerHTML = '';
    studentSession.cursos.forEach(curso => {
        const card = document.createElement('div');
        card.className = 'course-card animated-in';
        card.innerHTML = `
            <div class="course-icon">${curso.id === 'habilidades' ? '💻' : '🚀'}</div>
            <h3>${curso.nombre}</h3>
            <p style="font-size:0.9rem; color:#64748b;">Haga clic para acceder al material semanal y actividades.</p>
            <button class="btn-enter-course">INGRESAR AL AULA</button>
        `;
        card.onclick = () => selectCourse(curso.id, curso.nombre);
        grid.appendChild(card);
    });
}

function selectCourse(courseId, courseName) {
    currentCourseId = courseId;

    // Cambiar vistas
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('course-view').classList.remove('hidden');

    // Actualizar UI
    document.getElementById('course-title').innerText = courseName;
    document.getElementById('nav-course-name').innerText = courseName;
    document.getElementById('student-name-nav').innerText = studentSession.nombre;

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
        weeksContainer.innerHTML = '<div style="text-align:center; padding:50px;"><p style="font-size:1.1rem; color:#64748b;">⏳ Cargando tus contenidos...</p></div>';

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

        // 1. BIENVENIDA Y PROGRAMA (Siempre primero)
        const matInicio = materiales['inicio'] || {
            welcome: config.welcome_url || '',
            syllabus: config.syllabus_url || '',
            fecha: config.fecha_inicio || ''
        };
        const fechaInicio = matInicio.fecha ? new Date(matInicio.fecha + "T00:00:00") : null;

        if (fechaInicio && hoy >= fechaInicio) {
            const introCard = document.createElement('div');
            introCard.className = 'week-card active animated-in';
            introCard.innerHTML = `
                <div class="week-header"><h3>📚 Bienvenida y Programa</h3></div>
                <div class="week-body" style="display:block;">
                    ${matInicio.welcome ? `
                        <div class="content-item" onclick="visualizePdf('${matInicio.welcome}', 'Bienvenida')">
                            <span class="icon">👋</span>
                            <div class="item-info"><strong>Mensaje de Bienvenida</strong><p>Haga clic para ver el mensaje</p></div>
                        </div>
                    ` : ''}
                    ${matInicio.syllabus ? `
                        <div class="content-item" onclick="visualizePdf('${matInicio.syllabus}', 'Programa Académico')">
                            <span class="icon">📋</span>
                            <div class="item-info"><strong>Programa del Curso</strong><p>Contenidos y organización</p></div>
                        </div>
                    ` : ''}
                </div>
            `;
            weeksContainer.appendChild(introCard);
        }

        // 2. SEMANAS LIBERADAS
        const exceptions = config.excepciones || [];
        let weeksKeys = Object.keys(materiales)
            .filter(k => k.startsWith('sem_'))
            .map(k => parseInt(k.replace('sem_', '')))
            .sort((a, b) => b - a); // Inverso: lo último primero

        weeksKeys.forEach(i => {
            if (exceptions.includes(i)) return;
            const mat = materiales[`sem_${i}`] || {};
            const fechaLib = mat.fecha ? new Date(mat.fecha + "T00:00:00") : null;
            if (!fechaLib || hoy < fechaLib) return;

            const entrega = entregas.find(e => e.semana === i);
            const card = document.createElement('div');
            card.className = 'week-card animated-in';
            card.innerHTML = `
                <div class="week-header" onclick="this.parentElement.classList.toggle('opened')">
                    <h3>Semana ${i}</h3>
                    <span class="badge success">Disponible</span>
                </div>
                <div class="week-body" style="padding-top:15px;">
                    <div class="content-item" onclick="visualizePdf('${mat.clase || ''}', 'Clase Semana ${i}')">
                        <span class="icon">📖</span>
                        <div class="item-info"><strong>Material de Clase ${i}</strong><p>Teoría y lectura</p></div>
                    </div>
                    <div class="content-item" onclick="visualizePdf('${mat.actividad || ''}', 'Actividad Semana ${i}')">
                        <span class="icon">🛠️</span>
                        <div class="item-info"><strong>Consigna Actividad ${i}</strong><p>Tarea práctica</p></div>
                    </div>
                    <div class="delivery-area" style="background:#f1f5f9; padding:20px; border-radius:15px; margin-top:10px;">
                        <p style="font-size:0.9rem; margin-bottom:10px;">
                            <strong>Estado:</strong> ${entrega ? '✅ Entregado' : '⌛ Pendiente'}
                        </p>
                        <input type="file" id="file-${i}" style="display:none" accept=".pdf" onchange="uploadHomework(${i})">
                        <button class="btn-upload" onclick="document.getElementById('file-${i}').click()">
                            ${entrega ? 'Re-enviar PDF' : 'Subir Actividad (PDF)'}
                        </button>
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        });

        if (weeksContainer.innerHTML === '') {
            weeksContainer.innerHTML = '<p class="empty-msg">Aún no hay contenidos liberados para hoy.</p>';
        }

    } catch (e) {
        console.error(e);
        alert("Error al cargar contenidos. Intenta refrescar la página.");
    }
}

/**
 * VISUALIZADOR DE ARCHIVOS v7.0.0
 * Si falla el visualizador embebido, ofrece apertura directa al usuario.
 */
function visualizePdf(url, title) {
    if (!url || url === 'undefined') return alert("Este archivo aún no ha sido cargado por el docente.");

    const modal = document.getElementById('pdf-modal');
    const viewer = document.getElementById('pdf-viewer');
    const titleEl = document.getElementById('pdf-title');
    const externalLink = document.getElementById('pdf-external-link');
    const retryBtn = document.getElementById('pdf-retry-btn');
    const loader = document.getElementById('pdf-loader');

    // Resetear
    viewer.src = "about:blank";
    viewer.style.visibility = "hidden";
    if (loader) loader.style.display = "block";
    if (titleEl) titleEl.innerText = title;
    if (externalLink) externalLink.href = url;
    if (retryBtn) retryBtn.href = url;

    modal.classList.remove('hidden');

    let finalUrl = url;
    // Conversión Drive
    if (url.includes('drive.google.com')) {
        const idMatch = url.match(/\/d\/(.+?)(\/|$)/) || url.match(/id=(.+?)(&|$)/);
        if (idMatch) finalUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview`;
    } else if (!url.toLowerCase().endsWith('.pdf')) {
        finalUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    }

    // Control de carga
    viewer.onload = () => {
        if (loader) loader.style.display = "none";
        viewer.style.visibility = "visible";
    };

    // Fallback manual a los 4 segundos
    setTimeout(() => {
        if (loader) {
            // No ocultamos el loader para que el botón de "FORZAR" siga visible si falla el frame
            // pero permitimos ver el viewer si cargó algo
            viewer.style.visibility = "visible";
        }
    }, 4500);

    viewer.src = finalUrl;
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

        alert("✅ ¡Actividad enviada con éxito!");
        loadContent();
    } catch (error) {
        alert("Error al subir: " + error.message);
    } finally {
        btn.innerText = "Subir Actividad (PDF)";
        btn.disabled = false;
    }
}

// Eventos de Navegación
document.getElementById('btn-logout-home')?.addEventListener('click', () => {
    localStorage.removeItem('user_session');
    window.location.href = 'index.html';
});

document.getElementById('btn-back-home')?.addEventListener('click', backToHome);

// Inicio
initStudentDashboard();
