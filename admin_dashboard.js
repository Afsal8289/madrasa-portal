import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, deleteField, collection, getDocs, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "index.html";
    });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        adminUid = user.uid;
        loadMadrasaData(); 
        loadTeachers();    
    }
});

// 1. Load Madrasa Data, Classes, and Subjects
async function loadMadrasaData() {
    const cachedClasses = JSON.parse(localStorage.getItem('madrasaClasses'));
    const cachedClassSubjects = JSON.parse(localStorage.getItem('madrasaClassSubjects'));
    const cachedName = localStorage.getItem('madrasaName');

    if(cachedName) document.getElementById('madrasaNameDisplay').innerText = cachedName;
    if(cachedClasses) updateClassUI(cachedClasses);

    try {
        const docRef = doc(db, "users", adminUid);
        const docSnap = await getDoc(docRef);
        
        if(docSnap.exists()) {
            const data = docSnap.data();
            madrasaIdCode = data.madrasaId; 
            document.getElementById('madrasaNameDisplay').innerText = data.madrasaName;
            localStorage.setItem('madrasaName', data.madrasaName); 

            const classes = data.classes || []; 
            localStorage.setItem('madrasaClasses', JSON.stringify(classes)); 
            
            const classSubjects = data.classSubjects || {};
            localStorage.setItem('madrasaClassSubjects', JSON.stringify(classSubjects));
            
            updateClassUI(classes);
        }
    } catch (error) {
        console.error("Error fetching madrasa data:", error);
    }
}

// ------------------- CLASSES SECTION -------------------

function updateClassUI(classes) {
    classes.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
    const tClassSelect = document.getElementById('tClass');
    const subjectClassSelect = document.getElementById('subjectClassSelect');
    const listContainer = document.getElementById('classListContainer');

    tClassSelect.innerHTML = '<option value="">Select a Class</option>';
    subjectClassSelect.innerHTML = '<option value="">Select a class first</option>';
    listContainer.innerHTML = '';

    if (classes.length === 0) {
        listContainer.innerHTML = '<span style="color: #888; font-size: 13px;">No classes added yet.</span>';
        return;
    }

    classes.forEach(cls => {
        tClassSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        subjectClassSelect.innerHTML += `<option value="${cls}">${cls}</option>`; 
        
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

    const selectedCls = subjectClassSelect.value;
    if(selectedCls) renderSubjectsForClass(selectedCls);
}

async function deleteClass(className) {
    try {
        await updateDoc(doc(db, "users", adminUid), { 
            classes: arrayRemove(className),
            [`classSubjects.${className}`]: deleteField() 
        });
        
        let cachedClasses = JSON.parse(localStorage.getItem('madrasaClasses')) || [];
        cachedClasses = cachedClasses.filter(c => c !== className);
        localStorage.setItem('madrasaClasses', JSON.stringify(cachedClasses));
        
        let classSubjects = JSON.parse(localStorage.getItem('madrasaClassSubjects')) || {};
        delete classSubjects[className];
        localStorage.setItem('madrasaClassSubjects', JSON.stringify(classSubjects));

        updateClassUI(cachedClasses);
        
        document.getElementById('newSubjectName').disabled = true;
        document.getElementById('addSubjectBtn').disabled = true;
        document.getElementById('subjectListContainer').innerHTML = '<span style="color: #888; font-size: 13px;">Subjects will appear here when you select a class above...</span>';

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
            updateClassUI(cached); 
        }
        document.getElementById('newClassName').value = '';
        btn.innerText = "Add";
    } catch (error) { alert("Error adding class!"); btn.innerText = "Add"; }
});

// ------------------- SUBJECTS SECTION (Class-wise) -------------------

document.getElementById('subjectClassSelect').addEventListener('change', (e) => {
    const cls = e.target.value;
    const input = document.getElementById('newSubjectName');
    const btn = document.getElementById('addSubjectBtn');
    
    if(cls) {
        input.disabled = false;
        btn.disabled = false;
        renderSubjectsForClass(cls);
    } else {
        input.disabled = true;
        btn.disabled = true;
        document.getElementById('subjectListContainer').innerHTML = '<span style="color: #888; font-size: 13px;">Subjects will appear here when you select a class above...</span>';
    }
});

