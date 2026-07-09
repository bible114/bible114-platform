# HANDOFF: 무소속 성도 가입 + 비로그인(게스트) 읽기

> 이 문서는 Claude(설계)와 Codex(구현) 사이의 인수인계 문서다.
> 설계 확정: 2026-07-09, Claude Fable 5 (3차 자체 점검 완료본).

---

## 작업 프로토콜 (Codex는 반드시 이 순서로)

1. 아래 **작업 체크리스트**에서 `[ ]` 상태인 첫 작업을 찾는다. 작업은 번호 순서대로 진행한다 (의존성이 있다).
2. 작업 하나를 끝내면:
   - 체크박스를 `[x]`로 바꾸고,
   - **작업 로그** 표에 한 줄 추가하고 (날짜 / 작업번호 / 변경 파일 / 특이사항),
   - 해당 작업 단위로 git 커밋한다 (`feat:` / `fix:` 접두사, 한글 메시지 가능).
3. `npm run build`가 통과하는 상태로만 커밋한다.
4. 설계에 없는 판단이 필요하거나 설계가 코드 현실과 안 맞으면, **임의로 설계를 바꾸지 말고** "Codex → Claude 메모"에 질문/제안을 남기고, 의존성 없는 다음 작업으로 넘어간다.
5. 세션을 마칠 때(전체 완료가 아니어도) "Codex → Claude 메모"에 현재 상태·다음 작업자에게 할 말을 남긴다.
6. **금지**: `firebase deploy`, `npm run deploy`, `git push`, firestore.rules의 `users` read 규칙 수정(별도 세션 담당), `users.password` 평문 필드 제거.

---

## 배경 (왜 이 작업을 하는가)

교회 소속이 없는 성도도 쓸 수 있게 하고, 아예 로그인 없이도 성경을 읽을 수 있게 한다.

현재 제약:
- 계정 식별자가 `이름+생년월일+교회ID` 조합의 가짜 이메일(`src/utils/helpers.js`의 `makePseudoEmail`)이라 교회 없이는 가입 불가. 가입 시 교회 입장코드 검증 필수(`src/hooks/useAuth.js` `handleMemberSignup`).
- `firestore.rules`에서 `verses`(성경 본문)·`dailyVideos` 읽기가 `isSignedIn()` 필요 → 완전 비로그인으로는 본문을 못 읽는다.

설계 결정(확정, 재논의 불필요):
- **무소속 = 가상 교회 방식**: churchId null 허용 대신, 플랫폼이 운영하는 가상 교회 문서 하나에 무소속 가입자를 전부 소속시킨다. 기존 스키마·규칙·랭킹·가짜이메일 체계가 그대로 동작하기 때문.
- **비로그인 = Firebase 익명 인증**: `verses`를 `allow read: if true`로 완전 공개하면 성경 본문(개역개정 등 저작권물)이 REST로 통째로 긁힌다. 익명 인증은 규칙 변경 없이 현재 read 규칙을 통과하면서 최소한의 장벽을 유지한다.
- **게스트 진도는 localStorage 전용**: 서버에 아무것도 쓰지 않는다. users 문서도 만들지 않는다. 가입 시 진도만(점수 제외) 이관한다.
- **가상 교회 식별은 클라이언트 상수로만**: `settings/churchDirectory`는 로그인 유저 누구나 쓸 수 있는 알려진 구멍이 있어서, 디렉토리에 "코드 불필요" 플래그를 두면 아무 교회에나 그 플래그를 켜서 입장코드를 우회할 수 있다. 절대 디렉토리 데이터로 코드 검증 스킵 여부를 판단하지 말 것.

---

## 공통 상수 (T1에서 생성)

`src/data/constants.js`에 추가:

```js
// 무소속(개인) 성도 가상 교회 — 문서 ID를 클라이언트 상수로 고정한다.
// 입장코드 검증 스킵은 "이 상수와의 ID 일치"로만 판단한다 (churchDirectory의 어떤 필드도 신뢰 금지).
export const UNAFFILIATED_CHURCH_ID = 'unaffiliated_v1';
export const UNAFFILIATED_CHURCH_NAME = '개인 성도 (소속 교회 없음)';
```

