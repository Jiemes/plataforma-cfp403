// Mi Aula Virtual - Lógica del Alumno v9.12.0 (Foro & Muro)
let studentSession = JSON.parse(localStorage.getItem('user_session'));
let currentCourseId = '';
let currentViewState = 'home'; // 'home', 'course', 'viewer'

if (!studentSession) { window.location.href = 'index.html'; }

async function initStudentDashboard() {
    const homeName = document.getElementById('home-student-name');
    if (homeName) {
        const nombre = studentSession.nombre.split(',')[1] || studentSession.nombre.split(' ')[0];
        homeName.innerText = `¡Hola, ${nombre.trim()}!`;
    }

    const grid = document.getElementById('home-course-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loader">Sincronizando tus promedios...</div>';

    // Obtenemos todas las entregas para calcular promedios globales
    const entregasSnap = await db.collection('entregas')
        .where('alumno_dni', '==', studentSession.dni)
        .where('estado', '==', 'Calificado')
        .get();
    const todasLasEntregas = entregasSnap.docs.map(doc => doc.data());

    grid.innerHTML = '';
    studentSession.cursos.forEach(curso => {
        // Calcular promedio para este curso específico
        const entregasCurso = todasLasEntregas.filter(e => e.curso === curso.id);
        const total = entregasCurso.reduce((sum, e) => sum + parseFloat(e.nota || 0), 0);
        const prom = entregasCurso.length > 0 ? (total / entregasCurso.length).toFixed(1) : '---';

        const card = document.createElement('div');
        card.className = 'course-card animated-in';
        card.innerHTML = `
            <div class="course-icon">${curso.id === 'habilidades' ? '💻' : '🚀'}</div>
            <h3 style="font-size:1.4rem; font-weight:800; margin-bottom:5px;">${curso.nombre}</h3>
            <div style="margin-bottom:15px;">
                <span style="background:var(--primary-light); color:var(--primary-color); padding:4px 10px; border-radius:10px; font-weight:800; font-size:0.8rem;">
                    🎯 Promedio: ${prom}
                </span>
            </div>
            <p style="font-size:0.9rem; color:#64748b; margin-bottom:20px;">Accede a tus materiales y realiza tus entregas.</p>
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

        const materialsKeys = Object.keys(materiales).filter(k => k.startsWith('sem_'));

        // 0. CALCULAR ESTADÍSTICAS DEL CURSO
        const calificados = entregas.filter(e => e.estado === 'Calificado');
        const totalPuntos = calificados.reduce((sum, e) => sum + parseFloat(e.nota || 0), 0);
        const promedioCurso = calificados.length > 0 ? (totalPuntos / calificados.length).toFixed(1) : '---';
        const progreso = materialsKeys.length > 0 ? Math.round((calificados.length / materialsKeys.length) * 100) : 0;

        const statsBanner = document.getElementById('course-stats-summary');
        if (statsBanner) {
            statsBanner.innerHTML = `
                <div class="stat-item">🎯 Promedio: <strong>${promedioCurso}</strong></div>
                <div class="stat-item">📈 Progreso: <strong>${progreso}%</strong></div>
            `;
        }

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
                            ${entrega ? (entrega.estado === 'Calificado' ? '✅ Calificada' : '✅ Actividad Enviada') : '⌛ Entrega Pendiente'}
                        </div>

                        ${entrega && entrega.estado === 'Calificado' ? `
                            <div class="grade-badge-premium">NOTA: ${entrega.nota} / 100</div>
                            ${entrega.devolucion ? `<div class="feedback-bubble">${entrega.devolucion}</div>` : ''}
                        ` : ''}
                        
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

// FORO / MURO DE CONSULTAS - LÓGICA ALUMNO
let foroUnsubscribe = null;
let replyToStudent = null;
let editingMsgId = null;

function openForo() {
    document.getElementById('foro-modal').classList.remove('hidden');
    loadForoStudent();
}

function closeForo() {
    document.getElementById('foro-modal').classList.add('hidden');
    if (foroUnsubscribe) foroUnsubscribe();
}

function loadForoStudent() {
    if (foroUnsubscribe) foroUnsubscribe();
    const container = document.getElementById('foro-student-container');
    container.innerHTML = '<p style="text-align:center; padding:20px;">Sincronizando muro...</p>';

    foroUnsubscribe = db.collection('foro_mensaje') || db.collection('foro_mensajes'); // Use consistent naming
    // Actually, I'll use 'foro_mensajes' as in admin
    foroUnsubscribe = db.collection('foro_mensajes')
        .where('curso_id', '==', currentCourseId)
        .orderBy('fecha', 'asc')
        .onSnapshot(snap => {
            container.innerHTML = '';
            if (snap.empty) {
                container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:30px;">Aún no hay consultas en este muro. ¡Sé el primero en preguntar!</p>';
                return;
            }
            snap.forEach(doc => {
                const msg = doc.data();
                const isMe = msg.alumno_dni === studentSession.dni;
                const isAdmin = msg.is_admin;

                const div = document.createElement('div');
                div.className = `msg-bubble ${isAdmin ? 'msg-admin' : (isMe ? 'msg-student-me' : 'msg-student-others')}`;

                div.innerHTML = `
                    <div class="msg-header">
                        <span class="msg-author">${isAdmin ? '⭐ DOCENTE' : (isMe ? 'Tú' : msg.alumno_nombre)}</span>
                        <span class="msg-time">${new Date(msg.fecha).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                    </div>
                    ${msg.respuesta_a ? `
                        <div class="quote-box">
                            <strong>${msg.respuesta_a.nombre}:</strong> "${msg.respuesta_a.mensaje.slice(0, 50)}..."
                        </div>
                    ` : ''}
                    <div class="msg-content" id="msg-text-${doc.id}">${msg.mensaje}</div>
                    <div class="msg-actions">
                        <button class="btn-msg-action" onclick="replyToMessageStudent('${doc.id}', '${isAdmin ? 'Docente' : msg.alumno_nombre}', '${msg.mensaje}')">🔄 Responder</button>
                        ${isMe ? `
                            <button class="btn-msg-action" onclick="prepareEditStudent('${doc.id}', \`${msg.mensaje.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`)">✏️ Editar</button>
                            <button class="btn-msg-action" onclick="deleteMessageStudent('${doc.id}')">🗑️ Borrar</button>
                        ` : ''}
                    </div>
                `;
                container.appendChild(div);
            });
            container.scrollTop = container.scrollHeight;
        });
}

