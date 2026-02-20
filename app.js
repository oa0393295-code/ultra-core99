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

class SystemCore {
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
        
        // التقاط حدث إغلاق الصفحة لتحويل الحالة إلى غير متصل
        window.addEventListener('beforeunload', () => {
            if(this.user) this.setStatusSync("غير متصل");
        });
    }

    formatTime(mins) {
        if (!mins || mins <= 0) return "0.00";
        return `${Math.floor(mins / 60)}.${(mins % 60).toString().padStart(2, '0')}`;
    }

    async init(user) {
        this.user = user;
        UI.showApp(true);
        this.loadLocal();
        this.syncData();
        await this.ping(this.active ? "بيذاكر دلوقتي" : "مريح شوية");
    }

    loadLocal() {
        this.secs = parseInt(localStorage.getItem(`t4_${this.user.uid}`)) || 0;
        if (localStorage.getItem(`r4_${this.user.uid}`) === "true") this.toggleTimer(true);
        UI.renderOrb();
    }

    async toggleTimer(force = false) {
        if (!this.active || force) {
            this.active = true;
            localStorage.setItem(`r4_${this.user.uid}`, "true");
            UI.updateTimerUI(true);
            this.intv = setInterval(() => {
                this.secs++;
                localStorage.setItem(`t4_${this.user.uid}`, this.secs);
                UI.renderOrb();
                // تحديث الداتا بيز كل 60 ثانية لضمان ظهور اللايف عند الباقي
                if (this.secs % 60 === 0) {
                    this.updateLog('mins', 1);
                    this.ping("بيذاكر دلوقتي"); 
                }
            }, 1000);
            await this.ping("بيذاكر دلوقتي");
        } else {
            clearInterval(this.intv);
            this.active = false;
            localStorage.setItem(`r4_${this.user.uid}`, "false");
            UI.updateTimerUI(false);
            await this.ping("مريح شوية");
        }
    }

    async updateLog(key, val) {
        const ref = doc(DB, "users", this.user.uid, "logs", this.today);
        await setDoc(ref, { [key]: increment(val), date: this.today }, { merge: true });
        
        // تحديث البيانات الرئيسية لتظهر في لوحة المتصدرين فوراً
        const rootUpdate = {};
        if (key === 'mins') rootUpdate.todayMins = Math.floor(this.secs / 60);
        if (key === 'quran') rootUpdate.todayQuran = increment(val);
        await updateDoc(doc(DB, "users", this.user.uid), rootUpdate);
    }

    async togglePrayer(id, isDone) {
        const ref = doc(DB, "users", this.user.uid, "logs", this.today);
        await setDoc(ref, { habits: { [id]: isDone }, date: this.today }, { merge: true });
        
        // جلب الصلوات لنسخها في المسار الرئيسي للوحة المتصدرين
        const snap = await getDoc(ref);
        const currentHabits = snap.data().habits || {};
        await updateDoc(doc(DB, "users", this.user.uid), { todayHabits: currentHabits });
    }

    async ping(statusText) {
        if (!this.user) return;
        await updateDoc(doc(DB, "users", this.user.uid), {
            name: this.user.displayName,
            uid: this.user.uid,
            status: statusText,
            todayMins: Math.floor(this.secs / 60),
            day: this.today,
            lastSeen: serverTimestamp()
        });
    }

    // دالة متزامنة تُستخدم وقت إغلاق المتصفح (تعمل بشكل أفضل من await في beforeunload)
    setStatusSync(statusText) {
        const data = JSON.stringify({ fields: { status: { stringValue: statusText } } });
        const url = `https://firestore.googleapis.com/v1/projects/ultra-core/databases/(default)/documents/users/${this.user.uid}?updateMask.fieldPaths=status`;
        navigator.sendBeacon(url, data); 
    }

    syncData() {
        // المتصدرين
        onSnapshot(query(collection(DB, "users"), limit(30)), snap => {
            const list = snap.docs.map(d => d.data())
                        .filter(u => u.day === this.today)
                        .sort((a,b) => (b.todayMins || 0) - (a.todayMins || 0));
            UI.renderLeaderboard(list);
        });

        // السجل الشخصي
        onSnapshot(query(collection(DB, "users", this.user.uid, "logs"), orderBy("date", "desc")), snap => {
            const logs = snap.docs.map(d => d.data());
            const todayLog = logs.find(l => l.date === this.today);
            if (todayLog) UI.syncStatsPanel(todayLog);
            UI.renderHistory(logs, 'history-feed', true);
        });

        // الشات
        onSnapshot(query(collection(DB, "chat"), orderBy("timestamp", "asc"), limit(50)), snap => {
            UI.renderChat(snap.docs.map(d => d.data()));
        });
    }
}

