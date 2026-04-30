import React from 'react';
import { memoKey } from '../../hooks/useMemos';

const MemoSection = ({
    currentMemo,
    setCurrentMemo,
    setShowMemoList,
    saveMemo,
    viewingDay,
    currentDay,
    readCount,
    memos
}) => {
    const round = readCount || 1;
    const dayIdx = (viewingDay || currentDay || 1) - 1;
    const key = memoKey(round, dayIdx);

    // 하위 호환: 신형 키 없으면 구형 숫자 키 fallback
    const existingMemo = memos[key] || memos[dayIdx];

    return (
        <div className="mt-4 bg-[#fdf4ff] p-5 rounded-3xl border border-purple-100 shadow-sm">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-purple-700 flex items-center gap-2">✍️ 오늘의 묵상</h3>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMemoList(true);
                    }}
                    className="text-xs text-purple-500 underline hover:text-purple-700"
                >
                    내 기록 보기
                </button>
            </div>
            <textarea
                value={currentMemo}
                onChange={(e) => setCurrentMemo(e.target.value)}
                placeholder={`오늘 말씀에서 느낀 점을 적어보세요...\n\n• 마음에 와닿은 구절\n• 삶에 적용할 점\n• 기도 제목`}
                className="w-full p-4 text-sm border border-purple-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white shadow-inner"
                rows={8}
            />
            <button
                onClick={() => saveMemo(round, dayIdx, currentMemo, () => setCurrentMemo(''))}
                disabled={!currentMemo.trim()}
                className="w-full mt-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-indigo-600 transition-all shadow-md active:scale-[0.98]"
            >
                💾 묵상 저장하기
            </button>
            {existingMemo && (
                <div className="mt-4 p-4 bg-white rounded-2xl border border-purple-100 max-h-40 overflow-y-auto shadow-sm">
                    <p className="text-[10px] text-purple-500 mb-2 font-bold flex items-center gap-1">
                        ✨ 이전에 저장한 묵상:
                    </p>
                    {(() => {
                        const texts = existingMemo.texts || [existingMemo.text];
                        return texts.map((text, idx) => (
                            <div key={idx} className={`text-sm text-slate-600 whitespace-pre-wrap leading-relaxed ${idx > 0 ? 'mt-3 pt-3 border-t border-purple-50' : ''}`}>
                                {texts.length > 1 && <span className="text-[10px] text-purple-400 font-bold">#{idx + 1} </span>}
                                {text}
                            </div>
                        ));
                    })()}
                </div>
            )}
        </div>
    );
};

export default MemoSection;
