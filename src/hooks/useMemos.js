import { useState, useCallback } from 'react';
import { db, firebase } from '../utils/firebase';

export const useMemos = (currentUser) => {
    const [memos, setMemos] = useState({});

    const loadMemos = useCallback(async (uid) => {
        if (!db || !uid) return {};
        try {
            const doc = await db.collection('users').doc(uid).get();
            if (doc.exists && doc.data().memos) {
                setMemos(doc.data().memos);
                return doc.data().memos;
            }
        } catch (e) {
            console.error("메모 불러오기 실패:", e);
        }
        return {};
    }, []);

    const saveMemo = useCallback(async (day, memoText, verseSubtitle, checkAchievements, onComplete) => {
        const uid = currentUser ? currentUser.uid : null;
        if (!uid || !memoText.trim()) return;

        const existingMemo = memos[day];
        let texts = [];

        if (existingMemo) {
            if (existingMemo.texts) texts = [...existingMemo.texts];
            else if (existingMemo.text) texts = [existingMemo.text];
        }
        texts.push(memoText);

        const newMemos = {
            ...memos,
            [day]: {
                texts: texts,
                text: texts.join('\n\n---\n\n'),
                date: new Date().toISOString(),
                title: verseSubtitle
            }
        };
        setMemos(newMemos);
        if (typeof onComplete === 'function') onComplete();

        try {
            await db.collection('users').doc(uid).set({
                memos: newMemos,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            if (checkAchievements) checkAchievements(currentUser, newMemos);
        } catch (e) {
            console.error("메모 저장 실패:", e);
        }
    }, [currentUser, memos]);

    return {
        memos,
        setMemos,
        loadMemos,
        saveMemo
    };
};
