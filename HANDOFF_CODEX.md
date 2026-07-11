# HANDOFF: 무소속 성도 가입 + 비로그인(게스트) 읽기

> 이 문서는 Claude(설계)와 Codex(구현) 사이의 인수인계 문서다.
> 설계 확정: 2026-07-09, Claude Fable 5 (3차 자체 점검 완료본).

---

## 작업 프로토콜 (Codex는 반드시 이 순서로)

> **현재 활성 작업: "🔁 라운드 4" 체크리스트 (T22~T28) → "🔁 라운드 5" (T29~T36) → "🔁 라운드 6" (T37~T39, 구글 로그인) → "🔁 라운드 7" (T40~T43, 교회 내 다중 소속) → "🔁 라운드 8" (T44~T48, 조직 간 소속 — T44는 Claude 선행) → "🔁 라운드 9" (T49~T53, 개인 우선 가입 — T49는 Claude 선행).** 라운드 1(T1~T11)·라운드 2(T12~T16)·라운드 3(T17~T21)은 완료·리뷰 통과됨.
> 라운드 1의 "검증 체크리스트"에 남은 `[ ]`는 배포 후 사용자가 하는 실환경 검증이므로 Codex 대상이 아니다.

1. **활성 라운드의 체크리스트**에서 `[ ]` 상태인 첫 작업을 찾는다. 작업은 번호 순서대로 진행한다 (의존성이 있다).
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

- [x] **T9. 로그인 화면에 게스트 진입 버튼**
  - `LoginView.jsx` member 탭 하단에 "로그인 없이 바로 읽기" 버튼 → `auth.signInAnonymously()` 호출 (에러 시 errorMsg 표시 — 특히 콘솔에서 익명 provider 미활성화면 `auth/operation-not-allowed`가 나므로 "잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 알려주세요" 문구).
  - 버튼을 누르면 T7의 onAuthStateChanged 경로로 자동으로 게스트 뷰에 진입한다 — 별도 setView 호출 불필요함을 확인할 것.

### Phase 3 — 전환 경로

- [x] **T10. 게스트 → 가입 시 진도 이관**
  - `useAuth.js` `buildNewMember`: 게스트 상태(`getGuestState()`)가 있고 `readDates`가 1개 이상이면 `currentDay`/`streak`/`lastReadDate`를 시드. **score/talent는 절대 이관하지 않는다** (localStorage는 위조 가능 — 점수 소급은 랭킹 오염 경로).
  - 이관 후 `saveGuestState({ migratedAt: <now> })`로 마킹 (재가입 시 이중 이관 방지 — migratedAt 있으면 이관 스킵).
  - 가입 화면에 이관 예고 문구: 게스트 기록이 있으면 "지금까지 읽은 N일차 진도를 가져옵니다 (점수는 가입 후부터 적립돼요)".
- [x] **T11. 관리자 교회 이동 기능**
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

