import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs,
  updateDoc, onSnapshot, serverTimestamp, query, orderBy, addDoc, limit }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══════════════════════════════════
   CONFIG
══════════════════════════════════ */
const app = initializeApp({
  apiKey:            "AIzaSyASLT_wouo9BTjd-dH18x8CLbqBZSMbz04",
  authDomain:        "ultra-core.firebaseapp.com",
  projectId:         "ultra-core",
  storageBucket:     "ultra-core.firebasestorage.app",
  messagingSenderId: "351766462712",
  appId:             "1:351766462712:web:e683d8aa0d213b6e59fb0d",
  measurementId:     "G-8RVTD75KCP"
});
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

/* ══════════════════════════════════
   STATE
══════════════════════════════════ */
let currentUser     = null;
let studyTimer      = null;
let studyStartTime  = null;
let studySeconds    = 0;
let isStudying      = false;
let todayData       = {};
let allUsersUnsub   = null;
let chatUnsub       = null;
let editingDate     = null;
let heartbeatTimer  = null;


const TODAY = () => new Date().toISOString().split('T')[0];

/* ══════════════════════════════════
   AUTH
══════════════════════════════════ */
window.googleSignIn = async () => {
  try {
    showLoading(true);
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error(e);
    showLoading(false);
    showToast('فشل تسجيل الدخول، حاول تاني يسطا!', 'error');
  }
};

window.googleSignOut = async () => {
  if (isStudying) await stopStudy();
  await pushStatus('offline');
  await signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await initUser(user);
    showApp();
    loadTodayData();
    startRealtimeLeaderboard();
    startChat();
    await pushStatus('online');
    startHeartbeat();
  } else {
    currentUser = null;
    stopHeartbeat();
    showLogin();
    if (allUsersUnsub) { allUsersUnsub(); allUsersUnsub = null; }
    if (chatUnsub)     { chatUnsub();     chatUnsub     = null; }
  }
});

/* ══════════════════════════════════
   STATUS SYSTEM — حل مشكلة الحالة
  
  المشكلة: المتصفح مش بينفّذ الأحداث بشكل موثوق
  لما التاب يتخبى أو المتصفح يتقفل.
  
  الحل:
  ١- heartbeat كل 15 ثانية (lastHB في Firebase)
  ٢- العرض يحسب: لو lastHB أكتر من 40 ثانية → offline فعلياً
  ٣- لو التاب اتخبى ومفيش عداد → offline بعد 8 ثواني
  ٤- لو العداد شغال → نكمل heartbeat حتى لو التاب مخفي
══════════════════════════════════ */
async function pushStatus(status) {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), {
      status,
      lastHB:   serverTimestamp(),
      lastSeen: serverTimestamp()
    });
  } catch (e) {}
}

function startHeartbeat() {
  stopHeartbeat();
  // كل 15 ثانية نبعت heartbeat
  heartbeatTimer = setInterval(async () => {
    if (!currentUser) return;
    if (isStudying) {
      // العداد شغال → studying دايماً حتى لو التاب مخفي
      await pushStatus('studying');
    } else if (!document.hidden) {
      // التاب ظاهر ومفيش عداد
      await pushStatus('online');
    }
    // التاب مخفي + مفيش عداد: الـ hiddenTimer هيشتغل
  }, 15000);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

document.addEventListener('visibilitychange', async () => {
  if (!currentUser) return;
  if (!document.hidden) {
    // رجع التاب → نحدث فوراً
    await pushStatus(isStudying ? 'studying' : 'online');
  }
  // لو التاب اتخبى → مش بنعمل حاجة، الـ heartbeat هيكمل يشتغل
});

// لما الصفحة تتقفل
window.addEventListener('pagehide', () => {
  if (!currentUser) return;
  pushStatus('offline');
});
window.addEventListener('beforeunload', () => {
  if (!currentUser) return;
  pushStatus('offline');
});

/* حساب الحالة الفعلية من lastHB */
function effectiveStatus(u) {
  const hb  = u.lastHB?.toDate?.()?.getTime?.() ?? 0;
  const age = (Date.now() - hb) / 1000;
  // بس لو فات 3 دقائق من غير heartbeat خالص → offline
  if (age > 180) return 'offline';
  return u.status || 'offline';
}

/* ══════════════════════════════════
   USER INIT
══════════════════════════════════ */
async function initUser(user) {
  const ref  = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid, name: user.displayName, photo: user.photoURL,
      status: 'online', lastHB: serverTimestamp(),
      lastSeen: serverTimestamp(), createdAt: serverTimestamp()
    });
  } else {
    await updateDoc(ref, { name: user.displayName, photo: user.photoURL });
  }
  document.getElementById('userAvatar').src   = user.photoURL || '';
  document.getElementById('userName').textContent = user.displayName;
}

