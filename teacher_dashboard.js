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
let customMadrasaId = "";
let classSubjects = [];
let studentsMap = {};
let editModalInstance = null;
let classMuallimName = ""; 
let isSmartCacheValid = false; 

const displayMadrasaName = document.getElementById("displayMadrasaName");
const displayClassName = document.getElementById("displayClassName");
const logoutBtn = document.getElementById("logoutBtn");

function safeSetCache(key, value) {
    try { localStorage.setItem(key, value); } 
    catch (e) { console.warn("Cache issue"); localStorage.removeItem(key); }
}

const syncBtn = document.createElement("button");
syncBtn.innerHTML = "🔄 Sync Data";
syncBtn.className = "btn-custom btn-small";
syncBtn.style = "background: #27ae60; color: white; margin-right: 15px; font-weight: bold;";
syncBtn.onclick = async () => {
    syncBtn.textContent = "Syncing...";
    const currentTerm = document.getElementById("viewResultTerm").value.replace(/\s+/g, '');
    localStorage.removeItem(`smart_time_${assignedClass}`);
    localStorage.removeItem(`cache_students_${assignedClass}`);
    localStorage.removeItem(`cache_subs_${assignedClass}`);
    localStorage.removeItem(`cache_marks_${assignedClass}_${currentTerm}`);
    isSmartCacheValid = false;
    await loadTeacherData();
    syncBtn.innerHTML = "🔄 Sync Data";
    alert("പുതിയ മാറ്റങ്ങൾ മാത്രം വിജയകരമായി അപ്ഡേറ്റ് ചെയ്തു!");
};
logoutBtn.parentNode.insertBefore(syncBtn, logoutBtn);


// 📌 തെറ്റായ എക്സാമിൽ ചേർത്ത മാർക്കുകൾ മാറ്റാനുള്ള (Transfer Marks) പുതിയ UI
function setupTransferMarksUI() {
    const actionArea = document.getElementById("deleteAllMarksTermBtn");
    if (!actionArea || document.getElementById("transferMarksContainer")) return;

    const transferDiv = document.createElement("div");
    transferDiv.id = "transferMarksContainer";
    transferDiv.innerHTML = `
        <div style="background:#fff3cd; border:1px solid #ffe69c; padding:15px; border-radius:8px; margin-top:20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h6 style="color:#856404; margin-top:0; margin-bottom:12px; font-weight:bold; font-size:14px;"><i class="fas fa-exchange-alt"></i> തെറ്റായ എക്സാമിൽ നൽകിയ മാർക്കുകൾ മാറ്റാൻ (Transfer Marks)</h6>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <select id="transferFromTerm" class="form-control" style="flex:1; min-width:130px;">
                    <option value="">From (മാറ്റേണ്ടത്)</option>
                    <option value="Monthly Test">Monthly Test</option>
                    <option value="Quarterly Exam">Quarterly Exam</option>
                    <option value="Half Yearly Exam">Half Yearly Exam</option>
                    <option value="Annual Exam">Annual Exam</option>
                </select>
                <i class="fas fa-arrow-right" style="color:#856404;"></i>
                <select id="transferToTerm" class="form-control" style="flex:1; min-width:130px;">
                    <option value="">To (ശരിയായത്)</option>
                    <option value="Monthly Test">Monthly Test</option>
                    <option value="Quarterly Exam">Quarterly Exam</option>
                    <option value="Half Yearly Exam">Half Yearly Exam</option>
                    <option value="Annual Exam">Annual Exam</option>
                </select>
                <button id="processTransferBtn" class="btn-custom btn-warning-custom btn-small" style="font-weight:bold;">Move Marks</button>
            </div>
        </div>
    `;
    actionArea.parentElement.appendChild(transferDiv);

    document.getElementById("processTransferBtn").addEventListener("click", async () => {
        const fromTerm = document.getElementById("transferFromTerm").value;
        const toTerm = document.getElementById("transferToTerm").value;
        
        if(!fromTerm || !toTerm) return alert("ദയവായി രണ്ട് എക്സാമുകളും സെലക്ട് ചെയ്യുക.");
        if(fromTerm === toTerm) return alert("രണ്ടും ഒരേ എക്സാം ആണ്. മാറ്റാൻ സാധിക്കില്ല.");
        if(!confirm(`തീർച്ചയാണോ? '${fromTerm}' -ലെ എല്ലാ മാർക്കുകളും പൂർണ്ണമായും '${toTerm}' ലേക്ക് മാറ്റുകയാണോ?`)) return;
        
        const btn = document.getElementById("processTransferBtn");
        btn.textContent = "Moving..."; btn.disabled = true;
        
        try {
            const snap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass), where("term", "==", fromTerm)));
            if(snap.empty) {
                alert(`'${fromTerm}' ൽ മാറ്റാൻ മാർക്കുകൾ ഒന്നും കണ്ടെത്തിയില്ല.`);
                btn.textContent = "Move Marks"; btn.disabled = false; return;
            }
            
            const batchPromises = [];
            snap.docs.forEach(mDoc => {
                const data = mDoc.data();
                const newDocId = `${data.studentId}_${toTerm.replace(/\s+/g, '')}`;
                data.term = toTerm; 
                batchPromises.push(setDoc(doc(db, "marks", newDocId), data)); // പുതിയതിൽ സേവ് ചെയ്യുന്നു
                batchPromises.push(deleteDoc(doc(db, "marks", mDoc.id))); // പഴയതിൽ നിന്ന് ഡിലീറ്റ് ചെയ്യുന്നു
            });
            
            await Promise.all(batchPromises);
            
            localStorage.removeItem(`cache_marks_${assignedClass}_${fromTerm.replace(/\s+/g, '')}`);
            localStorage.removeItem(`cache_marks_${assignedClass}_${toTerm.replace(/\s+/g, '')}`);
            isSmartCacheValid = false;
            await triggerCacheUpdate();
            await syncResultCache(fromTerm);
            await syncResultCache(toTerm);
            
            alert(`വിജയകരം! ${snap.size} കുട്ടികളുടെ മാർക്കുകൾ '${fromTerm}' ൽ നിന്നും '${toTerm}' ലേക്ക് മാറ്റി.`);
            
            // UI അപ്ഡേറ്റ്
            if(document.getElementById("examTerm")) document.getElementById("examTerm").value = toTerm;
            if(document.getElementById("viewResultTerm")) document.getElementById("viewResultTerm").value = toTerm;
            
            // ഫയർബേസിലും ആക്ടീവ് ടേം അപ്ഡേറ്റ് ചെയ്യുന്നു
            await setDoc(doc(db, "class_meta", `${madrasaUid}_${assignedClass}`), { currentExamTerm: toTerm }, { merge: true });
            
            loadResults();
        } catch(e) { console.error(e); alert("Error moving marks."); }
        
        btn.textContent = "Move Marks"; btn.disabled = false;
    });
}


