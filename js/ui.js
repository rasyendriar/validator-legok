import { appState, GameSystem, SettingsSystem } from './store.js';
import { generateSVG, applyZoom } from './visualizer.js';
import { downloadSingleExcel } from './utils.js';

// ==========================================
// 1. SETTINGS MENU LOGIC
// ==========================================
export function toggleSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal.classList.contains('hidden')) {
        renderSettingsMenu();
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

export function renderSettingsMenu() {
    const container = document.getElementById('settingsContent');
    if (!container) return;
    container.innerHTML = '';

    const settings = appState.ruleSettings;
    
    // Urutkan rule berdasarkan ID (R5, R6... R20)
    const sortedKeys = Object.keys(settings).sort((a, b) => {
        return parseInt(a.substring(1)) - parseInt(b.substring(1));
    });

    sortedKeys.forEach(key => {
        const rule = settings[key];
        const row = document.createElement('div');
        row.className = 'grid grid-cols-12 gap-4 items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700 transition hover:bg-gray-100 dark:hover:bg-gray-800';
        
        row.innerHTML = `
            <div class="col-span-2 font-bold text-xs text-slate-700 dark:text-gray-300">${rule.id}</div>
            <div class="col-span-5 text-sm text-slate-600 dark:text-gray-400">${rule.name}</div>
            <div class="col-span-2 flex justify-center">
                <label class="relative inline-flex items-center cursor-pointer" title="Enable/Disable Rule">
                    <input type="checkbox" class="sr-only peer rule-enabled-toggle" data-rule="${rule.id}" ${rule.enabled ? 'checked' : ''}>
                    <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-mitratel-red"></div>
                </label>
            </div>
            <div class="col-span-3 flex justify-center">
                <select class="rule-severity-select bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs rounded focus:ring-mitratel-red focus:border-mitratel-red block w-full p-1.5 outline-none transition" data-rule="${rule.id}">
                    <option value="FAIL" ${rule.severity === 'FAIL' ? 'selected' : ''}>FAIL</option>
                    <option value="WARNING" ${rule.severity === 'WARNING' ? 'selected' : ''}>WARNING</option>
                </select>
            </div>
        `;
        container.appendChild(row);
    });
}

export function saveSettingsUI() {
    const container = document.getElementById('settingsContent');
    if (!container) return;

    const newSettings = JSON.parse(JSON.stringify(appState.ruleSettings)); // Clone
    
    // Ambil semua toggle status
    const toggles = container.querySelectorAll('.rule-enabled-toggle');
    toggles.forEach(toggle => {
        const ruleId = toggle.getAttribute('data-rule');
        if (newSettings[ruleId]) {
            newSettings[ruleId].enabled = toggle.checked;
        }
    });

    // Ambil semua dropdown severity
    const selects = container.querySelectorAll('.rule-severity-select');
    selects.forEach(select => {
        const ruleId = select.getAttribute('data-rule');
        if (newSettings[ruleId]) {
            newSettings[ruleId].severity = select.value;
        }
    });

    // Simpan ke storage dan state
    SettingsSystem.save(newSettings);
    showToast('Validation settings saved successfully! Changes apply on next validation.', 'success');
    toggleSettingsModal();
}

// ==========================================
// 2. DARK MODE & TABS LOGIC
// ==========================================
export function toggleDarkMode() {
    const html = document.documentElement;
    const icon = document.getElementById('themeIcon');
    
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.theme = 'light';
        if(icon) icon.className = 'fa-regular fa-moon';
    } else {
        html.classList.add('dark');
        localStorage.theme = 'dark';
        if(icon) icon.className = 'fa-regular fa-sun';
    }
}

export function initDarkMode() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        const icon = document.getElementById('themeIcon');
        if(icon) icon.className = 'fa-regular fa-sun';
    } else {
        document.documentElement.classList.remove('dark');
    }
}

