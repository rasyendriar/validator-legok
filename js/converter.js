import { triggerDownload } from './utils.js';

// --- STATE ---
let filesToProcess = [];
let currentInputMode = 'excel'; // 'excel' or 'text'

// --- UI ELEMENTS ---
let dropZone, fileInput, fileList, fileListContainer, fileCountSpan;
let convertBtn, clearBtn, statusLog, modeInputs, filenameContainer;
let customFilenameInput, dropIcon, acceptText, modeExcelBtn, modeTextBtn;

/**
 * Inisialisasi Event Listener dan referensi DOM untuk Universal Converter.
 * Panggil fungsi ini di main.js setelah DOMContentLoaded.
 */
export function initConverter() {
    // Mapping UI Elements
    dropZone = document.getElementById('dropZone');
    fileInput = document.getElementById('fileInput');
    fileList = document.getElementById('fileList');
    fileListContainer = document.getElementById('fileListContainer');
    fileCountSpan = document.getElementById('fileCount');
    convertBtn = document.getElementById('convertBtn');
    clearBtn = document.getElementById('clearBtn');
    statusLog = document.getElementById('statusLog');
    modeInputs = document.querySelectorAll('input[name="outputMode"]');
    filenameContainer = document.getElementById('filenameContainer');
    customFilenameInput = document.getElementById('customFilename');
    dropIcon = document.getElementById('dropIcon');
    acceptText = document.getElementById('acceptText');
    modeExcelBtn = document.getElementById('modeExcel');
    modeTextBtn = document.getElementById('modeText');

    // --- Event Listeners ---
    if (modeExcelBtn) modeExcelBtn.addEventListener('click', () => switchSourceMode('excel'));
    if (modeTextBtn) modeTextBtn.addEventListener('click', () => switchSourceMode('text'));

    // Toggle Filename Input based on mode
    modeInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            if(e.target.value === 'merge') {
                filenameContainer.classList.remove('opacity-50', 'pointer-events-none');
                customFilenameInput.disabled = false;
            } else {
                filenameContainer.classList.add('opacity-50', 'pointer-events-none');
                customFilenameInput.disabled = true;
                customFilenameInput.value = ''; // Clear when disabled
            }
        });
    });

    // Drag & Drop Effects
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
        });

        dropZone.addEventListener('drop', handleDrop, false);
    }
    
    if (fileInput) fileInput.addEventListener('change', handleSelect, false);

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            filesToProcess = [];
            updateUI();
            statusLog.classList.add('hidden');
            statusLog.innerHTML = '';
        });
    }

    if (convertBtn) {
        convertBtn.addEventListener('click', async () => {
            const mode = document.querySelector('input[name="outputMode"]:checked').value;
            convertBtn.disabled = true;
            convertBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...`;
            statusLog.innerHTML = '';

            try {
                if (mode === 'merge') {
                    await processMergeMode();
                } else {
                    await processSeparateMode();
                }
            } catch (error) {
                log(`Critical Error: ${error.message}`, 'error');
            } finally {
                convertBtn.disabled = false;
                convertBtn.innerHTML = `<span>Run Conversion</span> <i class="fa-solid fa-arrow-right"></i>`;
            }
        });
    }

    // Export removeFile to window scope so HTML inline onclick="removeFile(index)" works
    window.removeFile = (index) => {
        filesToProcess.splice(index, 1);
        updateUI();
    };
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const newFiles = dt.files;
    handleFiles(newFiles);
}

function handleSelect(e) {
    const newFiles = e.target.files;
    handleFiles(newFiles);
}

function handleFiles(files) {
    if (!files.length) return;
    filesToProcess = [...filesToProcess, ...Array.from(files)];
    updateUI();
}

function updateUI() {
    fileList.innerHTML = '';
    fileCountSpan.textContent = filesToProcess.length;

    if (filesToProcess.length > 0) {
        fileListContainer.classList.remove('hidden');
        convertBtn.disabled = false;
        
        filesToProcess.forEach((file, index) => {
            const size = (file.size / 1024).toFixed(1) + ' KB';
            const iconClass = currentInputMode === 'excel' ? 'fa-file-excel text-emerald-500' : 'fa-file-lines text-slate-500';
            const bgClass = currentInputMode === 'excel' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-slate-100 dark:bg-slate-800';
            
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-700 group hover:border-mitratel-red/30 transition-colors';
            div.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-10 h-10 rounded-lg ${bgClass} flex items-center justify-center ${iconClass} flex-shrink-0">
                        <i class="fa-regular ${iconClass.split(' ')[0]}"></i>
                    </div>
                    <div class="truncate">
                        <p class="font-medium text-slate-700 dark:text-gray-200 truncate text-sm" title="${file.name}">${file.name}</p>
                        <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">${size}</p>
                    </div>
                </div>
                <button onclick="removeFile(${index})" class="w-8 h-8 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition flex items-center justify-center">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            fileList.appendChild(div);
        });
    } else {
        fileListContainer.classList.add('hidden');
        convertBtn.disabled = true;
    }
}

function switchSourceMode(mode) {
    currentInputMode = mode;
    filesToProcess = [];
    updateUI();
    statusLog.classList.add('hidden');
    statusLog.innerHTML = '';

    const activeClass = ['border-2', 'border-mitratel-red', 'bg-red-50', 'dark:bg-red-900/10', 'text-mitratel-red', 'font-semibold'];
    const inactiveClass = ['border', 'border-gray-200', 'dark:border-gray-700', 'text-gray-500', 'dark:text-gray-400'];

    if (mode === 'excel') {
        modeExcelBtn.classList.add(...activeClass);
        modeExcelBtn.classList.remove(...inactiveClass);
        modeTextBtn.classList.remove(...activeClass);
        modeTextBtn.classList.add(...inactiveClass);
        
        fileInput.accept = ".xlsx, .xls";
        acceptText.innerText = "Accepts multiple .xlsx files";
        dropIcon.className = "fa-solid fa-file-excel text-4xl text-emerald-500 mb-3 transition-colors";
    } else {
        modeTextBtn.classList.add(...activeClass);
        modeTextBtn.classList.remove(...inactiveClass);
        modeExcelBtn.classList.remove(...activeClass);
        modeExcelBtn.classList.add(...inactiveClass);

        fileInput.accept = ".txt, .tsv, .csv";
        acceptText.innerText = "Accepts multiple .txt files";
        dropIcon.className = "fa-solid fa-file-lines text-4xl text-slate-400 mb-3 transition-colors";
    }
}

// --- HELPER LOGIC ---
function getProjectID(filename) {
    const regex = /\b\d{2}[A-Z]{2}\d{2}[A-Z]\d{4}\b/i;
    const match = filename.match(regex);
    if (match) return match[0];
    return filename.replace(/\.[^/.]+$/, "");
}

function log(msg, type = 'info') {
    statusLog.classList.remove('hidden');
    const color = type === 'error' ? 'text-red-600' : (type === 'success' ? 'text-emerald-600' : 'text-slate-600 dark:text-gray-400');
    const div = document.createElement('div');
    div.className = `${color} mb-1 flex items-start gap-2`;
    div.innerHTML = `<span class="opacity-50 select-none">></span> <span>${msg}</span>`;
    statusLog.appendChild(div);
    statusLog.scrollTop = statusLog.scrollHeight;
}

// --- DATA PROCESSORS ---
export async function processExcelFile(file) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    
    let sheetName = "below_ring";
    if (!workbook.SheetNames.includes(sheetName)) {
        sheetName = workbook.SheetNames[0];
        log(`  Warning: "below_ring" not found in ${file.name}. Using "${sheetName}".`, 'info');
    }

    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    
    if (!jsonData || jsonData.length === 0) return null;
    return jsonData; // Returns Array of Arrays
}

export async function processTextFile(file) {
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const validLines = lines.filter(line => line.trim() !== "");
    
    if (validLines.length === 0) return null;
    return validLines; // Returns Array of Strings
}

// --- MAIN CONVERT HANDLERS ---
export async function processMergeMode() {
    let combinedData = [];
    let headers = null; // For Excel
    let headerLine = null; // For Text
    let outputFilename = "batch_output.txt";

    const customName = customFilenameInput.value.trim();
    
    for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const isFirstFile = (i === 0);

        if (isFirstFile) {
            if (customName) {
                outputFilename = customName;
                if (!outputFilename.toLowerCase().endsWith('.txt')) {
                    outputFilename += '.txt';
                }
            } else {
                const extractedID = getProjectID(file.name);
                outputFilename = extractedID + "_merged.txt";
            }
        }

        log(`Processing: ${file.name}...`);

        try {
            if (currentInputMode === 'excel') {
                const jsonData = await processExcelFile(file);
                if (!jsonData) { log(`  Skipping: Empty data.`, 'error'); continue; }

                const currentHeaders = jsonData[0];
                const rows = jsonData.slice(1);

                if (isFirstFile) {
                    headers = currentHeaders;
                    combinedData.push(headers.join('\t')); 
                }

                rows.forEach(row => {
                    const tsvRow = row.map(cell => {
                        if (cell === null || cell === undefined) return '';
                        return String(cell).replace(/\t/g, ' ');
                    }).join('\t');
                    if(tsvRow.trim() !== "") combinedData.push(tsvRow);
                });

            } else {
                const lines = await processTextFile(file);
                if (!lines) { log(`  Skipping: Empty file.`, 'error'); continue; }

                if (isFirstFile) {
                    headerLine = lines[0]; 
                    combinedData.push(...lines);
                } else {
                    if (lines.length > 1) {
                        combinedData.push(...lines.slice(1));
                    }
                }
            }

        } catch (err) {
            log(`  Error: ${err.message}`, 'error');
        }
    }

    if (combinedData.length === 0) throw new Error("No data extracted.");
    
    const finalContent = combinedData.join('\r\n');
    triggerDownload(finalContent, outputFilename);
    log(`Done! Merged ${filesToProcess.length} files into ${outputFilename}`, 'success');
}

export async function processSeparateMode() {
    let processedCount = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        log(`Processing: ${file.name}...`);
        
        try {
            const extractedID = getProjectID(file.name);
            const outputFilename = extractedID + ".txt";
            let finalContent = "";

            if (currentInputMode === 'excel') {
                const jsonData = await processExcelFile(file);
                if (!jsonData) continue;

                const rows = jsonData.map(row => {
                     return row.map(cell => {
                        if (cell === null || cell === undefined) return '';
                        return String(cell).replace(/\t/g, ' ');
                    }).join('\t');
                });
                finalContent = rows.join('\r\n');

            } else {
                const lines = await processTextFile(file);
                if (!lines) continue;
                finalContent = lines.join('\r\n');
            }

            await new Promise(r => setTimeout(r, 200));
            triggerDownload(finalContent, outputFilename);
            processedCount++;

        } catch (err) {
            log(`  Error: ${err.message}`, 'error');
        }
    }
    log(`Done! Processed ${processedCount} files separately.`, 'success');
}