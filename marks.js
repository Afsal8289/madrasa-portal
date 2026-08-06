import { db } from './firebase_core.js';
import { utils, network } from './utils.js';
import { collection, addDoc, getDocs, query, where, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const MarkService = {
    // 1. ഒരു കുട്ടിയുടെ ഒരു ടേമിലെ മാർക്ക് എടുക്കാൻ
    getStudentMark: async (studentId, term) => {
        const docId = `${studentId}_${term.replace(/\s+/g, '')}`;
        const markDoc = await network.withRetry(() => getDoc(doc(db, "marks", docId)));
        return markDoc.exists() ? markDoc.data() : null;
    },

    // 2. മാർക്ക് സേവ് ചെയ്യാൻ അല്ലെങ്കിൽ അപ്ഡേറ്റ് ചെയ്യാൻ
    saveStudentMarks: async (docId, finalData, term, assignedClass) => {
        await network.withRetry(() => setDoc(doc(db, "marks", docId), finalData));
        
        // ലോക്കൽ ക്യാഷ് അപ്ഡേറ്റ് ചെയ്യുന്നു
        const cacheKey = `cache_marks_${assignedClass}_${term.replace(/\s+/g, '')}`;
        let snapData = utils.safeGetCache(cacheKey, []);
        const index = snapData.findIndex(m => m.id === docId);
        if (index !== -1) snapData[index] = { id: docId, ...finalData };
        else snapData.push({ id: docId, ...finalData });
        utils.safeSetCache(cacheKey, snapData);
    },

    // 3. ഒരു എക്സാമിലെ മുഴുവൻ മാർക്കുകളും ഡിലീറ്റ് ചെയ്യാൻ (Delete All Marks for a Term)
    deleteAllMarksForTerm: async (madrasaUid, assignedClass, term) => {
        const snap = await getDocs(query(collection(db, "marks"), where("madrasaUid", "==", madrasaUid), where("className", "==", assignedClass), where("term", "==", term)));
        
        let batches = [];
        let currentBatch = writeBatch(db);
        let operationCount = 0;
        
        snap.docs.forEach((mDoc) => {
            if (operationCount >= 490) { 
                batches.push(currentBatch.commit()); 
                currentBatch = writeBatch(db); 
                operationCount = 0; 
            }
            currentBatch.delete(doc(db, "marks", mDoc.id));
            operationCount++;
        });
        
        if (operationCount > 0) batches.push(currentBatch.commit());
        await Promise.all(batches);
    },

    // 4. എക്സൽ വഴി മാർക്കുകൾ അപ്‌ലോഡ് ചെയ്യാൻ (Excel Marks Upload)
    processMarksExcelUpload: async (json, classSubjects, studentsMap, madrasaUid, assignedClass, term) => {
        let count = 0;
        let totalMaxPossible = classSubjects.reduce((sum, sub) => sum + sub.maxMark, 0);

        let batches = [];
        let currentBatch = writeBatch(db);
        let operationCount = 0;

        for (const row of json) {
            const admKey = Object.keys(row).find(k => k.toLowerCase() === 'admissionno');
            const attKey = Object.keys(row).find(k => k.toLowerCase() === 'attendance');
            if (!admKey) continue;
            
            const excelAdm = String(row[admKey]).trim();
            const student = Object.values(studentsMap).find(s => String(s.admissionNo) === excelAdm);
            if (!student) continue;
            
            let marksData = {}, totalObtained = 0, isPassed = true, isValid = true;
            
            for (const sub of classSubjects) {
                const subKey = Object.keys(row).find(k => k.toLowerCase() === sub.name.toLowerCase());
                let val = subKey ? String(row[subKey]).trim().toUpperCase() : "";
                
                if (val === "A") { marksData[sub.name] = "A"; isPassed = false; } 
                else if (val === "" || val === "-") { marksData[sub.name] = ""; } 
                else {
                    const num = Number(val);
                    if (isNaN(num) || num > sub.maxMark) { isValid = false; break; }
                    marksData[sub.name] = num;
                    totalObtained += num;
                    if (num < sub.passMark) isPassed = false;
                }
            }
            
            if (!isValid) continue; 
            
            const percentage = totalMaxPossible > 0 ? (totalObtained / totalMaxPossible) * 100 : 0;
            const finalGrade = utils.getGrade(percentage, isPassed);
            
            const docId = `${student.id}_${term.replace(/\s+/g, '')}`;
            let finalAtt = attKey ? String(row[attKey]).trim() : "";
            if(finalAtt === "-") finalAtt = "";

            if (operationCount >= 490) { 
                batches.push(currentBatch.commit()); 
                currentBatch = writeBatch(db); 
                operationCount = 0; 
            }
            
            currentBatch.set(doc(db, "marks", docId), {
                studentId: student.id, 
                studentName: student.name, 
                madrasaUid, 
                className: assignedClass, 
                term,
                marks: marksData, 
                attendance: finalAtt, 
                totalMarks: totalObtained, 
                maxMarkTotal: totalMaxPossible,
                subjectConfig: classSubjects, 
                percentage, 
                grade: finalGrade, 
                status: isPassed ? "Passed" : "Failed"
            });
            operationCount++;
            count++;
        }
        
        if (operationCount > 0) batches.push(currentBatch.commit());
        await Promise.all(batches);
        
        return count;
    }
};