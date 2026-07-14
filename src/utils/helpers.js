import { db } from './firebase';
import { SHOP_ITEMS } from '../data/shop_items';

// 교인 로그인용 가짜 이메일 (이름+생년월일+교회ID 조합으로 교회 간 중복 방지)
export const makePseudoEmail = (name, birthdate, churchId = '') => {
    const base = `${encodeURIComponent(String(name || "").trim())}_${String(birthdate || "").trim()}`;
    return churchId ? `${base}_${churchId}@bible.local` : `${base}@bible.local`;
};

export const makeUnaffiliatedIdentity = (birthdate, phone4) =>
    `${String(birthdate || '').trim()}p${String(phone4 || '').trim()}`;

// currentDay는 "다음에 읽을 날"이다. 누적 진행/랭킹처럼 실제로 읽은 날 수를
// 보여줄 때만 이 값을 사용하고, 본문 DAY·달리기 위치에는 currentDay를 그대로 쓴다.
export const getDaysRead = (member) => (
    ((member?.readCount || 1) - 1) * 365
    + Math.max(0, (member?.currentDay || 1) - 1)
);

const FREE_DEFAULTS = ['wall_plain_white', 'floor_plain_white', 'base_man', 'eye_basic', 'expr_happy'];

// 지연(lazy) 마이그레이션: score/talent 이중화 이전 계정을 1회성으로 복구한다.
// talentMigrated가 없으면 과거 구매 총액(아이템+방 해금)을 역산해
// talent = 기존 score, score = 기존 score + 구매총액 으로 갱신한다.
// 반환값: 마이그레이션 후 반영해야 할 { talent, score } 또는 null(마이그레이션 불필요)
//
// Fix D: 동시 호출(예: 로그인 화면과 세션 복구가 겹치는 경우) 시 이중 실행으로 보상이
// 두 번 반영되거나, 마이그레이션 계산 중간에 handleRead 등 다른 트랜잭션이 score/talent를
// 바꿔써서 그 결과가 유실되는 것을 막기 위해 read+compute+write 전체를 트랜잭션으로 묶는다.
// 트랜잭션 내부에서 "최신" 스냅샷 기준으로 talentMigrated를 재확인하고 spent를 재계산하므로,
// 두 번째 호출은 항상 조기 종료하고(null), 인터리빙된 handleRead 커밋도 손실 없이 반영된다.
export const migrateTalentIfNeeded = async (uid, data) => {
    if (data.talentMigrated) return null;

    const userRef = db.collection('users').doc(uid);

    return db.runTransaction(async (transaction) => {
        const snap = await transaction.get(userRef);
        if (!snap.exists) return null;
        const fresh = snap.data();

        // 트랜잭션 내부에서 최신 값 기준으로 재확인 — 동시 호출 시 두 번째 실행은 여기서 멈춘다.
        if (fresh.talentMigrated) return null;

        const spentItems = (fresh.inventory || [])
            .filter(id => !FREE_DEFAULTS.includes(id))
            .reduce((sum, id) => sum + (SHOP_ITEMS.find(i => i.id === id)?.price || 0), 0);

        const unlocked = fresh.miniroom?.unlockedRooms || 1;
        let spentRooms = 0;
        for (let i = 1; i < unlocked; i++) spentRooms += 800 + (i - 1) * 400;

        const spent = spentItems + spentRooms;
        const talent = fresh.score || 0;
        const score = (fresh.score || 0) + spent;

        transaction.update(userRef, {
            talent,
            score,
            talentMigrated: true,
        });

        return { talent, score };
    });
};

