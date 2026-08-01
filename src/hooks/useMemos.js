import { useState, useCallback, useEffect, useRef } from 'react';
import { db, firebase } from '../utils/firebase';
import {
    expandMemoEntries,
    flattenMemoBuckets,
    groupMemosByCalendarBucket,
    MAX_MEMO_DAY_CHARS,
    MAX_MEMO_TEXT_CHARS,
    MEMO_BUCKET_COLLECTION,
    MEMO_STORAGE_VERSION,
    memoBucketId,
    memoDateParts,
    normalizeMemoRecord,
    totalMemoCharacters,
} from '../utils/memoStore';

const GUEST_MEMOS_KEY = 'bible114_guest_memos_v2';

// 메모 키 생성: "readCount_day" (예: "3_0" = 3독 Day 1)
// 이전 포맷(숫자 키 "0"~"364")은 하위 호환으로 읽기만 지원
export const memoKey = (readCount, day) => `${readCount}_${day}`;

// 키 파싱: "3_0" → {round: 3, day: 0} / 구형 "42" → {round: 1, day: 42}
export const parseMemoKey = (key) => {
    const parts = String(key).split('_');
    if (parts.length >= 2) return { round: Number(parts[0]), day: Number(parts[1]) };
    return { round: 1, day: Number(key) };
};

const createMemoEntryKey = (readCount, day) => {
    const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    return `${memoKey(readCount, day)}_${randomPart}`;
};

const loadGuestMemos = () => {
    try {
        return expandMemoEntries(JSON.parse(localStorage.getItem(GUEST_MEMOS_KEY) || '{}'));
    } catch {
        return {};
    }
};

const saveGuestMemos = memos => {
    localStorage.setItem(GUEST_MEMOS_KEY, JSON.stringify(memos));
};