export function setupMainTabs() {
    const btnV = document.getElementById('tabBtnValidator');
    const btnB = document.getElementById('tabBtnBatcher');
    const btnC = document.getElementById('tabBtnConverter');
    const tabV = document.getElementById('tab-validator');
    const tabB = document.getElementById('tab-batcher');
    const tabC = document.getElementById('tab-converter');

    if (!btnV || !btnB || !btnC || !tabV || !tabB || !tabC) return;

    function setActive(which) {
        const isV = which === 'validator';
        const isB = which === 'batcher';
        const isC = which === 'converter';
        
        tabV.classList.toggle('hidden', !isV);
        tabB.classList.toggle('hidden', !isB);
        tabC.classList.toggle('hidden', !isC);

        const setStyle = (btn, active) => {
            if(active) {
                btn.classList.add('bg-gray-50', 'text-slate-900', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
                btn.classList.remove('text-slate-500', 'hover:text-slate-900', 'dark:text-gray-400', 'dark:hover:text-white');
            } else {
                btn.classList.add('text-slate-500', 'hover:text-slate-900', 'dark:text-gray-400', 'dark:hover:text-white');
                btn.classList.remove('bg-gray-50', 'text-slate-900', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
            }
        };

        setStyle(btnV, isV);
        setStyle(btnB, isB);
        setStyle(btnC, isC);
    }

    btnV.addEventListener('click', () => setActive('validator'));
    btnB.addEventListener('click', () => setActive('batcher'));
    btnC.addEventListener('click', () => setActive('converter'));
}

export function switchTab(tab) {
    const btnViz = document.getElementById('tab-viz');
    const btnDisplay = document.getElementById('tab-display');
    const btnData = document.getElementById('tab-data');
    const btnErrors = document.getElementById('tab-errors');
    
    const divViz = document.getElementById('content-viz');
    const divDisplay = document.getElementById('content-display');
    const divData = document.getElementById('content-data');
    const divErrors = document.getElementById('content-errors');

    [btnViz, btnDisplay, btnData, btnErrors].forEach(btn => {
        if(btn) {
            btn.className = "nav-btn py-4 text-sm font-medium text-gray-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition whitespace-nowrap";
            btn.classList.remove('active', 'text-mitratel-red', 'font-semibold');
        }
    });
    [divViz, divDisplay, divData, divErrors].forEach(div => {
        if(div) div.classList.add('hidden');
    });

    let activeBtn;
    if (tab === 'viz' && btnViz && divViz) {
        activeBtn = btnViz;
        divViz.classList.remove('hidden');
    } else if (tab === 'display' && btnDisplay && divDisplay) {
        activeBtn = btnDisplay;
        divDisplay.classList.remove('hidden');
    } else if (tab === 'data' && btnData && divData) {
        activeBtn = btnData;
        divData.classList.remove('hidden');
        renderTablePage();
        updatePaginationInfo(); 
    } else if (tab === 'errors' && btnErrors && divErrors) {
        activeBtn = btnErrors;
        divErrors.classList.remove('hidden');
    }

    if (activeBtn) {
        activeBtn.classList.add('active', 'text-mitratel-red', 'font-semibold');
        activeBtn.classList.remove('text-gray-500');
    }
}

// ==========================================
// 3. MODALS, DROPDOWNS & TOASTS
// ==========================================
export function toggleGuide() { document.getElementById('guideModal').classList.toggle('hidden'); }
export function closeModal() { document.getElementById('vizModal').classList.add('hidden'); }
export function closeMissingFiles() { document.getElementById('missingFilesModal').classList.add('hidden'); }

export function toggleBatchMenu(e) {
    e.stopPropagation();
    document.getElementById('batchMenu').classList.toggle('hidden');
}

export function toggleSapMenu(e) {
    e.stopPropagation();
    document.getElementById('sapMenu').classList.toggle('hidden');
}

export function closeDropdowns(e) {
    if (!e.target.closest('#batchMenu') && !e.target.closest('button[onclick="window.toggleBatchMenu(event)"]')) {
        const batchMenu = document.getElementById('batchMenu');
        if(batchMenu) batchMenu.classList.add('hidden');
    }
    if (!e.target.closest('#sapMenu') && !e.target.closest('button[onclick="window.toggleSapMenu(event)"]')) {
        const sapMenu = document.getElementById('sapMenu');
        if(sapMenu) sapMenu.classList.add('hidden');
    }
}

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;

    const toast = document.createElement('div');
    
    let bgClass = type === 'success' ? 'bg-emerald-500' : 'bg-blue-500';
    if (type === 'error') bgClass = 'bg-red-500';
    if (type === 'warning') bgClass = 'bg-orange-500';

    toast.className = `toast ${bgClass} text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2`;
    toast.innerHTML = `<i class="fa-solid fa-bell"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
}

// ==========================================
// 4. MAIN QUEUE DASHBOARD UI
// ==========================================
export let currentQueueFilter = 'all';

export function setQueueFilter(status) {
    currentQueueFilter = status;
    
    ['all', 'pass', 'fail', 'warning'].forEach(s => {
        const btn = document.getElementById(`filter-btn-${s.toLowerCase()}`);
        if(!btn) return;

        if (s.toUpperCase() === status.toUpperCase() || (s === 'all' && status === 'all')) {
            if(s === 'all') btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 text-white shadow-md transform scale-105 transition-all";
            if(s === 'pass') btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg bg-green-500 text-white shadow-md transform scale-105 transition-all";
            if(s === 'fail') btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg bg-mitratel-red text-white shadow-md transform scale-105 transition-all";
            if(s === 'warning') btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg bg-orange-500 text-white shadow-md transform scale-105 transition-all";
        } else {
            btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-all";
        }
    });
    filterQueueTable();
}

export function filterQueueTable() {
    const input = document.getElementById('queueSearch');
    if(!input) return;
    const filter = input.value.toUpperCase();
    const table = document.getElementById('result-body');
    if(!table) return;
    const tr = table.getElementsByTagName('tr');

    for (let i = 0; i < tr.length; i++) {
        const tdName = tr[i].getElementsByTagName("td")[1]; 
        const tdStatus = tr[i].getElementsByTagName("td")[2]; 
        
        if (tdName && tdStatus) {
            const txtValue = tdName.textContent || tdName.innerText;
            const statusText = tdStatus.textContent || tdStatus.innerText;
            
            const matchesSearch = txtValue.toUpperCase().indexOf(filter) > -1;
            let matchesFilter = true;

            if (currentQueueFilter !== 'all') {
                if (!statusText.toUpperCase().includes(currentQueueFilter.toUpperCase())) {
                    matchesFilter = false;
                }
            }

            if (matchesSearch && matchesFilter) {
                tr[i].style.display = "";
                tr[i].classList.add("animate-fade-in");
            } else {
                tr[i].style.display = "none";
                tr[i].classList.remove("animate-fade-in");
            }
        }       
    }
}

export function recalculateStats() {
    let total = 0, pass = 0, fail = 0, warning = 0;
    Object.values(appState.processed).forEach(item => {
        total++;
        if (item.status === 'PASS') pass++;
        else if (item.status === 'WARNING') warning++;
        else fail++;
    });
    appState.stats = { total, pass, fail, warning };
    updateDashboardUI();
}

export function updateDashboardUI() {
    const el = (id) => document.getElementById(id);
    
    if(el('stat-total')) el('stat-total').innerText = appState.stats.total;
    if(el('stat-pass')) el('stat-pass').innerText = appState.stats.pass;
    if(el('stat-fail')) el('stat-fail').innerText = appState.stats.fail;
    if(el('stat-warning')) el('stat-warning').innerText = appState.stats.warning; 
    
    if(el('badge-all')) el('badge-all').innerText = appState.stats.total;
    if(el('badge-pass')) el('badge-pass').innerText = appState.stats.pass;
    if(el('badge-fail')) el('badge-fail').innerText = appState.stats.fail;

    if (el('badge-sap-all')) el('badge-sap-all').innerText = appState.stats.total;
    if (el('badge-sap-pass')) el('badge-sap-pass').innerText = appState.stats.pass;
}

export function clearValidatorQueueUI() {
    if(!confirm("Are you sure you want to clear all files from the queue?")) return;

    appState.queue = [];
    appState.processed = {};
    appState.processedKeys = [];
    appState.stats = { total: 0, pass: 0, fail: 0, warning: 0 };
    
    document.getElementById('result-body').innerHTML = '';
    document.getElementById('btnStartValidation').classList.add('hidden');
    document.getElementById('summary-dashboard').classList.add('hidden');
    document.getElementById('groupActions').classList.add('hidden');
    document.getElementById('btnClearFiles').classList.add('hidden');
    document.getElementById('fileElem').value = '';
}

// ==========================================
// 5. ROW STATUS & ACTIONS UI
// ==========================================
export function downloadRowXlsx(fileName) {
    const item = appState.processed[fileName];
    if(item && item.wb) {
        downloadSingleExcel(item.wb, `VALIDATED_v4_${item.fileName}`);
    }
}

export function updateRowStatusUI(rowId, item) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const statusCell = row.cells[2];
    const actionCell = row.cells[5];

    let statusClass = "";
    if (item.status === 'PASS') {
        statusClass = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    } else if (item.status === 'WARNING') {
        statusClass = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
    } else {
        statusClass = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    }
    
    let statusHtml = `<span class="${statusClass} py-1 px-3 rounded-md text-xs font-bold uppercase tracking-wider">${item.status}</span>`;
    if (item.isManuallyOverridden) {
        statusHtml += `<div class="text-[9px] text-gray-500 mt-1"><i class="fa-solid fa-gavel"></i> Manual</div>`;
    }
    statusCell.innerHTML = statusHtml;

    const toggleIcon = item.status === 'PASS' ? 'fa-thumbs-down' : 'fa-thumbs-up';
    const toggleTitle = item.status === 'PASS' ? 'Force Fail' : 'Force Pass';
    const toggleColor = item.status === 'PASS' ? 'text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50';

    actionCell.innerHTML = `
        <div class="flex items-center justify-center gap-2">
            <button onclick="window.openVisualizer('${item.fileName}')" class="bg-slate-100 hover:bg-slate-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-700 dark:text-white p-2 rounded-lg transition" title="Visualize">
               <i class="fa-solid fa-eye"></i>
            </button>
            <button onclick="window.toggleForceStatus('${item.fileName}')" class="bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-600 ${toggleColor} p-2 rounded-lg transition" title="${toggleTitle}">
               <i class="fa-solid ${toggleIcon}"></i>
            </button>
            <button onclick="window.downloadRowXlsx('${item.fileName}')" class="bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-300 p-2 rounded-lg transition" title="Download XLSX">
               <i class="fa-solid fa-file-excel"></i>
            </button>
            <button onclick="window.downloadSapTxt('${item.fileName}')" class="bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 p-2 rounded-lg transition" title="Download SAP TXT">
               <i class="fa-solid fa-file-code"></i>
            </button>
        </div>
    `;
}

export function toggleForceStatus(fileName) {
    const item = appState.processed[fileName];
    if(!item) return;

    if (item.status === 'PASS' || item.status === 'WARNING') {
        item.status = 'FAIL';
        item.isManuallyOverridden = true;
        item.originalStatus = item.originalStatus || 'PASS';
    } else {
        item.status = 'PASS';
        item.isManuallyOverridden = true;
        item.originalStatus = item.originalStatus || 'FAIL';
    }

    recalculateStats();
    updateRowStatusUI(item.rowId, item);
    
    const modal = document.getElementById('vizModal');
    if (appState.targetPID === item.pid && modal && !modal.classList.contains('hidden')) {
        updateVizStatusHeader(item);
        updateForceToggleButton(item);
    }

    showToast(`Status updated to ${item.status}`, item.status === 'PASS' ? 'success' : 'error');
}

export function toggleForceStatusFromViz() {
    const pid = appState.targetPID;
    const item = Object.values(appState.processed).find(p => p.pid === pid);
    if (item) toggleForceStatus(item.fileName);
}

export function toggleVerification() {
    const pid = appState.targetPID;
    if(!pid) return;

    if (GameSystem.isVerified(pid)) {
        GameSystem.unmarkVerified(pid);
        updateVerifyButton(false);
    } else {
        GameSystem.markVerified(pid);
        updateVerifyButton(true);
    }
    
    const processedItem = Object.values(appState.processed).find(p => p.pid === pid);
    if(processedItem && processedItem.rowId) {
        updateTableRowVerifiedStatus(processedItem.rowId, pid);
    }
}

export function updateVerifyButton(isVerified) {
    const btn = document.getElementById('btnVerifyStructure');
    if(!btn) return;
    if (isVerified) {
        btn.className = "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-all bg-green-100 text-green-700 border-green-200 hover:bg-green-200";
        btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Structure Verified`;
    } else {
        btn.className = "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-all bg-white dark:bg-gray-800 text-gray-500 border-gray-300 dark:border-gray-600 hover:border-mitratel-red hover:text-mitratel-red";
        btn.innerHTML = `<i class="fa-regular fa-square"></i> Mark Verified`;
    }
}

