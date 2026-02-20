// app.js
let currentUser = null;
let currentLog = null; // بيانات اليوم الحالي للمستخدم
let timerInterval = null;
let studySeconds = 0;
let timerRunning = false;
let timerState = 'stopped'; // 'running', 'paused', 'stopped'
let friendsList = [];

// تهيئة التطبيق بعد تسجيل الدخول
async function initApp(user) {
    currentUser = user;
    document.getElementById('user-photo').src = user.photoURL || 'default-avatar.png';
    document.getElementById('user-name').textContent = user.displayName || 'مستخدم';

    // تحميل أو إنشاء سجل اليوم للمستخدم
    await loadTodayLog();
    // تحميل قائمة الأصدقاء (يمكن إضافتهم يدوياً لاحقاً، الآن نستخدم جميع المستخدمين كمثال)
    await loadAllUsersAsFriends();
    // بدء استماع لتحديث حالة الأصدقاء
    subscribeToFriendsStatus();

    // تحديث واجهة العداد
    updateTimerDisplay();

    // أحداث الأزرار
    document.getElementById('start-timer').addEventListener('click', startTimer);
    document.getElementById('pause-timer').addEventListener('click', pauseTimer);
    document.getElementById('stop-timer').addEventListener('click', stopTimer);
    document.getElementById('save-log-btn').addEventListener('click', saveLog);
    document.getElementById('edit-log-btn').addEventListener('click', enableEditLog);
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
    document.getElementById('view-log-btn').addEventListener('click', viewLog);
    document.getElementById('my-log-btn').addEventListener('click', () => showMyLog());

    // تبديل تبويبات المتصدرين
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            loadLeaderboard(e.target.dataset.type);
        });
    });

    // تحميل المتصدرين افتراضياً (نوع study)
    loadLeaderboard('study');
}

// الحصول على تاريخ اليوم بصيغة YYYY-MM-DD
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// تحميل أو إنشاء سجل اليوم للمستخدم
async function loadTodayLog() {
    const today = getTodayDate();
    const logRef = db.collection('dailyLogs').doc(`${currentUser.uid}_${today}`);
    const doc = await logRef.get();
    if (doc.exists) {
        currentLog = doc.data();
    } else {
        // إنشاء سجل جديد
        currentLog = {
            userId: currentUser.uid,
            date: today,
            studySeconds: 0,
            prayers: {
                fajr: false,
                dhuhr: false,
                asr: false,
                maghrib: false,
                ishaa: false,
                taraweeh: false
            },
            quranPages: 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await logRef.set(currentLog);
    }

    // تعبئة الواجهة بالبيانات
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

// تحديث عداد الوقت
function updateTimerDisplay() {
    const hours = Math.floor(studySeconds / 3600);
    const minutes = Math.floor((studySeconds % 3600) / 60);
    const seconds = studySeconds % 60;
    document.getElementById('timer-display').textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // تحديث الدائرة (أقصى قيمة 12 ساعة كاملة)
    const maxSeconds = 12 * 3600; // 12 ساعة كمرجع
    const percentage = Math.min(studySeconds / maxSeconds, 1);
    const circumference = 2 * Math.PI * 45; // r=45
    const offset = circumference * (1 - percentage);
    document.querySelector('.circular-progress .progress').style.strokeDashoffset = offset;
}

// بدء التايمر
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

// إيقاف مؤقت (استراحة)
function pauseTimer() {
    if (!timerRunning) return;
    clearInterval(timerInterval);
    timerRunning = false;
    timerState = 'paused';
    updateUserStatus('resting');
}

// إنهاء التايمر وحفظ الوقت في Firestore
async function stopTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    timerState = 'stopped';
    updateUserStatus('offline');
    // حفظ الوقت في السجل
    if (currentLog) {
        currentLog.studySeconds = studySeconds;
        currentLog.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        const logRef = db.collection('dailyLogs').doc(`${currentUser.uid}_${getTodayDate()}`);
        await logRef.update({ studySeconds: studySeconds });
    }
}

// تحديث حالة المستخدم في Firestore
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

// حفظ السجل (الصلوات والقرآن)
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
}

// تمكين تعديل السجل (يمكن إضافة منطق لتحرير الحقول، هي قابلة للتعديل أصلاً)
function enableEditLog() {
    // مجرد تفعيل الحقول، هي بالفعل قابلة للتعديل
    alert('يمكنك تعديل البيانات ثم الضغط على حفظ');
}

