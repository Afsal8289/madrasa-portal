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
if (userRole !== 'teacher') { alert("Unauthorized Access!"); window.location.href = "index.html"; }

let teacherUid = "";
let assignedClass = "";
let madrasaUid = "";
let madrasaNameGlobal = "MADRASA";
let teacherNameGlobal = "TEACHER";
let classSubjects = [];
let studentsMap = {};
let editModalInstance = null;

const displayMadrasaName = document.getElementById("displayMadrasaName");
const displayClassName = document.getElementById("displayClassName");
const logoutBtn = document.getElementById("logoutBtn");

onAuthStateChanged(auth, async (user) => {
    if (user) {
        teacherUid = user.uid;
        editModalInstance = new bootstrap.Modal(document.getElementById('editStudentModal'));
        await loadTeacherData();
        setupTabs();
        loadPublishSettings(document.getElementById("publishTerm").value);
    }
});

logoutBtn.addEventListener("click", () => { signOut(auth).then(() => { localStorage.clear(); window.location.href = "index.html"; }); });

function clearCache(keyPrefix) {
    Object.keys(localStorage).forEach(key => { if(key.startsWith(keyPrefix)) localStorage.removeItem(key); });
}

// GRADE LOGIC
function getGrade(percentage, isPassed) {
    if (!isPassed) return "D"; 
    if (percentage >= 90) return "A+";
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B+";
    if (percentage >= 60) return "B";
    if (percentage >= 50) return "C+";
    if (percentage >= 40) return "C";
    return "D+"; 
}

