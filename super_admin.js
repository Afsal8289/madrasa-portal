import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, getDocs, query, where, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// സെക്യൂരിറ്റി സിസ്റ്റം
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

// ഡാറ്റ സൂക്ഷിക്കാനുള്ള വേരിയബിൾ (Edit ചെയ്യാൻ വേണ്ടി)
let madrasasList = {};

// 1. ലോഗ് ഔട്ട് കോഡ്
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "index.html";
    });
});

// 2. പുതിയ മദ്രസ ചേർക്കാനുള്ള കോഡ് (ഐഡിയും സ്ഥലവും ഉൾപ്പെടെ)
const createBtn = document.getElementById('createMadrasaBtn');
createBtn.addEventListener('click', async () => {
    const mName = document.getElementById('mName').value.trim();
    const mId = document.getElementById('mId').value.trim();
    const mPlace = document.getElementById('mPlace').value.trim();
    const mEmail = document.getElementById('mEmail').value.trim();
    const mPassword = document.getElementById('mPassword').value;
    const mExpiryDate = document.getElementById('mExpiryDate').value;

    if(!mName || !mId || !mEmail || !mPassword) {
        alert("ദയവായി മദ്രസയുടെ പേരും, ഐഡിയും, ഇമെയിലും, പാസ്‌വേഡും നിർബന്ധമായും നൽകുക!");
        return;
    }
    
    createBtn.innerText = "Creating Madrasa...";

    try {
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
        const secondaryAuth = getAuth(secondaryApp);
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, mEmail, mPassword);
        const newUid = userCredential.user.uid;

        await setDoc(doc(db, "users", newUid), {
            madrasaName: mName,
            madrasaId: mId,
            place: mPlace,
            email: mEmail,
            role: "admin", 
            expiryDate: mExpiryDate || "No Expiry", 
            status: "active"
        });

        await signOut(secondaryAuth);
        alert("Madrasa Account Created Successfully!");
        createBtn.innerText = "Create Account";
        
        // ഫോം ക്ലിയർ ചെയ്യുന്നു
        document.getElementById('mName').value = '';
        document.getElementById('mId').value = '';
        document.getElementById('mPlace').value = '';
        document.getElementById('mEmail').value = '';
        document.getElementById('mPassword').value = '';
        document.getElementById('mExpiryDate').value = '';

        loadMadrasas();

    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
        createBtn.innerText = "Create Account";
    }
});

// 3. മദ്രസകളുടെ ലിസ്റ്റ് ടേബിളിൽ കാണിക്കാനുള്ള കോഡ്
const tbody = document.getElementById('madrasaTableBody');

async function loadMadrasas() {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading data...</td></tr>';
    try {
        const q = query(collection(db, "users"), where("role", "==", "admin"));
        const querySnapshot = await getDocs(q);
        
        tbody.innerHTML = '';
        madrasasList = {}; // ക്ലിയർ ചെയ്യുന്നു
        
        if(querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No Madrasas found.</td></tr>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        querySnapshot.forEach((documentSnapshot) => {
            const data = documentSnapshot.data();
            const id = documentSnapshot.id;
            madrasasList[id] = data; // Edit ചെയ്യാൻ വേണ്ടി ഡാറ്റ സേവ് ചെയ്തു വെക്കുന്നു

            let statusText = "Active";
            let statusClass = "status-active";
            
            if (data.expiryDate !== "No Expiry" && data.expiryDate < today) {
                statusText = "Expired";
                statusClass = "status-expired";
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span style="background:#e8f4f8; padding:3px 8px; border-radius:12px; font-weight:bold; color:#2980b9;">${data.madrasaId || '-'}</span></td>
                <td style="font-weight:bold;">${data.madrasaName || '-'}</td>
                <td>${data.place || '-'}</td>
                <td>${data.email}</td>
                <td>${data.expiryDate}</td>
                <td class="${statusClass}">${statusText}</td>
                <td style="white-space: nowrap;">
                    <button class="btn-small edit-btn" data-id="${id}">Edit</button>
                    <button class="btn-small delete-btn" data-id="${id}" style="background-color: #e74c3c;">Del</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Edit ബട്ടൺ അമർത്തുമ്പോൾ Modal ഓപ്പൺ ആകാൻ
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mId = e.target.getAttribute('data-id');
                const mData = madrasasList[mId];
                
                document.getElementById('editUid').value = mId;
                document.getElementById('editName').value = mData.madrasaName || "";
                document.getElementById('editId').value = mData.madrasaId || "";
                document.getElementById('editPlace').value = mData.place || "";
                document.getElementById('editExpiry').value = mData.expiryDate !== "No Expiry" ? mData.expiryDate : "";
                
                document.getElementById('editModal').classList.remove('hidden');
            });
        });

        // Delete ബട്ടൺ അമർത്തുമ്പോൾ
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mId = e.target.getAttribute('data-id');
                if(confirm("ഈ മദ്രസയുടെ അക്കൗണ്ട് പൂർണ്ണമായും ഡിലീറ്റ് ചെയ്യണോ?")) {
                    await deleteDoc(doc(db, "users", mId));
                    alert("Madrasa Deleted Successfully!");
                    loadMadrasas(); 
                }
            });
        });

    } catch (error) {
        console.error("Error loading madrasas:", error);
    }
}

// 4. Edit ചെയ്ത വിവരങ്ങൾ സേവ് ചെയ്യാൻ
document.getElementById('saveEditBtn').addEventListener('click', async () => {
    const uid = document.getElementById('editUid').value;
    const newName = document.getElementById('editName').value.trim();
    const newId = document.getElementById('editId').value.trim();
    const newPlace = document.getElementById('editPlace').value.trim();
    const newExpiry = document.getElementById('editExpiry').value || "No Expiry";

    if(!newName || !newId) {
        return alert("Madrasa Name ഉം ID ഉം നിർബന്ധമാണ്!");
    }

    document.getElementById('saveEditBtn').innerText = "Saving...";

    try {
        await updateDoc(doc(db, "users", uid), {
            madrasaName: newName,
            madrasaId: newId,
            place: newPlace,
            expiryDate: newExpiry
        });
        
        document.getElementById('editModal').classList.add('hidden');
        alert("മദ്രസയുടെ വിവരങ്ങൾ വിജയകരമായി അപ്ഡേറ്റ് ചെയ്തു!");
        loadMadrasas(); // ടേബിൾ റിഫ്രഷ് ചെയ്യുന്നു
    } catch(e) {
        alert("Error updating details.");
    }
    
    document.getElementById('saveEditBtn').innerText = "Save Changes";
});

// പേജ് തുറക്കുമ്പോൾ തന്നെ മദ്രസകളുടെ ലിസ്റ്റ് കാണിക്കാൻ
loadMadrasas();

// 5. Global Expiry Update (എല്ലാവർക്കും ഒന്നിച്ച് തിയ്യതി മാറ്റാൻ)
const globalBtn = document.getElementById('updateGlobalBtn');
globalBtn.addEventListener('click', async () => {
    const globalDate = document.getElementById('globalExpiryDate').value;
    
    if(!globalDate) {
        alert("ദയവായി പുതിയ തിയ്യതി സെലക്ട് ചെയ്യുക!");
        return;
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
            globalBtn.innerText = "Update All Madrasas";
            document.getElementById('globalExpiryDate').value = '';
            loadMadrasas(); 

        } catch (error) {
            console.error("Global update error:", error);
            alert("Error updating all madrasas.");
            globalBtn.innerText = "Update All Madrasas";
        }
    }
});