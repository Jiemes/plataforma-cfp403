// Manejo de datos de estudiantes con Firebase Firestore
let studentData = {
    habilidades: [],
    programacion: []
};

let charts = {}; // Para guardar las instancias de Chart.js

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
    } catch (error) {
        console.error("Error cargando alumnos:", error);
    }
}

function sortAndCleanDuplicates(courseKey) {
    const uniqueMap = new Map();
    studentData[courseKey].forEach(student => {
        uniqueMap.set(student.dni, student);
    });

    studentData[courseKey] = Array.from(uniqueMap.values()).sort((a, b) => {
        return (a.full_name || "").localeCompare(b.full_name || "");
    });
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
        trabajando: all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length
    };

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
        `;
    }
}

function renderCharts(all) {
    // 1. Destruir gráficos anteriores si existen
    Object.values(charts).forEach(chart => chart.destroy());

    // 2. Procesar Datos para Gráficos
    const dataTrabajo = {
        'Trabaja': all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length,
        'No Trabaja': all.filter(s => s.trabajo_actual && s.trabajo_actual.toUpperCase().includes('NO')).length
    };

    const dataEstudios = {};
    all.forEach(s => {
        if (s.nivel_educativo) {
            dataEstudios[s.nivel_educativo] = (dataEstudios[s.nivel_educativo] || 0) + 1;
        }
    });

    const dataSexo = {
        'Masculino': all.filter(s => s.sexo && s.sexo.toUpperCase().startsWith('M')).length,
        'Femenino': all.filter(s => s.sexo && s.sexo.toUpperCase().startsWith('F')).length,
        'Otro/NS': all.filter(s => !s.sexo || (!s.sexo.toUpperCase().startsWith('M') && !s.sexo.toUpperCase().startsWith('F'))).length
    };

    // Procesar Edades (Si no hay edad, calcular de fecha o usar rango)
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

    // 3. Inicializar Chart.js
    const commonOptions = { responsive: true, maintainAspectRatio: false };

    charts.trabajo = new Chart(document.getElementById('chart-trabajo'), {
        type: 'pie',
        data: {
            labels: Object.keys(dataTrabajo),
            datasets: [{ data: Object.values(dataTrabajo), backgroundColor: ['#00B9E8', '#e2e8f0'] }]
        },
        options: commonOptions
    });

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

// Re-vincular carga inicial
loadStudentsFromFirebase();

// Manejo de Archivos Excel
document.getElementById('upload-habilidades')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'habilidades'));
document.getElementById('upload-programacion')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'programacion'));

function processExcel(file, courseType) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet);

        const transformed = json.map(row => ({
            dni: String(row['CUÁL ES SU NÚMERO DE DOCUMENTO?'] || row['DNI'] || row['Documento'] || '').trim(),
            email: row['Dirección de correo electrónico'] || row['Email'] || '',
            apellido: row['CUÁLES SON SUS APELLIDOS?'] || row['Apellidos'] || '',
            nombre: row['CUÁLES SON SUS NOMBRES?'] || row['Nombres'] || '',
            full_name: `${row['CUÁLES SON SUS APELLIDOS?'] || ''}, ${row['CUÁLES SON SUS NOMBRES?'] || ''}`.toUpperCase().trim(),
            nacimiento: row['CUÁL ES SU FECHA DE NACIMIENTO?'] || '',
            direccion: row['CUÁL ES LA DIRECCIÓN ACTUAL DONDE VIVE?'] || '',
            telefono: row['CUÁL ES SU NÚMERO DE TELÉFONO?'] || row['Teléfono'] || row['Telefono'] || '',
            nivel_educativo: row['CUÁL ES SU NIVEL EDUCATIVO ALCANZADO?'] || '',
            trabajo_actual: row['CUÁL ES SU TRABAJO ACTUAL? (DE NO TRABAJAR SOLO ESCRIBA NO)'] || '',
            busca_trabajo: row['BUSCA TRABAJO U OTRO TRABAJO?'] || '',
            sexo: row['SEXO'] || row['GENERO'] || '', // Capturar sexo del excel
            edad: row['EDAD'] || '', // Capturar edad si existe
            fecha_importacion: new Date().toISOString()
        })).filter(s => s.dni && s.dni.length > 5);

        const collectionName = courseType === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
        const batch = db.batch();
        transformed.forEach(student => batch.set(db.collection(collectionName).doc(student.dni), student));

        try {
            await batch.commit();
            alert(`¡Éxito! Importados ${transformed.length} alumnos.`);
            loadStudentsFromFirebase();
        } catch (error) { console.error(error); alert("Error en Firebase."); }
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
            document.getElementById('dashboard-section').classList.remove('hidden');
            document.getElementById('table-section').classList.add('hidden');
        } else if (sectionId === 'habilidades' || sectionId === 'programacion') {
            showTable(sectionId);
        }
    });
});

function showTable(courseKey) {
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById('table-section').classList.remove('hidden');
    document.getElementById('current-course-title').innerText =
        courseKey === 'habilidades' ? 'Alumnos: Habilidades Digitales & IA' : 'Alumnos: Desarrollo de Software & Videojuegos';

    const tbody = document.querySelector('#students-table tbody');
    tbody.innerHTML = '';

    studentData[courseKey].forEach((student) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${student.full_name}</td>
            <td>${student.dni}</td>
            <td>${student.telefono || 'Sin datos'}</td>
            <td>${student.email}</td>
            <td>
                <button class="btn-edit" onclick="editStudent('${courseKey}', '${student.dni}')">✏️</button>
                <button class="btn-delete" onclick="deleteStudent('${courseKey}', '${student.dni}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function editStudent(course, dni) {
    const student = studentData[course].find(s => s.dni === dni);
    const newEmail = prompt(`Editar email para ${student.full_name}:`, student.email);
    if (newEmail) {
        try {
            await db.collection(course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion').doc(dni).update({ email: newEmail });
            loadStudentsFromFirebase();
            showTable(course);
        } catch (error) { console.error(error); }
    }
}

async function deleteStudent(course, dni) {
    if (confirm('¿Seguro?')) {
        try {
            await db.collection(course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion').doc(dni).delete();
            loadStudentsFromFirebase();
            showTable(course);
        } catch (error) { console.error(error); }
    }
}

document.getElementById('btn-logout')?.addEventListener('click', () => {
    authFirebase.signOut().then(() => window.location.href = 'index.html');
});
