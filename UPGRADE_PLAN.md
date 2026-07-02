# UPGRADE_PLAN.md — 2026-07 업그레이드 설계서

> 작성: 2026-07-03. 계획·설계 세션 결과물.
> 구현 담당: Claude Sonnet. 이 문서만 보고 구현할 수 있도록 작성됨.
> 각 Phase는 독립적으로 완결되며, 순서대로 진행하고 Phase마다 git 커밋을 남긴다.

---

## 확정된 결정 사항 (사용자 승인 완료)

1. **점수 이중화**: `score`(누적, 절대 안 깎임 — 랭킹/레벨/업적용) + `talent`(달란트 지갑, 구매 시 차감) 분리. 기존 사용자는 현재 score를 talent로 복사하고, 과거 구매로 깎인 금액을 score에 복구.
2. **로그인 교회 선택**: ① 교회 전용 링크(`?church=ID`) ② 최근 교회 localStorage 기억 ③ **타이핑 즉시 필터되는 검색 자동완성** ("용" 입력 → 용으로 시작/포함하는 교회가 바로 목록에 떠서 탭 한 번으로 선택) — 3가지 모두 구현.
3. **매일 유튜브**: 읽기 탭 최상단. 새벽 3시(KST) 컷오프. **개인별** 어린이용/성인용 토글. 영상 등록은 **플랫폼 관리자가 전체 교회 공용으로** 등록.
4. **챕터 바로가기**: 해설/성경읽기/기도 3버튼, 관리자가 유튜브 설명문을 붙여넣으면 타임스탬프 자동 파싱.
5. 코드 정리(Tier 1 삭제 + 죽은 코드 제거) 승인됨.
6. `users.password` 평문 저장은 **의도적 결정**(어르신 지원 — 관리자 비밀번호 조회용). 건드리지 말 것.

---

## Phase 0 — git 기준점 + 코드 정리

### 0-1. 첫 커밋
저장소에 커밋이 하나도 없다. 정리 전 상태를 먼저 커밋한다.
```bash
git add -A && git commit -m "chore: initial snapshot before 2026-07 upgrade"
```

### 0-2. 파일 삭제 (모두 미참조 확인 완료)
- `test.js` (1MB, 옛 번들 산출물 — 테스트 아님)
- `test_real.js` (2.3MB, 동일)
- `index-3.html` (483KB, 옛 진입점)
- `refactor_dashboard.py` (끝난 마이그레이션 스크립트)
- `icon-preview.png`, `vite_dev.log`
- `백업용/260116.html` (폴더째 삭제)
- `test_simulation.mjs`는 **유지** (부하 테스트용으로 유효)

### 0-3. 죽은 코드 제거
- ~~`src/components/DemoTour.jsx` 삭제~~ → **취소됨**: 구현 검증 결과 LoginView.jsx 438행 "읽는 방법" 버튼에서 실제 렌더링됨(553~558행). 유지.
- `statsUtils.js`의 `getMonthlyContest` 함수 삭제 + `App.jsx`의 import에서 제거 (WORKLOG.md에도 죽은 코드로 기록됨)

### 0-4. .gitignore 보강
```
vite_dev.log
*.local
```

### 0-5. 정리 커밋
```bash
git add -A && git commit -m "chore: remove build artifacts and dead code"
```

---

## Phase 1 — 점수 이중화 (score / talent)

### 1-1. 데이터 모델
`users/{uid}`에 필드 추가:
| 필드 | 의미 | 규칙 |
|---|---|---|
| `score` (기존) | **누적 점수**. 레벨·업적·랭킹·달리기 표시용 | 읽기 완료 시에만 증가. **절대 감소하지 않음** |
| `talent` (신규) | **달란트 지갑**. 상점 화폐 | 적립 시 score와 같은 금액 증가, 구매/방 해금 시 차감 |
| `talentMigrated` (신규) | 마이그레이션 완료 플래그 (boolean) | 1회성 |

### 1-2. 적립 로직 — `src/hooks/useUserBibleActions.js`
`handleRead`의 트랜잭션(현재 56~106행) 안에서:
```js
const addedScore = 10 + streakBonus;           // 기존과 동일
updateData.score  = oldScore + addedScore;      // 기존과 동일 (누적)
updateData.talent = (data.talent || 0) + addedScore;  // 신규: 지갑에도 동일 금액
```
history 서브컬렉션 기록(`{date, day, score: addedScore}`)은 그대로 유지.

### 1-3. 소비 로직 — `src/hooks/useMiniRoom.js`
**중요: 구매를 Firestore 트랜잭션으로 전환한다** (현재 `set merge` 방식은 빠른 연타 시 이중 차감 가능).

