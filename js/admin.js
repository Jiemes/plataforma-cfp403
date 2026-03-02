// Administración CFP 403 - Lógica Inteligente 6.5
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
        // Limpiar y validar Edad
        s.edad = cleanAge(s.edad, s.nacimiento);

        if (!s.sexo || s.sexo.length < 1 || s.sexo === 'N/A' || s.sexo === 'O') {
            s.sexo = guessGender(s.full_name);
        }
        map.set(s.dni, s);
    });
    studentData[key] = Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
}

function cleanAge(ageRaw, birthRaw) {
    if (!ageRaw && !birthRaw) return '??';
    let age = parseInt(String(ageRaw || '').replace(/\D/g, ''));

    // Si la edad es absurda (ej: >100 o <10), intentar calcularla por nacimiento
    if (isNaN(age) || age < 10 || age > 95) {
        if (birthRaw) {
            try {
                // Normalizar separadores y limpiar
                let dateStr = String(birthRaw).trim().replace(/-/g, '/');
                let birthDate;
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    // Caso DD/MM/AAAA
                    if (parts[2].length === 4) birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
                    // Caso AAAA/MM/DD
                    else if (parts[0].length === 4) birthDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T12:00:00`);
                }

                if (!birthDate || isNaN(birthDate)) birthDate = new Date(dateStr);

                if (birthDate && !isNaN(birthDate)) {
                    let hoy = new Date();
                    age = hoy.getFullYear() - birthDate.getFullYear();
                    let m = hoy.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && hoy.getDate() < birthDate.getDate())) age--;
                }
            } catch (e) { console.log("Error parseando fecha:", birthRaw); }
        }
    }
    return (isNaN(age) || age < 10 || age > 95) ? '??' : age;
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
    if (!all || all.length === 0) return;
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
        data: { labels: ['Masculino', 'Femenino'], datasets: [{ data: [sexo.M, sexo.F], backgroundColor: ['#1e293b', '#FF6384'] }] },
        options: opt
    });

    // Edad (MEJORADO)
    const ages = { '18-25': 0, '26-35': 0, '36-45': 0, '46+': 0, 'Erróneo': 0 };
    all.forEach(s => {
        let a = parseInt(s.edad);
        if (isNaN(a)) ages['Erróneo']++;
        else if (a <= 25) ages['18-25']++;
        else if (a <= 35) ages['26-35']++;
        else if (a <= 45) ages['36-45']++;
        else ages['46+']++;
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
    tbody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';

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
                <td style="text-align:center">${s.edad}</td>
                <td style="text-align:center">${corr.length}</td>
                <td style="text-align:center"><strong>${prom}</strong></td>
                <td>
                    <button class="btn-correct ${pend.length > 0 ? 'alert' : ''}" onclick="viewWorks('${s.dni}')">
                        ${pend.length > 0 ? '🔔 Revisar' : '📂 Ver'}
                    </button>
                    <button class="btn-icon" onclick="deleteStudent('${course}', '${s.dni}')">🗑️</button>
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

// EXCEL IMPORT - ULTRA TOLERANTE
async function processExcel(file, type) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

            const trans = json.map(r => {
                const getVal = (patterns) => {
                    const key = Object.keys(r).find(k => patterns.some(p => k.toUpperCase().includes(p.toUpperCase())));
                    return key ? r[key] : '';
                };
                return {
                    dni: String(getVal(['DOCUMENTO', 'DNI', 'D.N.I']) || '').trim(),
                    email: String(getVal(['EMAIL', 'CORREO', 'DIRECCIÓN DE CORREO']) || '').trim(),
                    full_name: `${getVal(['APELLIDO']) || ''}, ${getVal(['NOMBRE']) || ''}`.toUpperCase().trim() || String(getVal(['NOMBRE Y APELLIDO', 'ALUMNO']) || '').toUpperCase().trim(),
                    telefono: String(getVal(['TELÉFONO', 'CELULAR', 'TELEFONO']) || '').trim(),
                    nivel_educativo: String(getVal(['NIVEL EDUCATIVO', 'ESTUDIOS']) || '').trim(),
                    trabajo_actual: String(getVal(['TRABAJO ACTUAL', 'OCUPACIÓN', 'TRABAJA?']) || '').trim(),
                    busca_trabajo: String(getVal(['BUSCA TRABAJO']) || '').trim(),
                    sexo: String(getVal(['SEXO', 'GÉNERO']) || '').trim(),
                    edad: String(getVal(['EDAD', 'AÑOS']) || '').trim(),
                    nacimiento: String(getVal(['NACIMIENTO', 'FECHA DE NACIMIENTO']) || '').trim()
                };
            }).filter(s => s.dni.length > 5);

            if (trans.length === 0) return alert("No se encontraron datos válidos.");
            const batch = db.batch();
            const coll = type === 'habilidades' ? 'alumnos_habilidades' : 'alumnos_programacion';
            trans.forEach(s => batch.set(db.collection(coll).doc(s.dni), s));
            await batch.commit();
            alert("¡Importación exitosa!");
            loadStudentsFromFirebase();
        } catch (err) { alert("Error al procesar: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
}

// CRONOGRAMA AUTOMÁTICO - Lógica Inteligente 6.5
async function saveConfig() {
    const start = document.getElementById('course-start-date').value;
    const freq = parseInt(document.getElementById('course-frequency').value) || 7;
    const syllabus = document.getElementById('course-syllabus-url').value.trim();
    const welcome = document.getElementById('course-welcome-url').value.trim();

    if (!start) return alert("Debes ingresar al menos la fecha de inicio.");

    const btn = document.getElementById('btn-save-config');
    btn.innerText = "⌛ Guardando...";
    btn.disabled = true;

    try {
        const materiales = {};
        for (let i = 1; i <= 15; i++) {
            const claseLink = document.getElementById(`clase-link-${i}`)?.value.trim();
            const actividadLink = document.getElementById(`actividad-link-${i}`)?.value.trim();
            if (claseLink || actividadLink) {
                materiales[`sem_${i}`] = {
                    clase: claseLink || '',
                    actividad: actividadLink || ''
                };
            }
        }

        await db.collection('config_cursos').doc(currentClaseTab).set({
            fecha_inicio: start,
            frecuencia_dias: freq,
            syllabus_url: syllabus,
            welcome_url: welcome,
            materiales: materiales,
            actualizado: new Date().toISOString()
        }, { merge: true });

        alert("¡Configuración y links guardados exitosamente!");
        loadClasesAdmin();
    } catch (err) {
        alert("Error al guardar: " + err.message);
    } finally {
        btn.innerText = "Guardar Configuración del Curso";
        btn.disabled = false;
    }
}

async function loadClasesAdmin() {
    const cont = document.getElementById('clases-list-container');
    if (!cont) return;
    cont.innerHTML = '<p class="loader" style="text-align:center; padding:20px;">Cargando cronograma y links...</p>';

    try {
        const doc = await db.collection('config_cursos').doc(currentClaseTab).get();
        const config = doc.exists ? doc.data() : { fecha_inicio: '', frecuencia_dias: 7, syllabus_url: '', welcome_url: '', materiales: {} };
        const materiales = config.materiales || {};
        const exceptions = config.excepciones || [];

        // Llenar campos principales
        document.getElementById('course-start-date').value = config.fecha_inicio || '';
        document.getElementById('course-frequency').value = config.frecuencia_dias || 7;
        document.getElementById('course-syllabus-url').value = config.syllabus_url || '';
        document.getElementById('course-welcome-url').value = config.welcome_url || '';

        cont.innerHTML = '';

        // Botón de limpieza total
        const clearBtn = document.createElement('button');
        clearBtn.innerText = "🗑️ Limpiar Toda la Configuración";
        clearBtn.className = "btn-secondary";
        clearBtn.style.marginBottom = "20px";
        clearBtn.onclick = clearConfig;
        cont.appendChild(clearBtn);

        const infoDiv = document.createElement('div');
        infoDiv.style = "background:#f1f5f9; padding:15px; border-radius:12px; font-size:0.9rem; margin-bottom:20px; border-left: 4px solid var(--primary-color);";
        infoDiv.innerHTML = `
            <strong>Instrucciones:</strong> Pega los links de Drive individuales para cada archivo.<br>
            Asegúrate de que los archivos en Drive sean <strong>públicos</strong> ("Cualquier persona con el link puede ver").
        `;
        cont.appendChild(infoDiv);

        const startDate = config.fecha_inicio ? new Date(config.fecha_inicio + "T08:00:00-03:00") : null;

        for (let i = 1; i <= 15; i++) {
            if (exceptions.includes(i)) continue;

            let pubStatus = '📅 Sin fecha';
            let isPub = false;
            if (startDate) {
                const pubDate = new Date(startDate);
                pubDate.setDate(startDate.getDate() + ((i - 1) * config.frecuencia_dias));
                isPub = new Date() >= pubDate;
                pubStatus = isPub ? '🔓 Visible' : '🔒 Libera: ' + pubDate.toLocaleDateString();
            }

            const matSemana = materiales[`sem_${i}`] || { clase: '', actividad: '' };

            const div = document.createElement('div');
            div.className = 'clase-item-row';
            div.style.gridTemplateColumns = "80px 120px 1fr 1fr 50px";
            div.innerHTML = `
                <div style="font-weight:700">Semana ${i}</div>
                <div class="status-pub ${isPub ? 'pub-active' : 'pub-soon'}" style="font-size:0.7rem;">${pubStatus}</div>
                
                <div class="field-item" style="gap:4px;">
                    <input type="url" id="clase-link-${i}" value="${matSemana.clase || ''}" placeholder="Link Clase PDF" style="font-size:0.8rem; padding:6px;">
                </div>
                
                <div class="field-item" style="gap:4px;">
                    <input type="url" id="actividad-link-${i}" value="${matSemana.actividad || ''}" placeholder="Link Actividad PDF" style="font-size:0.8rem; padding:6px;">
                </div>

                <button class="btn-icon" onclick="deleteWeek(${i})" title="Ocultar semana">🗑️</button>
            `;
            cont.appendChild(div);
        }
    } catch (err) { console.error(err); }
}

async function handleMaterial(semana, tipo, existingUrl) {
    if (existingUrl) {
        if (confirm(`¿Borrar el archivo de ${tipo} de la Semana ${semana}?`)) {
            try {
                const ref = db.collection('config_cursos').doc(currentClaseTab);
                const doc = await ref.get();
                const materials = doc.data().materiales || {};
                delete materials[`sem_${semana}`][tipo];
                await ref.update({ materiales: materials });
                loadClasesAdmin();
            } catch (e) { alert(e.message); }
        }
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const path = `materiales/${currentClaseTab}/Semana_${semana}/${tipo}_${Date.now()}.pdf`;
            const refStorage = storage.ref().child(path);
            await refStorage.put(file);
            const url = await refStorage.getDownloadURL();

            const docRef = db.collection('config_cursos').doc(currentClaseTab);
            const doc = await docRef.get();
            const config = doc.data() || {};
            const materials = config.materiales || {};
            if (!materials[`sem_${semana}`]) materials[`sem_${semana}`] = {};
            materials[`sem_${semana}`][tipo] = url;

            await docRef.update({ materiales: materials });
            alert("¡Archivo subido correctamente!");
            loadClasesAdmin();
        } catch (err) { alert("Error: " + err.message); }
    };
    input.click();
}

async function deleteWeek(weekNum) {
    if (!confirm(`¿Ocultar la Semana ${weekNum} de este curso?`)) return;
    try {
        const ref = db.collection('config_cursos').doc(currentClaseTab);
        const doc = await ref.get();
        const exceptions = doc.data().excepciones || [];
        if (!exceptions.includes(weekNum)) {
            exceptions.push(weekNum);
            await ref.update({ excepciones: exceptions });
            loadClasesAdmin();
        }
    } catch (e) { alert(e.message); }
}

async function clearConfig() {
    if (!confirm("¿Eliminar TODA la configuración (Drive, Fechas, Excepciones) de este curso?")) return;
    try {
        await db.collection('config_cursos').doc(currentClaseTab).delete();
        alert("Configuración eliminada.");
        location.reload();
    } catch (e) { alert(e.message); }
}

function switchClaseType(type) {
    currentClaseTab = type;
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.innerText.toLowerCase().includes(type === 'habilidades' ? 'habilidades' : 'videojuegos'));
    });
    loadClasesAdmin();
}

// EVENTOS
document.getElementById('btn-clear-course')?.addEventListener('click', deleteCourseData);
document.getElementById('btn-save-config')?.addEventListener('click', saveConfig);
document.getElementById('upload-habilidades')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'habilidades'));
document.getElementById('upload-programacion')?.addEventListener('change', (e) => processExcel(e.target.files[0], 'programacion'));
document.getElementById('bulk-upload-input')?.addEventListener('change', (e) => handleBulkUpload(e.target.files));
document.getElementById('btn-logout')?.addEventListener('click', () => { if (confirm("¿Cerrar sesión?")) authFirebase.signOut().then(() => window.location.href = 'index.html'); });

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

// MEGA CARGA MASIVA
async function handleBulkUpload(files) {
    if (!currentClaseTab) return alert("Selecciona un curso primero.");
    const progressList = document.getElementById('upload-progress-list');
    progressList.innerHTML = '<b>Procesando archivos...</b><br>';

    const docRef = db.collection('config_cursos').doc(currentClaseTab);
    const snap = await docRef.get();
    const config = snap.exists ? snap.data() : {};
    const materiales = config.materiales || {};

    let count = 0;
    for (const file of files) {
        const name = file.name.toLowerCase();
        let targetType = ""; // 'clase', 'actividad', 'syllabus', 'welcome'
        let weekNum = 0;

        // Detectar tipo y semana por nombre
        if (name.includes('clase')) {
            targetType = 'clase';
            const match = name.match(/clase\s*(\d+)/i);
            if (match) weekNum = parseInt(match[1]);
        } else if (name.includes('actividad')) {
            targetType = 'actividad';
            const match = name.match(/actividad\s*(\d+)/i);
            if (match) weekNum = parseInt(match[1]);
        } else if (name.includes('programa') || name.includes('syllabus')) {
            targetType = 'syllabus';
        } else if (name.includes('bienvenida') || name.includes('welcome')) {
            targetType = 'welcome';
        }

        if (targetType) {
            try {
                const path = `materiales/${currentClaseTab}/${targetType === 'clase' || targetType === 'actividad' ? 'Semana_' + weekNum : 'General'}/${file.name}`;
                const ref = storage.ref().child(path);
                const li = document.createElement('div');
                li.innerHTML = `⏳ Subiendo ${file.name}...`;
                progressList.appendChild(li);

                await ref.put(file);
                const url = await ref.getDownloadURL();

                if (targetType === 'clase' || targetType === 'actividad') {
                    if (!materiales[`sem_${weekNum}`]) materiales[`sem_${weekNum}`] = {};
                    materiales[`sem_${weekNum}`][targetType] = url;
                } else if (targetType === 'syllabus') {
                    config.syllabus_url = url;
                } else if (targetType === 'welcome') {
                    config.welcome_url = url;
                }

                li.innerHTML = `✅ ${file.name} listo.`;
                count++;
            } catch (e) {
                console.error(e);
                progressList.innerHTML += `<span style="color:red">❌ Error en ${file.name}</span><br>`;
            }
        }
    }

    await docRef.set({ ...config, materiales }, { merge: true });
    alert(`¡Se procesaron ${count} archivos correctamente!`);
    loadClasesAdmin();
}

function initNotifications() {
    if (notificationsListener) notificationsListener();
    notificationsListener = db.collection('entregas').where('estado', '==', 'Pendiente').onSnapshot(snap => {
        const badge = document.getElementById('notif-count');
        if (badge) {
            if (snap.size > 0) {
                badge.innerText = snap.size;
                badge.classList.remove('hidden');
            } else { badge.classList.add('hidden'); }
        }
    });
}

loadStudentsFromFirebase();
