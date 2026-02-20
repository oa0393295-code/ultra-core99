// app.js - النسخة النهائية

let currentUser = null;
let currentLog = null;
let timerInterval = null;
let studySeconds = 0;
let timerRunning = false;
let friendsList = [];

// ===== تهيئة Firebase والاستماع للحالة =====
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

    // عند إغلاق المتصفح أو تحديث الصفحة، نرسل حالة offline
    window.addEventListener('beforeunload', () => {
        if (currentUser) {
            const blob = new Blob([JSON.stringify({ status: 'offline' })], { type: 'application/json' });
            navigator.sendBeacon(`https://firestore.googleapis.com/v1/projects/${firebase.app().options.projectId}/databases/(default)/documents/users/${currentUser.uid}`, blob);
        }
    });
});

// ===== التهيئة بعد الدخول =====
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

    document.getElementById('log-date').value = getTodayDate();
    document.getElementById('friend-select').value = '';
    document.getElementById('friend-select').addEventListener('change', updateLogDisplay);
    document.getElementById('log-date').addEventListener('change', updateLogDisplay);
    await updateLogDisplay(); // عرض سجل اليوم للمستخدم الحالي
}

// ===== ربط الأزرار =====
function bindButtons() {
    document.getElementById('toggle-timer').addEventListener('click', toggleTimer);
    document.getElementById('save-log-btn').addEventListener('click', saveLog);
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
    document.getElementById('edit-log-btn').addEventListener('click', enableEditMode);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            loadLeaderboard(e.target.dataset.type);
        });
    });
}

// ===== دوال التاريخ =====
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// ===== تحميل سجل اليوم للمستخدم =====
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

// ===== عداد المذاكرة =====
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

function toggleTimer() {
    const btn = document.getElementById('toggle-timer');
    if (timerRunning) {
        // إيقاف التايمر وحفظ
        clearInterval(timerInterval);
        timerRunning = false;
        updateUserStatus('offline');
        saveStudyTime();
        btn.innerHTML = '<i class="fas fa-play"></i>';
        btn.style.background = 'rgba(255,255,255,0.15)';
    } else {
        // بدء التايمر
        timerRunning = true;
        updateUserStatus('studying');
        timerInterval = setInterval(() => {
            studySeconds++;
            updateTimerDisplay();
        }, 1000);
        btn.innerHTML = '<i class="fas fa-stop"></i>';
        btn.style.background = '#ff4444';
    }
}

async function saveStudyTime() {
    if (currentLog) {
        currentLog.studySeconds = studySeconds;
        currentLog.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        const logRef = db.collection('dailyLogs').doc(`${currentUser.uid}_${getTodayDate()}`);
        await logRef.update({ studySeconds: studySeconds });
    }
}

// ===== تحديث حالة المستخدم =====
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

// ===== حفظ بيانات اليوم (صلوات + قرآن) =====
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
    subscribeToFriendsStatus(); // تحديث قائمة الأصدقاء بعد الحفظ
    updateLogDisplay(); // تحديث السجل المعروض إذا كان خاصاً بالمستخدم
}

// ===== تحميل قائمة الأصدقاء =====
async function loadAllUsersAsFriends() {
    const snapshot = await db.collection('users').get();
    friendsList = snapshot.docs.map(doc => doc.data());
    populateFriendSelect();
}

function populateFriendSelect() {
    const select = document.getElementById('friend-select');
    select.innerHTML = '<option value="">سجلي أنا</option>';
    friendsList.forEach(friend => {
        if (friend.uid !== currentUser.uid) {
            const option = document.createElement('option');
            option.value = friend.uid;
            option.textContent = friend.displayName || 'مستخدم';
            select.appendChild(option);
        }
    });
}

