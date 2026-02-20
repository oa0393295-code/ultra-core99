import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, query, collection, orderBy, limit, updateDoc, increment, addDoc, serverTimestamp, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const CONFIG = {
    apiKey: "AIzaSyASLT_wouo9BTjd-dH18x8CLbqBZSMbz04",
    authDomain: "ultra-core.firebaseapp.com",
    projectId: "ultra-core",
    storageBucket: "ultra-core.firebasestorage.app",
    messagingSenderId: "351766462712",
    appId: "1:351766462712:web:e683d8aa0d213b6e59fb0d"
};

const APP = initializeApp(CONFIG);
const AUTH = getAuth(APP);
const DB = getFirestore(APP);
const PROVIDER = new GoogleAuthProvider();

class TitanX {
    constructor() {
        this.user = null;
        this.active = false;
        this.secs = 0; // يتصفر دائماً عند البداية
        this.intv = null;
        this.today = new Date().toLocaleDateString('en-CA');
        this.habits = [
            {id:'fajr', n:'الفجر'}, {id:'dhuhr', n:'الظهر'}, {id:'asr', n:'العصر'},
            {id:'maghrib', n:'المغرب'}, {id:'isha', n:'العشاء'}, {id:'taraweeh', n:'التراويح'}
        ];
        this.editRef = null;

        // تصفير العداد عند تحميل الصفحة (طلب العميل)
        localStorage.removeItem('titan_active_secs');
        
        // إعداد حالة الأوفلاين عند الإغلاق
        window.addEventListener('beforeunload', () => {
            if(this.user) this.syncStatusNative("Offline");
        });
    }

    // تنسيق الوقت الجديد (5 د / 1.31)
    fmt(totalMins) {
        if (!totalMins || totalMins <= 0) return "0 د";
        if (totalMins < 60) return `${totalMins} د`;
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return `${h}.${m.toString().padStart(2, '0')}`;
    }

    async boot(user) {
        this.user = user;
        UI.init(true);
        this.sync();
        await this.ping("مريح شوية");
    }

    async toggle() {
        if (!this.active) {
            this.active = true;
            UI.btnState(true);
            this.intv = setInterval(() => {
                this.secs++;
                UI.renderOrb();
                if (this.secs % 60 === 0) {
                    this.pushMetric('mins', 1);
                    this.ping("بيذاكر دلوقتي");
                }
            }, 1000);
            await this.ping("بيذاكر دلوقتي");
        } else {
            clearInterval(this.intv);
            this.active = false;
            UI.btnState(false);
            await this.ping("مريح شوية");
        }
    }

    async pushMetric(key, val) {
        const ref = doc(DB, "users", this.user.uid, "logs", this.today);
        await setDoc(ref, { [key]: increment(val), date: this.today }, { merge: true });
        
        const rootRef = doc(DB, "users", this.user.uid);
        if(key === 'mins') await updateDoc(rootRef, { todayMins: increment(val) });
        if(key === 'quran') await updateDoc(rootRef, { todayQuran: increment(val) });
    }

    async ping(statusText) {
        if (!this.user) return;
        await updateDoc(doc(DB, "users", this.user.uid), {
            name: this.user.displayName,
            status: statusText,
            day: this.today,
            lastSeen: serverTimestamp()
        });
    }

    syncStatusNative(status) {
        const data = JSON.stringify({ fields: { status: { stringValue: status } } });
        const url = `https://firestore.googleapis.com/v1/projects/ultra-core/databases/(default)/documents/users/${this.user.uid}?updateMask.fieldPaths=status`;
        navigator.sendBeacon(url, data);
    }

    sync() {
        // لوحة المتصدرين
        onSnapshot(query(collection(DB, "users"), limit(40)), snap => {
            const list = snap.docs.map(d => d.data())
                        .filter(u => u.day === this.today)
                        .sort((a,b) => (b.todayMins || 0) - (a.todayMins || 0));
            UI.renderRanks(list);
        });

        // السجل
        onSnapshot(query(collection(DB, "users", this.user.uid, "logs"), orderBy("date", "desc")), snap => {
            const logs = snap.docs.map(d => d.data());
            const cur = logs.find(l => l.date === this.today);
            if (cur) UI.updateStats(cur);
            UI.renderHistory(logs, 'history-feed', true);
        });

        // الدردشة
        onSnapshot(query(collection(DB, "chat"), orderBy("timestamp", "asc"), limit(60)), snap => {
            UI.renderChat(snap.docs.map(d => d.data()));
        });
    }
}

