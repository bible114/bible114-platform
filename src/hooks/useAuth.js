import { useEffect, useRef, useState } from 'react';
import { auth, authReady, db, firebase } from '../utils/firebase';
import { makePseudoEmail, makeUnaffiliatedIdentity, userDocToState, migrateTalentIfNeeded, migratePersonalTalentWalletIfNeeded } from '../utils/helpers';
import {
    getChurchDirectory,
    invalidateChurchDirectoryCache,
    saveLastChurch,
} from '../utils/churchDirectory';
import { UNAFFILIATED_CHURCH_ID, UNAFFILIATED_CHURCH_NAME } from '../data/constants';
import { isPlanIdAllowedForUser } from '../data/bible_options';
import {
    KAKAO_RETURNING_KEY,
    KAKAO_LINK_RETURNING_KEY,
    KAKAO_ADMIN_SIGNUP_RETURNING_KEY,
    KAKAO_ADMIN_SIGNUP_DRAFT_KEY,
    KAKAO_STATE_KEY,
    buildKakaoAuthorizeUrl,
    clearKakaoCallbackUrl,
    createKakaoState,
    exchangeKakaoCode,
    getKakaoRedirectUri,
    isValidKakaoState,
    readKakaoCallback,
} from '../utils/kakaoAuth';
import { getGuestState, saveGuestState } from '../utils/guestStorage';
import { writeMemberCredentials, migrateCredentialsIfNeeded } from '../utils/memberCredentials';
import { beginInteractiveAuthFlow, endInteractiveAuthFlow } from '../utils/authFlowGuard';
import { loadUserExtraOrgs } from '../utils/roster';
import { updateRosterTalents } from '../utils/talentWallet';
import {
    getPendingPersonalMigration,
    restorePendingPersonalMigrationFromAuth,
} from '../utils/personalAccountMigration';
import { buildSignupConsentSnapshot, buildSignupConsentSummary } from '../utils/signupConsent';
import { writeSignupConsent } from '../utils/signupConsentStore';
import {
    completeMemberSignup as completeMemberSignupViaApi,
    completeChurchAdminSignup as completeChurchAdminSignupViaApi,
    completePersonalSignup as completePersonalSignupViaApi,
    createRequestId,
    issueJoinTicket,
    PlatformApiError,
} from '../utils/platformApi';

const GOOGLE_ADMIN_ROLES = new Set(['churchAdmin', 'platformAdmin', 'superAdmin']);
const GOOGLE_ADMIN_NOT_FOUND_MESSAGE = "이 구글 계정으로 등록된 관리자가 없습니다. 기존 관리자는 첫 화면에서 구글로 시작한 뒤 '기존 진도·달란트 이어보기'를 선택해주세요.";
const GOOGLE_ADMIN_SIGNUP_FLOW_NAME = 'googleAdminSignup';
const GOOGLE_ADMIN_ALREADY_REGISTERED_MESSAGE = '이미 등록된 계정입니다. 첫 화면에서 구글로 시작해주세요.';
const KAKAO_GOOGLE_AUTH_MESSAGE = "카카오톡 브라우저에서는 구글 로그인이 제한됩니다. 우측 하단 ⋯ 메뉴에서 '다른 브라우저로 열기'를 눌러주세요.";
const KAKAO_SIGNUP_DRAFT_KEY = 'b114_kakao_signup_consent_v1';

const needsInitialOnboarding = user => (
    user?.role === 'churchAdmin'
        ? user.onboardingPending === true
        : (!user?.departmentId || typeof user?.subgroupId !== 'string')
);

const beginLoginTiming = label => import.meta.env.DEV && typeof performance !== 'undefined'
    ? { label, startedAt: performance.now() }
    : null;

// 카카오 로그인 실패를 지원 문의로 진단할 수 있게 상태·코드만 짧게 요약한다.
// (개인정보·토큰은 포함하지 않는다. TOKEN_ = 로그인 후처리, CODE_ = 코드 교환 단계)
const describeKakaoAuthError = (error) => {
    const status = Number.isFinite(Number(error?.status)) && error?.status !== undefined
        ? `s${Number(error.status)}`
        : '';
    const code = String(error?.code || error?.message || 'UNKNOWN')
        .replace(/\s+/g, ' ')
        .slice(0, 60);
    return [status, code].filter(Boolean).join(':') || 'UNKNOWN';
};

const finishLoginTiming = (timing, targetView) => {
    if (!timing || typeof performance === 'undefined') return;
    console.info(`[로그인 속도] ${timing.label}: ${Math.round(performance.now() - timing.startedAt)}ms → ${targetView}`);
};

