import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, getDocs, query, where, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const userRole = localStorage.getItem('userRole');
if (userRole !== 'admin') {
    alert("Unauthorized Access! Please login as Madrasa Admin.");
    window.location.href = "index.html";
}

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

let adminUid = "";
let madrasaIdCode = "";

// Global variables
window.currentTcStudent = null;
window.currentTcStudentId = null;
let teachersDataList = {};

function formatDate(dateStr) {
    if (!dateStr) return "-";
    if (String(dateStr).includes("-")) {
        const parts = String(dateStr).split("-");
        if (parts[0].length === 4) { return `${parts[2]}-${parts[1]}-${parts[0]}`; }
    }
    return dateStr;
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => { localStorage.clear(); window.location.href = "index.html"; });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        adminUid = user.uid;
        loadMadrasaData(); 
        loadTeachers();    
        loadPendingAdmissions();
    }
});

// --- Copy Links Logic ---
document.getElementById('copyAdmissionLinkBtn').addEventListener('click', () => {
    const admissionUrl = `${window.location.origin}/admission.html?mid=${adminUid}`;
    navigator.clipboard.writeText(admissionUrl).then(() => {
        alert("Admission Link Copied!\nShare this link via WhatsApp.");
    });
});

document.getElementById('copyResultLinkBtn').addEventListener('click', () => {
    const resultUrl = `${window.location.origin}/result.html?mid=${adminUid}`;
    navigator.clipboard.writeText(resultUrl).then(() => {
        alert("Result Link Copied!\nShare this link so students can view their results.");
    });
});

// --- 1. Load Madrasa Data ---
async function loadMadrasaData() {
    const cachedClasses = JSON.parse(localStorage.getItem('madrasaClasses'));
    const cachedName = localStorage.getItem('madrasaName');

    if(cachedName) document.getElementById('madrasaNameDisplay').innerText = cachedName;
    if(cachedClasses) updateClassUI(cachedClasses);

    try {
        const docRef = doc(db, "users", adminUid);
        const docSnap = await getDoc(docRef);
        
        if(docSnap.exists()) {
            const data = docSnap.data();
            madrasaIdCode = data.madrasaId; 
            document.getElementById('madrasaNameDisplay').innerText = data.madrasaName;
            localStorage.setItem('madrasaName', data.madrasaName); 

            const classes = data.classes || []; 
            localStorage.setItem('madrasaClasses', JSON.stringify(classes)); 
            
            updateClassUI(classes);
        }
    } catch (error) { console.error("Error fetching madrasa data:", error); }
}

function updateClassUI(classes) {
    classes.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
    const tClassSelect = document.getElementById('tClass');
    const pubClassSelect = document.getElementById('adminPublishClass'); 
    const listContainer = document.getElementById('classListContainer');

    tClassSelect.innerHTML = '<option value="">Select a Class</option>';
    if(pubClassSelect) pubClassSelect.innerHTML = '<option value="ALL">All Classes (Publish Together)</option>';
    listContainer.innerHTML = '';

    if (classes.length === 0) {
        listContainer.innerHTML = '<span style="color: #888; font-size: 13px;">No classes added yet.</span>';
        return;
    }

    classes.forEach(cls => {
        tClassSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        if(pubClassSelect) pubClassSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        const tagDiv = document.createElement('div');
        tagDiv.className = 'class-tag';
        tagDiv.innerHTML = `${cls} <div class="tag-close class-close" data-class="${cls}">x</div>`;
        listContainer.appendChild(tagDiv);
    });

    document.querySelectorAll('.class-close').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const classToDelete = e.target.getAttribute('data-class');
            if(confirm(`Are you sure you want to delete '${classToDelete}'?`)) await deleteClass(classToDelete);
        });
    });
}

async function deleteClass(className) {
    try {
        await updateDoc(doc(db, "users", adminUid), { classes: arrayRemove(className) });
        let cachedClasses = JSON.parse(localStorage.getItem('madrasaClasses')) || [];
        cachedClasses = cachedClasses.filter(c => c !== className);
        localStorage.setItem('madrasaClasses', JSON.stringify(cachedClasses));
        updateClassUI(cachedClasses);
    } catch (error) { alert("Error deleting class!"); }
}

