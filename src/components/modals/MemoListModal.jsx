import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import { parseMemoKey } from '../../hooks/useMemos';
import { SCHEDULE_DATA } from '../../data/schedules';

const VIEW_TABS = [
    { id: 'recent', label: '최근 기록', icon: '📖' },
    { id: 'calendar', label: '달력', icon: '🗓️' },
    { id: 'bible', label: '성경별', icon: '🔖' },
];

const toValidDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
};

const toDateKey = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDate = (date) => date?.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
}) || '날짜 기록 없음';

const getBookLabel = (range, title) => {
    const source = String(range || title || '').trim();
    const match = source.match(/(?:^|[·/\s])([가-힣]{1,5})\s*\d/);
    return match?.[1] || '기타';
};

const buildCalendarDays = (cursor) => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    return [
        ...Array.from({ length: firstWeekday }, () => null),
        ...Array.from({ length: lastDate }, (_, index) => new Date(year, month, index + 1)),
    ];
};

const DiaryCard = ({ entry }) => (
    <article className="relative overflow-hidden rounded-[1.7rem] border border-amber-100 bg-[#fffdf8] px-5 pb-5 pt-4 shadow-[0_10px_30px_rgba(120,93,55,0.08)]">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-300 via-rose-200 to-violet-300" />
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-dashed border-amber-200 pb-3">
            <div className="min-w-0">
                <p className="text-xs font-bold text-amber-700">{formatDate(entry.date)}</p>
                <h4 className="mt-1 truncate text-base font-black text-slate-800">
                    {entry.range || entry.title || `DAY ${entry.day + 1}`}
                </h4>
            </div>
            <span className="shrink-0 rounded-full bg-violet-100 px-3 py-1 text-[11px] font-black text-violet-700">
                {entry.round > 1 ? `${entry.round}독 · ` : ''}DAY {entry.day + 1}
            </span>
        </div>
        {entry.title && entry.title !== entry.range && (
            <p className="mb-3 text-xs font-semibold leading-relaxed text-slate-500">{entry.title}</p>
        )}
        <div className="space-y-3">
            {entry.texts.map((text, index) => (
                <div key={`${entry.key}-${index}`} className={index > 0 ? 'border-t border-dashed border-slate-200 pt-3' : ''}>
                    {entry.texts.length > 1 && <p className="mb-1 text-[10px] font-black text-violet-400">묵상 {index + 1}</p>}
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{text}</p>
                </div>
            ))}
        </div>
    </article>
);

const EmptyDiary = ({ message = '아직 남긴 묵상이 없어요.' }) => (
    <div className="rounded-[1.7rem] border border-dashed border-amber-200 bg-white/75 px-5 py-12 text-center">
        <div className="mb-3 text-4xl">🕊️</div>
        <p className="text-sm font-bold text-slate-500">{message}</p>
        <p className="mt-1 text-xs text-slate-400">오늘 마음에 남은 말씀부터 천천히 적어보세요.</p>
    </div>
);