/* ══════════════════════════════════
   TODAY DATA
══════════════════════════════════ */
async function loadTodayData() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(doc(db, 'logs', currentUser.uid, 'days', TODAY()));
    todayData  = snap.exists() ? snap.data()
                               : { prayers: [], quranPages: 0, studySeconds: 0, date: TODAY() };
    renderTodayUI();
    studySeconds = todayData.studySeconds || 0;
    updateTimerDisplay();
    updateMyStats();
  } catch (e) { console.warn('loadTodayData', e); }
}

async function saveTodayData() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, 'logs', currentUser.uid, 'days', TODAY()), {
      ...todayData, uid: currentUser.uid,
      name: currentUser.displayName, photo: currentUser.photoURL,
      updatedAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'users', currentUser.uid), {
      todayStudySeconds: todayData.studySeconds || 0,
      todayPrayers:      todayData.prayers      || [],
      todayQuranPages:   todayData.quranPages    || 0,
      todayDate: TODAY()
    });
  } catch (e) { console.warn('saveTodayData', e); }
}

function renderTodayUI() {
  const prayers = todayData.prayers || [];
  document.querySelectorAll('.prayer-btn').forEach(btn => {
    btn.classList.toggle('active', prayers.includes(btn.dataset.prayer));
  });
  document.getElementById('quranInput').value = todayData.quranPages || 0;
}

/* ══════════════════════════════════
   PRAYERS
══════════════════════════════════ */
window.togglePrayer = async (prayer) => {
  let prayers = [...(todayData.prayers || [])];
  if (prayers.includes(prayer)) {
    prayers = prayers.filter(p => p !== prayer);
  } else {
    prayers.push(prayer);
    const btn = event.currentTarget;
    btn.style.transform = 'scale(1.3)';
    setTimeout(() => btn.style.transform = '', 300);
    spawnParticles(btn);
  }
  todayData.prayers = prayers;
  await saveTodayData();
  renderTodayUI();
  updateMyStats();
};

/* ══════════════════════════════════
   QURAN
══════════════════════════════════ */
window.saveQuran = async () => {
  const val = Math.max(0, parseInt(document.getElementById('quranInput').value) || 0);
  todayData.quranPages = val;
  await saveTodayData();
  showToast(`✅ تمام! اتقرأت ${val} صفحة`, 'success');
  updateMyStats();
};

/* ══════════════════════════════════
   TIMER
   بيستخدم Date.now() مش counter
   → دقيق حتى لو المتصفح بطّأ الـ interval
══════════════════════════════════ */
window.toggleStudy = async () => {
  isStudying ? await stopStudy() : await startStudy();
};

