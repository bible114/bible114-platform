import { db, firebase } from './firebase';

const consentRef = uid => db.collection('users').doc(uid).collection('private').doc('consent');

export const writeSignupConsent = async (uid, snapshot) => {
    if (!uid || !snapshot) throw new Error('가입 동의 기록을 저장할 수 없습니다.');
    await consentRef(uid).set({
        ...snapshot,
        recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
};
