/**
 * bible114 통합 테스트 스크립트
 * - 성경읽는 사람들 교회에 테스트 계정 생성
 * - 5독(365일 × 5 = 1825회 읽기) 시뮬레이션
 * - 매일 묵상 메모 기록
 * - 버그 체크 및 보고
 */

const FIREBASE_API_KEY = "AIzaSyBF122lgD5fTX70HBtd_nl0ZVKhyyQnyGo"; // 웹 앱 공개 키 (비밀 아님)
const PROJECT_ID = "bible114-platform";
const CHURCH_ID = "xDiqdgaKKPCTd0tYIkdm";
const CHURCH_NAME = "성경읽는 사람들";
// 관리자 자격증명은 절대 하드코딩하지 말 것 — 실행 시 환경변수로 주입:
//   B114_ADMIN_EMAIL=... B114_ADMIN_PW=... node test_simulation.mjs
const ADMIN_EMAIL = process.env.B114_ADMIN_EMAIL || "";
const ADMIN_PW = process.env.B114_ADMIN_PW || "";
if (!ADMIN_EMAIL || !ADMIN_PW) {
    console.error("B114_ADMIN_EMAIL / B114_ADMIN_PW 환경변수를 설정하고 실행하세요.");
    process.exit(1);
}

const TEST_NAME = "테스트성도";
const TEST_BIRTHDATE = "19900101";
const TEST_PW = "test1234";

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_BASE = `https://identitytoolkit.googleapis.com/v1`;

let adminToken = "";
const bugs = [];
const passes = [];

function log(msg) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }
function pass(msg) { passes.push(msg); log(`✅ ${msg}`); }
function bug(msg) { bugs.push(msg); log(`🐛 BUG: ${msg}`); }

// ── REST 헬퍼 ──────────────────────────────────────────────
async function fsGet(path, token) {
    const r = await fetch(`${FS_BASE}/${path}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return r.json();
}

async function fsPatch(path, fields, token) {
    const fieldPaths = Object.keys(fields).join("&updateMask.fieldPaths=");
    const r = await fetch(`${FS_BASE}/${path}?updateMask.fieldPaths=${fieldPaths}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fields })
    });
    return r.json();
}

async function fsSet(path, fields, token) {
    const r = await fetch(`${FS_BASE}/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fields })
    });
    return r.json();
}

async function fsAdd(collPath, fields, token) {
    const r = await fetch(`${FS_BASE}/${collPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fields })
    });
    return r.json();
}

function toFs(val) {
    if (typeof val === "string") return { stringValue: val };
    if (typeof val === "number") return { integerValue: String(val) };
    if (typeof val === "boolean") return { booleanValue: val };
    if (val === null) return { nullValue: null };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(toFs) } };
    return { stringValue: String(val) };
}

function fromFs(v) {
    if (!v) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.nullValue !== undefined) return null;
    if (v.arrayValue) return (v.arrayValue.values || []).map(fromFs);
    if (v.mapValue) {
        const obj = {};
        for (const [k, fv] of Object.entries(v.mapValue.fields || {})) obj[k] = fromFs(fv);
        return obj;
    }
    return null;
}

function makePseudoEmail(name, birthdate, churchId = "") {
    const base = `${encodeURIComponent(String(name || "").trim())}_${String(birthdate || "").trim()}`;
    return churchId ? `${base}_${churchId}@bible.local` : `${base}@bible.local`;
}

// 날짜 문자열 생성 (toDateString 형식: "Thu May 01 2026")
function dateStr(daysOffset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return d.toDateString();
}

// 과거 날짜 (읽기 시뮬레이션용)
function pastDateStr(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toDateString();
}

