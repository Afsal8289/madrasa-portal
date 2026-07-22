import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, getDocs, query, where, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// സെക്യൂരിറ്റി സിസ്റ്റം (Super Admin മാത്രം)
const userRole = localStorage.getItem('userRole');
if (userRole !== 'super_admin') {
    alert("Unauthorized Access! Please login as Super Admin.");
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

let activeMadrasasList = {};
let pendingMadrasasList = {};

// 1. ലോഗ് ഔട്ട്
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "index.html";
    });
});

// പുതിയ അക്കൗണ്ടുകൾ ഉണ്ടാക്കാനുള്ള ഹെൽപ്പർ ഫംഗ്ഷൻ
async function createAuthAccount(email, password) {
    const tempApp = initializeApp(firebaseConfig, "TempApp" + Date.now());
    const tempAuth = getAuth(tempApp);
    const userCred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const uid = userCred.user.uid;
    await signOut(tempAuth);
    return uid;
}

// പാസ്‌വേർഡും ഇമെയിലും അപ്ഡേറ്റ് ചെയ്യാനുള്ള സ്മാർട്ട് ഹെൽപ്പർ ഫംഗ്ഷൻ
async function updateAuthCredentials(oldEmail, oldPassFromDB, newEmail, newPassFromInput) {
    if(!oldEmail) return; // പഴയ ഈമെയിൽ ഇല്ലെങ്കിൽ ഒന്നും ചെയ്യേണ്ടതില്ല
    if(oldEmail === newEmail && oldPassFromDB === newPassFromInput) return; 
    
    const tempApp = initializeApp(firebaseConfig, "TempAuthUpdate" + Date.now());
    const tempAuth = getAuth(tempApp);
    
    let authenticatedUser = null;
    let actualCurrentPass = oldPassFromDB;

    try {
        if (actualCurrentPass) {
            const userCred = await signInWithEmailAndPassword(tempAuth, oldEmail, actualCurrentPass);
            authenticatedUser = userCred.user;
        } else {
            try {
                const userCred = await signInWithEmailAndPassword(tempAuth, oldEmail, newPassFromInput);
                authenticatedUser = userCred.user;
                actualCurrentPass = newPassFromInput; 
            } catch (err) {
                actualCurrentPass = prompt(`'${oldEmail}' ന്റെ പഴയ പാസ്‌വേർഡ് ഡാറ്റാബേസിൽ ലഭ്യമല്ല. പാസ്‌വേർഡ് മാറ്റാൻ ദയവായി നിലവിലെ പഴയ പാസ്‌വേർഡ് ടൈപ്പ് ചെയ്യുക:`);
                if (!actualCurrentPass) throw new Error("Update Cancelled!");
                const userCred = await signInWithEmailAndPassword(tempAuth, oldEmail, actualCurrentPass);
                authenticatedUser = userCred.user;
            }
        }

        if(oldEmail !== newEmail) {
            await updateEmail(authenticatedUser, newEmail);
        }
        if(actualCurrentPass !== newPassFromInput) {
            await updatePassword(authenticatedUser, newPassFromInput);
        }
        await signOut(tempAuth);
        
    } catch(e) {
        console.error("Auth update failed", e);
        throw new Error(`Failed to update login details for ${oldEmail}. Please check if the password is correct.`);
    }
}

