import { appState, GameSystem } from './store.js';
import { extractAnchorPid, buildSapTxtFromRows, triggerTextDownload } from './utils.js';

// Catatan: Fungsi-fungsi pembaruan UI di bawah ini nantinya akan kita buat dan ekspor dari ui.js
// Jika belum ada, sementara kita panggil dari global window objek (akan kita rapikan di tahap ui.js)
const updateDashboardUI = () => window.updateDashboardUI && window.updateDashboardUI();
const updateRowStatusUI = (rowId, item) => window.updateRowStatusUI && window.updateRowStatusUI(rowId, item);
const updateTableRowVerifiedStatus = (rowId, pid) => window.updateTableRowVerifiedStatus && window.updateTableRowVerifiedStatus(rowId, pid);
const filterQueueTable = () => window.filterQueueTable && window.filterQueueTable();

// --- HELPERS LOKAL ---
const isEmpty = (x) => (x === null || x === undefined || String(x).trim() === "");
const excelRow = (i) => i + 2;

// --- FILE HANDLING ---
export function handleDrop(e) { 
    if(e.dataTransfer && e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files); 
    }
}

export async function handleFiles(files) {
    const tbody = document.getElementById('result-body');
    if (!tbody) return;

    let added = false;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        const fileId = `file-${Date.now()}-${i}`;
        appState.queue.push({ file, id: fileId });
        added = true;

        const targetPid = extractAnchorPid(file.name);

        const tr = document.createElement('tr');
        tr.id = fileId;
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition border-b border-gray-50 dark:border-gray-800";
        
        tr.innerHTML = `
            <td class="py-4 px-6 text-sm text-gray-400 font-mono">${tbody.children.length + 1}</td>
            <td class="py-4 px-6 text-sm font-semibold text-slate-700 dark:text-gray-200">
                ${file.name}
                <br><span class="text-[10px] uppercase font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded tracking-wide mt-1 inline-block">ID: ${targetPid}</span>
            </td>
            <td class="py-4 px-6 text-center text-xs font-bold text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">Pending</td>
            <td class="py-4 px-6 text-center text-gray-300">-</td>
            <td class="py-4 px-6 text-sm text-gray-400 italic">Ready to process...</td>
            <td class="py-4 px-6 text-center text-gray-300">-</td>
        `;
        tbody.appendChild(tr);
    }

    if (added) {
        const btnStart = document.getElementById('btnStartValidation');
        const btnClear = document.getElementById('btnClearFiles');
        const dash = document.getElementById('summary-dashboard');

        if(btnStart) btnStart.classList.remove('hidden');
        if(btnClear) btnClear.classList.remove('hidden');
        if(dash) dash.classList.remove('hidden');
        
        // Re-apply filter if active
        if(window.currentQueueFilter && window.currentQueueFilter !== 'all') {
            filterQueueTable();
        } else if(document.getElementById('queueSearch') && document.getElementById('queueSearch').value.trim() !== "") {
            filterQueueTable();
        }
    }
}

export async function startBatchValidation() {
    const btn = document.getElementById('btnStartValidation');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = `<span class="loader border-t-white mr-2" style="width:16px;height:16px;border-width:2px;"></span> Processing...`;
    }

    // Reset stats untuk batch yang baru dijalankan
    appState.stats.total = 0;
    appState.stats.pass = 0;
    appState.stats.fail = 0;
    appState.stats.warning = 0; 
    updateDashboardUI();

    for (const item of appState.queue) {
        await processFile(item.file, item.id);
    }
    
    appState.queue = []; 
    
    if (btn) btn.innerHTML = "<i class='fa-solid fa-check mr-2'></i> Done";
    
    const groupAct = document.getElementById('groupActions');
    if(groupAct) groupAct.classList.remove('hidden');

    setTimeout(() => { 
        if (btn) {
            btn.classList.add('hidden'); 
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = `<i class='fa-solid fa-play mr-2 text-xs'></i> Start Validation`;
        }
    }, 2000);
}

