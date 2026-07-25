import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
let madrasaNameGlobal = "MADRASA";
window.currentTcStudent = null;
window.currentTcStudentId = null;
let teachersDataList = {};
let isSmartCacheValid = false; // 📌 Smart Cache Flag

// 📌 പുതിയ സിങ്ക് ബട്ടൺ ചേർക്കുന്നു (Logout ബട്ടണിന്റെ അടുത്ത്)
const syncBtn = document.createElement("button");
syncBtn.innerHTML = "🔄 Sync Data";
syncBtn.style = "background: #27ae60; color: white; margin-right: 15px; font-weight: bold; padding: 8px 16px; border: 1px solid #27ae60; border-radius: 6px; cursor: pointer; transition: 0.2s;";
syncBtn.onclick = async () => {
    syncBtn.textContent = "Syncing...";
    localStorage.setItem(`admin_smart_time_${adminUid}`, "0"); 
    isSmartCacheValid = false;
    await loadMadrasaData(); 
    await loadTeachersDirectory();    
    await loadPendingAdmissions();
    syncBtn.innerHTML = "🔄 Sync Data";
    alert("ഡാറ്റ വിജയകരമായി സിങ്ക് ചെയ്തു!");
};
const logoutBtn = document.getElementById('logoutBtn');
logoutBtn.parentNode.insertBefore(syncBtn, logoutBtn);

// 📌 Admin Smart Cache പരിശോധിക്കാനുള്ള ഫംഗ്ഷൻ (1 Read മാത്രം)
async function verifyAdminSmartCache() {
    if(!adminUid) return false;
    try {
        const metaDoc = await getDoc(doc(db, "admin_meta", adminUid));
        const serverTime = metaDoc.exists() ? metaDoc.data().lastUpdate : 0;
        const localTime = localStorage.getItem(`admin_smart_time_${adminUid}`);

        if (serverTime > 0 && String(serverTime) === String(localTime)) {
            isSmartCacheValid = true;
        } else {
            isSmartCacheValid = false;
            localStorage.setItem(`admin_smart_time_${adminUid}`, serverTime);
        }
    } catch(e) { isSmartCacheValid = false; }
    return isSmartCacheValid;
}

// 📌 Admin ഡാറ്റ മാറ്റുമ്പോൾ Cache അപ്ഡേറ്റ് ചെയ്യാൻ
async function triggerAdminCacheUpdate() {
    try {
        const now = Date.now();
        await setDoc(doc(db, "admin_meta", adminUid), { lastUpdate: now }, { merge: true });
        localStorage.setItem(`admin_smart_time_${adminUid}`, now);
        isSmartCacheValid = true; 
    } catch (e) {}
}

// 📌 ടീച്ചറുടെ ക്ലാസ്സിൽ മാറ്റം വരുമ്പോൾ (അഡ്മിഷൻ/TC) ടീച്ചർക്കും Cache അപ്ഡേറ്റ് കൊടുക്കാൻ
async function triggerClassCacheUpdate(className) {
    try {
        await setDoc(doc(db, "class_meta", `${adminUid}_${className}`), { lastUpdate: Date.now() }, { merge: true });
    } catch(e) {}
}

function formatDate(dateStr) {
    if (!dateStr) return "-";
    if (String(dateStr).includes("-")) {
        const parts = String(dateStr).split("-");
        if (parts[0].length === 4) { return `${parts[2]}-${parts[1]}-${parts[0]}`; }
    }
    return dateStr;
}

logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => { localStorage.clear(); window.location.href = "index.html"; });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        adminUid = user.uid;
        await verifyAdminSmartCache(); // ആദ്യം സ്മാർട്ട് ക്യാഷ് പരിശോധിക്കുന്നു
        await loadMadrasaData(); 
        loadTeachersDirectory();    
        loadPendingAdmissions();
    }
});

document.getElementById('copyAdmissionLinkBtn').addEventListener('click', () => {
    const targetId = madrasaIdCode || adminUid; 
    const admissionUrl = `${window.location.origin}/admission.html?mid=${targetId}`;
    navigator.clipboard.writeText(admissionUrl).then(() => {
        alert("Admission Link Copied!\n\nLink: " + admissionUrl + "\n\nShare this link via WhatsApp.");
    });
});

document.getElementById('copyResultLinkBtn').addEventListener('click', () => {
    const targetId = madrasaIdCode || adminUid; 
    const resultUrl = `${window.location.origin}/result.html?mid=${targetId}`;
    navigator.clipboard.writeText(resultUrl).then(() => {
        alert("Result Link Copied!\n\nLink: " + resultUrl + "\n\nShare this link so students can view their results.");
    });
});

