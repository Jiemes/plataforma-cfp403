// Administración CFP 403 - Lógica Inteligente 5.0
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
        total: studentData.habilidades.length + studentData.programacion.length,
        hab: studentData.habilidades.length,
        prog: studentData.programacion.length
    };
    if (document.getElementById('stat-total-global')) document.getElementById('stat-total-global').innerText = counts.total;
    if (document.getElementById('count-habilidades')) document.getElementById('count-habilidades').innerText = counts.hab;
    if (document.getElementById('count-programacion')) document.getElementById('count-programacion').innerText = counts.prog;
}

function processAndClean(key) {
    const map = new Map();
    studentData[key].forEach(s => {
        if (!s.sexo || s.sexo.length < 1 || s.sexo === 'N/A' || s.sexo === 'O') {
            s.sexo = guessGender(s.full_name);
        }
        map.set(s.dni, s);
    });
    studentData[key] = Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
}

function guessGender(fullName) {
    if (!fullName) return 'M';
    const parts = fullName.split(',');
    const namePart = parts.length > 1 ? parts[1].trim() : parts[0].trim();
    const firstName = namePart.split(' ')[0].toUpperCase();

    const femaleNames = ['MARIA', 'ANA', 'ELENA', 'MARTA', 'LAURA', 'PAULA', 'LUCIA', 'SOFIA', 'JULIA', 'CARMEN', 'BELEN', 'MILAGROS', 'LOURDES', 'INES', 'ESTHER', 'ROSARIO', 'BEATRIZ', 'RAQUEL', 'VALENTINA', 'CONSTANZA', 'SABRINA', 'JAQUELINA', 'MARISOL', 'KARINA', 'MONICA', 'SILVIA', 'ANDREA', 'PATRICIA', 'ADRIANA', 'GRISELDA', 'CLAUDIA'];
    const femaleEndings = ['A', 'INA', 'ELA', 'IA', 'RA', 'ITH', 'IS', 'ETH'];

    if (femaleNames.includes(firstName)) return 'F';
    for (let end of femaleEndings) { if (firstName.endsWith(end)) return 'F'; }
    return 'M';
}

// DASHBOARD FILTRADO
function updateDashboardView(type) {
    const title = document.getElementById('dashboard-view-title');
    let data = [];
    if (type === 'global') {
        title.innerText = "Análisis Global de Matrícula";
        data = [...studentData.habilidades, ...studentData.programacion];
    } else if (type === 'habilidades') {
        title.innerText = "Habilidades Digitales & IA";
        data = studentData.habilidades;
    } else {
        title.innerText = "Software & Videojuegos";
        data = studentData.programacion;
    }
    renderCharts(data);
}

function renderCharts(all) {
    Object.values(charts).forEach(c => c.destroy());
    const opt = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
        }
    };

    // Trabajo
    const trabaja = all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length;
    charts.trabajo = new Chart(document.getElementById('chart-trabajo'), {
        type: 'pie',
        data: { labels: ['Trabaja', 'No Trabaja'], datasets: [{ data: [trabaja, all.length - trabaja], backgroundColor: ['#00B9E8', '#e2e8f0'] }] },
        options: opt
    });

    // Estudios
    const edu = {};
    all.forEach(s => { if (s.nivel_educativo) edu[s.nivel_educativo] = (edu[s.nivel_educativo] || 0) + 1; });
    charts.estudios = new Chart(document.getElementById('chart-estudios'), {
        type: 'bar',
        data: { labels: Object.keys(edu), datasets: [{ label: 'Alumnos', data: Object.values(edu), backgroundColor: '#00B9E8' }] },
        options: { ...opt, plugins: { legend: { display: false } } }
    });

    // Sexo
    const sexo = { M: all.filter(s => s.sexo === 'M').length, F: all.filter(s => s.sexo === 'F').length };
    charts.sexo = new Chart(document.getElementById('chart-sexo'), {
        type: 'doughnut',
        data: { labels: ['Manculino', 'Femenino'], datasets: [{ data: [sexo.M, sexo.F], backgroundColor: ['#1e293b', '#FF6384'] }] },
        options: opt
    });

    // Edad
    const ages = { '18-25': 0, '26-35': 0, '36-45': 0, '46+': 0 };
    all.forEach(s => {
        let a = parseInt(s.edad);
        if (isNaN(a) && s.nacimiento) a = new Date().getFullYear() - new Date(s.nacimiento).getFullYear();
        if (a <= 25) ages['18-25']++; else if (a <= 35) ages['26-35']++; else if (a <= 45) ages['36-45']++; else ages['46+']++;
    });
    charts.edades = new Chart(document.getElementById('chart-edades'), {
        type: 'bar',
        data: { labels: Object.keys(ages), datasets: [{ label: 'Alumnos', data: Object.values(ages), backgroundColor: '#1e293b' }] },
        options: { ...opt, plugins: { legend: { display: false } } }
    });
}

// TABLAS Y VACIADO
async function showTable(course) {
    currentViewedCourse = course;
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById('table-section').classList.remove('hidden');
    document.getElementById('current-course-title').innerText = course === 'habilidades' ? 'Habilidades Digitales & IA' : 'Software & Videojuegos';

    const tbody = document.querySelector('#students-table tbody');
    tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';

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
                <td style="text-align:center">${corr.length}</td>
                <td style="text-align:center"><strong>${prom}</strong></td>
                <td>
                    <button class="btn-correct ${pend.length > 0 ? 'alert' : ''}" onclick="viewWorks('${s.dni}')">
                        ${pend.length > 0 ? '🔔 Revisar' : '📂 Ver'}
                    </button>
                    <button onclick="deleteStudent('${course}', '${s.dni}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) { console.error(err); }
}

