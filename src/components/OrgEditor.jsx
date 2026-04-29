import React from 'react';

export const DEFAULT_ORG = [
    { id: 'senior', name: '장년부', subgroups: ['1구역', '2구역', '3구역'] },
    { id: 'youth', name: '청년부', subgroups: ['1팀', '2팀'] },
    { id: 'middlehigh', name: '중고등부', subgroups: ['중등부', '고등부'] },
    { id: 'elementary', name: '초등부', subgroups: ['초등1부', '초등2부'] },
    { id: 'kinder', name: '유치부', subgroups: ['유치부'] },
];

const OrgEditor = ({ communities, onChange }) => {
    const addCommunity = () =>
        onChange([...communities, { id: `comm_${Date.now()}`, name: '', subgroups: [''] }]);

    const removeCommunity = (idx) =>
        onChange(communities.filter((_, i) => i !== idx));

    const updateName = (idx, name) =>
        onChange(communities.map((c, i) => i === idx ? { ...c, name } : c));

    const addSubgroup = (idx) =>
        onChange(communities.map((c, i) => i === idx ? { ...c, subgroups: [...c.subgroups, ''] } : c));

    const updateSubgroup = (cIdx, sIdx, val) =>
        onChange(communities.map((c, i) => i === cIdx
            ? { ...c, subgroups: c.subgroups.map((s, j) => j === sIdx ? val : s) }
            : c));

    const removeSubgroup = (cIdx, sIdx) =>
        onChange(communities.map((c, i) => i === cIdx
            ? { ...c, subgroups: c.subgroups.filter((_, j) => j !== sIdx) }
            : c));

    return (
        <div className="space-y-3">
            <button type="button"
                onClick={() => onChange(DEFAULT_ORG.map(c => ({ ...c, subgroups: [...c.subgroups] })))}
                className="w-full text-xs bg-slate-100 text-slate-600 py-2 rounded-lg font-bold hover:bg-slate-200 transition-colors">
                기본 조직 불러오기 (장년부 / 청년부 / 중고등부 / 초등부 / 유치부)
            </button>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {communities.map((comm, cIdx) => (
                    <div key={comm.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                        <div className="flex gap-2 mb-2 items-center">
                            <span className="text-base shrink-0">🏛️</span>
                            <input
                                type="text"
                                value={comm.name}
                                onChange={e => updateName(cIdx, e.target.value)}
                                placeholder="부서명 (예: 장년부)"
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <button
                                type="button"
                                onClick={() => removeCommunity(cIdx)}
                                className="text-slate-300 hover:text-red-400 font-bold text-lg leading-none shrink-0 px-1 transition-colors">
                                ✕
                            </button>
                        </div>
                        <div className="space-y-1.5 ml-6">
                            {comm.subgroups.map((sub, sIdx) => (
                                <div key={sIdx} className="flex gap-1 items-center">
                                    <span className="text-slate-300 text-xs shrink-0">└</span>
                                    <input
                                        type="text"
                                        value={sub}
                                        onChange={e => updateSubgroup(cIdx, sIdx, e.target.value)}
                                        placeholder={`소그룹 ${sIdx + 1}`}
                                        className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    />
                                    {comm.subgroups.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeSubgroup(cIdx, sIdx)}
                                            className="text-slate-300 hover:text-red-400 text-xs px-1 transition-colors">
                                            ✕
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => addSubgroup(cIdx)}
                                className="text-xs text-indigo-400 hover:text-indigo-600 font-bold mt-1 transition-colors">
                                + 소그룹 추가
                            </button>
                        </div>
                    </div>
                ))}
                {communities.length === 0 && (
                    <p className="text-center text-slate-300 text-sm py-4">
                        아직 부서가 없습니다. 아래 버튼으로 추가해주세요.
                    </p>
                )}
            </div>

            <button
                type="button"
                onClick={addCommunity}
                className="w-full text-xs bg-indigo-50 text-indigo-600 py-2.5 rounded-xl font-bold hover:bg-indigo-100 border border-indigo-100 transition-colors">
                + 부서 추가
            </button>
        </div>
    );
};

export default OrgEditor;