// --- MAIN VALIDATION LOGIC ---
export async function processFile(file, rowId) {
    const row = document.getElementById(rowId);
    if(!row) return;

    const statusCell = row.cells[2];
    const verifiedCell = row.cells[3]; 
    const msgCell = row.cells[4];
    const actionCell = row.cells[5];

    statusCell.innerHTML = `<span class="loader"></span>`;
    msgCell.innerText = "Running checks...";

    try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        if (!workbook.SheetNames.includes('below_ring')) throw new Error("Sheet 'below_ring' tidak ditemukan.");
        
        let rawBelow = XLSX.utils.sheet_to_json(workbook.Sheets['below_ring'], { defval: "" });
        
        // --- MODIFIKASI: Add UUID and row index ---
        let belowData = rawBelow.map((r, idx) => {
            const newRow = {};
            Object.keys(r).forEach(k => {
                const upperK = k.toUpperCase().trim();
                if (['PID', 'RING_ID'].includes(upperK)) return; 
                newRow[upperK] = r[k];
            });
            newRow._rowIndex = idx + 2; 
            newRow._uuid = crypto.randomUUID(); // Tambahan UUID Unik untuk Drag & Drop
            return newRow;
        });

        const required = ['STRNO', 'PLTXT', 'ABCKZ'];
        const missingCols = required.filter(c => !Object.keys(belowData[0] || {}).includes(c));
        if (missingCols.length) throw new Error(`Kolom hilang di below_ring: ${missingCols.join(', ')}`);

        belowData.sort((a, b) => {
            const sa = String(a.STRNO || "");
            const sb = String(b.STRNO || "");
            return sa.localeCompare(sb);
        });

        belowData.forEach(r => {
            const s = String(r.STRNO || "");
            const len = (s.toLowerCase() === "<na>" || s === "") ? 0 : s.length;
            r.STRNO_LENGTH = len;
            if (len === 17) r.PLTXT = s; 
        });

        const errors = [];
        const warnings = []; 
        const rule5_Allowed = [17, 21, 26, 30];
        const seenStrno = new Set();
        const duplicates = new Set();

        const anchorPid = extractAnchorPid(file.name);
        const segmentMap = {}; 
        let segmentOrder = []; 

        const r16Segments = {}; 
        const r17MaterialGroups = {}; 
        const r18Occupancy = {}; 

        // R16, R17, R18, R14, R15 loop
        belowData.forEach((r, i) => {
            const strno = String(r.STRNO || "").trim();
            const pltxt = String(r.PLTXT || "").trim();
            
            if (r.STRNO_LENGTH === 30) {
                 const segId = strno.substring(0, 26);
                 
                 if (!segmentMap.hasOwnProperty(segId)) {
                     segmentMap[segId] = false;
                     segmentOrder.push(segId);
                 }

                 const p = pltxt.toUpperCase();
                 if (p.includes(anchorPid)) segmentMap[segId] = true;

                 // R16 Anti-Split
                 if (!r16Segments[segId]) r16Segments[segId] = { sequence: [] };
                 const segState = r16Segments[segId];
                 const normPid = pltxt ? pltxt : "EMPTY_CORE"; 
                 const seqLen = segState.sequence.length;
                 const lastPidInSeq = seqLen > 0 ? segState.sequence[seqLen - 1].pid : null;

                 if (normPid !== lastPidInSeq) {
                     if (normPid !== "EMPTY_CORE") {
                         const prevIndex = segState.sequence.map(s => s.pid).lastIndexOf(normPid);
                         if (prevIndex !== -1) {
                             const gapSlice = segState.sequence.slice(prevIndex + 1);
                             const hasEmptyCore = gapSlice.some(s => s.pid === "EMPTY_CORE");

                             if (hasEmptyCore) {
                                 errors.push({ Rule: "R16_ANTI_SPLIT", Row: r._rowIndex, Message: `Error: PID '${pltxt}' terputus oleh core kosong di segmen ${segId}.` });
                             } else {
                                 warnings.push({ Rule: "R16_ANTI_SPLIT_WARN", Row: r._rowIndex, Message: `Peringatan: PID '${pltxt}' diselingi oleh project lain di segmen ${segId}.` });
                             }
                         }
                     }
                     segState.sequence.push({ pid: normPid, row: r._rowIndex });
                 }

                 // R18 High Occupancy
                 if (pltxt && !pltxt.toUpperCase().includes("KABEL")) {
                     const basePid = pltxt.replace(/\[R\]|\(R\)/gi, '').trim().toUpperCase();
                     if (!r18Occupancy[segId]) r18Occupancy[segId] = {};
                     r18Occupancy[segId][basePid] = (r18Occupancy[segId][basePid] || 0) + 1;
                 }
            }

            if (r.STRNO_LENGTH === 26) {
                const match = strno.match(/^(.+?)([A-Z]+)(\d+)$/); 
                if (match) {
                    const groupKey = match[1] + match[2]; 
                    const numVal = parseInt(match[3], 10);
                    if (!r17MaterialGroups[groupKey]) r17MaterialGroups[groupKey] = [];
                    r17MaterialGroups[groupKey].push({ num: numVal, row: r._rowIndex, strno: strno });
                }
            }
        });

        // Post-Process R17
        Object.keys(r17MaterialGroups).forEach(key => {
            const items = r17MaterialGroups[key].sort((a,b) => a.num - b.num);
            if (items.length > 0) {
                if (items[0].num !== 1) {
                    errors.push({ Rule: "R17_SEQUENTIAL_START", Row: items[0].row, Message: `Urutan aset '${key}' dimulai dari nomor ${items[0].num}, seharusnya 01.` });
                }
                for (let k = 1; k < items.length; k++) {
                    const diff = items[k].num - items[k-1].num;
                    if (diff > 1) {
                        errors.push({ Rule: "R17_SEQUENTIAL_GAP", Row: items[k].row, Message: `Lompatan urutan aset '${key}'. Dari ${items[k-1].strno} langsung ke ${items[k].strno} (Gap detected).` });
                    }
                }
            }
        });

        // Post-Process R18
        Object.keys(r18Occupancy).forEach(segId => {
            const pidCounts = r18Occupancy[segId];
            Object.keys(pidCounts).forEach(pid => {
                if (pidCounts[pid] > 4) {
                    warnings.push({ Rule: "R18_HIGH_OCCUPANCY", Row: `SEGMENT ${segId}`, Message: `PID '${pid}' menggunakan ${pidCounts[pid]} core dalam satu segmen. (Threshold > 4). Mohon cek manual.` });
                }
            });
        });

        // R19: Connectivity (Daisy-Chain)
        const segments = belowData.filter(r => r.STRNO_LENGTH === 21);
        segments.sort((a,b) => String(a.STRNO||"").localeCompare(String(b.STRNO||"")));

        for(let k=0; k < segments.length - 1; k++) {
            const curr = segments[k];
            const next = segments[k+1];

            const currTxt = String(curr.PLTXT || "").toUpperCase().trim();
            const nextTxt = String(next.PLTXT || "").toUpperCase().trim();

            const currParts = currTxt.split('-').map(p => p.trim()).filter(p => p.length > 0);
            const nextParts = nextTxt.split('-').map(p => p.trim()).filter(p => p.length > 0);

            if (currParts.length > 0 && nextParts.length > 0) {
                const currEndPoint = currParts[currParts.length - 1];
                const nextStartPoint = nextParts[0];

                if (currEndPoint !== nextStartPoint) {
                    warnings.push({ Rule: "R19_CONNECTIVITY", Row: curr._rowIndex, Message: `Connectivity Terputus: End-Point '${currEndPoint}' pada segmen '${curr.PLTXT}' tidak menyambung dengan Start-Point '${nextStartPoint}' pada segmen '${next.PLTXT}' di baris bawahnya.` });
                }
            } else if (currTxt === "" || nextTxt === "") {
                 warnings.push({ Rule: "R19_CONNECTIVITY", Row: curr._rowIndex, Message: `Connectivity Terputus: Terdapat kolom PLTXT (Segmen) yang kosong pada rentetan data.` });
            }
        }

        // R14 & R15: Anchor PIDs
        if (segmentOrder.length > 0) {
            const firstSegId = segmentOrder[0];
            if (segmentMap[firstSegId] === false) {
                errors.push({ Rule: "R14_ANCHOR_START", Row: "FIRST_SEGMENT", Message: `Anchor PID '${anchorPid}' wajib ada di Segmen Pertama (${firstSegId}). File ini dimulai dengan project lain/kosong.` });
            }
        }
        segmentOrder.forEach(segId => {
            if (segmentMap[segId] === false) {
                errors.push({ Rule: "R15_ANCHOR_SEGMENT_MISSING", Row: "SEGMENT_CHECK", Message: `Segmen ${segId} tidak memuat Anchor PID '${anchorPid}' sama sekali. Anchor PID wajib ada di setiap segmen.` });
            }
        });

        belowData.forEach((r, i) => {
            const len = r.STRNO_LENGTH;
            const strno = String(r.STRNO || "").trim();
            const abckz = String(r.ABCKZ || "").trim().toUpperCase();

            if (!rule5_Allowed.includes(len)) {
                errors.push({ Rule: "R5_LENGTH", Row: r._rowIndex, Message: `Panjang ${len} tidak valid. STRNO: ${strno}` });
            }
            if (seenStrno.has(strno)) {
                duplicates.add(strno);
                errors.push({ Rule: "R9_DUPLICATE", Row: r._rowIndex, Message: `Duplikat STRNO: ${strno}` });
            } else {
                seenStrno.add(strno);
            }
            const baseMap = { 17: "P", 21: "S", 30: "O" };
            if (baseMap[len]) {
                if (abckz !== baseMap[len]) {
                    errors.push({ Rule: "R7_ABCKZ", Row: r._rowIndex, Message: `Len ${len} harus ABCKZ='${baseMap[len]}', tapi tertulis '${abckz}'` });
                }
            } else if (len === 26) {
                if (strno.length >= 4) {
                    const code = strno.slice(-4, -2).toUpperCase();
                    const suffixMap = {"KU": "U", "JC": "R", "OB": "B", "OP": "L", "OC": "M", "OL": "J", "KT": "N", "TP": "H"};
                    if (suffixMap[code]) {
                        if (abckz !== suffixMap[code]) {
                            errors.push({ Rule: "R7_ABCKZ", Row: r._rowIndex, Message: `Len 26 (Code ${code}) harus ABCKZ='${suffixMap[code]}', tapi tertulis '${abckz}'` });
                        }
                    }
                }
            }

            if (appState.workCenterData && appState.workCenterData.size > 0) {
                const stort = String(r.STORT || "").trim();
                const arbpl = String(r.ARBPL || "").trim();
                
                if (stort && appState.workCenterData.has(stort)) {
                    const expectedArbpl = appState.workCenterData.get(stort);
                    if (arbpl !== expectedArbpl) {
                        errors.push({ Rule: "R12_WORK_CENTER", Row: r._rowIndex, Message: `STORT '${stort}' requires ARBPL '${expectedArbpl}', but found '${arbpl}'` });
                    }
                }
            }
        });

        // R13: Anchor PID Existence
        let anchorPidFound = false;
        for (const r of belowData) {
            if (r.STRNO_LENGTH === 30) {
                const p = String(r.PLTXT || "").toUpperCase().trim();
                if (p.includes(anchorPid)) {
                    anchorPidFound = true;
                    break;
                }
            }
        }

        if (!anchorPidFound) {
            errors.push({ Rule: "R13_ANCHOR_PID_MISSING", Row: "GLOBAL", Message: `Anchor PID '${anchorPid}' (dari Nama File) tidak ditemukan sama sekali pada data Core (STRNO 30, kolom PLTXT). Pastikan nama file sesuai isi.` });
        }

        let segmentBuffer = [];
        for (let i = 0; i <= belowData.length; i++) {
            const r = belowData[i];
            const is30 = r && r.STRNO_LENGTH === 30;

            if (is30) {
                segmentBuffer.push({ idx: r._rowIndex, pltxt: r.PLTXT, strno: r.STRNO });
            } else {
                if (segmentBuffer.length > 0) {
                    const allEmpty = segmentBuffer.every(item => isEmpty(item.pltxt));
                    if (allEmpty) {
                        const startRow = segmentBuffer[0].idx;
                        const endRow = segmentBuffer[segmentBuffer.length-1].idx;
                        errors.push({ Rule: "R6_NO_PID_FOUND", Row: `${startRow}-${endRow}`, Message: `Tidak ditemukan PID pada segmen ini. Seluruh core pada rentetan kabel '${segmentBuffer[0].strno}' hingga akhir dibiarkan kosong.` });
                    }
                }
                segmentBuffer = [];
            }
        }

        let displayData = [];
        if (workbook.SheetNames.includes('display_ring')) {
            const rawDisplay = XLSX.utils.sheet_to_json(workbook.Sheets['display_ring'], { defval: "" });
            displayData = rawDisplay.map(r => {
                const newRow = {};
                Object.keys(r).forEach(k => newRow[k.toUpperCase().trim()] = r[k]);
                newRow._uuid = crypto.randomUUID(); // --- MODIFIKASI: Tambahan UUID untuk display_ring ---
                return newRow;
            });

            let lastPidCounts = null; 
            let lastCableId = null;

            const colsCheck = ["LINK_DESCRIPTION", "LINK_FRM_FLOC", "LINK_TO_FLOC", "FUNCTIONAL_LOCATION_LINK_OBJECT"];
            displayData.forEach((r, i) => {
                colsCheck.forEach(col => {
                    if (r[col]) { 
                        const val = String(r[col] || "").trim();
                        if (val && !seenStrno.has(val)) {
                            errors.push({ Rule: "R10_CROSS_CHECK", Row: excelRow(i), Message: `Sheet 'display_ring' kol '${col}': Nilai '${val}' tidak ditemukan di 'below_ring'.` });
                        }
                    }
                });

                const cableId = r['LINK_DESCRIPTION'];
                if (cableId) {
                    const cores = belowData.filter(b => {
                        const s = String(b.STRNO || "");
                        const p = String(b.PLTXT || "");
                        return s.startsWith(cableId) && s.length >= 30 && p && p.trim() !== "";
                    });
                    
                    const currentPidCounts = {};
                    cores.forEach(c => {
                        const pid = c.PLTXT;
                        if (!pid.toUpperCase().includes("KABEL")) {
                            currentPidCounts[pid] = (currentPidCounts[pid] || 0) + 1;
                        }
                    });

                    if (lastPidCounts) {
                        for (const pid in lastPidCounts) {
                            if (currentPidCounts.hasOwnProperty(pid)) {
                                const countLast = lastPidCounts[pid];
                                const countCurr = currentPidCounts[pid];
                                
                                if (countLast !== countCurr) {
                                    errors.push({ Rule: "R11_PID_CONSISTENCY", Row: excelRow(i), Message: `Inkonsistensi PID ${pid} antar Segmen: ${lastCableId} (${countLast} core) -> ${cableId} (${countCurr} core).` });
                                }
                            }
                        }
                    }
                    lastPidCounts = currentPidCounts;
                    lastCableId = cableId;
                }
            });

            // R20: Chain Break Warning
            for (let i = 1; i < displayData.length; i++) {
                const prev = displayData[i - 1];
                const curr = displayData[i];
                
                const prevTo = String(prev['LINK_TO_FUNCTIONAL_LOCATION_DESC'] || "").trim();
                const currFrom = String(curr['LINK_FROM_FUNCTIONAL_LOCATION_DESC'] || "").trim();

                if (prevTo !== currFrom) {
                    warnings.push({ Rule: "R20_DISPLAY_CHAIN", Row: excelRow(i), Message: `Chain Break: 'LINK_FROM_DESC' (${currFrom}) tidak menyambung dari 'LINK_TO_DESC' baris sebelumnya (${prevTo}).` });
                }
            }
        }

        // --- FINAL STATUS ---
        let statusStr = "PASS";
        if (errors.length > 0) statusStr = "FAIL";
        else if (warnings.length > 0) statusStr = "WARNING";

        appState.stats.total++;
        if(statusStr === "PASS") {
            appState.stats.pass++;
            GameSystem.addXP(10, "Validation Passed");
        } else if (statusStr === "FAIL") {
            appState.stats.fail++;
        } else {
            appState.stats.warning++; 
        }
        updateDashboardUI();

        const newWb = XLSX.utils.book_new();
        
        // --- MODIFIKASI: Hapus _uuid saat akan di-export agar tidak muncul di file Excel ---
        const exportBelowData = belowData.map(r => {
            const { STRNO_LENGTH, _rowIndex, _uuid, ...rest } = r; 
            return rest;
        });

        const allKeys = Object.keys(exportBelowData[0]);
        const headerOrder = ['STRNO', ...allKeys.filter(k => k!=='STRNO')]; 
        
        const sapTxt = buildSapTxtFromRows(exportBelowData, headerOrder);

        const wsBelow = XLSX.utils.json_to_sheet(exportBelowData, { header: headerOrder });
        XLSX.utils.book_append_sheet(newWb, wsBelow, "below_ring");

        if (displayData.length) {
            // --- MODIFIKASI: Hapus _uuid dari data display_ring untuk export ---
            const exportDisplayData = displayData.map(r => {
                const { _uuid, ...rest } = r;
                return rest;
            });
            const wsDisplay = XLSX.utils.json_to_sheet(exportDisplayData);
            XLSX.utils.book_append_sheet(newWb, wsDisplay, "display_ring");
        }

        if (errors.length > 0) {
            const wsErr = XLSX.utils.json_to_sheet(errors);
            XLSX.utils.book_append_sheet(newWb, wsErr, "ERROR_LOG");
        }
        
        if (warnings.length > 0) {
             const wsWarn = XLSX.utils.json_to_sheet(warnings);
             XLSX.utils.book_append_sheet(newWb, wsWarn, "WARNING_LOG");
        }

        const summary = [
            { ITEM: "STATUS", VALUE: statusStr },
            { ITEM: "TOTAL_ERRORS", VALUE: errors.length },
            { ITEM: "TOTAL_WARNINGS", VALUE: warnings.length },
            { ITEM: "CHECKED_SHEETS", VALUE: "below_ring, display_ring" }
        ];
        const wsSum = XLSX.utils.json_to_sheet(summary);
        XLSX.utils.book_append_sheet(newWb, wsSum, "VALIDATION_SUMMARY");

        appState.processed[file.name] = {
            fileName: file.name,
            wb: newWb, 
            belowData: belowData,
            displayData: displayData,
            pid: anchorPid, 
            status: statusStr,
            errors: errors,
            warnings: warnings, 
            sapTxt: sapTxt,
            rowId: rowId,
            isManuallyOverridden: false 
        };
        
        appState.processedKeys = Object.keys(appState.processed);

        // UI Updates
        updateRowStatusUI(rowId, appState.processed[file.name]);
        updateTableRowVerifiedStatus(rowId, anchorPid);

        if (statusStr === "PASS") {
             msgCell.innerHTML = "<span class='text-green-600 dark:text-green-400 font-medium'><i class='fa-solid fa-check-circle mr-1'></i> Validated Successfully</span>";
        } else if (statusStr === "WARNING") {
             msgCell.innerHTML = `<span class='text-orange-600 dark:text-orange-400 font-medium'><i class='fa-solid fa-triangle-exclamation mr-1'></i> Found ${warnings.length} warnings</span>`;
        } else {
             msgCell.innerHTML = `<span class='text-red-600 dark:text-red-400 font-medium'><i class='fa-solid fa-xmark mr-1'></i> Found ${errors.length} errors</span>`;
        }

        if(window.currentQueueFilter && window.currentQueueFilter !== 'all') {
            filterQueueTable();
        } else if(document.getElementById('queueSearch') && document.getElementById('queueSearch').value.trim() !== "") {
            filterQueueTable();
        }

    } catch (err) {
        console.error(err);
        statusCell.innerHTML = `<span class="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 py-1 px-3 rounded-md text-xs font-bold uppercase">Error</span>`;
        msgCell.innerText = err.message;
        verifiedCell.innerHTML = "-";
        actionCell.innerHTML = "-";
        appState.stats.total++;
        appState.stats.fail++;
        updateDashboardUI();
    }
}

