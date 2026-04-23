import React, { useState } from 'react';
import SpriteItem from './SpriteItem';
import CharacterView from './CharacterView';
import { SHOP_ITEMS } from '../../data/shop_items';
import { Assets } from '../../assets/miniroom';

const RoomCanvas = ({
    activeRoom,
    character,
    previewItem,
    selectedPlacementId,
    onGridClick,
    onItemClick,
    onCharacterClick,
    onPreviewClick,
    previewPos = { x: 4, y: 4 },
    movePlacedItem,
    moveCharacter
}) => {
    const [dragging, setDragging] = useState(null); // { type: 'item'|'char'|'preview', id?: string, startX?: number, startY?: number }
    const [hoverPos, setHoverPos] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const GRID_SIZE = 10;
    const TILE_W = 64;
    const TILE_H = 32;

    const isFurniturePreview = previewItem && !['wallpaper', 'floor', 'character', 'hair', 'accessory', 'outfit', 'eye', 'expression', 'hand'].includes(previewItem.category);

    const getPos = (gx, gy) => {
        const x = (gx - gy) * (TILE_W / 2);
        const y = (gx + gy) * (TILE_H / 2);
        return { x, y };
    };

    const screenToGrid = (clientX, clientY, containerRef) => {
        if (!containerRef) return null;
        const rect = containerRef.getBoundingClientRect();

        // 스케일 factor 계산 (부모에서 scale조정된 경우 대응)
        const scale = rect.width / 640;

        // 캔버스 중심점 (320, 180) 기준
        const centerX = rect.left + (320 * scale);
        const centerY = rect.top + (180 * scale);

        const relX = (clientX - centerX) / scale;
        const relY = (clientY - centerY) / scale;

        const gx = Math.floor((relY / (TILE_H / 2) + relX / (TILE_W / 2)) / 2);
        const gy = Math.floor((relY / (TILE_H / 2) - relX / (TILE_W / 2)) / 2);

        if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
            return { x: gx, y: gy };
        }
        return null;
    };

    const containerRef = React.useRef(null);

    const handleMouseDown = (e, type, id = null) => {
        e.stopPropagation();
        setDragging({ type, id });
    };

    const handleMouseMove = (e) => {
        if (!dragging) return;
        const rect = containerRef.current.getBoundingClientRect();
        const scale = rect.width / 640;

        // 정교한 마우스 위치 (캔버스 내부 좌표)
        const mx = (e.clientX - rect.left) / scale;
        const my = (e.clientY - rect.top) / scale;
        setMousePos({ x: mx, y: my });

        const gridPos = screenToGrid(e.clientX, e.clientY, containerRef.current);
        if (gridPos) {
            setHoverPos(gridPos);
        }
    };

    const handleMouseUp = () => {
        if (dragging && hoverPos) {
            if (dragging.type === 'item') {
                movePlacedItem(dragging.id, hoverPos.x, hoverPos.y);
            } else if (dragging.type === 'char') {
                moveCharacter(hoverPos.x, hoverPos.y);
            } else if (dragging.type === 'preview') {
                // 미리보기 위치업데이트는 부모에서 처리하도록 유도하거나 로컬 상태로 유지 (이 예시에서는 previewPos는 부모 소유)
                onGridClick(hoverPos.x, hoverPos.y);
            }
        }
        setDragging(null);
        setHoverPos(null);
    };

    const effectiveWallpaperId = previewItem?.category === 'wallpaper' ? previewItem.id : activeRoom.wallpaper || 'wall_plain_white';
    const effectiveFloorId = previewItem?.category === 'floor' ? previewItem.id : activeRoom.floor || 'floor_plain_white';

    const wallpaperItem = SHOP_ITEMS.find(i => i.id === effectiveWallpaperId) || (previewItem?.category === 'wallpaper' ? previewItem : null);
    const floorItem = SHOP_ITEMS.find(i => i.id === effectiveFloorId) || (previewItem?.category === 'floor' ? previewItem : null);

    const wallpaperUrl = wallpaperItem?.spriteSheet ? Assets[wallpaperItem.spriteSheet] : '';
    const wallPosPX = wallpaperItem ? -(wallpaperItem.spriteX * (wallpaperItem.width || 64)) : 0;
    const wallPosPY = wallpaperItem ? -(wallpaperItem.spriteY * (wallpaperItem.height || 64)) : 0;

    const floorUrl = floorItem?.spriteSheet ? Assets[floorItem.spriteSheet] : '';
    const floorPosPX = floorItem ? -(floorItem.spriteX * (floorItem.width || 64)) : 0;
    const floorPosPY = floorItem ? -(floorItem.spriteY * (floorItem.height || 64)) : 0;

    const charPos = dragging?.type === 'char' && hoverPos ? hoverPos : (activeRoom.characterPos || { x: 4, y: 4 });

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="room-canvas-container py-10 flex items-center justify-center bg-slate-400 rounded-[2rem] overflow-hidden shadow-inner border-4 border-white/50 relative select-none"
        >
            <div style={{ position: 'relative', width: '640px', height: '520px', margin: '0 auto' }}>
                <div className={`absolute inset-0 pointer-events-none z-0 transition-opacity duration-500 ${isFurniturePreview ? 'opacity-40' : 'opacity-100'}`}>
                    <div className="absolute" style={{
                        width: '320.5px', height: '405px', left: '0', top: '-224px', transform: 'skewY(-26.565deg)', transformOrigin: 'bottom right',
                        backgroundColor: wallpaperItem?.color || '#fff', borderRight: '1.5px solid rgba(0,0,0,0.1)',
                        backgroundImage: wallpaperUrl ? `url(${wallpaperUrl})` : 'none', backgroundPosition: `${wallPosPX}px ${wallPosPY}px`,
                        backgroundSize: `512px auto`, imageRendering: 'pixelated'
                    }}>
                        <div className="absolute bottom-0 w-full h-[8px] bg-black/5 border-t border-black/10" />
                    </div>
                    <div className="absolute" style={{
                        width: '320.5px', height: '405px', left: '320px', top: '-224px', transform: 'skewY(26.565deg)', transformOrigin: 'bottom left',
                        backgroundColor: wallpaperItem?.color || '#fff', backgroundImage: wallpaperUrl ? `url(${wallpaperUrl})` : 'none',
                        backgroundPosition: `${wallPosPX}px ${wallPosPY}px`, backgroundSize: `512px auto`, imageRendering: 'pixelated', filter: 'brightness(0.97)'
                    }}>
                        <div className="absolute bottom-0 w-full h-[8px] bg-black/10 border-t border-black/20" />
                    </div>
                    <div className="absolute left-[319.5px] top-[-100px] w-[1px] h-[300px] bg-black/10 z-10" />
                </div>

                <div className="absolute top-[180px] left-[288px]">
                    {Array.from({ length: GRID_SIZE }).map((_, gy) => (
                        <div key={gy} style={{ position: 'absolute', zIndex: 0 }}>
                            {Array.from({ length: GRID_SIZE }).map((_, gx) => {
                                const { x, y } = getPos(gx, gy);
                                const isTarget = hoverPos?.x === gx && hoverPos?.y === gy;
                                return (
                                    <div key={gx}
                                        className={`transition-colors duration-100 ${isTarget ? 'bg-indigo-400/30' : ''}`}
                                        style={{
                                            position: 'absolute', left: x, top: y, width: TILE_W + 1, height: TILE_H + 1,
                                            backgroundColor: floorItem?.color || 'transparent', backgroundImage: floorUrl ? `url(${floorUrl})` : 'none',
                                            backgroundPosition: `${floorPosPX}px ${floorPosPY}px`, backgroundSize: `512px auto`,
                                            clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', imageRendering: 'pixelated'
                                        }}
                                    />
                                );
                            })}
                        </div>
                    ))}

                    <div className={`transition-all duration-300 ${isFurniturePreview ? 'opacity-40 saturate-[0.5] blur-[0.5px]' : ''}`}>
                        {activeRoom.items?.map((item) => {
                            const isDraggingThis = dragging?.type === 'item' && dragging.id === item.id;
                            const shopItem = SHOP_ITEMS.find(i => i.id === item.itemId);
                            if (!shopItem) return null;

                            // 드래그 중인 아이템은 마우스 좌표를, 아니면 그리드 좌표를 사용
                            let x, y, z;
                            if (isDraggingThis) {
                                x = mousePos.x - 320; // 320: 캔버스 중심 보정
                                y = mousePos.y - 180;
                                z = 1000;
                            } else {
                                const pos = { x: item.x, y: item.y };
                                const coords = getPos(pos.x, pos.y);
                                x = coords.x;
                                y = coords.y;
                                z = 10 + pos.y;
                            }

                            return (
                                <React.Fragment key={item.id}>
                                    {/* 드래그 중일 때 바닥에 표시될 가이드 그림자 */}
                                    {isDraggingThis && hoverPos && (() => {
                                        const { x: gx, y: gy } = getPos(hoverPos.x, hoverPos.y);
                                        return (
                                            <div className="absolute pointer-events-none transition-all duration-75"
                                                style={{
                                                    left: gx, top: gy,
                                                    width: TILE_W, height: TILE_H,
                                                    background: 'rgba(99, 102, 241, 0.2)',
                                                    clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                                                    transform: `translate(${TILE_W / 2 - shopItem.width / 2}px, ${TILE_H - shopItem.height}px)`,
                                                    zIndex: 5
                                                }}
                                            />
                                        );
                                    })()}

                                    <div
                                        onMouseDown={(e) => handleMouseDown(e, 'item', item.id)}
                                        onClick={(e) => { e.stopPropagation(); onItemClick && onItemClick(item); }}
                                        className={`absolute transition-transform cursor-grab active:cursor-grabbing ${isDraggingThis ? 'scale-110 drop-shadow-2xl z-[1000]' : ''}`}
                                        style={{
                                            left: x,
                                            top: y,
                                            transform: `translate(${(TILE_W / 2) - (shopItem.width / 2)}px, ${(TILE_H / 2) - shopItem.height}px) ${isDraggingThis ? 'translateY(-10px)' : ''}`,
                                            zIndex: z,
                                            opacity: isDraggingThis ? 0.8 : 1
                                        }}>
                                        <SpriteItem item={shopItem} scale={1} />
                                        {!isDraggingThis && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-black/10 rounded-full blur-[1px] -z-10" />}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    <div className={`transition-all duration-300 ${isFurniturePreview ? 'opacity-40 blur-[0.5px]' : ''}`}>
                        {(() => {
                            const { x, y } = getPos(charPos.x, charPos.y);
                            let displayChar = { ...character };
                            if (previewItem) {
                                const keyMap = { 'character': 'baseId', 'hair': 'hairId', 'accessory': 'accessoryId', 'outfit': 'outfitId', 'eye': 'eyeId', 'expression': 'expressionId', 'hand': 'handId' };
                                if (keyMap[previewItem.category]) displayChar[keyMap[previewItem.category]] = previewItem.id;
                            }
                            const isDraggingChar = dragging?.type === 'char';

                            return (
                                <div onMouseDown={(e) => handleMouseDown(e, 'char')}
                                    className={`absolute cursor-grab active:cursor-grabbing transition-all ${isDraggingChar ? 'z-[100] scale-105 opacity-80' : ''}`}
                                    style={{ left: x, top: y, zIndex: 50 + charPos.y, transform: 'translate(-50%, -70%)' }}>
                                    <div className="relative">
                                        <CharacterView character={displayChar} />
                                        <div className="w-10 h-3 bg-black/10 rounded-full blur-[2px] mx-auto -mt-2"></div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {isFurniturePreview && (() => {
                        const isDraggingPreview = dragging?.type === 'preview';
                        const pos = isDraggingPreview && hoverPos ? hoverPos : previewPos;
                        const { x, y } = getPos(pos.x, pos.y);
                        return (
                            <div onMouseDown={(e) => handleMouseDown(e, 'preview')}
                                className={`absolute cursor-grab active:cursor-grabbing transition-all z-[100] ${isDraggingPreview ? 'scale-110 opacity-70' : ''}`}
                                style={{
                                    left: x,
                                    top: y,
                                    transform: `translate(${(TILE_W / 2) - ((previewItem.width || 64) / 2)}px, ${(TILE_H / 2) - (previewItem.height || 64)}px)`
                                }}>
                                <div className="relative group">
                                    <SpriteItem item={previewItem} scale={1.2} />
                                    <div className="absolute inset-0 bg-blue-400/10 blur-xl rounded-full -z-10"></div>
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[8px] px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">드래그하여 이동</div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {(previewItem || dragging) && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[85%] z-[100]">
                    <div className="bg-slate-900/80 backdrop-blur-sm text-white px-6 py-3 rounded-2xl flex items-center justify-between shadow-xl border border-white/10">
                        <div className="flex items-center gap-3">
                            <span className="text-lg">{dragging ? '🖐️' : '✨'}</span>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{dragging ? 'Dragging' : 'Preview'}</span>
                                <span className="text-xs font-bold">
                                    {dragging ? '마우스를 떼면 배치가 완료됩니다.' : `미리보기 적용 중: ${previewItem?.name}`}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoomCanvas;
