/**
 * STUDY_WARS v2.0 - INTEGRATED COMMAND CORE
 */

// 1. القواعد السحابية (Firebase)
const config = {
    apiKey: "AIzaSyASLT_wouo9BTjd-dH18x8CLbqBZSMbz04",
    authDomain: "ultra-core.firebaseapp.com",
    projectId: "ultra-core",
    storageBucket: "ultra-core.firebasestorage.app",
    messagingSenderId: "351766462712",
    appId: "1:351766462712:web:e683d8aa0d213b6e59fb0d"
};
firebase.initializeApp(config);
const db = firebase.firestore();

// 2. حالة النظام (State)
let UserSide = "";
let SessionData = { alphaXP: 0, betaXP: 0, alphaEff: 0, betaEff: 0 };
let dailyStats = JSON.parse(localStorage.getItem('WAR_STATS')) || {};

const App = {
    init(side) {
        UserSide = side;
        document.getElementById('setup-overlay').style.display = 'none';
        this.sync();
        this.renderHistory();
        this.log(`UNIT_${side}_ACTIVE_SYNC_ESTABLISHED`);
    },

    sync() {
        db.collection("battles").doc("global_arena").onSnapshot((doc) => {
            if (doc.exists) {
                SessionData = doc.data();
                this.updateInterface();
            }
        });
    },

    updateInterface() {
        document.getElementById('alpha-score').innerText = SessionData.alphaXP.toString().padStart(4, '0');
        document.getElementById('beta-score').innerText = SessionData.betaXP.toString().padStart(4, '0');
        document.getElementById('alpha-eff-label').innerText = `EFFICIENCY: ${SessionData.alphaEff || 0}%`;
        document.getElementById('beta-eff-label').innerText = `EFFICIENCY: ${SessionData.betaEff || 0}%`;

        const total = SessionData.alphaXP + SessionData.betaXP || 1;
        const alphaRatio = (SessionData.alphaXP / total) * 100;
        document.getElementById('power-bar-alpha').style.width = alphaRatio + "%";
        document.getElementById('power-bar-beta').style.width = (100 - alphaRatio) + "%";
        document.getElementById('win-ratio').innerText = `${Math.round(alphaRatio)}% / ${Math.round(100 - alphaRatio)}%`;
    },

    log(msg) {
        const log = document.getElementById('battle-log');
        log.innerHTML += `<div>[${new Date().toLocaleTimeString()}] > ${msg}</div>`;
        log.scrollTop = log.scrollHeight;
    },

    async updateCloud(data) {
        await db.collection("battles").doc("global_arena").update(data);
    }
};

const Timer = {
    seconds: 1500,
    interval: null,
    isPaused: false,

    setCustomTime() {
        const m = document.getElementById('manual-mins').value;
        if(m > 0) {
            this.seconds = m * 60;
            this.updateDisplay();
            App.log(`MANUAL_OVERRIDE: ${m}_MINUTES_LOADED`);
        }
    },

    start() {
        if(this.interval && !this.isPaused) return;
        this.isPaused = false;
        document.getElementById('start-btn').classList.add('hidden');
        document.getElementById('pause-btn').classList.remove('hidden');
        App.log("NEURAL_SYNC_STARTED");

        this.interval = setInterval(() => {
            if(!this.isPaused) {
                this.seconds--;
                this.updateDisplay();
                if(this.seconds % 60 === 0) this.recordProgress(1);
                if(this.seconds <= 0) this.terminate(true);
            }
        }, 1000);
    },

    pause() {
        this.isPaused = true;
        document.getElementById('start-btn').classList.remove('hidden');
        document.getElementById('start-btn').innerText = "RESUME";
        document.getElementById('pause-btn').classList.add('hidden');
        App.log("PROTOCOL_PAUSED");
    },

    terminate(complete = false) {
        clearInterval(this.interval);
        this.interval = null;
        this.isPaused = false;
        document.getElementById('start-btn').classList.remove('hidden');
        document.getElementById('start-btn').innerText = "START_FOCUS";
        document.getElementById('pause-btn').classList.add('hidden');
        
        if(complete) {
            const xp = 100;
            const update = UserSide === 'Alpha' ? { alphaXP: SessionData.alphaXP + xp } : { betaXP: SessionData.betaXP + xp };
            App.updateCloud(update);
            App.log("MISSION_ACCOMPLISHED: +100XP");
        }
    },

    recordProgress(min) {
        const today = new Date().toISOString().split('T')[0];
        if(!dailyStats[today]) dailyStats[today] = { mins: 0, target: 480 }; // التارجت 8 ساعات
        
        dailyStats[today].mins += min;
        localStorage.setItem('WAR_STATS', JSON.stringify(dailyStats));
        this.updateAnalytics();
    },

    updateAnalytics() {
        const today = new Date().toISOString().split('T')[0];
        const data = dailyStats[today] || { mins: 0, target: 480 };
        
        const h = Math.floor(data.mins / 60);
        const m = data.mins % 60;
        document.getElementById('today-total').innerText = `${h}h ${m}m`;
        
        const eff = Math.min(Math.round((data.mins / data.target) * 100), 100);
        document.getElementById('today-efficiency').innerText = eff + "%";

        const update = UserSide === 'Alpha' ? { alphaEff: eff } : { betaEff: eff };
        App.updateCloud(update);
    },

    updateDisplay() {
        const m = Math.floor(this.seconds / 60);
        const s = this.seconds % 60;
        document.getElementById('timer-display').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
};

// تشغيل التحليلات عند البدء
window.onload = () => { Timer.updateAnalytics(); };