- [x] `npm run build` 통과 (매 커밋).
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
| 2026-07-09 | T9 로그인 화면에 게스트 진입 버튼 | `src/components/LoginView.jsx`, `HANDOFF_CODEX.md` | `auth.signInAnonymously()` 버튼 추가 및 provider 비활성화 오류 문구 처리. `npm run build` 통과. Browser에서 버튼 렌더링/콘솔 무오류 확인. 실제 클릭 진입은 익명 계정 생성 부작용 및 M3 전제 때문에 미검증. |
| 2026-07-09 | T10 게스트 → 가입 시 진도 이관 | `src/hooks/useAuth.js`, `src/components/LoginView.jsx`, `HANDOFF_CODEX.md` | 게스트 readDates가 있고 migratedAt이 없으면 가입 문서의 currentDay/streak/lastReadDate만 시드, score/talent는 0 유지. 가입 화면 이관 예고 문구 추가. `npm run build` 통과. 실제 Firebase 가입 이관은 테스트 데이터 생성 부작용 때문에 미검증. |
| 2026-07-09 | T11 관리자 교회 이동 기능 | `src/App.jsx`, `src/components/PlatformAdminView.jsx`, `HANDOFF_CODEX.md` | 플랫폼 관리자 회원 편집에 교회 선택 추가. 교회 변경 시 부서/소그룹 필드 null 리셋, 저장 시 churchId/churchName 포함. `npm run build` 통과. 실제 Firestore 회원 이동은 운영 데이터 변경 부작용 때문에 미검증. |
| 2026-07-09 | T12 history ts 필드 추가 | `src/hooks/useUserBibleActions.js`, `HANDOFF_CODEX.md` | historyItem에 `ts: firebase.firestore.FieldValue.serverTimestamp()`만 추가. 기존 `date` 필드 유지. `npm run build` 통과. |
| 2026-07-09 | T13 단순 공통 관리자 컴포넌트 | `src/components/admin/StatCard.jsx`, `src/components/admin/ConfirmDialog.jsx`, `src/components/admin/Toast.jsx`, `src/components/admin/ProgressBar.jsx`, `src/components/admin/DonutStat.jsx`, `src/components/admin/index.js`, `HANDOFF_CODEX.md` | Phase A 기본 컴포넌트 신설. 화면 연결은 다음 작업에서 수행. `npm run build` 통과. |
| 2026-07-09 | T14 AdminDataTable + SlideOverPanel | `src/components/admin/AdminDataTable.jsx`, `src/components/admin/SlideOverPanel.jsx`, `src/components/admin/index.js`, `HANDOFF_CODEX.md` | 검색/정렬/50개 페이지네이션/다중 선택/모바일 카드형 테이블과 우측 슬라이드 패널 신설. `npm run build` 통과. |
| 2026-07-09 | T15 교회 관리자 대시보드 탭 | `src/components/ChurchAdminView.jsx`, `src/utils/statsUtils.js`, `HANDOFF_CODEX.md` | 기본 탭을 대시보드로 변경, StatCard/부서별 현황/관심 필요 명단/스트릭 Top 5 추가, `computeAtRisk` 신설. history 직접 시간대 집계는 현 rules상 churchAdmin history read가 없어 폴백 표기. `npm run build` 통과. |
| 2026-07-09 | T16 교인 관리 탭 개편 | `src/components/ChurchAdminView.jsx`, `HANDOFF_CODEX.md` | AdminDataTable 적용, 부서/읽기상태 필터, CSV 내보내기, 일괄 소그룹 배정/비밀번호 초기화, SlideOver 상세, Toast/ConfirmDialog 연결, 비밀번호 평문 표시 제거. `npm run build` 통과. 실제 Firestore 쓰기 작업은 운영 데이터 변경 부작용 때문에 미검증. |
| 2026-07-09 | T17 talent 적립 개편 + 비밀 상점 해금 플래그 | `src/hooks/useUserBibleActions.js`, `src/utils/helpers.js`, `HANDOFF_CODEX.md` | score 적립 로직은 유지하고 talent만 하루 첫 읽기 `10 + min(streak, 7)`로 분리. history `talent` 필드와 `secretShopUnlocked`/`secretShopJustUnlocked` 추가, 상태 매핑 추가. `npm run build` 통과. |
| 2026-07-09 | T18 매일 성경퀴즈 | `src/data/bibleQuiz.js`, `src/components/dashboard/BibleQuizCard.jsx`, `src/components/dashboard/index.js`, `src/components/DashboardView.jsx`, `src/utils/helpers.js`, `HANDOFF_CODEX.md` | 113문항 퀴즈 은행과 KST 오늘 문제 선택, 대시보드 하단 퀴즈 카드, 트랜잭션 보상 처리 추가. `npm run build` 통과. 퀴즈 내용은 사용자 검수 필요. |
| 2026-07-09 | T19 비밀 달란트 상점 — 교인용 | `src/components/dashboard/TalentShop.jsx`, `src/components/dashboard/index.js`, `src/components/DashboardView.jsx`, `src/App.jsx`, `HANDOFF_CODEX.md` | `settings/talentShop.enabled === true`일 때만 진입 카드/해금 모달/상점 렌더링. active 상품 구매 트랜잭션과 내 구매 내역 추가. `talentPurchases` create 필드는 규칙 화이트리스트와 일치. `npm run build` 통과. |
| 2026-07-09 | T20 교회 관리자 달란트 상점 탭 | `src/components/ChurchAdminView.jsx`, `HANDOFF_CODEX.md` | 관리자 탭 추가, 상점 enabled 토글, 상품 CRUD, 최근 구매 200건 클라이언트 필터, 수령 완료/취소·환불 처리 추가. `npm run build` 통과. 로컬 dev 앱 렌더/콘솔 무오류 확인, 관리자 인증 진입 및 실데이터 구매 처리는 미검증. |
| 2026-07-09 | T21 달란트 잔액 전원 리셋 버튼 | `src/components/PlatformAdminView.jsx`, `HANDOFF_CODEX.md` | 플랫폼 관리자 시스템 섹션에 1회성 전원 달란트 0 초기화 버튼 추가. 10개 단위 batch update로 `talent: 0`, `talentMigrated: true`, `updatedAt` 저장. `npm run build` 통과. 파괴적 작업이므로 버튼 실행은 미실행. |
| 2026-07-10 | T22 날짜 매칭 영상 선택 | `src/utils/helpers.js`, `src/components/dashboard/DailyVideoCard.jsx`, `HANDOFF_CODEX.md` | `titleMatchesDate(title, dateKey)` 추가 및 재생목록 자동 선택 시 제목 날짜 매칭 우선, 없으면 기존 최신 게시 영상 폴백. `npm run build` 통과. 주석 케이스 5개 이상 명시. |
| 2026-07-10 | T23 묵상 해설/기도제목 UX | `src/components/dashboard/DailyVideoCard.jsx`, `HANDOFF_CODEX.md` | 챕터 표준 키는 유지하고 표시 라벨을 묵상 해설/성경읽기/기도제목으로 변경. 썸네일 재생 시 해설 챕터부터 시작, 구간 안내 문구와 기도제목 강조 버튼 추가. `npm run build` 통과. |
| 2026-07-10 | T24 관리자 오늘 영상 미리보기 | `src/components/PlatformAdminView.jsx`, `HANDOFF_CODEX.md` | 매일 영상 탭의 연결 테스트를 T22 선택 로직 기반 오늘 영상 미리보기로 확장. 성인용/어린이용 제목·게시일·챕터·타임스탬프 경고 표시. `npm run build` 통과. 실제 YouTube API 호출은 API 키/재생목록 필요로 미검증. |
| 2026-07-10 | T25 범위 파서 + 퀴즈 선택기 | `src/utils/quizEngine.js`, `src/data/quiz/.gitkeep`, `HANDOFF_CODEX.md` | 66권 약칭 범위 파서, 최근 읽기 완료일 캐시/스케줄 범위 조회, 책별 JSON lazy load, readCount 기반 문항 회전 선택기 추가. `npm run build` 통과. 문항 JSON은 T28 전까지 없어 pool은 빈 배열을 반환. |
| 2026-07-10 | T26 BibleQuizCard v2 | `src/components/dashboard/BibleQuizCard.jsx`, `src/utils/quizEngine.js`, `src/utils/helpers.js`, `HANDOFF_CODEX.md` | 읽기 전 잠금 카드, 본문 기반 퀴즈 로딩, `quizKey` 문제 고정, 기존 `QUIZ_BANK` 폴백을 연결. 보상/시도 트랜잭션은 유지하고 신규 users 필드는 `quizKey`만 추가. `npm run build` 통과. |
| 2026-07-10 | T27 문항 검증 스크립트 | `scripts/validate-quiz.mjs`, `HANDOFF_CODEX.md` | 책별 JSON 필수 필드, ref 책 일치, 장별 q 중복, choices 중복, 장당 문항 수 경고를 검사하는 스크립트 추가. `node scripts/validate-quiz.mjs` 통과(현재 JSON 없음 안내), `npm run build` 통과. |
| 2026-07-10 | T28 부분 — 민수기 문항 | `src/data/quiz/numbers.json`, `HANDOFF_CODEX.md` | 민수기 17-36장 장당 3문항(총 60문항) 추가. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-10 | T28 부분 — 열왕기상 문항 | `src/data/quiz/1kings.json`, `HANDOFF_CODEX.md` | 열왕기상 1-22장 장당 3문항(총 66문항) 추가. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-10 | T28 부분 — 잠언 문항 | `src/data/quiz/proverbs.json`, `HANDOFF_CODEX.md` | 잠언 1-31장 장당 3문항(총 93문항) 추가. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-10 | T28 부분 — 전도서/아가 문항 | `src/data/quiz/ecclesiastes.json`, `src/data/quiz/songofsongs.json`, `HANDOFF_CODEX.md` | 전도서 1-12장 장당 3문항(총 36문항), 아가 1-8장 장당 3문항(총 24문항) 추가. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-10 | T28 부분 — 열왕기하 문항 | `src/data/quiz/2kings.json`, `HANDOFF_CODEX.md` | 열왕기하 1-25장 장당 3문항(총 75문항) 추가. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-11 | T27b 파서 장 경계 수정 + 커버리지 검증기 | `src/utils/quizParsing.js`, `src/utils/quizEngine.js`, `scripts/validate-quiz.mjs`, `HANDOFF_CODEX.md` | 장 경계 절 범위(`A:B-C:D`)를 시작/중간/끝 장 아이템으로 전개하도록 파서 분리·수정. 검증기에 365일 스케줄 파싱, 저작 완료 범위 pool 검사, 미저작 집계, 신약 세그먼트 출력 추가. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. |
| 2026-07-11 | T28 부분 — 누가복음 1-4장 문항 | `src/data/quiz/luke.json`, `HANDOFF_CODEX.md` | 신약일독 세그먼트 기준 누가복음 1:1-4:44 범위 9세그먼트, 총 47문항 추가. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-11 | T28 부분 — 누가복음 5-8장 문항 | `src/data/quiz/luke.json`, `HANDOFF_CODEX.md` | 신약일독 세그먼트 기준 누가복음 5:1-8:56 범위 8세그먼트, 47문항 추가(`luke.json` 총 94문항). `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-11 | T28 부분 — 누가복음 9-10장 초반 문항 | `src/data/quiz/luke.json`, `HANDOFF_CODEX.md` | 신약일독 세그먼트 기준 누가복음 9:1-10:20 범위 3세그먼트, 15문항 추가(`luke.json` 총 109문항). Day 206-208이 각각 pool 5/5로 확인됨. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-11 | T28 부분 — 누가복음 10-11장 문항 | `src/data/quiz/luke.json`, `HANDOFF_CODEX.md` | 신약일독 세그먼트 기준 누가복음 10:21-11:54 범위 3세그먼트, 15문항 추가(`luke.json` 총 124문항). Day 209-211이 각각 pool 5/5로 확인됨. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-11 | T28 부분 — 누가복음 12-13장 초반 문항 | `src/data/quiz/luke.json`, `HANDOFF_CODEX.md` | 신약일독 세그먼트 기준 누가복음 12:1-13:17 범위 3세그먼트, 15문항 추가(`luke.json` 총 139문항). Day 212-214가 각각 pool 5/5로 확인됨. `node scripts/validate-quiz.mjs` 통과, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-11 | T28 부분 — 누가복음 13장 후반 문항 | `src/data/quiz/luke.json`, `HANDOFF_CODEX.md` | 신약일독 세그먼트 기준 누가복음 13:18-35 범위 5문항 추가(`luke.json` 총 144문항). Day 215 pool 5/5 확인 필요. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-11 | T28 부분 — 누가복음 14장 문항 | `src/data/quiz/luke.json`, `HANDOFF_CODEX.md` | 신약일독 세그먼트 기준 누가복음 14:1-14 범위 6문항, 14:15-35 범위 5문항(총 11문항) 추가(`luke.json` 총 155문항). Day 216-217 pool 6/5, 5/5 확인. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. T28 전체 90일 커버리지는 아직 미완료. |
| 2026-07-11 | T28 부분 — 누가복음 15-22장 문항 | `src/data/quiz/luke.json`, `HANDOFF_CODEX.md` | 신약일독 Day 218-233의 누가복음 15:1-22:46, 16개 세그먼트에 86문항 추가(`luke.json` 총 241문항). 모든 해당 세그먼트 pool 5개 이상 확인. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. |
| 2026-07-11 | T28 부분 — 사도행전 14-20장 문항 | `src/data/quiz/acts.json`, `HANDOFF_CODEX.md` | 신약일독 Day 239-250의 사도행전 14-20장, 12개 세그먼트에 60문항 추가. 모든 해당 세그먼트 pool 5/5 확인. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. |
| 2026-07-11 | T28 부분 — 에스겔 전권 문항 | `src/data/quiz/ezekiel.json`, `HANDOFF_CODEX.md` | 에스겔 1-48장 장당 3문항, 총 144문항 추가. 일년일독 Day 236-250 구간을 포함해 장별 pool을 확보. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. |
| 2026-07-11 | T28 부분 — 에베소·빌립보·골로새 문항 | `src/data/quiz/ephesians.json`, `src/data/quiz/philippians.json`, `src/data/quiz/colossians.json`, `HANDOFF_CODEX.md` | 신약일독 Day 251-264 세그먼트용 70문항 추가(에베소 30, 빌립보 20, 골로새 20). 장 경계 세그먼트의 ref 범위를 분리해 각 day pool 5개 이상 확보. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. |
| 2026-07-11 | T28 부분 — 누가복음 마무리·사도행전 후반 | `src/data/quiz/luke.json`, `src/data/quiz/acts.json`, `HANDOFF_CODEX.md` | 누가복음 Day 234-238 마지막 5세그먼트에 43문항, 사도행전 후반 14세그먼트에 99문항을 추가해 각각 해당 신약일독 전 범위를 완성(`luke.json` 284문항, `acts.json` 159문항). 각 day pool 5개 이상 확인. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. |
| 2026-07-11 | T28 부분 — 베드로전·후서·요한계시록 문항 | `src/data/quiz/1peter.json`, `src/data/quiz/2peter.json`, `src/data/quiz/revelation.json`, `HANDOFF_CODEX.md` | 신약일독 Day 266-280용 75문항 추가(베드로전서 25, 베드로후서 15, 요한계시록 8-14장 35). 각 day pool 5/5 확인. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. |
| 2026-07-11 | T28 부분 — 창세기·신명기 문항 | `src/data/quiz/genesis.json`, `src/data/quiz/deuteronomy.json`, `HANDOFF_CODEX.md` | 일년일독 Day 274-280 대상 창세기 1-20장 60문항, 신명기 1-8장 24문항을 장당 3문항으로 추가. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. |
| 2026-07-11 | T28 부분 — 골로새서 경계·빌레몬서 문항 | `src/data/quiz/colossians.json`, `src/data/quiz/philemon.json`, `HANDOFF_CODEX.md` | 골로새서 4:1 문항을 추가해 Day 263 분할 세그먼트 pool 5/5를 복구하고, 빌레몬서 1장 5문항을 추가해 Day 265 pool 5/5를 확보. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. |
| 2026-07-11 | T28 완료 — 90일 커버리지 마무리 | `src/data/quiz/genesis.json`, `src/data/quiz/jonah.json`, `src/data/quiz/amos.json`, `src/data/quiz/hosea.json`, `src/data/quiz/zephaniah.json`, `HANDOFF_CODEX.md` | 창세기 37-50장 42문항과 요나 12·아모스 27·호세아 42·스바냐 9문항 추가. 독립 감사에서 Day 191-280 기준 whole_bible 구약 215장 모두 장당 3문항, whole_bible 신약 포함 23일 및 new_testament 90일 모두 일일 pool 최소 5문항(실패 0) 확인. `node scripts/validate-quiz.mjs`, `npm run build` 통과. 퀴즈 문항 신학적 검수는 사용자 몫. |
| 2026-07-11 | T29 읽기 완료 중복 제출 방지 | `src/hooks/useUserBibleActions.js`, `src/hooks/useBibleLogic.js`, `src/App.jsx`, `src/components/DashboardView.jsx`, `src/components/dashboard/BibleReader.jsx`, `src/components/GuestReaderView.jsx`, `src/utils/guestStorage.js`, `HANDOFF_CODEX.md` | 로그인 경로에 state+ref UI 가드와 트랜잭션 `(readCount, day)` 중복 판정·최종 반환값 처리를 추가하고, 게스트에 동일 가드와 `didRecord` 부수효과 차단을 적용. 일반 중복·한 장 더 읽기·365→1 순환 판정 재검토 및 `npm run build`, `git diff --check` 통과. 실제 Firebase 더블클릭은 운영 데이터 변경 때문에 미검증. |
| 2026-07-11 | T30 주간 읽기왕 수리 | `src/hooks/useUserBibleActions.js`, `src/utils/helpers.js`, `src/utils/statsUtils.js`, `src/components/dashboard/ReadingChampionSection.jsx`, `HANDOFF_CODEX.md` | 읽기 트랜잭션에 `recentReadDates` 최근 14일 롤링 필드 저장, 상태 매핑, 레거시 `readHistory` 병합·날짜 중복/invalid/미래 제거, 화면 `weeklyCount` 직접 표시를 적용. N회 Firestore 조회 없음. `npm run build`, `git diff --check`, 독립 diff 재검토 통과. 기존 사용자는 다음 읽기부터 쌓여 최대 1주 후 랭킹이 채워질 수 있음. |
| 2026-07-11 | T31 광고 하단 여백 | `src/components/LoginView.jsx`, `src/components/PlanSelectionView.jsx`, `HANDOFF_CODEX.md` | LoginView 공통 루트 1곳과 PlanSelectionView 4개 분기 루트에 `safe-area-inset-bottom + 72px` 하단 여백 적용. 적용 위치 5곳 독립 감사, `npm run build`, `git diff --check` 통과. |
| 2026-07-11 | T32 완독 축하 개선 | `src/components/dashboard/CompletionCelebration.jsx`, `src/components/dashboard/index.js`, `src/App.jsx`, `src/components/DashboardView.jsx`, `src/hooks/useUserBibleActions.js`, `src/components/ChurchAdminView.jsx`, `HANDOFF_CODEX.md` | 완독 alert를 전체화면 축하 오버레이로 교체하고 완주 회차·다음 회차 표시, 고우선 z-index·초점 트랩·ESC/복원 적용. 교회 관리자 대시보드에 활성 교인 기준 완독자 StatCard와 명단 패널 추가. 랜딩 `finished_total` 기존 연결 확인. `npm run build`, `git diff --check`, 독립 재검토 통과. 실제 365일 완주/관리자 인증 화면은 운영 데이터 변경 없이 미검증. |
| 2026-07-11 | T33 퀴즈 우선 게이트 | `src/utils/quizEngine.js`, `src/components/dashboard/BibleQuizCard.jsx`, `src/components/DashboardView.jsx`, `src/components/dashboard/BibleReader.jsx`, `HANDOFF_CODEX.md` | 첫 읽기 완료 전 현재 진행일 본문 퀴즈를 로드하고 정답/2회 소진/오늘 건너뛰기/문항 없음·오류에서 게이트 개방. 첫 오늘 완료만 잠그고 한 장 더 읽기·과거 본문은 제외, 잠금 영역 클릭 시 퀴즈로 스크롤. skip 날짜·사용자 재조회와 깨진 저장 quizKey 교정 추가. T33의 문항 없음 fail-open 요구를 T26의 일반 상식 폴백보다 우선 적용. `npm run build`, `git diff --check`, 독립 재감사 통과. 실제 퀴즈 제출은 운영 데이터 변경 때문에 미검증. |
| 2026-07-11 | T34 오늘 받은 달란트 표시 | `src/hooks/useUserBibleActions.js`, `src/App.jsx`, `src/components/DashboardView.jsx`, `src/components/dashboard/CompletionCelebration.jsx`, `HANDOFF_CODEX.md` | 트랜잭션 최신 퀴즈 상태로 읽기·퀴즈 획득량과 보유 달란트를 계산해 첫 읽기 토스트에 표시. 완독일에는 토스트를 지우고 오버레이에 동일 정보 표시, 같은 날 한 장 더 읽기(a=0)는 달란트 줄 생략. 새 Firestore 필드 없음. `npm run build`, `git diff --check`, 독립 재감사 통과. 실제 읽기/퀴즈 제출은 운영 데이터 변경 때문에 미검증. |
| 2026-07-11 | T35 묵상 저장·조회 점검 및 수정 | `src/hooks/useMemos.js`, `src/hooks/useBibleLogic.js`, `src/App.jsx`, `src/components/DashboardView.jsx`, `src/components/dashboard/MemoSection.jsx`, `src/utils/exportUtils.js`, `HANDOFF_CODEX.md` | 저장 실패 낙관 상태 롤백·입력 유지·사용자 오류·중복 제출 방지, 조회 실패 표시, 계정 전환 상태/비동기 응답 격리, 1독 전용 레거시 키 fallback, 내보내기 `sortedMemos` ReferenceError 수정. 게스트 미노출·규칙상 본인 저장 허용 확인. `npm run build`, `git diff --check`, 독립 전체 경로 재감사 통과. 실제 Firestore 실패 주입은 미검증. |
| 2026-07-11 | T36 전체 기능 점검 패스 | `src/components/ChurchAdminView.jsx`, `src/components/PlatformAdminView.jsx`, `src/components/dashboard/BibleQuizCard.jsx`, `src/components/dashboard/BibleReader.jsx`, `src/components/dashboard/DailyVideoCard.jsx`, `src/components/dashboard/TalentShop.jsx`, `HANDOFF_CODEX.md` | 로컬 브라우저에서 로그인 4화면·무소속 선택, 게스트 진입→영상·본문→새번역 변경→읽기 완료(DAY 192→193)→새로고침 진도·버전 복원을 확인했고 콘솔 오류·경고 0건. 관리자/A4 인쇄 3종·상점·퀴즈 경로는 정적 감사해 QR 인쇄 팝업 선점, 미리보기 구매 차단, guest 퀴즈 게이트 제외, 비정상 배열·quizKey·계정 전환 상태 방어를 보강. `npm run build`, `node scripts/validate-quiz.mjs`, Babel 115파일 parse, `git diff --check`, 독립 코드리뷰 통과. 게스트 검증에는 익명 Auth 세션과 localStorage만 사용했으며 users/구매/admin 쓰기는 하지 않음. 실제 가입·구매·관리자 Firestore 조작, 인증 필요 관리자 실화면·A4 실제 인쇄 대화상자, 회원 퀴즈 제출, 실 YouTube API·Google OAuth는 미검증. |
| 2026-07-11 | T37 관리자 Google 로그인 | `src/utils/authFlowGuard.js`, `src/hooks/useUserAuth.js`, `src/hooks/useAuth.js`, `src/components/LoginView.jsx`, `src/App.jsx`, `HANDOFF_CODEX.md` | 관리자 탭에만 compat `signInWithPopup` Google 로그인과 오류·카카오톡 인앱 안내를 추가하고 기존 관리자 후처리를 공유. users 문서가 없거나 관리자 역할이 아니면 즉시 로그아웃하며 `churchAdmin`/`platformAdmin`과 레거시 플랫폼 역할 `superAdmin`만 허용. password provider 소실 안내 토스트와 Auth 리스너 대화형 흐름·stale UID 경합 방어 추가. 브라우저에서 관리자 버튼 1개, member/memberSignup/adminSignup/guest 비노출, 콘솔 오류 0건 확인. `npm run build`, Auth flow 중첩 테스트, `git diff --check`, 독립 계약 감사·코드리뷰 통과. M8 미실행으로 실 Google 팝업·실제 관리자 로그인·계정 병합은 미검증. |
| 2026-07-11 | T38 교회 등록 Google 계정 흐름 | `src/hooks/useAuth.js`, `src/components/LoginView.jsx`, `src/App.jsx`, `HANDOFF_CODEX.md` | adminSignup 1단계에 Google 시작과 기존 이메일·비밀번호 방식을 병행하고 Google 이메일 고정·이름 수정, 이메일 방식 복귀, 탭 이탈 취소를 구현. 팝업·최종 제출 Promise-ref 중복 방어와 장기 Auth guard를 적용하고, 최종 transaction에서 users 문서 부재와 현재 Auth uid·email·google.com provider를 재검증한 뒤 church/user/churchDirectory 3문서를 원자 기록. Google users는 `password: null`, createUser/private/auth 쓰기 없음. 브라우저에서 Google+이메일 병행 UI와 최종 reload 이후 콘솔 오류 0건 확인. `npm run build`, 원자성·상태 정적 계약 검사, `git diff --check`, 독립 재감사 통과. M8 미실행으로 실 Google 팝업·Firestore transaction·가입→온보딩→로그아웃→Google 재로그인은 미검증. |
| 2026-07-11 | T39 기존 관리자 Google 연결 | `src/components/admin/GoogleLinkCard.jsx`, `src/components/admin/index.js`, `src/components/ChurchAdminView.jsx`, `src/components/PlatformAdminView.jsx`, `src/App.jsx`, `HANDOFF_CODEX.md` | UID·관리자 역할을 재검증하는 공용 카드를 교회 관리자 설정/플랫폼 관리자 시스템 탭에 연결. compat `linkWithPopup`과 provider 상태 갱신, 충돌·팝업·카카오톡 안내, 중복 실행 방어를 추가하고, Google 연결 후 비밀번호 provider를 2회 확인으로 제거한 뒤 users.password를 null 처리. Auth 해제 후 Firestore 갱신 실패는 부분 성공 경고로 구분하며 users의 다른 필드와 private/auth는 수정하지 않음. `npm run build`, T39 정적 계약 검사, `git diff --check`, 독립 코드리뷰 통과. M8/M9 미실행으로 실 Google 연결·재로그인·비밀번호 제거는 미검증. |
| 2026-07-11 | T40 데이터 필드 + 공용 헬퍼 | `src/utils/memberships.js`, `src/utils/helpers.js`, `src/hooks/useAuth.js`, `src/components/PlatformAdminView.jsx`, `HANDOFF_CODEX.md` | 신규 users 생성 경로와 seed에 `extraMemberships: []`를 추가하고 기존·비정상 문서는 `userDocToState`에서 빈 배열로 안전 매핑. 공용 헬퍼는 주 소속을 우선해 추가 소속 최대 3개를 정규화하고 `(departmentId, subgroupId)` 기준 중복 제거하며, 부서/소그룹 판정도 이 목록만 사용. 기존 사용자 백필은 하지 않음. `npm run build`, 중복·상한·입력 불변·비정상 데이터 인라인 assertion, `git diff --check`, 독립 코드리뷰 통과. |
| 2026-07-11 | T41 집계·랭킹에 다중 소속 반영 | `src/utils/statsUtils.js`, `src/hooks/useBibleLogic.js`, `src/hooks/useUserBibleActions.js`, `src/hooks/useDepartment.js`, `src/components/DashboardView.jsx`, `src/components/ChurchAdminView.jsx`, `src/components/modals/RankingModal.jsx`, `src/components/dashboard/DashboardHeader.jsx`, `src/components/dashboard/SubgroupRankingCard.jsx`, `src/components/DemoTour.jsx`, `HANDOFF_CODEX.md` | 소그룹·부서 후보 판정을 공용 멤버십 헬퍼로 교체하고 본인 화면 기준은 주 소속으로 유지. 통계 입력은 uid 중복 제거 후 boolean 포함 판정으로 그룹별 1회 집계하고, 교회/플랫폼 전체·MVP·위험군·부서 카드도 uid 1회를 보장. 랭킹은 department/subgroup ID pair를 보존해 동명 그룹을 분리하며 레거시 이름 저장도 호환. `npm run build`, esbuild fixture assertion(다중·중복·동명·레거시·단일 소속), `git diff --check`, 독립 코드리뷰, 브라우저 reload 후 콘솔 오류·경고 0건 통과. 인증 필요 랭킹 실화면은 운영 데이터 부작용 때문에 미검증. |
| 2026-07-11 | T42 교회 관리자 추가 소속 관리 | `src/components/ChurchAdminView.jsx`, `src/utils/exportUtils.js`, `HANDOFF_CODEX.md` | 교인 상세에 주 소속과 추가 소속 최대 3개를 표시하고 pair 기준 추가/제거 UI를 구현. 최신 users 문서를 읽는 transaction으로 add/remove와 주 소속 변경을 처리해 동시 갱신 유실·중복을 막고, 교회/삭제 상태·중복·상한을 재검증. 목록/검색/부서 필터/compact 표시에 추가 소속을 반영하고 주 소속 변경 문구를 명확화. 두 CSV는 주+추가 소속을 단일 소속 셀에 병기하고 quote/newline/formula injection 방어와 BOM을 유지. `npm run build`, membership/legacy/modern 동명/CSV fixture, `git diff --check`, 독립 코드리뷰, 브라우저 reload 콘솔 오류·경고 0건 통과. 실제 Firestore add/remove/일괄 변경은 운영 데이터 부작용 때문에 미검증. |
| 2026-07-11 | T43 성도 화면 추가 소속 표시 | `src/components/DashboardView.jsx`, `src/components/dashboard/DashboardHeader.jsx`, `src/components/dashboard/SubgroupRankingCard.jsx`, `src/components/modals/RankingModal.jsx`, `HANDOFF_CODEX.md` | DashboardView에서 공용 헬퍼로 주 소속과 분리한 추가 소속 최대 3개를 한 번만 정규화하고 무소속은 강제로 숨김. 헤더에는 `+부서 · 소그룹` 보조 뱃지, 요약/전체 랭킹에는 neutral `추가 소속` 뱃지를 표시하되 우리팀·파란 강조는 주 소속만 유지. modern 동명 ID는 분리하고 legacy 이름 ID는 호환하며 모바일 말줄임/뱃지 고정을 보강. `npm run build`, matcher fixture, `git diff --check`, 독립 코드리뷰, 브라우저 reload 콘솔 오류·경고 0건 통과. 인증 필요 실제 성도 화면은 미검증. |
| 2026-07-12 | T45 로그인 시 내 조직 파악 | `src/utils/roster.js`, `src/utils/rosterSnapshot.js`, `src/hooks/useAuth.js`, `src/hooks/useUserAuth.js`, `src/App.jsx`, `HANDOFF_CODEX.md` | 실제 회원 로그인 경로에서 `collectionGroup('roster').where('uid','==',uid)`를 병렬 조회해 검증·중복 제거·orgId 정렬한 최대 3개 소속을 `currentUser.extraOrgs`에만 보존. 실패는 빈 배열로 처리하고 동일 uid 중복 요청을 합쳤으며, 게스트는 조회하지 않는다. 온보딩 저장 시 transient 필드의 users 문서 영속화를 차단. `npm run build`, mapper fixture, `git diff --check`, 독립 리뷰 2건 통과. 실제 인증 계정의 collectionGroup 조회는 미검증. |
| 2026-07-12 | T46 공동체 추가·탈퇴 흐름 | `src/components/dashboard/CommunityMembershipCard.jsx`, `src/components/dashboard/index.js`, `src/components/DashboardView.jsx`, `src/utils/roster.js`, `src/utils/rosterSnapshot.js`, `HANDOFF_CODEX.md` | 회원 대시보드에 주 소속+외부 공동체 목록, 검색·입장코드 검증, 부서/소그룹 선택 후 roster 생성, confirm 탈퇴를 추가. mutation 전 오류를 숨기지 않는 전체 collectionGroup 재조회로 중복·최대 3개를 fail-closed 검증하고 users 문서에는 저장하지 않는다. 모달 ESC·포커스 트랩/복원·스크롤 잠금·ARIA 적용. `npm run build`, mapper 상한 fixture, `git diff --check`, 독립 리뷰 3건, 비인증 랜딩 브라우저 콘솔 오류 0건 통과. 인증 회원의 실제 roster 생성·삭제는 운영 데이터 변경 없이 미검증. 동시 탭 max3/create-only 한계는 Claude 메모에 기록. |
| 2026-07-12 | T47 읽기 진도 roster 동기화 | `src/hooks/useUserBibleActions.js`, `HANDOFF_CODEX.md` | 현재 `extraOrgs` 최대 3개 roster에 score/currentDay/streak/readCount/lastReadDate/updatedAt만 users·history와 같은 transaction으로 update. 삭제 경합으로 전체 transaction이 취소되면 strict collectionGroup 재조회 후 남은 행으로 1회 재시도하며 행을 재생성하지 않는다. 재조회도 일시 실패하면 개인 읽기만 원자 재시도하고 기존 runtime 목록을 보존해 다음 절대 진도 update에서 회복. Auth UID guard와 함수형 상태 갱신으로 계정 전환 오염 차단. `npm run build`, `git diff --check`, 독립 리뷰 3건 통과. 실제 roster 정상/제명 경합은 미검증. |
| 2026-07-12 | T48 조직 랭킹 병합·관리자 명부 | `src/utils/rosterMembers.js`, `src/hooks/useDepartment.js`, `src/components/ChurchAdminView.jsx`, `src/utils/exportUtils.js`, `HANDOFF_CODEX.md` | 자체 users 교인을 우선하는 uid 병합으로 roster 멤버를 랭킹·달리기·통계·관심 명단·완독자에 포함하고 삭제 자체 교인의 roster 부활을 차단. 관리자 명부에 외부 뱃지와 CSV 구분을 추가하고 roster 소그룹 update·제명 delete만 허용. 외부 users/private/history/비밀번호/달란트 직접 차감·환불은 UI와 handler에서 차단하되 조직 구매 수령은 허용. roster 실패는 자체 교인 로드와 격리. `npm run build`, mapper/own-first fixture, `git diff --check`, 독립 리뷰 3건 통과. 실제 관리자 인증·roster update/delete는 미검증. |
| 2026-07-12 | T50 개인 가입 화면 | `src/App.jsx`, `src/components/LoginView.jsx`, `src/hooks/useAuth.js`, `src/utils/helpers.js`, `HANDOFF_CODEX.md` | 첫 화면에 개인 계정 진입을 추가하고 Google 또는 이름·생년월일 8자리·전화4·비밀번호 방식을 제공. 비밀번호 방식은 교회 ID 없는 `이름_생일p전화4@bible.local` 식별자와 `private/auth`를 사용하고, Google 방식은 비밀번호 없이 personal users 문서를 생성. 기존 교인 로그인과 게스트 진도 이관을 유지하고 중복 제출·Auth 경합을 방어. `npm run build`, `git diff --check` 통과. 실제 Firebase Auth/Firestore 가입·Google 팝업은 운영 데이터 생성 때문에 미검증. |

---

## 📮 Codex → Claude 메모

> Codex: 작업을 마치거나 중단할 때 여기에 남겨라 — ① 완료/미완 상태 요약, ② 설계와 다르게 한 것과 이유, ③ 질문/막힌 것, ④ Claude가 리뷰할 때 봐야 할 지점.

2026-07-09 Codex:
- 완료: T1~T11 체크리스트 전체 구현 및 각 작업 단위 커밋 완료. 모든 커밋 전 `npm run build` 통과.
- 설계와 다르게 한 점: 실제 Firebase 가입/익명 로그인/회원 교회 이동은 운영 데이터 생성·변경 부작용이 있어 실행 검증하지 않고 미검증으로 로그에 남김. Browser 검증은 UI 렌더링 중심으로 수행.
- 질문/막힌 것: 없음. 단, M1(무소속 가상 교회 생성 버튼 클릭), M2(firestore.rules 배포), M3(익명 인증 활성화), M4(gh-pages 배포)는 사용자 수동 작업으로 남아 있음.
- 리뷰 포인트: `DailyVideoCard`는 게스트 모드에서 users 문서 쓰기를 하지 않도록 분기했음. `GuestReaderView`는 DashboardView를 재사용하지 않고 읽기/TTS/영상/진도만 포함. `firestore.rules`는 지정된 네 쓰기 규칙만 `isRealUser()`로 교체했고 `users` read와 `dailyVideos` create는 유지.

2026-07-09 Codex 라운드2:
- T12~T16 완료. T15의 "어제 이 시각" 직접 집계는 현재 `users/{uid}/history` read 규칙상 churchAdmin이 읽을 수 없어 구현하지 않고, `lastReadDate` 기반 "오늘 누적 vs 어제 최종" 폴백 표기로 대시보드에 반영함. T16의 SlideOver 최근 기록도 같은 권한 제약으로 실패 시 안내 토스트/빈 상태를 표시한다. firestore.rules 수정 금지 제약 때문에 규칙 변경은 하지 않음.
- T16의 일괄 소그룹 배정/비밀번호 초기화/삭제/복원은 실제 운영 Firestore 문서를 바꾸는 작업이라 로컬에서 클릭 실행 검증하지 않았고, `npm run build`로 컴파일 검증만 완료.

2026-07-09 Codex 라운드3:
- T17 완료. `score` 계산은 기존 `addedScore = 10 + streakBonus` 흐름을 유지했고, `talent`만 하루 첫 읽기 기준으로 분리했다. 비밀 상점 UI는 T19 몫이라 아직 렌더링하지 않음.
- T18 완료. 성경퀴즈는 113문항으로 구성했고, 정답/근거 구절의 신학적·표기 검수는 사용자 몫으로 남김.
- T19 완료. 교인용 비밀 상점은 교회 설정이 명시적으로 enabled일 때만 보이며, 구매 문서는 `uid, memberName, itemId, itemName, price, status, createdAt`만 기록한다. 실제 구매 클릭은 운영 데이터 변경이라 실행 검증하지 않음.
- T20 완료. 구매 내역은 복합 인덱스를 피하려고 `orderBy('createdAt','desc').limit(200)`만 사용하고, 현재 교회 교인 uid로 클라이언트 필터링한다. 로컬 dev는 로그인 화면 렌더와 콘솔 무오류까지만 확인했고, 교회 관리자 인증 진입은 미검증.
- T21 완료. 전원 달란트 리셋 버튼은 파괴적 수동 작업이라 실행하지 않음. 배포 후 상점 오픈 시 사용자가 직접 눌러야 한다.

2026-07-10 Codex 라운드4:
- T22 완료. 자동 채움은 제목 날짜가 `dateKey`와 맞는 게시 완료 영상을 우선 선택하고, 매칭 후보가 없으면 기존처럼 최신 게시 영상으로 폴백한다. 선택 함수는 T24 관리자 미리보기에서 재사용할 수 있도록 export했다.
- T23 완료. 저장된 chapters 호환을 위해 표준 키(`해설`/`성경읽기`/`기도`)는 그대로 두고 표시 라벨과 기본 시작 시각만 조정했다.
- T24 완료. 관리자 미리보기는 `fetchLatestFromPlaylist`를 직접 재사용해 T22와 같은 날짜 매칭/최신 폴백 로직을 쓴다. 실제 YouTube API 호출은 키/재생목록이 없어 미검증.
- T25 완료. `quizEngine.js`는 캐시 제목을 우선 파싱하고 실패하면 `read_schedules.json` 범위로 폴백한다. `src/data/quiz/*.json`이 아직 없으면 `loadQuestionsForRange`는 빈 pool을 반환하므로 T26에서 기존 `QUIZ_BANK` 폴백을 유지해야 한다.
- T26 완료. 읽기 완료 전에는 퀴즈가 잠기고, 열린 뒤에는 본문 기반 문항을 먼저 찾는다. 현재 문항 JSON이 없으면 기존 상식 문제로 폴백하며, 첫 제출 때 `quizKey`를 저장해 재방문/재렌더 시 같은 문항을 다시 보여준다.
- T27 완료. 검증 스크립트는 현재 JSON이 없으면 안내 후 통과하고, T28 문항 파일이 생기면 필수 필드/중복/ref 책 일치/장당 문항 수를 검사한다.
- T28 진행 중. 첫 책으로 민수기 17-36장 60문항을 추가했고 검증/빌드는 통과했다. T28 전체 완료까지는 90일 구간의 나머지 책 문항이 필요하다. 문항 내용은 사용자 신학·표기 검수가 필요하다.
- T28 진행 중. 열왕기상 1-22장 66문항을 추가했고 검증/빌드는 통과했다. 다음 책 우선순위는 잠언 1-31장 또는 신약일독 구간의 누가복음 1-24장이다.
- T28 진행 중. 잠언 1-31장 93문항을 추가했고 검증/빌드는 통과했다. 다음 우선순위는 전도서/아가/열왕기하 또는 신약일독 구간의 누가복음 1-24장이다.
- T28 진행 중. 전도서 1-12장 36문항과 아가 1-8장 24문항을 추가했고 검증/빌드는 통과했다. 다음 우선순위는 열왕기하 또는 신약일독 구간의 누가복음 1-24장이다.
- T28 진행 중. 열왕기하 1-25장 75문항을 추가했고 검증/빌드는 통과했다. 다음 우선순위는 신약일독 구간의 누가복음 1-24장 또는 에스겔 1-48장이다.
- T27b 완료. 파서는 `quizParsing.js`로 분리해 앱과 검증기가 같은 `parseReadingRange`를 사용한다. `마 10:26-11:1`, `갈 4:1-5:1`, `고전 10:1-11:1`, `눅 3:21-4:13`, `렘 26:1-29:23` 장 경계 범위가 여러 아이템으로 전개됨을 확인했다. 검증기는 신약 세그먼트 목록과 미저작 집계를 출력한다.
- T28 진행 중. 누가복음 1:1-4:44까지 신약일독 세그먼트 기준 47문항을 추가했고 검증/빌드는 통과했다. 다음 우선순위는 누가복음 5장 이후 세그먼트 계속 저작이다.
- T28 진행 중. 누가복음 5:1-8:56 범위 8세그먼트 47문항을 추가해 `luke.json`은 총 94문항이 됐다. 검증/빌드는 통과했다. 다음 우선순위는 누가복음 9장 이후 세그먼트 계속 저작이다.
- T28 진행 중. 누가복음 9:1-10:20 범위 3세그먼트에 15문항을 추가해 `luke.json`은 총 109문항이 됐다. Day 206-208은 각각 pool 5/5이며 검증/빌드는 통과했다. 다음 우선순위는 누가복음 10:21-42 이후 세그먼트 계속 저작이다. 퀴즈 문항 신학적 검수는 사용자 몫이다.
- T28 진행 중. 누가복음 10:21-11:54 범위 3세그먼트에 15문항을 추가해 `luke.json`은 총 124문항이 됐다. Day 209-211은 각각 pool 5/5이며 검증/빌드는 통과했다. 다음 우선순위는 누가복음 12장 이후 세그먼트 계속 저작이다. 퀴즈 문항 신학적 검수는 사용자 몫이다.
- T28 진행 중. 누가복음 12:1-13:17 범위 3세그먼트에 15문항을 추가해 `luke.json`은 총 139문항이 됐다. Day 212-214는 각각 pool 5/5이며 검증/빌드는 통과했다. 다음 우선순위는 누가복음 13:18-35 이후 세그먼트 계속 저작이다. 퀴즈 문항 신학적 검수는 사용자 몫이다.
- T28 진행 중. 누가복음 13:18-35 세그먼트에 5문항을 추가해 `luke.json`은 총 144문항이 됐다. 다음 우선순위는 누가복음 14:1-14 이후 세그먼트 계속 저작이다. 퀴즈 문항 신학적 검수는 사용자 몫이다.
- T28 진행 중. 누가복음 14:1-14, 14:15-35 세그먼트에 각각 6문항·5문항을 추가해 `luke.json`은 총 155문항이 됐다. 다음 우선순위는 누가복음 15장 세그먼트 계속 저작이다. 퀴즈 문항 신학적 검수는 사용자 몫이다.
- T28 진행 중. 병렬 저작으로 누가복음 15:1-22:46(86문항), 사도행전 14-20장(60문항), 에스겔 1-48장(144문항), 에베소·빌립보·골로새(Day 251-264, 70문항)를 추가했다. 전체 형식·커버리지 검증과 빌드는 통과했다. 90일 구간의 남은 우선순위는 누가복음 22:47-24장, 사도행전 21-28장, 벧전·벧후·계시록, 창세기·신명기 및 소선지서다. 퀴즈 문항 신학적 검수는 사용자 몫이다.
- T28 진행 중. 두 번째 병렬 배치로 누가복음과 사도행전의 해당 신약일독 전 세그먼트, 베드로전·후서, 요한계시록 8-14장, 창세기 1-20장, 신명기 1-8장을 추가했다. 90일 범위에서 남은 우선순위는 요나·아모스·호세아·스바냐 등 소선지서와 신약일독 Day 281 이후 책이다. `philippians.json`과 `colossians.json` 3장은 각각 4문항이라는 장당 경고가 있지만, 분할 세그먼트 경계(4:1)를 앞 세그먼트에 포함해 각 day pool은 5개 이상이다. 퀴즈 문항 신학적 검수는 사용자 몫이다.
- T28 진행 중. 골로새서 4:1과 빌레몬서 1장 보강으로 신약일독 Day 191-280은 모든 day pool이 5개 이상이 됐다. 남은 우선순위는 일년일독 구간의 소선지서와 신약일독 Day 281 이후 책이다. `philippians.json`과 `colossians.json`의 장당 경고는 분할 세그먼트 문항 배치에 따른 것으로, 일일 풀은 충족한다. 퀴즈 문항 신학적 검수는 사용자 몫이다.
- T28 완료. 마지막 병렬 배치로 창세기 37-50장, 요나·아모스·호세아·스바냐 문항을 추가했다. 독립 커버리지 감사 결과 두 플랜 Day 191-280의 T28 기준 실패가 0건이며 검증기와 빌드도 통과했다. `philippians.json`·`colossians.json` 3장의 장당 경고는 4:1 장 경계 세그먼트 배치 때문이며 실제 일일 pool은 5개 이상이다. 퀴즈 문항 신학적 검수는 사용자 몫이다. 다음 작업은 T29 읽기 완료 중복 제출 방지다.
- T29 완료. 로그인 사용자는 `readSubmitting` state+ref와 트랜잭션의 `(readCount, day)` 진행 위치 비교로 일반 중복·한 장 더 읽기·365→1 순환을 구분한다. `runTransaction` 최종 반환값만 후속 통계·history·confetti에 사용해 재시도 중 폐기된 계산이 새지 않게 했다. 게스트는 `didRecord: false`면 UI 부수효과도 생략한다. 빌드와 독립 diff 재검토는 통과했고 실제 Firebase 더블클릭은 운영 데이터 변경 때문에 미검증이다. 다음 작업은 T30 주간 읽기왕 수리다.
- T30 완료. 사용자 문서에 최근 14일의 고유 날짜만 `recentReadDates`로 저장하고, 주간 읽기왕은 신형 필드와 레거시 `readHistory`를 날짜 단위로 병합해 계산한다. 화면도 계산된 `weeklyCount`를 직접 표시하도록 수정했다. 추가 Firestore 조회는 없으며 빌드·diff 재검토를 통과했다. 기존 사용자는 다음 읽기부터 필드가 쌓이므로 랭킹이 채워지는 데 최대 1주 걸릴 수 있다. 다음 작업은 T31 광고 하단 여백이다.
- T31 완료. 로그인 화면 공통 루트와 버전·플랜·공동체 선택 4개 분기 루트에 고정 광고를 피하는 safe-area 포함 72px 하단 여백을 적용했다. 적용 위치 5곳을 독립 감사했고 빌드·diff 검사를 통과했다. 다음 작업은 T32 완독 축하 개선이다.
- T32 완료. 365일 완주 alert를 접근성 있는 전체화면 오버레이로 교체하고, 완독 회차와 다음 회차를 표시한다. 관리자 대시보드에는 활성 교인 `readCount > 1` 기준 완독자 카드·명단을 추가했다. 랜딩의 올해 완독자는 이미 `platformStats.finished_total`에 연결되어 있어 유지했다. 빌드·레이어/키보드 재검토를 통과했으며 실제 완주와 관리자 인증 진입은 운영 데이터 변경 때문에 미검증이다. 다음 작업은 T33 퀴즈 우선 게이트다.
- T33 완료. 퀴즈는 첫 읽기 완료 전 현재 `currentDay` 본문에서 출제하며, 정답·2회 소진·오늘 건너뛰기·문항 없음/로드 실패일 때만 첫 완료 버튼이 열린다. 잠김 영역은 퀴즈로 스크롤하고 한 장 더 읽기와 과거 본문은 게이트 대상이 아니다. 문항 없음 시 T33의 교착 방지 요구를 우선해 T26의 일반 상식 폴백 대신 카드 숨김+fail-open으로 변경했으며 기존 저장 `bank-*` 키 복원 호환은 유지했다. 빌드·독립 재감사를 통과했고 실제 제출은 운영 데이터 변경 때문에 미검증이다. 다음 작업은 T34 완료 피드백 달란트 표시다.
- T34 완료. 읽기 트랜잭션의 최신 상태에서 오늘 읽기 보상(a), 이미 받은 퀴즈 보상(b), 갱신 보유액(M)을 계산해 `오늘 +N달란트! (읽기 ⭐a · 퀴즈 ⭐b) · 보유 ⭐M`으로 표시한다. 완독 시 이전 토스트를 지우고 오버레이에만 표시하며, 같은 날 한 장 더 읽기로 a=0이면 달란트 줄을 생략한다. 새 Firestore 필드는 추가하지 않았고 빌드·독립 재감사를 통과했다. 다음 작업은 T35 묵상 저장 실패 롤백이다.
- T35 완료. 저장 실패 시 로컬 낙관 상태를 롤백하고 입력을 보존한 채 오류를 표시한다. 계정 전환/빈 문서/느린 이전 조회를 격리해 다른 사용자의 메모가 섞이지 않게 했고, 조회 실패 표시·1독 전용 레거시 키·묵상 내보내기 ReferenceError도 함께 수정했다. 게스트에는 묵상 UI/조회/쓰기가 없음을 확인했고 빌드·전체 경로 재감사를 통과했다. 실제 Firestore 실패 주입은 미검증이다.
- T35 설계 질문/후속 필요: 메모가 `users/{uid}.memos` 본문서에 있어 현재 같은 교회 users read 규칙을 통과하는 회원에게 네트워크상 노출될 수 있다. firestore.rules 수정 금지이므로 이번 작업에서는 손대지 않았다. 메모 하위 컬렉션 분리 여부를 Claude가 설계해야 한다. 또한 날짜별 미저장 초안 분리와 users 문서 용량 한계 대응도 별도 설계가 필요하다.
- T36 완료. 로그인 4화면과 무소속 선택, 게스트 진입→영상·본문→버전 변경→읽기 완료→새로고침 진도·버전 복원을 로컬 브라우저에서 확인했고 콘솔 오류·경고는 0건이었다. 점검 중 게스트가 T33 퀴즈 게이트에 잠기지만 퀴즈 카드는 렌더링되지 않는 교착을 발견해, 확정 설계대로 게스트를 게이트에서 명시적으로 제외했다.
- T36의 나머지 수정은 QR 비동기 생성 전 인쇄창 선점, 관리자 상점 미리보기의 실제 uid 제거, 관리자·영상·퀴즈·상점의 비정상 배열/null/계정 전환 상태 방어다. `npm run build`, 퀴즈 검증, Babel 전수 parse, `git diff --check`, 독립 코드리뷰를 통과했다. 게스트 검증에는 익명 Auth 세션과 localStorage만 사용했고 users/구매/admin 쓰기는 하지 않았다.
- T36 미검증: 실제 가입·구매·관리자 Firestore 조작, 인증이 필요한 교회/플랫폼 관리자 실화면과 A4 실제 인쇄 대화상자, 회원 퀴즈 제출, 실 YouTube API. Google OAuth는 라운드6(T37~T39) 및 M8 전제라 아직 실검증하지 않았다. 질문/막힌 것은 없으며 다음 작업은 T37 관리자 Google 로그인이다.
- T37 완료. Google 로그인 버튼은 관리자 로그인 탭에만 추가했고 member/memberSignup/adminSignup/guest에는 노출하지 않았다. compat `GoogleAuthProvider` + `signInWithPopup`을 사용하며, 기존 이메일 관리자와 Google 관리자가 문서 로드·자격증명/talent 마이그레이션·화면 전환 후처리를 공유한다.
- T37 권한·경합 방어: users 문서가 없거나 관리자 역할이 아니면 `setCurrentUser(null)` 후 즉시 `auth.signOut()`한다. 대화형 Auth 흐름 동안 `onAuthStateChanged`의 자동 사용자 적용을 막고, Firestore와 각 마이그레이션 await 뒤 이벤트 uid와 현재 Auth uid를 재검사해 거절된 일반 회원 화면이 잠깐 나타나는 경합을 차단했다.
- T37 설계 보완: 기존 코드에서 `superAdmin`은 `platformAdmin`과 같은 레거시 플랫폼 관리자 역할이므로 Google 관리자 allowlist에 함께 포함했다. 새 권한을 확장한 것이 아니라 기존 플랫폼 관리자 로그인 호환을 유지한 것이다.
- T37 검증: 로컬 브라우저에서 관리자 탭 Google 버튼 표시, member/memberSignup/adminSignup/guest 비노출, 콘솔 오류 0건을 확인했다. 빌드·Auth flow 중첩 테스트·diff 검사·독립 계약 감사와 코드리뷰를 통과했다. M8을 실행하지 않아 실 Google 팝업, 실제 관리자 로그인, 기존 Gmail 계정 자동 병합과 password provider 소실 안내는 미검증이다. 막힌 점은 없으며 다음 작업은 T38 교회 등록 Google 계정 흐름이다.
- T38 완료. 교회 등록 1단계에서 Google 시작과 기존 이메일·비밀번호 가입을 함께 제공한다. Google 선택 시 이메일은 고정하고 이름은 수정 가능하며, 최종 제출은 현재 Auth uid·email·`google.com` provider를 다시 확인하고 `createUserWithEmailAndPassword`나 `private/auth` 쓰기 없이 `password: null`인 `churchAdmin` 문서를 만든다.
- T38 인증·동시성 방어: 팝업 시작과 최종 제출은 ref 기반 in-flight Promise로 중복 실행을 막고, Auth guard는 팝업 성공부터 최종 가입 또는 취소까지 유지한다. 최종 transaction이 `users/{uid}` 부재를 읽은 뒤 Auth를 재검증하고 church/user/churchDirectory 3문서를 원자 커밋하므로 두 탭 동시 제출과 중간 실패의 중복·고아 교회를 막는다. terminal 오류는 로그아웃·프로필 초기화·guard 종료, 재시도 가능한 오류는 프로필·guard 유지로 상태를 맞췄다.
- T38 중도 이탈: 다른 탭/이메일 방식으로 나가면 Google Auth 세션은 로그아웃하고 guard를 끝내지만 Firebase Auth 계정 자체는 삭제하지 않는다. 따라서 users 문서 없는 Auth 계정은 남을 수 있고, 이후 T37 로그인은 확정된 문서 없음 안내 경로로 처리한다. 팝업 응답이 화면 이탈 뒤 늦게 와도 즉시 취소하도록 activeTab/profile 경합을 방어했다.
- T38 검증: 로컬 브라우저에서 adminSignup 1단계 Google+이메일 병행 UI와 최종 reload 뒤 콘솔 오류 0건을 확인했다. 빌드·원자성/상태 정적 계약 검사·diff 검사·독립 재감사를 통과했다. M8을 실행하지 않아 실 Google 팝업, 실제 Firestore transaction, Google 교회 등록→온보딩→로그아웃→재로그인은 미검증이다. 기존 이메일 관리자 가입의 순차 쓰기 구조는 변경하지 않았다. 막힌 점은 없으며 다음 작업은 T39 기존 관리자 Google 연결이다.
- T39 완료. `GoogleLinkCard`는 렌더와 각 작업 시점에 화면 계정 uid·현재 Auth uid·관리자 역할을 확인하고, 로컬 provider snapshot으로 연결/해제 결과를 즉시 반영한다. 플랫폼 관리자 시스템 탭과 교회 관리자 설정 탭에서 재사용하며 uid가 없는 가짜 관리자 미리보기에서는 렌더링하지 않는다.
- T39 비밀번호 제거는 경고를 두 번 확인한 뒤 Auth의 password provider를 먼저 해제하고 users 문서의 `password`만 null로 갱신한다. 후속 Firestore 갱신 실패나 계정 전환은 Auth 해제가 이미 끝난 부분 성공 상태로 별도 경고하며, 다른 users 필드와 `private/auth`는 수정하지 않는다.
- T39 검증: `npm run build`, 정확 문구·compat API·uid/role guard·두 관리자 화면 연결 정적 계약 검사, `git diff --check`, 독립 코드리뷰를 통과했다. M8/M9를 실행하지 않아 실 Google 연결·Google 재로그인·비밀번호 provider 제거는 미검증이다. 코드상 막힌 점은 없으며 다음 작업은 T40 데이터 필드와 공용 멤버십 헬퍼다.
- T40 완료. 성도 신규 가입, Google/이메일 교회 관리자 생성, 플랫폼 seed 생성에 `extraMemberships: []`를 넣고, 기존 문서나 잘못된 타입은 `userDocToState`에서 빈 배열로 처리한다. 기존 사용자 문서는 백필하지 않으며 로그인/목록 로드 시 안전하게 호환된다.
- T40 공용 `memberships.js`는 주 소속을 먼저 보존하고 저장 순서상 추가 소속 최대 3개를 새 객체로 정규화한다. `(departmentId, subgroupId)` 쌍으로 중복을 제거하며 `belongsToDepartment`와 `belongsToSubgroup`도 반드시 이 공용 목록을 거친다. 부서만 배정되고 소그룹이 없는 주 소속도 부서 판정을 위해 유지한다.
- T40 검증: `npm run build`, 중복 제거·같은 소그룹명/다른 부서·추가 3개 상한·frozen 입력 불변·비정상 입력·부서/소그룹 true/false 인라인 assertion, `git diff --check`, 독립 코드리뷰를 통과했다. 막힌 점은 없으며 다음 작업은 T41 다중 소속 집계·랭킹 반영이다.
- T41 완료. `calculateSubgroupStats`는 멤버를 소속별로 복제하지 않고 각 department/subgroup pair의 포함 여부를 공용 helper로 판정해, 같은 사람이 같은 그룹에는 한 번·서로 다른 그룹에는 각각 한 번 집계된다. 입력에 같은 uid 행이 중복되어도 소그룹/MVP/위험군/플랫폼 전체 지표는 한 번만 센다.
- T41 화면 기준: 격려·주간 MVP·주변 주자는 현재 사용자의 주 소속 부서를 기준으로 유지하면서, 그 부서가 추가 소속인 다른 회원도 후보에 포함한다. 교회 관리자 부서 카드는 같은 부서 여러 소그룹에 속한 회원을 부서 합계에서 한 번만 센다. 그룹 랭킹/상세/우리팀 강조는 departmentId+subgroupId pair를 보존해 다른 부서의 동명 그룹을 섞지 않으며, object형 조직으로 바뀌기 전 이름을 subgroupId에 저장한 레거시 사용자도 표시·상세 명단에서 호환한다.
- T41 검증: `npm run build`, esbuild Node fixture(주+추가·중복 소속, 다른 부서 동명 그룹, JSON pair key 충돌 방지, 레거시 이름+신형 object 조직, 양쪽 ranking formatter ID 보존, duplicate uid 그룹/MVP/위험/플랫폼 지표 1회, 단일 소속 회귀), `git diff --check`, 독립 코드리뷰를 통과했다. 최종 브라우저 reload 후 콘솔 오류·경고 0건도 확인했다. 인증이 필요한 실제 랭킹 화면은 운영 계정/데이터 변경을 피하려고 미검증이며, 다음 작업은 T42 교회 관리자 추가 소속 관리다.
- T42 완료. 교인 상세의 소속 영역은 주 소속을 유지하면서 추가 소속을 최대 3개까지 부서→소그룹 순서로 추가하거나 pair 기준으로 제거한다. add/remove와 주 소속 변경은 최신 users 문서를 읽는 transaction으로 구현해 서로 동시 실행되어도 재시도로 합쳐지며, 현재 교회 교인인지·삭제 상태인지·주/추가 중복인지·3개 상한인지 transaction 안에서 다시 검사한다.
- T42 경합/호환 방어: membership action ref로 중복 클릭을 막고, `members`와 열린 `selectedMember`는 captured uid가 일치할 때만 functional update한다. 교인 A의 느린 history 응답이 교인 B 패널을 덮지 않도록 request token과 close 취소를 추가했다. subgroupId가 이름인 레거시 문서와 object ID를 호환하되 modern 동명 그룹은 ID가 다르면 별개로 유지하고, 부서만 배정된 subgroup null 주 소속도 extra로 오인하지 않는다. 일괄 주 소속 변경이 일부/전부 실패하면 선택을 유지해 재시도할 수 있다.
- T42 표시/CSV: 교인 목록·검색·부서 필터와 관심/스트릭/삭제/완독 compact 표시에 전체 소속을 공용 formatter로 반영하고, 추가 소속은 `+` 뱃지로 구분한다. 전체/기간 CSV는 주+추가 소속을 쉼표로 병기한 단일 `소속` 셀을 사용하며 모든 셀 quote, 따옴표 doubling, 줄바꿈, 수식 선두 문자 중립화, UTF-8 BOM을 적용했다.
- T42 검증: `npm run build`, canonical membership/max3/legacy ID-name/modern 동명/null subgroup fixture, CSV 두 스키마·comma/quote/newline/formula injection·BOM·기간 합계 fixture, `git diff --check`, 독립 코드리뷰를 통과했다. 브라우저 최종 reload 후 콘솔 오류·경고 0건도 확인했다. 실제 Firestore 추가/제거/일괄 변경은 운영 데이터 변경을 피하려고 미검증이며, 다음 작업은 T43 성도 화면 소속 뱃지다.
- T43 완료. `DashboardView`에서 공용 membership 목록을 기준으로 주 소속과 추가 소속을 한 번만 분리하고 현재 조직 ID에 맞는 이름을 보완한다. `unaffiliated_v1` 사용자는 데이터가 잘못 들어 있어도 추가 소속을 무조건 빈 배열로 처리한다.
- T43 표시 원칙: 헤더의 기존 주 소속 제목 옆에 `+부서 · 소그룹` 작은 뱃지만 병기하고, 요약/전체 소그룹 랭킹에는 neutral `추가 소속` 뱃지를 붙인다. `(우리팀)`과 파란색 강조는 계속 주 소속 department/subgroup pair 전용이다. modern 동명 그룹은 ID가 다르면 구분하고 legacy subgroupId=name은 object 조직 이름과 호환한다. extra-only/null primary는 헤더에 `미배정`으로 표시하며 모바일에서는 그룹명만 말줄임하고 뱃지·진행률은 유지한다.
- T43 검증: `npm run build`, modern 동명 분리·legacy ID/name·타부서·extra-only/null primary·무소속 hard-hide matcher fixture, `git diff --check`, 독립 코드리뷰를 통과했다. 최종 브라우저 reload 후 콘솔 오류·경고 0건도 확인했다. 인증이 필요한 실제 성도 대시보드는 미검증이다.
- T44·T49가 Claude의 규칙/인덱스 배포 완료로 체크된 뒤 T45를 진행했다. T45는 회원 로그인과 관리자 공용 로그인에서 roster collectionGroup 조회를 다른 마이그레이션과 병렬 실행하고, canonical `churches/{orgId}/roster/{uid}` 경로와 uid를 검증한 최소 필드만 최대 3개 `extraOrgs`로 보존한다. 실패는 조용히 `[]`로 처리하며 게스트는 조회하지 않는다.
- T45 상태·검증: 온보딩이 기존 runtime `extraOrgs`를 잃거나 users 문서에 영속화하지 않도록 분리했다. `npm run build`, mapper fixture, `git diff --check`, 독립 리뷰 2건을 통과했다. 실제 인증 계정의 collectionGroup 조회와 규칙 적용은 운영 계정 없이 미검증이며 다음 순번은 T46이다.
- Claude 후속 검토 요청: 현재 `firestore.rules`의 roster self-create에는 필드 whitelist가 있으나 self-update에는 `affectedKeys` whitelist가 보이지 않아 T44 문서 계약과 불일치한다. Codex 금지 범위라 수정하지 않았다. 별도 기존 위험으로 로그아웃/계정 전환 중 느린 비동기 대시보드 응답의 UID 격리도 후속 설계가 필요하다.
- T46 완료. 회원 전용 `내 공동체` 카드에서 공개 디렉토리 검색과 기존 `sha256(code) === codeHash` 검증을 재사용하고, 대상 교회 문서의 부서·소그룹을 고른 뒤 roster 허용 필드만 저장한다. 탈퇴는 본인 roster 행만 confirm 후 삭제하며 `extraOrgs`는 runtime 상태에만 반영한다. mutation용 strict 전체 조회는 실패를 숨기지 않고 중복·3개 상한을 다시 검사한다.
- T46 검증/미검증: `npm run build`, 전체행/기본 3개 mapper fixture, `git diff --check`, 독립 리뷰 3건을 통과했고 로컬 비인증 랜딩의 콘솔 오류·경고 0건을 확인했다. 실제 회원 인증 화면과 roster 생성·삭제는 운영 데이터 변경을 피하려고 실행하지 않았다. 다음 순번은 T47이다.
- T46 설계 한계/Claude 후속 필요: 현재 규칙은 가입 전 대상 roster 행 read를 허용하지 않고 Web compat SDK에는 create-only precondition이 없다. 따라서 strict 조회와 `set()` 사이 같은 행이 생성되면 후행 쓰기가 관리자 배정·`joinedAt`을 덮을 수 있으며, 서로 다른 두 탭이 동시에 count 2를 읽으면 4개 행이 생길 수 있다. 일반 로그인은 계약상 첫 3개만 복원하므로 초과 행이 숨을 수도 있다. 강한 create-only/최대 3개 보장은 규칙으로 검증 가능한 슬롯 문서나 서버 함수 설계가 필요하다.
- T47 완료. 현재 `extraOrgs`의 canonical orgId 최대 3개를 users·history와 같은 transaction에서 절대 진도값으로 update한다. 제명 경합은 첫 transaction 전체가 취소된 뒤 strict collectionGroup 조회로 살아 있는 행만 다시 넣어 1회 재시도하며, `update`만 사용해 삭제 행을 되살리지 않는다. roster에는 진행 관련 6개 필드만 쓴다.
- T47 회귀 방어/제한: 결과 적용 전 현재 Auth UID를 재검사하고 함수형 setter를 써 계정 전환이나 동시 공동체 상태를 덮지 않는다. 제명 뒤 strict 재조회도 일시 실패하면 개인 users/history만 원자 재시도하고 runtime `extraOrgs`는 보존한다. 다음 읽기의 절대 진도값으로 roster가 회복되지만 해당 1회 동안 조직 표시가 뒤처질 수 있다. 또한 T45 로그인 조회 자체가 실패해 처음부터 `extraOrgs=[]`이면 그 세션에는 동기화 대상을 알 수 없다는 기존 가용성 한계가 있다.
- T47 검증: `npm run build`, `git diff --check`, 독립 리뷰 3건 통과. 실제 Firestore의 정상 roster 동기화, 관리자 제명 직후 경합, collectionGroup 장애 주입은 운영 계정 없이 미검증이다. 다음 순번은 T48이다.
- T48 완료. 공용 mapper가 canonical roster 행을 관리자/랭킹용 최소 멤버로 변환하고 users 자체 교인을 uid 우선으로 병합한다. 삭제된 자체 교인도 uid를 먼저 점유한 뒤 최종 필터하므로 같은 uid roster로 부활하지 않는다. 성도 랭킹 로더는 users/roster 실패를 상호 격리하고 관리자 로더도 roster 실패 시 자체 명부는 유지한다.
- T48 개인정보 경계: 외부 멤버 상세은 roster 진행값과 이 조직 소속만 표시하며 소그룹 update와 roster delete 제명만 제공한다. users/private/history 조회·비밀번호·계정 삭제/복원·달란트 창구 차감·환불은 UI와 실행 함수에서 모두 차단했다. 이 조직의 구매 수령 완료는 조직 문서만 바꾸므로 유지하고, 외부 구매의 개인 잔액은 비공개로 표시한다.
- T48 검증: `npm run build`, canonical mapper·uid 자체교인 우선·삭제 부활 방지 fixture, `git diff --check`, 독립 리뷰 3건 통과. 실제 관리자 인증 화면과 roster 소그룹 배정/제명/구매 수령은 운영 데이터 변경 없이 미검증이다. 라운드 8 T44~T48 완료, 다음 순번은 이미 선행 T49가 완료된 라운드 9의 T50이다.
- T50 완료. 첫 화면의 기존 교회 선택 로그인은 그대로 두고 "처음이세요? 시작하기"에서 Google 또는 이름·생년월일·전화4·비밀번호 개인 가입을 선택하게 했다. 개인 users 문서는 `accountType: 'personal'`, `churchId: null`, `primaryOrgId: null`로 만들며 비밀번호 방식의 식별자는 교회 ID 없는 `이름_생일p전화4@bible.local`이고 자격정보는 `private/auth`에 저장한다. Google 개인 계정은 비밀번호 필드를 만들지 않는다.
- T50 상태·검증: 신규 개인 계정은 기존 T10의 게스트 진도 값을 users 초기 상태에 반영하고 plan 선택으로 이어진다. 중복 클릭과 대화형 Auth 리스너 경합, 기존 비개인 users 문서 충돌을 방어했다. `npm run build`, `git diff --check` 통과. 실제 Firebase 계정/users/private 생성과 Google 팝업은 운영 데이터 생성 때문에 미검증이다. 설계와 다르게 한 점이나 막힌 점은 없으며 다음 순번은 T51 가입 직후 공동체 온보딩이다.

---

## 🔁 라운드 2 — 관리자 화면 개편 (2026-07-09 위임)

> 라운드 1(무소속+게스트)은 전부 완료·리뷰 통과. 아래가 새 작업이다. 작업 프로토콜은 문서 상단과 동일 (순서대로, 작업당 커밋, 빌드 통과, 로그 기록).
> **상세 설계는 저장소 루트 `ADMIN_IMPROVEMENT_PLAN.md`** — 각 작업의 세부 스펙은 그 문서의 해당 Phase 절을 읽고 따를 것. 이 체크리스트는 순서와 완료 기준만 정의한다.

### 라운드 2 추가 제약 (라운드 1 금지사항에 더해)

- **firestore.rules를 한 줄도 수정하지 말 것.** `users` read 규칙(랭킹 버그)은 Claude가 별도 세션에서 병행 작업 중이라 충돌 위험이 있다. 규칙 변경이 필요해 보이면 메모란에 적고 넘어가라. (참고: ADMIN_IMPROVEMENT_PLAN의 adminActions 규칙은 Phase C 몫이라 이번 라운드에 없음.)
- 외부 차트 라이브러리 추가 금지 — 막대/도넛은 CSS/SVG 자작 (플랜 원칙).
- `users.password` 평문 **필드**는 유지. 단 B-3의 "편집 화면에서 기존 비밀번호 값 노출 제거"는 UI 표시만 없애는 것이므로 수행할 것 (재설정 기능은 제공).
- `src/utils/statsUtils.js`에 `computeAtRisk` 추가는 허용. 그 외 기존 통계 함수 시그니처는 바꾸지 말 것.

### 라운드 2 체크리스트

- [x] **T12. Phase 0 — history에 ts 필드 추가**
  - `src/hooks/useUserBibleActions.js`의 handleRead 트랜잭션에서 historyItem에 `ts: firebase.firestore.FieldValue.serverTimestamp()` 한 필드 추가. 기존 `date` 필드는 그대로 유지 (하위호환).
  - 완료 기준: 빌드 통과, 기존 읽기 흐름 코드 다른 변경 없음.
- [x] **T13. Phase A(1) — 단순 공통 컴포넌트**
  - `src/components/admin/` 신설: `StatCard.jsx`, `ConfirmDialog.jsx`, `Toast.jsx`(+`useToast`), `ProgressBar.jsx`, `DonutStat.jsx`. 스펙은 플랜 Phase A 참고.
  - 아직 어디에도 연결하지 않아도 됨 (다음 작업들이 소비).
- [x] **T14. Phase A(2) — AdminDataTable + SlideOverPanel**
  - `AdminDataTable.jsx`: columns/rows props, 내장 검색, 헤더 클릭 정렬, 페이지네이션(50/page), 다중선택 checkbox + 선택 액션바 slot, 행 클릭 콜백, 모바일 카드형 전환.
  - `SlideOverPanel.jsx`: 우측 슬라이드 패널, 모바일 전체화면 시트.
- [x] **T15. Phase B-2 — 교회 관리자 대시보드 탭 (신규·기본 탭)**
  - `ChurchAdminView.jsx` 탭 구조를 `대시보드/교인 관리/조직/공지/설정`으로. 대시보드 구성은 플랜 B-2 절 그대로: StatCard 4개(오늘 진도는 "어제 이 시각 대비" — ts 데이터 없는 과거분은 "오늘 누적 vs 어제 최종" 대체 표기), 부서별 현황 카드(기존 `calculateSubgroupStats` 재사용), 관심 필요 명단 3종(`statsUtils.js`에 `computeAtRisk(members, todayStr)` 신설), 스트릭 Top 5.
  - 시간대 비교의 집계 문서 도입은 하지 말 것 — 1차는 직접 집계 (플랜에 명시).
- [x] **T16. Phase B-3/B-4 — 교인 관리 탭 개편**
  - AdminDataTable 적용: 검색/부서 필터/읽기상태 필터/CSV 내보내기(기존 `downloadCSV` 재사용)/페이지네이션.
  - 다중 선택 → 일괄 소그룹 배정, 일괄 비밀번호 초기화(ConfirmDialog 필수).
  - 행 클릭 → SlideOver 상세(진행 요약 + history 최근 N건 + 소그룹 변경/비번 재설정/삭제).
  - 편집 UI의 비밀번호 평문 표시 제거(재설정만). 모든 저장/삭제에 Toast.
  - 완료 기준: 플랜 하단 "검수 기준" 중 교회 관리자 항목 4개가 로컬 dev에서 눈으로 확인됨 (실데이터 변경 없는 범위에서, 불가하면 로그에 미검증 명시).

Phase C(플랫폼 관리자)·D·E는 별도 라운드로 — 이번에 손대지 말 것.

---

## 🔁 라운드 3 — 달란트 개편 + 성경퀴즈 + 비밀 달란트 상점 (2026-07-09 위임)

> 설계 확정: Claude Fable 5, 사용자 승인 완료. 작업 프로토콜은 상단과 동일.
> 배경: 미니룸 꾸미기는 완전 삭제됨(054d1e5). talent는 이제 "꾸준함 화폐"로 재정의 —
> **하루 1회만 적립**되어 다독자와 1독자의 격차를 없애고, 연속 출석에만 보상한다.
> 실물 상품 교환(오프라인 수령)이 최종 용도다.

### 라운드 3 제약 (기존 금지사항에 더해)

- **firestore.rules 수정 금지** — `talentPurchases` 규칙은 Claude가 이미 추가·배포했다(필드 화이트리스트: `uid, memberName, itemId, itemName, price, status, createdAt` / create는 status='pending'만 / update는 관리자가 status·deliveredAt·deliveredBy만). 구매 문서 필드는 이 화이트리스트와 **정확히 일치**해야 한다 — 필드 하나라도 다르면 permission-denied.
- `score` 적립 로직은 한 줄도 바꾸지 말 것 (랭킹·레벨은 기존 그대로).
- 퀴즈·상점의 클라이언트 조작 가능성(콘솔로 정답 보기, 무결제 구매 생성)은 **알려진 수용 리스크**다. 교회 공동체 맥락이므로 서버 검증을 새로 만들지 말 것 — 대응은 T20의 "잔여 달란트 표시"뿐.

### 라운드 3 체크리스트

- [x] **T17. talent 적립 개편 + 비밀 상점 해금 플래그** (`src/hooks/useUserBibleActions.js` handleRead 트랜잭션)
  - `isFirstReadToday = data.lastReadDate !== todayStr`일 때만 talent 적립: `talentEarned = 10 + Math.min(newStreak, 7)` (하루 최대 17). 같은 날 추가 읽기("한 장 더 읽기")는 talent 0.
  - `newTalent = (data.talent || 0) + talentEarned`. **score 계산은 기존 그대로.**
  - `!data.secretShopUnlocked && newStreak >= 7`이면 updateData에 `secretShopUnlocked: true` 추가. resultData에 `secretShopJustUnlocked` 플래그를 실어 훅 밖으로 노출 (T19의 축하 모달 트리거).
  - historyItem에 `talent: talentEarned` 필드 추가 (기존 date/day/score/ts 유지).
  - 적립 시 기존 보너스 토스트에 `⭐ +N달란트`를 함께 표시.
  - `src/utils/helpers.js` `userDocToState`에 `secretShopUnlocked: d.secretShopUnlocked ?? false` 매핑 추가.
- [x] **T18. 매일 성경퀴즈** (신규 `src/data/bibleQuiz.js` + `src/components/dashboard/BibleQuizCard.jsx`)
  - 퀴즈 은행: 4지선다 한국어 성경 상식·인물·사건 퀴즈 **100문항 이상** 생성 — `{ q, choices: [4개], answerIndex, ref }` (ref = 근거 구절, 예: '창세기 1:1'). 개역개정 기준, 난이도 쉬움~중간, 어르신 친화적 문장. **작업 로그에 "퀴즈 내용은 사용자 검수 필요" 명시할 것.**
  - 오늘의 문제 선택: KST 기준 dayOfYear로 `QUIZ_BANK[dayOfYear % QUIZ_BANK.length]`.
  - 카드 위치: DashboardView 하단(기존 콘텐츠 아래). 게스트(role 'guest')와 미로그인에는 렌더링하지 않음.
  - 진행 상태는 users 문서 필드: `quizDate`(toDateString), `quizAttempts`, `quizSolved`. 날짜가 바뀌면 리셋으로 간주.
  - 보상: 1번째 시도 정답 **+10 달란트**, 2번째 시도 정답 **+5**, 2번 틀리면 정답·근거 구절 공개(+0). 적립은 트랜잭션으로 (talent 증가 + quiz 필드 갱신 원자 처리, 본인 문서 update라 규칙 통과).
  - 이미 오늘 푼 상태로 재방문하면 결과(정답 여부·획득 달란트)만 표시.
- [x] **T19. 비밀 달란트 상점 — 교인용** (신규 `src/components/dashboard/TalentShop.jsx` 등. 시각 디자인은 Claude 목업 확정본을 따를 것 — 아래 "디자인 지시" 참고)
  - 상점 데이터: `churches/{churchId}/settings/talentShop` 문서 `{ enabled: boolean, items: [{id, emoji, name, price, description, active}] }` read (sameChurch 규칙 이미 허용).
  - **철저한 opt-in 게이트**: 문서가 없거나 `enabled !== true`면 — 해금 여부와 무관하게 — 진입 카드·축하 모달·힌트를 **일절 렌더링하지 않는다**. `secretShopUnlocked` 플래그 저장(T17)은 상점 상태와 무관하게 항상 수행 (나중에 교회가 켜면 그때부터 보임).
  - 해금 UX (enabled인 교회만): `secretShopJustUnlocked`이면 축하 모달 "🎉 7일 연속 달성! 숨겨진 달란트 상점을 발견했어요". 이후 `currentUser.secretShopUnlocked`면 대시보드 하단에 진입 카드 상시 표시. **한번 해금되면 연속이 끊겨도 영구 유지** (사용자 확정).
  - 상점 화면: 헤더에 잔액(⭐ N), active 상품만 2열 그리드(이모지+이름+가격+구매 버튼, 잔액 부족 시 "달란트 부족" 비활성), 안내 배너 "구매한 상품은 교회에서 직접 받아요", 하단에 내 구매 내역(`talentPurchases.where('uid','==',내uid)`, 대기/수령/취소 뱃지). active 상품이 0개면 "아직 준비된 상품이 없어요".
  - 구매: 확인창 → 트랜잭션: users 문서 talent 잔액 확인·차감 + 같은 트랜잭션에서 `talentPurchases` 신규 문서 set — 필드는 **정확히** `{uid, memberName(currentUser.name), itemId, itemName, price, status: 'pending', createdAt: serverTimestamp}` (화이트리스트 초과 시 거부됨). 성공 토스트 "구매 완료! 교회에서 상품을 받아가세요".
  - **디자인 지시**: 진입 카드·상점 헤더는 딥 바이올렛 그라데이션(`from-violet-950 via-violet-800 to-violet-600` 계열) + 금색(amber-300) 달란트 강조 — "비밀" 무드. 상품 카드는 흰색 rounded-2xl. 나머지는 기존 대시보드 언어(slate, rounded-3xl) 유지.
- [x] **T20. 교회 관리자 달란트 상점 탭** (`src/components/ChurchAdminView.jsx`)
  - 탭 추가: `대시보드/교인 관리/달란트 상점/조직/공지/설정`. 탭 라벨에 수령 대기 건수 뱃지.
  - (a) **상점 사용 토글** (탭 최상단 패널): `settings/talentShop.enabled` on/off 스위치 + 설명 "끄면 교인에게 상점이 전혀 보이지 않아요. 언제든 다시 켤 수 있습니다." 기본 꺼짐 — 문서가 없으면 꺼진 것으로 간주.
  - (b) 상품 관리: items CRUD — **이모지(프리셋 목록에서 선택)**/이름/가격/설명/판매중 토글, 추가·수정·삭제. 저장은 문서 set(merge). Toast/ConfirmDialog 재사용. 재고 수량 관리는 만들지 말 것(소진 시 판매중지 토글로 대응 — 확정).
  - (c) 구매 내역: `talentPurchases` orderBy('createdAt','desc') limit(200) — **where+orderBy 조합 금지**(복합 인덱스 없음), 상태 필터는 클라이언트에서. 행: 교인 이름, 상품, 가격, 구매일, **구매자 잔여 달란트**(로드된 members에서 — 무결제 구매 검증용), "수령 완료" 버튼 → ConfirmDialog → update `{status:'delivered', deliveredAt: serverTimestamp, deliveredBy: 관리자uid}`.
  - (d) **취소·환불**: 대기 건에 "취소·환불" 액션 — ConfirmDialog 후 batch로 ① purchase update `{status:'cancelled', deliveredAt: serverTimestamp, deliveredBy: 관리자uid}` ② 해당 교인 users 문서 `talent: increment(price)` (관리자는 교인 문서 update 가능). 어르신 오터치 대비 필수.
  - 완료 기준: 빌드 통과 + 로컬 dev에서 탭 렌더링 확인 (실데이터 구매/수령은 미검증 허용).

