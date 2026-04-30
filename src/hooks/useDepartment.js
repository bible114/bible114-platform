import { useState, useCallback } from 'react';
import { db, firebase } from '../utils/firebase';
import { calculateSubgroupStats } from '../utils/statsUtils';

export const useDepartment = (currentUser, setCurrentUser) => {
    const [subgroupStats, setSubgroupStats] = useState({});
    const [departmentMembers, setDepartmentMembers] = useState([]);
    const [allMembersForRace, setAllMembersForRace] = useState([]);
    const [announcement, setAnnouncement] = useState(null);
    const [kakaoLink, setKakaoLink] = useState(null);

    const loadAllMembers = useCallback(async () => {
        if (!currentUser?.churchId) return [];
        try {
            const snapshot = await db.collection('users')
                .where('churchId', '==', currentUser.churchId)
                .get();
            return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
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
            setSubgroupStats(calculateSubgroupStats(allMembers));
            if (currentUser.departmentId) {
                setDepartmentMembers(allMembers.filter(m => m.departmentId === currentUser.departmentId));
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
