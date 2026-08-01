import { auth } from './firebase';
import { ADMIN_SET_PASSWORD_URL } from '../data/constants';

export const adminPasswordErrorMessage = error => {
    if (error?.code === 'PARTIAL_UPDATE') {
        return '비밀번호가 일부 저장소에만 반영되었을 수 있습니다. 재시도하지 말고 즉시 플랫폼 관리자에게 복구를 요청해주세요.';
    }
    if (error?.code === 'PASSWORD_UPDATE_ROLLED_BACK') {
        return '변경을 완료하지 못해 기존 비밀번호로 안전하게 되돌렸습니다. 잠시 후 다시 시도해주세요.';
    }
    if (error?.code === 'ROLLBACK_UNAVAILABLE') {
        return '기존 비밀번호 기록을 검증할 수 없어 변경하지 않았습니다. 플랫폼 관리자에게 자격증명 점검을 요청해주세요.';
    }
    if (error?.code === 'PASSWORD_CHANGE_BUSY') {
        return '같은 회원의 비밀번호 변경이 이미 진행 중입니다. 잠시 후 다시 시도해주세요.';
    }
    if (error?.code === 'CREDENTIAL_MIGRATION_REQUIRED') {
        return '이 회원의 자격증명 보호 이관을 먼저 완료한 뒤 다시 시도해주세요.';
    }
    if (error?.code === 'AUTHORIZATION_CHANGED') {
        return '작업 중 관리자 권한 또는 회원 상태가 변경되어 비밀번호를 바꾸지 않았습니다. 목록을 새로 확인해주세요.';
    }
    return error?.message || '비밀번호 변경에 실패했습니다.';
};

export const setMemberPasswordByAdmin = async (targetUid, newPassword) => {
    if (!ADMIN_SET_PASSWORD_URL) throw new Error('관리자 비밀번호 변경 서버가 설정되지 않았습니다.');
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('관리자 로그인 정보를 확인할 수 없습니다.');
    const response = await fetch(ADMIN_SET_PASSWORD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ targetUid, newPassword }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
        const error = new Error(payload.error || '비밀번호 변경에 실패했습니다.');
        error.name = 'AdminPasswordError';
        error.code = typeof payload.code === 'string' ? payload.code : 'ADMIN_PASSWORD_FAILED';
        error.status = response.status;
        throw error;
    }
    return payload;
};
