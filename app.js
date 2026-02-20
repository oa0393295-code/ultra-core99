import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, query, collection, orderBy, limit, updateDoc, increment, addDoc, serverTimestamp, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

class TitanEngine {
    constructor() {
        this.user = null;
        this.active = false;
        this.secs = 0;
        this.intv = null;
        this.today = new Date().toLocaleDateString('en-CA');
        this.habits = [
            {id:'fajr', n:'الفجر'}, {id:'dhuhr', n:'الظهر'}, {id:'asr', n:'العصر'},
            {id:'maghrib', n:'المغرب'}, {id:'isha', n:'العشاء'}, {id:'taraweeh', n:'التراويح'}
        ];
        this.editRef = null;

        // منطق تصفير العداد عند إغلاق الصفحة وحفظ الحالة كـ Offline
        window.addEventListener('beforeunload', () => {
            if(this.user) {
                this.setStatusBeacon("offline");
                // ملاحظة: العداد يتصفر تلقائياً لأننا لا نحفظه في localStorage عند الخروج حسب طلبك
                localStorage.removeItem(`titan_run_${this.user.uid}`);
                localStorage.removeItem(`titan_sec_${this.user.uid}`);
            }
        });
    }

    // تنسيق الوقت الذكي
    fmt(totalMins) {
        if (!totalMins || totalMins <= 0) return "0";
        if (totalMins < 60) return `${totalMins} دقيقة`;
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return `${h}.${m.toString().padStart(2, '0')} ساعة`;
    }

    async init(user) {
        this.user = user;
        UI.boot(true);
        this.sync();
        await this.ping("مريح شوية"); // الحالة الافتراضية عند فتح الصفحة
    }

    toggle() {
        if (!this.active) {
            this.active = true;
            UI.timerState(true);
            this.intv = setInterval(() => {
                this.secs++;
                UI.renderOrb();
                if (this.secs % 60 === 0) {
                    this.pushMetric('mins', 1);
                    this.ping("بيذاكر دلوقتي");
                }
            }, 1000);
            this.ping("بيذاكر دلوقتي");
        } else {
            clearInterval(this.intv);
            this.active = false;
            UI.timerState(false);
            this.ping("مريح شوية");
        }
    }

    async pushMetric(key, val) {
        const ref = doc(DB, "users", this.user.uid, "logs", this.today);
        await setDoc(ref, { [key]: increment(val), date: this.today }, { merge: true });
        
        const root = doc(DB, "users", this.user.uid);
        if(key === 'mins') {
            const snap = await getDoc(ref);
            await updateDoc(root, { todayMins: snap.data().mins || 0 });
        }
        if(key === 'quran') await updateDoc(root, { todayQuran: increment(val) });
    }

    async ping(status) {
        if(!this.user) return;
        await updateDoc(doc(DB, "users", this.user.uid), {
            status,
            lastPing: serverTimestamp(),
            day: this.today,
            name: this.user.displayName
        });
    }

    setStatusBeacon(status) {
        const url = `https://firestore.googleapis.com/v1/projects/ultra-core/databases/(default)/documents/users/${this.user.uid}?updateMask.fieldPaths=status`;
        const data = JSON.stringify({ fields: { status: { stringValue: status } } });
        navigator.sendBeacon(url, data);
    }

    sync() {
        // لوحة المتصدرين
        onSnapshot(query(collection(DB, "users"), limit(25)), snap => {
            const list = snap.docs.map(d => d.data())
                        .filter(u => u.day === this.today)
                        .sort((a,b) => (b.todayMins || 0) - (a.todayMins || 0));
            UI.drawRanks(list);
        });

        // السجل الشخصي
        onSnapshot(query(collection(DB, "users", this.user.uid, "logs"), orderBy("date", "desc")), snap => {
            const logs = snap.docs.map(d => d.data());
            const todayLog = logs.find(l => l.date === this.today);
            if (todayLog) UI.updateStatsPanel(todayLog);
            UI.drawLogs(logs, 'history-feed', true);
        });

        // الشات
        onSnapshot(query(collection(DB, "chat"), orderBy("timestamp", "asc"), limit(40)), snap => {
            UI.drawChat(snap.docs.map(d => d.data()));
        });
    }
}