// 2. പുതിയ മദ്രസ നേരിട്ട് ചേർക്കാനുള്ള കോഡ് (Manual Creation)
const createBtn = document.getElementById('createMadrasaBtn');
createBtn.addEventListener('click', async () => {
    const mName = document.getElementById('mName').value.trim();
    const mId = document.getElementById('mId').value.trim();
    const mPlace = document.getElementById('mPlace').value.trim();
    const mAdminEmail = document.getElementById('mAdminEmail').value.trim().toLowerCase();
    const mAdminPassword = document.getElementById('mAdminPassword').value;
    const mTeacherEmail = document.getElementById('mTeacherEmail').value.trim().toLowerCase();
    const mTeacherPassword = document.getElementById('mTeacherPassword').value;
    const mExpiryDate = document.getElementById('mExpiryDate').value;

    if(!mName || !mId || !mAdminEmail || !mAdminPassword || !mTeacherEmail || !mTeacherPassword) {
        return alert("ദയവായി എല്ലാ വിവരങ്ങളും (Admin & Teacher Details) നിർബന്ധമായും നൽകുക!");
    }
    
    createBtn.innerText = "Creating Accounts...";
    createBtn.disabled = true;

    try {
        const adminUid = await createAuthAccount(mAdminEmail, mAdminPassword);
        const teacherUid = await createAuthAccount(mTeacherEmail, mTeacherPassword);

        await setDoc(doc(db, "users", adminUid), {
            madrasaName: mName,
            madrasaId: mId,
            place: mPlace,
            email: mAdminEmail,
            adminPassword: mAdminPassword, 
            masterTeacherEmail: mTeacherEmail,
            masterTeacherPassword: mTeacherPassword,
            masterTeacherUid: teacherUid,
            role: "admin", 
            expiryDate: mExpiryDate || "No Expiry", 
            status: "active"
        });

        await setDoc(doc(db, "users", teacherUid), {
            name: "Master Teacher",
            email: mTeacherEmail,
            role: "teacher",
            assignedClass: [], 
            madrasaUid: adminUid
        });

        alert("Madrasa (Admin & Master Teacher) Created Successfully!");
        
        ['mName', 'mId', 'mPlace', 'mAdminEmail', 'mAdminPassword', 'mTeacherEmail', 'mTeacherPassword', 'mExpiryDate'].forEach(id => document.getElementById(id).value = '');
        
        loadActiveMadrasas();

    } catch (error) {
        alert("Error: " + error.message);
    }
    createBtn.innerText = "Create Accounts (Admin & Teacher)";
    createBtn.disabled = false;
});

// 3. Pending ആയ രജിസ്ട്രേഷനുകൾ ലോഡ് ചെയ്യാൻ
async function loadPendingRegistrations() {
    const tbody = document.getElementById('pendingTableBody');
    const countBadge = document.getElementById('pendingCount');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading data...</td></tr>';
    
    try {
        const q = query(collection(db, "pending_registrations"));
        const querySnapshot = await getDocs(q);
        
        tbody.innerHTML = '';
        pendingMadrasasList = {}; 
        let count = 0;
        
        if(querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color:#7f8c8d;">No pending registrations found.</td></tr>';
            countBadge.innerText = "0";
            return;
        }

        querySnapshot.forEach((documentSnapshot) => {
            const data = documentSnapshot.data();
            const id = documentSnapshot.id;
            pendingMadrasasList[id] = data; 
            count++;

            const displayDate = data.timestamp ? new Date(data.timestamp).toLocaleDateString() : "-";

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${displayDate}</td>
                <td style="font-weight:bold; color:#2c3e50;">${data.madrasaName}</td>
                <td><span style="font-weight:bold;">${data.madrasaId}</span><br><small>${data.place}</small></td>
                <td>${data.adminEmail}<br><small style="color:#666;">Pass: ${data.adminPassword}</small></td>
                <td>${data.teacherEmail}<br><small style="color:#666;">Pass: ${data.teacherPassword}</small></td>
                <td style="white-space: nowrap;">
                    <button class="btn-small edit-pending-btn" data-id="${id}" style="background-color: #f39c12;">Review & Approve</button>
                    <button class="btn-small delete-pending-btn" data-id="${id}" style="background-color: #e74c3c;">Reject</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        countBadge.innerText = count;

        document.querySelectorAll('.edit-pending-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mId = e.target.getAttribute('data-id');
                const mData = pendingMadrasasList[mId];
                
                document.getElementById('editStatus').value = "Pending";
                document.getElementById('editUid').value = mId;
                document.getElementById('editName').value = mData.madrasaName || "";
                document.getElementById('editId').value = mData.madrasaId || "";
                document.getElementById('editPlace').value = mData.place || "";
                document.getElementById('editAdminEmail').value = mData.adminEmail || "";
                document.getElementById('editAdminPassword').value = mData.adminPassword || "";
                document.getElementById('editTeacherEmail').value = mData.teacherEmail || "";
                document.getElementById('editTeacherPassword').value = mData.teacherPassword || "";
                document.getElementById('editExpiry').value = "";
                
                document.getElementById('editModal').classList.remove('hidden');
            });
        });

        document.querySelectorAll('.delete-pending-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mId = e.target.getAttribute('data-id');
                if(confirm("ഈ അപേക്ഷ നിരസിക്കുകയാണോ? (Reject Request)")) {
                    await deleteDoc(doc(db, "pending_registrations", mId));
                    loadPendingRegistrations(); 
                }
            });
        });

    } catch (error) {
        console.error("Error loading pending:", error);
    }
}

