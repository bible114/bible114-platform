import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getChurchDirectory } from '../utils/churchDirectory';

const inputCls = "w-full bg-cream border border-hairline rounded-lg px-3.5 py-3 text-sm text-ink placeholder-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-all font-sans";

// 교회 검색 자동완성 컴포넌트.
// - 디렉토리(settings/churchDirectory)는 모듈 레벨 캐시로 세션당 1회만 read (getChurchDirectory).
// - 시작 일치(startsWith)를 포함 일치(includes)보다 상단에 정렬.
// - 선택되면 기존 "선택됨 카드" UI를 그대로 재사용해 렌더링(로그인 화면 시각 언어 유지).
const ChurchPicker = ({ value, onChange, label = '출석 교회' }) => {
    const [directory, setDirectory] = useState([]);
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        let alive = true;
        getChurchDirectory().then(list => { if (alive) setDirectory(list); });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setFocused(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selected = useMemo(() => directory.find(c => c.id === value) || null, [directory, value]);

    const results = useMemo(() => {
        const q = query.trim();
        if (!q) return [];
        const starts = [];
        const includes = [];
        for (const c of directory) {
            if (c.hidden) continue; // 검색 노출 숨김 교회 — 링크로 들어온 경우(selected)는 별도 처리
            const name = c.name || '';
            if (!name.includes(q)) continue;
            if (name.startsWith(q)) starts.push(c);
            else includes.push(c);
        }
        const collator = (a, b) => a.name.localeCompare(b.name, 'ko-KR');
        starts.sort(collator);
        includes.sort(collator);
        return [...starts, ...includes].slice(0, 8);
    }, [directory, query]);

    const handleSelect = (church) => {
        onChange(church.id);
        setQuery('');
        setFocused(false);
    };

    const handleChangeClick = () => {
        onChange('');
        setQuery('');
    };

    return (
        <div ref={containerRef}>
            <label className="block text-[11px] font-semibold text-ink/55 mb-1.5 uppercase tracking-wide">{label}</label>
            {selected ? (
                <div className="flex items-center gap-2.5 bg-cream border border-hairline rounded-lg px-3.5 py-2.5">
                    <div className="w-7 h-7 rounded-md bg-ink text-cream flex items-center justify-center font-serif text-[11px] font-bold shrink-0">
                        {selected.name[0]}
                    </div>
                    <span className="flex-1 text-sm font-semibold text-ink">{selected.name}</span>
                    <button type="button" onClick={handleChangeClick} className="text-[11px] text-ink/40 hover:text-ink/70 transition-colors">변경 ↓</button>
                </div>
            ) : (
                <div className="relative">
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onFocus={() => setFocused(true)}
                        placeholder="교회 이름을 입력하세요"
                        className={inputCls}
                        autoComplete="off"
                    />
                    {focused && query.trim() && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1.5 bg-cream-card border border-hairline rounded-lg shadow-lg max-h-64 overflow-y-auto">
                            {results.length === 0 ? (
                                <p className="text-[12px] text-ink/50 px-3.5 py-3 text-center">교회를 찾을 수 없습니다. 교회 관리자에게 문의해주세요.</p>
                            ) : (
                                <ul>
                                    {results.map(c => (
                                        <li key={c.id}>
                                            <button
                                                type="button"
                                                onClick={() => handleSelect(c)}
                                                className="w-full text-left px-3.5 py-2.5 text-sm text-ink hover:bg-ink/5 transition-colors flex items-center gap-2.5"
                                            >
                                                <div className="w-6 h-6 rounded-md bg-ink/10 text-ink flex items-center justify-center font-serif text-[10px] font-bold shrink-0">
                                                    {c.name[0]}
                                                </div>
                                                {c.name}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ChurchPicker;