async function verifySmartCache() {
    if(!madrasaUid || !assignedClass) return false;
    try {
        const metaDoc = await getDoc(doc(db, "class_meta", `${madrasaUid}_${assignedClass}`));
        const serverTime = metaDoc.exists() ? metaDoc.data().lastUpdate : 0;
        const localTime = localStorage.getItem(`smart_time_${assignedClass}`);

        if (serverTime > 0 && String(serverTime) === String(localTime)) {
            isSmartCacheValid = true;
        } else {
            isSmartCacheValid = false;
            safeSetCache(`smart_time_${assignedClass}`, serverTime);
        }
    } catch(e) { isSmartCacheValid = false; }
    return isSmartCacheValid;
}

async function triggerCacheUpdate() {
    try {
        const now = Date.now();
        await setDoc(doc(db, "class_meta", `${madrasaUid}_${assignedClass}`), { lastUpdate: now }, { merge: true });
        safeSetCache(`smart_time_${assignedClass}`, now);
        isSmartCacheValid = true; 
    } catch (e) {}
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        teacherUid = user.uid;
        editModalInstance = new bootstrap.Modal(document.getElementById('editStudentModal'));
        await loadTeacherData();
        setupTabs();
        setupTransferMarksUI();
        loadPublishSettings(document.getElementById("publishTerm").value);
    }
});

logoutBtn.addEventListener("click", () => { signOut(auth).then(() => { localStorage.clear(); window.location.href = "index.html"; }); });

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

function formatDate(dateStr) {
    if (!dateStr) return "-";
    if (String(dateStr).includes("-")) {
        const parts = String(dateStr).split("-");
        if (parts[0].length === 4) { return `${parts[2]}-${parts[1]}-${parts[0]}`; }
    }
    return dateStr;
}

async function syncResultCache(term) {
    if (!madrasaUid || !assignedClass || !term) return;
    const docId = `${madrasaUid}_${assignedClass}_${term.replace(/\s+/g, '')}`;
    try {
        const publishSnap = await getDoc(doc(db, "publish_settings", docId));
        let isPublished = false; let publishDateTime = "";
        if (publishSnap.exists()) {
            isPublished = publishSnap.data().isPublished || false;
            publishDateTime = publishSnap.data().publishDateTime || "";
        }

        const cacheKey = `cache_marks_${assignedClass}_${term.replace(/\s+/g, '')}`;
        let snapData = [];
        if (isSmartCacheValid && localStorage.getItem(cacheKey)) {
            snapData = JSON.parse(localStorage.getItem(cacheKey));
        } else {
            const marksSnap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass), where("term", "==", term)));
            marksSnap.forEach(doc => snapData.push({ id: doc.id, ...doc.data() }));
            safeSetCache(cacheKey, JSON.stringify(snapData));
        }

        let marksMap = {}; snapData.forEach(data => { marksMap[data.studentId] = data; });
        let allStudents = Object.values(studentsMap);
        allStudents.sort((a, b) => {
            if (a.gender !== b.gender) return a.gender === 'Male' ? -1 : 1;
            return String(a.admissionNo).localeCompare(String(b.admissionNo), undefined, {numeric: true});
        });
        
        let classResults = []; let boyRoll = 1, girlRoll = 1;
        allStudents.forEach(st => {
            let mData = marksMap[st.id]; let gen = st.gender || "Male";
            let roll = gen === "Male" ? boyRoll++ : girlRoll++;
            if (mData) {
                classResults.push({
                    rollNo: roll, studentId: st.id, studentName: st.name, admissionNo: st.admissionNo,
                    gender: gen, className: assignedClass, marks: mData.marks, attendance: mData.attendance,
                    totalMarks: mData.totalMarks, maxMarkTotal: mData.maxMarkTotal, percentage: mData.percentage,
                    grade: mData.grade, status: mData.status, rank: mData.rank || "", subjectConfig: mData.subjectConfig
                });
            }
        });
        
        await setDoc(doc(db, "result_cache", docId), {
            madrasaUid, className: assignedClass, term, isPublished, publishDateTime,
            lastUpdated: new Date().toISOString(), resultsData: JSON.stringify(classResults)
        });
    } catch (e) { console.error("Auto-Cache Sync Error:", e); }
}