// DATE FORMAT HELPER 
function formatDate(dateStr) {
    if (!dateStr) return "-";
    if (String(dateStr).includes("-")) {
        const parts = String(dateStr).split("-");
        if (parts[0].length === 4) { 
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }
    return dateStr;
}

async function loadTeacherData() {
    try {
        const teacherDoc = await getDoc(doc(db, "users", teacherUid));
        if (teacherDoc.exists()) {
            const tData = teacherDoc.data();
            assignedClass = String(tData.assignedClass);
            madrasaUid = tData.madrasaUid;
            teacherNameGlobal = tData.name;
            
            let rawSubjects = tData.subjects || [];
            classSubjects = rawSubjects.map(sub => {
                if(typeof sub === 'string') return { name: sub, maxMark: 100, passMark: 35 }; 
                return sub;
            });
            
            displayClassName.textContent = assignedClass;
            
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

// --- SUBJECTS WITH INDIVIDUAL MARKS ---
document.getElementById("addSubjectBtn").addEventListener("click", async () => {
    const newSub = document.getElementById("newSubjectName").value.trim();
    const maxMark = Number(document.getElementById("newSubjectMaxMark").value) || 100;
    const passMark = Number(document.getElementById("newSubjectPassMark").value) || 35;
    
    if(!newSub) return;
    if(classSubjects.some(s => s.name === newSub)) return alert("Subject already exists!");
    
    classSubjects.push({ name: newSub, maxMark, passMark });
    
    try { 
        await updateDoc(doc(db, "users", teacherUid), { subjects: classSubjects }); 
        document.getElementById("newSubjectName").value = ""; 
        document.getElementById("newSubjectMaxMark").value = ""; 
        document.getElementById("newSubjectPassMark").value = ""; 
        renderSubjectsUI(); 
        loadResults(); 
    } catch (e) {}
});

// പുതിയ സബ്ജക്റ്റ് ഡിലീറ്റ് സിസ്റ്റം (മാർക്ക് സഹിതം ഡിലീറ്റ് ആകും)
window.deleteSubject = async (subName) => {
    if(!confirm(`Are you absolutely sure you want to delete the subject '${subName}'?\n\nWARNING: This will permanently DELETE all marks associated with this subject for ALL students in this class!`)) return;
    
    classSubjects = classSubjects.filter(s => s.name !== subName);
    
    try { 
        // 1. ടീച്ചറുടെ ഡാറ്റാബേസിൽ നിന്ന് സബ്ജക്റ്റ് ഒഴിവാക്കുന്നു
        await updateDoc(doc(db, "users", teacherUid), { subjects: classSubjects }); 
        
        // 2. ഈ ക്ലാസ്സിലെ എല്ലാ കുട്ടികളുടെയും മാർക്കുകൾ എടുക്കുന്നു
        const marksQuery = query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass));
        const marksSnap = await getDocs(marksQuery);
        
        // 3. ഓരോ കുട്ടിയുടെയും മാർക്കുകളിൽ നിന്നും ഈ സബ്ജക്റ്റ് ഒഴിവാക്കി ബാക്കിയുള്ളവ റീ-കാൽക്കുലേറ്റ് ചെയ്യുന്നു
        const updatePromises = marksSnap.docs.map(async (markDoc) => {
            const data = markDoc.data();
            let marksData = data.marks || {};
            let subjectConfig = data.subjectConfig || [];
            
            if (marksData[subName] !== undefined || subjectConfig.some(s => s.name === subName)) {
                delete marksData[subName];
                subjectConfig = subjectConfig.filter(s => s.name !== subName);
                
                let newTotalObtained = 0, newTotalMax = 0, isPassed = true;
                
                subjectConfig.forEach(sub => {
                    newTotalMax += sub.maxMark;
                    const markVal = marksData[sub.name];
                    
                    if (markVal === "A") {
                        isPassed = false;
                    } else if (markVal !== undefined && markVal !== "-") {
                        const num = Number(markVal);
                        newTotalObtained += num;
                        if (num < sub.passMark) isPassed = false;
                    }
                });
                
                const percentage = newTotalMax > 0 ? (newTotalObtained / newTotalMax) * 100 : 0;
                const finalGrade = getGrade(percentage, isPassed);
                
                return updateDoc(doc(db, "marks", markDoc.id), {
                    marks: marksData,
                    subjectConfig: subjectConfig,
                    totalMarks: newTotalObtained,
                    maxMarkTotal: newTotalMax,
                    percentage: percentage,
                    grade: finalGrade,
                    status: isPassed ? "Passed" : "Failed"
                });
            }
        });
        
        await Promise.all(updatePromises);
        clearCache(`cache_marks_${assignedClass}`);
        
        renderSubjectsUI(); 
        loadResults(); 
        alert(`Subject '${subName}' and its marks deleted successfully!`);
    } catch (e) {
        console.error(e);
        alert("Error deleting subject.");
    }
};

function renderSubjectsUI() {
    const tagsContainer = document.getElementById("subjectTagsContainer");
    tagsContainer.innerHTML = "";
    classSubjects.forEach(sub => { 
        tagsContainer.innerHTML += `<div class="subject-tag">${sub.name} <span style="color:#2e7d32; font-size:11px;">(${sub.passMark}/${sub.maxMark})</span> <button class="delete-sub-btn" onclick="deleteSubject('${sub.name}')">X</button></div>`; 
    });
    
    const inputsContainer = document.getElementById("dynamicSubjectInputs");
    inputsContainer.innerHTML = classSubjects.length === 0 ? "<p>No subjects added.</p>" : "";
    classSubjects.forEach(sub => { 
        inputsContainer.innerHTML += `<div class="form-group"><label>${sub.name} (Max: ${sub.maxMark}, Pass: ${sub.passMark})</label><input type="text" class="form-control mark-input" data-subject="${sub.name}" placeholder="Mark or 'A'"></div>`; 
    });
}

// --- TAB 1: ADD & LOAD STUDENTS ---
document.getElementById("addStudentBtn").addEventListener("click", async () => {
    const name = document.getElementById("studentName").value.trim();
    const admissionNo = document.getElementById("admissionNo").value.trim();
    const gender = document.getElementById("gender").value;
    const dob = document.getElementById("dob").value;
    const fatherName = document.getElementById("fatherName").value.trim();
    const place = document.getElementById("place").value.trim();
    const contactNo = document.getElementById("contactNo").value.trim();
    const whatsappNo = document.getElementById("whatsappNo").value.trim();

    if (!name || !admissionNo) return alert("Name and Admission No are required.");
    
    document.getElementById("addStudentBtn").textContent = "Adding...";
    try {
        await addDoc(collection(db, "students"), { name, admissionNo, gender, dob, fatherName, place, contactNo, whatsappNo, className: assignedClass, madrasaUid });
        ['studentName', 'admissionNo', 'dob', 'fatherName', 'place', 'contactNo', 'whatsappNo'].forEach(id => document.getElementById(id).value = "");
        clearCache(`cache_students_${assignedClass}`);
        await loadStudents();
    } catch (e) {}
    document.getElementById("addStudentBtn").textContent = "Add Student";
});

async function loadStudents() {
    if (!assignedClass || !madrasaUid) return;
    const tbody = document.getElementById("studentsTableBody");
    const upgradeBody = document.getElementById("upgradeTableBody");
    const pdfListBody = document.getElementById("pdfStudentListBody");
    const markSelect = document.getElementById("markStudentSelect");
    
    const cacheKey = `cache_students_${assignedClass}`;
    const cachedData = localStorage.getItem(cacheKey);
    let students = [];
    
    if (cachedData) { students = JSON.parse(cachedData); } 
    else {
        const snap = await getDocs(query(collection(db, "students"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass)));
        snap.forEach(doc => students.push({ id: doc.id, ...doc.data() }));
        localStorage.setItem(cacheKey, JSON.stringify(students));
    }

    studentsMap = {};
    students.sort((a, b) => {
        if (a.gender !== b.gender) return a.gender === 'Male' ? -1 : 1;
        return String(a.admissionNo).localeCompare(String(b.admissionNo), undefined, {numeric: true});
    });
    
    tbody.innerHTML = students.length === 0 ? '<tr><td colspan="8" style="text-align: center;">No students</td></tr>' : "";
    upgradeBody.innerHTML = students.length === 0 ? '<tr><td colspan="4" style="text-align: center;">No students</td></tr>' : "";
    pdfListBody.innerHTML = "";
    markSelect.innerHTML = '<option value="">-- Select Student --</option>';
    
    document.getElementById("pdfMadrasaName4").textContent = madrasaNameGlobal;
    document.getElementById("pdfClassTitle4").textContent = `CLASS: ${assignedClass.toUpperCase()} - STUDENTS LIST`;

    students.forEach(st => {
        studentsMap[st.admissionNo] = st;
        const displayDob = formatDate(st.dob);
        
        tbody.innerHTML += `<tr>
            <td>${st.admissionNo}</td><td>${st.name}</td><td>${st.gender}</td>
            <td>${displayDob}</td><td>${st.contactNo || "-"}</td><td>${st.whatsappNo || "-"}</td><td>${st.place || "-"}</td>
            <td><button class="btn-custom btn-warning-custom btn-small btn-auto" onclick="openEditModal('${st.admissionNo}')">Edit</button> <button class="btn-custom btn-danger-custom btn-small btn-auto" onclick="deleteStudent('${st.id}')">Del</button></td></tr>`;
            
        upgradeBody.innerHTML += `<tr><td><input type="checkbox" class="upgrade-checkbox" value="${st.id}"></td><td>${st.admissionNo}</td><td>${st.name}</td><td>${st.gender}</td></tr>`;

        pdfListBody.innerHTML += `<tr>
            <td>${st.admissionNo}</td><td style="text-align:left;">${st.name}</td><td>${st.gender}</td>
            <td>${displayDob}</td><td>${st.contactNo || "-"}</td><td>${st.whatsappNo || "-"}</td><td>${st.place || "-"}</td></tr>`;

        markSelect.innerHTML += `<option value="${st.id}" data-name="${st.name}" data-adm="${st.admissionNo}">${st.admissionNo} - ${st.name}</option>`;
    });
}

window.openEditModal = (adNo) => {
    const st = studentsMap[adNo];
    if(!st) return;
    document.getElementById("editStudentId").value = st.id;
    document.getElementById("editName").value = st.name || "";
    document.getElementById("editAdNo").value = st.admissionNo || "";
    document.getElementById("editGender").value = st.gender || "Male";
    document.getElementById("editDob").value = st.dob || "";
    document.getElementById("editFatherName").value = st.fatherName || "";
    document.getElementById("editPlace").value = st.place || "";
    document.getElementById("editContactNo").value = st.contactNo || "";
    document.getElementById("editWhatsappNo").value = st.whatsappNo || "";
    editModalInstance.show();
};

document.getElementById("saveEditStudentBtn").addEventListener("click", async () => {
    const id = document.getElementById("editStudentId").value;
    const name = document.getElementById("editName").value.trim();
    const admissionNo = document.getElementById("editAdNo").value.trim();
    if(!name || !admissionNo) return alert("Name & Ad No required");
    
    document.getElementById("saveEditStudentBtn").textContent = "Saving...";
    try {
        await updateDoc(doc(db, "students", id), {
            name, admissionNo, gender: document.getElementById("editGender").value,
            dob: document.getElementById("editDob").value, fatherName: document.getElementById("editFatherName").value.trim(),
            place: document.getElementById("editPlace").value.trim(), contactNo: document.getElementById("editContactNo").value.trim(),
            whatsappNo: document.getElementById("editWhatsappNo").value.trim()
        });
        clearCache(`cache_students_${assignedClass}`);
        editModalInstance.hide();
        await loadStudents();
    } catch (e) { alert("Error updating student"); }
    document.getElementById("saveEditStudentBtn").textContent = "Save Changes";
});

window.deleteStudent = async (studentId) => {
    if (!confirm("Are you sure you want to delete this student and ALL associated marks?")) return;
    try {
        await deleteDoc(doc(db, "students", studentId));
        const marksSnap = await getDocs(query(collection(db, "marks"), where("studentId", "==", studentId)));
        marksSnap.docs.forEach(async (m) => await deleteDoc(doc(db, "marks", m.id)));
        clearCache(`cache_students_${assignedClass}`); clearCache(`cache_marks_${assignedClass}`);
        await loadStudents();
    } catch (e) {}
};

// --- UPGRADE STUDENTS (TAB 4) ---
document.getElementById("selectAllUpgrade").addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll(".upgrade-checkbox").forEach(cb => cb.checked = isChecked);
});

