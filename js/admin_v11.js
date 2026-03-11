// Administración CFP 403// Core Admin Logic v9.18.0 (RBAC & Multi-Course Logistics)
let adminSession = JSON.parse(localStorage.getItem('admin_session'));
if (!adminSession) { window.location.href = 'index.html'; }

let studentData = {}; // Dinámico: { curso_id: [alumnos] }
let activeCourses = []; // Lista de cursos permitidos para este admin
let currentViewedCourse = '';
let currentClaseTab = ''; // ID del curso en gestión de clases
let charts = {};
let notificationsListener = null;

// CARGA INICIAL (Refactorizada para RBAC)
async function loadStudentsFromFirebase() {
    try {
        // Mostrar sección de Super Admin si aplica
        if (adminSession.role === 'super-admin') {
            document.getElementById('superadmin-nav')?.classList.remove('hidden');
        }

        // Cargar Lista de Cursos Disponibles
        const coursesSnap = await db.collection('cursos').get();
        if (coursesSnap.empty && adminSession.role === 'super-admin') {
            // Auto-inicialización de cursos base si está vacío (Primer arranque v9.18)
            await db.collection('cursos').doc('habilidades').set({ nombre: "Habilidades Digitales & IA", materia: "Habilidades", activo: true });
            await db.collection('cursos').doc('programacion').set({ nombre: "Software & Videojuegos", materia: "Programacion", activo: true });
            return loadStudentsFromFirebase(); // Re-ejecutar con datos
        }

        activeCourses = coursesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Si es profesor, filtrar solo sus cursos asignados
        if (adminSession.role === 'profesor') {
            activeCourses = activeCourses.filter(c => (adminSession.cursos || []).includes(c.id));
        }

        // Renderizar elementos dinámicos
        renderSidebarCourses();
        renderDashboardStats();
        renderClaseTabs();
        renderForoTabs();
        renderEntregasTabs();
        renderImportSelectors();

        // Cargar datos de cada curso activo
        studentData = {};
        for (const curso of activeCourses) {
            const snap = await db.collection(`alumnos_${curso.id}`).get();
            studentData[curso.id] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            processAndClean(curso.id);
        }

        refreshCounters();
        if (!currentViewedCourse && activeCourses.length > 0) currentViewedCourse = activeCourses[0].id;

        updateDashboardView('global');
        if (currentViewedCourse) showTable(currentViewedCourse);
        initNotifications();
    } catch (err) {
        console.error("Error crítico carga inicial:", err);
    }
}

function renderSidebarCourses() {
    const container = document.getElementById('dynamic-courses-nav');
    if (!container) return;
    container.innerHTML = '';
    activeCourses.forEach(c => {
        const a = document.createElement('a');
        a.href = "#";
        a.className = "nav-link";
        a.dataset.section = c.id;
        a.innerHTML = `📓 <span class="nav-link-text" style="margin-left:10px;">${c.nombre}</span> <span id="count-${c.id}" class="badge">0</span>`;
        a.onclick = (e) => {
            e.preventDefault();
            switchCurrentCourse(c.id);
        };
        container.appendChild(a);
    });
}

function switchCurrentCourse(id) {
    currentViewedCourse = id;
    currentClaseTab = id;
    currentForoId = id;

    // Si estamos en una sección que depende del curso, refrescarla
    const activeNav = document.querySelector('.nav-link.active');
    const sec = activeNav ? activeNav.dataset.section : 'dashboard';

    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    const cursoLink = document.querySelector(`.nav-link[data-section="${id}"]`);
    if (cursoLink) cursoLink.classList.add('active');

    if (['dashboard', 'clases', 'foro', 'entregas'].includes(sec)) {
        // Mantener la sección pero para el nuevo curso
        showSection(sec);
    } else {
        showTable(id);
    }
}

function showSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.toggle('active', n.dataset.section === name));

    const sectionId = `${name}-section`;
    const el = document.getElementById(sectionId);
    if (el) el.classList.remove('hidden');

    if (name === 'clases') loadClasesAdmin();
    if (name === 'dashboard') updateDashboardView('global');
    if (name === 'foro') loadForoAdmin();
    if (name === 'entregas') loadPendingDeliveries(currentViewedCourse);
    if (name === 'gestion-cursos') loadCoursesManager();
    if (name === 'gestion-usuarios') loadUsersManager();
}

function renderDashboardStats() {
    const grid = document.getElementById('main-stats-grid');
    if (!grid) return;
    grid.innerHTML = `
        <div class="stat-card" onclick="updateDashboardView('global')">
            <span class="stat-value" id="stat-total-global">0</span>
            <span class="stat-label">Total Alumnos</span>
        </div>
    `;
    activeCourses.forEach(c => {
        const div = document.createElement('div');
        div.className = 'stat-card';
        div.onclick = () => {
            document.querySelectorAll('.nav-link').forEach(nl => nl.classList.remove('active'));
            const nl = document.querySelector(`.nav-link[data-section="${c.id}"]`);
            if (nl) nl.classList.add('active');
            showTable(c.id);
        };
        div.innerHTML = `
            <span class="stat-value" id="count-${c.id}">0</span>
            <span class="stat-label">${c.nombre}</span>
        `;
        grid.appendChild(div);
    });
}

function refreshCounters() {
    let total = 0;
    activeCourses.forEach(c => {
        const count = studentData[c.id]?.length || 0;
        total += count;
        const badge = document.getElementById(`count-${c.id}`);
        if (badge) badge.innerText = count;
    });
    if (document.getElementById('stat-total-global')) document.getElementById('stat-total-global').innerText = total;
}

function processAndClean(key) {
    if (!studentData[key]) return;
    const map = new Map();
    studentData[key].forEach(s => {
        s.edad = cleanAge(s.edad, s.nacimiento);
        if (!s.sexo || s.sexo.length < 1) s.sexo = guessGender(s.full_name);
        map.set(s.dni, s);
    });
    studentData[key] = Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
}