// ===== مراقبة حالة الأصدقاء + وقت مذاكرتهم اليوم =====
function subscribeToFriendsStatus() {
    db.collection('users').onSnapshot(async snapshot => {
        const friendsDiv = document.getElementById('friends-list');
        friendsDiv.innerHTML = '';

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

                let statusClass = 'offline';
                let statusText = 'غير متصل';
                if (friend.status === 'studying') {
                    statusClass = 'studying';
                    statusText = 'يذاكر';
                } else if (friend.status === 'resting') {
                    statusClass = 'resting';
                    statusText = 'استراحة';
                }

                const card = document.createElement('div');
                card.className = 'friend-item';
                card.setAttribute('data-uid', friend.uid);
                card.innerHTML = `
                    <img src="${friend.photoURL || 'https://via.placeholder.com/45'}" class="avatar-small">
                    <div class="friend-info">
                        <span class="friend-name">${friend.displayName || 'مستخدم'}</span>
                        <span class="friend-study-time">📚 ${timeStr}</span>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                `;
                card.addEventListener('click', () => {
                    document.getElementById('friend-select').value = friend.uid;
                    updateLogDisplay();
                });
                friendsDiv.appendChild(card);
            }
        });
    });
}

// ===== لوحة المتصدرين مع الحالة =====
async function loadLeaderboard(type) {
    const today = getTodayDate();
    let logsSnapshot;
    try {
        logsSnapshot = await db.collection('dailyLogs').where('date', '==', today).get();
    } catch (e) {
        console.error(e);
        return;
    }

    // نجلب حالة كل مستخدم
    const usersSnapshot = await db.collection('users').get();
    const usersMap = {};
    usersSnapshot.forEach(doc => {
        const user = doc.data();
        usersMap[user.uid] = user;
    });

    const leaderboard = [];
    for (const doc of logsSnapshot.docs) {
        const log = doc.data();
        const user = usersMap[log.userId] || { displayName: 'مستخدم', photoURL: '', status: 'offline' };
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
            unit: type,
            status: user.status || 'offline'
        });
    }

    leaderboard.sort((a, b) => b.value - a.value);

    const container = document.getElementById('leaderboard-content');
    container.innerHTML = leaderboard.map((item, index) => {
        let displayValue = item.value;
        if (item.unit === 'study') displayValue = (item.value / 3600).toFixed(2) + ' ساعة';
        else if (item.unit === 'quran') displayValue = item.value + ' صفحة';
        else displayValue = item.value + ' صلاة';

        let statusIcon = '';
        if (item.status === 'studying') statusIcon = '🟢';
        else if (item.status === 'resting') statusIcon = '🟡';
        else statusIcon = '⚫';

        return `
            <div class="leaderboard-item">
                <span class="rank">#${index+1}</span>
                <img src="${item.photo || 'https://via.placeholder.com/40'}">
                <span>${item.name}</span>
                <span class="leaderboard-status">${statusIcon}</span>
                <span class="value">${displayValue}</span>
            </div>
        `;
    }).join('');
    if (leaderboard.length === 0) container.innerHTML = '<p class="no-data">لا توجد بيانات لليوم</p>';
}

// ===== عرض السجل اليومي (بدون أزرار) =====
async function updateLogDisplay() {
    const selectedFriendId = document.getElementById('friend-select').value;
    const selectedDate = document.getElementById('log-date').value || getTodayDate();
    let targetUserId = selectedFriendId || currentUser.uid;
    const logRef = db.collection('dailyLogs').doc(`${targetUserId}_${selectedDate}`);
    const doc = await logRef.get();
    const logDisplay = document.getElementById('log-display');
    const editBtn = document.getElementById('edit-log-btn');

    // إظهار زر التعديل فقط إذا كان السجل خاص بالمستخدم الحالي والتاريخ هو اليوم (أو أي تاريخ؟ نسمح بالتعديل لأي يوم؟ سنسمح لأي يوم)
    if (!selectedFriendId && targetUserId === currentUser.uid) {
        editBtn.style.display = 'inline-flex';
        editBtn.dataset.date = selectedDate; // نمرر التاريخ لاستخدامه في التعديل
    } else {
        editBtn.style.display = 'none';
    }

    if (doc.exists) {
        const data = doc.data();
        const userDoc = await db.collection('users').doc(targetUserId).get();
        const userName = userDoc.data()?.displayName || 'مستخدم';

        // تنسيق الصلوات
        const prayers = data.prayers || {};
        const prayerList = [
            { name: 'الفجر', key: 'fajr', icon: 'fa-sun' },
            { name: 'الظهر', key: 'dhuhr', icon: 'fa-sun' },
            { name: 'العصر', key: 'asr', icon: 'fa-sun' },
            { name: 'المغرب', key: 'maghrib', icon: 'fa-moon' },
            { name: 'العشاء', key: 'ishaa', icon: 'fa-moon' },
            { name: 'التراويح', key: 'taraweeh', icon: 'fa-star' }
        ];

        let prayersHtml = '<div class="prayer-grid">';
        prayerList.forEach(p => {
            const done = prayers[p.key] || false;
            prayersHtml += `
                <div class="prayer-badge ${done ? 'done' : 'not-done'}">
                    <i class="fas ${p.icon}"></i> ${p.name}
                </div>
            `;
        });
        prayersHtml += '</div>';

        const studyHours = Math.floor(data.studySeconds / 3600);
        const studyMinutes = Math.floor((data.studySeconds % 3600) / 60);

        logDisplay.innerHTML = `
            <div class="log-header">
                <i class="fas fa-user-circle"></i> <strong>${userName}</strong> - ${selectedDate}
            </div>
            <div class="log-stats">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-clock"></i></div>
                    <div class="stat-detail">
                        <div class="stat-label">المذاكرة</div>
                        <div class="stat-value">${studyHours}:${studyMinutes.toString().padStart(2,'0')}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-book-quran"></i></div>
                    <div class="stat-detail">
                        <div class="stat-label">القرآن</div>
                        <div class="stat-value">${data.quranPages || 0} صفحة</div>
                    </div>
                </div>
            </div>
            <div style="margin-top:20px;">
                <div style="font-size:1.1rem; margin-bottom:10px;"><i class="fas fa-mosque"></i> الصلوات</div>
                ${prayersHtml}
            </div>
        `;
    } else {
        logDisplay.innerHTML = '<p class="no-data">لا يوجد سجل لهذا اليوم</p>';
    }
}

