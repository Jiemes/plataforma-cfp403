// Administración CFP 403 - Lógica Inteligente 4.0
let studentData = { habilidades: [], programacion: [] };
let currentViewedCourse = '';
let charts = {};
let notificationsListener = null;

// CARGA INICIAL
async function loadStudentsFromFirebase() {
    try {
        const snapHab = await db.collection('alumnos_habilidades').get();
        studentData.habilidades = snapHab.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processAndClean('habilidades');
        const countHab = document.getElementById('count-habilidades');
        if (countHab) countHab.innerText = studentData.habilidades.length;

        const snapProg = await db.collection('alumnos_programacion').get();
        studentData.programacion = snapProg.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processAndClean('programacion');
        const countProg = document.getElementById('count-programacion');
        if (countProg) countProg.innerText = studentData.programacion.length;

        updateDashboard();
        if (currentViewedCourse) showTable(currentViewedCourse);
        initNotifications();
    } catch (err) { console.error("Error crítico:", err); }
}

// Limpieza y Detección de Sexo Automática
function processAndClean(key) {
    const map = new Map();
    studentData[key].forEach(s => {
        // Autodetección de sexo si no viene definido o es incorrecto
        if (!s.sexo || s.sexo.length < 1 || s.sexo === 'N/A') {
            s.sexo = guessGender(s.full_name);
        }
        map.set(s.dni, s);
    });
    studentData[key] = Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
}

function guessGender(fullName) {
    if (!fullName) return 'O';
    const name = fullName.split(',').pop().trim().toUpperCase().split(' ')[0];
    const femaleEndings = ['A', 'INA', 'ELA', 'IA', 'RA', 'ITH', 'IS', 'ETH'];
    const femaleNames = ['MARIA', 'ANA', 'ELENA', 'MARTA', 'LAURA', 'PAULA', 'LUCIA', 'SOFIA', 'JULIA', 'CARMEN', 'BELEN', 'MILAGROS', 'LOURDES', 'INES', 'ESTHER', 'ROSARIO', 'BEATRIZ', 'RAQUEL', 'VALENTINA', 'CONSTANZA'];

    if (femaleNames.includes(name)) return 'F';
    for (let end of femaleEndings) {
        if (name.endsWith(end)) return 'F';
    }
    return 'M'; // Por defecto Masculino para el resto de casos comunes en español que no terminen en A
}

function updateDashboard() {
    const all = [...studentData.habilidades, ...studentData.programacion];
    const globalTotal = document.getElementById('stat-total-global');
    if (globalTotal) globalTotal.innerText = all.length;
    if (all.length > 0) renderCharts(all);
}

function renderCharts(all) {
    Object.values(charts).forEach(c => c.destroy());
    const opt = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 15, font: { size: 11 } } },
            tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 10 }
        }
    };

    // Distribución Laboral (Simplificado)
    const trabajaCount = all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length;
    charts.trabajo = new Chart(document.getElementById('chart-trabajo'), {
        type: 'pie',
        data: { labels: ['Trabaja', 'No Trabaja'], datasets: [{ data: [trabajaCount, all.length - trabajaCount], backgroundColor: ['#00B9E8', '#e2e8f0'], borderWidth: 0 }] },
        options: opt
    });

    // Nivel Educativo
    const edu = {};
    all.forEach(s => { if (s.nivel_educativo) edu[s.nivel_educativo] = (edu[s.nivel_educativo] || 0) + 1; });
    charts.estudios = new Chart(document.getElementById('chart-estudios'), {
        type: 'bar',
        data: { labels: Object.keys(edu), datasets: [{ label: 'Cantidad', data: Object.values(edu), backgroundColor: '#00B9E8', borderRadius: 8 }] },
        options: { ...opt, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } } }
    });

    // Distribución por Sexo (Autocalculado)
    const sexo = { M: all.filter(s => s.sexo === 'M').length, F: all.filter(s => s.sexo === 'F').length, O: all.filter(s => s.sexo === 'O').length };
    charts.sexo = new Chart(document.getElementById('chart-sexo'), {
        type: 'doughnut',
        data: { labels: ['Masculino', 'Femenino', 'Otro'], datasets: [{ data: [sexo.M, sexo.F, sexo.O], backgroundColor: ['#1e293b', '#FF6384', '#FFCE56'], cutout: '65%', borderWidth: 0 }] },
        options: opt
    });

    // Rango de Edades
    const age = { '18-25': 0, '26-35': 0, '36-45': 0, '46+': 0 };
    all.forEach(s => {
        let a = parseInt(s.edad);
        if (isNaN(a) && s.nacimiento) a = new Date().getFullYear() - new Date(s.nacimiento).getFullYear();
        if (a <= 25) age['18-25']++; else if (a <= 35) age['26-35']++; else if (a <= 45) age['36-45']++; else if (a > 45) age['46+']++;
    });
    charts.edades = new Chart(document.getElementById('chart-edades'), {
        type: 'bar',
        data: { labels: Object.keys(age), datasets: [{ data: Object.values(age), backgroundColor: '#1e293b', borderRadius: 8 }] },
        options: { ...opt, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false } }, x: { grid: { display: false } } } }
    });
}