async function startStudy() {
  isStudying     = true;
  studyStartTime = Date.now() - (studySeconds * 1000);
  await pushStatus('studying');
  document.getElementById('timerBtn').textContent = '⏸ استنّى شوية';
  document.getElementById('timerBtn').classList.add('studying');
  document.getElementById('timerStatus').textContent = 'شغّال بيذاكر...';
  document.getElementById('timerStatus').classList.add('active');

  studyTimer = setInterval(async () => {
    studySeconds = Math.floor((Date.now() - studyStartTime) / 1000);
    updateTimerDisplay();
    if (studySeconds % 30 === 0) {
      todayData.studySeconds = studySeconds;
      await saveTodayData();
    }
  }, 1000);
}

async function stopStudy() {
  isStudying = false;
  clearInterval(studyTimer); studyTimer = null;
  todayData.studySeconds = studySeconds;
  await saveTodayData();
  await pushStatus('online');
  document.getElementById('timerBtn').textContent = '▶ يلا نذاكر';
  document.getElementById('timerBtn').classList.remove('studying');
  document.getElementById('timerStatus').textContent = 'واقف';
  document.getElementById('timerStatus').classList.remove('active');
  updateMyStats();
  showToast('✅ تم حفظ وقت المذاكرة يسطا!', 'success');
}

function updateTimerDisplay() {
  const h = Math.floor(studySeconds / 3600);
  const m = Math.floor((studySeconds % 3600) / 60);
  const s = studySeconds % 60;
  document.getElementById('timerHours').textContent = String(h).padStart(2,'0');
  document.getElementById('timerMins').textContent  = String(m).padStart(2,'0');
  document.getElementById('timerSecs').textContent  = String(s).padStart(2,'0');
  const pct  = Math.min(studySeconds / (8 * 3600), 1);
  const circ = 2 * Math.PI * 90;
  document.getElementById('timerCircle').style.strokeDashoffset = circ * (1 - pct);
}

function updateMyStats() {
  const h = Math.floor(studySeconds / 3600);
  const m = Math.floor((studySeconds % 3600) / 60);
  document.getElementById('myStudyHours').textContent   = `${h}h ${m}m`;
  document.getElementById('myPrayersCount').textContent = `${(todayData.prayers||[]).length}/6`;
  document.getElementById('myQuranPages').textContent   = todayData.quranPages || 0;
}

/* ══════════════════════════════════
   LEADERBOARD
══════════════════════════════════ */
function startRealtimeLeaderboard() {
  allUsersUnsub = onSnapshot(collection(db, 'users'), snap => {
    const users = [];
    snap.forEach(d => users.push({ id: d.id, ...d.data() }));
    renderLeaderboards(users);
  }, e => console.warn('leaderboard', e));
}

function renderLeaderboards(users) {
  const today   = TODAY();
  const withToday = users.map(u => ({
    ...u,
    studySecs:  u.todayDate === today ? (u.todayStudySeconds || 0) : 0,
    prayers:    u.todayDate === today ? (u.todayPrayers      || []) : [],
    quranPages: u.todayDate === today ? (u.todayQuranPages   || 0) : 0,
  }));

  renderBoard('studyBoard', [...withToday].sort((a,b) => b.studySecs - a.studySecs),
    u => { const h=Math.floor(u.studySecs/3600),m=Math.floor((u.studySecs%3600)/60); return `${h}h ${m}m`; },
    u => u.studySecs);
  renderBoard('prayersBoard', [...withToday].sort((a,b) => b.prayers.length - a.prayers.length),
    u => `${u.prayers.length} / 6 صلوات`,
    u => u.prayers.length / 6);
  renderBoard('quranBoard', [...withToday].sort((a,b) => b.quranPages - a.quranPages),
    u => `${u.quranPages} صفحة`,
    u => u.quranPages);

  renderFriendsStatus(withToday);
}