// ===== تفعيل وضع التعديل للسجل (نقوم بتعبئة البيانات في بطاقة التسجيل) =====
function enableEditMode() {
    const selectedDate = document.getElementById('edit-log-btn').dataset.date;
    if (!selectedDate) return;
    if (selectedDate !== getTodayDate()) {
        // نحتاج تحميل بيانات ذلك اليوم إلى واجهة التسجيل
        loadLogForDate(selectedDate);
    }
    // التمرير إلى بطاقة التسجيل
    document.querySelector('.log-card').scrollIntoView({ behavior: 'smooth' });
}

async function loadLogForDate(date) {
    const logRef = db.collection('dailyLogs').doc(`${currentUser.uid}_${date}`);
    const doc = await logRef.get();
    if (doc.exists) {
        const logData = doc.data();
        document.getElementById('prayer-fajr').checked = logData.prayers.fajr || false;
        document.getElementById('prayer-dhuhr').checked = logData.prayers.dhuhr || false;
        document.getElementById('prayer-asr').checked = logData.prayers.asr || false;
        document.getElementById('prayer-maghrib').checked = logData.prayers.maghrib || false;
        document.getElementById('prayer-ishaa').checked = logData.prayers.ishaa || false;
        document.getElementById('prayer-taraweeh').checked = logData.prayers.taraweeh || false;
        document.getElementById('quran-pages').value = logData.quranPages || 0;
        // نعدل currentLog مؤقتاً؟ الأفضل حفظ التغييرات في نفس الوثيقة
        // سنقوم بحفظها عند الضغط على حفظ
        currentLog = logData; // تحديث currentLog بهذا السجل (وليس سجل اليوم)
        alert(`الآن يمكنك تعديل بيانات يوم ${date} ثم الضغط على حفظ`);
    } else {
        alert('لا يوجد سجل لهذا اليوم');
    }
}

// تعديل saveLog ليعمل مع currentLog الحالي (قد يكون ليوم مختلف)
// نضيف التحقق: إذا كان currentLog يحمل تاريخاً غير اليوم، نحفظ في ذلك التاريخ
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
    const logRef = db.collection('dailyLogs').doc(`${currentUser.uid}_${currentLog.date}`);
    await logRef.set(currentLog, { merge: true });
    alert(`تم حفظ سجل يوم ${currentLog.date}`);
    // بعد الحفظ، نعيد تحميل سجل اليوم إذا كنا في يوم مختلف
    if (currentLog.date !== getTodayDate()) {
        await loadTodayLog(); // نعيد تحميل سجل اليوم
    }
    updateLogDisplay(); // تحديث العرض
}