- `buyItem` (81~113행):
  - 잔액 체크: `(currentUser.talent || 0) < item.price`
  - 트랜잭션 내에서 최신 talent를 읽어 재검증 후 `talent: fresh - item.price` 기록. **score는 절대 건드리지 않음**
  - 부족 안내 문구는 "달란트가 부족합니다!" 유지
- `unlockRoom` (177~206행): 동일하게 talent만 차감. 비용 공식 유지: `800 + (unlockedRooms - 1) * 400` → 800/1200/1600/2000
- 로컬 상태 갱신: `setCurrentUser(prev => ({...prev, talent: newTalent, ...}))`

### 1-4. 표시 로직 변경
- `src/components/miniroom/MiniRoomPage.jsx` 32행: `const currentTalants = currentUser.talent || 0;` (상점 잔액 표시)
- 레벨/랭킹/업적/달리기 관련 코드(`levels.js`, `achievements.js`, `statsUtils.js`, `DashboardView.jsx`, `modals/RankingModal.jsx`)는 **모두 `score`를 그대로 사용 — 수정 불필요.** 단, grep으로 `score`를 차감하거나 지갑처럼 취급하는 곳이 미니룸 외에 더 없는지 전수 확인할 것.
- 대시보드 어딘가(포인트 표시 근처)에 달란트 잔액도 노출하면 좋음: `⭐ {talent} 달란트` — 미니룸 진입 전에 잔액을 알 수 있게.

### 1-5. 마이그레이션 (기존 사용자 복구)
**지연(lazy) 마이그레이션**: 로그인 후 user doc 로드 시점(`useUserAuth.js`의 userDocToState 직후 또는 App.jsx의 유저 로드 완료 지점)에서 실행. 별도 서버 불필요.

```js
// talentMigrated가 없으면 1회 실행
if (!data.talentMigrated) {
  const FREE_DEFAULTS = ['wall_plain_white','floor_plain_white','base_man','eye_basic','expr_happy'];
  // ① 과거 구매 총액 역산: 인벤토리에서 기본 지급품 제외하고 SHOP_ITEMS 가격 합산
  const spentItems = (data.inventory || [])
    .filter(id => !FREE_DEFAULTS.includes(id))
    .reduce((sum, id) => sum + (SHOP_ITEMS.find(i => i.id === id)?.price || 0), 0);
  // ② 방 해금 비용 역산: 2번째 방부터 800,1200,1600,2000
  const unlocked = data.miniroom?.unlockedRooms || 1;
  let spentRooms = 0;
  for (let i = 1; i < unlocked; i++) spentRooms += 800 + (i - 1) * 400;

  const spent = spentItems + spentRooms;
  await db.collection('users').doc(uid).update({
    talent: data.score || 0,          // 현재 잔액 = 지금 score 그대로
    score: (data.score || 0) + spent, // 깎였던 만큼 누적 점수 복구
    talentMigrated: true,
  });
}
```
- SHOP_ITEMS는 `src/data/shop_items.js` (또는 `src/data/items/index.js` 집계본)에서 import. 아이템 id가 어느 파일에 있든 **전체 아이템 배열**에서 찾을 것.
- 신규 가입자: `useAuth.js`의 신규 유저 doc 생성부(buildNewMember)에 `talent: 0, talentMigrated: true` 추가.
- 마이그레이션과 1-2/1-3 코드는 **같은 배포에 포함**되어야 함 (talent 필드가 없는 상태에서 구매 로직이 talent를 보면 잔액 0으로 보임 → 마이그레이션이 먼저 돌므로 문제없으나, 로그인 직후 미니룸 직행 경로에서 마이그레이션 완료 전 렌더링될 수 있으니 `talent === undefined`이면 로딩 처리 또는 `?? score` 폴백 금지하고 마이그레이션 완료를 기다릴 것).

### 1-6. (선택 강화) firestore.rules
본인 update 시 score 감소 금지 규칙 추가 가능:
```
allow update: if request.auth.uid == uid
  && (!('score' in request.resource.data) ||
      request.resource.data.score >= resource.data.score) || ...관리자 조건 유지
```
단, 관리자 수정 경로와 충돌하지 않는지 확인. 복잡해지면 이번에는 생략 가능 (마크: 선택).

### 검수 기준
- [ ] 읽기 완료 → score와 talent가 같은 금액만큼 증가
- [ ] 아이템 구매 → talent만 감소, score 불변, 랭킹/레벨 불변
- [ ] 방 해금 → talent만 감소
- [ ] 기존 구매 이력 있는 계정 로그인 → score가 (기존 + 구매총액)으로 복구, talent = 기존 score
- [ ] 구매 버튼 빠른 연타 → 1회만 차감 (트랜잭션)

