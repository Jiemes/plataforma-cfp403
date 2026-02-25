// Manejo de datos de estudiantes con Firebase Firestore
let studentData = {
    habilidades: [],
    programacion: []
};
let currentViewedCourse = '';
let charts = {};

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

        // Si estamos viendo una tabla, refrescarla
        if (currentViewedCourse) showTable(currentViewedCourse);
    } catch (error) {
        console.error("Error cargando alumnos:", error);
    }
}

function sortAndCleanDuplicates(courseKey) {
    const uniqueMap = new Map();
    studentData[courseKey].forEach(student => {
        uniqueMap.set(student.dni, student);
    });
    studentData[courseKey] = Array.from(uniqueMap.values()).sort((a, b) =>
        (a.full_name || "").localeCompare(b.full_name || "")
    );
}

function updateDashboard() {
    const all = [...studentData.habilidades, ...studentData.programacion];
    document.getElementById('stat-total-global').innerText = all.length;

    if (all.length === 0) return;

    calculateDetailedStats(all);
    renderCharts(all);
}

function calculateDetailedStats(all) {
    const stats = {
        total: all.length,
        buscandoTrabajo: all.filter(s => s.busca_trabajo && s.busca_trabajo.toUpperCase().includes('SI')).length,
        trabajando: all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length,
        nivelesEducativos: {}
    };

    all.forEach(s => {
        if (s.nivel_educativo) {
            stats.nivelesEducativos[s.nivel_educativo] = (stats.nivelesEducativos[s.nivel_educativo] || 0) + 1;
        }
    });

    const statsDiv = document.getElementById('stats-summary');
    if (statsDiv) {
        statsDiv.innerHTML = `
            <div class="stats-row">
                <div class="stat-mini-card">
                    <strong>Buscando Trabajo</strong>
                    <span>${stats.buscandoTrabajo} (${((stats.buscandoTrabajo / stats.total) * 100).toFixed(1)}%)</span>
                </div>
                <div class="stat-mini-card">
                    <strong>Actualmente Trabajando</strong>
                    <span>${stats.trabajando} (${((stats.trabajando / stats.total) * 100).toFixed(1)}%)</span>
                </div>
            </div>
            <div class="stats-education" style="margin-top: 20px;">
                <h4>Resumen de Niveles Educativos:</h4>
                <ul style="list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    ${Object.entries(stats.nivelesEducativos).map(([nivel, cant]) => `
                        <li><strong>${nivel}:</strong> ${cant} alumnos</li>
                    `).join('')}
                </ul>
            </div>
        `;
    }
}

function renderCharts(all) {
    Object.values(charts).forEach(chart => chart.destroy());

    const dataTrabajo = {
        'Trabaja': all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length,
        'No Trabaja': all.filter(s => s.trabajo_actual && s.trabajo_actual.toUpperCase().includes('NO')).length
    };

    const dataSexo = {
        'Masculino': all.filter(s => s.sexo && s.sexo.toUpperCase().startsWith('M')).length,
        'Femenino': all.filter(s => s.sexo && s.sexo.toUpperCase().startsWith('F')).length,
        'Otro/NS': all.filter(s => !s.sexo || (!s.sexo.toUpperCase().startsWith('M') && !s.sexo.toUpperCase().startsWith('F'))).length
    };

    const dataEdades = { '18-25': 0, '26-35': 0, '36-45': 0, '46+': 0 };
    all.forEach(s => {
        let edad = parseInt(s.edad);
        if (isNaN(edad) && s.nacimiento) {
            const birthYear = new Date(s.nacimiento).getFullYear();
            if (!isNaN(birthYear)) edad = new Date().getFullYear() - birthYear;
        }
        if (edad <= 25) dataEdades['18-25']++;
        else if (edad <= 35) dataEdades['26-35']++;
        else if (edad <= 45) dataEdades['36-45']++;
        else if (edad > 45) dataEdades['46+']++;
    });

    const commonOptions = { responsive: true, maintainAspectRatio: false };

    charts.trabajo = new Chart(document.getElementById('chart-trabajo'), {
        type: 'pie',
        data: {
            labels: Object.keys(dataTrabajo),
            datasets: [{ data: Object.values(dataTrabajo), backgroundColor: ['#00B9E8', '#e2e8f0'] }]
        },
        options: commonOptions
    });

    const dataEstudios = {};
    all.forEach(s => { if (s.nivel_educativo) dataEstudios[s.nivel_educativo] = (dataEstudios[s.nivel_educativo] || 0) + 1; });

    charts.estudios = new Chart(document.getElementById('chart-estudios'), {
        type: 'bar',
        data: {
            labels: Object.keys(dataEstudios),
            datasets: [{ label: 'Alumnos', data: Object.values(dataEstudios), backgroundColor: '#00B9E8' }]
        },
        options: { ...commonOptions, scales: { y: { beginAtZero: true } } }
    });

    charts.sexo = new Chart(document.getElementById('chart-sexo'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(dataSexo),
            datasets: [{ data: Object.values(dataSexo), backgroundColor: ['#00B9E8', '#FF6384', '#FFCE56'] }]
        },
        options: commonOptions
    });

    charts.edades = new Chart(document.getElementById('chart-edades'), {
        type: 'bar',
        data: {
            labels: Object.keys(dataEdades),
            datasets: [{ label: 'Alumnos', data: Object.values(dataEdades), backgroundColor: '#1e293b' }]
        },
        options: commonOptions
    });
}

