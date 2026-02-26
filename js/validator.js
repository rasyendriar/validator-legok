import { appState, GameSystem, SettingsSystem } from './store.js';
import { buildSapTxtFromRows, extractAnchorPid } from './utils.js';

// ==========================================
// HELPER: CENTRALIZED ERROR REPORTING
// ==========================================
function reportIssue(ruleId, row, message, defaultSeverity, errors, warnings) {
    const action = SettingsSystem.getRuleAction(ruleId);
    if (!action.enabled) return; 
    
    const issue = { Rule: ruleId, Row: row, Message: message, Severity: action.severity };
    
    if (action.severity === 'FAIL') errors.push(issue);
    else warnings.push(issue);
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
                <td class="px-6 py-4 whitespace-nowrap text-center"><span class="bg-gray-100 text-gray-600 px-3 py-1 rounded-md text-xs font-bold uppercase">Pending</span></td>
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
                
                if (!wb.Sheets['below_ring']) throw new Error("Missing 'below_ring' sheet.");

                const rawBelow = XLSX.utils.sheet_to_json(wb.Sheets['below_ring'], { defval: "" });
                const rawDisplay = wb.Sheets['display_ring'] ? XLSX.utils.sheet_to_json(wb.Sheets['display_ring'], { defval: "" }) : [];
                
                const belowData = rawBelow.map((r, i) => ({ ...r, _rowIndex: i + 2, _uuid: crypto.randomUUID() }));
                const displayData = rawDisplay.map((r, i) => ({ ...r, _rowIndex: i + 2, _uuid: crypto.randomUUID() }));

                const errors = [];
                const warnings = [];
                let fileStatus = "PASS";
                
                // Ambil PID (Penyelesaian bug fungsi utils.js)
                let anchorPid = extractAnchorPid(belowData) || extractAnchorPid(file.name);

                if (belowData.length === 0) {
                    reportIssue('R7', 'Sheet', 'below_ring is empty', 'FAIL', errors, warnings);
                } else {
                    const reqCols = ['STRNO', 'PLTXT', 'ABCKZ', 'STORT', 'ARBPL'];
                    reqCols.forEach(col => {
                        if (!(col in belowData[0])) reportIssue('R6', 'Header', `Missing required column: ${col}`, 'FAIL', errors, warnings);
                    });

                    let seqGroups = {};
                    let parentChildMap = {};
                    let elementTypes = {};

                    belowData.forEach(row => {
                        const rIdx = row._rowIndex;
                        const strno = String(row.STRNO || "").trim();
                        const pltxt = String(row.PLTXT || "").trim();
                        const abckz = String(row.ABCKZ || "").trim();
                        const stort = String(row.STORT || "").trim();
                        const arbpl = String(row.ARBPL || "").trim();

                        if (!strno || !pltxt || !abckz || !stort || !arbpl) {
                            reportIssue('R7', `Row ${rIdx}`, `Empty cell detected in mandatory columns`, 'FAIL', errors, warnings);
                        }

                        if (pltxt && anchorPid && !pltxt.includes(anchorPid)) {
                            reportIssue('R9', strno || `Row ${rIdx}`, `PLTXT '${pltxt}' does not contain Anchor PID '${anchorPid}'`, 'FAIL', errors, warnings);
                        }

                        if (stort && arbpl) {
                            const expectedArbpl = appState.workCenterData.get(stort);
                            if (expectedArbpl && expectedArbpl !== arbpl) {
                                reportIssue('R13', strno, `For STORT ${stort}, expected ARBPL is ${expectedArbpl}, got ${arbpl}`, 'FAIL', errors, warnings);
                            }
                        }

                        if (strno) {
                            const len = strno.length;
                            if (![17, 21, 26, 30].includes(len)) {
                                reportIssue('R15', strno, `Invalid STRNO length (${len}). Must be 17, 21, 26, or 30`, 'FAIL', errors, warnings);
                            }

                            // R19 Mapping: Extract Parent
                            let parentStrno = "";
                            if (len === 21) parentStrno = strno.substring(0, 17);
                            if (len === 26) parentStrno = strno.substring(0, 21);
                            if (len === 30) parentStrno = strno.substring(0, 26);

                            if (parentStrno) {
                                if (!parentChildMap[parentStrno]) parentChildMap[parentStrno] = [];
                                parentChildMap[parentStrno].push(strno);
                            }

                            // R11, R14, R17 Logic
                            if (len >= 26) {
                                const tagMatch = strno.match(/-([A-Z]+)(\d+)$/i);
                                if (!tagMatch) {
                                    reportIssue('R11', strno, `Invalid tag format in STRNO (Expected -TAG01)`, 'FAIL', errors, warnings);
                                } else {
                                    const tag = tagMatch[1].toUpperCase();
                                    const num = parseInt(tagMatch[2], 10);
                                    elementTypes[strno] = tag;

                                    // R14: ABCKZ vs Tag Consistency
                                    let expectedAbckz = "";
                                    if (["FDC", "FAT", "JB", "SJB", "TB", "ODP"].includes(tag)) expectedAbckz = "OC";
                                    else if (["FDT"].includes(tag)) expectedAbckz = "JC";
                                    else if (["SPL"].includes(tag)) expectedAbckz = "DP";
                                    else if (["ODC"].includes(tag)) expectedAbckz = "KU";

                                    if (expectedAbckz && abckz !== expectedAbckz) {
                                        reportIssue('R14', strno, `Tag '${tag}' expects ABCKZ '${expectedAbckz}', but got '${abckz}'`, 'FAIL', errors, warnings);
                                    }

                                    // R17 Grouping
                                    const baseKey = `${stort}_${arbpl}_${tag}`; // Base sequence grouping
                                    if (!seqGroups[baseKey]) seqGroups[baseKey] = [];
                                    seqGroups[baseKey].push({ strno, num, abckz, pltxt });
                                }
                            }
                        }
                    });

                    // ====================================
                    // R17: SEQUENTIAL NUMBERING & OC00 EXCEPTION
                    // ====================================
                    for (const [key, items] of Object.entries(seqGroups)) {
                        items.sort((a, b) => a.num - b.num);
                        const firstItem = items[0];
                        
                        // EXCEPTION: Jika ABCKZ adalah OC atau PLTXT mengandung OC, angka boleh mulai dari 0.
                        const isOC = firstItem.abckz === 'OC' || firstItem.pltxt.includes('OC00') || firstItem.strno.match(/OC\d+$/i);
                        const expectedStart = isOC ? 0 : 1;
                        const actualStart = firstItem.num;

                        if (actualStart !== expectedStart && actualStart !== 1) { 
                            reportIssue('R17', firstItem.strno, `Starts with ${actualStart}, expected ${expectedStart} or 1`, 'FAIL', errors, warnings);
                        }

                        for (let i = 0; i < items.length - 1; i++) {
                            const diff = items[i+1].num - items[i].num;
                            if (diff > 1) {
                                reportIssue('R17', items[i+1].strno, `Numbering gap: jumps from ${items[i].num} to ${items[i+1].num}`, 'FAIL', errors, warnings);
                            } else if (diff === 0) {
                                reportIssue('R17', items[i+1].strno, `Duplicate sequential number: ${items[i].num}`, 'FAIL', errors, warnings);
                            }
                        }
                    }

                    // ====================================
                    // R16, R18, R19: TOPOLOGY CHECKS
                    // ====================================
                    belowData.forEach(row => {
                        const strno = row.STRNO;
                        if (!strno) return;
                        
                        const children = parentChildMap[strno] || [];
                        const tag = elementTypes[strno];

                        // R19: Connectivity (Parent Check)
                        if (strno.length > 17 && strno.length <= 30) {
                             let parentStrno = "";
                             if (strno.length === 21) parentStrno = strno.substring(0, 17);
                             if (strno.length === 26) parentStrno = strno.substring(0, 21);
                             if (strno.length === 30) parentStrno = strno.substring(0, 26);

                             const parentExists = belowData.some(r => r.STRNO === parentStrno);
                             if (!parentExists) {
                                 reportIssue('R19', strno, `Parent element (${parentStrno}) not found in below_ring. Broken connectivity.`, 'WARNING', errors, warnings);
                             }
                        }

                        // R18: High Occupancy (Capacity Check)
                        if (tag === 'ODC' && children.length >= 129) {
                             reportIssue('R18', strno, `High Occupancy on ODC (${children.length} children, max ~144)`, 'WARNING', errors, warnings);
                        } else if (["FAT", "ODP"].includes(tag) && children.length >= 7) {
                             reportIssue('R18', strno, `High Occupancy on ${tag} (${children.length} children, max ~8)`, 'WARNING', errors, warnings);
                        }

                        // R16: Anti-Split Check (Cascaded splitters)
                        if (tag === 'SPL') {
                             const splChildren = children.filter(c => elementTypes[c] === 'SPL');
                             if (splChildren.length > 0) {
                                 reportIssue('R16', strno, `Cascaded Splitter detected: SPL feeding into another SPL`, 'WARNING', errors, warnings);
                             }
                        }
                    });
                }

                // ====================================
                // R20: DISPLAY RING LOGIC
                // ====================================
                if (displayData.length > 0) {
                    for (let i = 0; i < displayData.length - 1; i++) {
                        const curr = displayData[i].SEQUENCE;
                        const next = displayData[i+1].SEQUENCE;
                        if (curr && next && parseInt(next) < parseInt(curr)) {
                            reportIssue('R20', `Row ${displayData[i+1]._rowIndex}`, 'Display Chain SEQUENCE out of order', 'WARNING', errors, warnings);
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

                // Add Gamification XP !
                if (fileStatus === 'PASS' && anchorPid) {
                    try { GameSystem.addXp(5); } catch(e) { console.warn("XP Add Failed", e); }
                }

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
export function syncProcessedData(fileName) {
    const item = appState.processed[fileName];
    if (!item) return;

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

    item.sapTxt = buildSapTxtFromRows(cleanBelow);

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
