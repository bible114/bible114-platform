import { db, firebase } from './firebase';

// 자격증명(평문 비밀번호·전화번호 뒤 4자리)은 users/{uid}/private/auth 하위문서에 보관한다.
// 평문 보관 자체는 의도된 설계다(어르신 지원 — 관리자가 조회해 알려주는 용도, AGENTS.md 참고).
// 본문서의 password는 이관 완료 후 항상 null 마커가 된다. 일반 회원 진행판은
// 서버의 최소 필드 projection만 사용하며 users 원문을 직접 조회하지 않는다.

const credentialsRef = (uid) =>
    db.collection('users').doc(uid).collection('private').doc('auth');

export const writeMemberCredentials = async (uid, { password, phone4 } = {}) => {
    const payload = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (password !== undefined) payload.password = password;
    if (phone4 !== undefined && phone4 !== null && phone4 !== '') payload.phone4 = phone4;
    await credentialsRef(uid).set(payload, { merge: true });
};

// 본인·같은 교회 관리자·플랫폼 관리자만 규칙상 읽을 수 있다. 없으면 null.
export const fetchMemberCredentials = async (uid) => {
    const doc = await credentialsRef(uid).get();
    return doc.exists ? doc.data() : null;
};

// 지연 이관: 본문서에 평문 password/phone4가 남아 있으면 private로 옮기고
// 본문서에는 password: null 마커를 남긴다. 필드가 아예 없는 구형 문서도
// 이관 완료 상태를 명확히 구분하도록 marker를 심는다.
// 로그인·세션 복원·관리자 백필에서 호출한다. 일반 로그인은 하위 호환을 위해
// boolean을 반환하고, 관리자 전수 이관은 returnResult 옵션으로 실패를 별도 집계한다.
export const migrateCredentialsIfNeeded = async (uid, docData, { returnResult = false } = {}) => {
    const finish = status => returnResult ? { status } : status === 'migrated';
    if (!docData) return finish('skipped');
    const hasLegacyPassword = typeof docData.password === 'string' && docData.password.length > 0;
    const hasLegacyPhone4 = typeof docData.phone4 === 'string' && docData.phone4.length > 0;
    const needsMarker = docData.password !== null;
    if (!hasLegacyPassword && !hasLegacyPhone4 && !needsMarker) return finish('skipped');
    try {
        const userRef = db.collection('users').doc(uid);
        const privateRef = credentialsRef(uid);
        const status = await db.runTransaction(async transaction => {
            const latestSnap = await transaction.get(userRef);
            if (!latestSnap.exists) throw new Error('CREDENTIAL_USER_NOT_FOUND');
            const latest = latestSnap.data() || {};
            const latestHasPassword = typeof latest.password === 'string' && latest.password.length > 0;
            const latestHasPhone4 = typeof latest.phone4 === 'string' && latest.phone4.length > 0;
            const latestNeedsMarker = latest.password !== null;
            if (!latestHasPassword && !latestHasPhone4 && !latestNeedsMarker) return 'skipped';

            // 보호 사본과 parent null marker를 한 commit으로 묶어 Auth/private/parent의
            // 중간 상태가 관리자 비밀번호 변경과 충돌하지 않게 한다.
            transaction.set(privateRef, {
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                ...(latestHasPassword ? { password: latest.password } : {}),
                ...(latestHasPhone4 ? { phone4: latest.phone4 } : {}),
            }, { merge: true });
            transaction.update(userRef, {
                password: null,
                ...(latestHasPhone4 ? { phone4: firebase.firestore.FieldValue.delete() } : {}),
            });
            return 'migrated';
        });
        return finish(status);
    } catch (e) {
        console.error('자격증명 이관 실패:', e);
        return returnResult
            ? { status: 'failed', error: e }
            : false;
    }
};