const MemoListModal = ({
    show,
    onClose,
    memos,
    currentUser,
    generateMemosHTML,
    currentDay,
    score,
    streak,
}) => {
    const [activeView, setActiveView] = useState('recent');
    const [selectedDateKey, setSelectedDateKey] = useState('');
    const [selectedBook, setSelectedBook] = useState('전체');
    const [bookQuery, setBookQuery] = useState('');
    const schedule = SCHEDULE_DATA[currentUser?.planId] || SCHEDULE_DATA.whole_bible || [];
    const entries = useMemo(() => Object.entries(memos || {})
        .map(([key, memo]) => {
            const { round, day } = parseMemoKey(key);
            const date = toValidDate(memo.date);
            const range = schedule[day]?.range || '';
            return {
                key,
                memo,
                round,
                day,
                date,
                dateKey: toDateKey(date),
                title: memo.title || '',
                range,
                book: getBookLabel(range, memo.title),
                texts: (memo.texts || [memo.text]).filter(Boolean),
            };
        })
        .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0) || b.round - a.round || b.day - a.day), [memos, schedule]);

    const latestDate = entries.find(entry => entry.date)?.date || new Date();
    const [calendarCursor, setCalendarCursor] = useState(() => new Date(latestDate.getFullYear(), latestDate.getMonth(), 1));

    useEffect(() => {
        if (!show) return undefined;
        setActiveView('recent');
        setSelectedDateKey(toDateKey(latestDate));
        setSelectedBook('전체');
        setBookQuery('');
        setCalendarCursor(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1));
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; };
    }, [show]);

    if (!show) return null;

    const dateCounts = entries.reduce((counts, entry) => {
        if (entry.dateKey) counts[entry.dateKey] = (counts[entry.dateKey] || 0) + 1;
        return counts;
    }, {});
    const calendarDays = buildCalendarDays(calendarCursor);
    const selectedDateEntries = entries.filter(entry => entry.dateKey === selectedDateKey);
    const books = ['전체', ...Array.from(new Set(entries.map(entry => entry.book)))];
    const normalizedQuery = bookQuery.trim().toLowerCase();
    const bibleEntries = entries.filter(entry => (
        (selectedBook === '전체' || entry.book === selectedBook)
        && (!normalizedQuery || `${entry.range} ${entry.title} ${entry.texts.join(' ')}`.toLowerCase().includes(normalizedQuery))
    ));
    const writingDays = Object.keys(dateCounts).length;

    return (
        <div className="fixed inset-0 z-[160] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <section
                role="dialog"
                aria-modal="true"
                aria-label="나의 묵상 일기장"
                className="flex h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-[#faf7f0] shadow-2xl sm:h-[88vh] sm:rounded-[2rem]"
                onMouseDown={event => event.stopPropagation()}
            >
                <header className="shrink-0 bg-gradient-to-br from-[#5540a5] via-[#7256c7] to-[#9b72d4] px-5 pb-5 pt-4 text-white sm:px-7">
                    <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/35 sm:hidden" />
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold text-violet-100">말씀과 함께 쌓이는</p>
                            <h2 className="mt-1 text-2xl font-black tracking-tight">{currentUser?.name || '나'}의 묵상 일기장</h2>
                        </div>
                        <button onClick={onClose} aria-label="묵상 일기장 닫기" className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
                            <Icon name="close" />
                        </button>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-2xl bg-white/12 px-2 py-2.5"><p className="text-lg font-black">{entries.length}</p><p className="text-[10px] font-bold text-violet-100">묵상 기록</p></div>
                        <div className="rounded-2xl bg-white/12 px-2 py-2.5"><p className="text-lg font-black">{writingDays}</p><p className="text-[10px] font-bold text-violet-100">기록한 날</p></div>
                        <div className="rounded-2xl bg-white/12 px-2 py-2.5"><p className="truncate text-sm font-black leading-7">{entries[0]?.book || '-'}</p><p className="text-[10px] font-bold text-violet-100">최근 말씀</p></div>
                    </div>
                </header>

                <nav className="grid shrink-0 grid-cols-3 gap-1 border-b border-amber-100 bg-white px-3 py-2" aria-label="묵상 기록 찾기">
                    {VIEW_TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveView(tab.id)}
                            aria-pressed={activeView === tab.id}
                            className={`min-h-11 rounded-xl px-2 text-sm font-black transition-colors ${activeView === tab.id ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <span className="mr-1" aria-hidden="true">{tab.icon}</span>{tab.label}
                        </button>
                    ))}
                </nav>

                <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7">
                    {activeView === 'recent' && (
                        <div className="space-y-4">
                            <div className="flex items-end justify-between gap-3">
                                <div><p className="text-xs font-bold text-amber-700">최근부터 차곡차곡</p><h3 className="text-xl font-black text-slate-800">나의 말씀 일기</h3></div>
                                {entries.length > 0 && <span className="text-xs font-bold text-slate-400">총 {entries.length}개</span>}
                            </div>
                            {entries.length ? entries.map(entry => <DiaryCard key={entry.key} entry={entry} />) : <EmptyDiary />}
                        </div>
                    )}

                    {activeView === 'calendar' && (
                        <div className="space-y-5">
                            <div className="rounded-[1.7rem] border border-amber-100 bg-white p-4 shadow-sm">
                                <div className="mb-4 flex items-center justify-between">
                                    <button aria-label="이전 달" onClick={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1))} className="min-h-11 min-w-11 rounded-full bg-slate-50 text-xl font-bold text-slate-600">‹</button>
                                    <h3 className="text-lg font-black text-slate-800">{calendarCursor.getFullYear()}년 {calendarCursor.getMonth() + 1}월</h3>
                                    <button aria-label="다음 달" onClick={() => setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1))} className="min-h-11 min-w-11 rounded-full bg-slate-50 text-xl font-bold text-slate-600">›</button>
                                </div>
                                <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400">
                                    {['일', '월', '화', '수', '목', '금', '토'].map(day => <span key={day} className="py-1">{day}</span>)}
                                </div>
                                <div className="grid grid-cols-7 gap-y-1 text-center">
                                    {calendarDays.map((date, index) => {
                                        if (!date) return <span key={`blank-${index}`} />;
                                        const key = toDateKey(date);
                                        const hasEntry = Boolean(dateCounts[key]);
                                        const isSelected = selectedDateKey === key;
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setSelectedDateKey(key)}
                                                className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${isSelected ? 'bg-violet-600 text-white shadow-md' : hasEntry ? 'bg-amber-50 text-slate-800' : 'text-slate-400'}`}
                                            >
                                                {date.getDate()}
                                                {hasEntry && !isSelected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-violet-500" />}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="mt-3 text-center text-[11px] font-semibold text-slate-400">점이 있는 날짜에 묵상 기록이 있어요.</p>
                            </div>
                            <div className="space-y-4">
                                <h3 className="px-1 text-sm font-black text-slate-700">{selectedDateKey ? `${selectedDateKey.replaceAll('-', '. ')} 기록` : '날짜를 선택해 주세요'}</h3>
                                {selectedDateEntries.length ? selectedDateEntries.map(entry => <DiaryCard key={entry.key} entry={entry} />) : <EmptyDiary message="이 날짜에는 남긴 묵상이 없어요." />}
                            </div>
                        </div>
                    )}

                    {activeView === 'bible' && (
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-bold text-amber-700">말씀을 따라 다시 찾기</p>
                                <h3 className="text-xl font-black text-slate-800">성경별 묵상</h3>
                            </div>
                            <label className="block">
                                <span className="sr-only">본문이나 묵상 내용 검색</span>
                                <input value={bookQuery} onChange={event => setBookQuery(event.target.value)} placeholder="본문이나 묵상 내용 검색" className="min-h-12 w-full rounded-2xl border border-amber-100 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
                            </label>
                            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:-mx-7 sm:px-7">
                                {books.map(book => (
                                    <button key={book} onClick={() => setSelectedBook(book)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-black ${selectedBook === book ? 'bg-violet-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{book}</button>
                                ))}
                            </div>
                            <p className="px-1 text-xs font-bold text-slate-400">{selectedBook === '전체' ? '전체 성경' : selectedBook} · {bibleEntries.length}개 기록</p>
                            <div className="space-y-4">
                                {bibleEntries.length ? bibleEntries.map(entry => <DiaryCard key={entry.key} entry={entry} />) : <EmptyDiary message="조건에 맞는 묵상을 찾지 못했어요." />}
                            </div>
                        </div>
                    )}
                </div>

                <footer className="shrink-0 border-t border-amber-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-7">
                    {entries.length > 0 ? (
                        <button onClick={() => generateMemosHTML(currentUser.name, memos, { currentDay, score, streak })} className="min-h-11 w-full rounded-2xl bg-slate-900 px-4 text-sm font-black text-white">전체 묵상 일기 보관하기</button>
                    ) : (
                        <button onClick={onClose} className="min-h-11 w-full rounded-2xl bg-violet-600 px-4 text-sm font-black text-white">오늘 묵상 쓰러 가기</button>
                    )}
                </footer>
            </section>
        </div>
    );
};

export default MemoListModal;
