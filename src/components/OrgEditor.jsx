import React, { useState } from 'react';

const genSubId = () => 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const MAX_BULK_SUBGROUPS = 50;

export const buildNumberedSubgroupNames = ({ prefix = '', start, end, suffix = '' }) => {
    const startNumber = Number(start);
    const endNumber = Number(end);
    if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber) || startNumber < 1 || endNumber < startNumber) {
        return { names: [], error: '시작·끝 번호를 올바르게 입력해주세요.' };
    }
    if (endNumber - startNumber + 1 > MAX_BULK_SUBGROUPS) {
        return { names: [], error: `한 번에 최대 ${MAX_BULK_SUBGROUPS}개까지 만들 수 있어요.` };
    }
    const trimmedPrefix = prefix.trim();
    const trimmedSuffix = suffix.trim();
    if (!trimmedPrefix && !trimmedSuffix) {
        return { names: [], error: '이름 앞말이나 뒷말을 하나 이상 입력해주세요.' };
    }
    return {
        names: Array.from(
            { length: endNumber - startNumber + 1 },
            (_, index) => `${trimmedPrefix}${startNumber + index}${trimmedSuffix}`,
        ),
        error: '',
    };
};

export const DEFAULT_ORG = [
    { id: 'senior', name: '장년부', subgroups: [{ id: genSubId(), name: '1구역' }, { id: genSubId(), name: '2구역' }, { id: genSubId(), name: '3구역' }] },
    { id: 'youth', name: '청년부', subgroups: [{ id: genSubId(), name: '1팀' }, { id: genSubId(), name: '2팀' }] },
    { id: 'middlehigh', name: '중고등부', subgroups: [{ id: genSubId(), name: '중등부' }, { id: genSubId(), name: '고등부' }] },
    { id: 'elementary', name: '초등부', subgroups: [{ id: genSubId(), name: '초등1부' }, { id: genSubId(), name: '초등2부' }] },
    { id: 'kinder', name: '유치부', subgroups: [{ id: genSubId(), name: '유치부' }] },
];

