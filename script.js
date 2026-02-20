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
        // مستخدم مسجل: إخفاء شاشة الدخول وإظهار التطبيق
        loginScreen.style.display = 'none';
        mainApp.style.display = 'block';

        // إنشاء/تحديث المستخدم في Firestore
        const userRef = db.collection('users').doc(user.uid);
        await userRef.set({
            uid: user.uid,
            name: user.displayName || 'مستخدم',
            email: user.email,
            avatar: user.displayName ? user.displayName.charAt(0) : 'U',
            photoURL: user.photoURL || '',
            points: 0,
            studyHours: 0,
            status: 'offline',
            currentSessionStart: null,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // استماع لتغييرات بيانات المستخدم الحالي
        userRef.onSnapshot((doc) => {
            currentUserData = { id: doc.id, ...doc.data() };
            document.getElementById('currentUser').textContent = currentUserData.name;
            document.getElementById('userAvatar').textContent = currentUserData.avatar;
            document.getElementById('todayHours').textContent = currentUserData.studyHours.toFixed(1);
        });

        // استماع لقائمة المتصدرين (كل المستخدمين)
        if (unsubscribeLeaderboard) unsubscribeLeaderboard();
        unsubscribeLeaderboard = db.collection('users')
            .orderBy('points', 'desc')
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

    } else {
        // غير مسجل: إظهار شاشة الدخول وإخفاء التطبيق
        loginScreen.style.display = 'flex';
        mainApp.style.display = 'none';
        if (unsubscribeLeaderboard) unsubscribeLeaderboard();
        if (unsubscribeMessages) unsubscribeMessages();
        if (timerInterval) clearInterval(timerInterval);
    }
});

// تحديث لوحة المتصدرين
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
        } else if (user.status === 'resting') {
            statusText = 'بيريح';
            statusClass = 'status-resting';
        } else {
            statusText = 'غير متصل';
            statusClass = 'status-offline';
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
            <div class="points">${Math.round(user.points)}</div>
        `;
        leaderboardDiv.appendChild(item);
    });
}

// تحديث عدد المتصلين
function updateOnlineCount(users) {
    const online = users.filter(u => u.status === 'studying').length;
    document.getElementById('onlineCount').textContent = online + ' متصل';
}

// تحديث الشات
function updateChat(messages) {
    const chatDiv = document.getElementById('chatMessages');
    chatDiv.innerHTML = '';
    messages.forEach(msg => {
        const user = msg.user; // كائن المستخدم المخزن مع الرسالة
        const time = msg.timestamp ? msg.timestamp.toDate() : new Date();
        const timeStr = formatTime(time);
        const div = document.createElement('div');
        div.className = 'message';
        div.innerHTML = `
            <div class="message-avatar">${user.avatar}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${user.name}</span>
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

// تحديث عداد التايمر
function updateTimerDisplay() {
    if (isStudying && studyStartTime) {
        const diff = Math.floor((Date.now() - studyStartTime) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        document.getElementById('timer').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        // تحديث الدائرة (أقصى 24 ساعة)
        const max = 24 * 3600;
        const progress = Math.min(diff / max, 1);
        const dash = 565.48 * (1 - progress);
        document.querySelector('.timer-progress').style.strokeDashoffset = dash;
    }
}

// بدء المذاكرة
document.getElementById('startStudy').addEventListener('click', async () => {
    if (!currentUserData || isStudying) return;
    isStudying = true;
    studyStartTime = Date.now();
    await db.collection('users').doc(currentUserData.uid).update({
        status: 'studying',
        currentSessionStart: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('startStudy').disabled = true;
    document.getElementById('stopStudy').disabled = false;
    timerInterval = setInterval(updateTimerDisplay, 1000);
});

// إيقاف المذاكرة
document.getElementById('stopStudy').addEventListener('click', async () => {
    if (!currentUserData || !isStudying) return;
    isStudying = false;
    clearInterval(timerInterval);
    const end = Date.now();
    const diffHours = (end - studyStartTime) / 3600000;
    const newPoints = currentUserData.points + diffHours * 10;
    const newHours = currentUserData.studyHours + diffHours;
    await db.collection('users').doc(currentUserData.uid).update({
        status: 'resting',
        currentSessionStart: null,
        points: newPoints,
        studyHours: newHours
    });
    document.getElementById('startStudy').disabled = false;
    document.getElementById('stopStudy').disabled = true;
    document.querySelector('.timer-progress').style.strokeDashoffset = '565.48';
    document.getElementById('timer').textContent = '00:00:00';
});

// فلاتر المتصدرين (تظل كواجهة فقط، الترتيب دائم حسب النقاط)
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        // يمكن تعديل الاستعلام لاحقاً إذا أضفنا نقاطاً يومية
    });
});

// تنسيق الوقت
function formatTime(date) {
    return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}