async function loadMadrasaData() {
    const cacheKey = `cache_admin_data_${adminUid}`;
    
    if (isSmartCacheValid && localStorage.getItem(cacheKey)) {
        const data = JSON.parse(localStorage.getItem(cacheKey));
        madrasaIdCode = data.madrasaId || adminUid; 
        madrasaNameGlobal = data.madrasaName || "Madrasa Admin";
        document.getElementById('madrasaNameDisplay').innerText = madrasaNameGlobal;
        document.getElementById('pdfMadrasaNameForTeachers').innerText = madrasaNameGlobal;
        localStorage.setItem('madrasaName', madrasaNameGlobal); 
        const classes = data.classes || []; 
        localStorage.setItem('madrasaClasses', JSON.stringify(classes)); 
        updateClassUI(classes);
        return;
    }

    try {
        const docRef = doc(db, "users", adminUid);
        const docSnap = await getDoc(docRef);
        
        if(docSnap.exists()) {
            const data = docSnap.data();
            localStorage.setItem(cacheKey, JSON.stringify(data)); // ഡാറ്റ ക്യാഷിലേക്ക് സേവ് ചെയ്യുന്നു
            
            madrasaIdCode = data.madrasaId || adminUid; 
            madrasaNameGlobal = data.madrasaName || "Madrasa Admin";
            
            document.getElementById('madrasaNameDisplay').innerText = madrasaNameGlobal;
            document.getElementById('pdfMadrasaNameForTeachers').innerText = madrasaNameGlobal;
            localStorage.setItem('madrasaName', madrasaNameGlobal); 

            const classes = data.classes || []; 
            localStorage.setItem('madrasaClasses', JSON.stringify(classes)); 
            
            updateClassUI(classes);
        }
    } catch (error) { console.error("Error fetching madrasa data:", error); }
}

function updateClassUI(classes) {
    classes.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
    
    const pubClassSelect = document.getElementById('adminPublishClass'); 
    const listContainer = document.getElementById('classListContainer');
    const tClassSelect = document.getElementById('tClassSelect');

    if(pubClassSelect) pubClassSelect.innerHTML = '<option value="ALL">All Classes (Publish Together)</option>';
    listContainer.innerHTML = '';
    tClassSelect.innerHTML = '<option value="">Select Assigned Class</option>';

    if (classes.length === 0) {
        listContainer.innerHTML = '<span style="color: #888; font-size: 13px;">No classes added yet.</span>';
        return;
    }

    classes.forEach(cls => {
        if(pubClassSelect) pubClassSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        tClassSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        
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
        
        // Update admin data cache
        let adminData = JSON.parse(localStorage.getItem(`cache_admin_data_${adminUid}`) || "{}");
        adminData.classes = cachedClasses;
        localStorage.setItem(`cache_admin_data_${adminUid}`, JSON.stringify(adminData));
        
        await triggerAdminCacheUpdate();
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
            
            let adminData = JSON.parse(localStorage.getItem(`cache_admin_data_${adminUid}`) || "{}");
            adminData.classes = cached;
            localStorage.setItem(`cache_admin_data_${adminUid}`, JSON.stringify(adminData));
            
            await triggerAdminCacheUpdate();
            updateClassUI(cached); 
        }
        document.getElementById('newClassName').value = '';
        btn.innerText = "Add";
    } catch (error) { alert("Error adding class!"); btn.innerText = "Add"; }
});


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
        if (clsSelection !== "ALL") { setTimeout(loadAdminPublishStatus, 2000); }
    } catch(e) { alert("Error saving settings."); }
    btn.innerText = originalText;
});


