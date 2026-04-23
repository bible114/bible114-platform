import React from 'react';
import MiniMeRenderer from './MiniMeRenderer';

/**
 * 캐릭터 레이어 렌더링 컴포넌트
 * 이제 SVG 기반의 MiniMeRenderer를 사용하여 싸이월드 감성을 구현합니다.
 */
const CharacterView = ({ character, size = "w-16 h-20", className = "" }) => {
    if (!character) return null;

    return (
        <div className={`relative flex items-center justify-center ${size} ${className}`}>
            <MiniMeRenderer
                gender={character.baseId?.includes('woman') || character.baseId?.includes('girl') ? 'woman' : 'man'}
                hairId={character.hairId}
                outfitId={character.outfitId}
                accId={character.accessoryId}
                eyeId={character.eyeId}
                expressionId={character.expressionId}
                handId={character.handId}
            />
        </div>
    );
};

export default CharacterView;
