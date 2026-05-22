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

// ഫയർബേസ് സ്റ്റാർട്ട് ചെയ്യുന്നു
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ലോഗിൻ പേജിലെ ബട്ടണുകൾ
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMessage = document.getElementById('errorMessage');

// ലോഗിൻ ചെയ്യാനുള്ള കോഡ്
loginBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;

    if(!email || !password) {
        showError("Please enter both Email and Password!");
        return;
    }

    loginBtn.innerText = "Verifying...";
    errorMessage.style.display = "none";

    signInWithEmailAndPassword(auth, email, password)
        .then(async (userCredential) => {
            const user = userCredential.user;
            loginBtn.innerText = "Getting Data...";
            
            try {
                // ഡാറ്റാബേസിൽ നിന്നും റോൾ എടുക്കുന്നു
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    
                    // വിവരങ്ങൾ ലോക്കൽ സ്റ്റോറേജിൽ സേവ് ചെയ്യുന്നു
                    localStorage.setItem('userRole', userData.role);
                    localStorage.setItem('userEmail', userData.email);
                    
                    // ഓരോരുത്തർക്കും വേണ്ടിയുള്ള പേജിലേക്ക് മാറ്റുന്നു
                    if(userData.role === 'super_admin') {
                        window.location.href = "super_admin.html";
                    } else if (userData.role === 'admin') {
                        window.location.href = "admin_dashboard.html";
                    } else if (userData.role === 'teacher') {
                        window.location.href = "teacher_dashboard.html";
                    } else {
                        window.location.href = "parent_dashboard.html";
                    }
                } else {
                    showError("User data not found! Contact admin.");
                    auth.signOut();
                    loginBtn.innerText = "Login";
                }
            } catch (error) {
                console.error("Error:", error);
                showError("Error getting your information.");
                loginBtn.innerText = "Login";
            }
        })
        .catch((error) => {
            showError("Invalid Email or Password!");
            loginBtn.innerText = "Login";
        });
});

function showError(message) {
    errorMessage.innerText = message;
    errorMessage.style.display = "block";
}