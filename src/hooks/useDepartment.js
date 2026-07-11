import { useState, useCallback } from 'react';
import { db, firebase } from '../utils/firebase';
import { calculateSubgroupStats } from '../utils/statsUtils';
import { userDocToState } from '../utils/helpers';
import { belongsToDepartment } from '../utils/memberships';
import { UNAFFILIATED_CHURCH_ID } from '../data/constants';
import { mergePrimaryAndRosterMembers, rosterSnapshotToMembers } from '../utils/rosterMembers';

export const useDepartment = (currentUser, setCurrentUser) => {
    const [subgroupStats, setSubgroupStats] = useState({});
    const [departmentMembers, setDepartmentMembers] = useState([]);
    const [allMembersForRace, setAllMembersForRace] = useState([]);
    const [announcement, setAnnouncement] = useState(null);
    const [kakaoLink, setKakaoLink] = useState(null);

    const loadAllMembers = useCallback(async () => {
        // 무소속 가상 교회는 규칙상 교인 간 read를 열지 않는다 (전국 단위 익명 집단) —
        // 쿼리해봐야 거부되므로 호출 자체를 건너뛴다.
        if (!currentUser?.churchId || currentUser.churchId === UNAFFILIATED_CHURCH_ID) return [];
        try {
            // password == null 필터는 firestore.rules의 같은 교회 read 허용 조건과 쌍이다 —
            // 자격증명이 private로 이관 완료된 문서만 목록 조회가 규칙 증명을 통과한다.
            const [usersResult, rosterResult] = await Promise.allSettled([
                db.collection('users')
                    .where('churchId', '==', currentUser.churchId)
                    .where('password', '==', null)
                    .get(),
                db.collection('churches').doc(currentUser.churchId).collection('roster').get(),
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
    }, [currentUser?.churchId]);

    const loadAnnouncement = useCallback(async () => {
        if (!currentUser?.churchId) return;
        try {
            const doc = await db.collection('churches').doc(currentUser.churchId)
                .collection('settings').doc('announcement').get();
            if (doc.exists && doc.data().enabled) {
                setAnnouncement(doc.data());
            } else {
                setAnnouncement(null);
            }
        } catch (e) {
            console.error("공지 로딩 실패:", e);
        }
    }, [currentUser?.churchId]);

    const loadKakaoLink = useCallback(async () => {
        if (!currentUser?.churchId) return;
        try {
            const doc = await db.collection('churches').doc(currentUser.churchId)
                .collection('settings').doc('kakao').get();
            if (doc.exists) setKakaoLink(doc.data().url);
        } catch (e) {
            console.error("카카오 링크 로딩 실패:", e);
        }
    }, [currentUser?.churchId]);

    const changeSubgroup = useCallback(async (newSubgroup) => {
        const uid = currentUser?.uid;
        if (!uid) return;
        // Support both legacy string and new { id, name } object
        const subgroupId = typeof newSubgroup === 'string' ? newSubgroup : newSubgroup.id;
        const subgroupName = typeof newSubgroup === 'string' ? newSubgroup : newSubgroup.name;
        try {
            await db.collection('users').doc(uid).set({
                subgroupId,
                subgroupName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            setCurrentUser(prev => ({ ...prev, subgroupId, subgroupName }));
            alert(`소그룹이 "${subgroupName}"(으)로 변경되었습니다!`);

            const allMembers = await loadAllMembers();
            setAllMembersForRace(allMembers);
            // useBibleLogic의 [Effect 3]에서 communities와 함께 다시 계산되므로 임시로만 업데이트
            setSubgroupStats(calculateSubgroupStats(allMembers));
            if (currentUser.departmentId) {
                setDepartmentMembers(allMembers.filter(m => belongsToDepartment(m, currentUser.departmentId)));
            }
        } catch (e) {
            console.error("소그룹 변경 실패:", e);
            alert('변경 실패');
        }
    }, [currentUser, setCurrentUser, loadAllMembers]);

    return {
        subgroupStats, setSubgroupStats,
        departmentMembers, setDepartmentMembers,
        allMembersForRace, setAllMembersForRace,
        announcement, setAnnouncement,
        kakaoLink, setKakaoLink,
        loadAllMembers, loadAnnouncement, loadKakaoLink,
        changeSubgroup
    };
};
