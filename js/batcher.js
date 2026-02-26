import { batcherState } from './store.js';

// Catatan: Fungsi showToast dan handleFiles nantinya perlu di-import 
// dari ui.js atau main.js setelah modul tersebut dibuat.
// import { showToast } from './ui.js';
// import { handleFiles } from './validator.js';

/**
 * Inisialisasi Event Listeners untuk fitur Batcher.
 * Panggil di main.js setelah DOM siap.
 */
export function initBatcher() {
    const masterInput = document.getElementById('batchMasterInput');
    const folderInput = document.getElementById('batchFolderInput');

    if (masterInput) {
        masterInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            batcherState.targetFiles.clear();
            let targets = [];

            if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
                const text = await file.text();
                // Assuming comma, semi-colon or newline separated
                const lines = text.split(/[\r\n]+/);
                lines.forEach(line => {
                     // Simple heuristic: take first non-empty token
                     const token = line.split(/[;,]/)[0].trim();
                     if(token) targets.push(token);
                });
            } else {
                const ab = await file.arrayBuffer();
                const wb = XLSX.read(ab, {type: 'array'});
                const ws = wb.Sheets[wb.SheetNames[0]];
                // Assuming column A is the target filename
                const data = XLSX.utils.sheet_to_json(ws, {header: 1});
                data.forEach(row => {
                    if(row[0]) targets.push(String(row[0]).trim());
                });
            }
            
            targets.forEach(t => batcherState.targetFiles.add(normalizeName(t)));
            
            document.getElementById('masterCount').innerText = batcherState.targetFiles.size;
            document.getElementById('masterListStat').classList.remove('hidden');
        });
    }

    if (folderInput) {
        folderInput.addEventListener('change', (e) => {
            batcherState.folderMap.clear();
            const files = Array.from(e.target.files);
            
            // Indexing logic
            files.forEach(f => {
                if(f.name.match(/\.(xls|xlsx)$/i) && !f.name.startsWith("~$")) {
                    const key = normalizeName(f.name);
                    batcherState.folderMap.set(key, f);
                }
            });

            document.getElementById('folderCount').innerText = batcherState.folderMap.size;
            document.getElementById('folderStat').classList.remove('hidden');
        });
    }
}

// --- HELPER ---
function normalizeName(name) {
    // Remove extension and common clutter
    return name.replace(/\.(xlsx|xls|csv)$/i, '').trim().toUpperCase();
}

// --- CORE LOGIC ---
export function runBatchMatching() {
    if (batcherState.targetFiles.size === 0) {
        alert("Please upload a Master List first.");
        return;
    }
    if (batcherState.folderMap.size === 0) {
        alert("Please select a Source Folder first.");
        return;
    }

    const batchSizeInput = document.getElementById('batchSizeInput');
    const batchSize = parseInt(batchSizeInput ? batchSizeInput.value : 50) || 50;
    
    const foundFiles = [];
    batcherState.missingFiles = []; // Reset missing list
    let missing = 0;

    // Checking Match
    batcherState.targetFiles.forEach(target => {
        if (batcherState.folderMap.has(target)) {
            foundFiles.push(batcherState.folderMap.get(target));
        } else {
            missing++;
            batcherState.missingFiles.push(target);
        }
    });

    // Update Stats
    document.getElementById('matchCount').innerText = foundFiles.length;
    document.getElementById('missingCount').innerText = missing;
    batcherState.matchCount = foundFiles.length;
    batcherState.missingCount = missing;

    // Show "View Missing" button if there are missing files
    const btnViewMissing = document.getElementById('btnViewMissing');
    if (btnViewMissing) {
        if (missing > 0) {
            btnViewMissing.classList.remove('hidden');
        } else {
            btnViewMissing.classList.add('hidden');
        }
    }

    // Create Batches
    batcherState.batches = [];
    for (let i = 0; i < foundFiles.length; i += batchSize) {
        batcherState.batches.push(foundFiles.slice(i, i + batchSize));
    }

    document.getElementById('batchCountDisplay').innerText = batcherState.batches.length;
    renderBatchList();
    
    // Toggle "Send All" and "Download Manifest" buttons
    const btnSendAll = document.getElementById('btnSendAllBatch');
    const btnDownloadManifest = document.getElementById('btnDownloadManifest');
    
    if(foundFiles.length > 0) {
         if (btnSendAll) btnSendAll.classList.remove('hidden');
         if (btnDownloadManifest) btnDownloadManifest.classList.remove('hidden');
    } else {
         if (btnSendAll) btnSendAll.classList.add('hidden');
         // If there are missing files but no matches, we still want to allow downloading the report (for the missing part)
         if(missing === 0) {
             if (btnDownloadManifest) btnDownloadManifest.classList.add('hidden');
         } else {
             if (btnDownloadManifest) btnDownloadManifest.classList.remove('hidden');
         }
    }
}