게스트 localStorage 키: `b114_guest_v1`
```js
// 형태: { planId: '1year_revised', currentDay: 1, streak: 0, lastReadDate: null,
//         readDates: ['Wed Jul 09 2026', ...] /* 최대 400개, 초과 시 앞에서 자름 */,
//         videoType: 'adult', migratedAt: null }
```

---

## 작업 체크리스트

### Phase 1 — 무소속 성도 가입

- [x] **T1. 상수 + 가상 교회 생성 버튼**
  - `src/data/constants.js`에 위 상수 2개 추가.
  - `src/components/PlatformAdminView.jsx`에 관리자 버튼 "무소속 가상 교회 생성/점검" 추가 (기존 "디렉토리 재생성" 버튼 근처에 배치). 클릭 시:
    ```js
    await db.collection('churches').doc(UNAFFILIATED_CHURCH_ID).set({
        name: UNAFFILIATED_CHURCH_NAME,
        pastorName: '', denomination: '',
        churchCodeHash: null, adminUid: null, adminEmail: null,
        isVirtual: true,
        departments: [{ id: 'personal', name: '개인 성도', color: 'bg-emerald-500', subgroups: ['성경읽기 동행'] }],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });  // 멱등 — 두 번 눌러도 안전
    ```
  - `src/utils/churchDirectory.js`의 `rebuildChurchDirectory`에서 `UNAFFILIATED_CHURCH_ID` 문서를 **제외**한다 (가상 교회는 교회 검색 목록에 나오면 안 됨 — 코드 없이 가입되는 교회가 검색에 노출되는 것 방지).
  - 완료 기준: 빌드 통과. (버튼 클릭은 사용자 수동 작업 M1.)

- [x] **T2. 가짜 이메일에 무소속 식별자 확장**
  - 문제: 무소속 풀은 전국 단위라 `이름+생년월일` 충돌 확률이 단일 교회보다 훨씬 높다.
  - `src/utils/helpers.js`의 `makePseudoEmail`은 건드리지 말고, 호출부에서 무소속일 때만 birthdate 인자를 `` `${birthdate}p${phone4}` `` 형태로 확장한다 (`phone4` = 전화번호 뒤 4자리 문자열). 예: `makePseudoEmail(name, '900101p1234', UNAFFILIATED_CHURCH_ID)`.
  - 이 조합 로직은 헬퍼 함수 `makeUnaffiliatedIdentity(birthdate, phone4)` 하나로 만들어 가입·로그인 양쪽에서 공유할 것 (문자열 조립이 두 곳에서 어긋나면 로그인 불가 사고가 난다).

- [x] **T3. 가입/로그인 로직 (useAuth.js)**
  - `src/hooks/useAuth.js` `handleMemberSignup`:
    - 파라미터에 `phone4` 추가.
    - `churchId === UNAFFILIATED_CHURCH_ID`이면: 디렉토리 조회·codeHash 검증 전체를 건너뛴다. `churchName`은 `UNAFFILIATED_CHURCH_NAME` 상수 사용. 이메일은 T2 방식.
    - 무소속 가입 시 users 문서에 `phone4` 필드 저장 (관리자가 본인 확인·비밀번호 찾기 지원할 때 필요).
    - 그 외(일반 교회) 흐름은 한 줄도 바꾸지 않는다.
  - `handleMemberLogin`: 파라미터에 `phone4` 추가, `churchId === UNAFFILIATED_CHURCH_ID`이면 T2 방식 이메일로 로그인 시도. 구포맷 마이그레이션 재시도 로직은 무소속에는 불필요(신규 기능이므로).

- [x] **T4. 로그인 화면 (LoginView.jsx)**
  - `src/components/LoginView.jsx` member/memberSignup 탭:
    - 교회 선택 영역에 **"소속 교회가 없어요"** 선택지 추가 (ChurchPicker 검색 결과와 별도의 고정 버튼/체크 형태 권장 — ChurchPicker 내부는 최소 수정).
    - 무소속 선택 시: 입장코드 입력란 숨김, **전화번호 뒤 4자리** 입력란 표시(로그인·가입 폼 둘 다), 안내 문구 "소속 교회가 없어도 개인 성도로 함께 읽을 수 있어요".
    - 무소속 선택 상태를 `saveLastChurch({ id: UNAFFILIATED_CHURCH_ID, name: UNAFFILIATED_CHURCH_NAME })`로 기억해 재방문 시 자동 선택.
  - 완료 기준: 무소속 가입 → 플랜 선택 → "개인 성도" 부서 → "성경읽기 동행" 소그룹 → 대시보드 진입까지 기존 흐름 그대로 동작 (에뮬레이터나 dev 환경에서 확인, 불가하면 로그에 미검증 명시).

