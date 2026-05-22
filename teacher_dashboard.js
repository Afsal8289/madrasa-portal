import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, getDocs, query, where, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// Authentication & Session
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

// UI Elements
const displayMadrasaName = document.getElementById("displayMadrasaName");
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

async function loadTeacherData() {
    try {
        const teacherDoc = await getDoc(doc(db, "users", teacherUid));
        if (teacherDoc.exists()) {
            const tData = teacherDoc.data();
            assignedClass = tData.assignedClass;
            madrasaUid = tData.madrasaUid;
            teacherNameGlobal = tData.name;
            
            const adminDoc = await getDoc(doc(db, "users", madrasaUid));
            if (adminDoc.exists()) {
                madrasaNameGlobal = adminDoc.data().madrasaName || "MADRASA";
                displayMadrasaName.textContent = madrasaNameGlobal;
                
                const subjectsObj = adminDoc.data().classSubjects || {};
                classSubjects = subjectsObj[assignedClass] || [];
            }
            
            await loadStudents();
            renderSubjectInputs();
            loadResults();
        }
    } catch (e) {
        console.error("Error loading teacher data", e);
    }
}

// --- TABS LOGIC ---
function setupTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            
            const target = e.target.getAttribute("data-tab");
            e.target.classList.add("active");
            document.getElementById(target).classList.add("active");
            
            if(target === "tab-results") {
                loadResults();
            }
        });
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
            name, admissionNo, gender, parentPhone,
            className: assignedClass, madrasaUid
        });
        document.getElementById("studentName").value = "";
        document.getElementById("admissionNo").value = "";
        document.getElementById("parentPhone").value = "";
        await loadStudents();
    } catch (e) {
        console.error("Error adding student", e);
    }
    addStudentBtn.textContent = "Add Student";
});

const uploadStudentExcelBtn = document.getElementById("uploadStudentExcelBtn");
uploadStudentExcelBtn.addEventListener("click", () => {
    const file = document.getElementById("studentExcel").files[0];
    if (!file) return alert("Please select an Excel file.");
    
    uploadStudentExcelBtn.textContent = "Uploading...";
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            
            let count = 0;
            for (const row of json) {
                const name = row.Name || row.name;
                const adm = row.AdmissionNo || row.admissionno || row.Admissionno;
                const gen = row.Gender || row.gender || "Male";
                const phone = row.Phone || row.phone || "";
                
                if (name && adm) {
                    await addDoc(collection(db, "students"), {
                        name: String(name), admissionNo: String(adm), gender: String(gen), parentPhone: String(phone),
                        className: assignedClass, madrasaUid
                    });
                    count++;
                }
            }
            alert(`Added ${count} students successfully.`);
            document.getElementById("studentExcel").value = "";
            await loadStudents();
        } catch (err) {
            console.error("Excel upload error", err);
            alert("Error parsing Excel.");
        }
        uploadStudentExcelBtn.textContent = "Upload Excel";
    };
    reader.readAsArrayBuffer(file);
});

// INDIVIDUAL STUDENT CASCADE DELETE
window.deleteStudent = async (studentId) => {
    if (!confirm("Are you sure you want to delete this student and ALL associated marks?")) return;
    try {
        // Delete student
        await deleteDoc(doc(db, "students", studentId));
        
        // Query and delete all marks for this student
        const marksQuery = query(collection(db, "marks"), where("studentId", "==", studentId));
        const marksSnap = await getDocs(marksQuery);
        
        const deletePromises = marksSnap.docs.map(markDoc => deleteDoc(doc(db, "marks", markDoc.id)));
        await Promise.all(deletePromises);
        
        alert("Student and all associated marks deleted successfully.");
        await loadStudents();
    } catch (e) {
        console.error("Delete student error", e);
        alert("Error deleting student.");
    }
};

document.getElementById("deleteAllStudentsBtn").addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete ALL students for this class?")) return;
    try {
        const q = query(collection(db, "students"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass));
        const snap = await getDocs(q);
        const deletePromises = snap.docs.map(docSnap => deleteDoc(doc(db, "students", docSnap.id)));
        await Promise.all(deletePromises);
        alert("All students deleted.");
        await loadStudents();
    } catch (e) {
        console.error("Delete all error", e);
    }
});

