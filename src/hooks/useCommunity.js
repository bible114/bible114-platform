import { useState, useCallback } from 'react';
import { db, firebase } from '../utils/firebase';
import { calculateSubgroupStats } from '../utils/statsUtils';

export const useCommunity = (currentUser, setCurrentUser) => {
    const [subgroupStats, setSubgroupStats] = useState({});
    const [communityMembers, setCommunityMembers] = useState([]);
    const [allMembersForRace, setAllMembersForRace] = useState([]);
    const [announcement, setAnnouncement] = useState(null);
    const [kakaoLink, setKakaoLink] = useState(null);

    const loadAllMembers = useCallback(async () => {
        try {
            const snapshot = await db.collection('users').get();
            const members = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
            return members;
        } catch (e) {
            console.error("멤버 로딩 실패:", e);
            return [];
        }
    }, []);

    const loadAnnouncement = useCallback(async () => {
        try {
            const doc = await db.collection('settings').doc('announcement').get();
            if (doc.exists && doc.data().enabled) {
                setAnnouncement(doc.data());
            } else {
                setAnnouncement(null);
            }
        } catch (e) {
            console.error("공지 로딩 실패:", e);
        }
    }, []);

    const loadKakaoLink = useCallback(async () => {
        try {
            const doc = await db.collection('settings').doc('kakao').get();
            if (doc.exists) {
                setKakaoLink(doc.data().url);
            }
        } catch (e) {
            console.error("카카오 링크 로딩 실패:", e);
        }
    }, []);

    const changeSubgroup = useCallback(async (newSubgroup) => {
        const uid = currentUser ? currentUser.uid : null;
        if (!uid) return;

        try {
            await db.collection('users').doc(uid).set({
                subgroupId: newSubgroup,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            setCurrentUser(prev => ({ ...prev, subgroupId: newSubgroup }));
            alert(`소그룹이 "${newSubgroup}"(으)로 변경되었습니다!`);

            const allMembers = await loadAllMembers();
            setAllMembersForRace(allMembers);
            setSubgroupStats(calculateSubgroupStats(allMembers));

            if (currentUser.communityId) {
                const myCommMembers = allMembers.filter(m => m.communityId === currentUser.communityId);
                setCommunityMembers(myCommMembers);
            }
        } catch (e) {
            console.error("소그룹 변경 실패:", e);
            alert('변경 실패');
        }
    }, [currentUser, setCurrentUser, loadAllMembers]);

    return {
        subgroupStats,
        setSubgroupStats,
        communityMembers,
        setCommunityMembers,
        allMembersForRace,
        setAllMembersForRace,
        announcement,
        setAnnouncement,
        kakaoLink,
        setKakaoLink,
        loadAllMembers,
        loadAnnouncement,
        loadKakaoLink,
        changeSubgroup
    };
};