async function loadTeacherData() {
    try {
        let tData;
        const cachedTeacher = localStorage.getItem(`cache_user_${teacherUid}`);
        if (cachedTeacher) { 
            try { tData = JSON.parse(cachedTeacher); } catch(e) { localStorage.removeItem(`cache_user_${teacherUid}`); return loadTeacherData(); }
        } else {
            const teacherDoc = await getDoc(doc(db, "users", teacherUid));
            if (teacherDoc.exists()) {
                tData = teacherDoc.data();
                safeSetCache(`cache_user_${teacherUid}`, JSON.stringify(tData));
            } else return;
        }
            
        assignedClass = localStorage.getItem('teacherCurrentClass') || (Array.isArray(tData.assignedClass) ? tData.assignedClass[0] : String(tData.assignedClass));
        madrasaUid = tData.madrasaUid;
        teacherNameGlobal = tData.name;
            
        await verifySmartCache(); 

        if (isSmartCacheValid && localStorage.getItem(`cache_admin_${madrasaUid}`)) {
            try {
                const adminData = JSON.parse(localStorage.getItem(`cache_admin_${madrasaUid}`));
                madrasaNameGlobal = adminData.madrasaNameGlobal; customMadrasaId = adminData.customMadrasaId;
            } catch(e) { localStorage.removeItem(`cache_admin_${madrasaUid}`); }
        } else {
            const adminDoc = await getDoc(doc(db, "users", madrasaUid));
            if (adminDoc.exists()) {
                madrasaNameGlobal = adminDoc.data().madrasaName || "MADRASA";
                customMadrasaId = adminDoc.data().madrasaId || madrasaUid;
                safeSetCache(`cache_admin_${madrasaUid}`, JSON.stringify({ madrasaNameGlobal, customMadrasaId }));
            }
        }
        displayMadrasaName.textContent = madrasaNameGlobal;
        displayClassName.textContent = assignedClass;

        if (isSmartCacheValid && localStorage.getItem(`cache_subs_${assignedClass}`)) {
            try {
                const subData = JSON.parse(localStorage.getItem(`cache_subs_${assignedClass}`));
                classSubjects = subData.subjects; classMuallimName = subData.muallimName;
            } catch(e) { localStorage.removeItem(`cache_subs_${assignedClass}`); }
        } else {
            let rawSubjects = [];
            const subDoc = await getDoc(doc(db, "class_subjects", `${madrasaUid}_${assignedClass}`));
            if(subDoc.exists()) {
                rawSubjects = subDoc.data().subjects || [];
                classMuallimName = subDoc.data().muallimName || ""; 
            } else { rawSubjects = tData.subjects || []; }

            classSubjects = rawSubjects.map(sub => {
                if(typeof sub === 'string') return { name: sub, maxMark: 100, passMark: 35 }; 
                return sub;
            });
            safeSetCache(`cache_subs_${assignedClass}`, JSON.stringify({ subjects: classSubjects, muallimName: classMuallimName }));
        }

        // 📌 PULLING EXAM TERM DIRECTLY FROM FIREBASE (NOT LOCAL STORAGE)
        const metaDoc = await getDoc(doc(db, "class_meta", `${madrasaUid}_${assignedClass}`));
        let activeExamTerm = "Monthly Test"; // Default
        if(metaDoc.exists() && metaDoc.data().currentExamTerm) {
            activeExamTerm = metaDoc.data().currentExamTerm;
        }

        // പഴയ ലോക്കൽ സ്റ്റോറേജ് ഡിലീറ്റ് ചെയ്യുന്നു
        localStorage.removeItem('savedExamTerm');
        localStorage.removeItem('savedViewTerm');

        if (document.getElementById("examTerm")) document.getElementById("examTerm").value = activeExamTerm;
        if (document.getElementById("viewResultTerm")) document.getElementById("viewResultTerm").value = activeExamTerm;
            
        const savedPublishTerm = localStorage.getItem('savedPublishTerm');
        if (savedPublishTerm && document.getElementById("publishTerm")) document.getElementById("publishTerm").value = savedPublishTerm;

        renderSubjectsUI();
        await loadStudents();
        loadResults();
        
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

// 📌 SAVING EXAM TERM DIRECTLY TO FIREBASE
if (document.getElementById("examTerm")) {
    document.getElementById("examTerm").addEventListener("change", async (e) => {
        const newTerm = e.target.value;
        try {
            await setDoc(doc(db, "class_meta", `${madrasaUid}_${assignedClass}`), { currentExamTerm: newTerm }, { merge: true });
        } catch(err) { console.error("Could not save term to firebase"); }
        
        document.getElementById("markStudentSelect").value = "";
        document.getElementById("attendanceInput").value = "";
        document.querySelectorAll(".mark-input").forEach(inp => inp.value = "");
        if(document.getElementById("forcePromoteCheck")) document.getElementById("forcePromoteCheck").checked = false;
        document.getElementById("saveMarksBtn").textContent = "Save Marks";
    });
}

if (document.getElementById("viewResultTerm")) {
    document.getElementById("viewResultTerm").addEventListener("change", async (e) => {
        const newTerm = e.target.value;
        try {
            await setDoc(doc(db, "class_meta", `${madrasaUid}_${assignedClass}`), { currentExamTerm: newTerm }, { merge: true });
            if (document.getElementById("examTerm")) document.getElementById("examTerm").value = newTerm;
        } catch(err) {}
        loadResults();
    });
}

if (document.getElementById("publishTerm")) {
    document.getElementById("publishTerm").addEventListener("change", (e) => {
        safeSetCache('savedPublishTerm', e.target.value);
        loadPublishSettings(e.target.value);
    });
}

document.getElementById("addSubjectBtn").addEventListener("click", async () => {
    const newSub = document.getElementById("newSubjectName").value.trim();
    const maxMark = Number(document.getElementById("newSubjectMaxMark").value) || 100;
    const passMark = Number(document.getElementById("newSubjectPassMark").value) || 35;
    
    if(!newSub) return;
    if(classSubjects.some(s => s.name === newSub)) return alert("Subject already exists!");
    
    classSubjects.push({ name: newSub, maxMark, passMark });
    
    try { 
        await setDoc(doc(db, "class_subjects", `${madrasaUid}_${assignedClass}`), { subjects: classSubjects, madrasaUid, className: assignedClass }, { merge: true }); 
        safeSetCache(`cache_subs_${assignedClass}`, JSON.stringify({ subjects: classSubjects, muallimName: classMuallimName }));
        await triggerCacheUpdate();
        
        document.getElementById("newSubjectName").value = ""; 
        document.getElementById("newSubjectMaxMark").value = ""; 
        document.getElementById("newSubjectPassMark").value = ""; 
        renderSubjectsUI(); 
        loadResults(); 
    } catch (e) { alert("Error saving subject."); }
});

window.deleteSubject = async (subName) => {
    if(!confirm(`Are you absolutely sure you want to delete the subject '${subName}'?\n\nWARNING: This will permanently DELETE all marks associated with this subject for ALL students in this class!`)) return;
    
    classSubjects = classSubjects.filter(s => s.name !== subName);
    
    try { 
        await setDoc(doc(db, "class_subjects", `${madrasaUid}_${assignedClass}`), { subjects: classSubjects, madrasaUid, className: assignedClass }, { merge: true });
        
        const marksQuery = query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass));
        const marksSnap = await getDocs(marksQuery);
        
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
                    
                    if (markVal === "A") { isPassed = false; } 
                    else if (markVal !== undefined && markVal !== "" && markVal !== "-") {
                        const num = Number(markVal);
                        newTotalObtained += num;
                        if (num < sub.passMark) isPassed = false;
                    }
                });
                
                const percentage = newTotalMax > 0 ? (newTotalObtained / newTotalMax) * 100 : 0;
                const finalGrade = getGrade(percentage, isPassed);
                
                return updateDoc(doc(db, "marks", markDoc.id), {
                    marks: marksData, subjectConfig: subjectConfig, totalMarks: newTotalObtained,
                    maxMarkTotal: newTotalMax, percentage: percentage, grade: finalGrade, status: isPassed ? "Passed" : "Failed"
                });
            }
        });
        
        await Promise.all(updatePromises);
        
        localStorage.removeItem(`cache_subs_${assignedClass}`);
        localStorage.removeItem(`cache_marks_${assignedClass}_${document.getElementById("viewResultTerm").value.replace(/\s+/g, '')}`);
        isSmartCacheValid = false;
        await triggerCacheUpdate();
        
        renderSubjectsUI(); 
        loadResults(); 
        alert(`Subject '${subName}' and its marks deleted successfully!`);
    } catch (e) { alert("Error deleting subject."); }
};

function renderSubjectsUI() {
    const tagsContainer = document.getElementById("subjectTagsContainer");
    tagsContainer.innerHTML = "";
    classSubjects.forEach(sub => { 
        tagsContainer.innerHTML += `<div class="subject-tag">${sub.name} <span style="color:#0ea5e9; font-size:11px;">(${sub.passMark}/${sub.maxMark})</span> <button class="delete-sub-btn" onclick="deleteSubject('${sub.name}')">X</button></div>`; 
    });
    
    const inputsContainer = document.getElementById("dynamicSubjectInputs");
    inputsContainer.innerHTML = classSubjects.length === 0 ? "<p style='color:#64748b;'>No subjects added.</p>" : "";
    
    classSubjects.forEach(sub => { 
        inputsContainer.innerHTML += `<div class="form-group"><label>${sub.name} (Max: ${sub.maxMark}, Pass: ${sub.passMark})</label><input type="text" class="form-control mark-input" data-subject="${sub.name}" placeholder="Mark or 'A'"></div>`; 
    });

    if(classSubjects.length > 0) {
        inputsContainer.innerHTML += `
        <div class="form-group mt-3" style="background: #e0f2fe; padding: 12px; border-radius: 6px; border: 1px solid #bae6fd;">
            <label style="display: flex; align-items: center; gap: 8px; margin: 0; color: #0369a1; font-weight: bold; cursor: pointer; font-size: 14px;">
                <input type="checkbox" id="forcePromoteCheck" style="width: 18px; height: 18px; cursor: pointer;">
                Force Promote Student (Without entering marks)
            </label>
        </div>
        `;
    }
}

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
    
    const exists = Object.values(studentsMap).some(s => String(s.admissionNo) === String(admissionNo));
    if (exists) return alert(`മുന്നറിയിപ്പ്: '${admissionNo}' എന്ന അഡ്മിഷൻ നമ്പർ നിലവിൽ മറ്റൊരു കുട്ടിക്ക് നൽകിയിട്ടുണ്ട്! ദയവായി അഡ്മിഷൻ നമ്പർ മാറ്റുക.`);
    
    document.getElementById("addStudentBtn").textContent = "Saving...";
    try {
        const newStudentData = { name, admissionNo, gender, dob, fatherName, place, contactNo, whatsappNo, className: assignedClass, madrasaUid };
        const newDocRef = await addDoc(collection(db, "students"), newStudentData);
        
        let students = JSON.parse(localStorage.getItem(`cache_students_${assignedClass}`) || "[]");
        students.push({ id: newDocRef.id, ...newStudentData });
        safeSetCache(`cache_students_${assignedClass}`, JSON.stringify(students));
        
        await triggerCacheUpdate();
        
        ['studentName', 'admissionNo', 'dob', 'fatherName', 'place', 'contactNo', 'whatsappNo'].forEach(id => document.getElementById(id).value = "");
        await loadStudents();
    } catch (e) {}
    document.getElementById("addStudentBtn").textContent = "Save Student Data";
});