export function updateTableRowVerifiedStatus(rowId, pid) {
    const row = document.getElementById(rowId);
    if(!row) return;
    const cell = row.cells[3]; 
    if(GameSystem.isVerified(pid)) {
        cell.innerHTML = `<span class="text-emerald-500 text-lg" title="Manually Verified"><i class="fa-solid fa-circle-check"></i></span>`;
    } else {
        cell.innerHTML = `<span class="text-gray-300 text-lg"><i class="fa-regular fa-circle"></i></span>`;
    }
}

export function updateVizStatusHeader(item) {
    const badge = document.getElementById('vizStatusBadge');
    if(!badge) return;
    badge.innerText = item.status;
    if (item.status === 'PASS') {
        badge.className = "font-bold text-xs px-2 py-1 rounded uppercase bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
    } else if (item.status === 'WARNING') {
        badge.className = "font-bold text-xs px-2 py-1 rounded uppercase bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300";
    } else {
        badge.className = "font-bold text-xs px-2 py-1 rounded uppercase bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
    }
    if (item.isManuallyOverridden) {
        badge.classList.add('status-badge-manual');
        badge.innerHTML += ` <i class="fa-solid fa-gavel ml-1" title="Manually Overridden"></i>`;
    }
}

export function updateForceToggleButton(item) {
    const btn = document.getElementById('btnForceToggleViz');
    if(!btn) return;
    btn.classList.remove('hidden'); 
    if (item.status === 'PASS') {
        btn.innerHTML = `<i class="fa-solid fa-thumbs-down text-red-500"></i> Force Fail`;
        btn.className = "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-all bg-white hover:bg-red-50 border-red-200 text-red-600 dark:bg-gray-800 dark:border-gray-700 dark:text-red-400";
    } else {
        btn.innerHTML = `<i class="fa-solid fa-thumbs-up text-green-500"></i> Force Pass`;
        btn.className = "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-all bg-white hover:bg-green-50 border-green-200 text-green-600 dark:bg-gray-800 dark:border-gray-700 dark:text-green-400";
    }
}