// Manejo de Archivos
document.getElementById('upload-habilidades')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'habilidades'));
document.getElementById('upload-programacion')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'programacion'));

async function processExcel(file, courseType) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        const transformed = json.map(row => ({
            dni: String(row['CUÁL ES SU NÚMERO DE DOCUMENTO?'] || row['DNI'] || row['Documento'] || '').trim(),
            email: row['Dirección de correo electrónico'] || row['Email'] || '',
            full_name: `${row['CUÁLES SON SUS APELLIDOS?'] || ''}, ${row['CUÁLES SON SUS NOMBRES?'] || ''}`.toUpperCase().trim(),
            telefono: row['CUÁL ES SU NÚMERO DE TELÉFONO?'] || row['Teléfono'] || row['Telefono'] || '',
            nivel_educativo: row['CUÁL ES SU NIVEL EDUCATIVO ALCANZADO?'] || '',
            trabajo_actual: row['CUÁL ES SU TRABAJO ACTUAL? (DE NO TRABAJAR SOLO ESCRIBA NO)'] || '',
            busca_trabajo: row['BUSCA TRABAJO U OTRO TRABAJO?'] || '',
            sexo: row['SEXO'] || row['GENERO'] || '',
            edad: row['EDAD'] || '',
            nacimiento: row['CUÁL ES SU FECHA DE NACIMIENTO?'] || ''
        })).filter(s => s.dni && s.dni.length > 5);

        const collection = courseType === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
        const batch = db.batch();
        transformed.forEach(s => batch.set(db.collection(collection).doc(s.dni), s));
        await batch.commit();
        alert('Importación completada.');
        loadStudentsFromFirebase();
    };
    reader.readAsArrayBuffer(file);
}

// Navegación
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = link.getAttribute('data-section');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        if (sectionId === 'dashboard') {
            currentViewedCourse = '';
            document.getElementById('dashboard-section').classList.remove('hidden');
            document.getElementById('table-section').classList.add('hidden');
        } else if (sectionId === 'habilidades' || sectionId === 'programacion') {
            showTable(sectionId);
        }
    });
});

function showTable(courseKey) {
    currentViewedCourse = courseKey;
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById('table-section').classList.remove('hidden');
    document.getElementById('current-course-title').innerText =
        courseKey === 'habilidades' ? 'Alumnos: Habilidades Digitales & IA' : 'Alumnos: Desarrollo de Software & Videojuegos';

    const tbody = document.querySelector('#students-table tbody');
    tbody.innerHTML = '';

    studentData[courseKey].forEach((s) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.full_name}</td>
            <td>${s.dni}</td>
            <td>${s.telefono || 'Sin datos'}</td>
            <td>${s.email}</td>
            <td>
                <button class="btn-edit" onclick="editStudent('${courseKey}', '${s.dni}')">✏️</button>
                <button class="btn-delete" onclick="deleteStudent('${courseKey}', '${s.dni}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Boton Vaciar Lista
document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'btn-clear-course') {
        if (!currentViewedCourse) return;
        const courseName = currentViewedCourse === 'habilidades' ? 'Habilidades Digitales' : 'Software & Videojuegos';
        if (confirm(`¿ESTÁ SEGURO DE ELIMINAR TODOS los alumnos de ${courseName.toUpperCase()}? Esta acción no se puede deshacer.`)) {
            const collection = currentViewedCourse === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
            const snapshot = await db.collection(collection).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            alert('Lista vaciada con éxito.');
            loadStudentsFromFirebase();
        }
    }
});

async function editStudent(course, dni) {
    const student = studentData[course].find(s => s.dni === dni);
    const newEmail = prompt(`Editar email para ${student.full_name}:`, student.email);
    if (newEmail) {
        await db.collection(course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion').doc(dni).update({ email: newEmail });
        loadStudentsFromFirebase();
    }
}

async function deleteStudent(course, dni) {
    if (confirm('¿Eliminar alumno?')) {
        await db.collection(course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion').doc(dni).delete();
        loadStudentsFromFirebase();
    }
}

document.getElementById('btn-logout')?.addEventListener('click', () => {
    authFirebase.signOut().then(() => window.location.href = 'index.html');
});

// Forzar recarga inicial
loadStudentsFromFirebase();
console.log("V.2.0 - Dashboard con gráficos y limpieza activa");