function renderBoard(containerId, users, valueFn, progressFn) {
  const medals = ['🥇','🥈','🥉'];
  const maxVal  = Math.max(...users.map(progressFn), 1);

  document.getElementById(containerId).innerHTML =
    users.slice(0,10).map((u, i) => {
      const isMe = u.id === currentUser?.uid;
      const pct  = Math.round((progressFn(u) / maxVal) * 100);
      return `
        <div class="board-row ${isMe?'me':''}" onclick="openUserLog('${u.id}','${(u.name||'').replace(/'/g,"\\'")}')">
          <div class="board-rank">${medals[i] || '#'+(i+1)}</div>
          <img class="board-avatar" src="${u.photo||''}"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23223%22 width=%2240%22 height=%2240%22 rx=%2220%22/><text x=%2250%25%22 y=%2256%25%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%234fc3f7%22 font-size=%2218%22>${(u.name||'?')[0]}</text></svg>'">
          <div class="board-info">
            <div class="board-name">${u.name||'مجهول'} ${isMe?'<span style="font-size:.65rem;background:rgba(79,195,247,.15);border:1px solid rgba(79,195,247,.3);border-radius:4px;padding:.05rem .35rem;color:var(--accent);margin-right:3px">(أنا)</span>':''}</div>
            <div class="board-progress-bar"><div class="board-progress-fill" style="width:${pct}%"></div></div>
          </div>
          <div class="board-value">${valueFn(u)}</div>
        </div>`;
    }).join('') || '<div class="empty-board">مفيش بيانات النهارده لسه 😅</div>';
}