---

## Phase 2 — 매일 유튜브 영상 + 챕터 바로가기

### 2-1. 데이터 모델
새 컬렉션 `dailyVideos/{YYYY-MM-DD}` (날짜는 KST 기준):
```js
{
  adult: { url: "https://youtu.be/...", chapters: [{ label: "해설", sec: 0 }, { label: "성경읽기", sec: 200 }, { label: "기도", sec: 940 }] },
  kids:  { url: "...", chapters: [...] },   // 없으면 null 가능
  updatedAt: Timestamp
}
```
`users/{uid}`에 필드 추가: `videoMode: 'adult' | 'kids'` (기본 'adult').

firestore.rules 추가:
```
match /dailyVideos/{dateId} {
  allow read: if isSignedIn();
  allow write: if isPlatformAdmin();
}
```

### 2-2. 새벽 3시 KST 컷오프 — `src/utils/helpers.js`에 추가
```js
// 영상 날짜 = 한국시간 현재시각에서 3시간을 뺀 날짜.
// 7/1 02:59(KST) → "2026-06-30", 7/1 03:00 → "2026-07-01".
// UTC 연산이므로 해외 접속자도 동일하게 동작한다.
export const getVideoDateKST = () => {
  const shifted = new Date(Date.now() + 9 * 3600e3 - 3 * 3600e3);
  return shifted.toISOString().slice(0, 10);
};
```

### 2-3. 표시 컴포넌트 — `src/components/dashboard/DailyVideoCard.jsx` (신규)
- **위치**: DashboardView의 읽기 탭에서 `<BibleReader />` 바로 위. (AnnouncementBanner가 있으면 그 아래.)
- **로딩**: `dailyVideos/{getVideoDateKST()}` 1회 read. 문서가 없으면 카드 자체를 렌더링하지 않음.
- **모드 토글**: 카드 우상단에 `성인용 | 어린이용` 세그먼트 토글. 변경 시 `users/{uid}.videoMode` 저장(merge) + 로컬 상태 갱신. 현재 모드의 url이 null이면 반대 모드로 폴백하고 작은 안내 문구 표시.
- **경량 임베드 (성능·데이터 절약)**:
  1. 초기: 유튜브 썸네일(`https://i.ytimg.com/vi/{videoId}/hqdefault.jpg`) + ▶ 오버레이만 렌더링. iframe 없음.
  2. 탭 시: `<iframe src="https://www.youtube.com/embed/{videoId}?enablejsapi=1&autoplay=1&playsinline=1">` 삽입.
- **videoId 추출 유틸**: `youtu.be/{id}`, `youtube.com/watch?v={id}`, `youtube.com/live/{id}`, shorts 형식 모두 지원하는 정규식 파서를 helpers에 추가.
- **챕터 버튼**: 플레이어 아래 `[📖 해설] [📕 성경읽기] [🙏 기도]` (chapters에 있는 것만 표시).
  - iframe 로드 전 탭 → `&start={sec}&autoplay=1`으로 iframe 삽입.
  - iframe 로드 후 탭 → postMessage로 seek:
    ```js
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [sec, true] }), '*');
    ```
  - 외부 라이브러리 불필요. YouTube IFrame API 스크립트도 불필요 (postMessage 프로토콜 직접 사용).

### 2-4. 관리자 등록 UI — `PlatformAdminView.jsx`에 "매일 영상" 섹션 추가
플랫폼 관리자 전용 (교회별 등록 아님 — 확정 사항).
- **입력**: 날짜(기본값 = `getVideoDateKST()`의 다음 날), 성인용 URL, 어린이용 URL, 그리고 각 영상의 **설명문 붙여넣기 textarea**.
- **타임스탬프 자동 파싱**: 설명문에서 `0:00`, `3:20`, `1:02:15` 형식을 찾아 같은 줄의 텍스트를 라벨로 추출.
  ```js
  // "매일성경 해설 0:00" / "0:00 매일성경 해설" 양쪽 지원
  const parseChapters = (desc) => {
    const out = [];
    for (const line of desc.split('\n')) {
      const m = line.match(/(\d{1,2}:)?(\d{1,2}):(\d{2})/);
      if (!m) continue;
      const sec = (m[1] ? parseInt(m[1]) * 3600 : 0) + parseInt(m[2]) * 60 + parseInt(m[3]);
      const label = line.replace(m[0], '').trim().replace(/^[-–|·:]+|[-–|·:]+$/g, '').trim();
      if (label) out.push({ label, sec });
    }
    return out;
  };
  ```
  파싱 결과에서 라벨에 "해설" 포함 → 해설, "성경" 또는 "읽기" 포함 → 성경읽기, "기도" 포함 → 기도로 매핑. 매핑 안 되는 챕터는 무시. 파싱 결과를 저장 전 미리보기로 보여주고 수동 수정(초/라벨 직접 입력)도 가능하게.