document.getElementById('addClassBtn').addEventListener('click', async () => {
    const newClass = document.getElementById('newClassName').value.trim();
    if(!newClass) return alert("Please enter a class name!");
    const btn = document.getElementById('addClassBtn');
    btn.innerText = "Adding...";
    try {
        await updateDoc(doc(db, "users", adminUid), { classes: arrayUnion(newClass) });
        let cached = JSON.parse(localStorage.getItem('madrasaClasses')) || [];
        if(!cached.includes(newClass)) {
            cached.push(newClass);
            localStorage.setItem('madrasaClasses', JSON.stringify(cached));
            updateClassUI(cached); 
        }
        document.getElementById('newClassName').value = '';
        btn.innerText = "Add";
    } catch (error) { alert("Error adding class!"); btn.innerText = "Add"; }
});


// --- 2. ADMIN RESULT PUBLISH LOGIC ---
document.getElementById('adminPublishTerm').addEventListener('change', loadAdminPublishStatus);
document.getElementById('adminPublishClass').addEventListener('change', loadAdminPublishStatus);

async function loadAdminPublishStatus() {
    const term = document.getElementById('adminPublishTerm').value;
    const cls = document.getElementById('adminPublishClass').value;
    const statusDiv = document.getElementById('adminPublishStatusDisplay');

    if (cls === "ALL") {
        statusDiv.innerHTML = "<span style='color:#34495e;'>Select a specific class to view its current status. Saving now will apply settings to ALL classes.</span>";
        document.getElementById("adminPublishStatus").value = "hidden";
        document.getElementById("adminPublishDateTime").value = "";
        return;
    }

    try {
        const docSnap = await getDoc(doc(db, "publish_settings", `${adminUid}_${cls}_${term.replace(/\s+/g, '')}`));
        if(docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("adminPublishStatus").value = data.isPublished ? "published" : "hidden";
            document.getElementById("adminPublishDateTime").value = data.publishDateTime || "";

            if(data.isPublished) {
                if(data.publishDateTime && new Date(data.publishDateTime) > new Date()) {
                    const dt = new Date(data.publishDateTime);
                    statusDiv.innerHTML = `<span style="color:#f59e0b;">⏳ Status: Scheduled to Publish on ${dt.getDate()}-${dt.getMonth()+1}-${dt.getFullYear()} at ${dt.toLocaleTimeString()}</span>`;
                } else {
                    statusDiv.innerHTML = `<span style="color:#27ae60;">✅ Status: Published (Visible to Students)</span>`;
                }
            } else {
                statusDiv.innerHTML = `<span style="color:#e74c3c;">🔒 Status: Locked (Hidden from Students)</span>`;
            }
        } else {
            document.getElementById("adminPublishStatus").value = "hidden";
            document.getElementById("adminPublishDateTime").value = "";
            statusDiv.innerHTML = `<span style="color:#e74c3c;">🔒 Status: Locked (Default)</span>`;
        }
    } catch(e) { 
        statusDiv.innerHTML = ""; 
    }
}

document.getElementById('adminSavePublishBtn').addEventListener('click', async () => {
    const term = document.getElementById('adminPublishTerm').value;
    const clsSelection = document.getElementById('adminPublishClass').value;
    const dt = document.getElementById('adminPublishDateTime').value;
    const isPub = document.getElementById('adminPublishStatus').value === 'published';

    let classesToUpdate = [];
    if (clsSelection === "ALL") {
        classesToUpdate = JSON.parse(localStorage.getItem('madrasaClasses')) || [];
    } else {
        classesToUpdate = [clsSelection];
    }

    if(classesToUpdate.length === 0) return alert("No classes available to update.");

    const btn = document.getElementById('adminSavePublishBtn');
    const originalText = btn.innerText;
    btn.innerText = "Saving...";
    
    try {
        const promises = classesToUpdate.map(cls => {
            const docId = `${adminUid}_${cls}_${term.replace(/\s+/g, '')}`;
            return setDoc(doc(db, "publish_settings", docId), {
                madrasaUid: adminUid,
                className: cls,
                term: term,
                isPublished: isPub,
                publishDateTime: dt
            });
        });
        
        await Promise.all(promises);
        
        document.getElementById('adminPublishStatusDisplay').innerHTML = `<span style="color:#27ae60;">✅ Status Updated Successfully!</span>`;
        
        if (clsSelection !== "ALL") {
            setTimeout(loadAdminPublishStatus, 2000);
        }

    } catch(e) { 
        alert("Error saving settings."); 
    }
    btn.innerText = originalText;
});