async function loadStudents() {
    if (!assignedClass || !madrasaUid) return;
    
    const tbody = document.getElementById("studentsTableBody");
    const markSelect = document.getElementById("markStudentSelect");
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading...</td></tr>';
    markSelect.innerHTML = '<option value="">-- Select Student --</option>';
    studentsMap = {};
    
    try {
        const q = query(collection(db, "students"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass));
        const snap = await getDocs(q);
        
        let students = [];
        snap.forEach(doc => {
            const data = doc.data();
            students.push({ id: doc.id, ...data });
            studentsMap[data.admissionNo] = { id: doc.id, ...data };
        });
        
        students.sort((a, b) => {
            if (a.gender !== b.gender) return a.gender === 'Male' ? -1 : 1;
            return String(a.admissionNo).localeCompare(String(b.admissionNo), undefined, {numeric: true});
        });
        
        tbody.innerHTML = "";
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No students found</td></tr>';
            return;
        }
        
        students.forEach(st => {
            tbody.innerHTML += `
                <tr>
                    <td>${st.admissionNo}</td>
                    <td>${st.name}</td>
                    <td>${st.gender}</td>
                    <td>${st.parentPhone || "-"}</td>
                    <td><button class="btn btn-danger btn-small btn-auto" onclick="deleteStudent('${st.id}')">Delete</button></td>
                </tr>
            `;
            markSelect.innerHTML += `<option value="${st.id}" data-name="${st.name}" data-adm="${st.admissionNo}">${st.admissionNo} - ${st.name}</option>`;
        });
        
    } catch (e) {
        console.error("Load students error", e);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error loading</td></tr>';
    }
}

// --- TAB 2: ENTER MARKS ---
function renderSubjectInputs() {
    const container = document.getElementById("dynamicSubjectInputs");
    container.innerHTML = "";
    if (classSubjects.length === 0) {
        container.innerHTML = "<p>No subjects assigned by admin.</p>";
        return;
    }
    
    classSubjects.forEach(sub => {
        container.innerHTML += `
            <div class="form-group">
                <label>${sub}</label>
                <input type="text" class="form-control mark-input" data-subject="${sub}" placeholder="Mark or 'A' for absent">
            </div>
        `;
    });
}

document.getElementById("markStudentSelect").addEventListener("change", async (e) => {
    const studentId = e.target.value;
    const term = document.getElementById("examTerm").value;
    if (!studentId || !term) return;
    
    const docId = `${studentId}_${term.replace(/\s+/g, '')}`;
    const markDoc = await getDoc(doc(db, "marks", docId));
    
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
    const studentName = select.options[select.selectedIndex]?.getAttribute("data-name");
    const term = document.getElementById("examTerm").value;
    const attendance = document.getElementById("attendanceInput").value.trim();
    
    const globalMax = Number(document.getElementById("globalMaxMark").value) || 100;
    const globalPass = Number(document.getElementById("globalPassMark").value) || 35;
    
    if (!studentId) return alert("Select a student");
    
    let marksData = {};
    let totalObtained = 0;
    let isPassed = true;
    let valid = true;
    
    document.querySelectorAll(".mark-input").forEach(inp => {
        const sub = inp.getAttribute("data-subject");
        const val = inp.value.trim().toUpperCase();
        
        if (val === "") {
            valid = false;
        } else if (val === "A") {
            marksData[sub] = "A";
            isPassed = false;
        } else {
            const num = Number(val);
            if (isNaN(num) || num > globalMax) {
                alert(`Invalid mark for ${sub}`);
                valid = false;
            } else {
                marksData[sub] = num;
                totalObtained += num;
                if (num < globalPass) isPassed = false;
            }
        }
    });
    
    if (!valid) return;
    
    const totalMaxPossible = classSubjects.length * globalMax;
    const percentage = totalMaxPossible > 0 ? (totalObtained / totalMaxPossible) * 100 : 0;
    const finalStatus = isPassed ? "Passed" : "Failed";
    const grade = isPassed ? getGrade(percentage) : "Failed";
    
    document.getElementById("saveMarksBtn").textContent = "Saving...";
    try {
        const docId = `${studentId}_${term.replace(/\s+/g, '')}`;
        await setDoc(doc(db, "marks", docId), {
            studentId, studentName, madrasaUid, className: assignedClass, term,
            marks: marksData, attendance, totalMarks: totalObtained, maxMarkTotal: totalMaxPossible,
            passMark: globalPass, percentage, grade, status: finalStatus, updatedAt: new Date().toISOString()
        });
        alert(`Marks saved! Status: ${finalStatus}`);
    } catch (e) {
        console.error("Save mark error", e);
    }
    document.getElementById("saveMarksBtn").textContent = "Save Marks";
    document.getElementById("markStudentSelect").value = "";
    document.querySelectorAll(".mark-input").forEach(inp => inp.value = "");
});

