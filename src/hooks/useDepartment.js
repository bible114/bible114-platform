import { useState, useCallback, useRef } from 'react';
import { db } from '../utils/firebase';
import { UNAFFILIATED_CHURCH_ID } from '../data/constants';

export const useDepartment = currentUser => {
    const [subgroupStats, setSubgroupStats] = useState({});
    const [departmentMembers, setDepartmentMembers] = useState([]);
    const [allMembersForRace, setAllMembersForRace] = useState([]);
    const [announcement, setAnnouncement] = useState(null);
    const [kakaoLink, setKakaoLink] = useState(null);
    const announcementRequestRef = useRef(0);
    const kakaoRequestRef = useRef(0);

    const loadAllMembers = useCallback(async (orgIdOverride) => {
        const orgId = orgIdOverride || currentUser?.churchId;
        // 무소속 가상 교회는 규칙상 교인 간 read를 열지 않는다 (전국 단위 익명 집단) —
        // 쿼리해봐야 거부되므로 호출 자체를 건너뛴다.
        if (!orgId) return [];
        if (orgId === UNAFFILIATED_CHURCH_ID && currentUser?.accountType !== 'personal') return [];
        try {
            const { getCommunityProgress } = await import('../utils/capacityApi.js');
            const response = await getCommunityProgress(orgId, {
                expectedUid: currentUser?.uid,
                timeoutMs: 30_000,
            });
            return response.members;
        } catch (apiError) {
            // users 문서에는 생년월일·이메일 등 진행판에 필요 없는 개인정보가 함께
            // 있으므로 일반 회원 화면은 직접 users/roster 조회로 복구하지 않는다.
            // 서버의 최소 필드 projection이 실패하면 개인정보 노출 대신 빈 진행판으로
            // 안전하게 종료한다.
            console.error('공동체 진행판 요약 로딩 실패:', apiError);
            return [];
        }
    }, [currentUser?.uid, currentUser?.churchId, currentUser?.accountType]);

    const loadAnnouncement = useCallback(async () => {
        const requestId = ++announcementRequestRef.current;
        const orgId = currentUser?.churchId;
        setAnnouncement(null);
        if (!orgId) return;
        try {
            const doc = await db.collection('churches').doc(orgId)
                .collection('settings').doc('announcement').get();
            if (announcementRequestRef.current !== requestId) return;
            if (doc.exists && doc.data().enabled) {
                setAnnouncement(doc.data());
            } else {
                setAnnouncement(null);
            }
        } catch (e) {
            if (announcementRequestRef.current !== requestId) return;
            setAnnouncement(null);
            console.error("공지 로딩 실패:", e);
        }
    }, [currentUser?.churchId]);

    const loadKakaoLink = useCallback(async () => {
        const requestId = ++kakaoRequestRef.current;
        const orgId = currentUser?.churchId;
        setKakaoLink(null);
        if (!orgId) return;
        try {
            const doc = await db.collection('churches').doc(orgId)
                .collection('settings').doc('kakao').get();
            if (kakaoRequestRef.current !== requestId) return;
            setKakaoLink(doc.exists ? (doc.data().url || null) : null);
        } catch (e) {
            if (kakaoRequestRef.current !== requestId) return;
            setKakaoLink(null);
            console.error("카카오 링크 로딩 실패:", e);
        }
    }, [currentUser?.churchId]);

    return {
        subgroupStats, setSubgroupStats,
        departmentMembers, setDepartmentMembers,
        allMembersForRace, setAllMembersForRace,
        announcement, setAnnouncement,
        kakaoLink, setKakaoLink,
        loadAllMembers, loadAnnouncement, loadKakaoLink
    };
};
