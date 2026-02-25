// Manejo de datos de estudiantes con Firebase Firestore
let studentData = { habilidades: [], programacion: [] };
let currentViewedCourse = '';
let charts = {};
let notificationsListener = null;

// Cargar datos iniciales desde Firebase
async function loadStudentsFromFirebase() {
    try {
        const snapshotHabilidades = await db.collection('alumnos_habilidades').get();
        studentData.habilidades = snapshotHabilidades.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sortAndCleanDuplicates('habilidades');
        document.getElementById('count-habilidades').innerText = studentData.habilidades.length;

        const snapshotProgramacion = await db.collection('alumnos_programacion').get();
        studentData.programacion = snapshotProgramacion.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sortAndCleanDuplicates('programacion');
        document.getElementById('count-programacion').innerText = studentData.programacion.length;

        updateDashboard();
        if (currentViewedCourse) showTable(currentViewedCourse);
        initNotifications();
    } catch (error) { console.error("Error:", error); }
}

function sortAndCleanDuplicates(courseKey) {
    const uniqueMap = new Map();
    studentData[courseKey].forEach(s => uniqueMap.set(s.dni, s));
    studentData[courseKey] = Array.from(uniqueMap.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
}

function updateDashboard() {
    const all = [...studentData.habilidades, ...studentData.programacion];
    document.getElementById('stat-total-global').innerText = all.length;
    if (all.length > 0) { calculateDetailedStats(all); renderCharts(all); }
}

function calculateDetailedStats(all) {
    const stats = {
        total: all.length,
        buscandoTrabajo: all.filter(s => s.busca_trabajo && s.busca_trabajo.toUpperCase().includes('SI')).length,
        trabajando: all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length,
        nivelesEducativos: {}
    };
    all.forEach(s => { if (s.nivel_educativo) stats.nivelesEducativos[s.nivel_educativo] = (stats.nivelesEducativos[s.nivel_educativo] || 0) + 1; });
    const statsDiv = document.getElementById('stats-summary');
    if (statsDiv) {
        statsDiv.innerHTML = `
            <div class="stats-row">
                <div class="stat-mini-card"><strong>Buscando Trabajo</strong><span>${stats.buscandoTrabajo} (${((stats.buscandoTrabajo / stats.total) * 100).toFixed(1)}%)</span></div>
                <div class="stat-mini-card"><strong>Actualmente Trabajando</strong><span>${stats.trabajando} (${((stats.trabajando / stats.total) * 100).toFixed(1)}%)</span></div>
            </div>
            <div class="stats-education" style="margin-top: 20px;">
                <h4>Resumen de Niveles Educativos:</h4>
                <ul style="list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    ${Object.entries(stats.nivelesEducativos).map(([nivel, cant]) => `<li><strong>${nivel}:</strong> ${cant} alumnos</li>`).join('')}
                </ul>
            </div>
        `;
    }
}

function renderCharts(all) {
    Object.values(charts).forEach(c => c.destroy());
    const commonOptions = { responsive: true, maintainAspectRatio: false };
    const dataTrabajo = { 'Trabaja': all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length, 'No Trabaja': all.filter(s => s.trabajo_actual && s.trabajo_actual.toUpperCase().includes('NO')).length };
    const dataSexo = { 'Masculino': all.filter(s => s.sexo && s.sexo.toUpperCase().startsWith('M')).length, 'Femenino': all.filter(s => s.sexo && s.sexo.toUpperCase().startsWith('F')).length, 'Otro/NS': all.filter(s => !s.sexo || (!s.sexo.toUpperCase().startsWith('M') && !s.sexo.toUpperCase().startsWith('F'))).length };
    const dataEdades = { '18-25': 0, '26-35': 0, '36-45': 0, '46+': 0 };
    all.forEach(s => {
        let edad = parseInt(s.edad);
        if (isNaN(edad) && s.nacimiento) { const birth = new Date(s.nacimiento).getFullYear(); if (!isNaN(birth)) edad = new Date().getFullYear() - birth; }
        if (edad <= 25) dataEdades['18-25']++; else if (edad <= 35) dataEdades['26-35']++; else if (edad <= 45) dataEdades['36-45']++; else if (edad > 45) dataEdades['46+']++;
    });
    charts.trabajo = new Chart(document.getElementById('chart-trabajo'), { type: 'pie', data: { labels: Object.keys(dataTrabajo), datasets: [{ data: Object.values(dataTrabajo), backgroundColor: ['#00B9E8', '#e2e8f0'] }] }, options: commonOptions });
    const dataEstudios = {};
    all.forEach(s => { if (s.nivel_educativo) dataEstudios[s.nivel_educativo] = (dataEstudios[s.nivel_educativo] || 0) + 1; });
    charts.estudios = new Chart(document.getElementById('chart-estudios'), { type: 'bar', data: { labels: Object.keys(dataEstudios), datasets: [{ label: 'Alumnos', data: Object.values(dataEstudios), backgroundColor: '#00B9E8' }] }, options: { ...commonOptions, scales: { y: { beginAtZero: true } } } });
    charts.sexo = new Chart(document.getElementById('chart-sexo'), { type: 'doughnut', data: { labels: Object.keys(dataSexo), datasets: [{ data: Object.values(dataSexo), backgroundColor: ['#00B9E8', '#FF6384', '#FFCE56'] }] }, options: commonOptions });
    charts.edades = new Chart(document.getElementById('chart-edades'), { type: 'bar', data: { labels: Object.keys(dataEdades), datasets: [{ label: 'Alumnos', data: Object.values(dataEdades), backgroundColor: '#1e293b' }] }, options: commonOptions });
}

// GESTIÃ“N DE CLASES
document.getElementById('btn-save-clases')?.addEventListener('click', async () => {
    const files = document.getElementById('upload-pdfs').files;
    const curso = document.getElementById('select-curso-clase').value;
    if (files.length === 0) return alert("Selecciona archivos PDF");

    for (const file of files) {
        // Formato esperado: "Nombre_Curso_Semana_1.pdf" o similares
        const match = file.name.match(/(\d+)/);
        const semana = match ? parseInt(match[0]) : 1;

        const path = `clases/${curso}/Semana_${semana}/${file.name}`;
        const ref = storage.ref().child(path);
        await ref.put(file);
        const url = await ref.getDownloadURL();

        await db.collection('clases').add({
            curso,
            semana,
            nombre: file.name,
            url,
            visible: true,
            fecha_creacion: new Date().toISOString()
        });
    }
    alert("Clases subidas correctamente");
    loadClasesAdmin();
});

async function loadClasesAdmin() {
    const snapshot = await db.collection('clases').orderBy('semana', 'asc').get();
    const container = document.getElementById('clases-list-admin');
    container.innerHTML = '';
    snapshot.docs.forEach(doc => {
        const c = doc.data();
        const div = document.createElement('div');
        div.className = 'clase-item-admin';
        div.innerHTML = `
            <div class="clase-info">
                <span class="clase-week">Semana ${c.semana}</span>
                <span class="clase-name">${c.nombre} (${c.curso})</span>
            </div>
            <div class="clase-actions">
                <button class="btn-toggle-view ${c.visible ? 'active' : ''}" onclick="toggleClaseVisibility('${doc.id}', ${c.visible})">
                    ${c.visible ? 'Visible' : 'Oculta'}
                </button>
                <button onclick="deleteClase('${doc.id}')">ðŸ—‘ï¸</button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function toggleClaseVisibility(id, current) {
    await db.collection('clases').doc(id).update({ visible: !current });
    loadClasesAdmin();
}

async function deleteClase(id) {
    if (confirm("Â¿Eliminar clase?")) { await db.collection('clases').doc(id).delete(); loadClasesAdmin(); }
}

// NOTIFICACIONES Y ENTREGAS
function initNotifications() {
    if (notificationsListener) notificationsListener();
    notificationsListener = db.collection('entregas').where('estado', '==', 'Pendiente').onSnapshot(snap => {
        const count = snap.size;
        const bell = document.getElementById('notif-bell');
        const badge = document.getElementById('notif-badge');
        if (count > 0) {
            bell.classList.add('bell-active');
            document.getElementById('notif-count').innerText = count;
            document.getElementById('notif-count').classList.remove('hidden');
        } else {
            bell.classList.remove('bell-active');
            document.getElementById('notif-count').classList.add('hidden');
        }
    });
}

// GRADES Y PROMEDIOS
async function loadGradesTable() {
    const snapshot = await db.collection('entregas').get();
    const entregas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const tbody = document.querySelector('#grades-table tbody');
    tbody.innerHTML = '';

    const allStudents = [...studentData.habilidades, ...studentData.programacion];
    allStudents.forEach(s => {
        const sEntregas = entregas.filter(e => e.alumno_dni === s.dni);
        const notas = sEntregas.map(e => parseFloat(e.nota)).filter(n => !isNaN(n));
        const promedio = notas.length > 0 ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1) : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.full_name}</td>
            <td>${s.dni}</td>
            <td>${sEntregas[0]?.curso || 'N/A'}</td>
            <td><strong>${promedio}</strong></td>
            <td><button onclick="viewStudentWorks('${s.dni}')">Ver Trabajos (${sEntregas.length})</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// NAVEGACIÃ“N
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = link.getAttribute('data-section');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

        // Reset stat cards display
        document.getElementById('card-total-unificados').style.display = 'block';
        document.getElementById('card-count-habilidades').style.display = 'block';
        document.getElementById('card-count-programacion').style.display = 'block';

        if (sectionId === 'dashboard') {
            document.getElementById('dashboard-section').classList.remove('hidden');
        } else if (sectionId === 'habilidades' || sectionId === 'programacion') {
            showTable(sectionId);
        } else if (sectionId === 'clases') {
            document.getElementById('clases-section').classList.remove('hidden');
            loadClasesAdmin();
        } else if (sectionId === 'notas') {
            document.getElementById('notas-section').classList.remove('hidden');
            loadGradesTable();
        }
    });
});

function showTable(courseKey) {
    currentViewedCourse = courseKey;
    document.getElementById('table-section').classList.remove('hidden');
    document.getElementById('current-course-title').innerText = courseKey === 'habilidades' ? 'Alumnos: Habilidades Digitales & IA' : 'Alumnos: Desarrollo de Software & Videojuegos';

    // Filtro de cards
    document.getElementById('card-total-unificados').style.display = 'none';
    if (courseKey === 'habilidades') {
        document.getElementById('card-count-habilidades').style.display = 'block';
        document.getElementById('card-count-programacion').style.display = 'none';
    } else {
        document.getElementById('card-count-habilidades').style.display = 'none';
        document.getElementById('card-count-programacion').style.display = 'block';
    }

    const tbody = document.querySelector('#students-table tbody');
    tbody.innerHTML = '';
    studentData[courseKey].forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${s.full_name}</td><td>${s.dni}</td><td>${s.telefono || 'Sin datos'}</td><td>${s.email}</td><td><button onclick="editStudent('${courseKey}', '${s.dni}')">âœï¸</button><button onclick="deleteStudent('${courseKey}', '${s.dni}')">ðŸ—‘ï¸</button></td>`;
        tbody.appendChild(tr);
    });
}

// EXCEL IMPORT (Solo disponible en Dash)
document.getElementById('upload-habilidades')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'habilidades'));
document.getElementById('upload-programacion')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'programacion'));

