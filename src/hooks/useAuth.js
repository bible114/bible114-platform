import { useRef, useState } from 'react';
import { auth, authReady, db, firebase } from '../utils/firebase';
import { makePseudoEmail, makeUnaffiliatedIdentity, userDocToState, migrateTalentIfNeeded } from '../utils/helpers';
import { sha256 } from '../utils/crypto';
import {
    getChurchDirectory,
    addChurchToDirectory,
    invalidateChurchDirectoryCache,
    saveLastChurch,
} from '../utils/churchDirectory';
import { UNAFFILIATED_CHURCH_ID, UNAFFILIATED_CHURCH_NAME } from '../data/constants';
import { getGuestState, saveGuestState } from '../utils/guestStorage';
import { writeMemberCredentials, migrateCredentialsIfNeeded } from '../utils/memberCredentials';
import { beginInteractiveAuthFlow, endInteractiveAuthFlow } from '../utils/authFlowGuard';
import { loadUserExtraOrgs } from '../utils/roster';

const GOOGLE_ADMIN_ROLES = new Set(['churchAdmin', 'platformAdmin', 'superAdmin']);
const GOOGLE_ADMIN_NOT_FOUND_MESSAGE = "이 구글 계정으로 등록된 관리자가 없습니다. 기존 관리자는 이메일·비밀번호로 로그인하시고, 새 교회는 '교회 등록'을 이용하세요.";
const GOOGLE_ADMIN_SIGNUP_FLOW_NAME = 'googleAdminSignup';
const GOOGLE_ADMIN_ALREADY_REGISTERED_MESSAGE = '이미 등록된 계정입니다. 관리자 로그인에서 구글로 로그인해주세요.';
const KAKAO_GOOGLE_AUTH_MESSAGE = "카카오톡 브라우저에서는 구글 로그인이 제한됩니다. 우측 하단 ⋯ 메뉴에서 '다른 브라우저로 열기'를 눌러주세요.";

