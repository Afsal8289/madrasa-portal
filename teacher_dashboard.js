import { db } from './firebase_core.js';
import { utils, network } from './utils.js';
import { checkAuth, logoutUser } from './auth.js';
import { generatePDF } from './pdf.js';
import { StudentService } from './students.js';
import { MarkService } from './marks.js';
import { doc, getDoc, collection, getDocs, query, where, setDoc, updateDoc, onSnapshot, writeBatch, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let state = {
    teacherUid: "", assignedClass: "", madrasaUid: "", madrasaNameGlobal: "MADRASA", teacherNameGlobal: "TEACHER",
    customMadrasaId: "", classSubjects: [], studentsMap: {}, classMuallimName: "", isSmartCacheValid: false, isEditModeActive: false,
    termTotalAttendance: {} // 🛠️ പുതിയ കൂട്ടിച്ചേർക്കൽ
};

let editModalInstance = null; let unsubscribeMeta = null;

const DOM = { madrasaName: document.getElementById("displayMadrasaName"), className: document.getElementById("displayClassName"), logoutBtn: document.getElementById("logoutBtn") };
DOM.logoutBtn.addEventListener("click", logoutUser);

function calculateRanks(resultsArray) {
    let sorted = [...resultsArray].sort((a, b) => Number(b.totalMarks || 0) - Number(a.totalMarks || 0));
    let currentRank = 1, previousMark = null;
    sorted.forEach(r => {
        if (r.isPlaceholder || r.status === "Failed" || !r.totalMarks) { r.rank = ""; r.calculatedRank = ""; } 
        else {
            if (previousMark !== null && Number(r.totalMarks) !== Number(previousMark)) { currentRank++; }
            r.rank = currentRank; r.calculatedRank = currentRank; previousMark = r.totalMarks;
        }
    });
    return sorted;
}

function setupRealtimeSync() {
    if (!state.madrasaUid || !state.assignedClass) return;
    if (unsubscribeMeta) unsubscribeMeta(); 
    const metaRef = doc(db, "class_meta", `${state.madrasaUid}_${state.assignedClass}`);
    unsubscribeMeta = onSnapshot(metaRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const serverTime = data.lastUpdate || 0; const localTime = utils.safeGetCache(`smart_time_${state.assignedClass}`);
            if (data.termTotalAttendance) state.termTotalAttendance = data.termTotalAttendance; // 🛠️ Update attendance from server
            
            if (serverTime > 0 && String(serverTime) !== String(localTime)) {
                utils.safeSetCache(`smart_time_${state.assignedClass}`, serverTime); state.isSmartCacheValid = true;
                loadStudents(true); loadResults(true);
            }
        }
    });
}

async function verifySmartCache() {
    if(!state.madrasaUid || !state.assignedClass) return false;
    try {
        const metaDoc = await network.withRetry(() => getDoc(doc(db, "class_meta", `${state.madrasaUid}_${state.assignedClass}`)));
        if (metaDoc.exists()) {
            const data = metaDoc.data();
            if (data.termTotalAttendance) state.termTotalAttendance = data.termTotalAttendance; // 🛠️ Load total attendance
            const serverTime = data.lastUpdate || 0; const localTime = utils.safeGetCache(`smart_time_${state.assignedClass}`);
            state.isSmartCacheValid = (serverTime > 0 && String(serverTime) === String(localTime));
            if (!state.isSmartCacheValid) utils.safeSetCache(`smart_time_${state.assignedClass}`, serverTime);
        } else { state.isSmartCacheValid = false; }
    } catch(e) { state.isSmartCacheValid = false; }
    return state.isSmartCacheValid;
}

async function triggerCacheUpdate() {
    try {
        const now = Date.now();
        await network.withRetry(() => setDoc(doc(db, "class_meta", `${state.madrasaUid}_${state.assignedClass}`), { lastUpdate: now }, { merge: true }));
        utils.safeSetCache(`smart_time_${state.assignedClass}`, now); state.isSmartCacheValid = true; 
    } catch (e) { console.warn("Cache trigger failed."); }
}

async function loadTeacherData() {
    try {
        let tData = utils.safeGetCache(`cache_user_${state.teacherUid}`);
        if (!tData) { const docSnap = await network.withRetry(() => getDoc(doc(db, "users", state.teacherUid))); if (!docSnap.exists()) return; tData = docSnap.data(); utils.safeSetCache(`cache_user_${state.teacherUid}`, tData); }
        state.assignedClass = localStorage.getItem('teacherCurrentClass') || (Array.isArray(tData.assignedClass) ? tData.assignedClass[0] : String(tData.assignedClass));
        state.madrasaUid = tData.madrasaUid; state.teacherNameGlobal = tData.name;
        await verifySmartCache(); 
        let adminData = utils.safeGetCache(`cache_admin_${state.madrasaUid}`);
        if (!state.isSmartCacheValid || !adminData) {
            const adminDoc = await network.withRetry(() => getDoc(doc(db, "users", state.madrasaUid)));
            if (adminDoc.exists()) { adminData = { madrasaNameGlobal: adminDoc.data().madrasaName || "MADRASA", customMadrasaId: adminDoc.data().madrasaId || state.madrasaUid }; utils.safeSetCache(`cache_admin_${state.madrasaUid}`, adminData); }
        }
        state.madrasaNameGlobal = adminData.madrasaNameGlobal; state.customMadrasaId = adminData.customMadrasaId;
        DOM.madrasaName.textContent = state.madrasaNameGlobal; DOM.className.textContent = state.assignedClass;

        let subData = utils.safeGetCache(`cache_subs_${state.assignedClass}`);
        if (!state.isSmartCacheValid || !subData) {
            const subDoc = await network.withRetry(() => getDoc(doc(db, "class_subjects", `${state.madrasaUid}_${state.assignedClass}`)));
            const rawSubjects = subDoc.exists() ? (subDoc.data().subjects || []) : (tData.subjects || []);
            state.classMuallimName = subDoc.exists() ? (subDoc.data().muallimName || "") : "";
            state.classSubjects = rawSubjects.map(sub => typeof sub === 'string' ? { name: sub, maxMark: 100, passMark: 35 } : sub);
            utils.safeSetCache(`cache_subs_${state.assignedClass}`, { subjects: state.classSubjects, muallimName: state.classMuallimName });
        } else { state.classSubjects = subData.subjects; state.classMuallimName = subData.muallimName; }

        const metaDoc = await network.withRetry(() => getDoc(doc(db, "class_meta", `${state.madrasaUid}_${state.assignedClass}`)));
        const activeExamTerm = metaDoc.exists() && metaDoc.data().currentExamTerm ? metaDoc.data().currentExamTerm : "Monthly Test";
        
        if (document.getElementById("examTerm")) document.getElementById("examTerm").value = activeExamTerm;
        if (document.getElementById("viewResultTerm")) document.getElementById("viewResultTerm").value = activeExamTerm;
        
        // 🛠️ Update Total Attendance input based on current term
        const totalAttInput = document.getElementById("classTotalAttendance");
        if (totalAttInput) totalAttInput.value = state.termTotalAttendance[activeExamTerm] || "";
            
        renderSubjectsUI(); await loadStudents(); loadResults(); setupRealtimeSync();
    } catch (e) { utils.showError("Initialization failed.", e); }
}

