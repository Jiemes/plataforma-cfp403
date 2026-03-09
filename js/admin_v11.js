// Administración CFP 403 - Lógica Pulida v9.17.1 (Sync & Cleanup Refined)
let studentData = { habilidades: [], programacion: [] };
let currentViewedCourse = '';
let currentClaseTab = 'habilidades';
let charts = {};
let notificationsListener = null;

// CARGA INICIAL
async function loadStudentsFromFirebase() {
    try {
        const snapHab = await db.collection('alumnos_habilidades').get();
        studentData.habilidades = snapHab.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processAndClean('habilidades');

        const snapProg = await db.collection('alumnos_programacion').get();
        studentData.programacion = snapProg.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processAndClean('programacion');

        refreshCounters();
        updateDashboardView('global');
        if (currentViewedCourse) showTable(currentViewedCourse);
        initNotifications();
    } catch (err) {
        console.error("Error crítico carga inicial:", err);
        if (err.code === 'permission-denied') {
            alert("⚠️ Sesión expirada o sin permisos. Por favor, vuelve a iniciar sesión.");
            window.location.href = 'index.html';
        }
    }
}

function refreshCounters() {
    const counts = {
        total: (studentData.habilidades?.length || 0) + (studentData.programacion?.length || 0),
        hab: studentData.habilidades?.length || 0,
        prog: studentData.programacion?.length || 0
    };
    if (document.getElementById('stat-total-global')) document.getElementById('stat-total-global').innerText = counts.total;
    if (document.getElementById('count-habilidades')) document.getElementById('count-habilidades').innerText = counts.hab;
    if (document.getElementById('count-programacion')) document.getElementById('count-programacion').innerText = counts.prog;
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
        data = [...(studentData.habilidades || []), ...(studentData.programacion || [])];
    } else if (type === 'habilidades') {
        title.innerText = "Habilidades Digitales & IA";
        data = studentData.habilidades || [];
    } else {
        title.innerText = "Software & Videojuegos";
        data = studentData.programacion || [];
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
    document.getElementById('current-course-title').innerText = course === 'habilidades' ? 'Habilidades Digitales & IA' : 'Software & Videojuegos';

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

function openStudentModal(dni = null) {
    editingDni = dni;
    const modal = document.getElementById('student-modal');
    const title = document.getElementById('student-modal-title');

    // Limpiar campos
    document.getElementById('stu-name').value = '';
    document.getElementById('stu-dni').value = '';
    document.getElementById('stu-email').value = '';
    document.getElementById('stu-tel').value = '';
    document.getElementById('stu-age').value = '';

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
        document.getElementById('stu-dni').disabled = false;
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
        const coll = currentViewedCourse === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
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
    document.getElementById('correction-course-name').innerText = currentViewedCourse === 'habilidades' ? 'Curso: Habilidades Digitales & IA' : 'Curso: Software & Videojuegos';

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
    const coll = course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
    await db.collection(coll).doc(dni).delete();
    await loadStudentsFromFirebase();
}

// CRONOGRAMA v6.9.0 (DISEÑO PULIDO + ORDEN INVERSO)
async function loadClasesAdmin() {
    const cont = document.getElementById('clases-list-container');
    if (!cont) return;
    cont.innerHTML = '<p class="loader" style="text-align:center; padding:20px;">⌛ Sincronizando materiales...</p>';

    try {
        const doc = await db.collection('config_cursos').doc(currentClaseTab).get();
        const data = doc.exists ? doc.data() : { materiales: {} };
        let materiales = {};
        if (data.materials) Object.assign(materiales, data.materials);
        if (data.materiales) Object.assign(materiales, data.materiales);

        const badgeColor = currentClaseTab === 'habilidades' ? '#10b981' : '#1e293b';
        cont.innerHTML = `<h3 style="margin-bottom:15px; text-align:center; font-size:1.1rem;">Cronograma de Contenidos <span style="background:${badgeColor}; color:white; padding:4px 10px; border-radius:10px; font-size:0.75rem; vertical-align:middle;">${currentClaseTab.toUpperCase()}</span></h3>`;

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
            loadClasesAdmin();
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
        await ref.update({
            welcome_url: welcome,
            syllabus_url: syllabus,
            fecha_inicio: fecha,
            "materiales.inicio": { welcome, syllabus, fecha }
        });
        alert("✅ Datos de inicio guardados.");
        loadClasesAdmin();
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
        loadClasesAdmin();
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
            loadClasesAdmin();
        } catch (err) { alert("Error en subida: " + err.message); }
    };
    input.click();
}

function switchClaseType(type) {
    currentClaseTab = type;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase().includes(type.slice(0, 4))));
    loadClasesAdmin();
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
            div.style = "background:#f8fafc; padding:15px; border-radius:12px; margin-bottom:15px; border:1px solid #e2e8f0; border-left: 5px solid ${data.estado === 'Calificado' ? '#10b981' : '#f59e0b'};";
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
            const coll = type === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
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
        const coll = currentViewedCourse === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';

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
document.getElementById('upload-habilidades')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'habilidades'));
document.getElementById('upload-programacion')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'programacion'));
document.getElementById('btn-logout')?.addEventListener('click', () => authFirebase.signOut().then(() => window.location.href = 'index.html'));

document.querySelectorAll('.nav-link').forEach(l => {
    l.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = l.dataset.section;
        document.querySelectorAll('.nav-link').forEach(nav => nav.classList.remove('active'));
        l.classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
        if (sec === 'clases') { document.getElementById('clases-section').classList.remove('hidden'); loadClasesAdmin(); }
        else if (sec === 'dashboard') { document.getElementById('dashboard-section').classList.remove('hidden'); updateDashboardView('global'); }
        else if (sec === 'habilidades' || sec === 'programacion') showTable(sec);
        else if (sec === 'foro') { document.getElementById('foro-section').classList.remove('hidden'); loadForoAdmin(); }
    });
});

// FORO / MURO DE CONSULTAS - LÓGICA ADMIN
let currentForoTab = 'habilidades';
let foroUnsubscribe = null;
let replyToAdmin = null;

function switchForoType(type) {
    currentForoTab = type;
    document.querySelectorAll('.tab-btn-foro').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase().includes(type.slice(0, 4))));
    document.getElementById('foro-title-admin').innerText = `FORO: ${type === 'habilidades' ? 'Habilidades Digitales' : 'Software & Videojuegos'}`;
    loadForoAdmin();
}

function loadForoAdmin() {
    if (foroUnsubscribe) foroUnsubscribe();

    const container = document.getElementById('foro-admin-container');
    container.innerHTML = '<p style="text-align:center; padding:20px;">Sincronizando muro...</p>';

    foroUnsubscribe = db.collection('foro_mensajes')
        .where('curso_id', '==', currentForoTab)
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
            curso_id: currentForoTab,
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

loadStudentsFromFirebase();
