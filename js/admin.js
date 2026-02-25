let studentData = {
    habilidades: [],
    programacion: []
};

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
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        console.log(`Cargados ${json.length} alumnos para ${courseType}`);

        // Transform data to our format
        const transformed = json.map(row => ({
            dni: row['CUÁL ES SU NÚMERO DE DOCUMENTO?'] || row['DNI'],
            nombre: row['CUÁLES SON SUS NOMBRES?'] || '',
            apellido: row['CUÁLES SON SUS APELLIDOS?'] || '',
            email: row['Dirección de correo electrónico'] || '',
            full_name: `${row['CUÁLES SON SUS APELLIDOS?'] || ''}, ${row['CUÁLES SON SUS NOMBRES?'] || ''}`
        }));

        studentData[courseType] = transformed;

        // Update stats on UI
        const countEl = document.getElementById(`count-${courseType}`);
        if (countEl) countEl.innerText = transformed.length;

        alert(`¡Éxito! Se han procesado ${transformed.length} alumnos.`);

        // Optional: Save to Supabase if config is present
        // saveToSupabase(transformed, courseType);
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
            document.getElementById('dashboard-section').classList.add('active');
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

    studentData[courseKey].forEach((student, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${student.full_name}</td>
            <td>${student.dni}</td>
            <td>${student.email}</td>
            <td>
                <button class="btn-edit" onclick="editStudent('${courseKey}', ${index})">✏️</button>
                <button class="btn-delete" onclick="deleteStudent('${courseKey}', ${index})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editStudent(course, index) {
    const student = studentData[course][index];
    const newEmail = prompt(`Editar email para ${student.full_name}:`, student.email);
    if (newEmail !== null) {
        studentData[course][index].email = newEmail;
        showTable(course);
    }
}

function deleteStudent(course, index) {
    if (confirm('¿Está seguro de eliminar este alumno?')) {
        studentData[course].splice(index, 1);
        showTable(course);
        document.getElementById(`count-${course}`).innerText = studentData[course].length;
    }
}

document.getElementById('btn-logout')?.addEventListener('click', () => {
    window.location.href = 'index.html';
});