async function loadStudents() {
    if (!assignedClass || !madrasaUid) return;
    const tbody = document.getElementById("studentsTableBody");
    const upgradeBody = document.getElementById("upgradeTableBody");
    const pdfListBody = document.getElementById("pdfStudentListBody");
    const markSelect = document.getElementById("markStudentSelect");
    
    const cacheKey = `cache_students_${assignedClass}`;
    let students = [];
    
    if (isSmartCacheValid && localStorage.getItem(cacheKey)) { 
        try { students = JSON.parse(localStorage.getItem(cacheKey)); } catch(e) { localStorage.removeItem(cacheKey); }
    } 
    
    if (students.length === 0) {
        const snap = await getDocs(query(collection(db, "students"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass)));
        snap.forEach(doc => students.push({ id: doc.id, ...doc.data() }));
        safeSetCache(cacheKey, JSON.stringify(students));
    }

    studentsMap = {};
    students.sort((a, b) => {
        if (a.gender !== b.gender) return a.gender === 'Male' ? -1 : 1;
        return String(a.admissionNo).localeCompare(String(b.admissionNo), undefined, {numeric: true});
    });
    
    tbody.innerHTML = students.length === 0 ? '<tr><td colspan="9" style="text-align: center; padding: 20px;">No students added yet.</td></tr>' : "";
    upgradeBody.innerHTML = students.length === 0 ? '<tr><td colspan="4" style="text-align: center;">No students</td></tr>' : "";
    pdfListBody.innerHTML = "";
    markSelect.innerHTML = '<option value="">-- Select Student --</option>';
    
    document.getElementById("pdfMadrasaName4").textContent = madrasaNameGlobal;
    document.getElementById("pdfClassTitle4").textContent = `CLASS: ${assignedClass.toUpperCase()} - STUDENTS LIST`;

    let boyRoll = 1, girlRoll = 1;
    let deskLabelsHTML = ""; let currentChunk = ""; let labelCount = 0;

    students.forEach(st => {
        studentsMap[st.id] = st;
        const displayDob = formatDate(st.dob);
        
        tbody.innerHTML += `<tr>
            <td>${st.admissionNo}</td><td>${st.name}</td><td>${st.gender}</td><td>${st.fatherName || "-"}</td>
            <td>${displayDob}</td><td>${st.contactNo || "-"}</td><td>${st.whatsappNo || "-"}</td><td>${st.place || "-"}</td>
            <td><button class="btn-custom btn-warning-custom btn-small btn-auto" onclick="openEditModal('${st.id}')">Edit</button> <button class="btn-custom btn-danger-custom btn-small btn-auto" onclick="deleteStudent('${st.id}')">Del</button></td></tr>`;
            
        upgradeBody.innerHTML += `<tr><td><input type="checkbox" class="upgrade-checkbox" value="${st.id}"></td><td>${st.admissionNo}</td><td>${st.name}</td><td>${st.gender}</td></tr>`;

        pdfListBody.innerHTML += `<tr>
            <td>${st.admissionNo}</td><td style="text-align:left;">${st.name}</td><td>${st.gender}</td><td>${st.fatherName || "-"}</td>
            <td>${displayDob}</td><td>${st.contactNo || "-"}</td><td>${st.whatsappNo || "-"}</td><td>${st.place || "-"}</td></tr>`;

        markSelect.innerHTML += `<option value="${st.id}" data-name="${st.name}" data-adm="${st.admissionNo}">${st.admissionNo} - ${st.name}</option>`;

        const roll = st.gender === "Male" ? boyRoll++ : girlRoll++;
        const color = st.gender === "Female" ? "#d32f2f" : "#000000"; 
        
        currentChunk += `
            <div class="desk-label-box" style="border-color: ${color}; color: ${color}; width: 31%; min-height: 165px; border: 2px solid; padding: 20px; box-sizing: border-box; border-radius: 8px; background: white; margin-bottom: 15px;">
                <p style="margin: 10px 0; font-size: 16px; font-weight: bold;">Roll No: ${roll}</p>
                <p style="margin: 10px 0; font-size: 16px; font-weight: bold;">Name: ${st.name.toUpperCase()}</p>
                <p style="margin: 10px 0; font-size: 16px; font-weight: bold;">Class: ${assignedClass.toUpperCase()}</p>
            </div>
        `;
        labelCount++;

        if (labelCount % 15 === 0) {
            deskLabelsHTML += `<div class="pdf-page-chunk" style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: flex-start; padding: 20px; background: white; width: 800px; margin: 0 auto; box-sizing: border-box;">${currentChunk}</div>`;
            currentChunk = "";
        }
    });
    
    if (currentChunk !== "") {
        deskLabelsHTML += `<div class="pdf-page-chunk" style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: flex-start; padding: 20px; background: white; width: 800px; margin: 0 auto; box-sizing: border-box;">${currentChunk}</div>`;
    }
    
    const deskLabelsGridElement = document.getElementById("deskLabelsGrid");
    if(deskLabelsGridElement) deskLabelsGridElement.innerHTML = deskLabelsHTML;
}