function renderSubjectsForClass(className) {
    let classSubjects = JSON.parse(localStorage.getItem('madrasaClassSubjects')) || {};
    let subjects = classSubjects[className] || [];
    const container = document.getElementById('subjectListContainer');
    container.innerHTML = '';

    if(subjects.length === 0) {
        container.innerHTML = `<span style="color: #888; font-size: 13px;">No subjects added for ${className}.</span>`;
        return;
    }

    subjects.forEach(sub => {
        const div = document.createElement('div');
        div.className = 'subject-tag';
        div.innerHTML = `${sub} <div class="tag-close subject-close" data-subject="${sub}" data-class="${className}">x</div>`;
        container.appendChild(div);
    });

    document.querySelectorAll('.subject-close').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const sub = e.target.getAttribute('data-subject');
            const cls = e.target.getAttribute('data-class');
            if(confirm(`Are you sure you want to delete '${sub}'?`)) {
                await deleteSubject(cls, sub);
            }
        });
    });
}

async function deleteSubject(className, subjectName) {
    try {
        await updateDoc(doc(db, "users", adminUid), {
            [`classSubjects.${className}`]: arrayRemove(subjectName)
        });
        
        let classSubjects = JSON.parse(localStorage.getItem('madrasaClassSubjects')) || {};
        if (classSubjects[className]) {
            classSubjects[className] = classSubjects[className].filter(s => s !== subjectName);
            localStorage.setItem('madrasaClassSubjects', JSON.stringify(classSubjects));
        }
        renderSubjectsForClass(className);
    } catch (error) { alert("Error deleting subject!"); }
}

document.getElementById('addSubjectBtn').addEventListener('click', async () => {
    const cls = document.getElementById('subjectClassSelect').value;
    const sub = document.getElementById('newSubjectName').value.trim();
    if(!cls || !sub) return alert("Please provide both Class and Subject!");

    const btn = document.getElementById('addSubjectBtn');
    btn.innerText = "Adding...";
    try {
        await updateDoc(doc(db, "users", adminUid), {
            [`classSubjects.${cls}`]: arrayUnion(sub)
        });
        
        let classSubjects = JSON.parse(localStorage.getItem('madrasaClassSubjects')) || {};
        if(!classSubjects[cls]) classSubjects[cls] = [];
        if(!classSubjects[cls].includes(sub)) {
            classSubjects[cls].push(sub);
        }
        localStorage.setItem('madrasaClassSubjects', JSON.stringify(classSubjects));
        
        document.getElementById('newSubjectName').value = '';
        btn.innerText = "Add";
        renderSubjectsForClass(cls);
    } catch (error) { alert("Error adding subject!"); btn.innerText = "Add"; }
});


// ------------------- TEACHERS SECTION -------------------
const createBtn = document.getElementById('createTeacherBtn');
createBtn.addEventListener('click', async () => {
    const tName = document.getElementById('tName').value;
    const tEmail = document.getElementById('tEmail').value;
    const tPassword = document.getElementById('tPassword').value;
    const tClass = document.getElementById('tClass').value;

    if(!tName || !tEmail || !tPassword || !tClass) return alert("Please fill in all details!");
    createBtn.innerText = "Adding...";

    try {
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
        const secondaryAuth = getAuth(secondaryApp);
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, tEmail, tPassword);
        const newUid = userCredential.user.uid;

        await setDoc(doc(db, "users", newUid), {
            name: tName, email: tEmail, role: "teacher", assignedClass: tClass, madrasaUid: adminUid, madrasaId: madrasaIdCode
        });

        await signOut(secondaryAuth);
        alert("Teacher Added Successfully!");
        createBtn.innerText = "Add Teacher";
        
        document.getElementById('tName').value = ''; document.getElementById('tEmail').value = '';
        document.getElementById('tPassword').value = ''; document.getElementById('tClass').value = '';
        loadTeachers(); 
    } catch (error) { alert("Error: " + error.message); createBtn.innerText = "Add Teacher"; }
});

async function loadTeachers() {
    const tbody = document.getElementById('teacherTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading data...</td></tr>';
    try {
        const q = query(collection(db, "users"), where("role", "==", "teacher"), where("madrasaUid", "==", adminUid));
        const querySnapshot = await getDocs(q);
        
        tbody.innerHTML = '';
        if(querySnapshot.empty) return tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No Teachers added yet.</td></tr>';

        querySnapshot.forEach((documentSnapshot) => {
            const data = documentSnapshot.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.name}</td><td>${data.email}</td>
                <td><span style="background:#e8f4f8; padding:3px 8px; border-radius:12px; font-size:12px; font-weight:bold;">${data.assignedClass}</span></td>
                <td><button class="delete-btn" data-id="${documentSnapshot.id}" style="background-color: #e74c3c; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 3px; font-size:12px;">Remove</button></td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tId = e.target.getAttribute('data-id');
                if(confirm("Are you sure you want to remove this teacher?")) { await deleteDoc(doc(db, "users", tId)); loadTeachers(); }
            });
        });
    } catch (error) { console.error("Error loading teachers:", error); }
}