// ==========================================
// 6. VISUALIZER MODAL & DATA RENDERING
// ==========================================
export function navigateFile(direction) {
    const newIndex = appState.currentFileIndex + direction;
    if (newIndex >= 0 && newIndex < appState.processedKeys.length) {
        const nextFileName = appState.processedKeys[newIndex];
        openVisualizer(nextFileName);
    }
}

export function updateNavButtons() {
    const btnPrev = document.getElementById('btnModalPrev');
    const btnNext = document.getElementById('btnModalNext');
    if(btnPrev) btnPrev.disabled = appState.currentFileIndex <= 0;
    if(btnNext) btnNext.disabled = appState.currentFileIndex >= appState.processedKeys.length - 1;
}

export function openVisualizer(fileName) {
    const data = appState.processed[fileName];
    if (!data) return;

    appState.currentFileIndex = appState.processedKeys.indexOf(fileName);
    updateNavButtons();

    appState.targetPID = data.pid;
    document.getElementById('modalFileName').innerText = fileName;
    document.getElementById('targetPidDisplay').innerText = data.pid;
    
    updateVizStatusHeader(data);
    updateForceToggleButton(data);

    document.getElementById('vizModal').classList.remove('hidden');
    updateVerifyButton(GameSystem.isVerified(data.pid));

    // Mapping ulang currentData dengan properti _uuid untuk Sinkronisasi Edit & Drag
    appState.currentData = data.belowData.map(r => ({
        _uuid: r._uuid,
        strno: String(r.STRNO || ""),
        pltxt: String(r.PLTXT || ""),
        abckz: String(r.ABCKZ || ""),
        stort: String(r.STORT || ""), 
        arbpl: String(r.ARBPL || "")
    }));
    appState.filteredData = [...appState.currentData];
    appState.currentPage = 1;

    switchTab('viz');
    applyZoom(); 
    generateSVG(data.displayData, data.belowData, data.pid);
    
    renderDisplayRingTable(data.displayData, fileName);
    updatePaginationInfo();
    renderErrorTable([...data.errors, ...(data.warnings || [])]);
}