const migrateLegacyMemos = async (uid, legacyMemos) => {
    const grouped = groupMemosByCalendarBucket(legacyMemos);
    const bucketEntries = Object.entries(grouped);
    if (bucketEntries.length === 0) return;
    const collectionRef = db.collection('users').doc(uid).collection(MEMO_BUCKET_COLLECTION);

    // 월별 묶음을 1주 단위 문서로 나눠 문서 크기를 제한한다. 이미 신형 저장이 있는 키는
    // 항상 신형을 우선해 여러 탭·부분 이관 뒤에도 과거 값으로 되돌리지 않는다.
    for (const [bucketId, bucket] of bucketEntries) {
        const bucketRef = collectionRef.doc(bucketId);
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(bucketRef);
            const currentEntries = snapshot.exists && snapshot.data()?.entries
                && typeof snapshot.data().entries === 'object'
                ? snapshot.data().entries
                : {};
            transaction.set(bucketRef, {
                schemaVersion: MEMO_STORAGE_VERSION,
                year: bucket.year,
                month: bucket.month,
                entries: { ...bucket.entries, ...currentEntries },
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        });
    }

    const verification = await collectionRef.get();
    const migrated = flattenMemoBuckets(verification);
    const expectedKeys = Object.values(grouped)
        .flatMap(bucket => Object.keys(bucket.entries));
    if (!expectedKeys.every(key => migrated[key])) {
        throw new Error('묵상 분리 저장 확인에 실패했습니다.');
    }

    // 모든 월별 문서가 실제로 다시 읽힌 뒤에만 구형 대형 필드를 제거한다.
    await db.collection('users').doc(uid).update({
        memos: firebase.firestore.FieldValue.delete(),
        memoStorageVersion: MEMO_STORAGE_VERSION,
        memoMigratedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
};

export const useMemos = (currentUser) => {
    const [memos, setMemos] = useState({});
    const [memoLoadError, setMemoLoadError] = useState(null);
    const [memoMigrating, setMemoMigrating] = useState(false);
    const currentUid = currentUser?.uid || null;
    const currentUidRef = useRef(currentUid);
    const loadRequestRef = useRef(0);
    const migrationPromiseRef = useRef(null);
    currentUidRef.current = currentUid;

    useEffect(() => {
        loadRequestRef.current += 1;
        migrationPromiseRef.current = null;
        setMemos({});
        setMemoLoadError(null);
        setMemoMigrating(false);

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
        if (uid !== currentUidRef.current) return {};

        const requestId = ++loadRequestRef.current;
        const isCurrentRequest = () => (
            requestId === loadRequestRef.current && uid === currentUidRef.current
        );
        setMemoLoadError(null);

        if (currentUser?.role === 'guest') {
            const guestMemos = loadGuestMemos();
            if (isCurrentRequest()) setMemos(guestMemos);
            return guestMemos;
        }

        try {
            if (!db) throw new Error('메모 저장소를 사용할 수 없습니다.');
            const userRef = db.collection('users').doc(uid);
            const bucketRef = userRef.collection(MEMO_BUCKET_COLLECTION);
            const [userDoc, bucketSnapshot] = await Promise.all([
                userRef.get(),
                bucketRef.get(),
            ]);
            const legacyMemos = userDoc.exists && userDoc.data()?.memos
                && typeof userDoc.data().memos === 'object'
                ? userDoc.data().memos
                : {};
            const bucketMemos = flattenMemoBuckets(bucketSnapshot);
            const loadedMemos = { ...expandMemoEntries(legacyMemos), ...bucketMemos };

            if (isCurrentRequest()) {
                setMemos(loadedMemos);
                setMemoLoadError(null);
            }

            if (Object.keys(legacyMemos).length > 0) {
                if (isCurrentRequest()) setMemoMigrating(true);
                const migration = migrateLegacyMemos(uid, legacyMemos)
                    .catch(error => {
                        console.error('기존 묵상 분리 저장 실패:', error);
                        if (isCurrentRequest()) setMemoLoadError(error);
                        throw error;
                    })
                    .finally(() => {
                        if (migrationPromiseRef.current === migration) {
                            migrationPromiseRef.current = null;
                        }
                        if (isCurrentRequest()) setMemoMigrating(false);
                    });
                if (isCurrentRequest()) migrationPromiseRef.current = migration;
                void migration.catch(() => {});
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
    }, [currentUser?.role]);

    const saveMemo = useCallback(async (
        readCount,
        day,
        memoText,
        verseSubtitle,
        checkAchievements,
        onComplete,
    ) => {
        const uid = currentUser?.uid;
        const trimmedText = memoText.trim();
        if (!uid || !trimmedText) return;
        if (trimmedText.length > MAX_MEMO_TEXT_CHARS) {
            throw new Error(`묵상은 한 번에 ${MAX_MEMO_TEXT_CHARS.toLocaleString()}자까지 저장할 수 있습니다.`);
        }

        const entryKey = createMemoEntryKey(readCount, day);
        const nowIso = new Date().toISOString();
        const { year, month, day: calendarDay } = memoDateParts(nowIso);

        if (currentUser.role === 'guest') {
            const dayTexts = Object.values(memos)
                .map(memo => normalizeMemoRecord(memo))
                .filter(memo => memo.round === readCount && memo.day === day)
                .flatMap(memo => memo.texts);
            if (totalMemoCharacters([...dayTexts, trimmedText]) > MAX_MEMO_DAY_CHARS) {
                throw new Error('하루 묵상은 합계 20,000자까지 저장할 수 있습니다.');
            }
            const nextMemos = {
                ...memos,
                [entryKey]: {
                    texts: [trimmedText],
                    date: nowIso,
                    title: verseSubtitle || '',
                    round: readCount,
                    day,
                },
            };
            saveGuestMemos(nextMemos);
            setMemos(nextMemos);
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        if (migrationPromiseRef.current) await migrationPromiseRef.current;
        const bucketRef = db.collection('users').doc(uid)
            .collection(MEMO_BUCKET_COLLECTION)
            .doc(memoBucketId(year, month, calendarDay));
        let savedMemo;
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(bucketRef);
            const entries = snapshot.exists && snapshot.data()?.entries
                && typeof snapshot.data().entries === 'object'
                ? snapshot.data().entries
                : {};
            const dayTexts = Object.values(entries)
                .map(memo => normalizeMemoRecord(memo))
                .filter(memo => memo.round === readCount && memo.day === day)
                .flatMap(memo => memo.texts);
            if (totalMemoCharacters([...dayTexts, trimmedText]) > MAX_MEMO_DAY_CHARS) {
                throw new Error('하루 묵상은 합계 20,000자까지 저장할 수 있습니다.');
            }
            savedMemo = {
                texts: [trimmedText],
                date: nowIso,
                title: verseSubtitle || '',
                round: readCount,
                day,
            };
            transaction.set(bucketRef, {
                schemaVersion: MEMO_STORAGE_VERSION,
                year,
                month,
                shard: Math.ceil(calendarDay / 7),
                entries: { ...entries, [entryKey]: savedMemo },
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        });

        if (currentUidRef.current !== uid) return;
        setMemos(current => ({ ...current, [entryKey]: savedMemo }));

        if (checkAchievements) {
            try {
                await checkAchievements(currentUser, 'memo');
            } catch (achievementError) {
                console.warn('묵상 저장 후 업적 동기화 실패:', achievementError);
            }
        }
        if (currentUidRef.current !== uid) return;
        if (typeof onComplete === 'function') onComplete();
    }, [currentUser, memos]);

    return {
        memos,
        setMemos,
        memoLoadError,
        memoMigrating,
        loadMemos,
        saveMemo,
    };
};
