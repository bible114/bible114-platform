# HANDOFF: 무소속 성도 가입 + 비로그인(게스트) 읽기

> 이 문서는 Claude(설계)와 Codex(구현) 사이의 인수인계 문서다.
> 설계 확정: 2026-07-09, Claude Fable 5 (3차 자체 점검 완료본).

---

## 작업 프로토콜 (Codex는 반드시 이 순서로)

> **현재 활성 작업: "🔁 라운드 4" 체크리스트 (T22~T28) → 완료 후 "🔁 라운드 5" (T29~T32).** 라운드 1(T1~T11)·라운드 2(T12~T16)·라운드 3(T17~T21)은 완료·리뷰 통과됨.
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
- [ ] **T28. 문항 은행 저작 — 1차분** (신규 `src/data/quiz/*.json`)
  - **형식**: `[{ "ch": 1, "q": "...", "choices": ["...","...","...","..."], "answerIndex": 0, "ref": "창세기 1:3" }, ...]` — ref는 반드시 `책 장:절`.
  - **분량**: 구약 장당 3문항, 신약 장당 5문항(신약일독 플랜은 하루 1장이라 회전 여유 필요).
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

- [ ] **T29. "읽기 완료" 버튼 중복 제출 방지**
  - `src/hooks/useUserBibleActions.js` `handleRead`(44행 부근): 트랜잭션은 원자적이지만 연타 시 트랜잭션이 **여러 번 각각 성공**해 진도·점수·달란트가 중복된다. 훅에 `readSubmitting` state 추가 — 함수 진입 시 true면 즉시 return, try/finally로 해제. `readSubmitting`을 훅 반환값에 포함.
  - `src/components/dashboard/BibleReader.jsx` 읽기 완료 버튼(207행 부근): `readSubmitting` prop 받아 `disabled` + 라벨 "기록 중...". DashboardView에서 prop 연결.
  - `src/components/GuestReaderView.jsx` `handleRead`: 게스트도 동일 문제(`recordGuestRead`가 호출마다 currentDay +1). 같은 패턴의 submitting 가드 추가, BibleReader에 같은 prop 전달.
- [ ] **T30. 주간 읽기왕 수리** (현재 항상 "-" 표시되는 죽은 기능)
  - 원인: `src/utils/statsUtils.js` `getWeeklyMVP`(67-127행)가 users 문서의 `readHistory` 배열을 읽지만, 읽기 기록은 하위 컬렉션(`users/{uid}/history`)으로만 저장된 지 오래라 항상 빈 배열.
  - 해결(경량 롤링 필드): `handleRead` 트랜잭션의 updateData에 `recentReadDates` 추가 — `[...(data.recentReadDates || []).filter(최근 14일 이내), todayStr]` (중복 제거, 최대 14개). 하위 컬렉션 조회 N회 방식은 금지(비용).
  - `src/utils/helpers.js` `userDocToState`에 `recentReadDates: d.recentReadDates ?? []` 매핑 추가. `getWeeklyMVP`는 `readHistory` 대신 `recentReadDates` 사용(레거시 `readHistory`가 비어있지 않으면 병합 폴백).
  - 알려진 한계(수용): 기존 사용자는 다음 읽기부터 데이터가 쌓이므로 주간 랭킹이 채워지는 데 최대 1주 걸린다 — 작업 로그에 명시.
- [ ] **T31. 로그인·버전선택 화면 광고 하단 여백**
  - `src/components/LoginView.jsx`와 `src/components/PlanSelectionView.jsx`의 각 화면 루트 컨테이너에 `style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}` 추가 (ChurchAdminView 957행 부근과 동일 패턴). 하단 고정 광고(50px)가 마지막 버튼/목록을 가리는 문제.
  - 주의: PlanSelectionView는 화면이 4개(view 분기)라 루트가 4곳이다 — 전부.
- [ ] **T32. 완독 축하 개선**
  - 현재: `handleRead`에서 365일차 완주 시 `alert()` 한 줄(166행 부근). `completedRound`/`newReadCount`는 이미 계산되고 `platformStats.finished_total`도 이미 증가한다 — 이 로직들은 건드리지 말 것.
  - (a) alert 대신 전용 축하 오버레이 컴포넌트(신규 `src/components/dashboard/CompletionCelebration.jsx`): 전체 화면, 🎉 + "N독 완주!" + "N+1독을 시작합니다" + 닫기 버튼. confetti와 함께 표시. resultData의 completedRound 플래그로 트리거.
  - (b) 교회 관리자 대시보드 탭에 StatCard "완독자" 추가 — 로드된 members 중 `readCount > 1`인 인원 수 + 클릭 시 명단(이름·N독).
  - (c) 랜딩의 "올해 완독자" 통계는 `platformStats.finished_total`을 이미 읽는지 확인하고, 안 읽고 있으면 연결 (LoginView 랜딩 통계 부분).

**라운드 5 이후 백로그 (착수 금지 — 다음 설계 세션에서)**: 교회 관리자 가입 시 비밀번호 평문 본문서 저장(memberCredentials 경유로 전환), 본문 캐시 누락 날짜 관리자 경고, KST/기기시간 날짜 기준 통일, 커스텀 부서 왕관 배지, RaceMap 이름표 겹침, 게스트 가입 전환 유도 배너.

---

## 📮 Claude → Codex 메모

- 이 설계는 3차 자체 점검을 거친 확정본이다. "더 나은 방법"이 보여도 위 설계 결정 4가지(가상 교회/익명 인증/localStorage 전용/클라이언트 상수)는 바꾸지 말고, 제안은 위 메모란에 적어라.
- firestore.rules의 `users` read 규칙에 일반 교인 멤버 쿼리가 거부되는 것으로 보이는 별개 버그가 있다. **이 저장소 작업에서 건드리지 말 것** — 별도 세션에서 처리 중이다. 랭킹이 빈 화면이어도 이번 작업의 회귀가 아니다.
- Firebase는 compat(v8 스타일) API만 쓴다. `import { doc, getDoc }` 같은 modular API를 섞지 마라.
- 커밋 푸시·배포는 전부 사용자 몫이다. 로컬 커밋까지만.