- [x] **T21. 달란트 잔액 전원 리셋 버튼 (플랫폼 관리자, 1회성)** — 사용자 확정: 실물 상점 오픈과 함께 구 적립 방식 잔액은 전원 0으로 새 출발.
  - `PlatformAdminView.jsx` 시스템 섹션(자격증명 이관 박스 근처)에 앰버 톤 박스 "⭐ 달란트 잔액 초기화 (상점 새 출발)" + 설명 "구 적립 방식으로 쌓인 달란트를 전원 0으로 초기화합니다. 새 적립(하루 1회)과 실물 상점 도입 시점에 딱 한 번 실행하세요." + 버튼(더블 confirm — 파괴적 작업).
  - 핸들러: `db.collection('users').get()` 전체 순회, 10개 단위 청크로 각 문서 update `{ talent: 0, talentMigrated: true, updatedAt: serverTimestamp }`. 진행률 표시, 완료 시 처리 인원 alert.
  - **`talentMigrated: true`를 반드시 함께 세팅** — `helpers.js`의 `migrateTalentIfNeeded`가 이 플래그 없는 구 계정의 로그인 시 talent를 score로 복원해버리므로, 이걸 잠그지 않으면 리셋이 뒤집힌다.
  - 실행 자체는 사용자 수동(배포 후 버튼 클릭). 실행 순서: 라운드 3 배포 → 이 버튼 클릭 → 그다음 교회들에 상점 안내.

