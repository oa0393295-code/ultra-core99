// استيراد المكتبات الأساسية من سيرفرات جوجل مباشرة
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// إعدادات المفاتيح (Credentials) - دي اللي بتهندل الربط
const firebaseConfig = {
    apiKey: "AIzaSyASLT_wouo9BTjd-dH18x8CLbqBZSMbz04",
    authDomain: "ultra-core.firebaseapp.com",
    projectId: "ultra-core",
    storageBucket: "ultra-core.firebasestorage.app",
    messagingSenderId: "351766462712",
    appId: "1:351766462712:web:e683d8aa0d213b6e59fb0d"
};

// تشغيل محرك الفايربيز
const APP = initializeApp(firebaseConfig);

// تصدير الأدوات عشان نستخدمها في engine.js
export const AUTH = getAuth(APP);
export const DB = getFirestore(APP);
export const PROVIDER = new GoogleAuthProvider();

/* ملاحظة واقعية: الـ API Key ده متاح للكل، 
   فلازم قدام تأمن الـ Rules من جوه الـ Firebase Console 
   عشان مفيش "هكر" يلعب في سجلات صحابك.
*/