// --- 3. PENDING ADMISSIONS SECTION ---
async function loadPendingAdmissions() {
    const tbody = document.getElementById('pendingAdmissionsBody');
    try {
        const q = query(collection(db, "admissions"), where("madrasaUid", "==", adminUid), where("status", "==", "pending"));
        const snapshot = await getDocs(q);
        
        tbody.innerHTML = '';
        if(snapshot.empty) return tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #7f8c8d;">No pending admissions</td></tr>';

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            let displayDate = "-";
            if(data.appliedDate) {
                const d = data.appliedDate.toDate();
                displayDate = `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`;
            }

            const relationPrefix = data.gender === "Female" ? "D/o" : "S/o";

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${displayDate}</td>
                <td><b>${data.name}</b><br><small>${relationPrefix}: ${data.fatherName}</small></td>
                <td>${data.appliedClass}</td>
                <td>${data.place}<br><small>${data.contactNo}</small></td>
                <td style="white-space: nowrap;">
                    <button class="btn-small btn-green" onclick="approveAdmission('${docSnap.id}', '${data.name}', '${data.appliedClass}', '${data.gender}', '${data.dob}', '${data.fatherName}', '${data.place}', '${data.contactNo}', '${data.whatsappNo}')">Approve</button>
                    <button class="btn-small btn-red" onclick="rejectAdmission('${docSnap.id}')">Reject</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) { console.error("Error loading admissions", e); }
}

window.approveAdmission = async (docId, name, cls, gender, dob, fatherName, place, contactNo, whatsappNo) => {
    const adNo = prompt(`Enter a new Admission Number for ${name} (Class: ${cls}):`);
    if(!adNo) return alert("Approval cancelled. Admission number is required to add the student.");
    
    try {
        await addDoc(collection(db, "students"), {
            name, admissionNo: adNo, className: cls, gender, dob, fatherName, place, contactNo, whatsappNo, madrasaUid: adminUid
        });
        await updateDoc(doc(db, "admissions", docId), { status: "approved" });
        alert("Student approved and successfully added to the Teacher's class list!");
        loadPendingAdmissions();
    } catch (e) { alert("Error approving student."); }
};

window.rejectAdmission = async (docId) => {
    if(!confirm("Are you sure you want to reject and delete this application?")) return;
    try {
        await deleteDoc(doc(db, "admissions", docId));
        loadPendingAdmissions();
    } catch (e) { alert("Error rejecting application."); }
};