### Phase 2 — 게스트(비로그인) 읽기

- [x] **T5. firestore.rules — isRealUser() 도입** (배포는 사용자 M2)
  - 헬퍼 추가:
    ```
    function isRealUser() {
      return isSignedIn() &&
        request.auth.token.firebase.sign_in_provider != 'anonymous';
    }
    ```
  - `isSignedIn()` → `isRealUser()` 교체 대상 (4곳만):
    1. `users` create (익명 계정이 임의 churchId로 교인 행세하는 것 차단)
    2. `churches` create
    3. `settings/churchDirectory` write
    4. `settings/platformStats` update
  - **바꾸지 말 것**: 모든 read 규칙, `dailyVideos` create(익명도 허용 유지 — 그날 첫 방문자가 게스트일 때 영상 lazy-fill이 되어야 함. URL 검증이 이미 방어함), `users` read 규칙(별도 세션 담당).
  - 트레이드오프(의도됨): 게스트 읽기는 platformStats 랜딩 통계에 안 잡힌다.

- [x] **T6. 게스트 진도 저장소 유틸**
  - 신규 `src/utils/guestStorage.js`: `getGuestState()` / `saveGuestState(partial)` / `recordGuestRead()` (currentDay 증가·365 순환, streak 계산은 `lastReadDate`가 어제면 +1 아니면 1, readDates append+400 cap) / `clearGuestMigrated()`.
  - streak 계산은 기존 `useUserBibleActions.js`의 로직을 참고하되 게스트용은 단순 버전이면 충분 (보너스·점수·달란트 없음).

- [x] **T7. 게스트 세션 복원 (useUserAuth.js)**
  - `src/hooks/useUserAuth.js` `onAuthStateChanged`에서 `firebaseUser.isAnonymous`이면 Firestore 조회 없이:
    ```js
    const g = getGuestState();
    setCurrentUser({ uid: firebaseUser.uid, role: 'guest', name: '게스트',
        churchId: null, planId: g.planId, currentDay: g.currentDay,
        streak: g.streak, lastReadDate: g.lastReadDate, readCount: 1,
        videoType: g.videoType || 'adult' });
    ```
  - 주의: 익명인데 users 문서가 있는 경우는 없다고 가정해도 된다(게스트는 서버에 안 씀).

- [x] **T8. GuestReaderView 신설 + 라우팅**
  - 신규 `src/components/GuestReaderView.jsx`. **DashboardView를 재사용하지 말 것** (props 60+, 전부 공동체 전제). 구성:
    - 상단: 간단 헤더 (로고 + "게스트 모드" 뱃지 + "가입하고 기록 지키기" 버튼 → 로그아웃 후 memberSignup 탭으로).
    - `DailyVideoCard` 재사용 (`currentUser`, `setCurrentUser` props 그대로 — videoType 토글이 setCurrentUser로 오면 localStorage에도 반영).
    - `BibleReader` 재사용 (`src/components/dashboard/BibleReader.jsx` — verseData/viewingDay/TTS/handleRead props 제공). 본문 로딩은 기존 `useBibleContent(guestUser)` + TTS는 기존 `useTTS(verseData.text)` 재사용.
    - `handleRead`(게스트판): `recordGuestRead()` → setCurrentUser 갱신 → confetti → `window.refreshKakaoAdBanner?.()` 호출(광고 수익 유지).
    - 고지 배너(필수): "기록은 이 기기에만 저장되며, 브라우저 데이터 삭제 시 사라질 수 있어요. 가입하면 안전하게 보관됩니다."
    - 숨김: 랭킹·소그룹·미니룸·달란트·메모·공지 — 전부 없음. 읽기+TTS+영상+진도만.
  - `src/App.jsx`: 라우팅 effect(현재 154행 부근)에서 `currentUser.role === 'guest'`이면 `setView('guest')` 분기를 **plan/dashboard 분기보다 먼저** 추가. 렌더링부에 `view === 'guest'` → `<GuestReaderView ... />` 추가. `handleLogout`은 게스트에도 그대로 동작(익명 계정은 버려짐 — 정상, localStorage는 유지).