export const useAuth = ({
    setCurrentUser,
    setTempUser,
    setView,
    setHasReadToday,
    setChurchCommunities,
    loadChurchCommunities,
    loadSuperAdminData,
    onAdminProviderNotice,
    onKakaoAdminSignupReady,
}) => {
    const [errorMsg, setErrorMsg] = useState('');
    const [socialLinkNotice, setSocialLinkNotice] = useState(null);

    const migratePersonalWallet = async user => {
        if (user?.accountType !== 'personal' || !user?.uid) return user;
        const result = await migratePersonalTalentWalletIfNeeded(user.uid, user.primaryOrgId, user);
        if (!result) return user;
        return updateRosterTalents({
            ...user,
            talent: 0,
            talentWalletMigrated: true,
        }, { [result.orgId]: result.talent });
    };
    const googleAdminSignupFlowRef = useRef(null);
    const googleAdminSignupAttemptRef = useRef(0);
    const googleAdminSignupStartingRef = useRef(false);
    const googleAdminSignupSubmittingRef = useRef(null);
    const googleAdminSignupPendingRef = useRef(null);
    const personalSignupRef = useRef(null);
    const kakaoStartRef = useRef(null);
    const kakaoAdminSignupStartRef = useRef(null);
    const socialProviderRef = useRef(null);
    const passwordPersonalSignupRef = useRef(false);
    const legacySocialRecoveryRef = useRef(false);
    const pendingGoogleRecoveryCredentialRef = useRef(null);

    const beginGoogleAdminSignupFlow = () => {
        if (!googleAdminSignupFlowRef.current) {
            googleAdminSignupFlowRef.current = beginInteractiveAuthFlow(GOOGLE_ADMIN_SIGNUP_FLOW_NAME);
        }
    };

    const endGoogleAdminSignupFlow = () => {
        const flowName = googleAdminSignupFlowRef.current;
        if (!flowName) return;
        googleAdminSignupFlowRef.current = null;
        googleAdminSignupPendingRef.current = null;
        endInteractiveAuthFlow(flowName);
    };

    const isKakaoTalkBrowser = () => (
        typeof navigator !== 'undefined' && navigator.userAgent.includes('KAKAOTALK')
    );

    const applyGooglePopupError = (err) => {
        if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
        if (err?.code === 'auth/operation-not-allowed') {
            setErrorMsg('구글 로그인이 아직 활성화되지 않았습니다. 관리자에게 문의하세요.');
            return;
        }
        if (err?.code === 'auth/popup-blocked') {
            setErrorMsg('팝업이 차단되었습니다. 브라우저 설정을 확인해주세요.');
            return;
        }
        if (err?.code === 'auth/account-exists-with-different-credential') {
            setErrorMsg("이미 기존 정보로 등록된 계정입니다. 첫 화면에서 구글로 시작한 뒤 '기존 진도·달란트 이어보기'를 선택해주세요.");
            return;
        }
        if (err?.code === 'auth/unauthorized-domain') {
            setErrorMsg('현재 접속한 주소에서는 구글 로그인을 사용할 수 없습니다. 관리자에게 승인된 도메인 설정을 문의하세요.');
            return;
        }
        console.error('구글 인증 실패:', err);
        setErrorMsg('구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
    };

    const matchesAdminSocialSignupProfile = (socialUser, socialProfile) => {
        const profileUid = String(socialProfile?.uid || '').trim();
        const provider = String(socialProfile?.provider || 'google.com').trim();
        if (!socialUser || !profileUid || socialUser.uid !== profileUid) return false;
        if (provider === 'kakao.com') {
            return /^kakao:[1-9][0-9]*$/.test(profileUid);
        }
        const profileEmail = String(socialProfile?.email || '').trim().toLowerCase();
        const authEmail = String(socialUser?.email || '').trim().toLowerCase();
        const hasGoogleProvider = (socialUser?.providerData || [])
            .some(providerData => providerData?.providerId === firebase.auth.GoogleAuthProvider.PROVIDER_ID);
        return Boolean(
            provider === 'google.com'
            && profileEmail
            && authEmail === profileEmail
            && hasGoogleProvider
        );
    };

    const shouldMigrateGuestState = () => {
        const guest = getGuestState();
        return !guest.migratedAt && guest.readDates.length > 0;
    };

    const buildNewMember = ({ name, birthdate, email, churchId, churchName, signupConsent }) => {
        const guest = getGuestState();
        const migrateGuest = shouldMigrateGuestState();
        return {
            // 평문 password/phone4는 본문서가 아닌 users/{uid}/private/auth 에 저장한다
            // (finishMemberSignup). null 마커는 같은 교회 랭킹 read 허용 조건이다.
            name, birthdate, password: null, email,
            role: 'member', churchId, churchName,
            extraMemberships: [],
            startDate: new Date().toDateString(),
            currentDay: migrateGuest ? guest.currentDay : 1,
            streak: migrateGuest ? guest.streak : 0,
            score: 0,
            talent: 0,
            talentMigrated: true,
            readCount: 1,
            lastReadDate: migrateGuest ? guest.lastReadDate : null,
            dailyAdvanceDate: null,
            dailyAdvanceCount: 0,
            gender: 'male',
            planId: isPlanIdAllowedForUser(guest.planId, null) ? guest.planId : '1year_revised',
            departmentId: null, departmentName: null, subgroupId: null,
            isDeleted: false, deletedAt: null, deletedBy: null,
            consentSummary: buildSignupConsentSummary(signupConsent),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
    };

    const finishMemberSignup = async ({ user, newUser, churchId, churchCode, joinTicket = '', credentials, signupConsent }) => {
        setErrorMsg('');
        const migrateGuest = shouldMigrateGuestState();
        await writeSignupConsent(user.uid, signupConsent);
        if (credentials) {
            try {
                await writeMemberCredentials(user.uid, credentials);
            } catch (credentialError) {
                if (churchId !== UNAFFILIATED_CHURCH_ID) throw credentialError;
                // 규칙 미배포 등으로 private 쓰기가 거부되면 구 방식(본문서 평문)으로 남긴다.
                // 이후 로그인/세션 복원/관리자 백필의 지연 이관이 다시 옮긴다.
                newUser.password = credentials.password ?? null;
                if (credentials.phone4) newUser.phone4 = credentials.phone4;
            }
        }
        const result = await completeMemberSignupViaApi({
            churchId,
            entryCode: churchId === UNAFFILIATED_CHURCH_ID || joinTicket ? '' : churchCode,
            joinTicket: churchId === UNAFFILIATED_CHURCH_ID ? '' : joinTicket,
            name: newUser.name,
            birthdate: newUser.birthdate,
            guestProgress: {
                currentDay: newUser.currentDay,
                streak: newUser.streak,
                lastReadDate: newUser.lastReadDate,
                planId: newUser.planId,
            },
        });
        if (!result?.user) throw new Error('MEMBER_SIGNUP_RESPONSE_INVALID');
        const runtimeUser = result.user;
        await loadChurchCommunities(churchId, { requireServer: true });
        if (auth.currentUser?.uid !== user.uid) return;
        setTempUser({ ...runtimeUser, uid: user.uid });
        if (migrateGuest) {
            saveGuestState({ migratedAt: new Date().toISOString() });
        }
        setView('plan_type_select');
    };

    const buildPersonalUser = ({ name, birthdate = null, email, google = false, signupConsent }) => {
        const user = {
            ...buildNewMember({ name, birthdate, email, churchId: null, churchName: null, signupConsent }),
            accountType: 'personal',
            primaryOrgId: null,
        };
        if (google) delete user.password;
        return user;
    };

    const finishPersonalSignup = async ({ user, newUser, credentials, signupConsent }) => {
        await writeSignupConsent(user.uid, signupConsent);
        if (credentials) {
            await writeMemberCredentials(user.uid, credentials);
        }
        const result = await completePersonalSignupViaApi({
            name: newUser.name,
            birthdate: newUser.birthdate,
            authProvider: 'password',
            guestProgress: {
                currentDay: newUser.currentDay,
                streak: newUser.streak,
                lastReadDate: newUser.lastReadDate,
                planId: newUser.planId,
            },
        });
        if (!result?.user) throw new Error('PERSONAL_SIGNUP_RESPONSE_INVALID');
        const runtimeUser = { ...result.user, uid: user.uid, extraOrgs: [] };
        setCurrentUser(runtimeUser);
        setTempUser(runtimeUser);
        if (shouldMigrateGuestState()) saveGuestState({ migratedAt: new Date().toISOString() });
        setView('plan_type_select');
    };

    const rejectDeletedUser = async (message = '삭제 처리된 계정입니다. 관리자에게 복원을 요청해주세요.') => {
        setCurrentUser(null);
        await auth.signOut().catch(signOutError => {
            console.error('삭제된 계정 세션 종료 실패:', signOutError);
        });
        setErrorMsg(message);
    };

    const openExistingPersonalUser = async (firebaseUser, doc, loginTiming = null) => {
        if (auth.currentUser?.uid !== firebaseUser.uid) throw new Error('SOCIAL_AUTH_CHANGED');
        const data = doc.data();
        if (data.isDeleted === true) {
            await rejectDeletedUser();
            return false;
        }
        const pendingMigration = getPendingPersonalMigration(firebaseUser.uid)
            || restorePendingPersonalMigrationFromAuth({ firebaseUser, userData: data });
        if (data.accountType !== 'personal' && !pendingMigration) throw new Error('NOT_PERSONAL_ACCOUNT');
        let user = userDocToState(doc);
        const extraOrgsPromise = loadUserExtraOrgs(firebaseUser.uid);
        const legacyTalent = await migrateTalentIfNeeded(firebaseUser.uid, data);
        if (legacyTalent) {
            user.talent = legacyTalent.talent;
            user.score = legacyTalent.score;
            user.talentMigrated = true;
        }
        user.extraOrgs = await extraOrgsPromise;
        user = await migratePersonalWallet(user);
        if (auth.currentUser?.uid !== firebaseUser.uid) throw new Error('SOCIAL_AUTH_CHANGED');
        setCurrentUser(user);
        setTempUser(null);
        setView('dashboard');
        finishLoginTiming(loginTiming, 'dashboard');
        return true;
    };

    const openExistingSocialUser = async (firebaseUser, doc, loginTiming = null) => {
        if (auth.currentUser?.uid !== firebaseUser.uid) throw new Error('SOCIAL_AUTH_CHANGED');
        const data = doc.data();
        if (data.isDeleted === true) {
            await rejectDeletedUser();
            return false;
        }
        const pendingMigration = getPendingPersonalMigration(firebaseUser.uid)
            || restorePendingPersonalMigrationFromAuth({ firebaseUser, userData: data });
        if (data.accountType === 'personal' || pendingMigration) {
            await openExistingPersonalUser(firebaseUser, doc, loginTiming);
            return;
        }
        if (!['member', 'churchAdmin'].includes(data.role)) throw new Error('NOT_MEMBER_ACCOUNT');
        let user = userDocToState(doc);
        const extraOrgsPromise = loadUserExtraOrgs(firebaseUser.uid);
        const legacyTalent = await migrateTalentIfNeeded(firebaseUser.uid, data);
        if (legacyTalent) {
            user.talent = legacyTalent.talent;
            user.score = legacyTalent.score;
            user.talentMigrated = true;
        }
        user.extraOrgs = await extraOrgsPromise;
        user = await migratePersonalWallet(user);
        if (auth.currentUser?.uid !== firebaseUser.uid) throw new Error('SOCIAL_AUTH_CHANGED');
        setCurrentUser(user);
        setTempUser(null);
        const targetView = 'dashboard';
        setView(targetView);
        finishLoginTiming(loginTiming, targetView);
        return true;
    };

    const openSocialOnboarding = (firebaseUser, provider, profile = {}, signupDraft = null) => {
        if (!firebaseUser?.uid || auth.currentUser?.uid !== firebaseUser.uid) throw new Error('SOCIAL_AUTH_CHANGED');
        socialProviderRef.current = provider;
        setCurrentUser(null);
        setTempUser({
            uid: firebaseUser.uid,
            email: profile.email || firebaseUser.email || null,
            name: profile.nickname || firebaseUser.displayName || '',
            role: 'member',
            accountType: 'personal',
            socialProvider: provider,
            signupBirthdate: signupDraft?.birthdate || null,
            signupConsents: signupDraft?.consents || null,
            extraOrgs: [],
        });
        setView('social_onboarding');
    };

    const finishSocialStart = async (cred, provider, profile = {}, loginTiming = null, signupDraft = null) => {
        const firebaseUser = cred?.user;
        if (!firebaseUser?.uid || auth.currentUser?.uid !== firebaseUser.uid) throw new Error('INVALID_SOCIAL_PROFILE');
        const doc = await db.collection('users').doc(firebaseUser.uid).get({ source: 'server' });
        if (auth.currentUser?.uid !== firebaseUser.uid) throw new Error('SOCIAL_AUTH_CHANGED');
        if (doc.exists) {
            // Google 큰 버튼(T112b)과 동일하게 저장된 관리자 역할을 먼저 판정한다.
            // 연결된 카카오가 플랫폼/슈퍼관리자 uid로 커스텀 토큰을 받으면
            // 일반 교인 열기(NOT_MEMBER_ACCOUNT)로는 로그인할 수 없기 때문이다.
            // source-server 문서를 finishAdminLogin에 넘겨 같은 문서를 다시 읽지 않는다.
            if (['platformAdmin', 'superAdmin'].includes(doc.data()?.role)) {
                await finishAdminLogin(cred, {
                    requireRegisteredAdmin: true,
                    loginTiming,
                    verifiedUserDoc: doc,
                });
                return;
            }
            await openExistingSocialUser(firebaseUser, doc, loginTiming);
            return;
        }
        openSocialOnboarding(firebaseUser, provider, profile, signupDraft);
    };

    const handlePersonalSignup = async ({ name, birthdate, phone4, password, consents }) => {
        const loginTiming = beginLoginTiming('개인 계정 비밀번호');
        if (passwordPersonalSignupRef.current) return;
        passwordPersonalSignupRef.current = true;
        setErrorMsg('');
        const normalizedPhone4 = String(phone4 || '').trim();
        const email = makePseudoEmail(name, makeUnaffiliatedIdentity(birthdate, normalizedPhone4));
        let signupConsent;
        let completed = false;
        try {
            signupConsent = buildSignupConsentSnapshot({ birthdate, consents, audience: 'personal' }, { source: 'manual_personal_signup' });
            beginInteractiveAuthFlow('passwordPersonalSignup');
            await authReady;
            let cred;
            try {
                cred = await auth.createUserWithEmailAndPassword(email, password);
            } catch (error) {
                if (error?.code !== 'auth/email-already-in-use') throw error;
                cred = await auth.signInWithEmailAndPassword(email, password);
                const existingDoc = await db.collection('users').doc(cred.user.uid).get();
                if (existingDoc.exists) {
                    await openExistingPersonalUser(cred.user, existingDoc, loginTiming);
                    completed = true;
                    return;
                }
                await finishPersonalSignup({
                    user: cred.user,
                    newUser: buildPersonalUser({ name, birthdate, email, signupConsent }),
                    credentials: { password, phone4: normalizedPhone4 },
                    signupConsent,
                });
                completed = true;
                return;
            }
            await finishPersonalSignup({
                user: cred.user,
                newUser: buildPersonalUser({ name, birthdate, email, signupConsent }),
                credentials: { password, phone4: normalizedPhone4 },
                signupConsent,
            });
            completed = true;
        } catch (error) {
            console.error('개인 계정 시작 실패:', error);
            if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') setErrorMsg('이미 등록된 정보입니다. 기존 비밀번호를 확인해주세요.');
            else if (error?.code === 'auth/weak-password') setErrorMsg('비밀번호는 6자리 이상이어야 합니다.');
            else if (error?.message === 'NOT_PERSONAL_ACCOUNT') setErrorMsg("기존 교인 계정은 카카오·구글로 시작한 뒤 '기존 진도·달란트 이어보기'에서 연결해주세요.");
            else setErrorMsg('개인 계정을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            if (!completed && auth.currentUser) await auth.signOut().catch(() => {});
            endInteractiveAuthFlow('passwordPersonalSignup');
            passwordPersonalSignupRef.current = false;
        }
    };

    const handleGooglePersonalSignup = async (signupDraft = null) => {
        setErrorMsg('');
        if (personalSignupRef.current) return personalSignupRef.current;
        const request = (async () => {
            const loginTiming = beginLoginTiming('Google 개인/소셜');
            const flowName = 'googlePersonalSignup';
            let popupUid = null;
            beginInteractiveAuthFlow(flowName);
            try {
                await authReady;
                if (isKakaoTalkBrowser()) { setErrorMsg(KAKAO_GOOGLE_AUTH_MESSAGE); return; }
                const provider = new firebase.auth.GoogleAuthProvider();
                const cred = await auth.signInWithPopup(provider);
                popupUid = cred?.user?.uid || null;
                const hasGoogleProvider = (cred.user.providerData || []).some(item => item?.providerId === 'google.com');
                if (!cred.user.uid || !cred.user.email || !hasGoogleProvider || auth.currentUser?.uid !== cred.user.uid) {
                    throw new Error('INVALID_GOOGLE_PERSONAL_PROFILE');
                }
                const userRef = db.collection('users').doc(cred.user.uid);
                const existingDoc = await userRef.get({ source: 'server' });
                if (auth.currentUser?.uid !== cred.user.uid) throw new Error('SOCIAL_AUTH_CHANGED');
                if (existingDoc.exists) {
                    // 첫 화면의 큰 Google 버튼으로 들어와도 저장된 관리자 역할을 먼저
                    // 판정한다. 이메일 추측 없이 인증 uid의 서버 원본 역할만 신뢰한다.
                    if (GOOGLE_ADMIN_ROLES.has(existingDoc.data()?.role)) {
                        await finishAdminLogin(cred, {
                            requireRegisteredAdmin: true,
                            loginTiming,
                            verifiedUserDoc: existingDoc,
                        });
                        return;
                    }
                    await openExistingSocialUser(cred.user, existingDoc, loginTiming);
                    return;
                }
                if (signupDraft?.birthdate || signupDraft?.consents) {
                    buildSignupConsentSnapshot({
                        birthdate: signupDraft?.birthdate,
                        consents: signupDraft?.consents,
                        audience: 'personal',
                    }, { source: 'google_personal_signup' });
                }
                openSocialOnboarding(cred.user, 'google.com', {}, signupDraft);
            } catch (error) {
                if (error?.code === 'auth/account-exists-with-different-credential' && error?.credential) {
                    pendingGoogleRecoveryCredentialRef.current = error.credential;
                    socialProviderRef.current = 'google.com';
                    setCurrentUser(null);
                    setTempUser({
                        uid: `pending-google-recovery-${Date.now()}`,
                        name: '',
                        role: 'member',
                        accountType: 'personal',
                        socialProvider: 'google.com',
                        legacyRecoveryOnly: true,
                        extraOrgs: [],
                    });
                    setView('social_onboarding');
                    setErrorMsg('');
                } else if (error?.message === 'NOT_PERSONAL_ACCOUNT') {
                    setErrorMsg("이미 기존 기록이 있는 계정입니다. 첫 화면에서 다시 시작해 '기존 진도·달란트 이어보기'를 선택해주세요.");
                    if (popupUid && auth.currentUser?.uid === popupUid) {
                        setCurrentUser(null);
                        setTempUser(null);
                        await auth.signOut().catch(() => {});
                    }
                } else {
                    applyGooglePopupError(error);
                    if (popupUid
                        && auth.currentUser?.uid === popupUid
                        && !['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code)) {
                        setCurrentUser(null);
                        setTempUser(null);
                        await auth.signOut().catch(() => {});
                    }
                }
            } finally {
                endInteractiveAuthFlow(flowName);
                personalSignupRef.current = null;
            }
        })();
        personalSignupRef.current = request;
        return request;
    };

    const handleKakaoStart = async (signupDraft = null) => {
        setErrorMsg('');
        if (kakaoStartRef.current) return kakaoStartRef.current;
        const request = (async () => {
            const flowName = 'kakaoPersonalStart';
            beginInteractiveAuthFlow(flowName);
            try {
                // 중단된 다른 Kakao redirect 흐름이 남아 있어도 이번 시작 모드를
                // link/admin 가입으로 오분류하지 않도록 상호 배타적으로 초기화한다.
                sessionStorage.removeItem(KAKAO_LINK_RETURNING_KEY);
                sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_RETURNING_KEY);
                sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY);
                if (signupDraft?.birthdate || signupDraft?.consents) {
                    buildSignupConsentSnapshot({
                        birthdate: signupDraft?.birthdate,
                        consents: signupDraft?.consents,
                        audience: 'personal',
                    }, { source: 'kakao_personal_signup' });
                    sessionStorage.setItem(KAKAO_SIGNUP_DRAFT_KEY, JSON.stringify(signupDraft));
                } else {
                    sessionStorage.removeItem(KAKAO_SIGNUP_DRAFT_KEY);
                }
                const state = createKakaoState();
                sessionStorage.setItem(KAKAO_STATE_KEY, state);
                sessionStorage.setItem(KAKAO_RETURNING_KEY, 'pending');
                window.location.assign(buildKakaoAuthorizeUrl({ state }));
            } catch (error) {
                console.error('카카오 로그인 시작 실패:', error);
                sessionStorage.removeItem(KAKAO_STATE_KEY);
                sessionStorage.removeItem(KAKAO_RETURNING_KEY);
                sessionStorage.removeItem(KAKAO_SIGNUP_DRAFT_KEY);
                if (error?.message === 'KAKAO_REST_KEY_MISSING') setErrorMsg('카카오 로그인 설정이 아직 완료되지 않았습니다. 관리자에게 문의하세요.');
                else setErrorMsg('카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
                endInteractiveAuthFlow(flowName);
            } finally {
                kakaoStartRef.current = null;
            }
        })();
        kakaoStartRef.current = request;
        return request;
    };

    const handleGoogleLink = async () => {
        setSocialLinkNotice(null);
        try {
            await authReady;
            if (!auth.currentUser) throw new Error('AUTH_REQUIRED');
            if (isKakaoTalkBrowser()) {
                setSocialLinkNotice({ type: 'error', message: KAKAO_GOOGLE_AUTH_MESSAGE });
                return;
            }
            await auth.currentUser.linkWithPopup(new firebase.auth.GoogleAuthProvider());
            await db.collection('users').doc(auth.currentUser.uid).set({
                authProvider: 'google.com',
                authProviders: firebase.firestore.FieldValue.arrayUnion('google.com'),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            setCurrentUser(user => user ? {
                ...user,
                authProvider: 'google.com',
                authProviders: Array.from(new Set([...(user.authProviders || []), 'google.com'])),
            } : user);
            setSocialLinkNotice({ type: 'success', message: '구글 연결 완료! 다음부터 구글로 3초 만에 로그인하세요.' });
        } catch (error) {
            if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code)) return;
            const message = error?.code === 'auth/credential-already-in-use'
                ? '이미 다른 계정에 연결된 구글 계정입니다.'
                : '구글 계정을 연결하지 못했습니다. 잠시 후 다시 시도해주세요.';
            setSocialLinkNotice({ type: 'error', message });
        }
    };

    const handleKakaoLinkStart = async () => {
        setSocialLinkNotice(null);
        try {
            await authReady;
            if (!auth.currentUser) throw new Error('AUTH_REQUIRED');
            sessionStorage.removeItem(KAKAO_SIGNUP_DRAFT_KEY);
            sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY);
            const state = createKakaoState();
            sessionStorage.setItem(KAKAO_STATE_KEY, state);
            sessionStorage.setItem(KAKAO_RETURNING_KEY, 'pending');
            sessionStorage.setItem(KAKAO_LINK_RETURNING_KEY, 'pending');
            window.location.assign(buildKakaoAuthorizeUrl({ state }));
        } catch (error) {
            sessionStorage.removeItem(KAKAO_STATE_KEY);
            sessionStorage.removeItem(KAKAO_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_LINK_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_SIGNUP_DRAFT_KEY);
            setSocialLinkNotice({ type: 'error', message: '카카오 연결을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' });
        }
    };

    const signInLegacyMemberForSocialRecovery = async ({ name, birthdate, password, churchId, phone4 }) => {
        const isUnaffiliated = churchId === UNAFFILIATED_CHURCH_ID;
        if (!name?.trim() || !/^\d{8}$/.test(String(birthdate || '')) || !password || !churchId) {
            throw new Error('LEGACY_MEMBER_INPUT_REQUIRED');
        }
        if (isUnaffiliated && !/^\d{4}$/.test(String(phone4 || '').trim())) {
            throw new Error('LEGACY_PHONE4_REQUIRED');
        }
        const newEmail = makeMemberEmail(name.trim(), birthdate, churchId, phone4);
        const oldEmail = makePseudoEmail(name.trim(), birthdate);
        let credential = await auth.signInWithEmailAndPassword(newEmail, password).catch(() => null);
        if (!credential && !isUnaffiliated) {
            credential = await auth.signInWithEmailAndPassword(oldEmail, password).catch(() => null);
            if (credential) await credential.user.updateEmail(newEmail).catch(() => {});
        }
        if (!credential?.user?.uid) throw new Error('LEGACY_CREDENTIAL_MISMATCH');
        const userDoc = await db.collection('users').doc(credential.user.uid).get({ source: 'server' });
        const data = userDoc.exists ? userDoc.data() || {} : null;
        if (!data || data.isDeleted === true || data.role !== 'member') throw new Error('LEGACY_MEMBER_NOT_FOUND');
        if (data.accountType !== 'personal' && data.churchId !== churchId) throw new Error('LEGACY_CHURCH_MISMATCH');
        return { credential, userDoc };
    };

    const signInLegacyAdminForSocialRecovery = async ({ email, password }) => {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail || !password) throw new Error('LEGACY_ADMIN_INPUT_REQUIRED');
        const credential = await auth.signInWithEmailAndPassword(normalizedEmail, password)
            .catch(() => null);
        if (!credential?.user?.uid) throw new Error('LEGACY_CREDENTIAL_MISMATCH');
        const userDoc = await db.collection('users').doc(credential.user.uid).get({ source: 'server' });
        const data = userDoc.exists ? userDoc.data() || {} : null;
        if (!data || data.isDeleted === true || !GOOGLE_ADMIN_ROLES.has(data.role)) {
            throw new Error('LEGACY_ADMIN_NOT_FOUND');
        }
        return { credential, userDoc };
    };

    const handleLegacySocialRecovery = async ({ accountKind = 'member', ...input }) => {
        if (legacySocialRecoveryRef.current) return { ok: false, busy: true };
        legacySocialRecoveryRef.current = true;
        setErrorMsg('');
        const flowName = 'legacySocialRecovery';
        beginInteractiveAuthFlow(flowName);
        let shouldEndFlow = true;
        try {
            await authReady;
            const provider = String(socialProviderRef.current || input.socialProvider || '').trim();
            const pendingGoogleCredential = provider === 'google.com'
                ? pendingGoogleRecoveryCredentialRef.current
                : null;
            const pendingSocialUser = auth.currentUser;
            if ((!pendingSocialUser?.uid && !pendingGoogleCredential)
                || !['google.com', 'kakao.com'].includes(provider)) {
                throw new Error('SOCIAL_RECOVERY_SESSION_MISSING');
            }
            if (pendingSocialUser?.uid) {
                const pendingDoc = await db.collection('users').doc(pendingSocialUser.uid).get({ source: 'server' });
                if (pendingDoc.exists) throw new Error('SOCIAL_RECOVERY_ALREADY_REGISTERED');

                // 아직 users 문서가 없는 방금 만든 소셜 Auth 계정만 제거한다. 기존 기록은
                // 아래에서 검증한 legacy UID에 공급자를 연결하므로 복사·새 UID 생성이 없다.
                await pendingSocialUser.delete();
            }

            const legacy = accountKind === 'admin'
                ? await signInLegacyAdminForSocialRecovery(input)
                : await signInLegacyMemberForSocialRecovery(input);
            const legacyUid = legacy.credential.user.uid;
            if (auth.currentUser?.uid !== legacyUid) throw new Error('SOCIAL_AUTH_CHANGED');

            if (provider === 'kakao.com') {
                endInteractiveAuthFlow(flowName);
                shouldEndFlow = false;
                await handleKakaoLinkStart();
                return { ok: true, redirecting: true };
            }

            if (isKakaoTalkBrowser()) throw new Error('GOOGLE_IN_APP_UNAVAILABLE');
            if (pendingGoogleCredential) {
                await legacy.credential.user.linkWithCredential(pendingGoogleCredential);
                pendingGoogleRecoveryCredentialRef.current = null;
            } else {
                await legacy.credential.user.linkWithPopup(new firebase.auth.GoogleAuthProvider());
            }
            await db.collection('users').doc(legacyUid).set({
                authProvider: 'google.com',
                authProviders: firebase.firestore.FieldValue.arrayUnion('google.com'),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            const refreshedDoc = await db.collection('users').doc(legacyUid).get({ source: 'server' });
            if (GOOGLE_ADMIN_ROLES.has(refreshedDoc.data()?.role)) {
                await finishAdminLogin(legacy.credential, { requireRegisteredAdmin: true });
            } else {
                await openExistingSocialUser(legacy.credential.user, refreshedDoc);
            }
            setSocialLinkNotice({ type: 'success', message: '기존 기록에 구글 로그인을 연결했습니다.' });
            return { ok: true, linked: true };
        } catch (error) {
            console.error('기존 기록 소셜 연결 실패:', error);
            const messages = {
                LEGACY_MEMBER_INPUT_REQUIRED: '교회·이름·생년월일·기존 비밀번호를 모두 입력해주세요.',
                LEGACY_PHONE4_REQUIRED: '혼자 읽기 계정은 전화번호 뒤 4자리를 입력해주세요.',
                LEGACY_ADMIN_INPUT_REQUIRED: '관리자 이메일과 기존 비밀번호를 입력해주세요.',
                LEGACY_CREDENTIAL_MISMATCH: '기존 가입 정보가 맞지 않습니다. 담당 관리자에게 확인해주세요.',
                LEGACY_MEMBER_NOT_FOUND: '연결할 기존 성도 기록을 찾지 못했습니다.',
                LEGACY_ADMIN_NOT_FOUND: '연결할 기존 관리자 기록을 찾지 못했습니다.',
                LEGACY_CHURCH_MISMATCH: '선택한 교회와 기존 기록의 교회가 다릅니다.',
                SOCIAL_RECOVERY_SESSION_MISSING: '소셜 로그인 확인 시간이 지났습니다. 처음 화면에서 다시 시작해주세요.',
                SOCIAL_RECOVERY_ALREADY_REGISTERED: '이미 등록된 소셜 계정입니다. 처음 화면에서 바로 로그인해주세요.',
                GOOGLE_IN_APP_UNAVAILABLE: KAKAO_GOOGLE_AUTH_MESSAGE,
            };
            if (auth.currentUser) await auth.signOut().catch(() => {});
            throw new Error(messages[error?.message]
                || (error?.code === 'auth/credential-already-in-use'
                    ? '이 소셜 계정은 이미 다른 기록에 연결되어 있습니다.'
                    : '기존 기록을 연결하지 못했습니다. 처음 화면에서 다시 시도해주세요.'));
        } finally {
            if (shouldEndFlow) endInteractiveAuthFlow(flowName);
            legacySocialRecoveryRef.current = false;
        }
    };

    const handleSocialOnboardingComplete = async ({ name, organization, planId, birthdate, consents }) => {
        const socialUser = auth.currentUser;
        if (!socialUser?.uid || !name?.trim() || !organization?.orgId || !planId) throw new Error('온보딩 정보를 확인할 수 없습니다.');
        const signupConsent = buildSignupConsentSnapshot({
            birthdate,
            consents,
            audience: 'personal',
        }, { source: `${socialProviderRef.current || 'social'}_personal_signup` });
        const providerId = socialProviderRef.current || (socialUser.providerData || [])[0]?.providerId;
        const newUser = {
            ...buildPersonalUser({ name: name.trim(), birthdate, email: socialUser.email || null, google: true, signupConsent }),
            planId,
            primaryOrgId: organization.orgId,
            authProvider: providerId,
        };
        if (!isPlanIdAllowedForUser(planId, newUser)) {
            throw new Error('선택할 수 없는 성경 버전입니다. 버전을 다시 선택해주세요.');
        }
        await writeSignupConsent(socialUser.uid, signupConsent);
        const result = await completePersonalSignupViaApi({
            churchId: organization.orgId,
            entryCode: organization.joinTicket ? '' : (organization.entryCode || ''),
            joinTicket: organization.joinTicket || '',
            departmentId: organization.departmentId || '',
            subgroupId: organization.subgroupId || '',
            name: name.trim(),
            birthdate,
            authProvider: providerId,
            guestProgress: {
                currentDay: newUser.currentDay,
                streak: newUser.streak,
                lastReadDate: newUser.lastReadDate,
                planId,
            },
        });
        if (!result?.user || !result?.membership) throw new Error('PERSONAL_SIGNUP_RESPONSE_INVALID');
        if (shouldMigrateGuestState()) saveGuestState({ migratedAt: new Date().toISOString() });
        setCurrentUser({
            ...result.user, uid: socialUser.uid,
            extraOrgs: [{
                ...result.membership,
                uid: socialUser.uid,
                orgId: organization.orgId,
                rosterPath: `churches/${organization.orgId}/roster/${socialUser.uid}`,
            }],
        });
        setTempUser(null);
        setView('dashboard');
    };

    useEffect(() => {
        let alive = true;
        const callback = readKakaoCallback();
        if (!callback.code && !callback.error) return () => { alive = false; };
        const expectedState = sessionStorage.getItem(KAKAO_STATE_KEY);
        const returnStatus = sessionStorage.getItem(KAKAO_RETURNING_KEY);
        const isLinkReturn = sessionStorage.getItem(KAKAO_LINK_RETURNING_KEY) === 'pending';
        const isAdminSignupReturn = sessionStorage.getItem(KAKAO_ADMIN_SIGNUP_RETURNING_KEY) === 'pending';
        let kakaoSignupDraft = null;
        let kakaoAdminSignupDraft = null;
        try {
            kakaoSignupDraft = JSON.parse(sessionStorage.getItem(KAKAO_SIGNUP_DRAFT_KEY) || 'null');
        } catch {
            sessionStorage.removeItem(KAKAO_SIGNUP_DRAFT_KEY);
        }
        try {
            kakaoAdminSignupDraft = JSON.parse(sessionStorage.getItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY) || 'null');
        } catch {
            sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY);
        }
        clearKakaoCallbackUrl();
        if (callback.error) {
            sessionStorage.removeItem(KAKAO_STATE_KEY);
            sessionStorage.removeItem(KAKAO_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_LINK_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_SIGNUP_DRAFT_KEY);
            sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY);
            if (isAdminSignupReturn && typeof onKakaoAdminSignupReady === 'function') {
                onKakaoAdminSignupReady({ draft: kakaoAdminSignupDraft || {} });
            }
            const message = callback.error === 'access_denied' ? '카카오 연결이 취소되었습니다.' : '카카오 연결을 완료하지 못했습니다.';
            if (isLinkReturn) setSocialLinkNotice({ type: 'error', message });
            else if (callback.error === 'access_denied') setErrorMsg('카카오 로그인이 취소되었습니다.');
            else setErrorMsg('카카오 로그인을 완료하지 못했습니다. 다시 시도해주세요.');
            return () => { alive = false; };
        }
        if (!isValidKakaoState(callback.state, expectedState) || returnStatus === 'processing') {
            sessionStorage.removeItem(KAKAO_STATE_KEY);
            sessionStorage.removeItem(KAKAO_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_LINK_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY);
            if (isAdminSignupReturn && typeof onKakaoAdminSignupReady === 'function') {
                onKakaoAdminSignupReady({ draft: kakaoAdminSignupDraft || {} });
            }
            setErrorMsg('로그인 확인 시간이 지났어요. 노란 [카카오로 시작] 버튼을 다시 한 번 눌러주세요.');
            return () => { alive = false; };
        }
        sessionStorage.setItem(KAKAO_RETURNING_KEY, 'processing');
        beginInteractiveAuthFlow('kakaoCustomTokenResult');
        authReady.then(async () => {
            const loginTiming = beginLoginTiming('Kakao 개인/소셜');
            const linkIdToken = isLinkReturn ? await auth.currentUser?.getIdToken(true) : null;
            if (isLinkReturn && !linkIdToken) throw new Error('AUTH_REQUIRED');
            const profile = await exchangeKakaoCode({ code: callback.code, redirectUri: getKakaoRedirectUri(), linkIdToken });
            if (isLinkReturn) {
                const uid = auth.currentUser.uid;
                await db.collection('users').doc(uid).set({
                    authProvider: 'kakao.com',
                    authProviders: firebase.firestore.FieldValue.arrayUnion('kakao.com'),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                if (alive) {
                    setCurrentUser(user => user ? {
                        ...user,
                        authProvider: 'kakao.com',
                        authProviders: Array.from(new Set([...(user.authProviders || []), 'kakao.com'])),
                    } : user);
                    setSocialLinkNotice({ type: 'success', message: '연결 완료, 다음부터 카카오로 로그인하세요.' });
                }
                return;
            }
            const cred = await auth.signInWithCustomToken(profile.token);
            if (!alive) return;
            if (isAdminSignupReturn) {
                const profileUid = String(cred.user?.uid || '').trim();
                if (!/^kakao:[1-9][0-9]*$/.test(profileUid)) {
                    if (typeof onKakaoAdminSignupReady === 'function') {
                        onKakaoAdminSignupReady({ draft: kakaoAdminSignupDraft || {} });
                    }
                    setErrorMsg('이 카카오 계정은 이미 다른 계정에 연결되어 있습니다. 새 공동체 등록에는 아직 가입하지 않은 카카오 계정을 사용해주세요.');
                    await auth.signOut().catch(() => {});
                    return;
                }
                const existingDoc = await db.collection('users').doc(profileUid).get({ source: 'server' });
                if (!alive) return;
                if (existingDoc.exists) {
                    if (typeof onKakaoAdminSignupReady === 'function') {
                        onKakaoAdminSignupReady({ draft: kakaoAdminSignupDraft || {} });
                    }
                    setErrorMsg('이미 등록된 카카오 계정입니다. 첫 화면의 카카오로 시작 버튼으로 로그인해주세요.');
                    await auth.signOut().catch(() => {});
                    return;
                }
                const pendingProfile = {
                    provider: 'kakao.com',
                    uid: profileUid,
                    email: String(profile.email || '').trim(),
                    name: String(profile.nickname || '').trim(),
                    draft: kakaoAdminSignupDraft && typeof kakaoAdminSignupDraft === 'object'
                        ? kakaoAdminSignupDraft
                        : {},
                };
                if (typeof onKakaoAdminSignupReady === 'function') {
                    onKakaoAdminSignupReady(pendingProfile);
                }
                setView('login');
                setErrorMsg('');
                return;
            }
            try {
                await finishSocialStart(cred, 'kakao.com', profile, loginTiming, kakaoSignupDraft);
            } catch (error) {
                console.error('카카오 커스텀 토큰 처리 실패:', error);
                if (!alive) return;
                if (error?.message === 'NOT_MEMBER_ACCOUNT') {
                    setErrorMsg("이미 기존 기록이 있는 계정입니다. 첫 화면에서 다시 시작해 '기존 진도·달란트 이어보기'를 선택해주세요.");
                    await auth.signOut().catch(() => {});
                } else {
                    setErrorMsg(`카카오 로그인을 완료하지 못했습니다. 다시 시도해주세요. (진단: TOKEN_${describeKakaoAuthError(error)})`);
                }
            }
        }).catch(error => {
            if (!alive || !error) return;
            console.error('카카오 인증 코드 처리 실패:', error);
            if (isAdminSignupReturn && typeof onKakaoAdminSignupReady === 'function') {
                onKakaoAdminSignupReady({ draft: kakaoAdminSignupDraft || {} });
            }
            const message = error?.status === 409 ? error.message : '카카오 연결을 완료하지 못했습니다. 다시 시도해주세요.';
            if (isLinkReturn) setSocialLinkNotice({ type: 'error', message });
            else if (error?.message === 'KAKAO_AUTH_URL_MISSING') setErrorMsg('카카오 로그인 서버 설정이 아직 완료되지 않았습니다. 관리자에게 문의하세요.');
            else setErrorMsg(`카카오 로그인을 완료하지 못했습니다. 다시 시도해주세요. (진단: CODE_${describeKakaoAuthError(error)})`);
            if (!isLinkReturn) auth.signOut().catch(() => {});
        }).finally(() => {
            sessionStorage.removeItem(KAKAO_STATE_KEY);
            sessionStorage.removeItem(KAKAO_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_LINK_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_SIGNUP_DRAFT_KEY);
            sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_RETURNING_KEY);
            sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY);
            endInteractiveAuthFlow('kakaoCustomTokenResult');
        });
        return () => { alive = false; };
    }, []);

    const makeMemberEmail = (name, birthdate, churchId, phone4) => {
        const identity = churchId === UNAFFILIATED_CHURCH_ID
            ? makeUnaffiliatedIdentity(birthdate, phone4)
            : birthdate;
        return makePseudoEmail(name, identity, churchId);
    };

    // ── 교인 로그인 ──
    const handleMemberLogin = async (name, birthdate, pw, churchId, phone4) => {
        const loginTiming = beginLoginTiming('기존 회원');
        setErrorMsg('');
        try {
            await authReady;
            const isUnaffiliated = churchId === UNAFFILIATED_CHURCH_ID;
            if (isUnaffiliated && !/^\d{4}$/.test(String(phone4 || '').trim())) {
                setErrorMsg('전화번호 뒤 4자리를 입력해주세요.');
                return;
            }
            // 일반 교회는 신 포맷(이름+생년월일+교회ID) 실패 시 구 포맷으로 마이그레이션한다.
            // 무소속은 신규 기능이라 phone4 포함 포맷만 사용한다.
            const newEmail = makeMemberEmail(name, birthdate, churchId, phone4);
            const oldEmail = makePseudoEmail(name, birthdate);
            let newFormatError = null;
            let cred = await auth.signInWithEmailAndPassword(newEmail, pw).catch(err => {
                newFormatError = err;
                return null;
            });

            if (!cred && isUnaffiliated) {
                if (['auth/user-not-found', 'auth/invalid-login-credentials', 'auth/invalid-credential'].includes(newFormatError?.code)) {
                    setErrorMsg("등록되지 않은 사용자입니다. 개인 계정으로 전환하셨다면 첫 화면 '시작하기'에서 로그인해주세요.");
                } else if (newFormatError?.code === 'auth/wrong-password') {
                    setErrorMsg('비밀번호가 틀렸습니다.');
                } else {
                    setErrorMsg('로그인 실패. 잠시 후 다시 시도해주세요.');
                }
                return;
            }

            if (!cred) {
                // 구 포맷으로 재시도 (기존 계정 마이그레이션)
                cred = await auth.signInWithEmailAndPassword(oldEmail, pw).catch(async err => {
                    if (['auth/user-not-found', 'auth/invalid-login-credentials', 'auth/invalid-credential'].includes(err?.code)) {
                        setErrorMsg("등록되지 않은 사용자입니다. 개인 계정으로 전환하셨다면 첫 화면 '시작하기'에서 로그인해주세요.");
                    } else if (err?.code === 'auth/wrong-password') {
                        setErrorMsg('비밀번호가 틀렸습니다.');
                    } else {
                        setErrorMsg('로그인 실패. 잠시 후 다시 시도해주세요.');
                    }
                    return null;
                });
                // 구 포맷 로그인 성공 시 신 포맷으로 이메일 업데이트
                if (cred) {
                    await cred.user.updateEmail(newEmail).catch(() => {});
                }
            }
            if (!cred) return;
            const doc = await db.collection('users').doc(cred.user.uid).get();
            if (!doc.exists) { setErrorMsg('사용자 정보를 찾을 수 없습니다.'); return; }
            if (doc.data().isDeleted) { await rejectDeletedUser(); return; }
            let user = userDocToState(doc);
            const extraOrgsPromise = loadUserExtraOrgs(cred.user.uid);
            // [랭킹] 자격증명 지연 이관 — 본문서에 평문이 남아 있으면 private로 옮긴다.
            if (await migrateCredentialsIfNeeded(cred.user.uid, doc.data())) user.password = null;
            // [점수 이중화] talent 지갑 지연 마이그레이션 (1회성) — 대시보드 진입 전에 완료해 잔액 미표시 방지
            const migrated = await migrateTalentIfNeeded(cred.user.uid, doc.data());
            if (migrated) {
                user.talent = migrated.talent;
                user.score = migrated.score;
                user.talentMigrated = true;
            }
            user.extraOrgs = await extraOrgsPromise;
            user = await migratePersonalWallet(user);
            if (auth.currentUser?.uid !== cred.user.uid) return;
            setCurrentUser(user);
            setHasReadToday(user.lastReadDate === new Date().toDateString());
            const requiresOnboarding = user.accountType !== 'personal'
                && needsInitialOnboarding(user);
            if (user.churchId) {
                if (requiresOnboarding) {
                    await loadChurchCommunities(user.churchId, { requireServer: true });
                    if (auth.currentUser?.uid !== cred.user.uid) return;
                } else {
                    loadChurchCommunities(user.churchId);
                }
            }
            // [Phase 3] 로그인 성공 → 다음 방문에서 교회 자동 선택되도록 최근 교회 기억
            if (user.churchId && user.churchName) {
                saveLastChurch({ id: user.churchId, name: user.churchName });
            }
            let targetView = 'dashboard';
            if (requiresOnboarding) {
                setTempUser(user);
                targetView = 'plan_type_select';
            }
            setView(targetView);
            finishLoginTiming(loginTiming, targetView);
        } catch (err) {
            console.error(err);
            setErrorMsg('로그인 처리 중 오류가 발생했습니다.');
        }
    };

    const rejectUnregisteredGoogleAdmin = async () => {
        // Auth 상태 리스너가 일반 회원을 화면에 복원하기 전에 즉시 로컬 상태부터 비운다.
        setCurrentUser(null);
        try {
            await auth.signOut();
        } catch (signOutError) {
            console.error('등록되지 않은 구글 관리자 로그아웃 실패:', signOutError);
        }
        setErrorMsg(GOOGLE_ADMIN_NOT_FOUND_MESSAGE);
    };

    const rejectDeletedCommunityAdmin = async () => {
        await rejectDeletedUser('삭제된 공동체 관리자 계정입니다. 플랫폼 관리자에게 문의해주세요.');
    };

    // 이메일/비밀번호와 Google 관리자가 공유하는 문서 로드·마이그레이션·화면 전환 경로.
    // requireRegisteredAdmin은 Google 로그인에만 적용해 기존 이메일 로그인 동작을 보존한다.
    const finishAdminLogin = async (cred, {
        requireRegisteredAdmin = false,
        loginTiming = null,
        verifiedUserDoc = null,
    } = {}) => {
        if (verifiedUserDoc && verifiedUserDoc.id !== cred.user.uid) {
            throw new Error('ADMIN_AUTH_CHANGED');
        }
        const doc = verifiedUserDoc
            || await db.collection('users').doc(cred.user.uid).get({ source: 'server' });
        if (auth.currentUser?.uid !== cred.user.uid) throw new Error('ADMIN_AUTH_CHANGED');
        if (!doc.exists) {
            if (requireRegisteredAdmin) {
                await rejectUnregisteredGoogleAdmin();
            } else {
                setErrorMsg('사용자 정보를 찾을 수 없습니다.');
            }
            return false;
        }

        const data = doc.data();
        if (data.isDeleted === true) {
            await rejectDeletedUser(data.role === 'churchAdmin'
                ? '삭제된 공동체 관리자 계정입니다. 플랫폼 관리자에게 문의해주세요.'
                : undefined);
            return false;
        }
        // Google은 관리자 역할을 확인한 뒤에만 자격증명·달란트 마이그레이션을 실행한다.
        if (requireRegisteredAdmin && !GOOGLE_ADMIN_ROLES.has(data.role)) {
            await rejectUnregisteredGoogleAdmin();
            return false;
        }

        let user = userDocToState(doc);
        const extraOrgsPromise = loadUserExtraOrgs(cred.user.uid);
        // [랭킹] 자격증명 지연 이관 (관리자 계정 문서도 랭킹 쿼리에 걸린다)
        if (await migrateCredentialsIfNeeded(cred.user.uid, data)) user.password = null;
        // [점수 이중화] talent 지갑 지연 마이그레이션 (1회성)
        const migrated = await migrateTalentIfNeeded(cred.user.uid, data);
        if (migrated) {
            user.talent = migrated.talent;
            user.score = migrated.score;
            user.talentMigrated = true;
        }

        user.extraOrgs = await extraOrgsPromise;
        user = await migratePersonalWallet(user);
        if (auth.currentUser?.uid !== cred.user.uid) return false;

        if (user.role === 'superAdmin' || user.role === 'platformAdmin') {
            const loaded = await loadSuperAdminData({ expectedUid: cred.user.uid });
            if (loaded === false || auth.currentUser?.uid !== cred.user.uid) {
                throw new Error('ADMIN_AUTH_CHANGED');
            }
            setCurrentUser(user);
            return true;
        }

        setCurrentUser(user);
        setHasReadToday(user.lastReadDate === new Date().toDateString());
        const requiresOnboarding = needsInitialOnboarding(user);
        if (user.churchId) {
            if (requiresOnboarding) {
                await loadChurchCommunities(user.churchId, { requireServer: true });
                if (auth.currentUser?.uid !== cred.user.uid) return false;
            } else {
                loadChurchCommunities(user.churchId);
            }
        }
        const targetView = requiresOnboarding
            ? 'plan_type_select'
            : 'dashboard';
        if (requiresOnboarding) setTempUser(user);
        setView(targetView);
        finishLoginTiming(loginTiming, targetView);
        return true;
    };

    // ── 교회 관리자 / 슈퍼 관리자 로그인 ──
    const handleChurchAdminLogin = async (email, pw) => {
        const loginTiming = beginLoginTiming('공동체 관리자 이메일');
        setErrorMsg('');
        try {
            await authReady;
            const cred = await auth.signInWithEmailAndPassword(email, pw).catch(err => {
                if (['auth/user-not-found', 'auth/invalid-login-credentials', 'auth/invalid-credential'].includes(err?.code)) {
                    setErrorMsg('등록되지 않은 이메일입니다.');
                } else if (err?.code === 'auth/wrong-password') {
                    setErrorMsg('비밀번호가 틀렸습니다.');
                } else {
                    setErrorMsg('로그인 실패. 잠시 후 다시 시도해주세요.');
                }
                return null;
            });
            if (!cred) return;
            await finishAdminLogin(cred, { loginTiming });
        } catch (err) {
            console.error(err);
            setErrorMsg('로그인 처리 중 오류가 발생했습니다.');
        }
    };

    const handleGoogleAdminLogin = async () => {
        const loginTiming = beginLoginTiming('공동체 관리자 Google');
        setErrorMsg('');
        if (isKakaoTalkBrowser()) {
            setErrorMsg(KAKAO_GOOGLE_AUTH_MESSAGE);
            return;
        }
        const authFlowName = 'googleAdminLogin';
        let popupUid = null;
        beginInteractiveAuthFlow(authFlowName);
        try {
            await authReady;
            const provider = new firebase.auth.GoogleAuthProvider();
            const cred = await auth.signInWithPopup(provider);
            if (!cred?.user) {
                setErrorMsg('구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
                return;
            }
            popupUid = cred.user.uid;

            const didLogin = await finishAdminLogin(cred, { requireRegisteredAdmin: true, loginTiming });
            if (!didLogin) return;

            const hasPasswordProvider = (cred.user.providerData || [])
                .some(providerData => providerData?.providerId === firebase.auth.EmailAuthProvider.PROVIDER_ID);
            if (!hasPasswordProvider && typeof onAdminProviderNotice === 'function') {
                try {
                    onAdminProviderNotice('이제부터 이 계정은 구글로 로그인됩니다');
                } catch (noticeError) {
                    console.error('관리자 로그인 제공자 안내 표시 실패:', noticeError);
                }
            }
        } catch (err) {
            applyGooglePopupError(err);
            if (popupUid && auth.currentUser?.uid === popupUid) {
                setCurrentUser(null);
                setTempUser(null);
                await auth.signOut().catch(signOutError => {
                    console.error('관리자 Google 로그인 실패 후 로그아웃 실패:', signOutError);
                });
            }
        } finally {
            endInteractiveAuthFlow(authFlowName);
        }
    };

    const handleGoogleAdminSignupStart = async () => {
        setErrorMsg('');
        if (isKakaoTalkBrowser()) {
            setErrorMsg(KAKAO_GOOGLE_AUTH_MESSAGE);
            return null;
        }
        if (googleAdminSignupStartingRef.current) return googleAdminSignupStartingRef.current;
        let resolveGoogleStart = null;
        googleAdminSignupStartingRef.current = new Promise(resolve => {
            resolveGoogleStart = resolve;
        });
        const attemptId = ++googleAdminSignupAttemptRef.current;

        beginGoogleAdminSignupFlow();
        let keepFlowActive = false;
        let popupUser = null;
        let startResult = null;
        try {
            await authReady;
            const provider = new firebase.auth.GoogleAuthProvider();
            const cred = await auth.signInWithPopup(provider);
            if (!cred?.user) {
                setErrorMsg('구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
                return null;
            }
            popupUser = cred.user;

            if (googleAdminSignupAttemptRef.current !== attemptId) {
                setCurrentUser(null);
                await auth.signOut().catch(() => {});
                return null;
            }

            const popupEmail = String(cred.user.email || '').trim();
            const hasGoogleProvider = (cred.user.providerData || [])
                .some(providerData => providerData?.providerId === firebase.auth.GoogleAuthProvider.PROVIDER_ID);
            if (!popupEmail || !hasGoogleProvider) {
                setCurrentUser(null);
                await auth.signOut().catch(signOutError => {
                    console.error('구글 관리자 가입 시작 계정 검증 실패 후 로그아웃 실패:', signOutError);
                });
                setErrorMsg('구글 계정 정보를 확인할 수 없습니다. 다시 구글 계정으로 시작해주세요.');
                return null;
            }

            const existingDoc = await db.collection('users').doc(cred.user.uid).get();
            if (googleAdminSignupAttemptRef.current !== attemptId) {
                setCurrentUser(null);
                await auth.signOut().catch(() => {});
                return null;
            }
            if (existingDoc.exists) {
                setCurrentUser(null);
                await auth.signOut().catch(signOutError => {
                    console.error('기존 구글 관리자 가입 시작 로그아웃 실패:', signOutError);
                });
                setErrorMsg(GOOGLE_ADMIN_ALREADY_REGISTERED_MESSAGE);
                return null;
            }

            keepFlowActive = true;
            startResult = {
                provider: 'google.com',
                uid: cred.user.uid,
                email: popupEmail,
                name: cred.user.displayName || '',
            };
            return startResult;
        } catch (err) {
            if (popupUser) {
                setCurrentUser(null);
                await auth.signOut().catch(signOutError => {
                    console.error('구글 관리자 가입 시작 실패 후 로그아웃 실패:', signOutError);
                });
            }
            applyGooglePopupError(err);
            return null;
        } finally {
            googleAdminSignupStartingRef.current = null;
            resolveGoogleStart?.(startResult);
            if (!keepFlowActive) endGoogleAdminSignupFlow();
        }
    };

    const handleKakaoAdminSignupStart = async (draft = null) => {
        setErrorMsg('');
        if (kakaoAdminSignupStartRef.current) return kakaoAdminSignupStartRef.current;
        const request = (async () => {
            const flowName = 'kakaoAdminSignupStart';
            beginInteractiveAuthFlow(flowName);
            try {
                sessionStorage.removeItem(KAKAO_LINK_RETURNING_KEY);
                sessionStorage.removeItem(KAKAO_SIGNUP_DRAFT_KEY);
                const state = createKakaoState();
                sessionStorage.setItem(KAKAO_STATE_KEY, state);
                sessionStorage.setItem(KAKAO_RETURNING_KEY, 'pending');
                sessionStorage.setItem(KAKAO_ADMIN_SIGNUP_RETURNING_KEY, 'pending');
                sessionStorage.setItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY, JSON.stringify(draft || {}));
                window.location.assign(buildKakaoAuthorizeUrl({ state }));
            } catch (error) {
                console.error('카카오 공동체 등록 시작 실패:', error);
                sessionStorage.removeItem(KAKAO_STATE_KEY);
                sessionStorage.removeItem(KAKAO_RETURNING_KEY);
                sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_RETURNING_KEY);
                sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY);
                endInteractiveAuthFlow(flowName);
                setErrorMsg(error?.message === 'KAKAO_REST_KEY_MISSING'
                    ? '카카오 로그인 설정이 아직 완료되지 않았습니다. 관리자에게 문의하세요.'
                    : '카카오 공동체 등록을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
            } finally {
                kakaoAdminSignupStartRef.current = null;
            }
        })();
        kakaoAdminSignupStartRef.current = request;
        return request;
    };

    const cancelGoogleAdminSignup = async () => {
        setErrorMsg('');
        googleAdminSignupAttemptRef.current += 1;
        if (typeof onKakaoAdminSignupReady === 'function') onKakaoAdminSignupReady(null);
        sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_RETURNING_KEY);
        sessionStorage.removeItem(KAKAO_ADMIN_SIGNUP_DRAFT_KEY);
        setCurrentUser(null);
        try {
            await auth.signOut();
        } catch (signOutError) {
            console.error('구글 관리자 가입 취소 로그아웃 실패:', signOutError);
        } finally {
            if (!googleAdminSignupStartingRef.current && !googleAdminSignupSubmittingRef.current) {
                endGoogleAdminSignupFlow();
            }
        }
    };

    // ── 교인 가입 ──
    // churches/{churchId} 문서는 비로그인 상태에서 읽지 않는다.
    // 공개 디렉토리는 목록만 제공하고, 입장코드는 platform-api가 검증해
    // 5분짜리 참여권을 발급한다.
    const handleMemberSignup = async ({ name, birthdate, password, churchId, churchCode, phone4, consents }) => {
        setErrorMsg('');
        try {
            await authReady;
            const signupConsent = buildSignupConsentSnapshot({
                birthdate,
                consents,
                audience: 'member',
            }, { source: 'church_member_signup' });
            const isUnaffiliated = churchId === UNAFFILIATED_CHURCH_ID;
            const normalizedPhone4 = String(phone4 || '').trim();
            let churchName = UNAFFILIATED_CHURCH_NAME;
            let joinTicket = '';

            if (isUnaffiliated) {
                if (!/^\d{4}$/.test(normalizedPhone4)) {
                    setErrorMsg('전화번호 뒤 4자리를 입력해주세요.');
                    return;
                }
            } else {
                // 교회 입장코드 확인 (디렉토리 문서 — 미인증 공개 read)
                const directory = await getChurchDirectory();
                const churchEntry = directory.find(c => c.id === churchId);
                if (!churchEntry) { setErrorMsg('교회를 찾을 수 없습니다.'); return; }
                const ticketResult = await issueJoinTicket({
                    churchId,
                    entryCode: churchCode,
                    purpose: 'memberSignup',
                });
                joinTicket = ticketResult.joinTicket || '';
                if (!joinTicket) throw new Error('JOIN_TICKET_RESPONSE_INVALID');
                churchName = churchEntry.name;
            }

            const email = makeMemberEmail(name, birthdate, churchId, phone4);
            let signupErrorCode = null;
            let cred = await auth.createUserWithEmailAndPassword(email, password).catch(err => {
                signupErrorCode = err?.code || 'unknown';
                if (err?.code === 'auth/email-already-in-use') setErrorMsg('이미 가입된 이름+생년월일입니다. 로그인해주세요.');
                else if (err?.code === 'auth/weak-password') setErrorMsg('비밀번호는 6자리 이상이어야 합니다.');
                else setErrorMsg('가입 실패. 잠시 후 다시 시도해주세요.');
                return null;
            });
            const newUser = buildNewMember({ name, birthdate, email, churchId, churchName, signupConsent });
            const credentials = {
                password,
                ...(isUnaffiliated ? { phone4: normalizedPhone4 } : {}),
            };

            if (cred) {
                await finishMemberSignup({ user: cred.user, newUser, churchId, churchCode, joinTicket, credentials, signupConsent });
                return;
            }

            if (signupErrorCode !== 'auth/email-already-in-use') return;

            // 무료 플랜에서는 삭제를 isDeleted 처리한다.
            // 같은 계정으로 재가입하면 기존 비밀번호로 로그인해 문서를 재활성화한다.
            const orphanCred = await auth.signInWithEmailAndPassword(email, password).catch(() => null);
            if (!orphanCred) {
                setErrorMsg('이미 가입된 이름+생년월일입니다. 기존 비밀번호로 로그인하거나 공동체 관리자에게 복원을 요청해주세요.');
                return;
            }

            const existingDoc = await db.collection('users').doc(orphanCred.user.uid).get();
            if (existingDoc.exists) {
                if (existingDoc.data().isDeleted) {
                    await finishMemberSignup({ user: orphanCred.user, newUser, churchId, churchCode, joinTicket, credentials, signupConsent });
                    return;
                }
                setErrorMsg('이미 가입된 이름+생년월일입니다. 로그인해주세요.');
                return;
            }

            await finishMemberSignup({ user: orphanCred.user, newUser, churchId, churchCode, joinTicket, credentials, signupConsent });
        } catch (err) {
            console.error(err);
            setErrorMsg(err instanceof PlatformApiError
                ? err.message
                : '가입 처리 중 오류가 발생했습니다.');
        }
    };

    // ── 교회 관리자 가입 ──
    const handleChurchAdminSignup = async ({
        name, email, contactEmail, password, churchName, pastorName, denomination, churchCode, departments,
        googleProfile = null, ageConfirmed14Plus = false, consents,
    }) => {
        setErrorMsg('');
        const socialProvider = String(googleProfile?.provider || (googleProfile ? 'google.com' : '')).trim();
        const isSocialSignup = Boolean(googleProfile);
        const socialProviderLabel = socialProvider === 'kakao.com' ? '카카오' : '구글';
        const alreadyRegisteredMessage = socialProvider === 'kakao.com'
            ? '이미 등록된 카카오 계정입니다. 첫 화면의 카카오로 시작 버튼으로 로그인해주세요.'
            : GOOGLE_ADMIN_ALREADY_REGISTERED_MESSAGE;
        if (isSocialSignup && googleAdminSignupSubmittingRef.current) {
            return googleAdminSignupSubmittingRef.current;
        }
        let resolveGoogleSubmission = null;
        let finalResult = { ok: false, retryable: true };
        if (isSocialSignup) {
            beginGoogleAdminSignupFlow();
            googleAdminSignupSubmittingRef.current = new Promise(resolve => {
                resolveGoogleSubmission = resolve;
            });
        }

        const finishGoogleSignupTerminal = async (message, logLabel) => {
            setCurrentUser(null);
            await auth.signOut().catch(signOutError => {
                console.error(`${logLabel} 로그아웃 실패:`, signOutError);
            });
            setErrorMsg(message);
            finalResult = { ok: false, resetGoogleProfile: true };
            return finalResult;
        };

        try {
            await authReady;
            const signupConsent = buildSignupConsentSnapshot({
                birthdate: null,
                consents,
                audience: 'communityAdmin',
                ageConfirmed14Plus,
            }, { source: socialProvider === 'kakao.com'
                ? 'kakao_community_admin_signup'
                : (googleProfile ? 'google_community_admin_signup' : 'email_community_admin_signup') });

            let googleSignupRequestId = null;
            let googleSignupConsent = signupConsent;
            let resumedGoogleSignupAttempt = false;
            let googleSignupAttemptKey = null;
            if (isSocialSignup) {
                const { agreedAt: _agreedAt, ...stableConsent } = signupConsent;
                googleSignupAttemptKey = JSON.stringify({
                    uid: String(googleProfile?.uid || '').trim(),
                    provider: socialProvider,
                    contactEmail: String(contactEmail || '').trim().toLowerCase(),
                    name,
                    churchName,
                    pastorName: pastorName || '',
                    denomination: denomination || '',
                    entryCode: churchCode,
                    departments: departments || [],
                    consent: stableConsent,
                });
                const pending = googleAdminSignupPendingRef.current;
                if (pending?.attemptKey === googleSignupAttemptKey) {
                    googleSignupRequestId = pending.requestId;
                    googleSignupConsent = pending.consent;
                    resumedGoogleSignupAttempt = true;
                } else {
                    googleSignupRequestId = createRequestId();
                    googleAdminSignupPendingRef.current = {
                        attemptKey: googleSignupAttemptKey,
                        requestId: googleSignupRequestId,
                        consent: signupConsent,
                    };
                }
            }

            const finishServerChurchAdminSignup = async (authUser, signupPassword, {
                consent = signupConsent,
                requestId = null,
            } = {}) => {
                if (!authUser?.uid || auth.currentUser?.uid !== authUser.uid) {
                    throw new Error('교회 등록 중 로그인 계정이 변경되었습니다.');
                }
                const result = await completeChurchAdminSignupViaApi({
                    name,
                    contactEmail: String(contactEmail || '').trim().toLowerCase(),
                    churchName,
                    pastorName: pastorName || '',
                    denomination: denomination || '',
                    entryCode: churchCode,
                    departments: departments || [],
                    password: signupPassword,
                    consent,
                }, {
                    expectedUid: authUser.uid,
                    ...(requestId ? { requestId } : {}),
                });
                if (auth.currentUser?.uid !== authUser.uid) {
                    throw new Error('교회 등록 완료 전에 로그인 계정이 변경되었습니다.');
                }
                const userDoc = await db.collection('users').doc(authUser.uid).get({ source: 'server' });
                const storedUser = userDoc.exists ? userDoc.data() : null;
                if (!storedUser || storedUser.role !== 'churchAdmin'
                    || storedUser.isDeleted === true
                    || storedUser.churchId !== result.churchId) {
                    throw new Error('서버의 교회 관리자 등록 상태를 확인할 수 없습니다.');
                }
                invalidateChurchDirectoryCache();
                await loadChurchCommunities(result.churchId, { requireServer: true });
                if (auth.currentUser?.uid !== authUser.uid) {
                    throw new Error('교회 등록 확인 중 로그인 계정이 변경되었습니다.');
                }
                setTempUser({ ...storedUser, uid: authUser.uid });
                setView('plan_type_select');
                finalResult = { ok: true, recovered: result.status === 'alreadyCompleted' };
                return finalResult;
            };

            if (isSocialSignup) {
                const profileUid = String(googleProfile?.uid || '').trim();
                if (!profileUid || !matchesAdminSocialSignupProfile(auth.currentUser, googleProfile)) {
                    return await finishGoogleSignupTerminal(
                        `${socialProviderLabel} 계정 정보를 확인할 수 없습니다. 다시 ${socialProviderLabel} 계정으로 시작해주세요.`,
                        `${socialProviderLabel} 관리자 가입 계정 검증 실패 후`
                    );
                }

                const existingDoc = await db.collection('users').doc(profileUid).get({ source: 'server' });
                if (existingDoc.exists) {
                    const existingUser = existingDoc.data();
                    const profileEmail = String(googleProfile?.email || '').trim().toLowerCase();
                    const storedEmail = String(existingUser?.email || '').trim().toLowerCase();
                    const providerIdentityMatches = socialProvider === 'kakao.com'
                        ? existingUser?.authProvider === 'kakao.com' && /^kakao:[1-9][0-9]*$/.test(profileUid)
                        : Boolean(profileEmail && storedEmail === profileEmail);
                    const recoverableCommittedSignup = existingUser?.role === 'churchAdmin'
                        && existingUser?.isDeleted !== true
                        && existingUser?.onboardingPending === true
                        && /^church_[0-9a-f]{32}$/i.test(String(existingUser?.churchId || ''))
                        && providerIdentityMatches;
                    if (!recoverableCommittedSignup) {
                        return await finishGoogleSignupTerminal(
                            alreadyRegisteredMessage,
                            '기존 구글 관리자 최종 가입'
                        );
                    }

                    let recoveryConsent = googleSignupConsent;
                    if (!resumedGoogleSignupAttempt) {
                        const consentDoc = await db.collection('users').doc(profileUid)
                            .collection('private').doc('consent').get({ source: 'server' });
                        const storedConsent = consentDoc.exists ? consentDoc.data() : null;
                        if (!storedConsent || typeof storedConsent !== 'object' || Array.isArray(storedConsent)
                            || !Object.prototype.hasOwnProperty.call(storedConsent, 'recordedAt')) {
                            return await finishGoogleSignupTerminal(
                                alreadyRegisteredMessage,
                                '기존 구글 관리자 동의 검증 실패 후'
                            );
                        }
                        const { recordedAt: _recordedAt, ...consentWithoutRecordedAt } = storedConsent;
                        recoveryConsent = consentWithoutRecordedAt;
                        googleAdminSignupPendingRef.current = {
                            attemptKey: googleSignupAttemptKey,
                            requestId: googleSignupRequestId,
                            consent: recoveryConsent,
                        };
                    }
                    try {
                        return await finishServerChurchAdminSignup(auth.currentUser, null, {
                            consent: recoveryConsent,
                            requestId: googleSignupRequestId,
                        });
                    } catch (recoveryError) {
                        if (recoveryError instanceof PlatformApiError && recoveryError.retryable !== true) {
                            return await finishGoogleSignupTerminal(
                                alreadyRegisteredMessage,
                                '기존 구글 관리자 canonical 복구 거부 후'
                            );
                        }
                        throw recoveryError;
                    }
                }
                const googleUser = auth.currentUser;
                if (!matchesAdminSocialSignupProfile(googleUser, googleProfile)) {
                    return await finishGoogleSignupTerminal(
                        `${socialProviderLabel} 계정 정보를 확인할 수 없습니다. 다시 ${socialProviderLabel} 계정으로 시작해주세요.`,
                        `${socialProviderLabel} 관리자 최종 가입 계정 검증 실패 후`
                    );
                }
                return await finishServerChurchAdminSignup(googleUser, null, {
                    consent: googleSignupConsent,
                    requestId: googleSignupRequestId,
                });
            }

            // 이메일 가입도 Google 가입과 동일하게 새 공동체·관리자 계정·소유 증명·동의를
            // 서버 action의 단일 트랜잭션에서 만든다. 브라우저 직접 생성은 규칙에서 차단한다.
            // 직전 제출에서 Auth 생성 뒤 서버 action만 실패했다면 현재 인증 세션이
            // 그대로 남아 있다. 같은 이메일의 password 세션만 재사용해 고아 Auth 계정 때문에
            // email-already-in-use에 영구히 막히지 않고 공동체 등록을 이어서 처리한다.
            const normalizedSignupEmail = String(email || '').trim().toLowerCase();
            const currentAuthUser = auth.currentUser;
            const canResumeEmailSignup = Boolean(
                currentAuthUser?.uid
                && String(currentAuthUser.email || '').trim().toLowerCase() === normalizedSignupEmail
                && (currentAuthUser.providerData || []).some(provider => provider?.providerId === 'password')
            );
            let resumedEmailSignup = false;
            let cred = null;
            if (canResumeEmailSignup) {
                const existingUserDoc = await db.collection('users').doc(currentAuthUser.uid).get({ source: 'server' });
                const existingUserData = existingUserDoc.exists ? existingUserDoc.data() : null;
                if (existingUserData?.isDeleted === true) {
                    await rejectDeletedUser(existingUserData.role === 'churchAdmin'
                        ? '삭제된 공동체 관리자 계정입니다. 플랫폼 관리자에게 문의해주세요.'
                        : undefined);
                    finalResult = { ok: false, retryable: false };
                    return finalResult;
                }
                if (existingUserData?.role === 'churchAdmin') {
                    // transaction commit 응답만 유실된 모호한 네트워크 실패였다면 서버 문서를
                    // 정답으로 삼아 새 공동체를 중복 생성하지 않고 가입 완료 화면으로 복구한다.
                    const recoveredUser = existingUserData;
                    invalidateChurchDirectoryCache();
                    await loadChurchCommunities(recoveredUser.churchId, { requireServer: true });
                    if (auth.currentUser?.uid !== currentAuthUser.uid) return finalResult;
                    setTempUser({ ...recoveredUser, uid: currentAuthUser.uid });
                    setView('plan_type_select');
                    finalResult = { ok: true, recovered: true };
                    return finalResult;
                }
                if (!existingUserDoc.exists) {
                    cred = { user: currentAuthUser };
                    resumedEmailSignup = true;
                }
            }
            if (!cred) {
                try {
                    cred = await auth.createUserWithEmailAndPassword(email, password);
                } catch (createError) {
                    if (createError?.code === 'auth/email-already-in-use') {
                        // 다른 기기나 새 세션에서도 동일 비밀번호로 Auth 소유권을 증명하면
                        // Firestore 등록이 없던 고아 Auth 가입을 서버 action으로 이어간다.
                        try {
                            cred = await auth.signInWithEmailAndPassword(normalizedSignupEmail, password);
                            resumedEmailSignup = true;
                            const resumedDoc = await db.collection('users').doc(cred.user.uid).get({ source: 'server' });
                            const resumedUser = resumedDoc.exists ? resumedDoc.data() : null;
                            if (resumedUser?.isDeleted === true) {
                                await rejectDeletedUser(resumedUser.role === 'churchAdmin'
                                    ? '삭제된 공동체 관리자 계정입니다. 플랫폼 관리자에게 문의해주세요.'
                                    : undefined);
                                finalResult = { ok: false, retryable: false };
                                return finalResult;
                            }
                            if (resumedUser?.role === 'churchAdmin') {
                                invalidateChurchDirectoryCache();
                                await loadChurchCommunities(resumedUser.churchId, { requireServer: true });
                                if (auth.currentUser?.uid !== cred.user.uid) return finalResult;
                                setTempUser({ ...resumedUser, uid: cred.user.uid });
                                setView('plan_type_select');
                                finalResult = { ok: true, recovered: true };
                                return finalResult;
                            }
                            if (resumedDoc.exists) {
                                setErrorMsg('이미 등록된 계정입니다. 첫 화면에서 카카오 또는 구글로 로그인한 뒤 기존 기록 이어보기를 이용해주세요.');
                                return finalResult;
                            }
                        } catch (resumeError) {
                            console.error('기존 이메일 교회 등록 재개 실패:', resumeError);
                            setErrorMsg('이미 사용 중인 이메일입니다. 첫 화면에서 카카오 또는 구글로 로그인한 뒤 기존 기록 이어보기를 이용해주세요.');
                            return finalResult;
                        }
                    } else if (createError?.code === 'auth/weak-password') {
                        setErrorMsg('비밀번호는 6자리 이상이어야 합니다.');
                        return finalResult;
                    } else {
                        setErrorMsg('가입 실패. 잠시 후 다시 시도해주세요.');
                        return finalResult;
                    }
                }
            }
            if (!cred) return finalResult;
            try {
                return await finishServerChurchAdminSignup(cred.user, password);
            } catch (transactionError) {
                const authSessionPreserved = auth.currentUser?.uid === cred.user.uid;
                transactionError.emailAdminSignupIncomplete = true;
                transactionError.emailAdminSignupResumable = authSessionPreserved;
                transactionError.emailAdminSignupWasResume = resumedEmailSignup;
                throw transactionError;
            }
        } catch (err) {
            console.error(err);
            if (err?.emailAdminSignupResumable) {
                setErrorMsg(err.emailAdminSignupWasResume
                    ? '공동체 정보 저장을 다시 완료하지 못했습니다. 현재 인증 상태는 유지되어 있으니 잠시 후 이 버튼을 다시 눌러주세요.'
                    : '인증 계정은 만들어졌지만 공동체 정보 저장이 완료되지 않았습니다. 입력 내용을 유지한 채 이 버튼을 다시 누르면 이어서 처리합니다.');
            } else if (err?.emailAdminSignupIncomplete) {
                setErrorMsg('인증 계정 생성 후 로그인 상태가 변경되어 자동 재개할 수 없습니다. 같은 이메일로 다시 로그인해 재시도하거나 플랫폼 관리자에게 계정 정리를 요청해주세요.');
            } else {
                setErrorMsg('가입 처리 중 오류가 발생했습니다.');
            }
            finalResult = { ok: false, retryable: true };
            return finalResult;
        } finally {
            if (finalResult.ok || finalResult.resetGoogleProfile) {
                if (typeof onKakaoAdminSignupReady === 'function') onKakaoAdminSignupReady(null);
            }
            if (isSocialSignup) {
                googleAdminSignupSubmittingRef.current = null;
                resolveGoogleSubmission?.(finalResult);
                if (finalResult.ok || finalResult.resetGoogleProfile) {
                    endGoogleAdminSignupFlow();
                }
            }
        }
    };

    return {
        errorMsg,
        setErrorMsg,
        handleMemberLogin,
        handleMemberSignup,
        handlePersonalSignup,
        handleGooglePersonalSignup,
        handleKakaoStart,
        handleGoogleLink,
        handleKakaoLinkStart,
        handleLegacySocialRecovery,
        socialLinkNotice,
        setSocialLinkNotice,
        handleSocialOnboardingComplete,
        handleChurchAdminLogin,
        handleGoogleAdminLogin,
        handleGoogleAdminSignupStart,
        handleKakaoAdminSignupStart,
        cancelGoogleAdminSignup,
        handleChurchAdminSignup,
    };
};
