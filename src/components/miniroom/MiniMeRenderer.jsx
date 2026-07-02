import React from 'react';

/**
 * Cyworld 'Mini-me' 스타일 캐릭터 렌더러
 * 픽셀 아트의 따뜻한 감성과 아이소메트릭 비율을 SVG로 정교하게 구현합니다.
 */
const MiniMeRenderer = ({
    gender = 'man',
    hairId = null,
    outfitId = null,
    accId = null,
    eyeId = 'eye_basic',
    expressionId = 'expr_happy',
    handId = null,
    isMe = false,
    className = ""
}) => {
    // 싸이월드 특유의 따뜻하고 부드러운 컬러 팔레트
    const SKIN_COLOR = "#FFDDBB";
    const OUTLINE_COLOR = "#4A332B";
    const EYE_COLOR = "#2D1B1B";
    const MOUTH_COLOR = "#FF9999";
    const BLUSH_COLOR = "rgba(255, 182, 193, 0.6)";
    const HIGHLIGHT_COLOR = "rgba(255, 255, 255, 0.5)";
    const SHADOW_COLOR = "rgba(0, 0, 0, 0.15)";

    // 머리 색상 매핑
    const getHairColor = (id) => {
        if (id?.includes('brown')) return "#704214";
        if (id?.includes('yellow') || id?.includes('gold')) return "#E6C15A";
        if (id?.includes('red')) return "#8B0000";
        if (id?.includes('blue')) return "#4169E1";
        if (id?.includes('pink')) return "#FF69B4";
        return "#333333";
    };

    const hairColor = getHairColor(hairId);

    // 눈 렌더링 도우미
    const renderEyes = () => {
        switch (eyeId) {
            case 'eye_large':
                return (
                    <g>
                        <circle cx="12" cy="19" r="1.5" fill="white" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                        <circle cx="12" cy="19" r="0.7" fill={EYE_COLOR} />
                        <circle cx="20" cy="19" r="1.5" fill="white" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                        <circle cx="20" cy="19" r="0.7" fill={EYE_COLOR} />
                    </g>
                );
            case 'eye_sharp':
                return (
                    <g fill={EYE_COLOR}>
                        <path d="M11 18 L14 19.5 L11 19 Z" />
                        <path d="M21 18 L18 19.5 L21 19 Z" />
                    </g>
                );
            case 'eye_gentle':
                return (
                    <g fill="none" stroke={EYE_COLOR} strokeWidth="0.8" strokeLinecap="round">
                        <path d="M11 19.5 Q12.5 18 14 19.5" />
                        <path d="M18 19.5 Q19.5 18 21 19.5" />
                    </g>
                );
            default:
                return (
                    <g>
                        <circle cx="12.5" cy="19" r="0.8" fill={EYE_COLOR} />
                        <circle cx="19.5" cy="19" r="0.8" fill={EYE_COLOR} />
                    </g>
                );
        }
    };

    // 표정 렌더링 도우미
    const renderExpression = () => {
        switch (expressionId) {
            case 'expr_laugh':
                return <path d="M14 22 Q16 23.5 18 22" fill="none" stroke={MOUTH_COLOR} strokeWidth="1" strokeLinecap="round" />;
            case 'expr_sad':
                return <path d="M14 23 Q16 21.5 18 23" fill="none" stroke={OUTLINE_COLOR} strokeWidth="0.6" strokeLinecap="round" />;
            case 'expr_surprised':
                return <circle cx="16" cy="22.5" r="1" fill="none" stroke={MOUTH_COLOR} strokeWidth="0.6" />;
            case 'expr_cool':
                return <rect x="14.5" y="22" width="3" height="0.6" fill={OUTLINE_COLOR} opacity="0.5" rx="0.2" />;
            case 'expr_oops':
                return <circle cx="16" cy="22.5" r="0.6" fill={MOUTH_COLOR} />;
            default:
                return <rect x="15" y="22" width="2" height="0.6" fill={MOUTH_COLOR} rx="0.3" />;
        }
    };

    // 아이템 렌더링 도우미 (손에 든 것)
    const renderHandItem = () => {
        if (!handId) return null;
        const itemX = handId.includes('bible') ? 6 : 4;
        const itemY = 30;

        if (handId.includes('bible')) {
            let coverColor = "#8B0000"; // 기본 빨강
            let decColor = "#FFD700"; // 기본 금색 장식

            if (handId.includes('black')) coverColor = "#1a1a1a";
            if (handId.includes('blue')) coverColor = "#1e3a8a";
            if (handId.includes('brown')) coverColor = "#543310";
            if (handId.includes('white')) { coverColor = "#f8fafc"; decColor = "#cbd5e1"; }
            if (handId.includes('gold')) { coverColor = "#c5a059"; decColor = "#fff"; }

            const isMini = handId.includes('tiny') || handId.includes('pocket');

            return (
                <g transform={isMini ? 'scale(0.8) translate(4, 8)' : ''}>
                    <rect x={itemX} y={itemY} width="6" height="8" fill={coverColor} stroke={OUTLINE_COLOR} strokeWidth="0.5" rx="0.5" />
                    <rect x={itemX + 1} y={itemY + 1} width="4" height="6" fill="none" stroke={decColor} strokeWidth="0.3" rx="0.2" opacity="0.6" />
                    <path d={`M${itemX + 3} ${itemY + 2.5} V${itemY + 5.5} M${itemX + 2} ${itemY + 4} H${itemX + 4}`} stroke={decColor} strokeWidth="0.6" />
                </g>
            );
        }

        if (handId === 'item_mic') {
            return (
                <g>
                    <rect x={22} y={28} width="2" height="6" fill="#333" rx="0.5" transform="rotate(-15, 22, 28)" />
                    <circle cx={23.5} cy={27.5} r="1.8" fill="#94a3b8" stroke={OUTLINE_COLOR} strokeWidth="0.4" />
                </g>
            );
        }

        if (handId === 'item_guitar') {
            return (
                <g transform="translate(18, 25) rotate(-10)">
                    <ellipse cx="4" cy="10" rx="5" ry="6" fill="#92400e" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                    <circle cx="4" cy="8" r="1.5" fill={OUTLINE_COLOR} opacity="0.3" />
                    <rect x="3" y="0" width="2" height="8" fill="#78350f" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                    <rect x="2.5" y="-1" width="3" height="3" fill="#451a03" />
                </g>
            );
        }

        if (handId === 'item_bag') {
            return (
                <g>
                    <path d="M21 28 Q23 28 23 30 V35 H19 V30 Q19 28 21 28" fill="white" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                    <rect x="19" y="30" width="4" height="5" fill="#f1f5f9" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                    <path d="M20 32 H22 M21 31 V33" stroke="#ef4444" strokeWidth="0.3" />
                </g>
            );
        }

        return null;
    };

    return (
        <svg
            viewBox="0 0 32 48"
            className={`w-full h-full ${className}`}
            shapeRendering="crispEdges"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* 0. 발밑 그림자 */}
            <ellipse cx="16" cy="42" rx="7" ry="2.5" fill={SHADOW_COLOR} />

            {/* 1. 하트 애니메이션 (귀여운 포인트) */}
            <g className="animate-bounce" style={{ animationDuration: '3s' }}>
                <path d="M16 3 L17.5 1.5 Q18.5 0.5 19.5 1.5 Q20.5 2.5 18.5 4.5 L16 7 L13.5 4.5 Q11.5 2.5 12.5 1.5 Q13.5 0.5 14.5 1.5 Z" fill="#FF4D4D" />
            </g>

            {/* 2. 다리 */}
            <g>
                <rect x="12.5" y="34" width="3.2" height="8" fill={SKIN_COLOR} stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="1.5" />
                <rect x="16.3" y="34" width="3.2" height="8" fill={SKIN_COLOR} stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="1.5" />
            </g>

            {/* 3. 몸통 및 의상 */}
            <g>
                <rect x="10.5" y="24" width="11" height="11" fill={SKIN_COLOR} stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="3" />

                {/* 의상 렌더링 */}
                {(() => {
                    switch (outfitId) {
                        case 'outfit_hoodie_gray':
                            return (
                                <g>
                                    <rect x="10.5" y="24" width="11" height="11" fill="#94a3b8" stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="3" />
                                    <path d="M12 24 Q16 27 20 24" fill="none" stroke="#64748b" strokeWidth="1.5" />
                                    <circle cx="13" cy="27" r="0.5" fill="white" />
                                    <circle cx="19" cy="27" r="0.5" fill="white" />
                                </g>
                            );
                        case 'outfit_suit_black':
                            return (
                                <g>
                                    <rect x="10.5" y="24" width="11" height="11" fill="#1e293b" stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="1" />
                                    <path d="M14 24 L16 29 L18 24" fill="white" />
                                    <rect x="15.5" y="25" width="1" height="2" fill="#ef4444" />
                                </g>
                            );
                        case 'outfit_dress_yellow':
                            return (
                                <g>
                                    <path d="M10.5 24 H21.5 L24 37 H8 Z" fill="#fde047" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
                                    <path d="M10.5 28 Q16 30 21.5 28" fill="none" stroke="#ca8a04" strokeWidth="0.5" />
                                </g>
                            );
                        case 'outfit_jersey_blue':
                            return (
                                <g>
                                    <rect x="10.5" y="24" width="11" height="11" fill="#3b82f6" stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="2" />
                                    <rect x="11.5" y="24" width="0.8" height="11" fill="white" opacity="0.5" />
                                    <rect x="19.7" y="24" width="0.8" height="11" fill="white" opacity="0.5" />
                                </g>
                            );
                        case 'outfit_hanbok':
                            return (
                                <g>
                                    <path d="M10.5 24 H21.5 L24 38 H8 Z" fill="#ef4444" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
                                    <path d="M8 24 L16 30 L24 24" fill="#60a5fa" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
                                    <rect x="15.5" y="28" width="1" height="6" fill="#fde047" />
                                </g>
                            );
                        case 'outfit_sailor':
                            return (
                                <g>
                                    <rect x="10.5" y="24" width="11" height="11" fill="white" stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="2" />
                                    <path d="M10.5 24 H21.5 V27 H10.5 Z" fill="#2563eb" />
                                    <rect x="15.5" y="25.5" width="1" height="2" fill="#ef4444" />
                                </g>
                            );
                        case 'outfit_overalls':
                            return (
                                <g>
                                    <rect x="10.5" y="24" width="11" height="11" fill="white" stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="2" />
                                    <path d="M10.5 28 H21.5 V35 H10.5 Z" fill="#1d4ed8" />
                                    <rect x="12" y="24" width="1.5" height="4" fill="#1d4ed8" />
                                    <rect x="18.5" y="24" width="1.5" height="4" fill="#1d4ed8" />
                                </g>
                            );
                        default:
                            return null;
                    }
                })()}

                {/* 팔 */}
                <rect x="7.5" y="25" width="3.5" height="8" fill={SKIN_COLOR} stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="1.5" />
                <rect x="21" y="25" width="3.5" height="8" fill={SKIN_COLOR} stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="1.5" />
            </g>

            {/* 4. 머리 및 얼굴 */}
            <g>
                <rect x="8" y="10" width="16" height="15" fill={SKIN_COLOR} stroke={OUTLINE_COLOR} strokeWidth="0.6" rx="7" />

                {/* 눈/표정 */}
                {renderEyes()}
                {renderExpression()}

                {/* 볼터치 */}
                <circle cx="11" cy="20.5" r="1.5" fill={BLUSH_COLOR} />
                <circle cx="21" cy="20.5" r="1.5" fill={BLUSH_COLOR} />
            </g>

            {/* 5. 머리카락 */}
            <g fill={hairColor}>
                <path d="M8 17 Q8 8 16 8 Q24 8 24 17 L24 14 L8 14 Z" stroke={OUTLINE_COLOR} strokeWidth="0.4" />
                <rect x="8" y="10" width="16" height="4.5" rx="3" />
                <rect x="11" y="11" width="3" height="1" fill={HIGHLIGHT_COLOR} rx="0.5" />
                <rect x="12" y="10.5" width="1" height="2" fill={HIGHLIGHT_COLOR} rx="0.5" />

                {gender === 'woman' && (
                    <g>
                        <path d="M8 14 V26 Q5 26 5 20 V14 Z" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                        <path d="M24 14 V26 Q27 26 27 20 V14 Z" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                        {hairId?.includes('long') && (
                            <g>
                                <path d="M5 20 V30 Q5 32 8 32 V26 Z" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                                <path d="M27 20 V30 Q27 32 24 32 V26 Z" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                            </g>
                        )}
                    </g>
                )}
                {gender === 'man' && !hairId?.includes('cap') && !hairId?.includes('beanie') && (
                    <g><path d="M12 8 L13 5 L14 8 Z" fill={hairColor} stroke={OUTLINE_COLOR} strokeWidth="0.3" /></g>
                )}

                {/* 모자류 처리 */}
                {hairId === 'hair_cap_red' && (
                    <g>
                        <path d="M8 10 Q16 6 24 10 L24 14 H8 Z" fill="#ef4444" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
                        <rect x="16" y="11" width="10" height="2.5" fill="#ef4444" stroke={OUTLINE_COLOR} strokeWidth="0.5" rx="1" />
                    </g>
                )}
                {hairId === 'hair_beanie_blue' && (
                    <path d="M8 10 Q16 4 24 10 L24 15 H8 Z" fill="#3b82f6" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
                )}
                {hairId === 'hair_tiara' && (
                    <path d="M12 8 L13 4 L16 7 L19 4 L20 8 Z" fill="#fde047" stroke="#ca8a04" strokeWidth="0.5" />
                )}
            </g>

            {/* 6. 아이템 및 악세서리 */}
            {renderHandItem()}

            {/* 악세서리 레이어 */}
            {(() => {
                switch (accId) {
                    case 'acc_glasses_horn':
                        return (
                            <g fill="none" stroke="#1e293b" strokeWidth="0.8">
                                <rect x="9.5" y="17.5" width="5" height="3.5" rx="0.5" />
                                <rect x="17.5" y="17.5" width="5" height="3.5" rx="0.5" />
                                <path d="M14.5 19 H17.5" />
                            </g>
                        );
                    case 'acc_sunglasses_dark':
                        return (
                            <g fill="#1e293b" stroke={OUTLINE_COLOR} strokeWidth="0.5">
                                <rect x="9.5" y="17.5" width="5.5" height="3.5" rx="1" />
                                <rect x="17" y="17.5" width="5.5" height="3.5" rx="1" />
                                <path d="M15 19 H17" fill="none" />
                            </g>
                        );
                    case 'acc_ribbon_pink':
                        return (
                            <g transform="translate(18, 6)">
                                <path d="M0 4 Q2 0 4 4 Q2 8 0 4 Z M0 4 Q-2 0 -4 4 Q-2 8 0 4 Z" fill="#f472b6" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
                                <circle cx="0" cy="4" r="1.2" fill="#db2777" />
                            </g>
                        );
                    case 'acc_mask_white':
                        return (
                            <rect x="11" y="21" width="10" height="4" fill="white" stroke="#cbd5e1" strokeWidth="0.5" rx="1" />
                        );
                    default:
                        return null;
                }
            })()}
        </svg>
    );
};

export default MiniMeRenderer;
