import { auth, db } from './firebase';
import { titleMatchesDate } from './dailyVideoPolicy';
import {
    migratePersonalTalentWallet as migratePersonalTalentWalletViaApi,
    PlatformApiError,
} from './platformApi';
import { getYearCompletedRounds } from './annualReading.js';

export { titleMatchesDate };
export { parseChapters, mapToStandardLabel, parseAndMapChapters } from './dailyVideoChapters.js';

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
    getYearCompletedRounds(member) * 365
    + Math.max(0, (member?.currentDay || 1) - 1)
);

// T132에서 운영 미이관 계정을 사전 백필하고 브라우저 이관 writer를 제거했다.
// 기존 호출부는 호환을 위해 유지하되 운영 데이터를 쓰지 않는다.
export const migrateTalentIfNeeded = async () => null;

const MAX_TALENT_BALANCE = 1_000_000_000;
const isCanonicalOrgId = value => (
    typeof value === 'string'
    && value.length >= 1 && value.length <= 128
    && value === value.trim()
    && value !== '.' && value !== '..'
    && !value.includes('/')
    && !/[\u0000-\u001f\u007f]/.test(value)
);
const walletMigrationStateError = () => new PlatformApiError(
    '개인 달란트 지갑 이관 상태를 안전하게 확인하지 못했습니다.',
    { code: 'INVALID_RESPONSE', status: 200, retryable: true },
);
const walletMigrationAuthChangedError = () => new PlatformApiError(
    '로그인 계정이 바뀌었습니다. 다시 시도해주세요.',
    { code: 'AUTH_CHANGED', status: 401, retryable: false },
);

// 개인 계정 지갑 이관은 서버 action만 쓴다. 성공 응답 뒤에도 응답 본문을
// 사용자 상태로 신뢰하지 않는다. primary roster가 있으면 users와 roster를
// 같은 read-only transaction으로 확인하고, 과거 제명으로 primary roster만
// 없는 계정은 source-server users를 엄격히 확인한 뒤 로그인만 계속한다.

export const migratePersonalTalentWalletIfNeeded = async (uid, primaryOrgId, knownUserData = null) => {
    const requestUid = String(uid || '').trim();
    if (!requestUid || auth?.currentUser?.uid !== requestUid) {
        throw walletMigrationAuthChangedError();
    }

    // 로그인 직전 읽은 힌트는 확실한 비대상만 생략한다. 완료·0 잔액처럼 보여도
    // 서버가 primary roster와 최신 상태를 다시 확인해야 손상·직후 환불 경합을 놓치지 않는다.
    if (knownUserData && knownUserData.accountType !== 'personal') return null;
    if (knownUserData?.accountType === 'personal') {
        const hasKnownPrimaryOrg = Boolean(
            String(knownUserData.primaryOrgId || primaryOrgId || '').trim(),
        );
        if (!hasKnownPrimaryOrg) return null;
    }

    const migrationResponse = await migratePersonalTalentWalletViaApi({ expectedUid: requestUid });
    if (auth?.currentUser?.uid !== requestUid) throw walletMigrationAuthChangedError();

    const userRef = db.collection('users').doc(requestUid);
    if (migrationResponse.result.status === 'primaryMissing') {
        const userSnap = await userRef.get({ source: 'server' });
        if (!userSnap.exists || auth?.currentUser?.uid !== requestUid) {
            throw walletMigrationStateError();
        }
        const user = userSnap.data() || {};
        const validDeletedState = user.isDeleted === undefined
            || typeof user.isDeleted === 'boolean';
        const validMigrationFlag = user.talentWalletMigrated === undefined
            || typeof user.talentWalletMigrated === 'boolean';
        if (user.role !== 'member'
            || user.accountType !== 'personal'
            || !validDeletedState
            || user.isDeleted === true
            || !validMigrationFlag
            || !isCanonicalOrgId(user.primaryOrgId)
            || !Number.isSafeInteger(user.talent)
            || user.talent < 0
            || user.talent > MAX_TALENT_BALANCE) {
            throw walletMigrationStateError();
        }
        if (auth?.currentUser?.uid !== requestUid) throw walletMigrationAuthChangedError();
        return null;
    }

    const canonicalState = await db.runTransaction(async transaction => {
        if (auth?.currentUser?.uid !== requestUid) throw walletMigrationAuthChangedError();
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists || auth?.currentUser?.uid !== requestUid) {
            throw walletMigrationStateError();
        }
        const user = userSnap.data() || {};
        const orgId = user.primaryOrgId;
        if (user.accountType !== 'personal'
            || user.isDeleted === true
            || user.talentWalletMigrated !== true
            || user.talent !== 0
            || !isCanonicalOrgId(orgId)) {
            throw walletMigrationStateError();
        }

        const rosterRef = db.collection('churches').doc(orgId).collection('roster').doc(requestUid);
        const rosterSnap = await transaction.get(rosterRef);
        if (!rosterSnap.exists || auth?.currentUser?.uid !== requestUid) {
            throw walletMigrationStateError();
        }
        const roster = rosterSnap.data() || {};
        if (roster.uid !== requestUid
            || !Number.isSafeInteger(roster.talent)
            || roster.talent < 0
            || roster.talent > MAX_TALENT_BALANCE) {
            throw walletMigrationStateError();
        }
        return { orgId, talent: roster.talent };
    });

    if (auth?.currentUser?.uid !== requestUid) throw walletMigrationAuthChangedError();
    return canonicalState;
};

