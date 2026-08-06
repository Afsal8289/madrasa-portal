import { utils } from './utils.js';

export const generatePDF = async (areaId, fileName, orientation = 'p') => {
    const area = document.getElementById(areaId);
    const wrapper = area.parentElement;
    const [origPos, origZ, origOpacity] = [wrapper.style.position, wrapper.style.zIndex, wrapper.style.opacity];
    
    wrapper.style.position = "absolute"; 
    wrapper.style.zIndex = "-1"; 
    wrapper.style.opacity = "1";
    window.scrollTo(0, 0);

    // 🛠️ സ്കെയിൽ (Scale) 3 ആക്കി വർദ്ധിപ്പിച്ചു. ഇത് PDF-ലെ അക്ഷരങ്ങൾ കൂടുതൽ വ്യക്തമാക്കും (High Definition).
    const canvasOptions = { scale: 3, useCORS: true, backgroundColor: "#ffffff" };

    try {
        if (areaId === 'pdfDeskLabelsArea') {
            const pages = area.querySelectorAll('.pdf-page-chunk');
            if (pages.length > 0) {
                const pdf = new jspdf.jsPDF(orientation, 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                
                for (let i = 0; i < pages.length; i++) {
                    if (i > 0) pdf.addPage();
                    const canvas = await html2canvas(pages[i], canvasOptions);
                    const imgData = canvas.toDataURL("image/jpeg", 1.0); // 1.0 = Maximum Quality
                    canvas.remove(); 
                    
                    let imgWidth = pdfWidth - 10;
                    let imgHeight = (canvas.height * imgWidth) / canvas.width;
                    
                    if (imgHeight > (pdfHeight - 10)) {
                        const ratio = (pdfHeight - 10) / imgHeight;
                        imgHeight *= ratio; imgWidth *= ratio;
                    }
                    
                    const xPos = (pdfWidth - imgWidth) / 2;
                    pdf.addImage(imgData, 'JPEG', xPos, 5, imgWidth, imgHeight); 
                }
                pdf.save(fileName);
                return;
            }
        } else {
            const canvas = await html2canvas(area, canvasOptions);
            const imgData = canvas.toDataURL("image/jpeg", 1.0);
            canvas.remove();

            const pdf = new jspdf.jsPDF(orientation, 'mm', 'a4');
            let pdfWidth = pdf.internal.pageSize.getWidth();
            let pdfHeight = pdf.internal.pageSize.getHeight();
            
            let imgWidth = pdfWidth - 10;
            let imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            if (imgHeight > (pdfHeight - 10)) {
                let ratio = (pdfHeight - 10) / imgHeight;
                imgHeight *= ratio;
                imgWidth *= ratio;
            }
            
            const xPos = (pdfWidth - imgWidth) / 2;
            pdf.addImage(imgData, 'JPEG', xPos, 5, imgWidth, imgHeight);
            pdf.save(fileName);
        }
    } catch (e) {
        utils.showError("PDF Generation failed.", e);
    } finally {
        wrapper.style.position = origPos;
        wrapper.style.zIndex = origZ;
        wrapper.style.opacity = origOpacity;
    }
};