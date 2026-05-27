import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, getDocs, query, where, deleteDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDr5gIKnAdkiNrdLe2e3u1wOChFzeXlpCA",
    authDomain: "madrasa-portal-63037.firebaseapp.com",
    projectId: "madrasa-portal-63037",
    storageBucket: "madrasa-portal-63037.firebasestorage.app",
    messagingSenderId: "543466628748",
    appId: "1:543466628748:web:6ec6375aa7d080cb403da9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const userRole = localStorage.getItem('userRole');
if (userRole !== 'teacher') {
    alert("Unauthorized Access!");
    window.location.href = "index.html";
}

let teacherUid = "";
let assignedClass = "";
let madrasaUid = "";
let madrasaNameGlobal = "MADRASA";
let teacherNameGlobal = "TEACHER";
let classSubjects = [];
let studentsMap = {};

const displayMadrasaName = document.getElementById("displayMadrasaName");
const displayClassName = document.getElementById("displayClassName");
const logoutBtn = document.getElementById("logoutBtn");

onAuthStateChanged(auth, async (user) => {
    if (user) {
        teacherUid = user.uid;
        await loadTeacherData();
        setupTabs();
    }
});

logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "index.html";
    });
});

// Cache System Helper
function clearCache(keyPrefix) {
    Object.keys(localStorage).forEach(key => {
        if(key.startsWith(keyPrefix)) localStorage.removeItem(key);
    });
}

async function loadTeacherData() {
    try {
        const teacherDoc = await getDoc(doc(db, "users", teacherUid));
        if (teacherDoc.exists()) {
            const tData = teacherDoc.data();
            assignedClass = tData.assignedClass;
            madrasaUid = tData.madrasaUid;
            teacherNameGlobal = tData.name;
            classSubjects = tData.subjects || []; // Teacher manages their own subjects
            
            displayClassName.textContent = assignedClass;
            
            // Get Madrasa Name
            const adminDoc = await getDoc(doc(db, "users", madrasaUid));
            if (adminDoc.exists()) {
                madrasaNameGlobal = adminDoc.data().madrasaName || "MADRASA";
                displayMadrasaName.textContent = madrasaNameGlobal;
            }
            
            renderSubjectsUI();
            await loadStudents();
            loadResults();
        }
    } catch (e) { console.error("Error loading teacher data", e); }
}

function setupTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            
            const target = e.target.getAttribute("data-tab");
            e.target.classList.add("active");
            document.getElementById(target).classList.add("active");
            
            if(target === "tab-results") loadResults();
        });
    });
}

// --- MANAGE SUBJECTS BY TEACHER ---
document.getElementById("addSubjectBtn").addEventListener("click", async () => {
    const newSub = document.getElementById("newSubjectName").value.trim();
    if(!newSub) return;
    if(classSubjects.includes(newSub)) return alert("Subject already exists!");
    
    classSubjects.push(newSub);
    try {
        await updateDoc(doc(db, "users", teacherUid), { subjects: classSubjects });
        document.getElementById("newSubjectName").value = "";
        renderSubjectsUI();
        loadResults(); // Refresh table headers
    } catch (e) { alert("Error adding subject"); }
});

window.deleteSubject = async (subName) => {
    if(!confirm(`Delete subject: ${subName}?`)) return;
    classSubjects = classSubjects.filter(s => s !== subName);
    try {
        await updateDoc(doc(db, "users", teacherUid), { subjects: classSubjects });
        renderSubjectsUI();
        loadResults();
    } catch (e) { alert("Error deleting subject"); }
};

