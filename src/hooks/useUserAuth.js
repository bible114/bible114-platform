import { useState, useEffect } from 'react';
import { auth, db } from '../utils/firebase';
import { userDocToState } from '../utils/helpers';

export const useUserAuth = () => {
    const [currentUser, setCurrentUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        if (!auth) {
            setAuthLoading(false);
            return;
        }

        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            console.log('🔐 Auth state changed:', firebaseUser ? firebaseUser.uid : null);

            if (firebaseUser) {
                try {
                    // Firestore에서 사용자 데이터 불러오기
                    const userDoc = await db.collection('users').doc(firebaseUser.uid).get();

                    if (userDoc.exists) {
                        const user = userDocToState(userDoc);
                        console.log('✅ 사용자 데이터 복원:', user.name);

                        // [안전장치] currentDay > 365 자동 보정 (모든 사용자)
                        var needsUpdate = {};
                        if (user.currentDay && user.currentDay > 365) {
                            var extraDays = user.currentDay - 1;
                            var extraRounds = Math.floor(extraDays / 365);
                            user.currentDay = (extraDays % 365) + 1;
                            user.readCount = (user.readCount || 1) + extraRounds;
                            needsUpdate.currentDay = user.currentDay;
                            needsUpdate.readCount = user.readCount;
                        }
                        // 진정희 권사 데이터 보정 (1회성)
                        if (user.name === '진정희' && (user.readCount || 0) < 4) {
                            user.currentDay = 91;
                            user.readCount = 4;
                            needsUpdate.currentDay = 91;
                            needsUpdate.readCount = 4;
                        }
                        if (Object.keys(needsUpdate).length > 0) {
                            db.collection('users').doc(firebaseUser.uid).update(needsUpdate);
                        }

                        setCurrentUser(user);
                    } else {
                        // Firestore에 데이터가 없으면 로그인 화면으로/초기화
                        console.log('⚠️ Firestore 데이터 없음');
                        setCurrentUser(null);
                    }
                } catch (e) {
                    console.error('사용자 데이터 로딩 실패:', e);
                    setCurrentUser(null);
                }
            } else {
                // 로그인 안 된 상태
                setCurrentUser(null);
            }

            setAuthLoading(false);
        });

        // 컴포넌트 언마운트 시 리스너 해제
        return () => unsubscribe();
    }, []);

    return { currentUser, setCurrentUser, authLoading };
};