// Firestore 문서 → 사용자 상태 객체 변환
export const userDocToState = (doc) => {
    const d = doc.data();
    const readingEpoch = Number.isSafeInteger(d.readingEpoch) && d.readingEpoch >= 0
        ? d.readingEpoch
        : 0;
    const streak = Number.isSafeInteger(d.streak) && d.streak >= 0 ? d.streak : 0;
    const storedMaxStreak = Number.isSafeInteger(d.maxStreak) && d.maxStreak >= 0
        ? d.maxStreak
        : streak;
    return {
        uid: doc.id,
        name: d.name,
        email: d.email || null,
        birthdate: d.birthdate || null,
        password: d.password,
        role: d.role || 'member',
        onboardingPending: d.onboardingPending === true,
        accountType: d.accountType || null,
        authProvider: d.authProvider || null,
        authProviders: Array.isArray(d.authProviders) ? d.authProviders : [],
        primaryOrgId: d.primaryOrgId || null,
        churchId: d.churchId || null,
        churchName: d.churchName || null,
        extraMemberships: Array.isArray(d.extraMemberships) ? d.extraMemberships : [],
        startDate: d.startDate,
        currentDay: d.currentDay ?? 1,
        readingEpoch,
        streak,
        maxStreak: Math.max(storedMaxStreak, streak),
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
        quizProgress: d.quizProgress && typeof d.quizProgress === 'object' && !Array.isArray(d.quizProgress)
            ? d.quizProgress
            : {},
        quizRewardDate: d.quizRewardDate ?? null,
        quizRewardAmount: d.quizRewardAmount ?? 0,
        quizLevel: ['standard', 'easy'].includes(d.quizLevel) ? d.quizLevel : null,
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
        readingEpoch: d.readingEpoch ?? 0,
        readingYear: d.readingYear ?? null,
        yearCompletedRounds: d.yearCompletedRounds ?? null,
        lifetimeCompletedRounds: d.lifetimeCompletedRounds ?? null,
        readHistory: d.readHistory ?? [],
        recentReadDates: d.recentReadDates ?? [],
        dailyAdvanceDate: d.dailyAdvanceDate ?? null,
        dailyAdvanceCount: d.dailyAdvanceCount ?? 0,
        weeklyReadKey: d.weeklyReadKey ?? null,
        weeklyReadCount: d.weeklyReadCount ?? 0,
        fixtureType: d.fixtureType ?? null,
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
export const getActualDay = (currentDay, dayOffset, totalDays = 365) => {
    const safeTotalDays = Number.isSafeInteger(totalDays) && totalDays > 0 ? totalDays : 365;
    let actualDay = currentDay + dayOffset;
    while (actualDay > safeTotalDays) actualDay -= safeTotalDays;
    while (actualDay < 1) actualDay += safeTotalDays;
    return actualDay;
};
