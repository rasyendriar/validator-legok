// --- HELPER FUNCTION: EXTRACT ANCHOR PID ---
// Consistent PID extraction logic for both display and validation (Rule 13)
export function extractAnchorPid(filename) {
    const nameBase = filename.replace(/\.[^/.]+$/, ""); // Remove extension
    // Try standard pattern
    const pidMatch = nameBase.match(/\b\d{2}[A-Z]{2}\d{2}[A-Z]\d{4}\b/i);
    
    if (pidMatch) {
        return pidMatch[0].toUpperCase();
    }
    
    // If no regex match, fallback to cleaning common prefixes/suffixes manually
    let clean = nameBase.toUpperCase();
    
    // Handle prefixes
    clean = clean.replace(/^VALIDATED_/, '');
    clean = clean.replace(/^REVISI_/, '');
    
    // Handle suffixes
    clean = clean.replace(/_VALIDATED$/, '');
    clean = clean.replace(/_REVISI$/, '');
    clean = clean.replace(/_FINAL$/, '');

    return clean;
}

// --- SAP TXT helpers ---
export function sanitizeForTsvCell(val) {
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/\t/g, ' ')
        .replace(/\r?\n/g, ' ')
        .trim();
}

export function buildSapTxtFromRows(rows, headerOrder) {
    if (!rows || rows.length === 0) return '';
    const cols = headerOrder && headerOrder.length ? headerOrder : Object.keys(rows[0]);
    const headerLine = cols.join('\t');
    const bodyLines = rows.map(r => cols.map(c => sanitizeForTsvCell(r[c])).join('\t'));
    return [headerLine, ...bodyLines].join('\r\n');
}

export function triggerTextDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// (From Converter Section) Identical to triggerTextDownload, kept for backward compatibility
export function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function downloadSingleExcel(wb, fileName) {
    // Note: This relies on the global 'XLSX' object being available from SheetJS
    const excelData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelData], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}