- **등록 목록**: 오늘 기준 ±7일의 등록 현황 리스트 (날짜, 성인/어린이 등록 여부 뱃지, 삭제 버튼). 미리 여러 날치 등록 가능.

### 검수 기준
- [ ] KST 02:59에는 전날 영상, 03:00부터 당일 영상 (시스템 시계 조작 또는 getVideoDateKST 단위 테스트로 확인)
- [ ] 어린이용 토글 후 재로그인해도 어린이용 유지
- [ ] 챕터 버튼 → 재생 중 즉시 해당 시각으로 점프 / 재생 전이면 그 시각부터 시작
- [ ] 영상 미등록 날짜에는 카드 미표시, 콘솔 에러 없음
- [ ] 설명문 붙여넣기 → 3개 챕터 자동 인식

---

## Phase 3 — 로그인 개편 + 보안 규칙

### 3-1. 교회 디렉토리 문서 (읽기 비용·노출 문제 동시 해결)
현재: 로그인 화면이 `churches` 전체 컬렉션을 읽음(교회 수만큼 read 과금) + 규칙이 `allow read: if true`라 비로그인 상태로 관리자 이메일까지 노출.

**설계**: 공개용 요약 문서 1개로 대체.
- `settings/churchDirectory` (문서 1개):
  ```js
  { churches: [{ id, name }, ...], updatedAt }
  ```
  {id, name}만 담으므로 1,000개 교회여도 문서 1MB 한도에 여유.
- **쓰기 시점**: 교회 관리자 가입(`useAuth.js`의 onChurchAdminSignup)에서 church doc 생성 직후 `arrayUnion({id, name})`. 교회명 변경/삭제 시(ChurchAdminView, PlatformAdminView) 동기화. PlatformAdminView에 "디렉토리 재생성" 버튼(전체 churches를 스캔해 재작성 — 기존 7개 교회 초기 백필용).
- **firestore.rules 변경**:
  ```
  match /settings/churchDirectory {
    allow read: if true;                     // 로그인 화면용 공개
    allow write: if isSignedIn();           // 가입 직후 arrayUnion 필요. (검증 강화는 선택)
  }
  match /churches/{churchId} {
    allow read: if isSignedIn();            // 기존 true → 인증 필수로 축소
    ...나머지 동일
  }
  ```
- **주의**: 회원가입 플로우(mChurchCode 검증)와 멤버 로그인(useAuth.js 130행대의 church doc 조회)이 비로그인 상태에서 church doc을 읽는 경로가 있는지 확인 필요. 멤버 가입은 Firebase Auth 계정 생성 **후** church 검증하도록 순서 조정하거나, churchCodeHash 검증에 필요한 최소 필드(`codeHash`)를 directory 항목에 포함시킬 것. **구현 전 useAuth.js 가입/로그인 플로우에서 미인증 church read 지점을 전수 확인하고 순서를 맞출 것.**

### 3-2. 교회 빠른 검색 (자동완성) — `src/components/ChurchPicker.jsx` (신규)
현재 `<select>` 드롭다운(LoginView.jsx 257~260행)을 대체. 로그인 폼과 회원가입 폼 양쪽에서 재사용.
- 텍스트 입력창: 타이핑 즉시 churchDirectory 배열을 클라이언트에서 필터.
  - 매칭: `name.includes(query)` — "용" 입력 시 "용인교회"(시작)뿐 아니라 "새용문교회"(포함)도 잡힘. 시작 일치를 상단 정렬, 포함 일치를 그 아래 정렬.
  - 결과는 입력창 바로 아래 최대 8개 리스트로 표시, 탭하면 선택 확정(기존의 선택됨 카드 UI 재사용).
  - 결과 0건: "교회를 찾을 수 없습니다. 교회 관리자에게 문의해주세요."
- 디렉토리 로딩: 문서 1개 read. 모듈 레벨 캐시로 세션당 1회만 (현재 탭 전환마다 재요청하는 173~181행 useEffect 제거).

