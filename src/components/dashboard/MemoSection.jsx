import React, { useState } from 'react';
import { parseMemoKey } from '../../hooks/useMemos';

const MemoSection = ({
    currentMemo,
    setCurrentMemo,
    setShowMemoList,
    saveMemo,
    viewingDay,
    currentDay,
    readCount,
    memos,
    memoLoadError,
    memoMigrating = false,
}) => {
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const round = readCount || 1;
    const dayIdx = (viewingDay || currentDay || 1) - 1;
    const existingMemos = Object.entries(memos || {})
        .map(([key, memo]) => {
            const parsed = parseMemoKey(key);
            return {
                ...memo,
                round: Number.isSafeInteger(memo?.round) ? memo.round : parsed.round,
                day: Number.isSafeInteger(memo?.day) ? memo.day : parsed.day,
            };
        })
        .filter(memo => memo.round === round && memo.day === dayIdx)
        .sort((left, right) => new Date(left.date || 0) - new Date(right.date || 0));

    const handleSave = async () => {
        if (saving || !currentMemo.trim()) return;

        setSaving(true);
        setSaveError('');

        try {
            await saveMemo(round, dayIdx, currentMemo);
            setCurrentMemo('');
        } catch (error) {
            console.error('묵상 저장 실패:', error);
            setSaveError(error?.message || '묵상을 저장하지 못했습니다. 입력한 내용은 그대로 보관했어요. 잠시 후 다시 시도해 주세요.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div id="tut-memo-section" className="mt-4 bg-[#fdf4ff] p-5 rounded-3xl border border-purple-100 shadow-sm">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-purple-700 flex items-center gap-2">✍️ 오늘의 묵상</h3>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMemoList(true);
                    }}
                    className="min-h-11 rounded-xl px-3 py-2 text-sm font-bold text-purple-600 underline hover:bg-white hover:text-purple-800"
                >
                    내 기록 보기
                </button>
            </div>
            {memoMigrating && (
                <p className="mb-3 rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700" aria-live="polite">
                    기존 묵상을 장기 보관 방식으로 안전하게 옮기고 있어요. 완료될 때까지 입력 내용은 그대로 유지됩니다.
                </p>
            )}
            <textarea
                value={currentMemo}
                onChange={(e) => {
                    setCurrentMemo(e.target.value);
                    if (saveError) setSaveError('');
                }}
                disabled={saving}
                aria-describedby={saveError ? 'memo-save-error' : undefined}
                placeholder={`오늘 말씀에서 느낀 점을 적어보세요...\n\n• 마음에 와닿은 구절\n• 삶에 적용할 점\n• 기도 제목`}
                className="w-full p-4 text-sm border border-purple-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white shadow-inner disabled:opacity-70 disabled:cursor-wait"
                rows={8}
            />
            <button
                onClick={handleSave}
                disabled={saving || !currentMemo.trim()}
                aria-busy={saving}
                className="w-full mt-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-indigo-600 transition-all shadow-md active:scale-[0.98]"
            >
                {saving ? '⏳ 묵상 저장 중...' : '💾 묵상 저장하기'}
            </button>
            {saveError && (
                <p id="memo-save-error" role="alert" className="mt-3 text-sm font-semibold text-red-600" aria-live="assertive">
                    {saveError}
                </p>
            )}
            {memoLoadError && (
                <p role="alert" className="mt-3 text-sm font-semibold text-amber-700" aria-live="polite">
                    이전 묵상을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.
                </p>
            )}
            {existingMemos.length > 0 && (
                <div className="mt-4 p-4 bg-white rounded-2xl border border-purple-100 max-h-40 overflow-y-auto shadow-sm">
                    <p className="text-[10px] text-purple-500 mb-2 font-bold flex items-center gap-1">
                        ✨ 이전에 저장한 묵상:
                    </p>
                    {existingMemos.flatMap(memo => memo.texts || [memo.text]).filter(Boolean).map((text, idx, texts) => (
                        <div key={`${idx}-${text.slice(0, 12)}`} className={`text-sm text-slate-600 whitespace-pre-wrap leading-relaxed ${idx > 0 ? 'mt-3 pt-3 border-t border-purple-50' : ''}`}>
                            {texts.length > 1 && <span className="text-[10px] text-purple-400 font-bold">#{idx + 1} </span>}
                            {text}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MemoSection;
