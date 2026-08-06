import { auth } from './firebase_core.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// സുരക്ഷിതമായ ലോഗിൻ പരിശോധന
export const checkAuth = (onSuccessCallback) => {
    const userRole = localStorage.getItem('userRole');
    
    // ഭാവിയിൽ ഇത് കസ്റ്റം ക്ലെയിംസ് (Custom Claims) ഉപയോഗിച്ച് മാറ്റാവുന്നതാണ്
    if (userRole !== 'teacher') {
        alert("Unauthorized Access! Please login as a teacher.");
        window.location.href = "index.html";
        return;
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            onSuccessCallback(user);
        } else {
            window.location.href = "index.html";
        }
    });
};

// ലോഗൗട്ട് സംവിധാനം
export const logoutUser = () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "index.html";
    }).catch((error) => {
        console.error("Logout Error:", error);
        alert("Failed to logout. Please try again.");
    });
};