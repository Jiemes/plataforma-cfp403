// Mi Aula Virtual - Lógica del Alumno 6.6.1 (Accordion & Direct Look)
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
        weeksContainer.innerHTML = '<p class="loader" style="text-align:center;">Organizando tus clases...</p>';

        const configSnap = await db.collection('config_cursos').doc(currentCourseId).get();
        if (!configSnap.exists) {
            weeksContainer.innerHTML = '<p class="empty-msg">El cronograma del curso aún no ha sido configurado.</p>';
            return;
        }
        const config = configSnap.data();

        const entregasSnap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .get();
        const entregas = entregasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        weeksContainer.innerHTML = '';

        const startDate = new Date(config.fecha_inicio + "T08:00:00-03:00");
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

        const exceptions = config.excepciones || [];

        // Orden descendente (la última semana liberada arriba)
        for (let i = semanasLiberadas; i >= 1; i--) {
            if (exceptions.includes(i)) continue;

            const entrega = entregas.find(e => e.semana === i);
            const card = document.createElement('div');
            // La primera semana (la actual) aparece expandida
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
                    <div class="content-item clickable" onclick="window.open('${config.drive_url}', '_blank')" title="Abrir carpeta de materiales">
                        <span class="icon">📖</span>
                        <div class="item-info">
                            <strong>Clase ${i}</strong>
                            <p>Haz clic para estudiar la teoría</p>
                        </div>
                    </div>
                    <div class="content-item clickable" onclick="window.open('${config.drive_url}', '_blank')" title="Abrir carpeta de actividades">
                        <span class="icon">🛠️</span>
                        <div class="item-info">
                            <strong>Actividad ${i}</strong>
                            <p>Haz clic para ver la consigna</p>
                        </div>
                    </div>
                    <div class="delivery-section" style="background:#f8fafc; padding:20px; border-radius:12px; margin-top:15px;">
                        <div style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                            <p style="font-size:0.9rem;">
                                <strong>Estado de Entrega:</strong> 
                                ${!entrega ?
                    '<span class="status-badge pendiente">Pendiente</span>' :
                    `<span class="status-badge ${entrega.estado === 'Calificado' ? 'calificado' : 'pendiente'}" style="background:#dcfce7; color:#166534;">Entregado</span>`
                }
                            </p>
                        </div>
                        
                        <input type="file" id="file-${i}" class="hidden-input" style="display:none" accept=".pdf" onchange="uploadHomework(${i})">
                        <button class="btn-upload" onclick="document.getElementById('file-${i}').click()">
                            ${entrega ? '📤 Cambiar/Corregir Entrega' : 'Subir mi Actividad (PDF)'}
                        </button>
                        
                        ${entrega && entrega.nota ? `
                            <div class="grade-pill" style="margin-top:20px; border-top: 1px dashed #cbd5e1; padding-top:15px;">
                                <p>Calificación: <strong style="color:var(--primary-color); font-size:1.3rem;">${entrega.nota}</strong></p>
                                ${entrega.comentario ? `<p class="comment">"${entrega.comentario}"</p>` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            weeksContainer.appendChild(card);
        }
    } catch (e) {
        console.error("Error cargando aula virtual:", e);
    }
}

async function uploadHomework(semana) {
    const fileInput = document.getElementById(`file-${semana}`);
    const file = fileInput.files[0];
    if (!file) return;

    const btn = fileInput.nextElementSibling;
    try {
        btn.innerText = "⌛ Subiendo...";
        btn.disabled = true;

        // Sobrescritura inteligente: Buscar si ya existe una entrega
        const snap = await db.collection('entregas')
            .where('alumno_dni', '==', studentSession.dni)
            .where('curso', '==', currentCourseId)
            .where('semana', '==', semana)
            .limit(1)
            .get();

        const path = `entregas/${studentSession.dni}/${currentCourseId}/Semana_${semana}/${Date.now()}_${file.name}`;
        const ref = storage.ref().child(path);
        await ref.put(file);
        const url = await ref.getDownloadURL();

        const deliveryData = {
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

        if (!snap.empty) {
            await db.collection('entregas').doc(snap.docs[0].id).update(deliveryData);
        } else {
            await db.collection('entregas').add(deliveryData);
        }

        alert("¡Recibido! Tu trabajo ha sido enviado para corrección.");
        loadContent();
    } catch (error) {
        alert("Algo salió mal: " + error.message);
    } finally {
        btn.innerText = "Subir Trabajo";
        btn.disabled = false;
    }
}

document.getElementById('btn-logout-student')?.addEventListener('click', () => {
    localStorage.removeItem('user_session');
    window.location.href = 'index.html';
});

initStudentDashboard();
