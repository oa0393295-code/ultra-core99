import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, query, collection, orderBy, limit, updateDoc, increment, addDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const FB_CONFIG = {
    apiKey: "AIzaSyASLT_wouo9BTjd-dH18x8CLbqBZSMbz04",
    authDomain: "ultra-core.firebaseapp.com",
    projectId: "ultra-core",
    storageBucket: "ultra-core.firebasestorage.app",
    messagingSenderId: "351766462712",
    appId: "1:351766462712:web:e683d8aa0d213b6e59fb0d"
};

const APP = initializeApp(FB_CONFIG);
const AUTH = getAuth(APP);
const DB = getFirestore(APP);
const PROV = new GoogleAuthProvider();

// TITAN CORE ENGINE
class TitanCore {
    constructor() {
        this.user = null;
        this.active = false;
        this.secs = 0;
        this.intv = null;
        this.today = new Date().toLocaleDateString('en-CA');
        this.habits = [
            {id:'fajr', n:'الفجر'}, {id:'dhuhr', n:'الظهر'}, {id:'asr', n:'العصر'},
            {id:'maghrib', n:'المغرب'}, {id:'isha', n:'العشاء'}, {id:'taraweeh', n:'تراويح'}
        ];
        this.editRef = null;
    }

    // محول الوقت (90 دقيقة -> 1.30)
    fmt(mins) {
        if (!mins || mins <= 0) return "0.00";
        return `${Math.floor(mins / 60)}.${(mins % 60).toString().padStart(2, '0')}`;
    }

    async init(user) {
        this.user = user;
        UI.boot(true);
        this.loadSession();
        this.sync();
        await this.ping(this.active ? "بيذاكر دلوقتي 🔥" : "بيأنتخ ☕");
    }

    loadSession() {
        this.secs = parseInt(localStorage.getItem(`t3_${this.user.uid}`)) || 0;
        if (localStorage.getItem(`r3_${this.user.uid}`) === "true") this.toggle(true);
        UI.updateOrb();
    }

    async toggle(force = false) {
        if (!this.active || force) {
            this.active = true;
            localStorage.setItem(`r3_${this.user.uid}`, "true");
            UI.btnState(true);
            this.intv = setInterval(() => {
                this.secs++;
                localStorage.setItem(`t3_${this.user.uid}`, this.secs);
                UI.updateOrb();
                if (this.secs % 60 === 0) this.updateMetric('mins', 1);
            }, 1000);
            await this.ping("بيذاكر دلوقتي 🔥");
        } else {
            clearInterval(this.intv);
            this.active = false;
            localStorage.setItem(`r3_${this.user.uid}`, "false");
            UI.btnState(false);
            await this.ping("بيأنتخ ☕");
        }
    }

    async updateMetric(key, val) {
        const ref = doc(DB, "users", this.user.uid, "logs", this.today);
        await setDoc(ref, { [key]: increment(val), date: this.today }, { merge: true });
    }

    async ping(status) {
        if (!this.user) return;
        await updateDoc(doc(DB, "users", this.user.uid), {
            name: this.user.displayName,
            status,
            todayMins: Math.floor(this.secs / 60),
            day: this.today,
            lastSeen: serverTimestamp()
        });
    }

    sync() {
        // Leaderboard
        onSnapshot(query(collection(DB, "users"), limit(30)), snap => {
            const list = snap.docs.map(d => d.data())
                        .filter(u => u.day === this.today)
                        .sort((a,b) => b.todayMins - a.todayMins);
            UI.renderRanks(list);
        });

        // Personal Logs
        onSnapshot(query(collection(DB, "users", this.user.uid, "logs"), orderBy("date", "desc")), snap => {
            const logs = snap.docs.map(d => d.data());
            const cur = logs.find(l => l.date === this.today);
            if (cur) UI.syncToday(cur);
            UI.renderHistory(logs);
        });

        // Chat
        onSnapshot(query(collection(DB, "chat"), orderBy("timestamp", "asc"), limit(50)), snap => {
            UI.renderChat(snap.docs.map(d => d.data()));
        });
    }
}