// Menampilkan Data Display dengan Fitur Drag Handle dan ContentEditable
export function renderDisplayRingTable(displayData, fileName) {
    const thead = document.getElementById('display-ring-head');
    const tbody = document.getElementById('display-ring-body');
    if(!thead || !tbody) return;

    thead.innerHTML = '';
    tbody.innerHTML = '';
    
    if (!displayData || displayData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400 italic">No Data Available in display_ring</td></tr>';
        return;
    }

    const allKeys = Object.keys(displayData[0]);
    // Filter _uuid dan kolom internal
    const columns = allKeys.filter(k => k !== 'PID' && k !== 'RING_ID' && k !== '_uuid' && k !== '_rowIndex');

    let headerHTML = `<tr>
        <th class="px-3 py-3 w-10 text-center text-xs font-bold text-gray-500 uppercase tracking-wider sticky-header border-b border-gray-100 dark:border-gray-800"><i class="fa-solid fa-sort"></i></th>
    `;
    columns.forEach(col => {
        headerHTML += `<th class="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky-header border-b border-gray-100 dark:border-gray-800">${col.replace(/_/g, ' ')}</th>`;
    });
    headerHTML += '</tr>';
    thead.innerHTML = headerHTML;

    displayData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition bg-white dark:bg-gray-900";
        if (row._uuid) tr.setAttribute('data-uuid', row._uuid);
        
        let rowHTML = `<td class="px-3 py-2 text-center cursor-grab drag-handle text-gray-400 hover:text-slate-700 dark:hover:text-white"><i class="fa-solid fa-bars"></i></td>`;
        columns.forEach(col => {
            rowHTML += `<td class="px-4 py-2 border-b border-gray-50 dark:border-gray-800 text-slate-600 dark:text-gray-300 whitespace-nowrap editable-cell hover:outline hover:outline-1 hover:outline-dashed hover:outline-gray-400 dark:hover:outline-gray-600" contenteditable="true" data-col="${col}" onblur="window.handleCellEdit(event, '${fileName}', 'displayData')" onkeydown="window.handleCellEdit(event, '${fileName}', 'displayData')">${row[col] || '-'}</td>`;
        });
        tr.innerHTML = rowHTML;
        tbody.appendChild(tr);
    });

    // Re-initialize SortableJS
    setTimeout(() => { if (window.initTableSortable) window.initTableSortable(fileName); }, 100);
}