export const useAuth = ({
    setCurrentUser,
    setTempUser,
    setView,
    setHasReadToday,
    setChurchCommunities,
    loadChurchCommunities,
    loadSuperAdminData,
    onAdminProviderNotice,
}) => {
    const [errorMsg, setErrorMsg] = useState('');
    const googleAdminSignupFlowRef = useRef(null);
    const googleAdminSignupAttemptRef = useRef(0);
    const googleAdminSignupStartingRef = useRef(false);
    const googleAdminSignupSubmittingRef = useRef(null);
    const personalSignupRef = useRef(null);
    const passwordPersonalSignupRef = useRef(false);

    const beginGoogleAdminSignupFlow = () => {
        if (!googleAdminSignupFlowRef.current) {
            googleAdminSignupFlowRef.current = beginInteractiveAuthFlow(GOOGLE_ADMIN_SIGNUP_FLOW_NAME);
        }
    };

    const endGoogleAdminSignupFlow = () => {
        const flowName = googleAdminSignupFlowRef.current;
        if (!flowName) return;
        googleAdminSignupFlowRef.current = null;
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
            setErrorMsg('이미 이메일·비밀번호로 등록된 계정입니다. 기존 관리자는 이메일·비밀번호로 로그인해주세요.');
            return;
        }
        if (err?.code === 'auth/unauthorized-domain') {
            setErrorMsg('현재 접속한 주소에서는 구글 로그인을 사용할 수 없습니다. 관리자에게 승인된 도메인 설정을 문의하세요.');
            return;
        }
        console.error('구글 인증 실패:', err);
        setErrorMsg('구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
    };

    const matchesGoogleAdminSignupProfile = (googleUser, googleProfile) => {
        const profileUid = String(googleProfile?.uid || '').trim();
        const profileEmail = String(googleProfile?.email || '').trim().toLowerCase();
        const authEmail = String(googleUser?.email || '').trim().toLowerCase();
        const hasGoogleProvider = (googleUser?.providerData || [])
            .some(providerData => providerData?.providerId === firebase.auth.GoogleAuthProvider.PROVIDER_ID);
        return Boolean(
            googleUser
            && profileUid
            && googleUser.uid === profileUid
            && profileEmail
            && authEmail === profileEmail
            && hasGoogleProvider
        );
    };

    const shouldMigrateGuestState = () => {
        const guest = getGuestState();
        return !guest.migratedAt && guest.readDates.length > 0;
    };

    const buildNewMember = ({ name, birthdate, email, churchId, churchName }) => {
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
            gender: 'male',
            planId: guest.planId || '1year_revised',
            departmentId: null, departmentName: null, subgroupId: null,
            isDeleted: false, deletedAt: null, deletedBy: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
    };

    const finishMemberSignup = async ({ user, newUser, churchId, credentials }) => {
        setErrorMsg('');
        if (credentials) {
            try {
                await writeMemberCredentials(user.uid, credentials);
            } catch {
                // 규칙 미배포 등으로 private 쓰기가 거부되면 구 방식(본문서 평문)으로 남긴다.
                // 이후 로그인/세션 복원/관리자 백필의 지연 이관이 다시 옮긴다.
                newUser.password = credentials.password ?? null;
                if (credentials.phone4) newUser.phone4 = credentials.phone4;
            }
        }
        await db.collection('users').doc(user.uid).set(newUser);
        // 신규 성도 → 통계 증가
        db.collection('settings').doc('platformStats').set({
            total_readers: firebase.firestore.FieldValue.increment(1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => {});
        await loadChurchCommunities(churchId);
        setTempUser({ ...newUser, uid: user.uid });
        if (shouldMigrateGuestState()) {
            saveGuestState({ migratedAt: new Date().toISOString() });
        }
        setView('plan_type_select');
    };

    const buildPersonalUser = ({ name, birthdate = null, email, google = false }) => {
        const user = {
            ...buildNewMember({ name, birthdate, email, churchId: null, churchName: null }),
            accountType: 'personal',
            primaryOrgId: null,
        };
        if (google) delete user.password;
        return user;
    };

    const finishPersonalSignup = async ({ user, newUser, credentials }) => {
        if (credentials) {
            await writeMemberCredentials(user.uid, credentials);
        }
        await db.collection('users').doc(user.uid).set(newUser);
        db.collection('settings').doc('platformStats').set({
            total_readers: firebase.firestore.FieldValue.increment(1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => {});
        setTempUser({ ...newUser, uid: user.uid, extraOrgs: [] });
        if (shouldMigrateGuestState()) saveGuestState({ migratedAt: new Date().toISOString() });
        setView('plan_type_select');
    };

    const openExistingPersonalUser = async (firebaseUser, doc) => {
        const data = doc.data();
        if (data.accountType !== 'personal') throw new Error('NOT_PERSONAL_ACCOUNT');
        const user = userDocToState(doc);
        user.extraOrgs = await loadUserExtraOrgs(firebaseUser.uid);
        setCurrentUser(user);
        setTempUser(null);
        setView('dashboard');
    };

    const handlePersonalSignup = async ({ name, birthdate, phone4, password }) => {
        if (passwordPersonalSignupRef.current) return;
        passwordPersonalSignupRef.current = true;
        setErrorMsg('');
        const normalizedPhone4 = String(phone4 || '').trim();
        const email = makePseudoEmail(name, makeUnaffiliatedIdentity(birthdate, normalizedPhone4));
        let completed = false;
        try {
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
                    await openExistingPersonalUser(cred.user, existingDoc);
                    completed = true;
                    return;
                }
                await finishPersonalSignup({
                    user: cred.user,
                    newUser: buildPersonalUser({ name, birthdate, email }),
                    credentials: { password, phone4: normalizedPhone4 },
                });
                completed = true;
                return;
            }
            await finishPersonalSignup({
                user: cred.user,
                newUser: buildPersonalUser({ name, birthdate, email }),
                credentials: { password, phone4: normalizedPhone4 },
            });
            completed = true;
        } catch (error) {
            console.error('개인 계정 시작 실패:', error);
            if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') setErrorMsg('이미 등록된 정보입니다. 기존 비밀번호를 확인해주세요.');
            else if (error?.code === 'auth/weak-password') setErrorMsg('비밀번호는 6자리 이상이어야 합니다.');
            else if (error?.message === 'NOT_PERSONAL_ACCOUNT') setErrorMsg('기존 교인 계정은 아래 교인 로그인으로 들어가주세요.');
            else setErrorMsg('개인 계정을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            if (!completed && auth.currentUser) await auth.signOut().catch(() => {});
            endInteractiveAuthFlow('passwordPersonalSignup');
            passwordPersonalSignupRef.current = false;
        }
    };

    const handleGooglePersonalSignup = async () => {
        setErrorMsg('');
        if (personalSignupRef.current) return personalSignupRef.current;
        const request = (async () => {
            const flowName = 'googlePersonalSignup';
            beginInteractiveAuthFlow(flowName);
            try {
                await authReady;
                if (isKakaoTalkBrowser()) { setErrorMsg(KAKAO_GOOGLE_AUTH_MESSAGE); return; }
                const provider = new firebase.auth.GoogleAuthProvider();
                const cred = await auth.signInWithPopup(provider);
                const hasGoogleProvider = (cred.user.providerData || []).some(item => item?.providerId === 'google.com');
                if (!cred.user.uid || !cred.user.email || !hasGoogleProvider || auth.currentUser?.uid !== cred.user.uid) {
                    throw new Error('INVALID_GOOGLE_PERSONAL_PROFILE');
                }
                const userRef = db.collection('users').doc(cred.user.uid);
                const existingDoc = await userRef.get();
                if (existingDoc.exists) {
                    await openExistingPersonalUser(cred.user, existingDoc);
                    return;
                }
                const newUser = buildPersonalUser({ name: cred.user.displayName || '성도', email: cred.user.email, google: true });
                await db.runTransaction(async transaction => {
                    const latest = await transaction.get(userRef);
                    if (latest.exists) throw new Error('PERSONAL_USER_RACE');
                    if (auth.currentUser?.uid !== cred.user.uid) throw new Error('PERSONAL_AUTH_CHANGED');
                    transaction.set(userRef, newUser);
                });
                db.collection('settings').doc('platformStats').set({
                    total_readers: firebase.firestore.FieldValue.increment(1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true }).catch(() => {});
                setTempUser({ ...newUser, uid: cred.user.uid, extraOrgs: [] });
                if (shouldMigrateGuestState()) saveGuestState({ migratedAt: new Date().toISOString() });
                setView('plan_type_select');
            } catch (error) {
                if (error?.message === 'NOT_PERSONAL_ACCOUNT') {
                    setErrorMsg('이미 다른 방식으로 등록된 계정입니다. 기존 로그인 방법을 이용해주세요.');
                    await auth.signOut().catch(() => {});
                } else {
                    applyGooglePopupError(error);
                    if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code)) {
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

    const makeMemberEmail = (name, birthdate, churchId, phone4) => {
        const identity = churchId === UNAFFILIATED_CHURCH_ID
            ? makeUnaffiliatedIdentity(birthdate, phone4)
            : birthdate;
        return makePseudoEmail(name, identity, churchId);
    };

    // ── 교인 로그인 ──
    const handleMemberLogin = async (name, birthdate, pw, churchId, phone4) => {
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
                    setErrorMsg('등록되지 않은 사용자입니다. 회원가입 후 이용해주세요.');
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
                        setErrorMsg('등록되지 않은 사용자입니다. 회원가입 후 이용해주세요.');
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
            if (doc.data().isDeleted) { setErrorMsg('삭제 처리된 계정입니다. 교회 관리자에게 복원을 요청해주세요.'); return; }
            const user = userDocToState(doc);
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
            if (auth.currentUser?.uid !== cred.user.uid) return;
            setCurrentUser(user);
            setHasReadToday(user.lastReadDate === new Date().toDateString());
            if (user.churchId) await loadChurchCommunities(user.churchId);
            // [Phase 3] 로그인 성공 → 다음 방문에서 교회 자동 선택되도록 최근 교회 기억
            if (user.churchId && user.churchName) {
                saveLastChurch({ id: user.churchId, name: user.churchName });
            }
            if (!user.departmentId || !user.subgroupId) { setTempUser(user); setView('plan_type_select'); }
            else setView('dashboard');
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

    // 이메일/비밀번호와 Google 관리자가 공유하는 문서 로드·마이그레이션·화면 전환 경로.
    // requireRegisteredAdmin은 Google 로그인에만 적용해 기존 이메일 로그인 동작을 보존한다.
    const finishAdminLogin = async (cred, { requireRegisteredAdmin = false } = {}) => {
        const doc = await db.collection('users').doc(cred.user.uid).get();
        if (!doc.exists) {
            if (requireRegisteredAdmin) {
                await rejectUnregisteredGoogleAdmin();
            } else {
                setErrorMsg('사용자 정보를 찾을 수 없습니다.');
            }
            return false;
        }

        const data = doc.data();
        // Google은 관리자 역할을 확인한 뒤에만 자격증명·달란트 마이그레이션을 실행한다.
        if (requireRegisteredAdmin && !GOOGLE_ADMIN_ROLES.has(data.role)) {
            await rejectUnregisteredGoogleAdmin();
            return false;
        }

        const user = userDocToState(doc);
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
        if (auth.currentUser?.uid !== cred.user.uid) return false;

        if (user.role === 'superAdmin' || user.role === 'platformAdmin') {
            setCurrentUser(user);
            await loadSuperAdminData();
            return true;
        }

        setCurrentUser(user);
        setHasReadToday(user.lastReadDate === new Date().toDateString());
        if (user.churchId) await loadChurchCommunities(user.churchId);
        setView('dashboard');
        return true;
    };

    // ── 교회 관리자 / 슈퍼 관리자 로그인 ──
    const handleChurchAdminLogin = async (email, pw) => {
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
            await finishAdminLogin(cred);
        } catch (err) {
            console.error(err);
            setErrorMsg('로그인 처리 중 오류가 발생했습니다.');
        }
    };

    const handleGoogleAdminLogin = async () => {
        setErrorMsg('');
        if (isKakaoTalkBrowser()) {
            setErrorMsg(KAKAO_GOOGLE_AUTH_MESSAGE);
            return;
        }
        const authFlowName = 'googleAdminLogin';
        beginInteractiveAuthFlow(authFlowName);
        try {
            await authReady;
            const provider = new firebase.auth.GoogleAuthProvider();
            const cred = await auth.signInWithPopup(provider);
            if (!cred?.user) {
                setErrorMsg('구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
                return;
            }

            const didLogin = await finishAdminLogin(cred, { requireRegisteredAdmin: true });
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

    const cancelGoogleAdminSignup = async () => {
        setErrorMsg('');
        googleAdminSignupAttemptRef.current += 1;
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
    // [Phase 3] churches/{churchId} 문서는 비로그인 상태에서 더 이상 읽지 않는다
    // (firestore.rules: churches read는 isSignedIn() 필요). 대신 공개된
    // settings/churchDirectory 의 codeHash로 입장코드를 클라이언트에서 검증한다.
    // → Firebase Auth 계정 생성 전에 실패시키므로 가입 실패 시 롤백이 불필요하다.
    const handleMemberSignup = async ({ name, birthdate, password, churchId, churchCode, phone4 }) => {
        setErrorMsg('');
        try {
            await authReady;
            const isUnaffiliated = churchId === UNAFFILIATED_CHURCH_ID;
            const normalizedPhone4 = String(phone4 || '').trim();
            let churchName = UNAFFILIATED_CHURCH_NAME;

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
                if (!churchEntry.codeHash) { setErrorMsg('교회 입장코드 정보를 확인할 수 없습니다. 교회 관리자에게 문의해주세요.'); return; }
                const inputHash = await sha256(churchCode);
                if (churchEntry.codeHash !== inputHash) { setErrorMsg('교회 입장코드가 틀렸습니다.'); return; }
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
            const newUser = buildNewMember({ name, birthdate, email, churchId, churchName });
            const credentials = {
                password,
                ...(isUnaffiliated ? { phone4: normalizedPhone4 } : {}),
            };

            if (cred) {
                await finishMemberSignup({ user: cred.user, newUser, churchId, credentials });
                return;
            }

            if (signupErrorCode !== 'auth/email-already-in-use') return;

            // 무료 플랜에서는 삭제를 isDeleted 처리한다.
            // 같은 계정으로 재가입하면 기존 비밀번호로 로그인해 문서를 재활성화한다.
            const orphanCred = await auth.signInWithEmailAndPassword(email, password).catch(() => null);
            if (!orphanCred) {
                setErrorMsg('이미 가입된 이름+생년월일입니다. 기존 비밀번호로 로그인하거나 교회 관리자에게 복원을 요청해주세요.');
                return;
            }

            const existingDoc = await db.collection('users').doc(orphanCred.user.uid).get();
            if (existingDoc.exists) {
                if (existingDoc.data().isDeleted) {
                    await finishMemberSignup({ user: orphanCred.user, newUser, churchId, credentials });
                    return;
                }
                setErrorMsg('이미 가입된 이름+생년월일입니다. 로그인해주세요.');
                return;
            }

            await finishMemberSignup({ user: orphanCred.user, newUser, churchId });
        } catch (err) {
            console.error(err);
            setErrorMsg('가입 처리 중 오류가 발생했습니다.');
        }
    };

    // ── 교회 관리자 가입 ──
    const handleChurchAdminSignup = async ({ name, email, password, churchName, pastorName, denomination, churchCode, departments, googleProfile = null }) => {
        setErrorMsg('');
        const isGoogleSignup = Boolean(googleProfile);
        if (isGoogleSignup && googleAdminSignupSubmittingRef.current) {
            return googleAdminSignupSubmittingRef.current;
        }
        let resolveGoogleSubmission = null;
        let finalResult = { ok: false, retryable: true };
        if (isGoogleSignup) {
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

            if (isGoogleSignup) {
                const profileUid = String(googleProfile?.uid || '').trim();
                if (!profileUid || !matchesGoogleAdminSignupProfile(auth.currentUser, googleProfile)) {
                    return await finishGoogleSignupTerminal(
                        '구글 계정 정보를 확인할 수 없습니다. 다시 구글 계정으로 시작해주세요.',
                        '구글 관리자 가입 계정 검증 실패 후'
                    );
                }

                const userRef = db.collection('users').doc(profileUid);
                const churchRef = db.collection('churches').doc();
                const directoryRef = db.collection('settings').doc('churchDirectory');
                const churchCodeHash = await sha256(churchCode);

                const transactionResult = await db.runTransaction(async transaction => {
                    // 동시 제출이 같은 Google uid를 선점했는지 transaction 안에서 판정한다.
                    const existingDoc = await transaction.get(userRef);
                    if (existingDoc.exists) return { terminal: 'existing' };

                    // transaction은 재시도될 수 있으므로 매 시도에서 read 직후 현재 Auth를 다시 검증한다.
                    const googleUser = auth.currentUser;
                    if (!matchesGoogleAdminSignupProfile(googleUser, googleProfile)) {
                        return { terminal: 'invalid-profile' };
                    }

                    const resolvedEmail = String(googleUser.email || '').trim();
                    const newUser = {
                        name, email: resolvedEmail, password: null, birthdate: null,
                        role: 'churchAdmin', churchId: churchRef.id, churchName,
                        extraMemberships: [],
                        startDate: new Date().toDateString(),
                        currentDay: 1, streak: 0, score: 0, talent: 0, talentMigrated: true, readCount: 1,
                        lastReadDate: null, gender: 'male', planId: '1year_revised',
                        departmentId: null, departmentName: null, subgroupId: null,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    };

                    transaction.set(churchRef, {
                        name: churchName, pastorName: pastorName || '', denomination: denomination || '',
                        churchCodeHash, adminUid: googleUser.uid, adminEmail: resolvedEmail,
                        departments: departments || [],
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                    transaction.set(userRef, newUser);
                    transaction.set(directoryRef, {
                        churches: firebase.firestore.FieldValue.arrayUnion({
                            id: churchRef.id,
                            name: churchName,
                            codeHash: churchCodeHash,
                        }),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });

                    return { ok: true, newUser };
                });

                if (transactionResult?.terminal === 'existing') {
                    return await finishGoogleSignupTerminal(
                        GOOGLE_ADMIN_ALREADY_REGISTERED_MESSAGE,
                        '기존 구글 관리자 최종 가입'
                    );
                }
                if (transactionResult?.terminal === 'invalid-profile') {
                    return await finishGoogleSignupTerminal(
                        '구글 계정 정보를 확인할 수 없습니다. 다시 구글 계정으로 시작해주세요.',
                        '구글 관리자 최종 가입 계정 검증 실패 후'
                    );
                }
                if (!transactionResult?.ok) throw new Error('구글 관리자 가입 트랜잭션 결과가 올바르지 않습니다.');

                // 세 문서 commit 뒤에만 캐시·통계·온보딩 상태를 갱신한다.
                invalidateChurchDirectoryCache();
                db.collection('settings').doc('platformStats').set({
                    total_churches: firebase.firestore.FieldValue.increment(1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true }).catch(() => {});
                setChurchCommunities(departments || []);
                setTempUser({ ...transactionResult.newUser, uid: profileUid });
                setView('plan_type_select');
                finalResult = { ok: true };
                return finalResult;
            }

            // 이메일 가입은 기존 Auth 생성 + 순차 Firestore 쓰기 흐름을 유지한다.
            const cred = await auth.createUserWithEmailAndPassword(email, password).catch(err => {
                if (err?.code === 'auth/email-already-in-use') setErrorMsg('이미 사용 중인 이메일입니다.');
                else if (err?.code === 'auth/weak-password') setErrorMsg('비밀번호는 6자리 이상이어야 합니다.');
                else setErrorMsg('가입 실패. 잠시 후 다시 시도해주세요.');
                return null;
            });
            if (!cred) return finalResult;

            // 교회 문서 생성
            const churchRef = db.collection('churches').doc();
            const churchCodeHash = await sha256(churchCode);
            await churchRef.set({
                name: churchName, pastorName: pastorName || '', denomination: denomination || '',
                churchCodeHash, adminUid: cred.user.uid, adminEmail: email,
                departments: departments || [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            setChurchCommunities(departments || []);
            // [Phase 3] 공개 교회 디렉토리에 신규 교회 등록 (로그인 화면 검색용)
            await addChurchToDirectory({ id: churchRef.id, name: churchName, codeHash: churchCodeHash }).catch(err => {
                console.error('교회 디렉토리 등록 실패:', err);
            });

            const newUser = {
                name, email, password, birthdate: null,
                role: 'churchAdmin', churchId: churchRef.id, churchName,
                extraMemberships: [],
                startDate: new Date().toDateString(),
                currentDay: 1, streak: 0, score: 0, talent: 0, talentMigrated: true, readCount: 1,
                lastReadDate: null, gender: 'male', planId: '1year_revised',
                departmentId: null, departmentName: null, subgroupId: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            await db.collection('users').doc(cred.user.uid).set(newUser);
            // 신규 교회 + 관리자 → 통계 증가
            db.collection('settings').doc('platformStats').set({
                total_churches: firebase.firestore.FieldValue.increment(1),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true }).catch(() => {});
            setTempUser({ ...newUser, uid: cred.user.uid });
            setView('plan_type_select');
            finalResult = { ok: true };
            return finalResult;
        } catch (err) {
            console.error(err);
            setErrorMsg('가입 처리 중 오류가 발생했습니다.');
            finalResult = { ok: false, retryable: true };
            return finalResult;
        } finally {
            if (isGoogleSignup) {
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
        handleChurchAdminLogin,
        handleGoogleAdminLogin,
        handleGoogleAdminSignupStart,
        cancelGoogleAdminSignup,
        handleChurchAdminSignup,
    };
};