function renderSubjectsUI() {
    // Tags
    const tagsContainer = document.getElementById("subjectTagsContainer");
    tagsContainer.innerHTML = "";
    classSubjects.forEach(sub => {
        tagsContainer.innerHTML += `<div class="subject-tag">${sub} <button class="delete-sub-btn" onclick="deleteSubject('${sub}')">X</button></div>`;
    });
    
    // Inputs for Marks Entry
    const inputsContainer = document.getElementById("dynamicSubjectInputs");
    inputsContainer.innerHTML = classSubjects.length === 0 ? "<p>No subjects added. Add subjects above.</p>" : "";
    classSubjects.forEach(sub => {
        inputsContainer.innerHTML += `
            <div class="form-group">
                <label>${sub}</label>
                <input type="text" class="form-control mark-input" data-subject="${sub}" placeholder="Mark or 'A'">
            </div>
        `;
    });
}

// --- TAB 1: MANAGE STUDENTS ---
const addStudentBtn = document.getElementById("addStudentBtn");
addStudentBtn.addEventListener("click", async () => {
    const name = document.getElementById("studentName").value.trim();
    const admissionNo = document.getElementById("admissionNo").value.trim();
    const gender = document.getElementById("gender").value;
    const parentPhone = document.getElementById("parentPhone").value.trim();

    if (!name || !admissionNo) return alert("Name and Admission No are required.");
    
    addStudentBtn.textContent = "Adding...";
    try {
        await addDoc(collection(db, "students"), {
            name, admissionNo, gender, parentPhone, className: assignedClass, madrasaUid
        });
        document.getElementById("studentName").value = "";
        document.getElementById("admissionNo").value = "";
        document.getElementById("parentPhone").value = "";
        clearCache(`cache_students_${assignedClass}`);
        await loadStudents();
    } catch (e) {}
    addStudentBtn.textContent = "Add Student";
});

document.getElementById("uploadStudentExcelBtn").addEventListener("click", () => {
    const file = document.getElementById("studentExcel").files[0];
    if (!file) return alert("Select Excel file.");
    document.getElementById("uploadStudentExcelBtn").textContent = "Uploading...";
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        for (const row of json) {
            const name = row.Name || row.name;
            const adm = row.AdmissionNo || row.admissionno;
            if (name && adm) {
                await addDoc(collection(db, "students"), {
                    name: String(name), admissionNo: String(adm), gender: String(row.Gender || "Male"), parentPhone: String(row.Phone || ""),
                    className: assignedClass, madrasaUid
                });
            }
        }
        alert("Students Added.");
        document.getElementById("studentExcel").value = "";
        clearCache(`cache_students_${assignedClass}`);
        await loadStudents();
        document.getElementById("uploadStudentExcelBtn").textContent = "Upload Excel";
    };
    reader.readAsArrayBuffer(file);
});

window.deleteStudent = async (studentId) => {
    if (!confirm("Are you sure you want to delete this student and ALL associated marks?")) return;
    try {
        await deleteDoc(doc(db, "students", studentId));
        const marksSnap = await getDocs(query(collection(db, "marks"), where("studentId", "==", studentId)));
        marksSnap.docs.forEach(async (m) => await deleteDoc(doc(db, "marks", m.id)));
        
        clearCache(`cache_students_${assignedClass}`);
        clearCache(`cache_marks_${assignedClass}`);
        alert("Deleted.");
        await loadStudents();
    } catch (e) {}
};

document.getElementById("deleteAllStudentsBtn").addEventListener("click", async () => {
    if (!confirm("Delete ALL students and marks?")) return;
    try {
        const snap = await getDocs(query(collection(db, "students"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass)));
        snap.docs.forEach(async (d) => await deleteDoc(doc(db, "students", d.id)));
        clearCache(`cache_students_${assignedClass}`);
        clearCache(`cache_marks_${assignedClass}`);
        await loadStudents();
    } catch (e) {}
});

