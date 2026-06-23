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

const tMadrasaIdInput = document.getElementById('tMadrasaId');
const tMobileInput = document.getElementById('tMobile');
const tPasswordInput = document.getElementById('tPassword');
const loginTeacherBtn = document.getElementById('loginTeacherBtn');

const errorMessage = document.getElementById('errorMessage');

function showError(message) {
    errorMessage.innerText = message;
    errorMessage.style.display = "block";
}

async function handleSuccessfulLogin(user, btnElement, originalBtnText) {
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
                    btnElement.innerText = originalBtnText;
                    return;
                }
            }
            localStorage.setItem('userRole', userData.role);
            localStorage.setItem('userEmail', userData.email || user.email);
            
            if(userData.role === 'super_admin') window.location.href = "super_admin.html";
            else if (userData.role === 'admin') window.location.href = "admin_dashboard.html";
            else if (userData.role === 'teacher') window.location.href = "teacher_dashboard.html";
            else window.location.href = "index.html"; 
        } else {
            showError("User data not found! Contact admin.");
            auth.signOut();
            btnElement.innerText = originalBtnText;
        }
    } catch (error) {
        showError("Error getting your information.");
        btnElement.innerText = originalBtnText;
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
            .then((userCredential) => { handleSuccessfulLogin(userCredential.user, loginAdminBtn, "Login as Admin"); })
            .catch((error) => {
                showError("Invalid Admin Email or Password!");
                loginAdminBtn.innerText = "Login as Admin";
            });
    });
}

// 2. TEACHER LOGIN (Smart Auto-Login System)
if(loginTeacherBtn) {
    loginTeacherBtn.addEventListener('click', async () => {
        const madrasaId = tMadrasaIdInput.value.trim().toLowerCase();
        const mobile = tMobileInput.value.trim();
        const password = tPasswordInput.value;

        if(!madrasaId || !mobile || !password) return showError("Please enter Madrasa ID, Mobile Number and Password!");

        loginTeacherBtn.innerText = "Verifying...";
        errorMessage.style.display = "none";

        // ഏറ്റവും പുതിയ വേർഷനുകൾ (v8) മുതൽ താഴോട്ട് പരിശോധിച്ച് പഴയ ഡിലീറ്റ് ചെയ്ത അക്കൗണ്ടുകൾ ഒഴിവാക്കുന്നു
        const suffixes = ["v8.", "v7.", "v6.", "v5.", "v4.", "v3.", "v2.", ""];
        let loginSuccess = false;

        for (let suffix of suffixes) {
            const dummyEmail = `${mobile}@${suffix}${madrasaId}.com`;
            try {
                // ലോഗിൻ ചെയ്യാൻ ശ്രമിക്കുന്നു
                const userCredential = await signInWithEmailAndPassword(auth, dummyEmail, password);
                
                // ലോഗിൻ വിജയിച്ചാൽ, ആ അക്കൗണ്ട് ഡാറ്റാബേസിൽ (Firestore) നിലവിലുണ്ടോ എന്ന് നോക്കുന്നു (പഴയ അക്കൗണ്ട് ഒഴിവാക്കാൻ)
                const docSnap = await getDoc(doc(db, "users", userCredential.user.uid));
                
                if (docSnap.exists()) {
                    loginSuccess = true;
                    handleSuccessfulLogin(userCredential.user, loginTeacherBtn, "Login as Teacher");
                    break; // ശരിയായ അക്കൗണ്ട് കിട്ടിയാൽ ലൂപ്പ് നിർത്തുന്നു
                } else {
                    // ഇത് ഡിലീറ്റ് ചെയ്ത പഴയ അക്കൗണ്ട് ആണെങ്കിൽ, അതിൽ നിന്ന് ലോഗ് ഔട്ട് ചെയ്ത് അടുത്ത വേർഷൻ നോക്കുന്നു
                    await auth.signOut();
                }
            } catch (error) {
                continue; // എറർ വന്നാൽ അടുത്തത് നോക്കുന്നു
            }
        }

        if (!loginSuccess) {
            showError("Invalid Details! Please check your Madrasa ID, Mobile Number and Password.");
            loginTeacherBtn.innerText = "Login as Teacher";
        }
    });
}