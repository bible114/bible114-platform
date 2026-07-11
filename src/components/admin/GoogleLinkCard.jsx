import React, { useEffect, useRef, useState } from 'react';
import { auth, authReady, db, firebase } from '../../utils/firebase';

const ADMIN_ROLES = new Set(['churchAdmin', 'platformAdmin', 'superAdmin']);
const GOOGLE_PROVIDER_ID = firebase.auth.GoogleAuthProvider.PROVIDER_ID;
const PASSWORD_PROVIDER_ID = firebase.auth.EmailAuthProvider.PROVIDER_ID;
const KAKAO_GOOGLE_AUTH_MESSAGE = "카카오톡 브라우저에서는 구글 로그인이 제한됩니다. 우측 하단 ⋯ 메뉴에서 '다른 브라우저로 열기'를 눌러주세요.";

const snapshotProviders = (user) => (user?.providerData || []).map(provider => ({
    providerId: provider?.providerId || '',
    email: provider?.email || '',
}));

const noticeClasses = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
};

const GoogleLinkCard = ({ accountUid, accountRole }) => {
    const [activeAuthUid, setActiveAuthUid] = useState(() => auth?.currentUser?.uid || null);
    const [providerData, setProviderData] = useState(() => snapshotProviders(auth?.currentUser));
    const [loadingAction, setLoadingAction] = useState(null);
    const [notice, setNotice] = useState(null);
    const inFlightRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        let unsubscribe = null;
        let cancelled = false;

        authReady.then(() => {
            if (cancelled || !mountedRef.current || !auth) return;
            unsubscribe = auth.onAuthStateChanged(user => {
                if (cancelled || !mountedRef.current) return;
                setActiveAuthUid(user?.uid || null);
                setProviderData(snapshotProviders(user));
            });
        }).catch(error => {
            console.error('Google 연결 카드 Auth 상태 확인 실패:', error);
            if (!cancelled && mountedRef.current) setActiveAuthUid(null);
        });

        return () => {
            cancelled = true;
            mountedRef.current = false;
            if (unsubscribe) unsubscribe();
        };
    }, []);

    useEffect(() => {
        const currentUser = auth?.currentUser;
        setActiveAuthUid(currentUser?.uid || null);
        setProviderData(snapshotProviders(currentUser));
        setNotice(null);
    }, [accountUid, accountRole]);

    const getAuthorizedUser = () => {
        const currentUser = auth?.currentUser;
        if (!ADMIN_ROLES.has(accountRole) || !accountUid || currentUser?.uid !== accountUid) return null;
        return currentUser;
    };

    const setNoticeIfMounted = (nextNotice) => {
        if (mountedRef.current) setNotice(nextNotice);
    };

    const applyGoogleLinkError = (error) => {
        if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
            setNoticeIfMounted(null);
            return;
        }
        if (
            error?.code === 'auth/credential-already-in-use'
            || error?.code === 'auth/account-exists-with-different-credential'
            || error?.code === 'auth/email-already-in-use'
        ) {
            setNoticeIfMounted({ type: 'error', message: '이 구글 계정은 이미 다른 계정에 연결되어 있습니다' });
            return;
        }
        if (error?.code === 'auth/operation-not-allowed') {
            setNoticeIfMounted({ type: 'error', message: '구글 로그인이 아직 활성화되지 않았습니다. 관리자에게 문의하세요.' });
            return;
        }
        if (error?.code === 'auth/popup-blocked') {
            setNoticeIfMounted({ type: 'error', message: '팝업이 차단되었습니다. 브라우저 설정을 확인해주세요.' });
            return;
        }
        if (error?.code === 'auth/unauthorized-domain') {
            setNoticeIfMounted({ type: 'error', message: '현재 접속한 주소에서는 구글 로그인을 사용할 수 없습니다. 관리자에게 승인된 도메인 설정을 문의하세요.' });
            return;
        }
        if (error?.code === 'auth/requires-recent-login') {
            setNoticeIfMounted({ type: 'error', message: '보안을 위해 다시 로그인한 뒤 시도해주세요.' });
            return;
        }
        if (error?.code === 'auth/network-request-failed') {
            setNoticeIfMounted({ type: 'error', message: '네트워크 연결을 확인한 뒤 다시 시도해주세요.' });
            return;
        }
        console.error('Google 계정 연결 실패:', error);
        setNoticeIfMounted({ type: 'error', message: '구글 계정을 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' });
    };

    const handleLinkGoogle = async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setLoadingAction('link');
        setNotice(null);

        try {
            await authReady;
            const currentUser = getAuthorizedUser();
            if (!currentUser) {
                setNoticeIfMounted({ type: 'error', message: '현재 관리자 계정을 확인할 수 없습니다. 다시 로그인해주세요.' });
                return;
            }

            const credential = await currentUser.linkWithPopup(new firebase.auth.GoogleAuthProvider());
            const linkedUser = credential?.user || auth.currentUser;
            if (!linkedUser || linkedUser.uid !== accountUid || auth.currentUser?.uid !== accountUid) {
                setNoticeIfMounted({ type: 'error', message: '현재 관리자 계정을 확인할 수 없습니다. 다시 로그인해주세요.' });
                return;
            }

            if (mountedRef.current) setProviderData(snapshotProviders(linkedUser));
            setNoticeIfMounted({
                type: 'success',
                message: '연결 완료 — 이제 관리자 로그인에서 구글 버튼으로 로그인할 수 있습니다',
            });
        } catch (error) {
            if (error?.code === 'auth/provider-already-linked') {
                const currentUser = getAuthorizedUser();
                if (mountedRef.current) setProviderData(snapshotProviders(currentUser));
                setNoticeIfMounted({ type: 'info', message: '이미 구글 계정이 연결되어 있습니다.' });
            } else {
                applyGoogleLinkError(error);
            }
        } finally {
            inFlightRef.current = false;
            if (mountedRef.current) setLoadingAction(null);
        }
    };

    const handleRemovePassword = async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setLoadingAction('unlink');
        setNotice(null);

        try {
            if (!window.confirm('비밀번호 로그인을 제거하시겠습니까?')) return;
            if (!window.confirm('제거하면 이 계정은 구글로만 로그인할 수 있습니다')) return;

            await authReady;
            const currentUser = getAuthorizedUser();
            const currentProviders = currentUser?.providerData || [];
            const hasGoogleProvider = currentProviders.some(provider => provider?.providerId === GOOGLE_PROVIDER_ID);
            const hasPasswordProvider = currentProviders.some(provider => provider?.providerId === PASSWORD_PROVIDER_ID);
            if (!currentUser || !hasGoogleProvider) {
                setNoticeIfMounted({ type: 'error', message: '연결된 구글 계정을 확인할 수 없습니다. 다시 로그인해주세요.' });
                return;
            }
            if (!hasPasswordProvider) {
                if (mountedRef.current) setProviderData(snapshotProviders(currentUser));
                setNoticeIfMounted({ type: 'info', message: '이미 구글 로그인만 사용 중입니다.' });
                return;
            }

            const unlinkedUser = await currentUser.unlink('password');
            if (mountedRef.current) setProviderData(snapshotProviders(unlinkedUser));
            if (!unlinkedUser || unlinkedUser.uid !== accountUid || auth.currentUser?.uid !== accountUid) {
                setNoticeIfMounted({
                    type: 'warning',
                    message: '비밀번호 로그인은 제거되었지만 현재 계정이 변경되어 계정 정보를 갱신하지 못했습니다. 다시 로그인해 확인해주세요.',
                });
                return;
            }

            try {
                await db.collection('users').doc(accountUid).update({
                    password: null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
                setNoticeIfMounted({ type: 'success', message: '비밀번호 로그인을 제거했습니다. 구글 로그인만 사용 중입니다.' });
            } catch (firestoreError) {
                console.error('비밀번호 provider 제거 후 사용자 문서 갱신 실패:', firestoreError);
                setNoticeIfMounted({
                    type: 'warning',
                    message: '비밀번호 로그인은 제거되었지만 계정 정보 갱신에 실패했습니다. 관리자에게 문의해주세요.',
                });
            }
        } catch (error) {
            if (error?.code === 'auth/no-such-provider') {
                const currentUser = getAuthorizedUser();
                if (mountedRef.current) setProviderData(snapshotProviders(currentUser));
                setNoticeIfMounted({ type: 'info', message: '이미 구글 로그인만 사용 중입니다.' });
            } else if (error?.code === 'auth/requires-recent-login') {
                setNoticeIfMounted({ type: 'error', message: '보안을 위해 다시 로그인한 뒤 시도해주세요.' });
            } else {
                console.error('비밀번호 로그인 제거 실패:', error);
                setNoticeIfMounted({ type: 'error', message: '비밀번호 로그인을 제거하지 못했습니다. 잠시 후 다시 시도해주세요.' });
            }
        } finally {
            inFlightRef.current = false;
            if (mountedRef.current) setLoadingAction(null);
        }
    };

    const allowedRole = ADMIN_ROLES.has(accountRole);
    const currentAuthMatches = Boolean(accountUid && activeAuthUid === accountUid && auth?.currentUser?.uid === accountUid);
    if (!allowedRole || !currentAuthMatches) return null;

    const googleProvider = providerData.find(provider => provider.providerId === GOOGLE_PROVIDER_ID);
    const hasPasswordProvider = providerData.some(provider => provider.providerId === PASSWORD_PROVIDER_ID);
    const isKakaoTalkBrowser = typeof navigator !== 'undefined' && navigator.userAgent.includes('KAKAOTALK');

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="google-link-card-title">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-base font-black text-blue-700" aria-hidden="true">
                    G
                </div>
                <div className="min-w-0 flex-1">
                    <h3 id="google-link-card-title" className="text-base font-black text-slate-900">내 계정에 구글 연결</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                        원하시면 현재 관리자 계정에 구글 로그인을 추가할 수 있습니다.
                    </p>
                </div>
            </div>

            {googleProvider ? (
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-700">연결된 구글 계정</p>
                    <p className="mt-1 break-all text-sm font-semibold text-slate-900">
                        {googleProvider.email || auth.currentUser?.email || '이메일 정보 없음'}
                    </p>
                    {hasPasswordProvider ? (
                        <button
                            type="button"
                            onClick={handleRemovePassword}
                            disabled={Boolean(loadingAction)}
                            className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loadingAction === 'unlink' ? '제거 중...' : '비밀번호 로그인 제거'}
                        </button>
                    ) : (
                        <p className="mt-3 text-sm font-semibold text-blue-800">구글 로그인만 사용 중</p>
                    )}
                </div>
            ) : isKakaoTalkBrowser ? (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800" role="note">
                    {KAKAO_GOOGLE_AUTH_MESSAGE}
                </p>
            ) : (
                <button
                    type="button"
                    onClick={handleLinkGoogle}
                    disabled={Boolean(loadingAction)}
                    className="mt-4 w-full rounded-xl border border-blue-200 bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loadingAction === 'link' ? '구글 계정 연결 중...' : '구글 계정 연결'}
                </button>
            )}

            {notice && (
                <p
                    className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold leading-6 ${noticeClasses[notice.type] || noticeClasses.info}`}
                    role={notice.type === 'error' || notice.type === 'warning' ? 'alert' : 'status'}
                >
                    {notice.message}
                </p>
            )}
        </section>
    );
};

export default GoogleLinkCard;
