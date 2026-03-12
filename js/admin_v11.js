// Administración CFP 403 // Core Admin Logic v9.18.3 (RBAC & Multi-Course Logistics)
let adminSession = JSON.parse(localStorage.getItem('admin_session'));
if (!adminSession) { window.location.href = 'index.html'; }

let studentData = {};
let activeCourses = [];
let currentViewedCourse = '';
let currentClaseTab = '';
let currentForoId = '';
let charts = {};
let notificationsListener = null;

// CARGA INICIAL
async function loadStudentsFromFirebase() {
    try {
        if (adminSession.role === 'super-admin') {
            document.getElementById('superadmin-nav')?.classList.remove('hidden');
        }

        const coursesSnap = await db.collection('cursos').get();
        if (coursesSnap.empty && adminSession.role === 'super-admin') {
            await db.collection('cursos').doc('habilidades').set({ nombre: "Habilidades Digitales & IA", materia: "Habilidades", activo: true });
            await db.collection('cursos').doc('programacion').set({ nombre: "Software & Videojuegos", materia: "Programacion", activo: true });
            return loadStudentsFromFirebase();
        }

        activeCourses = coursesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (adminSession.role === 'profesor') {
            activeCourses = activeCourses.filter(c => (adminSession.cursos || []).includes(c.id));
        }

        renderSidebarCourses();
        renderDashboardStats();
        renderClaseTabs();
        renderForoTabs();
        renderEntregasTabs();
        renderImportSelectors();

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
        // Agregamos flex-grow:1 al texto para que el badge se vaya a la derecha
        a.innerHTML = `📓 <span class="nav-link-text" style="margin-left:10px; flex-grow:1;">${c.nombre}</span> <span id="count-${c.id}" class="badge">0</span>`;
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

    // Actualiza los badges/links visuales activos
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    const cursoLink = document.querySelector(`.nav-link[data-section="${id}"]`);
    if (cursoLink) cursoLink.classList.add('active');

    // Siempre al hacer click en un curso del sidebar, queremos ver la tabla de alumnos de ese curso
    // Cerramos el dashboard si estaba abierto y mostramos la tabla.
    showTable(id);
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
            <span class="stat-value" id="count-dash-${c.id}">0</span>
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
        // Actualizar badges del sidebar
        const badge = document.getElementById(`count-${c.id}`);
        if (badge) badge.innerText = count;
        // Actualizar cards del dashboard
        const dashCount = document.getElementById(`count-dash-${c.id}`);
        if (dashCount) dashCount.innerText = count;
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

    document.getElementById('stu-name').value = '';
    document.getElementById('stu-dni').value = '';
    document.getElementById('stu-email').value = '';
    document.getElementById('stu-tel').value = '';
    document.getElementById('stu-age').value = '';
    document.getElementById('stu-dni').disabled = false;

    if (dni) {
        title.innerText = "Editar Alumno";
        const student = studentData[currentViewedCourse].find(s => s.dni === dni);
        if (student) {
            document.getElementById('stu-name').value = student.full_name || '';
            document.getElementById('stu-dni').value = student.dni || '';
            document.getElementById('stu-email').value = student.email || '';
            document.getElementById('stu-tel').value = student.telefono || '';
            document.getElementById('stu-age').value = student.edad || '';
            document.getElementById('stu-dni').disabled = true;
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

    if (!name || !dni || !email) return cfpAlert("ERROR", "Por favor, completa los campos obligatorios (Nombre, DNI, Email).");

    try {
        const coll = `alumnos_${currentViewedCourse}`;
        const data = {
            full_name: name.toUpperCase(),
            dni: dni,
            email: email,
            telefono: tel,
            edad: age,
            password: dni.slice(-4)
        };

        if (editingDni) {
            await db.collection(coll).doc(dni).update(data);
            cfpAlert("ÉXITO", "✅ Alumno actualizado.");
        } else {
            const check = await db.collection(coll).doc(dni).get();
            if (check.exists) return cfpAlert("ERROR", "El alumno con ese DNI ya existe.");

            await db.collection(coll).doc(dni).set(data);
            cfpAlert("SISTEMA", "🚀 Alumno agregado con éxito.");
        }

        closeStudentModal();
        loadStudentsFromFirebase();
    } catch (e) {
        cfpAlert("ERROR", "Error al guardar: " + e.message);
    }
}

async function deleteStudent(course, dni) {
    if (!confirm(`¿Estás seguro de eliminar permanentemente al alumno con DNI ${dni}?`)) return;
    try {
        await db.collection(`alumnos_${course}`).doc(dni).delete();
        cfpAlert("ÉXITO", "Alumno eliminado correctamente.");
        loadStudentsFromFirebase();
    } catch (err) {
        cfpAlert("ERROR", "Error al eliminar alumno: " + err.message);
    }
}

async function deleteCourseData() {
    if (!confirm(`🚨 ¿ESTÁS ABSOLUTAMENTE SEGURO de vaciar TODA la lista de alumnos inscriptos en este curso?\n\n¡Esta acción no se puede deshacer!`)) return;
    try {
        const coll = `alumnos_${currentViewedCourse}`;
        const snap = await db.collection(coll).get();
        const batch = db.batch();
        
        let batchCount = 0;
        snap.docs.forEach((doc) => {
            batch.delete(doc.ref);
            batchCount++;
        });

        if (batchCount === 0) return cfpAlert("AVISO", "La lista ya se encuentra vacía.");

        await batch.commit();
        cfpAlert("SISTEMA", "Lista de alumnos vaciada de manera definitiva.");
        loadStudentsFromFirebase();
    } catch (err) { cfpAlert("ERROR", "Error al vaciar: " + err.message); }
}

async function resetDeliveriesOnly() {
    if (!confirm(`🚨 ¿Estás seguro de ELIMINAR TODAS LAS ENTREGAS y comentarios de los alumnos de este curso?`)) return;
    try {
        const snap = await db.collection("entregas").where("curso", "==", currentViewedCourse).get();
        if (snap.empty) return cfpAlert("AVISO", "No hay entregas para reiniciar en este curso.");

        // Chunked batch deletions as Firebase batch only allows 500 ops
        const chunks = [];
        let curBatch = db.batch();
        let curCount = 0;

        snap.docs.forEach((doc) => {
            curBatch.delete(doc.ref);
            curCount++;
            if (curCount === 500) {
                chunks.push(curBatch);
                curBatch = db.batch();
                curCount = 0;
            }
        });
        if (curCount > 0) chunks.push(curBatch);

        for (let b of chunks) await b.commit();

        cfpAlert("ÉXITO", `Se reiniciaron las entregas con éxito.`);
        loadStudentsFromFirebase();
    } catch (e) {
        cfpAlert("ERROR", "Hubo un fallo al tratar de limpiar las tareas: " + e.message);
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
        cfpAlert("ERROR", "Error al exportar: " + e.message);
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

    document.getElementById('correction-pdf-viewer').src = "about:blank";
    document.getElementById('correction-viewer-placeholder').classList.remove('hidden');
    document.getElementById('grading-panel-root').classList.add('hidden');
    currentCorrectionData.dni = dni;

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
        return cfpAlert("ERROR", "Por favor, ingresa una nota válida entre 0 y 100.");
    }

    try {
        await db.collection('entregas').doc(currentCorrectionData.docId).update({
            nota: grade,
            devolucion: feedbackVal,
            estado: 'Calificado',
            fecha_calificacion: new Date().toISOString()
        });

        cfpAlert("ÉXITO", grade >= 70 ? "🚀 Actividad Aprobada (" + grade + ")" : "⚠️ Nota guardada (" + grade + ").");

        const studentName = document.getElementById('correction-student-name').innerText;
        openCorrectionView(currentCorrectionData.dni || '', studentName);
    } catch (e) {
        cfpAlert("ERROR", "Error al guardar: " + e.message);
    }
}

function backToTable() {
    document.getElementById('correction-section').classList.add('hidden');
    document.getElementById('table-section').classList.remove('hidden');
    if (currentViewedCourse) showTable(currentViewedCourse);
}

async function deleteStudent(course, dni) {
    if (!confirm("¿Eliminar alumno?")) return;
    const coll = `alumnos_${course}`;
    await db.collection(coll).doc(dni).delete();
    await loadStudentsFromFirebase();
}

// GESTIÓN DE CLASES
function loadClasesAdmin() {
    renderClaseTabs();
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
        cont.innerHTML = `<h3 style="margin-bottom:15px; text-align:center; font-size:1.1rem;">Cronograma: <span style="color:var(--primary-color);">${courseObj?.nombre || 'CURSO'}</span></h3>`;

        const addBtn = document.createElement('button');
        addBtn.innerText = "➕ Agregar Nueva Semana";
        addBtn.className = "btn-secondary";
        addBtn.style = "width:100%; margin-bottom:20px; padding:10px; border:2px dashed var(--primary-color); color:var(--primary-color); font-weight:700;";
        addBtn.onclick = async () => {
            let maxWeek = 0;
            Object.keys(materiales).forEach(k => { if (k.startsWith('sem_')) { const n = parseInt(k.replace('sem_', '')); if (n > maxWeek) maxWeek = n; } });
            const next = maxWeek + 1;
            const ref = db.collection('config_cursos').doc(currentClaseTab);
            let updated = { ...materiales };
            updated[`sem_${next}`] = { clase: '', actividad: '', fecha: '' };
            await ref.set({ materiales: updated }, { merge: true });
            loadClaseConfig(currentClaseTab);
        };
        cont.appendChild(addBtn);

        let weeksArr = Object.keys(materiales)
            .filter(k => k.startsWith('sem_'))
            .map(k => parseInt(k.replace('sem_', '')))
            .sort((a, b) => b - a);

        weeksArr.forEach(i => {
            const mat = materiales[`sem_${i}`] || { clase: '', actividad: '', fecha: '' };
            const div = document.createElement('div');
            div.className = 'clase-item-row card';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #f1f5f9; padding-bottom:10px; margin-bottom:15px;">
                    <strong style="font-size:1rem;">Semana ${i}</strong>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <input type="date" id="date-sem-${i}" value="${mat.fecha || ''}" class="input-premium" style="width:140px;">
                        <button class="btn-icon" onclick="deleteWeek(${i})" style="color:#ef4444;">🗑️</button>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                    <div>
                        <label>📖 Link Clase</label>
                        <input type="text" id="link-clase-${i}" value="${mat.clase || ''}" class="input-premium" style="width:100%;">
                    </div>
                    <div>
                        <label>🛠️ Link Actividad</label>
                        <input type="text" id="link-act-${i}" value="${mat.actividad || ''}" class="input-premium" style="width:100%;">
                    </div>
                </div>
                <button class="btn-primary" onclick="saveLinksManual(${i})" style="margin-top:15px; width:100%;">💾 GUARDAR SEMANA ${i}</button>
            `;
            cont.appendChild(div);
        });

        // Inicio
        const matInicio = materiales['inicio'] || { welcome: data.welcome_url || '', syllabus: data.syllabus_url || '', fecha: data.fecha_inicio || '' };
        const divInicio = document.createElement('div');
        divInicio.className = 'clase-item-row card';
        divInicio.style = "margin-top:30px; border:2px solid #10b981;";
        divInicio.innerHTML = `
            <strong>📚 Materiales de Inicio</strong>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:15px;">
                <input type="text" id="link-welcome" value="${matInicio.welcome || ''}" placeholder="Bienvenida" class="input-premium">
                <input type="text" id="link-syllabus" value="${matInicio.syllabus || ''}" placeholder="Programa" class="input-premium">
            </div>
            <button class="btn-primary" onclick="saveInicioManual()" style="margin-top:15px; width:100%; background:#10b981;">💾 GUARDAR INICIO</button>
        `;
        cont.appendChild(divInicio);

    } catch (e) { console.error(e); }
}

async function saveInicioManual() {
    const welcome = document.getElementById('link-welcome').value.trim();
    const syllabus = document.getElementById('link-syllabus').value.trim();
    try {
        const ref = db.collection('config_cursos').doc(currentClaseTab);
        await ref.set({ 
            materiales: { 
                inicio: { welcome: welcome, syllabus: syllabus } 
            } 
        }, { merge: true });
        cfpAlert("ÉXITO", "✅ Datos de inicio guardados.");
        loadClaseConfig(currentClaseTab);
    } catch (err) { cfpAlert("ERROR", "Error: " + err.message); }
}

async function saveLinksManual(sem) {
    const claseLink = document.getElementById(`link-clase-${sem}`).value.trim();
    const actLink = document.getElementById(`link-act-${sem}`).value.trim();
    const fecha = document.getElementById(`date-sem-${sem}`).value;
    try {
        const ref = db.collection('config_cursos').doc(currentClaseTab);
        const updateObj = {};
        updateObj[`materiales.sem_${sem}`] = { clase: claseLink, actividad: actLink, fecha: fecha };
        await ref.set(updateObj, { merge: true });
        cfpAlert("ÉXITO", `✅ Semana ${sem} guardada.`);
        loadClaseConfig(currentClaseTab);
    } catch (err) { cfpAlert("ERROR", "Error: " + err.message); }
}

async function deleteWeek(num) {
    if (!confirm(`¿Borrar Semana ${num}?`)) return;
    try {
        const ref = db.collection('config_cursos').doc(currentClaseTab);
        const doc = await ref.get();
        if (!doc.exists) return;
        let mats = doc.data().materiales || {};
        delete mats[`sem_${num}`];
        await ref.set({ materiales: mats }, { merge: true });
        loadClaseConfig(currentClaseTab);
    } catch (e) { }
}

function initNotifications() {
    if (notificationsListener) notificationsListener();
    notificationsListener = db.collection('entregas').where('estado', '==', 'Pendiente').onSnapshot(snap => {
        const b = document.getElementById('notif-count');
        if (b) {
            b.innerText = snap.size;
            b.classList.toggle('hidden', snap.size === 0);
        }
    });
}

// BÚSQUEDA Y PROCESO EXCEL
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
                
                const dniRaw = String(getVal(['DOCUMENTO', 'DNI', 'D.N.I']) || '').trim();
                const dni = dniRaw.replace(/\D/g, '');
                
                let rawApellido = String(getVal(['APELLIDO']) || '').trim();
                let rawNombre = String(getVal(['NOMBRE']) || '').trim();
                let full_name = '';

                if (rawApellido || rawNombre) {
                    full_name = `${rawApellido}, ${rawNombre}`.toUpperCase().replace(/^, |, $/g, '').trim();
                } else {
                    full_name = String(getVal(['NOMBRE Y APELLIDO', 'ALUMNO', 'ESTUDIANTE']) || '').toUpperCase().trim();
                }

                return {
                    dni: dni,
                    email: String(getVal(['EMAIL', 'CORREO']) || '').trim(),
                    full_name: full_name,
                    telefono: String(getVal(['TELÉFONO', 'CELULAR', 'TELEFONO']) || '').trim(),
                    nivel_educativo: String(getVal(['NIVEL EDUCATIVO', 'ESTUDIOS']) || '').trim(),
                    trabajo_actual: String(getVal(['TRABAJO ACTUAL', 'OCUPACIÓN']) || '').trim(),
                    busca_trabajo: String(getVal(['BUSCA TRABAJO']) || '').trim(),
                    sexo: String(getVal(['SEXO', 'GÉNERO']) || '').trim(),
                    edad: String(getVal(['EDAD', 'AÑOS']) || '').trim(),
                    nacimiento: String(getVal(['NACIMIENTO', 'FECHA DE NACIMIENTO']) || '').trim(),
                    password: dni.slice(-4)
                };
            }).filter(s => s.dni.length > 5);

            if (trans.length === 0) return cfpAlert("ERROR", "No se encontraron datos válidos.");

            const batch = db.batch();
            const coll = `alumnos_${type}`;
            trans.forEach(s => batch.set(db.collection(coll).doc(s.dni), s));
            await batch.commit();
            cfpAlert("ÉXITO", "✅ Importación exitosa de " + trans.length + " alumnos.");
            loadStudentsFromFirebase();
        } catch (err) { cfpAlert("ERROR", "Error: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
}

// GESTIÓN DE CURSOS Y USUARIOS
async function saveAdminUser() {
    const email = document.getElementById('adm-email').value.trim().toLowerCase();
    const nombre = document.getElementById('adm-name').value.trim();
    const dni_pass = document.getElementById('adm-dni').value.trim();
    const role = document.getElementById('adm-role').value;
    
    let cursos_seleccionados = [];
    if (role === 'super-admin') {
        cursos_seleccionados = 'all';
    } else {
        const checkboxes = document.querySelectorAll('.adm-curso-chk:checked');
        checkboxes.forEach(chk => cursos_seleccionados.push(chk.value));
    }

    if (!email || !nombre || !dni_pass) return cfpAlert("ERROR", "Completa todos los campos obligatorios (Nombre, Email y DNI).");
    try {
        const apiKey = "AIzaSyCf0uv7aAiPed1tvTQUIoiGihcf2r995JY"; // Usamos la API key del config para crear el Auth
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: dni_pass, returnSecureToken: false })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            if (errData.error && errData.error.message !== 'EMAIL_EXISTS') {
                throw new Error("No se pudo registrar la clave en Auth: " + errData.error.message);
            }
        }

        await db.collection('usuarios_auth').doc(email).set({ 
            nombre, 
            role, 
            cursos: cursos_seleccionados,
            password_init: dni_pass 
        });
        
        cfpAlert("ÉXITO", "✅ Usuario/Docente creado y registrado correctamente.");
        closeUserModal();
        loadUsersManager();
    } catch (e) { cfpAlert("ERROR", e.message); }
}

async function saveNewCourse() {
    const id = document.getElementById('crs-id').value.trim().toLowerCase();
    const nombre = document.getElementById('crs-name').value.trim();
    const base = document.getElementById('crs-base').value;

    if (!id || !nombre) return cfpAlert("ERROR", "Completa los campos.");
    try {
        // 1. Crear el curso en la lista maestra
        await db.collection('cursos').doc(id).set({ nombre, materia: base, activo: true });
        
        // 2. Inicializar el cronograma de contenidos para este curso
        await db.collection('config_cursos').doc(id).set({ materiales: {} }, { merge: true });

        cfpAlert("ÉXITO", "✅ Curso creado e inicializado.");
        closeCourseModal();
        loadStudentsFromFirebase();
    } catch (e) { cfpAlert("ERROR", e.message); }
}

// ALERTAS PERSONALIZADAS CFP
function cfpAlert(title, message) {
    const modal = document.getElementById('cfp-alert');
    if (!modal) return alert(message);
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    modal.classList.add('active');
}

function closeCfpAlert() {
    document.getElementById('cfp-alert').classList.remove('active');
}

// RENDERERS TABS
function renderClaseTabs() {
    const cont = document.getElementById('clase-tabs-dynamic');
    if (!cont) return;
    cont.innerHTML = '';
    activeCourses.forEach(c => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${currentClaseTab === c.id ? 'active' : ''}`;
        btn.innerText = c.nombre;
        btn.onclick = () => { currentClaseTab = c.id; loadClaseConfig(c.id); renderClaseTabs(); };
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
        btn.onclick = () => { currentForoId = c.id; loadForoAdmin(); renderForoTabs(); };
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
        btn.onclick = () => { currentViewedCourse = c.id; loadPendingDeliveries(c.id); renderEntregasTabs(); };
        cont.appendChild(btn);
    });
}

function renderImportSelectors() {
    const cont = document.getElementById('import-selectors');
    if (!cont) return;
    cont.innerHTML = '';
    activeCourses.forEach(c => {
        const item = document.createElement('div');
        item.innerHTML = `<label>${c.nombre}</label><input type="file" onchange="processExcel(this.files[0], '${c.id}')" accept=".xlsx, .xls">`;
        cont.appendChild(item);
    });
}

// LOGOUT
document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('admin_session');
    authFirebase.signOut().then(() => window.location.href = 'index.html');
});

// UI EVENT LISTENERS
document.querySelectorAll('.nav-menu > .nav-link, #superadmin-nav .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(link.dataset.section);
    });
});