async function processExcel(file, type) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const transformed = json.map(row => ({
            dni: String(row['CUÃL ES SU NÃšMERO DE DOCUMENTO?'] || row['DNI'] || row['Documento'] || '').trim(),
            email: row['DirecciÃ³n de correo electrÃ³nico'] || row['Email'] || '',
            full_name: `${row['CUÃLES SON SUS APELLIDOS?'] || ''}, ${row['CUÃLES SON SUS NOMBRES?'] || ''}`.toUpperCase().trim(),
            telefono: row['CUÃL ES SU NÃšMERO DE TELÃ‰FONO?'] || row['TelÃ©fono'] || row['Telefono'] || '',
            nivel_educativo: row['CUÃL ES SU NIVEL EDUCATIVO ALCANZADO?'] || '',
            trabajo_actual: row['CUÃL ES SU TRABAJO ACTUAL? (DE NO TRABAJAR SOLO ESCRIBA NO)'] || '',
            busca_trabajo: row['BUSCA TRABAJO U OTRO TRABAJO?'] || '',
            sexo: row['SEXO'] || row['GENERO'] || '',
            edad: row['EDAD'] || '',
            nacimiento: row['CUÃL ES SU FECHA DE NACIMIENTO?'] || ''
        })).filter(s => s.dni && s.dni.length > 5);
        const batch = db.batch();
        const collection = type === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
        transformed.forEach(s => batch.set(db.collection(collection).doc(s.dni), s));
        await batch.commit();
        alert('ImportaciÃ³n completada');
        loadStudentsFromFirebase();
    };
    reader.readAsArrayBuffer(file);
}

// INIT
loadStudentsFromFirebase();

