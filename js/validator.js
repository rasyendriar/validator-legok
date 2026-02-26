import { appState, GameSystem, SettingsSystem } from './store.js';
import { buildSapTxtFromRows, extractAnchorPid } from './utils.js';

// ==========================================
// HELPER: CENTRALIZED ERROR REPORTING
// ==========================================
function reportIssue(ruleId, row, message, defaultSeverity, errors, warnings) {
    // 1. Ambil pengaturan dari Settings Menu untuk rule terkait
    const action = SettingsSystem.getRuleAction(ruleId);
    
    // 2. Jika di-disable oleh user, abaikan (return)
    if (!action.enabled) return; 
    
    // 3. Format error
    const issue = { 
        Rule: ruleId, 
        Row: row, 
        Message: message, 
        Severity: action.severity 
    };
    
    // 4. Masukkan ke keranjang yang sesuai (Berdasarkan pengaturan User, bukan hardcode)
    if (action.severity === 'FAIL') {
        errors.push(issue);
    } else {
        warnings.push(issue);
    }
}

// ==========================================
// DRAG & DROP EVENT HANDLERS
// ==========================================
export function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (window.handleFiles) window.handleFiles(files);
}

export function handleFiles(files) {
    if (!files || files.length === 0) return;
    
    document.getElementById('summary-dashboard').classList.remove('hidden');
    document.getElementById('groupActions').classList.remove('hidden');
    document.getElementById('btnClearFiles').classList.remove('hidden');
    document.getElementById('btnStartValidation').classList.remove('hidden');

    Array.from(files).forEach(file => {
        if (!appState.queue.some(f => f.name === file.name)) {
            appState.queue.push(file);
            
            const tbody = document.getElementById('result-body');
            const tr = document.createElement('tr');
            tr.id = `row-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${tbody.children.length + 1}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">${file.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span class="bg-gray-100 text-gray-600 px-3 py-1 rounded-md text-xs font-bold uppercase">Pending</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-gray-300">-</td>
                <td class="px-6 py-4 text-sm text-gray-500">Waiting for validation...</td>
                <td class="px-6 py-4 whitespace-nowrap text-center">-</td>
            `;
            tbody.appendChild(tr);
        }
    });
    
    if (window.showToast) window.showToast(`${files.length} file(s) added to queue`, 'info');
}