function cleanAge(ageRaw, birthRaw) {
    if (!ageRaw && !birthRaw) return '??';
    let age = parseInt(String(ageRaw || '').replace(/\D/g, ''));
    if (isNaN(age) || age < 10 || age > 95) {
        if (birthRaw) {
            try {
                let dateStr = String(birthRaw).trim().replace(/-/g, '/');
                let birthDate;
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    if (parts[2].length === 4) birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
                    else if (parts[0].length === 4) birthDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T12:00:00`);
                }
                if (!birthDate || isNaN(birthDate)) birthDate = new Date(dateStr);
                if (birthDate && !isNaN(birthDate)) {
                    let hoy = new Date();
                    age = hoy.getFullYear() - birthDate.getFullYear();
                    let m = hoy.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && hoy.getDate() < birthDate.getDate())) age--;
                }
            } catch (e) { }
        }
    }
    return (isNaN(age) || age < 10 || age > 95) ? '??' : age;
}

function guessGender(fullName) {
    if (!fullName) return 'M';
    const parts = fullName.split(',');
    const namePart = parts.length > 1 ? parts[1].trim() : parts[0].trim();
    const firstName = namePart.split(' ')[0].toUpperCase();
    const femaleNames = ['MARIA', 'ANA', 'ELENA', 'MARTA', 'LAURA', 'PAULA', 'LUCIA', 'SOFIA', 'JULIA', 'CARMEN', 'BELEN', 'MILAGROS', 'LOURDES', 'INES', 'ESTHER', 'ROSARIO', 'BEATRIZ', 'RAQUEL', 'VALENTINA', 'CONSTANZA', 'SABRINA', 'JAQUELINA', 'MARISOL', 'KARINA', 'MONICA', 'SILVIA', 'ANDREA', 'PATRICIA', 'ADRIANA', 'GRISELDA', 'CLAUDIA'];
    if (femaleNames.includes(firstName)) return 'F';
    if (firstName.endsWith('A') || firstName.endsWith('INA') || firstName.endsWith('ELA')) return 'F';
    return 'M';
}

// DASHBOARD
function updateDashboardView(type) {
    const title = document.getElementById('dashboard-view-title');
    if (!title) return;
    let data = [];
    if (type === 'global') {
        title.innerText = "Análisis Global de Matrícula";
        activeCourses.forEach(c => {
            data = [...data, ...(studentData[c.id] || [])];
        });
    } else {
        const curso = activeCourses.find(c => c.id === type);
        title.innerText = curso ? curso.nombre : "Análisis por Curso";
        data = studentData[type] || [];
    }
    renderCharts(data);
}

function renderCharts(all) {
    if (!all || all.length === 0) return;
    Object.values(charts).forEach(c => c.destroy());
    const opt = { responsive: true, maintainAspectRatio: false };

    const trabaja = all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length;
    charts.trabajo = new Chart(document.getElementById('chart-trabajo'), {
        type: 'pie',
        data: { labels: ['Trabaja', 'No Trabaja'], datasets: [{ data: [trabaja, all.length - trabaja], backgroundColor: ['#10b981', '#f1f5f9'] }] },
        options: opt
    });

    const eduLabels = ['SECUNDARIO', 'TERCIARIO', 'UNIVERSITARIO', 'PRIMARIO'];
    const eduValues = eduLabels.map(label => all.filter(s => (s.nivel_educativo || '').toUpperCase().includes(label)).length);
    charts.estudios = new Chart(document.getElementById('chart-estudios'), {
        type: 'bar',
        data: { labels: eduLabels, datasets: [{ label: 'Alumnos', data: eduValues, backgroundColor: '#00B9E8' }] },
        options: opt
    });

    const sexo = { M: all.filter(s => s.sexo === 'M').length, F: all.filter(s => s.sexo === 'F').length };
    charts.sexo = new Chart(document.getElementById('chart-sexo'), {
        type: 'doughnut',
        data: { labels: ['Masculino', 'Femenino'], datasets: [{ data: [sexo.M, sexo.F], backgroundColor: ['#1e293b', '#FF6384'] }] },
        options: opt
    });

    const ages = { '18-25': 0, '26-35': 0, '36-45': 0, '46+': 0, 'Erróneo': 0 };
    all.forEach(s => {
        let a = parseInt(s.edad);
        if (isNaN(a)) ages['Erróneo']++;
        else if (a <= 25) ages['18-25']++;
        else if (a <= 35) ages['26-35']++;
        else if (a <= 45) ages['36-45']++;
        else ages['46+']++;
    });
    charts.edades = new Chart(document.getElementById('chart-edades'), {
        type: 'bar',
        data: { labels: Object.keys(ages), datasets: [{ label: 'Alumnos', data: Object.values(ages), backgroundColor: '#1e293b' }] },
        options: opt
    });
}

// TABLAS DE ALUMNOS 
async function showTable(course) {
    currentViewedCourse = course;
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById('table-section').classList.remove('hidden');
    const courseObj = activeCourses.find(c => c.id === course);
    document.getElementById('current-course-title').innerText = courseObj ? courseObj.nombre : 'Cargando Curso...';

    const tbody = document.querySelector('#students-table tbody');
    tbody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';

    try {
        const configDoc = await db.collection('config_cursos').doc(course).get();
        const materiales = configDoc.exists ? (configDoc.data().materiales || {}) : {};
        const currWeeksCount = Object.keys(materiales).filter(k => k.startsWith('sem_')).length;

        const snapEnt = await db.collection('entregas').where('curso', '==', course).get();
        const entregas = snapEnt.docs.map(doc => doc.data());
        tbody.innerHTML = '';

        studentData[course].forEach(s => {
            const eAlu = entregas.filter(e => e.alumno_dni === s.dni);
            const corr = eAlu.filter(e => e.estado === 'Calificado');
            const pend = eAlu.filter(e => e.estado === 'Pendiente');
            const prom = corr.length > 0 ? (corr.reduce((a, b) => a + parseFloat(b.nota || 0), 0) / corr.length).toFixed(1) : '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${s.full_name}</td>
                <td>${s.dni}</td>
                <td>${s.telefono || '---'}</td>
                <td>${s.email}</td>
                <td style="text-align:center">${s.edad}</td>
                <td style="text-align:center">${corr.length} / ${currWeeksCount}</td>
                <td style="text-align:center"><strong>${prom}</strong></td>
                <td>
                    <div style="display:flex; gap:5px;">
                        <button class="btn-correct ${pend.length > 0 ? 'alert' : ''}" style="white-space:nowrap; flex-grow:1;" onclick="openCorrectionView('${s.dni}', '${s.full_name}')">
                            ${pend.length > 0 ? '🔔 CORREGIR' : '📂 ENTREGAS'}
                        </button>
                        <button class="btn-primary-sm" onclick="openStudentModal('${s.dni}')" style="background:#f1f5f9; border-color:#e2e8f0; color:#1e293b; padding:0 10px;">✏️</button>
                        <button class="btn-icon" onclick="deleteStudent('${course}', '${s.dni}')">🗑️</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) { console.error(err); }
}

// GESTIÓN MANUAL DE ALUMNOS
let editingDni = null;
async function openStudentModal(dni = null) {
    editingDni = dni;
    const modal = document.getElementById('student-modal');
    const title = document.getElementById('student-modal-title');

    // Limpiar campos
    document.getElementById('stu-name').value = '';
    document.getElementById('stu-dni').value = '';
    document.getElementById('stu-email').value = '';
    document.getElementById('stu-tel').value = '';
    document.getElementById('stu-age').value = '';
    document.getElementById('stu-dni').disabled = false; // Enable DNI input by default

    if (dni) {
        title.innerText = "Editar Alumno";
        const student = studentData[currentViewedCourse].find(s => s.dni === dni);
        if (student) {
            document.getElementById('stu-name').value = student.full_name || '';
            document.getElementById('stu-dni').value = student.dni || '';
            document.getElementById('stu-email').value = student.email || '';
            document.getElementById('stu-tel').value = student.telefono || '';
            document.getElementById('stu-age').value = student.edad || '';
            document.getElementById('stu-dni').disabled = true; // No permitir cambiar DNI al editar
        }
    } else {
        title.innerText = "Agregar Alumno";
    }

    modal.classList.remove('hidden');
}

function closeStudentModal() {
    document.getElementById('student-modal').classList.add('hidden');
}

async function saveStudent() {
    const name = document.getElementById('stu-name').value.trim();
    const dni = document.getElementById('stu-dni').value.trim();
    const email = document.getElementById('stu-email').value.trim();
    const tel = document.getElementById('stu-tel').value.trim();
    const age = document.getElementById('stu-age').value.trim();

    if (!name || !dni || !email) return alert("Por favor, completa los campos obligatorios (Nombre, DNI, Email).");

    try {
        const coll = `alumnos_${currentViewedCourse}`;
        const data = {
            full_name: name.toUpperCase(),
            dni: dni,
            email: email,
            telefono: tel,
            edad: age,
            password: dni.slice(-4) // Password por defecto los últimos 4 del DNI
        };

        if (editingDni) {
            // Actualizar
            await db.collection(coll).doc(dni).update(data);
            alert("✅ Alumno actualizado.");
        } else {
            // Crear nuevo
            // Verificar si ya existe
            const check = await db.collection(coll).doc(dni).get();
            if (check.exists) return alert("El alumno con ese DNI ya existe.");

            await db.collection(coll).doc(dni).set(data);
            alert("🚀 Alumno agregado con éxito.");
        }

        closeStudentModal();
        loadStudentsFromFirebase();
    } catch (e) {
        alert("Error al guardar: " + e.message);
    }
}

// EXPORTAR A EXCEL
async function downloadCourseExcel() {
    if (!currentViewedCourse) return;

    try {
        const configDoc = await db.collection('config_cursos').doc(currentViewedCourse).get();
        const materiales = configDoc.exists ? (configDoc.data().materiales || {}) : {};
        const weeksCount = Object.keys(materiales).filter(k => k.startsWith('sem_')).length;

        const snapEnt = await db.collection('entregas').where('curso', '==', currentViewedCourse).get();
        const entregas = snapEnt.docs.map(doc => doc.data());

        const excelData = studentData[currentViewedCourse].map(s => {
            const eAlu = entregas.filter(e => e.alumno_dni === s.dni);
            const corr = eAlu.filter(e => e.estado === 'Calificado');
            const prom = corr.length > 0 ? (corr.reduce((a, b) => a + parseFloat(b.nota || 0), 0) / corr.length).toFixed(1) : '---';

            return {
                "ALUMNO": s.full_name,
                "DNI": s.dni,
                "EMAIL": s.email,
                "TELÉFONO": s.telefono || '---',
                "EDAD": s.edad,
                "ENTREGAS": `${corr.length} / ${weeksCount}`,
                "PROMEDIO": prom
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Alumnos");

        const fileName = `${currentViewedCourse.toUpperCase()}_ALUMNOS_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(workbook, fileName);

    } catch (e) {
        alert("Error al exportar: " + e.message);
    }
}

let currentCorrectionData = { dni: '', name: '', docId: '', week: '' };

async function openCorrectionView(dni, name) {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById('correction-section').classList.remove('hidden');

    document.getElementById('correction-student-name').innerText = name;
    const courseObj = activeCourses.find(c => c.id === currentViewedCourse);
    document.getElementById('correction-course-name').innerText = courseObj ? `Curso: ${courseObj.nombre}` : 'Curso: Desconocido';

    const listCont = document.getElementById('correction-activities-list');
    listCont.innerHTML = '<p style="font-size:0.8rem; color:#64748b;">Cargando entregas...</p>';

    // Reset viewer
    document.getElementById('correction-pdf-viewer').src = "about:blank";
    document.getElementById('correction-viewer-placeholder').classList.remove('hidden');
    document.getElementById('grading-panel-root').classList.add('hidden');
    currentCorrectionData.dni = dni; // Guardar DNI para refrescos

    try {
        const snap = await db.collection('entregas')
            .where('alumno_dni', '==', dni)
            .where('curso', '==', currentViewedCourse)
            .get();

        const docs = snap.docs.sort((a, b) => b.data().semana - a.data().semana);
        listCont.innerHTML = docs.length === 0 ? '<p style="font-size:0.8rem; color:#64748b;">Sin entregas aún.</p>' : '';

        docs.forEach(doc => {
            const data = doc.data();
            const btn = document.createElement('button');
            btn.className = 'btn-activity';

            let statusText = '⌛ Pendiente';
            if (data.estado === 'Calificado') {
                const notaNum = parseFloat(data.nota);
                statusText = `Calificado: ${notaNum} ${notaNum >= 70 ? '✅' : '❌'}`;
            }

            btn.innerHTML = `
                <strong style="font-size:0.95rem;">Actividad ${data.semana}</strong>
                <small style="color: ${data.estado === 'Calificado' ? (parseFloat(data.nota) >= 70 ? '#10b981' : '#ef4444') : '#64748b'}">${statusText}</small>
            `;
            btn.onclick = () => {
                document.querySelectorAll('.btn-activity').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                visualizeStudentTask(data.archivo_url || data.file_url, data.semana, doc.id, data.nota, data.devolucion);
            };
            listCont.appendChild(btn);
        });
    } catch (e) {
        listCont.innerHTML = '<p style="color:#ef4444;">Error al cargar.</p>';
    }
}

function visualizeStudentTask(url, sem, docId, grade, feedback) {
    const viewer = document.getElementById('correction-pdf-viewer');
    const placeholder = document.getElementById('correction-viewer-placeholder');
    const gradingPanel = document.getElementById('grading-panel-root');
    const gradeInput = document.getElementById('input-grade-val');
    const feedbackInput = document.getElementById('input-feedback-val');

    placeholder.classList.add('hidden');
    gradingPanel.classList.remove('hidden');
    gradeInput.value = grade || '';
    if (feedbackInput) feedbackInput.value = feedback || '';

    currentCorrectionData.docId = docId;
    currentCorrectionData.week = sem;

    let finalUrl = url;
    if (url.includes('drive.google.com')) {
        const idMatch = url.match(/\/d\/(.+?)(\/|$)/) || url.match(/id=(.+?)(&|$)/);
        if (idMatch) finalUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview?view=fitH`;
    }
    viewer.src = finalUrl;
}

async function saveCorrectionGrade() {
    const gradeVal = document.getElementById('input-grade-val').value;
    const feedbackVal = document.getElementById('input-feedback-val')?.value || '';
    const grade = parseInt(gradeVal);

    if (isNaN(grade) || grade < 0 || grade > 100) {
        return alert("Por favor, ingresa una nota válida entre 0 y 100.");
    }

    try {
        await db.collection('entregas').doc(currentCorrectionData.docId).update({
            nota: grade,
            devolucion: feedbackVal,
            estado: 'Calificado',
            fecha_calificacion: new Date().toISOString()
        });

        alert(grade >= 70 ? "🚀 Actividad Aprobada (" + grade + ")" : "⚠️ Nota guardada (" + grade + ").");

        // Refrescar sidebar para mostrar el cambio
        const studentName = document.getElementById('correction-student-name').innerText;
        openCorrectionView(currentCorrectionData.dni || '', studentName);
    } catch (e) {
        alert("Error al guardar: " + e.message);
    }
}

function backToTable() {
    document.getElementById('correction-section').classList.add('hidden');
    document.getElementById('table-section').classList.remove('hidden');
    // Forzamos actualización por si se cambiaron notas
    if (currentViewedCourse) showTable(currentViewedCourse);
}

async function deleteStudent(course, dni) {
    if (!confirm("¿Eliminar alumno?")) return;
    const coll = `alumnos_${course}`;
    await db.collection(coll).doc(dni).delete();
    await loadStudentsFromFirebase();
}

// CRONOGRAMA v6.9.0 (DISEÑO PULIDO + ORDEN INVERSO)
// GESTIÓN DE CLASES
function loadClasesAdmin() {
    const tabsContainer = document.getElementById('clase-tabs-dynamic');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    activeCourses.forEach(c => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${currentClaseTab === c.id ? 'active' : ''}`;
        btn.innerText = c.nombre;
        btn.onclick = () => {
            currentClaseTab = c.id;
            renderClaseTabs(); // Usar la nueva función de renderizado
            loadClaseConfig(c.id);
        };
        tabsContainer.appendChild(btn);
    });

    if (!currentClaseTab && activeCourses.length > 0) {
        currentClaseTab = activeCourses[0].id;
    }
    if (currentClaseTab) {
        loadClaseConfig(currentClaseTab);
    } else {
        document.getElementById('clases-list-container').innerHTML = '<p style="text-align:center; padding:20px;">No hay cursos disponibles para gestionar.</p>';
    }
}

async function loadClaseConfig(courseId) {
    const cont = document.getElementById('clases-list-container');
    if (!cont) return;
    cont.innerHTML = '<p class="loader" style="text-align:center; padding:20px;">⌛ Sincronizando materiales...</p>';

    try {
        const doc = await db.collection('config_cursos').doc(courseId).get();
        const data = doc.exists ? doc.data() : { materiales: {} };
        let materiales = {};
        if (data.materials) Object.assign(materiales, data.materials);
        if (data.materiales) Object.assign(materiales, data.materiales);

        const courseObj = activeCourses.find(c => c.id === courseId);
        const badgeColor = courseObj?.color || '#1e293b'; // Usar color del curso si existe
        cont.innerHTML = `<h3 style="margin-bottom:15px; text-align:center; font-size:1.1rem;">Cronograma de Contenidos <span style="background:${badgeColor}; color:white; padding:4px 10px; border-radius:10px; font-size:0.75rem; vertical-align:middle;">${courseObj?.nombre.toUpperCase() || 'CURSO'}</span></h3>`;

        // Botón agregar compacto
        const addBtn = document.createElement('button');
        addBtn.innerText = "➕ Agregar Nueva Semana (Se verá arriba)";
        addBtn.className = "btn-secondary";
        addBtn.style = "width:100%; margin-bottom:20px; padding:10px; border:2px dashed #00B9E8; color:#00B9E8; font-weight:700; border-radius:10px; background:rgba(0,185,232,0.01); font-size:0.8rem;";
        addBtn.onclick = async () => {
            let maxWeek = 0;
            Object.keys(materiales).forEach(k => { if (k.startsWith('sem_')) { const n = parseInt(k.replace('sem_', '')); if (n > maxWeek) maxWeek = n; } });
            const next = maxWeek + 1;
            const ref = db.collection('config_cursos').doc(currentClaseTab);
            let updated = { ...materiales };
            updated[`sem_${next}`] = { clase: '', actividad: '', fecha: '' };
            await ref.update({ materiales: updated });
            loadClaseConfig(currentClaseTab);
        };
        cont.appendChild(addBtn);

        // LISTA DE SEMANAS EN ORDEN INVERSO (5, 4, 3, 2, 1)
        let weeksArr = Object.keys(materiales)
            .filter(k => k.startsWith('sem_'))
            .map(k => parseInt(k.replace('sem_', '')))
            .sort((a, b) => b - a);

        weeksArr.forEach(i => {
            if ((data.excepciones || []).includes(i)) return;
            const mat = materiales[`sem_${i}`] || { clase: '', actividad: '', fecha: '' };
            const div = document.createElement('div');
            div.className = 'clase-item-row card';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #f1f5f9; padding-bottom:10px; margin-bottom:15px;">
                    <strong style="font-size:1rem; color:#1e293b;">Semana ${i}</strong>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Abrir el:</span>
                        <input type="date" id="date-sem-${i}" value="${mat.fecha || ''}" class="input-premium" style="width:140px;">
                        <button class="btn-icon" onclick="deleteWeek(${i})" title="Borrar semana" style="background:#fee2e2; color:#ef4444; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">🗑️</button>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                    <div class="field-group">
                        <label>📖 Clase (Link o PDF)</label>
                        <div style="display:flex; gap:6px;">
                            <input type="text" id="link-clase-${i}" value="${mat.clase || ''}" placeholder="Link Drive..." class="input-premium" style="flex-grow:1;">
                            <button class="btn-primary-sm" onclick="manualUpload('clase', ${i})" style="padding:0 10px; min-width:38px;">📁</button>
                        </div>
                        ${mat.clase ? `<small style="margin-top:4px;"><a href="${mat.clase}" target="_blank" style="color:#00B9E8; font-size:0.75rem; font-weight:700;">🔗 Ver Clase</a></small>` : ''}
                    </div>
                    <div class="field-group">
                        <label>🛠️ Actividad (Link o PDF)</label>
                        <div style="display:flex; gap:6px;">
                            <input type="text" id="link-act-${i}" value="${mat.actividad || ''}" placeholder="Link Drive..." class="input-premium" style="flex-grow:1;">
                            <button class="btn-primary-sm" onclick="manualUpload('actividad', ${i})" style="padding:0 10px; min-width:38px;">📁</button>
                        </div>
                        ${mat.actividad ? `<small style="margin-top:4px;"><a href="${mat.actividad}" target="_blank" style="color:#00B9E8; font-size:0.75rem; font-weight:700;">🔗 Ver Actividad</a></small>` : ''}
                    </div>
                </div>
                <button class="btn-primary btn-save-week" onclick="saveLinksManual(${i})" style="margin-top:15px; width:100%; border-radius:8px; font-weight:800; background:#1e293b;">💾 GUARDAR SEMANA ${i}</button>
            `;
            cont.appendChild(div);
        });

        // MATERIALES DE INICIO AL FINAL
        const matInicio = materiales['inicio'] || { welcome: data.welcome_url || '', syllabus: data.syllabus_url || '', fecha: data.fecha_inicio || '' };
        const divInicio = document.createElement('div');
        divInicio.className = 'clase-item-row card';
        divInicio.style = "margin-top:30px; padding:20px; border:2px solid #10b981; border-radius:15px; background:rgba(16,185,129,0.02);";
        divInicio.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom: 1px solid rgba(16,185,129,0.1); padding-bottom:10px;">
                <strong style="font-size:1rem; color:#059669;">📚 Materiales de Inicio (Bienvenida y Programa)</strong>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:0.75rem; font-weight:700; color:#059669;">Liberar el:</span>
                    <input type="date" id="date-inicio" value="${matInicio.fecha || ''}" class="input-premium" style="width:140px; border-color:#10b981;">
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <div class="field-group">
                    <label style="color:#059669;">👋 Mensaje de Bienvenida</label>
                    <div style="display:flex; gap:6px;">
                        <input type="text" id="link-welcome" value="${matInicio.welcome || ''}" placeholder="Link o subida..." class="input-premium" style="flex-grow:1; border-color:#10b981;">
                        <button class="btn-primary-sm" onclick="manualUpload('welcome', 'inicio')" style="border-color:#10b981; color:#059669; padding:0 10px;">📁</button>
                    </div>
                    ${matInicio.welcome ? `<small style="margin-top:4px;"><a href="${matInicio.welcome}" target="_blank" style="color:#059669; font-size:0.75rem; font-weight:700;">🔗 Ver Bienvenida</a></small>` : ''}
                </div>
                <div class="field-group">
                    <label style="color:#059669;">📋 Programa Académico</label>
                    <div style="display:flex; gap:6px;">
                        <input type="text" id="link-syllabus" value="${matInicio.syllabus || ''}" placeholder="Link o subida..." class="input-premium" style="flex-grow:1; border-color:#10b981;">
                        <button class="btn-primary-sm" onclick="manualUpload('syllabus', 'inicio')" style="border-color:#10b981; color:#059669; padding:0 10px;">📁</button>
                    </div>
                    ${matInicio.syllabus ? `<small style="margin-top:4px;"><a href="${matInicio.syllabus}" target="_blank" style="color:#059669; font-size:0.75rem; font-weight:700;">🔗 Ver Programa</a></small>` : ''}
                </div>
            </div>
            <button class="btn-primary" onclick="saveInicioManual()" style="margin-top:15px; width:100%; padding:10px; background:#10b981; color:white; border-radius:10px; font-weight:800; border:none; font-size:0.8rem;">💾 GUARDAR MATERIALES DE INICIO</button>
        `;
        cont.appendChild(divInicio);

    } catch (e) { console.error(e); }
}

async function saveInicioManual() {
    const welcome = document.getElementById('link-welcome').value.trim();
    const syllabus = document.getElementById('link-syllabus').value.trim();
    const fecha = document.getElementById('date-inicio').value;
    try {
        const ref = db.collection('config_cursos').doc(currentClaseTab);
        await ref.set({
            welcome_url: welcome,
            syllabus_url: syllabus,
            fecha_inicio: fecha,
            materiales: { inicio: { welcome, syllabus, fecha } }
        }, { merge: true });
        alert("✅ Datos de inicio guardados.");
        loadClaseConfig(currentClaseTab);
    } catch (err) { alert("Error: " + err.message); }
}

async function saveLinksManual(sem) {
    const claseLink = document.getElementById(`link-clase-${sem}`).value.trim();
    const actLink = document.getElementById(`link-act-${sem}`).value.trim();
    const fecha = document.getElementById(`date-sem-${sem}`).value;
    try {
        const ref = db.collection('config_cursos').doc(currentClaseTab);
        const update = {};
        update[`materiales.sem_${sem}`] = { clase: claseLink, actividad: actLink, fecha: fecha };
        await ref.update(update);
        alert(`✅ Semana ${sem} guardada.`);
        loadClaseConfig(currentClaseTab);
    } catch (err) { alert("Error al guardar: " + err.message); }
}

async function manualUpload(type, identifier) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            alert("🚀 Subiendo archivo... espera confirmación.");
            const ref = storage.ref().child(`materiales/${currentClaseTab}/${Date.now()}_${file.name}`);
            await ref.put(file);
            const url = await ref.getDownloadURL();

            const docRef = db.collection('config_cursos').doc(currentClaseTab);
            if (identifier === 'inicio') {
                if (type === 'welcome') await docRef.update({ "materiales.inicio.welcome": url, welcome_url: url });
                else await docRef.update({ "materiales.inicio.syllabus": url, syllabus_url: url });
            } else {
                const up = {};
                up[`materiales.sem_${identifier}.${type}`] = url;
                await docRef.update(up);
            }
            alert("✅ ¡Archivo vinculado!");
            loadClaseConfig(currentClaseTab);
        } catch (err) { alert("Error en subida: " + err.message); }
    };
    input.click();
}