function getGrade(percentage) {
    if(percentage >= 90) return 'A+';
    if(percentage >= 80) return 'A';
    if(percentage >= 70) return 'B+';
    if(percentage >= 60) return 'B';
    if(percentage >= 50) return 'C+';
    if(percentage >= 40) return 'C';
    if(percentage >= 35) return 'D+';
    return 'D';
}

const uploadMarksExcelBtn = document.getElementById("uploadMarksExcelBtn");
uploadMarksExcelBtn.addEventListener("click", () => {
    const file = document.getElementById("marksExcel").files[0];
    const term = document.getElementById("examTerm").value;
    const maxMark = Number(document.getElementById("globalMaxMark").value) || 100;
    const passMark = Number(document.getElementById("globalPassMark").value) || 35;
    
    if (!file) return alert("Select an Excel file.");
    
    uploadMarksExcelBtn.textContent = "Uploading...";
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            
            let count = 0;
            for (const row of json) {
                const admKey = Object.keys(row).find(k => k.toLowerCase() === 'admissionno');
                const attKey = Object.keys(row).find(k => k.toLowerCase() === 'attendance');
                if (!admKey) continue;
                
                const student = studentsMap[String(row[admKey]).trim()];
                if (!student) continue;
                
                let marksData = {};
                let totalObtained = 0;
                let isPassed = true;
                let isValid = true;
                
                for (const sub of classSubjects) {
                    const subKey = Object.keys(row).find(k => k.toLowerCase() === sub.toLowerCase());
                    let val = subKey ? String(row[subKey]).trim().toUpperCase() : "0";
                    
                    if (val === "A") {
                        marksData[sub] = "A";
                        isPassed = false;
                    } else {
                        const num = Number(val);
                        if (isNaN(num) || num > maxMark) { isValid = false; break; }
                        marksData[sub] = num;
                        totalObtained += num;
                        if (num < passMark) isPassed = false;
                    }
                }
                
                if (!isValid) continue;
                
                const totalMaxPossible = classSubjects.length * maxMark;
                const percentage = totalMaxPossible > 0 ? (totalObtained / totalMaxPossible) * 100 : 0;
                
                const docId = `${student.id}_${term.replace(/\s+/g, '')}`;
                await setDoc(doc(db, "marks", docId), {
                    studentId: student.id, studentName: student.name, madrasaUid, className: assignedClass, term,
                    marks: marksData, attendance: attKey ? String(row[attKey]).trim() : "",
                    totalMarks: totalObtained, maxMarkTotal: totalMaxPossible, passMark: passMark,
                    percentage, grade: isPassed ? getGrade(percentage) : "Failed", status: isPassed ? "Passed" : "Failed",
                    updatedAt: new Date().toISOString()
                });
                count++;
            }
            alert(`Uploaded ${count} student marks.`);
            document.getElementById("marksExcel").value = "";
        } catch (err) {
            console.error("Marks excel error", err);
            alert("Error parsing excel.");
        }
        uploadMarksExcelBtn.textContent = "Upload Marks";
    };
    reader.readAsArrayBuffer(file);
});

// --- TAB 3: RESULTS & PDF ---
document.getElementById("viewResultTerm").addEventListener("change", loadResults);