async function loadStudents(isSilent = false) {
    if (!state.assignedClass || !state.madrasaUid) return;
    try {
        let students = await StudentService.loadStudentsData(state.madrasaUid, state.assignedClass, state.isSmartCacheValid);
        students.sort((a, b) => {
            const gA = (a.gender || "Male").toLowerCase(); const gB = (b.gender || "Male").toLowerCase();
            if (gA === 'male' && gB !== 'male') return -1; if (gA !== 'male' && gB === 'male') return 1;
            return String(a.admissionNo || "").localeCompare(String(b.admissionNo || ""), undefined, {numeric: true});
        });

        state.studentsMap = {}; const tbody = document.getElementById("studentsTableBody"); const markSelect = document.getElementById("markStudentSelect"); const pdfListBody = document.getElementById("pdfStudentListBody");
        if(pdfListBody) pdfListBody.innerHTML = ""; if(tbody) tbody.innerHTML = students.length === 0 ? '<tr><td colspan="9" style="text-align: center;">No students added.</td></tr>' : "";
        if(markSelect) markSelect.innerHTML = '<option value="">-- Select Student --</option>';
        
        let boyRoll = 1, girlRoll = 1, deskLabelsHTML = "", currentChunk = "", labelCount = 0;
        if(document.getElementById("pdfMadrasaName4")) document.getElementById("pdfMadrasaName4").textContent = state.madrasaNameGlobal;
        if(document.getElementById("pdfClassTitle4")) document.getElementById("pdfClassTitle4").textContent = `CLASS: ${state.assignedClass.toUpperCase()} - STUDENTS LIST`;

        students.forEach(st => {
            state.studentsMap[st.id] = st;
            const roll = (st.gender === "Male") ? boyRoll++ : girlRoll++; const color = (st.gender === "Female") ? "#d32f2f" : "#000000";

            if(tbody) {
                const actionButtons = `<div style="display: flex; gap: 6px; justify-content: center; align-items: center;"><button class="btn-custom btn-warning-custom btn-small" style="padding: 4px 10px; font-size: 12px; min-width: 50px;" onclick="window.openEditModal('${st.id}')">Edit</button> <button class="btn-custom btn-danger-custom btn-small" style="padding: 4px 10px; font-size: 12px; min-width: 50px;" onclick="window.deleteStudent('${st.id}')">Del</button></div>`;
                tbody.innerHTML += `<tr><td style="color:${color};">${st.admissionNo}</td><td style="color:${color};">${st.name}</td><td style="color:${color};">${st.gender}</td><td>${st.fatherName || "-"}</td><td>${utils.formatDate(st.dob)}</td><td>${st.contactNo || "-"}</td><td>${st.whatsappNo || "-"}</td><td>${st.place || "-"}</td><td>${actionButtons}</td></tr>`;
            }
            if(markSelect) markSelect.innerHTML += `<option value="${st.id}" data-name="${st.name}">${st.admissionNo} - ${st.name}</option>`;
            if(pdfListBody) { pdfListBody.innerHTML += `<tr><td style="color:${color};">${st.admissionNo}</td><td style="text-align:left; color:${color};">${st.name}</td><td style="color:${color};">${st.gender}</td><td>${st.fatherName || "-"}</td><td>${utils.formatDate(st.dob)}</td><td>${st.contactNo || "-"}</td><td>${st.whatsappNo || "-"}</td><td>${st.place || "-"}</td></tr>`; }
            currentChunk += `<div class="desk-label-box" style="border-color: ${color}; color: ${color};"><p style="font-size: 16px; font-weight: bold;">Roll No: ${roll}</p><p style="font-size: 16px; font-weight: bold;">Name: ${st.name.toUpperCase()}</p><p style="font-size: 16px; font-weight: bold;">Class: ${state.assignedClass.toUpperCase()}</p></div>`; labelCount++;
            if (labelCount % 15 === 0) { deskLabelsHTML += `<div class="pdf-page-chunk" style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: flex-start; padding: 20px; background: white; width: 800px; margin: 0 auto; box-sizing: border-box;">${currentChunk}</div>`; currentChunk = ""; }
        });

        if (currentChunk !== "") deskLabelsHTML += `<div class="pdf-page-chunk" style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: flex-start; padding: 20px; background: white; width: 800px; margin: 0 auto; box-sizing: border-box;">${currentChunk}</div>`;
        if(document.getElementById("deskLabelsGrid")) document.getElementById("deskLabelsGrid").innerHTML = deskLabelsHTML;
    } catch (e) { if(!isSilent) utils.showError("Student load failed.", e); }
}

async function loadUpgradeStudents() {
    const upgradeBody = document.getElementById("upgradeTableBody");
    if (!upgradeBody) return;
    try {
        let students = await StudentService.loadStudentsData(state.madrasaUid, state.assignedClass, state.isSmartCacheValid);
        students.sort((a, b) => {
            const gA = (a.gender || "Male").toLowerCase(); const gB = (b.gender || "Male").toLowerCase();
            if (gA === 'male' && gB !== 'male') return -1; if (gA !== 'male' && gB === 'male') return 1;
            return String(a.admissionNo || "").localeCompare(String(b.admissionNo || ""), undefined, {numeric: true});
        });
        upgradeBody.innerHTML = students.length === 0 ? '<tr><td colspan="4" style="text-align: center;">No students found</td></tr>' : "";
        students.forEach(st => {
            const color = (st.gender === "Female") ? "#d32f2f" : "#000000";
            upgradeBody.innerHTML += `<tr><td><input type="checkbox" class="upgrade-checkbox" value="${st.id}"></td><td style="color:${color};">${st.admissionNo}</td><td style="color:${color};">${st.name}</td><td style="color:${color};">${st.gender}</td></tr>`;
        });
    } catch (e) { console.error(e); }
}

async function loadResults(isSilent = false) {
    const term = document.getElementById("viewResultTerm")?.value;
    if (!term || !state.assignedClass || !state.madrasaUid) return;
    
    let ths = `<tr><th>Roll No</th><th>Ad.No</th><th>Name</th><th>Att.</th>`;
    let pdfThs1 = `<tr><th class="vertical-header"><span>ROLL NO</span></th><th class="vertical-header"><span>AD.NO</span></th><th class="name-col" style="vertical-align:middle;">NAME OF STUDENTS</th><th class="vertical-header"><span>HAJAR</span></th>`;
    let pdfThs2 = pdfThs1;
    
    state.classSubjects.forEach(sub => {
        ths += `<th>${sub.name}</th>`;
        pdfThs1 += `<th class="vertical-header"><span>${sub.name.toUpperCase()}</span></th>`;
        pdfThs2 += `<th class="vertical-header"><span>${sub.name.toUpperCase()}</span></th>`;
    });
    
    ths += `<th>Total</th><th>Rank</th><th>Grade</th><th>Status</th><th>Action</th></tr>`;
    pdfThs1 += `<th class="vertical-header"><span>TOTAL</span></th><th class="vertical-header"><span>RANK</span></th><th class="vertical-header"><span>REMARKS</span></th></tr>`;
    pdfThs2 += `<th class="vertical-header"><span>TOTAL</span></th><th class="vertical-header"><span>RANK</span></th><th class="vertical-header"><span>REMARKS</span></th></tr>`;
    
    if(document.getElementById("screenResultHead")) document.getElementById("screenResultHead").innerHTML = ths;
    if(document.getElementById("pdfThead1")) document.getElementById("pdfThead1").innerHTML = pdfThs1;
    if(document.getElementById("pdfThead2")) document.getElementById("pdfThead2").innerHTML = pdfThs2;

    const titleText = `EXAMINATION RESULT. CLASS: ${state.assignedClass.toUpperCase()} - ${term.toUpperCase()}`;
    ['pdfMadrasaName1', 'pdfMadrasaName2'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = state.madrasaNameGlobal; });
    if(document.getElementById("pdfExamTitle1")) document.getElementById("pdfExamTitle1").textContent = titleText;
    if(document.getElementById("pdfExamTitle2")) document.getElementById("pdfExamTitle2").textContent = titleText;
    if(document.getElementById("pdfTeacherName1")) document.getElementById("pdfTeacherName1").textContent = state.classMuallimName ? state.classMuallimName.toUpperCase() : state.teacherNameGlobal;

    const cacheKey = `cache_marks_${state.assignedClass}_${term.replace(/\s+/g, '')}`;
    let snapData = utils.safeGetCache(cacheKey, []);
    
    if (snapData.length === 0 || !state.isSmartCacheValid) {
        snapData = [];
        try {
            const snap = await network.withRetry(() => getDocs(query(collection(db, "marks"), where("madrasaUid", "==", state.madrasaUid), where("className", "==", state.assignedClass), where("term", "==", term))));
            snap.forEach(doc => snapData.push({ id: doc.id, ...doc.data() }));
            utils.safeSetCache(cacheKey, snapData);
        } catch(e) { if(!isSilent) utils.showError("Results load failed.", e); return; }
    }
    
    let marksMap = {}; snapData.forEach(data => marksMap[data.studentId] = data);
    let rawResults = Object.values(state.studentsMap).map(st => marksMap[st.id] ? marksMap[st.id] : { isPlaceholder: true, studentId: st.id, studentName: st.name, marks: {}, totalMarks: "", status: "" });
    const processedResults = calculateRanks(rawResults);
    
    processedResults.sort((a, b) => {
        const gA = state.studentsMap[a.studentId]?.gender || "Male"; const gB = state.studentsMap[b.studentId]?.gender || "Male";
        if (gA !== gB) return gA === "Male" ? -1 : 1;
        return String(state.studentsMap[a.studentId]?.admissionNo || "").localeCompare(String(state.studentsMap[b.studentId]?.admissionNo || ""), undefined, {numeric: true});
    });

    renderResultsTable(processedResults, term);
}

