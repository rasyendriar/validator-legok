// --- GLOBAL STATE ---
export const appState = {
    queue: [],
    processed: {}, 
    processedKeys: [], 
    currentData: [],
    filteredData: [],
    currentPage: 1,
    rowsPerPage: 100,
    targetPID: "",
    currentFileIndex: -1, 
    stats: { total: 0, pass: 0, fail: 0, warning: 0 }, // Added warning to stats
    workCenterData: new Map(),
    currentLenFilter: 'all' // New State for Length Filter
};

export const batcherState = {
    targetFiles: new Set(),
    folderMap: new Map(),
    batches: [],
    matchCount: 0,
    missingCount: 0,
    missingFiles: [] 
};

// --- GAMIFICATION SYSTEM ---
export const GameSystem = {
    stats: { xp: 0, level: 1, verifiedCount: 0 },
    verifiedPids: [], // Stores list of manually verified PIDs

    init: function() {
        const storedStats = localStorage.getItem('mitratel_user_stats');
        const storedPids = localStorage.getItem('mitratel_verified_pids');
        if(storedStats) this.stats = JSON.parse(storedStats);
        if(storedPids) this.verifiedPids = JSON.parse(storedPids);
        this.updateUI();
    },

    addXP: function(amount, reason) {
        this.stats.xp += amount;
        this.checkLevelUp();
        this.save();
        this.updateUI();
        // Catatan: Fungsi showToast nantinya perlu di-import dari utils.js saat disatukan di main.js
        if (typeof showToast === 'function') {
            showToast(`+${amount} XP: ${reason}`, 'success');
        }
    },

    checkLevelUp: function() {
        // Simple level logic: Level = 1 + floor(XP / 500)
        const newLevel = 1 + Math.floor(this.stats.xp / 500);
        if (newLevel > this.stats.level) {
            this.stats.level = newLevel;
            if (typeof showToast === 'function') {
                showToast(`Level Up! You are now level ${newLevel}`, 'info');
            }
        }
    },

    markVerified: function(pid) {
        if(!this.verifiedPids.includes(pid)) {
            this.verifiedPids.push(pid);
            this.stats.verifiedCount++;
            this.addXP(50, "Manual Verification"); // Bonus XP for manual check
            this.save();
            return true;
        }
        return false;
    },

    unmarkVerified: function(pid) {
        const idx = this.verifiedPids.indexOf(pid);
        if(idx > -1) {
            this.verifiedPids.splice(idx, 1);
            this.stats.verifiedCount = Math.max(0, this.stats.verifiedCount - 1);
            // Penalize XP slightly? Maybe not, just don't refund.
            this.save();
            this.updateUI();
            return true;
        }
        return false;
    },

    isVerified: function(pid) {
        return this.verifiedPids.includes(pid);
    },

    getRankName: function() {
        const lvl = this.stats.level;
        if(lvl < 2) return "Intern Validator";
        if(lvl < 5) return "Junior Officer";
        if(lvl < 10) return "Senior Asset Mgr";
        if(lvl < 20) return "VP of Towers";
        return "Master Validator";
    },

    save: function() {
        localStorage.setItem('mitratel_user_stats', JSON.stringify(this.stats));
        localStorage.setItem('mitratel_verified_pids', JSON.stringify(this.verifiedPids));
    },

    updateUI: function() {
        // Pengecekan elemen DOM untuk memastikan tidak error jika dipanggil sebelum DOM siap
        const userLevelEl = document.getElementById('userLevel');
        const userXpEl = document.getElementById('userXp');
        const userRankEl = document.getElementById('userRank');
        const xpBarEl = document.getElementById('xpBar');

        if (userLevelEl) userLevelEl.innerText = `Lvl ${this.stats.level}`;
        if (userXpEl) userXpEl.innerText = this.stats.xp;
        if (userRankEl) userRankEl.innerText = this.getRankName();
        
        // XP Bar calculation (0-500 based for simple levels)
        if (xpBarEl) {
            const currentLevelXp = this.stats.xp % 500;
            const percentage = (currentLevelXp / 500) * 100;
            xpBarEl.style.width = `${percentage}%`;
        }
    }
};