const UI = {
    init(show) {
        document.getElementById('auth-gate').style.display = show ? 'none' : 'flex';
        const shell = document.getElementById('app-shell');
        shell.classList.toggle('hidden', !show);
        if(show) {
            setTimeout(() => shell.style.opacity = '1', 50);
            document.getElementById('u-name').innerText = CORE.user.displayName;
            document.getElementById('u-avatar').innerText = CORE.user.displayName[0];
            this.buildHabitList();
        }
    },

    buildHabitList() {
        const box = document.getElementById('prayer-checklist');
        box.innerHTML = CORE.habits.map(h => `
            <div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                <span class="text-sm font-bold text-slate-300 group-hover:text-cyan-400 transition-colors">${h.n}</span>
                <input type="checkbox" id="p-${h.id}" onchange="UI.saveHabit('${h.id}', this.checked)" class="w-6 h-6 accent-cyan-500 cursor-pointer">
            </div>
        `).join('');
    },

    async saveHabit(id, done) {
        const ref = doc(DB, "users", CORE.user.uid, "logs", CORE.today);
        await setDoc(ref, { habits: { [id]: done }, date: CORE.today }, { merge: true });
        const snap = await getDoc(ref);
        await updateDoc(doc(DB, "users", CORE.user.uid), { todayHabits: snap.data().habits || {} });
    },

    renderOrb() {
        const s = CORE.secs;
        const h = Math.floor(s / 3600).toString().padStart(2, '0');
        const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${h}:${m}`;
        const offset = 1162 - ((s % 60) / 60 * 1162);
        document.getElementById('orb-fill').style.strokeDashoffset = offset;
    },

    btnState(active) {
        const btn = document.getElementById('timer-btn');
        const tag = document.getElementById('status-tag');
        btn.innerText = active ? "SHUTDOWN" : "IGNITE";
        btn.style.background = active ? "linear-gradient(135deg, #ef4444 0%, #991b1b 100%)" : "";
        tag.innerText = active ? "System_Firing_Active 🔥" : "System_Idle ☕";
        tag.className = `text-[11px] font-black tracking-[0.4em] mt-6 transition-all ${active ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`;
    },

    updateStats(data) {
        document.getElementById('stat-mins').innerText = CORE.fmt(data.mins || 0);
        document.getElementById('stat-quran').innerText = data.quran || 0;
        let doneCount = 0;
        CORE.habits.forEach(h => {
            const el = document.getElementById(`p-${h.id}`);
            if (el) {
                const isChecked = !!(data.habits?.[h.id]);
                el.checked = isChecked;
                if(isChecked) doneCount++;
            }
        });
        document.getElementById('prayer-count-label').innerText = `${doneCount}/6`;
    },

    renderRanks(users) {
        const box = document.getElementById('rankings');
        box.innerHTML = users.map((u, i) => {
            const statusColor = u.status === "بيذاكر دلوقتي" ? "text-cyan-400" : (u.status === "Offline" ? "text-slate-700" : "text-amber-500");
            const isFirst = i === 0 ? "🥇" : `<span class="opacity-20 italic font-black text-xl">${i+1}</span>`;
            
            return `
            <div onclick="UI.inspectFriend('${u.uid}', '${u.name}')" class="liquid-card p-4 cursor-pointer hover:bg-white/5 flex flex-col gap-3 group">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-6 text-center">${isFirst}</div>
                        <div>
                            <p class="text-sm font-black group-hover:text-cyan-400">${u.name}</p>
                            <p class="text-[9px] font-bold ${statusColor}">${u.status}</p>
                        </div>
                    </div>
                    <p class="text-lg font-black mono text-white">${CORE.fmt(u.todayMins || 0)}</p>
                </div>
                <div class="flex justify-between items-center pt-2 border-t border-white/5">
                    <div class="flex gap-1">
                        ${CORE.habits.map(h => `<div class="w-2 h-2 rounded-full ${u.todayHabits?.[h.id] ? 'bg-emerald-500' : 'bg-white/5'}"></div>`).join('')}
                    </div>
                    <p class="text-[9px] font-bold text-slate-500">صفحات: <span class="text-emerald-500">${u.todayQuran || 0}</span></p>
                </div>
            </div>`;
        }).join('');
    },

    renderHistory(logs, containerId, isMe) {
        const box = document.getElementById(containerId);
        box.innerHTML = logs.map(l => `
            <div class="liquid-card p-6 border-r-4 ${isMe ? 'border-cyan-500/30' : 'border-white/5'}">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <p class="mono text-[10px] text-cyan-700 mb-1">${l.date}</p>
                        <h4 class="text-2xl font-black italic">مذاكرة: ${CORE.fmt(l.mins)}</h4>
                    </div>
                    ${isMe ? `<button onclick="UI.openEdit('${l.date}', ${l.mins}, ${l.quran}, ${JSON.stringify(l.habits || {}).replace(/"/g, '&quot;')})" class="bg-white/5 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-cyan-500 hover:text-white transition-all">تعديل</button>` : ''}
                </div>
                <p class="text-sm font-bold text-slate-400 mb-3">عدد صفحات القرآن: <span class="text-emerald-500">${l.quran || 0}</span></p>
                <div class="flex flex-wrap gap-2">
                    ${CORE.habits.map(h => `<span class="px-3 py-1 rounded-lg text-[9px] font-black ${l.habits?.[h.id] ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/10 text-red-900'}">${h.n}</span>`).join('')}
                </div>
            </div>
        `).join('');
    },

    async inspectFriend(uid, name) {
        document.getElementById('inspect-name').innerText = name;
        this.toggleModal('inspect-modal', true);
        const box = document.getElementById('inspect-content');
        box.innerHTML = '<p class="text-center py-20 mono text-cyan-500 animate-pulse">Scanning_Bio_Data...</p>';
        const snap = await getDocs(query(collection(DB, "users", uid, "logs"), orderBy("date", "desc")));
        this.renderHistory(snap.docs.map(d => d.data()), 'inspect-content', false);
    },

    openEdit(date, mins, quran, habits) {
        CORE.editRef = { date, habits };
        document.getElementById('edit-mins').value = mins;
        document.getElementById('edit-quran').value = quran;
        document.getElementById('edit-habits').innerHTML = CORE.habits.map(h => `
            <div class="flex flex-col items-center p-3 bg-white/5 rounded-2xl">
                <span class="text-[9px] font-bold mb-2">${h.n}</span>
                <input type="checkbox" ${habits[h.id] ? 'checked' : ''} onchange="CORE.editRef.habits['${h.id}'] = this.checked" class="w-5 h-5 accent-emerald-500">
            </div>
        `).join('');
        this.toggleModal('edit-modal', true);
    },

    renderChat(msgs) {
        const box = document.getElementById('chat-box');
        box.innerHTML = msgs.map(m => {
            const isMe = m.uid === CORE.user.uid;
            return `
            <div class="flex flex-col ${isMe ? 'items-start' : 'items-end'} w-full">
                <span class="text-[9px] font-black text-slate-600 mb-1 px-2">${m.sender}</span>
                <div class="chat-msg ${isMe ? 'msg-me' : 'msg-other'}">${m.text}</div>
            </div>`;
        }).join('');
        box.scrollTop = box.scrollHeight;
    },

    toggleModal(id, open) { document.getElementById(id).classList.toggle('hidden', !open); }
};

const CORE = new TitanX();
window.CORE = CORE; window.UI = UI;

onAuthStateChanged(AUTH, u => u ? CORE.boot(u) : UI.init(false));
document.getElementById('login-btn').onclick = () => signInWithPopup(AUTH, PROVIDER);
document.getElementById('timer-btn').onclick = () => CORE.toggle();
document.getElementById('quran-save').onclick = () => {
    const val = parseInt(document.getElementById('quran-in').value) || 0;
    if(val > 0) CORE.pushMetric('quran', val).then(() => document.getElementById('quran-in').value = '');
};
document.getElementById('save-edit').onclick = async () => {
    const m = parseInt(document.getElementById('edit-mins').value) || 0;
    const q = parseInt(document.getElementById('edit-quran').value) || 0;
    const ref = doc(DB, "users", CORE.user.uid, "logs", CORE.editRef.date);
    await updateDoc(ref, { mins: m, quran: q, habits: CORE.editRef.habits });
    if(CORE.editRef.date === CORE.today) {
        await updateDoc(doc(DB, "users", CORE.user.uid), { todayMins: m, todayQuran: q, todayHabits: CORE.editRef.habits });
    }
    UI.toggleModal('edit-modal', false);
};
document.getElementById('chat-send').onclick = async () => {
    const inp = document.getElementById('chat-in');
    if(inp.value.trim()) {
        await addDoc(collection(DB, "chat"), { text: inp.value, sender: CORE.user.displayName, uid: CORE.user.uid, timestamp: serverTimestamp() });
        inp.value = '';
    }
};
setInterval(() => document.getElementById('live-clock').innerText = new Date().toLocaleTimeString('en-GB'), 1000);