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
        document.getElementById('count-habilidades').innerText = studentData.habilidades.length;

        const snapshotProgramacion = await db.collection('alumnos_programacion').get();
        studentData.programacion = snapshotProgramacion.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('count-programacion').innerText = studentData.programacion.length;
    } catch (error) {
        console.error("Error cargando alumnos:", error);
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

        console.log(`Cargados ${json.length} alumnos para ${courseType}`);

        // Transform data to our format
        const transformed = json.map(row => ({
            dni: String(row['CUÁL ES SU NÚMERO DE DOCUMENTO?'] || row['DNI']),
            nombre: row['CUÁLES SON SUS NOMBRES?'] || '',
            apellido: row['CUÁLES SON SUS APELLIDOS?'] || '',
            email: row['Dirección de correo electrónico'] || '',
            full_name: `${row['CUÁLES SON SUS APELLIDOS?'] || ''}, ${row['CUÁLES SON SUS NOMBRES?'] || ''}`.toUpperCase()
        }));

        // Guardar en Firebase
        const collectionName = courseType === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
        const batch = db.batch();

        transformed.forEach(student => {
            const docRef = db.collection(collectionName).doc(student.dni);
            batch.set(docRef, student);
        });

        try {
            await batch.commit();
            alert(`¡Éxito! Se han guardado ${transformed.length} alumnos en Firebase.`);
            loadStudentsFromFirebase(); // Recargar datos
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

        // Update active link
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Show/Hide sections
        if (sectionId === 'dashboard') {
            document.getElementById('dashboard-section').classList.remove('hidden');
            document.getElementById('dashboard-section').style.display = 'block';
            document.getElementById('table-section').classList.add('hidden');
            document.getElementById('table-section').style.display = 'none';
        } else if (sectionId === 'habilidades' || sectionId === 'programacion') {
            showTable(sectionId);
        }
    });
});

function showTable(courseKey) {
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById('dashboard-section').style.display = 'none';
    document.getElementById('table-section').classList.remove('hidden');
    document.getElementById('table-section').style.display = 'block';

    document.getElementById('current-course-title').innerText =
        courseKey === 'habilidades' ? 'Alumnos: Habilidades Digitales & IA' : 'Alumnos: Desarrollo de Software & Videojuegos';

    const tbody = document.querySelector('#students-table tbody');
    tbody.innerHTML = '';

    studentData[courseKey].forEach((student, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${student.full_name}</td>
            <td>${student.dni}</td>
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
            alert("Email actualizado.");
            loadStudentsFromFirebase();
            showTable(course);
        } catch (error) {
            console.error(error);
        }
    }
}

async function deleteStudent(course, dni) {
    if (confirm('¿Está seguro de eliminar este alumno?')) {
        const collectionName = course === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
        try {
            await db.collection(collectionName).doc(dni).delete();
            alert("Alumno eliminado.");
            loadStudentsFromFirebase();
            showTable(course);
        } catch (error) {
            console.error(error);
        }
    }
}

document.getElementById('btn-logout')?.addEventListener('click', () => {
    authFirebase.signOut().then(() => {
        window.location.href = 'index.html';
    });
});
