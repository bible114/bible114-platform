import { DonutStat, ProgressBar, StatCard } from '../admin';

const DashboardTab = ({
    dashboardStats, deletedMembers, completedReaders, setShowCompletedReaders,
    departmentCards, streakTop, getMemberMembershipText,
    renderRiskList, atRisk, daysSinceRead, getTotalProgressDay, formatReadDate,
}) => (
    <div id="admin-tut-dashboard" className="space-y-6">
        <div>
            <h2 className="font-black text-slate-800 text-lg">목양 대시보드</h2>
            <p className="text-xs text-slate-400 mt-1">오늘 읽기 비교는 현재 권한에서 접근 가능한 회원 문서 기준입니다. history 시간값은 앞으로 쌓이는 기록부터 적용됩니다.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="전체 교인" value={`${dashboardStats.total}명`} subvalue={`${deletedMembers.length}명 삭제 보관`} icon="👥" accent />
            <StatCard label="오늘 진도" value={`${dashboardStats.readToday}명`}
                subvalue={`어제 최종 ${dashboardStats.readYesterday}명 · ${dashboardStats.readDelta >= 0 ? '+' : ''}${dashboardStats.readDelta}명`} icon="📖" />
            <StatCard label="최근 7일 읽기율" value={`${dashboardStats.recent7Rate}%`} subvalue="최근 7일 내 1회 이상 읽음" icon="🗓️" />
            <StatCard label="평균 진행 DAY" value={dashboardStats.avgDay || '-'} subvalue="올해 독수 포함 총 진행일 기준" icon="🏁" />
            <div role="button" tabIndex={0} aria-label={`완독자 ${completedReaders.length}명 명단 보기`}
                onClick={() => setShowCompletedReaders(true)}
                onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setShowCompletedReaders(true);
                    }
                }}
                className="rounded-2xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
                <StatCard label="올해 완독자" value={`${completedReaders.length}명`} subvalue="눌러서 올해 완독 명단 보기"
                    icon="🏆" className="h-full transition-transform hover:-translate-y-0.5" />
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-black text-slate-800">부서별 현황</h3>
                    <span className="text-xs font-bold text-slate-400">{departmentCards.length}개 부서</span>
                </div>
                {departmentCards.length === 0 ? <p className="py-10 text-center text-xs font-bold text-slate-300">부서 데이터가 없습니다.</p> : (
                    <div className="space-y-4">
                        {departmentCards.map(dept => (
                            <div key={dept.departmentId || dept.departmentName} className="rounded-2xl border border-slate-100 p-4">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div>
                                        <p className="font-black text-slate-800">{dept.departmentName}</p>
                                        <p className="text-xs text-slate-400">{dept.readCount}/{dept.totalCount}명 읽음 · 평균 DAY {dept.avgDay || '-'}</p>
                                    </div>
                                    <DonutStat value={dept.rate} size={58} stroke={7} center={`${dept.rate}%`} />
                                </div>
                                <ProgressBar value={dept.rate} label="오늘 읽기율" tone="indigo" />
                                {dept.subgroups.length > 0 && (
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {dept.subgroups.map(sub => (
                                            <div key={`${sub.departmentId}_${sub.subgroupId}`} className="rounded-xl bg-slate-50 px-3 py-2">
                                                <div className="flex justify-between gap-2">
                                                    <span className="text-xs font-bold text-slate-600 truncate">{sub.subgroupName}</span>
                                                    <span className="text-xs font-black text-slate-500">{sub.rate}%</span>
                                                </div>
                                                <ProgressBar value={sub.rate} showValue={false} className="mt-1.5" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-sm font-black text-slate-800 mb-4">이번 주 스트릭 리더 Top 5</h3>
                {streakTop.length === 0 ? <p className="py-10 text-center text-xs font-bold text-slate-300">아직 스트릭 기록이 없습니다.</p> : (
                    <div className="space-y-2">
                        {streakTop.map((member, index) => (
                            <div key={member.uid} className="flex items-center justify-between gap-3 rounded-xl bg-orange-50 px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-slate-800 truncate">{index + 1}. {member.name}</p>
                                    <p className="text-xs text-slate-400 truncate">{getMemberMembershipText(member)}</p>
                                </div>
                                <span className="shrink-0 text-sm font-black text-orange-600">{member.streak}일</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {renderRiskList('7일 이상 미독', atRisk.noRead7Days, '7일 이상 미독 교인이 없습니다.', member => {
                const days = daysSinceRead(member.lastReadDate);
                return days === null ? '기록 없음' : `${days}일`;
            })}
            {renderRiskList('진행 하위 10%', atRisk.bottomProgress, '진행 하위 대상이 없습니다.', member => `DAY ${getTotalProgressDay(member)}`)}
            {renderRiskList('최근 7일 신규 가입', atRisk.recentNewMembers, '최근 신규 가입자가 없습니다.',
                member => formatReadDate(member.createdAt?.toDate ? member.createdAt.toDate().toDateString() : member.createdAt))}
        </div>
    </div>
);

export default DashboardTab;