// TABLAS UNIFICADAS
async function showTable(courseKey) {
    currentViewedCourse = courseKey;
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById('table-section').classList.remove('hidden');
    document.getElementById('current-course-title').innerText = courseKey === 'habilidades' ? 'Habilidades Digitales & IA' : 'Software & Videojuegos';

    // UI Cards
    document.getElementById('card-total-unificados').style.display = 'none';
    document.getElementById('card-count-habilidades').style.display = courseKey === 'habilidades' ? 'block' : 'none';
    document.getElementById('card-count-programacion').style.display = courseKey === 'programacion' ? 'block' : 'none';

    try {
        const snapEntregas = await db.collection('entregas').where('curso', '==', courseKey).get();
        const entregas = snapEntregas.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const tbody = document.querySelector('#students-table tbody');
        tbody.innerHTML = '';

        studentData[courseKey].forEach(s => {
            const sEnt = entregas.filter(e => e.alumno_dni === s.dni);
            const corr = sEnt.filter(e => e.estado === 'Calificado');
            const pend = sEnt.filter(e => e.estado === 'Pendiente');
            const prom = corr.length > 0 ? (corr.reduce((acc, e) => acc + parseFloat(e.nota), 0) / corr.length).toFixed(1) : '-';

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
                    <button class="btn-icon" onclick="deleteStudent('${courseKey}', '${s.dni}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) { console.error(err); }
}

// GESTIÓN DE CLASES - ROBUSTO
document.getElementById('btn-save-clases')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('upload-pdfs');
    const files = Array.from(fileInput.files);
    const curso = document.getElementById('select-curso-clase').value;
    if (files.length === 0) return alert("Selecciona archivos PDF.");

    const btn = document.getElementById('btn-save-clases');
    btn.innerHTML = '<span>⏳ Subiendo...</span>';
    btn.disabled = true;

    try {
        console.log("Iniciando batch de subida...");
        for (const f of files) {
            const m = f.name.match(/(\d+)/);
            const s = m ? parseInt(m[0]) : 1;
            const path = `clases/${curso}/Semana_${s}/${Date.now()}_${f.name}`;
            const ref = storage.ref().child(path);

            console.log(`Subiendo ${f.name}...`);
            await ref.put(f);
            const url = await ref.getDownloadURL();

            await db.collection('clases').add({
                curso, semana: s, nombre: f.name, url, visible: true, fecha: new Date().toISOString()
            });
        }
        alert("¡Éxito! Clases habilitadas correctamente.");
        fileInput.value = '';
        await loadClasesAdmin();
    } catch (err) {
        console.error("Fallo en subida:", err);
        alert("Error crítico durante la subida. Verifica tu conexión.");
    } finally {
        btn.innerHTML = 'Subir Clases Seleccionadas';
        btn.disabled = false;
    }
});

async function loadClasesAdmin() {
    try {
        const snap = await db.collection('clases').orderBy('semana', 'asc').get();
        const cont = document.getElementById('clases-list-admin');
        if (!cont) return;
        cont.innerHTML = '';
        snap.docs.forEach(doc => {
            const c = doc.data();
            const div = document.createElement('div');
            div.className = 'clase-item-admin';
            div.innerHTML = `
                <span><strong>Semana ${c.semana}:</strong> ${c.nombre} (${c.curso})</span>
                <div class="clase-actions">
                    <button class="btn-toggle-view ${c.visible ? 'active' : ''}" onclick="toggleClase('${doc.id}', ${c.visible})">${c.visible ? 'Visible' : 'Oculta'}</button>
                    <button class="btn-icon" onclick="delClase('${doc.id}')">🗑️</button>
                </div>`;
            cont.appendChild(div);
        });
    } catch (err) { console.error(err); }
}

async function toggleClase(id, cur) { await db.collection('clases').doc(id).update({ visible: !cur }); loadClasesAdmin(); }
async function delClase(id) { if (confirm("¿Eliminar clase?")) { await db.collection('clases').doc(id).delete(); loadClasesAdmin(); } }

// NOTIFICACIONES
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

// NAVEGACIÓN - SOLUCIÓN DE SALTOS DE INTERFAZ
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = link.getAttribute('data-section');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

        if (sec === 'dashboard') {
            document.getElementById('dashboard-section').classList.remove('hidden');
            document.getElementById('card-total-unificados').style.display = 'block';
            document.getElementById('card-count-habilidades').style.display = 'block';
            document.getElementById('card-count-programacion').style.display = 'block';
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
document.getElementById('btn-logout')?.addEventListener('click', () => { if (confirm("¿Cerrar sesión?")) authFirebase.signOut().then(() => window.location.href = 'index.html'); });
