export const CHARACTER_ITEMS = [
    // --- [캐릭터 베이스 (Character)] ---
    { id: 'base_man', category: 'character', name: '청년 형제', price: 0, icon: '👨', isDefault: true },
    { id: 'base_woman', category: 'character', name: '청년 자매', price: 0, icon: '👩', isDefault: true },
    { id: 'base_boy', category: 'character', name: '남자 어린이', price: 0, icon: '👦', isDefault: true },
    { id: 'base_girl', category: 'character', name: '여자 어린이', price: 0, icon: '👧', isDefault: true },
    { id: 'base_senior_man', category: 'character', name: '장년 형제', price: 0, icon: '👴', isDefault: true },
    { id: 'base_senior_woman', category: 'character', name: '장년 자매', price: 0, icon: '👵', isDefault: true },

    // --- [머리/모자 (Hair/Hat)] ---
    { id: 'hair_short_black', category: 'hair', name: '단정한 흑발 숏컷', price: 30, icon: '👦' },
    { id: 'hair_short_brown', category: 'hair', name: '자연스러운 갈색 숏컷', price: 35, icon: '💇‍♂️' },
    { id: 'hair_short_yellow', category: 'hair', name: '개성있는 금발 숏컷', price: 40, icon: '🙋‍♂️' },
    { id: 'hair_long_black', category: 'hair', name: '찰랑거리는 검은 긴머리', price: 45, icon: '👩' },
    { id: 'hair_long_brown', category: 'hair', name: '부드러운 갈색 긴머리', price: 40, icon: '💇‍♀️' },
    { id: 'hair_long_pink', category: 'hair', name: '신비로운 핑크 긴머리', price: 80, icon: '💖' },
    { id: 'hair_curly_yellow', category: 'hair', name: '발랄한 금발 파마', price: 50, icon: '👱‍♀️' },
    { id: 'hair_curly_blue', category: 'hair', name: '시원한 파란 파마', price: 70, icon: '🌊' },
    { id: 'hair_cap_red', category: 'hair', name: '레드 베이스볼 캡', price: 60, icon: '🧢' },
    { id: 'hair_beanie_blue', category: 'hair', name: '포근한 블루 비니', price: 45, icon: '🧣' },
    { id: 'hair_tiara', category: 'hair', name: '반짝이는 티아라', price: 120, icon: '👑' },

    // --- [눈 모양 (Eyes)] ---
    { id: 'eye_basic', category: 'eye', name: '초롱초롱 눈', price: 0, icon: '👀', isDefault: true },
    { id: 'eye_large', category: 'eye', name: '반짝이는 왕눈이', price: 50, icon: '✨' },
    { id: 'eye_sharp', category: 'eye', name: '도도한 눈매', price: 60, icon: '🦊' },
    { id: 'eye_gentle', category: 'eye', name: '순한 반달 눈', price: 55, icon: '😊' },

    // --- [표정 (Expression)] ---
    { id: 'expr_happy', category: 'expression', name: '은은한 미소', price: 0, icon: '🙂', isDefault: true },
    { id: 'expr_laugh', category: 'expression', name: '활짝 웃음', price: 30, icon: '😃' },
    { id: 'expr_sad', category: 'expression', name: '심각한 표정', price: 30, icon: '😔' },
    { id: 'expr_surprised', category: 'expression', name: '깜놀 표정', price: 40, icon: '😲' },
    { id: 'expr_cool', category: 'expression', name: '무심한 한마디', price: 50, icon: '😑' },
    { id: 'expr_oops', category: 'expression', name: '어머나!', price: 35, icon: '😮' },

    // --- [손 아이템 (Hand-held Items)] ---
    // 성경책 시리즈
    { id: 'hand_bible_red', category: 'hand', name: '빨간색 가죽 성경책', price: 150, icon: '📕' },
    { id: 'hand_bible_black', category: 'hand', name: '검정색 가죽 성경책', price: 150, icon: '📖' },
    { id: 'hand_bible_brown', category: 'hand', name: '빈티지 갈색 성경책', price: 180, icon: '📜' },
    { id: 'hand_bible_blue', category: 'hand', name: '청년부 파란 성경책', price: 160, icon: '📘' },
    { id: 'hand_bible_white', category: 'hand', name: '결혼 예배용 흰 성경책', price: 200, icon: '👰' },
    { id: 'hand_bible_gold', category: 'hand', name: '황금색 성경책 (한정판)', price: 777, icon: '🔱' },
    { id: 'hand_bible_study', category: 'hand', name: '두꺼운 스터디 바이블', price: 220, icon: '📚' },
    { id: 'hand_bible_kids', category: 'hand', name: '어린이 그림 성경', price: 120, icon: '🎨' },
    { id: 'hand_bible_tiny', category: 'hand', name: '주머니 속의 성경', price: 90, icon: '🔖' },
    { id: 'hand_bible_pocket', category: 'hand', name: '휴대용 쪽성경', price: 70, icon: '📄' },

    // 기타 아이템
    { id: 'item_mic', category: 'hand', name: '찬양 인도자용 마이크', price: 300, icon: '🎤' },
    { id: 'item_guitar', category: 'hand', name: '워십 리더 통기타', price: 500, icon: '🎸' },
    { id: 'item_bat', category: 'hand', name: '교회 대항전 야구방망이', price: 250, icon: '🏏' },
    { id: 'item_bag', category: 'hand', name: '평범한 교회 캔버스백', price: 100, icon: '👜' },

    // --- [악세서리 (Accessory)] ---
    { id: 'acc_glasses_horn', category: 'accessory', name: '지적인 뿔테 안경', price: 40, icon: '👓' },
    { id: 'acc_sunglasses_dark', category: 'accessory', name: '시크한 선글라스', price: 80, icon: '😎' },
    { id: 'acc_ribbon_pink', category: 'accessory', name: '왕 리본 핀', price: 35, icon: '🎀' },
    { id: 'acc_mask_white', category: 'accessory', name: '황사 방지 마스크', price: 10, icon: '😷' },

    // --- [의상 (Outfit)] ---
    { id: 'outfit_hoodie_gray', category: 'outfit', name: '무채색 후드티', price: 100, icon: '🧥' },
    { id: 'outfit_suit_black', category: 'outfit', name: '정중한 블랙 수트', price: 250, icon: '👔' },
    { id: 'outfit_dress_yellow', category: 'outfit', name: '화사한 노란 원피스', price: 220, icon: '👗' },
    { id: 'outfit_jersey_blue', category: 'outfit', name: '활동적인 트레이닝복', price: 120, icon: '👕' },
    { id: 'outfit_hanbok', category: 'outfit', name: '설날 맞이 한복', price: 500, icon: '👘' },
    { id: 'outfit_sailor', category: 'outfit', name: '마린 보이 세일러형', price: 150, icon: '⚓' },
    { id: 'outfit_overalls', category: 'outfit', name: '귀요미 멜빵 바지', price: 180, icon: '👖' }
];