// 개인 계정이 공동체별 지갑 모델을 처음 사용할 때 기존 users.talent를
// 기준 공동체 roster.talent로 한 번만 옮긴다. 트랜잭션 안의 플래그 재확인으로 멱등성을 보장한다.
export const migratePersonalTalentWalletIfNeeded = async (uid, primaryOrgId) => {
    const normalizedOrgId = String(primaryOrgId || '').trim();
    if (!uid || !normalizedOrgId) return null;
    const userRef = db.collection('users').doc(uid);
    const rosterRef = db.collection('churches').doc(normalizedOrgId).collection('roster').doc(uid);

    return db.runTransaction(async transaction => {
        const [userSnap, rosterSnap] = await Promise.all([
            transaction.get(userRef),
            transaction.get(rosterRef),
        ]);
        if (!userSnap.exists || !rosterSnap.exists) return null;
        const user = userSnap.data();
        if (user.accountType !== 'personal' || user.talentWalletMigrated === true) return null;

        const movedTalent = Number(user.talent) || 0;
        const rosterTalent = Number(rosterSnap.data()?.talent) || 0;
        const nextRosterTalent = rosterTalent + movedTalent;
        transaction.update(userRef, {
            talent: 0,
            talentWalletMigrated: true,
        });
        transaction.update(rosterRef, { talent: nextRosterTalent });
        return { orgId: normalizedOrgId, talent: nextRosterTalent, movedTalent };
    });
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
        accountType: d.accountType || null,
        authProvider: d.authProvider || null,
        authProviders: Array.isArray(d.authProviders) ? d.authProviders : [],
        primaryOrgId: d.primaryOrgId || null,
        churchId: d.churchId || null,
        churchName: d.churchName || null,
        extraMemberships: Array.isArray(d.extraMemberships) ? d.extraMemberships : [],
        startDate: d.startDate,
        currentDay: d.currentDay ?? 1,
        streak: d.streak ?? 0,
        score: d.score ?? 0,
        talent: d.talent,
        talentMigrated: d.talentMigrated ?? false,
        talentWalletMigrated: d.talentWalletMigrated ?? false,
        secretShopUnlocked: d.secretShopUnlocked ?? false,
        quizDate: d.quizDate ?? null,
        quizAttempts: d.quizAttempts ?? 0,
        quizSolved: d.quizSolved ?? false,
        quizSkipped: d.quizSkipped ?? false,
        quizKey: d.quizKey ?? null,
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
        recentReadDates: d.recentReadDates ?? [],
        dailyAdvanceDate: d.dailyAdvanceDate ?? null,
        dailyAdvanceCount: d.dailyAdvanceCount ?? 0,
        // 미니룸 관련: useMiniRoom이 undefined(=미초기화)를 판별에 사용하므로 기본값 없이 그대로 전달
        miniroom: d.miniroom,
        character: d.character,
        inventory: d.inventory,
        isDeleted: d.isDeleted ?? false,
        deletedAt: d.deletedAt ?? null,
        deletedBy: d.deletedBy ?? null,
        videoMode: d.videoMode === 'kids' ? 'kids' : 'adult',
    };
};

// 영상 날짜 = 한국시간 현재시각에서 3시간을 뺀 날짜.
// 7/1 02:59(KST) → "2026-06-30", 7/1 03:00 → "2026-07-01".
// UTC 연산이므로 해외 접속자도 동일하게 동작한다.
export const getVideoDateKST = () => {
    const shifted = new Date(Date.now() + 9 * 3600e3 - 3 * 3600e3);
    return shifted.toISOString().slice(0, 10);
};

const isValidMonthDay = (month, day) => {
    if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (month < 1 || month > 12 || day < 1) return false;
    return day <= new Date(2024, month, 0).getDate();
};

export const titleMatchesDate = (title, dateKey) => {
    if (!title || !dateKey) return false;
    const target = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!target) return false;
    const targetYear = Number(target[1]);
    const targetMonth = Number(target[2]);
    const targetDay = Number(target[3]);
    const text = String(title);

    const candidates = [];
    const pushMonthDay = (month, day) => {
        if (isValidMonthDay(month, day)) candidates.push({ month, day });
    };
    const pushYearMonthDay = (year, month, day) => {
        if (year === targetYear && isValidMonthDay(month, day)) candidates.push({ month, day });
    };

    for (const match of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
        pushMonthDay(Number(match[1]), Number(match[2]));
    }
    for (const match of text.matchAll(/(?<!\d)(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/g)) {
        pushMonthDay(Number(match[1]), Number(match[2]));
    }
    for (const match of text.matchAll(/(?<!\d)(\d{1,2})\s*\.\s*(\d{1,2})(?!\d)/g)) {
        pushMonthDay(Number(match[1]), Number(match[2]));
    }
    for (const match of text.matchAll(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g)) {
        pushYearMonthDay(Number(match[1]), Number(match[2]), Number(match[3]));
    }
    for (const match of text.matchAll(/(?<!\d)(\d{2})(\d{2})(?!\d)/g)) {
        pushMonthDay(Number(match[1]), Number(match[2]));
    }

    // titleMatchesDate('7월 10일 매일성경', '2026-07-10') === true
    // titleMatchesDate('07.10 신앙생활 1분만', '2026-07-10') === true
    // titleMatchesDate('7/10 매일성경', '2026-07-10') === true
    // titleMatchesDate('12월 25일 성탄 묵상', '2026-07-10') === false
    // titleMatchesDate('13월 40일 잘못된 날짜', '2026-07-10') === false
    return candidates.some(({ month, day }) => month === targetMonth && day === targetDay);
};

