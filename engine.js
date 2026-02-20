import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, query, collection, orderBy, limit, updateDoc, increment, addDoc, serverTimestamp, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { UI } from "./ui.js";

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

export const ENGINE = {
    user: null,
    isRunning: false,
    seconds: 0,
    timerInt: null,
    today: new Date().toLocaleDateString('en-CA'),
    habits: [
        {id:'fajr', n:'الفجر'}, {id:'dhuhr', n:'الظهر'}, {id:'asr', n:'العصر'}, 
        {id:'maghrib', n:'المغرب'}, {id:'isha', n:'العشاء'}, {id:'taraweeh', n:'تراويح'}
    ],

    // القاعدة الذهبية (90 دقيقة -> 1.30)
    toTitanTime(totalMins) {
        if (!totalMins || totalMins <= 0) return "0.00";
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return `${h}.${m.toString().padStart(2, '0')}`;
    },

    async boot() {
        onAuthStateChanged(AUTH, async u => {
            if (u) {
                this.user = u;
                UI.setup(true);
                this.loadLocal();
                this.initSync();
                await this.pingStatus(this.isRunning ? "عمليات نشطة 🔥" : "استراحة ☕");
            } else {
                UI.setup(false);
            }
        });
    },

    loadLocal() {
        const uid = this.user.uid;
        this.seconds = parseInt(localStorage.getItem(`tx_sec_${uid}`)) || 0;
        if (localStorage.getItem(`tx_run_${uid}`) === "true") this.ignite(true);
        UI.refreshOrb();
    },

    async ignite(force = false) {
        const uid = this.user.uid;
        if (!this.isRunning || force) {
            this.isRunning = true;
            localStorage.setItem(`tx_run_${uid}`, "true");
            UI.updateTriggerUI(true);
            
            this.timerInt = setInterval(() => {
                this.seconds++;
                localStorage.setItem(`tx_sec_${uid}`, this.seconds);
                UI.refreshOrb();
                if (this.seconds % 60 === 0) {
                    this.pushMetric('mins', 1);
                    this.pingStatus("عمليات نشطة 🔥");
                }
            }, 1000);
        } else {
            clearInterval(this.timerInt);
            this.isRunning = false;
            localStorage.setItem(`tx_run_${uid}`, "false");
            UI.updateTriggerUI(false);
            await this.pingStatus("استراحة ☕");
        }
    },

    async pushMetric(field, val) {
        const ref = doc(DB, "users", this.user.uid, "logs", this.today);
        await setDoc(ref, { [field]: increment(val), date: this.today }, { merge: true });
    },

    async pingStatus(msg) {
        if (!this.user) return;
        const m = Math.floor(this.seconds / 60);
        await updateDoc(doc(DB, "users", this.user.uid), {
            status: msg,
            todayMins: m,
            lastPing: serverTimestamp(),
            day: this.today,
            name: this.user.displayName,
            uid: this.user.uid
        });
    },

    initSync() {
        // ترتيب المتصدرين (اليوم فقط)
        onSnapshot(query(collection(DB, "users"), limit(40)), snap => {
            const data = snap.docs.map(d => d.data())
                        .filter(u => u.day === this.today)
                        .sort((a,b) => (b.todayMins || 0) - (a.todayMins || 0));
            UI.renderRankings(data);
        });

        // السجل الشخصي
        onSnapshot(query(collection(DB, "users", this.user.uid, "logs"), orderBy("date", "desc")), snap => {
            const logs = snap.docs.map(d => d.data());
            const current = logs.find(l => l.date === this.today);
            if (current) UI.syncStats(current);
            UI.renderHistory(logs);
        });

        // الدردشة
        onSnapshot(query(collection(DB, "chat"), orderBy("timestamp", "asc"), limit(60)), snap => {
            UI.renderChat(snap.docs.map(d => d.data()));
        });
    }
};

// تشغيل المفاعل
ENGINE.boot();

// Export Actions
window.titanLogin = () => signInWithPopup(AUTH, PROVIDER);
window.titanLogout = () => signOut(AUTH).then(() => { localStorage.clear(); location.reload(); });
window.titanAction = () => ENGINE.ignite();