**라운드 3 보류 항목 (Codex 손대지 말 것):** 퀴즈 문항의 신학적 검수(사용자 몫).

---

## ✅ Claude 리뷰 결과 (2026-07-09)

T1~T11 전체 diff 검토 완료 — 설계 결정 4가지(가상 교회/익명 인증/localStorage 전용/클라이언트 상수) 모두 준수, 규칙 교체 4곳 정확, 진도 이관에서 score/talent 0 유지 확인, `npm run build` 통과 재확인. 블로킹 이슈 없음. 남은 것은 수동 작업 M1~M4와 실환경 검증 체크리스트뿐.

---

## ✅ Claude 리뷰 결과 — 라운드 2 (2026-07-09)

T12~T16 5개 커밋 검토 완료. 규칙 위반 없음(rules 무수정, compat API 유지, 외부 차트 라이브러리 없음), Phase 0 ts 필드 하위호환 정확, 통계 계산 0-나눗셈/타임존 방어 확인, ConfirmDialog·CSV·모바일 카드 전환 스펙 충족. 조치한 발견 사항:

1. ~~교인 상세 SlideOver의 history 조회가 규칙상 항상 거부됨~~ → Claude의 규칙 변경(history read를 같은 교회 churchAdmin에 개방)이 해결. 규칙 배포 후 정상 동작.
2. ~~T16 마이그레이션 후 구 편집 UI ~150줄이 죽은 코드로 잔존~~ (미도달 changePassword가 평문 표시 회귀 지뢰) → Claude가 삭제하고, 비밀번호 온디맨드 조회("확인" 버튼, private/auth 조회)를 살아있는 SlideOver 상세로 이식. 초기화 후 새 비밀번호 전달도 이 버튼으로 해결.
3. (라운드 3 참고 nit) AdminDataTable을 stable id 없는 데이터로 재사용할 때 기본 getRowId(index 기반)가 정렬/페이지네이션과 어긋날 수 있음 — Phase C에서 재사용 시 반드시 `getRowId` 명시. 부서 카드의 소그룹 아코디언은 플랜과 달리 항상 펼침(기능상 문제 없음).