// تحميل جميع المستخدمين كأصدقاء (للعرض)
async function loadAllUsersAsFriends() {
    const snapshot = await db.collection('users').get();
    friendsList = snapshot.docs.map(doc => doc.data());
    populateFriendSelect();
}

// ملء قائمة اختيار الأصدقاء
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

// الاشتراك في تحديثات حالة الأصدقاء (实时监听)
function subscribeToFriendsStatus() {
    db.collection('users').onSnapshot(snapshot => {
        const friendsDiv = document.getElementById('friends-list');
        friendsDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const friend = doc.data();
            if (friend.uid !== currentUser.uid) {
                const statusText = {
                    'studying': '🟢 يذاكر الآن',
                    'resting': '🟡 في استراحة',
                    'offline': '⚫ غير متصل'
                }[friend.status] || '⚫ غير متصل';
                const card = document.createElement('div');
                card.className = 'friend-item';
                card.innerHTML = `
                    <img src="${friend.photoURL || 'default-avatar.png'}" class="avatar-small">
                    <span>${friend.displayName || 'مستخدم'}</span>
                    <span class="status-badge">${statusText}</span>
                `;
                friendsDiv.appendChild(card);
            }
        });
    });
}

// تحميل لوحة المتصدرين حسب النوع (study, quran, prayer)
async function loadLeaderboard(type) {
    const today = getTodayDate();
    let logsSnapshot;
    try {
        logsSnapshot = await db.collection('dailyLogs')
            .where('date', '==', today)
            .get();
    } catch (e) {
        console.error(e);
        return;
    }

    const leaderboard = [];
    for (const doc of logsSnapshot.docs) {
        const log = doc.data();
        // الحصول على اسم المستخدم
        const userDoc = await db.collection('users').doc(log.userId).get();
        const user = userDoc.data() || { displayName: 'مستخدم', photoURL: '' };
        let value = 0;
        if (type === 'study') value = log.studySeconds || 0;
        else if (type === 'quran') value = log.quranPages || 0;
        else if (type === 'prayer') {
            // عدد الصلوات المؤداة
            const prayers = log.prayers || {};
            value = Object.values(prayers).filter(v => v === true).length;
        }
        leaderboard.push({
            name: user.displayName || 'مستخدم',
            photo: user.photoURL || '',
            value: value,
            unit: type === 'study' ? 'ساعة' : (type === 'quran' ? 'صفحة' : 'صلاة')
        });
    }

    // ترتيب تنازلي
    leaderboard.sort((a, b) => b.value - a.value);

    // عرض النتائج
    const container = document.getElementById('leaderboard-content');
    container.innerHTML = leaderboard.map((item, index) => {
        let displayValue = item.value;
        if (type === 'study') displayValue = (item.value / 3600).toFixed(2) + ' ساعة';
        return `
            <div class="leaderboard-item">
                <span>#${index+1}</span>
                <img src="${item.photo || 'default-avatar.png'}" class="avatar-small">
                <span>${item.name}</span>
                <span>${displayValue}</span>
            </div>
        `;
    }).join('');
    if (leaderboard.length === 0) container.innerHTML = '<p>لا توجد بيانات لليوم</p>';
}

// عرض سجل معين (للمستخدم أو لصديق في تاريخ محدد)
async function viewLog() {
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
        let html = `<h3>${userName} - ${selectedDate}</h3>`;
        html += `<p>⏱️ وقت المذاكرة: ${Math.floor(data.studySeconds/3600)}:${Math.floor((data.studySeconds%3600)/60)}:${data.studySeconds%60}</p>`;
        html += `<p>📖 صفحات القرآن: ${data.quranPages || 0}</p>`;
        html += `<p>🕌 الصلوات: `;
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
        logDisplay.innerHTML = '<p>لا يوجد سجل لهذا اليوم</p>';
    }
}

// عرض سجل المستخدم الحالي لليوم
async function showMyLog() {
    document.getElementById('friend-select').value = '';
    document.getElementById('log-date').value = getTodayDate();
    await viewLog();
}

// الاستماع لتغيير حالة المصادقة
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

// تسجيل الدخول بجوجل
document.getElementById('google-login').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
});