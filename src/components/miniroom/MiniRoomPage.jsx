import React, { useState } from 'react';
import { useMiniRoom } from '../../hooks/useMiniRoom';
import RoomCanvas from './RoomCanvas';
import ShopSection from './ShopSection';
import InventorySection from './InventorySection';
import CharacterView from './CharacterView';

const MiniRoomPage = ({ currentUser, setView, setCurrentUser }) => {
    const {
        roomData, character, inventory, activeRoom, loading, previewItem, setPreviewItem,
        buyItem, updateRoom, placeItem, movePlacedItem, removePlacedItem, updateCharacter, moveCharacter, unlockRoom
    } = useMiniRoom(currentUser, setCurrentUser);

    const [activeTab, setActiveTab] = useState('main'); // 'main', 'shop', 'inventory'
    const [sideTab, setSideTab] = useState('room'); // 'home', 'room', 'guestbook'
    const [shopCategory, setShopCategory] = useState('wallpaper');

    // 배치/이동 모드 상태
    const [isPlacementMode, setIsPlacementMode] = useState(false);
    const [selectedPlacementId, setSelectedPlacementId] = useState(null); // 'character' 또는 item's uniqueId 또는 'preview'
    const [previewPos, setPreviewPos] = useState({ x: 4, y: 4 });

    // 미리보기 아이템 설정 시 위치 초기화
    const handleSetPreviewItem = (item) => {
        setPreviewItem(item);
        setPreviewPos({ x: 4, y: 4 });
        setActiveTab('main');
    };

    if (loading) return <div className="p-20 text-center">방을 불러오는 중...</div>;

    const currentTalants = currentUser.score || 0;

    return (
        <div className="min-h-screen bg-slate-200 flex items-center justify-center p-2 sm:p-4 cy-pixel-font overflow-hidden">
            {/* 싸이월드 외곽 프레임 */}
            <div className="cy-frame-container w-full max-w-5xl flex relative h-[95vh] max-h-[850px]">

                {/* 메인 프레임 */}
                <div className="cy-inner-frame flex-1 flex flex-col shadow-sm overflow-hidden bg-white">
                    {/* 상단바: 제목 및 방문자 수 */}
                    <div className="flex justify-between items-end mb-3 border-b border-slate-100 pb-2 px-4 shrink-0">
                        <div className="flex items-center gap-3">
                            <h1 className="text-sm sm:text-lg font-bold text-slate-700 tracking-tight truncate max-w-[200px] sm:max-w-none">
                                {currentUser.name}대의 미니홈피
                                <span className="ml-2 text-[10px] font-normal text-blue-500 underline cursor-pointer">평도</span>
                            </h1>
                        </div>
                        <div className="flex gap-2 sm:gap-4 text-[10px] text-slate-500 font-bold">
                            <span className="flex items-center gap-1">TODAY <span className="text-red-500">24</span></span>
                            <span className="w-px h-2 bg-slate-200 mt-1 hidden sm:block"></span>
                            <span className="flex items-center gap-1">TOTAL <span className="text-slate-800">1,245</span></span>
                        </div>
                    </div>

                    <div className="flex flex-1 gap-2 sm:gap-4 overflow-hidden px-4 pb-4 flex-col md:flex-row min-h-0">
                        {/* 왼쪽 사이드바 (프로필 영역) - 모바일에서는 상단에 작게 표시 */}
                        <div className="w-full md:w-48 flex md:flex-col gap-2 shrink-0 md:min-h-0">
                            <div className="w-20 md:w-full aspect-square bg-slate-50 border border-slate-200 rounded p-1 flex items-center justify-center overflow-hidden shrink-0">
                                <CharacterView character={character} size="w-full h-full" />
                            </div>
                            <div className="flex-1 flex flex-col justify-center min-w-0">
                                <div className="border-t-2 border-dashed border-slate-200 pt-2 text-[10px] text-slate-600 leading-tight hidden md:block">
                                    <p className="font-bold text-blue-600 mb-1 truncate">TODAY IS... {previewItem ? '쇼핑중' : '말씀열공'}</p>
                                    <p className="line-clamp-2">꾸준한 성경 읽기로 달란트를 모아 방을 예쁘게 꾸미고 있어요!</p>
                                </div>
                                <div className="mt-2 md:mt-auto">
                                    <div className="p-1 px-2 bg-orange-50 rounded border border-orange-100 flex md:flex-col items-center justify-between md:justify-center">
                                        <span className="text-[9px] font-bold text-orange-400">내 달란트</span>
                                        <span className="text-xs sm:text-sm font-black text-orange-600">⭐ {currentTalants.toLocaleString()}</span>
                                    </div>
                                    <select className="w-full mt-1 text-[9px] border border-slate-200 rounded p-1 hidden md:block">
                                        <option>일촌 파도타기</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* 메인 콘텐츠 영역 (미니룸 등) */}
                        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                            {/* 중간 탭 메뉴 */}
                            <div className="flex gap-1 shrink-0">
                                <button onClick={() => { setActiveTab('main'); setPreviewItem(null); }} className={`px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-bold rounded-t-lg border-x border-t transition-all ${activeTab === 'main' ? 'bg-white border-slate-200 text-slate-800 -mb-px z-10' : 'bg-slate-50 border-transparent text-slate-400'}`}>미니룸</button>
                                <button onClick={() => { setActiveTab('shop'); setPreviewItem(null); }} className={`px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-bold rounded-t-lg border-x border-t transition-all ${activeTab === 'shop' ? 'bg-white border-slate-200 text-slate-800 -mb-px z-10' : 'bg-slate-50 border-transparent text-slate-400'}`}>선물가게</button>
                                <button onClick={() => { setActiveTab('inventory'); setPreviewItem(null); }} className={`px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-bold rounded-t-lg border-x border-t transition-all ${activeTab === 'inventory' ? 'bg-white border-slate-200 text-slate-800 -mb-px z-10' : 'bg-slate-50 border-transparent text-slate-400'}`}>보관함</button>
                            </div>

                            <div className="flex-1 bg-white border border-slate-200 rounded-b-lg p-2 sm:p-4 overflow-hidden relative flex flex-col min-h-0">
                                {activeTab === 'main' && (
                                    <div className="h-full flex flex-col min-h-0">
                                        <div className="flex justify-between items-center mb-2 shrink-0">
                                            <span className="text-[10px] font-bold text-slate-400">Miniroom Stage #0{roomData.activeRoomIndex + 1}</span>
                                            <div className="flex gap-1">
                                                {roomData.rooms.map((_, idx) => (
                                                    <button key={idx} onClick={() => updateRoom({ activeRoomIndex: idx })} className={`w-4 h-4 sm:w-5 sm:h-5 text-[9px] sm:text-[10px] font-bold rounded border ${roomData.activeRoomIndex === idx ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}>{idx + 1}</button>
                                                ))}
                                                {roomData.unlockedRooms < 5 && (
                                                    <button onClick={unlockRoom} className="w-4 h-4 sm:w-5 sm:h-5 text-[9px] sm:text-[10px] bg-slate-100 text-slate-400 rounded border border-slate-200 hover:bg-slate-200">+</button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-1 flex items-center justify-center bg-[#f0f0f0] rounded-2xl sm:rounded-3xl border border-slate-200/50 shadow-inner overflow-hidden relative min-h-0">
                                            <div className="transform scale-[0.4] mini:scale-[0.5] sm:scale-[0.6] md:scale-75 lg:scale-95 transition-transform origin-center">
                                                <RoomCanvas
                                                    activeRoom={activeRoom}
                                                    character={character}
                                                    previewItem={previewItem}
                                                    previewPos={previewPos}
                                                    selectedPlacementId={selectedPlacementId}
                                                    movePlacedItem={movePlacedItem}
                                                    moveCharacter={moveCharacter}
                                                    onGridClick={(gx, gy) => {
                                                        // 미리보기 아이템 위치만 클릭으로 변경 지원
                                                        if (previewItem) setPreviewPos({ x: gx, y: gy });
                                                    }}
                                                    onItemClick={(item) => setSelectedPlacementId(item.id)}
                                                    onCharacterClick={() => setSelectedPlacementId('character')}
                                                    onPreviewClick={() => setSelectedPlacementId('preview')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'shop' && (
                                    <div className="h-full overflow-y-auto min-h-0 scrollbar-hide">
                                        <ShopSection
                                            shopCategory={shopCategory}
                                            setShopCategory={setShopCategory}
                                            buyItem={buyItem}
                                            inventory={inventory}
                                            onPreview={handleSetPreviewItem}
                                            currentTalants={currentTalants}
                                        />
                                    </div>
                                )}

                                {activeTab === 'inventory' && (
                                    <div className="h-full overflow-y-auto min-h-0 scrollbar-hide">
                                        <InventorySection
                                            inventory={inventory}
                                            onUseItem={(item) => {
                                                const category = item.category;
                                                const currentRooms = [...roomData.rooms];
                                                const activeIdx = roomData.activeRoomIndex;

                                                if (category === 'wallpaper') {
                                                    updateRoom({ rooms: currentRooms.map((r, i) => i === activeIdx ? { ...r, wallpaper: item.id } : r) });
                                                } else if (category === 'floor') {
                                                    updateRoom({ rooms: currentRooms.map((r, i) => i === activeIdx ? { ...r, floor: item.id } : r) });
                                                } else if (['character', 'hair', 'accessory', 'outfit', 'eye', 'expression', 'hand'].includes(category)) {
                                                    const keyMap = {
                                                        'character': 'baseId',
                                                        'hair': 'hairId',
                                                        'accessory': 'accessoryId',
                                                        'outfit': 'outfitId',
                                                        'eye': 'eyeId',
                                                        'expression': 'expressionId',
                                                        'hand': 'handId'
                                                    };
                                                    updateCharacter({ [keyMap[category]]: item.id });
                                                } else {
                                                    placeItem(item.id, 4, 4);
                                                }
                                                setActiveTab('main');
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* 하단 일촌평/방명록 레이어 (간소화) */}
                            <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-100 hidden sm:block shrink-0">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-slate-700">일촌평</span>
                                    <button className="text-[9px] text-blue-500 font-bold hover:underline">더보기 +</button>
                                </div>
                                <div className="text-[9px] flex gap-2">
                                    <span className="font-bold text-slate-500">김집사</span>
                                    <span className="text-slate-700 truncate">오늘도 말씀 은혜롭네요~!!</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 싸이월드 우측 세로 탭 - 큰 화면에서만 표시 */}
                <div className="flex flex-col ml-[-1px] mt-12 z-20 hidden lg:flex shrink-0">
                    <button onClick={() => setView('dashboard')} className="cy-side-tab !bg-orange-500 border-orange-600 !h-16 flex-col gap-1 shadow-lg active:translate-x-1">
                        <span className="text-[10px] leading-none">📖</span>
                        <span>성경읽기</span>
                    </button>
                    <button onClick={() => setSideTab('room')} className={`cy-side-tab ${sideTab === 'room' ? 'active' : ''}`}>룸</button>
                    <button onClick={() => setSideTab('guestbook')} className={`cy-side-tab ${sideTab === 'guestbook' ? 'active' : ''}`}>방명록</button>
                    <button className="cy-side-tab">프로필</button>
                    <button className="cy-side-tab">다이어리</button>
                </div>
            </div>

            {/* 미리보기 종료 및 구매 플로팅 카드 */}
            {previewItem && activeTab === 'main' && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-[400px] animate-in slide-in-from-bottom-8 duration-500">
                    <div className="bg-white/90 backdrop-blur-md border-2 border-indigo-100 p-4 rounded-[2.5rem] shadow-[0_20px_50px_rgba(79,70,229,0.2)] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100">
                                <span className="text-2xl">{previewItem.icon || '✨'}</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">Previewing</p>
                                <p className="text-sm font-bold text-slate-800 truncate">{previewItem.name}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {!inventory.includes(previewItem.id) ? (
                                <button
                                    onClick={() => buyItem(previewItem)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs shadow-lg shadow-indigo-200 transition-all active:scale-95"
                                >
                                    {previewItem.price}⭐ 구매
                                </button>
                            ) : (
                                <div className="bg-slate-100 text-slate-400 px-4 py-2.5 rounded-2xl font-black text-[10px]">보유 중</div>
                            )}
                            <button
                                onClick={() => setPreviewItem(null)}
                                className="w-10 h-10 bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-full flex items-center justify-center transition-colors active:scale-95"
                                title="미리보기 종료"
                            >
                                <span className="text-xl leading-none">&times;</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MiniRoomPage;
