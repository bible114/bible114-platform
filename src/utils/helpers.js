// 교인 로그인용 가짜 이메일 (이름+생년월일+교회ID 조합으로 교회 간 중복 방지)
export const makePseudoEmail = (name, birthdate, churchId = '') => {
    const base = `${encodeURIComponent(String(name || "").trim())}_${String(birthdate || "").trim()}`;
    return churchId ? `${base}_${churchId}@bible.local` : `${base}@bible.local`;
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
        lastReadDate: d.lastReadDate ?? null,
        gender: d.gender ?? "male",
        communityId: d.communityId ?? null,
        communityName: d.communityName ?? null,
        subgroupId: d.subgroupId ?? null,
        planId: d.planId ?? "1year_revised",
        achievements: d.achievements ?? [],
        memos: d.memos ?? {},
        dayOffset: d.dayOffset ?? 0,
        readCount: d.readCount ?? 1,
        readHistory: d.readHistory ?? [],
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