async function loadPendingAdmissions() {
    const tbody = document.getElementById('pendingAdmissionsBody');
    const cacheKey = `cache_admissions_${adminUid}`;
    let admissionsArray = [];

    if (isSmartCacheValid && localStorage.getItem(cacheKey)) {
        admissionsArray = JSON.parse(localStorage.getItem(cacheKey));
    } else {
        try {
            const q = query(collection(db, "admissions"), where("madrasaUid", "==", adminUid), where("status", "==", "pending"));
            const snapshot = await getDocs(q);
            snapshot.forEach(docSnap => {
                let data = docSnap.data();
                data.id = docSnap.id;
                if(data.appliedDate) data.appliedDateStr = data.appliedDate.toDate().toISOString(); // Serialize date
                admissionsArray.push(data);
            });
            localStorage.setItem(cacheKey, JSON.stringify(admissionsArray));
        } catch(e) { console.error("Error loading admissions", e); return; }
    }
    
    tbody.innerHTML = '';
    if(admissionsArray.length === 0) return tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #7f8c8d;">No pending admissions</td></tr>';

    admissionsArray.forEach(data => {
        let displayDate = "-";
        if(data.appliedDateStr) {
            const d = new Date(data.appliedDateStr);
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
                <button class="btn-small btn-green" onclick="approveAdmission('${data.id}', '${data.name}', '${data.appliedClass}', '${data.gender}', '${data.dob}', '${data.fatherName}', '${data.place}', '${data.contactNo}', '${data.whatsappNo}')">Approve</button>
                <button class="btn-small btn-red" onclick="rejectAdmission('${data.id}')">Reject</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.approveAdmission = async (docId, name, cls, gender, dob, fatherName, place, contactNo, whatsappNo) => {
    const adNo = prompt(`Enter a new Admission Number for ${name} (Class: ${cls}):`);
    if(!adNo) return alert("Approval cancelled. Admission number is required to add the student.");
    
    try {
        await addDoc(collection(db, "students"), {
            name, admissionNo: adNo, className: cls, gender, dob, fatherName, place, contactNo, whatsappNo, madrasaUid: adminUid
        });
        await updateDoc(doc(db, "admissions", docId), { status: "approved" });
        
        await triggerAdminCacheUpdate(); // അഡ്മിൻ കാഷ് പുതുക്കുന്നു
        await triggerClassCacheUpdate(cls); // ടീച്ചറുടെ കാഷ് അപ്ഡേറ്റ് ആവാൻ നിർദ്ദേശം നൽകുന്നു
        
        alert("Student approved and successfully added to the Teacher's class list!");
        isSmartCacheValid = false;
        loadPendingAdmissions();
    } catch (e) { alert("Error approving student."); }
};

window.rejectAdmission = async (docId) => {
    if(!confirm("Are you sure you want to reject and delete this application?")) return;
    try {
        await deleteDoc(doc(db, "admissions", docId));
        await triggerAdminCacheUpdate();
        isSmartCacheValid = false;
        loadPendingAdmissions();
    } catch (e) { alert("Error rejecting application."); }
};


// 📌 TEACHERS DIRECTORY
document.getElementById('saveTeacherBtn').addEventListener('click', async () => {
    const name = document.getElementById('tName').value.trim();
    const cls = document.getElementById('tClassSelect').value;
    const phone = document.getElementById('tPhone').value.trim();
    const whatsapp = document.getElementById('tWhatsapp').value.trim();

    if(!name || !cls) return alert("Please enter Teacher Name and select a Class!");

    document.getElementById('saveTeacherBtn').innerText = "Saving...";

    try {
        await addDoc(collection(db, "teachers_directory"), {
            name: name, assignedClass: cls, phone: phone, whatsapp: whatsapp, madrasaUid: adminUid
        });
        
        await triggerAdminCacheUpdate();
        alert("Teacher details saved successfully!");
        
        document.getElementById('tName').value = '';
        document.getElementById('tClassSelect').value = '';
        document.getElementById('tPhone').value = '';
        document.getElementById('tWhatsapp').value = '';
        
        isSmartCacheValid = false;
        loadTeachersDirectory();
    } catch (error) { alert("Error saving details: " + error.message); }
    document.getElementById('saveTeacherBtn').innerText = "Save Details";
});

async function loadTeachersDirectory() {
    const tbody = document.getElementById('teacherTableBody');
    const pdfBody = document.getElementById('pdfTeachersTableBody');
    const cacheKey = `cache_teachers_${adminUid}`;
    let teachersArray = [];

    if (isSmartCacheValid && localStorage.getItem(cacheKey)) {
        teachersArray = JSON.parse(localStorage.getItem(cacheKey));
    } else {
        try {
            const q = query(collection(db, "teachers_directory"), where("madrasaUid", "==", adminUid));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                let data = doc.data();
                data.id = doc.id;
                teachersArray.push(data);
            });
            localStorage.setItem(cacheKey, JSON.stringify(teachersArray));
        } catch (error) { console.error("Error loading teachers:", error); return; }
    }
    
    tbody.innerHTML = '';
    pdfBody.innerHTML = '';
    teachersDataList = {}; 

    if(teachersArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No Teachers added yet.</td></tr>';
        return;
    }
    
    teachersArray.sort((a, b) => a.assignedClass.localeCompare(b.assignedClass, undefined, {numeric: true, sensitivity: 'base'}));

    let slNo = 1;
    teachersArray.forEach((data) => {
        teachersDataList[data.id] = data; 
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${data.name}</b></td>
            <td><span style="background:#e8f4f8; padding:3px 8px; border-radius:12px; font-size:12px; font-weight:bold;">${data.assignedClass}</span></td>
            <td>${data.phone || '-'}</td>
            <td>${data.whatsapp || '-'}</td>
            <td>
                <button class="btn-small edit-t-btn" data-id="${data.id}" style="background-color: #f39c12; margin-right: 5px;">Edit</button>
                <button class="btn-small btn-red delete-btn" data-id="${data.id}">Del</button>
            </td>
        `;
        tbody.appendChild(tr);

        const pdfTr = document.createElement('tr');
        pdfTr.innerHTML = `
            <td style="border: 1px solid #000; padding: 10px; text-align: center;">${slNo++}</td>
            <td style="border: 1px solid #000; padding: 10px;"><b>${data.name.toUpperCase()}</b></td>
            <td style="border: 1px solid #000; padding: 10px; text-align: center; font-weight: bold;">${data.assignedClass}</td>
            <td style="border: 1px solid #000; padding: 10px; text-align: center;">${data.phone || '-'}</td>
            <td style="border: 1px solid #000; padding: 10px; text-align: center;">${data.whatsapp || '-'}</td>
        `;
        pdfBody.appendChild(pdfTr);
    });

    document.querySelectorAll('.edit-t-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tId = e.target.getAttribute('data-id');
            const tData = teachersDataList[tId];
            
            document.getElementById('editTeacherId').value = tId;
            document.getElementById('editTeacherName').value = tData.name;
            document.getElementById('editTeacherPhone').value = tData.phone || '';
            document.getElementById('editTeacherWhatsapp').value = tData.whatsapp || '';

            const editSelect = document.getElementById('editTeacherClassSelect');
            editSelect.innerHTML = '<option value="">Select Assigned Class</option>';
            const cachedClasses = JSON.parse(localStorage.getItem('madrasaClasses')) || [];
            cachedClasses.forEach(cls => {
                const isSelected = (cls === tData.assignedClass) ? "selected" : "";
                editSelect.innerHTML += `<option value="${cls}" ${isSelected}>${cls}</option>`;
            });
            
            document.getElementById('editTeacherModal').classList.remove('hidden');
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tId = e.target.getAttribute('data-id');
            if(confirm("Are you sure you want to delete this teacher's details?")) { 
                await deleteDoc(doc(db, "teachers_directory", tId)); 
                await triggerAdminCacheUpdate();
                isSmartCacheValid = false;
                loadTeachersDirectory(); 
            }
        });
    });
}

document.getElementById('saveTeacherEditBtn').addEventListener('click', async () => {
    const tId = document.getElementById('editTeacherId').value;
    const newName = document.getElementById('editTeacherName').value.trim();
    const newClass = document.getElementById('editTeacherClassSelect').value;
    const newPhone = document.getElementById('editTeacherPhone').value.trim();
    const newWhatsapp = document.getElementById('editTeacherWhatsapp').value.trim();

    if(!newName || !newClass) return alert("Please fill Name and Class!");

    document.getElementById('saveTeacherEditBtn').innerText = "Saving...";
    try {
        await updateDoc(doc(db, "teachers_directory", tId), {
            name: newName, assignedClass: newClass, phone: newPhone, whatsapp: newWhatsapp
        });
        await triggerAdminCacheUpdate();
        alert("Teacher details updated successfully!");
        document.getElementById('editTeacherModal').classList.add('hidden');
        isSmartCacheValid = false;
        loadTeachersDirectory();
    } catch (error) { alert("Error updating teacher"); }
    document.getElementById('saveTeacherEditBtn').innerText = "Save Changes";
});

// 📌 Teachers PDF Download Logic
document.getElementById('downloadTeachersPdfBtn').addEventListener('click', () => {
    const area = document.getElementById('pdfTeachersArea');
    const wrapper = area.parentElement;
    
    wrapper.style.left = "0"; 

    html2canvas(area, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }).then((canvas) => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        let imgWidth = pdfWidth - 20; 
        let imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
        pdf.save(`Teachers_Directory_${madrasaNameGlobal}.pdf`); 
        
        wrapper.style.left = "-9999px"; 
    });
});


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
        let imgWidth = pdfWidth;
        let imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 10, imgWidth, imgHeight);
        pdf.save(`TC_${student.admissionNo}_${student.name}.pdf`); 
        
        wrapper.style.left = "-9999px"; 

        try {
            await deleteDoc(doc(db, "students", docId));
            const marksSnap = await getDocs(query(collection(db, "marks"), where("studentId", "==", docId)));
            marksSnap.docs.forEach(async (m) => await deleteDoc(doc(db, "marks", m.id)));
            
            await triggerClassCacheUpdate(student.className); // കുട്ടി ഒഴിവാക്കപ്പെട്ടതിനാൽ ടീച്ചറുടെ കാഷ് അപ്ഡേറ്റ് ആവാൻ നിർദ്ദേശം നൽകുന്നു
            
            document.getElementById('tcStudentDetails').innerHTML = `<p style="color:green; font-weight:bold; margin:0; padding: 20px; text-align: center;">TC Generated & Student Removed Successfully!</p>`;
        } catch (e) { alert("Error removing student from database."); }
    });
};