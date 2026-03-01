// Administración CFP 403 - Lógica Unificada
let studentData = { habilidades: [], programacion: [] };
let currentViewedCourse = '';
let charts = {};
let notificationsListener = null;

// CARGA INICIAL
async function loadStudentsFromFirebase() {
    try {
        const snapHab = await db.collection('alumnos_habilidades').get();
        studentData.habilidades = snapHab.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sortAndClean('habilidades');
        const countHab = document.getElementById('count-habilidades');
        if (countHab) countHab.innerText = studentData.habilidades.length;

        const snapProg = await db.collection('alumnos_programacion').get();
        studentData.programacion = snapProg.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sortAndClean('programacion');
        const countProg = document.getElementById('count-programacion');
        if (countProg) countProg.innerText = studentData.programacion.length;

        updateDashboard();
        if (currentViewedCourse) showTable(currentViewedCourse);
        initNotifications();
    } catch (err) { console.error(err); }
}

function sortAndClean(key) {
    const map = new Map();
    studentData[key].forEach(s => map.set(s.dni, s));
    studentData[key] = Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
}

function updateDashboard() {
    const all = [...studentData.habilidades, ...studentData.programacion];
    const globalTotal = document.getElementById('stat-total-global');
    if (globalTotal) globalTotal.innerText = all.length;
    if (all.length > 0) { calculateStats(all); renderCharts(all); }
}

function calculateStats(all) {
    const stats = {
        total: all.length,
        buscando: all.filter(s => s.busca_trabajo && s.busca_trabajo.toUpperCase().includes('SI')).length,
        trabajando: all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length
    };
    const div = document.getElementById('stats-summary');
    if (div) {
        div.innerHTML = `
            <div class="stats-row">
                <div class="stat-mini-card"><strong>Buscando Trabajo</strong><span>${stats.buscando} (${((stats.buscando / stats.total) * 100).toFixed(1)}%)</span></div>
                <div class="stat-mini-card"><strong>Trabajando</strong><span>${stats.trabajando} (${((stats.trabajando / stats.total) * 100).toFixed(1)}%)</span></div>
            </div>
        `;
    }
}