function renderFriendsStatus(users) {
  const statusMap = {
    studying: { icon:'📚', label:'بيذاكر دلوقتي', color:'#00e676', pulse:true  },
    online:   { icon:'🟢', label:'متصل',           color:'#4fc3f7', pulse:false },
    offline:  { icon:'⭕', label:'مش موجود',       color:'#555',    pulse:false },
  };
  document.getElementById('friendsStatus').innerHTML = users.map(u => {
    const isMe = u.id === currentUser?.uid;
    // حالتي أنا تتحسب محلياً من المتغيرات مش من Firebase
    const myStatus = isMe ? (isStudying ? 'studying' : 'online') : effectiveStatus(u);
    const st = statusMap[myStatus] || statusMap.offline;
    return `
      <div class="friend-status-card ${isMe?'me':''}">
        <img src="${u.photo||''}" class="friend-photo"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23223%22 width=%2240%22 height=%2240%22 rx=%2220%22/></svg>'">
        <div class="friend-status-dot" style="background:${st.color}; ${st.pulse?'animation:statusPulse 1.5s infinite;':''}"></div>
        <div class="friend-name-text">${(u.name||'؟').split(' ')[0]} ${isMe?'(أنا)':''}</div>
        <div class="friend-status-label" style="color:${st.color}">${st.icon} ${st.label}</div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════
   LOG MODAL
══════════════════════════════════ */
window.openUserLog = async (uid, name) => {
  document.getElementById('logModal').style.display = 'flex';
  document.getElementById('logModalTitle').textContent = `📋 سجل ${name}`;
  document.getElementById('logContent').innerHTML = '<div class="log-loading">استنّى بنجيب البيانات...</div>';

  try {
    const q    = query(collection(db,'logs',uid,'days'), orderBy('date','desc'));
    const snap = await getDocs(q);
    const days = [];
    snap.forEach(d => days.push(d.data()));

    if (!days.length) {
      document.getElementById('logContent').innerHTML = '<div class="log-empty">مفيش سجلات لسه 📭</div>';
      return;
    }
    const isMe = uid === currentUser?.uid;
    document.getElementById('logContent').innerHTML = days.map(day => {
      const h  = Math.floor((day.studySeconds||0)/3600);
      const m  = Math.floor(((day.studySeconds||0)%3600)/60);
      const pr = day.prayers || [];
      const isT = day.date === TODAY();
      return `
        <div class="log-day-card ${isT?'today':''}">
          <div class="log-day-header">
            <span class="log-date">${formatDate(day.date)} ${isT?'🔵 النهارده':''}</span>
            ${isMe ? `<button class="edit-log-btn" onclick="openEditLog('${day.date}')">✏️ تعديل</button>` : ''}
          </div>
          <div class="log-stats-row">
            <div class="log-stat"><span class="log-stat-icon">📚</span><span>${h}h ${m}m مذاكرة</span></div>
            <div class="log-stat"><span class="log-stat-icon">🕌</span><span>${pr.length}/6 صلوات</span></div>
            <div class="log-stat"><span class="log-stat-icon">📖</span><span>${day.quranPages||0} صفحة</span></div>
          </div>
          <div class="log-prayers-row">
            ${['الفجر','الظهر','العصر','المغرب','العشاء','التراويح'].map(p =>
              `<span class="log-prayer-badge ${pr.includes(p)?'done':''}">${p}</span>`
            ).join('')}
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('logContent').innerHTML = '<div class="log-empty">فيه مشكلة في التحميل 😕</div>';
  }
};

window.closeLogModal = () => { document.getElementById('logModal').style.display = 'none'; };

/* ══════════════════════════════════
   EDIT LOG — كل الأيام
══════════════════════════════════ */
window.openEditLog = async (date) => {
  editingDate = date;
  document.getElementById('editModal').style.display = 'flex';
  document.getElementById('editModalTitle').textContent = `✏️ تعديل — ${formatDate(date)}`;

  let dayData;
  if (date === TODAY()) {
    dayData = todayData;
  } else {
    try {
      const snap = await getDoc(doc(db,'logs',currentUser.uid,'days',date));
      dayData = snap.exists() ? snap.data() : { prayers:[], quranPages:0, studySeconds:0 };
    } catch (e) { dayData = { prayers:[], quranPages:0, studySeconds:0 }; }
  }

  const prayers = dayData.prayers || [];
  ['الفجر','الظهر','العصر','المغرب','العشاء','التراويح'].forEach(p => {
    const el = document.getElementById('edit_'+p);
    if (el) el.checked = prayers.includes(p);
  });
  document.getElementById('editQuran').value = dayData.quranPages || 0;
  document.getElementById('editStudy').value = Math.round((dayData.studySeconds||0) / 36) / 100;
};

window.saveEditLog = async () => {
  const prayers = ['الفجر','الظهر','العصر','المغرب','العشاء','التراويح']
    .filter(p => document.getElementById('edit_'+p)?.checked);
  const pages  = parseInt(document.getElementById('editQuran').value) || 0;
  const hours  = parseFloat(document.getElementById('editStudy').value) || 0;
  const newSec = Math.round(hours * 3600);
  const isToday = editingDate === TODAY();

  try {
    await setDoc(doc(db,'logs',currentUser.uid,'days',editingDate), {
      prayers, quranPages: pages, studySeconds: newSec, date: editingDate,
      uid: currentUser.uid, name: currentUser.displayName, photo: currentUser.photoURL,
      updatedAt: serverTimestamp()
    });
    if (isToday) {
      todayData = { ...todayData, prayers, quranPages: pages, studySeconds: newSec };
      studySeconds = newSec;
      if (isStudying) studyStartTime = Date.now() - (studySeconds * 1000);
      await updateDoc(doc(db,'users',currentUser.uid), {
        todayStudySeconds: newSec, todayPrayers: prayers,
        todayQuranPages: pages, todayDate: TODAY()
      });
      renderTodayUI(); updateTimerDisplay(); updateMyStats();
    }
    document.getElementById('editModal').style.display  = 'none';
    document.getElementById('logModal').style.display   = 'none';
    showToast('✅ تمام يسطا! السجل اتعدّل', 'success');
  } catch (e) { showToast('فيه مشكلة، حاول تاني!', 'error'); }
};

window.closeEditModal = () => { document.getElementById('editModal').style.display = 'none'; };

/* ══════════════════════════════════
   CHAT — رسايل مجمّعة لنفس الشخص
══════════════════════════════════ */
function startChat() {
  if (chatUnsub) return;
  const q = query(collection(db,'chat'), orderBy('createdAt','asc'), limit(120));
  chatUnsub = onSnapshot(q, snap => {
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
    renderChat(msgs);
  }, e => console.warn('chat', e));
}

function renderChat(msgs) {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const atBottom = box.scrollHeight - box.clientHeight <= box.scrollTop + 100;

  if (!msgs.length) {
    box.innerHTML = '<div class="chat-loading">مفيش رسايل لسه، ابدأ الكلام! 😄</div>';
    return;
  }

  // نجمع الرسايل في مجموعات: نفس المرسل + أقل من دقيقتين بينهم
  const groups = [];
  msgs.forEach(msg => {
    const prev  = groups[groups.length - 1];
    const tms   = msg.createdAt?.toDate?.()?.getTime?.() ?? 0;
    const ptms  = prev?.msgs[prev.msgs.length-1]?.createdAt?.toDate?.()?.getTime?.() ?? 0;
    if (prev && prev.uid === msg.uid && (tms - ptms) < 120000) {
      prev.msgs.push(msg);
    } else {
      groups.push({ uid: msg.uid, name: msg.name, photo: msg.photo, msgs: [msg] });
    }
  });

  box.innerHTML = groups.map(g => {
    const isMe = g.uid === currentUser?.uid;
    const last = g.msgs[g.msgs.length - 1];
    const time = last?.createdAt?.toDate?.()
      ? last.createdAt.toDate().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : '';

    return `
      <div class="chat-group ${isMe?'me':''}">
        ${!isMe ? `<img class="chat-group-avatar" src="${g.photo||''}"
          onerror="this.removeAttribute('src')" alt="">` : ''}
        <div class="chat-group-bubbles">
          ${!isMe ? `<div class="chat-group-sender">${(g.name||'؟').split(' ')[0]}</div>` : ''}
          ${g.msgs.map(m => `<div class="chat-bubble">${escapeHtml(m.text)}</div>`).join('')}
          <div class="chat-time">${time}</div>
        </div>
      </div>`;
  }).join('');

  if (atBottom) box.scrollTop = box.scrollHeight;
}

function escapeHtml(t) {
  return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.sendChat = async () => {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text || !currentUser) return;
  input.value = '';
  try {
    await addDoc(collection(db,'chat'), {
      uid: currentUser.uid, name: currentUser.displayName,
      photo: currentUser.photoURL, text, createdAt: serverTimestamp()
    });
    const box = document.getElementById('chatMessages');
    if (box) setTimeout(() => box.scrollTop = box.scrollHeight, 80);
  } catch (e) { showToast('مش قادر يبعت، حاول تاني!', 'error'); }
};

/* ══════════════════════════════════
   HELPERS
══════════════════════════════════ */
function formatDate(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
}

window.showLoading = v => {
  document.getElementById('loginLoading').style.display = v ? 'block' : 'none';
};

window.showToast = (msg, type='') => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = 'toast', 3200);
};

function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display   = 'none';
  showLoading(false);
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display   = 'block';
  showLoading(false);
}

function spawnParticles(el) {
  if (!el) return;
  const rect   = el.getBoundingClientRect();
  const colors = ['#4fc3f7','#69f0ae','#ce93d8','#ffd54f','#f472b6'];
  for (let i = 0; i < 10; i++) {
    const p     = document.createElement('div');
    p.className = 'particle';
    p.style.left       = (rect.left + rect.width/2) + 'px';
    p.style.top        = (rect.top  + rect.height/2) + 'px';
    p.style.background = colors[i % colors.length];
    const angle = (i/10)*360, dist = 40 + Math.random()*40;
    p.style.setProperty('--dx', Math.cos(angle*Math.PI/180)*dist + 'px');
    p.style.setProperty('--dy', Math.sin(angle*Math.PI/180)*dist + 'px');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }
}
