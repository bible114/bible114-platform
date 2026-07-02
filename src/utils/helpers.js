import { db } from './firebase';
import { SHOP_ITEMS } from '../data/shop_items';

// 교인 로그인용 가짜 이메일 (이름+생년월일+교회ID 조합으로 교회 간 중복 방지)
export const makePseudoEmail = (name, birthdate, churchId = '') => {
    const base = `${encodeURIComponent(String(name || "").trim())}_${String(birthdate || "").trim()}`;
    return churchId ? `${base}_${churchId}@bible.local` : `${base}@bible.local`;
};

const FREE_DEFAULTS = ['wall_plain_white', 'floor_plain_white', 'base_man', 'eye_basic', 'expr_happy'];

// 지연(lazy) 마이그레이션: score/talent 이중화 이전 계정을 1회성으로 복구한다.
// talentMigrated가 없으면 과거 구매 총액(아이템+방 해금)을 역산해
// talent = 기존 score, score = 기존 score + 구매총액 으로 갱신한다.
// 반환값: 마이그레이션 후 반영해야 할 { talent, score } 또는 null(마이그레이션 불필요)
export const migrateTalentIfNeeded = async (uid, data) => {
    if (data.talentMigrated) return null;

    const spentItems = (data.inventory || [])
        .filter(id => !FREE_DEFAULTS.includes(id))
        .reduce((sum, id) => sum + (SHOP_ITEMS.find(i => i.id === id)?.price || 0), 0);

    const unlocked = data.miniroom?.unlockedRooms || 1;
    let spentRooms = 0;
    for (let i = 1; i < unlocked; i++) spentRooms += 800 + (i - 1) * 400;

    const spent = spentItems + spentRooms;
    const talent = data.score || 0;
    const score = (data.score || 0) + spent;

    await db.collection('users').doc(uid).update({
        talent,
        score,
        talentMigrated: true,
    });

    return { talent, score };
};

// Firestore 문서 → 사용자 상태 객체 변환
export const userDocToState = (doc) => {
    const d = doc.data();
    return {
        uid: doc.id,
        name: d.name,
        email: d.email || null,
        birthdate: d.birthdate || null,
        password: d.password,
        role: d.role || 'member',
        churchId: d.churchId || null,
        churchName: d.churchName || null,
        startDate: d.startDate,
        currentDay: d.currentDay ?? 1,
        streak: d.streak ?? 0,
        score: d.score ?? 0,
        talent: d.talent,
        talentMigrated: d.talentMigrated ?? false,
        lastReadDate: d.lastReadDate ?? null,
        gender: d.gender ?? "male",
        departmentId: d.departmentId ?? d.communityId ?? null,
        departmentName: d.departmentName ?? d.communityName ?? null,
        subgroupId: (typeof d.subgroupId === 'string' ? d.subgroupId : (d.subgroupId?.name ?? null)) ?? null,
        subgroupName: d.subgroupName ?? null,
        planId: d.planId ?? "1year_revised",
        achievements: d.achievements ?? [],
        memos: d.memos ?? {},
        dayOffset: d.dayOffset ?? 0,
        readCount: d.readCount ?? 1,
        readHistory: d.readHistory ?? [],
        isDeleted: d.isDeleted ?? false,
        deletedAt: d.deletedAt ?? null,
        deletedBy: d.deletedBy ?? null,
    };
};

// 숫자를 한자어 수사(일, 이, 삼...)로 변환 (안드로이드 '세 장' 방지용)
export const toSinoKorean = (numStr) => {
    const sinoMap = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const num = parseInt(numStr, 10);
    if (isNaN(num)) return numStr;
    if (num === 0) return sinoMap[0];
    let result = '';
    const units = ['', '십', '백', '천'];
    const str = num.toString();
    for (let i = 0; i < str.length; i++) {
        const digit = parseInt(str[i], 10);
        const pos = str.length - 1 - i;
        if (digit !== 0) {
            if (!(digit === 1 && pos > 0)) result += sinoMap[digit];
            result += units[pos];
        }
    }
    return result;
};

// 날짜 → Day 오프셋 계산 (1월 1일 = 0, 4월 1일 = 90)
export const dateToOffset = (month, day) => {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let offset = 0;
    for (let i = 0; i < month - 1; i++) {
        offset += daysInMonth[i];
    }
    offset += day - 1;
    return offset;
};

// Day 오프셋 → 날짜 문자열 (0 → "1월 1일", 90 → "4월 1일")
export const offsetToDateStr = (offset) => {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let remaining = offset;
    let month = 0;
    while (remaining >= daysInMonth[month]) {
        remaining -= daysInMonth[month];
        month++;
    }
    return `${month + 1}월 ${remaining + 1}일`;
};

// 실제 본문 Day 계산 (dayOffset은 Day 1의 날짜를 의미, currentDay는 현재 읽고 있는 Day)
export const getActualDay = (currentDay, dayOffset) => {
    let actualDay = currentDay + dayOffset;
    while (actualDay > 365) actualDay -= 365;
    while (actualDay < 1) actualDay += 365;
    return actualDay;
};