function renderCharts(all) {
    Object.values(charts).forEach(c => c.destroy());
    const opt = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { enabled: true }
        }
    };

    // Trabajo
    const ctxT = document.getElementById('chart-trabajo');
    if (ctxT) {
        charts.trabajo = new Chart(ctxT, {
            type: 'pie',
            data: { labels: ['Sí', 'No'], datasets: [{ data: [all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length, all.filter(s => s.trabajo_actual && s.trabajo_actual.toUpperCase().includes('NO')).length], backgroundColor: ['#00B9E8', '#e2e8f0'] }] },
            options: { ...opt, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
        });
    }

    // Estudios
    const eduKeys = {};
    all.forEach(s => { if (s.nivel_educativo) eduKeys[s.nivel_educativo] = (eduKeys[s.nivel_educativo] || 0) + 1; });
    const ctxE = document.getElementById('chart-estudios');
    if (ctxE) {
        charts.estudios = new Chart(ctxE, {
            type: 'bar',
            data: { labels: Object.keys(eduKeys), datasets: [{ data: Object.values(eduKeys), backgroundColor: '#00B9E8' }] },
            options: opt
        });
    }

    // Sexo
    const sexo = { M: all.filter(s => s.sexo?.toUpperCase().startsWith('M')).length, F: all.filter(s => s.sexo?.toUpperCase().startsWith('F')).length, O: all.filter(s => !s.sexo?.toUpperCase().startsWith('M') && !s.sexo?.toUpperCase().startsWith('F')).length };
    const ctxS = document.getElementById('chart-sexo');
    if (ctxS) {
        charts.sexo = new Chart(ctxS, {
            type: 'doughnut',
            data: { labels: ['M', 'F', 'O'], datasets: [{ data: [sexo.M, sexo.F, sexo.O], backgroundColor: ['#00B9E8', '#FF6384', '#FFCE56'] }] },
            options: { ...opt, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
        });
    }

    // Edades
    const e = { '18-25': 0, '26-35': 0, '36-45': 0, '46+': 0 };
    all.forEach(s => {
        let age = parseInt(s.edad);
        if (isNaN(age) && s.nacimiento) age = new Date().getFullYear() - new Date(s.nacimiento).getFullYear();
        if (age <= 25) e['18-25']++; else if (age <= 35) e['26-35']++; else if (age <= 45) e['36-45']++; else if (age > 45) e['46+']++;
    });
    const ctxA = document.getElementById('chart-edades');
    if (ctxA) {
        charts.edades = new Chart(ctxA, {
            type: 'bar',
            data: { labels: Object.keys(e), datasets: [{ data: Object.values(e), backgroundColor: '#1e293b' }] },
            options: opt
        });
    }
}

// TABLAS UNIFICADAS (CON NOTAS)
async function showTable(courseKey) {
    currentViewedCourse = courseKey;
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById('clases-section').classList.add('hidden');
    document.getElementById('table-section').classList.remove('hidden');
    document.getElementById('current-course-title').innerText = courseKey === 'habilidades' ? 'Habilidades Digitales & IA' : 'Software & Videojuegos';

    // Tarjetas Inteligentes
    const cardTot = document.getElementById('card-total-unificados');
    const cardHab = document.getElementById('card-count-habilidades');
    const cardProg = document.getElementById('card-count-programacion');
    if (cardTot) cardTot.style.display = 'none';
    if (cardHab) cardHab.style.display = courseKey === 'habilidades' ? 'block' : 'none';
    if (cardProg) cardProg.style.display = courseKey === 'programacion' ? 'block' : 'none';

    try {
        const snapEntregas = await db.collection('entregas').where('curso', '==', courseKey).get();
        const entregas = snapEntregas.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const tbody = document.querySelector('#students-table tbody');
        tbody.innerHTML = '';

        studentData[courseKey].forEach(s => {
            const sEntregas = entregas.filter(e => e.alumno_dni === s.dni);
            const corregidas = sEntregas.filter(e => e.estado === 'Calificado');
            const pendientes = sEntregas.filter(e => e.estado === 'Pendiente');
            const notas = corregidas.map(e => parseFloat(e.nota)).filter(n => !isNaN(n));
            const promedio = notas.length > 0 ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1) : '-';
            const hasPending = pendientes.length > 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${s.full_name}</td>
                <td>${s.dni}</td>
                <td>${s.telefono || '---'}</td>
                <td>${s.email}</td>
                <td style="text-align:center">${corregidas.length}</td>
                <td style="text-align:center"><strong>${promedio}</strong></td>
                <td>
                    <button class="btn-correct ${hasPending ? 'alert' : ''}" onclick="viewWorks('${s.dni}')">
                        ${hasPending ? '🔔 Corregir' : '📂 Ver'}
                    </button>
                    <button onclick="editStudent('${courseKey}', '${s.dni}')">✏️</button>
                    <button onclick="deleteStudent('${courseKey}', '${s.dni}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) { console.error(err); }
}

// MODAL DE CALIFICACIÓN
async function viewWorks(dni) {
    const student = [...studentData.habilidades, ...studentData.programacion].find(s => s.dni === dni);
    document.getElementById('grade-modal-title').innerText = `Actividades de ${student.full_name}`;
    document.getElementById('grade-modal').classList.remove('hidden');

    const snap = await db.collection('entregas').where('alumno_dni', '==', dni).get();
    const container = document.getElementById('student-works-list');
    container.innerHTML = snap.empty ? '<p>No hay entregas registradas.</p>' : '';

    snap.docs.forEach(doc => {
        const e = doc.data();
        const div = document.createElement('div');
        div.className = 'work-item-admin';
        div.innerHTML = `
            <p><strong>Semana ${e.semana}:</strong> ${e.archivo_nombre}</p>
            <a href="${e.archivo_url}" target="_blank" class="btn-primary">📄 Ver PDF</a>
            <div class="grade-form" style="margin-top:10px;">
                <input type="number" id="n-${doc.id}" placeholder="Nota" value="${e.nota || ''}" min="1" max="10">
                <textarea id="c-${doc.id}" placeholder="Comentario...">${e.comentario || ''}</textarea>
                <button class="btn-primary" onclick="saveGrade('${doc.id}')">Guardar</button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function saveGrade(id) {
    const n = document.getElementById(`n-${id}`).value;
    const c = document.getElementById(`c-${id}`).value;
    if (!n) return alert("Falta la nota");
    await db.collection('entregas').doc(id).update({ nota: n, comentario: c, estado: 'Calificado' });
    alert("Calificación guardada");
    showTable(currentViewedCourse);
}

function closeGradeModal() { document.getElementById('grade-modal').classList.add('hidden'); }

// GESTIÓN DE CLASES
document.getElementById('btn-save-clases')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('upload-pdfs');
    const files = fileInput.files;
    const curso = document.getElementById('select-curso-clase').value;
    if (files.length === 0) return alert("Selecciona archivos PDF");

    const btn = document.getElementById('btn-save-clases');
    btn.innerText = "Subiendo...";
    btn.disabled = true;

    try {
        for (const f of files) {
            const m = f.name.match(/(\d+)/);
            const s = m ? parseInt(m[0]) : 1;
            const ref = storage.ref().child(`clases/${curso}/Semana_${s}/${f.name}`);
            await ref.put(f);
            const url = await ref.getDownloadURL();
            await db.collection('clases').add({ curso, semana: s, nombre: f.name, url, visible: true, fecha: new Date().toISOString() });
        }
        alert("¡Clases subidas con éxito!");
        fileInput.value = '';
        await loadClasesAdmin();
    } catch (err) {
        alert("Error subiendo: " + err.message);
        console.error(err);
    } finally {
        btn.innerText = "Subir Clases Seleccionadas";
        btn.disabled = false;
    }
});

async function loadClasesAdmin() {
    const snap = await db.collection('clases').orderBy('semana', 'asc').get();
    const cont = document.getElementById('clases-list-admin');
    cont.innerHTML = '';
    snap.docs.forEach(doc => {
        const c = doc.data();
        const div = document.createElement('div');
        div.className = 'clase-item-admin';
        div.innerHTML = `
            <span>Semana ${c.semana}: ${c.nombre} (${c.curso})</span>
            <div class="clase-actions">
                <button class="btn-toggle-view ${c.visible ? 'active' : ''}" onclick="toggleClase('${doc.id}', ${c.visible})">${c.visible ? 'Visible' : 'Oculta'}</button>
                <button onclick="delClase('${doc.id}')">🗑️</button>
            </div>`;
        cont.appendChild(div);
    });
}
async function toggleClase(id, cur) { await db.collection('clases').doc(id).update({ visible: !cur }); loadClasesAdmin(); }
async function delClase(id) { if (confirm("¿Eliminar clase?")) { await db.collection('clases').doc(id).delete(); loadClasesAdmin(); } }

// NOTIFICACIONES GLOBALES
function initNotifications() {
    if (notificationsListener) notificationsListener();
    notificationsListener = db.collection('entregas').where('estado', '==', 'Pendiente').onSnapshot(snap => {
        const bell = document.getElementById('notif-bell');
        const badge = document.getElementById('notif-count');
        if (snap.size > 0) {
            bell.classList.add('bell-active');
            badge.innerText = snap.size;
            badge.classList.remove('hidden');
        } else {
            bell.classList.remove('bell-active');
            badge.classList.add('hidden');
        }
    });
}

// EXCEL IMPORT
async function processExcel(file, type) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            const trans = json.map(r => ({
                dni: String(r['CUÁL ES SU NÚMERO DE DOCUMENTO?'] || r['DNI'] || '').trim(),
                email: r['Dirección de correo electrónico'] || '',
                full_name: `${r['CUÁLES SON SUS APELLIDOS?'] || ''}, ${r['CUÁLES SON SUS NOMBRES?'] || ''}`.toUpperCase().trim(),
                telefono: r['CUÁL ES SU NÚMERO DE TELÉFONO?'] || '',
                nivel_educativo: r['CUÁL ES SU NIVEL EDUCATIVO ALCANZADO?'] || '',
                trabajo_actual: r['CUÁL ES SU TRABAJO ACTUAL? (DE NO TRABAJAR SOLO ESCRIBA NO)'] || '',
                busca_trabajo: r['BUSCA TRABAJO U OTRO TRABAJO?'] || '',
                sexo: r['SEXO'] || '', edad: r['EDAD'] || '', nacimiento: r['CUÁL ES SU FECHA DE NACIMIENTO?'] || ''
            })).filter(s => s.dni.length > 5);
            const batch = db.batch();
            const coll = type === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
            trans.forEach(s => batch.set(db.collection(coll).doc(s.dni), s));
            await batch.commit();
            alert("¡Importación exitosa! Alumnos cargados: " + trans.length);
            loadStudentsFromFirebase();
        } catch (err) { alert("Error en Excel: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
}

// NAVEGACIÓN
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = link.getAttribute('data-section');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

        if (sec === 'dashboard') {
            document.getElementById('dashboard-section').classList.remove('hidden');
            const cardTot = document.getElementById('card-total-unificados');
            const cardHab = document.getElementById('card-count-habilidades');
            const cardProg = document.getElementById('card-count-programacion');
            if (cardTot) cardTot.style.display = 'block';
            if (cardHab) cardHab.style.display = 'block';
            if (cardProg) cardProg.style.display = 'block';
        } else if (sec === 'clases') {
            document.getElementById('clases-section').classList.remove('hidden');
            loadClasesAdmin();
        } else if (sec === 'habilidades' || sec === 'programacion') {
            showTable(sec);
        }
    });
});

// INIT
loadStudentsFromFirebase();
document.getElementById('upload-habilidades')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'habilidades'));
document.getElementById('upload-programacion')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'programacion'));
document.getElementById('btn-logout')?.addEventListener('click', () => authFirebase.signOut().then(() => window.location.href = 'index.html'));
