import { useState, useEffect, useCallback } from 'react';
import { auth, authReady, db } from '../utils/firebase';
import { userDocToState, migrateTalentIfNeeded, migratePersonalTalentWalletIfNeeded } from '../utils/helpers';
import { getGuestState } from '../utils/guestStorage';
import { migrateCredentialsIfNeeded } from '../utils/memberCredentials';
import { isInteractiveAuthFlowActive } from '../utils/authFlowGuard';
import { loadUserExtraOrgs } from '../utils/roster';
import { normalizeLegacyReadingPosition } from '../utils/platformApi';
import { restorePendingPersonalMigrationFromAuth } from '../utils/personalAccountMigration';

const isRecoverableReadingPositionAuditError = error => {
    const status = Number(error?.status);
    return error?.code === 'CONFLICT'
        || (error?.retryable === true && (status === 0 || status >= 500));
};

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
                                quizLevel: guest.quizLevel || null,
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
                            const userData = userDoc.data() || {};
                            // 삭제 처리된 계정은 역할과 관계없이 Firebase Auth 세션이 남아 있어도
                            // 화면으로 복원하지 않는다. 마이그레이션 등 후속 쓰기도
                            // 시작하기 전에 로컬 상태를 비우고 인증 세션을 종료한다.
                            if (userData.isDeleted === true) {
                                setCurrentUser(null);
                                await auth.signOut().catch(signOutError => {
                                    console.error('삭제된 공동체 관리자 세션 종료 실패:', signOutError);
                                });
                                setAuthLoading(false);
                                return;
                            }
                            restorePendingPersonalMigrationFromAuth({ firebaseUser, userData });
                            const user = userDocToState(userDoc);
                            // [랭킹] 자격증명 지연 이관 — 재로그인 없이 세션 복원만 하는
                            // 상시 사용자가 가장 많으므로 이 경로가 핵심 이관 지점이다.
                            const credentialsMigrated = await migrateCredentialsIfNeeded(firebaseUser.uid, userData);
                            if (discardStaleEvent()) return;
                            if (credentialsMigrated) {
                                user.password = null;
                            }

                            // [점수 이중화] talent 지갑 지연 마이그레이션 (1회성)
                            // 마이그레이션이 끝나기 전에는 talent가 undefined이므로,
                            // score로 대체 표시하지 않고 완료를 기다린다 (구매 화면에서 잔액 0 오표시 방지).
                            const migrated = await migrateTalentIfNeeded(firebaseUser.uid, userData);
                            if (discardStaleEvent()) return;
                            if (migrated) {
                                user.talent = migrated.talent;
                                user.score = migrated.score;
                                user.talentMigrated = true;
                            }

                            // T97 이전 primary roster의 누락 talent/extraMemberships를
                            // 먼저 서버에서 materialize한다. 아래 진도 감사는 이 필드를
                            // 사용하지 않지만, 모든 후속 화면에는 보정 뒤 source-server
                            // 명부만 적용해 로그인 시작 전의 stale query를 재사용하지 않는다.
                            const walletMigration = await migratePersonalTalentWalletIfNeeded(
                                firebaseUser.uid,
                                user.primaryOrgId,
                                user
                            );
                            if (discardStaleEvent()) return;
                            if (walletMigration) {
                                user.primaryOrgId = walletMigration.orgId;
                                user.talent = 0;
                                user.talentWalletMigrated = true;
                            }

                            // [안전장치] 매 로그인마다 users와 canonical roster의 진도 미러를
                            // 서버에서 감사한다. 로컬 users 자체가 365를 넘은 경우에는 실패를
                            // 숨기지 않으며, 정상 users의 roster 감사 중 경합·네트워크 실패만
                            // 로그인과 분리한다.
                            const localUserNeedsNormalization = Boolean(
                                user.currentDay && user.currentDay > 365
                            );
                            let positionAudit = null;
                            try {
                                positionAudit = await normalizeLegacyReadingPosition({
                                    expectedUid: firebaseUser.uid,
                                });
                                if (discardStaleEvent()) return;
                            } catch (positionAuditError) {
                                if (discardStaleEvent()) return;
                                if (localUserNeedsNormalization
                                    || !isRecoverableReadingPositionAuditError(positionAuditError)) {
                                    throw positionAuditError;
                                }
                                console.error('canonical roster 진도 감사 실패:', positionAuditError);
                            }

                            // users가 실제로 보정되었거나 roster repair 원장이 생긴 경우에는
                            // stale 응답을 로컬에 적용하지 않고 source-server users만 확인한다.
                            // 로컬 users가 365 초과였다면 concurrent no-op 응답이어도 재조회한다.
                            if (positionAudit
                                && (localUserNeedsNormalization || positionAudit.committed)) {
                                const normalizedUserDoc = await db.collection('users')
                                    .doc(firebaseUser.uid)
                                    .get({ source: 'server' });
                                if (discardStaleEvent()) return;
                                const normalizedData = normalizedUserDoc.exists
                                    ? normalizedUserDoc.data() || {}
                                    : null;
                                if (!normalizedData
                                    || normalizedData.isDeleted === true
                                    || !Number.isSafeInteger(normalizedData.currentDay)
                                    || normalizedData.currentDay < 1
                                    || normalizedData.currentDay > 365
                                    || !Number.isSafeInteger(normalizedData.readCount)
                                    || normalizedData.readCount < 1) {
                                    throw new Error('invalid normalized reading position');
                                }
                                user.currentDay = normalizedData.currentDay;
                                user.readCount = normalizedData.readCount;
                            }

                            user.extraOrgs = await loadUserExtraOrgs(firebaseUser.uid, {
                                source: 'server',
                            });
                            if (discardStaleEvent()) return;
                            setCurrentUser(user);
                        } else {
                            // Firestore에 데이터가 없으면 로그인 화면으로/초기화
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