// 유튜브 URL에서 videoId 추출.
// 지원 형식: youtu.be/{id}, watch?v={id}, /live/{id}, /shorts/{id}, /embed/{id}
export const extractYouTubeId = (url) => {
    if (!url || typeof url !== 'string') return null;
    const patterns = [
        /youtu\.be\/([A-Za-z0-9_-]{11})/,
        /[?&]v=([A-Za-z0-9_-]{11})/,
        /\/live\/([A-Za-z0-9_-]{11})/,
        /\/shorts\/([A-Za-z0-9_-]{11})/,
        /\/embed\/([A-Za-z0-9_-]{11})/,
    ];
    for (const re of patterns) {
        const m = url.match(re);
        if (m) return m[1];
    }
    return null;
};

// 재생목록 URL 또는 순수 ID에서 재생목록 ID를 추출.
// "https://www.youtube.com/playlist?list=PLxxxx" 형식과 원본 ID(PL..., UU...) 둘 다 허용.
export const extractYouTubePlaylistId = (input) => {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    const m = trimmed.match(/[?&]list=([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    return trimmed || null;
};

// "매일성경 해설 0:00" / "0:00 매일성경 해설" 양쪽 지원.
// 유튜브 설명문에서 타임스탬프(0:00, 3:20, 1:02:15)를 찾아 같은 줄의 텍스트를 라벨로 추출한다.
//
// 주의(Fix H): 줄 중간의 성경 구절 표기(예: "마태복음 5:12", "성경읽기: 마태복음 5:12")가
// 타임스탬프로 오인되는 것을 막기 위해, 먼저 줄 "시작"에 타임스탬프가 오는 표준 형식
// (예: "0:00 해설", "1:02:15 기도")만 우선 매칭한다. 실제 유튜브 챕터 표기 관례가 대부분
// 이 형식이라 라벨당 정상 동작한다. 다만 "해설 0:00"처럼 라벨이 타임스탬프보다 앞에 오는
// 줄도 지원해야 하므로, 줄 시작 매칭이 하나도 없는 설명문에 한해서만 줄 중간(라벨-먼저)
// 매칭으로 폴백한다 — 이러면 줄 시작 매칭이 존재하는 설명문에서는 절대 구절 표기가
// 타임스탬프로 오인되지 않는다.
const LEADING_TIMESTAMP_RE = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/;
const ANY_TIMESTAMP_RE = /(\d{1,2}:)?(\d{1,2}):(\d{2})/;

const toSec = (m) => (m[1] ? parseInt(m[1]) * 3600 : 0) + parseInt(m[2]) * 60 + parseInt(m[3]);
const cleanLabel = (line, matchText) =>
    line.replace(matchText, '').trim().replace(/^[-–|·:]+|[-–|·:]+$/g, '').trim();

export const parseChapters = (desc) => {
    const lines = (desc || '').split('\n');

    const leading = [];
    for (const line of lines) {
        const m = line.match(LEADING_TIMESTAMP_RE);
        if (!m) continue;
        const label = cleanLabel(line, m[0]);
        if (label) leading.push({ label, sec: toSec(m) });
    }
    if (leading.length > 0) return leading;

    // 줄 시작 매칭이 하나도 없을 때만 "라벨 먼저" 형식(예: "해설 0:00")을 위해
    // 줄 중간 매칭으로 폴백한다.
    const out = [];
    for (const line of lines) {
        const m = line.match(ANY_TIMESTAMP_RE);
        if (!m) continue;
        const label = cleanLabel(line, m[0]);
        if (label) out.push({ label, sec: toSec(m) });
    }
    return out;
};

// 파싱된 자유 라벨을 표준 라벨(해설/성경읽기/기도)로 매핑. 매핑 안 되면 null.
export const mapToStandardLabel = (label) => {
    if (label.includes('해설')) return '해설';
    if (label.includes('성경') || label.includes('읽기')) return '성경읽기';
    if (label.includes('기도')) return '기도';
    return null;
};

// 설명문을 파싱해 표준 라벨로 매핑된 챕터 배열을 반환 (매핑 안 되는 챕터는 무시, 라벨당 최초 1개만 채택)
export const parseAndMapChapters = (desc) => {
    const parsed = parseChapters(desc);
    const mapped = [];
    parsed.forEach(({ label, sec }) => {
        const std = mapToStandardLabel(label);
        if (std && !mapped.find(m => m.label === std)) {
            mapped.push({ label: std, sec });
        }
    });
    return mapped;
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

// 실제 본문 Day 계산 (dayOffset은 Day 1의 날짜를 의미, currentDay는 현재 읽고 있는 Day)
export const getActualDay = (currentDay, dayOffset) => {
    let actualDay = currentDay + dayOffset;
    while (actualDay > 365) actualDay -= 365;
    while (actualDay < 1) actualDay += 365;
    return actualDay;
};
