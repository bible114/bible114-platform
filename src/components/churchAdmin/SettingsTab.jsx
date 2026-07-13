import GoogleLinkCard from '../admin/GoogleLinkCard';

const SettingsTab = ({
    currentUser, churchInfo,
    printMemberGuide, printAdminManual,
    newChurchCode, setNewChurchCode, saveChurchCode, savingCode,
}) => (
    <div id="admin-tut-settings-section" className="space-y-4 max-w-2xl">
        <GoogleLinkCard accountUid={currentUser?.uid} accountRole={currentUser?.role} />
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="font-bold text-slate-700 mb-1">🖨️ 인쇄물</p>
            <p className="text-xs text-slate-400 mb-3">
                A4 용지에 인쇄해서 사용하세요. 성도용 안내문에는 우리 교회 QR과 가입·로그인 방법이 큰 글씨로 담기고{churchInfo?.churchCode ? ' 입장코드도 함께 인쇄돼요' : ' 입장코드 자리는 빈칸이라 직접 적어주시면 돼요'}. 관리자 매뉴얼은 책상에 두고 보는 용도예요.
            </p>
            <div className="flex flex-wrap gap-2">
                <button onClick={printMemberGuide} className="bg-emerald-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-emerald-700">📱 성도용 가입 안내문 인쇄</button>
                <button onClick={printAdminManual} className="bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-slate-800">📘 관리자 매뉴얼 인쇄</button>
            </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="font-bold text-slate-700 mb-1">교회 입장코드 변경</p>
            <p className="text-xs text-slate-400 mb-3">교인들이 가입할 때 사용하는 코드입니다.</p>
            <div className="flex gap-2">
                <input type="text" value={newChurchCode} onChange={e => setNewChurchCode(e.target.value)}
                    placeholder="새 입장코드 (4자리 이상)" className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" />
                <button onClick={saveChurchCode} disabled={savingCode}
                    className="bg-indigo-600 text-white font-bold px-4 rounded-xl text-sm disabled:opacity-50 hover:bg-indigo-700">
                    {savingCode ? '...' : '변경'}
                </button>
            </div>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs text-slate-400">
            <p className="font-bold text-slate-600 mb-1">교회 정보</p>
            <p>교회명: {churchInfo?.name}</p>
            <p>관리자: {currentUser.name}</p>
        </div>
    </div>
);

export default SettingsTab;