// 4. നിലവിലുള്ള Active മദ്രസകൾ ലോഡ് ചെയ്യാൻ
async function loadActiveMadrasas() {
    const tbody = document.getElementById('madrasaTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading data...</td></tr>';
    
    try {
        const q = query(collection(db, "users"), where("role", "==", "admin"));
        const querySnapshot = await getDocs(q);
        
        tbody.innerHTML = '';
        activeMadrasasList = {}; 
        
        if(querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No Active Madrasas found.</td></tr>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        querySnapshot.forEach((documentSnapshot) => {
            const data = documentSnapshot.data();
            const id = documentSnapshot.id;
            activeMadrasasList[id] = data; 

            let statusText = "Active";
            let statusClass = "status-active";
            
            if (data.expiryDate !== "No Expiry" && data.expiryDate < today) {
                statusText = "Expired";
                statusClass = "status-expired";
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span style="background:#e8f4f8; padding:3px 8px; border-radius:12px; font-weight:bold; color:#2980b9;">${data.madrasaId || '-'}</span></td>
                <td><span style="font-weight:bold; color:#2c3e50;">${data.madrasaName || '-'}</span><br><small>${data.place || '-'}</small></td>
                <td>${data.email}<br><small style="color:#666;">Pass: ${data.adminPassword || '-'}</small></td>
                <td>${data.masterTeacherEmail || '-'}<br><small style="color:#666;">Pass: ${data.masterTeacherPassword || '-'}</small></td>
                <td>${data.expiryDate}</td>
                <td class="${statusClass}">${statusText}</td>
                <td style="white-space: nowrap;">
                    <button class="btn-small edit-active-btn" data-id="${id}" style="background-color: #3498db;">Edit Data</button>
                    <button class="btn-small delete-active-btn" data-id="${id}" data-tuid="${data.masterTeacherUid}" style="background-color: #e74c3c;">Del</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.edit-active-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mId = e.target.getAttribute('data-id');
                const mData = activeMadrasasList[mId];
                
                document.getElementById('editStatus').value = "Active";
                document.getElementById('editUid').value = mId;
                document.getElementById('editName').value = mData.madrasaName || "";
                document.getElementById('editId').value = mData.madrasaId || "";
                document.getElementById('editPlace').value = mData.place || "";
                document.getElementById('editAdminEmail').value = mData.email || "";
                document.getElementById('editAdminPassword').value = mData.adminPassword || "";
                document.getElementById('editTeacherEmail').value = mData.masterTeacherEmail || "";
                document.getElementById('editTeacherPassword').value = mData.masterTeacherPassword || "";
                document.getElementById('editExpiry').value = mData.expiryDate !== "No Expiry" ? mData.expiryDate : "";
                
                document.getElementById('editModal').classList.remove('hidden');
            });
        });

        // Active മദ്രസ ഡിലീറ്റ് ചെയ്യാൻ (മുഴുവൻ ഡാറ്റയും ഉൾപ്പെടെ)
        document.querySelectorAll('.delete-active-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mId = e.target.getAttribute('data-id');
                const tUid = e.target.getAttribute('data-tuid');
                
                if(confirm("മുന്നറിയിപ്പ്: ഈ മദ്രസയുടെ അക്കൗണ്ടും അവർ ആഡ് ചെയ്ത വിദ്യാർത്ഥികൾ, ഉസ്താദുമാർ, മാർക്കുകൾ ഉൾപ്പെടെയുള്ള മുഴുവൻ ഡാറ്റയും പൂർണ്ണമായും ഡിലീറ്റ് ചെയ്യണോ? (ഇത് പിന്നീട് തിരിച്ചെടുക്കാൻ കഴിയില്ല!)")) {
                    
                    const btnElement = e.target;
                    btnElement.innerText = "Deleting...";
                    btnElement.disabled = true;

                    try {
                        await deleteDoc(doc(db, "users", mId)); 
                        if(tUid && tUid !== "undefined") {
                            await deleteDoc(doc(db, "users", tUid)); 
                        }

                        const collectionsToDelete = ["students", "marks", "teachers_directory", "admissions", "publish_settings", "result_cache"];
                        
                        for (const colName of collectionsToDelete) {
                            const q = query(collection(db, colName), where("madrasaUid", "==", mId));
                            const snapshot = await getDocs(q);
                            
                            const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, colName, docSnap.id)));
                            await Promise.all(deletePromises);
                        }

                        alert("മദ്രസയും അവർ ആഡ് ചെയ്ത മുഴുവൻ ഡാറ്റകളും വിജയകരമായി ഡിലീറ്റ് ചെയ്തു!");
                        loadActiveMadrasas(); 
                        
                    } catch (error) {
                        console.error("Error deleting data: ", error);
                        alert("Error deleting madrasa data.");
                        btnElement.innerText = "Del";
                        btnElement.disabled = false;
                    }
                }
            });
        });

    } catch (error) {
        console.error("Error loading madrasas:", error);
    }
}

