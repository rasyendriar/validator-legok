// js/utils.js

export function extractAnchorPid(dataOrFilename) {
    // 1. Jika input adalah Array (Data Excel / belowData)
    if (Array.isArray(dataOrFilename)) {
        const data = dataOrFilename;
        for (let i = 0; i < data.length; i++) {
            if (data[i].STRNO && data[i].STRNO.length === 17 && data[i].PLTXT) {
                const match = String(data[i].PLTXT).match(/(PID-\d+)/i);
                if (match) return match[1].toUpperCase();
            }
        }
        // Fallback ke baris pertama jika tidak ada yang panjangnya 17
        if (data.length > 0 && data[0].PLTXT) {
            const match = String(data[0].PLTXT).match(/(PID-\d+)/i);
            if (match) return match[1].toUpperCase();
        }
        return "";
    } 
    // 2. Jika input adalah String (Nama file)
    else if (typeof dataOrFilename === 'string') {
        const match = dataOrFilename.match(/(PID-\d+)/i);
        return match ? match[1].toUpperCase() : "";
    }
    
    return "";
}

export function sanitizeForTsvCell(text) {
    if (text === null || text === undefined) return "";
    let str = String(text);
    str = str.replace(/[\r\n\t]/g, " ");
    return str.trim();
}

export function buildSapTxtFromRows(rows) {
    if (!rows || rows.length === 0) return "";
    
    const headers = Object.keys(rows[0]).filter(k => k !== '_uuid' && k !== '_rowIndex');
    let txt = headers.join("\t") + "\n";
    
    for (let i = 0; i < rows.length; i++) {
        let rowArr = [];
        for (let j = 0; j < headers.length; j++) {
            rowArr.push(sanitizeForTsvCell(rows[i][headers[j]]));
        }
        txt += rowArr.join("\t") + "\n";
    }
    return txt;
}

export function triggerTextDownload(content, filename) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    triggerDownload(blob, filename);
}

export function downloadSingleExcel(wb, filename) {
    try {
        XLSX.writeFile(wb, filename);
    } catch (e) {
        console.error("Download failed, using fallback.", e);
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: "application/octet-stream" });
        triggerDownload(blob, filename);
    }
}

export function triggerDownload(blob, filename) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}