async function deleteWeek(num) {
    if (!confirm(`¿Borrar Semana ${num}?`)) return;
    try {
        const ref = db.collection('config_cursos').doc(currentClaseTab);
        const doc = await ref.get();
        let mats = doc.data().materiales;
        delete mats[`sem_${num}`];
        await ref.update({ materiales: mats });
        loadClasesAdmin();
    } catch (e) { }
}

function initNotifications() {
    // Limpiar listener anterior si existe para evitar que se "cuelgue" la interfaz
    if (notificationsListener) {
        notificationsListener();
        notificationsListener = null;
    }
    notificationsListener = db.collection('entregas').where('estado', '==', 'Pendiente').onSnapshot(snap => {
        const b = document.getElementById('notif-count');
        if (b) {
            if (snap.size > 0) {
                b.innerText = snap.size;
                b.classList.remove('hidden');
            } else {
                b.classList.add('hidden');
            }
        }
    }, err => {
        console.error("Error en listener de notificaciones:", err);
    });
}
function closeGradeModal() { document.getElementById('grade-modal').classList.add('hidden'); }
async function viewWorks(dni) {
    const modal = document.getElementById('grade-modal');
    const listCont = document.getElementById('student-works-list');
    modal.classList.remove('hidden');
    listCont.innerHTML = '<p style="text-align:center;">⌛ Consultando entregas...</p>';
    try {
        const snap = await db.collection('entregas').where('alumno_dni', '==', dni).get();
        listCont.innerHTML = snap.size === 0 ? '<p style="text-align:center; color:#64748b;">No hay entregas registradas para este alumno.</p>' : '';

        // Ordenar por semana descendente
        const docs = snap.docs.sort((a, b) => b.data().semana - a.data().semana);

        docs.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'work-item card';
            div.style = `background:#f8fafc; padding:15px; border-radius:12px; margin-bottom:15px; border:1px solid #e2e8f0; border-left: 5px solid ${data.estado === 'Calificado' ? '#10b981' : '#f59e0b'};`;
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div>
                        <strong style="font-size:1rem;">Semana ${data.semana}</strong>
                        <p style="font-size:0.75rem; color:#64748b; margin:0;">${new Date(data.fecha_entrega).toLocaleDateString('es-AR')} ${new Date(data.fecha_entrega).toLocaleTimeString('es-AR')}</p>
                    </div>
                    <a href="${data.archivo_url || data.file_url}" target="_blank" class="btn-primary-sm" 
                       style="text-decoration:none; padding: 6px 12px; background:#1e293b; color:white; border-radius:8px; font-weight:700; font-size:0.75rem;">
                       📂 ABRIR EN DRIVE
                    </a>
                </div>
                <div style="padding-top:10px; border-top:1px solid #e2e8f0; display:flex; gap:12px; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:0.8rem; font-weight:700;">Nota:</span>
                        <input type="number" id="nota-${doc.id}" value="${data.nota || ''}" min="1" max="10"
                               style="width:55px; padding:6px; border-radius:8px; border:1px solid #cbd5e1; font-weight:800; text-align:center;">
                    </div>
                    <button class="btn-primary-sm" onclick="saveGrade('${doc.id}')" 
                            style="padding:6px 15px; background:#00B9E8; border:none; color:white; border-radius:8px; font-weight:800; cursor:pointer;">
                        CALIFICAR
                    </button>
                    <span style="font-size:1.2rem;">${data.estado === 'Calificado' ? '✅' : '⏳'}</span>
                </div>
            `;
            listCont.appendChild(div);
        });
    } catch (e) { listCont.innerHTML = 'Error al cargar trabajos.'; }
}

async function saveGrade(id) {
    const notaInput = document.getElementById(`nota-${id}`);
    const nota = notaInput.value;
    if (!nota) return alert("Por favor, ingresa una calificación.");

    try {
        await db.collection('entregas').doc(id).update({
            nota: nota,
            estado: 'Calificado'
        });
        alert("✅ Trabajo calificado correctamente.");
        // Refrescar modal
        const snap = await db.collection('entregas').doc(id).get();
        if (snap.exists) viewWorks(snap.data().alumno_dni);
        // Refrescar tabla de fondo si está visible
        if (currentViewedCourse) showTable(currentViewedCourse);
    } catch (e) {
        alert("Error al guardar nota: " + e.message);
    }
}

// GESTIÓN DE DATOS (EXCEL Y VACIADO)
async function processExcel(file, type) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            const trans = json.map(r => {
                const getVal = (patterns) => {
                    const key = Object.keys(r).find(k => patterns.some(p => k.toUpperCase().includes(p.toUpperCase())));
                    return key ? r[key] : '';
                };
                const rawDni = String(getVal(['DOCUMENTO', 'DNI', 'D.N.I']) || '').trim();
                const cleanDniImport = rawDni.replace(/\./g, '').replace(/-/g, '');

                return {
                    dni: cleanDniImport,
                    email: String(getVal(['EMAIL', 'CORREO']) || '').trim(),
                    full_name: `${getVal(['APELLIDO']) || ''}, ${getVal(['NOMBRE']) || ''}`.toUpperCase().trim() || String(getVal(['NOMBRE Y APELLIDO', 'ALUMNO']) || '').toUpperCase().trim(),
                    telefono: String(getVal(['TELÉFONO', 'CELULAR', 'TELEFONO']) || '').trim(),
                    nivel_educativo: String(getVal(['NIVEL EDUCATIVO', 'ESTUDIOS']) || '').trim(),
                    trabajo_actual: String(getVal(['TRABAJO ACTUAL', 'OCUPACIÓN']) || '').trim(),
                    busca_trabajo: String(getVal(['BUSCA TRABAJO']) || '').trim(),
                    sexo: String(getVal(['SEXO', 'GÉNERO']) || '').trim(),
                    edad: String(getVal(['EDAD', 'AÑOS']) || '').trim(),
                    nacimiento: String(getVal(['NACIMIENTO', 'FECHA DE NACIMIENTO']) || '').trim(),
                    password: cleanDniImport // Password inicial normalizada
                };
            }).filter(s => s.dni.length > 5);

            if (trans.length === 0) return alert("❌ No se encontraron datos válidos en el Excel.");

            const batch = db.batch();
            const coll = `alumnos_${type}`;
            trans.forEach(s => batch.set(db.collection(coll).doc(s.dni), s));

            alert("🚀 Procesando " + trans.length + " alumnos... espera confirmación.");
            await batch.commit();
            alert("✅ ¡Importación de " + trans.length + " alumnos exitosa!");
            loadStudentsFromFirebase();
        } catch (err) { alert("Error al procesar: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
}

async function deleteCourseData() {
    if (!currentViewedCourse) return alert("Selecciona un curso primero.");
    if (!confirm(`⚠️ ALERTA EXTREMA: ¿Estás SEGURO de vaciar TODA la lista de ${currentViewedCourse.toUpperCase()}?\n\nEsto borrará:\n1. Todos los alumnos de este curso.\n2. Todas las entregas, notas y devoluciones subidas.\n\nEsta acción NO se puede deshacer.`)) return;

    try {
        const coll = `alumnos_${currentViewedCourse}`;
        // 1. Borrar Alumnos
        const snapAlumnos = await db.collection(coll).get();
        const batch = db.batch();
        snapAlumnos.docs.forEach(doc => batch.delete(doc.ref));

        // 2. Borrar Entregas correspondientes
        const snapEntregas = await db.collection('entregas').where('curso', '==', currentViewedCourse).get();
        snapEntregas.docs.forEach(doc => batch.delete(doc.ref));

        await batch.commit();

        alert(`🗑️ Lista y entregas de ${currentViewedCourse} eliminadas.`);
        await loadStudentsFromFirebase();
        showTable(currentViewedCourse);
    } catch (err) { alert("Error al vaciar: " + err.message); }
}

async function resetDeliveriesOnly() {
    if (!currentViewedCourse) return alert("Selecciona un curso primero.");
    if (!confirm(`⚠️ ¿Seguro que quieres borrar TODAS las entregas y notas del curso ${currentViewedCourse.toUpperCase()}?\n\nLos alumnos permanecerán en la lista, pero sus trabajos y calificaciones se eliminarán para que puedan empezar de nuevo.`)) return;

    try {
        const snap = await db.collection('entregas').where('curso', '==', currentViewedCourse).get();
        if (snap.empty) return alert("No hay entregas para reiniciar en este curso.");

        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        alert("✅ Todas las entregas y notas han sido reiniciadas.");
        showTable(currentViewedCourse);
    } catch (err) { alert("Error al reiniciar entregas: " + err.message); }
}

// UI HANDLERS
// Reemplazar event listeners estáticos con soporte dinámico
document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('admin_session');
    authFirebase.signOut().then(() => window.location.href = 'index.html');
});

document.querySelectorAll('.nav-link').forEach(l => {
    l.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = l.dataset.section;
        if (sec) showSection(sec);
    });
});

// FORO / MURO DE CONSULTAS - LÓGICA ADMIN
let currentForoId = '';
let foroUnsubscribe = null;
let replyToAdmin = null;

// TABS DINÁMICOS
function renderClaseTabs() {
    const cont = document.getElementById('clase-tabs-dynamic');
    if (!cont) return;
    cont.innerHTML = '';
    activeCourses.forEach(c => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${currentClaseTab === c.id ? 'active' : ''}`;
        btn.innerText = c.nombre;
        btn.onclick = () => switchClaseType(c.id);
        cont.appendChild(btn);
    });
}

