// Manejo de datos de estudiantes con Firebase Firestore
let studentData = {
    habilidades: [],
    programacion: []
};

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

        calculateStats();
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

function calculateStats() {
    const all = [...studentData.habilidades, ...studentData.programacion];
    document.getElementById('stat-total-global').innerText = all.length;

    if (all.length === 0) return;

    // Estadísticas detalladas
    const stats = {
        total: all.length,
        buscandoTrabajo: all.filter(s => s.busca_trabajo && s.busca_trabajo.toUpperCase().includes('SI')).length,
        trabajando: all.filter(s => s.trabajo_actual && !s.trabajo_actual.toUpperCase().includes('NO')).length,
        nivelesEducativos: {}
    };

    // Frecuencia de Niveles Educativos
    all.forEach(s => {
        if (s.nivel_educativo) {
            stats.nivelesEducativos[s.nivel_educativo] = (stats.nivelesEducativos[s.nivel_educativo] || 0) + 1;
        }
    });

    const statsDiv = document.getElementById('stats-summary');
    if (statsDiv) {
        let html = `
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
            <div class="stats-education">
                <h4>Niveles Educativos:</h4>
                <ul>
                    ${Object.entries(stats.nivelesEducativos).map(([nivel, cant]) => `
                        <li><strong>${nivel}:</strong> ${cant} alumnos</li>
                    `).join('')}
                </ul>
            </div>
        `;
        statsDiv.innerHTML = html;
    }
}

// Ejecutar carga inicial
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

        // Mapeo Maestro de Columnas (Basado en tu planilla de GForms)
        const transformed = json.map(row => ({
            dni: String(row['CUÁL ES SU NÚMERO DE DOCUMENTO?'] || row['DNI'] || row['Documento'] || '').trim(),
            email: row['Dirección de correo electrónico'] || row['Email'] || '',
            apellido: row['CUÁLES SON SUS APELLIDOS?'] || row['Apellidos'] || '',
            nombre: row['CUÁLES SON SUS NOMBRES?'] || row['Nombres'] || '',
            full_name: `${row['CUÁLES SON SUS APELLIDOS?'] || ''}, ${row['CUÁLES SON SUS NOMBRES?'] || ''}`.toUpperCase().trim(),
            nacimiento: row['CUÁL ES SU FECHA DE NACIMIENTO?'] || '',
            ciudad_nacimiento: row['CUÁL ES SU CIUDAD DE NACIMIENTO?'] || '',
            direccion: row['CUÁL ES LA DIRECCIÓN ACTUAL DONDE VIVE?'] || '',
            telefono: row['CUÁL ES SU NÚMERO DE TELÉFONO?'] || row['Teléfono'] || row['Telefono'] || '',
            nivel_educativo: row['CUÁL ES SU NIVEL EDUCATIVO ALCANZADO?'] || '',
            trabajo_actual: row['CUÁL ES SU TRABAJO ACTUAL? (DE NO TRABAJAR SOLO ESCRIBA NO)'] || '',
            busca_trabajo: row['BUSCA TRABAJO U OTRO TRABAJO?'] || '',
            salud: row['TIENE ALGÚN PROBLEMA DE SALUD, ALERGIA O PATOLOGÍA? CUÁL?'] || '',
            fecha_importacion: new Date().toISOString()
        })).filter(s => s.dni && s.dni.length > 5);

        // Guardar en Firebase con batch
        const collectionName = courseType === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
        const batch = db.batch();

        transformed.forEach(student => {
            const docRef = db.collection(collectionName).doc(student.dni);
            batch.set(docRef, student);
        });

        try {
            await batch.commit();
            alert(`¡Éxito! Se han importado ${transformed.length} alumnos para ${courseType.toUpperCase()}.`);
            loadStudentsFromFirebase();
        } catch (error) {
            console.error(error);
            alert("Error al guardar en Firebase.");
        }
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
                <button class="btn-edit" title="Ver más / Editar" onclick="editStudent('${courseKey}', '${student.dni}')">✏️</button>
                <button class="btn-delete" title="Eliminar" onclick="deleteStudent('${courseKey}', '${student.dni}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function editStudent(course, dni) {
    // Por ahora solo editamos email, pero ya tenemos acceso a todo el objeto student
    const student = studentData[course].find(s => s.dni === dni);
    const newEmail = prompt(`Editar datos para ${student.full_name}\n\nEmail actual:`, student.email);
    if (newEmail) {
        try {
            await db.collection(course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion').doc(dni).update({ email: newEmail });
            loadStudentsFromFirebase();
            showTable(course);
        } catch (error) { console.error(error); }
    }
}

async function deleteStudent(course, dni) {
    if (confirm('¿Está seguro de eliminar este alumno?')) {
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
