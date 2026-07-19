import React, { useState } from 'react';
import { PLAN_TYPES, getVisibleBibleVersions } from '../data/bible_options';
import { UNAFFILIATED_CHURCH_ID, UNAFFILIATED_CHURCH_NAME } from '../data/constants';
import { CommunityMembershipCard } from './dashboard';
import ChurchPicker from './ChurchPicker';
import { GuardianConsent, PolicyConsent } from './policies';
import { createEmptyPolicyConsents } from '../data/servicePolicies';
import { validateSignupConsent } from '../utils/signupConsent';

const SocialOnboardingView = ({ tempUser, onComplete, onLegacyLink }) => {
    const recoveryOnly = tempUser?.legacyRecoveryOnly === true;
    const [entryMode, setEntryMode] = useState(recoveryOnly ? 'recover' : 'choose');
    const [accountKind, setAccountKind] = useState('member');
    const [step, setStep] = useState(1);
    const [name, setName] = useState(tempUser?.name || '');
    const [birthdate, setBirthdate] = useState(tempUser?.signupBirthdate || '');
    const [policyConsents, setPolicyConsents] = useState(() => ({
        ...createEmptyPolicyConsents('personal'),
        ...(tempUser?.signupConsents || {}),
    }));
    const [guardianConsent, setGuardianConsent] = useState(tempUser?.signupConsents?.childGuardian || null);
    const [organization, setOrganization] = useState(null);
    const [planType, setPlanType] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [legacyChurchId, setLegacyChurchId] = useState('');
    const [legacyName, setLegacyName] = useState('');
    const [legacyBirthdate, setLegacyBirthdate] = useState('');
    const [legacyPhone4, setLegacyPhone4] = useState('');
    const [legacyPassword, setLegacyPassword] = useState('');
    const [legacyAdminEmail, setLegacyAdminEmail] = useState('');
    const providerLabel = tempUser?.socialProvider === 'kakao.com' ? '카카오' : '구글';
    const returnToLogin = () => window.location.assign('/');
    const consentPayload = {
        ...policyConsents,
        ...(guardianConsent ? { childGuardian: guardianConsent } : {}),
    };
    const consentReady = validateSignupConsent({ birthdate, consents: consentPayload, audience: 'personal' }).ok;

    const chooseOrganization = org => {
        setOrganization(org);
        setStep(3);
    };

    const chooseSolo = () => chooseOrganization({
        orgId: UNAFFILIATED_CHURCH_ID,
        orgName: UNAFFILIATED_CHURCH_NAME,
        departmentId: null,
        departmentName: null,
        subgroupId: null,
        subgroupName: null,
    });

    const finish = async versionId => {
        setBusy(true); setError('');
        try {
            await onComplete({
                name: name.trim(),
                organization,
                planId: `${planType}_${versionId}`,
                birthdate,
                consents: consentPayload,
            });
        } catch (err) {
            console.error('소셜 온보딩 완료 실패:', err);
            setError(err?.message || '시작 설정을 저장하지 못했습니다. 다시 시도해주세요.');
        } finally {
            setBusy(false);
        }
    };

    const connectLegacyRecord = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await onLegacyLink({
                accountKind,
                socialProvider: tempUser?.socialProvider,
                ...(accountKind === 'admin' ? {
                    email: legacyAdminEmail,
                    password: legacyPassword,
                } : {
                    churchId: legacyChurchId,
                    name: legacyName,
                    birthdate: legacyBirthdate,
                    phone4: legacyPhone4,
                    password: legacyPassword,
                }),
            });
        } catch (err) {
            setError(err?.message || '기존 기록을 연결하지 못했습니다. 다시 시도해주세요.');
        } finally {
            setBusy(false);
        }
    };

    if (entryMode === 'choose') return (
        <div className="min-h-screen bg-slate-50 px-5 py-10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}>
            <section className="mx-auto w-full max-w-lg rounded-3xl bg-white p-6 shadow-sm">
                <p className="text-sm font-bold text-blue-600">{providerLabel} 로그인 확인 완료</p>
                <h1 className="mt-2 text-2xl font-black text-slate-900">전에 읽던 기록이 있나요?</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">예전에 이름·생년월일·비밀번호로 로그인했다면 기존 기록을 먼저 연결해주세요.</p>
                <div className="mt-6 space-y-3">
                    <button type="button" onClick={() => setEntryMode('recover')} className="min-h-14 w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-black text-white">
                        기존 진도·달란트 이어보기
                    </button>
                    <button type="button" onClick={() => setEntryMode('new')} className="min-h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-black text-slate-700">
                        처음 시작하기
                    </button>
                </div>
                <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">기존 기록이 있는데 ‘처음 시작하기’를 누르면 새 계정이 생길 수 있어요. 잘 모르겠으면 교회 담당자에게 확인해주세요.</p>
            </section>
        </div>
    );

    if (entryMode === 'recover') return (
        <div className="min-h-screen bg-slate-50 px-5 py-10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}>
            <form onSubmit={connectLegacyRecord} className="mx-auto w-full max-w-lg rounded-3xl bg-white p-6 shadow-sm">
                <button type="button" disabled={busy} onClick={() => { if (recoveryOnly) returnToLogin(); else setEntryMode('choose'); setError(''); }} className="min-h-11 rounded-xl px-3 text-sm font-bold text-slate-600">← {recoveryOnly ? '로그인 처음 화면' : '뒤로'}</button>
                <h1 className="mt-2 text-2xl font-black text-slate-900">기존 기록 연결</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">기존 비밀번호는 기록의 주인이 맞는지 한 번 확인할 때만 사용합니다. 연결 후에는 {providerLabel}으로 로그인합니다.</p>
                <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                    <button type="button" onClick={() => { setAccountKind('member'); setError(''); }} className={`min-h-11 rounded-xl px-3 text-sm font-black ${accountKind === 'member' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>성도</button>
                    <button type="button" onClick={() => { setAccountKind('admin'); setError(''); }} className={`min-h-11 rounded-xl px-3 text-sm font-black ${accountKind === 'admin' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>공동체 관리자</button>
                </div>
                {accountKind === 'admin' ? (
                    <div className="mt-5 space-y-3">
                        <input type="email" value={legacyAdminEmail} onChange={event => setLegacyAdminEmail(event.target.value)} placeholder="기존 관리자 이메일" autoComplete="username" className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-base" />
                        <input type="password" value={legacyPassword} onChange={event => setLegacyPassword(event.target.value)} placeholder="기존 비밀번호" autoComplete="current-password" className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-base" />
                    </div>
                ) : (
                    <div className="mt-5 space-y-3">
                        <ChurchPicker value={legacyChurchId} onChange={setLegacyChurchId} label="기존 기록의 교회" />
                        <button type="button" onClick={() => setLegacyChurchId(UNAFFILIATED_CHURCH_ID)} className="min-h-11 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-left text-sm font-bold text-emerald-800">🙋 소속 교회 없이 혼자 읽었어요</button>
                        <input value={legacyName} onChange={event => setLegacyName(event.target.value)} placeholder="기존 기록의 이름" autoComplete="name" className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-base" />
                        <input inputMode="numeric" value={legacyBirthdate} onChange={event => setLegacyBirthdate(event.target.value.replace(/\D/g, ''))} maxLength={8} placeholder="생년월일 8자리" className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-base" />
                        {legacyChurchId === UNAFFILIATED_CHURCH_ID && <input inputMode="numeric" value={legacyPhone4} onChange={event => setLegacyPhone4(event.target.value.replace(/\D/g, ''))} maxLength={4} placeholder="전화번호 뒤 4자리" className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-base" />}
                        <input type="password" value={legacyPassword} onChange={event => setLegacyPassword(event.target.value)} placeholder="기존 비밀번호" autoComplete="current-password" className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-base" />
                    </div>
                )}
                {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold leading-relaxed text-red-700">{error}</p>}
                <button type="submit" disabled={busy} className="mt-5 min-h-14 w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-black text-white disabled:bg-slate-300">
                    {busy ? '기존 기록 확인 중...' : `${providerLabel} 로그인에 기존 기록 연결`}
                </button>
                <p className="mt-3 text-center text-sm text-slate-500">{providerLabel} 계정 선택 화면이 한 번 더 열릴 수 있습니다.</p>
                {error && <button type="button" onClick={returnToLogin} className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">처음 화면에서 다시 시작</button>}
            </form>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 px-5 py-10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}>
            <div className="mx-auto w-full max-w-lg">
                <button type="button" onClick={() => { setEntryMode('choose'); setError(''); }} className="mb-4 min-h-11 rounded-xl px-3 text-sm font-bold text-slate-600">← 기존 기록 확인으로</button>
                <div className="mb-6 flex items-center justify-center gap-2" aria-label={`${step}단계 / 3단계`}>
                    {[1, 2, 3].map(number => <span key={number} className={`h-2 rounded-full transition-all ${number === step ? 'w-10 bg-blue-600' : number < step ? 'w-5 bg-blue-300' : 'w-5 bg-slate-200'}`} />)}
                </div>

                {step === 1 && <section className="rounded-3xl bg-white p-6 shadow-sm">
                    <p className="text-xs font-bold text-blue-600">1단계 / 3단계</p>
                    <h1 className="mt-2 text-2xl font-black text-slate-900">성함이 어떻게 되세요?</h1>
                    <p className="mt-2 text-sm text-slate-500">랭킹과 단체 명부에 보이는 이름이에요.</p>
                    <input value={name} onChange={event => setName(event.target.value)} maxLength={30} className="mt-6 w-full rounded-xl border border-slate-200 px-4 py-3 text-base" placeholder="성함" autoFocus />
                    <input inputMode="numeric" value={birthdate} onChange={event => setBirthdate(event.target.value.replace(/\D/g, ''))} maxLength={8} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-base" placeholder="생년월일 8자리 (예: 20150101)" />
                    <PolicyConsent audience="personal" value={policyConsents} onChange={setPolicyConsents} disabled={busy} className="mt-4" />
                    <div className="mt-3"><GuardianConsent birthdate={birthdate} value={guardianConsent} onChange={setGuardianConsent} disabled={busy} /></div>
                    <button type="button" disabled={!name.trim() || !consentReady} onClick={() => setStep(2)} className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-slate-300">다음</button>
                </section>}

                {step === 2 && <div>
                    <div className="mb-4 text-center"><p className="text-xs font-bold text-blue-600">2단계 / 3단계</p><h1 className="mt-2 text-2xl font-black text-slate-900">함께 읽는 단체가 있나요?</h1></div>
                    <CommunityMembershipCard currentUser={{ ...tempUser, name }} setCurrentUser={() => {}} onboarding selectionOnly onJoinComplete={chooseOrganization} onSkip={chooseSolo} skipLabel="🙋 아니요, 혼자 읽어요" />
                    <p className="mt-3 text-center text-xs text-slate-500">혼자 읽기를 선택하면 전국의 「성경 읽는 사람들」 모임과 함께 시작해요.</p>
                </div>}

                {step === 3 && <section className="rounded-3xl bg-white p-6 shadow-sm">
                    <p className="text-xs font-bold text-blue-600">3단계 / 3단계</p>
                    <h1 className="mt-2 text-2xl font-black text-slate-900">읽을 버전을 선택해주세요</h1>
                    {!planType ? <div className="mt-5 space-y-3">{PLAN_TYPES.map(plan => <button type="button" key={plan.id} onClick={() => setPlanType(plan.id)} className="w-full rounded-xl border border-slate-200 p-4 text-left hover:border-blue-400"><p className="font-bold text-slate-800">{plan.title}</p><p className="mt-1 text-xs text-slate-500">{plan.desc}</p></button>)}</div>
                        : <div className="mt-5 space-y-3"><button type="button" onClick={() => setPlanType(null)} className="text-xs font-bold text-slate-500">← 계획 다시 선택</button>{getVisibleBibleVersions(planType, { ...tempUser, name }).map(version => <button type="button" key={version.id} disabled={busy} onClick={() => finish(version.id)} className="w-full rounded-xl border border-slate-200 p-4 text-left hover:border-blue-400 disabled:opacity-50"><p className="font-bold text-slate-800">{version.name}</p><p className="mt-1 text-xs text-slate-500">{version.desc}</p></button>)}</div>}
                    {error && <p role="alert" className="mt-4 text-xs font-bold text-red-600">{error}</p>}
                </section>}
            </div>
        </div>
    );
};

export default SocialOnboardingView;
