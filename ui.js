import { ENGINE } from "./engine.js";

export const UI = {
    setup(isAuth) {
        const gate = document.getElementById('auth-gateway');
        const core = document.getElementById('titan-core');
        if (isAuth) {
            gate.style.display = 'none';
            core.classList.remove('hidden');
            setTimeout(() => core.style.opacity = '1', 100);
            this.injectStatic();
        } else {
            gate.style.display = 'flex';
            core.classList.add('hidden');
        }
    },

    injectStatic() {
        document.getElementById('u-name').innerText = ENGINE.user.displayName;
        document.getElementById('u-avatar').innerText = ENGINE.user.displayName[0];
        
        const grid = document.getElementById('habit-grid');
        grid.innerHTML = ENGINE.habits.map(h => `
            <div class="flex items-center justify-between p-5 bg-slate-900/40 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all group">
                <span class="text-sm font-bold text-slate-400 group-hover:text-white">${h.n}</span>
                <input type="checkbox" id="p-${h.id}" onchange="UI.toggleHabit('${h.id}')" class="w-6 h-6 accent-cyan-500 cursor-pointer">
            </div>
        `).join('');
    },

    refreshOrb() {
        const s = ENGINE.seconds;
        const hh = Math.floor(s / 3600).toString().padStart(2, '0');
        const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
        document.getElementById('timer-val').innerText = `${hh}:${mm}`;
        
        const offset = 1162 - ((s % 60) / 60 * 1162);
        document.getElementById('orb-progress').style.strokeDashoffset = offset;
    },

    updateTriggerUI(active) {
        const btn = document.getElementById('main-trigger');
        const sub = document.getElementById('timer-subtext');
        btn.innerText = active ? "SHUTDOWN" : "IGNITE";
        sub.innerText = active ? "System_Firing_Active 🔥" : "Idle_Standby_Ready ☕";
        active ? btn.classList.add('animate-pulse') : btn.classList.remove('animate-pulse');
    },

    syncStats(data) {
        document.getElementById('stat-study').innerText = ENGINE.toTitanTime(data.mins || 0);
        document.getElementById('stat-quran').innerText = data.quran || 0;
        ENGINE.habits.forEach(h => {
            const el = document.getElementById(`p-${h.id}`);
            if (el) el.checked = !!(data.habits && data.habits[h.id]);
        });
    },

    renderRankings(users) {
        const box = document.getElementById('leaderboard');
        box.innerHTML = users.map((u, i) => `
            <div onclick="UI.inspectUser('${u.uid}', '${u.name}')" class="glass-panel p-5 cursor-pointer flex justify-between items-center group">
                <div class="flex items-center gap-4">
                    <span class="text-2xl font-black italic opacity-20">${i+1}</span>
                    <div>
                        <p class="text-sm font-black group-hover:text-cyan-400 transition-colors">${u.name}</p>
                        <div class="flex gap-1 mt-1">
                            ${ENGINE.habits.map(h => `
                                <div class="w-1.5 h-1.5 rounded-full ${(u.lastHabits && u.lastHabits[h.id]) ? 'bg-emerald-500' : 'bg-red-500/20'}"></div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <p class="text-xl font-black mono text-cyan-500">${ENGINE.toTitanTime(u.todayMins || 0)}</p>
            </div>
        `).join('');
    },

    renderHistory(logs) {
        const box = document.getElementById('history-logs');
        box.innerHTML = logs.map(l => `
            <div class="glass-panel p-8 flex justify-between items-center border-r-4 border-slate-800">
                <div>
                    <p class="mono text-[10px] text-cyan-700 mb-1">${l.date}</p>
                    <h4 class="text-2xl font-black italic">مذاكرة: ${ENGINE.toTitanTime(l.mins || 0)} س</h4>
                    <div class="flex gap-1 mt-3">
                        ${ENGINE.habits.map(h => `
                            <div class="habit-square ${(l.habits && l.habits[h.id]) ? 'done' : 'not-done'}" data-label="${h.n}"></div>
                        `).join('')}
                    </div>
                </div>
                <button onclick="UI.openEdit('${l.date}', ${l.mins || 0}, ${l.quran || 0}, ${JSON.stringify(l.habits || {}).replace(/"/g, '&quot;')})" class="bg-white text-black px-8 py-3 rounded-2xl text-[10px] font-black uppercase hover:bg-cyan-500 transition-colors">Edit</button>
            </div>
        `).join('');
    },

    async inspectUser(uid, name) {
        const grid = document.getElementById('inspect-grid');
        document.getElementById('inspect-title').innerText = name;
        this.toggleModal('inspect-modal', true);
        
        // جلب سجلات الشخص التاني
        grid.innerHTML = '<p class="mono text-cyan-500 animate-pulse">Scanning_Database...</p>';
        const snap = await getDocs(query(collection(DB, "users", uid, "logs"), orderBy("date", "desc"), limit(12)));
        
        grid.innerHTML = snap.docs.map(d => {
            const data = d.data();
            return `
                <div class="glass-panel p-6 bg-black/40">
                    <p class="mono text-[10px] text-cyan-600 mb-4">${data.date}</p>
                    <p class="text-2xl font-black">${ENGINE.toTitanTime(data.mins || 0)} <span class="text-[10px] text-slate-700">STUDY</span></p>
                    <div class="flex gap-1 mt-4">
                        ${ENGINE.habits.map(h => `
                            <div class="w-3 h-3 rounded-sm ${(data.habits && data.habits[h.id]) ? 'bg-emerald-500' : 'bg-red-500/20'}"></div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    },

    toggleModal(id, state) { document.getElementById(id).classList.toggle('hidden', !state); }
};

// Event Binding (أهم خطوة لربط الأزرار)
document.getElementById('login-trigger').onclick = () => window.titanLogin();
document.getElementById('logout-trigger').onclick = () => window.titanLogout();
document.getElementById('main-trigger').onclick = () => window.titanAction();
document.getElementById('quran-push').onclick = () => {
    const val = parseInt(document.getElementById('quran-input').value) || 0;
    if(val > 0) ENGINE.pushMetric('quran', val).then(() => document.getElementById('quran-input').value = '');
};

// الساعة العلوية
setInterval(() => {
    document.getElementById('top-clock').innerText = new Date().toLocaleTimeString('en-GB', { hour12: false });
}, 1000);