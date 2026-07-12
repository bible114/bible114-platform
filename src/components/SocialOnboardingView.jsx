import React, { useState } from 'react';
import { PLAN_TYPES, BIBLE_VERSIONS } from '../data/bible_options';
import { UNAFFILIATED_CHURCH_ID, UNAFFILIATED_CHURCH_NAME } from '../data/constants';
import { CommunityMembershipCard } from './dashboard';

const SocialOnboardingView = ({ tempUser, onComplete }) => {
    const [step, setStep] = useState(1);
    const [name, setName] = useState(tempUser?.name || '');
    const [organization, setOrganization] = useState(null);
    const [planType, setPlanType] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

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
            await onComplete({ name: name.trim(), organization, planId: `${planType}_${versionId}` });
        } catch (err) {
            console.error('소셜 온보딩 완료 실패:', err);
            setError(err?.message || '시작 설정을 저장하지 못했습니다. 다시 시도해주세요.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 px-5 py-10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}>
            <div className="mx-auto w-full max-w-lg">
                <div className="mb-6 flex items-center justify-center gap-2" aria-label={`${step}단계 / 3단계`}>
                    {[1, 2, 3].map(number => <span key={number} className={`h-2 rounded-full transition-all ${number === step ? 'w-10 bg-blue-600' : number < step ? 'w-5 bg-blue-300' : 'w-5 bg-slate-200'}`} />)}
                </div>

                {step === 1 && <section className="rounded-3xl bg-white p-6 shadow-sm">
                    <p className="text-xs font-bold text-blue-600">1단계 / 3단계</p>
                    <h1 className="mt-2 text-2xl font-black text-slate-900">성함이 어떻게 되세요?</h1>
                    <p className="mt-2 text-sm text-slate-500">랭킹과 단체 명부에 보이는 이름이에요.</p>
                    <input value={name} onChange={event => setName(event.target.value)} maxLength={30} className="mt-6 w-full rounded-xl border border-slate-200 px-4 py-3 text-base" placeholder="성함" autoFocus />
                    <button type="button" disabled={!name.trim()} onClick={() => setStep(2)} className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-slate-300">다음</button>
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
                        : <div className="mt-5 space-y-3"><button type="button" onClick={() => setPlanType(null)} className="text-xs font-bold text-slate-500">← 계획 다시 선택</button>{(BIBLE_VERSIONS[planType] || []).map(version => <button type="button" key={version.id} disabled={busy} onClick={() => finish(version.id)} className="w-full rounded-xl border border-slate-200 p-4 text-left hover:border-blue-400 disabled:opacity-50"><p className="font-bold text-slate-800">{version.name}</p><p className="mt-1 text-xs text-slate-500">{version.desc}</p></button>)}</div>}
                    {error && <p role="alert" className="mt-4 text-xs font-bold text-red-600">{error}</p>}
                </section>}
            </div>
        </div>
    );
};

export default SocialOnboardingView;