function renderForoTabs() {
    const cont = document.getElementById('foro-tabs-dynamic');
    if (!cont) return;
    cont.innerHTML = '';
    activeCourses.forEach(c => {
        const btn = document.createElement('button');
        btn.className = `tab-btn-foro ${currentForoId === c.id ? 'active' : ''}`;
        btn.innerText = c.nombre;
        btn.onclick = () => switchForoType(c.id);
        cont.appendChild(btn);
    });
}

function renderEntregasTabs() {
    const cont = document.getElementById('entregas-tabs-dynamic');
    if (!cont) return;
    cont.innerHTML = '';
    activeCourses.forEach(c => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${currentViewedCourse === c.id ? 'active' : ''}`;
        btn.innerText = c.nombre;
        btn.onclick = () => {
            currentViewedCourse = c.id;
            renderEntregasTabs();
            loadPendingDeliveries(c.id);
        };
        cont.appendChild(btn);
    });
}

function renderImportSelectors() {
    const cont = document.getElementById('import-selectors');
    if (!cont) return;
    cont.innerHTML = '';
    activeCourses.forEach(c => {
        const item = document.createElement('div');
        item.className = 'upload-item';
        item.innerHTML = `
            <label>💾 ${c.nombre}</label>
            <input type="file" onchange="processExcel(this.files[0], '${c.id}')" accept=".xlsx, .xls" style="font-size: 0.8rem;">
        `;
        cont.appendChild(item);
    });
}

async function loadPendingDeliveries(courseId) {
    const body = document.getElementById('pending-deliveries-body');
    body.innerHTML = '<tr><td colspan="5">Cargando entregas...</td></tr>';

    try {
        const snap = await db.collection('entregas')
            .where('curso', '==', courseId)
            .where('estado', '==', 'Pendiente')
            .get();

        body.innerHTML = snap.empty ? '<tr><td colspan="5" style="text-align:center;">No hay entregas pendientes para este curso.</td></tr>' : '';

        snap.forEach(doc => {
            const d = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${d.alumno_nombre || 'Alumno'}</strong><br><small>${d.alumno_dni}</small></td>
                <td>Semana ${d.semana}</td>
                <td>${new Date(d.fecha).toLocaleDateString()}</td>
                <td><span class="badge warning">PENDIENTE</span></td>
                <td><button class="btn-primary-sm" onclick="openCorrectionView('${d.alumno_dni}', '${d.alumno_nombre}')">Corregir</button></td>
            `;
            body.appendChild(tr);
        });
    } catch (e) { body.innerHTML = 'Error al cargar.'; }
}

