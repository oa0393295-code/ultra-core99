// app.js - النسخة المطورة

let currentUser = null;
let currentLog = null;
let timerInterval = null;
let studySeconds = 0;
let timerRunning = false;
let timerState = 'stopped';
let friendsList = [];

// تنفيذ بعد تحميل DOM
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(async user => {
        if (user) {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'block';
            await initApp(user);
        } else {
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('main-app').style.display = 'none';
        }
    });

    document.getElementById('google-login').addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => alert('خطأ: ' + error.message));
    });
});

// تهيئة التطبيق
async function initApp(user) {
    currentUser = user;
    document.getElementById('user-photo').src = user.photoURL || 'https://via.placeholder.com/40';
    document.getElementById('user-name').textContent = user.displayName || 'مستخدم';

    await loadTodayLog();
    await loadAllUsersAsFriends();
    subscribeToFriendsStatus();
    updateTimerDisplay();
    bindButtons();
    loadLeaderboard('study');

    // إعداد التاريخ الافتراضي لليوم
    document.getElementById('log-date').value = getTodayDate();

    // مراقبة تغييرات اختيار الصديق أو التاريخ لتحديث السجل تلقائياً
    document.getElementById('friend-select').addEventListener('change', updateLogDisplay);
    document.getElementById('log-date').addEventListener('change', updateLogDisplay);
}

// ربط الأزرار
function bindButtons() {
    document.getElementById('start-timer').addEventListener('click', startTimer);
    document.getElementById('pause-timer').addEventListener('click', pauseTimer);
    document.getElementById('stop-timer').addEventListener('click', stopTimer);
    document.getElementById('save-log-btn').addEventListener('click', saveLog);
    document.getElementById('edit-log-btn').addEventListener('click', () => alert('يمكنك تعديل البيانات ثم حفظ'));
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
    document.getElementById('my-log-btn').addEventListener('click', showMyLog);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            loadLeaderboard(e.target.dataset.type);
        });
    });
}

// دوال المساعدة
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

async function loadTodayLog() {
    const today = getTodayDate();
    const logRef = db.collection('dailyLogs').doc(`${currentUser.uid}_${today}`);
    const doc = await logRef.get();
    if (doc.exists) {
        currentLog = doc.data();
    } else {
        currentLog = {
            userId: currentUser.uid,
            date: today,
            studySeconds: 0,
            prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, ishaa: false, taraweeh: false },
            quranPages: 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await logRef.set(currentLog);
    }
    document.getElementById('prayer-fajr').checked = currentLog.prayers.fajr || false;
    document.getElementById('prayer-dhuhr').checked = currentLog.prayers.dhuhr || false;
    document.getElementById('prayer-asr').checked = currentLog.prayers.asr || false;
    document.getElementById('prayer-maghrib').checked = currentLog.prayers.maghrib || false;
    document.getElementById('prayer-ishaa').checked = currentLog.prayers.ishaa || false;
    document.getElementById('prayer-taraweeh').checked = currentLog.prayers.taraweeh || false;
    document.getElementById('quran-pages').value = currentLog.quranPages || 0;
    studySeconds = currentLog.studySeconds || 0;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const hours = Math.floor(studySeconds / 3600);
    const minutes = Math.floor((studySeconds % 3600) / 60);
    const seconds = studySeconds % 60;
    document.getElementById('timer-display').textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    const maxSeconds = 12 * 3600;
    const percentage = Math.min(studySeconds / maxSeconds, 1);
    const circumference = 2 * Math.PI * 45;
    const offset = circumference * (1 - percentage);
    const progressCircle = document.querySelector('.circular-progress .progress');
    if (progressCircle) progressCircle.style.strokeDashoffset = offset;
}

function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    timerState = 'running';
    updateUserStatus('studying');
    timerInterval = setInterval(() => {
        studySeconds++;
        updateTimerDisplay();
    }, 1000);
}

function pauseTimer() {
    if (!timerRunning) return;
    clearInterval(timerInterval);
    timerRunning = false;
    timerState = 'paused';
    updateUserStatus('resting');
}