// ====== IMPL. FUNCIONES FALTANTES v9.18.8 ======

// 1. ENTREGAS PENDIENTES
async function loadPendingDeliveries(courseId = currentViewedCourse) {
    if (!courseId) return;
    const tbody = document.getElementById('pending-deliveries-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando...</td></tr>';

    try {
        const snap = await db.collection('entregas').where('curso', '==', courseId).where('estado', '==', 'Pendiente').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay entregas pendientes para este curso.</td></tr>';
            return;
        }

        const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.semana - a.semana);
        tbody.innerHTML = '';

        docs.forEach(data => {
            const student = studentData[courseId]?.find(s => s.dni === data.alumno_dni);
            const stuName = student ? student.full_name : 'Alumno Desconocido';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${stuName}</td>
                <td style="text-align:center;">Sem. ${data.semana}</td>
                <td style="text-align:center;">${new Date(data.fecha_entrega || data.timestamp).toLocaleDateString()}</td>
                <td style="text-align:center;"><span style="color:#ef4444; font-weight:800;">PENDIENTE</span></td>
                <td style="text-align:center;">
                    <button class="btn-correct alert" onclick="openCorrectionView('${data.alumno_dni}', '${stuName}')" style="min-width:120px;">CORREGIR</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Error al cargar: ' + e.message + '</td></tr>';
    }
}

// 2. MURO DE CONSULTAS (FORO ADMINISTRATIVO)
let unreadListenerForo = null;
function loadForoAdmin() {
    const container = document.getElementById('foro-admin-container');
    if (!container) return;
    if (!currentForoId && activeCourses.length > 0) currentForoId = activeCourses[0].id;
    if (!currentForoId) return;

    container.innerHTML = '<p style="text-align:center; padding:20px;">Cargando mensajes del muro...</p>';
    if (unreadListenerForo) unreadListenerForo();

    unreadListenerForo = db.collection(`foro_${currentForoId}`)
        .orderBy('timestamp', 'asc')
        .onSnapshot(snap => {
            container.innerHTML = '';
            if (snap.empty) {
                container.innerHTML = '<p style="text-align:center; padding:20px;">El muro está vacío por ahora.</p>';
                return;
            }
            snap.forEach(doc => {
                const data = doc.data();
                const isProf = data.role === 'profesor';
                const div = document.createElement('div');
                div.className = 'foro-mensage-card';
                div.style = 'margin-bottom:15px; padding:15px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;';
                if (isProf) div.style.background = '#e0f2fe';

                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <strong style="color:${isProf ? '#0ea5e9' : '#1e293b'}">${data.sender_name} ${isProf ? '👨‍🏫' : ''}</strong>
                        <span style="font-size:0.8rem; color:#64748b;">${new Date(data.timestamp).toLocaleString()}</span>
                    </div>
                    ${data.reply_to_name ? `<div style="font-size:0.8rem; color:#64748b; margin-bottom:8px; border-left:3px solid ${isProf ? '#bae6fd' : '#cbd5e1'}; padding-left:10px;">Respondiendo a: <strong>${data.reply_to_name}</strong></div>` : ''}
                    <p style="margin-bottom:15px; line-height:1.5;">${data.mensaje}</p>
                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button class="btn-primary-sm" onclick="prepareReplyAdmin('${data.sender_name}')" style="background:#fff; color:#3b82f6; border-color:#3b82f6;">↩️ Responder</button>
                        <button class="btn-icon" onclick="deleteMessageAdmin('${doc.id}')" style="background:#fff; border:1px solid #ef4444; color:#ef4444; border-radius:8px;">🗑️</button>
                    </div>
                `;
                container.appendChild(div);
            });
            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
        });
}

function prepareReplyAdmin(name) {
    document.getElementById('reply-preview-admin').classList.remove('hidden');
    document.getElementById('reply-to-name-admin').innerText = name;
    document.getElementById('foro-input-admin').focus();
}

function cancelReplyAdmin() {
    document.getElementById('reply-preview-admin').classList.add('hidden');
    document.getElementById('reply-to-name-admin').innerText = '';
}

async function sendMessageAdmin() {
    const input = document.getElementById('foro-input-admin');
    const msg = input.value.trim();
    if (!msg) return cfpAlert("ERROR", "Debes escribir un mensaje para enviar.");

    try {
        const previewBox = document.getElementById('reply-preview-admin');
        const isReplying = !previewBox.classList.contains('hidden');
        const replyTo = isReplying ? document.getElementById('reply-to-name-admin').innerText : null;

        await db.collection(`foro_${currentForoId}`).add({
            sender_id: "admin",
            sender_name: adminSession.nombre || "Docente / Institucional",
            role: "profesor",
            mensaje: msg,
            reply_to_name: replyTo,
            timestamp: new Date().toISOString()
        });
        input.value = '';
        cancelReplyAdmin();
    } catch (e) {
        cfpAlert("ERROR", "No se pudo publicar: " + e.message);
    }
}

async function deleteMessageAdmin(msgId) {
    if (!confirm("¿Seguro que deseas ELIMINAR permanentemente este comentario del muro?")) return;
    try {
        await db.collection(`foro_${currentForoId}`).doc(msgId).delete();
    } catch (e) { cfpAlert("ERROR", "No autorizado: " + e.message); }
}


// 3. GESTIÓN DE USUARIOS
function openCreateUserModal() {
    document.getElementById('adm-name').value = '';
    document.getElementById('adm-email').value = '';
    document.getElementById('adm-dni').value = '';
    document.getElementById('adm-role').value = 'profesor';
    
    const chkBoxDiv = document.getElementById('adm-cursos-checkboxes');
    chkBoxDiv.innerHTML = '';
    db.collection('cursos').get().then(snap => {
        snap.forEach(doc => {
            const course = doc.data();
            const div = document.createElement('div');
            div.innerHTML = `<label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" value="${doc.id}" class="adm-curso-chk"> <span style="font-weight:600; font-size:0.9rem;">${course.nombre}</span> <small style="color:#64748b;">(${doc.id})</small></label>`;
            chkBoxDiv.appendChild(div);
        });
    });

    toggleCursosAdmin();
    document.getElementById('user-modal').classList.remove('hidden');
}

function toggleCursosAdmin() {
    const role = document.getElementById('adm-role').value;
    const coursesDiv = document.getElementById('adm-cursos-container');
    if (role === 'super-admin') {
        coursesDiv.style.display = 'none';
    } else {
        coursesDiv.style.display = 'block';
    }
}
function closeUserModal() { document.getElementById('user-modal').classList.add('hidden'); }

async function loadUsersManager() {
    const tbody = document.getElementById('users-manager-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando lista de usuarios docentes...</td></tr>';
    try {
        const snap = await db.collection('usuarios_auth').get();
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const u = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${u.nombre}</strong></td>
                <td>${doc.id}</td>
                <td style="text-align:center;"><span style="background:${u.role === 'super-admin' ? '#ef4444' : '#3b82f6'}; color:white; padding:4px 8px; border-radius:8px; font-size:0.8rem; font-weight:700;">${u.role.toUpperCase()}</span></td>
                <td><small>${Array.isArray(u.cursos) ? u.cursos.join(', ') : (u.cursos || '')}</small></td>
                <td style="text-align:center;">
                    <button class="btn-icon" onclick="deleteUser('${doc.id}')" style="color:#ef4444; background:#fee2e2; border-radius:8px;">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Error: ${e.message}</td></tr>`; }
}
async function deleteUser(email) {
    if (!confirm(`¿Estás seguro de quitar el acceso al profesor ${email}?`)) return;
    try {
        await db.collection('usuarios_auth').doc(email).delete();
        loadUsersManager();
        cfpAlert("ÉXITO", "Acceso revocado correctamente.");
    } catch (e) { cfpAlert("ERROR", e.message); }
}


// 4. GESTIÓN DE CURSOS
function openCreateCourseModal() {
    document.getElementById('crs-id').value = '';
    document.getElementById('crs-name').value = '';
    document.getElementById('course-modal').classList.remove('hidden');
}
function closeCourseModal() { document.getElementById('course-modal').classList.add('hidden'); }

async function loadCoursesManager() {
    const tbody = document.getElementById('courses-manager-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando estructura académica...</td></tr>';
    try {
        const snap = await db.collection('cursos').get();
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const c = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong style="color:var(--primary-color);">#${doc.id}</strong></td>
                <td><strong>${c.nombre}</strong></td>
                <td><small>${c.materia || 'Genérica'}</small></td>
                <td style="text-align:center;"><span style="background:#10b981; color:white; padding:4px 8px; border-radius:8px; font-size:0.8rem; font-weight:700;">ACTIVO</span></td>
                <td style="text-align:center;">
                    <button class="btn-icon" onclick="deleteCourse('${doc.id}')" style="color:#ef4444; background:#fee2e2; border-radius:8px;">💥 Borrar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Error: ${e.message}</td></tr>`; }
}

async function deleteCourse(id) {
    if (!confirm(`🚨 ¡PELIGRO! ¿Borrar el curso ${id.toUpperCase()} y la capacidad de dictarlo?`)) return;
    try {
        await db.collection('cursos').doc(id).delete();
        loadCoursesManager();
        location.reload();
    } catch (e) { cfpAlert("ERROR", e.message); }
}

loadStudentsFromFirebase();