function switchForoType(type) {
    currentForoId = type;
    const curso = activeCourses.find(c => c.id === type);
    if (document.getElementById('foro-title-admin')) {
        document.getElementById('foro-title-admin').innerText = `FORO: ${curso ? curso.nombre : type}`;
    }
    renderForoTabs();
    loadForoAdmin();
}

function switchClaseType(type) {
    currentClaseTab = type;
    renderClaseTabs();
    loadClasesAdmin();
}

function loadForoAdmin() {
    if (foroUnsubscribe) foroUnsubscribe();

    const tabsContainer = document.getElementById('foro-tabs-dynamic');
    if (tabsContainer) {
        tabsContainer.innerHTML = '';
        activeCourses.forEach(c => {
            const btn = document.createElement('button');
            btn.className = `tab-btn-foro ${currentForoId === c.id ? 'active' : ''}`;
            btn.innerText = c.nombre;
            btn.onclick = () => switchForoType(c.id);
            tabsContainer.appendChild(btn);
        });
    }

    if (!currentForoId && activeCourses.length > 0) currentForoId = activeCourses[0].id;

    const container = document.getElementById('foro-admin-container');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center; padding:20px;">Sincronizando muro...</p>';

    foroUnsubscribe = db.collection('foro_mensajes')
        .where('curso_id', '==', currentForoId)
        .onSnapshot(snap => {
            container.innerHTML = '';
            if (snap.empty) {
                container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px;">No hay mensajes en este muro aún.</p>';
                return;
            }

            // Ordenar en JS para evitar problemas de índices de Firebase
            let msgs = [];
            snap.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
            msgs.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            msgs.forEach(msg => {
                const div = document.createElement('div');
                div.className = `msg-bubble ${msg.is_admin ? 'msg-admin' : 'msg-student'}`;

                div.innerHTML = `
                    <div class="msg-header">
                        <span class="msg-author">${msg.is_admin ? '⭐ DOCENTE' : (msg.alumno_nombre || 'Alumno')}</span>
                        <span class="msg-time">${new Date(msg.fecha).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                    </div>
                    ${msg.respuesta_a ? `
                        <div class="quote-box">
                            <strong>${msg.respuesta_a.name || msg.respuesta_a.nombre}:</strong> "${msg.respuesta_a.mensaje.slice(0, 50)}..."
                        </div>
                    ` : ''}
                    <div class="msg-content">${msg.mensaje}</div>
                    <div class="msg-actions">
                        <button class="btn-msg-action" onclick="replyToMessageAdmin('${msg.id}', '${msg.is_admin ? 'Docente' : (msg.alumno_nombre || 'Alumno')}', '${msg.mensaje}')">🔄 Responder</button>
                        <button class="btn-msg-action delete" onclick="deleteMessageAdmin('${msg.id}')">🗑️ Borrar</button>
                    </div>
                `;
                container.appendChild(div);
            });
            container.scrollTop = container.scrollHeight;
        });
}

