import React, { useEffect } from 'react';
import { toSinoKorean } from '../utils/helpers';

const MarkdownRenderer = ({ content, fontSize = 16, activeChunkIndex = -1, onSegmentClick = null }) => {
    if (!content) return null;

    // 제목은 본문보다 크게
    const h1Size = fontSize + 6;
    const h2Size = fontSize + 4;
    const h3Size = fontSize + 2;

    // <details> 블록 파싱
    const parseDetails = (text) => {
        const detailsRegex = /<details>([\s\S]*?)<\/details>/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = detailsRegex.exec(text)) !== null) {
            // <details> 앞의 텍스트
            if (match.index > lastIndex) {
                parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
            }

            // <details> 내용 파싱
            const detailsContent = match[1];
            const summaryMatch = detailsContent.match(/<summary>(.*?)<\/summary>/s);

            if (summaryMatch) {
                const summary = summaryMatch[1].trim();
                const body = detailsContent.slice(summaryMatch[0].length).trim();
                parts.push({ type: 'details', summary, body });
            }

            lastIndex = match.index + match[0].length;
        }

        // 마지막 남은 텍스트
        if (lastIndex < text.length) {
            parts.push({ type: 'text', content: text.slice(lastIndex) });
        }

        return parts.length > 0 ? parts : [{ type: 'text', content: text }];
    };

    // 자동 스크롤 기능 (부드러움 개선: 필요할 때만 스크롤)
    useEffect(() => {
        if (activeChunkIndex >= 0) {
            const activeElement = document.getElementById(`tts-segment-${activeChunkIndex}`);
            if (activeElement) {
                const rect = activeElement.getBoundingClientRect();
                const viewHeight = window.innerHeight;

                // 현재 구절이 화면의 적절한 위치(상단 30% ~ 하단 70%)에 이미 있다면 스크롤하지 않음
                // 이렇게 하면 매 문장마다 화면이 덜컥거리는 현상을 방지하고 훨씬 부드럽게 느껴집니다.
                const isWellVisible = (rect.top > viewHeight * 0.3) && (rect.bottom < viewHeight * 0.7);

                if (!isWellVisible) {
                    activeElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            }
        }
    }, [activeChunkIndex]);

    // 전체 세그먼트 카운터 (한 번의 렌더링 동안 유지)
    let segmentCounter = 0;

    // [[VERSE:n]] 패턴을 파싱하여 스타일링된 컴포넌트로 변환
    const renderVerseMarkers = (text) => {
        if (typeof text !== 'string') return text;

        const verseMarkerRegex = /\[\[VERSE:(\d+)\]\]/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = verseMarkerRegex.exec(text)) !== null) {
            // 마커 앞의 텍스트
            if (match.index > lastIndex) {
                parts.push(text.slice(lastIndex, match.index));
            }

            // 절 번호 렌더링
            const verseNum = match[1];
            parts.push(
                <span
                    key={`verse-${verseNum}-${match.index}`}
                    className="inline-flex items-center justify-center bg-slate-100 text-slate-500 font-bold rounded-sm px-1 mr-1 text-[0.7em] align-middle select-none border border-slate-200 shadow-sm"
                    style={{ lineHeight: '1', verticalAlign: 'text-top', marginTop: '2px' }}
                >
                    {verseNum}
                </span>
            );

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
        }

        return parts.length > 0 ? parts : text;
    };

    const renderInteractiveText = (text, removeNumbers = false) => {
        if (!onSegmentClick) return renderVerseMarkers(text);

        let processedText = text;

        // 마크다운 기호 제거
        processedText = processedText.replace(/^#+\s*/, '');

        // 문장 부호 기준으로 세부 분할
        // acc를 객체 배열로 관리하여 스피킹 가능 여부와 원본 텍스트를 함께 보관합니다.
        const segments = processedText.split(/([.?!])/g).reduce((acc, part) => {
            if (['.', '?', '!'].indexOf(part) !== -1) {
                if (acc.length > 0) acc[acc.length - 1].content += part;
                return acc;
            }

            // 실제 읽을 내용이 있는지 판단 (따옴표, 어퍼스트로피, 공백 제외)
            const isSpeakable = part.replace(/['"‘’“”「」『』\s]/g, '').length > 0;
            if (part.length > 0) {
                acc.push({ content: part, isSpeakable });
            }
            return acc;
        }, []);

        return segments.map((seg, i) => {
            // 따옴표만 있는 등 읽을 내용이 없는 구간은 인덱스를 부여하지 않고 일반 텍스트로 렌더링
            if (!seg.isSpeakable) {
                return (
                    <span key={`noise-${segmentCounter}-${i}`} className="font-normal opacity-90">
                        {renderVerseMarkers(seg.content)}
                    </span>
                );
            }

            // 실제 TTS 인덱스와 일치하는 유효한 구절
            const idx = segmentCounter++;
            const isActive = activeChunkIndex === idx;
            return (
                <span
                    key={idx}
                    id={`tts-segment-${idx}`}
                    onClick={() => onSegmentClick(idx)}
                    className={`transition-all duration-300 cursor-pointer rounded px-0.5 font-normal ${isActive ? 'bg-yellow-300 text-slate-900 font-bold shadow-sm' : 'hover:bg-slate-100'}`}
                    title="클릭하면 여기부터 읽어줍니다"
                >
                    {renderVerseMarkers(seg.content)}
                </span>
            );
        });
    };

    // 한 줄 렌더링
    const renderLine = (line, isFirstLine, key) => {
        const trimmed = line.trim();

        // 제목은 통째로 하나의 세그먼트
        if (trimmed.startsWith('# ')) {
            const idx = segmentCounter++;
            return <h1 key={key} id={`tts-segment-${idx}`} onClick={() => onSegmentClick && onSegmentClick(idx)} className={`font-bold text-slate-800 ${isFirstLine ? 'mt-0' : 'mt-8'} mb-3 cursor-pointer ${activeChunkIndex === idx ? 'bg-yellow-200' : ''}`} style={{ fontSize: `${h1Size}px` }}>{trimmed.slice(2)}</h1>;
        }
        if (trimmed.startsWith('## ')) {
            const idx = segmentCounter++;
            return <h2 key={key} id={`tts-segment-${idx}`} onClick={() => onSegmentClick && onSegmentClick(idx)} className={`font-bold text-slate-800 ${isFirstLine ? 'mt-0' : 'mt-6'} mb-2 cursor-pointer ${activeChunkIndex === idx ? 'bg-yellow-200' : ''}`} style={{ fontSize: `${h2Size}px` }}>{trimmed.slice(3)}</h2>;
        }
        if (trimmed.startsWith('### ')) {
            const idx = segmentCounter++;
            return <h3 key={key} id={`tts-segment-${idx}`} onClick={() => onSegmentClick && onSegmentClick(idx)} className={`font-bold text-slate-800 ${isFirstLine ? 'mt-0' : 'mt-4'} mb-1 border-b border-slate-200 pb-1 cursor-pointer ${activeChunkIndex === idx ? 'bg-yellow-200' : ''}`} style={{ fontSize: `${h3Size}px` }}>{trimmed.slice(4)}</h3>;
        }

        // 리스트
        if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) return <li key={key} className="list-disc list-outside ml-6 text-slate-700 leading-relaxed mb-1 font-normal" style={{ fontSize: `${fontSize}px` }}>{renderInteractiveText(trimmed.slice(2), true)}</li>;
        // 인용문
        if (trimmed.startsWith('> ')) return <blockquote key={key} className="border-l-4 border-blue-300 pl-3 italic text-slate-600 my-2 bg-slate-50 p-2 rounded" style={{ fontSize: `${fontSize}px` }}>{renderInteractiveText(trimmed.slice(2))}</blockquote>;

        // 성경 절 번호 형태 (예: "1 태초에", "1.태초에", "1. 태초에")
        // 날짜나 순서를 나타내는 '일', '월', '년', '번', '차' 등이 바로 뒤에 붙는 경우는 제외
        const verseMatch = trimmed.match(/^(\d+)([\s.]\s?)(?!일|월|년|차|번)(.*)/);
        if (verseMatch) {
            const verseNum = verseMatch[1];
            const separator = verseMatch[2];
            const verseText = verseMatch[3];

            return (
                <p key={key} className="text-slate-700 leading-relaxed mb-3 flex items-start gap-2" style={{ fontSize: `${fontSize}px`, textAlign: 'justify' }}>
                    <span className="font-bold text-blue-500 shrink-0 mt-1" style={{ fontSize: `${Math.max(10, fontSize - 4)}px` }}>
                        {verseNum}
                    </span>
                    <span className="font-normal">{renderInteractiveText(verseText, false)}</span>
                </p>
            );
        }

        // 빈 줄
        if (trimmed === '') return <div key={key} className="h-1"></div>;

        // 일반 텍스트
        return (
            <p key={key} className="text-slate-700 leading-relaxed mb-3 font-normal" style={{ fontSize: `${fontSize}px`, textAlign: 'justify' }}>
                {renderInteractiveText(line, false)}
            </p>
        );
    };

    const parts = parseDetails(content);
    return (
        <div className="markdown-body">
            {parts.map((part, partIdx) => {
                if (part.type === 'details') {
                    return (
                        <details key={`details-${partIdx}`} className="my-2 border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shadow-sm">
                            <summary className="cursor-pointer px-4 py-3 font-bold text-slate-700 hover:bg-slate-100 transition-colors" style={{ fontSize: `${fontSize}px` }}>
                                {part.summary}
                            </summary>
                            <div className="px-4 py-3 space-y-1 border-t border-slate-100 bg-white">
                                {part.body.split('\n').map((line, lineIdx) =>
                                    renderLine(line, false, `details-${partIdx}-line-${lineIdx}`)
                                )}
                            </div>
                        </details>
                    );
                } else {
                    return part.content.split('\n').map((line, lineIdx) =>
                        renderLine(line, partIdx === 0 && lineIdx === 0, `text-${partIdx}-line-${lineIdx}`)
                    );
                }
            })}
        </div>
    );
};

export default MarkdownRenderer;
