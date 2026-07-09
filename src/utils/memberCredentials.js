import { db, firebase } from './firebase';

// 자격증명(평문 비밀번호·전화번호 뒤 4자리)은 users/{uid}/private/auth 하위문서에 보관한다.
// 평문 보관 자체는 의도된 설계다(어르신 지원 — 관리자가 조회해 알려주는 용도, AGENTS.md 참고).
// 본문서의 password는 이관 완료 후 항상 null 마커가 된다 — firestore.rules가
// "password == null인 문서만" 같은 교회 교인에게 read를 열기 때문에(랭킹/달리기/MVP),
// 이관 전 문서의 평문이 다른 교인에게 노출되는 시간창이 구조적으로 없다.

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
// 본문서에는 password: null 마커를 남긴다. 필드가 아예 없는 구형 문서도 마커를 심어
// 랭킹 쿼리(.where('password','==',null))에 잡히게 한다.
// 로그인·세션 복원·관리자 백필에서 호출 — 실패해도 기존 흐름을 막지 않는다(다음 기회에 재시도).
export const migrateCredentialsIfNeeded = async (uid, docData) => {
    if (!docData) return false;
    const hasLegacyPassword = typeof docData.password === 'string' && docData.password.length > 0;
    const hasLegacyPhone4 = typeof docData.phone4 === 'string' && docData.phone4.length > 0;
    const needsMarker = docData.password !== null;
    if (!hasLegacyPassword && !hasLegacyPhone4 && !needsMarker) return false;
    try {
        if (hasLegacyPassword || hasLegacyPhone4) {
            await writeMemberCredentials(uid, {
                ...(hasLegacyPassword ? { password: docData.password } : {}),
                ...(hasLegacyPhone4 ? { phone4: docData.phone4 } : {}),
            });
        }
        await db.collection('users').doc(uid).update({
            password: null,
            ...(hasLegacyPhone4 ? { phone4: firebase.firestore.FieldValue.delete() } : {}),
        });
        return true;
    } catch (e) {
        console.error('자격증명 이관 실패:', e);
        return false;
    }
};
