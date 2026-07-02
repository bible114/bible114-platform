import { useState, useCallback } from 'react';
import { db, firebase } from '../utils/firebase';

// 메모 키 생성: "readCount_day" (예: "3_0" = 3독 Day 1)
// 이전 포맷(숫자 키 "0"~"364")은 하위 호환으로 읽기만 지원
export const memoKey = (readCount, day) => `${readCount}_${day}`;

// 키 파싱: "3_0" → {round: 3, day: 0} / 구형 "42" → {round: 1, day: 42}
export const parseMemoKey = (key) => {
    const parts = String(key).split('_');
    if (parts.length === 2) return { round: Number(parts[0]), day: Number(parts[1]) };
    return { round: 1, day: Number(key) };
};

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

    const saveMemo = useCallback(async (readCount, day, memoText, verseSubtitle, checkAchievements, onComplete) => {
        const uid = currentUser ? currentUser.uid : null;
        if (!uid || !memoText.trim()) return;

        const key = memoKey(readCount, day);
        const existingMemo = memos[key];
        let texts = [];

        if (existingMemo) {
            if (existingMemo.texts) texts = [...existingMemo.texts];
            else if (existingMemo.text) texts = [existingMemo.text];
        }
        texts.push(memoText);

        const newMemos = {
            ...memos,
            [key]: {
                texts,
                text: texts.join('\n\n---\n\n'),
                date: new Date().toISOString(),
                title: verseSubtitle || '',
                round: readCount,
                day,
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