## 🔒 Claude 별도 작업 완료: users read 랭킹 버그 + 규칙 (2026-07-09)

랭킹/달리기/주간MVP가 비어 보이던 원인(일반 교인의 같은 교회 users 목록 쿼리가 규칙상 거부)을 수정했다. Codex가 다음 라운드에서 알아야 할 것:

- **구조**: 평문 `password`/`phone4`는 `users/{uid}/private/auth` 하위문서로 이관(본인·같은 교회 관리자·플랫폼 관리자만 read). 본문서 `password`는 이관 완료 시 **null 마커**가 되고, firestore.rules가 "password == null인 문서만" 같은 교회 교인에게 read를 연다. 멤버 목록 쿼리는 반드시 `.where('password','==',null)`을 포함해야 한다 (`useDepartment.loadAllMembers` 참고).
- **새 유틸**: `src/utils/memberCredentials.js` — `writeMemberCredentials` / `fetchMemberCredentials` / `migrateCredentialsIfNeeded`. **앞으로 비밀번호를 users 본문서에 평문으로 쓰는 코드를 추가하지 말 것** — 반드시 이 유틸 경유. 관리자 화면의 비밀번호 조회는 `fetchMemberCredentials(uid)` 사용 (T16 교인 관리 탭·비번 변경 모달에는 이미 연동해뒀다 — "비밀번호 확인" 온디맨드 버튼).
- **T15 폴백 해소 가능**: `users/{uid}/history` read를 같은 교회 churchAdmin에게 열었다(규칙 배포 후 유효). 라운드 3에서 "어제 이 시각 대비" 직접 집계를 원래 스펙대로 구현할 수 있다.
- **무소속 가상 교회(unaffiliated_v1)는 의도적으로 제외** — 전국 단위 익명 집단이라 교인 간 read를 열지 않는다. 무소속 대시보드의 랭킹이 비는 것은 정상이며 버그가 아니다.
- **알려진 별개 버그(설계 필요 — Codex는 임의로 고치지 말 것)**: ① 관리자 "비밀번호 초기화"는 Firebase Auth 비밀번호를 실제로 바꾸지 못한다(클라이언트에서 타인 Auth 변경 불가, `passwordResetRequired`는 어디서도 읽지 않는 죽은 플래그) — 초기화하면 조회용 평문과 실제 로그인 비밀번호가 어긋난다. 근본 해결은 Cloud Functions. ② 미인증 로그인 화면의 관리자 문의 목록(`LoginView.jsx` AdminContactModal의 `users` role 쿼리)도 규칙상 조용히 거부되고 있다.