// --- EXPORT REPORTS & SAP ---
export function downloadSummaryReport() {
    if (Object.keys(appState.processed).length === 0) {
        alert("Tidak ada data validasi untuk diunduh.");
        return;
    }

    const summaryData = Object.values(appState.processed).map((item) => {
        const pid = item.pid || item.fileName.replace(/\.[^/.]+$/, "");

        let cekAsset = "NY OK";
        if(item.status === "PASS") cekAsset = "Done Upload SAP (Cek)";
        else if(item.status === "WARNING") cekAsset = "Done (WARNING)";

        let remarks = "";
        const allIssues = [...item.errors, ...(item.warnings || [])];

        if (allIssues.length > 0) {
            const messages = allIssues.map(e => e.Message);
            const uniqueMessages = [...new Set(messages)];
            remarks = uniqueMessages.join("; ");
        } else if (item.status === "PASS") {
            remarks = "No Issues Found";
        }

        return {
            PID: pid,
            "Cek Asset": cekAsset,
            Remarks: remarks
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(summaryData);
    
    ws['!cols'] = [{wch: 25}, {wch: 25}, {wch: 100}];

    XLSX.utils.book_append_sheet(wb, ws, "SUMMARY");
    XLSX.writeFile(wb, "SUMMARY_REPORT.xlsx");
}

export async function downloadSapBatch(type, mode) {
    if (Object.keys(appState.processed).length === 0) {
        alert("Belum ada file yang diproses.");
        return;
    }

    const eligible = Object.values(appState.processed).filter(item => {
        if (type === 'all') return true;
        if (type === 'pass') return item.status === 'PASS';
        if (type === 'fail') return item.status === 'FAIL';
        return false;
    });

    if (eligible.length === 0) {
        alert("Tidak ada file yang sesuai kriteria.");
        return;
    }

    if (mode === 'merge') {
        const mergedNameInput = document.getElementById('sapMergedFilename')?.value?.trim();
        const firstBase = eligible[0].pid || eligible[0].fileName.replace(/\.[^/.]+$/, "");
        let outName = mergedNameInput || (firstBase + "_SAP_MERGED_PASS.txt");
        if (!outName.toLowerCase().endsWith('.txt')) outName += '.txt';

        const mergedLines = [];
        for (let i = 0; i < eligible.length; i++) {
            const item = eligible[i];
            if (!item.sapTxt) continue;
            const lines = item.sapTxt.split(/\r?\n/);
            if (lines.length === 0) continue;
            if (mergedLines.length === 0) mergedLines.push(...lines);
            else mergedLines.push(...lines.slice(1)); 
        }

        if (mergedLines.length === 0) {
            alert("Tidak ada konten SAP TXT yang bisa digabung.");
            return;
        }
        triggerTextDownload(mergedLines.join('\r\n'), outName);
        return;
    }

    if (!confirm(`Akan mengunduh ${eligible.length} file TXT. Pastikan Anda mengizinkan 'Automatic Downloads' di browser Anda.\n\nLanjutkan?`)) {
        return;
    }

    for (let i = 0; i < eligible.length; i++) {
        const item = eligible[i];
        if (!item.sapTxt) continue;
        const base = item.pid || item.fileName.replace(/\.[^/.]+$/, "");
        triggerTextDownload(item.sapTxt, base + ".txt");
        await new Promise(resolve => setTimeout(resolve, 250));
    }
}