// UI CONTROLLER
const UI = {
    boot(show) {
        document.getElementById('auth-gate').style.display = show ? 'none' : 'flex';
        const shell = document.getElementById('app-shell');
        shell.classList.toggle('hidden', !show);
        if(show) {
            setTimeout(() => shell.style.opacity = '1', 100);
            this.injectHabits();
        }
    },

    injectHabits() {
        const box = document.getElementById('prayer-checklist');
        box.innerHTML = CORE.habits.map(h => `
            <div class="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-white/5 hover:border-cyan-500/20 transition-all group">
                <span class="text-sm font-bold text-slate-400 group-hover:text-white">${h.n}</span>
                <input type="checkbox" id="p-${h.id}" onchange="UI.toggleHabit('${h.id}')" class="w-5 h-5 accent-cyan-500 cursor-pointer">
            </div>
        `).join('');
    },

    updateOrb() {
        const s = CORE.secs;
        const hh = Math.floor(s / 3600).toString().padStart(2, '0');
        const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${hh}:${mm}`;
        const offset = 1162 - ((s % 60) / 60 * 1162);
        document.getElementById('orb-fill').style.strokeDashoffset = offset;
    },

    btnState(on) {
        const b = document.getElementById('timer-btn');
        const t = document.getElementById('status-tag');
        b.innerText = on ? "STOP" : "START";
        t.innerText = on ? "ACTIVE_SESSION 🔥" : "SYSTEM_IDLE ☕";
        on ? t.classList.add('text-cyan-500', 'animate-pulse') : t.classList.remove('text-cyan-500', 'animate-pulse');
    },

    syncToday(data) {
        document.getElementById('stat-mins').innerText = CORE.fmt(data.mins || 0);
        document.getElementById('stat-quran').innerText = data.quran || 0;
        CORE.habits.forEach(h => {
            const el = document.getElementById(`p-${h.id}`);
            if (el) el.checked = !!(data.habits?.[h.id]);
        });
    },

    renderRanks(users) {
        const box = document.getElementById('rankings');
        box.innerHTML = users.map((u, i) => `
            <div onclick="UI.inspect('${u.uid}', '${u.name}')" class="glass-card p-4 cursor-pointer flex justify-between items-center group">
                <div class="flex items-center gap-3">
                    <span class="text-xl font-black italic opacity-20">${i+1}</span>
                    <div>
                        <p class="text-sm font-black group-hover:text-cyan-400 transition-colors">${u.name}</p>
                        <p class="text-[8px] uppercase font-bold ${u.status.includes('دلوقتي') ? 'text-cyan-500' : 'text-slate-600'}">${u.status}</p>
                    </div>
                </div>
                <p class="text-lg font-black mono text-cyan-500">${CORE.fmt(u.todayMins)}</p>
            </div>
        `).join('');
    },

    renderHistory(logs) {
        const box = document.getElementById('history-feed');
        box.innerHTML = logs.map(l => `
            <div class="glass-card p-5 flex justify-between items-center border-r-2 border-slate-800">
                <div>
                    <p class="mono text-[9px] text-cyan-800 mb-1">${l.date}</p>
                    <h4 class="text-xl font-black italic text-white">STUDY: ${CORE.fmt(l.mins)}</h4>
                    <div class="flex gap-1 mt-2">
                        ${CORE.habits.map(h => `<div class="habit-sq ${l.habits?.[h.id] ? 'done' : 'fail'}" data-tip="${h.n}"></div>`).join('')}
                    </div>
                </div>
                <button onclick="UI.openEdit('${l.date}', ${l.mins}, ${l.quran}, ${JSON.stringify(l.habits || {}).replace(/"/g, '&quot;')})" class="bg-white text-black px-4 py-2 rounded-lg text-[9px] font-black uppercase">Edit</button>
            </div>
        `).join('');
    },

    async inspect(uid, name) {
        const box = document.getElementById('inspect-content');
        document.getElementById('inspect-name').innerText = name;
        this.toggleModal('inspect-modal', true);
        box.innerHTML = '<p class="mono text-cyan-500 animate-pulse">Scanning...</p>';
        const snap = await getDocs(query(collection(DB, "users", uid, "logs"), orderBy("date", "desc"), limit(10)));
        box.innerHTML = snap.docs.map(d => {
            const data = d.data();
            return `
                <div class="glass-card p-4 bg-black/40">
                    <p class="mono text-[10px] text-cyan-600 mb-2">${data.date}</p>
                    <p class="text-xl font-black">${CORE.fmt(data.mins)} <span class="text-[9px] text-slate-700 italic">STUDY</span></p>
                    <div class="flex gap-1 mt-3">
                        ${CORE.habits.map(h => `<div class="habit-sq ${data.habits?.[h.id] ? 'done' : 'fail'}" data-tip="${h.n}"></div>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    },

    openEdit(date, mins, quran, habits) {
        CORE.editRef = { date, habits };
        document.getElementById('edit-mins').value = mins;
        document.getElementById('edit-quran').value = quran;
        document.getElementById('edit-habits').innerHTML = CORE.habits.map(h => `
            <div class="flex flex-col items-center p-2 bg-black/40 rounded-lg">
                <span class="text-[8px] font-black mb-1">${h.n}</span>
                <input type="checkbox" id="ed-${h.id}" ${habits[h.id] ? 'checked' : ''} onchange="CORE.editRef.habits['${h.id}'] = this.checked" class="w-4 h-4 accent-emerald-500">
            </div>
        `).join('');
        this.toggleModal('edit-modal', true);
    },

    toggleModal(id, open) { document.getElementById(id).classList.toggle('hidden', !open); },
    renderChat(msgs) {
        const box = document.getElementById('chat-box');
        box.innerHTML = msgs.map(m => `<div class="text-xs"><b>${m.sender}:</b> <span class="text-slate-400">${m.text}</span></div>`).join('');
        box.scrollTop = box.scrollHeight;
    },
    async toggleHabit(id) {
        const checked = document.getElementById(`p-${id}`).checked;
        const ref = doc(DB, "users", CORE.user.uid, "logs", CORE.today);
        const snap = await getDocs(query(collection(DB, "users", CORE.user.uid, "logs"))); // Fallback check
        await setDoc(ref, { habits: { [id]: checked }, date: CORE.today }, { merge: true });
    }
};

const CORE = new TitanCore();
window.UI = UI; window.CORE = CORE;

onAuthStateChanged(AUTH, u => u ? CORE.init(u) : UI.boot(false));
document.getElementById('login-btn').onclick = () => signInWithPopup(AUTH, PROV);
document.getElementById('timer-btn').onclick = () => CORE.toggle();
document.getElementById('quran-save').onclick = () => {
    const val = parseInt(document.getElementById('quran-in').value) || 0;
    if(val > 0) CORE.updateMetric('quran', val).then(() => document.getElementById('quran-in').value = '');
};
document.getElementById('save-edit').onclick = async () => {
    const m = parseInt(document.getElementById('edit-mins').value) || 0;
    const q = parseInt(document.getElementById('edit-quran').value) || 0;
    await updateDoc(doc(DB, "users", CORE.user.uid, "logs", CORE.editRef.date), { mins: m, quran: q, habits: CORE.editRef.habits });
    if(CORE.editRef.date === CORE.today) {
        CORE.secs = m * 60;
        localStorage.setItem(`t3_${CORE.user.uid}`, CORE.secs);
        UI.updateOrb();
    }
    UI.toggleModal('edit-modal', false);
};
document.getElementById('chat-send').onclick = async () => {
    const i = document.getElementById('chat-in');
    if(i.value.trim()) {
        await addDoc(collection(DB, "chat"), { text: i.value, sender: CORE.user.displayName, timestamp: serverTimestamp() });
        i.value = '';
    }
};
setInterval(() => document.getElementById('live-clock').innerText = new Date().toLocaleTimeString('en-GB'), 1000);