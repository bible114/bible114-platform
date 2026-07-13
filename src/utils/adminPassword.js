import { auth } from './firebase';
import { ADMIN_SET_PASSWORD_URL } from '../data/constants';

export const setMemberPasswordByAdmin = async (targetUid, newPassword) => {
    if (!ADMIN_SET_PASSWORD_URL) throw new Error('관리자 비밀번호 변경 서버가 설정되지 않았습니다.');
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('관리자 로그인 정보를 확인할 수 없습니다.');
    const response = await fetch(ADMIN_SET_PASSWORD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ targetUid, newPassword }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || '비밀번호 변경에 실패했습니다.');
};