- [ ] **T9. 로그인 화면에 게스트 진입 버튼**
  - `LoginView.jsx` member 탭 하단에 "로그인 없이 바로 읽기" 버튼 → `auth.signInAnonymously()` 호출 (에러 시 errorMsg 표시 — 특히 콘솔에서 익명 provider 미활성화면 `auth/operation-not-allowed`가 나므로 "잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 알려주세요" 문구).
  - 버튼을 누르면 T7의 onAuthStateChanged 경로로 자동으로 게스트 뷰에 진입한다 — 별도 setView 호출 불필요함을 확인할 것.

### Phase 3 — 전환 경로

- [ ] **T10. 게스트 → 가입 시 진도 이관**
  - `useAuth.js` `buildNewMember`: 게스트 상태(`getGuestState()`)가 있고 `readDates`가 1개 이상이면 `currentDay`/`streak`/`lastReadDate`를 시드. **score/talent는 절대 이관하지 않는다** (localStorage는 위조 가능 — 점수 소급은 랭킹 오염 경로).
  - 이관 후 `saveGuestState({ migratedAt: <now> })`로 마킹 (재가입 시 이중 이관 방지 — migratedAt 있으면 이관 스킵).
  - 가입 화면에 이관 예고 문구: 게스트 기록이 있으면 "지금까지 읽은 N일차 진도를 가져옵니다 (점수는 가입 후부터 적립돼요)".
- [ ] **T11. 관리자 교회 이동 기능**
  - 현재 `App.jsx`의 `saveEditUser`는 churchId를 저장하지 않는다 → 무소속 성도가 나중에 교회가 생겨도 옮길 방법이 없다.
  - `PlatformAdminView.jsx` 사용자 편집에 교회 선택 드롭다운(allChurches) 추가, 교회 변경 시 `churchId`, `churchName` 갱신 + `departmentId/departmentName/subgroupId/subgroupName`은 null로 리셋(다음 로그인 때 기존 흐름이 부서/소그룹 선택 화면으로 보냄). 진도·점수·메모는 users/{uid} 아래라 자동 보존 — 추가 마이그레이션 불필요.
  - 규칙 확인: platformAdmin은 이미 users update 가능 — 규칙 변경 불필요.

---

## 사용자(관리자) 수동 작업 — Codex가 하지 말고 아래 목록에 안내만

- **M1** (T1 후): 플랫폼 관리자로 로그인 → "무소속 가상 교회 생성/점검" 버튼 클릭.
- **M2** (T5 후): `firebase deploy --only firestore:rules`.
- **M3** (T9 전): Firebase 콘솔 → Authentication → Sign-in method → **익명 활성화**. 같은 화면에서 미사용 익명 계정 자동 삭제(30일)도 켜기.
- **M4** (전체 완료 후): `npm run deploy`.

---

## 검증 체크리스트 (Codex가 가능한 범위에서, 나머지는 로그에 "미검증" 명시)

- [ ] `npm run build` 통과 (매 커밋).
- [ ] Phase 1: 무소속 가입 → 대시보드 진입, 로그아웃 → 무소속+이름+생일+전화4자리+비밀번호 재로그인 성공. 일반 교회 가입/로그인이 기존과 동일하게 동작(회귀 확인).
- [ ] Phase 2: 게스트 진입 → 본문 표시 → 읽기 완료 → 새로고침 후 진도 유지. 게스트 상태에서 Firestore write가 dailyVideos lazy-fill 외에 발생하지 않는지 네트워크 탭 확인.
- [ ] Phase 3: 게스트로 3일차까지 읽고 가입 → currentDay 3 시드 + score 0 확인. 관리자 화면에서 무소속 성도를 일반 교회로 이동 → 재로그인 시 부서 선택 화면으로 진입.

---

## 작업 로그 (Codex가 기록)