async function deleteCourseData() {
    if (!confirm(`¿Estás SEGURO de vaciar TODA la lista de ${currentViewedCourse}? Esta acción no se puede deshacer.`)) return;
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

// GESTIÓN DE CLASES 2.0 (Teoría + Actividad)
function switchClaseType(type) {
    currentClaseTab = type;
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.innerText.toLowerCase().includes(type === 'habilidades' ? 'habilidades' : 'videojuegos'));
    });
    loadClasesAdmin();
}

async function saveMaterial() {
    const fileT = document.getElementById('pdf-teoria').files[0];
    const fileA = document.getElementById('pdf-actividad').files[0];
    const sem = document.getElementById('clase-semana').value;
    const fPub = document.getElementById('clase-fecha-pub').value;

    if (!sem || !fPub || (!fileT && !fileA)) return alert("Completa al menos un archivo, la semana y la fecha.");

    const btn = document.getElementById('btn-save-material');
    btn.innerText = "⏳ Subiendo material...";
    btn.disabled = true;

    try {
        let urlT = '', nameT = '';
        let urlA = '', nameA = '';

        if (fileT) {
            const refT = storage.ref().child(`clases/${currentClaseTab}/Semana_${sem}/Teoria_${fileT.name}`);
            await refT.put(fileT);
            urlT = await refT.getDownloadURL();
            nameT = fileT.name;
        }

        if (fileA) {
            const refA = storage.ref().child(`clases/${currentClaseTab}/Semana_${sem}/Actividad_${fileA.name}`);
            await refA.put(fileA);
            urlA = await refA.getDownloadURL();
            nameA = fileA.name;
        }

        await db.collection('clases').add({
            curso: currentClaseTab,
            semana: parseInt(sem),
            fecha_publicacion: fPub,
            teoria_url: urlT, teoría_nombre: nameT,
            actividad_url: urlA, actividad_nombre: nameA,
            fecha_creacion: new Date().toISOString()
        });

        alert("¡Material subido con éxito!");
        document.getElementById('pdf-teoria').value = '';
        document.getElementById('pdf-actividad').value = '';
        loadClasesAdmin();
    } catch (err) { alert("Error: " + err.message); }
    finally {
        btn.innerText = "Subir Material de Semana";
        btn.disabled = false;
    }
}

async function loadClasesAdmin() {
    const cont = document.getElementById('clases-list-container');
    cont.innerHTML = '<p>Cargando materiales...</p>';
    try {
        const snap = await db.collection('clases').where('curso', '==', currentClaseTab).orderBy('semana', 'desc').get();
        cont.innerHTML = '';
        if (snap.empty) cont.innerHTML = '<p>No hay materiales para este curso.</p>';

        snap.docs.forEach(doc => {
            const c = doc.data();
            const isPub = new Date(c.fecha_publicacion) <= new Date();
            const div = document.createElement('div');
            div.className = 'clase-item-row';
            div.innerHTML = `
                <div style="font-weight:700">Semana ${c.semana}</div>
                <div>${c.teoría_nombre || '---'} (Teoría)</div>
                <div>${c.actividad_nombre || '---'} (Actividad)</div>
                <div class="status-pub ${isPub ? 'pub-active' : 'pub-soon'}">
                    ${isPub ? '🔓 Visible' : '🔒 Programada: ' + c.fecha_publicacion}
                </div>
                <div><button onclick="delClase('${doc.id}')">🗑️ Eliminar</button></div>
            `;
            cont.appendChild(div);
        });
    } catch (err) { console.error(err); }
}

async function delClase(id) { if (confirm("¿Eliminar este material?")) { await db.collection('clases').doc(id).delete(); loadClasesAdmin(); } }

// EVENTOS Y NAVEGACIÓN
document.getElementById('btn-clear-course')?.addEventListener('click', deleteCourseData);
document.getElementById('btn-save-material')?.addEventListener('click', saveMaterial);

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = link.getAttribute('data-section');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

        if (sec === 'dashboard') {
            document.getElementById('dashboard-section').classList.remove('hidden');
            updateDashboardView('global');
        } else if (sec === 'clases') {
            document.getElementById('clases-section').classList.remove('hidden');
            loadClasesAdmin();
        } else if (sec === 'habilidades' || sec === 'programacion') {
            showTable(sec);
        }
    });
});

async function deleteStudent(course, dni) {
    if (!confirm("¿Eliminar alumno?")) return;
    const coll = course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
    await db.collection(coll).doc(dni).delete();
    await loadStudentsFromFirebase();
}

function initNotifications() {
    if (notificationsListener) notificationsListener();
    notificationsListener = db.collection('entregas').where('estado', '==', 'Pendiente').onSnapshot(snap => {
        const badge = document.getElementById('notif-count');
        if (snap.size > 0) {
            badge.innerText = snap.size;
            badge.classList.remove('hidden');
        } else { badge.classList.add('hidden'); }
    });
}

loadStudentsFromFirebase();