document.getElementById("processUpgradeBtn").addEventListener("click", async () => {
    const targetClass = document.getElementById("upgradeTargetClass").value;
    if(targetClass === assignedClass) return alert("Select a DIFFERENT class.");
    const checkboxes = document.querySelectorAll(".upgrade-checkbox:checked");
    if(checkboxes.length === 0) return alert("Select students to upgrade.");
    if(!confirm(`Move ${checkboxes.length} students to Class ${targetClass}?`)) return;
    
    document.getElementById("processUpgradeBtn").textContent = "Upgrading...";
    try {
        const updatePromises = Array.from(checkboxes).map(cb => updateDoc(doc(db, "students", cb.value), { className: String(targetClass) }));
        await Promise.all(updatePromises);
        clearCache(`cache_students_${assignedClass}`); clearCache(`cache_students_${targetClass}`);
        alert(`Upgraded ${checkboxes.length} students.`);
        document.getElementById("selectAllUpgrade").checked = false;
        await loadStudents();
    } catch(e) {}
    document.getElementById("processUpgradeBtn").textContent = "Upgrade Selected Students";
});

// --- MARKS ENTRY ---
document.getElementById("markStudentSelect").addEventListener("change", async (e) => {
    const studentId = e.target.value; const term = document.getElementById("examTerm").value;
    if (!studentId || !term) return;
    const markDoc = await getDoc(doc(db, "marks", `${studentId}_${term.replace(/\s+/g, '')}`));
    
    if (markDoc.exists()) {
        const data = markDoc.data();
        document.getElementById("attendanceInput").value = data.attendance || "";
        document.querySelectorAll(".mark-input").forEach(inp => {
            const subName = inp.getAttribute("data-subject");
            inp.value = data.marks && data.marks[subName] !== undefined ? data.marks[subName] : "";
        });
        document.getElementById("saveMarksBtn").textContent = "Update Marks";
    } else {
        document.getElementById("attendanceInput").value = "";
        document.querySelectorAll(".mark-input").forEach(inp => inp.value = "");
        document.getElementById("saveMarksBtn").textContent = "Save Marks";
    }
});

