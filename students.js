import { db } from './firebase_core.js';
import { utils, network } from './utils.js';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const StudentService = {
    // 1. ഡാറ്റാബേസിൽ നിന്ന് കുട്ടികളുടെ വിവരങ്ങൾ എടുക്കാൻ
    loadStudentsData: async (madrasaUid, assignedClass, isSmartCacheValid) => {
        const cacheKey = `cache_students_${assignedClass}`;
        let students = utils.safeGetCache(cacheKey, []);
        
        if (students.length === 0 || !isSmartCacheValid) {
            students = [];
            try {
                const snap = await network.withRetry(() => getDocs(query(collection(db, "students"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass))));
                snap.forEach(doc => students.push({ id: doc.id, ...doc.data() }));
                utils.safeSetCache(cacheKey, students);
            } catch (e) { 
                throw new Error("Failed to load students from database."); 
            }
        }
        
        // ആൺകുട്ടികൾ ആദ്യം, ശേഷം പെൺകുട്ടികൾ എന്നിങ്ങനെ അഡ്മിഷൻ നമ്പർ അടിസ്ഥാനത്തിൽ അടുക്കുന്നു
        students.sort((a, b) => {
            if (a.gender !== b.gender) return a.gender === 'Male' ? -1 : 1;
            return String(a.admissionNo).localeCompare(String(b.admissionNo), undefined, {numeric: true});
        });
        
        return students;
    },

    // 2. പുതിയൊരു കുട്ടിയെ ചേർക്കാൻ
    addNewStudent: async (studentData) => {
        const newDocRef = await network.withRetry(() => addDoc(collection(db, "students"), studentData));
        return newDocRef.id;
    },

    // 3. കുട്ടിയുടെ വിവരങ്ങൾ എഡിറ്റ് ചെയ്യാൻ
    updateStudent: async (studentId, updatedData) => {
        await network.withRetry(() => updateDoc(doc(db, "students", studentId), updatedData));
    },

    // 4. കുട്ടിയെയും ആ കുട്ടിയുടെ മുഴുവൻ മാർക്കുകളും ഡിലീറ്റ് ചെയ്യാൻ
    deleteStudentAndMarks: async (studentId) => {
        // ആദ്യം കുട്ടിയെ ഡിലീറ്റ് ചെയ്യുന്നു
        await network.withRetry(() => deleteDoc(doc(db, "students", studentId)));
        
        // ശേഷം ആ കുട്ടിയുടെ എല്ലാ എക്സാം മാർക്കുകളും Batch വഴി ഡിലീറ്റ് ചെയ്യുന്നു
        const marksSnap = await getDocs(query(collection(db, "marks"), where("studentId", "==", studentId)));
        let batches = [];
        let currentBatch = writeBatch(db);
        let operationCount = 0;
        
        marksSnap.docs.forEach((m) => {
            if (operationCount >= 490) { 
                batches.push(currentBatch.commit()); 
                currentBatch = writeBatch(db); 
                operationCount = 0; 
            }
            currentBatch.delete(doc(db, "marks", m.id));
            operationCount++;
        });
        
        if (operationCount > 0) batches.push(currentBatch.commit());
        await Promise.all(batches);
    },

    // 5. കുട്ടികളെ പുതിയ ക്ലാസ്സിലേക്ക് പ്രൊമോട്ട് ചെയ്യാൻ (Batch Update)
    upgradeStudentsClass: async (studentIds, targetClass) => {
        let batches = [];
        let currentBatch = writeBatch(db);
        let operationCount = 0;
        
        studentIds.forEach(id => {
            if (operationCount >= 490) { 
                batches.push(currentBatch.commit()); 
                currentBatch = writeBatch(db); 
                operationCount = 0; 
            }
            currentBatch.update(doc(db, "students", id), { className: String(targetClass) });
            operationCount++;
        });
        
        if (operationCount > 0) batches.push(currentBatch.commit());
        await Promise.all(batches);
    },

    // 6. എക്സൽ ഷീറ്റിൽ നിന്നുള്ള ഡാറ്റ അതിവേഗം ഡാറ്റാബേസിൽ സേവ് ചെയ്യാൻ (Batch Write)
    processStudentExcelUpload: async (json, madrasaUid, assignedClass, existingStudentsMap) => {
        let count = 0; 
        let skippedCount = 0;
        let batches = [];
        let currentBatch = writeBatch(db);
        let operationCount = 0;
        
        for (const row of json) {
            const nameKey = Object.keys(row).find(k => k.toLowerCase() === 'name');
            const admKey = Object.keys(row).find(k => k.toLowerCase() === 'admissionno');
            const genderKey = Object.keys(row).find(k => k.toLowerCase() === 'gender');
            
            if (!nameKey || !admKey) continue;
            
            const newAdmNo = String(row[admKey]).trim();
            
            // അഡ്മിഷൻ നമ്പർ നിലവിലുണ്ടോ എന്ന് പരിശോധിക്കുന്നു
            const exists = Object.values(existingStudentsMap).some(s => String(s.admissionNo) === newAdmNo);
            if (exists) { skippedCount++; continue; }
            
            const dobKey = Object.keys(row).find(k => k.toLowerCase() === 'dob');
            const fatherKey = Object.keys(row).find(k => k.toLowerCase() === 'fathername');
            const placeKey = Object.keys(row).find(k => k.toLowerCase() === 'place');
            const contactKey = Object.keys(row).find(k => k.toLowerCase() === 'contactno');
            const whatsappKey = Object.keys(row).find(k => k.toLowerCase() === 'whatsappno');

            const newRef = doc(collection(db, "students"));
            
            if (operationCount >= 490) { 
                batches.push(currentBatch.commit()); 
                currentBatch = writeBatch(db); 
                operationCount = 0; 
            }
            
            currentBatch.set(newRef, {
                name: String(row[nameKey]).trim(), 
                admissionNo: newAdmNo, 
                gender: genderKey ? String(row[genderKey]).trim() : "Male",
                dob: dobKey ? String(row[dobKey]).trim() : "", 
                fatherName: fatherKey ? String(row[fatherKey]).trim() : "",
                place: placeKey ? String(row[placeKey]).trim() : "", 
                contactNo: contactKey ? String(row[contactKey]).trim() : "",
                whatsappNo: whatsappKey ? String(row[whatsappKey]).trim() : "", 
                className: assignedClass, 
                madrasaUid
            });
            
            operationCount++;
            count++;
        }
        
        if (operationCount > 0) batches.push(currentBatch.commit());
        await Promise.all(batches);
        
        return { count, skippedCount };
    }
};