async function loadStudents() {
    if (!assignedClass || !madrasaUid) return;
    const tbody = document.getElementById("studentsTableBody");
    const markSelect = document.getElementById("markStudentSelect");
    
    // Check Cache
    const cacheKey = `cache_students_${assignedClass}`;
    const cachedData = localStorage.getItem(cacheKey);
    let students = [];
    
    if (cachedData) {
        students = JSON.parse(cachedData);
    } else {
        const snap = await getDocs(query(collection(db, "students"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass)));
        snap.forEach(doc => students.push({ id: doc.id, ...doc.data() }));
        localStorage.setItem(cacheKey, JSON.stringify(students));
    }

    studentsMap = {};
    students.forEach(s => studentsMap[s.admissionNo] = s);
    
    students.sort((a, b) => {
        if (a.gender !== b.gender) return a.gender === 'Male' ? -1 : 1;
        return String(a.admissionNo).localeCompare(String(b.admissionNo), undefined, {numeric: true});
    });
    
    tbody.innerHTML = students.length === 0 ? '<tr><td colspan="5" style="text-align: center;">No students</td></tr>' : "";
    markSelect.innerHTML = '<option value="">-- Select Student --</option>';
    
    students.forEach(st => {
        tbody.innerHTML += `<tr><td>${st.admissionNo}</td><td>${st.name}</td><td>${st.gender}</td><td>${st.parentPhone || "-"}</td>
            <td><button class="btn btn-danger btn-small btn-auto" onclick="deleteStudent('${st.id}')">Delete</button></td></tr>`;
        markSelect.innerHTML += `<option value="${st.id}" data-name="${st.name}" data-adm="${st.admissionNo}">${st.admissionNo} - ${st.name}</option>`;
    });
}

// --- TAB 2: MARKS ---
document.getElementById("markStudentSelect").addEventListener("change", async (e) => {
    const studentId = e.target.value;
    const term = document.getElementById("examTerm").value;
    if (!studentId || !term) return;
    const markDoc = await getDoc(doc(db, "marks", `${studentId}_${term.replace(/\s+/g, '')}`));
    
    if (markDoc.exists()) {
        const data = markDoc.data();
        document.getElementById("attendanceInput").value = data.attendance || "";
        document.querySelectorAll(".mark-input").forEach(inp => {
            const sub = inp.getAttribute("data-subject");
            inp.value = data.marks && data.marks[sub] !== undefined ? data.marks[sub] : "";
        });
        document.getElementById("saveMarksBtn").textContent = "Update Marks";
    } else {
        document.getElementById("attendanceInput").value = "";
        document.querySelectorAll(".mark-input").forEach(inp => inp.value = "");
        document.getElementById("saveMarksBtn").textContent = "Save Marks";
    }
});

document.getElementById("saveMarksBtn").addEventListener("click", async () => {
    const select = document.getElementById("markStudentSelect");
    const studentId = select.value;
    if (!studentId) return alert("Select a student");
    
    const studentName = select.options[select.selectedIndex]?.getAttribute("data-name");
    const term = document.getElementById("examTerm").value;
    const globalMax = Number(document.getElementById("globalMaxMark").value) || 100;
    const globalPass = Number(document.getElementById("globalPassMark").value) || 35;
    
    let marksData = {}, totalObtained = 0, isPassed = true, valid = true;
    
    document.querySelectorAll(".mark-input").forEach(inp => {
        const sub = inp.getAttribute("data-subject");
        const val = inp.value.trim().toUpperCase();
        if (val === "") valid = false;
        else if (val === "A") { marksData[sub] = "A"; isPassed = false; }
        else {
            const num = Number(val);
            if (isNaN(num) || num > globalMax) valid = false;
            else { marksData[sub] = num; totalObtained += num; if (num < globalPass) isPassed = false; }
        }
    });
    
    if (!valid) return alert("Please check marks inputs.");
    
    const totalMaxPossible = classSubjects.length * globalMax;
    const percentage = totalMaxPossible > 0 ? (totalObtained / totalMaxPossible) * 100 : 0;
    
    document.getElementById("saveMarksBtn").textContent = "Saving...";
    try {
        await setDoc(doc(db, "marks", `${studentId}_${term.replace(/\s+/g, '')}`), {
            studentId, studentName, madrasaUid, className: assignedClass, term,
            marks: marksData, attendance: document.getElementById("attendanceInput").value, totalMarks: totalObtained, maxMarkTotal: totalMaxPossible,
            passMark: globalPass, percentage, grade: isPassed ? "Passed" : "Failed", status: isPassed ? "Passed" : "Failed"
        });
        clearCache(`cache_marks_${assignedClass}`);
        alert("Marks saved!");
        select.value = ""; document.querySelectorAll(".mark-input").forEach(i => i.value="");
    } catch (e) {}
    document.getElementById("saveMarksBtn").textContent = "Save Marks";
});