document.getElementById("saveMarksBtn").addEventListener("click", async () => {
    const select = document.getElementById("markStudentSelect"); const studentId = select.value;
    if (!studentId) return alert("Select a student");
    
    const studentName = select.options[select.selectedIndex]?.getAttribute("data-name");
    const term = document.getElementById("examTerm").value;
    
    let marksData = {}, totalObtained = 0, isPassed = true, valid = true;
    let totalMaxPossible = 0;
    
    classSubjects.forEach(sub => {
        totalMaxPossible += sub.maxMark;
        const inp = document.querySelector(`.mark-input[data-subject="${sub.name}"]`);
        const val = inp.value.trim().toUpperCase();
        
        if (val === "") valid = false;
        else if (val === "A") { marksData[sub.name] = "A"; isPassed = false; }
        else {
            const num = Number(val);
            if (isNaN(num) || num > sub.maxMark) valid = false;
            else { 
                marksData[sub.name] = num; 
                totalObtained += num; 
                if (num < sub.passMark) isPassed = false; 
            }
        }
    });
    
    if (!valid) return alert("Please check marks inputs. Ensure they don't exceed Max Mark for each subject.");
    
    const percentage = totalMaxPossible > 0 ? (totalObtained / totalMaxPossible) * 100 : 0;
    const finalGrade = getGrade(percentage, isPassed);
    
    document.getElementById("saveMarksBtn").textContent = "Saving...";
    try {
        await setDoc(doc(db, "marks", `${studentId}_${term.replace(/\s+/g, '')}`), {
            studentId, studentName, madrasaUid, className: assignedClass, term,
            marks: marksData, attendance: document.getElementById("attendanceInput").value, 
            totalMarks: totalObtained, maxMarkTotal: totalMaxPossible,
            subjectConfig: classSubjects,
            percentage, grade: finalGrade, status: isPassed ? "Passed" : "Failed"
        });
        clearCache(`cache_marks_${assignedClass}`);
        alert("Marks saved!"); select.value = ""; document.querySelectorAll(".mark-input").forEach(i => i.value="");
    } catch (e) {}
    document.getElementById("saveMarksBtn").textContent = "Save Marks";
});

