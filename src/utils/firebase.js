import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBF122lgD5fTX70HBtd_nl0ZVKhyyQnyGo",
    authDomain: "bible114-platform.firebaseapp.com",
    projectId: "bible114-platform",
    storageBucket: "bible114-platform.firebasestorage.app",
    messagingSenderId: "57949868479",
    appId: "1:57949868479:web:dd40b816fb3c249c4d110a"
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
