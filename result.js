import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDr5gIKnAdkiNrdLe2e3u1wOChFzeXlpCA",
    authDomain: "madrasa-portal-63037.firebaseapp.com",
    projectId: "madrasa-portal-63037",
    storageBucket: "madrasa-portal-63037.firebasestorage.app",
    messagingSenderId: "543466628748",
    appId: "1:543466628748:web:6ec6375aa7d080cb403da9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const urlParams = new URLSearchParams(window.location.search);
const madrasaUid = urlParams.get('mid');

if (!madrasaUid) {
    document.getElementById("searchSection").style.display = "none";
    document.getElementById("madrasaNameDisplay").innerText = "Invalid Link";
} else {
    // മദ്രസയുടെ പേരും ക്ലാസുകളും എടുക്കുന്നു
    getDoc(doc(db, "users", madrasaUid)).then(docSnap => {
        if(docSnap.exists()) {
            document.getElementById("madrasaNameDisplay").innerText = docSnap.data().madrasaName;
            
            const classes = docSnap.data().classes || [];
            const classSelect = document.getElementById("className");
            classSelect.innerHTML = '<option value="">-- Select Class --</option>';
            
            classes.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
            classes.forEach(c => {
                classSelect.innerHTML += `<option value="${c}">${c}</option>`;
            });
        }
    });
}

document.getElementById("resultForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if(!madrasaUid) return;

    const term = document.getElementById("examTerm").value;
    const className = document.getElementById("className").value;
    const gender = document.getElementById("gender").value;
    const requestedRollNo = parseInt(document.getElementById("rollNo").value, 10);
    
    if(!className) return showError("Please select a class.");

    const btn = document.getElementById("searchBtn");
    const errorMsg = document.getElementById("errorMsg");
    
    btn.textContent = "Searching...";
    btn.disabled = true;
    errorMsg.style.display = "none";

    try {
        // 1. നൽകിയ ക്ലാസ്സിലെയും ജെൻഡറിലെയും എല്ലാ കുട്ടികളെയും എടുക്കുന്നു
        const studentQ = query(collection(db, "students"), 
            where("madrasaUid", "==", madrasaUid), 
            where("className", "==", className),
            where("gender", "==", gender)
        );
        const studentSnap = await getDocs(studentQ);

        if (studentSnap.empty) {
            showError(`No ${gender === 'Male' ? 'Boys' : 'Girls'} found in Class ${className}.`);
            return;
        }

        let studentsList = [];
        studentSnap.forEach(doc => studentsList.push({ id: doc.id, ...doc.data() }));

        // 2. അഡ്മിഷൻ നമ്പറിന്റെ അടിസ്ഥാനത്തിൽ ക്രമീകരിക്കുന്നു (ടീച്ചർ പാനലിലെ അതേ റോൾ നമ്പർ കിട്ടാൻ വേണ്ടി)
        studentsList.sort((a, b) => String(a.admissionNo).localeCompare(String(b.admissionNo), undefined, {numeric: true}));

        // 3. കൊടുത്ത റോൾ നമ്പർ ലിസ്റ്റിൽ ഉണ്ടോ എന്ന് നോക്കുന്നു
        if (requestedRollNo < 1 || requestedRollNo > studentsList.length) {
            showError(`Invalid Roll Number. Only ${studentsList.length} ${gender === 'Male' ? 'Boys' : 'Girls'} are present in Class ${className}.`);
            return;
        }

        // 4. റോൾ നമ്പർ വെച്ച് കുട്ടിയെ കണ്ടെത്തുന്നു (Index starts at 0, so RollNo - 1)
        const targetStudent = studentsList[requestedRollNo - 1];
        const studentId = targetStudent.id;

        // 5. റിസൾട്ട് പബ്ലിഷ് ചെയ്തിട്ടുണ്ടോ എന്ന് പരിശോധിക്കുന്നു
        const publishDocId = `${madrasaUid}_${className}_${term.replace(/\s+/g, '')}`;
        const publishSnap = await getDoc(doc(db, "publish_settings", publishDocId));

        if (!publishSnap.exists() || !publishSnap.data().isPublished) {
            showError(`Results for Class ${className} (${term}) are not published yet!`);
            return;
        }

        // 6. പബ്ലിഷ് ചെയ്തിട്ടുണ്ടെങ്കിൽ മാർക്ക് എടുക്കുന്നു
        const markDocId = `${studentId}_${term.replace(/\s+/g, '')}`;
        const markSnap = await getDoc(doc(db, "marks", markDocId));

        if (!markSnap.exists()) {
            showError("Marks not found or student was absent for this exam.");
            return;
        }

        // 7. മാർക്കുകൾ കാണിക്കുന്നു
        renderResult(targetStudent, requestedRollNo, markSnap.data(), term);

    } catch (error) {
        console.error(error);
        showError("Something went wrong. Please try again.");
    }
});

function showError(msg) {
    const errorMsg = document.getElementById("errorMsg");
    const btn = document.getElementById("searchBtn");
    errorMsg.innerText = msg;
    errorMsg.style.display = "block";
    btn.textContent = "View Result";
    btn.disabled = false;
}

function renderResult(student, rollNo, marksData, term) {
    document.getElementById("searchSection").style.display = "none";
    document.getElementById("resultCard").style.display = "block";

    document.getElementById("resName").innerText = student.name;
    document.getElementById("resClass").innerText = student.className;
    document.getElementById("resRollNo").innerText = rollNo;
    document.getElementById("resTerm").innerText = term;

    const tbody = document.getElementById("marksBody");
    tbody.innerHTML = "";

    const subjectsConfig = marksData.subjectConfig || [];
    const marks = marksData.marks || {};

    subjectsConfig.forEach(sub => {
        const markObtained = marks[sub.name] !== undefined ? marks[sub.name] : "-";
        const isFailMark = markObtained === "A" || (markObtained !== "-" && Number(markObtained) < sub.passMark);
        const color = isFailMark ? "#dc2626" : "#334155";
        const fw = isFailMark ? "bold" : "normal";

        tbody.innerHTML += `
            <tr>
                <td><b>${sub.name}</b></td>
                <td>${sub.maxMark}</td>
                <td style="color: ${color}; font-weight: ${fw};">${markObtained}</td>
            </tr>
        `;
    });

    document.getElementById("resTotal").innerText = `${Math.round(marksData.totalMarks)} / ${marksData.maxMarkTotal}`;
    document.getElementById("resPerc").innerText = `${Math.round(marksData.percentage)}%`;
    document.getElementById("resGrade").innerText = marksData.grade || "-";
    
    const statusEl = document.getElementById("resStatus");
    statusEl.innerText = marksData.status === "Failed" ? "FAILED" : "PASSED";
    statusEl.className = marksData.status === "Failed" ? "status-failed" : "status-passed";
}