// BULK EXCEL UPLOAD UPDATE
document.getElementById("uploadMarksExcelBtn").addEventListener("click", () => {
    const file = document.getElementById("marksExcel").files[0];
    const term = document.getElementById("examTerm").value;
    if (!file) return alert("Select an Excel file.");
    
    document.getElementById("uploadMarksExcelBtn").textContent = "Uploading...";
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            let count = 0;
            
            let totalMaxPossible = classSubjects.reduce((sum, sub) => sum + sub.maxMark, 0);

            for (const row of json) {
                const admKey = Object.keys(row).find(k => k.toLowerCase() === 'admissionno');
                const attKey = Object.keys(row).find(k => k.toLowerCase() === 'attendance');
                if (!admKey) continue;
                
                const student = studentsMap[String(row[admKey]).trim()];
                if (!student) continue;
                
                let marksData = {}, totalObtained = 0, isPassed = true, isValid = true;
                
                for (const sub of classSubjects) {
                    const subKey = Object.keys(row).find(k => k.toLowerCase() === sub.name.toLowerCase());
                    let val = subKey ? String(row[subKey]).trim().toUpperCase() : "0";
                    
                    if (val === "A") {
                        marksData[sub.name] = "A";
                        isPassed = false;
                    } else {
                        const num = Number(val);
                        if (isNaN(num) || num > sub.maxMark) { isValid = false; break; }
                        marksData[sub.name] = num;
                        totalObtained += num;
                        if (num < sub.passMark) isPassed = false;
                    }
                }
                
                if (!isValid) continue; 
                
                const percentage = totalMaxPossible > 0 ? (totalObtained / totalMaxPossible) * 100 : 0;
                const finalGrade = getGrade(percentage, isPassed);
                
                const docId = `${student.id}_${term.replace(/\s+/g, '')}`;
                await setDoc(doc(db, "marks", docId), {
                    studentId: student.id, studentName: student.name, madrasaUid, className: assignedClass, term,
                    marks: marksData, attendance: attKey ? String(row[attKey]).trim() : "",
                    totalMarks: totalObtained, maxMarkTotal: totalMaxPossible,
                    subjectConfig: classSubjects,
                    percentage, grade: finalGrade, status: isPassed ? "Passed" : "Failed"
                });
                count++;
            }
            clearCache(`cache_marks_${assignedClass}`);
            alert(`Uploaded ${count} student marks.`);
            document.getElementById("marksExcel").value = "";
            loadResults();
        } catch (err) { alert("Error parsing excel."); }
        document.getElementById("uploadMarksExcelBtn").textContent = "Upload Marks";
    };
    reader.readAsArrayBuffer(file);
});