function renderResultsTable(results, term) {
    const sBody = document.getElementById("screenResultBody"); const pBody1 = document.getElementById("pdfTbody1"); const pBody2 = document.getElementById("pdfTbody2");
    if (results.length === 0) {
        if(sBody) sBody.innerHTML = `<tr><td colspan="100%" style="text-align:center;">No students added.</td></tr>`;
        if(pBody1) pBody1.innerHTML = ""; if(pBody2) pBody2.innerHTML = ""; return;
    }

    let html = "", pdfHtml1 = "", pdfHtml2 = "", boyRoll = 1, girlRoll = 1, bTot = 0, gTot = 0, bPass = 0, gPass = 0, hasMarks = false;
    
    results.forEach(res => {
        if (!res.isPlaceholder && res.totalMarks !== undefined && res.totalMarks !== "") { hasMarks = true; }
        const st = state.studentsMap[res.studentId]; const gen = st?.gender || "Male";
        const roll = gen === "Male" ? boyRoll++ : girlRoll++; const color = gen === "Female" ? "#d32f2f" : "#000000"; 
        if (gen === "Male") { bTot++; if (res.status !== "Failed" && !res.isPlaceholder) bPass++; }
        else { gTot++; if (res.status !== "Failed" && !res.isPlaceholder) gPass++; }

        let marksHTML = "", marksHTMLPdf = "";
        state.classSubjects.forEach(sub => {
            const mark = res.marks?.[sub.name] ?? "";
            const isFail = mark === "A" || (mark !== "" && Number(mark) < (sub.passMark || 35));
            const mColor = isFail ? "#d32f2f" : "#000000";
            marksHTML += `<td style="color: ${mColor};">${mark}</td>`; marksHTMLPdf += `<td style="color: ${mColor};">${mark}</td>`;
        });
        
        let displayGrade = res.grade || "";
        if (!res.isPlaceholder && res.totalMarks && res.status !== "Failed" && res.status !== "Promoted") { displayGrade = utils.getGrade(res.percentage, true); }
        if (res.status === "Promoted") displayGrade = "D+"; 

        let statusText = "", pdfPassText = "", statusColor = "#000000";
        if (!res.isPlaceholder && res.status) {
            statusText = res.status === "Failed" ? "FAILED" : (res.status === "Promoted" ? "PROMOTED" : "PASSED");
            statusColor = res.status === "Failed" ? "#d32f2f" : (res.status === "Promoted" ? "#16a34a" : "#000000"); 
            pdfPassText = res.status === "Failed" ? "F" : (res.status === "Promoted" ? "PR" : "P");
        }

        const actionBtn = res.isPlaceholder ? "" : `<div style="display: flex; gap: 6px; justify-content: center; align-items: center;"><button class="btn-custom btn-warning-custom btn-small" style="padding: 4px 10px; font-size: 12px; min-width: 50px;" onclick="window.editMark('${res.studentId}', '${term}')">Edit</button> <button class="btn-custom btn-danger-custom btn-small" style="padding: 4px 10px; font-size: 12px; min-width: 50px;" onclick="window.deleteMark('${res.id}', '${term}')">Del</button></div>`;
        
        // 🛠️ മാർക്ക് ലിസ്റ്റിൽ പഴയതുപോലെ പ്രസന്റ് ആയ ദിവസങ്ങൾ മാത്രം കാണിക്കുന്നു
        const attendanceDisp = (res.attendance && res.attendance !== "-") ? res.attendance : "";

        html += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${st?.admissionNo || "-"}</td><td style="color:${color};">${res.studentName}</td><td>${attendanceDisp}</td>${marksHTML}<td>${res.totalMarks || ""}</td><td>${res.rank || ""}</td><td style="font-weight:bold;">${displayGrade}</td><td style="color:${statusColor}; font-weight:bold;">${statusText}</td><td>${actionBtn}</td></tr>`;
        pdfHtml1 += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${st?.admissionNo || "-"}</td><td class="name-col" style="color:${color};">${res.studentName.toUpperCase()}</td><td>${attendanceDisp}</td>${marksHTMLPdf}<td>${res.totalMarks || ""}</td><td>${res.rank || ""}</td><td style="color:${statusColor}; font-weight:bold;">${pdfPassText}</td></tr>`;
        pdfHtml2 += `<tr><td style="color:${color};">${roll}</td><td style="color:${color};">${st?.admissionNo || "-"}</td><td class="name-col" style="text-align:left; color:${color};">${res.studentName.toUpperCase()}</td><td>${attendanceDisp}</td>${marksHTMLPdf}<td>${res.totalMarks || ""}</td><td>${res.rank || ""}</td><td style="color:${statusColor}; font-weight:bold;">${pdfPassText}</td></tr>`;
    });
    
    if(sBody) sBody.innerHTML = html; if(pBody1) pBody1.innerHTML = pdfHtml1; if(pBody2) pBody2.innerHTML = pdfHtml2;

    if (hasMarks) {
        if(document.getElementById("pdfTot1")) document.getElementById("pdfTot1").innerHTML = `<td style="color: black;">${bTot}</td><td style="color: #d32f2f;">${gTot}</td><td style="color: black;">${bTot + gTot}</td>`;
        if(document.getElementById("pdfPass1")) document.getElementById("pdfPass1").innerHTML = `<td style="color: black;">${bPass}</td><td style="color: #d32f2f;">${gPass}</td><td style="color: black;">${bPass + gPass}</td>`;
        if(document.getElementById("pdfPerc1")) document.getElementById("pdfPerc1").innerHTML = `<td style="color: black;">${bTot > 0 ? Math.round((bPass/bTot)*100) : 0}%</td><td style="color: #d32f2f;">${gTot > 0 ? Math.round((gPass/gTot)*100) : 0}%</td><td style="color: black;">${(bTot+gTot) > 0 ? Math.round(((bPass+gPass)/(bTot+gTot))*100) : 0}%</td>`;
    } else {
        if(document.getElementById("pdfTot1")) document.getElementById("pdfTot1").innerHTML = `<td style="color: black;">${bTot}</td><td style="color: #d32f2f;">${gTot}</td><td style="color: black;">${bTot + gTot}</td>`;
        if(document.getElementById("pdfPass1")) document.getElementById("pdfPass1").innerHTML = `<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>`;
        if(document.getElementById("pdfPerc1")) document.getElementById("pdfPerc1").innerHTML = `<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>`;
    }
}

