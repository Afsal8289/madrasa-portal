import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDoc, doc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let madrasaIdFromUrl = urlParams.get('mid');

let actualAdminUid = null;

if (madrasaIdFromUrl) {
    verifyAndLoadMadrasa(madrasaIdFromUrl);
} else {
    document.getElementById("invalidLinkMsg").style.display = "block";
}

async function verifyAndLoadMadrasa(mid) {
    try {
        mid = String(mid).trim(); // സ്പേസുകൾ ഉണ്ടെങ്കിൽ ഒഴിവാക്കാൻ
        const formWrapper = document.getElementById("formWrapper");
        const invalidMsg = document.getElementById("invalidLinkMsg");
        const classSelect = document.getElementById("appliedClass");
        
        let adminDocSnap = null;

        // 1. ഫയർബേസിന്റെ യഥാർത്ഥ വലിയ UID ആണോ എന്ന് ആദ്യം നോക്കുന്നു
        if (mid.length > 15) {
            const directDoc = await getDoc(doc(db, "users", mid));
            if (directDoc.exists() && directDoc.data().classes) {
                actualAdminUid = mid;
                adminDocSnap = directDoc;
            }
        }

        // 2. അല്ലായെങ്കിൽ ചെറിയ മദ്രസ ഐഡി (ഉദാ: kas01 അല്ലെങ്കിൽ 1234) ഡാറ്റാബേസിൽ തിരയുന്നു
        if (!actualAdminUid) {
            const variations = [mid, mid.toUpperCase(), mid.toLowerCase()];
            if (!isNaN(mid) && mid !== "") {
                variations.push(Number(mid)); // നമ്പറുകൾ മാത്രം ആണെങ്കിൽ അതും തിരിച്ചറിയാൻ
            }
            const uniqueVariations = [...new Set(variations)];

            for (let v of uniqueVariations) {
                const q = query(collection(db, "users"), where("madrasaId", "==", v));
                const querySnapshot = await getDocs(q);
                
                if (!querySnapshot.empty) {
                    // അധ്യാപകരുടെ ഐഡി വരാതിരിക്കാൻ 'classes' ഉള്ള അഡ്മിൻ ഡോക്യുമെൻ്റ് തന്നെയാണോ എന്ന് ഉറപ്പാക്കുന്നു
                    const adminDoc = querySnapshot.docs.find(d => d.data().classes);
                    if (adminDoc) {
                        actualAdminUid = adminDoc.id;
                        adminDocSnap = adminDoc;
                        break;
                    }
                }
            }
        }

        // 3. അഡ്മിനെ കണ്ടെത്തിയാൽ ക്ലാസുകൾ ഡ്രോപ്പ്ഡൗണിലേക്ക് നൽകുന്നു
        if (actualAdminUid && adminDocSnap) {
            formWrapper.style.display = "block";
            if (invalidMsg) invalidMsg.style.display = "none";
            
            const data = adminDocSnap.data();
            if (data.classes && Array.isArray(data.classes) && data.classes.length > 0) {
                const classes = data.classes;
                classSelect.innerHTML = '<option value="">-- Select Class --</option>';
                classes.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
                classes.forEach(c => {
                    classSelect.innerHTML += `<option value="${c}">${c}</option>`;
                });
            } else {
                classSelect.innerHTML = '<option value="">No classes available (Admin has not added classes)</option>';
            }
        } else {
            // ഐഡി തെറ്റാണെങ്കിൽ ഫോം കാണിക്കില്ല
            formWrapper.style.display = "none";
            if (invalidMsg) invalidMsg.style.display = "block";
        }
        
    } catch (error) {
        console.error("Error verifying ID:", error);
        document.getElementById("formWrapper").style.display = "none";
        if (document.getElementById("invalidLinkMsg")) {
            document.getElementById("invalidLinkMsg").style.display = "block";
        }
    }
}

document.getElementById("admissionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!actualAdminUid) return;

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
        madrasaUid: actualAdminUid, // യഥാർത്ഥ ഫയർബേസ് ഐഡി തന്നെ സേവ് ആകുന്നു
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