// --- BULK DELETE MARKS ---
document.getElementById("deleteAllMarksTermBtn").addEventListener("click", async () => {
    const term = document.getElementById("viewResultTerm").value;
    if(!confirm(`Are you absolutely sure you want to DELETE ALL marks for ${term} in Class ${assignedClass}?`)) return;
    
    document.getElementById("deleteAllMarksTermBtn").textContent = "Deleting...";
    try {
        const snap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass), where("term", "==", term)));
        const deletePromises = snap.docs.map(mDoc => deleteDoc(doc(db, "marks", mDoc.id)));
        await Promise.all(deletePromises);
        
        clearCache(`cache_marks_${assignedClass}`);
        alert(`All marks for ${term} deleted successfully.`);
        loadResults();
    } catch (e) { alert("Error deleting marks."); }
    document.getElementById("deleteAllMarksTermBtn").textContent = "Delete ALL Marks for this Term";
});

// --- LOAD RESULTS ---
document.getElementById("viewResultTerm").addEventListener("change", loadResults);

async function loadResults() {
    const term = document.getElementById("viewResultTerm").value;
    if (!assignedClass || !madrasaUid) return;
    
    let ths = `<tr><th>Roll No</th><th>Ad.No</th><th>Name</th><th>Att.</th>`;
    let pdfThs1 = `<tr><th class="vertical-header"><span>ROLL NO</span></th><th class="vertical-header"><span>AD.NO</span></th><th class="name-col" style="vertical-align:middle;">NAME OF STUDENTS</th><th class="vertical-header"><span>HAJAR</span></th>`;
    let pdfThs2 = `<tr><th>Roll No</th><th>Ad.No</th><th style="text-align:left;">Name of Students</th><th>Att.</th>`;
    
    classSubjects.forEach(sub => {
        ths += `<th>${sub.name}</th>`;
        pdfThs1 += `<th class="vertical-header"><span>${sub.name.toUpperCase()}</span></th>`;
        pdfThs2 += `<th>${sub.name.toUpperCase()}</th>`;
    });
    
    ths += `<th>Total</th><th>Rank</th><th>Grade</th><th>Status</th><th>Action</th></tr>`;
    pdfThs1 += `<th class="vertical-header"><span>TOTAL</span></th><th class="vertical-header"><span>RANK</span></th><th class="vertical-header"><span>REMARKS</span></th></tr>`;
    pdfThs2 += `<th>Total</th><th>Rank</th><th>Grade</th><th>Status</th></tr>`;
    
    document.getElementById("screenResultHead").innerHTML = ths;
    document.getElementById("pdfThead1").innerHTML = pdfThs1;
    document.getElementById("pdfThead2").innerHTML = pdfThs2;
    
    const titleText = `EXAMINATION RESULT. CLASS: ${assignedClass.toUpperCase()} - ${term.toUpperCase()}`;
    ['pdfMadrasaName1', 'pdfMadrasaName2'].forEach(id => document.getElementById(id).textContent = madrasaNameGlobal);
    document.getElementById("pdfExamTitle1").textContent = titleText;
    document.getElementById("pdfExamTitle2").textContent = titleText;
    document.getElementById("pdfTeacherName1").textContent = teacherNameGlobal;
    
    const cacheKey = `cache_marks_${assignedClass}_${term}`;
    let results = [];
    const cachedMarks = localStorage.getItem(cacheKey);
    
    if(cachedMarks) { results = JSON.parse(cachedMarks); } 
    else {
        const snap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass), where("term", "==", term)));
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        localStorage.setItem(cacheKey, JSON.stringify(results));
    }

    if (results.length === 0) {
        document.getElementById("screenResultBody").innerHTML = `<tr><td colspan="100%" style="text-align:center;">No results</td></tr>`;
        ['pdfTbody1', 'pdfTbody2', 'deskLabelsGrid'].forEach(id => document.getElementById(id).innerHTML = "");
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
    
    let sBody = "", pBody1 = "", pBody2 = "", deskGrid = "";
    let bTot = 0, gTot = 0, bPass = 0, gPass = 0;
    let boyRoll = 1, girlRoll = 1;
    
    results.forEach(res => {
        const adNo = Object.keys(studentsMap).find(k => studentsMap[k].id === res.studentId) || "-";
        const gen = studentsMap[adNo]?.gender || "Male";
        
        if (gen === "Male") { bTot++; if (res.status !== "Failed") bPass++; }
        else { gTot++; if (res.status !== "Failed") gPass++; }
        
        const roll = gen === "Male" ? boyRoll++ : girlRoll++;
        const color = gen === "Female" ? "#d32f2f" : "#000000"; 
        const deskBorderColor = gen === "Female" ? "#d32f2f" : "#000000";
        
        let marksHTMLScreen = "", marksHTMLPdf1 = "", marksHTMLPdf2 = "";
        
        classSubjects.forEach(sub => {
            const mark = res.marks && res.marks[sub.name] !== undefined ? res.marks[sub.name] : "-";
            const passLimit = sub.passMark || 35;
            const isFailMark = mark === "A" || (mark !== "-" && Number(mark) < passLimit);
            const mColor = isFailMark ? "#d32f2f" : "#000000";
            
            marksHTMLScreen += `<td style="color: ${mColor};">${mark}</td>`;
            marksHTMLPdf1 += `<td style="color: ${mColor};">${mark}</td>`;
            marksHTMLPdf2 += `<td style="color: ${mColor};">${mark}</td>`;
        });
        
        let displayGrade = res.grade;
        if (!displayGrade || displayGrade.includes("Failed") || displayGrade.toLowerCase() === "passed") {
            displayGrade = getGrade(res.percentage, res.status !== "Failed");
        }

        const statusText = res.status === "Failed" ? "FAILED" : "PASSED";
        const statusColor = res.status === "Failed" ? "#d32f2f" : "#000000";

        sBody += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${adNo}</td><td style="color:${color};">${res.studentName}</td>
            <td>${res.attendance || "-"}</td>${marksHTMLScreen}<td>${res.totalMarks}</td><td>${res.rank}</td><td style="font-weight:bold;">${displayGrade}</td>
            <td style="color:${statusColor};">${statusText}</td>
            <td><button class="btn-custom btn-danger-custom btn-small" onclick="deleteMark('${res.id}', '${term}')">Del</button></td></tr>`;
            
        pBody1 += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${adNo}</td><td class="name-col" style="color:${color};">${res.studentName.toUpperCase()}</td>
            <td>${res.attendance || ""}</td>${marksHTMLPdf1}<td>${res.totalMarks}</td><td>${res.rank !== "-" ? res.rank : ""}</td>
            <td style="color:${statusColor};">${statusText === "FAILED" ? "F" : "P"}</td></tr>`;
            
        pBody2 += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${adNo}</td><td style="text-align:left; color:${color};">${res.studentName.toUpperCase()}</td>
            <td>${res.attendance || ""}</td>${marksHTMLPdf2}<td>${res.totalMarks}</td><td>${res.rank !== "-" ? res.rank : ""}</td>
            <td style="font-weight:bold;">${displayGrade}</td><td style="color:${statusColor}; font-weight:bold;">${statusText}</td></tr>`;

        deskGrid += `
            <div class="desk-label-box" style="border-color: ${deskBorderColor}; color: ${color};">
                <p>Roll No: ${roll}</p>
                <p>Name: ${res.studentName.toUpperCase()}</p>
                <p>Class: ${assignedClass.toUpperCase()}</p>
            </div>
        `;
    });
    
    document.getElementById("screenResultBody").innerHTML = sBody;
    document.getElementById("pdfTbody1").innerHTML = pBody1;
    document.getElementById("pdfTbody2").innerHTML = pBody2;
    document.getElementById("deskLabelsGrid").innerHTML = deskGrid;
    
    document.getElementById("pdfTot1").innerHTML = `<td style="color: black;">${bTot}</td><td style="color: #d32f2f;">${gTot}</td><td style="color: black;">${bTot + gTot}</td>`;
    document.getElementById("pdfPass1").innerHTML = `<td style="color: black;">${bPass}</td><td style="color: #d32f2f;">${gPass}</td><td style="color: black;">${bPass + gPass}</td>`;
    document.getElementById("pdfPerc1").innerHTML = `<td style="color: black;">${bTot > 0 ? Math.round((bPass/bTot)*100) : 0}%</td><td style="color: #d32f2f;">${gTot > 0 ? Math.round((gPass/gTot)*100) : 0}%</td><td style="color: black;">${(bTot+gTot) > 0 ? Math.round(((bPass+gPass)/(bTot+gTot))*100) : 0}%</td>`;
}

window.deleteMark = async (docId, term) => {
    if(!confirm("Delete this result?")) return;
    await deleteDoc(doc(db, "marks", docId));
    clearCache(`cache_marks_${assignedClass}`);
    loadResults();
};

// --- RESULT PUBLISH MANAGEMENT ---
document.getElementById("publishTerm").addEventListener("change", async (e) => {
    loadPublishSettings(e.target.value);
});

async function loadPublishSettings(term) {
    if(!madrasaUid || !assignedClass || !term) return;
    const docId = `${madrasaUid}_${assignedClass}_${term.replace(/\s+/g, '')}`;
    const statusText = document.getElementById("publishStatusText");
    
    try {
        const docSnap = await getDoc(doc(db, "publish_settings", docId));
        if(docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("publishStatus").value = data.isPublished ? "published" : "hidden";
            document.getElementById("publishDateTime").value = data.publishDateTime || "";
            statusText.textContent = data.isPublished ? "Current Status: Published (Visible to Students)" : "Current Status: Locked (Hidden from Students)";
            statusText.style.color = data.isPublished ? "#2e7d32" : "#d32f2f";
        } else {
            document.getElementById("publishStatus").value = "hidden";
            document.getElementById("publishDateTime").value = "";
            statusText.textContent = "Current Status: Locked (Default)";
            statusText.style.color = "#d32f2f";
        }
    } catch(e) {
        console.error("Error loading publish settings", e);
    }
}

document.getElementById("savePublishSettingsBtn").addEventListener("click", async () => {
    const term = document.getElementById("publishTerm").value;
    const isPublished = document.getElementById("publishStatus").value === "published";
    const publishDateTime = document.getElementById("publishDateTime").value;
    const docId = `${madrasaUid}_${assignedClass}_${term.replace(/\s+/g, '')}`;
    
    document.getElementById("savePublishSettingsBtn").textContent = "Saving...";
    try {
        await setDoc(doc(db, "publish_settings", docId), {
            madrasaUid,
            className: assignedClass,
            term,
            isPublished,
            publishDateTime
        });
        alert(`Settings for ${term} saved successfully!`);
        loadPublishSettings(term);
    } catch(e) {
        alert("Error saving settings");
    }
    document.getElementById("savePublishSettingsBtn").textContent = "Save Publish Settings";
});

// PDF Generator
function generatePDF(areaId, fileName, orientation = 'p') {
    const area = document.getElementById(areaId);
    const wrapper = area.parentElement;
    window.scrollTo(0, 0);
    wrapper.style.left = "0";
    
    html2canvas(area, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }).then(canvas => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jspdf.jsPDF(orientation, 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        let imgWidth = pdfWidth;
        let imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        if (imgHeight > pdfHeight) {
            imgHeight = pdfHeight - 10;
            imgWidth = (canvas.width * imgHeight) / canvas.height;
        }
        
        const xPos = (pdfWidth - imgWidth) / 2;
        pdf.addImage(imgData, 'PNG', xPos, 5, imgWidth, imgHeight);
        pdf.save(fileName);
        wrapper.style.left = "-9999px";
    });
}

document.getElementById("downloadStudentListBtn").addEventListener("click", () => generatePDF("pdfStudentListArea", `${assignedClass}_Students_List.pdf`, 'p'));
document.getElementById("downloadDetailedPdfBtn").addEventListener("click", () => generatePDF("pdfExportArea", `${assignedClass}_Marklist_Old.pdf`, 'p'));
document.getElementById("downloadNoticeBoardPdfBtn").addEventListener("click", () => generatePDF("pdfNoticeBoardArea", `${assignedClass}_NoticeBoard_Result.pdf`, 'l')); 
document.getElementById("downloadDeskLabelsBtn").addEventListener("click", () => generatePDF("pdfDeskLabelsArea", `${assignedClass}_Desk_Labels.pdf`, 'p'));