async function syncResultCache(term) {
    if (!state.madrasaUid || !state.assignedClass || !term) return;
    const docId = `${state.madrasaUid}_${state.assignedClass}_${term.replace(/\s+/g, '')}`;
    try {
        const publishSnap = await getDoc(doc(db, "publish_settings", docId));
        let isPublished = false; let publishDateTime = "";
        if (publishSnap.exists()) { isPublished = publishSnap.data().isPublished || false; publishDateTime = publishSnap.data().publishDateTime || ""; }

        const cacheKey = `cache_marks_${state.assignedClass}_${term.replace(/\s+/g, '')}`;
        let snapData = utils.safeGetCache(cacheKey, []);
        if (snapData.length === 0 || !state.isSmartCacheValid) {
            snapData = [];
            const marksSnap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", state.madrasaUid), where("className", "==", state.assignedClass), where("term", "==", term)));
            marksSnap.forEach(doc => snapData.push({ id: doc.id, ...doc.data() }));
            utils.safeSetCache(cacheKey, snapData);
        }

        let marksMap = {}; snapData.forEach(data => { marksMap[data.studentId] = data; });
        let allStudents = Object.values(state.studentsMap);
        let tempValidMarks = []; allStudents.forEach(st => { if (marksMap[st.id]) tempValidMarks.push(marksMap[st.id]); });
        
        const processedMarks = calculateRanks(tempValidMarks);
        let classResults = []; let boyRoll = 1, girlRoll = 1;
        
        allStudents.sort((a, b) => {
            if (a.gender !== b.gender) return a.gender === 'Male' ? -1 : 1;
            return String(a.admissionNo).localeCompare(String(b.admissionNo), undefined, {numeric: true});
        }).forEach(st => {
            let mData = processedMarks.find(m => m.studentId === st.id); 
            let gen = st.gender || "Male"; let roll = gen === "Male" ? boyRoll++ : girlRoll++;
            if (mData) {
                classResults.push({
                    rollNo: roll, studentId: st.id, studentName: st.name, admissionNo: st.admissionNo, gender: gen, className: state.assignedClass, marks: mData.marks, 
                    attendance: mData.attendance, 
                    totalMarks: mData.totalMarks, maxMarkTotal: mData.maxMarkTotal, percentage: mData.percentage, grade: mData.grade, status: mData.status, rank: mData.calculatedRank || "", subjectConfig: mData.subjectConfig
                });
            }
        });
        
        let batches = []; let currentBatch = writeBatch(db); let operationCount = 0;
        currentBatch.set(doc(db, "result_meta", docId), { madrasaUid: state.madrasaUid, className: state.assignedClass, term, isPublished, publishDateTime, lastUpdated: new Date().toISOString(), totalStudents: classResults.length });
        operationCount++;

        classResults.forEach(res => {
            if (operationCount >= 490) { batches.push(currentBatch.commit()); currentBatch = writeBatch(db); operationCount = 0; }
            const studentDocId = `${state.madrasaUid}_${term.replace(/\s+/g, '')}_${res.admissionNo}`;
            currentBatch.set(doc(db, "public_results", studentDocId), { ...res, madrasaUid: state.madrasaUid, term, isPublished, publishDateTime, className: state.assignedClass });
            operationCount++;
        });
        if (operationCount > 0) batches.push(currentBatch.commit()); await Promise.all(batches);
    } catch (e) { console.error("Auto-Cache Sync Error:", e); }
}

function setupTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active")); document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            const target = e.target.getAttribute("data-tab"); e.target.classList.add("active"); document.getElementById(target).classList.add("active");
            if(target === "tab-results") loadResults(); if(target === "tab-upgrade") loadUpgradeStudents(); if(target === "tab-marks") state.isEditModeActive = false; 
        });
    });
}

function renderSubjectsUI() {
    const tagsContainer = document.getElementById("subjectTagsContainer");
    if(tagsContainer) {
        tagsContainer.innerHTML = "";
        state.classSubjects.forEach(sub => { 
            tagsContainer.innerHTML += `<div class="subject-tag">${sub.name} <span style="color:#0ea5e9; font-size:11px;">(${sub.passMark}/${sub.maxMark})</span><button style="background:none; border:none; color:#f59e0b; cursor:pointer; font-weight:bold; font-size:14px; margin-left:4px; padding:0;" onclick="window.editSubject('${sub.name}', ${sub.maxMark}, ${sub.passMark})" title="Edit Subject">✎</button><button class="delete-sub-btn" onclick="window.deleteSubject('${sub.name}')" title="Delete Subject">X</button></div>`; 
        });
    }
    const inputsContainer = document.getElementById("dynamicSubjectInputs");
    if(inputsContainer) {
        inputsContainer.innerHTML = state.classSubjects.length === 0 ? "<p>No subjects added.</p>" : "";
        state.classSubjects.forEach(sub => { inputsContainer.innerHTML += `<div class="form-group"><label>${sub.name} (Max: ${sub.maxMark})</label><input type="text" class="form-control mark-input" data-subject="${sub.name}" placeholder="Mark"></div>`; });
        if(state.classSubjects.length > 0) { inputsContainer.innerHTML += `<div class="form-group mt-3" style="background: #e0f2fe; padding: 12px; border-radius: 6px; border: 1px solid #bae6fd;"><label style="display: flex; align-items: center; gap: 8px; margin: 0; color: #0369a1; font-weight: bold; cursor: pointer; font-size: 14px;"><input type="checkbox" id="forcePromoteCheck" style="width: 18px; height: 18px; cursor: pointer;"> Force Promote Student (Without entering marks)</label></div>`; }
    }
}

// 🛠️ Save Total Attendance Event Listener
document.getElementById("saveTotalAttBtn")?.addEventListener("click", async () => {
    const term = document.getElementById("examTerm").value;
    const val = document.getElementById("classTotalAttendance").value;
    if(!term) return;
    
    const btn = document.getElementById("saveTotalAttBtn");
    const originalText = btn.textContent;
    btn.textContent = "Saving..."; btn.disabled = true;

    try {
        const metaRef = doc(db, "class_meta", `${state.madrasaUid}_${state.assignedClass}`);
        state.termTotalAttendance = state.termTotalAttendance || {};
        state.termTotalAttendance[term] = val;
        await setDoc(metaRef, { termTotalAttendance: state.termTotalAttendance }, { merge: true });
        alert(`Total Working Days (${val}) saved for ${term}!`);
        await triggerCacheUpdate();
    } catch (e) {
        console.error("Error saving total attendance:", e);
        alert("Failed to save total attendance.");
    } finally {
        btn.textContent = originalText; btn.disabled = false;
    }
});


window.editSubject = async (oldName, oldMax, oldPass) => {
    const newName = prompt("Enter New Subject Name:", oldName)?.trim(); if (!newName) return;
    const newMax = parseInt(prompt(`Enter Max Mark for ${newName}:`, oldMax)); const newPass = parseInt(prompt(`Enter Pass Mark for ${newName}:`, oldPass));
    if (isNaN(newMax) || isNaN(newPass)) return alert("Invalid marks entered.");
    try {
        const subIndex = state.classSubjects.findIndex(s => s.name === oldName);
        if(subIndex !== -1) { state.classSubjects[subIndex] = { name: newName, maxMark: newMax, passMark: newPass }; }
        await network.withRetry(() => setDoc(doc(db, "class_subjects", `${state.madrasaUid}_${state.assignedClass}`), { subjects: state.classSubjects, muallimName: state.classMuallimName }, { merge: true }));
        if (newName !== oldName || newMax !== oldMax || newPass !== oldPass) {
            const marksSnap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", state.madrasaUid), where("className", "==", state.assignedClass)));
            let batches = []; let currentBatch = writeBatch(db); let operationCount = 0;
            marksSnap.docs.forEach((markDoc) => {
                const data = markDoc.data(); let marksData = data.marks || {}; let subjectConfig = data.subjectConfig || []; let needsUpdate = false;
                const configIndex = subjectConfig.findIndex(s => s.name === oldName);
                if(configIndex !== -1) { subjectConfig[configIndex] = { name: newName, maxMark: newMax, passMark: newPass }; needsUpdate = true; }
                if (newName !== oldName && marksData[oldName] !== undefined) { marksData[newName] = marksData[oldName]; delete marksData[oldName]; needsUpdate = true; }
                if (needsUpdate) {
                    let newTotalObtained = 0, newTotalMax = 0, isPassed = true;
                    subjectConfig.forEach(sub => {
                        newTotalMax += sub.maxMark; const markVal = marksData[sub.name];
                        if (markVal === "A") { isPassed = false; } else if (markVal !== undefined && markVal !== "" && markVal !== "-") {
                            const num = Number(markVal); newTotalObtained += num; if (num < sub.passMark) isPassed = false;
                        }
                    });
                    const percentage = newTotalMax > 0 ? (newTotalObtained / newTotalMax) * 100 : 0;
                    let finalStatus = data.status === "Promoted" ? "Promoted" : (isPassed ? "Passed" : "Failed");
                    let finalGrade = data.status === "Promoted" ? "D+" : utils.getGrade(percentage, isPassed);
                    if (operationCount >= 490) { batches.push(currentBatch.commit()); currentBatch = writeBatch(db); operationCount = 0; }
                    currentBatch.update(doc(db, "marks", markDoc.id), { marks: marksData, subjectConfig: subjectConfig, totalMarks: newTotalObtained, maxMarkTotal: newTotalMax, percentage: percentage, grade: finalGrade, status: finalStatus });
                    operationCount++;
                }
            });
            if (operationCount > 0) batches.push(currentBatch.commit()); await Promise.all(batches);
            localStorage.removeItem(`cache_subs_${state.assignedClass}`); const term = document.getElementById("viewResultTerm").value.replace(/\s+/g, ''); localStorage.removeItem(`cache_marks_${state.assignedClass}_${term}`);
        }
        await triggerCacheUpdate(); renderSubjectsUI(); loadResults(); alert("Subject updated successfully!");
    } catch (e) { utils.showError("Failed to update subject.", e); }
};