function replyToMessageAdmin(id, name, text) {
    replyToAdmin = { id, name, mensaje: text };
    const preview = document.getElementById('reply-preview-admin');
    const nameSpan = document.getElementById('reply-to-name-admin');
    nameSpan.innerText = name;
    preview.classList.remove('hidden');
    document.getElementById('foro-input-admin').focus();
}

function cancelReplyAdmin() {
    replyToAdmin = null;
    document.getElementById('reply-preview-admin').classList.add('hidden');
}

async function sendMessageAdmin() {
    const input = document.getElementById('foro-input-admin');
    const msg = input.value.trim();
    if (!msg) return;

    try {
        await db.collection('foro_mensajes').add({
            curso_id: currentForoId,
            mensaje: msg,
            fecha: new Date().toISOString(),
            is_admin: true,
            respuesta_a: replyToAdmin,
            alumno_dni: 'admin'
        });
        input.value = '';
        cancelReplyAdmin();
    } catch (e) { alert("Error al enviar: " + e.message); }
}

async function deleteMessageAdmin(id) {
    if (confirm("¿Seguro que quieres borrar este mensaje del muro?")) {
        await db.collection('foro_mensajes').doc(id).delete();
    }
}


// GESTIÓN DE USUARIOS Y CURSOS (v9.18.0)
function openCreateUserModal() {
    document.getElementById('adm-email').value = '';
    document.getElementById('adm-name').value = '';
    document.getElementById('adm-cursos').value = '';
    document.getElementById('user-modal').classList.remove('hidden');
}
function closeUserModal() { document.getElementById('user-modal').classList.add('hidden'); }
function openCreateCourseModal() {
    document.getElementById('crs-id').value = '';
    document.getElementById('crs-name').value = '';
    document.getElementById('course-modal').classList.remove('hidden');
}
function closeCourseModal() { document.getElementById('course-modal').classList.add('hidden'); }

