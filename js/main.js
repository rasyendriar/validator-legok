import { MASTER_WC_CSV } from './config.js';
import { appState, GameSystem } from './store.js';
import { downloadSingleExcel, triggerTextDownload } from './utils.js';
import { initVisualizer, panViz, changeZoom, resetZoom } from './visualizer.js';
import { handleDrop, handleFiles, startBatchValidation, downloadSummaryReport, downloadSapBatch } from './validator.js';
import { initBatcher, runBatchMatching, viewMissingFiles, downloadBatchManifest, sendBatchToValidator } from './batcher.js';
import { initConverter } from './converter.js';
import {
    toggleDarkMode, initDarkMode, setupMainTabs, switchTab,
    toggleGuide, closeModal, closeMissingFiles, toggleBatchMenu, toggleSapMenu, closeDropdowns,
    setQueueFilter, filterQueueTable, showToast,
    updateDashboardUI, updateRowStatusUI, updateTableRowVerifiedStatus,
    toggleVerification, toggleForceStatus, toggleForceStatusFromViz,
    clearValidatorQueueUI, navigateFile, openVisualizer,
    setLenFilter, filterTable, changePage, downloadRowXlsx
} from './ui.js';

// ==========================================
// 1. MAPPING FUNGSI KE GLOBAL OBJECT WINDOW
// ==========================================
// UI & Navigasi
window.toggleDarkMode = toggleDarkMode;
window.closeDropdowns = closeDropdowns;
window.toggleGuide = toggleGuide;
window.closeModal = closeModal;
window.closeMissingFiles = closeMissingFiles;
window.switchTab = switchTab;
window.setupMainTabs = setupMainTabs;

// Visualizer Modal
window.navigateFile = navigateFile;
window.openVisualizer = openVisualizer;
window.changeZoom = changeZoom;
window.resetZoom = resetZoom;

// Validator Queue & Actions
window.clearValidatorQueue = clearValidatorQueueUI; 
window.startBatchValidation = startBatchValidation;
window.setQueueFilter = setQueueFilter;
window.filterQueueTable = filterQueueTable;
window.toggleVerification = toggleVerification;
window.toggleForceStatus = toggleForceStatus;
window.toggleForceStatusFromViz = toggleForceStatusFromViz;
window.downloadRowXlsx = downloadRowXlsx; // Menambahkan mapping untuk fungsi yang baru kita buat

// Tenant Data Table (Modal)
window.setLenFilter = setLenFilter;
window.filterTable = filterTable;
window.changePage = changePage;

// Download & Export (Dropdown Menus)
window.toggleBatchMenu = toggleBatchMenu;
window.toggleSapMenu = toggleSapMenu;
window.downloadSummaryReport = downloadSummaryReport;
window.downloadSapBatch = downloadSapBatch;

// Batcher Tab
window.runBatchMatching = runBatchMatching;
window.viewMissingFiles = viewMissingFiles;
window.downloadBatchManifest = downloadBatchManifest;
window.sendBatchToValidator = sendBatchToValidator;

// --- FUNGSI DOWNLOAD TAMBAHAN ---
window.downloadSapTxt = function(fileName) {
    const item = appState.processed[fileName];
    if (!item || !item.sapTxt) {
        alert("SAP TXT belum tersedia untuk file ini.");
        return;
    }
    const base = item.pid || fileName.replace(/\.[^/.]+$/, "");
    triggerTextDownload(item.sapTxt, base + ".txt");
};

window.downloadBatch = async function(type) {
    const filesToDownload = [];
    if (Object.keys(appState.processed).length === 0) {
        alert("Belum ada file yang diproses.");
        return;
    }

    for (const key in appState.processed) {
        const item = appState.processed[key];
        let shouldAdd = false;

        if (type === 'all') shouldAdd = true;
        else if (type === 'pass' && item.status === 'PASS') shouldAdd = true;
        else if (type === 'fail' && item.status === 'FAIL') shouldAdd = true;

        if (shouldAdd) {
            filesToDownload.push({
                fileName: "VALIDATED_v4_" + item.fileName,
                wb: item.wb
            });
        }
    }

    if (filesToDownload.length === 0) {
        alert("Tidak ada file yang sesuai kriteria.");
        return;
    }

    if (!confirm(`Akan mengunduh ${filesToDownload.length} file. Pastikan Anda mengizinkan 'Automatic Downloads' di browser Anda.\n\nLanjutkan?`)) {
        return;
    }

    for (let i = 0; i < filesToDownload.length; i++) {
        const file = filesToDownload[i];
        downloadSingleExcel(file.wb, file.fileName);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
};

// ==========================================
// 2. CROSS-MODULE DEPENDENCY BINDING
// ==========================================
window.updateDashboardUI = updateDashboardUI;
window.updateRowStatusUI = updateRowStatusUI;
window.updateTableRowVerifiedStatus = updateTableRowVerifiedStatus;
window.showToast = showToast;
window.handleFiles = handleFiles;

// ==========================================
// 3. INISIALISASI SAAT DOM READY
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    GameSystem.init();
    initDarkMode();
    setupMainTabs();
    initVisualizer();
    initBatcher();
    initConverter();
    setupKeyboardShortcuts();
    
    const lines = MASTER_WC_CSV.split('\n');
    let loadedCount = 0;
    lines.forEach((line, index) => {
        if(index === 0) return; 
        const [stort, arbpl] = line.split(',').map(s => s.trim());
        if(stort && arbpl) {
            appState.workCenterData.set(stort, arbpl);
            loadedCount++;
        }
    });
    console.log(`Loaded ${loadedCount} Work Center rules.`);

    const dropArea = document.getElementById('drop-area');
    const fileElem = document.getElementById('fileElem');

    if (dropArea && fileElem) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
            dropArea.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
        });

        dropArea.addEventListener('drop', handleDrop, false);
        dropArea.addEventListener('click', () => fileElem.click());
        fileElem.addEventListener('change', (e) => handleFiles(e.target.files), false);
    }
});

// ==========================================
// 4. KEYBOARD SHORTCUTS
// ==========================================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('vizModal');
        if (!modal || modal.classList.contains('hidden')) return;

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if(['1','2','3','4'].includes(e.key)) {
            if(e.key === '1') switchTab('viz');
            if(e.key === '2') switchTab('display');
            if(e.key === '3') switchTab('data');
            if(e.key === '4') switchTab('errors');
            return;
        }

        const contentViz = document.getElementById('content-viz');
        const isVizActive = contentViz && !contentViz.classList.contains('hidden');
        
        if (isVizActive) {
            const step = 50;
            switch(e.key.toLowerCase()) {
                case "w": panViz(0, -step); break;
                case "a": panViz(-step, 0); break;
                case "s": panViz(0, step); break;
                case "d": panViz(step, 0); break;
                case "c": changeZoom(0.1); break;
                case "x": changeZoom(-0.1); break;
                case "z": resetZoom(); break;
            }
        }

        switch(e.key) {
            case "q":
            case "Q":
                navigateFile(-1);
                break;
            case "e":
            case "E":
                navigateFile(1);
                break;
            case "Escape":
                closeModal();
                break;
            case "v":
            case "V":
                toggleVerification();
                break;
            case "f":
            case "F":
                toggleForceStatusFromViz();
                break;
        }
    });
}