### 3-3. 교회 전용 링크 + 최근 교회 기억
- **URL 파라미터**: `App.jsx`에서 `new URLSearchParams(location.search).get('church')` 읽어 LoginView에 `presetChurchId`로 전달. 유효한 id면(디렉토리에서 이름 조회) 교회 선택이 완료된 상태로 시작.
- **최근 교회**: 멤버 로그인 성공 시 `localStorage.setItem('b114_last_church', JSON.stringify({id, name}))`. 다음 방문 시 URL 파라미터가 없으면 이 값으로 preselect. "변경" 버튼(기존 UI에 있음)으로 해제 가능.
- **우선순위**: URL 파라미터 > localStorage > 빈 검색창.
- **관리자용 링크 안내**: ChurchAdminView에 "우리 교회 로그인 링크" 카드 추가 — `{origin}{pathname}?church={churchId}` 표시 + 복사 버튼. QR은 외부 의존성 없이 이 링크를 `https://api.qrserver.com` 같은 외부 서비스에 보내지 말고, 경량 라이브러리 `qrcode`(npm, ~10KB)로 canvas 생성해 다운로드 버튼 제공. (라이브러리 추가가 부담이면 QR은 후순위로 미루고 링크 복사만 우선.)

### 3-4. 플랫폼 통계 쓰기 규칙 완화 조치
`settings/platformStats`가 현재 `write: if isSignedIn()` — 아무 유저나 메인 화면 통계 조작 가능.
Cloud Functions 없이 완전 차단은 불가하므로 이번에는 **필드 화이트리스트 + 타입 검증**으로 완화:
```
match /settings/platformStats {
  allow read: if true;
  allow update: if isSignedIn()
    && request.resource.data.keys().hasOnly(
      ['total_churches','total_readers','finished_total','readers_today',
       'chapters_read_today','today_date','updatedAt']);
  allow create: if isPlatformAdmin();
}
```
(값 자체의 조작은 여전히 가능 — 알려진 한계로 문서화. 근본 해결은 추후 Cloud Functions 과제.)

### 검수 기준
- [ ] `?church=유효ID` 접속 → 교회 선택된 상태로 로그인 폼 시작
- [ ] 로그인 성공 후 재방문 → 교회 자동 선택
- [ ] 검색창에 한 글자 입력 → 즉시 후보 목록, 탭으로 선택
- [ ] 비로그인 상태에서 churches 컬렉션 직접 read 시도 → 거부됨 (디렉토리 문서만 공개)
- [ ] 기존 7개 교회가 디렉토리 재생성 버튼으로 백필됨
- [ ] 신규 교회 가입 → 디렉토리에 자동 추가 → 즉시 검색됨

---

## Phase 4 — 확장성 마무리 (소규모)

1. **부서 화면 멤버 로딩 축소**: `useDepartment.js` 16~18행이 교회 전체 유저를 로드. 일반 멤버 화면(랭킹/달리기)은 `where('churchId','==',id).where('isDeleted','!=',true)` 유지하되, 화면에서 실제 필요한 필드만 쓰므로 당장은 쿼리에 `.where('departmentId','==', ...)` 옵션 분리 검토. 교회 규모 커지기 전까지는 **churchId 쿼리 + isDeleted 필터 추가**까지만 하고, 부서 단위 분리는 실측 후 결정.
2. **isDeleted 필터 전수 적용**: `where('churchId','==',...)` 쿼리들에 클라이언트 필터라도 `filter(u => !u.isDeleted)` 일관 적용 (일부 누락 확인됨).
3. **firestore.indexes.json 생성** + firebase.json에 연결: `users(churchId asc, isDeleted asc)`, `users(churchId asc, score desc)` 등 사용 쿼리 기준. (Firestore가 에러 메시지로 알려주는 인덱스 생성 링크로 보완 가능.)
4. **icon.png 최적화**: public/icon.png 941KB → 512px PNG로 리사이즈 (<100KB).

---

## 구현 시 공통 주의사항

- **기존 UI 디자인 언어 유지**: LoginView는 ink/cream 테마, Dashboard는 indigo 그라데이션 + rounded-3xl 카드. 신규 컴포넌트도 동일 토큰 사용.
- Firebase는 **compat SDK**(`db.collection(...)` 스타일)를 쓰고 있음. modular SDK 문법 섞지 말 것.
- 모든 날짜 로직에서 기존 `toDateString()` 기반 출석/스트릭 계산은 **건드리지 않는다**. 새벽 3시 컷오프는 오직 매일 영상 선택에만 적용 (읽기 완료 판정은 기존대로 자정 기준).
- 각 Phase 완료 시 `npm run build`로 빌드 확인 후 커밋. 커밋 메시지에 Phase 번호 명시.
- firestore.rules 변경은 배포(`firebase deploy --only firestore:rules`) 전에 기존 로그인/가입 플로우가 깨지지 않는지 3-1 주의 항목을 반드시 재확인.