window.deleteSubject = async (subName) => {
    if(!confirm(`Are you sure you want to delete '${subName}'?\nWARNING: This will permanently DELETE all marks associated with this subject for ALL students!`)) return;
    state.classSubjects = state.classSubjects.filter(s => s.name !== subName);
    try { 
        await network.withRetry(() => setDoc(doc(db, "class_subjects", `${state.madrasaUid}_${state.assignedClass}`), { subjects: state.classSubjects, madrasaUid: state.madrasaUid, className: state.assignedClass }, { merge: true }));
        const marksSnap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", state.madrasaUid), where("className", "==", state.assignedClass)));
        let batches = []; let currentBatch = writeBatch(db); let operationCount = 0;
        marksSnap.docs.forEach((markDoc) => {
            const data = markDoc.data(); let marksData = data.marks || {}; let subjectConfig = data.subjectConfig || [];
            if (marksData[subName] !== undefined || subjectConfig.some(s => s.name === subName)) {
                delete marksData[subName]; subjectConfig = subjectConfig.filter(s => s.name !== subName);
                let newTotalObtained = 0, newTotalMax = 0, isPassed = true;
                subjectConfig.forEach(sub => {
                    newTotalMax += sub.maxMark; const markVal = marksData[sub.name];
                    if (markVal === "A") { isPassed = false; } else if (markVal !== undefined && markVal !== "" && markVal !== "-") {
                        const num = Number(markVal); newTotalObtained += num; if (num < sub.passMark) isPassed = false;
                    }
                });
                const percentage = newTotalMax > 0 ? (newTotalObtained / newTotalMax) * 100 : 0;
                let finalStatus = data.status === "Promoted" ? "Promoted" : (isPassed ? "Passed" : "Failed"); let finalGrade = data.status === "Promoted" ? "D+" : utils.getGrade(percentage, isPassed);
                if (operationCount >= 490) { batches.push(currentBatch.commit()); currentBatch = writeBatch(db); operationCount = 0; }
                currentBatch.update(doc(db, "marks", markDoc.id), { marks: marksData, subjectConfig: subjectConfig, totalMarks: newTotalObtained, maxMarkTotal: newTotalMax, percentage: percentage, grade: finalGrade, status: finalStatus });
                operationCount++;
            }
        });
        if (operationCount > 0) batches.push(currentBatch.commit()); await Promise.all(batches);
        localStorage.removeItem(`cache_subs_${state.assignedClass}`); const term = document.getElementById("viewResultTerm").value.replace(/\s+/g, ''); localStorage.removeItem(`cache_marks_${state.assignedClass}_${term}`);
        state.isSmartCacheValid = false; await triggerCacheUpdate(); renderSubjectsUI(); loadResults(); alert(`Subject '${subName}' deleted successfully!`);
    } catch (e) { utils.showError("Error deleting subject.", e); }
};

window.deleteStudent = async (studentId) => {
    if (!confirm("Are you sure you want to delete this student and their marks?")) return;
    try { await StudentService.deleteStudentAndMarks(studentId); localStorage.removeItem(`cache_students_${state.assignedClass}`); state.isSmartCacheValid = false; await triggerCacheUpdate(); await loadStudents(); loadResults(); } catch (e) { utils.showError("Failed to delete student.", e); }
};

document.getElementById("addStudentBtn")?.addEventListener("click", async () => {
    const name = utils.sanitizeInput(document.getElementById("studentName").value); const admissionNo = document.getElementById("admissionNo").value.trim();
    if (!name || !admissionNo) return alert("Name and Admission No are required.");
    const exists = Object.values(state.studentsMap).some(s => String(s.admissionNo) === String(admissionNo));
    if (exists) return alert(`Admission No '${admissionNo}' already exists!`);
    utils.disableBtn("addStudentBtn", "Saving...");
    try {
        const newStudentData = { name, admissionNo, gender: document.getElementById("gender").value, dob: document.getElementById("dob").value, fatherName: utils.sanitizeInput(document.getElementById("fatherName").value), place: document.getElementById("place").value.trim(), contactNo: document.getElementById("contactNo").value.trim(), whatsappNo: document.getElementById("whatsappNo").value.trim(), className: state.assignedClass, madrasaUid: state.madrasaUid };
        await StudentService.addNewStudent(newStudentData); localStorage.removeItem(`cache_students_${state.assignedClass}`); await triggerCacheUpdate();
        ['studentName', 'admissionNo', 'dob', 'fatherName', 'place', 'contactNo', 'whatsappNo'].forEach(id => document.getElementById(id).value = ""); await loadStudents();
    } catch (e) { utils.showError("Failed to add student.", e); } finally { utils.enableBtn("addStudentBtn"); }
});

if (document.getElementById("markStudentSelect")) {
    document.getElementById("markStudentSelect").addEventListener("change", async (e) => {
        const studentId = e.target.value; const term = document.getElementById("examTerm")?.value;
        if (!studentId || !term) return;
        try {
            const markData = await MarkService.getStudentMark(studentId, term);
            const forcePromoteCheck = document.getElementById("forcePromoteCheck");
            
            if (markData) {
                const attVal = markData.attendance || ""; 
                document.getElementById("attendanceInput").value = attVal === "-" ? "" : attVal;
                
                document.querySelectorAll(".mark-input").forEach(inp => { const subName = inp.getAttribute("data-subject"); const mVal = markData.marks && markData.marks[subName] !== undefined ? markData.marks[subName] : ""; inp.value = mVal === "-" ? "" : mVal; });
                if(forcePromoteCheck) forcePromoteCheck.checked = (markData.status === "Promoted");
                document.getElementById("saveMarksBtn").textContent = "Update Marks";
            } else {
                document.getElementById("attendanceInput").value = ""; 
                document.querySelectorAll(".mark-input").forEach(inp => inp.value = "");
                if(forcePromoteCheck) forcePromoteCheck.checked = false; document.getElementById("saveMarksBtn").textContent = "Save Marks";
            }
        } catch (error) { console.error("Error fetching marks:", error); }
    });
}

if (document.getElementById("examTerm")) {
    document.getElementById("examTerm").addEventListener("change", async (e) => {
        const newTerm = e.target.value;
        try { await setDoc(doc(db, "class_meta", `${state.madrasaUid}_${state.assignedClass}`), { currentExamTerm: newTerm }, { merge: true }); } catch(err) {}
        
        document.getElementById("markStudentSelect").value = ""; 
        document.getElementById("attendanceInput").value = ""; 
        
        // 🛠️ Update Total Attendance input based on current term
        const totalAttInput = document.getElementById("classTotalAttendance");
        if (totalAttInput) totalAttInput.value = state.termTotalAttendance[newTerm] || "";

        document.querySelectorAll(".mark-input").forEach(inp => inp.value = "");
        if(document.getElementById("forcePromoteCheck")) document.getElementById("forcePromoteCheck").checked = false;
        document.getElementById("saveMarksBtn").textContent = "Save Marks";
    });
}

