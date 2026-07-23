import { useState, useCallback, useRef } from 'react';
import { db } from '../utils/firebase';
import { userDocToState } from '../utils/helpers';
import { UNAFFILIATED_CHURCH_ID } from '../data/constants';
import { mergePrimaryAndRosterMembers, rosterSnapshotToMembers } from '../utils/rosterMembers';

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
            // 새 진행판이 아직 배포되지 않았거나 일시적으로 실패하면 기존 읽기 경로로
            // 복구한다. 서버/웹 배포 순서가 엇갈려도 대시보드를 비우지 않는다.
            console.warn('공동체 진행판 요약 로딩 실패, 기존 명단 조회로 복구:', apiError);
        }
        try {
            // password == null 필터는 firestore.rules의 같은 교회 read 허용 조건과 쌍이다 —
            // 자격증명이 private로 이관 완료된 문서만 목록 조회가 규칙 증명을 통과한다.
            const usersRequest = orgId === UNAFFILIATED_CHURCH_ID
                ? Promise.resolve({ docs: [] })
                : db.collection('users')
                    .where('churchId', '==', orgId)
                    .where('password', '==', null)
                    .get();
            const [usersResult, rosterResult] = await Promise.allSettled([
                usersRequest,
                db.collection('churches').doc(orgId).collection('roster').get(),
            ]);
            const primaryMembers = usersResult.status === 'fulfilled'
                ? usersResult.value.docs.map(doc => userDocToState(doc))
                : [];
            const rosterMembers = rosterResult.status === 'fulfilled'
                ? rosterSnapshotToMembers(rosterResult.value)
                : [];
            if (usersResult.status === 'rejected') console.error('주 소속 멤버 로딩 실패:', usersResult.reason);
            if (rosterResult.status === 'rejected') console.error('외부 명부 로딩 실패:', rosterResult.reason);
            return mergePrimaryAndRosterMembers(primaryMembers, rosterMembers).filter(member => !member.isDeleted);
        } catch (e) {
            console.error("멤버 로딩 실패:", e);
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
