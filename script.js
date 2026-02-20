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
    DAILY_SECONDS: 'dailySeconds',
    DAILY_POINTS: 'dailyPoints',
    LAST_RESET_DATE: 'lastResetDate',
    SESSION_START: 'sessionStart',     // وقت بدء الجلسة (نستخدمه فقط أثناء الجلسة)
    HISTORY: 'studyHistory'            // سجل الأيام السابقة
};

// تهيئة localStorage: التحقق من بداية يوم جديد وحفظ اليوم السابق
function initLocalStorage() {
    const today = new Date().toDateString();
    const lastReset = localStorage.getItem(STORAGE_KEYS.LAST_RESET_DATE);
    
    // إذا كان اليوم مختلفاً عن آخر يوم مسجل، ننقل إحصائيات الأمس إلى السجل
    if (lastReset && lastReset !== today) {
        const yesterdayStats = {
            date: lastReset,
            seconds: parseInt(localStorage.getItem(STORAGE_KEYS.DAILY_SECONDS) || '0'),
            points: parseInt(localStorage.getItem(STORAGE_KEYS.DAILY_POINTS) || '0')
        };
        // حفظ السجل
        const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
        history.push(yesterdayStats);
        // نحتفظ بآخر 30 يوم فقط
        if (history.length > 30) history.shift();
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    }
    
    // إعادة تعيين إحصائيات اليوم إذا كان يوم جديد
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

// تحديث إحصائيات اليوم (عند إيقاف المذاكرة)
function updateDailyStats(additionalSeconds) {
    const stats = getDailyStats();
    const newSeconds = stats.seconds + additionalSeconds;
    const newPoints = Math.floor(newSeconds / 3600 * 10);
    localStorage.setItem(STORAGE_KEYS.DAILY_SECONDS, newSeconds.toString());
    localStorage.setItem(STORAGE_KEYS.DAILY_POINTS, newPoints.toString());
    return { seconds: newSeconds, points: newPoints };
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
            status: 'resting', // الحالة الافتراضية (لن تظهر للآخرين)
            currentSessionStart: null,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        userRef.onSnapshot((doc) => {
            currentUserData = { id: doc.id, ...doc.data() };
            document.getElementById('currentUser').textContent = currentUserData.name;
            document.getElementById('userAvatar').textContent = currentUserData.avatar;
            const dailyStats = getDailyStats();
            document.getElementById('todayHours').textContent = (dailyStats.seconds / 3600).toFixed(1);
        });

        // الاستماع لقائمة المتصدرين (ترتيب حسب النقاط اليومية)
        if (unsubscribeLeaderboard) unsubscribeLeaderboard();
        unsubscribeLeaderboard = db.collection('users')
            .orderBy('dailyPoints', 'desc')
            .onSnapshot((snapshot) => {
                const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                updateLeaderboard(users);
                updateOnlineCount(users);
            });

        // الاستماع للرسائل
        if (unsubscribeMessages) unsubscribeMessages();
        unsubscribeMessages = db.collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot) => {
                const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                updateChat(msgs);
            });

        // تهيئة localStorage والتأكد من عدم وجود جلسة سابقة (الرفريش يلغي الجلسة)
        initLocalStorage();
        // عند تحميل الصفحة، نمسح أي جلسة مخزنة (العداد لا يستأنف)
        localStorage.removeItem(STORAGE_KEYS.SESSION_START);
        isStudying = false;
        studyStartTime = null;
        if (timerInterval) clearInterval(timerInterval);
        document.getElementById('startStudy').disabled = false;
        document.getElementById('stopStudy').disabled = true;
        document.querySelector('.timer-progress').style.strokeDashoffset = '565.48';
        document.getElementById('timer').textContent = '00:00:00';

        // مراقبة حالة الخلفية
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);

    } else {
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
        // في الخلفية: العداد يستمر
        console.log('العداد مستمر في الخلفية');
    } else {
        // العودة: تحديث العرض
        if (isStudying) updateTimerDisplay();
    }
}

// معالج إغلاق الصفحة أو الرفريش
function handlePageHide(event) {
    if (isStudying) {
        // عند الإغلاق، ننهي الجلسة ولا نحسب النقاط
        stopStudyOnClose();
    }
}

// إنهاء الجلسة عند الإغلاق بدون حفظ
function stopStudyOnClose() {
    if (isStudying) {
        isStudying = false;
        localStorage.removeItem(STORAGE_KEYS.SESSION_START);
        clearInterval(timerInterval);
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
        // إعادة تعيين localStorage (مع حفظ السابق تلقائياً في init)
        initLocalStorage();
    }

    isStudying = true;
    studyStartTime = Date.now();
    localStorage.setItem(STORAGE_KEYS.SESSION_START, studyStartTime.toString());

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
    localStorage.removeItem(STORAGE_KEYS.SESSION_START);
    clearInterval(timerInterval);
    document.getElementById('startStudy').disabled = false;
    document.getElementById('stopStudy').disabled = true;
    document.querySelector('.timer-progress').style.strokeDashoffset = '565.48';
    document.getElementById('timer').textContent = '00:00:00';
    document.getElementById('todayHours').textContent = (dailyStats.seconds / 3600).toFixed(1);
});

// تحديث لوحة المتصدرين (تظهر النقاط اليومية فقط، ولا تظهر حالة "بيذاكر دلوقتي")
function updateLeaderboard(users) {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '';
    users.forEach((user, index) => {
        const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
        
        // إزالة كلمة "بيذاكر دلوقتي" تماماً، نعرض دائماً "بيريح"
        const statusText = 'بيريح';
        const statusClass = 'status-resting';

        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <div class="rank ${rankClass}">${index + 1}</div>
            <div class="player-info">
                <div class="player-name">${user.name}</div>
                <div class="player-status">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            </div>
            <div class="points">${Math.round(user.dailyPoints || 0)}</div>
        `;
        leaderboardDiv.appendChild(item);
    });
}

// تحديث عدد المتصلين (حسب الحالة studying، لكننا لا نظهرها في اللوحة، فقط للعدد)
function updateOnlineCount(users) {
    const online = users.filter(u => u.status === 'studying').length;
    document.getElementById('onlineCount').textContent = online + ' متصل';
}

// تحديث الشات مع تمايز الجهات (رسائلي على اليمين، رسائل الآخرين على اليسار)
function updateChat(messages) {
    const chatDiv = document.getElementById('chatMessages');
    chatDiv.innerHTML = '';
    messages.forEach(msg => {
        const user = msg.user;
        if (!user) return;
        const time = msg.timestamp ? msg.timestamp.toDate() : new Date();
        const timeStr = formatTime(time);
        const isMine = currentUserData && user.uid === currentUserData.uid;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isMine ? 'message-mine' : 'message-other'}`;
        
        // محتوى الرسالة يختلف قليلاً حسب الجهة (الصورة تظهر دائماً)
        let avatarHtml = `<div class="message-avatar">${user.avatar || '?'}</div>`;
        let contentHtml = `
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${user.name || 'مجهول'}</span>
                    <span class="message-time">${timeStr}</span>
                </div>
                <div class="message-text">${msg.text}</div>
            </div>
        `;
        
        if (isMine) {
            // ترتيب مختلف قليلاً (الصورة على اليمين)
            messageDiv.innerHTML = contentHtml + avatarHtml;
        } else {
            messageDiv.innerHTML = avatarHtml + contentHtml;
        }
        
        chatDiv.appendChild(messageDiv);
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
        // يمكن لاحقاً تعديل الاستعلام حسب الفلتر
    });
});

// تنسيق الوقت
function formatTime(date) {
    return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}