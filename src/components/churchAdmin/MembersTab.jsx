import { AdminDataTable } from '../admin';

const MembersTab = ({ ctx }) => {
    const {
        members, filteredMembers, memberDepartmentFilter, setMemberDepartmentFilter,
        memberReadFilter, setMemberReadFilter, orgComms, memberColumns, openMemberDetail,
        bulkCommId, setBulkCommId, bulkSubId, setBulkSubId, setConfirmAction,
        deletedMembers, getMemberMembershipText, restoreMember, downloadCSV,
        getSubId, getSubName,
    } = ctx;

    return (
                            <div className="space-y-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                    <div>
                                        <h2 className="font-black text-slate-800 flex items-center gap-2 text-lg">
                                            👥 교인 관리
                                            <span className="text-sm font-bold text-slate-400">전체 {members.length}명</span>
                                        </h2>
                                        <p className="text-xs text-slate-400 mt-1">행을 누르면 최근 기록과 관리 작업을 한 번에 볼 수 있습니다.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => downloadCSV(filteredMembers)}
                                        className="self-start sm:self-auto rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
                                    >
                                        CSV 내보내기
                                    </button>
                                </div>

                                {members.length === 0 ? (
                                    <div className="text-center py-20 text-slate-300">
                                        <div className="text-4xl mb-2">👥</div>
                                        <p>아직 가입한 교인이 없습니다</p>
                                    </div>
                                ) : (
                                    <div id="admin-tut-member-list" className="space-y-3">
                                        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                                <label className="text-xs font-black text-slate-500">
                                                    부서
                                                    <select
                                                        value={memberDepartmentFilter}
                                                        onChange={e => setMemberDepartmentFilter(e.target.value)}
                                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700"
                                                    >
                                                        <option value="all">전체 부서</option>
                                                        {orgComms.map(comm => <option key={comm.id} value={comm.id}>{comm.name}</option>)}
                                                    </select>
                                                </label>
                                                <label className="text-xs font-black text-slate-500">
                                                    읽기 상태
                                                    <select
                                                        value={memberReadFilter}
                                                        onChange={e => setMemberReadFilter(e.target.value)}
                                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700"
                                                    >
                                                        <option value="all">전체 상태</option>
                                                        <option value="today">오늘 읽음</option>
                                                        <option value="unread">오늘 미독</option>
                                                        <option value="risk7">7일 이상 미독/기록 없음</option>
                                                    </select>
                                                </label>
                                                <div className="rounded-xl bg-slate-50 px-4 py-3">
                                                    <p className="text-xs font-black text-slate-400">현재 표시</p>
                                                    <p className="mt-1 text-xl font-black text-slate-800">{filteredMembers.length}명</p>
                                                </div>
                                            </div>
                                        </div>

                                        <AdminDataTable
                                            columns={memberColumns}
                                            rows={filteredMembers}
                                            getRowId={row => row.uid}
                                            searchPlaceholder="이름, 생년월일, 부서, 소그룹 검색"
                                            selectable
                                            initialSortKey="name"
                                            emptyMessage="조건에 맞는 교인이 없습니다."
                                            onRowClick={openMemberDetail}
                                            renderSelectionActions={({ selectedRows, clearSelection }) => {
                                                const bulkComm = orgComms.find(c => c.id === bulkCommId);
                                                const canChangeSubgroup = Boolean(bulkCommId && bulkSubId);
                                                const hasExternalSelected = selectedRows.some(member => member.isExternalOrgMember);
                                                return (
                                                    <>
                                                        <select
                                                            value={bulkCommId}
                                                            onChange={e => { setBulkCommId(e.target.value); setBulkSubId(''); }}
                                                            className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-indigo-800"
                                                        >
                                                            <option value="">부서 선택</option>
                                                            {orgComms.map(comm => <option key={comm.id} value={comm.id}>{comm.name}</option>)}
                                                        </select>
                                                        <select
                                                            value={bulkSubId}
                                                            onChange={e => setBulkSubId(e.target.value)}
                                                            disabled={!bulkCommId}
                                                            className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-indigo-800 disabled:opacity-50"
                                                        >
                                                            <option value="">소그룹 선택</option>
                                                            {(bulkComm?.subgroups || []).map((sub, index) => {
                                                                const subId = getSubId(sub);
                                                                return <option key={subId || index} value={subId}>{getSubName(sub)}</option>;
                                                            })}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            disabled={!canChangeSubgroup}
                                                            onClick={() => setConfirmAction({
                                                                type: 'bulkSubgroup',
                                                                members: selectedRows,
                                                                commId: bulkCommId,
                                                                subId: bulkSubId,
                                                                title: `${selectedRows.length}명의 주 소속을 변경할까요?`,
                                                                message: '선택한 교인의 주 소속(부서/소그룹)을 한 번에 변경합니다. 추가 소속은 유지되며 새 주 소속과 같은 항목만 정리됩니다.',
                                                                after: clearSelection,
                                                            })}
                                                            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                                                        >
                                                            주 소속 일괄 변경
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={hasExternalSelected}
                                                            onClick={() => setConfirmAction({
                                                                type: 'bulkPassword',
                                                                members: selectedRows,
                                                                title: `${selectedRows.length}명의 비밀번호를 초기화할까요?`,
                                                                message: '각 교인에게 6자리 임시 비밀번호가 새로 발급됩니다. 새 비밀번호는 교인 상세의 "비밀번호 확인"에서 조회할 수 있습니다.',
                                                                danger: true,
                                                                confirmLabel: '초기화',
                                                                after: clearSelection,
                                                            })}
                                                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            비밀번호 초기화
                                                        </button>
                                                        {hasExternalSelected && <span className="text-[10px] font-bold text-violet-700">외부 멤버는 비밀번호 변경 제외</span>}
                                                    </>
                                                );
                                            }}
                                        />
                                    </div>
                                )}
                                {deletedMembers.length > 0 && (
                                    <div className="mt-6 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                            <h3 className="text-sm font-bold text-slate-600">삭제 처리된 교인</h3>
                                            <span className="text-xs text-slate-400">{deletedMembers.length}명</span>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {deletedMembers
                                                .slice()
                                                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'))
                                                .map(member => (
                                                    <div key={member.uid} className="px-4 py-3 flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="font-bold text-sm text-slate-700">{member.name}</div>
                                                            <div className="text-xs text-slate-400">{getMemberMembershipText(member)}</div>
                                                        </div>
                                                        <button onClick={() => restoreMember(member)}
                                                            className="shrink-0 text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100">
                                                            복원
                                                        </button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </div>
    );
};

export default MembersTab;