// --- TAB 3: RESULTS ---
document.getElementById("viewResultTerm").addEventListener("change", loadResults);

async function loadResults() {
    const term = document.getElementById("viewResultTerm").value;
    if (!assignedClass || !madrasaUid) return;
    
    let ths = `<tr><th>Roll No</th><th>Ad.No</th><th>Name</th><th>Attendance</th>`;
    classSubjects.forEach(sub => ths += `<th>${sub}</th>`);
    ths += `<th>Total</th><th>Rank</th><th>Remarks/Status</th><th>Action</th></tr>`;
    document.getElementById("screenResultHead").innerHTML = ths;
    
    let pdfThs = `<tr>
        <th class="vertical-header"><span>ROLL NO</span></th>
        <th class="vertical-header"><span>AD.NO</span></th>
        <th class="name-col" style="vertical-align: middle;">NAME OF STUDENTS</th>
        <th class="vertical-header"><span>HAJAR</span></th>`;
    classSubjects.forEach(sub => pdfThs += `<th class="vertical-header"><span>${sub.toUpperCase()}</span></th>`);
    pdfThs += `<th class="vertical-header"><span>TOTAL</span></th><th class="vertical-header"><span>RANK</span></th><th class="vertical-header"><span>REMARKS</span></th></tr>`;
    document.getElementById("pdfThead").innerHTML = pdfThs;
    
    document.getElementById("pdfMadrasaName").textContent = madrasaNameGlobal;
    document.getElementById("pdfExamTitle").textContent = `EXAMINATION RESULT. CLASS: ${assignedClass.toUpperCase()}`;
    document.getElementById("pdfTeacherName").textContent = teacherNameGlobal;
    
    // Check Cache for Marks
    const cacheKey = `cache_marks_${assignedClass}_${term}`;
    let results = [];
    const cachedMarks = localStorage.getItem(cacheKey);
    
    if(cachedMarks) {
        results = JSON.parse(cachedMarks);
    } else {
        const snap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass), where("term", "==", term)));
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        localStorage.setItem(cacheKey, JSON.stringify(results));
    }

    if (results.length === 0) {
        document.getElementById("screenResultBody").innerHTML = `<tr><td colspan="100%" style="text-align:center;">No results</td></tr>`;
        document.getElementById("pdfTbody").innerHTML = "";
        return;
    }
    
    results.sort((a, b) => b.totalMarks - a.totalMarks);
    let rank = 1;
    results.forEach(r => r.rank = r.status !== "Failed" ? rank++ : "-");
    
    results.sort((a, b) => {
        const adA = Object.keys(studentsMap).find(k => studentsMap[k].id === a.studentId) || "";
        const adB = Object.keys(studentsMap).find(k => studentsMap[k].id === b.studentId) || "";
        const gA = studentsMap[adA]?.gender || "Male";
        const gB = studentsMap[adB]?.gender || "Male";
        if (gA !== gB) return gA === "Male" ? -1 : 1;
        return String(adA).localeCompare(String(adB), undefined, {numeric: true});
    });
    
    let sBody = "", pBody = "";
    let bTot = 0, gTot = 0, bPass = 0, gPass = 0;
    let boyRoll = 1, girlRoll = 1;
    
    results.forEach(res => {
        const adNo = Object.keys(studentsMap).find(k => studentsMap[k].id === res.studentId) || "-";
        const gen = studentsMap[adNo]?.gender || "Male";
        
        if (gen === "Male") { bTot++; if (res.status !== "Failed") bPass++; }
        else { gTot++; if (res.status !== "Failed") gPass++; }
        
        const roll = gen === "Male" ? boyRoll++ : girlRoll++;
        const color = gen === "Female" ? "#d32f2f" : "#000000";
        
        let marksHTML = "";
        classSubjects.forEach(sub => {
            const mark = res.marks && res.marks[sub] !== undefined ? res.marks[sub] : "-";
            const mColor = mark === "A" || (Number(mark) < (res.passMark||35) && mark !== "-") ? "#d32f2f" : "#000000";
            marksHTML += `<td style="color: ${mColor};">${mark}</td>`;
        });
        
        sBody += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${adNo}</td><td style="color:${color};">${res.studentName}</td>
            <td>${res.attendance || "-"}</td>${marksHTML}<td>${res.totalMarks}</td><td>${res.rank}</td>
            <td style="color:${res.status === "Failed" ? "red" : "black"};">${res.status}</td>
            <td><button class="btn btn-danger btn-small" onclick="deleteMark('${res.id}', '${term}')">Delete</button></td></tr>`;
            
        pBody += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${adNo}</td><td class="name-col" style="color:${color};">${res.studentName.toUpperCase()}</td>
            <td>${res.attendance || ""}</td>${marksHTML}<td>${res.totalMarks}</td><td>${res.rank !== "-" ? res.rank : ""}</td>
            <td style="color:${res.status === "Failed" ? "#d32f2f" : "#000000"};">${res.status === "Failed" ? "F" : "P"}</td></tr>`;
    });
    
    document.getElementById("screenResultBody").innerHTML = sBody;
    document.getElementById("pdfTbody").innerHTML = pBody;
    
    document.getElementById("pdfTotalRow").innerHTML = `<td style="color: black;">${bTot}</td><td style="color: #d32f2f;">${gTot}</td><td style="color: black;">${bTot + gTot}</td>`;
    document.getElementById("pdfPassedRow").innerHTML = `<td style="color: black;">${bPass}</td><td style="color: #d32f2f;">${gPass}</td><td style="color: black;">${bPass + gPass}</td>`;
    document.getElementById("pdfPercentageRow").innerHTML = `<td style="color: black;">${bTot > 0 ? Math.round((bPass/bTot)*100) : 0}%</td><td style="color: #d32f2f;">${gTot > 0 ? Math.round((gPass/gTot)*100) : 0}%</td><td style="color: black;">${(bTot+gTot) > 0 ? Math.round(((bPass+gPass)/(bTot+gTot))*100) : 0}%</td>`;
}

window.deleteMark = async (docId, term) => {
    if(!confirm("Delete this result?")) return;
    await deleteDoc(doc(db, "marks", docId));
    clearCache(`cache_marks_${assignedClass}`);
    loadResults();
};

document.getElementById("downloadPdfBtn").addEventListener("click", () => {
    const area = document.getElementById("pdfExportArea");
    window.scrollTo(0, 0);
    document.getElementById("pdfExportWrapper").style.left = "0";
    
    html2canvas(area, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }).then(canvas => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        let imgWidth = pdfWidth;
        let imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        // Auto Scale for many subjects
        if (imgHeight > pdfHeight) {
            imgHeight = pdfHeight - 10;
            imgWidth = (canvas.width * imgHeight) / canvas.height;
        }
        
        const xPos = (pdfWidth - imgWidth) / 2;
        pdf.addImage(imgData, 'PNG', xPos, 5, imgWidth, imgHeight);
        pdf.save(`${assignedClass}_Result.pdf`);
        document.getElementById("pdfExportWrapper").style.left = "-9999px";
    });
});