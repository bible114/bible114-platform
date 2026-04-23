import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyAOMubppe1JZbBh0VBv7UIbZyY2S1RI9fw",
    authDomain: "bible-sungseo.firebaseapp.com",
    projectId: "bible-sungseo",
    storageBucket: "bible-sungseo.firebasestorage.app",
    messagingSenderId: "1061949588108",
    appId: "1:1061949588108:web:e8e3bbd6c3f73afa5131a9"
};

// Initialize Firebase
let db, auth;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    } else {
        firebase.app(); // if already initialized, use that one
    }
    auth = firebase.auth();
    db = firebase.firestore();
} catch (e) {
    console.error("Firebase init failed:", e);
}

export { firebase, auth, db };