---

## ✅ Claude 리뷰 결과 — 라운드 3 (2026-07-10)

T17~T21 5개 커밋 검토 완료. score 로직 무변경, talent 하루 1회 `10+min(streak,7)`, 해금 플래그 영구 유지, opt-in 게이트(모달 포함 `enabled` 안쪽), 퀴즈 보상 트랜잭션(+10/+5, 재응시 방어), 수령/환불의 update 필드 화이트리스트 준수, T21의 `talentMigrated: true` 잠금 — 전부 스펙 충족. 조치한 발견 사항:

1. **(차단급 → Claude가 수정, 커밋 c3a822c)** 클라이언트 5곳(TalentShop 2, ChurchAdminView 3)이 최상위 `talentPurchases` 컬렉션을 참조 — 규칙은 `churches/{churchId}/talentPurchases` 하위 컬렉션에만 있어 전부 permission-denied가 났을 것. 하위 컬렉션 경로로 수정 완료. **Codex 참고: 앞으로 talentPurchases는 반드시 `db.collection('churches').doc(churchId).collection('talentPurchases')` 경로 사용.**
2. (nit, 무해) 경로 수정으로 구매 내역이 교회별로 자연 분리되므로 ChurchAdminView의 memberIds 클라이언트 필터는 이제 불필요하지만 남겨둠 — 삭제 교인 필터 역할은 유지되므로 그대로 둔다.
3. 퀴즈 113문항의 신학적·표기 검수는 사용자 몫으로 남아 있음 (라운드 3 보류 항목).

---

## ✅ Claude 리뷰 결과 — 라운드 4~7 (2026-07-11)

전 범위(107커밋, T22~T43) 리뷰 완료 — **차단급 결함 0건, 병합 가능**. 확인 요점: T29 이중 방어의 재제출 판별식이 "한 장 더 읽기"와 365→1 순환까지 정확(수학적으로 검증), T33 게이트의 영구 잠금 경로 없음(문항 없는 날·게스트 자동 개방), T38 구글 교회 등록이 교회+계정+디렉토리를 단일 트랜잭션으로 원자 처리, T40~41 다중 소속의 uid 중복 집계 방지 전 지점 확인, 규칙 무수정·compat 전용·신규 의존성 없음·빌드/검증기 통과. 조치한 발견 사항:

1. **(should-fix → Claude가 수정)** 전체 1,308문항의 95.5%가 `answerIndex: 0`이고 카드가 보기 순서를 섞지 않음 → 1번만 찍으면 ~95% 정답(게이트·보상 무력화). 문항 데이터는 그대로 두고 `quizEngine`에 문항 키 기반 **결정적 셔플**을 넣어 해결(같은 문항은 항상 같은 순서 — quizKey 재조회 경로와 일치 보장). **Codex 참고: 앞으로 문항 저작 시 answerIndex 위치를 다양화할 필요 없음(셔플이 처리), 단 choices 4개·유일 정답 원칙은 유지.**
2. (nit, 사용자 검수로 이관) 정확한 숫자 암기형 문항 16개 발견(왕상 6:1 "480년" 등) — 스펙의 "숫자·치수 암기 금지"에 저촉되는 것은 소수. M7 검수 시 함께 볼 것.
3. (nit) GoogleLinkCard가 앱 공용 ConfirmDialog 대신 window.confirm 사용 — 기능 정상, 후속 라운드에서 통일.

---

## 🔁 라운드 4 — 매일 영상(신앙생활 1분만) 자동화 마무리 + 본문 연동 성경퀴즈 (2026-07-10 위임)

> 설계: Claude Fable 5, 2026-07-10. 작업 프로토콜은 문서 상단과 동일 (순서대로, 작업당 커밋, `npm run build` 통과, 로그 기록).
>
> **배경 두 가지:**
> 1. **매일 영상**: 사용자가 유튜브 채널 "신앙생활 1분만"을 직접 운영하며, 매일성경 장년용/어린이용 재생목록이 따로 있다. 자동 채움 인프라(`settings/videoAutoConfig`, `DailyVideoCard`의 재생목록 최신 영상 선택 + 설명문 타임스탬프 챕터 파싱)는 이미 있다. 남은 것은 ① 날짜 매칭 정확도(지금은 "가장 최근에 게시된 영상"이라, 내일자 영상을 미리 올려두면 오늘 그게 나와버림) ② UX — 영상 하나에 "묵상 해설"(앞부분)과 "기도제목"(뒷부분)이 함께 들어 있으므로, 기본 재생은 해설부터 시작하고 "기도제목" 버튼으로 그 지점으로 점프.
> 2. **성경퀴즈 v2**: 현재 T18 퀴즈는 성경 전체 상식 113문항을 dayOfYear로 순환시키는 방식이라 "오늘 읽은 본문"과 무관하다. 사용자 확정 요구사항: (a) **정답이 항상 그 사용자가 오늘 읽은 본문 안에 있어야 한다** — 사용자마다 진도(currentDay·dayOffset·planId)가 달라 읽는 부분이 다르다. (b) 난이도는 너무 쉽지도 어렵지도 않게. (c) **1년 10독 하는 사용자가 같은 본문을 다시 읽을 때는 다른 문제가 나와야 한다** (readCount 회전).

### 라운드 4 제약 (기존 금지사항에 더해)

- 보상 체계(1차 +10 / 2차 +5 달란트, 트랜잭션 처리)와 `score` 로직은 바꾸지 말 것 — T18의 트랜잭션 코드를 그대로 재사용.
- `users` 문서에 쓰는 퀴즈 필드는 기존 `quizDate/quizAttempts/quizSolved`에 `quizKey`(문자열) 하나만 추가. 다른 신규 필드 금지. (본인 문서 update라 규칙 통과 — T18과 동일 경로. 만약 permission-denied가 나면 메모란에 남기고 quizKey 없이 진행.)
- 기존 `QUIZ_BANK`(bibleQuiz.js 113문항)는 삭제하지 말 것 — 은행 미구축 구간의 폴백으로 계속 쓴다.
- YouTube Data API 호출 코드는 `DailyVideoCard.jsx`의 기존 함수를 수정하는 방식으로 — 새 파일로 분리해도 좋으나 호출 흐름(문서 있으면 스킵 → 자동 채움 → create 경합 처리)은 유지.

### Phase V — 매일 영상

- [x] **T22. 날짜 매칭 영상 선택** (`src/components/dashboard/DailyVideoCard.jsx`)
  - `fetchLatestFromPlaylist(playlistId, apiKey)`에 `targetDateKey`(예: '2026-07-10') 인자 추가. 후보 정렬 전에 **제목 날짜 매칭**을 먼저 시도:
    - 제목에서 날짜 패턴 추출: `M월 D일`, `M/D`, `MM.DD`, `YYYYMMDD`, `MMDD`(4자리는 연도 없는 월일로 해석) — 헬퍼 `titleMatchesDate(title, dateKey)`를 `src/utils/helpers.js`에 신설 (순수 함수, 존재하는 달·일만 유효 처리).
    - 제목이 targetDateKey와 일치하는 게시된(<= now) 영상이 있으면 그중 최신을 선택.
    - 하나도 없으면 **기존 동작(게시 시각 최신)으로 폴백** — 제목에 날짜를 안 넣는 채널도 계속 동작해야 한다.
  - 완료 기준: 빌드 통과 + `titleMatchesDate` 단위 케이스를 주석으로 5개 이상 명시("7월 10일", "07.10", "7/10 매일성경", 불일치 "12월 25일", 잘못된 날짜 "13월 40일").
- [x] **T23. 묵상 해설/기도제목 UX** (`src/components/dashboard/DailyVideoCard.jsx`)
  - `CHAPTER_ORDER` 표시 라벨 변경: `해설 → "묵상 해설"(📖)`, `성경읽기 → "성경읽기"(📕)`, `기도 → "기도제목"(🙏)`. **표준 키('해설'/'성경읽기'/'기도')와 `mapToStandardLabel`은 절대 바꾸지 말 것** — 저장된 chapters 데이터와의 호환성.
  - 썸네일 ▶ 클릭 시(콜드스타트): '해설' 챕터가 있고 sec > 0이면 그 지점부터 시작 (인트로 스킵). 없으면 0초부터 — 기존과 동일.
  - 챕터 버튼 영역 위에 안내 한 줄: "영상 속 구간으로 바로 이동해요" (text-xs slate-400).
  - '기도' 챕터가 있으면 기도제목 버튼을 시각적으로 강조(예: indigo 채움 배경) — 사용자가 해설을 본 뒤 이 버튼을 눌러 기도제목 구간을 이어 보는 흐름이 핵심 요구사항.
- [x] **T24. 관리자 "오늘 영상 미리보기"** (`src/components/PlatformAdminView.jsx` 매일 영상 탭)
  - 기존 "연결 테스트" 버튼을 확장: API 키 + 재생목록으로 **T22와 동일한 선택 로직**을 돌려 "오늘 날짜로 선택될 영상"의 제목·게시일·파싱된 챕터(라벨+초)를 성인용/어린이용 각각 표시. 선택 로직 함수를 DailyVideoCard에서 export 하거나 helpers로 옮겨 **한 곳만 유지**할 것 (로직 사본 2개 금지).
  - 챕터가 0개로 파싱되면 경고 문구: "설명문에 타임스탬프(예: 0:00 매일성경 해설 / 3:20 기도제목)가 없어 구간 버튼이 표시되지 않습니다."

### Phase Q — 본문 연동 성경퀴즈 v2

**설계 핵심**: "오늘 읽은 장"의 진실 원천은 본문 캐시 문서의 title이다. `useBibleContent`가 본문을 로드할 때 `localStorage['v_{planType}_{version}_{actualDay}']`에 `{title, text, ...}`를 저장하며, title은 "개역개정 7월 10일 / 민 17-21장" 형태로 장 범위를 포함한다. 퀴즈는 읽기 완료 후에만 열리므로 이 캐시는 퀴즈 시점에 항상 존재한다. 이 title을 파싱하면 플랜(114/순서대로/신약)과 무관하게 실제 읽은 범위를 얻는다.

- [x] **T25. 범위 파서 + 퀴즈 선택기** (신규 `src/utils/quizEngine.js`)
  - `parseReadingRange(str)`: "민 17-21장" → `[{book:'민수기', ch:17}, ..., {book:'민수기', ch:21}]`, "눅 1:46-80" → `[{book:'누가복음', ch:1, vStart:46, vEnd:80}]`, "창 1-2장" 등. 성경 66권 약칭→정식명 매핑 테이블 포함(창/출/레/민/신/수/삿/룻/삼상/삼하/왕상/왕하/대상/대하/스/느/에/욥/시/잠/전/아/사/렘/애/겔/단/호/욜/암/옵/욘/미/나/합/습/학/슥/말/마/막/눅/요/행/롬/고전/고후/갈/엡/빌/골/살전/살후/딤전/딤후/딛/몬/히/약/벧전/벧후/유/계). "창 1-2장; 시 1편" 같은 복합 표기는 `;`·`,` 분리 후 각각 파싱. 파싱 실패 시 빈 배열 (호출부가 폴백 처리).
  - `getTodayReadingRange(user)`: ① `getActualDay(user.currentDay - 1 <= 0 ? 365 : user.currentDay - 1, user.dayOffset)`로 "가장 최근에 읽기 완료한 날"의 actualDay를 구하고 (읽기 완료 시 currentDay가 +1 되므로 -1), ② localStorage 캐시 title 파싱 시도, ③ 실패 시 `SCHEDULE_DATA[planId][actualDay-1].range` 파싱 폴백.
  - `selectQuiz(pool, readCount)`: pool을 (책, 장, 문항 순서)로 정렬 후 `pool[(readCount - 1) % pool.length]`. 절 범위가 있는 날(vStart/vEnd)은 ref의 절이 범위 안에 있는 문항만 pool에 포함.
  - 문항 로딩: `loadQuestionsForRange(range)` — 신규 디렉토리 `src/data/quiz/` 아래 **책별 JSON**(`src/data/quiz/genesis.json` 등, 영문 소문자 파일명 66개 예약)을 Vite dynamic import(`import.meta.glob` eager:false)로 lazy 로드. 파일이 아직 없는 책은 조용히 스킵.
  - pool이 비면 `null` 반환 — 호출부(T26)가 기존 `QUIZ_BANK` 폴백 사용.
- [x] **T26. BibleQuizCard v2** (`src/components/dashboard/BibleQuizCard.jsx`)
  - **읽기 전 잠금**: `currentUser.lastReadDate !== new Date().toDateString()`이면 문제 대신 잠금 카드 표시 — "📖 오늘 본문을 읽으면 퀴즈가 열려요" + 흐린 배경. (오늘 읽어야 "오늘 읽은 부분에서 출제" 전제가 성립.)
  - 열리면: `getTodayReadingRange` → `loadQuestionsForRange` → `selectQuiz(pool, readCount)`. 문항을 찾으면 카드 상단에 배지 "오늘 읽은 본문에서 나왔어요 · {range 원문}" 표시. pool이 비면 기존 `getTodayQuiz()` 폴백 + 배지 "성경 상식 문제".
  - **문항 고정**: 첫 제출 트랜잭션에서 `quizKey`(예: `'genesis-1-2'` = 파일-장-문항index)를 함께 저장. 재방문·재렌더 시 `quizDate === todayKey && quizKey` 있으면 그 문항을 다시 로드해 표시 (풀이 도중 "한 장 더 읽기"로 currentDay가 바뀌어도 문제 바뀜 방지). 폴백 문항은 `quizKey: 'bank-{index}'`.
  - 보상·시도 횟수·트랜잭션·결과 표시는 T18 코드 그대로.
  - 게스트는 기존대로 렌더링하지 않음.