async function saveAdminUser() {
    const email = document.getElementById('adm-email').value.trim().toLowerCase();
    const nombre = document.getElementById('adm-name').value.trim();
    const role = document.getElementById('adm-role').value;
    const cursosRaw = document.getElementById('adm-cursos').value.trim();
    const cursos = cursosRaw ? cursosRaw.split(',').map(c => c.trim()) : [];

    if (!email || !nombre) return alert("Completa los campos obligatorios.");

    try {
        await db.collection('usuarios_auth').doc(email).set({ nombre, role, cursos });
        alert("✅ Usuario administrador guardado.");
        closeUserModal();
        loadUsersManager();
    } catch (e) { alert("Error: " + e.message); }
}

async function saveNewCourse() {
    const id = document.getElementById('crs-id').value.trim().toLowerCase();
    const nombre = document.getElementById('crs-name').value.trim();
    const base = document.getElementById('crs-base').value;

    if (!id || !nombre) return alert("Completa los campos.");

    try {
        await db.collection('cursos').doc(id).set({ nombre, materia: base, activo: true });
        alert("✅ Curso creado exitosamente.");
        closeCourseModal();
        loadCoursesManager();
        loadStudentsFromFirebase(); // Recargar sidebar
    } catch (e) { alert("Error: " + e.message); }
}