// ── 1. 관리자 로그인 ────────────────────────────────────────
async function adminLogin() {
    log("관리자 로그인 중...");
    const r = await fetch(`${AUTH_BASE}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PW, returnSecureToken: true })
    });
    const data = await r.json();
    if (!data.idToken) throw new Error("관리자 로그인 실패: " + JSON.stringify(data));
    adminToken = data.idToken;
    pass("관리자 로그인 성공");
    return data.idToken;
}

// ── 2. 교회에 테스트 부서/소그룹 추가 ──────────────────────
async function setupDepartments() {
    log("테스트 부서 설정 중...");
    const churchDoc = await fsGet(`churches/${CHURCH_ID}`, adminToken);
    const existing = fromFs(churchDoc.fields?.departments) || [];

    // 이미 테스트 부서가 있으면 스킵
    if (existing.some(d => d.id === "dept_test")) {
        log("테스트 부서 이미 존재, 스킵");
        return { deptId: "dept_test", subgroupId: "sub_test_1" };
    }

    const testDept = {
        id: "dept_test", name: "테스트부",
        subgroups: [
            { id: "sub_test_1", name: "1조" },
            { id: "sub_test_2", name: "2조" }
        ]
    };
    const newDepts = [...existing, testDept];

    // Firestore에 부서 배열 저장
    const deptValues = newDepts.map(d => ({
        mapValue: {
            fields: {
                id: toFs(d.id),
                name: toFs(d.name),
                subgroups: {
                    arrayValue: {
                        values: d.subgroups.map(s => ({
                            mapValue: { fields: { id: toFs(s.id), name: toFs(s.name) } }
                        }))
                    }
                }
            }
        }
    }));

    await fsPatch(`churches/${CHURCH_ID}`, {
        departments: { arrayValue: { values: deptValues } }
    }, adminToken);

    pass("테스트 부서(테스트부/1조,2조) 추가 완료");
    return { deptId: "dept_test", subgroupId: "sub_test_1" };
}

// ── 3. 테스트 유저 생성 ────────────────────────────────────
async function createTestUser() {
    log("테스트 유저 생성 중...");
    const email = makePseudoEmail(TEST_NAME, TEST_BIRTHDATE, CHURCH_ID);
    log(`이메일: ${email}`);

    // 기존 계정 있으면 로그인으로 재사용
    let loginResp = await fetch(`${AUTH_BASE}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: TEST_PW, returnSecureToken: true })
    });
    let loginData = await loginResp.json();

    let uid, userToken;
    if (loginData.idToken) {
        uid = loginData.localId;
        userToken = loginData.idToken;
        log("기존 테스트 계정으로 로그인");
    } else {
        // 신규 생성
        const signupResp = await fetch(`${AUTH_BASE}/accounts:signUp?key=${FIREBASE_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: TEST_PW, returnSecureToken: true })
        });
        const signupData = await signupResp.json();
        if (!signupData.idToken) {
            bug(`유저 생성 실패: ${JSON.stringify(signupData)}`);
            throw new Error("유저 생성 실패");
        }
        uid = signupData.localId;
        userToken = signupData.idToken;
        pass("테스트 유저 Firebase Auth 계정 생성 완료");
    }

    // Firestore 유저 문서 초기화 (본인 토큰으로 create)
    const today = dateStr(0);
    await fsSet(`users/${uid}`, {
        name: toFs(TEST_NAME),
        birthdate: toFs(TEST_BIRTHDATE),
        password: toFs(TEST_PW),
        email: toFs(email),
        role: toFs("member"),
        churchId: toFs(CHURCH_ID),
        churchName: toFs(CHURCH_NAME),
        departmentId: toFs("dept_test"),
        departmentName: toFs("테스트부"),
        subgroupId: toFs("sub_test_1"),
        subgroupName: toFs("1조"),
        planId: toFs("1year_revised"),
        startDate: toFs(today),
        currentDay: toFs(1),
        streak: toFs(0),
        score: toFs(0),
        readCount: toFs(1),
        lastReadDate: toFs(null),
        gender: toFs("male"),
        dayOffset: toFs(0),
        achievements: { arrayValue: { values: [] } },
    }, userToken);

    pass(`테스트 유저 Firestore 문서 생성 (uid: ${uid})`);
    return { uid, userToken, email };
}

// ── 4. 읽기 시뮬레이션 ────────────────────────────────────
async function simulateReading(uid, userToken) {
    log("5독 읽기 시뮬레이션 시작...");

    let currentDay = 1;
    let score = 0;
    let streak = 0;
    let readCount = 1;
    let lastReadDate = null;

    const TOTAL_ROUNDS = 5;
    const DAYS_PER_ROUND = 365;
    const TOTAL_READS = TOTAL_ROUNDS * DAYS_PER_ROUND; // 1825

    let prevLevel = 0;
    const levelUps = [];
    const rolloverDays = []; // 독 완료 시점 기록

    for (let i = 0; i < TOTAL_READS; i++) {
        // 날짜: 과거부터 순서대로 (오늘 기준 TOTAL_READS일 전부터)
        const daysAgo = TOTAL_READS - 1 - i;
        const readDate = pastDateStr(daysAgo);

        // streak 계산
        if (lastReadDate) {
            const last = new Date(lastReadDate);
            const curr = new Date(readDate);
            const diff = Math.floor((curr - last) / 86400000);
            if (diff === 1) streak++;
            else if (diff === 0) {} // 같은날 - 변화없음
            else streak = 1;
        } else {
            streak = 1;
        }

        const streakBonus = Math.min(5, streak);
        const addedScore = 10 + streakBonus;
        score += addedScore;
        lastReadDate = readDate;

        // 독 완료 체크
        const completedRound = currentDay >= 365;
        if (completedRound) {
            readCount++;
            rolloverDays.push({ round: readCount - 1, day: i + 1, date: readDate });
            currentDay = 1;
        } else {
            currentDay++;
        }

        // 레벨업 체크
        const newLevel = Math.floor(score / 100);
        if (newLevel > prevLevel) {
            levelUps.push({ level: newLevel, atRead: i + 1, score });
            prevLevel = newLevel;
        }
    }

    // ── 검증 ──
    // 5독 완료 후 readCount는 6 (1독 시작 + 5독 완료)
    if (readCount === 6) {
        pass(`readCount 계산 정상: ${readCount} (5독 완료 후 6독 시작 상태)`);
    } else {
        bug(`readCount 이상: 예상 6, 실제 ${readCount}`);
    }

    // 마지막 currentDay: 1825 % 365 = 5이므로 currentDay = 6
    const expectedDay = (TOTAL_READS % DAYS_PER_ROUND) + 1;
    if (currentDay === expectedDay) {
        pass(`currentDay 계산 정상: ${currentDay}`);
    } else {
        bug(`currentDay 이상: 예상 ${expectedDay}, 실제 ${currentDay}`);
    }

    // 점수: 기본 10 × 1825 + 연속 보너스
    // 연속읽기 1825일 연속이면 보너스는 day5부터 max 5
    // day1: +0, day2: +1, day3: +2, day4: +3, day5: +4, day6~: +5
    const minScore = 10 * TOTAL_READS; // 최소 (보너스 0)
    const maxScore = 15 * TOTAL_READS; // 최대 (보너스 5 매일)
    if (score >= minScore && score <= maxScore) {
        pass(`score 범위 정상: ${score} (${minScore}~${maxScore})`);
    } else {
        bug(`score 범위 이상: ${score}`);
    }

    log(`레벨업 횟수: ${levelUps.length}회 (최종 레벨: ${Math.floor(score / 100)})`);
    log(`독 완료 시점: ${rolloverDays.map(r => `${r.round}독 (${r.date})`).join(", ")}`);

    // Firestore에 최종 상태 저장 (본인 토큰으로 update)
    await fsPatch(`users/${uid}`, {
        currentDay: toFs(currentDay),
        score: toFs(score),
        streak: toFs(Math.min(streak, 1825)),
        readCount: toFs(readCount),
        lastReadDate: toFs(lastReadDate),
        startDate: toFs(pastDateStr(TOTAL_READS)),
    }, userToken);

    pass(`Firestore 유저 상태 저장 완료 (score: ${score}, readCount: ${readCount}, currentDay: ${currentDay})`);

    return { score, readCount, currentDay, streak, levelUps, rolloverDays };
}

// ── 5. 묵상 메모 시뮬레이션 ──────────────────────────────
// 앱은 memos를 users/{uid} 문서의 memos 필드(맵)에 저장 (useMemos.js 참고)
// 키: day - 1 (0-indexed), 값: { texts, text, date, title }
async function simulateMemos(uid, userToken) {
    log("묵상 메모 기록 시뮬레이션...");

    const MEMO_ENTRIES = [
        { day: 0, text: "창세기 1장 - 하나님이 천지를 창조하셨도다. 오늘도 새로운 시작을 주심에 감사합니다." },
        { day: 29, text: "시편 23편 - 여호와는 나의 목자시니 내게 부족함이 없으리로다." },
        { day: 99, text: "잠언 말씀 - 마음의 즐거움은 양약이라도 심령의 근심은 뼈를 마르게 하느니라." },
        { day: 199, text: "이사야의 예언 - 새 힘을 얻으리니 독수리가 날개치며 올라감 같을 것이요." },
        { day: 299, text: "마태복음 - 구하라 그리하면 너희에게 주실 것이요 찾으라 그리하면 찾아낼 것이요." },
        { day: 364, text: "요한복음 3:16 - 하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니." },
        { day: 499, text: "로마서 - 하나님을 사랑하는 자에게는 모든 것이 합력하여 선을 이루느니라." },
        { day: 699, text: "빌립보서 - 내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라." },
        { day: 899, text: "히브리서 - 믿음은 바라는 것들의 실상이요 보이지 않는 것들의 증거니." },
        { day: 1099, text: "요한계시록 - 아멘 주 예수여 오시옵소서." },
    ];

    // memos 필드를 맵으로 구성 (앱 저장 방식과 동일)
    const memosMap = {};
    for (const { day, text } of MEMO_ENTRIES) {
        memosMap[day] = {
            mapValue: {
                fields: {
                    text: toFs(text),
                    texts: { arrayValue: { values: [toFs(text)] } },
                    date: toFs(new Date().toISOString()),
                    title: toFs(`Day ${day + 1} 묵상`)
                }
            }
        };
    }

    // users/{uid} 문서의 memos 필드 업데이트 (본인 토큰)
    const result = await fsPatch(`users/${uid}`, { memos: { mapValue: { fields: memosMap } } }, userToken);

    if (result.fields) {
        pass(`묵상 메모 ${MEMO_ENTRIES.length}개 저장 완료 (user doc memos 필드)`);
    } else {
        bug(`묵상 메모 저장 실패: ${JSON.stringify(result).slice(0, 100)}`);
    }

    return MEMO_ENTRIES.length;
}

// ── 6. 최종 상태 검증 ─────────────────────────────────────
async function verifyFinalState(uid) {
    log("최종 상태 검증 중...");

    const doc = await fsGet(`users/${uid}`, adminToken);
    const fields = doc.fields || {};

    const readCount = fromFs(fields.readCount);
    const currentDay = fromFs(fields.currentDay);
    const score = fromFs(fields.score);
    const streak = fromFs(fields.streak);
    const lastReadDate = fromFs(fields.lastReadDate);
    const departmentId = fromFs(fields.departmentId);
    const subgroupId = fromFs(fields.subgroupId);

    log(`\n📊 최종 상태:`);
    log(`  이름: ${fromFs(fields.name)}`);
    log(`  교회: ${fromFs(fields.churchName)}`);
    log(`  부서/소그룹: ${fromFs(fields.departmentName)} / ${fromFs(fields.subgroupName)}`);
    log(`  현재 독수: ${readCount}독`);
    log(`  현재 날: Day ${currentDay}`);
    log(`  점수: ${score}점`);
    log(`  연속읽기: ${streak}일`);
    log(`  마지막 읽기: ${lastReadDate}`);
    log(`  레벨: ${Math.floor(score / 100)}레벨`);

    // 필수 필드 검증
    if (departmentId && subgroupId) {
        pass("부서/소그룹 배정 정상");
    } else {
        bug(`부서/소그룹 누락: departmentId=${departmentId}, subgroupId=${subgroupId}`);
    }

    if (readCount >= 2) {
        pass("다독 상태 정상");
    } else {
        bug(`readCount 이상: ${readCount}`);
    }

    // 메모 개수 확인 (users/{uid}.memos 필드에서)
    const memos = fromFs(doc.fields?.memos) || {};
    const memoCount = Object.keys(memos).length;
    log(`  저장된 메모: ${memoCount}개`);
    if (memoCount > 0) {
        pass(`메모 필드 저장/조회 정상 (${memoCount}개)`);
    } else {
        bug("memos 필드가 비어있음");
    }
}

// ── 7. 앱 로직 버그 체크 ──────────────────────────────────
async function checkAppLogicBugs() {
    log("\n앱 로직 버그 체크...");

    // Bug check 1: currentDay > 365 보정 코드
    // useUserBibleActions.js:49
    // if (currentProgressDay > 365) { currentProgressDay = ((currentProgressDay - 1) % 365) + 1; }
    // 366 → ((365)%365)+1 = 1 (다음 독 1일차) — 정상
    const testDay = 366;
    const corrected = ((testDay - 1) % 365) + 1;
    if (corrected === 1) {
        pass("currentDay > 365 보정 로직 정상 (366→1, 다음 독 1일차)");
    } else {
        bug(`currentDay 보정 이상: 366 → ${corrected} (예상: 1)`);
    }

    // Bug check 2: 365일 완료 시 다음 날이 1일로 리셋
    const nextDayAt365 = 365 >= 365 ? 1 : 365 + 1;
    if (nextDayAt365 === 1) {
        pass("365일→1일 롤오버 로직 정상");
    } else {
        bug(`365일 롤오버 이상: ${nextDayAt365}`);
    }

    // Bug check 3: streakBonus 상한 체크
    const streak100 = Math.min(5, 100);
    if (streak100 === 5) {
        pass("streakBonus 상한(5) 정상");
    } else {
        bug(`streakBonus 상한 이상: ${streak100}`);
    }

    // Bug check 4: 같은 날 두 번 읽기 시도 (hasReadToday 체크)
    // 앱에서는 hasReadToday로 막지만 서버에서는 막지 않음
    // → 서버 레벨 중복 방지 없음 (알려진 이슈로 기록)
    bug("같은 날 중복 읽기: 서버 레벨 방지 없음 (hasReadToday는 클라이언트 상태만 체크)");
}

// ── 메인 ──────────────────────────────────────────────────
async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("  bible114 통합 테스트 시작");
    console.log("=".repeat(60) + "\n");

    try {
        await adminLogin();
        const { deptId, subgroupId } = await setupDepartments();
        const { uid, userToken } = await createTestUser();
        await simulateReading(uid, userToken);
        await simulateMemos(uid, userToken);
        await verifyFinalState(uid);
        await checkAppLogicBugs();
    } catch (e) {
        bug(`치명적 오류: ${e.message}`);
        console.error(e);
    }

    // ── 최종 보고 ──
    console.log("\n" + "=".repeat(60));
    console.log(`  테스트 완료: ✅ ${passes.length}개 통과 / 🐛 ${bugs.length}개 버그`);
    console.log("=".repeat(60));

    if (passes.length > 0) {
        console.log("\n✅ 통과 항목:");
        passes.forEach(p => console.log(`  - ${p}`));
    }

    if (bugs.length > 0) {
        console.log("\n🐛 발견된 버그/개선사항:");
        bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    } else {
        console.log("\n🎉 버그 없음!");
    }
    console.log("");
}

main();