document.getElementById("moveMarksBtn")?.addEventListener("click", async () => {
    const fromTerm = document.getElementById("transferFromTerm")?.value; const toTerm = document.getElementById("transferToTerm")?.value;
    if (!fromTerm || !toTerm) return alert("ദയവായി മാറ്റേണ്ട എക്സാമും (From) ശരിയായ എക്സാമും (To) തിരഞ്ഞെടുക്കുക!");
    if (fromTerm === toTerm) return alert("ഒരേ എക്സാമിലേക്ക് തന്നെ മാറ്റാൻ സാധിക്കില്ല!");
    if (!confirm(`'${fromTerm}' ലെ മുഴുവൻ മാർക്കുകളും '${toTerm}' ലേക്ക് മാറ്റാൻ (Move) ഉറപ്പാണോ?\n\n(ശ്രദ്ധിക്കുക: '${toTerm}' ൽ നേരത്തെ നൽകിയ മാർക്കുകൾ ഉണ്ടെങ്കിൽ അത് മാഞ്ഞുപോകും, കൂടാതെ '${fromTerm}' ലെ പഴയ മാർക്കുകൾ പൂർണ്ണമായും ഡിലീറ്റ് ആവുകയും ചെയ്യും)`)) return;
    
    const btn = document.getElementById("moveMarksBtn"); const originalText = btn.textContent; btn.textContent = "Moving Data..."; btn.disabled = true;
    try {
        const snap = await network.withRetry(() => getDocs(query(collection(db, "marks"), where("madrasaUid", "==", state.madrasaUid), where("className", "==", state.assignedClass), where("term", "==", fromTerm))));
        if(snap.empty) { btn.textContent = originalText; btn.disabled = false; return alert(`'${fromTerm}' ലെ പേരിൽ കുട്ടികൾക്ക് മാർക്കുകൾ ഒന്നും നൽകിയതായി കാണുന്നില്ല!`); }
        
        let batches = []; let currentBatch = writeBatch(db); let count = 0;
        snap.docs.forEach(markDoc => {
            const data = markDoc.data(); const studentId = data.studentId; const newDocId = `${studentId}_${toTerm.replace(/\s+/g, '')}`;
            let newData = { ...data, term: toTerm };
            if (count >= 490) { batches.push(currentBatch.commit()); currentBatch = writeBatch(db); count = 0; }
            currentBatch.set(doc(db, "marks", newDocId), newData); currentBatch.delete(doc(db, "marks", markDoc.id)); count += 2;
        });
        if (count > 0) batches.push(currentBatch.commit()); await Promise.all(batches);
        localStorage.removeItem(`cache_marks_${state.assignedClass}_${toTerm.replace(/\s+/g, '')}`); localStorage.removeItem(`cache_marks_${state.assignedClass}_${fromTerm.replace(/\s+/g, '')}`);
        await triggerCacheUpdate(); alert("മാർക്കുകൾ വിജയകരമായി മാറ്റിയിട്ടുണ്ട് (Moved Successfully)!");
        
        document.getElementById("transferFromTerm").value = ""; document.getElementById("transferToTerm").value = "";
        const studentSelect = document.getElementById("markStudentSelect"); if(studentSelect) { studentSelect.value = ""; studentSelect.dispatchEvent(new Event('change')); }
        if(document.getElementById("viewResultTerm")) document.getElementById("viewResultTerm").value = toTerm; if(document.getElementById("examTerm")) document.getElementById("examTerm").value = toTerm;
        loadResults();
    } catch (e) { utils.showError("Error moving marks.", e); } finally { btn.textContent = originalText; btn.disabled = false; }
});

if (document.getElementById("viewResultTerm")) {
    document.getElementById("viewResultTerm").addEventListener("change", async (e) => {
        const newTerm = e.target.value;
        try { await setDoc(doc(db, "class_meta", `${state.madrasaUid}_${state.assignedClass}`), { currentExamTerm: newTerm }, { merge: true });
            if (document.getElementById("examTerm")) document.getElementById("examTerm").value = newTerm;
        } catch(err) {}
        loadResults();
    });
}

document.getElementById("saveMarksBtn")?.addEventListener("click", async () => {
    const select = document.getElementById("markStudentSelect"); const studentId = select.value;
    if (!studentId) return alert("Select a student");
    const term = document.getElementById("examTerm").value;
    let marksData = {}, totalObtained = 0, isPassed = true, valid = true, totalMaxPossible = 0;
    const isForcePromoted = document.getElementById("forcePromoteCheck")?.checked;
    
    state.classSubjects.forEach(sub => {
        totalMaxPossible += sub.maxMark; const val = document.querySelector(`.mark-input[data-subject="${sub.name}"]`).value.trim().toUpperCase();
        if (val === "") { marksData[sub.name] = ""; } else if (val === "A") { marksData[sub.name] = "A"; isPassed = false; } else {
            const num = Number(val); if (isNaN(num) || num > sub.maxMark) valid = false;
            else { marksData[sub.name] = num; totalObtained += num; if (num < sub.passMark) isPassed = false; }
        }
    });
    
    if (!valid && !isForcePromoted) return alert("Validation Failed: Marks exceed maximum allowed limit.");
    utils.disableBtn("saveMarksBtn", "Saving...");
    try {
        const docId = `${studentId}_${term.replace(/\s+/g, '')}`;
        const finalData = {
            studentId, studentName: state.studentsMap[studentId].name, madrasaUid: state.madrasaUid, className: state.assignedClass, term, marks: marksData, 
            attendance: document.getElementById("attendanceInput").value, 
            totalMarks: totalObtained, maxMarkTotal: totalMaxPossible,
            subjectConfig: state.classSubjects, percentage: totalMaxPossible > 0 ? (totalObtained / totalMaxPossible) * 100 : 0, 
            grade: isForcePromoted ? "D+" : utils.getGrade(totalMaxPossible > 0 ? (totalObtained / totalMaxPossible) * 100 : 0, isPassed), 
            status: isForcePromoted ? "Promoted" : (isPassed ? "Passed" : "Failed")
        };
        await MarkService.saveStudentMarks(docId, finalData, term, state.assignedClass);
        await triggerCacheUpdate(); await syncResultCache(term);
        alert("Marks saved securely."); document.querySelectorAll(".mark-input").forEach(i => i.value="");
        
        document.getElementById("attendanceInput").value = ""; 
        
        if(document.getElementById("forcePromoteCheck")) document.getElementById("forcePromoteCheck").checked = false;
        loadResults();

        if (state.isEditModeActive) {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active")); document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            const resultsTabBtn = document.querySelector('[data-tab="tab-results"]'); const resultsTabContent = document.getElementById("tab-results");
            if (resultsTabBtn) resultsTabBtn.classList.add("active"); if (resultsTabContent) resultsTabContent.classList.add("active");
            window.scrollTo({ top: 0, behavior: 'smooth' }); state.isEditModeActive = false; 
        }
    } catch (e) { utils.showError("Save operation failed.", e); } finally { utils.enableBtn("saveMarksBtn"); }
});

