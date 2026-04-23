// 이름 → 가짜 이메일 변환 (Firebase Auth는 이메일 기반이므로 이름을 이메일로 변환)
export const makePseudoEmail = (name) => `${encodeURIComponent(String(name || "").trim())}@bible.local`;

// Firestore 문서 → 사용자 상태 객체 변환
// Firestore에서 가져온 문서를 앱에서 사용하는 형식으로 변환
export const userDocToState = (doc) => {
    const d = doc.data();
    return {
        uid: doc.id,                          // 사용자 고유 ID
        name: d.name,                         // 이름
        password: d.password,                 // 비밀번호 (평문 저장 - 개선 필요)
        startDate: d.startDate,               // 시작 날짜
        currentDay: (d.currentDay !== undefined && d.currentDay !== null) ? d.currentDay : 1,
        streak: (d.streak !== undefined && d.streak !== null) ? d.streak : 0,
        score: (d.score !== undefined && d.score !== null) ? d.score : 0,
        lastReadDate: (d.lastReadDate !== undefined && d.lastReadDate !== null) ? d.lastReadDate : null,
        gender: (d.gender !== undefined && d.gender !== null) ? d.gender : "male",
        communityId: (d.communityId !== undefined && d.communityId !== null) ? d.communityId : null,
        communityName: (d.communityName !== undefined && d.communityName !== null) ? d.communityName : null,
        subgroupId: (d.subgroupId !== undefined && d.subgroupId !== null) ? d.subgroupId : null,
        planId: (d.planId !== undefined && d.planId !== null) ? d.planId : "1year_revised",
        achievements: (d.achievements !== undefined && d.achievements !== null) ? d.achievements : [],
        memos: (d.memos !== undefined && d.memos !== null) ? d.memos : {},
        dayOffset: (d.dayOffset !== undefined && d.dayOffset !== null) ? d.dayOffset : 0,
        readCount: (d.readCount !== undefined && d.readCount !== null) ? d.readCount : 1,
        readHistory: (d.readHistory !== undefined && d.readHistory !== null) ? d.readHistory : [],
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
