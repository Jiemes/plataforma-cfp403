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
    // 1. Eliminar duplicados por DNI (quedarse con el último)
    const uniqueMap = new Map();
    studentData[courseKey].forEach(student => {
        uniqueMap.set(student.dni, student);
    });

    // 2. Convertir a array y ordenar alfabéticamente por apellido
    studentData[courseKey] = Array.from(uniqueMap.values()).sort((a, b) => {
        return (a.full_name || "").localeCompare(b.full_name || "");
    });
}

function calculateStats() {
    const all = [...studentData.habilidades, ...studentData.programacion];
    if (all.length === 0) return;

    // Ejemplo de estadísticas (puedes ampliar según las columnas de tu Excel)
    const stats = {
        total: all.length,
        hombres: all.filter(s => s.sexo === 'Masculino').length,
        mujeres: all.filter(s => s.sexo === 'Femenino').length,
    };

    const statsDiv = document.getElementById('stats-summary');
    if (statsDiv) {
        // Mostrar sección si hay datos
        document.getElementById('advanced-stats-section').classList.remove('hidden');
        statsDiv.innerHTML = `
            <p><strong>Total estudiantes únicos:</strong> ${stats.total}</p>
            <p>Se han eliminado duplicados automáticamente por DNI.</p>
        `;
    }
}

// Ejecutar carga inicial
loadStudentsFromFirebase();

// Handle Habilidades Upload
document.getElementById('upload-habilidades')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        processExcel(file, 'habilidades');
    }
});

// Handle Programacion Upload
document.getElementById('upload-programacion')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        processExcel(file, 'programacion');
    }
});

function processExcel(file, courseType) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        // Transform data to our format, capturing all possible fields for stats
        const transformed = json.map(row => ({
            dni: String(row['CUÁL ES SU NÚMERO DE DOCUMENTO?'] || row['DNI'] || row['Nro de documento'] || '').trim(),
            nombre: row['CUÁLES SON SUS NOMBRES?'] || row['Nombres'] || '',
            apellido: row['CUÁLES SON SUS APELLIDOS?'] || row['Apellidos'] || '',
            email: row['Dirección de correo electrónico'] || row['Email'] || '',
            telefono: row['CUÁL ES SU NÚMERO DE TELÉFONO PERSONAL?'] || row['Teléfono'] || row['Telefono'] || '',
            sexo: row['SEXO'] || row['Sexo'] || '',
            edad: row['EDAD'] || row['Edad'] || '',
            ocupacion: row['OCUPACIÓN'] || row['Ocupación'] || '',
            full_name: `${row['CUÁLES SON SUS APELLIDOS?'] || row['Apellidos'] || ''}, ${row['CUÁLES SON SUS NOMBRES?'] || row['Nombres'] || ''}`.toUpperCase().trim()
        })).filter(s => s.dni); // Evitar filas vacías sin DNI

        // Guardar en Firebase
        const collectionName = courseType === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
        const batch = db.batch();

        transformed.forEach(student => {
            const docRef = db.collection(collectionName).doc(student.dni);
            batch.set(docRef, student);
        });

        try {
            await batch.commit();
            alert(`¡Éxito! Se han guardado ${transformed.length} registros. Se han unificado duplicados por DNI.`);
            loadStudentsFromFirebase();
        } catch (error) {
            console.error("Error al guardar en Firebase:", error);
            alert("Error al guardar en la base de datos.");
        }
    };
    reader.readAsArrayBuffer(file);
}

// Navigation Logic
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
            <td>${student.telefono || '-'}</td>
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
    const collectionName = course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
    const newEmail = prompt(`Editar email para el DNI ${dni}:`);
    if (newEmail) {
        try {
            await db.collection(collectionName).doc(dni).update({ email: newEmail });
            loadStudentsFromFirebase();
            showTable(course);
        } catch (error) { console.error(error); }
    }
}

async function deleteStudent(course, dni) {
    if (confirm('¿Está seguro de eliminar este alumno?')) {
        const collectionName = course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
        try {
            await db.collection(collectionName).doc(dni).delete();
            loadStudentsFromFirebase();
            showTable(course);
        } catch (error) { console.error(error); }
    }
}

document.getElementById('btn-logout')?.addEventListener('click', () => {
    authFirebase.signOut().then(() => {
        window.location.href = 'index.html';
    });
});
