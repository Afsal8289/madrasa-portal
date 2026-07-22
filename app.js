import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

const adminEmailInput = document.getElementById('email');
const adminPasswordInput = document.getElementById('password');
const loginAdminBtn = document.getElementById('loginAdminBtn');

const tEmailInput = document.getElementById('tEmail');
const tClassInput = document.getElementById('tClass');
const tPasswordInput = document.getElementById('tPassword');
const loginTeacherBtn = document.getElementById('loginTeacherBtn');

const errorMessage = document.getElementById('errorMessage');

function showError(message) {
    errorMessage.innerText = message;
    errorMessage.style.display = "block";
}

async function handleAdminLogin(user, btnElement) {
    btnElement.innerText = "Getting Data...";
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.role === 'admin' && userData.expiryDate && userData.expiryDate !== "No Expiry") {
                const today = new Date().toISOString().split('T')[0];
                if (userData.expiryDate < today) {
                    showError("നിങ്ങളുടെ മദ്രസയുടെ കാലാവധി അവസാനിച്ചു. ദയവായി സൂപ്പർ അഡ്മിനുമായി ബന്ധപ്പെടുക.");
                    auth.signOut();
                    btnElement.innerText = "Login as Admin";
                    return;
                }
            }
            localStorage.setItem('userRole', userData.role);
            localStorage.setItem('userEmail', userData.email || user.email);
            
            if(userData.role === 'super_admin') window.location.href = "super_admin.html";
            else if (userData.role === 'admin') window.location.href = "admin_dashboard.html";
            else {
                showError("Unauthorized Access!");
                auth.signOut();
                btnElement.innerText = "Login as Admin";
            }
        } else {
            showError("User data not found! Contact admin.");
            auth.signOut();
            btnElement.innerText = "Login as Admin";
        }
    } catch (error) {
        showError("Error getting your information.");
        btnElement.innerText = "Login as Admin";
    }
}

// 1. ADMIN LOGIN
if(loginAdminBtn) {
    loginAdminBtn.addEventListener('click', () => {
        const email = adminEmailInput.value.trim();
        const password = adminPasswordInput.value;
        if(!email || !password) return showError("Please enter Email and Password!");

        loginAdminBtn.innerText = "Verifying...";
        errorMessage.style.display = "none";

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => { handleAdminLogin(userCredential.user, loginAdminBtn); })
            .catch((error) => {
                showError("Invalid Admin Email or Password!");
                loginAdminBtn.innerText = "Login as Admin";
            });
    });
}

// 2. TEACHER LOGIN (Master Email + Class Dynamic Check)
if(loginTeacherBtn) {
    loginTeacherBtn.addEventListener('click', async () => {
        const email = tEmailInput.value.trim().toLowerCase();
        const enteredClass = tClassInput.value.trim();
        const password = tPasswordInput.value;

        if(!email || !enteredClass || !password) return showError("Please enter Email, Class and Password!");

        loginTeacherBtn.innerText = "Verifying...";
        errorMessage.style.display = "none";

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const docSnap = await getDoc(doc(db, "users", user.uid));
            
            if (docSnap.exists()) {
                const userData = docSnap.data();

                if (userData.role !== 'teacher') {
                    await auth.signOut();
                    showError("This email is not registered as a Teacher.");
                    loginTeacherBtn.innerText = "Login as Teacher";
                    return;
                }

                // ടീച്ചറുടെ മദ്രസ ഏതാണെന്ന് കണ്ടെത്തുന്നു
                const madrasaUid = userData.madrasaUid;
                const madrasaDoc = await getDoc(doc(db, "users", madrasaUid));

                if (madrasaDoc.exists()) {
                    const madrasaData = madrasaDoc.data();
                    const availableClasses = madrasaData.classes || [];

                    // അഡ്മിൻ ആ ക്ലാസ്സ് ആഡ് ചെയ്തിട്ടുണ്ടോ എന്ന് പരിശോധിക്കുന്നു
                    const isValidClass = availableClasses.some(c => c.toLowerCase() === enteredClass.toLowerCase());

                    if (!isValidClass) {
                        await auth.signOut();
                        showError(`'${enteredClass}' എന്ന ക്ലാസ്സ് നിലവിലില്ല. അഡ്മിനുമായി ബന്ധപ്പെടുക.`);
                        loginTeacherBtn.innerText = "Login as Teacher";
                        return;
                    }

                    // ലോഗിൻ വിജയിച്ചു
                    localStorage.setItem('userRole', userData.role);
                    localStorage.setItem('userEmail', userData.email || user.email);
                    localStorage.setItem('teacherCurrentClass', enteredClass); // ടൈപ്പ് ചെയ്ത ക്ലാസ്സ് സേവ് ചെയ്യുന്നു
                    window.location.href = "teacher_dashboard.html";

                } else {
                    await auth.signOut();
                    showError("Madrasa data not found.");
                    loginTeacherBtn.innerText = "Login as Teacher";
                }
            } else {
                await auth.signOut();
                showError("User data not found! Contact admin.");
                loginTeacherBtn.innerText = "Login as Teacher";
            }
        } catch (error) {
            showError("Invalid Email or Password!");
            loginTeacherBtn.innerText = "Login as Teacher";
        }
    });
}