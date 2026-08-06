export const utils = {
    safeSetCache: (key, value) => {
        try { localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value); } 
        catch (e) { console.warn("Cache storage full or disabled."); localStorage.removeItem(key); }
    },
    safeGetCache: (key, fallback = null) => {
        try { 
            const item = localStorage.getItem(key);
            if (!item) return fallback;
            return (item.startsWith('{') || item.startsWith('[')) ? JSON.parse(item) : item;
        } catch (e) { 
            localStorage.removeItem(key); 
            return fallback; 
        }
    },
    disableBtn: (btnId, text) => {
        const btn = document.getElementById(btnId);
        if(!btn) return;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = text;
        btn.disabled = true;
        btn.style.opacity = "0.6";
    },
    enableBtn: (btnId) => {
        const btn = document.getElementById(btnId);
        if(!btn) return;
        btn.textContent = btn.dataset.originalText || "Submit";
        btn.disabled = false;
        btn.style.opacity = "1";
    },
    showError: (msg, err = null) => {
        if(err) console.error("System Error:", err);
        alert(`Notice: ${msg}`);
    },
    sanitizeInput: (str) => {
        return str ? str.replace(/[^\w\s-]/gi, '').trim().replace(/\s+/g, ' ') : '';
    },
    formatDate: (dateStr) => {
        if (!dateStr || dateStr === "-") return "-";
        const parts = String(dateStr).split("-");
        return parts[0].length === 4 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
    },
    getGrade: (percentage, isPassed) => {
        if (!isPassed) return "D"; 
        if (percentage >= 90) return "A+";
        if (percentage >= 80) return "A";
        if (percentage >= 70) return "B+";
        if (percentage >= 60) return "B";
        if (percentage >= 50) return "C+";
        if (percentage >= 40) return "C";
        return "D+"; 
    }
};

export const network = {
    withTimeout: (promise, ms = 15000) => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Request timed out.")), ms);
            promise.then(value => { clearTimeout(timer); resolve(value); })
                   .catch(reason => { clearTimeout(timer); reject(reason); });
        });
    },
    withRetry: async (fn, retries = 3, delay = 1000) => {
        for (let i = 0; i < retries; i++) {
            try { return await network.withTimeout(fn()); } 
            catch (e) {
                if (i === retries - 1) throw e;
                await new Promise(res => setTimeout(res, delay * (i + 1)));
            }
        }
    }
};