// 5. Modal വഴി Edit / Approve സേവ് ചെയ്യാനുള്ള മെയിൻ കോഡ്
document.getElementById('saveEditBtn').addEventListener('click', async () => {
    const editStatus = document.getElementById('editStatus').value;
    const uid = document.getElementById('editUid').value; 
    
    const newName = document.getElementById('editName').value.trim();
    const newId = document.getElementById('editId').value.trim();
    const newPlace = document.getElementById('editPlace').value.trim();
    const newAdminEmail = document.getElementById('editAdminEmail').value.trim().toLowerCase();
    const newAdminPass = document.getElementById('editAdminPassword').value;
    const newTeacherEmail = document.getElementById('editTeacherEmail').value.trim().toLowerCase();
    const newTeacherPass = document.getElementById('editTeacherPassword').value;
    const newExpiry = document.getElementById('editExpiry').value || "No Expiry";

    if(!newName || !newId || !newAdminEmail || !newAdminPass || !newTeacherEmail || !newTeacherPass) {
        return alert("ദയവായി പേര്, ഐഡി, ഇമെയിലുകൾ, പാസ്‌വേർഡുകൾ എന്നിവ നിർബന്ധമായും നൽകുക!");
    }

    const btn = document.getElementById('saveEditBtn');
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        if (editStatus === "Pending") {
            const adminUid = await createAuthAccount(newAdminEmail, newAdminPass);
            const teacherUid = await createAuthAccount(newTeacherEmail, newTeacherPass);

            await setDoc(doc(db, "users", adminUid), {
                madrasaName: newName, madrasaId: newId, place: newPlace,
                email: newAdminEmail, adminPassword: newAdminPass,
                masterTeacherEmail: newTeacherEmail, masterTeacherPassword: newTeacherPass, masterTeacherUid: teacherUid,
                role: "admin", expiryDate: newExpiry, status: "active"
            });

            await setDoc(doc(db, "users", teacherUid), {
                name: "Master Teacher", email: newTeacherEmail, role: "teacher",
                assignedClass: [], 
                madrasaUid: adminUid
            });

            await deleteDoc(doc(db, "pending_registrations", uid));
            alert("Registration Approved & Accounts Created!");

        } else if (editStatus === "Active") {
            const oldData = activeMadrasasList[uid];
            let teacherUid = oldData.masterTeacherUid;
            
            // 1. അഡ്മിൻ അക്കൗണ്ട് അപ്ഡേറ്റ്
            if (oldData.email && (oldData.email !== newAdminEmail || oldData.adminPassword !== newAdminPass)) {
                await updateAuthCredentials(oldData.email, oldData.adminPassword, newAdminEmail, newAdminPass);
            }

            // 2. ടീച്ചർ അക്കൗണ്ട് അപ്ഡേറ്റ് (അല്ലെങ്കിൽ പഴയ മദ്രസ ആണെങ്കിൽ പുതിയത് ഉണ്ടാക്കുന്നു)
            if (!teacherUid || !oldData.masterTeacherEmail) {
                // പഴയ മദ്രസയാണ്, മുൻപ് ടീച്ചർ അക്കൗണ്ട് ഇല്ലായിരുന്നെങ്കിൽ പുതിയത് ഉണ്ടാക്കുന്നു
                teacherUid = await createAuthAccount(newTeacherEmail, newTeacherPass);
                await setDoc(doc(db, "users", teacherUid), {
                    name: "Master Teacher", email: newTeacherEmail, role: "teacher",
                    assignedClass: [], madrasaUid: uid
                });
            } else {
                // നിലവിലുള്ള ടീച്ചർ അക്കൗണ്ട് അപ്ഡേറ്റ് ചെയ്യുന്നു
                if (oldData.masterTeacherEmail !== newTeacherEmail || oldData.masterTeacherPassword !== newTeacherPass) {
                    await updateAuthCredentials(oldData.masterTeacherEmail, oldData.masterTeacherPassword, newTeacherEmail, newTeacherPass);
                }
                // ടീച്ചർ ഡോക്യുമെന്റിൽ ഈമെയിൽ പുതുക്കുന്നു
                await updateDoc(doc(db, "users", teacherUid), {
                    email: newTeacherEmail
                });
            }

            // 3. അഡ്മിൻ ഡോക്യുമെന്റിൽ എല്ലാ വിവരങ്ങളും പുതുക്കുന്നു
            await updateDoc(doc(db, "users", uid), {
                madrasaName: newName, madrasaId: newId, place: newPlace,
                email: newAdminEmail, adminPassword: newAdminPass,
                masterTeacherEmail: newTeacherEmail, masterTeacherPassword: newTeacherPass,
                masterTeacherUid: teacherUid,
                expiryDate: newExpiry
            });
            
            alert("Madrasa Data & Passwords Updated Successfully!");
        }
        
        document.getElementById('editModal').classList.add('hidden');
        loadPendingRegistrations();
        loadActiveMadrasas();
        
    } catch(e) {
        alert(e.message);
    }
    
    btn.innerText = "Save Changes";
    btn.disabled = false;
});