async function loadUsersManager() {
    const body = document.getElementById('users-manager-body');
    body.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
    const snap = await db.collection('usuarios_auth').get();
    body.innerHTML = '';
    snap.forEach(doc => {
        const u = doc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.nombre}</td>
            <td>${doc.id}</td>
            <td><span class="badge ${u.role}">${u.role.toUpperCase()}</span></td>
            <td>${u.cursos === 'all' ? 'TODOS' : (u.cursos || []).join(', ')}</td>
            <td><button class="btn-danger-outline" onclick="deleteAdminUser('${doc.id}')">Eliminar</button></td>
        `;
        body.appendChild(tr);
    });
}

async function loadCoursesManager() {
    const body = document.getElementById('courses-manager-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
    const snap = await db.collection('cursos').get();
    body.innerHTML = '';
    snap.forEach(doc => {
        const c = doc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code>${doc.id}</code></td>
            <td>${c.nombre}</td>
            <td>Admin Global</td>
            <td>${c.activo ? '✅ Activo' : '❌ Inactivo'}</td>
            <td><button class="btn-danger-outline" onclick="deleteCourseEntry('${doc.id}')">Eliminar</button></td>
        `;
        body.appendChild(tr);
    });
}

async function deleteAdminUser(id) {
    if (confirm(`¿Borrar acceso a ${id}?`)) {
        await db.collection('usuarios_auth').doc(id).delete();
        loadUsersManager();
    }
}

async function deleteCourseEntry(id) {
    if (confirm(`¿Borrar el curso ${id}? (No borra los alumnos, solo el acceso)`)) {
        await db.collection('cursos').doc(id).delete();
        loadCoursesManager();
    }
}

loadStudentsFromFirebase();
