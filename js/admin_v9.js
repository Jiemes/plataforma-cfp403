// Administración CFP 403 - Lógica Espaciosa v6.8.6 (Orden Inverso + UI Limpia)
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

// CRONOGRAMA v6.8.6 (ORDEN INVERSO + UI REFORMADA)
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
        cont.innerHTML = `<h3 style="margin-bottom:20px; text-align:center;">Cronograma de Contenidos <span style="background:${badgeColor}; color:white; padding:4px 12px; border-radius:12px; font-size:0.8rem; vertical-align:middle;">${currentClaseTab.toUpperCase()}</span></h3>`;

        // Botón agregar al principio para visibilidad
        const addBtn = document.createElement('button');
        addBtn.innerText = "➕ Agregar Nueva Semana (Aparecerá al principio)";
        addBtn.className = "btn-secondary";
        addBtn.style = "width:100%; margin-bottom:25px; padding:15px; border:2px dashed #00B9E8; color:#00B9E8; font-weight:700; border-radius:12px; background:rgba(0,185,232,0.02);";
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

        // OBTENER LISTA DE SEMANAS Y ORDENAR INVERSO
        let weeksArr = Object.keys(materiales)
            .filter(k => k.startsWith('sem_'))
            .map(k => parseInt(k.replace('sem_', '')))
            .sort((a, b) => b - a); // 5, 4, 3, 2, 1

        // DIBUJAR SEMANAS EN ORDEN INVERSO
        weeksArr.forEach(i => {
            if ((data.excepciones || []).includes(i)) return;
            const mat = materiales[`sem_${i}`] || { clase: '', actividad: '', fecha: '' };
            const div = document.createElement('div');
            div.className = 'clase-item-row card';
            div.style = "margin-bottom:25px; padding:25px; border:1px solid #e2e8f0; border-radius:16px; background:#fff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #f1f5f9; padding-bottom:15px; margin-bottom:20px;">
                    <strong style="font-size:1.25rem; color:#1e293b;">Semana ${i}</strong>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:0.85rem; font-weight:700; color:#475569;">Habilitar en:</span>
                        <input type="date" id="date-sem-${i}" value="${mat.fecha || ''}" style="padding:8px; border-radius:8px; border:1px solid #cbd5e1; font-family:inherit;">
                        <button class="btn-icon" onclick="deleteWeek(${i})" title="Borrar semana" style="background:#fee2e2; color:#ef4444; border-radius:8px;">🗑️</button>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
                    <div class="field-group">
                        <label style="display:block; font-size:0.85rem; font-weight:700; color:#1e293b; margin-bottom:8px;">📖 Material de Clase (Link o PDF)</label>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="link-clase-${i}" value="${mat.clase || ''}" placeholder="Pega el link de Drive aquí..." style="flex-grow:1; padding:12px; border-radius:10px; border:1px solid #cbd5e1;">
                            <button class="btn-primary-sm" onclick="manualUpload('clase', ${i})" style="padding:0 15px; background:#f1f5f9; color:#1e293b; border:1px solid #cbd5e1;">📁</button>
                        </div>
                        ${mat.clase ? `<div style="margin-top:8px;"><a href="${mat.clase}" target="_blank" style="color:#00B9E8; font-size:0.85rem; font-weight:700; text-decoration:none;">🔗 Ver Contenido Actual</a></div>` : ''}
                    </div>
                    <div class="field-group">
                        <label style="display:block; font-size:0.85rem; font-weight:700; color:#1e293b; margin-bottom:8px;">🛠️ Consigna de Actividad (Link o PDF)</label>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="link-act-${i}" value="${mat.actividad || ''}" placeholder="Pega el link de Drive aquí..." style="flex-grow:1; padding:12px; border-radius:10px; border:1px solid #cbd5e1;">
                            <button class="btn-primary-sm" onclick="manualUpload('actividad', ${i})" style="padding:0 15px; background:#f1f5f9; color:#1e293b; border:1px solid #cbd5e1;">📁</button>
                        </div>
                        ${mat.actividad ? `<div style="margin-top:8px;"><a href="${mat.actividad}" target="_blank" style="color:#00B9E8; font-size:0.85rem; font-weight:700; text-decoration:none;">🔗 Ver Contenido Actual</a></div>` : ''}
                    </div>
                </div>
                <button class="btn-primary" onclick="saveLinksManual(${i})" style="margin-top:20px; width:100%; padding:14px; background:#1e293b; color:white; border-radius:10px; font-weight:700; letter-spacing:0.5px;">💾 GUARDAR CAMBIOS SEMANA ${i}</button>
            `;
            cont.appendChild(div);
        });

        // 3. MATERIALES DE INICIO AL FINAL (en orden inverso, lo primero queda al fondo)
        const matInicio = materiales['inicio'] || { welcome: data.welcome_url || '', syllabus: data.syllabus_url || '', fecha: data.fecha_inicio || '' };
        const divInicio = document.createElement('div');
        divInicio.className = 'clase-item-row card';
        divInicio.style = "margin-top:40px; padding:30px; border:2px solid #10b981; border-radius:20px; background:rgba(16,185,129,0.03);";
        divInicio.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom: 1px solid rgba(16,185,129,0.2); padding-bottom:15px;">
                <strong style="font-size:1.3rem; color:#059669;">📚 Materiales Iniciales (Bienvenida y Programa)</strong>
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:0.85rem; font-weight:700; color:#059669;">Liberar el:</span>
                    <input type="date" id="date-inicio" value="${matInicio.fecha || ''}" style="padding:8px; border-radius:10px; border:1px solid #10b981;">
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
                <div class="field-group">
                    <label style="display:block; font-size:0.85rem; font-weight:700; color:#059669; margin-bottom:10px;">👋 Mensaje de Bienvenida</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="link-welcome" value="${matInicio.welcome || ''}" placeholder="Link o subida..." style="flex-grow:1; padding:12px; border-radius:10px; border:1px solid #10b981;">
                        <button class="btn-primary-sm" onclick="manualUpload('welcome', 'inicio')" style="padding:0 15px; background:white; color:#10b981; border:1px solid #10b981;">📁</button>
                    </div>
                </div>
                <div class="field-group">
                    <label style="display:block; font-size:0.85rem; font-weight:700; color:#059669; margin-bottom:10px;">📋 Programa Académico</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="link-syllabus" value="${matInicio.syllabus || ''}" placeholder="Link o subida..." style="flex-grow:1; padding:12px; border-radius:10px; border:1px solid #10b981;">
                        <button class="btn-primary-sm" onclick="manualUpload('syllabus', 'inicio')" style="padding:0 15px; background:white; color:#10b981; border:1px solid #10b981;">📁</button>
                    </div>
                </div>
            </div>
            <button class="btn-primary" onclick="saveInicioManual()" style="margin-top:20px; width:100%; padding:15px; background:#10b981; color:white; border-radius:12px; font-weight:800; border:none;">💾 GUARDAR MATERIALES DE INICIO</button>
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
        alert("✅ Materiales de bienvenida guardados correctamente.");
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
        alert(`✅ Datos de la Semana ${sem} guardados.`);
        loadClasesAdmin();
    } catch (err) { alert("Error: " + err.message); }
}

async function manualUpload(type, identifier) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            alert("🚀 Subiendo archivo a Firebase... no refresques la página.");
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
            alert("✅ ¡Archivo subido con éxito!");
            loadClasesAdmin();
        } catch (err) { alert("X Error en la subida: " + err.message); }
    };
    input.click();
}

function switchClaseType(type) {
    currentClaseTab = type;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase().includes(type.slice(0, 4))));
    loadClasesAdmin();
}

async function deleteWeek(num) {
    if (!confirm(`¿Estás seguro de ELIMINAR la Semana ${num}?`)) return;
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
            div.style = "background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px; border:1px solid #e2e8f0;";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div><strong>Semana ${data.semana} - ${data.tipo || 'Actividad'}</strong></div>
                    <a href="${data.archivo_url || data.file_url}" target="_blank" class="btn-primary-sm" style="text-decoration:none;">Ver PDF</a>
                </div>
                <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
                    <input type="number" id="nota-${doc.id}" value="${data.nota || ''}" placeholder="Nota" style="width:60px; padding:8px; border-radius:8px; border:1px solid #cbd5e1;">
                    <button class="btn-primary-sm" onclick="saveGrade('${doc.id}')">Guardar Nota</button>
                    ${data.estado === 'Calificado' ? '✅' : '⏳'}
                </div>
            `;
            listCont.appendChild(div);
        });
    } catch (e) { }
}
async function saveGrade(id) {
    const nota = document.getElementById(`nota-${id}`).value;
    await db.collection('entregas').doc(id).update({ nota: nota, estado: 'Calificado' });
    alert("Nota guardada correctamente.");
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
    });
});

loadStudentsFromFirebase();