function replyToMessageStudent(id, name, text) {
    replyToStudent = { id, name, mensaje: text };
    const preview = document.getElementById('reply-preview-student');
    const nameSpan = document.getElementById('reply-to-name-student');
    nameSpan.innerText = name;
    preview.classList.remove('hidden');
    document.getElementById('foro-input-student').focus();
    editingMsgId = null; // Cancelar edicion si se responde
    document.getElementById('btn-send-foro').innerText = 'ENVIAR';
}

function cancelReplyStudent() {
    replyToStudent = null;
    document.getElementById('reply-preview-student').classList.add('hidden');
}

function prepareEditStudent(id, text) {
    editingMsgId = id;
    const input = document.getElementById('foro-input-student');
    input.value = text;
    input.focus();
    document.getElementById('btn-send-foro').innerText = 'GUARDAR';
    cancelReplyStudent(); // Cancelar respuesta si se edita
}

async function sendMessageStudent() {
    const input = document.getElementById('foro-input-student');
    const msg = input.value.trim();
    if (!msg) return;

    try {
        if (editingMsgId) {
            // EDITAR
            await db.collection('foro_mensajes').doc(editingMsgId).update({
                mensaje: msg,
                fecha_edicion: new Date().toISOString()
            });
            editingMsgId = null;
            document.getElementById('btn-send-foro').innerText = 'ENVIAR';
        } else {
            // ENVIAR NUEVO
            await db.collection('foro_mensajes').add({
                curso_id: currentCourseId,
                alumno_dni: studentSession.dni,
                alumno_nombre: studentSession.nombre,
                mensaje: msg,
                fecha: new Date().toISOString(),
                is_admin: false,
                respuesta_a: replyToStudent
            });
        }
        input.value = '';
        cancelReplyStudent();
    } catch (e) { alert("Error: " + e.message); }
}

async function deleteMessageStudent(id) {
    if (confirm("¿Seguro que quieres borrar tu mensaje?")) {
        await db.collection('foro_mensajes').doc(id).delete();
    }
}

initStudentDashboard();