window.openEditModal = (studentId) => {
    const st = studentsMap[studentId];
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
    
    const exists = Object.values(studentsMap).some(s => String(s.admissionNo) === String(admissionNo) && s.id !== id);
    if(exists) return alert(`മുന്നറിയിപ്പ്: '${admissionNo}' എന്ന അഡ്മിഷൻ നമ്പർ നിലവിൽ മറ്റൊരു കുട്ടിക്ക് നൽകിയിട്ടുണ്ട്! ദയവായി അഡ്മിഷൻ നമ്പർ മാറ്റുക.`);
    
    document.getElementById("saveEditStudentBtn").textContent = "Saving...";
    try {
        const updatedData = {
            name, admissionNo, gender: document.getElementById("editGender").value,
            dob: document.getElementById("editDob").value, fatherName: document.getElementById("editFatherName").value.trim(),
            place: document.getElementById("editPlace").value.trim(), contactNo: document.getElementById("editContactNo").value.trim(),
            whatsappNo: document.getElementById("editWhatsappNo").value.trim()
        };
        await updateDoc(doc(db, "students", id), updatedData);
        
        let students = JSON.parse(localStorage.getItem(`cache_students_${assignedClass}`) || "[]");
        const index = students.findIndex(s => s.id === id);
        if(index !== -1) students[index] = { ...students[index], ...updatedData };
        safeSetCache(`cache_students_${assignedClass}`, JSON.stringify(students));
        
        await triggerCacheUpdate();
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
        
        let students = JSON.parse(localStorage.getItem(`cache_students_${assignedClass}`) || "[]");
        students = students.filter(s => s.id !== studentId);
        safeSetCache(`cache_students_${assignedClass}`, JSON.stringify(students));
        
        localStorage.removeItem(`cache_marks_${assignedClass}_${document.getElementById("viewResultTerm").value.replace(/\s+/g, '')}`);
        isSmartCacheValid = false;
        await triggerCacheUpdate();
        
        await loadStudents();
        loadResults();
    } catch (e) {}
};

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
        
        localStorage.removeItem(`cache_students_${assignedClass}`); 
        localStorage.removeItem(`cache_students_${targetClass}`);
        isSmartCacheValid = false;
        await triggerCacheUpdate();
        
        alert(`Upgraded ${checkboxes.length} students.`);
        document.getElementById("selectAllUpgrade").checked = false;
        await loadStudents();
    } catch(e) {}
    document.getElementById("processUpgradeBtn").textContent = "Upgrade Selected Students";
});

document.getElementById("markStudentSelect").addEventListener("change", async (e) => {
    const studentId = e.target.value; const term = document.getElementById("examTerm").value;
    if (!studentId || !term) return;
    const markDoc = await getDoc(doc(db, "marks", `${studentId}_${term.replace(/\s+/g, '')}`));
    
    const forcePromoteCheck = document.getElementById("forcePromoteCheck");

    if (markDoc.exists()) {
        const data = markDoc.data();
        const attVal = data.attendance || "";
        document.getElementById("attendanceInput").value = attVal === "-" ? "" : attVal;
        
        document.querySelectorAll(".mark-input").forEach(inp => {
            const subName = inp.getAttribute("data-subject");
            const mVal = data.marks && data.marks[subName] !== undefined ? data.marks[subName] : "";
            inp.value = mVal === "-" ? "" : mVal;
        });
        if(forcePromoteCheck) forcePromoteCheck.checked = (data.status === "Promoted");
        document.getElementById("saveMarksBtn").textContent = "Update Marks";
    } else {
        document.getElementById("attendanceInput").value = "";
        document.querySelectorAll(".mark-input").forEach(inp => inp.value = "");
        if(forcePromoteCheck) forcePromoteCheck.checked = false;
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
    
    const forcePromoteCheck = document.getElementById("forcePromoteCheck");
    const isForcePromoted = forcePromoteCheck && forcePromoteCheck.checked;
    
    classSubjects.forEach(sub => {
        totalMaxPossible += sub.maxMark;
        const inp = document.querySelector(`.mark-input[data-subject="${sub.name}"]`);
        const val = inp.value.trim().toUpperCase();
        
        if (val === "") { marksData[sub.name] = ""; }
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
    
    if (!valid && !isForcePromoted) return alert("Please check marks inputs. Ensure they don't exceed Max Mark for each subject.");
    
    const percentage = totalMaxPossible > 0 ? (totalObtained / totalMaxPossible) * 100 : 0;
    let finalGrade = getGrade(percentage, isPassed);
    let finalStatus = isPassed ? "Passed" : "Failed";

    if (isForcePromoted) {
        finalStatus = "Promoted";
        finalGrade = "D+";
    }
    
    document.getElementById("saveMarksBtn").textContent = "Saving...";
    try {
        const docId = `${studentId}_${term.replace(/\s+/g, '')}`;
        const finalData = {
            studentId, studentName, madrasaUid, className: assignedClass, term,
            marks: marksData, attendance: document.getElementById("attendanceInput").value, 
            totalMarks: totalObtained, maxMarkTotal: totalMaxPossible,
            subjectConfig: classSubjects, percentage, grade: finalGrade, status: finalStatus
        };
        
        await setDoc(doc(db, "marks", docId), finalData);
        
        let snapData = JSON.parse(localStorage.getItem(`cache_marks_${assignedClass}_${term.replace(/\s+/g, '')}`) || "[]");
        const index = snapData.findIndex(m => m.id === docId);
        if (index !== -1) snapData[index] = { id: docId, ...finalData };
        else snapData.push({ id: docId, ...finalData });
        safeSetCache(`cache_marks_${assignedClass}_${term.replace(/\s+/g, '')}`, JSON.stringify(snapData));
        
        await triggerCacheUpdate();
        await syncResultCache(term);
        
        alert("Marks saved successfully!"); 
        select.value = ""; document.querySelectorAll(".mark-input").forEach(i => i.value="");
        if(forcePromoteCheck) forcePromoteCheck.checked = false;
        loadResults();
    } catch (e) {}
    document.getElementById("saveMarksBtn").textContent = "Save Marks";
});

document.getElementById("uploadStudentExcelBtn").addEventListener("click", () => {
    const file = document.getElementById("studentExcel").files[0];
    if (!file) return alert("Select an Excel file.");
    
    document.getElementById("uploadStudentExcelBtn").textContent = "Uploading...";
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            let count = 0; let skippedCount = 0;
            
            for (const row of json) {
                const nameKey = Object.keys(row).find(k => k.toLowerCase() === 'name');
                const admKey = Object.keys(row).find(k => k.toLowerCase() === 'admissionno');
                const genderKey = Object.keys(row).find(k => k.toLowerCase() === 'gender');
                
                if (!nameKey || !admKey) continue;
                
                const newAdmNo = String(row[admKey]).trim();
                const exists = Object.values(studentsMap).some(s => String(s.admissionNo) === newAdmNo);
                if (exists) { skippedCount++; continue; }
                
                const dobKey = Object.keys(row).find(k => k.toLowerCase() === 'dob');
                const fatherKey = Object.keys(row).find(k => k.toLowerCase() === 'fathername');
                const placeKey = Object.keys(row).find(k => k.toLowerCase() === 'place');
                const contactKey = Object.keys(row).find(k => k.toLowerCase() === 'contactno');
                const whatsappKey = Object.keys(row).find(k => k.toLowerCase() === 'whatsappno');

                await addDoc(collection(db, "students"), {
                    name: String(row[nameKey]).trim(), admissionNo: newAdmNo, gender: genderKey ? String(row[genderKey]).trim() : "Male",
                    dob: dobKey ? String(row[dobKey]).trim() : "", fatherName: fatherKey ? String(row[fatherKey]).trim() : "",
                    place: placeKey ? String(row[placeKey]).trim() : "", contactNo: contactKey ? String(row[contactKey]).trim() : "",
                    whatsappNo: whatsappKey ? String(row[whatsappKey]).trim() : "", className: assignedClass, madrasaUid
                });
                count++;
            }
            
            localStorage.removeItem(`cache_students_${assignedClass}`);
            isSmartCacheValid = false;
            await triggerCacheUpdate();
            
            let alertMsg = `Uploaded ${count} students successfully.`;
            if (skippedCount > 0) alertMsg += `\n\n(Skipped ${skippedCount} students because their Admission Number already exists in this class).`;
            alert(alertMsg);
            
            document.getElementById("studentExcel").value = "";
            await loadStudents();
        } catch (err) { alert("Error parsing excel."); }
        document.getElementById("uploadStudentExcelBtn").textContent = "Upload Excel Data";
    };
    reader.readAsArrayBuffer(file);
});

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
                
                const excelAdm = String(row[admKey]).trim();
                const student = Object.values(studentsMap).find(s => String(s.admissionNo) === excelAdm);
                if (!student) continue;
                
                let marksData = {}, totalObtained = 0, isPassed = true, isValid = true;
                
                for (const sub of classSubjects) {
                    const subKey = Object.keys(row).find(k => k.toLowerCase() === sub.name.toLowerCase());
                    let val = subKey ? String(row[subKey]).trim().toUpperCase() : "";
                    
                    if (val === "A") { marksData[sub.name] = "A"; isPassed = false; } 
                    else if (val === "" || val === "-") { marksData[sub.name] = ""; } 
                    else {
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
                let finalAtt = attKey ? String(row[attKey]).trim() : "";
                if(finalAtt === "-") finalAtt = "";

                await setDoc(doc(db, "marks", docId), {
                    studentId: student.id, studentName: student.name, madrasaUid, className: assignedClass, term,
                    marks: marksData, attendance: finalAtt, totalMarks: totalObtained, maxMarkTotal: totalMaxPossible,
                    subjectConfig: classSubjects, percentage, grade: finalGrade, status: isPassed ? "Passed" : "Failed"
                });
                count++;
            }
            
            localStorage.removeItem(`cache_marks_${assignedClass}_${term.replace(/\s+/g, '')}`);
            isSmartCacheValid = false;
            await triggerCacheUpdate();
            
            await syncResultCache(term);
            
            alert(`Uploaded ${count} student marks and synced cache.`);
            document.getElementById("marksExcel").value = "";
            loadResults();
        } catch (err) { alert("Error parsing excel."); }
        document.getElementById("uploadMarksExcelBtn").textContent = "Upload Marks";
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById("deleteAllMarksTermBtn").addEventListener("click", async () => {
    const term = document.getElementById("viewResultTerm").value;
    if(!confirm(`Are you absolutely sure you want to DELETE ALL marks for ${term} in Class ${assignedClass}?`)) return;
    
    document.getElementById("deleteAllMarksTermBtn").textContent = "Deleting...";
    try {
        const snap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass), where("term", "==", term)));
        const deletePromises = snap.docs.map(mDoc => deleteDoc(doc(db, "marks", mDoc.id)));
        await Promise.all(deletePromises);
        
        localStorage.removeItem(`cache_marks_${assignedClass}_${term.replace(/\s+/g, '')}`);
        isSmartCacheValid = false;
        await triggerCacheUpdate();
        
        await syncResultCache(term);
        
        alert(`All marks for ${term} deleted successfully.`);
        loadResults();
    } catch (e) { alert("Error deleting marks."); }
    document.getElementById("deleteAllMarksTermBtn").textContent = "Delete ALL Marks for this Term";
});