const OrgEditor = ({ departments, onChange }) => {
    const [bulkDepartmentId, setBulkDepartmentId] = useState(null);
    const [bulkDraft, setBulkDraft] = useState({ prefix: '', start: '1', end: '10', suffix: '구역' });
    const [bulkMessage, setBulkMessage] = useState('');

    const addCommunity = () =>
        onChange([...departments, { id: `comm_${Date.now()}`, name: '', subgroups: [] }]);

    const removeCommunity = (idx) =>
        onChange(departments.filter((_, i) => i !== idx));

    const updateName = (idx, name) =>
        onChange(departments.map((c, i) => i === idx ? { ...c, name } : c));

    const addSubgroup = (idx) =>
        onChange(departments.map((c, i) => i === idx ? { ...c, subgroups: [...c.subgroups, { id: genSubId(), name: '' }] } : c));

    const addNumberedSubgroups = (idx) => {
        const result = buildNumberedSubgroupNames(bulkDraft);
        if (result.error) {
            setBulkMessage(result.error);
            return;
        }
        const existingNames = new Set(departments[idx].subgroups.map(subgroup => getSubName(subgroup).trim()).filter(Boolean));
        const newNames = result.names.filter(name => !existingNames.has(name));
        if (newNames.length === 0) {
            setBulkMessage('같은 이름의 소그룹이 이미 모두 있어요.');
            return;
        }
        onChange(departments.map((community, communityIndex) => communityIndex === idx
            ? {
                ...community,
                subgroups: [
                    ...community.subgroups.filter(subgroup => getSubName(subgroup).trim()),
                    ...newNames.map(name => ({ id: genSubId(), name })),
                ],
            }
            : community));
        const skippedCount = result.names.length - newNames.length;
        setBulkMessage(`${newNames.length}개를 추가했어요.${skippedCount ? ` 중복 ${skippedCount}개는 제외했어요.` : ''}`);
    };

    // Support both legacy string subgroups and new { id, name } objects
    const getSubName = (s) => (typeof s === 'string' ? s : s.name);

    const updateSubgroup = (cIdx, sIdx, val) =>
        onChange(departments.map((c, i) => i === cIdx
            ? { ...c, subgroups: c.subgroups.map((s, j) => j === sIdx ? (typeof s === 'string' ? val : { ...s, name: val }) : s) }
            : c));

    const removeSubgroup = (cIdx, sIdx) =>
        onChange(departments.map((c, i) => i === cIdx
            ? { ...c, subgroups: c.subgroups.filter((_, j) => j !== sIdx) }
            : c));

    const useDepartmentWithoutSubgroups = (cIdx) => {
        onChange(departments.map((community, index) => index === cIdx
            ? { ...community, subgroups: [] }
            : community));
        setBulkDepartmentId(null);
        setBulkMessage('');
    };

    return (
        <div className="space-y-3">
            <button type="button"
                onClick={() => onChange(DEFAULT_ORG.map(c => ({ ...c, subgroups: [...c.subgroups] })))}
                className="w-full text-xs bg-slate-100 text-slate-600 py-2 rounded-lg font-bold hover:bg-slate-200 transition-colors">
                기본 조직 불러오기 (장년부 / 청년부 / 중고등부 / 초등부 / 유치부)
            </button>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {departments.map((comm, cIdx) => (
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
                            {comm.subgroups.length === 0 && (
                                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-5 text-emerald-800">
                                    소그룹 없이 {comm.name.trim() || '이 부서'} 전체를 하나의 그룹으로 운영합니다.
                                </div>
                            )}
                            {comm.subgroups.map((sub, sIdx) => (
                                <div key={typeof sub === 'string' ? sIdx : sub.id} className="flex gap-1 items-center">
                                    <span className="text-slate-300 text-xs shrink-0">└</span>
                                    <input
                                        type="text"
                                        value={getSubName(sub)}
                                        onChange={e => updateSubgroup(cIdx, sIdx, e.target.value)}
                                        placeholder={`소그룹 ${sIdx + 1}`}
                                        className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeSubgroup(cIdx, sIdx)}
                                        aria-label={`${getSubName(sub).trim() || `소그룹 ${sIdx + 1}`} 삭제`}
                                        className="text-slate-300 hover:text-red-400 text-xs px-1 transition-colors">
                                        ✕
                                    </button>
                                </div>
                            ))}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => addSubgroup(cIdx)}
                                    className="text-xs text-indigo-500 hover:text-indigo-700 font-bold transition-colors">
                                    {comm.subgroups.length === 0 ? '+ 소그룹 만들기' : '+ 소그룹 추가'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBulkDepartmentId(bulkDepartmentId === comm.id ? null : comm.id);
                                        setBulkMessage('');
                                    }}
                                    className="text-xs font-bold text-indigo-500 transition-colors hover:text-indigo-700"
                                >
                                    {bulkDepartmentId === comm.id ? '여러 개 추가 닫기' : '+ 여러 소그룹 한 번에'}
                                </button>
                                {comm.subgroups.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => useDepartmentWithoutSubgroups(cIdx)}
                                        className="text-xs font-bold text-slate-400 transition-colors hover:text-emerald-700"
                                    >
                                        소그룹 없이 운영
                                    </button>
                                )}
                            </div>
                            {bulkDepartmentId === comm.id && (
                                <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                                    <p className="mb-2 text-[11px] font-bold text-slate-600">예: 1~10 + 구역 → 1구역부터 10구역</p>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_72px_72px_1fr]">
                                        <label className="text-[10px] font-bold text-slate-500">
                                            이름 앞말
                                            <input
                                                type="text"
                                                value={bulkDraft.prefix}
                                                onChange={event => { setBulkDraft(draft => ({ ...draft, prefix: event.target.value })); setBulkMessage(''); }}
                                                placeholder="선택"
                                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                            />
                                        </label>
                                        <label className="text-[10px] font-bold text-slate-500">
                                            시작 번호
                                            <input
                                                type="number"
                                                min="1"
                                                inputMode="numeric"
                                                value={bulkDraft.start}
                                                onChange={event => { setBulkDraft(draft => ({ ...draft, start: event.target.value })); setBulkMessage(''); }}
                                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                            />
                                        </label>
                                        <label className="text-[10px] font-bold text-slate-500">
                                            끝 번호
                                            <input
                                                type="number"
                                                min="1"
                                                inputMode="numeric"
                                                value={bulkDraft.end}
                                                onChange={event => { setBulkDraft(draft => ({ ...draft, end: event.target.value })); setBulkMessage(''); }}
                                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                            />
                                        </label>
                                        <label className="text-[10px] font-bold text-slate-500">
                                            이름 뒷말
                                            <input
                                                type="text"
                                                value={bulkDraft.suffix}
                                                onChange={event => { setBulkDraft(draft => ({ ...draft, suffix: event.target.value })); setBulkMessage(''); }}
                                                placeholder="예: 구역"
                                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                            />
                                        </label>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => addNumberedSubgroups(cIdx)}
                                        className="mt-2 min-h-10 w-full rounded-lg bg-indigo-600 px-3 text-xs font-black text-white active:scale-[0.99]"
                                    >
                                        한 번에 추가
                                    </button>
                                    {bulkMessage && (
                                        <p role="status" className={`mt-2 text-center text-[11px] font-bold ${bulkMessage.includes('추가했어요') ? 'text-emerald-700' : 'text-red-600'}`}>
                                            {bulkMessage}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {departments.length === 0 && (
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
