import { useState, useEffect } from 'react';
import { db, firebase } from '../utils/firebase';
import { SHOP_ITEMS } from '../data/shop_items';

export const useMiniRoom = (currentUser, setCurrentUser) => {
    const [roomData, setRoomData] = useState({
        unlockedRooms: 1,
        activeRoomIndex: 0,
        rooms: [
            {
                wallpaper: 'wall_plain_white',
                floor: 'floor_plain_white',
                items: [],
                characterPos: { x: 4, y: 4 }
            }
        ]
    });
    const [character, setCharacter] = useState({
        baseId: 'base_man',
        hairId: null,
        accessoryId: null,
        outfitId: null,
        eyeId: 'eye_basic',
        expressionId: 'expr_happy',
        handId: null
    });
    const [inventory, setInventory] = useState(['wall_plain_white', 'floor_plain_white', 'base_man']);
    const [loading, setLoading] = useState(true);
    const [previewItem, setPreviewItem] = useState(null);

    // 유저 데이터에서 미니룸 정보 로드
    useEffect(() => {
        if (currentUser && currentUser.miniroom) {
            setRoomData(currentUser.miniroom);
            if (currentUser.character) setCharacter(currentUser.character);
            if (currentUser.inventory) setInventory(currentUser.inventory);
            setLoading(false);
        } else if (currentUser) {
            // 초기 데이터 설정
            const initialData = {
                miniroom: {
                    unlockedRooms: 1,
                    activeRoomIndex: 0,
                    rooms: [{
                        wallpaper: 'wall_plain_white',
                        floor: 'floor_plain_white',
                        items: [],
                        characterPos: { x: 4, y: 4 }
                    }]
                },
                character: {
                    baseId: 'base_man',
                    hairId: null,
                    accessoryId: null,
                    outfitId: null,
                    eyeId: 'eye_basic',
                    expressionId: 'expr_happy',
                    handId: null
                },
                inventory: ['wall_plain_white', 'floor_plain_white', 'base_man', 'eye_basic', 'expr_happy']
            };
            setRoomData(initialData.miniroom);
            setCharacter(initialData.character);
            setInventory(initialData.inventory);
            setLoading(false);

            // 최초 접속 시 DB 초기화는 나중에 저장 시점에 수행
        }
    }, [currentUser]);

    const saveToDb = async (newData) => {
        if (!currentUser || !currentUser.uid) return;
        try {
            await db.collection('users').doc(currentUser.uid).set(newData, { merge: true });
            setCurrentUser(prev => ({ ...prev, ...newData }));
        } catch (e) {
            console.error("미니룸 데이터 저장 실패:", e);
        }
    };

    const buyItem = async (item) => {
        if (!currentUser || (currentUser.score || 0) < item.price) {
            alert("달란트가 부족합니다!");
            return false;
        }

        // 이미 가지고 있는 아이템인지 확인 (중복 구매 가능 여부에 따라 다름)
        // 벽지/바닥/캐릭터베이스는 1개만 있으면 됨
        const isOneTime = ['wallpaper', 'floor', 'character', 'hair', 'accessory', 'outfit', 'eye', 'expression', 'hand'].includes(item.category);
        if (isOneTime && inventory.includes(item.id)) {
            alert("이미 보유 중인 아이템입니다.");
            return false;
        }

        const newScore = (currentUser.score || 0) - item.price;
        const newInventory = [...inventory, item.id];

        const update = {
            score: newScore,
            inventory: newInventory,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await saveToDb(update);
            setInventory(newInventory);
            alert(`${item.name}을(를) 구매했습니다!`);
            return true;
        } catch (e) {
            alert("구매 실패");
            return false;
        }
    };

    const updateRoom = (newData) => {
        const updatedRoomData = { ...roomData, ...newData };
        setRoomData(updatedRoomData);
        saveToDb({ miniroom: updatedRoomData });
    };

    const placeItem = (itemId, x, y) => {
        const currentRooms = [...roomData.rooms];
        const activeRoom = { ...currentRooms[roomData.activeRoomIndex] };

        // 아이템 추가 (고유 ID 생성)
        const newItem = {
            id: `${itemId}_${Date.now()}`,
            itemId: itemId,
            x: x,
            y: y
        };

        activeRoom.items = [...(activeRoom.items || []), newItem];
        currentRooms[roomData.activeRoomIndex] = activeRoom;

        updateRoom({ rooms: currentRooms });
    };

    const movePlacedItem = (uniqueId, newX, newY) => {
        const currentRooms = [...roomData.rooms];
        const activeRoom = { ...currentRooms[roomData.activeRoomIndex] };

        activeRoom.items = activeRoom.items.map(item =>
            item.id === uniqueId ? { ...item, x: newX, y: newY } : item
        );

        currentRooms[roomData.activeRoomIndex] = activeRoom;
        updateRoom({ rooms: currentRooms });
    };

    const removePlacedItem = (uniqueId) => {
        const currentRooms = [...roomData.rooms];
        const activeRoom = { ...currentRooms[roomData.activeRoomIndex] };

        activeRoom.items = activeRoom.items.filter(item => item.id !== uniqueId);

        currentRooms[roomData.activeRoomIndex] = activeRoom;
        updateRoom({ rooms: currentRooms });
    };

    const updateCharacter = (updates) => {
        const newCharacter = { ...character, ...updates };
        setCharacter(newCharacter);
        saveToDb({ character: newCharacter });
    };

    const moveCharacter = (x, y) => {
        const currentRooms = [...roomData.rooms];
        const activeRoom = { ...currentRooms[roomData.activeRoomIndex] };

        activeRoom.characterPos = { x, y };
        currentRooms[roomData.activeRoomIndex] = activeRoom;

        updateRoom({ rooms: currentRooms });
    };

    const unlockRoom = async () => {
        if (roomData.unlockedRooms >= 5) return;

        const cost = 800 + (roomData.unlockedRooms - 1) * 400;
        if ((currentUser.score || 0) < cost) {
            alert(`달란트가 부족합니다! (필요: ${cost})`);
            return;
        }

        if (confirm(`방을 확장하시겠습니까? (${cost} 달란트 소요)`)) {
            const newScore = (currentUser.score || 0) - cost;
            const newRoomData = {
                ...roomData,
                unlockedRooms: roomData.unlockedRooms + 1,
                rooms: [...roomData.rooms, {
                    wallpaper: 'wall_plain_white',
                    floor: 'floor_plain_white',
                    items: [],
                    characterPos: { x: 4, y: 4 }
                }]
            };

            await saveToDb({
                score: newScore,
                miniroom: newRoomData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setRoomData(newRoomData);
        }
    };

    return {
        roomData,
        character,
        inventory,
        loading,
        previewItem,
        setPreviewItem,
        buyItem,
        updateRoom,
        placeItem,
        movePlacedItem,
        removePlacedItem,
        updateCharacter,
        moveCharacter,
        unlockRoom,
        activeRoom: roomData.rooms[roomData.activeRoomIndex]
    };
};