const UI = {
    showApp(show) {
        document.getElementById('auth-gate').style.display = show ? 'none' : 'flex';
        const shell = document.getElementById('app-shell');
        shell.classList.toggle('hidden', !show);
        if(show) {
            setTimeout(() => shell.style.opacity = '1', 50);
            document.getElementById('u-name').innerText = CORE.user.displayName;
            document.getElementById('u-avatar').innerText = CORE.user.displayName[0];
            this.drawPrayersChecklist();
        }
    },

    drawPrayersChecklist() {
        const box = document.getElementById('prayer-checklist');
        box.innerHTML = CORE.habits.map(h => `
            <div class="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
                <span class="text-sm font-bold text-slate-300">${h.n}</span>
                <input type="checkbox" id="p-${h.id}" onchange="CORE.togglePrayer('${h.id}', this.checked)" class="w-5 h-5 accent-emerald-500 cursor-pointer">
            </div>
        `).join('');
    },

    renderOrb() {
        const s = CORE.secs;
        const hh = Math.floor(s / 3600).toString().padStart(2, '0');
        const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${hh}:${mm}`;
        const offset = 1162 - ((s % 60) / 60 * 1162);
        document.getElementById('orb-fill').style.strokeDashoffset = offset;
    },

    updateTimerUI(isActive) {
        const btn = document.getElementById('timer-btn');
        const tag = document.getElementById('status-tag');
        btn.innerText = isActive ? "إيقاف مؤقت" : "ابدأ المذاكرة";
        btn.style.background = isActive ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" : "";
        tag.innerText = isActive ? "بيذاكر دلوقتي" : "مريح شوية";
        tag.className = `text-sm font-black mt-4 px-4 py-1 rounded-full ${isActive ? 'bg-cyan-900/50 text-cyan-400 animate-pulse' : 'bg-slate-900/50 text-slate-500'}`;
    },

    syncStatsPanel(data) {
        document.getElementById('stat-mins').innerText = CORE.formatTime(data.mins || 0);
        document.getElementById('stat-quran').innerText = data.quran || 0;
        CORE.habits.forEach(h => {
            const el = document.getElementById(`p-${h.id}`);
            if (el) el.checked = !!(data.habits?.[h.id]);
        });
    },

    // بناء شكل السجل (يستخدم للسجل الشخصي وسجل الصديق)
    renderHistory(logs, containerId, isMe) {
        const box = document.getElementById(containerId);
        box.innerHTML = logs.map(l => `
            <div class="bg-slate-900/40 p-5 rounded-xl border border-white/5 flex flex-col gap-3">
                <div class="flex justify-between items-center border-b border-white/5 pb-2">
                    <p class="mono text-xs text-cyan-600">${l.date}</p>
                    <p class="text-xl font-black">${CORE.formatTime(l.mins || 0)} <span class="text-sm text-slate-500 font-bold">ساعة</span></p>
                </div>
                <div class="flex justify-between items-center">
                    <p class="text-sm font-bold text-slate-300">عدد صفحات القرآن: <span class="text-emerald-500 font-black">${l.quran || 0}</span></p>
                </div>
                <div class="flex flex-wrap gap-2 mt-1">
                    ${CORE.habits.map(h => `<span class="prayer-box ${l.habits?.[h.id] ? 'done' : 'fail'}">${h.n}</span>`).join('')}
                </div>
            </div>
        `).join('');
    },

    renderLeaderboard(users) {
        const box = document.getElementById('rankings');
        box.innerHTML = users.map((u, i) => {
            let statusColor = u.status === "بيذاكر دلوقتي" ? "text-emerald-400" : (u.status === "مريح شوية" ? "text-amber-400" : "text-slate-600");
            let medal = i === 0 ? "🥇" : `<span class="text-lg opacity-30">${i+1}</span>`;
            
            // حساب صلوات اليوم
            let prayersHTML = CORE.habits.map(h => `<div class="w-2 h-2 rounded-sm ${u.todayHabits?.[h.id] ? 'bg-emerald-500' : 'bg-red-500/30'}" title="${h.n}"></div>`).join('');

            return `
            <div onclick="UI.inspectFriend('${u.uid}', '${u.name}')" class="bg-slate-900/50 p-4 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors border border-white/5 group">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-6 text-center font-black">${medal}</div>
                        <div>
                            <p class="text-sm font-black group-hover:text-cyan-400 transition-colors">${u.name}</p>
                            <p class="text-[10px] font-bold ${statusColor}">${u.status || 'غير متصل'}</p>
                        </div>
                    </div>
                    <p class="text-lg font-black mono text-cyan-500">${CORE.formatTime(u.todayMins || 0)}</p>
                </div>
                <div class="flex items-center justify-between border-t border-white/5 pt-2 mt-1">
                    <div class="flex gap-1">${prayersHTML}</div>
                    <span class="text-[10px] font-bold text-slate-400">قرآن: <span class="text-emerald-500">${u.todayQuran || 0}</span></span>
                </div>
            </div>`;
        }).join('');
    },

    async inspectFriend(uid, name) {
        document.getElementById('inspect-name').innerText = name;
        this.toggleModal('inspect-modal', true);
        const box = document.getElementById('inspect-content');
        box.innerHTML = '<p class="text-center text-cyan-500 font-bold py-10 animate-pulse">جاري سحب البيانات...</p>';
        
        const snap = await getDocs(query(collection(DB, "users", uid, "logs"), orderBy("date", "desc")));
        const logs = snap.docs.map(d => d.data());
        
        if(logs.length === 0) {
            box.innerHTML = '<p class="text-center text-slate-500 py-10">لا توجد سجلات لهذا المستخدم.</p>';
        } else {
            this.renderHistory(logs, 'inspect-content', false);
        }
    },

    renderChat(msgs) {
        const box = document.getElementById('chat-box');
        box.innerHTML = msgs.map(m => {
            const isMe = m.uid === CORE.user.uid;
            return `
            <div class="chat-msg ${isMe ? 'chat-me' : 'chat-other'} flex flex-col">
                ${!isMe ? `<span class="chat-sender pl-1">${m.sender}</span>` : ''}
                <div class="chat-bubble flex flex-col">
                    <span>${m.text}</span>
                </div>
            </div>`;
        }).join('');
        box.scrollTop = box.scrollHeight;
    },

    toggleModal(id, open) { document.getElementById(id).classList.toggle('hidden', !open); }
};

const CORE = new SystemCore();
window.CORE = CORE; window.UI = UI;

onAuthStateChanged(AUTH, u => u ? CORE.init(u) : UI.showApp(false));

document.getElementById('login-btn').onclick = () => signInWithPopup(AUTH, PROV);
document.getElementById('timer-btn').onclick = () => CORE.toggleTimer();

document.getElementById('quran-save').onclick = () => {
    const val = parseInt(document.getElementById('quran-in').value) || 0;
    if(val > 0) CORE.updateLog('quran', val).then(() => document.getElementById('quran-in').value = '');
};

document.getElementById('chat-send').onclick = async () => {
    const inp = document.getElementById('chat-in');
    if(inp.value.trim()) {
        await addDoc(collection(DB, "chat"), { 
            text: inp.value.trim(), sender: CORE.user.displayName, uid: CORE.user.uid, timestamp: serverTimestamp() 
        });
        inp.value = '';
    }
};

// تشغيل الساعة العلوية
setInterval(() => document.getElementById('live-clock').innerText = new Date().toLocaleTimeString('ar-EG'), 1000);