// Menampilkan Tenant Data (Below Ring) dengan Drag Handle & ContentEditable
export function renderTablePage() {
    const tbody = document.getElementById('data-table-body');
    const thead = document.getElementById('data-table-head');
    if(!tbody || !thead) return;

    // Pastikan thead selalu memiliki kolom aksi/drag
    if (thead.innerHTML.trim() === '') {
        thead.innerHTML = `
            <tr>
                <th class="py-4 px-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"><i class="fa-solid fa-sort"></i></th>
                <th class="py-4 px-6 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">STRNO</th>
                <th class="py-4 px-6 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ABCKZ</th>
                <th class="py-4 px-6 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">PLTXT</th>
                <th class="py-4 px-6 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">STORT</th>
                <th class="py-4 px-6 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ARBPL</th>
            </tr>
        `;
    }

    tbody.innerHTML = "";
    
    const startIdx = (appState.currentPage - 1) * appState.rowsPerPage;
    const pageData = appState.filteredData.slice(startIdx, startIdx + appState.rowsPerPage);
    const fileName = appState.processedKeys[appState.currentFileIndex];

    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-gray-400 italic">No data found matching your search</td></tr>`;
        return;
    }

    pageData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "bg-white dark:bg-gray-900";
        const isMatch = appState.targetPID && row.pltxt.includes(appState.targetPID);
        if(isMatch) tr.classList.add('row-highlight');
        if(row._uuid) tr.setAttribute('data-uuid', row._uuid);

        // Cell Editable Class untuk mempermudah styling/event
        const editClass = "py-2 px-6 text-sm editable-cell hover:outline hover:outline-1 hover:outline-dashed hover:outline-gray-400 dark:hover:outline-gray-600";
        
        tr.innerHTML = `
            <td class="py-2 px-3 text-center cursor-grab drag-handle text-gray-400 hover:text-slate-700 dark:hover:text-white border-b border-gray-50 dark:border-gray-800"><i class="fa-solid fa-bars"></i></td>
            <td class="${editClass} font-mono text-slate-600 dark:text-gray-300 border-b border-gray-50 dark:border-gray-800" contenteditable="true" data-col="STRNO" onblur="window.handleCellEdit(event, '${fileName}', 'belowData')" onkeydown="window.handleCellEdit(event, '${fileName}', 'belowData')">${row.strno}</td>
            <td class="${editClass} text-slate-800 dark:text-white font-medium border-b border-gray-50 dark:border-gray-800" contenteditable="true" data-col="ABCKZ" onblur="window.handleCellEdit(event, '${fileName}', 'belowData')" onkeydown="window.handleCellEdit(event, '${fileName}', 'belowData')">${row.abckz}</td>
            <td class="${editClass} ${isMatch ? 'font-bold text-mitratel-red' : 'text-slate-800 dark:text-white'} border-b border-gray-50 dark:border-gray-800" contenteditable="true" data-col="PLTXT" onblur="window.handleCellEdit(event, '${fileName}', 'belowData')" onkeydown="window.handleCellEdit(event, '${fileName}', 'belowData')">${row.pltxt || '-'}</td>
            <td class="${editClass} text-slate-500 dark:text-gray-400 border-b border-gray-50 dark:border-gray-800" contenteditable="true" data-col="STORT" onblur="window.handleCellEdit(event, '${fileName}', 'belowData')" onkeydown="window.handleCellEdit(event, '${fileName}', 'belowData')">${row.stort || '-'}</td>
            <td class="${editClass} text-slate-500 dark:text-gray-400 border-b border-gray-50 dark:border-gray-800" contenteditable="true" data-col="ARBPL" onblur="window.handleCellEdit(event, '${fileName}', 'belowData')" onkeydown="window.handleCellEdit(event, '${fileName}', 'belowData')">${row.arbpl || '-'}</td>
        `;
        tbody.appendChild(tr);
    });

    // Re-initialize SortableJS
    setTimeout(() => { if (window.initTableSortable) window.initTableSortable(fileName); }, 100);
}

// ==========================================
// 7. DATA FILTRATION & PAGINATION
// ==========================================
export function setLenFilter(len) {
    appState.currentLenFilter = len;
    ['all', '17', '21', '26', '30'].forEach(l => {
        const btn = document.getElementById(`len-btn-${l}`);
        if(!btn) return;
        if(l === len) {
            btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg bg-mitratel-red text-white transition shadow-sm whitespace-nowrap";
        } else {
            btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition whitespace-nowrap";
        }
    });
    filterTable();
}

