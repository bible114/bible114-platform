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
    // 필드별로 독립 적용: 저장된 필드는 사용하고, 없는 필드만 기본값 유지
    // (예: 아이템만 구매하고 방은 안 꾸민 유저 — inventory는 있고 miniroom은 없음)
    useEffect(() => {
        if (!currentUser) return;

        if (currentUser.miniroom) {
            setRoomData(currentUser.miniroom);
        } else {
            setRoomData({
                unlockedRooms: 1,
                activeRoomIndex: 0,
                rooms: [{
                    wallpaper: 'wall_plain_white',
                    floor: 'floor_plain_white',
                    items: [],
                    characterPos: { x: 4, y: 4 }
                }]
            });
        }

        if (currentUser.character) {
            setCharacter(currentUser.character);
        } else {
            setCharacter({
                baseId: 'base_man',
                hairId: null,
                accessoryId: null,
                outfitId: null,
                eyeId: 'eye_basic',
                expressionId: 'expr_happy',
                handId: null
            });
        }

        if (currentUser.inventory) {
            setInventory(currentUser.inventory);
        } else {
            setInventory(['wall_plain_white', 'floor_plain_white', 'base_man', 'eye_basic', 'expr_happy']);
        }

        setLoading(false);
        // 최초 접속 시 DB 초기화는 나중에 저장 시점에 수행
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
        if (!currentUser || currentUser.talent === undefined || (currentUser.talent || 0) < item.price) {
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

        const uid = currentUser.uid;
        const userRef = db.collection('users').doc(uid);

        try {
            let newTalent = null;
            let newInventory = null;

            await db.runTransaction(async (transaction) => {
                const snap = await transaction.get(userRef);
                if (!snap.exists) throw new Error('USER_NOT_FOUND');
                const data = snap.data();
                const freshTalent = data.talent || 0;

                if (freshTalent < item.price) {
                    throw new Error('INSUFFICIENT_TALENT');
                }

                const freshInventory = data.inventory || [];
                if (isOneTime && freshInventory.includes(item.id)) {
                    throw new Error('ALREADY_OWNED');
                }

                newTalent = freshTalent - item.price;
                newInventory = [...freshInventory, item.id];

                transaction.update(userRef, {
                    talent: newTalent,
                    inventory: newInventory,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            setCurrentUser(prev => ({ ...prev, talent: newTalent, inventory: newInventory }));
            setInventory(newInventory);
            alert(`${item.name}을(를) 구매했습니다!`);
            return true;
        } catch (e) {
            if (e.message === 'INSUFFICIENT_TALENT') {
                alert("달란트가 부족합니다!");
            } else if (e.message === 'ALREADY_OWNED') {
                alert("이미 보유 중인 아이템입니다.");
            } else {
                console.error("구매 실패:", e);
                alert("구매 실패");
            }
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
        if (!currentUser || currentUser.talent === undefined) return;

        const cost = 800 + (roomData.unlockedRooms - 1) * 400;
        if ((currentUser.talent || 0) < cost) {
            alert(`달란트가 부족합니다! (필요: ${cost})`);
            return;
        }

        if (confirm(`방을 확장하시겠습니까? (${cost} 달란트 소요)`)) {
            const uid = currentUser.uid;
            const userRef = db.collection('users').doc(uid);

            try {
                let newTalent = null;
                let newRoomData = null;

                await db.runTransaction(async (transaction) => {
                    const snap = await transaction.get(userRef);
                    if (!snap.exists) throw new Error('USER_NOT_FOUND');
                    const data = snap.data();
                    const freshTalent = data.talent || 0;

                    if (freshTalent < cost) {
                        throw new Error('INSUFFICIENT_TALENT');
                    }

                    const freshRoomData = data.miniroom || roomData;
                    if ((freshRoomData.unlockedRooms || 1) >= 5) {
                        throw new Error('MAX_ROOMS');
                    }

                    newTalent = freshTalent - cost;
                    newRoomData = {
                        ...freshRoomData,
                        unlockedRooms: (freshRoomData.unlockedRooms || 1) + 1,
                        rooms: [...freshRoomData.rooms, {
                            wallpaper: 'wall_plain_white',
                            floor: 'floor_plain_white',
                            items: [],
                            characterPos: { x: 4, y: 4 }
                        }]
                    };

                    transaction.update(userRef, {
                        talent: newTalent,
                        miniroom: newRoomData,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                setCurrentUser(prev => ({ ...prev, talent: newTalent, miniroom: newRoomData }));
                setRoomData(newRoomData);
            } catch (e) {
                if (e.message === 'INSUFFICIENT_TALENT') {
                    alert(`달란트가 부족합니다! (필요: ${cost})`);
                } else if (e.message !== 'MAX_ROOMS') {
                    console.error("방 확장 실패:", e);
                    alert("방 확장 실패");
                }
            }
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