export function viewMissingFiles() {
    const listContainer = document.getElementById('missingFilesList');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    batcherState.missingFiles.forEach(name => {
        const li = document.createElement('li');
        li.className = "border-b border-gray-100 dark:border-gray-800 last:border-0 py-1";
        li.textContent = name;
        listContainer.appendChild(li);
    });
    
    const modal = document.getElementById('missingFilesModal');
    if (modal) modal.classList.remove('hidden');
}

export function downloadBatchManifest() {
    const wb = XLSX.utils.book_new();

    // 1. Summary Sheet
    const summaryData = [
        { Metric: "Total Targets (Master List)", Value: batcherState.targetFiles.size },
        { Metric: "Total Files in Folder", Value: batcherState.folderMap.size },
        { Metric: "Matches Found", Value: batcherState.matchCount },
        { Metric: "Missing Items", Value: batcherState.missingCount },
        { Metric: "Batches Created", Value: batcherState.batches.length }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // 2. Batch Details Sheet
    const batchRows = [];
    batcherState.batches.forEach((batch, batchIdx) => {
        batch.forEach(file => {
            batchRows.push({
                Batch_Number: batchIdx + 1,
                File_Name: file.name,
                Size_KB: (file.size / 1024).toFixed(2)
            });
        });
    });
    if(batchRows.length > 0) {
        const wsBatches = XLSX.utils.json_to_sheet(batchRows);
        XLSX.utils.book_append_sheet(wb, wsBatches, "Batch_Distribution");
    }

    // 3. Missing Files Sheet
    if(batcherState.missingFiles.length > 0) {
        const missingRows = batcherState.missingFiles.map(f => ({ Missing_PID: f }));
        const wsMissing = XLSX.utils.json_to_sheet(missingRows);
        XLSX.utils.book_append_sheet(wb, wsMissing, "Missing_Items");
    }

    XLSX.writeFile(wb, "Batch_Processing_Report.xlsx");
}

function renderBatchList() {
    const container = document.getElementById('batchListContainer');
    if (!container) return;

    container.innerHTML = '';

    if (batcherState.batches.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-10 italic">No matches found based on current inputs.</div>';
        return;
    }

    batcherState.batches.forEach((batch, index) => {
        const div = document.createElement('div');
        div.className = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex justify-between items-center shadow-sm hover:shadow-md transition";
        // Perhatikan event onclick="sendBatchToValidator(${index})" 
        // nantinya di main.js Anda perlu melakukan binding ke window jika dipanggil via inline HTML,
        // atau kita ubah nanti untuk menambahkan event listener dinamis.
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300 flex items-center justify-center font-bold text-xs">
                    ${index + 1}
                </div>
                <div>
                    <h4 class="text-sm font-bold text-slate-700 dark:text-gray-200">Batch #${index + 1}</h4>
                    <p class="text-xs text-gray-400">${batch.length} files</p>
                </div>
            </div>
            <button onclick="window.sendBatchToValidator(${index})" class="bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-xs font-semibold px-3 py-1.5 rounded border border-blue-100 dark:border-blue-900/30 transition">
                Process <i class="fa-solid fa-arrow-right ml-1"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

export function sendBatchToValidator(batchIndex) {
    let filesToSend = [];
    if (batchIndex === 'all') {
        if(!confirm("Are you sure you want to process ALL " + batcherState.matchCount + " files? This might take a while.")) return;
        // Flatten all batches
        batcherState.batches.forEach(b => filesToSend.push(...b));
    } else {
        filesToSend = batcherState.batches[batchIndex];
    }

    if (!filesToSend || filesToSend.length === 0) return;

    // 1. Switch Tab
    const tabBtn = document.getElementById('tabBtnValidator');
    if (tabBtn) tabBtn.click();
    
    // 2. Trigger Handle Files Logic (akan dipanggil dari global / main.js)
    if (typeof window.handleFiles === 'function') {
        window.handleFiles(filesToSend);
    }
    
    if (typeof window.showToast === 'function') {
        window.showToast(`Transferred ${filesToSend.length} files to Validator Queue`, 'success');
    }
}