export function filterTable() {
    const input = document.getElementById('tableSearch');
    const term = input ? input.value.toLowerCase() : '';
    const lenFilter = appState.currentLenFilter;

    appState.filteredData = appState.currentData.filter(row => {
        const matchesText = row.strno.toLowerCase().includes(term) || 
                            row.pltxt.toLowerCase().includes(term) ||
                            row.stort.toLowerCase().includes(term) || 
                            row.arbpl.toLowerCase().includes(term);

        let matchesLen = true;
        if (lenFilter !== 'all') {
            matchesLen = (row.strno.length === parseInt(lenFilter));
        }

        return matchesText && matchesLen;
    });

    appState.currentPage = 1;
    renderTablePage();
    updatePaginationInfo();
}

export function changePage(delta) {
    const maxPage = Math.ceil(appState.filteredData.length / appState.rowsPerPage);
    const newPage = appState.currentPage + delta;
    if (newPage >= 1 && newPage <= maxPage) {
        appState.currentPage = newPage;
        renderTablePage();
        updatePaginationInfo(); 
    }
}

export function updatePaginationInfo() {
    const total = appState.filteredData.length;
    const start = total === 0 ? 0 : (appState.currentPage - 1) * appState.rowsPerPage + 1;
    const end = Math.min(appState.currentPage * appState.rowsPerPage, total);
    
    if(document.getElementById('totalRows')) document.getElementById('totalRows').innerText = total;
    if(document.getElementById('showStart')) document.getElementById('showStart').innerText = start;
    if(document.getElementById('showEnd')) document.getElementById('showEnd').innerText = end;
    if(document.getElementById('pageIndicator')) document.getElementById('pageIndicator').innerText = `Page ${appState.currentPage}`;
    
    const btnPrev = document.getElementById('btnPrev');
    if(btnPrev) {
        btnPrev.disabled = appState.currentPage === 1;
        btnPrev.classList.toggle('opacity-50', appState.currentPage === 1);
    }
    
    const maxPage = Math.ceil(total / appState.rowsPerPage);
    const btnNext = document.getElementById('btnNext');
    if(btnNext) {
        btnNext.disabled = appState.currentPage >= maxPage;
        btnNext.classList.toggle('opacity-50', appState.currentPage >= maxPage);
    }
}