const UI = {
    boot(isAuth) {
        document.getElementById('auth-gate').style.display = isAuth ? 'none' : 'flex';
        const shell = document.getElementById('app-shell');
        shell.classList.toggle('hidden', !isAuth);
        if(isAuth) {
            setTimeout(() => shell.style.opacity = '1', 50);
            this.drawHabitsBase();
        }
    },

    drawHabitsBase() {
        const box = document.getElementById('prayer-checklist');
        box.innerHTML = ENGINE.habits.map(h => `
            <div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-cyan-500/30 transition-all">
                <span class="font-bold text-slate-300 group-hover:text-white">${h.n}</span>
                <input type="checkbox" id="p-${h.id}" onchange="UI.toggleHabit('${h.id}', this.checked)" class="w-6 h-6 accent-cyan-500 cursor-pointer">
            </div>
        `).join('');
    },

    renderOrb() {
        const s = ENGINE.secs;
        const mm = Math.floor(s / 60).toString().padStart(2, '0');
        const ss = (s % 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${mm}:${ss}`;
        const offset = 1131 - ((s % 60) / 60 * 1131);
        document.getElementById('orb-fill').style.strokeDashoffset = offset;
    },

    timerState(on) {
        const btn = document.getElementById('timer-btn');
        const tag = document.getElementById('status-tag');
        btn.innerText = on ? "STOP SESSION" : "START SESSION";
        btn.style.background = on ? "linear-gradient(135deg, #ef4444, #991b1b)" : "";
        tag.innerText = on ? "بيذاكر دلوقتي" : "مريح شوية";
        tag.className = `status-pill ${on ? 'text-cyan-400 border-cyan-500/30 animate-pulse' : 'text-slate-500'}`;
    },

    updateStatsPanel(data) {
        document.getElementById('stat-mins').innerText = ENGINE.fmt(data.mins || 0);
        document.getElementById('stat-quran').innerText = data.quran || 0;
        ENGINE.habits.forEach(h => {
            const el = document.getElementById(`p-${h.id}`);
            if (el) el.checked = !!(data.habits?.[h.id]);
        });
    },

    drawLogs(logs, containerId, canEdit) {
        const box = document.getElementById(containerId);
        box.innerHTML = logs.map(l => `
            <div class="liquid-panel-soft p-5 border border-white/5 group hover:border-cyan-500/20 transition-all">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <p class="mono text-[10px] text-cyan-600 mb-1">${l.date}</p>
                        <h4 class="text-xl font-black italic">مذاكرة: ${ENGINE.fmt(l.mins || 0)}</h4>
                    </div>
                    ${canEdit ? `<button onclick="UI.openEditModal('${l.date}', ${l.mins || 0}, ${l.quran || 0}, ${JSON.stringify(l.habits || {}).replace(/"/g, '&quot;')})" class="text-[10px] font-black uppercase text-cyan-500 hover:text-white">Edit</button>` : ''}
                </div>
                <div class="flex justify-between items-center bg-black/20 p-3 rounded-xl">
                    <p class="text-xs font-bold">عدد صفحات القرآن: <span class="text-emerald-500">${l.quran || 0}</span></p>
                    <div class="flex gap-1">
                        ${ENGINE.habits.map(h => `<div class="w-2 h-2 rounded-full ${l.habits?.[h.id] ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-white/5'}"></div>`).join('')}
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-1 mt-3">
                    ${ENGINE.habits.map(h => `<span class="p-block ${l.habits?.[h.id] ? 'active' : 'inactive'}">${h.n}</span>`).join('')}
                </div>
            </div>
        `).join('');
    },

    drawRanks(users) {
        const box = document.getElementById('rankings');
        box.innerHTML = users.map((u, i) => `
            <div onclick="UI.inspect('${u.uid}', '${u.name}')" class="liquid-panel-soft p-4 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-all group">
                <div class="flex items-center gap-4">
                    <span class="text-2xl font-black italic">${i === 0 ? '🥇' : i+1}</span>
                    <div>
                        <p class="text-sm font-black group-hover:text-cyan-400 transition-colors">${u.name}</p>
                        <p class="text-[10px] font-bold ${u.status === 'بيذاكر دلوقتي' ? 'text-cyan-400' : 'text-slate-600'}">${u.status}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-lg font-black mono text-cyan-500">${ENGINE.fmt(u.todayMins || 0)}</p>
                    <div class="flex gap-1 justify-end mt-1">
                        ${ENGINE.habits.map(h => `<div class="w-1.5 h-1.5 rounded-full ${u.todayHabits?.[h.id] ? 'bg-emerald-500' : 'bg-white/10'}"></div>`).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    },

    async inspect(uid, name) {
        document.getElementById('inspect-name').innerText = name;
        this.toggleModal('inspect-modal', true);
        const box = document.getElementById('inspect-content');
        box.innerHTML = '<p class="text-center font-black animate-pulse py-10">SCRAPING_LOG_DATA...</p>';
        const snap = await getDocs(query(collection(DB, "users", uid, "logs"), orderBy("date", "desc")));
        this.drawLogs(snap.docs.map(d => d.data()), 'inspect-content', false);
    },

    openEditModal(date, mins, quran, habits) {
        ENGINE.editRef = { date, habits };
        document.getElementById('edit-mins').value = mins;
        document.getElementById('edit-quran').value = quran;
        document.getElementById('edit-habits').innerHTML = ENGINE.habits.map(h => `
            <div class="flex flex-col items-center p-2 bg-white/5 rounded-xl border border-white/5">
                <span class="text-[9px] font-black mb-1">${h.n}</span>
                <input type="checkbox" ${habits[h.id] ? 'checked' : ''} onchange="ENGINE.editRef.habits['${h.id}'] = this.checked" class="w-5 h-5 accent-emerald-500">
            </div>
        `).join('');
        this.toggleModal('edit-modal', true);
    },

    drawChat(msgs) {
        const box = document.getElementById('chat-box');
        box.innerHTML = msgs.map(m => {
            const isMe = m.uid === ENGINE.user.uid;
            return `<div class="chat-entry ${isMe ? 'chat-right' : 'chat-left'}">
                <span class="text-[9px] font-bold text-slate-500 mb-1 ${isMe ? 'hidden' : ''}">${m.sender}</span>
                <div class="bubble">${m.text}</div>
            </div>`;
        }).join('');
        box.scrollTop = box.scrollHeight;
    },

    async toggleHabit(id, val) {
        const ref = doc(DB, "users", ENGINE.user.uid, "logs", ENGINE.today);
        await setDoc(ref, { habits: { [id]: val }, date: ENGINE.today }, { merge: true });
        const snap = await getDoc(ref);
        await updateDoc(doc(DB, "users", ENGINE.user.uid), { todayHabits: snap.data().habits });
    },

    toggleModal(id, open) { document.getElementById(id).classList.toggle('hidden', !open); }
};

const ENGINE = new TitanEngine();
window.ENGINE = ENGINE; window.UI = UI;

onAuthStateChanged(AUTH, u => u ? ENGINE.init(u) : UI.boot(false));
document.getElementById('login-btn').onclick = () => signInWithPopup(AUTH, PROV);
document.getElementById('timer-btn').onclick = () => ENGINE.toggle();
document.getElementById('quran-save').onclick = () => {
    const val = parseInt(document.getElementById('quran-in').value) || 0;
    if(val > 0) ENGINE.pushMetric('quran', val).then(() => document.getElementById('quran-in').value = '');
};
document.getElementById('chat-send').onclick = async () => {
    const inp = document.getElementById('chat-in');
    if(inp.value.trim()) {
        await addDoc(collection(DB, "chat"), { text: inp.value.trim(), sender: ENGINE.user.displayName, uid: ENGINE.user.uid, timestamp: serverTimestamp() });
        inp.value = '';
    }
};
document.getElementById('save-edit').onclick = async () => {
    const m = parseInt(document.getElementById('edit-mins').value) || 0;
    const q = parseInt(document.getElementById('edit-quran').value) || 0;
    const ref = doc(DB, "users", ENGINE.user.uid, "logs", ENGINE.editRef.date);
    await updateDoc(ref, { mins: m, quran: q, habits: ENGINE.editRef.habits });
    
    // إذا كان التعديل لليوم، نقوم بتحديث العداد فوراً
    if(ENGINE.editRef.date === ENGINE.today) {
        ENGINE.secs = 0; // تصفير العداد الجاري لأننا عدلنا القيمة المسجلة
        UI.renderOrb();
        await updateDoc(doc(DB, "users", ENGINE.user.uid), { todayMins: m, todayQuran: q, todayHabits: ENGINE.editRef.habits });
    }
    UI.toggleModal('edit-modal', false);
};

setInterval(() => document.getElementById('live-clock').innerText = new Date().toLocaleTimeString('ar-EG'), 1000);