import React from 'react';
import MarkdownRenderer from '../MarkdownRenderer';

const AnnouncementBanner = ({ announcement }) => {
    if (!announcement || !announcement.enabled || !announcement.text) return null;

    return (
        <div className="bg-white border-2 border-slate-100 rounded-3xl p-7 shadow-sm mb-10">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                {/* 상징적인 큰 아이콘 */}
                <div className="flex-shrink-0 w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-4xl shadow-inner border border-slate-100">
                    📢
                </div>

                {/* 본문 내용: 가독성을 최우선으로 함 */}
                <div className="flex-1 min-w-0">
                    <div className="text-slate-900 font-bold leading-snug">
                        {/* 어르신들을 위해 글자 크기를 키우고 명조/고딕의 조화로운 가독성 제공 */}
                        <MarkdownRenderer content={announcement.text} fontSize={19} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-6">
                        {/* 다중 링크 지원: 큰 버튼과 명확한 색상 */}
                        {announcement.links && announcement.links.length > 0 ? (
                            announcement.links.map((link, idx) => (
                                link.url && link.text && (
                                    <a
                                        key={idx}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center bg-[#03C75A] text-white px-8 py-3.5 rounded-2xl text-[17px] font-black hover:bg-[#02b351] transition-colors shadow-md active:scale-95 min-w-[140px]"
                                    >
                                        {link.text}
                                    </a>
                                )
                            ))
                        ) : (
                            /* 하위 호환성 */
                            announcement.linkUrl && announcement.linkText && (
                                <a
                                    href={announcement.linkUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center bg-[#03C75A] text-white px-8 py-3.5 rounded-2xl text-[17px] font-black hover:bg-[#02b351] transition-colors shadow-md active:scale-95 min-w-[140px]"
                                >
                                    {announcement.linkText}
                                </a>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnnouncementBanner;