// --- 4. TC (TRANSFER CERTIFICATE) SECTION ---
document.getElementById('searchTcBtn').addEventListener('click', async () => {
    const adNo = document.getElementById('tcAdnoSearch').value.trim();
    if(!adNo) return alert("Enter Admission Number");
    
    document.getElementById('searchTcBtn').innerText = "Searching...";
    try {
        const q = query(collection(db, "students"), where("madrasaUid", "==", adminUid), where("admissionNo", "==", adNo));
        const snap = await getDocs(q);
        
        const detailsDiv = document.getElementById('tcStudentDetails');
        if(snap.empty) {
            detailsDiv.style.display = "block";
            detailsDiv.innerHTML = "<p style='color:red; margin:0;'>No active student found with this Admission Number.</p>";
        } else {
            const studentDoc = snap.docs[0];
            const student = studentDoc.data();
            
            window.currentTcStudent = student;
            window.currentTcStudentId = studentDoc.id;

            detailsDiv.style.display = "block";
            detailsDiv.innerHTML = `
                <div style="background:#fff; border:1px solid #bdc3c7; border-radius:5px; padding:15px; margin-bottom:15px;">
                    <h4 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px;">Student Information</h4>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px;">
                        <p style="margin:0;"><b>Name:</b> ${student.name}</p>
                        <p style="margin:0;"><b>Class:</b> ${student.className}</p>
                        <p style="margin:0;"><b>Ad.No:</b> ${student.admissionNo}</p>
                        <p style="margin:0;"><b>Father:</b> ${student.fatherName || "-"}</p>
                        <p style="margin:0;"><b>DOB:</b> ${formatDate(student.dob)}</p>
                        <p style="margin:0;"><b>Place:</b> ${student.place || "-"}</p>
                    </div>
                </div>
                
                <div style="background:#fff; border:1px solid #bdc3c7; border-radius:5px; padding:15px;">
                    <h4 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px;">Enter TC Details</h4>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div><label style="font-size:12px; font-weight:bold;">Total Working Days</label><input type="number" id="tcTotalDays" placeholder="e.g. 200" style="margin:0; padding:8px;"></div>
                        <div><label style="font-size:12px; font-weight:bold;">Days Attended</label><input type="number" id="tcAttendedDays" placeholder="e.g. 185" style="margin:0; padding:8px;"></div>
                        <div><label style="font-size:12px; font-weight:bold;">Character/Conduct</label><input type="text" id="tcConduct" value="Good" style="margin:0; padding:8px;"></div>
                        <div><label style="font-size:12px; font-weight:bold;">Reason for Leaving</label><input type="text" id="tcReason" value="Course Completed" style="margin:0; padding:8px;"></div>
                    </div>
                </div>
                <button class="action-btn" style="background-color:#e74c3c; margin-top:15px;" onclick="generateTCAndRemove()">Download TC & Remove Student</button>
            `;
        }
    } catch (e) { console.error(e); }
    document.getElementById('searchTcBtn').innerText = "Search";
});

window.generateTCAndRemove = async () => {
    const student = window.currentTcStudent;
    const docId = window.currentTcStudentId;
    if(!student || !docId) return;

    const totalDays = document.getElementById('tcTotalDays').value || "-";
    const attendedDays = document.getElementById('tcAttendedDays').value || "-";
    const conduct = document.getElementById('tcConduct').value || "Good";
    const reason = document.getElementById('tcReason').value || "Course Completed";

    if(!confirm(`WARNING: This will generate a TC for ${student.name}, remove them from Class ${student.className}, and delete their marks. Proceed?`)) return;

    document.getElementById('tcMadrasaName').innerText = localStorage.getItem('madrasaName') || "MADRASA";
    document.getElementById('tcAdNoVal').innerText = student.admissionNo || "-";
    document.getElementById('tcNameVal').innerText = student.name || "-";
    document.getElementById('tcFatherVal').innerText = student.fatherName || "-";
    document.getElementById('tcDobVal').innerText = student.dob ? formatDate(student.dob) : "-";
    document.getElementById('tcGenderVal').innerText = student.gender || "-";
    document.getElementById('tcPlaceVal').innerText = student.place || "-";
    document.getElementById('tcClassVal').innerText = student.className || "-";
    document.getElementById('tcTotalDaysVal').innerText = totalDays;
    document.getElementById('tcAttendedDaysVal').innerText = attendedDays;
    document.getElementById('tcConductVal').innerText = conduct;
    document.getElementById('tcReasonVal').innerText = reason;
    
    const today = new Date();
    document.getElementById('tcIssueDateVal').innerText = `${today.getDate()}-${today.getMonth()+1}-${today.getFullYear()}`;

    const tcArea = document.getElementById('tcPdfArea');
    const wrapper = tcArea.parentElement;
    wrapper.style.left = "0"; 

    html2canvas(tcArea, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }).then(async (canvas) => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        let imgWidth = pdfWidth;
        let imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 10, imgWidth, imgHeight);
        pdf.save(`TC_${student.admissionNo}_${student.name}.pdf`); 
        
        wrapper.style.left = "-9999px"; 

        try {
            await deleteDoc(doc(db, "students", docId));
            const marksSnap = await getDocs(query(collection(db, "marks"), where("studentId", "==", docId)));
            marksSnap.docs.forEach(async (m) => await deleteDoc(doc(db, "marks", m.id)));
            
            document.getElementById('tcStudentDetails').innerHTML = `<p style="color:green; font-weight:bold; margin:0; padding: 20px; text-align:center;">✅ TC Generated & Student removed successfully.</p>`;
            document.getElementById('tcAdnoSearch').value = '';
            window.currentTcStudent = null;
            window.currentTcStudentId = null;
        } catch (e) { alert("Error removing student data after generating TC."); }
    });
};

