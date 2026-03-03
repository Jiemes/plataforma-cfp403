// Administración CFP 403 - Lógica Blindada v6.8.1 (Restauración de Tablas + Link Manual)
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
    } catch (err) { console.error("Error crítico carga inicial:", err); }
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
        const snapEnt = await db.collection('entregas').where('curso', '==', course).get();
        const entregas = snapEnt.docs.map(doc => doc.data());
        tbody.innerHTML = '';

        studentData[course].forEach(s => {
            const eAlu = entregas.filter(e => e.alumno_dni === s.dni);
            const corr = eAlu.filter(e => e.estado === 'Calificado');
            const pend = eAlu.filter(e => e.estado === 'Pendiente');
            const prom = corr.length > 0 ? (corr.reduce((a, b) => a + parseFloat(b.nota), 0) / corr.length).toFixed(1) : '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${s.full_name}</td>
                <td>${s.dni}</td>
                <td>${s.telefono || '---'}</td>
                <td>${s.email}</td>
                <td style="text-align:center">${s.edad}</td>
                <td style="text-align:center">${corr.length}</td>
                <td style="text-align:center"><strong>${prom}</strong></td>
                <td>
                    <button class="btn-correct ${pend.length > 0 ? 'alert' : ''}" onclick="viewWorks('${s.dni}')">${pend.length > 0 ? '🔔 Revisar' : '📂 Ver'}</button>
                    <button class="btn-icon" onclick="deleteStudent('${course}', '${s.dni}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) { console.error(err); }
}

async function deleteStudent(course, dni) {
    if (!confirm("¿Eliminar alumno?")) return;
    const coll = course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
    await db.collection(coll).doc(dni).delete();
    await loadStudentsFromFirebase();
}

async function deleteCourseData() {
    if (!confirm(`¿Estás SEGURO de vaciar TODA la lista de ${currentViewedCourse}?`)) return;
    try {
        const coll = currentViewedCourse === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
        const snap = await db.collection(coll).get();
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        alert("Lista vaciada correctamente.");
        await loadStudentsFromFirebase();
    } catch (err) { alert("Error al vaciar: " + err.message); }
}

// EXCEL
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
                return {
                    dni: String(getVal(['DOCUMENTO', 'DNI', 'D.N.I']) || '').trim(),
                    email: String(getVal(['EMAIL', 'CORREO']) || '').trim(),
                    full_name: `${getVal(['APELLIDO']) || ''}, ${getVal(['NOMBRE']) || ''}`.toUpperCase().trim() || String(getVal(['NOMBRE Y APELLIDO', 'ALUMNO']) || '').toUpperCase().trim(),
                    telefono: String(getVal(['TELÉFONO', 'CELULAR', 'TELEFONO']) || '').trim(),
                    nivel_educativo: String(getVal(['NIVEL EDUCATIVO', 'ESTUDIOS']) || '').trim(),
                    trabajo_actual: String(getVal(['TRABAJO ACTUAL', 'OCUPACIÓN']) || '').trim(),
                    busca_trabajo: String(getVal(['BUSCA TRABAJO']) || '').trim(),
                    sexo: String(getVal(['SEXO', 'GÉNERO']) || '').trim(),
                    edad: String(getVal(['EDAD', 'AÑOS']) || '').trim(),
                    nacimiento: String(getVal(['NACIMIENTO', 'FECHA DE NACIMIENTO']) || '').trim()
                };
            }).filter(s => s.dni.length > 5);
            if (trans.length === 0) return alert("No se encontraron datos válidos.");
            const batch = db.batch();
            const coll = type === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
            trans.forEach(s => batch.set(db.collection(coll).doc(s.dni), s));
            await batch.commit();
            alert("¡Importación exitosa!");
            loadStudentsFromFirebase();
        } catch (err) { alert("Error al procesar: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
}

// CRONOGRAMA v6.8.1
async function loadClasesAdmin() {
    const cont = document.getElementById('clases-list-container');
    if (!cont) return;
    cont.innerHTML = '<p class="loader" style="text-align:center; padding:20px;">⌛ Cargando materiales...</p>';

    try {
        const doc = await db.collection('config_cursos').doc(currentClaseTab).get();
        const data = doc.exists ? doc.data() : { materiales: {} };
        let materiales = {};
        if (data.materials) Object.assign(materiales, data.materials);
        if (data.materiales) Object.assign(materiales, data.materiales);

        const config = {
            fecha_inicio: data.fecha_inicio || '',
            frecuencia_dias: data.frecuencia_dias || 7,
            materiales: materiales,
            welcome_url: data.welcome_url || '',
            syllabus_url: data.syllabus_url || '',
            excepciones: data.excepciones || []
        };

        const badgeColor = currentClaseTab === 'habilidades' ? '#10b981' : '#1e293b';
        document.querySelector('#clases-section h3').innerHTML = `Listado de Clases y Actividades <span style="background:${badgeColor}; color:white; padding:2px 10px; border-radius:10px; font-size:0.7rem;">${currentClaseTab === 'habilidades' ? 'HABILIDADES' : 'VIDEOJUEGOS'}</span>`;

        document.getElementById('course-start-date').value = config.fecha_inicio;
        document.getElementById('course-frequency').value = config.frecuencia_dias;
        document.getElementById('course-welcome-url').value = config.welcome_url;
        document.getElementById('course-welcome-url').readOnly = false;
        document.getElementById('course-syllabus-url').value = config.syllabus_url;
        document.getElementById('course-syllabus-url').readOnly = false;

        cont.innerHTML = '';
        let maxWeek = 1;
        Object.keys(materiales).forEach(k => {
            const num = parseInt(k.replace('sem_', ''));
            if (num > maxWeek) maxWeek = num;
        });

        for (let i = 1; i <= Math.max(maxWeek, 1); i++) {
            if (config.excepciones.includes(i)) continue;
            const mat = materiales[`sem_${i}`] || { clase: '', actividad: '' };
            const div = document.createElement('div');
            div.className = 'clase-item-row card';
            div.style = "margin-bottom:15px; padding:15px; border:1px solid #e2e8f0; border-radius:12px;";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <strong style="font-size:1.1rem">Semana ${i}</strong>
                    <button class="btn-icon" onclick="deleteWeek(${i})">🗑️</button>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                    <div>
                        <label style="font-size:0.8rem; font-weight:700;">Clase (Link o Subida)</label>
                        <div style="display:flex; gap:5px; margin-top:5px;">
                            <input type="text" id="link-clase-${i}" value="${mat.clase || ''}" placeholder="Pega link..." style="flex-grow:1; padding:8px; border-radius:8px; border:1px solid #cbd5e1;">
                            <button class="btn-primary-sm" onclick="manualUpload('clase', ${i})" title="Subir desde PC">📁</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700;">Actividad (Link o Subida)</label>
                        <div style="display:flex; gap:5px; margin-top:5px;">
                            <input type="text" id="link-act-${i}" value="${mat.actividad || ''}" placeholder="Pega link..." style="flex-grow:1; padding:8px; border-radius:8px; border:1px solid #cbd5e1;">
                            <button class="btn-primary-sm" onclick="manualUpload('actividad', ${i})" title="Subir desde PC">📁</button>
                        </div>
                    </div>
                </div>
                <button class="btn-primary" onclick="saveLinksManual(${i})" style="margin-top:10px; width:100%; font-size:0.8rem; background:#64748b;">💾 Guardar Semana ${i}</button>
            `;
            cont.appendChild(div);
        }

        const addBtn = document.createElement('button');
        addBtn.innerText = "➕ Agregar Nueva Semana";
        addBtn.className = "btn-secondary";
        addBtn.style = "width:100%; margin-top:15px; border:2px dashed #00B9E8; color:#00B9E8; font-weight:700;";
        addBtn.onclick = async () => {
            const next = maxWeek + 1;
            const ref = db.collection('config_cursos').doc(currentClaseTab);
            let updated = { ...materiales };
            updated[`sem_${next}`] = { clase: '', actividad: '' };
            await ref.update({ materiales: updated });
            loadClasesAdmin();
        };
        cont.appendChild(addBtn);
    } catch (e) { console.error(e); }
}

async function saveLinksManual(sem) {
    const claseLink = document.getElementById(`link-clase-${sem}`).value.trim();
    const actLink = document.getElementById(`link-act-${sem}`).value.trim();
    try {
        const ref = db.collection('config_cursos').doc(currentClaseTab);
        const update = {};
        update[`materiales.sem_${sem}.clase`] = claseLink;
        update[`materiales.sem_${sem}.actividad`] = actLink;
        await ref.update(update);
        alert(`Semana ${sem} guardada con éxito.`);
        loadClasesAdmin();
    } catch (err) { alert("Error al guardar: " + err.message); }
}

async function saveConfig() {
    const start = document.getElementById('course-start-date').value;
    const freq = document.getElementById('course-frequency').value;
    const welcome = document.getElementById('course-welcome-url').value.trim();
    const syllabus = document.getElementById('course-syllabus-url').value.trim();
    try {
        await db.collection('config_cursos').doc(currentClaseTab).set({
            fecha_inicio: start,
            frecuencia_dias: parseInt(freq) || 7,
            welcome_url: welcome,
            syllabus_url: syllabus
        }, { merge: true });
        alert("Configuración base guardada con éxito.");
        loadClasesAdmin();
    } catch (e) { alert(e.message); }
}

async function manualUpload(type, sem = null) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            alert("🚀 Subiendo a Storage...");
            const ref = storage.ref().child(`materiales/${currentClaseTab}/${Date.now()}_${file.name}`);
            await ref.put(file);
            const url = await ref.getDownloadURL();
            if (sem) {
                const up = {};
                up[`materiales.sem_${sem}.${type}`] = url;
                await db.collection('config_cursos').doc(currentClaseTab).update(up);
            } else {
                const up = {};
                up[type === 'welcome' ? 'welcome_url' : 'syllabus_url'] = url;
                await db.collection('config_cursos').doc(currentClaseTab).update(up);
            }
            alert("✅ ¡Éxito!");
            loadClasesAdmin();
        } catch (err) { alert("Error: " + err.message); }
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

// NOTIFICACIONES Y MODALES
function initNotifications() {
    db.collection('entregas').where('estado', '==', 'Pendiente').onSnapshot(snap => {
        const b = document.getElementById('notif-count');
        if (b) {
            if (snap.size > 0) { b.innerText = snap.size; b.classList.remove('hidden'); }
            else { b.classList.add('hidden'); }
        }
    });
}

function closeGradeModal() { document.getElementById('grade-modal').classList.add('hidden'); }

async function viewWorks(dni) {
    const modal = document.getElementById('grade-modal');
    const listCont = document.getElementById('student-works-list');
    modal.classList.remove('hidden');
    listCont.innerHTML = 'Cargando trabajos...';
    try {
        const snap = await db.collection('entregas').where('alumno_dni', '==', dni).get();
        listCont.innerHTML = snap.size === 0 ? 'No hay entregas.' : '';
        snap.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'work-item';
            div.style = "background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:10px; border:1px solid #e2e8f0;";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>Semana ${data.semana} - ${data.tipo.toUpperCase()}</strong>
                        <p style="font-size:0.8rem; color:#64748b;">${new Date(data.fecha).toLocaleDateString()}</p>
                    </div>
                    <a href="${data.file_url}" target="_blank" class="btn-primary-sm" style="text-decoration:none;">Ver PDF</a>
                </div>
                <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
                    <input type="number" id="nota-${doc.id}" value="${data.nota || ''}" placeholder="Nota" style="width:60px; padding:5px; border-radius:5px; border:1px solid #cbd5e1;">
                    <button class="btn-primary-sm" onclick="saveGrade('${doc.id}')">Guardar</button>
                    ${data.estado === 'Calificado' ? '✅' : '⏳'}
                </div>
            `;
            listCont.appendChild(div);
        });
    } catch (e) { }
}

async function saveGrade(id) {
    const nota = document.getElementById(`nota-${id}`).value;
    if (!nota) return alert("Ingresa una nota.");
    await db.collection('entregas').doc(id).update({ nota: nota, estado: 'Calificado' });
    alert("Nota guardada.");
}

// UI HANDLERS
document.getElementById('btn-save-config')?.addEventListener('click', saveConfig);
document.getElementById('btn-clear-course')?.addEventListener('click', deleteCourseData);
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
    });
});

loadStudentsFromFirebase();
