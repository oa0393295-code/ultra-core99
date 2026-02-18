/**
 * 🛰️ STUDY_WARS OS | INTEGRATED CORE v3.0
 */

// 1. FIREBASE CONFIG (Required for Social/Profile features)
const firebaseConfig = {
    apiKey: "AIzaSyAs-YOUR-KEY-HERE", // ضعه هنا ليعمل الأصدقاء
    projectId: "study-wars-pro",
    appId: "1:351766462712:web:e683aa0"
};
// تهيئة أولية وهمية في حال عدم وجود Keys لتجنب تعليق البرنامج
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.firestore();

// 2. APP STATE
let User = JSON.parse(localStorage.getItem('SW_USER')) || null;
let DailyMins = JSON.parse(localStorage.getItem('SW_DAILY')) || 0;

const App = {
    init() {
        if (!User) {
            document.getElementById('auth-screen').classList.remove('hidden');
        } else {
            this.launch();
        }
    },

    async register() {
        const name = document.getElementById('username-input').value;
        if (name.length < 2) return alert("الاسم قصير جداً!");

        const userData = {
            name: name,
            xp: 0,
            lastSeen: Date.now(),
            joined: new Date().toLocaleDateString()
        };

        try {
            // حفظ في السيرفر
            const docRef = await db.collection("pilots").add(userData);
            userData.id = docRef.id;
            // حفظ محلي
            localStorage.setItem('SW_USER', JSON.stringify(userData));
            User = userData;
            location.reload();
        } catch(e) {
            // في حالة عدم وجود Firebase Keys سيتم الحفظ محلياً فقط للتجربة
            userData.id = "local_" + Math.random();
            localStorage.setItem('SW_USER', JSON.stringify(userData));
            User = userData;
            location.reload();
        }
    },

    launch() {
        document.getElementById('display-name').innerText = User.name;
        document.getElementById('user-avatar').innerText = User.name[0].toUpperCase();
        gsap.to("#main-app", { opacity: 1, duration: 1.5 });
        this.updateStats();
        this.syncSocial();
    },

    updateStats() {
        const h = Math.floor(DailyMins / 60);
        const m = DailyMins % 60;
        document.getElementById('stat-total').innerText = `${h}h ${m}m`;
        const eff = Math.min(Math.round((DailyMins / 480) * 100), 100);
        document.getElementById('stat-efficiency').innerText = `${eff}%`;
    },

    syncSocial() {
        // تحديث حالتك على السيرفر
        setInterval(() => {
            if (User.id && !User.id.startsWith('local')) {
                db.collection("pilots").doc(User.id).update({ lastSeen: Date.now(), xp: DailyMins });
            }
        }, 30000);

        // مراقبة الأصدقاء
        db.collection("pilots").limit(10).onSnapshot(snap => {
            const list = document.getElementById('friends-list');
            list.innerHTML = '';
            snap.forEach(doc => {
                const data = doc.data();
                if (doc.id === User.id) return;
                const isOnline = Date.now() - data.lastSeen < 60000;
                list.innerHTML += `
                    <div class="p-4 bg-white/5 border border-white/5 rounded-2xl flex justify-between items-center shadow-sm">
                        <div>
                            <div class="text-[10px] font-black text-white italic">${data.name}</div>
                            <div class="text-[8px] text-slate-500 uppercase tracking-tighter">XP: ${data.xp || 0}</div>
                        </div>
                        <div class="w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-cyan-500 shadow-[0_0_8px_cyan]' : 'bg-red-900'}"></div>
                    </div>
                `;
            });
        });
    },

    toggleFriends() {
        const panel = document.getElementById('friends-panel');
        const timerPanel = document.getElementById('timer-panel');
        panel.classList.toggle('hidden');
        timerPanel.classList.toggle('col-span-12');
        timerPanel.classList.toggle('col-span-9');
    }
};

const Timer = {
    seconds: 1500,
    interval: null,
    status: 'IDLE',

    set() {
        const m = document.getElementById('manual-mins').value;
        if (m > 0) { this.seconds = m * 60; this.updateUI(); }
    },

    toggle() {
        if (this.status === 'RUNNING') {
            clearInterval(this.interval);
            this.status = 'PAUSED';
            document.getElementById('main-btn').innerText = "RESUME_PROTOCOL";
            document.getElementById('session-status').innerText = "Sync_Suspended";
        } else {
            this.status = 'RUNNING';
            document.getElementById('main-btn').innerText = "PAUSE_PROTOCOL";
            document.getElementById('session-status').innerText = "Sync_Active";
            this.interval = setInterval(() => {
                if (this.seconds > 0) {
                    this.seconds--;
                    this.updateUI();
                    if (this.seconds % 60 === 0) {
                        DailyMins++;
                        localStorage.setItem('SW_DAILY', DailyMins);
                        App.updateStats();
                    }
                } else { this.reset(); }
            }, 1000);
        }
    },

    reset() {
        clearInterval(this.interval);
        this.seconds = 1500;
        this.status = 'IDLE';
        this.updateUI();
        document.getElementById('main-btn').innerText = "START_PROTOCOL";
        document.getElementById('session-status').innerText = "Ready_To_Sync";
    },

    updateUI() {
        const m = Math.floor(this.seconds / 60).toString().padStart(2, '0');
        const s = (this.seconds % 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${m}:${s}`;
    }
};

window.onload = () => App.init();