// --- 5. TEACHERS SECTION (Smart Auto-Versioning) ---

const createBtn = document.getElementById('createTeacherBtn');
createBtn.addEventListener('click', async () => {
    const tName = document.getElementById('tName').value.trim();
    const tMobile = document.getElementById('tMobile').value.trim();
    const tPassword = document.getElementById('tPassword').value;
    const tClass = document.getElementById('tClass').value;

    if(!tName || !tMobile || !tPassword || !tClass) return alert("Please fill in all details!");
    
    if(!madrasaIdCode || madrasaIdCode.trim() === "") {
        return alert("Error: ഈ മദ്രസയ്ക്ക് 'Madrasa ID' ലഭ്യമല്ല!\n\nസൂപ്പർ അഡ്മിൻ പാനലിൽ പോയി ഈ മദ്രസയെ Edit ചെയ്ത് ഒരു ID (ഉദാ: 1050) നൽകിയ ശേഷം മാത്രം ഉസ്താദുമാരെ ആഡ് ചെയ്യുക.");
    }

    createBtn.innerText = "Adding...";

    const cleanMobile = tMobile.replace(/[^0-9]/g, ''); 
    const cleanMadrasaId = madrasaIdCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(); 

    if(!cleanMobile || cleanMobile.length < 10) {
        createBtn.innerText = "Add Teacher";
        return alert("ദയവായി കൃത്യമായ 10 അക്ക മൊബൈൽ നമ്പർ നൽകുക!");
    }

    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
    const secondaryAuth = getAuth(secondaryApp);
    
    // ഈ നമ്പറിൽ അക്കൗണ്ട് ഉണ്ടെങ്കിൽ സിസ്റ്റം തനിയെ v2, v3 എന്നിങ്ങനെ പേര് മാറ്റി സേവ് ചെയ്യും
    const suffixes = ["", "v2.", "v3.", "v4.", "v5.", "v6.", "v7.", "v8."];
    let newUid = "";
    let successfulEmail = "";
    let created = false;

    for (let suffix of suffixes) {
        const dummyEmail = `${cleanMobile}@${suffix}${cleanMadrasaId}.com`;
        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, dummyEmail, tPassword);
            newUid = userCredential.user.uid;
            successfulEmail = dummyEmail;
            created = true;
            break; // അക്കൗണ്ട് ക്രിയേറ്റ് ആയാൽ ലൂപ്പ് നിർത്തുന്നു
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                continue; // നമ്പർ ഉപയോഗിച്ചിട്ടുണ്ടെങ്കിൽ തനിയെ അടുത്ത വേർഷനിലേക്ക് മാറും
            } else {
                await signOut(secondaryAuth);
                createBtn.innerText = "Add Teacher";
                return alert("Error: " + error.message);
            }
        }
    }

    if (!created) {
        await signOut(secondaryAuth);
        createBtn.innerText = "Add Teacher";
        return alert("Error: ഈ ഉസ്താദിനെ ഒരുപാട് തവണ റിമൂവ് ചെയ്ത് ആഡ് ചെയ്തിട്ടുണ്ട്.");
    }

    try {
        await setDoc(doc(db, "users", newUid), {
            name: tName, 
            mobile: cleanMobile, // പത്ത് അക്ക നമ്പർ മാത്രം ഡാറ്റാബേസിൽ സേവ് ആവും
            email: successfulEmail, 
            role: "teacher", 
            assignedClass: tClass, 
            madrasaUid: adminUid, 
            madrasaId: madrasaIdCode
        });

        await signOut(secondaryAuth);
        alert("Teacher Added Successfully!");
        createBtn.innerText = "Add Teacher";
        
        document.getElementById('tName').value = ''; 
        document.getElementById('tMobile').value = '';
        document.getElementById('tPassword').value = ''; 
        document.getElementById('tClass').value = '';
        
        loadTeachers(); 
        
    } catch (error) { 
        console.error("Firebase Auth Error:", error);
        alert("Error saving data: " + error.message); 
        createBtn.innerText = "Add Teacher"; 
    }
});