// 6. Global Expiry Update
const globalBtn = document.getElementById('updateGlobalBtn');
globalBtn.addEventListener('click', async () => {
    const globalDate = document.getElementById('globalExpiryDate').value;
    
    if(!globalDate) {
        return alert("ദയവായി പുതിയ തിയ്യതി സെലക്ട് ചെയ്യുക!");
    }

    if(confirm(`എല്ലാ മദ്രസകളുടെയും കാലാവധി ${globalDate} ലേക്ക് മാറ്റണോ?`)) {
        globalBtn.innerText = "Updating...";
        try {
            const q = query(collection(db, "users"), where("role", "==", "admin"));
            const querySnapshot = await getDocs(q);
            
            querySnapshot.forEach(async (documentSnapshot) => {
                await updateDoc(doc(db, "users", documentSnapshot.id), { expiryDate: globalDate });
            });

            alert("All Madrasas Updated Successfully!");
            document.getElementById('globalExpiryDate').value = '';
            loadActiveMadrasas(); 

        } catch (error) {
            alert("Error updating all madrasas.");
        }
        globalBtn.innerText = "Update All Madrasas";
    }
});

// പേജ് തുടങ്ങുമ്പോൾ ഡാറ്റ ലോഡ് ചെയ്യുന്നു
loadPendingRegistrations();
loadActiveMadrasas();