import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// ഡാറ്റ എടുക്കാനും, മാറ്റാനും, ഡിലീറ്റ് ചെയ്യാനുമുള്ള പുതിയ ഫയർബേസ് കോഡുകൾ
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

// 1. ലോഗ് ഔട്ട് കോഡ്
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "index.html";
    });
});

// 2. പുതിയ മദ്രസ ചേർക്കാനുള്ള കോഡ്
const createBtn = document.getElementById('createMadrasaBtn');
createBtn.addEventListener('click', async () => {
    const mName = document.getElementById('mName').value;
    const mEmail = document.getElementById('mEmail').value;
    const mPassword = document.getElementById('mPassword').value;
    const mExpiryDate = document.getElementById('mExpiryDate').value;

    if(!mName || !mEmail || !mPassword) {
        alert("ദയവായി മദ്രസയുടെ പേരും ഇമെയിലും പാസ്‌വേഡും നൽകുക!");
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
            email: mEmail,
            role: "admin", 
            madrasaId: "MADRASA_" + newUid.substring(0, 5).toUpperCase(),
            expiryDate: mExpiryDate || "No Expiry", 
            status: "active"
        });

        await signOut(secondaryAuth);
        alert("Madrasa Account Created Successfully!");
        createBtn.innerText = "Create Account";
        
        // ഫോം ക്ലിയർ ചെയ്യുന്നു
        document.getElementById('mName').value = '';
        document.getElementById('mEmail').value = '';
        document.getElementById('mPassword').value = '';
        document.getElementById('mExpiryDate').value = '';

        // പുതിയ ആളെ ചേർത്ത ശേഷം ടേബിൾ റിഫ്രഷ് ചെയ്യുന്നു
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
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading data...</td></tr>';
    try {
        // അഡ്മിൻ റോൾ ഉള്ള എല്ലാവരെയും ഡാറ്റാബേസിൽ നിന്ന് വിളിക്കുന്നു
        const q = query(collection(db, "users"), where("role", "==", "admin"));
        const querySnapshot = await getDocs(q);
        
        tbody.innerHTML = '';
        if(querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No Madrasas found.</td></tr>';
            return;
        }

        // ഇന്നത്തെ തിയ്യതി എടുക്കുന്നു (കാലാവധി കഴിഞ്ഞോ എന്ന് നോക്കാൻ)
        const today = new Date().toISOString().split('T')[0];

        querySnapshot.forEach((documentSnapshot) => {
            const data = documentSnapshot.data();
            const id = documentSnapshot.id;

            // കാലാവധി കഴിഞ്ഞോ എന്ന് പരിശോധിക്കുന്നു
            let statusText = "Active";
            let statusClass = "status-active";
            
            if (data.expiryDate !== "No Expiry" && data.expiryDate < today) {
                statusText = "Expired";
                statusClass = "status-expired";
            }

            // ടേബിളിലേക്ക് ഓരോ വരിയും ചേർക്കുന്നു
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.madrasaName}</td>
                <td>${data.email}</td>
                <td>${data.expiryDate}</td>
                <td class="${statusClass}">${statusText}</td>
                <td>
                    <button class="renew-btn" data-id="${id}" style="background-color: #3498db; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 3px; font-size:12px;">Renew</button>
                    <button class="delete-btn" data-id="${id}" style="background-color: #e74c3c; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 3px; font-size:12px; margin-left: 5px;">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 4. Renew ബട്ടൺ അമർത്തുമ്പോൾ (ഒറ്റ മദ്രസയുടെ തിയ്യതി മാറ്റാൻ)
        document.querySelectorAll('.renew-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mId = e.target.getAttribute('data-id');
                const newDate = prompt("പുതിയ കാലാവധി തിയ്യതി നൽകുക (ഉദാ: 2026-12-31):");
                if(newDate) {
                    await updateDoc(doc(db, "users", mId), { expiryDate: newDate });
                    alert("Expiry Date Updated!");
                    loadMadrasas(); // ടേബിൾ റിഫ്രഷ് ചെയ്യുന്നു
                }
            });
        });

        // 5. Delete ബട്ടൺ അമർത്തുമ്പോൾ (മദ്രസയെ ഡിലീറ്റ് ചെയ്യാൻ)
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mId = e.target.getAttribute('data-id');
                if(confirm("ഈ മദ്രസയുടെ അക്കൗണ്ട് ഡിലീറ്റ് ചെയ്യണോ? പിന്നീട് അവർക്ക് ലോഗിൻ ചെയ്യാൻ സാധിക്കില്ല.")) {
                    await deleteDoc(doc(db, "users", mId));
                    alert("Madrasa Deleted Successfully!");
                    loadMadrasas(); // ടേബിൾ റിഫ്രഷ് ചെയ്യുന്നു
                }
            });
        });

    } catch (error) {
        console.error("Error loading madrasas:", error);
    }
}

// പേജ് തുറക്കുമ്പോൾ തന്നെ മദ്രസകളുടെ ലിസ്റ്റ് കാണിക്കാൻ ഈ ഫംഗ്ഷൻ വിളിക്കുന്നു
loadMadrasas();

// 6. Global Expiry Update (എല്ലാവർക്കും ഒന്നിച്ച് തിയ്യതി മാറ്റാൻ)
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
            
            // എല്ലാ അഡ്മിൻമാർക്കും പുതിയ തിയ്യതി അപ്ഡേറ്റ് ചെയ്യുന്നു
            querySnapshot.forEach(async (documentSnapshot) => {
                await updateDoc(doc(db, "users", documentSnapshot.id), { expiryDate: globalDate });
            });

            alert("All Madrasas Updated Successfully!");
            globalBtn.innerText = "Update All Madrasas";
            document.getElementById('globalExpiryDate').value = '';
            loadMadrasas(); // മാറ്റങ്ങൾ ടേബിളിൽ കാണാൻ റിഫ്രഷ് ചെയ്യുന്നു

        } catch (error) {
            console.error("Global update error:", error);
            alert("Error updating all madrasas.");
            globalBtn.innerText = "Update All Madrasas";
        }
    }
});