// ==========================================
// 8. ERROR LOG TABLE
// ==========================================
export function renderErrorTable(errors) {
    const tbody = document.getElementById('error-table-body');
    const badge = document.getElementById('error-badge');
    const countDisplay = document.getElementById('error-count-display');
    if(!tbody) return;

    tbody.innerHTML = '';
    
    if(!errors || errors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-12 text-center text-gray-400 italic"><i class="fa-solid fa-check-circle text-4xl text-green-100 mb-2 block"></i>No validation issues found</td></tr>`;
        if(badge) {
            badge.classList.add('hidden');
            badge.innerText = '0';
        }
        if(countDisplay) {
            countDisplay.innerText = '0 Issues Found';
            countDisplay.className = "text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 px-3 py-1 rounded-full font-medium";
        }
        return;
    }

    if(badge) {
        badge.classList.remove('hidden');
        badge.innerText = errors.length;
    }
    if(countDisplay) {
        countDisplay.innerText = `${errors.length} Issues Found`;
        countDisplay.className = "text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 px-3 py-1 rounded-full font-medium";
    }

    errors.forEach(err => {
        const tr = document.createElement('tr');
        // Warning Logic berdasarkan keyword R18/R20/R16/R19 atau berdasarkan severity
        const isWarning = (err.Severity === "WARNING" || err.Rule === "R18_HIGH_OCCUPANCY" || err.Rule === "R20_DISPLAY_CHAIN" || err.Rule === "R16_ANTI_SPLIT_WARN" || err.Rule === "R19_CONNECTIVITY");
        const rowClass = isWarning ? "hover:bg-orange-50 dark:hover:bg-orange-900/10" : "hover:bg-red-50 dark:hover:bg-red-900/10";
        const textClass = isWarning ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400";

        tr.className = `${rowClass} transition border-b border-gray-100 dark:border-gray-800`;
        tr.innerHTML = `
            <td class="px-6 py-3 text-sm font-mono text-slate-500 dark:text-gray-400">${err.Row}</td>
            <td class="px-6 py-3 text-sm font-bold ${textClass}">${err.Rule}</td>
            <td class="px-6 py-3 text-sm text-slate-700 dark:text-gray-300">${err.Message}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 9. INLINE EDIT & DRAG DROP LOGIC
// ==========================================
export function handleCellEdit(event, fileName, sheetType) {
    if (event.type === 'keydown' && event.key === 'Enter') {
        event.preventDefault();
        event.target.blur(); // Memicu event onblur
        return;
    }
    if (event.type !== 'blur') return;

    const tr = event.target.closest('tr');
    if (!tr) return;
    const uuid = tr.getAttribute('data-uuid');
    const colName = event.target.getAttribute('data-col');
    let newValue = event.target.innerText.trim();

    const processedData = appState.processed[fileName];
    if (!processedData || !uuid) return;

    let dataArr = sheetType === 'belowData' ? processedData.belowData : processedData.displayData;
    const rowData = dataArr.find(r => r._uuid === uuid);

    if (rowData && rowData[colName] !== newValue) {
        rowData[colName] = newValue;
        
        // Update UI State agar sinkron
        if (sheetType === 'belowData') {
            const uiColName = colName.toLowerCase(); 
            const curRow = appState.currentData.find(r => r._uuid === uuid);
            if (curRow) curRow[uiColName] = newValue;
            const filRow = appState.filteredData.find(r => r._uuid === uuid);
            if (filRow) filRow[uiColName] = newValue;
        }

        showToast(`Cell [${colName}] updated`, 'success');
        
        // Panggil fungsi sinkronisasi pembentukan Workbook Excel dari validator.js
        if (window.syncProcessedData) {
            window.syncProcessedData(fileName);
        }
    }
}

export function initTableSortable(fileName) {
    if (typeof Sortable === 'undefined') return;

    const displayTbody = document.getElementById('display-ring-body');
    const dataTbody = document.getElementById('data-table-body');

    // Inisialisasi untuk display_ring
    if (displayTbody && !displayTbody.sortableInstance) {
        displayTbody.sortableInstance = new Sortable(displayTbody, {
            handle: '.drag-handle',
            animation: 150,
            onEnd: function (evt) {
                window.handleRowReorder(evt, fileName, 'displayData');
            }
        });
    } else if (displayTbody && displayTbody.sortableInstance) {
        // Update event jika file berbeda
        displayTbody.sortableInstance.options.onEnd = function(evt) { window.handleRowReorder(evt, fileName, 'displayData'); };
    }

    // Inisialisasi untuk below_ring (Tenant Data)
    if (dataTbody && !dataTbody.sortableInstance) {
        dataTbody.sortableInstance = new Sortable(dataTbody, {
            handle: '.drag-handle',
            animation: 150,
            onEnd: function (evt) {
                window.handleRowReorder(evt, fileName, 'belowData');
            }
        });
    } else if (dataTbody && dataTbody.sortableInstance) {
        // Update event jika file berbeda
        dataTbody.sortableInstance.options.onEnd = function(evt) { window.handleRowReorder(evt, fileName, 'belowData'); };
    }
}

export function handleRowReorder(evt, fileName, sheetType) {
    const itemEl = evt.item;
    const uuid = itemEl.getAttribute('data-uuid');
    if (!uuid || evt.oldIndex === evt.newIndex) return;

    const processedData = appState.processed[fileName];
    if (!processedData) return;

    let dataArr = sheetType === 'belowData' ? processedData.belowData : processedData.displayData;
    
    // Cari index ASLI di memory berdasarkan UUID
    const oldDataIndex = dataArr.findIndex(r => r._uuid === uuid);
    if (oldDataIndex === -1) return;

    let newDataIndex = 0;
    if (evt.newIndex === 0) {
        newDataIndex = 0;
    } else {
        const prevSibling = itemEl.previousElementSibling;
        if (prevSibling) {
            const prevUuid = prevSibling.getAttribute('data-uuid');
            const prevDataIndex = dataArr.findIndex(r => r._uuid === prevUuid);
            newDataIndex = oldDataIndex < prevDataIndex ? prevDataIndex : prevDataIndex + 1;
        } else {
            newDataIndex = evt.newIndex; // Fallback darurat
        }
    }

    // Pindahkan Data pada Array Utama
    const [movedItem] = dataArr.splice(oldDataIndex, 1);
    dataArr.splice(newDataIndex, 0, movedItem);

    // Sinkronkan ulang currentData & filteredData khusus untuk belowData agar tidak rusak saat di-filter
    if (sheetType === 'belowData') {
        appState.currentData = processedData.belowData.map(r => ({
            _uuid: r._uuid,
            strno: String(r.STRNO || ""),
            pltxt: String(r.PLTXT || ""),
            abckz: String(r.ABCKZ || ""),
            stort: String(r.STORT || ""), 
            arbpl: String(r.ARBPL || "")
        }));
        filterTable(); // Merender ulang berdasarkan filter yang sedang aktif
    }

    showToast('Row order successfully updated', 'info');
    
    // Panggil sinkronisasi ke File Download
    if (window.syncProcessedData) {
        window.syncProcessedData(fileName);
    }
}