// ==========================================
// VALIDATION CORE
// ==========================================
export async function startBatchValidation() {
    if (appState.queue.length === 0) {
        if (window.showToast) window.showToast('Queue is empty!', 'warning');
        return;
    }

    const btn = document.getElementById('btnStartValidation');
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Processing...`;
    btn.disabled = true;

    for (let i = 0; i < appState.queue.length; i++) {
        const file = appState.queue[i];
        if (!appState.processed[file.name]) {
            await processFile(file);
        }
    }

    appState.queue = [];
    btn.innerHTML = `<i class="fa-solid fa-play mr-2 text-xs"></i> Start Validation`;
    btn.disabled = false;
    
    if (window.recalculateStats) window.recalculateStats();
    if (window.showToast) window.showToast('Validation Complete!', 'success');
}

export async function processFile(file) {
    const rowId = `row-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const tr = document.getElementById(rowId);
    if (tr) tr.cells[4].innerHTML = '<i class="fa-solid fa-spinner fa-spin text-blue-500"></i> Reading...';

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                
                if (!wb.Sheets['below_ring']) {
                    throw new Error("Missing 'below_ring' sheet.");
                }

                const rawBelow = XLSX.utils.sheet_to_json(wb.Sheets['below_ring'], { defval: "" });
                const rawDisplay = wb.Sheets['display_ring'] ? XLSX.utils.sheet_to_json(wb.Sheets['display_ring'], { defval: "" }) : [];
                
                // Inject UUID dan rowIndex untuk fitur Sinkronisasi UI
                const belowData = rawBelow.map((r, i) => ({ ...r, _rowIndex: i + 2, _uuid: crypto.randomUUID() }));
                const displayData = rawDisplay.map((r, i) => ({ ...r, _rowIndex: i + 2, _uuid: crypto.randomUUID() }));

                const errors = [];
                const warnings = [];
                let fileStatus = "PASS";
                let anchorPid = "";

                // ====================================
                // EXECUTE RULES ENGINE
                // ====================================
                if (belowData.length === 0) {
                    reportIssue('R7', 'Sheet', 'below_ring is empty', 'FAIL', errors, warnings);
                } else {
                    anchorPid = extractAnchorPid(belowData);
                    
                    // R6: Cek Kolom Wajib
                    const reqCols = ['STRNO', 'PLTXT', 'ABCKZ', 'STORT', 'ARBPL'];
                    reqCols.forEach(col => {
                        if (!(col in belowData[0])) {
                            reportIssue('R6', 'Header', `Missing required column: ${col}`, 'FAIL', errors, warnings);
                        }
                    });

                    let seqGroups = {};
                    let parentChildMap = {};

                    belowData.forEach(row => {
                        const rIdx = row._rowIndex;
                        const strno = String(row.STRNO || "").trim();
                        const pltxt = String(row.PLTXT || "").trim();
                        const abckz = String(row.ABCKZ || "").trim();
                        const stort = String(row.STORT || "").trim();
                        const arbpl = String(row.ARBPL || "").trim();

                        // R7: Data Kosong
                        if (!strno || !pltxt || !abckz || !stort || !arbpl) {
                            reportIssue('R7', `Row ${rIdx}`, `Empty cell detected in mandatory columns`, 'FAIL', errors, warnings);
                        }

                        // R9: Anchor PID Consistency
                        if (pltxt && anchorPid && !pltxt.includes(anchorPid)) {
                            reportIssue('R9', strno || `Row ${rIdx}`, `PLTXT '${pltxt}' does not contain Anchor PID '${anchorPid}'`, 'FAIL', errors, warnings);
                        }

                        // R13: Validasi Work Center
                        if (stort && arbpl) {
                            const expectedArbpl = appState.workCenterData.get(stort);
                            if (expectedArbpl && expectedArbpl !== arbpl) {
                                reportIssue('R13', strno, `For STORT ${stort}, expected ARBPL is ${expectedArbpl}, got ${arbpl}`, 'FAIL', errors, warnings);
                            }
                        }

                        // R12 & R15: Panjang STRNO
                        if (strno) {
                            const len = strno.length;
                            if (![17, 21, 26, 30].includes(len)) {
                                reportIssue('R15', strno, `Invalid STRNO length (${len}). Must be 17, 21, 26, or 30`, 'FAIL', errors, warnings);
                            }

                            // Ekstraksi untuk Rule 17 (Sequential Numbering)
                            if (len >= 26) {
                                const baseMatch = strno.match(/(.*?)-([A-Z]+)(\d+)$/);
                                if (baseMatch) {
                                    const baseKey = `${stort}_${arbpl}_${baseMatch[1]}_${baseMatch[2]}`;
                                    const num = parseInt(baseMatch[3], 10);
                                    
                                    if (!seqGroups[baseKey]) seqGroups[baseKey] = [];
                                    seqGroups[baseKey].push({ strno, num, abckz, pltxt });
                                }
                            }

                            // Ekstraksi untuk Rule 19 (Parent Connectivity)
                            if (len > 17) {
                                const parentStrno = strno.substring(0, len === 21 ? 17 : len === 26 ? 21 : 26);
                                if (!parentChildMap[parentStrno]) parentChildMap[parentStrno] = [];
                                parentChildMap[parentStrno].push(strno);
                            }
                        }
                    });

                    // R17: Post-Process Sequential Numbering (Dengan Pengecualian OC)
                    for (const [key, items] of Object.entries(seqGroups)) {
                        items.sort((a, b) => a.num - b.num);
                        
                        const firstItem = items[0];
                        // CEK OC00 EXCEPTION
                        const isOC = firstItem.abckz === 'OC' || firstItem.pltxt.includes('OC00') || firstItem.strno.match(/OC\d+$/);
                        
                        // Jika elemen OC, targetnya adalah 0. Selain itu 1.
                        const expectedStart = isOC ? 0 : 1;
                        const actualStart = firstItem.num;

                        // Peringatan jika angka awal salah (Toleransi: Walau OC00 boleh, jika diisi 1 tetap boleh (Aman))
                        if (actualStart !== expectedStart && actualStart !== 1) { 
                            reportIssue('R17', firstItem.strno, `Starts with ${actualStart}, expected ${expectedStart} or 1`, 'FAIL', errors, warnings);
                        }

                        // Cek lompatan angka (Gap / Duplicate)
                        for (let i = 0; i < items.length - 1; i++) {
                            const diff = items[i+1].num - items[i].num;
                            if (diff > 1) {
                                reportIssue('R17', items[i+1].strno, `Numbering gap: jumps from ${items[i].num} to ${items[i+1].num}`, 'FAIL', errors, warnings);
                            } else if (diff === 0) {
                                reportIssue('R17', items[i+1].strno, `Duplicate sequential number: ${items[i].num}`, 'FAIL', errors, warnings);
                            }
                        }
                    }

                    // R19: Post-Process Parent Connectivity
                    belowData.forEach(row => {
                        if (row.STRNO && row.STRNO.length < 30) {
                            const children = parentChildMap[row.STRNO];
                            if (!children || children.length === 0) {
                                reportIssue('R19', row.STRNO, `Element has no children. Potential dangling asset.`, 'WARNING', errors, warnings);
                            }
                        }
                    });
                }

                // R20: Display Ring Logic
                if (displayData.length > 0) {
                    for (let i = 0; i < displayData.length - 1; i++) {
                        const curr = displayData[i].SEQUENCE;
                        const next = displayData[i+1].SEQUENCE;
                        if (curr && next && parseInt(next) < parseInt(curr)) {
                            reportIssue('R20', `Row ${displayData[i+1]._rowIndex}`, 'Display Chain Sequence out of order', 'WARNING', errors, warnings);
                        }
                    }
                } else {
                    reportIssue('R10', 'display_ring', 'Sheet is empty or missing', 'WARNING', errors, warnings);
                }

                // Final Status Assessment
                if (errors.length > 0) fileStatus = "FAIL";
                else if (warnings.length > 0) fileStatus = "WARNING";

                const sapTxt = buildSapTxtFromRows(belowData);

                appState.processed[file.name] = {
                    fileName: file.name,
                    status: fileStatus,
                    originalStatus: fileStatus,
                    isManuallyOverridden: false,
                    pid: anchorPid || file.name.split('.')[0],
                    wb: wb,
                    sapTxt: sapTxt,
                    belowData: belowData,
                    displayData: displayData,
                    errors: errors,
                    warnings: warnings,
                    rowId: rowId
                };
                appState.processedKeys.push(file.name);

                if (fileStatus === 'PASS' && anchorPid) GameSystem.addXp(5);

                if (tr) {
                    tr.cells[1].innerHTML = `<div class="flex flex-col">
                        <span class="font-bold text-slate-800 dark:text-white">${anchorPid || 'Unknown PID'}</span>
                        <span class="text-[10px] text-gray-500">${file.name}</span>
                    </div>`;
                    
                    let logMsg = fileStatus === 'PASS' ? '<span class="text-green-500"><i class="fa-solid fa-check mr-1"></i> Valid</span>' :
                                 fileStatus === 'WARNING' ? `<span class="text-orange-500"><i class="fa-solid fa-triangle-exclamation mr-1"></i> ${warnings.length} Warnings</span>` :
                                 `<span class="text-red-500"><i class="fa-solid fa-xmark mr-1"></i> ${errors.length} Errors</span>`;
                    tr.cells[4].innerHTML = logMsg;
                    
                    if(window.updateRowStatusUI) window.updateRowStatusUI(rowId, appState.processed[file.name]);
                    if(window.updateTableRowVerifiedStatus) window.updateTableRowVerifiedStatus(rowId, anchorPid);
                }

                resolve();
            } catch (error) {
                console.error("Error processing file", error);
                if (tr) {
                    tr.cells[2].innerHTML = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider">ERROR</span>`;
                    tr.cells[4].innerHTML = `<span class="text-red-500 text-xs">${error.message}</span>`;
                }
                resolve();
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// ==========================================
// DATA SYNC & EXPORT ACTIONS
// ==========================================

// Fungsi ini dipanggil dari UI setelah User mengubah data (Inline Edit / Drag Drop)
export function syncProcessedData(fileName) {
    const item = appState.processed[fileName];
    if (!item) return;

    // 1. Bersihkan _uuid dan _rowIndex agar tidak ter-export ke Excel/SAP
    const cleanBelow = item.belowData.map(r => {
        const newRow = { ...r };
        delete newRow._uuid;
        delete newRow._rowIndex;
        return newRow;
    });
    
    const cleanDisplay = item.displayData.map(r => {
        const newRow = { ...r };
        delete newRow._uuid;
        delete newRow._rowIndex;
        return newRow;
    });

    // 2. Rebuild SAP TXT
    item.sapTxt = buildSapTxtFromRows(cleanBelow);

    // 3. Rebuild Workbook (Memastikan file Excel sinkron dengan UI)
    const newWb = XLSX.utils.book_new();
    const wsBelow = XLSX.utils.json_to_sheet(cleanBelow);
    XLSX.utils.book_append_sheet(newWb, wsBelow, "below_ring");
    
    if (cleanDisplay.length > 0) {
        const wsDisplay = XLSX.utils.json_to_sheet(cleanDisplay);
        XLSX.utils.book_append_sheet(newWb, wsDisplay, "display_ring");
    }
    
    item.wb = newWb;
}

export function downloadSummaryReport() {
    if (Object.keys(appState.processed).length === 0) {
        if(window.showToast) window.showToast("No data to export", "warning");
        return;
    }

    const reportData = [];
    for (const key in appState.processed) {
        const item = appState.processed[key];
        reportData.push({
            "Filename": item.fileName,
            "Target PID": item.pid,
            "Status": item.status,
            "Total Rows": item.belowData.length,
            "Errors": item.errors.length,
            "Warnings": item.warnings.length,
            "Verified": GameSystem.isVerified(item.pid) ? 'Yes' : 'No'
        });
    }

    const ws = XLSX.utils.json_to_sheet(reportData);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, ws, "Summary");
    XLSX.writeFile(newWb, "Validation_Summary_Report.xlsx");
}

export function downloadSapBatch(type, mode) {
    let mergedContent = "";
    let count = 0;
    
    for (const key in appState.processed) {
        const item = appState.processed[key];
        if (type === 'pass' && item.status !== 'PASS') continue;
        
        if (mode === 'merge') {
            mergedContent += item.sapTxt + "\n";
        } else {
            const base = item.pid || item.fileName.replace(/\.[^/.]+$/, "");
            if (window.triggerTextDownload) window.triggerTextDownload(item.sapTxt, base + ".txt");
        }
        count++;
    }

    if (count === 0) {
        if(window.showToast) window.showToast("No files match the criteria.", "warning");
        return;
    }

    if (mode === 'merge') {
        const filenameInput = document.getElementById('sapMergedFilename');
        let dlName = filenameInput && filenameInput.value.trim() !== "" ? filenameInput.value.trim() : "SAP_MERGED";
        if (!dlName.endsWith(".txt")) dlName += ".txt";
        if (window.triggerTextDownload) window.triggerTextDownload(mergedContent, dlName);
    }
    
    if(window.showToast) window.showToast(`Exported ${count} files.`, 'success');
}