window.editMark = (studentId, term) => {
    state.isEditModeActive = true; 
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active")); document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    const marksTabBtn = document.querySelector('[data-tab="tab-marks"]'); const marksTabContent = document.getElementById("tab-marks");
    if (marksTabBtn) marksTabBtn.classList.add("active"); if (marksTabContent) marksTabContent.classList.add("active");
    const examTermSelect = document.getElementById("examTerm"); if (examTermSelect) examTermSelect.value = term;
    
    // update total attendance UI
    const totalAttInput = document.getElementById("classTotalAttendance");
    if (totalAttInput) totalAttInput.value = state.termTotalAttendance[term] || "";
    
    const studentSelect = document.getElementById("markStudentSelect");
    if (studentSelect) { studentSelect.value = studentId; studentSelect.dispatchEvent(new Event('change')); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteMark = async (docId, term) => {
    if(!confirm("Are you sure you want to delete this result?")) return;
    try {
        await network.withRetry(() => deleteDoc(doc(db, "marks", docId)));
        let snapData = utils.safeGetCache(`cache_marks_${state.assignedClass}_${term.replace(/\s+/g, '')}`, []);
        snapData = snapData.filter(m => m.id !== docId); utils.safeSetCache(`cache_marks_${state.assignedClass}_${term.replace(/\s+/g, '')}`, snapData);
        await triggerCacheUpdate(); await syncResultCache(term); loadResults();
    } catch(e) { utils.showError("Error deleting result.", e); }
};

document.getElementById("copyResultLinkBtn")?.addEventListener("click", () => {
    const term = document.getElementById("viewResultTerm").value; const cleanTerm = term.replace(/\s+/g, '');
    const displayId = state.customMadrasaId || state.madrasaUid; 
    const link = `${window.location.origin}/public_result.html?madrasa=${displayId}&term=${cleanTerm}`;
    navigator.clipboard.writeText(link).then(() => { alert("Public Result Link Copied!\n\n" + link); }).catch(err => { prompt("Please copy this link manually:", link); });
});

document.getElementById("downloadStudentListBtn")?.addEventListener("click", () => { generatePDF("pdfStudentListArea", `Class_${state.assignedClass}_Students_List.pdf`, 'p'); });
document.getElementById("downloadNoticeBoardPdfBtn")?.addEventListener("click", () => { const term = document.getElementById("viewResultTerm").value.replace(/\s+/g, '_'); generatePDF("pdfNoticeBoardArea", `Class_${state.assignedClass}_${term}_NoticeBoard.pdf`, 'p'); });
document.getElementById("downloadDeskLabelsBtn")?.addEventListener("click", () => { const term = document.getElementById("viewResultTerm").value.replace(/\s+/g, '_'); generatePDF("pdfDeskLabelsArea", `Class_${state.assignedClass}_${term}_DeskLabels.pdf`, 'p'); });

document.getElementById("downloadDetailedPdfBtn")?.addEventListener("click", async () => {
    let ustadName = prompt("ഈ ക്ലാസ്സിലെ മാർക്ക് ലിസ്റ്റിൽ താഴെ കാണിക്കേണ്ട ഉസ്താദിന്റെ പേര് നൽകുക:", state.classMuallimName || state.teacherNameGlobal);
    if (ustadName !== null) {
        state.classMuallimName = ustadName.trim() === "" ? state.teacherNameGlobal : ustadName.trim().toUpperCase();
        if(document.getElementById("pdfTeacherName1")) document.getElementById("pdfTeacherName1").textContent = state.classMuallimName;
        try { await setDoc(doc(db, "class_subjects", `${state.madrasaUid}_${state.assignedClass}`), { muallimName: state.classMuallimName }, { merge: true }); utils.safeSetCache(`cache_subs_${state.assignedClass}`, { subjects: state.classSubjects, muallimName: state.classMuallimName }); await triggerCacheUpdate(); } catch(e) {}
        const term = document.getElementById("viewResultTerm").value.replace(/\s+/g, '_'); generatePDF("pdfExportArea", `Class_${state.assignedClass}_${term}_Marklist.pdf`, 'p');
    }
});

document.getElementById("downloadProgressReportBtn")?.addEventListener("click", async () => {
    const term = document.getElementById("viewResultTerm").value;
    if (!state.madrasaUid || !state.assignedClass || !term) return alert("Please ensure you are logged in, a class is selected, and an exam term is chosen.");

    const btn = document.getElementById("downloadProgressReportBtn");
    const originalText = btn.textContent; btn.innerHTML = `Generating PDF... Please Wait...`; btn.disabled = true;

    try {
        const qStudents = query(collection(db, "students"), where("madrasaUid", "==", state.madrasaUid), where("className", "==", state.assignedClass));
        const snapStudents = await getDocs(qStudents);
        const qMarks = query(collection(db, "marks"), where("madrasaUid", "==", state.madrasaUid), where("className", "==", state.assignedClass), where("term", "==", term));
        const snapMarks = await getDocs(qMarks);
        const marksData = {}; snapMarks.forEach(doc => { marksData[doc.data().studentId] = doc.data(); });

        let studentsList = [];
        snapStudents.forEach(doc => { const s = doc.data(); s.id = doc.id; s.marksInfo = marksData[s.id] || null; studentsList.push(s); });
        
        studentsList.sort((a, b) => { 
            const gA = (a.gender || "Male").toLowerCase(); 
            const gB = (b.gender || "Male").toLowerCase();
            if (gA === 'male' && gB !== 'male') return -1;
            if (gA !== 'male' && gB === 'male') return 1;
            return String(a.admissionNo || "").localeCompare(String(b.admissionNo || ""), undefined, {numeric: true});
        });

        let rankList = [];
        studentsList.forEach(s => {
            if (s.marksInfo) {
                let total = 0, maxTotal = 0, isFail = false;
                s.marksInfo.subjectConfig.forEach(sub => {
                    maxTotal += sub.maxMark; const m = s.marksInfo.marks[sub.name];
                    if (m === "A") isFail = true; else if (m !== undefined && m !== "") { const mNum = Number(m); total += mNum; if (mNum < sub.passMark) isFail = true; }
                });
                rankList.push({ id: s.id, total, isFail });
            }
        });
        
        rankList.sort((a, b) => b.total - a.total);
        let currentRank = 1;
        rankList.forEach((r, index) => {
            if (r.isFail) r.finalRank = "-"; else {
                if (index > 0 && r.total < rankList[index - 1].total) currentRank = index + 1; r.finalRank = currentRank;
            }
        });
        const getRank = (id) => { const f = rankList.find(x => x.id === id); return f ? f.finalRank : "-"; };

        const madrasaName = state.madrasaNameGlobal || "MADRASA NAME";
        const container = document.getElementById("prPrintContainer");
        const pdf = new jspdf.jsPDF('l', 'mm', 'a4'); 
        
        // 🛠️ Get global total attendance for this term
        let globalTotalAtt = state.termTotalAttendance && state.termTotalAttendance[term] ? state.termTotalAttendance[term] : "-";

        for (let i = 0; i < studentsList.length; i += 2) {
            container.innerHTML = ""; 
            
            for (let j = 0; j < 2; j++) {
                if (i + j >= studentsList.length) break;
                const student = studentsList[i + j]; const marks = student.marksInfo;
                let tableHtml = "", totalObtained = 0, maxTotal = 0, hasFailed = false;

                if (marks && marks.subjectConfig) {
                    marks.subjectConfig.forEach((sub, index) => {
                        let mVal = marks.marks[sub.name] !== undefined ? marks.marks[sub.name] : "";
                        let status = "PASS", color = "#0f5132"; maxTotal += sub.maxMark;
                        if (mVal === "A") { status = "ABSENT"; color = "red"; hasFailed = true; }
                        else if (mVal !== "") {
                            const mNum = Number(mVal); totalObtained += mNum;
                            if (mNum < sub.passMark) { status = "FAIL"; color = "red"; hasFailed = true; }
                        } else { status = "-"; color="black"; }
                        tableHtml += `<tr><td>${String(index + 1).padStart(2, '0')}</td><td>${sub.name}</td><td>${sub.maxMark}</td><td>${mVal}</td><td style="color:${color};">${status}</td></tr>`;
                    });
                } else { tableHtml = `<tr><td colspan="5">No marks entered.</td></tr>`; }

                let percentage = maxTotal > 0 ? ((totalObtained / maxTotal) * 100).toFixed(2) : "0.00";
                let overallStatus = marks ? (hasFailed ? "FAIL" : "PASS") : "-"; let overallGrade = "-";
                
                if (!hasFailed && marks) {
                    if (percentage >= 90) overallGrade = "A+"; else if (percentage >= 80) overallGrade = "A"; else if (percentage >= 70) overallGrade = "B+";
                    else if (percentage >= 60) overallGrade = "B"; else if (percentage >= 50) overallGrade = "C+"; else if (percentage >= 40) overallGrade = "C";
                    else if (percentage >= 33) overallGrade = "D+"; else overallGrade = "D";
                }

                // 🛠️ Display Attendance as Present / Total
                let attDisplay = "-";
                if (marks) {
                    const p = marks.attendance || "-";
                    if (p !== "-" || globalTotalAtt !== "-") attDisplay = `${p} / ${globalTotalAtt}`;
                }

                container.innerHTML += `
                    <div class="pr-card">
                        <div class="pr-header">
                            <h1 class="pr-inst-name">${madrasaName}</h1>
                            <div class="pr-sub-name">STUDENT RESULT PORTAL</div>
                            <div class="pr-title">STUDENT PROGRESS REPORT</div><br>
                            <div class="pr-year">ACADEMIC EXAM: ${term.toUpperCase()}</div>
                        </div>
                        <div class="pr-info-grid">
                            <div class="pr-info-box"><div class="pr-info-label">GENDER</div><div class="pr-info-val">${student.gender === "Male" ? "Boy" : "Girl"}</div></div>
                            <div class="pr-info-box"><div class="pr-info-label">ADMISSION NO.</div><div class="pr-info-val">${student.admissionNo || "-"}</div></div>
                            <div class="pr-info-box"><div class="pr-info-label">CLASS</div><div class="pr-info-val">${state.assignedClass}</div></div>
                            <div class="pr-info-box"><div class="pr-info-label">ATTENDANCE</div><div class="pr-info-val">${attDisplay}</div></div>
                        </div>
                        <div class="pr-student-name">${student.name}</div>
                        <table class="pr-table"><thead><tr><th>No.</th><th>Subject</th><th>Max. Marks</th><th>Marks Obtained</th><th>Status</th></tr></thead><tbody>${tableHtml}</tbody>
                        ${marks ? `<tfoot><tr style="background:#f1f5f9; color:#0f5132;"><th colspan="2" style="text-align:right; padding-right:10px;">TOTAL</th><th>${maxTotal}</th><th>${totalObtained}</th><th>${overallStatus}</th></tr></tfoot>` : ""}
                        </table>
                        <div style="background:#0f5132; color:white; text-align:center; padding:4px; font-size:12px; font-weight:bold; margin-bottom:10px; border-radius:4px;">OVERALL RESULT</div>
                        <div class="pr-summary">
                            <div class="pr-sum-box"><div class="pr-sum-label">TOTAL MARKS</div><div class="pr-sum-val">${totalObtained} / ${maxTotal}</div></div>
                            <div class="pr-sum-box"><div class="pr-sum-label">PERCENTAGE</div><div class="pr-sum-val">${percentage}%</div></div>
                            <div class="pr-sum-box"><div class="pr-sum-label">OVERALL GRADE</div><div class="pr-sum-val">${overallGrade}</div></div>
                            <div class="pr-sum-box"><div class="pr-sum-label">CLASS RANK</div><div class="pr-sum-val">${getRank(student.id)}</div></div>
                        </div>
                        <div class="pr-remarks">TEACHER'S REMARKS: <br><br>.........................................................................................................................</div>
                        <div class="pr-footer"><div class="pr-sign">CLASS TEACHER</div><div class="pr-sign">PARENT / GUARDIAN</div><div class="pr-sign">HEAD TEACHER</div></div>
                    </div>`;
            }

            container.style.opacity = "1"; container.style.position = "static"; container.style.left = "0";
            const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
            const imgData = canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, 0, 297, 210);
            container.style.position = "absolute"; container.style.left = "-9999px"; container.style.opacity = "0";
            
            if (i + 2 < studentsList.length) pdf.addPage();
        }

        pdf.save(`Progress_Report_${state.assignedClass}_${term.replace(/\s+/g, '_')}.pdf`);
    } catch (error) { console.error("PDF Error:", error); alert("Error generating Progress Reports."); } finally { btn.textContent = originalText; btn.disabled = false; }
});

document.getElementById("savePublishSettingsBtn")?.addEventListener("click", async () => {
    const term = document.getElementById("publishTerm").value; const publishDateTime = document.getElementById("publishDateTime").value; const status = document.getElementById("publishStatus").value; const isPublished = (status === "published");
    if (!term) return alert("Please select a term.");
    const btn = document.getElementById("savePublishSettingsBtn"); const originalText = btn.textContent; btn.textContent = "Saving & Syncing..."; btn.disabled = true;
    try {
        const docId = `${state.madrasaUid}_${state.assignedClass}_${term.replace(/\s+/g, '')}`;
        await setDoc(doc(db, "publish_settings", docId), { isPublished: isPublished, publishDateTime: publishDateTime, term: term, className: state.assignedClass, madrasaUid: state.madrasaUid, updatedAt: new Date().toISOString() });
        const statusText = document.getElementById("publishStatusText"); if (statusText) { statusText.innerHTML = "Syncing cache to database... Please wait."; statusText.style.color = "#f59e0b"; }
        await syncResultCache(term);
        if (statusText) { statusText.innerHTML = isPublished ? `✅ Results for '${term}' are now PUBLISHED & VISIBLE!` : `🔒 Results for '${term}' are now HIDDEN!`; statusText.style.color = isPublished ? "#10b981" : "#ef4444"; }
        alert(`Publish settings for ${term} updated successfully!`);
    } catch (error) { console.error("Publish Error:", error); alert("Failed to save publish settings."); } finally { btn.textContent = originalText; btn.disabled = false; }
});

document.getElementById("publishTerm")?.addEventListener("change", async (e) => {
    const term = e.target.value; if(!term) return;
    try {
        const docId = `${state.madrasaUid}_${state.assignedClass}_${term.replace(/\s+/g, '')}`; const snap = await getDoc(doc(db, "publish_settings", docId));
        if (snap.exists()) { const data = snap.data(); document.getElementById("publishStatus").value = data.isPublished ? "published" : "hidden"; document.getElementById("publishDateTime").value = data.publishDateTime || ""; } 
        else { document.getElementById("publishStatus").value = "hidden"; document.getElementById("publishDateTime").value = ""; }
        const statusText = document.getElementById("publishStatusText"); if(statusText) statusText.innerHTML = "";
    } catch(err) { console.error(err); }
});

document.getElementById("selectAllUpgrade")?.addEventListener("change", (e) => {
    const isChecked = e.target.checked; const allBoxes = document.querySelectorAll('#upgradeTableBody input[type="checkbox"]');
    allBoxes.forEach(box => box.checked = isChecked);
});

document.getElementById("processUpgradeBtn")?.addEventListener("click", async () => {
    const targetClass = document.getElementById("upgradeTargetClass").value;
    if (!targetClass) return alert("Please select a target class to upgrade.");
    const checkboxes = document.querySelectorAll('#upgradeTableBody input[type="checkbox"]:checked');
    if (checkboxes.length === 0) return alert("Please select at least one student to upgrade.");
    if (!confirm(`Are you sure you want to upgrade ${checkboxes.length} student(s) to Class ${targetClass}?`)) return;

    const btn = document.getElementById("processUpgradeBtn"); const originalText = btn.textContent; btn.textContent = "Upgrading Please Wait..."; btn.disabled = true;
    try {
        let count = 0; let currentBatch = writeBatch(db); 
        for (let box of checkboxes) { const studentDocId = box.value; if(studentDocId) { const studentRef = doc(db, "students", studentDocId); currentBatch.set(studentRef, { className: targetClass }, { merge: true }); count++; } }
        await currentBatch.commit();
        localStorage.removeItem(`cache_students_${state.assignedClass}`); state.isSmartCacheValid = false; await triggerCacheUpdate(); 
        alert(`Successfully upgraded ${count} student(s) to Class ${targetClass}!`); window.location.reload(); 
    } catch (error) { console.error("Upgrade Error:", error); alert("An error occurred while upgrading."); } finally { btn.textContent = originalText; btn.disabled = false; }
});

checkAuth(async (user) => { state.teacherUid = user.uid; editModalInstance = new bootstrap.Modal(document.getElementById('editStudentModal')); setupTabs(); await loadTeacherData(); });