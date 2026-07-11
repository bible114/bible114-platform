import { useState, useEffect, useCallback } from 'react';
import { auth, authReady, db } from '../utils/firebase';
import { userDocToState, migrateTalentIfNeeded } from '../utils/helpers';
import { getGuestState } from '../utils/guestStorage';
import { migrateCredentialsIfNeeded } from '../utils/memberCredentials';
import { isInteractiveAuthFlowActive } from '../utils/authFlowGuard';
import { loadUserExtraOrgs } from '../utils/roster';

export const useUserAuth = () => {
    const [currentUser, setCurrentUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [authError, setAuthError] = useState('');
    const [retryKey, setRetryKey] = useState(0);

    const retryAuthCheck = useCallback(() => {
        setAuthError('');
        setAuthLoading(true);
        setRetryKey(key => key + 1);
    }, []);

    useEffect(() => {
        if (!auth) {
            setAuthError('Firebase 인증을 초기화하지 못했습니다.');
            setAuthLoading(false);
            return;
        }

        let unsubscribe = null;
        let cancelled = false;

        authReady.then(() => {
            if (cancelled) return;

            unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
                console.log('🔐 Auth state changed:', firebaseUser ? firebaseUser.uid : null);

                // Google 로그인처럼 권한 판정을 별도 후처리가 독점하는 동안에는
                // Auth 이벤트가 먼저 도착해도 사용자 상태를 자동 적용하지 않는다.
                if (isInteractiveAuthFlowActive()) {
                    setAuthLoading(false);
                    return;
                }

                setAuthError('');

                const discardStaleEvent = () => {
                    if (cancelled) return true;
                    const stale = isInteractiveAuthFlowActive()
                        || auth.currentUser?.uid !== firebaseUser?.uid;
                    if (stale) setAuthLoading(false);
                    return stale;
                };

                if (firebaseUser) {
                    try {
                        if (firebaseUser.isAnonymous) {
                            if (discardStaleEvent()) return;
                            const guest = getGuestState();
                            setCurrentUser({
                                uid: firebaseUser.uid,
                                role: 'guest',
                                name: '게스트',
                                churchId: null,
                                planId: guest.planId,
                                currentDay: guest.currentDay,
                                streak: guest.streak,
                                lastReadDate: guest.lastReadDate,
                                readCount: 1,
                                videoType: guest.videoType || 'adult',
                                extraOrgs: [],
                            });
                            setAuthLoading(false);
                            return;
                        }

                        // Firestore에서 사용자 데이터 불러오기
                        if (discardStaleEvent()) return;
                        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
                        if (discardStaleEvent()) return;

                        if (userDoc.exists) {
                            const user = userDocToState(userDoc);
                            const extraOrgsPromise = loadUserExtraOrgs(firebaseUser.uid);
                            console.log('✅ 사용자 데이터 복원:', user.name);

                            // [랭킹] 자격증명 지연 이관 — 재로그인 없이 세션 복원만 하는
                            // 상시 사용자가 가장 많으므로 이 경로가 핵심 이관 지점이다.
                            const credentialsMigrated = await migrateCredentialsIfNeeded(firebaseUser.uid, userDoc.data());
                            if (discardStaleEvent()) return;
                            if (credentialsMigrated) {
                                user.password = null;
                            }

                            // [점수 이중화] talent 지갑 지연 마이그레이션 (1회성)
                            // 마이그레이션이 끝나기 전에는 talent가 undefined이므로,
                            // score로 대체 표시하지 않고 완료를 기다린다 (구매 화면에서 잔액 0 오표시 방지).
                            const migrated = await migrateTalentIfNeeded(firebaseUser.uid, userDoc.data());
                            if (discardStaleEvent()) return;
                            if (migrated) {
                                user.talent = migrated.talent;
                                user.score = migrated.score;
                                user.talentMigrated = true;
                            }

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

                            user.extraOrgs = await extraOrgsPromise;
                            if (discardStaleEvent()) return;
                            setCurrentUser(user);
                        } else {
                            // Firestore에 데이터가 없으면 로그인 화면으로/초기화
                            console.log('⚠️ Firestore 데이터 없음');
                            if (discardStaleEvent()) return;
                            setCurrentUser(null);
                        }
                    } catch (e) {
                        if (discardStaleEvent()) return;
                        console.error('사용자 데이터 로딩 실패:', e);
                        setAuthError('로그인은 유지되어 있지만 사용자 정보를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요.');
                    }
                } else {
                    // 로그인 안 된 상태
                    setCurrentUser(null);
                }

                setAuthLoading(false);
            });
        }).catch((error) => {
            console.error('Auth persistence setup failed:', error);
            setAuthError('로그인 유지 설정을 확인하지 못했습니다. Safari 개인정보 보호 설정이나 저장 공간을 확인해주세요.');
            setAuthLoading(false);
        });

        // 컴포넌트 언마운트 시 리스너 해제
        return () => {
            cancelled = true;
            if (unsubscribe) unsubscribe();
        };
    }, [retryKey]);

    return { currentUser, setCurrentUser, authLoading, authError, retryAuthCheck };
};
