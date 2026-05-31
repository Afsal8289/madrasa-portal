import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const madrasaUidFromUrl = urlParams.get('mid');

if (madrasaUidFromUrl) {
    document.getElementById("formWrapper").style.display = "block";
    loadMadrasaClasses(madrasaUidFromUrl);
} else {
    document.getElementById("invalidLinkMsg").style.display = "block";
}

// അഡ്മിൻ ഉണ്ടാക്കിയ ക്ലാസുകൾ ഡാറ്റാബേസിൽ നിന്നും എടുക്കുന്നു
async function loadMadrasaClasses(uid) {
    try {
        const adminDoc = await getDoc(doc(db, "users", uid));
        const classSelect = document.getElementById("appliedClass");
        
        if (adminDoc.exists() && adminDoc.data().classes) {
            const classes = adminDoc.data().classes;
            classSelect.innerHTML = '<option value="">-- Select Class --</option>';
            classes.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
            
            classes.forEach(c => {
                classSelect.innerHTML += `<option value="${c}">${c}</option>`;
            });
        } else {
            classSelect.innerHTML = '<option value="">No classes available</option>';
        }
    } catch (error) {
        console.error("Error fetching classes:", error);
        document.getElementById("appliedClass").innerHTML = '<option value="">Error loading classes</option>';
    }
}

document.getElementById("admissionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!madrasaUidFromUrl) return;

    const submitBtn = document.getElementById("submitBtn");
    submitBtn.textContent = "Submitting...";
    submitBtn.disabled = true;

    const rawDob = document.getElementById("dob").value;
    let formattedDob = rawDob;
    if (rawDob.includes("-")) {
        const parts = rawDob.split("-");
        formattedDob = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    const admissionData = {
        name: document.getElementById("studentName").value.trim(),
        appliedClass: document.getElementById("appliedClass").value,
        gender: document.getElementById("gender").value,
        dob: formattedDob,
        fatherName: document.getElementById("fatherName").value.trim(),
        place: document.getElementById("place").value.trim(),
        contactNo: document.getElementById("contactNo").value.trim(),
        whatsappNo: document.getElementById("whatsappNo").value.trim() || document.getElementById("contactNo").value.trim(),
        status: "pending", 
        madrasaUid: madrasaUidFromUrl,
        appliedDate: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "admissions"), admissionData);
        document.getElementById("admissionForm").style.display = "none";
        document.getElementById("successMsg").style.display = "block";
    } catch (error) {
        alert("Something went wrong. Please try again.");
        submitBtn.textContent = "Submit Application";
        submitBtn.disabled = false;
    }
});