// ടീച്ചർമാരുടെ ലിസ്റ്റ് ലോഡ് ചെയ്യുന്ന ഫംഗ്ഷൻ
async function loadTeachers() {
    const tbody = document.getElementById('teacherTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading data...</td></tr>';
    try {
        const q = query(collection(db, "users"), where("role", "==", "teacher"), where("madrasaUid", "==", adminUid));
        const querySnapshot = await getDocs(q);
        
        tbody.innerHTML = '';
        teachersDataList = {}; 

        if(querySnapshot.empty) return tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No Teachers added yet.</td></tr>';

        querySnapshot.forEach((documentSnapshot) => {
            const data = documentSnapshot.data();
            const tId = documentSnapshot.id;
            teachersDataList[tId] = data; 

            const displayMobile = data.mobile || data.email; 

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.name}</td>
                <td>${displayMobile}</td>
                <td><span style="background:#e8f4f8; padding:3px 8px; border-radius:12px; font-size:12px; font-weight:bold;">${data.assignedClass}</span></td>
                <td>
                    <button class="btn-small edit-t-btn" data-id="${tId}" style="background-color: #f39c12; margin-right: 5px;">Edit</button>
                    <button class="btn-small btn-red delete-btn" data-id="${tId}">Remove</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.edit-t-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tId = e.target.getAttribute('data-id');
                const tData = teachersDataList[tId];
                
                document.getElementById('editTeacherId').value = tId;
                document.getElementById('editTeacherName').value = tData.name;
                document.getElementById('editTeacherMobile').value = tData.mobile || tData.email;

                const classSelect = document.getElementById('editTeacherClass');
                const cachedClasses = JSON.parse(localStorage.getItem('madrasaClasses')) || [];
                classSelect.innerHTML = '<option value="">Select a Class</option>';
                cachedClasses.forEach(cls => {
                    const isSelected = (cls === tData.assignedClass) ? "selected" : "";
                    classSelect.innerHTML += `<option value="${cls}" ${isSelected}>${cls}</option>`;
                });
                
                document.getElementById('editTeacherModal').classList.remove('hidden');
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tId = e.target.getAttribute('data-id');
                if(confirm("Are you sure you want to remove this teacher?")) { 
                    await deleteDoc(doc(db, "users", tId)); 
                    loadTeachers(); 
                }
            });
        });
    } catch (error) { console.error("Error loading teachers:", error); }
}

document.getElementById('saveTeacherEditBtn').addEventListener('click', async () => {
    const tId = document.getElementById('editTeacherId').value;
    const newName = document.getElementById('editTeacherName').value.trim();
    const newClass = document.getElementById('editTeacherClass').value;

    if(!newName || !newClass) return alert("Name and Class are required!");

    const btn = document.getElementById('saveTeacherEditBtn');
    btn.innerText = "Saving...";

    try {
        await updateDoc(doc(db, "users", tId), {
            name: newName,
            assignedClass: newClass
        });
        document.getElementById('editTeacherModal').classList.add('hidden');
        alert("Teacher details updated successfully!");
        loadTeachers(); 
    } catch(e) {
        alert("Error updating teacher.");
    }
    btn.innerText = "Save Changes";
});