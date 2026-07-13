import OrgEditor from '../OrgEditor';

const getSubName = (subgroup) => (typeof subgroup === 'string' ? subgroup : subgroup?.name || '');

const OrganizationTab = ({ orgComms, setOrgComms, saveOrg, savingOrg }) => (
    <div id="admin-tut-org-section" className="space-y-4 max-w-2xl">
        <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
            <p className="text-sm font-bold text-indigo-700 mb-1">📋 교회 조직 관리</p>
            <p className="text-xs text-slate-500">부서와 소그룹을 자유롭게 구성할 수 있습니다.</p>
            <p className="text-xs text-indigo-500 mt-1">💡 조직은 관리자 메뉴에서도 변경이 가능합니다.</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <OrgEditor departments={orgComms} onChange={setOrgComms} />
            <div className="mt-4 pt-4 border-t border-slate-100">
                <button onClick={saveOrg} disabled={savingOrg}
                    className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                    {savingOrg ? '저장 중...' : '✅ 조직 저장하기'}
                </button>
                {orgComms.length > 0 && (
                    <p className="text-[10px] text-slate-400 text-center mt-2">
                        ⚠️ 부서/소그룹명 변경 시 기존 교인의 배정 표기에 영향이 있을 수 있습니다.
                    </p>
                )}
            </div>
        </div>
        {orgComms.filter(c => String(c?.name || '').trim()).length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <p className="text-xs font-bold text-slate-500 mb-3">현재 조직 미리보기</p>
                <div className="space-y-2">
                    {orgComms.filter(c => String(c?.name || '').trim()).map(comm => (
                        <div key={comm.id} className="flex items-start gap-2">
                            <span className="text-sm shrink-0">🏛️</span>
                            <div>
                                <span className="font-bold text-slate-700 text-sm">{comm.name}</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {(comm.subgroups || []).filter(s => getSubName(s).trim()).map((sub, i) => (
                                        <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{getSubName(sub)}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>
);

export default OrganizationTab;
