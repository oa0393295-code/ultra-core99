// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const db = firebase.firestore();

// عناصر DOM
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutButton');

let currentUserData = null; // بيانات المستخدم من Firestore
let unsubscribeLeaderboard = null;
let unsubscribeMessages = null;
let isStudying = false;
let studyStartTime = null;
let timerInterval = null;

// مفاتيح localStorage
const STORAGE_KEYS = {
    STUDY_SESSION_START: 'studySessionStart',
    DAILY_SECONDS: 'dailySeconds',
    DAILY_POINTS: 'dailyPoints',
    LAST_RESET_DATE: 'lastResetDate',
    SESSION_ACTIVE: 'sessionActive'
};

// تهيئة localStorage
function initLocalStorage() {
    const today = new Date().toDateString();
    const lastReset = localStorage.getItem(STORAGE_KEYS.LAST_RESET_DATE);
    if (lastReset !== today) {
        localStorage.setItem(STORAGE_KEYS.DAILY_SECONDS, '0');
        localStorage.setItem(STORAGE_KEYS.DAILY_POINTS, '0');
        localStorage.setItem(STORAGE_KEYS.LAST_RESET_DATE, today);
    }
}

// استرجاع إحصائيات اليوم
function getDailyStats() {
    return {
        seconds: parseInt(localStorage.getItem(STORAGE_KEYS.DAILY_SECONDS) || '0'),
        points: parseInt(localStorage.getItem(STORAGE_KEYS.DAILY_POINTS) || '0')
    };
}

// تحديث إحصائيات اليوم
function updateDailyStats(additionalSeconds) {
    const stats = getDailyStats();
    const newSeconds = stats.seconds + additionalSeconds;
    const newPoints = Math.floor(newSeconds / 3600 * 10);
    localStorage.setItem(STORAGE_KEYS.DAILY_SECONDS, newSeconds.toString());
    localStorage.setItem(STORAGE_KEYS.DAILY_POINTS, newPoints.toString());
    return { seconds: newSeconds, points: newPoints };
}

// استرجاع وقت بدء الجلسة المخزنة
function getStoredSessionStart() {
    const stored = localStorage.getItem(STORAGE_KEYS.STUDY_SESSION_START);
    return stored ? parseInt(stored) : null;
}

// تخزين وقت بدء الجلسة
function setStoredSessionStart(timestamp) {
    if (timestamp) {
        localStorage.setItem(STORAGE_KEYS.STUDY_SESSION_START, timestamp.toString());
    } else {
        localStorage.removeItem(STORAGE_KEYS.STUDY_SESSION_START);
    }
}

// تخزين حالة الجلسة نشطة
function setSessionActive(active) {
    localStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, active ? 'true' : 'false');
}

// التحقق من وجود جلسة نشطة مخزنة
function hasActiveSession() {
    return localStorage.getItem(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
}

// تسجيل الدخول
googleLoginBtn.addEventListener('click', () => {
    auth.signInWithPopup(provider).catch(console.error);
});

// تسجيل الخروج
logoutBtn.addEventListener('click', () => {
    auth.signOut();
});

// مراقبة حالة المصادقة
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // مستخدم مسجل
        loginScreen.style.display = 'none';
        mainApp.style.display = 'block';

        const userRef = db.collection('users').doc(user.uid);
        await userRef.set({
            uid: user.uid,
            name: user.displayName || 'مستخدم',
            email: user.email,
            avatar: user.displayName ? user.displayName.charAt(0) : 'U',
            photoURL: user.photoURL || '',
            totalPoints: 0,
            totalStudyHours: 0,
            dailyPoints: 0,
            dailyStudySeconds: 0,
            status: 'resting', // الحالة الافتراضية
            currentSessionStart: null,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // استماع لتغييرات المستخدم الحالي
        userRef.onSnapshot((doc) => {
            currentUserData = { id: doc.id, ...doc.data() };
            document.getElementById('currentUser').textContent = currentUserData.name;
            document.getElementById('userAvatar').textContent = currentUserData.avatar;
            // عرض إجمالي ساعات اليوم من localStorage
            const dailyStats = getDailyStats();
            document.getElementById('todayHours').textContent = (dailyStats.seconds / 3600).toFixed(1);
        });

        // استماع لقائمة المتصدرين (ترتيب حسب النقاط اليومية)
        if (unsubscribeLeaderboard) unsubscribeLeaderboard();
        unsubscribeLeaderboard = db.collection('users')
            .orderBy('dailyPoints', 'desc')
            .onSnapshot((snapshot) => {
                const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                updateLeaderboard(users);
                updateOnlineCount(users);
            });

        // استماع للرسائل
        if (unsubscribeMessages) unsubscribeMessages();
        unsubscribeMessages = db.collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot) => {
                const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                updateChat(msgs);
            });

        // استعادة الجلسة إذا كانت نشطة
        initLocalStorage();
        if (hasActiveSession()) {
            const storedStart = getStoredSessionStart();
            if (storedStart) {
                // استعادة الجلسة
                isStudying = true;
                studyStartTime = storedStart;
                document.getElementById('startStudy').disabled = true;
                document.getElementById('stopStudy').disabled = false;
                startTimer();
                // تحديث حالة المستخدم في Firestore
                await userRef.update({
                    status: 'studying',
                    currentSessionStart: firebase.firestore.Timestamp.fromMillis(storedStart)
                });
            } else {
                // لا يوجد وقت بدء مخزن، ننهي الجلسة
                setSessionActive(false);
            }
        }

        // مراقبة حالة الخلفية (visibility change)
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);

    } else {
        // غير مسجل
        loginScreen.style.display = 'flex';
        mainApp.style.display = 'none';
        if (unsubscribeLeaderboard) unsubscribeLeaderboard();
        if (unsubscribeMessages) unsubscribeMessages();
        if (timerInterval) clearInterval(timerInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('pagehide', handlePageHide);
    }
});