| 날짜 | 작업 | 변경 파일 | 비고 |
|---|---|---|---|
| 2026-07-09 | T1 상수 + 가상 교회 생성 버튼 | `src/data/constants.js`, `src/components/PlatformAdminView.jsx`, `src/utils/churchDirectory.js`, `HANDOFF_CODEX.md` | `npm run build` 통과. 수동 M1(플랫폼 관리자 버튼 클릭)은 미실행. |
| 2026-07-09 | T2 가짜 이메일에 무소속 식별자 확장 | `src/utils/helpers.js`, `src/hooks/useAuth.js`, `HANDOFF_CODEX.md` | `makeUnaffiliatedIdentity(birthdate, phone4)` 추가 및 무소속 이메일 생성 호출부 연결. `npm run build` 통과. |
| 2026-07-09 | T3 가입/로그인 로직 | `src/hooks/useAuth.js`, `HANDOFF_CODEX.md` | 무소속 가입 시 디렉토리/입장코드 검증 우회, 상수 교회명 사용, `phone4` 저장, 무소속 로그인 구포맷 재시도 제외. `npm run build` 통과. |
| 2026-07-09 | T4 로그인 화면 | `src/components/LoginView.jsx`, `HANDOFF_CODEX.md` | 무소속 선택지/전화번호 뒤 4자리 입력 UI 연결. `npm run build` 통과. Browser에서 로그인/가입 탭 UI 확인. 실제 Firebase 가입→대시보드 진입은 테스트 데이터 생성 부작용 때문에 미검증. |
| 2026-07-09 | T5 firestore.rules isRealUser 도입 | `firestore.rules`, `HANDOFF_CODEX.md` | 익명 인증의 users/churches/churchDirectory/platformStats 쓰기 차단. read 규칙과 dailyVideos create는 유지. `npm run build` 통과. 수동 M2(규칙 배포)는 미실행. |
| 2026-07-09 | T6 게스트 진도 저장소 유틸 | `src/utils/guestStorage.js`, `HANDOFF_CODEX.md` | `getGuestState`/`saveGuestState`/`recordGuestRead`/`clearGuestMigrated` 추가. readDates 400개 제한 및 365일 순환 처리. `npm run build` 통과. |
| 2026-07-09 | T7 게스트 세션 복원 | `src/hooks/useUserAuth.js`, `HANDOFF_CODEX.md` | Firebase 익명 사용자일 때 Firestore users 조회 없이 localStorage 게스트 상태로 currentUser 구성. `npm run build` 통과. |
| 2026-07-09 | T8 GuestReaderView 신설 + 라우팅 | `src/components/GuestReaderView.jsx`, `src/components/dashboard/DailyVideoCard.jsx`, `src/components/LoginView.jsx`, `src/App.jsx`, `HANDOFF_CODEX.md` | 게스트 전용 읽기 화면/라우팅 추가, DailyVideoCard 게스트 모드는 localStorage 저장으로 분기. `npm run build` 통과. 실제 버튼 진입 검증은 T9 후 진행 예정. |

---

## 📮 Codex → Claude 메모

> Codex: 작업을 마치거나 중단할 때 여기에 남겨라 — ① 완료/미완 상태 요약, ② 설계와 다르게 한 것과 이유, ③ 질문/막힌 것, ④ Claude가 리뷰할 때 봐야 할 지점.

(아직 없음)

---

## 📮 Claude → Codex 메모

- 이 설계는 3차 자체 점검을 거친 확정본이다. "더 나은 방법"이 보여도 위 설계 결정 4가지(가상 교회/익명 인증/localStorage 전용/클라이언트 상수)는 바꾸지 말고, 제안은 위 메모란에 적어라.
- firestore.rules의 `users` read 규칙에 일반 교인 멤버 쿼리가 거부되는 것으로 보이는 별개 버그가 있다. **이 저장소 작업에서 건드리지 말 것** — 별도 세션에서 처리 중이다. 랭킹이 빈 화면이어도 이번 작업의 회귀가 아니다.
- Firebase는 compat(v8 스타일) API만 쓴다. `import { doc, getDoc }` 같은 modular API를 섞지 마라.
- 커밋 푸시·배포는 전부 사용자 몫이다. 로컬 커밋까지만.