async function stopTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    timerState = 'stopped';
    updateUserStatus('offline');
    if (currentLog) {
        currentLog.studySeconds = studySeconds;
        currentLog.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        const logRef = db.collection('dailyLogs').doc(`${currentUser.uid}_${getTodayDate()}`);
        await logRef.update({ studySeconds: studySeconds });
    }
}

async function updateUserStatus(status) {
    if (!currentUser) return;
    await db.collection('users').doc(currentUser.uid).set({
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        email: currentUser.email,
        photoURL: currentUser.photoURL,
        status: status,
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function saveLog() {
    if (!currentLog) return;
    currentLog.prayers = {
        fajr: document.getElementById('prayer-fajr').checked,
        dhuhr: document.getElementById('prayer-dhuhr').checked,
        asr: document.getElementById('prayer-asr').checked,
        maghrib: document.getElementById('prayer-maghrib').checked,
        ishaa: document.getElementById('prayer-ishaa').checked,
        taraweeh: document.getElementById('prayer-taraweeh').checked
    };
    currentLog.quranPages = parseInt(document.getElementById('quran-pages').value) || 0;
    currentLog.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    const logRef = db.collection('dailyLogs').doc(`${currentUser.uid}_${getTodayDate()}`);
    await logRef.set(currentLog, { merge: true });
    alert('تم الحفظ');
    // تحديث قائمة الأصدقاء بعد الحفظ (لوقت المذاكرة)
    subscribeToFriendsStatus();
}

async function loadAllUsersAsFriends() {
    const snapshot = await db.collection('users').get();
    friendsList = snapshot.docs.map(doc => doc.data());
    populateFriendSelect();
}

function populateFriendSelect() {
    const select = document.getElementById('friend-select');
    select.innerHTML = '<option value="">اختر صديقاً</option>';
    friendsList.forEach(friend => {
        if (friend.uid !== currentUser.uid) {
            const option = document.createElement('option');
            option.value = friend.uid;
            option.textContent = friend.displayName || 'مستخدم';
            select.appendChild(option);
        }
    });
}

// تحديث حالة الأصدقاء مع إظهار وقت المذاكرة لليوم
function subscribeToFriendsStatus() {
    db.collection('users').onSnapshot(async snapshot => {
        const friendsDiv = document.getElementById('friends-list');
        friendsDiv.innerHTML = '';

        // نجلب سجلات اليوم لجميع الأصدقاء
        const today = getTodayDate();
        const logsSnapshot = await db.collection('dailyLogs').where('date', '==', today).get();
        const logsMap = {};
        logsSnapshot.forEach(doc => {
            const data = doc.data();
            logsMap[data.userId] = data.studySeconds || 0;
        });

        snapshot.forEach(doc => {
            const friend = doc.data();
            if (friend.uid !== currentUser.uid) {
                const studyTime = logsMap[friend.uid] || 0;
                const hours = Math.floor(studyTime / 3600);
                const minutes = Math.floor((studyTime % 3600) / 60);
                const timeStr = hours > 0 ? `${hours}س ${minutes}د` : `${minutes}د`;

                const statusText = {
                    'studying': '🟢 يذاكر',
                    'resting': '🟡 استراحة',
                    'offline': '⚫ غير متصل'
                }[friend.status] || '⚫ غير متصل';

                const card = document.createElement('div');
                card.className = 'friend-item';
                card.innerHTML = `
                    <img src="${friend.photoURL || 'https://via.placeholder.com/40'}" class="avatar-small">
                    <div class="friend-info">
                        <span class="friend-name">${friend.displayName || 'مستخدم'}</span>
                        <span class="friend-study-time">📚 ${timeStr}</span>
                    </div>
                    <span class="status-badge">${statusText}</span>
                `;
                // عند النقر على الصديق نعرض سجله
                card.addEventListener('click', () => {
                    document.getElementById('friend-select').value = friend.uid;
                    updateLogDisplay();
                });
                friendsDiv.appendChild(card);
            }
        });
    });
}

// دالة عرض السجل (تستدعى تلقائياً عند تغيير الصديق أو التاريخ)
async function updateLogDisplay() {
    const selectedFriendId = document.getElementById('friend-select').value;
    const selectedDate = document.getElementById('log-date').value || getTodayDate();
    let targetUserId = selectedFriendId || currentUser.uid;
    const logRef = db.collection('dailyLogs').doc(`${targetUserId}_${selectedDate}`);
    const doc = await logRef.get();
    const logDisplay = document.getElementById('log-display');
    if (doc.exists) {
        const data = doc.data();
        const userDoc = await db.collection('users').doc(targetUserId).get();
        const userName = userDoc.data()?.displayName || 'مستخدم';
        let html = `<div class="log-header"><i class="fas fa-user-circle"></i> <strong>${userName}</strong> - ${selectedDate}</div>`;
        html += `<p><i class="fas fa-clock"></i> وقت المذاكرة: ${Math.floor(data.studySeconds/3600)}:${Math.floor((data.studySeconds%3600)/60)}:${data.studySeconds%60}</p>`;
        html += `<p><i class="fas fa-book-quran"></i> صفحات القرآن: ${data.quranPages || 0}</p>`;
        html += `<p><i class="fas fa-mosque"></i> الصلوات: `;
        const prayers = data.prayers || {};
        const performed = [];
        if (prayers.fajr) performed.push('الفجر');
        if (prayers.dhuhr) performed.push('الظهر');
        if (prayers.asr) performed.push('العصر');
        if (prayers.maghrib) performed.push('المغرب');
        if (prayers.ishaa) performed.push('العشاء');
        if (prayers.taraweeh) performed.push('التراويح');
        html += performed.join('، ') || 'لم يسجل صلوات';
        html += '</p>';
        logDisplay.innerHTML = html;
    } else {
        logDisplay.innerHTML = '<p class="no-data">لا يوجد سجل لهذا اليوم</p>';
    }
}

async function showMyLog() {
    document.getElementById('friend-select').value = '';
    document.getElementById('log-date').value = getTodayDate();
    await updateLogDisplay();
}

// دوال لوحة المتصدرين (كما هي محسنة قليلاً)
async function loadLeaderboard(type) {
    const today = getTodayDate();
    let logsSnapshot;
    try {
        logsSnapshot = await db.collection('dailyLogs').where('date', '==', today).get();
    } catch (e) {
        console.error(e);
        return;
    }

    const leaderboard = [];
    for (const doc of logsSnapshot.docs) {
        const log = doc.data();
        const userDoc = await db.collection('users').doc(log.userId).get();
        const user = userDoc.data() || { displayName: 'مستخدم', photoURL: '' };
        let value = 0;
        if (type === 'study') value = log.studySeconds || 0;
        else if (type === 'quran') value = log.quranPages || 0;
        else if (type === 'prayer') {
            const prayers = log.prayers || {};
            value = Object.values(prayers).filter(v => v === true).length;
        }
        leaderboard.push({
            name: user.displayName || 'مستخدم',
            photo: user.photoURL || '',
            value: value,
            unit: type
        });
    }

    leaderboard.sort((a, b) => b.value - a.value);

    const container = document.getElementById('leaderboard-content');
    container.innerHTML = leaderboard.map((item, index) => {
        let displayValue = item.value;
        if (item.unit === 'study') displayValue = (item.value / 3600).toFixed(2) + ' ساعة';
        else if (item.unit === 'quran') displayValue = item.value + ' صفحة';
        else displayValue = item.value + ' صلاة';
        return `
            <div class="leaderboard-item">
                <span class="rank">#${index+1}</span>
                <img src="${item.photo || 'https://via.placeholder.com/40'}">
                <span>${item.name}</span>
                <span class="value">${displayValue}</span>
            </div>
        `;
    }).join('');
    if (leaderboard.length === 0) container.innerHTML = '<p class="no-data">لا توجد بيانات لليوم</p>';
}