// معالج تغيير الرؤية (التبويب في الخلفية)
function handleVisibilityChange() {
    if (document.hidden) {
        // التبويب في الخلفية: العداد يستمر في العمل
        console.log('التبويب في الخلفية، العداد مستمر');
    } else {
        // العودة للتبويب: تحديث العداد إذا كانت جلسة نشطة
        if (isStudying) {
            updateTimerDisplay();
        }
    }
}

// معالج إغلاق الصفحة أو الرفريش
function handlePageHide(event) {
    if (isStudying) {
        // عند الرفريش أو الإغلاق، نوقف الجلسة ولا نضيف نقاط
        stopStudyOnClose();
    }
}

// إيقاف الجلسة عند الإغلاق (بدون حفظ النقاط)
function stopStudyOnClose() {
    if (isStudying) {
        isStudying = false;
        setSessionActive(false);
        setStoredSessionStart(null);
        clearInterval(timerInterval);
        // تحديث حالة المستخدم في Firestore إلى resting
        if (currentUserData) {
            db.collection('users').doc(currentUserData.uid).update({
                status: 'resting',
                currentSessionStart: null
            });
        }
    }
}

// بدء تشغيل العداد
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

// تحديث عرض العداد (لايف)
function updateTimerDisplay() {
    if (isStudying && studyStartTime) {
        const diff = Math.floor((Date.now() - studyStartTime) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        document.getElementById('timer').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        // تحديث الدائرة
        const max = 24 * 3600;
        const progress = Math.min(diff / max, 1);
        const dash = 565.48 * (1 - progress);
        document.querySelector('.timer-progress').style.strokeDashoffset = dash;
    }
}

// بدء المذاكرة
document.getElementById('startStudy').addEventListener('click', async () => {
    if (!currentUserData || isStudying) return;

    // التحقق من بداية يوم جديد
    const today = new Date().toDateString();
    const lastReset = localStorage.getItem(STORAGE_KEYS.LAST_RESET_DATE);
    if (lastReset !== today) {
        // يوم جديد: إعادة تعيين النقاط اليومية في Firestore
        await db.collection('users').doc(currentUserData.uid).update({
            dailyPoints: 0,
            dailyStudySeconds: 0
        });
        localStorage.setItem(STORAGE_KEYS.LAST_RESET_DATE, today);
        localStorage.setItem(STORAGE_KEYS.DAILY_SECONDS, '0');
        localStorage.setItem(STORAGE_KEYS.DAILY_POINTS, '0');
    }

    isStudying = true;
    studyStartTime = Date.now();
    setStoredSessionStart(studyStartTime);
    setSessionActive(true);

    await db.collection('users').doc(currentUserData.uid).update({
        status: 'studying',
        currentSessionStart: firebase.firestore.Timestamp.fromMillis(studyStartTime)
    });

    document.getElementById('startStudy').disabled = true;
    document.getElementById('stopStudy').disabled = false;
    startTimer();
});

// إيقاف المذاكرة
document.getElementById('stopStudy').addEventListener('click', async () => {
    if (!currentUserData || !isStudying) return;

    const endTime = Date.now();
    const sessionSeconds = Math.floor((endTime - studyStartTime) / 1000);

    // تحديث الإحصائيات اليومية في localStorage
    const dailyStats = updateDailyStats(sessionSeconds);

    // تحديث Firestore: إضافة للنقاط اليومية والإجمالية
    const userRef = db.collection('users').doc(currentUserData.uid);
    await userRef.update({
        status: 'resting',
        currentSessionStart: null,
        totalStudyHours: firebase.firestore.FieldValue.increment(sessionSeconds / 3600),
        totalPoints: firebase.firestore.FieldValue.increment(sessionSeconds / 3600 * 10),
        dailyStudySeconds: firebase.firestore.FieldValue.increment(sessionSeconds),
        dailyPoints: firebase.firestore.FieldValue.increment(sessionSeconds / 3600 * 10)
    });

    // إنهاء الجلسة
    isStudying = false;
    setSessionActive(false);
    setStoredSessionStart(null);
    clearInterval(timerInterval);
    document.getElementById('startStudy').disabled = false;
    document.getElementById('stopStudy').disabled = true;
    document.querySelector('.timer-progress').style.strokeDashoffset = '565.48';
    document.getElementById('timer').textContent = '00:00:00';
    document.getElementById('todayHours').textContent = (dailyStats.seconds / 3600).toFixed(1);
});

// تحديث لوحة المتصدرين (تظهر النقاط اليومية فقط)
function updateLeaderboard(users) {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '';
    users.forEach((user, index) => {
        const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
        let statusText = '', statusClass = '', sessionInfo = '';

        if (user.status === 'studying') {
            statusText = 'بيذاكر دلوقتي';
            statusClass = 'status-studying';
            if (user.currentSessionStart) {
                const start = user.currentSessionStart.toDate ? user.currentSessionStart.toDate() : new Date(user.currentSessionStart);
                const diff = Math.floor((new Date() - start) / 60000);
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                sessionInfo = h > 0 ? `منذ ${h} س و ${m} د` : `منذ ${m} د`;
            }
        } else {
            statusText = 'بيريح';
            statusClass = 'status-resting';
        }

        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <div class="rank ${rankClass}">${index + 1}</div>
            <div class="player-info">
                <div class="player-name">${user.name}</div>
                <div class="player-status">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    ${sessionInfo ? `<span class="session-time">(${sessionInfo})</span>` : ''}
                </div>
            </div>
            <div class="points">${Math.round(user.dailyPoints || 0)}</div>
        `;
        leaderboardDiv.appendChild(item);
    });
}

// تحديث عدد المتصلين (حسب الحالة studying)
function updateOnlineCount(users) {
    const online = users.filter(u => u.status === 'studying').length;
    document.getElementById('onlineCount').textContent = online + ' متصل';
}

// تحديث الشات
function updateChat(messages) {
    const chatDiv = document.getElementById('chatMessages');
    chatDiv.innerHTML = '';
    messages.forEach(msg => {
        const user = msg.user;
        if (!user) return;
        const time = msg.timestamp ? msg.timestamp.toDate() : new Date();
        const timeStr = formatTime(time);
        const div = document.createElement('div');
        div.className = 'message';
        div.innerHTML = `
            <div class="message-avatar">${user.avatar || '?'}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${user.name || 'مجهول'}</span>
                    <span class="message-time">${timeStr}</span>
                </div>
                <div class="message-text">${msg.text}</div>
            </div>
        `;
        chatDiv.appendChild(div);
    });
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

// إرسال رسالة
document.getElementById('sendMessage').addEventListener('click', async () => {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !currentUserData) return;
    await db.collection('messages').add({
        text,
        user: {
            uid: currentUserData.uid,
            name: currentUserData.name,
            avatar: currentUserData.avatar
        },
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = '';
});

document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('sendMessage').click();
});

// فلاتر المتصدرين (واجهة فقط، الترتيب ثابت حسب النقاط اليومية)
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        // هنا يمكن إضافة منطق تغيير الترتيب حسب الفلتر (مثلاً أسبوعي/شهري)
        // لكن المطلوب عرض اليوم فقط، لذلك نتركها كما هي.
    });
});

// تنسيق الوقت
function formatTime(date) {
    return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}