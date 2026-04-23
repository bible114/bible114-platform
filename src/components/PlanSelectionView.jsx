import React from 'react';
import Icon from './Icon';
import { PLAN_TYPES, BIBLE_VERSIONS } from '../data/bible_options';
import { MOCK_COMMUNITIES } from '../data/communities';

const PlanSelectionView = ({
    view,
    currentUser,
    tempUser,
    setView,
    selectedPlanType,
    handlePlanTypeSelect,
    handleVersionSelect,
    handleCommunitySelect,
    handleSubgroupSelect
}) => {
    if (view === 'plan_type_select') {
        return (
            <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
                <div className="w-full max-w-2xl mb-6">
                    {currentUser && !tempUser && (
                        <button onClick={() => setView('dashboard')} className="text-sm text-slate-400 flex items-center hover:text-slate-600 mb-4"><Icon name="back" size={16} className="mr-1" /> 대시보드로 돌아가기</button>
                    )}
                    <h2 className="text-xl font-bold text-slate-800 text-center">{currentUser && !tempUser ? "읽는 버전 바꾸기" : `환영합니다, ${(tempUser && tempUser.name) || ''}님!`}</h2>
                    <p className="text-slate-500 text-sm text-center mt-1">어떤 계획으로 읽으시겠습니까?</p>
                </div>
                <div className="w-full max-w-2xl space-y-3">
                    {PLAN_TYPES.map(type => (
                        <button key={type.id} onClick={() => handlePlanTypeSelect(type.id)} className="w-full bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 hover:bg-blue-50 transition-all text-left">
                            <div className="font-bold text-slate-800 text-lg mb-1">{type.title}</div>
                            <div className="text-xs text-slate-400">{type.desc}</div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (view === 'bible_version_select') {
        const versions = BIBLE_VERSIONS[selectedPlanType];
        const planTypeData = PLAN_TYPES.find(t => t.id === selectedPlanType);
        const planTitle = planTypeData ? planTypeData.title : null;
        return (
            <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
                <div className="w-full max-w-2xl">
                    <button onClick={() => setView('plan_type_select')} className="text-sm text-slate-400 flex items-center hover:text-slate-600 mb-4"><Icon name="back" size={16} className="mr-1" /> 뒤로가기</button>
                    <div className="text-center mb-6">
                        <h2 className="text-xl font-bold text-slate-800">{planTitle} 버전 선택</h2>
                        <div className="bg-yellow-50 text-yellow-800 text-xs font-bold p-2 rounded-lg mt-2 break-keep">📢 오늘 설정하시면 기본적으로 1년간 이 버전으로 읽게 됩니다.</div>
                    </div>
                </div>
                <div className="w-full max-w-2xl space-y-3">
                    {versions.map(ver => (
                        <button key={ver.id} onClick={() => handleVersionSelect(ver.id)} className="w-full bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 hover:bg-blue-50 transition-all text-left">
                            <div className="font-bold text-slate-800 text-lg mb-1">{ver.name}</div>
                            <div className="text-xs text-slate-400">{ver.desc}</div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (view === 'community_select') {
        return (
            <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800">소속 공동체 선택</h2>
                    <p className="text-slate-500 text-sm">어느 부서에 소속되어 계신가요?</p>
                </div>
                <div className="w-full max-w-2xl space-y-3">
                    {MOCK_COMMUNITIES.map(comm => (
                        <button key={comm.id} onClick={() => handleCommunitySelect(comm.id, comm.name)} className="w-full bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center gap-4 text-left">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl`}>{comm.icon}</div>
                            <div className="flex-1"><div className="font-bold text-slate-800 text-lg">{comm.name}</div></div>
                            <Icon name="arrowRight" className="text-slate-300" />
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (view === 'subgroup_select') {
        const selectedComm = MOCK_COMMUNITIES.find(c => c.id === (tempUser ? tempUser.communityId : null));
        return (
            <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
                <div className="w-full max-w-2xl mb-4">
                    <button onClick={() => setView('community_select')} className="text-sm text-slate-400 flex items-center hover:text-slate-600"><Icon name="back" size={16} className="mr-1" /> 뒤로가기</button>
                </div>
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800">소그룹 선택</h2>
                    <p className="text-slate-500 text-sm">{(tempUser ? tempUser.communityName : '')} 내의 소그룹을 선택해주세요.</p>
                </div>
                <div className="w-full max-w-2xl grid grid-cols-2 gap-3 h-[50vh] overflow-y-auto content-start">
                    {selectedComm && selectedComm.subgroups.map((sub, idx) => (
                        <button key={idx} onClick={() => handleSubgroupSelect(sub)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-center flex flex-col items-center justify-center aspect-video">
                            <span className="text-2xl mb-2 opacity-80">🏕️</span>
                            <span className="font-bold text-slate-700 text-sm">{sub}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return null;
};

export default PlanSelectionView;