- [x] **T27. 문항 검증 스크립트** (신규 `scripts/validate-quiz.mjs`)
  - `node scripts/validate-quiz.mjs`: src/data/quiz/*.json 전체를 검사 — ① 필수 필드 `{ch, q, choices[정확히 4], answerIndex 0-3, ref}` ② ref의 책이 파일의 책과 일치 ③ 같은 장 안에서 q 중복 금지 ④ choices 내 중복 금지 ⑤ 장당 문항 수 리포트(구약 3개·신약 5개 미만이면 경고 목록 출력). 실패 시 exit 1.
- [x] **T27b. 파서 장 경계 수정 + 커버리지 검증기** (⚠️ T28보다 먼저 — 저작의 전제조건)
  - **파서 버그 수정** (`src/utils/quizEngine.js` `parseChapterBody`): 장 경계를 걸치는 절 범위가 실제 스케줄에 13일 존재 — 신약 10일("마 10:26-11:1", "갈 4:1-5:1", "고전 10:1-11:1", "눅 3:21-4:13", "눅 9:51-10:20" 등) + 일년일독 3일("시 118:1-119:80", "시 119:81-120:7", "렘 26:1-29:23"). 현재 정규식이 끝 장 번호(그룹 3)를 캡처만 하고 버려서 `vEnd < vStart`가 되어 파싱이 빈다 → **그날 본문 퀴즈가 아예 안 나옴**. 수정: `A:B-C:D` 형태를 여러 아이템으로 전개 — 시작 장 `{ch:A, vStart:B, vEnd:999}`, 중간 장들은 절 제한 없는 `{ch}`, 끝 장 `{ch:C, vStart:1, vEnd:D}`. `isInReadingItem`이 vStart만 비교하므로 999 상한은 기존 필터와 호환.
  - **검증기에 커버리지 검사 추가** (`scripts/validate-quiz.mjs`): 두 플랜(whole_bible·new_testament)의 365일 range를 **실제 엔진 파서로** 파싱해 ① 파싱 결과가 빈 날 = 실패 ② 저작 완료된 책이 포함된 날의 문항 풀을 계산해 신약일독 5개 미만 / 일년일독 3개 미만 = 실패 ③ 미저작 책의 날은 "미저작"으로 집계만. 출력에 **신약 세그먼트 목록(책·장·절범위별 필요 문항 수)**을 포함해 T28의 작업 지시서가 되게 할 것.
- [x] **T28. 문항 은행 저작 — 1차분** (신규 `src/data/quiz/*.json`)
  - **형식**: `[{ "ch": 1, "q": "...", "choices": ["...","...","...","..."], "answerIndex": 0, "ref": "창세기 1:3" }, ...]` — ref는 반드시 `책 장:절`.
  - **분량 — "장당"이 아니라 "스케줄 하루-범위당" (2026-07-10 수정·사용자 지시)**:
    - 신약일독은 하루 1장이 아니다 — 365일 중 207일이 절 단위 범위이고 97개 장이 여러 날로 쪼개져 있다("마 5:1-26"과 "마 5:27-48"이 다른 날). 신약 책은 **스케줄 세그먼트(하루-범위)당 5문항**: 각 문항의 `ref` 절이 반드시 그 세그먼트 절 범위 안이어야 하고, **질문 내용도 그 절 범위 안의 사건만** 다룰 것(그날 그 부분만 읽은 사람이 풀 수 있어야 한다). 세그먼트 목록은 T27b 검증기 출력을 작업 지시서로 사용.
    - 일년일독 전용 구간(구약)은 기존대로 **장당 3문항** (하루 2~4장이라 하루 풀 6~12개 자동 확보). 이미 저작된 민수기는 이 기준이라 재작업 불필요. 단 시 118~120·렘 26~29의 장 경계 걸침 날은 검증기로 풀 크기 확인.
    - 이 기준의 목적(회전 보장): `selectQuiz`가 readCount로 회전하므로, 지키면 같은 본문이라도 신약일독 5독·일년일독 3독까지 매 독 다른 문제가 나온다.
  - **우선순위(중요)**: 통독 스케줄상 사용자들이 곧 읽을 책부터. `read_schedules.json`의 whole_bible Day 191(7/10) 이후 90일 내 등장하는 책 + new_testament 스케줄의 같은 구간 책을 먼저 만들고, 나머지는 후속 라운드로. 1차분 목표는 "이 90일 구간 100% 커버" — 각 책을 완성할 때마다 `node scripts/validate-quiz.mjs` 통과 후 커밋 (책 단위 커밋 권장).
  - **저작 지침(난이도 조절 — 사용자 요구: 너무 쉽지도 어렵지도 않게)**:
    - 본문을 읽었다면 기억날 **핵심 사건·인물·행동·이유**에서 출제. "누가 ~했나 / 왜 ~했나 / ~한 결과 무엇이 됐나" 유형 권장.
    - 금지(너무 쉬움): 정답이 질문 안에 있는 문제, 전국민이 아는 상식(노아 방주 등)을 해당 장 문제로 재활용.
    - 금지(너무 어려움): 족보 속 인물 이름 맞히기, 정확한 숫자·치수 암기(성막 규격 등), 지명 나열.
    - 오답 3개는 정답과 같은 범주(인물↔인물, 장소↔장소)로 그럴듯하게. 성경에 실제 등장하는 것 위주.
    - 표기는 개역개정 기준. 다른 번역(새번역 등) 사용자도 풀 수 있도록 특정 번역에만 있는 표현으로 정답이 갈리는 문제 금지.
    - 어르신·어린이 모두 읽는 서비스 — 문장은 짧고 존대로.
  - 작업 로그에 **"퀴즈 문항 신학적 검수는 사용자 몫"** 명시할 것.

### 사용자(관리자) 수동 작업 — 라운드 4

- **M5** (T22 전에도 가능): Google Cloud Console에서 YouTube Data API v3 키 발급 → 플랫폼 관리자 "매일 영상" 탭 → API 키 + "신앙생활 1분만" 장년/어린이 재생목록 URL 입력 → 자동 채움 켜기 → 연결 테스트.
- **M6**: 유튜브 영상 설명문에 타임스탬프 표기 유지 — 형식: `0:00 매일성경 해설` / `3:20 기도제목` (줄 시작에 타임스탬프). 이 두 줄이 있어야 구간 버튼이 나온다.
- **M7** (라운드 4 배포 후): 퀴즈 문항 무작위 샘플 신학·표기 검수.

---

## 🔁 라운드 5 — 사이트 점검 수정분 (2026-07-10 사용자 승인, 라운드 4 완료 후 진행)

> 배경: 2026-07-10 전체 코드 점검에서 나온 발견 중 사용자가 승인한 4건. 작업 프로토콜 동일.

- [x] **T29. "읽기 완료" 버튼 중복 제출 방지** (2026-07-10 실환경 재현됨 — 아래 실측 증거 반영해 이중 방어로 구현할 것)
  - **실측 증거** (테스트 계정 더블클릭): `currentDay 1→3` (하루치 본문 스킵), `score 0→21` (10+11 중복 적립), talent는 11로 정상 — talent만 `isFirstReadToday` 가드가 있고 score/currentDay는 없어서다.
  - **방어 1 (UI)**: 훅에 `readSubmitting` state — 함수 진입 시 true면 즉시 return, try/finally 해제, 훅 반환값에 포함. `src/components/dashboard/BibleReader.jsx` 읽기 완료 버튼(207행 부근)에 `disabled` + 라벨 "기록 중...". DashboardView에서 prop 연결.
  - **방어 2 (트랜잭션 — 근본 수정)**: UI 가드만으론 두 번째 클릭이 state 반영 전에 들어올 수 있다. 트랜잭션 내부에서 "같은 날 같은 진행일의 재제출"을 감지해 no-op 처리: `!isFirstReadToday && vDay === data.currentDay - ?` 형태가 아니라, 정확히는 **`data.lastReadDate === todayStr && vDay < data.currentDay`이면(이미 오늘 이 화면의 완료가 반영됨) 진도·점수·달란트 전부 갱신 없이 조기 종료**. "한 장 더 읽기"(미리 읽기 — vDay가 이미 증가한 currentDay와 같음)는 정상 통과해야 한다 — 구분 조건을 신중히: 첫 클릭 후 currentDay는 +1 된 상태이므로 재제출은 `vDay === currentDay - 1`로 판별 가능.
  - `src/components/GuestReaderView.jsx` `handleRead`: 게스트도 동일 문제(`recordGuestRead`가 호출마다 currentDay +1). 같은 submitting 가드 + `recordGuestRead` 내부에서 오늘 이미 기록됐고 같은 날짜 재호출이면 currentDay 증가 스킵.
- [x] **T30. 주간 읽기왕 수리** (현재 항상 "-" 표시되는 죽은 기능)
  - 원인: `src/utils/statsUtils.js` `getWeeklyMVP`(67-127행)가 users 문서의 `readHistory` 배열을 읽지만, 읽기 기록은 하위 컬렉션(`users/{uid}/history`)으로만 저장된 지 오래라 항상 빈 배열.
  - 해결(경량 롤링 필드): `handleRead` 트랜잭션의 updateData에 `recentReadDates` 추가 — `[...(data.recentReadDates || []).filter(최근 14일 이내), todayStr]` (중복 제거, 최대 14개). 하위 컬렉션 조회 N회 방식은 금지(비용).
  - `src/utils/helpers.js` `userDocToState`에 `recentReadDates: d.recentReadDates ?? []` 매핑 추가. `getWeeklyMVP`는 `readHistory` 대신 `recentReadDates` 사용(레거시 `readHistory`가 비어있지 않으면 병합 폴백).
  - 알려진 한계(수용): 기존 사용자는 다음 읽기부터 데이터가 쌓이므로 주간 랭킹이 채워지는 데 최대 1주 걸린다 — 작업 로그에 명시.
- [x] **T31. 로그인·버전선택 화면 광고 하단 여백**
  - `src/components/LoginView.jsx`와 `src/components/PlanSelectionView.jsx`의 각 화면 루트 컨테이너에 `style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}` 추가 (ChurchAdminView 957행 부근과 동일 패턴). 하단 고정 광고(50px)가 마지막 버튼/목록을 가리는 문제.
  - 주의: PlanSelectionView는 화면이 4개(view 분기)라 루트가 4곳이다 — 전부.
- [x] **T32. 완독 축하 개선**
  - 현재: `handleRead`에서 365일차 완주 시 `alert()` 한 줄(166행 부근). `completedRound`/`newReadCount`는 이미 계산되고 `platformStats.finished_total`도 이미 증가한다 — 이 로직들은 건드리지 말 것.
  - (a) alert 대신 전용 축하 오버레이 컴포넌트(신규 `src/components/dashboard/CompletionCelebration.jsx`): 전체 화면, 🎉 + "N독 완주!" + "N+1독을 시작합니다" + 닫기 버튼. confetti와 함께 표시. resultData의 completedRound 플래그로 트리거.
  - (b) 교회 관리자 대시보드 탭에 StatCard "완독자" 추가 — 로드된 members 중 `readCount > 1`인 인원 수 + 클릭 시 명단(이름·N독).
  - (c) 랜딩의 "올해 완독자" 통계는 `platformStats.finished_total`을 이미 읽는지 확인하고, 안 읽고 있으면 연결 (LoginView 랜딩 통계 부분).

- [x] **T33. 퀴즈 우선 게이트 — 퀴즈를 확인해야 "오늘 읽기 완료" 활성화** (T29 완료 후 착수 — 같은 버튼 영역)
  - 목적(사용자 요구): 오늘 첫 "읽기 완료"를 누르기 전에 성경퀴즈를 먼저 만나게 한다. 카드 배치는 이미 버튼 위로 이동됨(e948c1b) — 이 작업은 **강제 순서**를 만드는 것.
  - 게이트 열림 조건(하나라도 충족 시 버튼 활성): ① 오늘 퀴즈 확정 — `quizDate === 오늘` 이고 (`quizSolved` 이거나 시도 소진) ② 오늘 본문 범위에 출제 가능한 문항이 없음(quizEngine이 문항을 못 찾는 날 — T28 미저작 책 포함, 이때 퀴즈 카드 자체가 안 뜨므로 게이트도 없어야 함) ③ 퀴즈 카드의 **"오늘은 건너뛰기"** 링크 클릭(신규 — localStorage `b114_quiz_skip_{toDateString}` 저장, 새로고침에도 유지).
  - 게이트 적용 범위: **오늘 첫 완료**(`isCurrentProgressDay && !hasReadToday`)에만. "한 장 더 읽기"(미리 읽기)와 게스트 모드는 게이트 없음.
  - 잠김 상태 UX: 버튼 비활성 + 도움말 "먼저 위의 성경퀴즈를 풀어보세요 ⬆" — 비활성 버튼 영역 클릭 시 퀴즈 카드로 부드럽게 스크롤.
  - 구현: 게이트 판정을 DashboardView(또는 소형 훅)에서 계산해 BibleReader에 `quizGateOpen` prop으로 전달. BibleQuizCard와 판정 로직이 같은 소스(currentUser의 quiz 필드 + quizEngine)를 쓰도록 — 두 곳이 어긋나면 영원히 잠기는 사고가 난다.
- [x] **T34. 읽기 완료 시 "오늘 받은 달란트" 표시**
  - `handleRead` 성공 후 피드백(현재 보너스 토스트 자리)을 확장: **"오늘 +N달란트! (읽기 ⭐a · 퀴즈 ⭐b) · 보유 ⭐M"**.
  - a = 트랜잭션 resultData의 talentEarned(오늘 첫 완료가 아니면 0 — 이때는 달란트 줄 자체를 생략), b = `quizDate === 오늘 && quizSolved`면 `quizAttempts === 1 ? 10 : 5` 아니면 0 (클라이언트 계산 — 새 필드 추가 금지), M = 갱신된 talent.
  - 완독(365일차) 축하 오버레이(T32)와 겹치는 날은 오버레이 안에 같은 정보를 넣고 토스트는 생략.
  - 게스트는 달란트가 없으므로 대상 아님.
- [x] **T35. 묵상(메모) 저장·조회 점검 및 수정** (2026-07-10 실환경 점검 완료 — 저장/재로드/게스트 숨김 정상. 남은 수정 1건: `src/hooks/useMemos.js:66-68` `saveMemo`가 로컬 state 먼저 갱신 후 Firestore 실패를 console.error로만 삼킴 → 실패 시 토스트/에러 표시 + 로컬 롤백 추가)
  - 묵상 기능의 전체 경로를 추적: 어디서 쓰고(컴포넌트·훅), 어디에 저장되며(users 문서 필드 vs 하위 컬렉션), 규칙을 통과하는지, 다시 열었을 때·다른 날짜로 이동했을 때 제대로 표시되는지.
  - 점검 항목: 저장 실패가 조용히 삼켜지는 catch 없는지 / 날짜 키 불일치(KST vs toDateString) 없는지 / 긴 텍스트·이모지 입력 시 깨짐 없는지 / 게스트 모드에서 묵상 UI가 노출되어 서버 쓰기를 시도하지 않는지.
  - 발견된 버그는 이 작업 안에서 수정. 문제가 없으면 작업 로그에 "점검 완료·이상 없음"과 확인한 경로(file:line)를 기록.
- [x] **T36. 전체 기능 점검 패스 (로컬 dev)** (2026-07-11 완료 — 로그인 4화면과 게스트 전체 흐름·콘솔 0건을 브라우저 확인하고, 관리자/A4·상점·퀴즈 경로를 정적 감사해 사소한 방어를 보강. 운영 쓰기·인증 필요 실화면은 미검증으로 기록)
  - `npm run dev`로 프로덕션 자격증명 없이 가능한 범위를 전부 확인: 로그인 4탭 렌더링·전환, 무소속 토글, 게스트 전체 흐름(진입→본문→버전 변경→읽기 완료→새로고침 진도 유지), 영상 카드, 퀴즈 카드(문항 있는 날 기준), 달란트 상점 UI, 관리자 화면들 렌더링, A4 인쇄물 프리뷰, 콘솔 에러 0.
  - 사소한 문제(오타, 스타일 깨짐, null 가드)는 즉시 수정·커밋. 로직 설계가 필요한 문제는 고치지 말고 "Codex → Claude 메모"에 기록.
  - 실제 가입·구매·관리자 조작 등 운영 데이터를 만드는 검증은 하지 말고 "미검증" 목록으로 정리해 로그에 남길 것.

**라운드 5 이후 백로그 (착수 금지 — 다음 설계 세션에서)**: 교회 관리자 가입 시 비밀번호 평문 본문서 저장(memberCredentials 경유로 전환), 본문 캐시 누락 날짜 관리자 경고, KST/기기시간 날짜 기준 통일, 커스텀 부서 왕관 배지, RaceMap 이름표 겹침, 게스트 가입 전환 유도 배너.

---

## 🔁 라운드 6 — 구글 로그인 (교회 관리자 전용) (2026-07-11 사용자 확정, 라운드 5 완료 후 진행)

> 사용자 결정 2가지 (변경 금지): ① 구글 로그인은 **교회 관리자에게만** 제공 — 성도/무소속/게스트 화면에는 구글 버튼이 일절 없다. ② **기존 가입 관리자는 제외** — 계정 연결·마이그레이션 흐름을 만들지 않는다. 기존 관리자는 지금처럼 이메일+비밀번호로만 로그인.
> 전제 수동 작업 **M8**: Firebase 콘솔 → Authentication → Sign-in method → **Google 활성화** (지원 이메일 지정), Settings → 승인된 도메인에 `www.bible114.net` 확인. (M8 전에 코드가 배포되면 버튼 클릭 시 `auth/operation-not-allowed` — 에러 문구 처리 필수.)

- [x] **T37. 관리자 로그인 탭에 "구글로 로그인"**
  - `LoginView.jsx` admin 탭 하단에 구분선 + "G 구글로 로그인" 버튼. compat API: `auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())` (modular import 금지).
  - 성공 후 users 문서 조회(`users/{uid}`): ① role이 churchAdmin/platformAdmin이면 기존 관리자 로그인 후처리 재사용(useAuth의 문서 로드→talent 마이그레이션→뷰 전환 경로를 함수로 추출해 공유) ② **문서가 없거나 role이 관리자가 아니면 즉시 `auth.signOut()` + 에러**: "이 구글 계정으로 등록된 관리자가 없습니다. 기존 관리자는 이메일·비밀번호로 로그인하시고, 새 교회는 '교회 등록'을 이용하세요."
  - **주의(중요)**: gmail 주소로 가입한 기존 관리자가 이 버튼을 누르면 Firebase가 이메일·비밀번호 계정을 구글 provider로 **자동 병합/탈취**할 수 있다(One account per email 정책). 병합되면 uid가 유지되고 users 문서도 있으므로 ①경로로 정상 로그인되지만, **비밀번호 provider가 unlink될 수 있음** — 이 경우를 감지해(`cred.user.providerData`에 password 없음) 안내 토스트 "이제부터 이 계정은 구글로 로그인됩니다"를 표시할 것. 이것은 사용자가 스스로 누른 경우의 안전망이며, 유도하지는 말 것.
  - 에러 처리: `auth/operation-not-allowed`(M8 미실행) → "구글 로그인이 아직 활성화되지 않았습니다. 관리자에게 문의하세요." / `auth/popup-blocked` → "팝업이 차단되었습니다. 브라우저 설정을 확인해주세요." / `auth/popup-closed-by-user` → 무시(에러 표시 안 함).
  - **카카오톡 인앱 브라우저**: `navigator.userAgent`에 `KAKAOTALK` 포함이면 구글 버튼 대신 안내 문구 "카카오톡 브라우저에서는 구글 로그인이 제한됩니다. 우측 하단 ⋯ 메뉴에서 '다른 브라우저로 열기'를 눌러주세요." (구글 정책상 인앱 웹뷰 OAuth 차단 — 우회 시도 금지.)
- [x] **T38. 교회 등록을 구글 계정으로**
  - adminSignup 1단계에 "구글 계정으로 시작" 버튼 추가 (기존 이메일+비밀번호 방식도 그대로 유지 — 병행). 클릭 시 signInWithPopup → 성공하면 1단계의 이메일·비밀번호 입력란을 숨기고 구글 프로필(이메일 고정 표시, 이름은 수정 가능)로 대체. 이미 해당 구글 계정에 users 문서가 있으면 "이미 등록된 계정입니다" + 로그인 유도.
  - 2단계(교회 정보·조직 구성)는 동일. 최종 생성 시: Auth 계정은 이미 존재하므로 createUser 없이 **현재 uid로 users 문서 생성** — `role: 'churchAdmin'`, `email`: 구글 이메일, **`password: null`** (구글 계정은 평문 보관 대상 아님 — private/auth 문서도 만들지 않는다). 교회 문서·디렉토리 등록은 기존 흐름 재사용.
  - 중도 이탈 처리: 구글 인증 후 2단계에서 이탈하면 Auth 계정만 남고 users 문서가 없는 상태 — T37의 "문서 없음 → 안내" 경로가 자연스럽게 받아준다(별도 정리 불필요, 로그에 명시).
  - 가입 완료 기준: 구글로 교회 등록 → 관리자 뷰 진입 → 로그아웃 → 구글로 재로그인 성공 (로컬 dev에서 실제 구글 팝업 검증이 어려우면 미검증 명시).
- [x] **T39. 기존 관리자 계정에 구글 연결 (플랫폼 관리자 요청 — "기존 가입자 제외" 원칙의 유일한 예외)**
  - `PlatformAdminView.jsx` 시스템 탭에 "🔗 내 계정에 구글 연결" 박스: 버튼 클릭 → `auth.currentUser.linkWithPopup(new firebase.auth.GoogleAuthProvider())` (compat API). 성공 시 "연결 완료 — 이제 관리자 로그인에서 구글 버튼으로 로그인할 수 있습니다" 안내. `auth/credential-already-in-use`(그 구글 계정이 이미 다른 계정에 사용됨) → "이 구글 계정은 이미 다른 계정에 연결되어 있습니다" 에러.
  - 이미 연결된 상태(`auth.currentUser.providerData`에 google.com 존재)면 버튼 대신: 연결된 구글 이메일 표시 + **"비밀번호 로그인 제거"** 버튼(더블 confirm — "제거하면 이 계정은 구글로만 로그인할 수 있습니다") → `auth.currentUser.unlink('password')`. 제거 성공 시 users 문서의 `password` 필드도 null 확인(이미 null 마커 체계).
  - 같은 UI를 `ChurchAdminView.jsx` 설정 탭에도 재사용 가능하게 컴포넌트로 분리(`src/components/admin/GoogleLinkCard.jsx`) — 기존 교회 관리자도 원하면 스스로 연결할 수 있게. 단 어디서도 연결을 강요하는 문구는 쓰지 말 것.
  - 완료 기준: 빌드 통과. 실계정 연결 검증은 사용자 몫(수동 M9: 플랫폼 관리자 로그인 → 구글 연결 → 구글 재로그인 확인 → 비밀번호 로그인 제거).

---

## 🔁 라운드 7 — 교회 내 다중 소속 (2026-07-11 사용자 확정, 라운드 6 완료 후 진행)

> 배경: 한 사람이 "여전도회이면서 1구역"처럼 교회 안에서 여러 공동체에 속할 수 있다. 읽기 기록은 이미 사람(users 문서)에 붙어 있으므로 **데이터를 복제하지 않는다** — 집계·표시에서 한 사람을 여러 그룹에 세는 방식. 규칙 변경 불필요(같은 교회 안).
> 설계 원칙: 기존 `departmentId/subgroupId`는 **주 소속으로 유지**(마이그레이션 없음, 온보딩도 그대로 주 소속 1개 선택). 추가 소속은 새 배열 필드.

- [x] **T40. 데이터 필드 + 공용 헬퍼**
  - users 문서에 `extraMemberships: [{departmentId, departmentName, subgroupId, subgroupName}]` (기본 없음/빈 배열, 최대 3개). `userDocToState`에 `extraMemberships: d.extraMemberships ?? []` 매핑.
  - 신규 `src/utils/memberships.js`: `getMembershipList(user)` → 주 소속 + extraMemberships를 합쳐 (departmentId+subgroupId) 기준 중복 제거한 배열 반환. **모든 소비자는 반드시 이 헬퍼만 사용** (직접 필드 조합 금지 — 소비자마다 어긋나면 집계 불일치 사고).
  - `belongsToDepartment(user, deptId)` / `belongsToSubgroup(user, deptId, subId)` 헬퍼도 함께.
- [x] **T41. 집계·랭킹에 다중 소속 반영**
  - `calculateSubgroupStats`: 멤버를 getMembershipList의 모든 그룹에 집계 (그룹 내에서는 1회).
  - DashboardView의 racers/departmentMembers 필터, RankingModal, `getWeeklyMVP`: `belongsToDepartment/Subgroup` 헬퍼로 교체 — 여전도회 화면에도, 1구역 화면에도 그 사람이 나타난다.
  - **중복 집계 금지 지점(중요)**: 교회 단위 명단(관심 필요 명단, 스트릭 Top5, 완독자 수, 오늘 읽음 카운트)은 **uid 기준 1회만** — 그룹 단위 뷰만 다중 표시. computeAtRisk 등에 uid dedupe 확인.
  - 본인 대시보드는 주 소속 공동체 기준 유지 (뷰 전환 드롭다운은 이번 범위 밖 — 백로그).
- [x] **T42. 교회 관리자 — 추가 소속 관리**
  - 교인 상세 SlideOver에 "소속" 섹션 확장: 주 소속 표시 + 추가 소속 목록(각각 제거 버튼) + "소속 추가" (부서→소그룹 선택, 최대 3, 주 소속과 중복 선택 방지). 저장은 users 문서 update (관리자 권한 기존 규칙으로 충분).
  - 부서별 현황·교인 목록에 겸직 소속 뱃지 표시 (예: "1구역 +여전도회"). CSV 내보내기의 소속 칸은 쉼표로 병기.
  - 기존 "소그룹 변경"은 주 소속 변경으로 유지(문구만 "주 소속 변경"으로).
- [x] **T43. 성도 화면 표시**
  - 대시보드 헤더/랭킹에서 본인 소속 표기에 추가 소속을 작게 병기. 어르신 혼동 방지를 위해 화면 구조는 바꾸지 말고 뱃지 수준으로만.
  - 무소속(unaffiliated_v1)은 대상 아님 — extraMemberships UI 미노출.

---

## 🔁 라운드 8 — 조직 간 소속 (A교회 + B동아리) (2026-07-11 설계 확정 — ⚠️ 착수 전 Claude 규칙 선행 필요)

> **아키텍처 확정 (변경 금지)**: 계정·로그인·users 문서·기존 교회 랭킹 경로는 **일절 건드리지 않는다**. 조직 간 소속은 각 조직의 **명부 하위컬렉션** `churches/{orgId}/roster/{uid}`로만 표현한다:
> `{ uid, name, score, currentDay, streak, readCount, lastReadDate, departmentId, departmentName, subgroupId, subgroupName, joinedAt, updatedAt }`
> - **가입(공동체 추가)**: 성도가 대시보드 "공동체 추가" → 교회 검색(디렉토리) + 입장코드 검증(기존 가입과 동일한 codeHash 방식, 본인 주 교회는 선택 불가) → 자기 roster 문서 self-create → 그 조직의 부서/소그룹 선택(기존 온보딩 화면 재사용, 결과는 roster 문서에).
> - **진도 동기화**: `handleRead` 트랜잭션에서 내 roster 문서들(로그인 시 collectionGroup 쿼리로 파악, 최대 3개)을 같은 트랜잭션으로 갱신 — 한 곳에서 읽으면 모든 조직에 즉시 반영.
> - **조직 쪽 랭킹**: 그 조직의 `loadAllMembers` = 자체 교인(users where churchId==org) + roster 행 병합 (uid 중복 시 자체 교인 우선). 달리기 지도·소그룹 랭킹에 그대로 등장.
> - **B 조직 관리자 권한**: 자기 조직 roster 행만 관리(소그룹 배정·제명=행 삭제). **다른 교회 소속인 그 사람의 users 본문서·비밀번호에는 접근 불가** (개인정보 분리 — 이 설계의 핵심 이점).
> - **달란트/상점**: 지갑은 개인 소유이므로 가입한 모든 조직의 상점 사용 가능(7일 해금 동일). 구매 내역은 해당 조직에 쌓임.
> - **규칙(Claude 선행 배포)**: roster read = 그 조직 구성원(`myData().churchId == orgId || exists(내 roster 행)`), create/update = 본인(필드 화이트리스트) + 그 조직 관리자, delete = 본인 + 그 조직 관리자. collectionGroup 자기 행 조회 규칙 + 인덱스 포함. **Codex는 firestore.rules 수정 금지 — 규칙·인덱스는 Claude가 라운드 8 시작 전에 배포한다.**

- [x] **T44. (Claude 담당) roster 규칙 + collectionGroup 인덱스 설계·배포** — Codex 착수 전 완료 조건. Codex는 이 항목이 `[x]`가 되기 전에 T45 이하를 시작하지 말 것.
- [x] **T45. 로그인 시 내 조직 파악** — collectionGroup('roster').where('uid','==',내uid) 조회 → currentUser.extraOrgs. 실패해도 로그인은 진행(조용히 빈 배열).
- [x] **T46. 공동체 추가/탈퇴 흐름 (성도)** — 대시보드 설정 영역 "내 공동체": 현재 조직 목록 + "공동체 추가"(검색+입장코드) + 탈퇴(자기 행 삭제, confirm). 최대 3개.
- [x] **T47. handleRead 진도 동기화** — 트랜잭션에 extraOrgs roster 행 갱신 포함. 행이 삭제된 경우(제명) 조용히 스킵.
- [x] **T48. 조직 랭킹 병합 + 관리자 명부 관리** — loadAllMembers 병합(uid dedupe), ChurchAdminView에 "외부 공동체 멤버" 구분 뱃지 + 소그룹 배정/제명(roster 행만). 관심 명단·통계에 roster 멤버 포함.

---

## 🔁 라운드 9 — 개인 우선 가입 (신규 가입자 한정) (2026-07-11 사용자 승인 — 라운드 8 완료 후 진행)

> **북극성**: 계정은 사람에게, 소속은 공동체 선택으로. 이 라운드는 **신규 가입자만** 개인 계정 체계로 전환한다 — **기존 교인의 로그인·계정은 한 글자도 바꾸지 않는다** (기존 교인 이전은 라운드 10에서 별도 결정). 라운드 8의 roster가 이 라운드의 소속 기반이다.
>
> **개인 계정 정의**:
> - 로그인 수단 2가지 (구글 강요 금지 — 어르신 배려가 사용자 확정 조건): ① **구글** ② **이름+생년월일+전화 뒤 4자리+비밀번호** (가짜 이메일 `이름_생일p전화4@bible.local` — 교회ID 미포함, 기존 무소속 식별자 로직 재사용하되 UNAFFILIATED_CHURCH_ID 없이).
> - users 문서: `accountType: 'personal'`, `churchId: null`, `primaryOrgId: <첫 가입 조직 또는 null>`. 비밀번호 방식이면 평문은 private/auth에(기존 체계), 구글이면 비밀번호 자체가 없음.
> - 소속은 전부 roster 행 (라운드 8 T46 흐름 재사용). 공동체 0개인 개인 계정 = 혼자 읽는 상태(랭킹 없음) — 무소속 가상 교회를 새로 쓰지 않는다(레거시 전용으로 동결).
>
> **비밀번호 찾기 한계(설계상 수용)**: 개인 계정은 특정 교회 관리자가 없으므로 비밀번호 조회 지원은 플랫폼 관리자만 가능. 구글 계정은 해당 없음. 안내 문구에 반영할 것.

- [x] **T49. (Claude 담당) 규칙 확장 — 개인 계정의 조직 멤버 읽기** — users read에 "조회자가 그 교회 roster에 있으면 허용" 분기(`exists(/churches/$(resource.data.churchId)/roster/$(request.auth.uid))`, 목록 쿼리 증명 가능) 추가·배포. T44와 함께 처리. Codex는 이 항목 `[x]` 전에 T50 이하 착수 금지.
- [x] **T50. 개인 가입 화면** — 첫 화면에 "처음이세요? 시작하기" 경로: [구글로 시작] / [이름·생일·전화4·비밀번호로 시작]. 게스트 진도 이관(T10 로직) 재사용. 기존 "교인 로그인"(교회 선택 방식)은 그대로 병존 — 문구로 구분: "이미 교회에서 가입하셨나요? 교인 로그인".
- [ ] **T51. 가입 직후 공동체 온보딩** — 플랜 선택 → "공동체에 참여하시겠어요?" (교회 검색+입장코드 → 부서/소그룹 → roster 행 + primaryOrgId 지정) 또는 "나중에 할게요"(혼자 읽기 시작). T46 컴포넌트 재사용.
- [ ] **T52. 개인 계정 대시보드** — 커뮤니티 뷰(랭킹·달리기·MVP)는 primaryOrgId 기준(loadAllMembers(primaryOrgId) 병합 경로 재사용). 공동체 2개 이상이면 헤더에 조직 전환 드롭다운(= primaryOrgId 변경, users 문서 update). 공동체 0개면 커뮤니티 카드 숨김(현 무소속 화면 스타일).
- [ ] **T53. 관리자·지원 대응** — 플랫폼 관리자 회원 목록에 accountType 뱃지("개인"), 개인 계정 비밀번호 확인은 플랫폼 관리자의 private/auth 조회로(기존 규칙 커버). 교회 관리자 화면의 roster 멤버(개인 계정 포함) 관리에는 이미 T48로 충분 — 회귀 확인만.

**라운드 10 후보 (착수 금지 — 사용자 결정 대기)**: 기존 교인의 개인 계정 점진 이전(로그인 시 전화 4자리 1회 등록 → 이메일 재발급), 충분히 이전되면 교회 선택 로그인 은퇴, roster를 유일한 소속·랭킹 원장으로 통일(users 교차 read 규칙 재봉쇄).

---

## 📮 Claude → Codex 메모

- 이 설계는 3차 자체 점검을 거친 확정본이다. "더 나은 방법"이 보여도 위 설계 결정 4가지(가상 교회/익명 인증/localStorage 전용/클라이언트 상수)는 바꾸지 말고, 제안은 위 메모란에 적어라.
- firestore.rules의 `users` read 규칙에 일반 교인 멤버 쿼리가 거부되는 것으로 보이는 별개 버그가 있다. **이 저장소 작업에서 건드리지 말 것** — 별도 세션에서 처리 중이다. 랭킹이 빈 화면이어도 이번 작업의 회귀가 아니다.
- Firebase는 compat(v8 스타일) API만 쓴다. `import { doc, getDoc }` 같은 modular API를 섞지 마라.
- 커밋 푸시·배포는 전부 사용자 몫이다. 로컬 커밋까지만.