async function loadResults() {
    const term = document.getElementById("viewResultTerm").value;
    if (!assignedClass || !madrasaUid) return;
    
    let ths = `<tr><th>Roll No</th><th>Ad.No</th><th>Name</th><th>Att.</th>`;
    let pdfThs1 = `<tr><th class="vertical-header"><span>ROLL NO</span></th><th class="vertical-header"><span>AD.NO</span></th><th class="name-col" style="vertical-align:middle;">NAME OF STUDENTS</th><th class="vertical-header"><span>HAJAR</span></th>`;
    let pdfThs2 = `<tr><th class="vertical-header"><span>ROLL NO</span></th><th class="vertical-header"><span>AD.NO</span></th><th class="name-col" style="vertical-align:middle;">NAME OF STUDENTS</th><th class="vertical-header"><span>HAJAR</span></th>`;
    
    classSubjects.forEach(sub => {
        ths += `<th>${sub.name}</th>`;
        pdfThs1 += `<th class="vertical-header"><span>${sub.name.toUpperCase()}</span></th>`;
        pdfThs2 += `<th class="vertical-header"><span>${sub.name.toUpperCase()}</span></th>`;
    });
    
    ths += `<th>Total</th><th>Rank</th><th>Grade</th><th>Status</th><th>Action</th></tr>`;
    pdfThs1 += `<th class="vertical-header"><span>TOTAL</span></th><th class="vertical-header"><span>RANK</span></th><th class="vertical-header"><span>REMARKS</span></th></tr>`;
    pdfThs2 += `<th class="vertical-header"><span>TOTAL</span></th><th class="vertical-header"><span>RANK</span></th><th class="vertical-header"><span>REMARKS</span></th></tr>`;
    
    document.getElementById("screenResultHead").innerHTML = ths;
    document.getElementById("pdfThead1").innerHTML = pdfThs1;
    document.getElementById("pdfThead2").innerHTML = pdfThs2;
    
    const titleText = `EXAMINATION RESULT. CLASS: ${assignedClass.toUpperCase()} - ${term.toUpperCase()}`;
    ['pdfMadrasaName1', 'pdfMadrasaName2'].forEach(id => document.getElementById(id).textContent = madrasaNameGlobal);
    document.getElementById("pdfExamTitle1").textContent = titleText;
    document.getElementById("pdfExamTitle2").textContent = titleText;
    document.getElementById("pdfTeacherName1").textContent = classMuallimName ? classMuallimName.toUpperCase() : teacherNameGlobal;
    
    const cacheKey = `cache_marks_${assignedClass}_${term.replace(/\s+/g, '')}`;
    let snapData = [];
    
    if (isSmartCacheValid && localStorage.getItem(cacheKey)) {
        try { snapData = JSON.parse(localStorage.getItem(cacheKey)); } catch(e) { localStorage.removeItem(cacheKey); }
    } 
    
    if (snapData.length === 0) {
        const snap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass), where("term", "==", term)));
        snap.forEach(doc => snapData.push({ id: doc.id, ...doc.data() }));
        safeSetCache(cacheKey, JSON.stringify(snapData));
    }
    
    let marksMap = {};
    snapData.forEach(data => { marksMap[data.studentId] = data; });

    let results = [];
    
    Object.values(studentsMap).forEach(st => {
        if (marksMap[st.id]) { results.push(marksMap[st.id]); } 
        else {
            results.push({
                isPlaceholder: true, studentId: st.id, studentName: st.name, marks: {},
                attendance: "", totalMarks: "", percentage: 0, grade: "", status: ""
            });
        }
    });

    if (results.length === 0) {
        document.getElementById("screenResultBody").innerHTML = `<tr><td colspan="100%" style="text-align:center; padding:20px;">No students added in this class yet.</td></tr>`;
        ['pdfTbody1', 'pdfTbody2'].forEach(id => document.getElementById(id).innerHTML = "");
        return;
    }
    
    results.sort((a, b) => Number(b.totalMarks || 0) - Number(a.totalMarks || 0));
    let rank = 1; let hasMarks = false;

    results.forEach(r => {
        if (!r.isPlaceholder && r.totalMarks !== undefined && r.totalMarks !== "") { hasMarks = true; }
        if (r.isPlaceholder || r.status === "Failed" || r.totalMarks === "") { r.rank = ""; } 
        else { r.rank = rank++; }
    });
    
    results.sort((a, b) => {
        const stA = studentsMap[a.studentId];
        const stB = studentsMap[b.studentId];
        const gA = stA ? stA.gender : "Male";
        const gB = stB ? stB.gender : "Male";
        if (gA !== gB) return gA === "Male" ? -1 : 1;
        const adA = stA ? String(stA.admissionNo) : "";
        const adB = stB ? String(stB.admissionNo) : "";
        return adA.localeCompare(adB, undefined, {numeric: true});
    });
    
    let sBody = "", pBody1 = "", pBody2 = "";
    let bTot = 0, gTot = 0, bPass = 0, gPass = 0;
    let boyRoll = 1, girlRoll = 1;
    
    results.forEach(res => {
        const st = studentsMap[res.studentId];
        const adNo = st ? st.admissionNo : "-";
        const gen = st ? st.gender : "Male";
        
        if (gen === "Male") { bTot++; if (res.status !== "Failed" && !res.isPlaceholder) bPass++; }
        else { gTot++; if (res.status !== "Failed" && !res.isPlaceholder) gPass++; }
        
        const roll = gen === "Male" ? boyRoll++ : girlRoll++;
        const color = gen === "Female" ? "#d32f2f" : "#000000"; 
        
        let marksHTMLScreen = "", marksHTMLPdf1 = "", marksHTMLPdf2 = "";
        
        classSubjects.forEach(sub => {
            const rawMark = res.marks && res.marks[sub.name] !== undefined ? res.marks[sub.name] : "";
            const mark = (rawMark === "-" || rawMark === undefined || rawMark === null) ? "" : rawMark;
            const passLimit = sub.passMark || 35;
            const isFailMark = mark === "A" || (mark !== "" && Number(mark) < passLimit);
            const mColor = isFailMark ? "#d32f2f" : "#000000";
            
            marksHTMLScreen += `<td style="color: ${mColor};">${mark}</td>`;
            marksHTMLPdf1 += `<td style="color: ${mColor};">${mark}</td>`;
            marksHTMLPdf2 += `<td style="color: ${mColor};">${mark}</td>`;
        });
        
        let displayGrade = res.grade || "";
        if (!res.isPlaceholder && (!displayGrade || displayGrade.includes("Failed") || displayGrade.toLowerCase() === "passed")) {
            if (res.totalMarks !== "") displayGrade = getGrade(res.percentage, res.status !== "Failed");
        }
        if (res.status === "Promoted") displayGrade = "D+"; 

        let statusText = ""; let statusColor = "#000000"; let pdfPassText = "";

        if (!res.isPlaceholder && res.status) {
            statusText = res.status === "Failed" ? "FAILED" : (res.status === "Promoted" ? "PROMOTED" : "PASSED");
            statusColor = res.status === "Failed" ? "#d32f2f" : (res.status === "Promoted" ? "#16a34a" : "#000000"); 
            pdfPassText = statusText === "FAILED" ? "F" : (statusText === "PROMOTED" ? "PR" : "P");
        }

        const actionBtn = res.isPlaceholder ? "" : `<button class="btn-custom btn-danger-custom btn-small" onclick="deleteMark('${res.id}', '${term}')">Del</button>`;
        const attendanceDisp = (res.attendance && res.attendance !== "-") ? res.attendance : "";

        sBody += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${adNo}</td><td style="color:${color};">${res.studentName}</td>
            <td>${attendanceDisp}</td>${marksHTMLScreen}<td>${res.totalMarks || ""}</td><td>${res.rank || ""}</td><td style="font-weight:bold;">${displayGrade}</td>
            <td style="color:${statusColor}; font-weight:bold;">${statusText}</td><td>${actionBtn}</td></tr>`;
            
        pBody1 += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${adNo}</td><td class="name-col" style="color:${color};">${res.studentName.toUpperCase()}</td>
            <td>${attendanceDisp}</td>${marksHTMLPdf1}<td>${res.totalMarks || ""}</td><td>${res.rank || ""}</td>
            <td style="color:${statusColor}; font-weight:bold;">${pdfPassText}</td></tr>`;
            
        pBody2 += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${adNo}</td><td class="name-col" style="text-align:left; color:${color};">${res.studentName.toUpperCase()}</td>
            <td>${attendanceDisp}</td>${marksHTMLPdf2}<td>${res.totalMarks || ""}</td><td>${res.rank || ""}</td>
            <td style="color:${statusColor}; font-weight:bold;">${pdfPassText}</td></tr>`;
    });
    
    document.getElementById("screenResultBody").innerHTML = sBody;
    document.getElementById("pdfTbody1").innerHTML = pBody1;
    document.getElementById("pdfTbody2").innerHTML = pBody2;
    
    if (hasMarks) {
        document.getElementById("pdfTot1").innerHTML = `<td style="color: black;">${bTot}</td><td style="color: #d32f2f;">${gTot}</td><td style="color: black;">${bTot + gTot}</td>`;
        document.getElementById("pdfPass1").innerHTML = `<td style="color: black;">${bPass}</td><td style="color: #d32f2f;">${gPass}</td><td style="color: black;">${bPass + gPass}</td>`;
        document.getElementById("pdfPerc1").innerHTML = `<td style="color: black;">${bTot > 0 ? Math.round((bPass/bTot)*100) : 0}%</td><td style="color: #d32f2f;">${gTot > 0 ? Math.round((gPass/gTot)*100) : 0}%</td><td style="color: black;">${(bTot+gTot) > 0 ? Math.round(((bPass+gPass)/(bTot+gTot))*100) : 0}%</td>`;
    } else {
        document.getElementById("pdfTot1").innerHTML = `<td style="color: black;">${bTot}</td><td style="color: #d32f2f;">${gTot}</td><td style="color: black;">${bTot + gTot}</td>`;
        document.getElementById("pdfPass1").innerHTML = `<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>`;
        document.getElementById("pdfPerc1").innerHTML = `<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>`;
    }
}

window.deleteMark = async (docId, term) => {
    if(!confirm("Delete this result?")) return;
    await deleteDoc(doc(db, "marks", docId));
    
    let snapData = JSON.parse(localStorage.getItem(`cache_marks_${assignedClass}_${term.replace(/\s+/g, '')}`) || "[]");
    snapData = snapData.filter(m => m.id !== docId);
    safeSetCache(`cache_marks_${assignedClass}_${term.replace(/\s+/g, '')}`, JSON.stringify(snapData));
    
    await triggerCacheUpdate();
    await syncResultCache(term);
    loadResults();
};

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
            
            if(data.isPublished) {
                if(data.publishDateTime && new Date(data.publishDateTime) > new Date()) {
                    const dt = new Date(data.publishDateTime);
                    statusText.innerHTML = `<span style="color:#f59e0b;">⏳ Status: Scheduled to Publish on ${dt.getDate()}-${dt.getMonth()+1}-${dt.getFullYear()} at ${dt.toLocaleTimeString()}</span>`;
                } else { statusText.innerHTML = `<span style="color:#27ae60;">✅ Status: Published (Visible to Students)</span>`; }
            } else { statusText.innerHTML = `<span style="color:#ef4444;">🔒 Status: Locked (Hidden from Students)</span>`; }
        } else {
            document.getElementById("publishStatus").value = "hidden";
            document.getElementById("publishDateTime").value = "";
            statusText.innerHTML = `<span style="color:#ef4444;">🔒 Status: Locked (Default)</span>`;
        }
    } catch(e) { console.error("Error loading publish settings", e); }
}

document.getElementById("savePublishSettingsBtn").addEventListener("click", async () => {
    const term = document.getElementById("publishTerm").value;
    const isPublished = document.getElementById("publishStatus").value === "published";
    const publishDateTime = document.getElementById("publishDateTime").value;
    const docId = `${madrasaUid}_${assignedClass}_${term.replace(/\s+/g, '')}`;
    const btn = document.getElementById("savePublishSettingsBtn");
    
    btn.textContent = "Saving & Syncing Cache...";
    btn.disabled = true;
    
    try {
        await setDoc(doc(db, "publish_settings", docId), { madrasaUid, className: assignedClass, term, isPublished, publishDateTime });
        await triggerCacheUpdate();
        await syncResultCache(term);
        
        alert(`Settings & Cache for ${term} synced successfully!`);
        loadPublishSettings(term);
    } catch(e) { alert("Error saving settings & cache."); }
    
    btn.textContent = "Save & Sync Cache";
    btn.disabled = false;
});

async function generatePDF(areaId, fileName, orientation = 'p') {
    const area = document.getElementById(areaId);
    const wrapper = area.parentElement;
    
    const origPos = wrapper.style.position;
    const origZ = wrapper.style.zIndex;
    const origOpacity = wrapper.style.opacity;
    
    wrapper.style.position = "absolute"; 
    wrapper.style.zIndex = "-1";
    wrapper.style.opacity = "1";
    window.scrollTo(0, 0);

    const canvasOptions = { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollY: 0, scrollX: 0 };

    if (areaId === 'pdfDeskLabelsArea') {
        const pages = area.querySelectorAll('.pdf-page-chunk');
        if (pages.length > 0) {
            const pdf = new jspdf.jsPDF(orientation, 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            for (let i = 0; i < pages.length; i++) {
                if (i > 0) pdf.addPage();
                const canvas = await html2canvas(pages[i], canvasOptions);
                const imgData = canvas.toDataURL("image/png");
                
                let imgWidth = pdfWidth - 10;
                let imgHeight = (canvas.height * imgWidth) / canvas.width;
                
                if (imgHeight > (pdfHeight - 10)) {
                    let ratio = (pdfHeight - 10) / imgHeight;
                    imgHeight = imgHeight * ratio;
                    imgWidth = imgWidth * ratio;
                }
                
                const xPos = (pdfWidth - imgWidth) / 2;
                pdf.addImage(imgData, 'PNG', xPos, 5, imgWidth, imgHeight); 
            }
            pdf.save(fileName);
            wrapper.style.position = origPos;
            wrapper.style.zIndex = origZ;
            wrapper.style.opacity = origOpacity;
            return;
        }
    }

    html2canvas(area, canvasOptions).then(canvas => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jspdf.jsPDF(orientation, 'mm', 'a4');
        
        let pdfWidth = pdf.internal.pageSize.getWidth();
        let pdfHeight = pdf.internal.pageSize.getHeight();
        
        let imgWidth = pdfWidth - 10;
        let imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (imgHeight > (pdfHeight - 10)) {
            let ratio = (pdfHeight - 10) / imgHeight;
            imgHeight = imgHeight * ratio;
            imgWidth = imgWidth * ratio;
        }
        
        const xPos = (pdfWidth - imgWidth) / 2;
        pdf.addImage(imgData, 'PNG', xPos, 5, imgWidth, imgHeight);
        
        pdf.save(fileName);
        wrapper.style.position = origPos;
        wrapper.style.zIndex = origZ;
        wrapper.style.opacity = origOpacity;
    });
}

document.getElementById("downloadStudentListBtn").addEventListener("click", () => {
    generatePDF("pdfStudentListArea", `Class_${assignedClass}_Students_List.pdf`, 'p');
});

document.getElementById("downloadDetailedPdfBtn").addEventListener("click", async () => {
    let currentName = classMuallimName || teacherNameGlobal;
    let ustadName = prompt("ഈ ക്ലാസ്സിലെ മാർക്ക് ലിസ്റ്റിൽ താഴെ കാണിക്കേണ്ട ഉസ്താദിന്റെ പേര് നൽകുക:", currentName);
    
    if (ustadName !== null) {
        let finalName = ustadName.trim() === "" ? teacherNameGlobal : ustadName.trim().toUpperCase();
        
        document.getElementById("pdfTeacherName1").textContent = finalName;
        classMuallimName = finalName;
        
        try {
            await setDoc(doc(db, "class_subjects", `${madrasaUid}_${assignedClass}`), { muallimName: finalName }, { merge: true });
            safeSetCache(`cache_subs_${assignedClass}`, JSON.stringify({ subjects: classSubjects, muallimName: classMuallimName }));
            await triggerCacheUpdate();
        } catch(e) {}
        
        const term = document.getElementById("viewResultTerm").value.replace(/\s+/g, '_');
        generatePDF("pdfExportArea", `Class_${assignedClass}_${term}_Marklist.pdf`, 'p');
    }
});

document.getElementById("downloadNoticeBoardPdfBtn").addEventListener("click", () => {
    const term = document.getElementById("viewResultTerm").value.replace(/\s+/g, '_');
    generatePDF("pdfNoticeBoardArea", `Class_${assignedClass}_${term}_NoticeBoard.pdf`, 'p'); 
});

document.getElementById("downloadDeskLabelsBtn").addEventListener("click", () => {
    const term = document.getElementById("viewResultTerm").value.replace(/\s+/g, '_');
    generatePDF("pdfDeskLabelsArea", `Class_${assignedClass}_${term}_DeskLabels.pdf`, 'p');
});

document.getElementById("copyResultLinkBtn").addEventListener("click", () => {
    const resultUrl = `${window.location.origin}/result.html?mid=${customMadrasaId || madrasaUid}`;
    navigator.clipboard.writeText(resultUrl).then(() => {
        alert("Result Link Copied Successfully!\n\nYou can now paste and share this link in WhatsApp.\n\nLink: " + resultUrl);
    }).catch(err => { alert("Error copying link."); });
});
