const AnnouncementTab = ({
    announcement, setAnnouncement, saveAnnouncement, saving,
    kakaoLink, setKakaoLink, saveKakaoLink, savingKakao,
}) => (
    <div id="admin-tut-announcement-section" className="space-y-4 max-w-2xl">
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input type="checkbox" checked={announcement.enabled}
                    onChange={e => setAnnouncement(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                <span className="font-bold text-slate-700">공지 표시 활성화</span>
            </label>
            <textarea value={announcement.text}
                onChange={e => setAnnouncement(prev => ({ ...prev, text: e.target.value }))}
                placeholder="공지사항 내용을 입력하세요..." rows={4}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <div className="mt-3">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-slate-400 font-bold">링크 (선택)</p>
                    <button type="button"
                        onClick={() => setAnnouncement(prev => ({ ...prev, links: [...(prev.links || []), { url: '', text: '' }] }))}
                        className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg font-bold hover:bg-blue-100">+ 링크 추가</button>
                </div>
                {(announcement.links || []).map((link, i) => (
                    <div key={i} className="flex gap-2 mb-2 items-center">
                        <input type="text" value={link.text} onChange={e => {
                            const links = [...(announcement.links || [])];
                            links[i] = { ...links[i], text: e.target.value };
                            setAnnouncement(prev => ({ ...prev, links }));
                        }} placeholder="버튼 글자" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                        <input type="url" value={link.url} onChange={e => {
                            const links = [...(announcement.links || [])];
                            links[i] = { ...links[i], url: e.target.value };
                            setAnnouncement(prev => ({ ...prev, links }));
                        }} placeholder="https://..." className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                        <button type="button" onClick={() => setAnnouncement(prev => ({ ...prev, links: prev.links.filter((_, j) => j !== i) }))}
                            className="text-slate-300 hover:text-red-400 font-bold text-lg shrink-0">✕</button>
                    </div>
                ))}
                {(announcement.links || []).length === 0 && <p className="text-xs text-slate-300 text-center py-2">링크 버튼이 없습니다.</p>}
            </div>
            <button onClick={saveAnnouncement} disabled={saving}
                className="w-full mt-3 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:bg-blue-700">
                {saving ? '저장 중...' : '공지 저장'}
            </button>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="font-bold text-slate-700 mb-1 flex items-center gap-2">💬 카카오톡 채널</p>
            <p className="text-xs text-slate-400 mb-3">카카오톡 채널 관리자 센터에서 채팅 URL을 복사해 붙여넣으세요.<br />설정하면 대시보드에 카카오톡 채널 버튼이 표시됩니다.</p>
            <input type="url" value={kakaoLink} onChange={e => setKakaoLink(e.target.value)}
                placeholder="https://pf.kakao.com/_xxxx/chat"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
            <button onClick={saveKakaoLink} disabled={savingKakao}
                className="w-full mt-3 bg-[#FEE500] text-[#3c1e1e] font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:bg-[#FDD835]">
                {savingKakao ? '저장 중...' : '💬 카카오 링크 저장'}
            </button>
        </div>
    </div>
);

export default AnnouncementTab;
