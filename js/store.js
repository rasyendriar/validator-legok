// js/store.js

// --- 1. DEFAULT RULES CONFIGURATION ---
// Menyimpan konfigurasi bawaan untuk semua Rules R5 - R20
export const defaultRulesConfig = {
    R5: { id: 'R5', name: 'Valid Header (Template)', enabled: true, severity: 'FAIL' },
    R6: { id: 'R6', name: 'Required Columns (STORT, ARBPL, dll)', enabled: true, severity: 'FAIL' },
    R7: { id: 'R7', name: 'Empty Data Validation', enabled: true, severity: 'FAIL' },
    R9: { id: 'R9', name: 'Anchor PID Consistency', enabled: true, severity: 'FAIL' },
    R10: { id: 'R10', name: 'Ring ID Uniformity', enabled: true, severity: 'FAIL' },
    R11: { id: 'R11', name: 'Valid Element Tagging', enabled: true, severity: 'FAIL' },
    R12: { id: 'R12', name: 'PID vs STRNO Match', enabled: true, severity: 'FAIL' },
    R13: { id: 'R13', name: 'Work Center (STORT-ARBPL) Standard', enabled: true, severity: 'FAIL' },
    R14: { id: 'R14', name: 'ABCKZ Consistency', enabled: true, severity: 'FAIL' },
    R15: { id: 'R15', name: 'Length Match (21/26) & Connectivity', enabled: true, severity: 'FAIL' },
    R16: { id: 'R16', name: 'Anti-Split Check (Duplicate Lengths)', enabled: true, severity: 'WARNING' },
    R17: { id: 'R17', name: 'Sequential Numbering', enabled: true, severity: 'FAIL' },
    R18: { id: 'R18', name: 'High Occupancy Warning (>90%)', enabled: true, severity: 'WARNING' },
    R19: { id: 'R19', name: 'Parent Connectivity Logic', enabled: true, severity: 'WARNING' },
    R20: { id: 'R20', name: 'Display Chain Order', enabled: true, severity: 'WARNING' }
};

// --- 2. GLOBAL APP STATE ---
export const appState = {
    queue: [],
    processed: {},
    processedKeys: [],
    stats: { total: 0, pass: 0, fail: 0, warning: 0 },
    
    currentFileIndex: 0,
    targetPID: null,
    workCenterData: new Map(),
    
    // UI Table States
    currentData: [],
    filteredData: [],
    currentPage: 1,
    rowsPerPage: 100,
    currentLenFilter: 'all',

    // Settings State (Menyimpan pengaturan aktif saat ini)
    ruleSettings: {} 
};

// --- 3. BATCHER STATE ---
export const batcherState = {
    targetFiles: new Set(),
    folderMap: new Map(),
    matchResults: [],
    missingFiles: [],
    batches: []
};

// --- 4. SETTINGS SYSTEM (NEW) ---
export const SettingsSystem = {
    init() {
        const saved = localStorage.getItem('mitratelRuleSettings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Merge dengan default (berguna jika ada update rule baru di masa depan)
                appState.ruleSettings = { ...defaultRulesConfig };
                for (const key in parsed) {
                    if (appState.ruleSettings[key]) {
                        appState.ruleSettings[key] = parsed[key];
                    }
                }
            } catch (e) {
                console.error("Failed to parse saved settings, falling back to default.");
                appState.ruleSettings = JSON.parse(JSON.stringify(defaultRulesConfig));
            }
        } else {
            // Jika belum ada penyimpanan, gunakan default
            appState.ruleSettings = JSON.parse(JSON.stringify(defaultRulesConfig));
        }
    },
    
    save(newConfig) {
        appState.ruleSettings = newConfig;
        localStorage.setItem('mitratelRuleSettings', JSON.stringify(newConfig));
    },
    
    getRuleAction(ruleId) {
        const rule = appState.ruleSettings[ruleId];
        // Jika ID tidak ditemukan (misal R1, R2), default ke Enabled & Fail
        if (!rule) return { enabled: true, severity: 'FAIL' }; 
        return { enabled: rule.enabled, severity: rule.severity };
    }
};

// --- 5. GAMIFICATION SYSTEM ---
export const GameSystem = {
    state: {
        xp: 0,
        level: 1,
        title: "Intern Validator",
        verifiedPids: [] 
    },
    init() {
        if (localStorage.getItem('sapGameXp')) {
            this.state.xp = parseInt(localStorage.getItem('sapGameXp')) || 0;
        }
        if (localStorage.getItem('sapGameLevel')) {
            this.state.level = parseInt(localStorage.getItem('sapGameLevel')) || 1;
        }
        if (localStorage.getItem('sapVerifiedPids')) {
            try {
                this.state.verifiedPids = JSON.parse(localStorage.getItem('sapVerifiedPids'));
            } catch(e) {
                this.state.verifiedPids = [];
            }
        }
        this.checkLevelUp();
        this.updateUI();
    },
    save() {
        localStorage.setItem('sapGameXp', this.state.xp);
        localStorage.setItem('sapGameLevel', this.state.level);
        localStorage.setItem('sapVerifiedPids', JSON.stringify(this.state.verifiedPids));
        this.updateUI();
    },
    addXp(amount) {
        this.state.xp += amount;
        this.checkLevelUp();
        this.save();
    },
    checkLevelUp() {
        const thresholds = [0, 100, 300, 600, 1000, 1500, 2500, 5000];
        const titles = ["Intern Validator", "Junior Analyst", "Data Specialist", "SAP Operator", "Senior Validator", "Migration Master", "Grandmaster", "Legend"];
        
        let newLevel = 1;
        for (let i = thresholds.length - 1; i >= 0; i--) {
            if (this.state.xp >= thresholds[i]) {
                newLevel = i + 1;
                break;
            }
        }
        this.state.level = newLevel;
        this.state.title = titles[newLevel - 1] || "Legend";
    },
    updateUI() {
        const xpEl = document.getElementById('userXp');
        const lvlEl = document.getElementById('userLevel');
        const rankEl = document.getElementById('userRank');
        const barEl = document.getElementById('xpBar');
        
        if (xpEl) xpEl.innerText = this.state.xp;
        if (lvlEl) lvlEl.innerText = `Lvl ${this.state.level}`;
        if (rankEl) rankEl.innerText = this.state.title;
        
        if (barEl) {
            const thresholds = [0, 100, 300, 600, 1000, 1500, 2500, 5000];
            const currentThresh = thresholds[this.state.level - 1] || 5000;
            const nextThresh = thresholds[this.state.level] || 99999;
            const progress = Math.min(100, ((this.state.xp - currentThresh) / (nextThresh - currentThresh)) * 100);
            barEl.style.width = `${progress}%`;
        }
    },
    markVerified(pid) {
        if (!this.state.verifiedPids.includes(pid)) {
            this.state.verifiedPids.push(pid);
            this.addXp(10); // Reward
        }
    },
    unmarkVerified(pid) {
        this.state.verifiedPids = this.state.verifiedPids.filter(p => p !== pid);
        this.save();
    },
    isVerified(pid) {
        return this.state.verifiedPids.includes(pid);
    }
};
