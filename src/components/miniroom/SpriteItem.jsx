import React from 'react';
import { Assets } from '../../assets/miniroom';

/**
 * 전용 아이템 렌더링 컴포넌트
 * spriteSheet 이름과 인덱스를 기반으로 해당 아이템만 크롭해서 보여줍니다.
 */
const SpriteItem = ({
    item,
    size = 64,
    className = "",
    style = {},
    scale = 1
}) => {
    if (!item || !item.spriteSheet) return null;

    const imageUrl = Assets[item.spriteSheet] || '';
    const sheetName = item.spriteSheet.toLowerCase();

    // 아이템 규격 사용 (대부분의 시트가 아이템 크기만큼의 셀을 가짐)
    const cellW = item.width || 64;
    const cellH = item.height || 64;
    const cols = 8;

    const backgroundPositionX = -(item.spriteX * cellW);
    const backgroundPositionY = -(item.spriteY * cellH);
    const sheetWidth = cols * cellW;

    const containerStyle = {
        width: `${cellW * scale}px`,
        height: `${cellH * scale}px`,
        backgroundImage: `url(${imageUrl})`,
        backgroundPosition: `${backgroundPositionX * scale}px ${backgroundPositionY * scale}px`,
        backgroundSize: `${sheetWidth * scale}px auto`,
        backgroundRepeat: 'no-repeat',
        backgroundColor: 'transparent',
        imageRendering: 'pixelated',
        // 흰색 배경 제거 (벽지/바닥은 제외)
        mixBlendMode: (sheetName.includes('wallpaper') || sheetName.includes('floor')) ? 'normal' : 'multiply',
        ...style
    };

    return (
        <div className={`sprite-item ${className}`} style={containerStyle} title={item.name} />
    );
};

export default SpriteItem;