async function loadResults() {
    const term = document.getElementById("viewResultTerm").value;
    const screenHead = document.getElementById("screenResultHead");
    const screenBody = document.getElementById("screenResultBody");
    const pdfThead = document.getElementById("pdfThead");
    const pdfTbody = document.getElementById("pdfTbody");
    
    if (!assignedClass || !madrasaUid) return;
    
    // Set headers - Column order strict rule
    // Roll No, Ad.No, Name, Attendance (Hajar), [Dynamic Subjects], Total, Rank, Remarks/Status, Action (web only)
    let ths = `<tr><th>Roll No</th><th>Ad.No</th><th>Name</th><th>Attendance</th>`;
    classSubjects.forEach(sub => ths += `<th>${sub}</th>`);
    ths += `<th>Total</th><th>Rank</th><th>Remarks/Status</th><th>Action</th></tr>`;
    screenHead.innerHTML = ths;
    
    // PDF Headers
    let pdfThs = `<tr>
        <th class="vertical-header"><span>ROLL NO</span></th>
        <th class="vertical-header"><span>AD.NO</span></th>
        <th class="name-col" style="vertical-align: middle;">NAME OF STUDENTS</th>
        <th class="vertical-header"><span>HAJAR</span></th>`;
    classSubjects.forEach(sub => pdfThs += `<th class="vertical-header"><span>${sub.toUpperCase()}</span></th>`);
    pdfThs += `<th class="vertical-header"><span>TOTAL</span></th><th class="vertical-header"><span>RANK</span></th><th class="vertical-header"><span>REMARKS</span></th>
    </tr>`;
    pdfThead.innerHTML = pdfThs;
    
    document.getElementById("pdfMadrasaName").textContent = madrasaNameGlobal;
    document.getElementById("pdfExamTitle").textContent = `EXAMINATION RESULT. CLASS: ${assignedClass.toUpperCase()}`;
    document.getElementById("pdfTeacherName").textContent = teacherNameGlobal;
    
    screenBody.innerHTML = `<tr><td colspan="${9 + classSubjects.length}" style="text-align:center;">Loading...</td></tr>`;
    
    try {
        const q = query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass), where("term", "==", term));
        const snap = await getDocs(q);
        
        let results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        
        if (results.length === 0) {
            screenBody.innerHTML = `<tr><td colspan="${9 + classSubjects.length}" style="text-align:center;">No results found</td></tr>`;
            pdfTbody.innerHTML = "";
            resetSummary();
            return;
        }
        
        // Ranking (Total Marks desc)
        results.sort((a, b) => b.totalMarks - a.totalMarks);
        let rank = 1;
        results.forEach(r => {
            if (r.status !== "Failed") r.rank = rank++;
            else r.rank = "-";
        });
        
        // Sorting for display (Male first, then Female, then by Ad.No)
        results.sort((a, b) => {
            const adA = Object.keys(studentsMap).find(k => studentsMap[k].id === a.studentId) || "";
            const adB = Object.keys(studentsMap).find(k => studentsMap[k].id === b.studentId) || "";
            const gA = studentsMap[adA]?.gender || "Male";
            const gB = studentsMap[adB]?.gender || "Male";
            
            if (gA !== gB) return gA === "Male" ? -1 : 1;
            return String(adA).localeCompare(String(adB), undefined, {numeric: true});
        });
        
        screenBody.innerHTML = "";
        pdfTbody.innerHTML = "";
        
        let bTot = 0, gTot = 0, bPass = 0, gPass = 0;
        let boyRoll = 1, girlRoll = 1;
        
        results.forEach(res => {
            const adNo = Object.keys(studentsMap).find(k => studentsMap[k].id === res.studentId) || "-";
            const gen = studentsMap[adNo]?.gender || "Male";
            
            if (gen === "Male") { bTot++; if (res.status !== "Failed") bPass++; }
            else { gTot++; if (res.status !== "Failed") gPass++; }
            
            const roll = gen === "Male" ? boyRoll++ : girlRoll++;
            
            // Rules
            const isGirl = gen === "Female";
            const prefixColor = isGirl ? "#d32f2f" : "#000000";
            const normalColor = "#000000";
            
            // Marks & Status
            let screenMarks = "";
            let pdfMarks = "";
            const passLimit = res.passMark || 35;
            
            classSubjects.forEach(sub => {
                const mark = res.marks && res.marks[sub] !== undefined ? res.marks[sub] : "-";
                const isFailMark = mark === "A" || (Number(mark) < passLimit && mark !== "-");
                const markColor = isFailMark ? "#d32f2f" : "#000000";
                
                screenMarks += `<td style="color: ${markColor};">${mark}</td>`;
                pdfMarks += `<td style="color: ${markColor};">${mark}</td>`;
            });
            
            const screenStatusColor = res.status === "Failed" ? "red" : "black";
            const remarksText = res.status !== "Failed" ? "P" : "F";
            const remarksColor = res.status !== "Failed" ? "#000000" : "#d32f2f";
            const actionBtnHtml = `<button class="btn btn-danger btn-small" onclick="deleteMark('${res.id}')">Delete</button>`;
            
            // Render Screen
            screenBody.innerHTML += `
                <tr>
                    <td style="color: ${prefixColor};">${roll}</td>
                    <td style="color: ${prefixColor};">${adNo}</td>
                    <td style="color: ${prefixColor};">${res.studentName}</td>
                    <td style="color: ${normalColor};">${res.attendance || "-"}</td>
                    ${screenMarks}
                    <td style="color: ${normalColor};">${res.totalMarks}</td>
                    <td style="color: ${normalColor};">${res.rank}</td>
                    <td style="color: ${screenStatusColor}; font-weight: bold;">${res.status}</td>
                    <td>${actionBtnHtml}</td>
                </tr>
            `;
            
            // Render PDF
            pdfTbody.innerHTML += `
                <tr>
                    <td style="color: ${prefixColor};">${roll}</td>
                    <td style="color: ${prefixColor};">${adNo}</td>
                    <td class="name-col" style="color: ${prefixColor};">${res.studentName.toUpperCase()}</td>
                    <td style="color: ${normalColor};">${res.attendance || ""}</td>
                    ${pdfMarks}
                    <td style="color: ${normalColor};">${res.totalMarks}</td>
                    <td style="color: ${normalColor};">${res.rank !== "-" ? res.rank : ""}</td>
                    <td style="color: ${remarksColor}; font-weight: bold;">${remarksText}</td>
                </tr>
            `;
        });
        
        // Summary tables
        const pdfTotalRow = document.getElementById("pdfTotalRow");
        const pdfPassedRow = document.getElementById("pdfPassedRow");
        const pdfPercentageRow = document.getElementById("pdfPercentageRow");
        
        pdfTotalRow.innerHTML = `<td style="color: black;">${bTot}</td><td style="color: #d32f2f;">${gTot}</td><td style="color: black;">${bTot + gTot}</td>`;
        pdfPassedRow.innerHTML = `<td style="color: black;">${bPass}</td><td style="color: #d32f2f;">${gPass}</td><td style="color: black;">${bPass + gPass}</td>`;
        
        const bPerc = bTot > 0 ? Math.round((bPass/bTot)*100) : 0;
        const gPerc = gTot > 0 ? Math.round((gPass/gTot)*100) : 0;
        const tPerc = (bTot+gTot) > 0 ? Math.round(((bPass+gPass)/(bTot+gTot))*100) : 0;
        
        pdfPercentageRow.innerHTML = `<td style="color: black;">${bPerc}%</td><td style="color: #d32f2f;">${gPerc}%</td><td style="color: black;">${tPerc}%</td>`;
        
    } catch (e) {
        console.error("Load results error", e);
    }
}

function resetSummary() {
    document.getElementById("pdfTotalRow").innerHTML = `<td>0</td><td>0</td><td>0</td>`;
    document.getElementById("pdfPassedRow").innerHTML = `<td>0</td><td>0</td><td>0</td>`;
    document.getElementById("pdfPercentageRow").innerHTML = `<td>0%</td><td>0%</td><td>0%</td>`;
}

window.deleteMark = async (docId) => {
    if(!confirm("Are you sure you want to delete this result?")) return;
    try {
        await deleteDoc(doc(db, "marks", docId));
        loadResults();
    } catch(e) {
        console.error("Error deleting mark", e);
    }
};

// --- EXACT PDF GENERATION RULES ---
document.getElementById("downloadPdfBtn").addEventListener("click", () => {
    const area = document.getElementById("pdfExportArea");
    const term = document.getElementById("viewResultTerm").value;
    
    // FIX BLANK/BLACK TOP ISSUE
    window.scrollTo(0, 0);
    
    html2canvas(area, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: "#ffffff", 
        scrollY: 0 
    }).then(canvas => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
        
        // FIX IMAGE STRETCHING: Maintain perfect aspect ratio in jsPDF
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${assignedClass}_${term}_Result.pdf`);
    });
});