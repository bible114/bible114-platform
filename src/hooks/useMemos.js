import { useState, useCallback, useEffect, useRef } from 'react';
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
    const [memoLoadError, setMemoLoadError] = useState(null);
    const currentUid = currentUser?.uid || null;
    const currentUidRef = useRef(currentUid);
    const loadRequestRef = useRef(0);
    currentUidRef.current = currentUid;

    useEffect(() => {
        // 계정 전환/로그아웃 시 이전 사용자의 메모와 진행 중인 조회를 즉시 폐기한다.
        loadRequestRef.current += 1;
        setMemos({});
        setMemoLoadError(null);

        return () => {
            loadRequestRef.current += 1;
        };
    }, [currentUid]);

    const loadMemos = useCallback(async (uid) => {
        if (!uid) {
            loadRequestRef.current += 1;
            if (!currentUidRef.current) {
                setMemos({});
                setMemoLoadError(null);
            }
            return {};
        }

        // 이미 다른 계정으로 전환된 뒤 도착한 호출은 현재 상태에 관여하지 않는다.
        if (uid !== currentUidRef.current) return {};

        const requestId = ++loadRequestRef.current;
        const isCurrentRequest = () => (
            requestId === loadRequestRef.current &&
            uid === currentUidRef.current
        );

        setMemos({});
        setMemoLoadError(null);

        try {
            if (!db) throw new Error('메모 저장소를 사용할 수 없습니다.');

            const doc = await db.collection('users').doc(uid).get();
            const data = doc.exists ? doc.data() : null;
            const loadedMemos = data?.memos || {};

            if (isCurrentRequest()) {
                setMemos(loadedMemos);
                setMemoLoadError(null);
            }

            return loadedMemos;
        } catch (e) {
            console.error("메모 불러오기 실패:", e);
            if (isCurrentRequest()) {
                setMemos({});
                setMemoLoadError(e);
            }
            throw e;
        }
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

        const previousMemos = memos;
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

        try {
            await db.collection('users').doc(uid).set({
                memos: newMemos,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.error("메모 저장 실패:", e);
            if (currentUidRef.current === uid) setMemos(previousMemos);
            throw e;
        }

        if (currentUidRef.current !== uid) return;
        if (checkAchievements) checkAchievements(currentUser, newMemos);
        if (typeof onComplete === 'function') onComplete();
    }, [currentUser, memos]);

    return {
        memos,
        setMemos,
        memoLoadError,
        loadMemos,
        saveMemo
    };
};
