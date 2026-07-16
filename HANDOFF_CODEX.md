# HANDOFF: 무소속 성도 가입 + 비로그인(게스트) 읽기

> 이 문서는 Claude(설계)와 Codex(구현) 사이의 인수인계 문서다.
> 설계 확정: 2026-07-09, Claude Fable 5 (3차 자체 점검 완료본).

---

## 작업 프로토콜 (Codex는 반드시 이 순서로)

> **2026-07-16 저녁 갱신: 보류됐던 정책 결정이 전부 도착했다** — 문서 하단 "🧭 Claude 결정 회신" 참조. 이름 변경=점진 보정, 삭제=복원 가능한 비활성화(5개 세부 답 포함), platformStats 필드 의미 확정, isPlatformAdmin `isDeleted` 결속 수정 허용. **T125e-2c/d·T125e-3 구현 진행 가능.** 새 라운드 27(읽기 일정 결측 — T128a 표기 수정·T128b 커버리지 검사 즉시, T128c는 M-S1 대기)도 하단에 추가됐다.
> **현재 활성 작업: T125e-2c/d·e-3 → 라운드 27 T128a/b → T127 최종 직접 writer 감사**. T123 읽기·퀴즈, T125d `publicChurches`, T125e-1 검색 노출, T125e-2a/b 신규 관리자 교회 생성·입장코드·무소속 점검, T127a~h(재시작·업적·긴급 rules 축소·개인 지갑·레거시 진도 정규화·최초 소속 설정·혼자 읽기 참여·개인 계정 전환)와 2026-07-16 Kakao 관리자 가입 묶음은 Edge·웹·Firestore rules까지 운영 배포했다. T126 영상 경로의 기존 관찰 시계(2026-07-23 05:14 KST)는 유지하고, 읽기·퀴즈·T125·T127a~h를 포함한 **최종 T127 7일 시계는 전체 릴리스 완료 시각인 2026-07-16 19:26 KST부터 다시 시작해 2026-07-23 19:26 KST 전에는 닫지 않는다**. 그 전에는 일반 공동체 계정의 보호 필드 호환 상한, roster 직접 진도 writer, legacy `videoAutoConfig.apiKey`를 닫거나 정리하지 않는다.
> 사용자 개입이 필요한 잔여는 T124d 실제 공동체 관리자 소액 판매·수령·환불 스모크뿐이다. 안전한 자격증명·대상 구매 없이 운영 지갑과 불변 ledger를 만들 수 있어 Codex가 임의 실행하지 않는다. T123 shadow 확인용 일회용 계정은 생성·검증 직후 Auth와 모든 문서를 삭제했다.
> T126 운영 관찰 잔여 2건: 오늘 서비스 날짜에 수동 영상 문서가 생길 때 URL·제목·게시일·`autoFilled` 불변 확인, 실제 platformAdmin 계정의 `adminPreviewDailyVideo` 200 확인. 배포 당일에는 오늘 문서가 없어서 자동 fill 문서가 생성됐고 운영 관리자 자격증명을 사용하지 않았으므로 조건부 미검증으로 남긴다.
> 이전 라운드들의 "검증 체크리스트"에 남은 `[ ]`는 배포 후 사용자가 하는 실환경 검증이므로 Codex 대상이 아니다.

1. **활성 라운드의 체크리스트**에서 `[ ]` 상태인 첫 작업을 찾는다. 작업은 번호 순서대로 진행한다 (의존성이 있다).
2. 작업 하나를 끝내면:
   - 체크박스를 `[x]`로 바꾸고,
   - **작업 로그** 표에 한 줄 추가하고 (날짜 / 작업번호 / 변경 파일 / 특이사항),
   - 해당 작업 단위로 git 커밋한다 (`feat:` / `fix:` 접두사, 한글 메시지 가능).
3. `npm run build`가 통과하는 상태로만 커밋한다.
4. 설계에 없는 판단이 필요하거나 설계가 코드 현실과 안 맞으면, **임의로 설계를 바꾸지 말고** "Codex → Claude 메모"에 질문/제안을 남기고, 의존성 없는 다음 작업으로 넘어간다.
5. 세션을 마칠 때(전체 완료가 아니어도) "Codex → Claude 메모"에 현재 상태·다음 작업자에게 할 말을 남긴다.
6. **기본 금지**: `firebase deploy`, `npm run deploy`, `git push`는 사용자가 현재 작업에서 명시적으로 요청한 경우에만 검증 후 실행한다. firestore.rules의 `users` read 규칙 수정(별도 세션 담당)과 `users.password` 평문 필드 제거는 계속 금지한다.

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
export const UNAFFILIATED_CHURCH_NAME = '성경 읽는 사람들';
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
| 2026-07-16 | 누적 11커밋 운영 릴리스·최종 T127 관찰 재시작 | `HANDOFF_CODEX.md` (배포 대상은 `be2c86f`까지 전체 누적 변경) | `main`을 `25b85ad..be2c86f`로 먼저 push한 뒤 `kakao-auth` v6 → `platform-api` v9 → GitHub Pages 웹 → 공개 새 번들 확인 → Firestore rules 순서로 배포했다. Edge 무쓰기 스모크는 Kakao OPTIONS 204/빈 POST 400, platform-api OPTIONS 204/미인증 401/잘못된 origin 403이며 두 함수 모두 ACTIVE다. 공개 웹은 `assets/index-D7l-cYj7.js` HTTP 200이고 로컬과 SHA-256 `ddea1b8ec92d753d433f660bf7950e9880db1ecbe5213c4197439dade2f849ef`가 일치했다. 게스트 첫 화면, 로그인, 공동체 등록 화면의 Kakao·Google·필수 관리자 연락 이메일을 실제 공개 DOM에서 확인했다. Firebase CLI 자격증명 만료로 rules는 로그인된 콘솔 편집기에 로컬 519행을 정확히 대체 입력해 컴파일 후 게시했고, 새 활성 버전 `오늘 • 7:26 오후`, 미게시 변경·저장 오류 없음, 519행 본문을 재로드로 확인했다. 인덱스 변경은 없어 배포하지 않았다. 실제 Kakao OAuth 완료·신규 공동체 생성과 인증된 관리자 화면은 운영 데이터 생성을 피하려고 미실행이다. 최종 T127 7일 관찰은 2026-07-16 19:26 KST부터 2026-07-23 19:26 KST까지다. |
| 2026-07-16 | 가상 공동체 관리자 로딩 복구·카카오 공동체 관리자 가입·운영 연락 수단 | `src/{App.jsx,components/{ChurchAdminView,LoginView,PlatformAdminView}.jsx,hooks/useAuth.js,utils/{kakaoAuth,platformApi}.js,data/servicePolicies.js}`, `supabase/functions/{kakao-auth,platform-api}/*`, `scripts/validate-{church-lifecycle,signup-consent}.mjs`, `HANDOFF_CODEX.md` | `unaffiliated_v1`은 실제 관리자·users가 없는 roster-only 가상 공동체라는 계약에 맞춰 users 조회를 건너뛰고 슈퍼관리자 목록의 관리자 미리보기를 비활성화했다. 관리자 화면의 필수 조회에는 15초 timeout·오류/재시도·항상 종료되는 loading 처리를 추가하고, 상점 구매 같은 선택 조회는 핵심 화면 렌더 뒤로 분리했다. 공동체 최초 등록은 기존 비밀번호·Google에 더해 Kakao OAuth도 지원하며, Kakao Edge가 서명한 provider/Kakao ID와 canonical `kakao:<id>` UID를 platform-api가 검증한 뒤 기존 단일 transaction 가입 action으로 생성한다. 개인 로그인·계정 연결·관리자 가입 redirect 표식은 시작 때 상호 배타적으로 초기화해 중단된 흐름이 다음 시도를 오분류하지 않는다. 모든 신규 관리자는 로그인 공급자와 독립적인 필수 연락 이메일을 제출하고 `churches/{id}/private/admin.adminEmail`에만 저장하며, 슈퍼관리자 교회 목록·상세에서 `mailto:`로 연락할 수 있다. 정책 버전은 `2026-07-16`으로 동기화했다. 전체 `npm run validate`(platform-api 426 tests), 최종 관련 검사·build·diff 검사와 로컬 비로그인 가입 UI 확인을 통과했다. 실제 Kakao OAuth·인증된 슈퍼관리자 화면은 운영 계정/데이터 조작 없이 미검증이며 Edge·웹 배포와 push는 하지 않았다. |
| 2026-07-16 | T112b 관리자 기본 읽기·Google 슈퍼관리자 직행 (사용자 직접 개정) | `src/App.jsx`, `src/hooks/useAuth.js`, `src/components/DashboardView.jsx`, `src/components/dashboard/{ChurchAdminReaderGuide.jsx,index.js}`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | T112 선택 화면을 제거하고 공동체 관리자의 이메일·Google·카카오·기존 회원 로그인은 온보딩 완료 후 모두 성경 읽기 대시보드로 진입하게 했다. 관리 화면 새로고침만 세션 마커로 유지하며 상단 `⚙️ 관리`와 `← 성경 읽기로` 왕복은 보존했다. 읽기 화면 첫 진입 때 계정·안내 버전별 localStorage 키로 한 번만 안내하고 읽기 계속/관리 화면 열기를 고를 수 있다. 첫 화면의 큰 Google 버튼도 인증 uid의 source-server users 역할을 먼저 확인해 churchAdmin은 위 흐름, platformAdmin/superAdmin은 즉시 슈퍼관리자 화면으로 보낸다. 이메일 allowlist는 두지 않았고 전체 관리자 데이터와 uid 확인이 성공한 뒤에만 역할 상태를 열며 실패 시 로그인 상태·관리자 캐시를 비운다. 전체 validate(platform-api 421 tests), build, diff 검사와 변경 범위 독립 재감사(P0~P2 잔여 0)를 통과했고 실 Google 팝업은 운영 계정 조작 없이 미검증이다. 기존 삭제 플랫폼 관리자 rules P1은 별도 규칙 세션 메모로 남겼으며 웹 배포·push는 하지 않았다. |
| 2026-07-16 | T125e-2a/b 신규 관리자 교회 생성·입장코드·무소속 writer 서버 이관 | `supabase/functions/platform-api/{core,index,completeChurchAdminSignupCore,completeChurchAdminSignupService,rotateChurchAccessCodeCore,rotateChurchAccessCodeService,ensureUnaffiliatedChurchCore,ensureUnaffiliatedChurchService}*`, `src/{App.jsx,components/{ChurchAdminView,PlatformAdminView}.jsx,hooks/useAuth.js,utils/platformApi.js}`, `firestore.rules`, `scripts/validate-{church-lifecycle,department-talent,round11,round18,round24,signup-consent}.mjs`, `package.json`, `HANDOFF_CODEX.md` | 신규 공동체·관리자 users·동의·private admin/access·legacy/public 디렉토리·불변 원장을 검증된 token identity와 단일 서버 transaction으로 생성한다. 응답 유실·같은 UID의 동시 UUID·rebuild lease·409를 멱등 수렴시키고 공개 원문 비밀과 브라우저 생성 권한을 제거했다. 입장코드 회전은 서버 SHA-256·version CAS·관리자 소유 증명·비밀 없는 원장을 사용하며, 무소속 점검도 platform/super 전용 원자 action으로 바꿨다. `churches` create/private/directory 직접 write를 닫고 플랫폼 회원 편집의 churchAdmin 소속 이동을 fail-closed했다. 독립 재감사에서 Google 응답 유실, 공개 meta/rebuild 경합, 겹치는 Firestore match의 OR 우회, REST 0/3/6/9자리 timestamp, legacy directory 비밀 재투영, 관리자 편집·입장코드 stale-response 경합까지 보완했다. 의미가 정해지지 않은 기존 부분 삭제는 UI에서 중단했으며 이름 변경은 현행 UI가 없어 정책 질문으로 남겼다. 전체 validate(platform-api 421 tests), build, Deno check/fmt, diff 검사와 독립 재감사를 통과했다. 원격 rules dry-run은 Firebase CLI 자격증명 만료로 실행하지 못했고 Edge·웹·rules 배포와 push는 하지 않았다. |
| 2026-07-16 | T125e-1 교회 검색 노출·T127h 개인 계정 전환 서버 이관 | `supabase/functions/platform-api/{core,index,adminChurchVisibilityCore,adminChurchVisibilityService,convertToPersonalAccountCore,convertToPersonalAccountService}*`, `src/{App.jsx,components/PlatformAdminView.jsx,hooks/{useAuth,useUserAuth}.js,utils/{personalAccountMigration,personalMigrationSteps,platformApi}.js}`, `scripts/validate-{personal-migration,public-directory,roster-multimembership}.mjs`, `HANDOFF_CODEX.md` | 플랫폼 관리자의 교회 숨김/노출을 교회 원본·legacy/public 디렉토리·불변 원장이 한 transaction에 반영되는 서버 action으로 옮겼다. 누락 public 문서도 `exists:false`로 복구하고 비밀 필드는 legacy 투영에서 제거한다. 개인 계정 전환은 새 Auth email claim, users·source church/roster·최대 3개 소속·사용자별 불변 원장을 서버에서 검증하고 원자 전환한다. 전원 초기화로 `talentWalletMigrated:true`인 교회 계정, late positive 잔액, 구 `roster` 단계와 응답 유실 재개를 보존하며 후속 지갑 action까지 source-server로 재확인한다. Auth email 변경 뒤 서버 전환이 실패하고 로컬 상태가 사라져도 실제 pseudo-email과 canonical users가 정확히 일치할 때 로그인·저장 세션에서 대기 상태를 재구성해 다른 기기에서도 수렴한다. 전체 validate(platform-api 354 tests), build, Deno fmt/check, diff 검사와 독립 재감사를 통과했으며 Edge·웹 배포와 push는 하지 않았다. |
| 2026-07-16 | 읽기 흐름 자동 이동 UX | `src/components/{DashboardView,dashboard/{BibleQuizCard,BibleReader}}.jsx`, `src/hooks/useUserBibleActions.js`, `src/utils/readingFlowScroll.js`, `scripts/validate-reading-flow-scroll.mjs`, `package.json`, `HANDOFF_CODEX.md` | 사용자가 현재 퀴즈 클릭으로 정답·2회 소진·건너뛰기 terminal 상태를 서버 원본으로 확정한 뒤 실제 gate가 열리면 두 렌더 프레임을 기다려 `다음 읽기` 버튼으로 이동한다. 첫 오답·오류·초기 완료 복원·문항 없음·오래된 계정/본문 응답은 이동하지 않는다. 새 `uid+requestId` 읽기 완료가 확정되면 파란 `신약 일독 DAY N일` 헤더로 올리고 고정 메뉴 여백과 움직임 감소 설정을 존중한다. 같은 UID에서 DAY/계획이 바뀌는 RAF 경합도 문맥 키로 차단했다. 전용 검사, 전체 validate(platform-api 318 tests), build, 로컬 비로그인 화면 콘솔 검사를 통과했으며 배포·push는 하지 않았다. |
| 2026-07-16 | T127g 혼자 읽기 참여 서버 이관·legacy roster 보정 | `supabase/functions/platform-api/{core,index,joinSoloCommunityCore,joinSoloCommunityService,personalTalentWalletMigrationCore,personalTalentWalletMigrationService}*`, `src/{components/dashboard/CommunityMembershipCard.jsx,hooks/useUserAuth.js,utils/{platformApi,joinSoloCommunityState}.js}`, `scripts/validate-{round24,roster-multimembership}.mjs`, `HANDOFF_CODEX.md` | personal 계정의 `unaffiliated_v1` 직접 roster create를 제거하고 exact 빈 payload·UUID 멱등 서버 action으로 옮겼다. 서버 transaction이 canonical users/roster, 최대 3개 소속, primary, 최소 원장을 검증·생성/복구한다. T97 이전 roster에서 실제 누락(`undefined`)인 `talent`/`extraMemberships`만 0/[]로 보정하고 명시적 손상 값은 거부한다. 로그인과 참여 완료는 action 뒤 source-server 명부를 재확인하며 최신 잔액 재덮어쓰기와 A→B→A 계정 경합을 차단했다. 관련 Deno 45개, 전체 validate(platform-api 318 tests), build와 독립 재감사를 통과했으며 Edge·웹 배포와 push는 하지 않았다. |
| 2026-07-16 | T127c~f 보호 규칙 축소·legacy 지갑/진도/최초 소속 서버 이관 | `firestore.rules`, `supabase/functions/platform-api/{core,index,personalTalentWalletMigrationCore,personalTalentWalletMigrationService,normalizeLegacyReadingPositionService,ownMembershipCore,ownMembershipService}*`, `src/{App.jsx,hooks/{useAuth,useUserAuth,useDepartment,useBibleLogic}.js,components/{ChurchAdminView,DashboardView,PlanSelectionView,dashboard/CommunityMembershipCard}.jsx,utils/{helpers,platformApi,onboardingOrganizations}.js}`, `src/components/modals/SubgroupChangeModal.jsx` 삭제, `scripts/{audit-t127-legacy-state,validate-round18,validate-round24,validate-department-talent,validate-signup-consent}.mjs`, `HANDOFF_CODEX.md` | 본인 삭제 복구·관리자 전체 users/roster 쓰기를 소속/삭제 필드로 축소하고 삭제 감사 UID·서버시각을 강제했다. 개인 users legacy 지갑을 primary roster로 옮기는 exact `{requestId}` action과 primary 누락 무쓰기 복구를 추가하고, 개인의 모든 roster score/talent를 브라우저에서 동결했다. primary roster 및 양수 잔액 roster 브라우저 삭제를 차단하고 사용자·관리자가 최신 잔액을 transaction에서 확인해 안내한다. 신규 관리자/무소속 users create도 canonical 빈 소속·0 잔액·이관 표식을 강제한다. 매 로그인마다 Day>365와 roster drift를 서버 transaction으로 정규화하고 이름 하드코딩 진도 writer를 삭제했다. 최초 플랜·부서·소그룹 저장도 서버 action으로 옮겨 관리자 `onboardingPending` marker, source-server 확인, legacy 조직 schema 정규화, 중복 제출/계정 전환 방어를 적용하고 죽은 소그룹 모달 writer를 제거했다. PII 없는 읽기 전용 운영 감사 스크립트를 추가했다. 전체 `npm run validate`(platform-api 291 tests), build, Deno check/fmt, audit script check, diff 검사와 3개 독립 재감사를 통과했으며 마지막 감사의 P1 4건도 수정했다. Edge·웹·rules 배포와 push는 실행하지 않았고, 일반 공동체 계정과 roster의 구버전 보상/진도 호환 쓰기는 최종 7일 관찰 뒤 닫아야 한다. |
| 2026-07-16 | T127b 업적 동기화 서버 권위 전환 | `supabase/functions/platform-api/{core,index,achievementCore,achievementSyncService}*`, `src/{hooks/{useUserBibleActions,useMemos}.js,utils/platformApi.js}`, `scripts/validate-{round15,round24}.mjs`, `HANDOFF_CODEX.md` | exact `{requestId,trigger}`만 받는 비익명 `syncAchievements`를 추가해 14개 업적을 users 서버 저장 상태로 판정한다. 기존 unknown ID는 보존·중복 제거하고 신규 ID는 canonical 순서로 merge하며, 실제 신규 업적이 있을 때만 users 배열과 최소 schema1 원장을 한 transaction에 기록한다. strict replay, 손상 상태·원장·응답 fail-closed, 409 최대 3회 재시도, apply-then-409 복구를 검증했다. 읽기·메모의 브라우저 업적 transaction을 제거하고 source-server 최종 상태에서만 UI를 확정하며, 메모 저장 성공과 후속 업적 실패를 분리해 재시도 중복 append를 막았다. 계정 전환·재시작·지연 toast 세대 guard를 추가했고 재시작 응답 유실 때도 요청 시작부터 이전 epoch toast를 폐기하며 exact replay도 완료·보너스 UI를 정리한다. 전체 `npm run validate`(platform-api 238 tests), build, Deno check/fmt, diff 검사를 통과했다. 독립 재감사 P1/P2/P3 잔여 0건이다. Edge·웹 배포와 push는 실행하지 않았다. |
| 2026-07-16 | T127a 읽기 Day 1 재시작 서버 권위 전환 | `supabase/functions/platform-api/{core,index,restartReadingService,readCompletionService,quizCore,quizSubmission}*`, `src/{hooks/{useBibleLogic,useUserBibleActions}.js,components/{DashboardView,dashboard/BibleQuizCard,modals/{DateSettingsModal,RestartConfirmModal}}.jsx,utils/{helpers,platformApi,quizProgress,roster,rosterSnapshot,userActivityRequests,userStateSync}.js}`, `scripts/validate-{department-talent,round15,round18,round24}.mjs`, `HANDOFF_CODEX.md` | `restartReading({cycle,day,readingEpoch,requestId})`이 users·최대 3개 canonical roster·불변 `activityActions` 원장을 한 transaction에서 처리한다. `readCount`와 달란트·묵상·과거 기록·최고 연속·최근 읽기일·당일 읽기/퀴즈 보상 표식은 보존하고 현재 Day·점수·연속·업적·날짜 offset·legacy 퀴즈 활성 상태만 초기화한다. 미완독을 완독으로 오표시하지 않도록 `readCount`는 유지하고 `readingEpoch`만 증가시키며, completeRead와 `eN_rC_dD` 퀴즈 키/의미 원장을 epoch에 결속해 재시작 전 탭과 나중에 같은 Day에 도달한 과거 원장을 모두 무쓰기 거부한다. UID별 pending UUID 복구, strict 2xx, 위치 불일치 최신 상태, 중복 제출/계정 전환·지연 응답 방어와 실제 모달 진입점을 추가했다. 결정적 응답 뒤 canonical roster 경로를 `source:'server'`로 찾고 users·모든 roster 값을 같은 read-only transaction snapshot에서 읽으며, 전후 경로 집합이 바뀌면 최대 3회 뒤 fail-closed한다. 상태와 랭킹 세대 guard도 적용했다. legacy 당일 읽기·퀴즈 완료 흔적이 오래되거나 누락된 신규 guard보다 우선하도록 복구하고 `recentReadDates`의 legacy·ISO 혼합 저장도 원문 보존해 재시작 당일 중복 보상을 차단했다. 전체 `npm run validate`(platform-api 222 tests), build, Deno check/fmt, diff 검사를 통과했다. Edge·웹 배포와 push는 실행하지 않았다. |
| 2026-07-16 | T125d `publicChurches` 안전 백필 기반 | `supabase/functions/{_shared/firestore*,platform-api/{core,index,publicDirectoryService}*}`, `src/{utils/{churchDirectory,platformApi}.js,components/{PlatformAdminView,ChurchAdminView}.jsx}`, `firestore.rules`, `scripts/validate-{round18,round24,public-directory}.mjs`, `package.json`, `HANDOFF_CODEX.md` | platformAdmin/superAdmin 전용 `rebuildPublicChurches({dryRun})`을 추가했다. 레거시 문서 updateTime을 원본 스캔보다 먼저 잡고 10분 service-only owner lease, batch별 소유권 transaction, 레거시 precondition, 마지막 meta+lock 원자 처리를 적용해 직접 writer·중복 실행·만료 인수·응답 유실 경합을 안전 실패시킨다. 공개 문서는 정확한 `{id,name,hidden?}`만 쓰고 무소속·삭제 교회를 제외한다. 클라이언트는 `ready:true/mode:public/schemaVersion:1/count`와 문서 exact schema가 모두 맞을 때만 새 컬렉션을 사용하며 아니면 기존 디렉토리로 복귀한다. 이번 단계는 의도적으로 meta `mode:legacy`만 기록한다. 전체 `npm run validate`(platform-api 191 tests), build, 규칙 dry-run 컴파일, diff 검사와 독립 재검토(P1/P2/P3 없음)를 통과했다. 운영 백필·배포·push는 실행하지 않았다. |
| 2026-07-16 | T123b~d3 읽기·퀴즈 서버 권위 전환 | `supabase/functions/{_shared/firestore*,platform-api/{core,index,readCompletionService,quizSubmission,talentProgramCore}*}`, `src/{hooks/useUserBibleActions.js,components/dashboard/BibleQuizCard.jsx,utils/{platformApi,userActivityRequests,talentWallet}.js}`, `firestore.rules`, `scripts/validate-{round15,round18,round24,department-talent}.mjs`, `HANDOFF_CODEX.md` | 일회용 실제 로그인 계정으로 `[read-shadow]`와 `[quiz-shadow]`의 `match:true`를 각각 확인하고 Auth/users/private/history를 완전 삭제했다. 읽기·퀴즈 제출·오늘 건너뛰기를 UUID 멱등 ledger 기반 서버 transaction으로 전환해 브라우저 직접 보상·진도·지갑 쓰기와 실패 폴백을 제거했다. users·최대 3개 canonical roster·history·platformStats를 원자 처리한다. 퀴즈는 요청 UUID ledger와 별도로 진도별 1차·2차·건너뛰기 의미 원장을 같은 transaction에 생성해 여러 탭의 서로 다른 UUID도 한 시도만 소비하고, 최신 terminal 원장으로 marker/progress 삭제·과거 요청 replay를 복구한다. strict 2xx 검증, 결과 불명 requestId 보존, 제출 계정 UID 결속, canonical 명부 복구, PII 없는 action 로그를 적용했다. 전체 `npm run validate`(platform-api 175 tests), build, Deno check/fmt, diff 검사와 독립 보안·클라이언트 검토를 통과했다. Edge·웹·rules 배포와 push는 하지 않았으므로 최종 7일 관찰은 배포 뒤 새로 시작해야 한다. |
| 2026-07-16 | T126e 매일 영상 운영 배포·검증 | `HANDOFF_CODEX.md` 및 운영 환경 | `YOUTUBE_API_KEY` secret 이름을 확인하고 전체 validate(platform-api 134 tests)·build·diff를 재통과한 뒤 platform-api Edge v8 → GitHub Pages 웹 순서로 배포했다. OPTIONS 204, 미인증 401, 잘못된 origin 403. 서비스 날짜 `2026-07-16` 문서가 없던 상태에서 익명 동시 2요청 중 한 요청만 성인·어린이 영상을 저장하고 다른 요청은 약 90초 `pending+retryAfterMs`를 받아 lease 중복 방지를 확인했다. 임시 비익명 로그인도 200/full이고 저장 영상 URL·제목·게시일 보호 필드가 재호출 전후 같았으며 테스트 계정은 즉시 삭제했다. 공개 HTML은 `index-DmqfwdoF.js`·`index-DS2sg2XL.css`를 참조하고 관리자 자산 2개도 200, main 자산은 로컬과 SHA-256 일치. 공개 게스트 화면에서 성인·어린이의 서로 다른 미리보기와 콘솔 오류 0을 확인했다. 오늘 수동 문서 불변과 실 platformAdmin 미리보기는 조건부 미검증으로 운영 관찰에 남겼고 rules는 배포하지 않았다. |
| 2026-07-15 | T126d 매일 영상 관리자 화면 서버 전환 | `supabase/functions/platform-api/{core,index,dailyVideoResolve}*`, `src/{components/PlatformAdminView.jsx,utils/platformApi.js}`, `src/utils/adminDailyVideoPreview.js` 삭제, `scripts/validate-{round18,round24,daily-video-server}.mjs`, `HANDOFF_CODEX.md` | platformAdmin/superAdmin만 현재 폼의 playlist ID를 무쓰기 `adminPreviewDailyVideo`에 전달하고, 서버 KST 기준일·`YOUTUBE_API_KEY` secret 우선/Firestore 키 한시 fallback으로 모드별 미리보기를 조회한다. 날짜 없음·YouTube 실패·timeout은 해당 모드 null로 격리하며 응답은 serviceDate와 공개 adult/kids entry만 반환한다. 관리자 UI의 API 키 state·입력·저장과 브라우저 YouTube helper를 제거했고 수동 등록·삭제 직접 쓰기는 유지했다. 전체 validate(platform-api 134 tests), build/fmt/check/diff와 독립 재감사 통과. 단계적 이관 설계상 기존 `videoAutoConfig.apiKey`와 signed-in read 규칙은 T127 정리·회전 전까지 남아 브라우저 네트워크 노출이 계속되므로 보호 완료로 간주하면 안 된다. `firestore.rules` 변경·배포·push 없음. |
| 2026-07-15 | T126c 매일 영상 일반 클라이언트 서버 전환 | `src/components/{dashboard/DailyVideoCard.jsx,PlatformAdminView.jsx}`, `src/utils/{platformApi,dailyVideoClient,adminDailyVideoPreview}.js`, `scripts/validate-{round18,round24,daily-video-server}.mjs`, `HANDOFF_CODEX.md` | 일반 영상 카드는 Firestore authoritative snapshot/cache 우선 표시 후 인증된 `resolveDailyVideo`만 호출하며, 브라우저 YouTube 호출·`videoAutoConfig` 읽기·`dailyVideos` 쓰기를 제거했다. 날짜별 서버 최소 재시각을 세션에 보존하고 2/5/15/30분 뒤 시간당 재시도, 45분 TTL 타이머·포커스 재검사, 서비스 날짜 이월, 수동 authority 우선, 요청 중 snapshot 세대 fence를 적용했다. 늦은 자체 write와 metadata 경합에서도 중복 resolve나 TTL 갱신 유실이 없도록 보강했다. 관리자 연결 테스트의 레거시 브라우저 helper는 T126d 전환 전까지만 별도 파일로 격리했다. platform-api 129 tests를 포함한 전체 validate, build/diff, 독립 재감사 통과. `firestore.rules` 변경·배포·push 없음. |
| 2026-07-15 | T126b chapters·기도제목 서버 TTL 갱신 | `supabase/functions/platform-api/{dailyVideoCore,dailyVideoResolve}*`, `supabase/functions/_shared/firestore_test.ts`, `scripts/validate-daily-video-server.mjs`, `HANDOFF_CODEX.md` | 저장된 수동·자동 영상 설명란을 45분 TTL과 공용 fill/refresh lease로 갱신한다. refresh는 videos API만 호출하고 성공 모드의 nested chapters만 masked patch하며 전체 성공 때만 `chaptersRefreshedAt`을 전진시킨다. 실패·부분 성공은 기존 값을 보존하고 독립 backoff를 적용한다. 미래 updatedAt 반복 호출, 엄격 URL 정규화 우회, 추출 불가 모드 false-success, fill 중 daily 삭제 재생성을 세대 fence와 회귀 테스트로 차단했다. 실제 Firestore nested mask 직렬화도 동적 검사했다. platform-api 129 tests, 전체 validate/build/fmt/diff, 독립 재감사 통과. `firestore.rules` 변경·배포·push 없음. |
| 2026-07-15 | T126a 매일 영상 서버 resolve·lease | `supabase/functions/platform-api/{core,index,dailyVideoCore,dailyVideoResolve}*`, `src/utils/{dailyVideoChapters,helpers}.js`, `scripts/{fixtures/daily-video-contract.json,validate-daily-video-server.mjs,validate-round18.mjs,validate-round24.mjs}`, `package.json`, `HANDOFF_CODEX.md` | Firebase token을 필수로 하고 resolve 전용 분기에서만 익명 사용자를 허용한다. 서버 KST 03시 기준일, 90초 lease, 2/5/15/30분 뒤 시간당 backoff, requestId·설정 updateTime·attempt 세대 fence, secret 우선/Firestore 키 한시 fallback, 설정 모드 full-ready만 원자 저장을 구현했다. YouTube 전체 호출은 lease보다 짧은 60초 deadline과 공용 AbortSignal을 쓰며 videos exact id·snippet·title·날짜를 재검증한다. 수동 문서는 0 write/0 fetch이고 partial·잘못된 playlist는 저장하지 않는다. 공유 fixture 35건, resolver 12건을 포함한 platform-api 113 tests, 전체 validate/build/diff 검사와 독립 재감사를 통과했다. `firestore.rules` 변경·배포·push 없음. 배포 전 M-V1 secret 설정 필요. |
| 2026-07-15 | T124 운영 배포·비로그인 안전 스모크 | `HANDOFF_CODEX.md` 및 운영 환경 | `0ab5534`를 main에 push하고 platform-api Edge → GitHub Pages 웹 → Firestore rules 순서로 배포했다(인덱스 변경 없음). 공개 HTML이 새 `index-BbzYXMgP.js`를 참조하고 `ChurchAdminView-DiwG0dU7.js`, `PlatformAdminView-uD22aBC1.js`도 HTTP 200임을 확인했다. Edge는 허용 origin OPTIONS 204·유효 형식 미인증 관리자 요청 401, 서비스 전용 `talentAdminActions` Firestore REST 비로그인 읽기는 403이다. Firebase rules는 재로그인 뒤 컴파일·릴리스 성공. 실제 관리자 소액 판매·수령·환불 스모크는 운영 데이터 변경과 계정 선택이 필요해 T124d 미완료로 유지한다. |
| 2026-07-15 | T124 관리자 판매·수령·환불 서버 이관 구현 | `supabase/functions/{_shared,platform-api}/*`, `src/{components/{ChurchAdminView,PlatformAdminView}.jsx,components/{churchAdmin/TalentShopTab.jsx,dashboard/TalentShop.jsx},utils/{platformApi,adminTalentRequests,talentPurchases}.js}`, `firestore.rules`, `scripts/validate-{round18,round24,department-talent}.mjs`, `package.json`, `HANDOFF_CODEX.md` | 일반 구매와 관리자 판매·수령·환불을 서버 저장 가격·최신 지갑·최신 관리자 권한으로 재검증하고 원자 처리한다. 관리자 action은 서비스 전용 불변 ledger로 멱등화하고, 개인 계정 전환 환불은 서버가 같은 transaction에서 users+동일 공동체 roster를 재확인한 뒤 관리자 2차 확인을 요구한다. 잘못된 2xx·응답 유실·현재 잔액·세션 requestId 정리까지 보강했다. 전체 validate(플랫폼 API 90 tests/check/fmt 포함), build, diff 검사와 3개 독립 재감사 통과. 운영 배포·실로그인 스모크는 다음 단계다. |
| 2026-07-15 | R25~26 운영 배포·입장코드 원자 이전 | `HANDOFF_CODEX.md` 및 운영 환경 | `dd7374f`까지 main push. `JOIN_CODE_RATE_LIMIT_SALT` 설정 후 platform-api v5 → Firestore 인덱스 → 웹 `index-OCMsjSZz.js` → Firestore rules 순서로 배포하고 Edge/공개/인증 화면 스모크를 통과했다. 0600 백업과 SHA-256을 만든 뒤 transaction 스냅샷·백업 원본·정확한 18쓰기 게이트를 두 번 독립 검토하고, 8 private 백필+9 공개 필드 정리+디렉토리 정리를 단일 원자 커밋했다. 직후와 3분 뒤 재감사에서 공개 code/hash 0, 디렉토리 비밀 0, private 유효 8/8, 누락 0을 확인했다. 개발 환경 실로그인 shadow는 로컬 세션이 없어 남음. |
| 2026-07-15 | T125 운영 이전 안전 보강 | `src/{utils/{entryCode,churchDirectory}.js,components/{LoginView,ChurchAdminView,PlatformAdminView}.jsx,components/churchAdmin/SettingsTab.jsx}`, `scripts/{audit-legacy-church-fields,validate-round11}.mjs`, `supabase/functions/platform-api/*`, `HANDOFF_CODEX.md` | 입장코드를 앞뒤 공백 제거 후 4~128자·제어문자 없음으로 통일하고, 이전 도구를 기본 무쓰기 사전점검으로 바꿨다. 실행 직전 재점검, private/access 최신값 보존 transaction, 전체 공개·디렉토리 비밀 필드 정리, 무소속 잔여 필드 정리, 동시 디렉토리 변경 보존을 추가했다. 운영 전체 원본을 값 출력 없이 0600 로컬 파일로 백업하는 감사 옵션과 회귀 계약을 추가했다. 자동 검증·재검토는 통과했고, secret 설정·배포·백업·실제 이전은 다음 단계다. |
| 2026-07-15 | T123 v2 달란트 shadow 로컬 준비 | `supabase/functions/platform-api/{index,readCore,quizCore,talentProgramCore}*`, `src/{hooks/useUserBibleActions.js,components/dashboard/BibleQuizCard.jsx,utils/readCompletionShadow.js}`, `scripts/validate-round24.mjs`, `HANDOFF_CODEX.md` | 브라우저와 같은 v1/v2 달란트 해석, canonical roster 검증·정렬, 지갑별 적립 가능 여부를 서버 preview에 연결했다. 읽기·퀴즈는 v2에서도 DEV 4초 shadow를 실행하고 실제 적립 가능한 지갑이 없으면 effective reward 0으로 비교한다. 시도 0인 stale quizKey 교체 예외와 preview 응답 식별자·조직·경로·잔액·설정 금지 계약을 추가했다. 로컬 자동 검증은 완료했으나 실제 로그인 match 증거가 없어 T123b/d2는 미완료 유지. |
| 2026-07-15 | T125 공개 입장코드 보안 전환 구현 | `supabase/functions/platform-api/{core,index,joinSecurityCore}*`, `src/{hooks/useAuth.js,components/{ChurchAdminView,PlatformAdminView}.jsx,components/dashboard/CommunityMembershipCard.jsx,utils/{platformApi,churchDirectory}.js}`, `scripts/validate-{round11,round24,signup-consent}.mjs`, `HANDOFF_CODEX.md` | 5분 참여권, 같은 요청만 허용하는 일회용 소비, 목적 통합 10회/시간·교회 전체 200회/시간 제한, 동일 오류 응답을 구현했다. 신규·변경 코드는 private/access에만 원자 저장하고 운영 공개 해시·평문을 백필/삭제하는 관리자 도구를 추가했다. 전체 validate/build, Deno 53 tests/check/fmt, diff 검사 통과. 운영 secret 설정·배포·이전 실행은 대기. |
| 2026-07-14 | 배포·push 지침 변경 및 운영 반영 | `AGENTS.md`, `HANDOFF_CODEX.md` | 사용자 명시 지시가 있으면 Codex가 push·배포·공개 검증까지 수행하도록 절대 금지를 조건부 허용으로 변경. `04d8d2f`를 main에 push하고 GitHub Pages `Published`, Firestore rules 컴파일·릴리스 완료. 공개 사이트가 새 번들 `index-B-T0nHlS.js`와 HTTP 200을 제공함을 확인. |
| 2026-07-14 | 공동체 다중 소그룹·부서별 달란트 운영 | `src/{App.jsx,components/ChurchAdminView.jsx,components/DashboardView.jsx,components/churchAdmin/TalentShopTab.jsx,components/dashboard/{BibleQuizCard,BibleReader,CommunityMembershipCard,TalentShop}.jsx,hooks/useUserBibleActions.js,utils/{memberships,rosterMembers,rosterSnapshot,talentProgram,talentProgramStore}.js}`, `firestore.rules`, `scripts/validate-{roster-multimembership,department-talent}.mjs`, `scripts/validate-round{18,24}.mjs`, `package.json`, `HANDOFF_CODEX.md` | 직접 회원과 외부 roster 회원 모두 주 소속+추가 3개까지 배정. 부서별 달란트 사용 여부와 통합/전용 시장을 설정하고 공동체 지갑 하나는 유지. 달란트 미사용 부서도 읽기 진도·점수는 정상 반영하되 읽기·퀴즈 달란트와 상점만 제외. 구매에 부서·시장·지갑 snapshot을 기록해 이후 소속 변경 뒤 환불도 원래 지갑으로 복원. 전체 validate/build/diff와 로컬 게스트 렌더·브라우저 오류 0 통과. 인증 관리자 저장·실회원 보상/구매는 운영 데이터 변경 없이 미검증. rules 배포 전에는 roster 추가 소속 권한 강화가 운영에 반영되지 않음. |
| 2026-07-14 | 회원가입 필수 동의·어린이 보호자 절차 | `src/{components/LoginView.jsx,components/SocialOnboardingView.jsx,components/policies/*,data/servicePolicies.js,hooks/useAuth.js,utils/signupConsent*.js}`, `scripts/validate-{service-policies,signup-consent}.mjs`, `scripts/validate-round11.mjs`, `package.json`, `HANDOFF_CODEX.md` | 회원·개인·소셜·공동체 관리자 신규 가입에 약관·개인정보·민감정보·공동체 운영정책 동의를 필수화하고 버전·시각을 private consent 문서에 기록. 만 14세 미만은 보호자 성명·관계·직접 동의가 없으면 진행 불가, 성인은 보호자 입력 미노출. 공동체 등록에는 복음주의 기준과 주요 교단 공식 결의의 이단·사이비 제한을 명시하고 통지·소명 기준을 정책 전문에 포함. 전체 validate/build/diff 및 로컬 브라우저 성인·아동·관리자 화면·정책 전문·오류 로그 검수 통과. 실제 계정 생성은 하지 않음. |
| 2026-07-14 | 활동 공동체 전체 화면 전환 | `src/{App.jsx,hooks/useBibleLogic.js,hooks/useDepartment.js,components/DashboardView.jsx,components/dashboard/CommunityMembershipCard.jsx,components/modals/RankingModal.jsx}`, `scripts/validate-round{11,18}.mjs`, `HANDOFF_CODEX.md` | 공동체별 별도 순위 미리보기를 제거하고 카드 전체 클릭을 세션 활동 공간 전환에 연결. 기본 공동체는 로그인 기본값·탈퇴 보호로만 유지. 선택 공동체 기준으로 이름·구성원·조직·공지·카카오·지도·랭킹·달란트·상점을 다시 로드하고 본문·진도·퀴즈·묵상은 공통 유지. 빠른 전환 stale 응답과 이전 카카오 링크 잔존 방어. 전체 validate/build/diff 통과. 로컬 브라우저는 게스트·로그아웃 세션뿐이라 실제 다중 공동체 계정 클릭은 배포 전 사용자 확인 필요. |
| 2026-07-14 | 네이버·Google 앱 TTS 안내 | `src/utils/ttsAvailability.js`, `src/hooks/useTTS.js`, `src/{App.jsx,components/DashboardView.jsx,components/GuestReaderView.jsx,components/dashboard/BibleReader.jsx}`, `scripts/validate-round15.mjs`, `HANDOFF_CODEX.md` | NAVER·Google 앱(GSA)에서는 TTS 컨트롤 대신 작은 안내문을 표시하고 본문 탭 낭독도 비활성화. 일반 Chrome·Safari TTS와 카카오 기존 안내는 유지. 안내 대상 WebView의 불완전한 음성 API 접근을 생략. Naver/GSA/Chrome/Safari/Kakao/Googlebot UA 계약, 회원·게스트 연결, 빌드·diff 검사 통과. 실기기 앱 화면은 배포 후 확인 필요. |
| 2026-07-14 | T123d2 퀴즈 shadow API·비교 장치 | `supabase/functions/platform-api/{core,index}*`, `src/utils/{platformApi,quizSubmissionShadow}.js`, `src/components/dashboard/BibleQuizCard.jsx`, `scripts/validate-round24.mjs`, `HANDOFF_CODEX.md` | `previewQuizSubmission`이 서버 정답 인덱스로 위치·Day·문항·정답·보상을 계산하되 쓰기는 하지 않음. 응답에서 answerIndex·원본 index·잔액·조직정보 제외. 앱은 개발 환경에서만 기존 transaction 전에 최대 4초 호출하고 성공 결과만 실제 값 없이 비교. 통합 리뷰에서 거대 cycle의 앱/서버 검증 차이를 safe integer 제한으로 통일. Deno 40 tests/check/fmt, 전체 validate/build/diff 통과. Edge 배포 후 OPTIONS 204·미인증 401·입력 오류 400·잘못된 origin 403·잘못된 token 401·기존 읽기 보호 401 확인. 실제 로그인 `[quiz-shadow] match:true`는 남음. |
| 2026-07-14 | T123d1 퀴즈 서버 정답 인덱스·순수 계산 기반 | `src/utils/{quizShuffle,quizEngine}.js`, `scripts/generate-quiz-answer-index.mjs`, `supabase/functions/platform-api/{quiz-answer-index.json,quizCore.ts,quizCore_test.ts}`, `scripts/validate-round24.mjs`, `package.json`, `HANDOFF_CODEX.md` | 앱과 생성기가 동일한 결정적 선택지 섞기를 사용. 표시 정답 위치와 허용 Day 인덱스 6,657개(표준 4,719·쉬움 1,825·레거시 113)를 생성하고 byte-for-byte 최신성 검사를 전체 validate에 포함. 서버 순수 함수가 현재/방금 완료 위치, 계획·Day, 저장 문항 고정, 2회 시도, 당일 1회 보상을 검증. 통합 리뷰에서 1차 오답 후 같은 Day 다른 문항으로 교체 가능한 틈을 찾아 차단. Deno 전체 38 tests/check/fmt, 전체 validate, quiz/nt-easy, build, diff 통과. 쓰기/API 연결 없음. 인덱스 생성 중 일년일독 일정의 예레미야 30~32장 누락 발견(별도 판단 필요). |
| 2026-07-14 | T123b 로그인 사용자 shadow 비교 장치 | `src/hooks/useUserBibleActions.js`, `src/utils/readCompletionShadow.js`, `scripts/validate-round24.mjs`, `HANDOFF_CODEX.md` | 개발 환경에서만 기존 transaction 전에 읽기 서버 미리보기를 최대 4초 기다리고, 성공했을 때만 기존 결과와 비교. 로그는 일치 여부·상태·불일치 필드명·회독/Day만 남기며 실제 점수·달란트·사용자 상태는 제외. 미리보기/비교 실패는 기존 읽기를 막지 않고 운영 빌드에서는 호출·로그 없음. 전체 validate/build/diff 통과. 앱 안 브라우저는 게스트, Chrome 기존 로컬 탭 2개는 로그아웃 상태라 기록을 변경하는 완료 클릭 없이 종료했으며 실제 로그인 200·일치 로그 확인은 남음. |
| 2026-07-14 | T123a 읽기 완료 서버 계산 shadow | `supabase/functions/_shared/{time,firestore}*`, `supabase/functions/platform-api/{readCore,core,index}*`, `src/utils/platformApi.js`, `scripts/validate-round24.mjs`, `HANDOFF_CODEX.md` | 읽기 보상·진행·연속일·개인 지갑을 순수 함수로 계산하고 `previewReadCompletion`으로 읽기 전용 제공. 읽기 날짜는 영상의 오전 3시 기준과 분리해 KST 자정 기준 유지. collectionGroup roster 조회도 읽기만 수행하며 응답에서 조직 ID·잔액·문서 경로를 제외. Deno 28 tests/type/fmt, 전체 validate/build/diff 통과. Edge 재배포 후 OPTIONS 204·미인증 401·입력 오류 400·잘못된 origin 403·잘못된 token 401 확인. 실제 로그인 200 및 기존 계산 비교는 T123b에서 수행. |
| 2026-07-14 | T122 공통 서버 기반 + shadow API | `supabase/functions/_shared/*`, `supabase/functions/platform-api/*`, `src/utils/platformApi.js`, `src/data/constants.js`, `.env.example`, `scripts/validate-round24.mjs`, `package.json`, `HANDOFF_CODEX.md` | 하위 모델 3개가 서버 공통 모듈, preflight 전용 API, 클라이언트 브리지를 분리 구현하고 Codex가 통합 보안 리뷰. UUID 폴백·오류 내부정보 차단·역할 정규화 보강. Deno 15 tests, type/fmt, 전체 validate, 기존/쉬운 퀴즈, build, diff 검사 통과. `platform-api --no-verify-jwt` Edge 배포 후 OPTIONS 204·미인증/잘못된 토큰 401·잘못된 origin 403 확인. Firestore write 없음. |
| 2026-07-14 | 라운드 23·긴급 수정 운영 배포 | `HANDOFF_CODEX.md` | 사용자 지시로 기존 금지 게이트 해제. `24a311e` main push, Firestore rules 컴파일·배포, `npm run deploy` Published 완료. 공개 주소 HTTP 200, 캐시 우회 HTML과 새 JS `index-C3RZWRw9.js` HTTP 200 확인. T122 착수 게이트 해제. |
| 2026-07-14 | 라운드 24 설계 + 중복 환불 긴급 차단 | `HANDOFF_CODEX.md`, `src/components/ChurchAdminView.jsx`, `firestore.rules`, `scripts/validate-round18.mjs` | 하위 모델 3개가 보상/상점, 가입/디렉토리/통계, 매일 영상을 독립 감사하고 Codex가 교차 설계. 기존 Supabase Edge 기반의 T122~T127 무중단 서버 권위 이관안을 확정. 감사 중 발견한 pending 구매의 중복 취소·환불과 잘못된 상태 역전은 즉시 transaction 최신 상태 검사 + rules `pending → delivered/cancelled` 전이 제한으로 차단. 계약 검사·빌드·diff 검사 통과. |
| 2026-07-14 | T121 신약 쉬운 퀴즈 최종 확정 | `review/nt_easy_quiz_candidates_*.json`, `src/data/quizNtEasy/*.json`, `HANDOFF_CODEX.md` | 사용자 표본 검수 후 최종 승인. 승격 전 후보 검사 365일·1,825문항 오류/경고 0, 앱 데이터 재승격 및 `reviewStatus` 제거 확인. 전체 validate·기존 퀴즈·쉬운 퀴즈·프로덕션 빌드·diff 검사 통과. 저장소 규칙에 따라 커밋·배포·push는 실행하지 않음. |
| 2026-07-14 | T120 보완 — 어린이 영상과 쉬운 퀴즈 연결 안내 | `src/components/dashboard/DailyVideoCard.jsx`, `src/components/dashboard/BibleQuizCard.jsx`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 신약일독에서 어린이 영상을 선택하면 로그인/게스트 모두 quizLevel을 `easy`로 함께 저장·반영. 퀴즈 토글 아래에 “어린이 영상을 선택하면 쉬운 퀴즈로 자동 변경돼요.” 안내 추가. 성인 영상 선택은 사용자의 명시 난이도를 덮어쓰지 않음. 계약·빌드·diff 검사 통과. |
| 2026-07-14 | T120 신약 퀴즈 난이도 토글 | `src/components/dashboard/BibleQuizCard.jsx`, `src/components/GuestReaderView.jsx`, `src/components/dashboard/index.js`, `src/utils/{quizProgress,guestStorage,helpers}.js`, `src/hooks/useUserAuth.js`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 신약일독에만 `[표준｜쉬움]` 토글 노출. 로그인 사용자는 users quizLevel merge, 게스트는 로컬 저장. 스마트 기본값·완료 후 내일부터 적용 안내 추가. 375px 실제 QA에서 넘침 0, 게스트 새로고침 유지, 오류 0. QA 중 회독 1·2 동일 문항 충돌을 발견해 연속 회독 중복 보정 후 다른 문항 확인. |
| 2026-07-14 | T119 신약 쉬운 문제 출제 경로 | `src/utils/quizEngine.js`, `src/utils/quizProgress.js`, `src/components/dashboard/BibleQuizCard.jsx`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 실제 Day가 속한 쉬운 문제 샤드 하나만 지연 로드, 회독+Day 시드로 1문항 선택, `ntEasy-Day-번호` 키 복원·선택지 결정 셔플 구현. 로드 실패/빈 풀은 표준 문제로 폴백. 빌드에서 3개 별도 청크 생성, 계약·diff 검사 통과. |
| 2026-07-14 | T118 신약 쉬운 퀴즈 데이터 승격 | `scripts/promote-nt-easy.mjs`, `src/data/quizNtEasy/*.json`, `src/data/schedules.js`, `package.json`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 후보 검증 성공 뒤에만 `reviewStatus`를 제거해 3개 앱 샤드로 원자적 승격하는 명령 추가. 365일·1,825문항 생성, `nt_easy`·`nt_message` NT 일정 별칭 보완. 빌드·계약·diff 검사 통과. |
| 2026-07-14 | T117 상점 공동체 임시 전환 | `src/App.jsx`, `src/components/dashboard/TalentShop.jsx`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 개인 계정이 상점에서 공동체를 골라도 `primaryOrgId`를 쓰지 않고 메모리 상태만 전환하도록 수정. 선택 공동체의 상품·잔액·구매 지갑을 사용하며, 기준 변경 성공 시 임시 보기는 해제. 안내 문구·회귀 계약 추가, 전체 검증 4종과 빌드 통과. 실계정 구매·새로고침 확인은 테스트 자격증명/배포 후 필요. |
| 2026-07-14 | T116 내 단체 관리 순위 진입점 | `src/components/dashboard/CommunityMembershipCard.jsx`, `src/components/DashboardView.jsx`, `HANDOFF_CODEX.md` | 내 단체 관리의 모든 소속 행에 `🏆 순위` 버튼 추가, 선택 공동체 보기 전용 랭킹 모달 연결. prop 미전달 위치에는 버튼 미노출, 모바일 행 줄바꿈 허용. 빌드·diff 검사 통과. |
| 2026-07-14 | T115 공동체 랭킹 모달 UI | `src/components/modals/RankingModal.jsx`, `HANDOFF_CODEX.md` | 공동체 탭·선택 제목·로딩·오류 재시도·선택 공동체 내 소그룹 강조 추가. 소그룹 데이터가 없고 멤버만 있으면 누적 읽기 평면 랭킹 표시. 빌드·diff 검사 통과. |
| 2026-07-14 | T114 보기 전용 공동체 랭킹 상태 | `src/components/DashboardView.jsx`, `HANDOFF_CODEX.md` | 개인 계정 다중 소속의 공동체 탭·선택 조회·랭킹 파생값·내 소속 하이라이트 컨텍스트 추가. 모달 닫기/사용자 전환 시 초기화, 요청 경합 방지. `primaryOrgId` 및 지갑·공지 컨텍스트 쓰기 없음. 빌드·diff 검사 통과. |
| 2026-07-14 | T113 공동체별 랭킹 데이터 로더 | `src/hooks/useDepartment.js`, `src/App.jsx`, `HANDOFF_CODEX.md` | `loadAllMembers(orgIdOverride)` 추가, 무인자 기존 동작·무소속 가드·`password == null` 필터 유지. 공동체 멤버+조직 구성을 병렬 조회하는 `loadOrgRankingData`를 DashboardView에 전달. 빌드 통과. |
| 2026-07-14 | 퀴즈 미완료 상태의 추가 읽기 잠금 해제 | `src/components/dashboard/BibleReader.jsx`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 오늘 첫 읽기 뒤 다음 DAY의 `한 장 더 읽기`가 새 DAY 퀴즈 잠금에 가로막히던 문제 수정. 오늘 첫 읽기의 퀴즈 선행 조건은 유지하고 추가 읽기만 퀴즈 없이 허용. 전체 계약 검사·빌드·diff 검사 통과. |
| 2026-07-14 | 신약일독 초신자·어린이용 쉬운 퀴즈 검수 후보 | `review/nt_easy_quiz_candidates_*.json`, `review/NT_EASY_QUIZ_*`, `review/nt_easy_audit_*.md`, `scripts/{validate-nt-easy-candidates,build-nt-easy-review}.mjs`, `package.json`, `HANDOFF_CODEX.md` | 하위 모델이 Day 1~365, 하루 5문항(총 1,825문항)을 별도 후보로 재출제하고 작성 비참여 모델이 교차검수했다. 잔여 지적 재수정·재확인 후 오류/경고 0. 기존 서비스 문제는 미교체, 앱 미연결. **사용자 최종 검수 필요.** |
| 2026-07-14 | 매일 영상 설명란 구간 실시간 반영 | `src/utils/helpers.js`, `src/components/dashboard/DailyVideoCard.jsx`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 기존 dailyVideos 문서가 있어도 YouTube 설명란을 다시 읽어 화면 구간을 갱신. `매일성경 묵상`을 성경읽기 0:00으로 오인하던 라벨 우선순위 수정. API 실패 시 저장값 폴백. |
| 2026-07-14 | 퀴즈 정답 완료 카드 단순화 | `src/components/dashboard/BibleQuizCard.jsx`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 정답 완료 상태는 `정답!` 한 줄만 표시하고 `이어서 본문 읽기` 버튼 제거. 2회 오답 종료는 정답·해설 재확인 경로 유지. |
| 2026-07-14 | T112 재검수 보완 | `src/App.jsx`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 읽기↔관리 상호 이동 뒤에도 현재 화면을 세션 진입값에 동기화해, 새로고침 시 최초 선택 화면으로 되돌아가는 회귀를 방지. |
| 2026-07-14 | T112 관리자 진입 선택 화면 | `src/App.jsx`, `src/hooks/useAuth.js`, `src/data/constants.js`, `scripts/validate-round18.mjs`, `scripts/validate-kakao-custom-auth.mjs`, `HANDOFF_CODEX.md` | 공동체 관리자 로그인 경로를 세션당 1회 읽기/관리 선택 화면으로 통일하고 선택 마커·로그아웃 제거·역할 격리를 추가. 자동 계약·빌드 통과, 실 OAuth/계정 클릭은 미실행. |
| 2026-07-14 | T111 로그인 지연 단축 | `src/utils/helpers.js`, `src/hooks/useAuth.js`, `src/hooks/useUserAuth.js`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 이관 완료 지갑 transaction 사전 단락, extraOrgs 병렬 시작, 공동체 목록 비차단 로드, DEV 로그인 시간 로그 추가. 실계정 전/후 수치는 테스트 자격증명 없이 측정하지 않음. |
| 2026-07-14 | T110 부수 정리 | `src/data/constants.js`, `index.html`, `public/manifest.webmanifest`, `vite.config.js`, `firebase.json`, `package-lock.json`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 상담 링크 HTTPS, 빌드 시각 식별자, Firebase Hosting 보안 헤더+CSP Report-Only 초안, 호환 의존성 업데이트. 취약점 13건(고3)→10건(고1); 남은 Firebase·Vite 메이저와 GitHub Pages 헤더 적용 한계는 메모. |
| 2026-07-14 | T109 교회 문서 노출 축소 | `firestore.rules`, `src/hooks/useAuth.js`, `src/App.jsx`, `src/components/PlatformAdminView.jsx`, `scripts/audit-legacy-church-fields.mjs`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | churches read를 실사용자로 제한하고 신규 adminEmail/adminUid를 private/admin으로 분리. 운영 9개 교회 전수 읽기 감사에서 admin 식별자 9곳, 평문 churchCode 2곳 확인(값 미출력·데이터 무변경). |
| 2026-07-14 | T108 자기 데이터 조작 축소 | `firestore.rules`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 본인 accountType/isDeleted 변조 차단, primaryOrgId roster 실재 검증, users/roster score +15·talent +17 상한 및 개인 지갑 1회 이관 예외 추가. 로컬 규칙만 수정, 배포 안 함. |
| 2026-07-14 | T107 회수 성경 버전 완전 차단 | `src/data/bible_options.js`, `src/components/SocialOnboardingView.jsx`, `src/hooks/useAuth.js`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 소셜 온보딩 필터와 저장 직전 재검증, 게스트 숨김 planId 기본값 전환. 기존 저장 사용자는 유지. 헬퍼 스냅샷·거부/허용 assert 통과. |
| 2026-07-14 | T103~T106 명부 미로드 보상 소실 차단 | `src/hooks/useUserBibleActions.js`, `src/components/dashboard/BibleQuizCard.jsx`, `scripts/validate-round18.mjs`, `HANDOFF_CODEX.md` | 읽기는 진행 transaction 전에, 퀴즈는 정답 보상 transaction 전에 `loadUserExtraOrgsStrict`로 실제 명부를 다시 확인한다. 조회·재조회 실패를 빈 배열로 폴백하지 않아 개인 계정의 보상 없는 완료와 퀴즈 보상일 선소진을 차단했다. 회귀 계약과 전체 검증·빌드 통과, 실계정 금액 변경은 미실행. |
| 2026-07-14 | T102 관리자 읽기 기본·명칭 통일 | `src/App.jsx`, `src/hooks/useAuth.js`, `src/components/{LoginView,ChurchAdminView,PlatformAdminView,ChurchPicker,PlanSelectionView,ChurchAdminTutorial}.jsx`, `src/components/dashboard/{DashboardHeader,SocialLinkBanner}.jsx`, `src/components/churchAdmin/SettingsTab.jsx`, `scripts/validate-round18.mjs` | 공동체 관리자는 이메일·Google·카카오 로그인 모두 읽기 대시보드로 들어오고 헤더 `⚙️ 관리`로 관리 화면을 연다. 소셜 연결 배너 대상에 관리자를 포함하고 설정 탭의 중복 Google 연결 카드를 제거했으며 사용자 노출 명칭을 `공동체 관리자`로 통일했다. |
| 2026-07-14 | T97 공동체별 달란트 지갑 | `src/utils/{talentWallet,helpers,rosterSnapshot,rosterMembers}.js`, `src/hooks/{useUserAuth,useAuth,useUserBibleActions}.js`, `src/components/dashboard/{BibleQuizCard,TalentShop,CommunityMembershipCard}.jsx`, `src/components/{ChurchAdminView,PlatformAdminView,DashboardView}.jsx`, `src/App.jsx`, `scripts/validate-round18.mjs` | Rules API로 활성 Firestore ruleset `c433bfb2-19e6-4073-9b84-fed16add4d98`의 roster talent 허용·음수 방지를 확인했다. 읽기·퀴즈 보상을 모든 소속 지갑에 적립하고 개인 users 잔액을 primary roster로 1회 이관한다. 현재 공동체 표시·구매, 관리자 창구/환불, 전체 초기화를 조직 지갑 기준으로 바꾸고 상점에 전체 지갑 목록·탭 전환을 추가했다. 실계정 금액 변경은 미실행. |
| 2026-07-14 | T101 DAY별 퀴즈 | `src/components/dashboard/BibleQuizCard.jsx`, `src/utils/{quizEngine,quizProgress}.js`, `src/hooks/useUserBibleActions.js`, `scripts/validate-round18.mjs` | 퀴즈 완료 상태를 회차·DAY별 `quizProgress`로 분리하고 일일 보상은 `quizRewardDate`로 별도 제한했다. DAY 키·1/2차 보상·같은 날 추가 보상 0 픽스처 통과. |
| 2026-07-14 | T100 내 기록 허브 | `src/components/dashboard/DashboardHeader.jsx`, `src/components/modals/AchievementsModal.jsx`, `src/hooks/useUserBibleActions.js` | 헤더 점수 칩을 제거하고 업적 모달에 읽은 날·최장 연속·점수·달란트와 계산 안내를 추가했다. `maxStreak`를 읽기 transaction에서 갱신한다. |
| 2026-07-14 | T98~T99 읽기 흐름·완료 요약 | `src/components/DashboardView.jsx`, `src/components/dashboard/BibleReader.jsx`, `src/hooks/useUserBibleActions.js`, `src/App.jsx` | 퀴즈를 본문 뒤·완료 버튼 앞으로 이동하고 사라지는 보상 토스트를 고정 요약으로 교체했다. 추가 읽기 DAY 퀴즈 게이트와 레벨업→업적 순차 알림을 유지했다. |
| 2026-07-14 | T96 전용 링크 제거 | `src/components/churchAdmin/SettingsTab.jsx`, `src/components/ChurchAdminView.jsx` | 설정의 전용 로그인 링크 카드와 관리자 인쇄물 노출을 삭제했다. 성도용 A4 QR·표시 주소가 `SITE_URL` 루트 주소를 사용함을 확인했다. |
| 2026-07-14 | T95 기존 회원 소셜 연결 | `src/components/dashboard/SocialLinkBanner.jsx`, `src/hooks/useAuth.js`, `src/utils/kakaoAuth.js`, `supabase/functions/kakao-auth/{index,core}.ts`, `scripts/validate-kakao-custom-auth.mjs` | 7일 숨김 배너, Google 직접 link, 카카오 ID 토큰 검증·서버 전용 매핑·409 충돌 차단·기존 UID 토큰 발급을 구현했다. 함수 배포와 실계정 연결은 미실행. |
| 2026-07-14 | T93~T94 브랜드·첫 화면 | `index.html`, `public/manifest.webmanifest`, `src/components/{LoginView,GuestReaderView}.jsx`, `src/components/modals/ScoreInfoModal.jsx`, `src/utils/exportUtils.js`, `src/App.jsx`, `scripts/validate-round11.mjs` | 브랜드를 성경통독 114로 통일하고 카카오 단일 주 버튼·기억 공동체 뱃지·공동체 등록 안내/오진입 방지/완료 화면을 구현했다. 로컬 로그인 화면 렌더 확인. |
| 2026-07-14 | T92 마무리 청소 | `src/data/items/index.js`, `src/hooks/{useTTS,useBibleContent,useUserAuth}.js`, `src/index.css`, `src/components/{ChurchAdminView,LoginView}.jsx` | 디버그 log/info와 사용처 없는 CSS·중복 상수·미사용 소셜 버튼을 제거했다. 오류 진단용 console.error는 유지했다. |
| 2026-07-14 | T91 관리자 탭 분할 | `src/components/ChurchAdminView.jsx`, `src/components/churchAdmin/*.jsx` | 대시보드·교인·상점·조직·공지·설정 6개 탭을 순서대로 별도 파일로 이동하고 각 이동 후 빌드를 확인했다. |
| 2026-07-14 | T90 관리자 번들 지연 로딩 | `src/App.jsx`, `HANDOFF_CODEX.md` | `PlatformAdminView`와 `ChurchAdminView`를 `React.lazy`+`Suspense`로 분리하고 관리자 로딩 안내를 추가했다. 메인 청크는 1,460.04KB(gzip 388.69KB)에서 1,291.68KB(gzip 337.39KB)로 168.36KB 감소했고, 관리자 청크는 각각 54.94KB와 113.19KB로 분리됐다. 메인 청크의 500KB 경고는 여전히 남아 후속 코드 스플리팅 후보가 필요하다. `npm run build`, `npm run validate`, `npm run validate:quiz`, `git diff --check` 통과. |
| 2026-07-14 | T89 검증 파이프라인 통합 | `package.json`, `HANDOFF_CODEX.md` | `npm run validate`가 round11→round15→kakao-auth→personal-migration을 이름이 드러나는 하위 명령으로 순차 실행하도록 등록하고, 퀴즈는 `npm run validate:quiz`로 분리했다. 두 명령과 빌드·diff 검사 통과. |
| 2026-07-14 | T88 죽은 코드·잔재 제거 | `src/App.jsx`, `src/data/bibleQuiz.js`, `src/utils/helpers.js`, `src/utils/guestStorage.js`, `HANDOFF_CODEX.md` | 저장소 전체 검색에서 선언 외 참조 0건인 `getTodayQuiz`, `offsetToDateStr`, `clearGuestMigrated`를 제거하고 App의 주석 처리된 옛 hook 및 이동 완료 표시·빈 섹션 잔재를 정리했다. 진입점 도달성 검사상 미사용 컴포넌트는 0개였고 DemoTour·OrgEditor·ChurchAdminTutorial은 실사용 확인, `test_simulation.mjs`는 UPGRADE_PLAN의 부하 테스트 유지 결정을 따라 보존했다. 기존 검증기 전체, 새한글 파서, 빌드, diff 검사 통과. |
| 2026-07-13 | T87 완료 — 배치 12 구약 잔여·경고 해소 | `src/data/quiz/genesis.json`, `src/data/quiz/numbers.json`, `src/data/quiz/deuteronomy.json`, `src/data/quiz/colossians.json`, `src/data/quiz/philippians.json`, `HANDOFF_CODEX.md` | 창세기 35~36장 6문항, 민수기 1~16장 48문항, 신명기 9~34장 78문항과 장당 권장 수 경고 해소용 2문항을 추가했다. 남은 미저작 본문은 44개에서 0개로 감소했고 경고도 0개가 되었다. `node scripts/validate-quiz.mjs` **exit 0**, `npm run build`, `git diff --check` 통과. **T87 완료 — exit 0. 퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 11 — 신약일독 잔여 세그먼트 | `src/data/quiz/acts.json`, `src/data/quiz/galatians.json`, `src/data/quiz/hebrews.json`, `src/data/quiz/romans.json`, `src/data/quiz/matthew.json`, `HANDOFF_CODEX.md` | 사도행전 3개, 갈라디아서 1개, 히브리서 3개, 로마서 3개, 마태복음 18개 실제 절 범위에 총 140문항을 추가했다. 각 세그먼트 안의 대표 절만 근거로 사용해 남은 미저작 본문은 72개에서 44개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 구약 누락 때문에 의도대로 exit 1. 최종 누적 상태에서 빌드·diff 검증 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 10 — 일년일독 Day 338~365 | `src/data/quiz/1timothy.json`, `src/data/quiz/2timothy.json`, `src/data/quiz/titus.json`, `src/data/quiz/1john.json`, `src/data/quiz/2john.json`, `src/data/quiz/3john.json`, `src/data/quiz/revelation.json`, `HANDOFF_CODEX.md` | 디모데전·후서, 디도서, 요한일·이·삼서, 요한계시록 15~22장에 총 145문항을 추가했다. 계 18:1~19:4와 19:5~21은 실제 절 범위별 5문항을 확보했다. 남은 미저작 본문은 103개에서 72개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1. 최종 누적 상태에서 빌드·diff 검증 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 9 — 요한복음 8~21장 | `src/data/quiz/john.json`, `HANDOFF_CODEX.md` | 일년일독 Day 351~356과 신약일독 Day 296~323의 실제 절 범위 29개에 요한복음 145문항을 추가했다. 대상 34일 모두 누락 0이며 신약일독 일일 pool 5~10개, 일년일독 일일 pool 20~30개를 확인했다. 전체 미저작 본문은 146개에서 103개로 감소. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1, `npm run build`, `git diff --check` 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 8 — 일년일독 Day 321~350 | `src/data/quiz/2chronicles.json`, `src/data/quiz/micah.json`, `src/data/quiz/jeremiah.json`, `src/data/quiz/lamentations.json`, `src/data/quiz/malachi.json`, `src/data/quiz/john.json`, `src/data/quiz/psalms.json`, `HANDOFF_CODEX.md` | 역대하 21~36장 48문항, 미가 21문항, 예레미야 159문항, 예레미야애가 15문항, 말라기 12문항, 요한복음 1:1~7:53의 신약일독 세그먼트별 80문항으로 총 335문항 추가. 배치 7 시편 119편 후반 3문항의 중복 질문 문구도 내용 변경 없이 절 범위를 명시해 고쳤다. 대상 30일 모두 누락 0, 일일 pool 3~30개이며 전체 미저작 본문은 251개에서 146개로 감소. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1, `npm run build`, `git diff --check` 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T78~T86 모바일 실제 사용자 E2E QA 대응 | `src/hooks/{useUserBibleActions,useMemos,useTTS,useAuth}.js`, `src/components/dashboard/{BibleReader,BibleQuizCard,CommunityMembershipCard,KakaoChannelButton,RaceMap}.jsx`, `src/components/{DashboardView,GuestReaderView}.jsx`, `src/components/modals/AchievementsModal.jsx`, `src/data/achievements.js`, `src/utils/{readPolicy,helpers}.js`, `src/index.css`, `scripts/{validate-quiz,validate-round15}.mjs`, `QA_MOBILE_E2E_2026-07-13.md`, `HANDOFF_CODEX.md` | Claude 수정 설계를 반영했다. 실제 모바일 500px에서 첫 읽기 DAY2·10점, 추가 2회 DAY4·10점, 4번째 no-op을 확인했고 업적 `1/14`, 음성 `유나/Google 한국의`, 상담 버튼 비고정(콘텐츠 비가림), 이름 가입→계획 선택→신약 일독 DAY1 자동 진입을 확인했다. 기준 공동체 탈퇴와 여정 지도는 테스트 계정에 공동체가 없어 정적 계약으로 검증했다. `validate-round15`, `validate-round11`, 빌드, diff 통과. `validate-quiz`는 의도대로 미저작 본문 1,028개를 잡아 exit 1. 커밋·배포 없음. |
| 2026-07-13 | T76 관리자 비밀번호 실변경 서버 함수 (배포 대기) | `supabase/functions/admin-set-password/index.ts`, `src/utils/adminPassword.js`, `src/App.jsx`, `src/components/ChurchAdminView.jsx`, `src/data/constants.js`, `.env.example`, `HANDOFF_CODEX.md` | Firebase ID 토큰 검증→서버 역할·소속 검증→Auth 실제 비밀번호 변경→private/auth 조회용 암호 동기화 경로를 구현하고 두 관리자 UI의 직접 Firestore 쓰기를 교체했다. `npm run build`, `git diff --check` 통과. 배포 명령 `supabase functions deploy admin-set-password --no-verify-jwt`는 이 환경에 Supabase CLI가 없어 `command not found: supabase`로 실패했으며, `VITE_ADMIN_SET_PASSWORD_URL` 설정과 배포가 남았다. 커밋 금지 제약 준수. |
| 2026-07-13 | T75c 창구 판매·환불 개인 계정 활성화 | `src/components/ChurchAdminView.jsx`, `HANDOFF_CODEX.md` | 개인·외부 roster 멤버의 창구 판매 선택과 구매 취소·환불을 활성화했다. 개인 계정은 관리자 users read가 열려 있지 않아 `talent`·`updatedAt`과 판매 기록을 하나의 batch로 처리하며, permission-denied이면 기준 공동체가 다른 경우임을 안내한다. 기존 자체 교인 잔액 transaction·로컬 상태 갱신은 유지했고 roster-only 멤버는 잔액을 추정하지 않는다. `npm run build`, `git diff --check` 통과. 커밋 금지 제약 준수. |
| 2026-07-13 | T73 헤더 아이콘 접근성 | `src/components/dashboard/DashboardHeader.jsx`, `HANDOFF_CODEX.md` | 도움말·달성 뱃지·날짜 설정·읽기 달력 아이콘 버튼에 용도를 설명하는 aria-label을 추가했다. `npm run build`, `node scripts/validate-round11.mjs`, `git diff --check` 통과. 커밋 금지 제약 준수. |
| 2026-07-13 | T74 모바일 375/390 재검증 | `HANDOFF_CODEX.md` | 미완료: 로컬 브라우저·Chrome 제어 연결이 모두 제공되지 않아 375px·390px 실제 리사이즈/스크린샷을 수행할 수 없었다. 최종 `npm run build`, `node scripts/validate-round11.mjs`, `git diff --check`은 통과했으나, 배포 전 실제 모바일 브라우저에서 헤더와 T70~T72를 확인해야 한다. |
| 2026-07-13 | T72 퀴즈 완료 카드 정리 | `src/components/dashboard/BibleQuizCard.jsx`, `HANDOFF_CODEX.md` | 정답 또는 2회 소진 뒤 문항/보기 대신 완료 요약·획득 달란트·본문 이동 버튼만 보이고, 요약 탭으로 정답/해설을 다시 열 수 있게 했다. 게이트·보상 저장 로직은 변경하지 않았다. `npm run build`, `node scripts/validate-round11.mjs`, `git diff --check` 통과. 커밋 금지 제약 준수. |
| 2026-07-13 | T71 퀴즈 선행 게이트 유도 | `src/components/DashboardView.jsx`, `src/components/dashboard/{BibleReader,BibleQuizCard}.jsx`, `HANDOFF_CODEX.md` | 잠긴 읽기 완료 자리를 퀴즈 이동 활성 버튼과 보조 문구로 바꾸고, 부드러운 스크롤 뒤 2초 카드 강조를 추가했다. 퀴즈 게이트 해제 조건·저장 로직은 변경하지 않았다. `npm run build`, `node scripts/validate-round11.mjs`, `git diff --check` 통과. 커밋 금지 제약 준수. |
| 2026-07-13 | T70 총 읽은 날 표시 수정 | `src/utils/helpers.js`, `src/utils/statsUtils.js`, `src/components/{DashboardView,ChurchAdminView,PlatformAdminView}.jsx`, `src/components/dashboard/{ReadingChampionSection,RaceMap}.jsx`, `src/components/modals/RankingModal.jsx`, `HANDOFF_CODEX.md` | `getDaysRead` 공용 헬퍼로 누적 표시·평균·랭킹 정렬을 실제 읽은 날 기준으로 통일했다. 달리기 맵 위치는 기존 `mapDay`를 별도 보존해 변경하지 않았다. `npm run build`, `node scripts/validate-round11.mjs`, `git diff --check` 통과. 커밋 금지 제약 준수. |
| 2026-07-13 | 소셜 로그인 버튼 디자인 통일 | `src/components/LoginView.jsx`, `scripts/validate-round11.mjs`, `HANDOFF_CODEX.md` | 첫 화면 카카오톡·Google 버튼을 공통 `SocialLoginButton`으로 통합해 동일 높이, pill 모양, 좌측 아이콘 영역, 중앙 문구 정렬 적용. 카카오는 공식 노랑 계열, Google은 흰색/테두리 유지. 프로덕션 미리보기에서 두 버튼 렌더 확인, 라운드 11 검사·빌드·diff 통과. |
| 2026-07-13 | M10R 무료 카카오 로그인 실연동 | `.gitignore`, `.env.example`, `supabase/functions/kakao-auth/index.ts`, `HANDOFF_CODEX.md` | Supabase `bible114's Project` 연결, 카카오/Firebase 시크릿 3종 등록, `kakao-auth --no-verify-jwt` 배포. 카카오 REST 키에 운영·localhost redirect URI 등록. CORS OPTIONS 204 수정·실응답 확인. 프로덕션 빌드에서 카카오 동의→Firebase `kakao:` UID 생성→이름 온보딩 1/3 진입 확인. 운영 배포와 최종 온보딩 완료(users/roster 쓰기)는 미실행. |
| 2026-07-13 | T69 모바일 헤더 칩 겹침 수정 | `src/components/dashboard/DashboardHeader.jsx`, `scripts/validate-round11.mjs`, `HANDOFF_CODEX.md` | 모바일 칩 영역을 가로 스크롤에서 flex-wrap으로 전환하고 로그아웃을 같은 흐름의 마지막 요소로 편입. divider는 모바일 숨김, md 이상 한 줄 우측 정렬 유지. 소속/버전 버튼은 별도 flex 항목 유지. 정적 계약 검사·빌드·diff 검사 통과. 인증된 시드 세션이 없어 375/390 실화면 클릭은 미검증. |
| 2026-07-13 | T60R 무료 카카오 커스텀 토큰 전환 | `supabase/functions/kakao-auth/*`, `src/utils/kakaoAuth.js`, `src/hooks/useAuth.js`, `src/data/constants.js`, `src/components/PlatformAdminView.jsx`, `scripts/validate-kakao-custom-auth.mjs`, `scripts/validate-round11.mjs`, `package.json`, `HANDOFF_CODEX.md` | Supabase 함수의 카카오 코드 교환·프로필 조회·Firebase RS256 커스텀 토큰 발급과 클라이언트 state/취소/URL 정리/로그인을 연결. 레거시 `oidc.kakao` 관리자 표시 호환은 유지. Node 계약 검사, Deno 픽스처 2건, 라운드 11 검사, 빌드, diff 검사 통과. 실연동과 함수 배포는 M10R 사용자 수동 단계로 미실행. |
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
| 2026-07-12 | T51 개인 계정 공동체 온보딩 | `src/App.jsx`, `src/components/dashboard/CommunityMembershipCard.jsx`, `HANDOFF_CODEX.md` | 개인 계정의 플랜·성경 버전 선택 뒤 공동체 참여 선택 화면을 추가하고 T46 검색·입장코드·부서/소그룹 UI를 onboarding 모드로 재사용. 참여 시 roster 생성과 users `primaryOrgId`·`planId`를 한 transaction에 저장하고, 나중에 선택하면 공동체 없이 dashboard로 진입. Auth uid 방어와 저장 실패 잔류 처리 적용. `npm run build`, `git diff --check` 통과. 실제 roster/users 쓰기는 운영 데이터 생성 때문에 미검증. |
| 2026-07-12 | T52 개인 계정 대시보드 | `src/App.jsx`, `src/hooks/useDepartment.js`, `src/hooks/useBibleLogic.js`, `src/components/DashboardView.jsx`, `src/components/dashboard/DashboardHeader.jsx`, `src/components/dashboard/CommunityMembershipCard.jsx`, `HANDOFF_CODEX.md` | `primaryOrgId`의 roster 소속을 runtime 기준 교회·부서·소그룹으로 투영해 기존 users+roster 병합 랭킹 경로를 재사용. 2개 이상 공동체는 이름을 조회한 헤더 드롭다운으로 전환하고 users 문서를 갱신. 공동체 0개는 랭킹·달리기·공지·MVP·상점을 숨기되 내 공동체 추가는 유지. 첫 공동체 추가와 기준 공동체 탈퇴 시 primaryOrgId를 transaction으로 지정·재선택. `npm run build`, `git diff --check` 통과. 실제 인증 대시보드·전환·탈퇴는 운영 데이터 변경 때문에 미검증. |
| 2026-07-12 | T53 관리자·지원 대응 | `src/components/PlatformAdminView.jsx`, `src/components/ChurchAdminView.jsx`, `HANDOFF_CODEX.md` | 플랫폼 전체 회원 목록에 개인 뱃지와 개인 계정 표기를 추가. 비밀번호 방식 개인 계정은 기존 `fetchMemberCredentials`로 private/auth 현재 암호 확인·변경을 유지하고 Google 개인 계정은 비밀번호 없음으로 표시. 개인 계정 편집에서 교회/부서 필드를 숨겨 roster 소속 원장을 보호. T48 외부 roster 멤버의 소그룹 배정·제명과 개인정보 작업 차단을 재확인하고 지원 문구를 플랫폼 관리자 기준으로 수정. `npm run build`, `git diff --check` 통과. 실제 관리자 인증 화면·암호 변경·roster 제명은 운영 데이터 변경 때문에 미검증. |
| 2026-07-12 | T55 개인 계정 전환 진입점 | `src/components/dashboard/PersonalAccountMigrationCard.jsx`, `src/components/dashboard/index.js`, `src/components/DashboardView.jsx`, `HANDOFF_CODEX.md` | 일반 교회 소속 기존 member에게만 조용한 전환 카드와 안내 모달을 표시. 장점 2개·로그인 변경 주의·전화번호 뒤 4자리 필수 검증을 제공하고 닫기 시 localStorage 타임스탬프로 7일간 숨김. 게스트·관리자·개인 계정·무소속은 비노출. `npm run build`, `git diff --check` 통과. 실행 로직은 다음 순번 T56에서 연결. |
| 2026-07-12 | T56 개인 계정 전환 상태머신 | `src/utils/personalAccountMigration.js`, `src/App.jsx`, `HANDOFF_CODEX.md` | T50 공용 식별자로 Auth 이메일 변경→private/auth phone4 병합→구 교회 roster 존재 확인/생성→users personal 전환을 규칙 요구대로 별개 쓰기로 순차 실행. `b114_migration_v1`에 단계·원소속 snapshot을 저장해 reload 시 같은 uid에서 자동 재개하고, 단계별 멱등·uid 단일 in-flight를 적용. 이메일 충돌·recent login 안내와 완료 후 extraOrgs 재조회/T52 상태 전환 연결. `npm run build`, `git diff --check` 통과. 실계정 전환은 미검증. |
| 2026-07-12 | T57 개인 로그인 흐름 보완 | `src/components/LoginView.jsx`, `src/hooks/useAuth.js`, `HANDOFF_CODEX.md` | 첫 화면·개인 폼을 "시작하기 · 개인 계정 로그인"으로 명확화하고 교회 로그인 계정 없음 안내에 전환 사용자 경로 추가. 기존 email-already-in-use→signIn 로그인 겸용 동작 유지. Auth 이메일 변경 후 users 전환 전 중단된 uid는 localStorage pending 상태를 확인해 개인 로그인으로 복원하고 T56 자동 재개 허용. `npm run build`, `git diff --check` 통과. |
| 2026-07-12 | T58 관리자·개인 공동체 회귀 | `src/components/ChurchAdminView.jsx`, `HANDOFF_CODEX.md` | roster 병합 멤버를 개인·외부 뱃지로 표시하고 기준 공동체 관리자는 T54 private/auth 규칙을 통해 비밀번호 확인·재설정을 시도하도록 허용(보조 공동체는 권한 오류 안내). 소그룹 배정·제명 유지, users/history/달란트 직접 변경 차단 유지. 창구 판매 선택에는 개인·외부 멤버를 disabled 옵션과 사유로 표시. T52가 active primaryOrgId를 churchId로 투영해 공지/settings read·상점 설정 read·구매 create 기존 경로를 재사용함을 확인. `npm run build`, `git diff --check` 통과. |
| 2026-07-12 | T59 라운드 10 검증 | `src/utils/personalMigrationSteps.js`, `src/utils/personalAccountMigration.js`, `scripts/validate-personal-migration.mjs`, `HANDOFF_CODEX.md` | 순수 단계 정의를 상태머신과 검증기가 공유. start/email/credentials/roster 각 단계 실패 시 단계 보존→재개 완료 fixture, 개인 이메일 공용 조합, 이메일 충돌·recent login, roster 멱등, users 전환 필드, 무소속·관리자·게스트 비노출 조건, 개인 로그인 겸용/pending 복원 계약 검사 통과. `node scripts/validate-personal-migration.mjs`, `npm run build`, `git diff --check` 통과. 실계정 전환은 운영 데이터 변경 때문에 미검증. |
| 2026-07-12 | T60 카카오 로그인 코어 | `src/hooks/useAuth.js`, `src/App.jsx`, `HANDOFF_CODEX.md` | Firebase compat `OAuthProvider('oidc.kakao')`로 일반 브라우저 popup·카카오톡 인앱 redirect를 분기하고 앱 로드 시 redirect 결과 처리. users 문서가 있는 personal은 기존 즉시 로그인, 신규 카카오·구글은 users 문서를 만들지 않고 `social_onboarding` 임시 상태로 전달. uid 재검사·in-flight·Auth flow guard·공급자 오류 문구 적용. `npm run build`, `git diff --check` 통과. M10 미실행으로 실 카카오 인증은 미검증. |
| 2026-07-12 | T61 첫 화면 단순화 | `src/components/LoginView.jsx`, `HANDOFF_CODEX.md` | 기본 로그인 카드를 카카오·구글·기존 회원 로그인·게스트 4항목으로 단순화하고 성도/관리자 탭 제거. 관리자 로그인·비밀번호 문의는 하단 미세 링크로 이동. 기존 교회/무소속/개인 수동 로그인·가입은 legacy 화면 안에 보존. 최근 교회와 `?church=` preselect는 기존 form 우선, 변경 시 소셜 첫 화면 복귀. 카톡 인앱에서는 카카오 유지·구글 제한 안내. `npm run build`, `git diff --check` 통과. |
| 2026-07-12 | T62 소셜 신규 3단계 온보딩 | `src/components/SocialOnboardingView.jsx`, `src/components/dashboard/CommunityMembershipCard.jsx`, `src/hooks/useAuth.js`, `src/App.jsx`, `HANDOFF_CODEX.md` | 신규 소셜 계정에 이름→소속→플랜/버전 3단계 제공. 닉네임 prefill·빈 이름 차단, CommunityMembershipCard selectionOnly 재사용, 혼자 읽기는 unaffiliated_v1 자동 선택. 선택 단계는 무쓰기이며 최종 완료 transaction에서 첫 roster와 personal users 문서를 함께 생성해 중도 이탈 users 고아 문서 방지. provider 저장·게스트 진도 반영·완료 후 T52 상태 연결. `npm run build`, `git diff --check` 통과. 실 소셜 계정 생성은 미검증. |
| 2026-07-12 | T63 헤더 소속 관리 | `src/components/dashboard/DashboardHeader.jsx`, `src/components/DashboardView.jsx`, `src/components/dashboard/CommunityMembershipCard.jsx`, `HANDOFF_CODEX.md` | personal 성도 헤더에 현재 기준 단체명 버튼 추가, 클릭 시 내 단체 관리 시트 제공. CommunityMembershipCard를 재사용해 기준 ★·기준 전환·탈퇴·단체 추가를 연결하고 기존 메인 카드는 개인 계정에서 제거. unaffiliated_v1 코드 없는 재가입 버튼과 최대 3개·첫 소속 primary transaction 적용. 기존 비개인 교회 계정 헤더는 유지. `npm run build`, `git diff --check` 통과. 실제 roster 변경은 미검증. |
| 2026-07-12 | T64 성경 읽는 사람들 정식 단체화 | `src/hooks/useDepartment.js`, `src/hooks/useBibleLogic.js`, `src/components/DashboardView.jsx`, `HANDOFF_CODEX.md` | personal+unaffiliated_v1 기준 화면은 users 쿼리를 Promise 빈 결과로 대체하고 roster만 병합. 부서 없는 roster 전체를 달리기·주간 집계 대상으로 사용하고 상위 10명 평면 랭킹 카드 제공, 소그룹 랭킹/빈 헤더 랭킹은 숨김. unaffiliated 추가 소속 hard-hide 제거. 공지·상점은 기존 active churchId 경로 유지. `npm run build`, `git diff --check` 통과. 구 무소속 users는 알려진 비포함 한계. |
| 2026-07-12 | T65 소셜 provider 관리자 표시 | `src/utils/helpers.js`, `src/components/PlatformAdminView.jsx`, `HANDOFF_CODEX.md` | userDocToState에 authProvider 매핑. 플랫폼 회원 목록 personal 옆 카카오/Google provider 뱃지 표시, 카카오·구글은 암호 변경 대신 해당 소셜 로그인 안내. 레거시 Google personal은 non-bible 이메일로 호환 판정, 비밀번호 personal은 기존 private/auth 지원 유지. `npm run build`, `git diff --check` 통과. |
| 2026-07-12 | T66 라운드 11 검증 | `scripts/validate-round11.mjs`, `HANDOFF_CODEX.md` | 첫 화면 4항목·기존 경로·카카오 popup/redirect·구글 신규 온보딩·3단계·users/roster 최종 생성·소속 관리·unaffiliated roster-only 계약 자동 검사 통과. `node scripts/validate-round11.mjs`, `npm run build`, `git diff --check` 통과. 인앱 브라우저 스킬 파일과 Playwright 런타임 부재로 로컬 클릭 검증은 미실행. M10 미완료로 실 카카오 인증·계정 생성 미검증. |
| 2026-07-12 | T67 dashboardUser 렌더 연결 | `src/App.jsx`, `scripts/validate-round11.mjs`, `HANDOFF_CODEX.md` | DashboardView에 원본 currentUser 대신 runtime 매핑 dashboardUser 전달. personal primaryOrgId의 churchId/name/부서 투영이 T63 버튼·T64 화면 게이트·공지·상점에 적용됨. Dashboard 계열 users 쓰기는 개별 필드만 merge/update하며 매핑 churchId를 전체 저장하는 경로 없음 확인. 검증기에 prop 연결과 whole-user set 금지 assertion 추가. `node scripts/validate-round11.mjs`, `npm run build`, `git diff --check` 통과. |
| 2026-07-12 | T68 personal 세션 복원 직행 | `src/App.jsx`, `scripts/validate-round11.mjs`, `HANDOFF_CODEX.md` | member 네비게이션에서 accountType personal+planId면 department/subgroup 검사 없이 dashboard 직행. 정상 소셜/개인 계정 새로고침이 구 plan/community onboarding으로 빠져 primaryOrgId를 지우는 트랩 차단. planId 없는 비정상 문서만 기존 플랜 선택 폴백. 검증기에 직행·구 온보딩 비도달 assertion 추가. 자동 검사·빌드·diff 통과. |
| 2026-07-13 | T87 배치 1 — 일년일독 Day 5~34 | `src/data/quiz/exodus.json`, `src/data/quiz/joshua.json`, `src/data/quiz/judges.json`, `HANDOFF_CODEX.md` | 출애굽기 1~40장 120문항, 여호수아 1~24장 72문항, 사사기 1~21장 63문항으로 총 255문항 추가. 대상 30일은 모두 누락 0, 일일 pool 6~12개이며 전체 미저작 본문은 1,028개에서 943개로 감소. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1, `npm run build`, `git diff --check` 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 2 — 일년일독 Day 35~64 | `src/data/quiz/ruth.json`, `src/data/quiz/job.json`, `src/data/quiz/daniel.json`, `src/data/quiz/ezra.json`, `src/data/quiz/haggai.json`, `src/data/quiz/zechariah.json`, `src/data/quiz/nehemiah.json`, `src/data/quiz/esther.json`, `HANDOFF_CODEX.md` | 룻기 12·욥기 126·다니엘 36·에스라 30·학개 6·스가랴 42·느헤미야 39·에스더 30문항으로 총 321문항 추가. 대상 30일 모두 누락 0, 일일 pool 6~18개이며 전체 미저작 본문은 943개에서 836개로 감소. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1, `npm run build`, `git diff --check` 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 3 — 일년일독 Day 65~94 | `src/data/quiz/matthew.json`, `src/data/quiz/acts.json`, `src/data/quiz/romans.json`, `src/data/quiz/galatians.json`, `src/data/quiz/hebrews.json`, `src/data/quiz/revelation.json`, `src/data/quiz/genesis.json`, `HANDOFF_CODEX.md` | 마태복음 140·사도행전 25·로마서 80·갈라디아서 30·히브리서 65·요한계시록 15·창세기 18문항으로 총 373문항 추가. 대상 30일 모두 누락 0, 일일 pool 5~25개이며 전체 미저작 본문은 836개에서 731개로 감소. 기존 사도행전·요한계시록·창세기 문항은 보존. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1, `npm run build`, `git diff --check` 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 4 — 일년일독 Day 95~124 | `src/data/quiz/leviticus.json`, `src/data/quiz/1samuel.json`, `src/data/quiz/2samuel.json`, `src/data/quiz/psalms.json`, `HANDOFF_CODEX.md` | 레위기 81·사무엘상 93·사무엘하 72·시편 1~7편 21문항으로 총 267문항 추가. 대상 30일 모두 누락 0, 일일 pool 6~21개이며 전체 미저작 본문은 731개에서 642개로 감소. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1, `npm run build`, `git diff --check` 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 5 — 일년일독 Day 125~154 | `src/data/quiz/psalms.json`, `src/data/quiz/isaiah.json`, `HANDOFF_CODEX.md` | 시편 8~72편 195문항과 이사야 1~58장 174문항으로 총 369문항 추가. 대상 30일 모두 누락 0, 일일 pool 6~21개이며 전체 미저작 본문은 642개에서 519개로 감소. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1, `npm run build`, `git diff --check` 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 6 — 일년일독 Day 155~184 | `src/data/quiz/isaiah.json`, `src/data/quiz/joel.json`, `src/data/quiz/obadiah.json`, `src/data/quiz/nahum.json`, `src/data/quiz/habakkuk.json`, `src/data/quiz/mark.json`, `src/data/quiz/acts.json`, `src/data/quiz/1corinthians.json`, `src/data/quiz/2corinthians.json`, `src/data/quiz/1thessalonians.json`, `src/data/quiz/2thessalonians.json`, `src/data/quiz/james.json`, `src/data/quiz/jude.json`, `src/data/quiz/revelation.json`, `src/data/quiz/genesis.json`, `HANDOFF_CODEX.md` | 이사야 59~66장부터 창세기 27~34장까지 15권에 총 543문항 추가. 신약의 분할 읽기 범위는 세그먼트별 5문항으로 저작했다. 대상 30일 모두 누락 0, 일일 pool 6~25개이며 전체 미저작 본문은 519개에서 379개로 감소. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1, `npm run build`, `git diff --check` 통과. **퀴즈 문항 신학 검수 필요(사용자).** |
| 2026-07-13 | T87 배치 7 — 일년일독 Day 291~320 | `src/data/quiz/1chronicles.json`, `src/data/quiz/psalms.json`, `src/data/quiz/2chronicles.json`, `HANDOFF_CODEX.md` | 역대상 1~29장 87문항, 시편 73~150편 237문항(119편은 두 읽기 범위별 3문항), 역대하 1~20장 60문항으로 총 384문항 추가. 대상 30일 모두 누락 0, 일일 pool 6~21개이며 전체 미저작 본문은 379개에서 251개로 감소. `node scripts/validate-quiz.mjs`는 남은 누락 때문에 의도대로 exit 1, `npm run build`, `git diff --check` 통과. **퀴즈 문항 신학 검수 필요(사용자).** |

---

## 📮 Codex → Claude 메모

2026-07-16 누적 운영 릴리스 완료·최종 T127 관찰 재시작:
- 사용자 명시 지시로 `main` 누적 11커밋을 `be2c86f`까지 push하고 의존 순서대로 `kakao-auth` v6, `platform-api` v9, GitHub Pages 웹, 마지막에 Firestore rules를 배포했다. 인덱스 변경은 없었다. 공개 번들 `index-D7l-cYj7.js`는 HTTP 200이며 로컬과 SHA-256이 일치하고, Edge의 허용/거부 무쓰기 스모크도 기대 상태를 통과했다.
- Firebase CLI 로그인은 만료 상태였으나 로그인된 Firebase 콘솔에서 로컬 `firestore.rules` 한 벌(519행)을 편집기에 정확히 대체 입력해 게시했다. 첫 입력이 기존 규칙 뒤에 붙은 상태는 컴파일러가 `Line 520: Unexpected 'rules_version'`으로 거부해 운영 미반영이었고, 전체 선택·삭제 후 다시 붙여 `rules_version` 1회/마지막 519행을 확인했다. 재게시 뒤 페이지 재로드에서 활성 버전 `오늘 • 7:26 오후`, 저장 오류·미게시 변경 없음으로 확인했다.
- 공개 게스트·로그인·공동체 등록 UI에서 Kakao/Google 등록과 필수 관리자 연락 이메일은 확인했다. 실제 Kakao OAuth 완료, 신규 공동체 생성, 인증된 슈퍼/공동체 관리자 화면은 운영 데이터 생성을 피하려고 미실행이다. 전체 릴리스 완료 기준 최종 T127 관찰은 2026-07-16 19:26 KST부터 2026-07-23 19:26 KST까지이며 그 전에는 잔여 직접 writer/legacy secret 차단·정리를 하지 않는다.

2026-07-16 가상 공동체 로딩·Kakao 관리자 가입·연락 이메일 로컬 완료:
- 슈퍼관리자의 `성경 읽는 사람들`은 실제 공동체 관리자/users가 없는 `unaffiliated_v1` 가상 공동체다. `ChurchAdminView`에서 이 ID의 users query를 건너뛰고 roster만 읽으며, `PlatformAdminView`의 관리자 미리보기 버튼도 의도적으로 비활성화했다. 일반 공동체 화면은 핵심 조회 15초 timeout·오류 재시도·finally 해제를 적용했고 구매 조회가 지연돼도 회원/설정 화면은 먼저 열린다.
- 공동체 최초 등록의 Kakao 경로는 개인 Kakao 로그인 intent와 분리해 redirect draft를 보존한다. 개인 로그인·기존 계정 연결·관리자 가입의 각 시작 함수가 다른 모드의 sessionStorage 표식/draft를 제거한 뒤 자기 표식만 설정하므로, 중단한 redirect가 다음 Kakao 시도를 다른 흐름으로 오분류하지 않는다. `kakao-auth` custom token에 서버 서명 `bible114_auth_provider: kakao.com`, `bible114_kakao_id`를 넣고, `platform-api`가 raw Firebase provider `custom`, signed claim, exact `uid === kakao:<id>`를 모두 재검증한다. 클라이언트가 보낸 provider나 Kakao ID를 권한 근거로 쓰지 않는다.
- 기존 `completeChurchAdminSignup` transaction을 확장했다. Kakao는 비밀번호와 token email이 없어도 되지만 `contactEmail`은 필수이며, 신규 Google/비밀번호 가입도 동일 필드를 보낸다. 연락 이메일은 공개 교회·directory나 Kakao users email로 복사하지 않고 `churches/{churchId}/private/admin.adminEmail`과 비공개 lifecycle ledger에만 저장한다. 슈퍼관리자 교회 목록·상세의 이메일 링크로 공급자와 무관하게 연락한다. Kakao OAuth ID만으로 개인 카카오톡 DM을 보내는 기능은 제공하지 않는다.
- 서비스 개인정보 처리 목적과 동의 버전을 `2026-07-16`으로 올렸다. 독립 검토에서 stale Kakao 모드 표식과 취소 후 이메일 가입의 임시 draft 잔존을 찾아 각각 시작 시 상호 배타 초기화, 가입 성공·로그아웃 공통 정리로 보완했으며 최신 재검토의 P0~P2 잔여는 0건이다. 전체 `npm run validate`(platform-api 426 tests), 최종 관련 검사, `npm run build`, `git diff --check`, 로컬 비로그인 등록 UI를 통과했다. 실 Kakao OAuth와 인증된 슈퍼관리자 화면은 계정·운영 데이터 조작 없이 미검증이다.
- **배포 의존성:** 새 웹은 Kakao signed claim과 확장된 가입 action에 의존하므로 `kakao-auth` Edge → `platform-api` Edge → 웹 순서로 배포해야 한다. rules/index 변경은 없고 현재 배포·push는 하지 않았다.

2026-07-16 T112b 사용자 직접 개정 로컬 완료:
- 사용자가 T112의 로그인 선택 화면보다 T102의 방향을 다시 명시해, 온보딩이 끝난 `churchAdmin`은 로그인 방식과 무관하게 읽기 대시보드로 바로 진입하도록 `admin_entry`를 제거했다. 관리 화면에서 새로고침할 때만 세션의 `church_admin`을 복원하고, 명시적 로그아웃은 마커를 지우므로 다음 로그인은 다시 읽기 화면이다.
- 대시보드에는 관리자 계정·안내 버전별 `b114_church_admin_reader_guide_v1:{uid}`를 사용한 1회 안내를 추가했다. 서버 사용자 문서 writer를 넓히지 않기 위해 브라우저별 안내이며, `⚙️ 관리` 위치와 읽기 계속/즉시 관리 진입을 설명한다.
- 첫 화면의 큰 Google 시작 경로가 기존에는 platformAdmin/superAdmin을 일반 회원이 아니라고 로그아웃시키던 구멍을 수정했다. 인증 uid의 `users/{uid}`를 source-server로 읽고 저장 역할이 관리자 allowlist일 때 기존 `finishAdminLogin`으로 넘긴다. 역할·이메일을 새로 부여하거나 하드코딩하지 않으며 platformAdmin/superAdmin은 App 최상위 role gate로 즉시 `PlatformAdminView`를 렌더한다.
- 슈퍼관리자 전체 데이터 로드 실패나 로그인 중 uid 변경이 있어도 역할 상태를 먼저 열지 않는다. expected uid에 결속된 전체 데이터 로드가 끝난 뒤에만 `setCurrentUser`하며, Google 실패 시 로컬 사용자 상태를 비우고 로그아웃한다. 명시적 로그아웃도 `allUsers/allChurches` 캐시를 지운다.
- 독립 감사에서 기존 `firestore.rules`의 `isPlatformAdmin()`이 `role`만 보고 `isDeleted`를 확인하지 않아, 이미 열린 삭제 관리자 세션의 서버 권한이 남는 별도 P1을 확인했다. 이 작업은 사용자 지정 로그인 UX와 무관하고 `users` read 규칙은 별도 세션에서 수정 중이라는 저장소 지침이 있어 이번 커밋에서는 건드리지 않았다. 해당 규칙 세션에서 `myData().get('isDeleted', false) != true` 결속과 운영 rules 배포를 반드시 검토해야 한다.
- 전체 `npm run validate`(platform-api 421 tests), `npm run build`, `git diff --check` 통과. 실제 운영 Google 팝업과 계정별 화면은 자격증명을 사용하지 않아 미검증이며 **웹 배포·push는 하지 않았다.**

2026-07-16 T125e-2 교회 삭제 정책 결정 필요(생성·코드 변경과 독립이므로 해당 구현은 계속 진행):
- 현재 플랫폼 관리자 삭제는 `users.churchId == churchId`인 주 소속 사용자만 여러 client batch로 soft-delete한 뒤 교회와 legacy 디렉토리를 따로 갱신한다. 개인/외부 roster, 양수 달란트, pending 구매, Auth, 감사 원장과 하위 설정은 보존하며 복원 경로는 없다. 이 순서를 서버로 그대로 옮겨도 삭제된 교회의 roster 지갑·설정·상점 action이 계속 동작하는 의미 공백이 남는다.
- 안전한 기본 제안은 **복원 가능한 공동체 비활성화**다. 교회와 legacy/public 디렉토리는 즉시 원자 비활성화하고, 기존 주 소속 users만 action generation 표식으로 재개 가능한 batch soft-delete한다. Auth·roster·잔액·구매·감사자료는 보존하되 inactive 공동체의 신규 가입·읽기/퀴즈 보상·구매·설정 변경은 막고 플랫폼 관리자만 정산을 볼 수 있게 한다.
- Claude 결정이 필요한 항목: ① 삭제가 복원 가능한 비활성화인지 최종 purge인지 ② 주 소속 users 외 개인/외부 roster도 비활성 대상으로 볼지 ③ 양수 roster 달란트와 pending 구매 정산/환불 주체 ④ 기존에 개별 삭제된 users의 복원 제외 여부 ⑤ Auth·private access·구매/감사자료 보존 기간과 관리자 정산 유예. 이 결정 전에는 기존 의미를 임의 확장하는 삭제 cascade/action을 구현하지 않는다.
- 독립 감사에서 `churches create`가 모든 실사용자에게 열리고 legacy directory도 직접 쓸 수 있어 가짜 공동체와 legacy hash를 만들 수 있는 P0/P1을 확인했다. 신규 관리자 가입·입장코드·무소속 점검을 서버 action으로 옮긴 뒤 `churches create`와 private access writer를 닫는 수정은 삭제 정책과 무관하므로 먼저 완료한다. 플랫폼 회원 편집이 churchAdmin의 `churchId`를 바꿔 권한을 새 교회로 이동시키던 경로도 즉시 fail-closed한다.

2026-07-16 T125e-2a/b 로컬 완료, 이름 변경 정책 추가 결정 필요:
- `completeChurchAdminSignup`, `rotateChurchAccessCode`, `ensureUnaffiliatedChurch`를 서버 authority로 연결했고 `churches` create, `churches/private`, `settings/churchDirectory` 브라우저 write를 닫았다. 신규 가입은 검증된 token uid/email/provider, strict 동의·조직 입력, private access hash, legacy/public 투영과 lifecycle 원장을 한 transaction에 쓴다. 코드 회전은 version CAS·관리자 소유 증명·비밀 없는 원장, 무소속 점검은 platform/super 권한과 exact canonical 교체를 사용한다. 플랫폼 회원 편집의 관리자 교회 이동도 UI와 저장 경계 양쪽에서 차단했다.
- 삭제는 위 정책이 정해질 때까지 기존 multi-batch 부분 삭제 함수와 실행 버튼을 제거하고 `교회 비활성화 정책 확인 중` 안내만 남겼다. 데이터나 Auth를 임의로 삭제하지 않았다.
- 현행 제품에는 정식 교회 이름 변경 UI가 없다. `churches.name`, `settings/churchDirectory`, `publicChurches` 외에 기존 일반/관리자 `users.churchName`이 화면·로그인 기억·성경 버전 허용에 사용되고, 개인 계정의 조직명도 별도 snapshot으로 남을 수 있다. 이름 변경 시 **원본/디렉토리만 즉시 변경하고 기존 snapshot은 로그인 때 점진 보정**할지, **모든 users/roster snapshot을 재개 가능한 batch로 fanout**할지 결정이 필요하다. 결정 전에는 불완전한 rename action을 만들지 않는다.
- 독립 재감사 후 Google 가입 응답 유실 canonical 복구, `publicDirectoryMeta`·rebuild lock 원자 방어, `settings/{settingId}` 중복 match의 directory 쓰기 OR 우회 차단, Firestore REST timestamp 0/3/6/9자리 호환, legacy directory 전체 최소 투영·root 비밀 제거, 플랫폼 회원 편집의 최신 역할 transaction 검증, 입장코드 응답의 uid/church 문맥 fence까지 추가했다.
- 전체 `npm run validate`(platform-api 421 tests), `npm run build`, Deno check/fmt, `git diff --check`를 통과했다. 원격 rules dry-run은 Firebase CLI 인증 만료로 막혔고 로컬 Java도 없어 컴파일을 대체하지 못했다. **Edge·웹·rules 배포와 push는 하지 않았다.** 배포 시 순서는 Edge → 웹 → rules로 유지한다.

2026-07-16 T125e-1 교회 검색 노출·T127h 개인 계정 전환 서버 이관 로컬 완료:
- `adminSetChurchVisibility`는 platformAdmin/superAdmin 본문 역할을 transaction에서 다시 확인하고 교회 `hiddenFromDirectory`, 최소 legacy 디렉토리, `publicChurches`, `platformAdminActions/{requestId}`를 원자 처리한다. public 문서 누락은 drift로 보고 `exists:false` 생성하며, legacy code/hash 필드는 재투영에서 제거한다. no-op은 원장을 만들지 않고 exact replay·UUID 충돌·최대 3회 409·apply-then-409를 검증한다.
- `convertToPersonalAccount`는 비익명 UID와 강제 갱신된 ID token email claim, 활성 member users, source church/roster, collectionGroup 최대 4개 조회, `users/{uid}/activityActions/{requestId}`를 한 transaction에 묶는다. source roster가 없을 때만 최신 users 진도·소속으로 0 지갑을 만들고 이미 3개 roster면 4번째 생성을 거부한다. users talent/`talentWalletMigrated`는 건드리지 않고 기존 지갑 action이 후속 수렴한다. 전원 달란트 초기화 표식 true와 late positive users 잔액도 합계 상한 안에서 허용한다.
- 클라이언트는 Auth email 변경과 private credential 저장 뒤 requestId를 localStorage에 먼저 보존하고 `getIdToken(true)` 후 action을 호출한다. 새 action 응답 유실은 같은 UUID replay, 구 브라우저 `roster` 단계의 users commit 유실은 canonical source-server users 확인으로 복구하며 personal 계정으로 재로그인해도 App effect가 pending을 끝낸다. 로컬 상태가 없는 다른 기기에서도 활성 member·source 교회·null primary·이름/생년월일·canonical UID와 실제 Auth pseudo-email/전화 끝 4자리가 모두 정확히 맞을 때만 `step:email`을 재구성한다. 완료 뒤 users와 roster를 source-server로 다시 읽고 기존 개인 지갑 action까지 마친 뒤에만 local 상태를 지운다.
- 전체 `npm run validate`(platform-api 354 tests), `npm run build`, Deno check/fmt, `git diff --check`와 독립 재감사를 통과했다. **Edge·웹 배포와 push는 하지 않았다.** T125e 다음 독립 코드는 신규/변경/삭제 교회 writer이며 `platformStats` 필드 의미는 아래 기존 질문에 대한 Claude 결정 전까지 계속 보류한다. T127 다음 감사 후보는 플랫폼 관리자의 stale 전체-user 편집/교회 이동, 개인 primary 변경·일반 공동체 탈퇴다. rules 호환 창은 최신 배포 뒤 7일 관찰 전까지 닫지 않는다.

2026-07-16 T127g 혼자 읽기 참여 서버 이관과 읽기 흐름 자동 이동 로컬 완료:
- `joinSoloCommunity`는 비익명 personal UID와 exact 빈 payload·UUID에 결속한다. 한 transaction에서 canonical users, 현재 모든 roster(최대 3개), `unaffiliated_v1` target, primary와 최소 schema1 원장을 검증해 신규 생성·누락 필드 복구·primary 복구·replay/no-op을 구분한다. 브라우저의 직접 roster/users 쓰기는 제거했고 참여 전후 및 지갑 이관 뒤 source-server 상태만 적용한다.
- T97 이전 roster의 `talent`와 `extraMemberships`가 실제 누락된 경우에만 0/[]로 materialize한다. null·문자열·음수·범위 초과와 손상 소속은 fail-closed한다. 최종 감사에서 최신 서버 roster 잔액을 오래된 migration 응답이 다시 덮던 경합과 A→B→A 계정 세대 경합을 수정했다.
- 퀴즈는 현재 클릭이 서버 canonical terminal로 확정되고 gate가 실제로 열린 뒤 `다음 읽기` CTA로 이동한다. 읽기 완료는 새 `uid+requestId`일 때 파란 DAY 헤더로 이동한다. 초기 복원·첫 오답·오류·문항 없음·계정/본문/계획 전환의 오래된 신호는 무시하고, 두 프레임 레이아웃 안정화·고정 메뉴 여백·움직임 감소 설정을 적용했다.
- 전체 `npm run validate`(platform-api 318 tests), `npm run build`, Deno check/fmt, `git diff --check`, 로컬 비로그인 공개 화면 콘솔 검사와 독립 diff 재감사를 통과했다. 로그인 계정으로 실제 퀴즈 클릭을 만들지는 않아 운영 데이터를 변경하지 않았다. **Edge·웹 배포와 push는 하지 않았다.** 다음 코드 작업은 T125e 통계 의미 확정과 플랫폼 관리자 편집/개인 계정 전환/일반 공동체 탈퇴 등 잔여 직접 writer 최종 감사다. 최신 변경 배포는 fresh 사용자 지시가 있을 때 Edge→웹 순서이며 rules는 관찰 종료 전 닫지 않는다.

2026-07-16 T127c~f 로컬 완료, 최종 관찰 전 compatibility risk 명시:
- `users` 본인 규칙은 삭제/복구·`onboardingPending`·소속 보호 필드를 닫고, 공동체 관리자는 같은 교회 일반 교인의 삭제 감사와 소속 필드만 바꿀 수 있게 축소했다. 개인 계정은 `talentMigrated:true` 이후 users와 primary/secondary 모든 roster의 score/talent가 브라우저에서 완전히 동결된다. primary roster 및 양수 잔액 roster는 본인·공동체 관리자·플랫폼 관리자 브라우저에서 삭제할 수 없고 UI도 최신 transaction 잔액을 먼저 확인한다. 신규 관리자/무소속 users create는 accountType/primaryOrgId 없음, score/talent 0, `talentMigrated:true`, `extraMemberships:[]`, 빈 소속을 강제한다. 서버 서비스 계정 action만 이 경계를 우회한다.
- `migratePersonalTalentWallet`은 비익명 UID의 canonical personal users와 primary roster를 transaction에서 검증해 users legacy talent를 roster로 옮기고 `talentWalletMigrated:true`, users talent 0, schema1 원장을 함께 기록한다. exact replay·최대 3회 409·late positive refund 재이관을 지원한다. primary roster가 이미 사라졌지만 users가 canonical이면 무쓰기 `primaryMissing`으로 로그인은 복구하고, 클라이언트는 API의 지갑 값을 사용하지 않고 users를 source-server로 다시 확인한다.
- `normalizeLegacyReadingPosition`은 모든 로그인에서 users와 canonical roster를 감사한다. users Day>365는 modulo+readCount로 옮기고, users가 정상이어도 roster의 위치 drift/필드 누락은 roster-only transaction으로 복구한다. 이름 `진정희`에 결속돼 Day 91/readCount 4를 쓰던 임시 코드는 삭제했다. 일시적 네트워크/5xx 감사 실패는 정상 범위 사용자의 로그인을 막지 않지만, 로컬 users Day가 범위를 벗어나면 source-server 정규화 성공 없이는 진행하지 않는다.
- `completeMemberOnboarding`은 exact `{requestId,orgId,planId,departmentId,subgroupId}`만 받고 서버 교회 문서의 legacy string/`{name}`/`{id,name}` 조직을 정규화해 users와 optional roster를 원자 갱신한다. 신규 churchAdmin은 rules에서 `onboardingPending:true`, plan/소속 null만 허용하고 commit에서 marker false로 닫는다. 앱은 source-server users와 응답을 대조하고 UID 변경·중복 클릭·stale 조직 로드를 차단한다. 기존 완결 로그인은 추가 대기하지 않는다. 사용처 없는 `SubgroupChangeModal`과 직접 소속 writer는 삭제했다.
- `scripts/audit-t127-legacy-state.mjs`는 Firebase CLI 토큰으로 users/roster/rooms를 읽기만 하고 legacy 진도·개인 지갑·경로/고아 상태의 집계 수만 출력한다. 현재 Firebase CLI refresh token이 만료되어 Google OAuth 재동의 전 운영 실행과 원격 rules dry-run은 막혀 있다. 로컬 Java도 없어 emulator rules compile은 실행하지 못했다. 재인증 후 `node scripts/audit-t127-legacy-state.mjs --target-name '진정희' --expected-day 91 --expected-read-count 4`를 실행하되 출력에는 이름/UID를 남기지 않는다.
- **T127은 아직 완료가 아니다.** 일반 공동체 account의 users `false→true` legacy 점수 보정과 이관 후 `+15/+17`, 비개인 roster 본인 `+15/+17`/users 절대값 동기화, users `currentDay/readCount` 설정 쓰기는 구버전 호환 때문에 남아 있다. `migrateTalentIfNeeded`도 브라우저 수정 가능한 inventory/miniroom을 읽는 legacy 공식이라 즉시 서버 복제하지 않았다. 최신 Edge→웹 배포 뒤 7일 관찰과 운영 dry-run이 0건이어야 rules를 최종 차단한다. 그 뒤 `videoAutoConfig.apiKey` 삭제·YouTube 키 회전·설정 read 차단, `dailyVideos`/directory/platformStats 직접 write 차단을 같은 순서로 진행한다. `users` read 규칙은 계속 수정하지 않는다.
- 당시 다음 확정 P1이었던 `CommunityMembershipCard.joinSoloCommunity`는 T127g에서 최대 3개 검증·primary 지정·멱등 응답을 포함한 서버 action으로 이관했다. 양수 roster 탈퇴는 현재 안전 차단 상태이며 잔액 환불·이관·명시적 포기 정책이 확정되기 전에는 다시 열지 않는다. 남은 독립 writer는 플랫폼 관리자 사용자 편집의 stale 전체 필드 merge, 개인 계정 전환/일반 공동체 탈퇴 direct roster writer다. 최신 규칙보다 웹을 먼저 배포해야 하며, 이번 배치에서는 Edge·웹·rules 배포와 push를 실행하지 않았다.

2026-07-16 T127b 업적 동기화 서버 권위 전환 로컬 완료, 다음 writer 감사:
- 기존 `checkAchievements`는 브라우저가 users의 진행·점수·연속·메모 수를 판정해 `achievements`를 직접 transaction merge했다. `syncAchievements({requestId,trigger})`는 비익명 Firebase uid에 결속하고 브라우저가 상태·업적 ID를 보내지 못하게 exact payload를 강제한다. 서버의 users 문서만 읽어 기존 14개 조건과 순서를 계산하며 `read` trigger는 메모 업적을 판정하지 않고 `memo` trigger만 저장된 memos map key 수를 사용한다.
- 기존 unknown 업적 ID는 순서대로 보존하되 중복을 제거하고 신규 known ID만 catalog 순서로 뒤에 붙인다. 신규 항목이 있을 때 users 배열과 PII 없는 최소 `activityActions/{requestId}`를 한 transaction에 쓰며, no-op은 원장도 만들지 않는 무쓰기다. 같은 UUID exact replay, 손상/충돌 원장, 삭제·익명 사용자, 잘못된 currentDay/streak/score/achievements/memos, 최대 3회 409 및 apply-then-409를 회귀 테스트로 고정했다.
- 클라이언트는 impossible response 조합과 unknown/중복/비정렬 ID를 거부한다. 읽기는 completion 위치를 다시 확인한 source-server 최종 상태에서만 toast를 내고, 메모는 본문 저장 성공 뒤 업적 실패를 별도 경고로 끝내 동일 문장 중복 append를 막는다. 지연 toast는 UID·업적 ID·세대에 결속하고 계정 전환과 재시작 요청 시작 시 폐기하므로 재시작 commit 뒤 응답이 유실돼도 이전 epoch 업적이 나타나지 않는다. 같은 재시작 UUID의 exact replay도 이전 완료·보너스 UI를 먼저 정리한다.
- 전체 `npm run validate`(platform-api 238 tests), `npm run build`, Deno check/fmt, `git diff --check`를 통과했고 독립 재감사에서 발견된 replay UI 1건까지 수정 후 P1/P2/P3 잔여 0건을 확인했다. **아직 Edge·웹 배포와 push는 하지 않았다.** rules도 관찰 전에는 닫지 않는다.
- 다음 감사에서 별도 서버화/정책 확정이 필요한 후보는 (1) `helpers.migrateTalentIfNeeded`의 users 점수·달란트 1회 이관, (2) `useUserAuth`의 legacy 현재 Day/readCount 보정, (3) `App.handleSubgroupSelect`·`useDepartment.changeSubgroup`의 사용자 소속 전체문서 갱신, (4) 개인 지갑 legacy 이관·관리자 초기화다. 특히 달란트 이관은 브라우저가 수정 가능한 inventory/miniroom 값을 공식 잔액 계산에 사용하므로 현 공식을 그대로 서버 action으로 복제하지 않는다. 운영 미이관 건수와 허용 정책을 먼저 확인한다. `platformStats` 의미 불일치는 T125e 메모의 Claude 결정 대기 상태를 유지하며 `changeStartDate`는 보상 필드와 독립적인 사용자 설정 writer로 남길 수 있다.

2026-07-16 T127a 읽기 Day 1 재시작 서버 권위 전환 로컬 완료:
- 기존 `handleRestart`는 users 일부만 직접 쓰고 DB `readCount`와 로컬 값을 다르게 만들며, roster 진도는 남기고 `dailyAdvance*`를 지워 같은 날 보상을 반복 적립할 수 있었다. 재시작 모달은 `setShowRestartConfirm(true)` 호출이 없어 화면에서 열 수도 없었고 묵상을 삭제한다고 잘못 안내했다.
- `restartReading({cycle,day,readingEpoch,requestId})`을 추가했다. 비익명 Firebase uid와 현재 위치를 transaction 안에서 검증하고 users, 최대 3개 canonical roster, `activityActions/{requestId}`를 한 commit으로 갱신한다. 같은 UUID exact replay는 재초기화하지 않고 최신 상태를 반환하고, 다른 위치·epoch·payload 충돌과 4개/비정규 roster, 미래 날짜·손상 보상 표식은 무쓰기 거부한다. Firestore 409는 최대 3회 재시도한다.
- 재시작은 `currentDay=1`, score/streak/achievements/dayOffset와 legacy 퀴즈 활성 필드만 초기화한다. `readCount`, talent/roster talent, memos/history, maxStreak, recentReadDates, secretShopUnlocked, `dailyAdvanceDate/count`, `quizProgress`, `quizRewardDate/Amount`는 보존한다. 미완독을 완독으로 표시하지 않으면서 과거 namespace를 끊기 위해 `readingEpoch`만 증가시킨다.
- `completeRead`는 optional epoch가 없는 구버전 요청을 epoch 0으로 호환하되 현재 users epoch와 결속한다. 퀴즈 키는 epoch 0의 기존 `rN_dN`을 유지하고 epoch 1부터 `eN_rN_dN`을 사용한다. submit/skip UUID·의미 원장도 epoch를 검증하므로 재시작 전 탭은 즉시, 과거와 같은 Day에 다시 도달해도 쓰기·repair·보상을 수행하지 못한다.
- 클라이언트는 UID별 최초 restart payload/UUID를 결정 결과 전까지 보존하고 결과 불명/5xx/network/잘못된 2xx에는 같은 요청을 재전송한다. strict 응답 검증과 응답 전후 UID guard 뒤 canonical roster 경로를 Firestore `source:'server'`로 찾고 users·모든 roster 값은 같은 read-only transaction snapshot에서 읽는다. 조회 전후 경로 집합이 달라지면 최대 3회 뒤 fail-closed해 user와 지갑의 혼합 시점 상태를 적용하지 않는다. 사용자 상태와 랭킹 재조회 모두 세대 guard를 사용하며, 처리 중 모달 잠금과 날짜 설정 화면의 실제 진입점을 추가했다. 안내 문구는 보존/초기화 범위와 당일 보상 중복 방지를 그대로 설명한다.
- 독립 재감사에서 legacy `lastReadDate`/`quizDate+quizSolved`가 신규 당일 guard보다 최신이거나 신규 필드가 없는 혼합 상태를 추가로 발견해, 최신 완료일을 보수적 보상 차단 표식으로 승격·저장한다. `dailyAdvanceDate+count 0`은 유효하게 보존하고 `recentReadDates`는 legacy·ISO date/datetime 혼합값을 검증 후 원문 보존한다. 재시작/퀴즈/날짜 변경 응답이 지연되는 동안 다른 탭·계정·epoch·퀴즈 설정이 바뀌면 최신 서버 상태만 유지하고 오래된 성공 효과를 막으며, restart replay는 이전 요청 확인으로 끝내 새 재시작 성공으로 오인하지 않는다.
- 전체 `npm run validate`(platform-api 222 tests), `npm run build`, Deno check/fmt, `git diff --check`를 통과했다. **아직 Edge·웹 배포와 push는 하지 않았다.** 최종 T127 관찰 시계는 T125 잔여와 이 변경을 포함한 최신 배포 뒤 다시 시작한다. 다음 독립 감사 대상은 `checkAchievements`를 포함한 남은 users 보호 필드 직접 writer다.

2026-07-16 T125d `publicChurches` 안전 백필 기반 로컬 완료, T125e 통계 정의 질문:
- `rebuildPublicChurches`는 platformAdmin/superAdmin만 호출하고 브라우저 입력은 `dryRun`뿐이다. 서버가 `churches`와 기존 `publicChurches`를 페이지 끝까지 읽어 무소속·삭제 교회를 제외하고 정확한 `{id,name,hidden?}` 투영을 계산한다. dry-run은 transaction/write 0건이며 잘못된 원본은 실행 전에 전체 거부한다.
- 실행은 레거시 `settings/churchDirectory`의 updateTime을 원본 스캔보다 먼저 확보한다. `platformInternal/publicDirectoryRebuild`의 10분 ownerToken lease와 `meta.ready=false`를 먼저 원자 설정하고, 공개 batch·레거시 mirror·최종 meta마다 현재 owner를 transaction에서 다시 확인한다. 만료 인수 뒤 이전 worker 쓰기/cleanup, 같은 requestId 중복, 레거시 direct writer 경합, acquire 응답 유실을 회귀 테스트로 막았다. Firestore canonical `ABORTED`/`FAILED_PRECONDITION`도 재시도 가능한 충돌로 보존한다.
- `publicDirectoryMeta/current`는 이번 단계에서 항상 `ready:true, mode:legacy, schemaVersion:1, count`로 끝난다. 앱과 rules는 향후 `mode:public`이 명시될 때만 새 컬렉션을 읽고, count·exact schema 중 하나라도 틀리면 기존 디렉토리로 안전 복귀한다. 남은 직접 writer와 T127 관찰이 끝나기 전 public mode를 켜지 않는다.
- 관리자 UI는 서버 dry-run 요약을 확인한 뒤 실행하며, 입장코드 변경에서 이름/숨김과 무관한 레거시 디렉토리 재쓰기를 제거했다. 전체 validate 191 tests, build, rules dry-run compile, diff 검사와 독립 재검토(P1/P2/P3 없음) 통과. **Edge·웹·rules 배포, 운영 백필, mode 전환, push는 하지 않았다.**
- **Claude 결정 필요 — T125e 통계 불변식:** 현재 신규 계정 경로는 `total_readers`를 누적 증가하고 신규 교회 경로는 `total_churches`를 누적 증가한다. 읽기 서버는 `readers_today`를 당일 첫 읽기 인원, `finished_total`을 완독 이벤트 누적으로 처리한다. 반면 관리자 “통계 지금 갱신”은 `total_readers=현재 users 수`, `total_churches=현재 비삭제 교회 수`, `finished_total=현재 readCount>=2 사용자 수`로 덮어쓰고 UI 라벨은 “올해 완독자”라 의미가 서로 다르다. `rebuildPlatformStats({dryRun})` 전에 각 필드를 누적 이벤트/현재 활성 수/연간 고유 인원 중 무엇으로 고정할지 확정이 필요하다. 그 전에는 수치를 추측해 이전하지 않는다.
- 통계 결정과 독립적인 T127 선행 `useUserBibleActions.handleRestart` 서버 action 이관은 위 T127a에서 완료했다.

2026-07-16 T123 실로그인 shadow 확인·읽기/퀴즈 서버 쓰기 전환 로컬 완료:
- 일회용 Firebase 개인 계정으로 개발 앱에서 실제 읽기 1회와 퀴즈 1회를 실행해 `[read-shadow] match:true`와 `[quiz-shadow] match:true`를 각각 확인했다. 로그는 상태·불일치 키·위치·문항 키만 남겼고 금액·잔액·개인정보는 남기지 않았다. 검증 뒤 Auth, users, private, history를 완전히 삭제하고 platformStats가 테스트 전후 동일함을 확인했다.
- `completeRead`는 Firebase 비익명 uid와 `{cycle,day,requestId}`만 받아 users, 최대 3개 canonical roster, history, `activityActions` ledger, 첫 독자·완독 platformStats를 같은 Firestore transaction에 쓴다. 같은 UUID replay는 입력을 결속하고 최신 상태를 반환하며 409 read/write 경합은 bounded retry한다. React의 읽기 직접 transaction·platformStats 쓰기·실패 폴백은 제거했다.
- `submitQuiz`는 `{progressKey,quizKey,selectedIndex,attemptSlot,requestId}`만 받아 서버 정답 인덱스·현재/방금 완료 위치·2회 시도·달란트 v1/v2를 다시 계산하고 users/roster/UUID ledger를 원자 반영한다. 같은 transaction에서 `quizAttemptSlots/{progressKey}_a1|a2|skip` 의미 원장을 최초 1회만 생성하므로 여러 탭이 서로 다른 UUID로 같은 시도를 보내도 한 건만 소비된다. 둘째 시도·건너뛰기 원장이 있으면 과거 첫 요청 replay도 최신 terminal progress와 당일 보상 marker를 복구한다. `skipQuiz`도 제출과의 경합에서 먼저 완료된 상태를 다른 요청이 덮지 않는다. 정답 인덱스·조직 경로·잔액 원본은 응답과 로그에 없다.
- 세 클라이언트는 세션에 최초 payload와 UUID를 보존하고 결과 불명·5xx·network·잘못된 2xx에서는 같은 요청을 재시도한다. 결정적 오류/정상 strict 응답에서만 키를 지우며, API 토큰 발급 전후와 응답 적용 전에 최초 Firebase uid를 결속한다. 서버의 canonical roster 응답이 브라우저 캐시에 없던 명부 행도 복구하며 직접 쓰기 폴백은 없다.
- 자동 검증은 전체 `npm run validate`(platform-api 175 tests), `npm run build`, Deno check/fmt, `git diff --check`를 통과했다. 독립 보안 검토에서 roster 경로 alias, 미래·손상 날짜, 안전 정수 상한, ledger 날짜, read 409 retry, 보상 marker 우회, 계정 전환 재시도, 의미 기반 attempt slot 경합, submit/skip 경합, 과거 replay의 최신 terminal 복구, 불가능한 응답 조합, 정렬 표류와 빈 명부 캐시를 보강했다.
- **아직 배포·push하지 않았다.** 기존 2026-07-23 05:14 KST 시계는 T126 영상 경로만의 최소 관찰이다. 읽기·퀴즈 및 다음 T125 잔여까지 포함하는 최종 T127 7일 시계는 최신 Edge→웹 배포 시점부터 다시 시작해야 한다. 그 전에는 사용자 보호 필드 직접 쓰기 규칙을 닫지 않는다.
- 당시 T127 차단 전 추가 이관 대상으로 남았던 `useUserBibleActions.handleRestart`는 위 T127a에서 서버 action으로 옮겼다. `BibleQuizCard.skipToday`도 `skipQuiz` 서버 transaction을 사용한다. 이제 `checkAchievements` 등 남은 보호 필드 직접 writer를 전수 감사해야 한다.
- T124d 실운영 스모크는 `클로드테스트교회`에 안전한 관리자 자격증명·fixture가 없고, 정상 판매→구매→수령/환불은 지갑과 불변 ledger를 영구 변경한다. 실제 관리자 암호를 재설정하거나 운영 잔액을 임의 조작하지 않았다. 사용자가 승인된 disposable 공동체/계정을 제공하기 전까지 외부 게이트로 유지한다.

2026-07-16 T126e 운영 배포·검증 완료, T127 관찰 시작:
- 사용자 M-V1 완료를 값 출력 없이 secret 이름으로 확인했다. 전체 `npm run validate`(platform-api 134 tests), `npm run build`, `git diff --check` 후 platform-api Edge v7→v8, 이어서 GitHub Pages 웹을 배포했다. 공개 HTML은 `index-DmqfwdoF.js`와 `index-DS2sg2XL.css`를 사용하고 관리자 lazy asset 2개도 200이며, main JS는 로컬 빌드와 SHA-256이 일치한다.
- Edge는 허용 origin OPTIONS 204, 미인증 401, 잘못된 origin 403이다. `dailyVideos/2026-07-16`이 없던 자연 상태에서 익명 게스트 동시 2요청을 첫 resolve로 실행해 하나는 약 1.09초 뒤 adult+kids full 200, 다른 하나는 약 0.55초 뒤 `pending:true`와 약 90초 `retryAfterMs` 200을 받았다. 이후 자동 문서가 생성돼 한 worker만 fill lease를 획득한 동작을 확인했다.
- 임시 비익명 Firebase 계정의 resolve도 200/full이며 저장 영상의 URL·제목·게시일 보호 필드는 전후 동일했다. 두 테스트 Auth 계정은 즉시 삭제했다. 공개 앱 게스트 화면은 저장 영상을 바로 표시했고 성인·어린이 미리보기가 서로 다르며 콘솔 오류는 0이었다.
- 조건부 미검증: 배포 당시 오늘 문서는 신규 자동 문서라 현재 날짜 수동 문서의 URL·제목·게시일·`autoFilled` 불변을 라이브로 재현할 수 없었다. 운영 자격증명을 사용하지 않아 실제 platformAdmin의 무쓰기 `adminPreviewDailyVideo` 200도 관찰 항목으로 남긴다. 이를 강제로 만들기 위한 운영 문서·설정 변경은 하지 않았다.
- Supabase Cron은 공식적으로 `pg_cron`+`pg_net` 예약 호출을 지원하고 03:02 KST는 기본 UTC 기준 `2 18 * * *`로 제안할 수 있다. 그러나 현행 resolve는 Firebase Bearer가 필수라 공식 publishable-key 예시로는 401이고, Free 프로젝트 pause도 있어 즉시 연결하지 않는다. T126은 lazy 복구로 완료한다. 향후 별도 승인 시 server-to-server 전용 action과 Vault/Edge 공용 secret 설계를 검토한다. 공식 근거: https://supabase.com/docs/guides/functions/schedule-functions, https://supabase.com/docs/guides/cron, https://supabase.com/docs/guides/platform/free-project-pausing
- T127 7일 관찰은 2026-07-16 05:14 KST부터 시작한다. 2026-07-23 05:14 KST 이전에는 rules 차단, legacy `videoAutoConfig.apiKey` 삭제·키 회전, 설정 read 차단을 진행하지 않는다. 관찰 종료 후에도 사용자 별도 승인과 dry-run 감사가 필요하다.

2026-07-15 T126d 매일 영상 관리자 화면 서버 전환 로컬 완료, T126e 수동 게이트 대기:
- `adminPreviewDailyVideo`는 엄격한 `{adultPlaylistId,kidsPlaylistId}`만 받고 비익명 Firebase 인증→활성 users 문서→platformAdmin/superAdmin 역할 검사를 통과한 뒤 실행한다. 서버 KST 서비스 날짜와 서버 키를 사용하며 Firestore write·transaction·daily 문서·job lease를 만들지 않는다.
- 관리자가 아직 저장하지 않은 현재 폼 playlist를 성인/어린이 모드별로 병렬 확인한다. 날짜 일치 영상 없음, YouTube HTTP 실패, timeout은 해당 모드 null로 격리하고 다른 모드 성공은 보존한다. 응답은 action/requestId echo, serviceDate, 공개 adult/kids entry|null만 포함하며 apiKey·playlistId·config·경로·lease 상태는 내보내지 않는다.
- `PlatformAdminView`의 API 키 state·로드 참조·입력·저장과 임시 `adminDailyVideoPreview.js` 브라우저 YouTube 호출을 제거했다. 설정 저장은 playlist·enabled·updatedAt만 merge하고, 수동 `dailyVideos` 등록·삭제 직접 쓰기는 설계대로 유지한다. 클라이언트는 입력과 2xx 응답의 키 집합·날짜·모드·requestId·HTTPS YouTube URL·matchedDate를 fail-closed 검증한다.
- 전체 `npm run validate`(platform-api 134 tests), `npm run build`, Deno check/fmt, `git diff --check`와 서버·UI 독립 재감사를 통과했다. `firestore.rules`는 건드리지 않았고 Edge·웹 배포와 push도 하지 않았다.
- 중요 단계적 잔여: 화면 코드가 `d.apiKey`를 사용하지 않아도 현재 `settings/videoAutoConfig` 문서 자체는 signed-in 사용자에게 통째로 읽히고 legacy `apiKey`도 T127 전까지 남는다. 따라서 이번 단계는 신규 브라우저 사용·저장 경로 제거이지 키 보호 완료가 아니다. T127 관찰 종료 뒤 config read 차단, legacy 필드 삭제, 노출 키 회전을 반드시 함께 수행해야 한다.
- 다음 T126e는 사용자 수동 M-V1 `YOUTUBE_API_KEY` secret 설정과 명시적 배포 지시가 선행 조건이다. 확인되면 Edge → 웹 순서로 배포하고 게스트/로그인/관리자·pending·수동 불변·멀티탭 lease 스모크를 수행한다.

2026-07-15 T126c 매일 영상 일반 클라이언트 서버 전환 로컬 완료, T126d 진행 대기:
- `DailyVideoCard`는 Firestore 캐시를 즉시 표시하고 authoritative snapshot을 계속 관찰하면서, 준비되지 않았거나 45분 TTL이 지난 경우에만 인증된 `platformApi.resolveDailyVideo()`를 호출한다. 일반 사용자·익명 게스트 경로에서 YouTube API 직접 호출 3곳, `videoAutoConfig` 읽기, `dailyVideos` create/lazy-fill 쓰기를 제거했다.
- pending/실패는 기존 2/5/15/30분 뒤 시간당 backoff를 유지하되 서버 `retryAfterMs` 최소시각을 날짜별 메모리+sessionStorage에 monotonic하게 보존한다. KST 서비스 날짜 변경 응답은 새 effect로 이월하고, 수동 문서의 null 모드는 자동 transient로 채우지 않는다.
- 요청 시작 snapshot 세대와 응답 후 authoritative snapshot을 비교해 늦은 HTTP가 관리자/다른 worker 쓰기를 덮지 않게 했다. 자체 one-mode write가 HTTP 전후 어느 순서로 와도 중복 resolve를 막고, TTL 타이머·focus/visibility 재검사와 metadata 경합에서도 갱신 시각을 놓치지 않는다.
- 응답은 action/requestId/date/키 집합과 YouTube HTTPS URL을 엄격히 검증한다. platform-api 129 tests를 포함한 `npm run validate`, `npm run build`, `git diff --check`, 독립 재감사를 통과했고 `firestore.rules`는 건드리지 않았다. Edge·웹 배포와 push도 하지 않았다.
- `PlatformAdminView`의 기존 연결 테스트 helper만 `adminDailyVideoPreview.js`로 임시 격리했다. 다음 T126d에서 무쓰기 platformAdmin 전용 `adminPreviewDailyVideo` 서버 action으로 교체하고 helper를 삭제해야 한다. T126e 배포 전 사용자 수동 M-V1 `YOUTUBE_API_KEY` secret 설정이 필요하다.

2026-07-15 T126b chapters·기도제목 서버 TTL 갱신 로컬 완료, T126c 진행 대기:
- 저장 문서의 `chaptersRefreshedAt`은 45분 TTL로 판정하고, 수동 저장의 더 최신 `updatedAt`은 즉시 갱신하되 서버 현재보다 미래인 값은 신뢰하지 않아 연속 YouTube 호출을 막는다. 저장 URL은 raw authority부터 엄격히 검사해 허용된 YouTube HTTPS 주소의 정확한 11자 video ID만 사용한다.
- 기존 `dailyVideoJobs/{date}` 하나를 fill/refresh가 공유하되 lease 목적과 attempt/backoff 필드는 분리했다. 빠진 영상 fill이 우선이며 refresh는 유효 ID가 하나 이상 있을 때만 lease를 잡는다. videos API만 병렬 호출하고 공용 60초 deadline을 사용한다.
- 전체 성공은 대상 모드 전부의 chapters가 파싱됐을 때만 인정한다. 성공 모드에는 `adult.chapters`/`kids.chapters` nested mask만 쓰고, 전체 성공 때만 `chaptersRefreshedAt`을 함께 전진한다. 부분·실패는 기존 값과 문서 메타데이터를 보존하고 refresh 전용 backoff를 남긴다. 수동 URL·chapters 수정, 문서 삭제, 설정 변경, lease 목적·세대 변경은 updateTime/config/owner/purpose/generation fence로 오래된 worker 결과를 폐기한다.
- 미래 updatedAt 반복 due, 명시적 `:443` 정규화 우회, 유효+추출 불가 혼합 모드의 전역 TTL false-success, fill 중 partial 문서 삭제 후 재생성을 회귀 테스트로 고정했다. `_shared/firestore` 실제 인코더가 nested map과 DocumentMask를 만드는 테스트도 추가했다. 공유 fixture 35건, 관련 42 tests, platform-api 전체 129 tests, `npm run validate`, `npm run build`, Deno fmt/check, validator, `git diff --check`, 독립 재감사를 모두 통과했다. `firestore.rules`는 건드리지 않았다.
- 아직 Edge·웹 배포와 push는 하지 않았다. 다음 구현은 T126c `DailyVideoCard`의 Firestore 캐시 우선→`platformApi.resolveDailyVideo()` 전환과 브라우저 YouTube 호출·설정 읽기·daily 쓰기 제거다. T126e 배포 전 사용자 수동 M-V1 `YOUTUBE_API_KEY` secret 설정이 필요하다.

2026-07-15 T126a 매일 영상 서버 resolve·lease 로컬 완료, T126b 진행 대기:
- `resolveDailyVideo`는 payload에서 `requestId` 외 입력을 거부하고, Firebase token을 필수로 하되 이 전용 분기에서만 익명 계정을 허용한다. 서버가 KST 오전 3시 기준일과 설정 문서를 결정하며, 수동 문서와 완성 자동 캐시는 외부 호출·쓰기를 하지 않는다.
- 미준비 문서는 `dailyVideoJobs/{date}`의 90초 lease와 2/5/15/30분 뒤 시간당 backoff로 단일화한다. 획득·완료 transaction 사이를 requestId, config updateTime, attemptCount 세대로 묶어 같은 requestId 재획득과 설정·수동 문서 경합에서도 오래된 worker가 저장하지 못한다.
- YouTube playlist와 videos 호출 전체는 공용 AbortSignal과 60초 상한을 사용한다. videos 응답의 exact id·snippet·title을 확인하고 제목 날짜를 다시 검증한 뒤에만 안전한 YouTube URL을 만든다. 일부 성공, timeout, 잘못된 설정은 daily 문서에 저장하지 않고 transient와 backoff만 반환한다.
- 브라우저/서버 정책은 35개 공유 fixture를 사용한다. secret 우선·Firestore 키 fallback, invalid playlist, 빈 videos 응답, deadline, 동일 requestId 새 lease 세대 회귀를 동적 테스트로 고정했다. platform-api 113 tests와 전체 validate/build/diff 검사, 독립 재감사에서 남은 P0/P1이 없음을 확인했다. `firestore.rules`는 건드리지 않았다.
- 아직 Edge·웹 배포와 push는 하지 않았다. 다음 구현은 T126b chapters·기도제목 TTL 갱신이며, T126e 배포 전 사용자가 M-V1 `YOUTUBE_API_KEY` secret을 설정해야 한다.

2026-07-15 T124 관리자 판매·수령·환불 서버 이관·운영 배포 완료, 실로그인 스모크 대기:
- 일반 구매와 관리자 창구 판매·수령·환불은 클라이언트 Firestore transaction을 사용하지 않고 `platform-api`만 호출한다. 서버는 최신 actor/구매자/roster/상점/구매를 transaction snapshot에서 읽고 관리자 3개 action은 브라우저가 읽거나 쓸 수 없는 `talentAdminActions/{requestId}` ledger와 함께 원자 commit한다.
- 결과 불명 재시도는 같은 UUID를 세션에 보존한다. 모든 2xx 본문을 action·requestId·alreadyCompleted·안전한 최신 잔액·지갑·구매 ID/상태까지 확인한 뒤에만 키를 지우며, 나중에 구매 문서의 `requestId/adminActionRequestId`가 보이면 오래 남은 키를 정리한다.
- R25-2 문구와 R25-3 클라이언트 구현이 어긋났던 개인 전환 환불을 서버 권위로 복원했다. v2 users 지갑 구매 뒤 활성 member가 `accountType=personal, churchId=null`이고 동일 공동체에 동일 uid 활성 roster가 있을 때 첫 요청은 전용 409로 2차 확인을 요구하고, 확인 요청은 최신 상태를 다시 읽어 roster에 환불한다. mutable `primaryOrgId`와 이관 완료 플래그는 판정 조건으로 쓰지 않는다.
- 일반/관리자 가격·잔액은 숫자 타입의 안전한 정수와 상한만 허용한다. 기본 `npm run validate`에 Deno 전체 테스트·type·format을 묶었고 현재 90 tests, 전체 validate, production build, diff 검사, 3개 독립 재감사를 통과했다.
- `0ab5534`를 main에 push하고 platform-api Edge → GitHub Pages 웹 → Firestore rules 순서로 운영 반영했다(인덱스 변경 없음). 공개 HTML은 새 `index-BbzYXMgP.js`를 사용하고 관리자 lazy asset 2개도 HTTP 200이다. Edge OPTIONS 204·유효 형식 미인증 관리자 요청 401, `talentAdminActions` 비로그인 REST 읽기 403을 확인했으며 rules는 Firebase 재로그인 뒤 컴파일·릴리스까지 성공했다.
- T124d의 실제 관리자 소액 창구 판매 1건, pending 구매 수령 1건, 별도 pending 구매 환불 1건은 운영 데이터 변경과 사용할 공동체·계정·구매 선택이 필요해 미완료로 유지한다. T123b/d2도 개발 환경 실로그인이 필요하다. 두 수동 게이트를 기다리는 동안 다음 독립 구현은 T126a 서버 영상 resolve/lease다.

2026-07-15 R25~26 운영 배포·입장코드 이전 완료, T123 실로그인 shadow 대기:
- `dd7374f`까지 main과 origin/main을 일치시켰다. `JOIN_CODE_RATE_LIMIT_SALT`는 새 무작위값으로 설정하고 값은 출력하지 않았으며, Supabase 목록에서 존재만 확인했다.
- 필수 순서대로 platform-api Edge v5 → Firestore `talentPurchases(status ASC, createdAt DESC)` 인덱스 → GitHub Pages 웹 → Firestore rules를 배포했다. 일반 공개 주소가 새 `index-OCMsjSZz.js`를 반환한 뒤에만 규칙을 올렸다.
- Edge 스모크는 허용 origin OPTIONS 204, 미인증 401, 잘못된 origin 403/CORS 미허용, 잘못된 public payload 400을 확인했다. 공개 웹과 로그인된 운영 대시보드는 새 asset을 사용하며 콘솔 error/warning 0이다.
- 운영 원본 백업은 `/Users/jaeam/Developer/클로드/bible114-church-access-backup-before-migration-20260715-143920.json`, 권한 0600, SHA-256 `d15c76774d21a8d7dbd66d94d7c948e5e08125ecef889c8ac0312106723ecb0f`이다. Firebase 관리형 백업은 Spark 요금제에서 사용할 수 없어 이 로컬 원본 백업을 사용했다.
- 플랫폼 관리자 UI 세션은 없어서 임의 로그인하지 않았다. 대신 일회성 관리 스크립트(실행 파일 SHA-256 `2dfbe2780d51b3f0785b2a6039e7104a79581f99fe014cd2b277c82b28dda480`)를 두 모델이 독립 검토했다. beginTransaction의 같은 snapshot에서 9 public·8 private·directory를 읽고 백업 raw 원본과 비교하며, 정확한 원천 0/7/0/1/0/0·중복/고아/누락 0·18 writes일 때만 같은 transaction으로 commit한다. 틀린 기대값 실패 시험은 rollback되고 post-audit 불변이었다. 실행 뒤 임시 파일은 삭제했다.
- 2026-07-15T05:58:07.254315Z에 18 writes를 원자 커밋했다. 직후 감사 결과 공개 `churchCode/churchCodeHash/code` 0, 디렉토리 `codeHash/churchCode/code` 0, private/access present 8·valid 8·missing 0, 원천 private 8이다. `adminEmail/adminUid`는 이번 입장코드 이전 범위가 아니어서 현행 9건을 유지했다.
- 2026-07-15T06:00:54Z 재감사도 같은 0/8 상태를 유지했다. 다음 필수 재감사는 T127 관찰 종료 시점이며, 그 사이 운영 이상이 보이면 같은 읽기 전용 감사부터 다시 실행한다.
- 이미 열렸거나 캐시된 구버전 탭은 T127 규칙 차단 전까지 공개 해시를 다시 쓸 수 있다. 즉시 감사 뒤 추가 재감사와 7일 관찰이 필요하며, T127에서 `churchDirectory` 직접 write를 닫기 전까지 공개 0은 영구 강제 상태가 아니다.
- 운영 Chrome은 실제 로그인 계정 대시보드를 정상 표시하지만 로컬 개발 origin은 로그아웃 상태다. shadow 호출·로그는 `import.meta.env.DEV`에서만 살아 있으므로 자격증명·토큰을 추출하지 않고 중단했다. 사용자가 로컬에서 실제 계정으로 로그인한 뒤 읽기 완료 1회와 퀴즈 제출 1회를 하면 `[read-shadow] match:true`, `[quiz-shadow] match:true`를 확인할 수 있다.

2026-07-15 T125 운영 이전 안전 보강 완료, 배포·이전 실행 직전:
- `migrateChurchAccessSecrets`는 이제 `dryRun=true`가 기본이며 사전점검은 쓰기를 전혀 하지 않는다. 실제 실행 버튼은 성공한 사전점검 뒤에만 열리고, 실행 직전 다시 사전점검해 대상·누락·중복·고아·원천별 건수를 확인한다. 코드·해시 원문은 화면과 로그에 표시하지 않는다.
- 실제 이전은 교회별 transaction에서 최신 `private/access`를 다시 읽어 유효한 최신 해시를 절대 덮어쓰지 않는다. 공개 `churchCode/churchCodeHash/code` 삭제와 private 백필을 함께 처리하고, 디렉토리는 모든 교회 transaction 성공 뒤 별도 transaction으로 최신 배열을 다시 읽어 비밀 필드·무소속·중복을 정리한다.
- 신규 동기화·삭제 경로도 쓰기 전에 디렉토리 전체를 정리하므로 새 앱이 다른 항목의 오래된 해시를 재저장하지 않는다. 다만 이미 열려 있거나 캐시된 구버전 탭은 T127 규칙 차단 전까지 공개 해시를 다시 쓸 수 있으므로, 이전 직후와 관찰 기간 뒤 재감사가 필요하다.
- 운영 감사 스크립트는 읽기 전용이 기본이다. `--backup <절대경로>`를 주면 모든 관련 공개 원본, target private/access, 원본 디렉토리를 값 출력 없이 권한 0600 파일에 저장하고 SHA-256만 표시한다. 배포 직전 이 백업을 만들고 실제 이전 뒤 공개 비밀 필드 0건과 private/access 8건을 확인한다.
- 2026-07-15 배포 전 실데이터 감사: 전체 교회 9, 이전 대상 8, private/access 0, 원천은 공개 유효 해시 7 + 공개 평문 1, 원천 누락 0이다. 공개 교회 `churchCodeHash` 8건(무소속 1 포함), `churchCode` 2건, 디렉토리 `codeHash` 8건(유효 7), 중복·고아 0이다.
- 입장코드 정규화는 신규 등록·변경·이전 모두 앞뒤 공백 제거 후 4~128자, 제어문자 없음으로 통일했다. 자동 검증과 독립 코드 재검토는 통과했으며 남은 코드 차단 사항은 없다.

2026-07-15 T123 부서별 달란트 v2 shadow 로컬 준비 완료, 실로그인 게이트 유지:
- 서버에 브라우저 `talentProgram`과 같은 v1/v2 순수 해석을 추가했다. 설정 문서 없음과 상점 OFF인 v1은 기존처럼 적립하고, v2는 소속 부서의 적립 설정과 시장 존재를 확인하되 상점·시장 OFF는 사용만 막고 적립은 유지한다.
- preview는 인증 uid와 canonical roster 경로·문서 uid·조직 중복·최대 3개를 검증하고 orgId로 정렬한 뒤 각 공동체의 `settings/talentShop`을 읽는다. 설정 404만 legacy null로 처리하며 다른 읽기 오류는 보상 없는 결과로 축소하지 않는다.
- 읽기는 직접 users 지갑과 roster 지갑 중 하나라도 적립 가능할 때만 effective `talentEarned`를 표시하고 `talentProgramEnabled`까지 비교한다. 퀴즈도 같은 routing으로 최종 reward와 entry.reward를 계산한다. 시도 0·미완료 stale quizKey만 새 후보 키로 교체하고, 시도 후 키 변경은 계속 거부한다.
- 읽기·퀴즈 클라이언트는 v2에서도 DEV 전용 4초 preview를 실행한다. 응답에는 uid/role/rosterCount, 조직 ID·경로·잔액·설정, 정답 인덱스를 싣지 않고 로그에도 실제 값 없이 match/status/mismatchKeys만 남긴다.
- 로컬 구현과 자동 계약은 준비됐지만 운영 Edge에는 아직 이 변경을 배포하지 않았고 실제 로그인 비교도 하지 않았다. 따라서 T123b와 T123d2 체크박스는 열어 두며, `[read-shadow] match:true`와 `[quiz-shadow] match:true`를 각 1건 확인하기 전 T123c/d3 실제 쓰기 전환 금지.

2026-07-14 배포·push 지침 변경:
- 사용자가 기존 절대 금지를 해제했다. 앞으로 `firebase deploy`, `npm run deploy`, `git push`는 평소에는 하지 않되 사용자가 현재 작업에서 명시적으로 요청하면 Codex가 검증 후 직접 실행하고 공개 결과까지 확인한다.
- 이번 변경은 `04d8d2f` main push, GitHub Pages Published, Firestore rules 컴파일·릴리스, 공개 번들 `index-B-T0nHlS.js` HTTP 200까지 완료했다.

2026-07-14 공동체 다중 소그룹·부서별 달란트 운영:
- 회원 한 명의 공동체 내 소속은 기존 한도를 유지해 주 소속 1개+추가 소속 3개로 통일했다. 직접 users 회원뿐 아니라 개인/타 교회 계정으로 들어온 roster 회원도 같은 관리자 화면에서 추가 배정할 수 있고, 외부 회원의 값은 해당 공동체 roster 원장에 저장한다. 본인은 추가 소속을 직접 바꿀 수 없도록 rules를 강화했다.
- 달란트 설정 v2는 `departmentSettings[departmentId] = { enabled, marketId }`, `markets[marketId] = { name, enabled, items }` 구조다. 여러 부서가 `shared`를 고르면 통합 시장, `department_{id}`를 고르면 전용 시장이다. 잔액은 기존 호환과 부서 이동 안전성을 위해 공동체별 지갑 하나를 유지한다.
- 부서 달란트 OFF는 읽기/퀴즈 달란트와 상점만 끄며 진도·점수·랭킹 동기화는 계속한다. 검수 중 OFF roster에서 진도까지 빠지는 결함을 발견해 모든 roster에는 진도를 쓰고 활성 지갑에만 talent를 쓰도록 분리했다. 첫 읽기 여부도 보상 여부와 분리했다.
- v2 구매 문서는 departmentId/departmentName/marketId/walletKind/walletOrgId를 snapshot으로 남기며 관리자는 선택 시장 소속 회원만 창구 차감할 수 있다. 환불은 현재 소속이 아니라 구매 당시 지갑 snapshot을 우선한다. 구버전 구매/상점은 기존 필드와 동작을 유지한다.
- 후속 T123 작업에서 서버 shadow에 같은 v1/v2 `talentProgram` 해석을 반영해 이제 v2 공동체도 개발용 읽기·퀴즈 비교 대상이다. 실제 서버 쓰기 전환은 여전히 실로그인 match 게이트 뒤에만 진행한다.
- `npm run validate`, `npm run build`, `git diff --check` 통과. 로컬 게스트 대시보드 실제 렌더와 브라우저 오류 0을 확인했다. 로그인 관리자/실회원 Firestore 저장·보상·구매는 테스트 자격증명이 없어 미실행이며, `firestore.rules` 변경은 사용자 배포 뒤에만 운영 적용된다.

2026-07-14 회원가입 동의·아동 가입 보호:
- 모든 신규 가입 경로에 이용약관, 개인정보처리, 종교·공동체 소속 민감정보, 공동체 공개·운영정책을 분리 동의로 적용했다. 사용자가 본 버전·동의 시각·대상·만 14세 미만 여부는 `users/{uid}/private/consent`에 저장하고, 같은 공동체에 공개될 수 있는 users 본문에는 보호자 이름 없는 요약만 둔다. 기존 회원의 일반 Google·Kakao 로그인은 새 가입 동의로 막지 않는다.
- 만 14세 미만은 보호자 성명·관계·직접 동의가 모두 있어야 가입할 수 있다. 현재 무료 구조는 보호자의 진술 기록 방식이며 플랫폼 본인인증이나 법정대리인 자격 검증으로 표시하지 않는다. 향후 더 강한 법정대리인 확인이 필요하면 PASS·휴대폰 인증 등 외부 본인확인 수단을 별도 도입해야 한다.
- 공동체 등록 화면은 복음주의 신앙 공동체만 가능하고 한국교회 주요 교단 공식 결의의 이단·사이비·참여 교류 금지 단체는 제한된다고 쉬운 문구로 안내한다. 전문에는 객관 자료 확인, 사전 통지, 소명 검토, 공동체 조치와 개인 계정 탈퇴의 구분을 넣었다.
- 전체 `npm run validate`, 프로덕션 빌드, diff 검사가 통과했다. 로컬 브라우저에서 아동/성인 분기, 가입 버튼 잠금, 관리자 안내, 개인정보 전문, 콘솔 오류 0건을 확인했으며 실제 계정 생성은 데이터 변경 방지를 위해 하지 않았다.

2026-07-14 활동 공동체 전체 화면 전환:
- 사용자 결정: 여러 공동체는 순위만 따로 보는 필터가 아니라, 카드를 눌러 들어가 동일하게 성경을 읽고 활동하는 공간이다. 별도 `🏆 순위` 흐름은 제거하고 현재 활성 공동체의 일반 `전체보기`가 그 공동체 순위를 보여준다.
- `primaryOrgId`는 다음 로그인 기본값과 탈퇴 보호에만 사용한다. 카드 선택은 비영속 `activeRosterOrgId`만 바꾸며, `기본으로 설정`을 눌러도 현재 활동 화면은 유지한다.
- 성경 본문·진도·퀴즈·묵상·업적은 users 전역 기록을 유지한다. 공지·카카오·구성원·조직·RaceMap·랭킹·공동체 달란트·상점은 활성 공동체 기준으로 전환한다. 읽기·퀴즈 보상의 기존 전체 roster 동기화는 하루 1회 보상 누락 방지를 위해 유지한다.
- 전환 요청 세대 가드와 즉시 초기화로 A→B 빠른 전환 시 A 결과가 B 화면을 덮지 않게 했고, 대상 공동체에 카카오 링크/공지가 없을 때 이전 값이 남지 않게 했다. 전체 자동 검증·빌드 통과. 인증된 다중 공동체 로컬 세션이 없어 실제 카드 클릭 실화면은 배포 전 확인이 남아 있다.

2026-07-14 네이버·Google 앱 TTS 안내:
- 사용자 결정에 따라 NAVER·Google 앱(GSA) 인앱 화면에서는 TTS를 시도하지 않고 `네이버, 구글앱은 TTS를 지원하지 않습니다. 영상을 활용해 주세요.` 문구만 작게 표시한다. 일반 Chrome·Safari는 기존 TTS를 유지하고 카카오톡은 기존 alert 안내를 유지한다.
- 안내 대상 앱에서는 TTS 버튼·속도·목소리 선택과 본문 탭 낭독을 모두 비활성화하며, voice 목록과 `speechSynthesis` 이벤트에도 접근하지 않는다. 자동 검증·빌드는 통과했고 배포 후 네이버·Google 앱 실화면 확인이 남아 있다.

2026-07-14 라운드 24 T123d2 퀴즈 shadow 구현·배포, 실로그인 확인 대기:
- `previewQuizSubmission`은 요청의 progressKey/quizKey/selectedIndex를 엄격히 검사하고, 서버에만 있는 6,657문항 인덱스와 최신 users 문서로 위치·문항·정답·보상을 계산한다. Firestore write는 없고 응답에 answerIndex, 원본 index, 잔액, 조직정보를 싣지 않는다.
- 앱은 개발 환경에서만 기존 퀴즈 transaction 전에 최대 4초 미리보기를 얻고, 성공했을 때만 status와 불일치 필드명으로 비교한다. 실패는 기존 퀴즈 흐름을 막지 않으며 운영 빌드에서는 호출·로그가 없다.
- Codex 통합 리뷰에서 아주 큰 cycle 값이 앱 검사를 통과하지만 서버에서 거부되는 차이를 찾아 양쪽 모두 safe integer로 제한했다. 계약 검사기의 indexRecord 입력을 응답 노출로 오탐한 부분도 응답 객체만 검사하도록 수정했다.
- Deno 전체 40 tests/check/fmt, 전체 validate, build, diff 검사 통과. Edge 재배포 후 OPTIONS 204, 미인증 401, 잘못된 progress/choice 400, 잘못된 origin 403, 잘못된 token 401, 기존 읽기 미리보기 미인증 401을 확인했다.
- 로그인 계정이 없어 `[quiz-shadow] match:true` 실증은 남아 있다. T123d2 체크박스와 실제 쓰기 전환은 이 증거 전까지 열어 둔다.

2026-07-14 라운드 24 T123d1 퀴즈 서버 기반 완료:
- 하위 모델 3개가 결정적 선택지 셔플 공용화, 정답/허용 Day 인덱스 생성, 퀴즈 제출 순수 계산을 분리 구현했다. 생성 인덱스는 표준 4,719 + 신약 쉬움 1,825 + 레거시 bank 113 = 6,657문항이며 재생성 결과를 byte-for-byte 검사한다.
- 서버 계산은 현재 또는 오늘 방금 완료한 위치, user plan/dayOffset의 실제 Day, 정답 위치, 최대 2회, 하루 1회 보상을 검증한다. 레거시 bank는 해당 progress에 이미 저장된 같은 key만 허용한다.
- Codex 통합 리뷰에서 1차 오답 뒤 같은 Day의 다른 허용 문항으로 quizKey를 바꿀 수 있는 틈을 찾아, 저장 quizKey가 있으면 모든 후속 제출이 반드시 같도록 보강했다.
- Deno 전체 38 tests/check/fmt, `npm run validate`(인덱스 최신성 포함), `validate:quiz`, `validate:nt-easy`, build, diff 검사 통과. 아직 API router와 Firestore 쓰기에는 연결하지 않았다.
- 인덱스 생성으로 기존 `whole_bible` 일정이 Day 337 `렘 29:24-32` 뒤 Day 338 `렘 33-36장`으로 넘어가 예레미야 30~32장을 읽기 범위에서 누락한다는 사실이 드러났다. 관련 표준 문제 9개가 어느 계획 Day에도 연결되지 않는다. 서버 이관 판단 밖의 일정 변경이라 수정하지 않았으며 일정 원본 의도 확인 후 별도 작업 필요.

2026-07-14 라운드 24 T123b 비교 장치 구현, 실로그인 확인 대기:
- 하위 모델 3개가 비교 순수 함수, 기존 읽기 훅 연결, 정적·동적 회귀 검사를 분리 구현했다. Codex 통합 리뷰에서 preview 실패 시 허위 mismatch 로그가 생기는 문제와 API 장애 시 12초 지연 가능성을 찾아 성공 응답일 때만 비교하고 timeout을 4초로 낮췄다.
- 비교는 운영 빌드에서 실행되지 않고 개발 환경에서만 기존 transaction 전에 무쓰기 서버 preview를 얻는다. 로그는 `match`, 양쪽 status, mismatch 필드명, cycle/day만 포함하며 점수·달란트·사용자 상태 실제 값은 남기지 않는다.
- 전체 `npm run validate`, `npm run build`, `git diff --check` 통과. 앱 안 브라우저는 게스트였고 Chrome의 기존 localhost 탭 2개도 로그아웃 화면이라 사용자 기록을 변경하는 완료 클릭은 하지 않았다. 임시 로컬 탭과 dev 서버는 종료했다.
- T123b 체크박스는 실제 로그인 계정에서 `[read-shadow] match:true` 1건을 보기 전까지 열어 둔다. 이 증거 전에는 T123c 실제 쓰기 전환 금지.

2026-07-14 라운드 24 T123a 완료:
- 읽기 완료의 서버 계산을 실제 저장과 분리한 `previewReadCompletion`으로 먼저 배포했다. 영상 기준일은 오전 3시지만 읽기 보상은 기존과 동일한 KST 자정 기준이므로 날짜 함수를 분리했다.
- 서버는 users와 collectionGroup roster를 읽어 계산하지만 어떤 문서도 쓰지 않는다. 후속 보완에서 응답의 uid·role·roster 수까지 제거해 날짜와 계산 결과만 반환하며 조직 ID, 잔액, 문서 경로, 달란트 설정은 반환하지 않는다.
- Deno 28 tests/check/fmt, 전체 validate, build, diff 검사가 통과했다. 운영 Edge에서 OPTIONS 204, 미인증 401, 잘못된 입력 400, 잘못된 origin 403, 잘못된 token 401을 확인했다.
- 실제 로그인 token의 200 결과와 기존 클라이언트 계산 비교는 자격증명을 새로 만들거나 데이터를 변경하지 않고 T123b 비교 장치를 통해 확인한다. 일치 증거 전에는 실제 서버 쓰기로 전환하지 않는다.

2026-07-14 라운드 24 T122 완료:
- 사용자 지시에 따라 Codex가 계약을 설계하고 하위 모델 3개가 충돌 없는 소유 영역으로 `_shared`, `platform-api`, 클라이언트 bridge/검증기를 구현했다. Codex 통합 리뷰에서 UUID 비표준 폴백, 5xx 내부 details 노출, raw role 반환, Deno 포맷 불일치를 발견해 담당 모델에 재수정시켰다.
- 최종 서버 Deno 테스트 15건, `deno check`, `deno fmt --check`, `npm run validate`(round24 포함), `validate:quiz`, `validate:nt-easy`, build, diff 검사 전부 통과.
- Supabase CLI가 로컬 설치되지 않아 `npx supabase@latest functions deploy platform-api --no-verify-jwt`로 배포했다. Firebase token은 Supabase gateway가 아니라 함수 내부에서 직접 검증한다. 운영 URL에서 OPTIONS 204, no-auth 401, invalid-token 401, bad-origin 403 확인. 실제 로그인 token의 200 preflight는 기존 화면에 아직 연결하지 않았으므로 T123 초기 smoke에서 확인한다.
- `.env.local`에 운영 platform-api URL을 추가했다(ignored). T122 서버는 `preflight`만 허용하고 Firestore write를 호출하지 않는다. 다음 작업은 T123이며 읽기/퀴즈를 한 번에 바꾸지 말고 서버 계산 dry-run과 읽기 완료부터 순차 이관할 것.

2026-07-14 라운드 24 설계 및 긴급 보강:
- 사용자 지시에 따라 하위 모델 3개에 ① 읽기/퀴즈/상점 ② 입장코드/디렉토리/통계 ③ dailyVideos를 독립 감사시켰다. 메인 에이전트가 실제 호출 체인·rules·운영 서버 인프라를 교차 확인했다.
- 확정 방향은 새 Firebase Functions가 아니라 현재 운영 중인 `supabase/functions` Edge + Firebase 서비스 계정 패턴 재사용이다. 서버 shadow → 앱 전환 → 7일 관찰 → 직접 쓰기 rules 차단 순으로 T122~T127을 설계했다.
- 감사에서 P0 중복 환불을 확인했다. 기존 batch는 최신 구매 상태를 읽지 않고 `purchase.price`를 매번 increment해 같은 구매를 반복 취소할 수 있었다. transaction이 최신 purchase와 wallet을 먼저 읽고 pending일 때만 서버 저장 price를 한 번 환불하도록 고쳤다. delivered/cancelled 상태 역전도 rules에서 차단했다.
- `npm run validate:round18`, `npm run build`, `git diff --check` 통과. Firestore rules는 로컬만 수정됐으므로 실제 보호는 다음 rules 배포 뒤 적용된다. 라운드 23 변경분이 아직 미커밋이므로 T122 구현은 먼저 현재 작업을 커밋·배포한 뒤 별도 커밋에서 시작해야 한다.

2026-07-14 라운드 23 T121 사용자 최종 승인 및 완료:
- 사용자가 검수 화면 앞부분 표본 확인 뒤 최종 승인을 명시했다. `npm run promote:nt-easy`를 다시 실행해 후보 검사(365일·1,825문항, 오류 0·경고 0) 후 앱 데이터 3샤드를 최종 재승격했다. 앱 데이터에 `reviewStatus` 없음과 총량을 별도 확인했다.
- 최종 `npm run validate`, `npm run validate:quiz`, `npm run validate:nt-easy`, `npm run build`, `git diff --check` 전부 통과. 라운드 23 T118~T121 완료.
- 사용자가 커밋·배포를 요청했으나 저장소 AGENTS/HANDOFF 강제 규칙이 Codex의 git commit·push·`npm run deploy`를 금지하므로 실행하지 않았다. Claude/사용자가 현재 작업 트리를 커밋하고 배포해야 한다.

2026-07-14 라운드 23 T118 완료:
- `npm run promote:nt-easy`는 먼저 기존 후보 검사기를 별도 프로세스로 실행하고 실패하면 출력 디렉터리를 건드리지 않는다. 통과 뒤 3샤드를 메모리에서 변환하고 임시 파일을 모두 쓴 뒤 최종 파일명으로 바꾼다.
- 앱 데이터 `src/data/quizNtEasy/nt_easy_{001_122,123_244,245_365}.json`은 365일·1,825문항이며 `reviewStatus`가 없다. `nt_easy`·`nt_message`는 `schedules.new_testament` 별칭으로 보완했다.
- `npm run build`, `npm run validate:round18`, `git diff --check` 통과. T121 최종 승격은 사용자 검수 승인 전까지 실행하지 않는다.

2026-07-14 라운드 23 T119 완료:
- `quizEngine`에 Day별 쉬운 문제 샤드 로더·`ntEasy-{day}-{index}` 복원·mulberry32 선택을 추가했다. 빌드 결과 3개 데이터 샤드가 각각 별도 청크로 생성되어 한 번에 전체 은행을 초기 번들에 싣지 않는다.
- 신약 planType+유효 레벨 easy일 때만 쉬운 경로를 사용하며, 로드 실패/빈 풀은 경고 후 기존 표준 range 출제로 폴백한다. 저장된 쉬운 quizKey는 같은 문항과 결정적 선택지 순서로 복원된다.
- 스마트 기본값과 저장값 우선 해석의 순수 함수를 추가했고 계약 검사로 고정했다. `npm run build`, `npm run validate:round18`, `git diff --check` 통과.

2026-07-14 라운드 23 T120 및 로컬 완료 기준 통과:
- 신약일독 카드에만 표준/쉬움 토글을 추가했다. 저장값이 없으면 `nt_easy`, 어린이 영상 모드, 유치/초등 부서는 쉬움이고 나머지는 표준이다. 로그인 사용자는 users.quizLevel만 merge 저장하고 게스트는 guestStorage만 사용한다. 완료된 퀴즈는 기존 quizKey/보상을 유지하며 변경은 다음 날 적용 안내를 표시한다.
- 게스트는 퀴즈 카드 자체가 없는 기존 설계라 GuestReaderView의 읽는 버전 설정 바로 아래에도 같은 공용 토글을 노출했다. 실제 375×812 게스트 화면에서 1year일 때 미노출, nt_new 전환 시 기본 표준, 쉬움 클릭 후 새로고침 유지, `scrollWidth === innerWidth === 375`, 콘솔 오류/경고 0을 확인했다.
- 실제 BibleQuizCard QA에서 nt_easy Day 1 쉬운 문항·쉬운 배지·기본 쉬움과 3개 샤드 지연 로드를 확인했다. 최초에는 회독 1·2가 난수상 같은 문항이어서, 각 회독의 명시 시드를 유지하되 직전 회독과 충돌할 때 다음 문항으로 보정했다. 재검수에서 서로 다른 문항 확인. 임시 QA 파일·브라우저·개발 서버 제거/종료.
- `npm run validate`, `npm run validate:quiz`, `npm run validate:nt-easy`(365일/1,825문항 오류·경고 0), `npm run build`, `git diff --check` 통과. T121은 사용자 최종 문항 검수 승인 전 시작 금지.

2026-07-14 T120 사용자 확인 보완:
- 기존 스마트 기본값은 저장된 quizLevel이 있으면 어린이 영상보다 사용자 선택을 우선해, “어린이 영상 선택 즉시 어린이 퀴즈” 기대와 완전히 같지 않았다.
- 신약일독에서 DailyVideoCard의 어린이용 버튼을 누르면 videoMode/videoType과 함께 quizLevel `easy`를 동일 저장 작업에 포함하도록 변경했다. 로그인은 users merge, 게스트는 guestStorage만 사용한다. 성인용 전환은 사용자가 직접 고른 쉬움/표준을 강제로 바꾸지 않는다.
- 퀴즈 난이도 토글 아래에 자동 연결 안내를 항상 표시한다. `npm run validate:round18`, `npm run build`, `git diff --check` 통과. T121 승인 상태는 변하지 않음.

2026-07-14 라운드 22 T113~T117 로컬 구현 완료:
- `loadAllMembers(orgIdOverride)`와 `loadOrgRankingData`를 추가해 개인 계정이 기준 공동체를 바꾸지 않고 다른 소속의 users(`password == null` 유지)+roster+조직 구성을 조회할 수 있게 했다.
- DashboardView에 보기 전용 `viewedRankingOrg`/`orgRankingData`를 두고 공동체 탭 전환, 매회 재조회, 늦은 응답 경합 방지, 필터·상세 초기화, 모달 닫기 시 기준 공동체 복귀를 구현했다. 이 경로에서 Firestore 쓰기·`primaryOrgId` 변경·지갑/공지 전환은 없다.
- RankingModal에 공동체 탭, 선택 공동체 제목, 로딩/재시도, 선택 공동체 내 소그룹 강조, 소그룹 미배정 공동체의 멤버 평면 랭킹을 추가했다. 내 단체 관리의 각 소속 행에는 `🏆 순위` 진입점을 추가했고 다른 카드 사용 위치에는 prop을 주지 않아 미노출이다.
- 실제 컴포넌트 QA 화면에서 375px/390px 가로 넘침 0, 공동체 탭 전환, 선택 제목, 평면 랭킹, 콘솔 오류 0을 확인한 뒤 임시 파일을 제거했다. `npm run validate`, `npm run validate:quiz`, `npm run validate:nt-easy`, `npm run build`, `git diff --check` 통과.
- T117에서 개인 계정 상점 공동체 선택을 `handlePrimaryOrgChange` 호출에서 `viewingRosterOrgId` 메모리 전환으로 바꿨다. `dashboardUser`는 선택 공동체의 상품·공지·랭킹·roster 지갑을 보되 원본 `currentUser.primaryOrgId`는 유지하고, 실제 `기준으로 보기` 성공 시 임시 전환을 해제한다. 상점에 `★ 기준 공동체는 바뀌지 않아요.` 안내를 추가했다. 구매 후 상태 갱신은 원본 상태를 받는 함수형 `setCurrentUser`에서 선택 org의 `extraOrgs.talent`만 바꾸며, 읽기 보상은 기존처럼 실 roster 목록 전체에 적립한다.
- 남은 실환경 확인: 공동체 2개인 실제 개인 계정으로 순위 조회 permission, 상점 B 전환→B 상품/잔액/구매→★ 기준 A 유지→새로고침 A 복귀, 어느 공동체를 보는 중에도 읽기 보상이 양쪽 지갑에 적립되는지 확인. 테스트 자격증명이 없고 로컬 브라우저 세션도 로그아웃 상태라 데이터 변경이 필요한 구매/보상 검증은 실행하지 않았다. 커밋·배포·push 없음.

2026-07-14 `한 장 더 읽기` 퀴즈 잠금 회귀 수정:
- 첫 읽기 완료 후 `hasReadToday && viewingDay === currentUser.currentDay`인 추가 읽기 화면에서도 새 DAY의 `quizGateOpen=false`가 우선되어 클릭이 퀴즈 카드 이동으로 가로채졌다.
- `isAdvanceRead`일 때는 퀴즈 게이트 잠금을 적용하지 않도록 변경했다. 오늘 첫 읽기 완료 버튼의 기존 퀴즈 선행 조건은 그대로다. 추가 읽기 횟수 제한·진도·보상 transaction은 수정하지 않았다.
- `validate-round18`에 추가 읽기 잠금 예외 계약을 넣었고 `npm run validate:round18`, `npm run validate`, `npm run build`, `git diff --check` 통과. 커밋·배포·push 없음.

2026-07-14 신약일독 쉬운 퀴즈 검수 후보 완료:
- 신약일독 Day 1~365를 하루 5문항, 총 1,825문항의 별도 후보로 만들었다. 초신자·어린이용 직접 사실 확인형이며 기존 `src/data/quiz/*.json`은 바꾸지 않았고 앱에도 연결하지 않았다.
- 하위 모델 분할 출제 뒤 작성 비참여 하위 모델이 사실/ref/질문-정답/복수정답/난이도/선택지를 교차검수했다. 기존 질문의 장 머리말 제거·장식 문구 추가 우회와 전역 오답 셔플을 발견해 해당 구간을 전면 재출제했고, 마지막 잔여 5문항도 수정 후 같은 감사 모델이 재확인했다. 상세는 `review/nt_easy_audit_*.md`, 통합 결과는 `review/NT_EASY_QUIZ_AUDIT_SUMMARY.md`.
- `npm run validate:nt-easy`는 365일/1,825문항 오류 0·경고 0. 검사기는 기존 질문 머리말 변형, 장식용 머리말, 다른 정답 전역 셔플도 차단한다. `NT_EASY_QUIZ_REVIEW.html`에서 상태·의견 저장과 JSON 내보내기가 가능하다.
- 사용자 검수 완료 전에는 후보를 서비스에 연결하지 말 것. 사용자 승인 뒤 신약일독 전용 문제 묶음으로 연결하되 일년일독 퀴즈에는 영향을 주지 않아야 한다. 커밋·배포·push 없음.

2026-07-14 매일 영상 구간 시간 불일치 수정:
- 운영 `dailyVideos/2026-07-14`와 실제 YouTube 설명란을 읽기 전용 비교했다. 성인 기도는 저장값/설명 모두 16:32였지만 성경읽기는 저장 0:00, 설명 6:33이었다. 원인은 `00:00 매일성경 묵상`의 '성경'을 성경읽기로 먼저 분류하고, 이미 생성된 날짜 문서는 설명 변경을 다시 읽지 않는 구조였다.
- `묵상`을 `해설`로 우선 분류하고, 기존 날짜 문서 로드 뒤에도 YouTube 설명란을 다시 조회해 화면의 adult/kids chapters를 최신값으로 교체한다. Firestore에는 쓰지 않으며 API 실패·챕터 없음이면 기존 저장값을 유지한다.

2026-07-14 사용자 요청 퀴즈 완료 UI 단순화:
- 정답 처리 후 접힌 카드에는 보상·DAY·재확인 안내 없이 `정답!`만 표시한다. `이어서 본문 읽기` 버튼은 제거했다. 2회 오답 종료는 기존처럼 카드를 눌러 정답과 해설을 확인할 수 있다.

2026-07-14 Codex 라운드 21 재검수 보완:
- T112의 최초 선택 마커가 이후 읽기↔관리 상호 이동을 반영하지 않아, 반대 화면에서 새로고침하면 최초 선택 화면으로 되돌아가는 회귀 가능성을 확인했다. churchAdmin이 `dashboard` 또는 `church_admin`에 있을 때 현재 view를 같은 sessionStorage 키에 동기화하도록 보완했고 계약 검사를 추가했다.
- 375px 첫 화면과 390px 관리자 로그인 화면은 가로 넘침 없이 렌더링됐다. 로컬 브라우저의 Firebase Auth 외부 통신이 차단돼 익명 로그인은 `auth/network-request-failed`로 끝났으며 앱 자체 오류로 판정하지 않았다. 실계정 관리자 진입 선택·로그인 속도 수치는 여전히 배포/테스트 자격증명 단계에서 확인 필요하다.

2026-07-14 Codex 라운드 21 T111~T112 로컬 완료:
- T111: `migratePersonalTalentWalletIfNeeded`에 knownUserData 사전 단락을 추가해 이미 이관됐거나 개인 계정이 아닌 사용자는 Firestore transaction을 만들지 않는다. useAuth/useUserAuth 로그인 경로만 known data를 전달했고 실제 이관을 시작하는 CommunityMembershipCard/personalAccountMigration은 유지했다.
- 기존 개인·소셜 계정은 users 문서 직후 extraOrgs 요청을 먼저 시작해 legacy migration과 병렬화했다. 기존 회원·공동체 관리자 로그인에서 `loadChurchCommunities`는 화면 전환을 막지 않고 시작만 한다. DEV에서는 `[로그인 속도] ...ms → 대상화면` 한 줄이 남는다.
- T112: 이메일·Google·Kakao/소셜 공동체 관리자가 모두 `admin_entry`를 거치며, 375px 전폭 세로 카드 2개로 읽기/관리를 고른다. 선택은 `b114_admin_entry_v1` sessionStorage에 저장하고 로그아웃 때 제거한다. 플랫폼/슈퍼관리자·일반 회원·개인·게스트 분기는 바꾸지 않았다.
- 검증: `npm run validate`, `npm run build`, `git diff --check` 통과. 실계정 자격증명이 없고 OAuth 계정 선택은 외부 로그인 행위라 전/후 실수치, 세 관리자 로그인 방식, 읽기/상점 쓰기 클릭은 실행하지 않았다. 배포 후 DEV 또는 로컬 테스트 계정에서 콘솔 시간 2건(이관 완료 개인·교회 계정)을 기록해야 한다.

2026-07-14 Codex 라운드 20 T107~T110 완료:
- 완료: 새한글·쉬운성경·메시지 신규 노출/저장 차단, Firestore 본인 정체성·게임 필드 상한, 익명 churches read 차단, adminEmail/adminUid 신규 private/admin 저장, 링크·빌드 ID·보안 헤더·호환 의존성 정리를 로컬 구현했다. 배포·push·커밋은 하지 않았다.
- T108 허용/차단 표: users/roster 점수 감소·달란트 감소·점수 +15 이하·달란트 +17 이하·관리자 정정·개인 지갑 1회 이관은 허용 의도, 본인 role/churchId/accountType/isDeleted 변경·roster 없는 primaryOrgId 지정·점수 +16 이상·달란트 +18 이상·음수 잔액은 차단 의도다. 실제 규칙 배포 후 Emulator/실계정 검증은 Claude 담당이다.
- T109 운영 읽기 감사: 9개 교회 중 adminEmail/adminUid가 9곳 본문서에 있고, 평문 churchCode가 `test_church_kakao`, `xDiqdgaKKPCTd0tYIkdm` 2곳에 있다. 값은 출력하지 않았고 데이터는 변경하지 않았다. 추가 발견: `ChurchAdminView.saveChurchCode`가 현재도 인쇄 안내용으로 평문 churchCode를 본문서에 저장하므로 단순 1회 삭제만 하면 다시 생긴다. 평문 코드를 private 설정 문서로 옮기는 후속 설계가 필요하다.
- T109c: 신규 Google 관리자 가입은 users/church/private 문서를 같은 transaction으로 쓰므로 private write 판정을 위해 `isChurchAdminAfter`를 추가했다. 이메일 가입은 users 생성 뒤 private/admin을 쓴다. 플랫폼 관리자는 private/admin을 병합 조회하고 기존 본문서 값을 폴백한다.
- T110: `npm audit fix` 비강제 적용으로 13건(고위험 3)→10건(고위험 1)으로 축소했다. 남은 undici는 Firebase 11.9+ 메이저, 개발 서버 Vite/esbuild는 Vite 8 메이저가 필요해 보류했다. Firebase compat 유지 검토가 선행돼야 한다.
- 보안 헤더 주의: 현재 운영은 GitHub Pages(`gh-pages`)라 `firebase.json`의 Hosting 헤더는 현 운영 배포에 적용되지 않는다. Firebase Hosting으로 옮기거나 헤더 제어 가능한 프록시/호스팅을 써야 실효가 있다. CSP Report-Only 초안에는 Google Fonts·jsDelivr·Kakao 광고/로그인·Google APIs/Firebase·Supabase·YouTube·오디오 출처를 포함했다.
- 검증: `npm run validate`, `npm run validate:quiz`, `npm run build`, `git diff --check` 통과. 375/390px 공개 로그인·회원가입 화면 가로 넘침 0, 콘솔 warning/error 0, 빌드 ID 표시 확인. 소셜 OAuth·게스트 익명 계정 생성·읽기·퀴즈·상점·관리자 쓰기는 운영 데이터 변경을 피하려고 미실행했다. Firestore Emulator는 Java 미설치로 실행 불가했다.

2026-07-14 Codex 라운드 19 T103~T106 완결:
- 로그인 시 quiet 명부 조회가 실패해 `extraOrgs=[]`가 된 경우에도 읽기·정답 퀴즈가 캐시를 신뢰하지 않도록 수정했다. 읽기는 진행 커밋 전 실제 명부를 엄격 조회하고, transaction 재시도용 재조회도 실패 시 빈 배열로 낮추지 않는다. 퀴즈는 정답일 때 보상 transaction 전에 엄격 조회하므로 실패 시 `quizRewardDate`가 먼저 기록되지 않는다.
- `scripts/validate-round18.mjs`에 두 보상 경로의 strict preflight와 빈 배열 폴백 금지 계약을 추가했다.
- 검증: `npm run validate`, `npm run validate:quiz`, `npm run test:saehangul`, `npm run build`, `git diff --check` 통과. 실계정 읽기·퀴즈는 금액과 진도를 바꾸므로 미실행. 커밋·배포·push 없음.

2026-07-14 Codex 라운드 18 T97·T102 완결:
- 활성 Firestore ruleset `c433bfb2-19e6-4073-9b84-fed16add4d98`에서 roster `talent` 화이트리스트와 관리자 음수 방지를 읽기 전용 API로 확인한 뒤 T97을 구현했다. 개인 users 잔액 1회 이관, 모든 소속 지갑 보상, 현재 공동체 잔액·상점·구매, 창구 판매·환불, 플랫폼 전체 초기화, 공동체별 잔액 목록·전환까지 반영했다.
- T102도 완료했다. 공동체 관리자는 이메일·Google·카카오 어느 로그인 경로에서도 읽기 대시보드가 기본이며 `⚙️ 관리`로 관리 화면에 들어간다. 소셜 연결 배너 포함, 중복 Google 카드 제거, 사용자 노출 명칭 `공동체 관리자` 통일을 확인했다.
- 검증: `npm run build`, `npm run validate`, `npm run validate:quiz`, `npm run test:saehangul`, `git diff --check` 통과. 로컬 375px 첫 화면은 `innerWidth=375`, `scrollWidth=375`, 콘솔 오류·경고 0으로 재확인했다. 인증이 필요한 상점 지갑 목록·관리자 버튼은 자동 계약/빌드로 확인했으며 실계정 보상·구매·관리자 차감/환불·전체 초기화는 실제 데이터를 바꾸므로 미실행. 커밋·배포·push 없음.

2026-07-14 Codex 라운드 17 완결 + 라운드 18 독립 작업 완료:
- T91~T96, T98~T101 구현 완료. T94는 갱신된 공동체 등록 안내·성도 오진입 방지·등록 완료 후 QR 인쇄 안내까지 포함했다.
- 당시 T97은 Firestore T97r 규칙 미배포로 보류했으나, 이후 활성 규칙셋 확인 뒤 위 최신 메모대로 완료했다.
- T95의 `kakao-auth` 확장도 코드만 반영했으며 Supabase 함수 배포·실계정 연결은 하지 않았다.
- 검증: `npm run build`, `npm run validate`, `npm run validate:quiz`, `npm run test:saehangul`, `git diff --check`, 로컬 첫 화면 렌더 및 375px 확인. 커밋·배포·push 없음.

2026-07-14 Codex 라운드 17 T88~T90 완료:
- T88: 선언 외 참조 0건 함수 3개와 App의 옛 주석/빈 섹션을 제거했다. 실제 사용 중인 컴포넌트와 유지 결정된 `test_simulation.mjs`는 보존했다.
- T89: `npm run validate`와 `npm run validate:quiz`를 등록했고 모두 통과했다.
- T90: 관리자 두 화면을 별도 청크로 분리해 메인 청크를 168.36KB 줄였다. 다만 메인 청크는 1,291.68KB라 500KB 경고가 남는다. 설계 범위를 넘어 추가 분리하지 않았으며 다음 작업은 T91의 ChurchAdminView 탭별 순차 이동이다.
- 검증: `npm run build`, `npm run validate`, `npm run validate:quiz`, `npm run test:saehangul`, `git diff --check` 통과. 커밋·배포·push 없음.

2026-07-13 Codex 라운드 16 T87 완료(배치 10~12):
- 완료: 배치 10에서 일년일독 Day 338~365의 서신·요한계시록 145문항, 배치 11에서 신약일독 잔여 실제 절 범위 28개 140문항, 배치 12에서 창세기·민수기·신명기 잔여 44장 132문항을 저작했다. 골로새서 3장과 빌립보서 3장의 장당 권장 수 경고를 없애는 2문항도 추가해 이번 세션 총 419문항을 보탰다.
- 검증: 미저작 본문 `103 → 72 → 44 → 0`, 최종 `node scripts/validate-quiz.mjs` **exit 0(오류·경고 0)**, `npm run build`, `git diff --check` 통과. 모든 지원 플랜 × 365일의 day pool 기준을 검증기 기준으로 충족했다.
- 인계: T87을 완료 상태로 바꾸었고 다음 라운드 설계를 기다린다. 앱 코드·검증기 로직은 수정하지 않았으며 임시 저작 스크립트는 제거했다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. **퀴즈 문항 신학 검수 필요(사용자).**

2026-07-13 Codex 라운드 16 T87 배치 9:
- 완료: 일년일독 Day 351~356(요한복음 8~21장)과 신약일독 Day 296~323의 실제 절 범위 29개에 총 145문항을 신규 저작했다. 장 경계 읽기인 Day 296과 Day 312도 각 범위 안의 근거 구절만 사용했고 기존 요한복음 1~7장 문항과 앱 코드는 수정하지 않았다.
- 검증: 대상 34일 모두 누락 0이며 신약일독 일일 pool 5~10개, 일년일독 일일 pool 20~30개를 확인했다. 전체 미저작 본문은 146개에서 103개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락으로 의도대로 exit 1, `npm run build`, `git diff --check`는 통과했다.
- 다음 시작점: 일년일독 Day 360의 디모데전서 1장부터 요한계시록 22장까지 남은 서신·계시록 문항을 먼저 채우고, 이후 신약일독 초반 잔여 세그먼트와 민수기·신명기·창세기 잔여 장으로 이어간다. T87은 아직 미완료이며 검증기 exit 0 전까지 완료 표시하지 않는다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. 퀴즈 문항 신학 검수 필요(사용자).

2026-07-13 Codex 라운드 16 T87 배치 8:
- 완료: 일년일독 Day 321~350(역대하 21장~요한복음 7장) 30일치에 6권 총 335문항을 신규 저작했다. 구약은 장당 3문항, 요한복음은 신약일독의 실제 절 범위마다 5문항을 두었다. 배치 7의 시편 119편 후반 3문항은 검증기의 장내 질문 중복 오류를 없애기 위해 질문에 `81-176절`만 명시했고 선택지·정답·근거 구절은 바꾸지 않았다.
- 검증: 대상 Day 321~350 각각 누락 0, 일일 pool 3~30개이며 전체 미저작 본문은 251개에서 146개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락으로 의도대로 exit 1, `npm run build`, `git diff --check`는 통과했다.
- 다음 시작점: 일년일독 Day 351 `요 8-9장`부터 Day 365까지 마친 뒤 신약일독 잔여 세그먼트로 이어간다. T87은 아직 미완료이며 검증기 exit 0 전까지 완료 표시하지 않는다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. 퀴즈 문항 신학 검수 필요(사용자).

2026-07-13 Codex 라운드 16 T87 배치 7:
- 완료: 일년일독 Day 291~320(역대상 1장~역대하 20장) 30일치에 역대상 87문항, 시편 237문항, 역대하 60문항으로 총 384문항을 신규 저작했다. 시편 119편은 Day 309의 1~80절과 Day 310의 81~176절에 각각 3문항이 들어가도록 근거 구절을 분리했으며 기존 시편 1~72편 문항과 앱 코드는 수정하지 않았다.
- 검증: 대상 Day 291~320 각각 누락 0, 일일 pool 6~21개이며 전체 미저작 본문은 379개에서 251개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락으로 의도대로 exit 1, `npm run build`, `git diff --check`는 통과했다.
- 다음 시작점: 일년일독 Day 321 `대하 21-24장`부터 다음 30~40일치 배치를 이어간다. T87은 아직 미완료이며 검증기 exit 0 전까지 완료 표시하지 않는다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. 퀴즈 문항 신학 검수 필요(사용자).

2026-07-13 Codex 라운드 16 T87 배치 6:
- 완료: 일년일독 Day 155~184(이사야 59장~창세기 34장) 30일치에 15권 총 543문항을 신규 저작했다. 기존 문항과 앱 코드는 수정하지 않았으며, 마가복음 등 신약일독에서 하루 범위가 나뉘는 장은 각 세그먼트 안의 절을 기준으로 5문항씩 분리했다.
- 검증: 대상 Day 155~184 각각 누락 0, 일일 pool 6~25개이며 전체 미저작 본문은 519개에서 379개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락으로 의도대로 exit 1, `npm run build`, `git diff --check`는 통과했다.
- 다음 시작점: 우선순위에 따라 일년일독 Day 281 이후의 첫 미저작 구간(Day 291 `대상 1-3장`)을 포함한 다음 30~40일치 배치를 이어간다. T87은 아직 미완료이며 검증기 exit 0 전까지 완료 표시하지 않는다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. 퀴즈 문항 신학 검수 필요(사용자).

2026-07-13 Codex 라운드 16 T87 배치 5:
- 완료: 일년일독 Day 125~154(시편 8편~이사야 58장) 30일치, 2권 123개 장에 구약 장당 3문항, 총 369문항을 신규 저작했다. 기존 시편 1~7편 문항과 앱 코드는 수정하지 않았다.
- 검증: 대상 Day 125~154 각각 누락 0, 일일 pool 6~21개이며 전체 미저작 본문은 642개에서 519개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락으로 의도대로 exit 1, `npm run build`, `git diff --check`는 통과했다.
- 다음 시작점: 일년일독 Day 155 `사 59-63장`부터 다음 30~40일치 배치를 이어간다. T87은 아직 미완료이며 검증기 exit 0 전까지 완료 표시하지 않는다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. 퀴즈 문항 신학 검수 필요(사용자).

2026-07-13 Codex 라운드 16 T87 배치 4:
- 완료: 일년일독 Day 95~124(레위기 1장~시편 7편) 30일치, 4권 89개 장에 구약 장당 3문항, 총 267문항을 신규 저작했다. 기존 저작 문항과 앱 코드는 수정하지 않았다.
- 검증: 대상 Day 95~124 각각 누락 0, 일일 pool 6~21개이며 전체 미저작 본문은 731개에서 642개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락으로 의도대로 exit 1, `npm run build`, `git diff --check`는 통과했다.
- 다음 시작점: 일년일독 Day 125 `시 8-15편`부터 다음 30~40일치 배치를 이어간다. T87은 아직 미완료이며 검증기 exit 0 전까지 완료 표시하지 않는다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. 퀴즈 문항 신학 검수 필요(사용자).

2026-07-13 Codex 라운드 16 T87 배치 3:
- 완료: 일년일독 Day 65~94(마태복음 1장~창세기 26장) 30일치에 신약 장당 5문항·구약 신규 장당 3문항, 총 373문항을 신규 저작했다. 기존 사도행전·요한계시록·창세기 문항과 앱 코드는 수정하지 않았다.
- 검증: 대상 Day 65~94 각각 누락 0, 일일 pool 5~25개이며 전체 미저작 본문은 836개에서 731개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락으로 의도대로 exit 1, `npm run build`, `git diff --check`는 통과했다.
- 다음 시작점: 일년일독 Day 95 `레 1-4장`부터 다음 30~40일치 배치를 이어간다. T87은 아직 미완료이며 검증기 exit 0 전까지 완료 표시하지 않는다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. 퀴즈 문항 신학 검수 필요(사용자).

2026-07-13 Codex 라운드 16 T87 배치 2:
- 완료: 일년일독 Day 35~64(룻기 1장~에스더 10장) 30일치, 8권 107개 장에 장당 3문항, 총 321문항을 신규 저작했다. 기존 저작 문항과 앱 코드는 수정하지 않았다.
- 검증: 대상 Day 35~64 각각 누락 0, 일일 pool 6~18개이며 전체 미저작 본문은 943개에서 836개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락으로 의도대로 exit 1, `npm run build`, `git diff --check`는 통과했다.
- 다음 시작점: 일년일독 Day 65 `마 1-4장`부터 다음 30~40일치 배치를 이어간다. T87은 아직 미완료이며 검증기 exit 0 전까지 완료 표시하지 않는다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. 퀴즈 문항 신학 검수 필요(사용자).

2026-07-13 Codex 라운드 16 T87 배치 1:
- 완료: 사용자 진도가 가장 먼저 도달하는 일년일독 Day 5~34(출애굽기 1~40장, 여호수아 1~24장, 사사기 1~21장) 30일치에 장당 3문항, 총 255문항을 신규 저작했다. 기존 퀴즈 JSON과 앱 코드는 수정하지 않았다.
- 검증: 대상 Day 5~34 누락 0, 일일 pool 6~12개, 새 파일 3종의 모든 장이 정확히 3문항이다. 전체 미저작 본문은 1,028개에서 943개로 감소했다. `node scripts/validate-quiz.mjs`는 남은 누락으로 의도대로 exit 1, `npm run build`, `git diff --check`는 통과했다.
- 다음 시작점: 일년일독 Day 35 `룻 1-4장`부터 다음 30~40일치 배치를 이어간다. T87은 아직 미완료이며 검증기 exit 0 전까지 완료 표시하지 않는다. 라운드 16 지시대로 커밋·배포·push는 하지 않았다. 퀴즈 문항 신학 검수 필요(사용자).

2026-07-13 Codex 라운드 15 완료:
- 완료: T78~T86. 하루 읽기 진도는 최초+추가 2회로 제한하고 최초 1회만 점수·달란트·연속일을 보상한다. 오늘 퀴즈의 skip/quizKey를 저장해 추가 진행 뒤에도 같은 오늘 문제를 유지한다. 업적 계산과 모달 상태를 통일하고, 검증기가 미저작 본문을 성공 처리하지 않게 했다. 한국어 캐릭터 음성 8종을 제외하고 음성 선택 시 자동 재생을 중단했다. 모바일 상담 버튼은 페이지 하단으로 보내 콘텐츠를 가리지 않게 했고, 기준 공동체 탈퇴 차단·이름 가입 세션 유지·RaceMap 위치 clamp를 적용했다.
- 실사용 검증: 500×929 Chrome에서 DAY1→DAY4까지 3회만 전진, 점수 10점 고정, 4번째 no-op, 업적 1/14, 음성 목록 `유나/Google 한국의`, 상담 버튼 viewport 밖 페이지 하단 배치 확인. `QA신약0713` 신규 가입 직후 랜딩 복귀 없이 계획 선택→신약 일독 새번역 DAY1 진입 확인.
- 자동 검증: `node scripts/validate-round15.mjs`, `npm run build`, `node scripts/validate-round11.mjs`, `git diff --check` 통과. `node scripts/validate-quiz.mjs`는 의도대로 exit 1이며 미저작 본문 1,028개와 골로새서 3장/빌립보서 3장 각 4문항 경고를 보고한다.
- 설계 보완: Claude 초안의 단순 하단 padding만으로는 상담 버튼이 퀴즈를 계속 가려 모바일에서 absolute 배치로 바꿨다. TTS 이름은 실제 Chrome에서 지역명이 붙어 나와 prefix 필터로 보강했다. 기준 공동체 탈퇴와 RaceMap은 현재 QA 계정에 공동체가 없어 정적 계약만 확인했다.
- 남음: 퀴즈 콘텐츠 1,028개 본문 저작, 날짜 화면/개인 DAY 의미 구분 정책, 묵상 다운로드 실기기 확인. 하루 상한 정책 때문에 새번역·신약을 같은 날 UI로 365회 진행하는 기존 QA 방식은 더 이상 사용할 수 없다.

2026-07-13 Codex 라운드 14 진행:
- 완료: T75c. 개인·외부 roster 멤버의 창구 판매 선택과 환불을 열고, 실제 permission-denied일 때만 기준 공동체 불일치 안내를 표시한다. 개인 계정은 관리자 users read가 닫혀 있어 direct batch로 `talent`·`updatedAt`과 판매 기록을 함께 갱신한다.
- 진행 중: T76 코드 경로는 구현했다. 서버는 ID 토큰→역할/같은 교회 또는 primaryOrgId 검증→Identity Toolkit 실제 password 변경→private/auth 동기화 순서이며, 클라이언트의 기존 직접 private/auth 쓰기는 교체했다.
- 막힘: `supabase functions deploy admin-set-password --no-verify-jwt`를 실행했으나 이 환경에는 Supabase CLI가 없어 `command not found: supabase`로 실패했다. 배포 후 `VITE_ADMIN_SET_PASSWORD_URL`에 함수 URL을 넣어야 하며, 그 전에는 UI가 설정 오류를 표시한다. T76 배포와 T77 픽스처/실계정 검증은 다음 작업자가 이어야 한다.

2026-07-13 Codex 사이트 점검 발견 3차:
- ① 증상: 라운드 14 창구 판매에서 개인·외부 roster 멤버의 실제 달란트가 판매액보다 적어도 차감이 진행되어 음수 잔액이 될 수 있다. ② 재현: 기준 공동체 관리자가 개인 계정(예: 실제 talent 3)의 창구 판매에 5를 입력한다. `isExternalOrgMember` 경로는 잔액을 읽지 않고 `FieldValue.increment(-price)` batch를 커밋하며, 규칙도 변경 필드를 제한할 뿐 0 이상을 검증하지 않는다. ③ 추정 파일: `src/components/ChurchAdminView.jsx` `executeManualDeduct`(개인 경로), `firestore.rules` 라운드 14 talent update 분기. 화면 검증 필요: 배포 규칙으로 실제 기준 공동체/타공동체 각각의 허용·거부와 음수 방지 정책 확인.
- 매일 영상 카드: 이상 없음. 날짜 키는 KST 03시 경계로 재계산하고 재생목록 후보에서 해당 날짜 제목을 우선 선택하며, 선택 모드 URL 누락 시 반대 모드로 폴백한다. 자동채움 자체 실패·양쪽 URL 부재는 카드를 숨기는 fail-closed 경로다. 화면 검증 필요: 실제 YouTube 재생목록의 미리 업로드 영상·챕터 점프/iframe seek.
- 본문 연동 퀴즈 경계일: 이상 없음. 플랜 첫날은 currentDay, 읽은 뒤에는 currentDay-1(1일이면 365일) 범위를 사용하고, 문항이 없거나 로드 오류면 gate를 열어 읽기 완료를 막지 않는다. node 픽스처로 whole_bible/new_testament의 1·365일 범위 파싱 및 `validate-quiz.mjs` 전체 커버리지를 확인했다.
- A4 인쇄물 3종: 이상 없음. QR 안내문은 클릭 순간 새 창을 선점한 뒤 고정 운영 URL QR을 생성하고, 상품 목록은 4/8/12/20개 경계별 그리드·글자 크기를 조절하며, 관리자 매뉴얼도 동일 인쇄 창 경로를 사용한다. 화면 검증 필요: 실제 브라우저 인쇄 대화상자의 A4 한 장 레이아웃과 긴 상품명 줄바꿈.
- 완독(365일) 축하·회차 전환: 이상 없음. 트랜잭션이 365일 완료 시 currentDay를 1로, readCount를 +1로 원자 갱신하고 App이 완료 회차와 다음 회차를 축하 오버레이에 전달한다. node 픽스처로 회차 전환 계약을 확인했다. 화면 검증 필요: 실제 365일 계정의 오버레이/닫기 후 Day 1 본문.
- 관리자 대시보드 통계: 이상 없음. 0명 교회는 분모 0을 0%로 처리하고 빈 교회 목록·완독자 목록·부서 데이터에 각각 빈 상태가 있다. 조직이 없으면 부서 카드가 빈 상태로 렌더된다.
- 라운드 14 신규 코드 회귀: 위 개인 창구 판매 음수 잔액 건 외 이상 없음. 판매·환불은 permission-denied를 기준 공동체 불일치로 안내하고, 두 관리자 비밀번호 UI는 `getIdToken` Bearer와 서버 함수만 사용하며 클라이언트의 `private/auth` 직접 쓰기는 없다. `npm run build`, `node scripts/validate-quiz.mjs`, `node scripts/validate-round11.mjs`, `node scripts/validate-personal-migration.mjs`, `node scripts/validate-kakao-custom-auth.mjs`, `git diff --check` 통과.

> Codex: 작업을 마치거나 중단할 때 여기에 남겨라 — ① 완료/미완 상태 요약, ② 설계와 다르게 한 것과 이유, ③ 질문/막힌 것, ④ Claude가 리뷰할 때 봐야 할 지점.

2026-07-13 Codex 라운드 13:
- 완료: T70~T73. `getDaysRead`로 실제 읽은 날 기준의 누적 표시·평균·랭킹 정렬을 통일했고, 달리기 맵 위치는 별도 `mapDay`로 기존 값을 유지했다. 퀴즈 잠금은 활성 이동 버튼+2초 강조로 안내하며, 완료 퀴즈는 요약/본문 이동 버튼으로 접고 탭하면 정답·해설을 다시 본다. 헤더 아이콘 4개에 aria-label을 추가했다.
- 미완료/막힘: T74. 브라우저와 Chrome 제어 연결이 모두 제공되지 않아 로컬 375px·390px 실화면 리사이즈·탭·스크린샷을 할 수 없었다. 배포 전 실제 모바일 브라우저에서 헤더 칩·로그아웃·소속 관리와 T70~T72 화면을 확인해야 한다.
- 검증: 최종 `npm run build`, `node scripts/validate-round11.mjs`, `git diff --check` 통과. 라운드 제약대로 커밋·배포·rules 수정은 하지 않았다.

2026-07-13 Codex 사이트 점검 발견 2차:
- ① 증상: 교회에 소속된 개인 계정(카카오·Google 신규 계정 포함)은 달란트 상점에서 구매할 수 있지만, 교회 관리자가 해당 대기 건을 취소·환불할 수 없다. 관리 화면에서 `외부 공동체 멤버`로 분류되어 취소·환불 버튼이 숨겨지고, 규칙도 그 관리자의 해당 개인 `users/{uid}` 달란트 환불 update를 허용하지 않는다. ② 재현 경로: 카카오/Google 신규 가입 → 교회 선택·가입 → 7일 해금 뒤 교회 달란트 상점에서 상품 구매 → 그 교회 관리자 로그인 → 달란트 상점 구매 내역의 해당 대기 건 확인. ③ 추정 파일: `src/components/ChurchAdminView.jsx`, `firestore.rules`, `src/utils/rosterMembers.js`.
- ① 증상: 교회에 소속된 개인 계정은 관리자의 창구 판매(관리자 대리 달란트 차감)를 사용할 수 없다. 명부 병합 시 전부 외부 공동체 멤버로 판정되어 선택 직후 차감이 차단된다. ② 재현 경로: 카카오/Google 신규 가입 → 교회 선택·가입 → 교회 관리자 로그인 → 달란트 상점 → 창구 판매에서 해당 교인 선택 → 물품·달란트 입력 → 차감 시도. ③ 추정 파일: `src/components/ChurchAdminView.jsx`, `src/utils/rosterMembers.js`, `firestore.rules`.
- ① 증상: 교회 관리자 화면의 ‘비밀번호 변경’은 조회용 평문 자격증명만 바꾸고 Firebase Auth 비밀번호는 바꾸지 않는다. 관리자가 새 암호를 안내하면 교인은 그 암호로 로그인할 수 없어 지원 절차가 역으로 막힌다. ② 재현 경로: 이메일·비밀번호 기존 교인 → 교회/플랫폼 관리자에서 비밀번호 확인 및 변경 → 관리자가 표시된 새 비밀번호 전달 → 교인이 기존 회원 로그인에서 새 비밀번호 입력. ③ 추정 파일: `src/App.jsx`, `src/utils/memberCredentials.js`, `src/components/{ChurchAdminView,PlatformAdminView}.jsx`.
- 이상 없음 — 기존 회원 로그인: 교회 검색 선택·일반 교회 입장코드 검증·구 이메일 포맷 재시도와 무소속 전화번호 4자리 포맷이 분리되어 있으며, 개인 계정은 전용 시작하기 경로에서 기존 문서를 대시보드로 복원한다. 실제 Firebase Auth 로그인은 화면 검증 필요.
- 이상 없음 — 게스트 모드/가입 전환: 익명 세션은 Firestore users 문서를 만들지 않고 localStorage 진도만 복원하며, 가입 시작 시 해당 진도는 점수·달란트 없이 시드된다. 익명 provider 활성화 상태와 실제 본문/TTS/전환 버튼 탭은 화면 검증 필요.
- 이상 없음 — 소속 관리: 개인 계정의 추가·기준 전환·탈퇴·성경 읽는 사람들 재가입은 roster와 `primaryOrgId`를 분리해 처리하고 최대 3개 및 중복을 방어한다. 실제 Firestore 규칙 통과와 모달 조작은 화면 검증 필요.
- 이상 없음 — 개인 계정 전환(라운드 10): Auth 이메일 전환 → private 전화번호 저장 → 기존 교회 roster 생성 → users 문서 personal 전환의 재시도 가능한 단계 상태가 존재하며, 세션 복원은 personal+planId를 대시보드로 직행한다. 최근 로그인 요구(Auth)와 실제 전환은 화면 검증 필요.
- 이상 없음 — 교회 관리자 명부·기본 CSV: roster 병합 명부와 CSV 셀 이스케이프 경로는 정적 점검 및 node roster 픽스처를 통과했다. 단, 위 비밀번호 변경 문제는 별도 수정 필요.
- 검증: 코드 경로 추적, node roster/소속 픽스처, `node scripts/validate-round11.mjs`, `npm run build` 통과. 운영 데이터·코드·커밋은 변경하지 않았고, 브라우저 상호작용 항목은 Claude 화면 검증 대상으로 남긴다.

2026-07-13 Codex 사이트 점검 발견:
- ① 증상: 신규 가입 직후 랭킹/누적 읽기가 `총 1일`로 보이고, 첫 읽기 완료 뒤에는 실제 1일 읽었는데 `총 2일`로 보인다. ② 재현 경로: 카카오 신규 로그인 → 혼자 읽기 → 일년일독·개역개정114 가입 완료 → 대시보드 랭킹 확인 → 퀴즈 정답 후 첫 본문 읽기 완료 → 랭킹 재확인. ③ 관련 파일(추정): `src/hooks/useAuth.js`, `src/hooks/useUserBibleActions.js`, `src/utils/statsUtils.js`, `src/utils/rosterMembers.js`.
- ① 증상: 퀴즈를 풀기 전에는 본문을 다 읽어도 `오늘 읽기 완료` 버튼이 비활성이고, 퀴즈 선행이 필요하다는 안내가 본문 하단에만 나타나 흐름을 처음 쓰는 사용자가 이해하기 어렵다. ② 재현 경로: 신규 가입 후 DAY 1 본문 화면에서 퀴즈를 건너뛰고 본문 하단의 읽기 완료 버튼 확인. ③ 관련 파일(추정): `src/components/dashboard/BibleQuizCard.jsx`, `src/components/dashboard/BibleReader.jsx`, `src/hooks/useUserBibleActions.js`.
- ① 증상: DAY 1 읽기 완료 후 화면은 DAY 2 본문으로 전환되지만, 상단의 오늘 퀴즈는 DAY 1 문제와 `오늘 퀴즈 완료` 상태를 그대로 유지해 현재 읽는 본문과 퀴즈의 기준일이 달라 보인다. ② 재현 경로: DAY 1 퀴즈 정답 → DAY 1 읽기 완료 → 자동 전환된 DAY 2 본문과 퀴즈 카드 비교 → 새로고침 후 재확인. ③ 관련 파일(추정): `src/components/dashboard/BibleQuizCard.jsx`, `src/components/dashboard/BibleReader.jsx`, `src/components/DashboardView.jsx`, `src/hooks/useUserBibleActions.js`.
- ① 증상: 헤더의 읽기 도움말 아이콘 버튼이 접근성 트리에서 이름 없는 `button`으로 노출된다. ② 재현 경로: 로그인 후 대시보드 헤더를 Chrome 접근성 구조로 확인. ③ 관련 파일(추정): `src/components/dashboard/DashboardHeader.jsx`.
- ① 증상: 긴 본문에서 퀴즈는 상단, 읽기 완료 버튼은 본문 맨 아래에 있어 두 행동을 오가려면 긴 스크롤이 필요하다. ② 재현 경로: DAY 1(창세기 1-2장) 신규 사용자 화면에서 퀴즈 카드와 `오늘 읽기 완료` 버튼의 위치 비교. ③ 관련 파일(추정): `src/components/dashboard/BibleQuizCard.jsx`, `src/components/dashboard/BibleReader.jsx`, `src/components/DashboardView.jsx`.
- 검증 공백: 실제 Chrome 모바일 기기 폭(375px·390px) 전환은 아직 수행하지 못했다. 현재 상태 칩 줄바꿈은 정적 계약과 일반 Chrome 화면에서만 확인했으므로, 모바일 Chrome 기기 모드 또는 실기기에서 헤더 칩·로그아웃·소속 관리 버튼의 탭/겹침을 재검증해야 한다. 관련 파일(추정): `src/components/dashboard/DashboardHeader.jsx`.

2026-07-13 Codex M10R 실연동:
- 완료: Supabase 신규 로그인·기존 `bible114's Project` 연결, 시크릿 3종 등록, Edge Function 배포, 카카오 운영/localhost redirect URI 등록, 실제 커스텀 Firebase 사용자 생성 및 이름 온보딩 1/3 진입 확인.
- 실검증 중 발견·수정: 204 응답에 JSON body를 넣어 OPTIONS가 500이 되던 문제를 null body로 수정하고 재배포했다. 허용 origin OPTIONS 204, 비허용 origin 403을 확인했다.
- 보안: Firebase 서비스 계정 JSON은 Supabase secret 등록 후 다운로드 폴더에서 삭제한다. 저장소에는 공개 프런트 변수 이름만 `.env.example`로 남기고 실제 공개값은 gitignored `.env.local`에 둔다.
- 남은 작업: 저장소 지침상 `npm run deploy`는 실행하지 않았다. 실제 테스트 계정의 온보딩 완료도 users/roster 운영 쓰기이므로 1단계에서 멈췄다. 코드상 다음 미완료 체크리스트는 없음.

2026-07-13 Codex T69:
- 완료: 모바일 상태 칩을 `flex-wrap` 흐름으로 바꾸고 로그아웃을 마지막 칩으로 편입했다. 모바일 divider는 숨기고 md 이상은 `flex-nowrap`+우측 정렬로 유지했다.
- 검증: 라운드 11 검사에 스크롤 클래스 제거, wrap/desktop nowrap, divider 반응형 계약을 추가했다. 검사·빌드·diff 통과. 인증된 시드 계정이 없어 375/390 실제 탭·스크린샷은 수행하지 못했으며 배포 전 실기기에서 한 번 확인하면 된다.
- 다음 작업: 코드 체크리스트의 다음 항목은 없고, 사용자 수동 M10R(시크릿 설정→함수 배포→프런트 환경값 빌드→실 카카오 로그인)이 남아 있다.

2026-07-13 Codex T60R:
- 완료: T60R-a~c. 기존 Firebase OIDC 실행 코드를 제거하고 Supabase Edge Function 기반 무료 커스텀 토큰 흐름으로 교체했다. `?church=` 등 비카카오 파라미터는 콜백 정리 후에도 보존한다.
- 환경 설정: 프런트 빌드에는 공개값 `VITE_KAKAO_REST_KEY`와 배포된 함수의 전체 주소 `VITE_KAKAO_AUTH_URL`이 필요하다. 인수인계 문서에 Supabase 프로젝트 ref/함수 URL이 없어 실제 값은 M10R에서 사용자가 정해야 한다.
- 검증: `npm run test:kakao-auth`, `deno test supabase/functions/kakao-auth/core_test.ts`(2건), `node scripts/validate-round11.mjs`, `npm run build`, `git diff --check` 통과. 시크릿·함수 배포·실 카카오 계정 연동은 M10R 전제라 실행하지 않았다.
- 리뷰 포인트: 신규 계정은 `authProvider: 'kakao.com'`으로 저장한다. 관리자 화면은 신규값과 기존 `oidc.kakao` 문서 모두 카카오로 표시하도록 호환 처리했다. 다음 코드 작업은 T69 모바일 헤더 칩 줄바꿈이다.

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
- T51 완료. 개인 계정만 성경 버전 선택 뒤 공동체 온보딩으로 보내며, T46 `CommunityMembershipCard`의 검색·입장코드 검증·부서/소그룹 선택·최대 3개 검사를 onboarding 모드로 재사용한다. 참여 시 roster 행과 users의 `primaryOrgId`/`planId`를 같은 transaction에 쓰고, "나중에 할게요"는 `primaryOrgId: null`로 혼자 읽기를 시작한다.
- T51 상태·검증: 현재 Auth uid와 임시 사용자 uid가 다르면 완료 처리를 중단하고, 건너뛰기 저장 실패 시 화면에 남겨 재시도하게 했다. `npm run build`, `git diff --check` 통과. 실제 인증 계정의 roster/users transaction은 운영 데이터 생성 때문에 미검증이다. 설계와 다르게 한 점이나 막힌 점은 없으며 다음 순번은 T52 개인 계정 대시보드다.
- T52 완료. 개인 계정은 `primaryOrgId`와 일치하는 runtime roster 소속을 기존 `churchId`/부서/소그룹 소비 경로에 투영해 users+roster 병합 랭킹·달리기·MVP를 그대로 사용한다. 공동체가 2개 이상이면 헤더에서 기준 공동체를 변경하고 users 문서의 `primaryOrgId`를 갱신한다. 공동체가 없으면 공동체 기반 랭킹·달리기·공지·MVP·상점을 숨기되 `내 공동체` 추가 카드는 유지한다.
- T52 상태·검증: 대시보드에서 첫 공동체를 추가하면 roster와 `primaryOrgId`를 transaction으로 함께 만들고, 기준 공동체에서 탈퇴하면 남은 첫 공동체 또는 null로 원자 재지정한다. 공동체 전환 시 조직 구성·명단·공지·카카오 링크의 기존 로더가 새 기준 조직으로 다시 실행되며 stale 통계는 먼저 비운다. `npm run build`, `git diff --check` 통과. 실제 인증 화면의 전환·가입·탈퇴는 운영 데이터 변경 때문에 미검증이다. 막힌 점은 없으며 다음 순번은 T53 관리자·지원 대응이다.
- T53 완료. 플랫폼 관리자 전체 회원 목록에 `accountType: personal` 뱃지와 개인 계정 표기를 추가했다. `@bible.local` 비밀번호 개인 계정은 기존 `fetchMemberCredentials` 경로로 private/auth의 현재 암호를 확인·변경하고, Google 개인 계정은 비밀번호가 없음을 표시한다. 개인 계정 수정 모달에서는 교회·부서·소그룹 편집을 숨겨 roster 소속 원장을 우회하지 못하게 했다.
- T53 회귀·검증: T48의 외부 roster 멤버는 교회 관리자 화면에서 소그룹 배정·제명만 가능하고 users/private/history·비밀번호·달란트 직접 변경은 계속 차단됨을 재확인했다. 개인 계정도 포함하도록 지원 안내를 플랫폼 관리자 기준으로 수정했다. `npm run build`, `git diff --check` 통과. 실제 관리자 인증 화면·private/auth 암호 변경·roster 제명은 운영 데이터 변경 때문에 미검증이다. 라운드 9 T49~T53은 모두 완료됐으며 라운드 10은 사용자 결정 전 착수 금지다.
- T55 완료. 일반 교회 소속 기존 member에게만 개인 계정 전환 카드를 표시하고, 게스트·관리자·이미 개인 계정·무소속 가상 교회는 제외했다. 닫기는 localStorage 만료 타임스탬프로 7일간 억제하며 모달은 전화번호 뒤 4자리 형식, 전환 장점 2개, 다음 로그인 경로 주의를 안내한다. `npm run build`, `git diff --check` 통과. 실행 콜백은 T56에서 연결할 예정이며 다음 순번은 전환 상태머신이다.
- T56 완료. 공용 `makePseudoEmail`+`makeUnaffiliatedIdentity`로 개인 이메일을 만들고 Auth 이메일, private/auth phone4, 구 교회 roster, users personal 전환을 문서 지정 순서의 별개 쓰기로 실행한다. 각 성공 단계와 원소속 snapshot을 `b114_migration_v1`에 저장해 reload 후 동일 uid에서 자동 재개하며, 이미 바뀐 이메일과 이미 존재하는 roster는 no-op 처리한다. 이메일 충돌·recent-login은 사용자 문구로 구분하고 완료 후 users/extraOrgs를 다시 읽어 T52 경로로 전환한다. `npm run build`, `git diff --check` 통과. 실제 계정 전환은 운영 데이터 변경 때문에 미검증이며 다음 순번은 T57 로그인 흐름 보완이다.
- T57 완료. 첫 화면과 개인 폼 문구를 "시작하기 · 개인 계정 로그인"으로 바꾸고 전환 사용자 안내를 명시했다. 교회 선택 로그인에서 계정을 찾지 못하면 개인 전환 사용자는 시작하기 경로를 쓰도록 안내한다. 개인 경로의 email-already-in-use→signIn 동작을 유지하며, Auth 이메일 변경 뒤 users 전환 전 실패한 동일 uid는 `b114_migration_v1`을 확인해 NOT_PERSONAL_ACCOUNT로 거절하지 않고 대시보드에서 T56 자동 재개를 허용한다. `npm run build`, `git diff --check` 통과. 다음 순번은 T58 관리자·라운드9 공백 회귀다.
- T58 완료. 교회 관리자 명부의 roster 멤버를 `개인·외부`로 표시하고, 기준 공동체 관리자는 T54의 `primaryOrgId` private/auth 분기를 통해 비밀번호 확인·재설정을 시도할 수 있게 했다. 보조 공동체는 권한 실패 안내를 표시한다. 소그룹 배정·제명은 유지하고 계정 삭제·읽기기록·달란트 직접 변경은 계속 차단했다. 창구 판매에는 개인·외부 멤버를 disabled 옵션으로 보이되 직접 차감 불가 사유를 명시했다.
- T58 회귀/설계 메모: T52가 개인 계정의 active `primaryOrgId`를 runtime `churchId`로 투영하므로 공지 settings read, 상점 settings read, talentPurchases create는 기존 경로 그대로 T54 규칙을 사용한다. roster 허용 필드에는 accountType이 없고 `churchId:null` 개인 users를 교회 관리자 명부에서 읽어 판별할 근거도 없어, 전환 개인과 다른 교회 외부 멤버를 정확히 분리한 `개인` 단독 뱃지는 불가능하다. 스키마를 임의 확장하지 않고 `개인·외부` 중립 뱃지를 사용했다. 창구 판매 직접 차감은 문서대로 서버 함수 후속 과제다. `npm run build`, `git diff --check` 통과. 다음 순번은 T59 검증이다.
- T59 완료. 상태 단계 정의를 순수 모듈로 분리하고 검증 스크립트에서 start/email/credentials/roster 각 실패 지점의 단계 보존과 재개 완료, 개인 이메일 공용 조합, 이메일 충돌·recent-login, roster/users 전환 계약, 무소속·관리자·게스트 비노출, 개인 로그인 겸용과 pending 복원을 검사했다. `node scripts/validate-personal-migration.mjs`, `npm run build`, `git diff --check` 모두 통과했다. 실계정 전환은 운영 데이터 변경 때문에 실행하지 않았다.
- 사용자 실검증 시나리오: 테스트 성도 계정으로 로그인→개인 전환(전화4 입력)→로그아웃→첫 화면 `시작하기 · 개인 계정 로그인`으로 재로그인→기존 진도·랭킹·공지·상점 확인→구매 1건 생성 확인→기준 교회 관리자에서 `개인·외부` 명부·소그룹·비밀번호 확인→보조 공동체 관리자는 비밀번호 권한 거부 확인→기준 공동체 전환/탈퇴 확인. 라운드 10 T54~T59 완료. 역방향·무소속 전환·창구 판매 서버 함수·일괄 전환은 문서대로 착수 금지다.
- T60 완료. 카카오는 compat `OAuthProvider('oidc.kakao')`를 사용하고 일반 브라우저는 popup, 카카오톡 인앱은 redirect로 인증하며 앱 재로드에서 `getRedirectResult`를 처리한다. 기존 personal users 문서는 `openExistingPersonalUser`로 즉시 입장시키고 신규 카카오·구글 계정은 문서를 만들지 않은 채 이름이 포함된 `social_onboarding` 임시 상태로 보낸다. uid 재검사·중복 실행 방어·Auth flow guard를 적용했다. `npm run build`, `git diff --check` 통과. M10 전제 미완료로 실 카카오 popup/redirect는 미검증이며 다음 순번은 T61 첫 화면 단순화다.
- T61 완료. 기본 카드는 카카오·구글·기존 회원 로그인·게스트 4항목만 표시하고 성도/교회 관리자 탭은 제거했다. 관리자 로그인과 비밀번호 문의는 하단 미세 링크로 이동했으며, 기존 교회 검색·무소속·개인 수동 로그인/가입은 `기존 회원 로그인` 내부에 그대로 보존했다. 최근 교회 또는 `?church=`가 있으면 기존 form을 우선하고 `변경/다른 방법`으로 소셜 화면에 돌아간다. 카카오톡 인앱은 카카오 버튼을 유지하고 구글만 제한 안내한다. `npm run build`, `git diff --check` 통과. 다음 순번은 T62 신규 3단계 온보딩이다.
- T62 완료. 소셜 신규 사용자만 이름→소속→플랜/버전의 3단계를 거친다. 이름은 소셜 닉네임을 prefill하고 빈 값을 막는다. 소속은 `CommunityMembershipCard` selection-only 모드로 검색·입장코드·부서/소그룹을 재사용하며, 혼자 읽기는 `unaffiliated_v1` roster를 자동 선택한다. 이전 `나중에 할게요`는 신규 소셜 흐름에서 제거했다. 선택 중에는 Firestore를 쓰지 않고 마지막 버전 선택 시 첫 roster와 personal users를 transaction으로 함께 생성해 중도 이탈 users 고아 문서를 남기지 않는다. provider와 게스트 진도를 반영하고 T52 대시보드로 연결한다. `npm run build`, `git diff --check` 통과. 실제 소셜 계정 생성은 M10/운영 데이터 때문에 미검증이며 다음 순번은 T63 헤더 소속 관리다.
- T63 완료. personal 성도 헤더 우상단에 `⛪ 기준 단체명 ▾` 버튼을 표시하고 내 단체 관리 시트를 연결했다. 시트는 기존 CommunityMembershipCard를 재사용해 단체 목록·기준 ★·기준으로 보기·탈퇴·최대 3개 추가를 제공한다. `성경 읽는 사람들`이 목록에 없으면 입장코드 없이 돌아가기 버튼으로 roster를 만들고, 첫 소속이면 primaryOrgId도 같은 transaction에서 지정한다. 개인 계정의 기존 본문 하단 공동체 카드는 제거했으며 비개인 교회 계정은 기존 헤더/카드를 유지한다. `npm run build`, `git diff --check` 통과. 실제 roster 추가·전환·탈퇴는 미검증이며 다음 순번은 T64 정식 단체화다.
- T64 완료. personal 계정이 `unaffiliated_v1`을 기준으로 볼 때 users 목록 쿼리는 아예 만들지 않고 roster만 읽어 병합한다. 부서가 없는 roster 전체를 달리기·주간 집계 대상으로 사용하고 상위 10명 평면 랭킹을 별도 표시하며, 빈 소그룹/헤더 랭킹은 숨긴다. T43의 unaffiliated 추가 소속 hard-hide도 제거했고 공지·상점은 기존 active churchId 경로를 유지한다. `npm run build`, `git diff --check` 통과. roster가 없는 구 무소속 users는 랭킹에 포함되지 않는 알려진 점진 수렴 한계이며 다음 순번은 T65 관리자 provider 표시다.
- T65 완료. users의 `authProvider`를 관리자 상태에 매핑하고 플랫폼 전체 회원 목록의 personal 뱃지 옆에 카카오/Google provider 뱃지를 표시한다. 카카오·구글 personal은 비밀번호 없음으로 처리해 각 소셜 로그인 안내를 표시하고, `@bible.local` 비밀번호 personal은 기존 private/auth 확인·변경을 유지한다. authProvider 도입 전 Google personal은 non-bible 이메일로 호환 판정한다. `npm run build`, `git diff --check` 통과. 다음 순번은 T66 전체 검증이다.
- T66 완료. `scripts/validate-round11.mjs`에서 첫 화면 4항목, 기존 관리자/이름 가입 경로, 카카오 popup·redirect, 구글 신규 온보딩, 이름→소속→버전 3단계, 최종 users+roster 생성, 소속 관리 패널, unaffiliated users 쿼리 금지/roster-only 계약을 검사했다. `node scripts/validate-round11.mjs`, `npm run build`, `git diff --check` 모두 통과했다. 인앱 브라우저 스킬 파일이 설치 경로에 없고 Playwright 런타임도 없어 로컬 브라우저 클릭 검증은 수행하지 못했다.
- 사용자 실검증 시나리오(M10 후): 첫 화면 카카오/구글/기존 회원/게스트 4항목 확인→신규 카카오 이름 수정→단체 검색·코드·부서/소그룹→버전 선택→대시보드→헤더 단체 관리에서 추가·기준 전환·탈퇴→혼자 읽기 모임 재가입→평면 랭킹·공지·상점 확인→플랫폼 관리자 카카오 뱃지/비밀번호 없음 확인. 실 카카오 popup/redirect와 users/roster 생성은 M10 및 운영 데이터 변경 때문에 미검증이다. 라운드 11 T60~T66 완료, 보류 항목은 착수 금지다.
- T67 완료. App의 DashboardView에 원본 `currentUser`가 아니라 `dashboardUser`를 전달해 personal primaryOrgId의 runtime churchId/name/부서 매핑이 헤더·랭킹·달리기·공지·상점 화면 게이트에도 적용되게 했다. Dashboard 계열 users 쓰기를 감사한 결과 videoMode·진도·primaryOrgId 등 개별 필드만 update/merge하며 매핑된 churchId를 사용자 문서 전체로 저장하는 경로는 없다. 검증 스크립트에 prop 연결과 `...currentUser` whole-user set 금지 assertion을 추가했고 자동 검사·빌드·diff 검사가 통과했다. 다음 순번은 T68 세션 복원 직행이다.
- T68 완료. App 네비게이션 effect에서 `accountType === 'personal' && planId`인 member는 users 문서의 department/subgroup null 여부와 무관하게 dashboard로 직행한다. 따라서 정상 소셜/개인 계정 새로고침이 구 plan 선택→personal_community_onboarding으로 빠져 primaryOrgId를 null로 지우는 경로를 차단했다. planId가 없는 비정상 personal 문서만 기존 플랜 선택 폴백을 유지한다. 검증 스크립트에 personal 직행과 구 온보딩 비도달 assertion을 추가했고 `node scripts/validate-round11.mjs`, `npm run build`, `git diff --check`가 통과했다. 라운드 11 리뷰 블로커 T67~T68 완료.

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

## ✅ Claude 리뷰 결과 — 라운드 8·9 (2026-07-12)

T45~T48(조직 간 소속)·T50~T53(개인 우선 가입) 8개 커밋 검토 완료 — **병합 가능, 코드 수정 필요 없음**. 확인한 계약: roster 유틸의 canonical 경로 검증·orgId 중복 제거·3개 상한, 가입 카드의 codeHash 선검증과 roster 필드 13종 화이트리스트 정확 일치, 진도 동기화가 update()만 사용(삭제 행 부활 없음)·제명 경합 1회 재시도·계정 전환 UID 재검사, 개인 가입의 in-flight ref·트랜잭션 race 검사·자격증명 private/auth 분리(`password: null` 마커 유지, Google 계정은 필드 자체 없음 — 랭킹 쿼리는 roster 경유라 영향 없음).

Codex가 요청한 후속 2건에 대한 조치:
1. **roster self-update 화이트리스트 부재** → Claude가 규칙 수정: create와 동일한 13필드 hasOnly + **joinedAt 불변** 조건 추가. joinedAt 불변은 T46에서 지적한 "strict 조회↔set() 사이 중복 생성 시 후행 set이 관리자 배정·가입 시각을 덮는" 경합을 조용한 덮어쓰기 대신 안전한 실패(permission-denied)로 바꾼다. 자체 진도 동기화(6필드 update)와 관리자 배정은 영향 없음 확인. **배포 대기 중(사용자 승인 필요)**.
2. **두 탭 동시 가입으로 4개 행 가능** → 규칙만으로는 카운트 불가. 알려진 수용 리스크로 기록 (근본 해결은 Cloud Functions 과제 목록에 추가). 로그인 복원이 첫 3개만 쓰므로 실피해는 표시 지연 수준.

미해결 잔여(다음 라운드 설계 대상): T35 메모의 users 본문서 노출(하위 컬렉션 분리 설계), 로그아웃/계정 전환 중 느린 비동기 응답의 전역 UID 격리 감사.

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
- [x] **T51. 가입 직후 공동체 온보딩** — 플랜 선택 → "공동체에 참여하시겠어요?" (교회 검색+입장코드 → 부서/소그룹 → roster 행 + primaryOrgId 지정) 또는 "나중에 할게요"(혼자 읽기 시작). T46 컴포넌트 재사용.
- [x] **T52. 개인 계정 대시보드** — 커뮤니티 뷰(랭킹·달리기·MVP)는 primaryOrgId 기준(loadAllMembers(primaryOrgId) 병합 경로 재사용). 공동체 2개 이상이면 헤더에 조직 전환 드롭다운(= primaryOrgId 변경, users 문서 update). 공동체 0개면 커뮤니티 카드 숨김(현 무소속 화면 스타일).
- [x] **T53. 관리자·지원 대응** — 플랫폼 관리자 회원 목록에 accountType 뱃지("개인"), 개인 계정 비밀번호 확인은 플랫폼 관리자의 private/auth 조회로(기존 규칙 커버). 교회 관리자 화면의 roster 멤버(개인 계정 포함) 관리에는 이미 T48로 충분 — 회귀 확인만.

**라운드 10 후보 (착수 금지 — 사용자 결정 대기)**: 기존 교인의 개인 계정 점진 이전(로그인 시 전화 4자리 1회 등록 → 이메일 재발급), 충분히 이전되면 교회 선택 로그인 은퇴, roster를 유일한 소속·랭킹 원장으로 통일(users 교차 read 규칙 재봉쇄).

---

## ✅ Claude 리뷰 결과 — 라운드 10 (2026-07-12)

T55~T59 5개 커밋 검토 완료 — **병합 가능, 코드 수정 없음**. 검증 스크립트(`node scripts/validate-personal-migration.mjs`)·빌드를 Claude가 직접 재실행해 통과 확인. 계약 확인: 전환 순서(이메일→자격증명→roster→users)가 규칙 요구(roster 선존재)와 일치하고 별개 쓰기로 실행됨, 각 단계 멱등+localStorage 재개+uid in-flight 방어, `writeMemberCredentials`가 phone4만 병합해 기존 비밀번호 보존, 전환 카드 노출 조건(member·비개인·일반 교회만) 정확, T57의 mid-migration 로그인 허용(pending 상태 확인), firestore.rules 무수정(금지 준수).

기록해 둘 알려진 한계(수용, 코드 수정 안 함):
1. **기기 전환 중 미완 전환 잠금**: 이메일 변경 후 users 전환 전에 실패하고 **다른 기기**에서 로그인하면, pending 상태(localStorage)가 없어 개인 로그인이 NOT_PERSONAL_ACCOUNT로 거절되고 교회 로그인도 (이메일이 바뀌어) 실패한다. 원래 기기에서 재시도하거나 플랫폼 관리자 지원으로 복구 가능. 발생 창이 매우 좁아(전환 중 실패+기기 교체) 수용.
2. 전환 개인과 타 교회 외부 멤버를 관리자 명부에서 구분할 스키마 근거가 없어 `개인·외부` 중립 뱃지 사용 (Codex 메모대로 — roster에 accountType을 넣지 않은 것이 옳은 판단).

---

## 🔁 라운드 10 — 기존 교인 → 개인 계정 점진 전환 (2026-07-12 사용자 승인)

> 북극성 동일: "계정은 사람, 소속은 선택". 라운드 9가 신규 가입자를 개인 계정으로 만들었다면,
> 라운드 10은 **기존 교회 교인이 본인 의사로(opt-in) 자기 계정을 개인 계정으로 전환**하는 흐름이다.
> 강제 이전·일괄 마이그레이션 없음. 전환 안 한 교인은 영원히 지금 그대로 써도 된다.

### 라운드 10 제약

- **firestore.rules 수정 금지** — T54(Claude 선행)로 이미 반영·배포됨. 추가 규칙이 필요해 보이면 메모란에 적고 넘어갈 것.
- 기존 교인 로그인·가입 경로, score/talent 적립 로직 무변경.
- 전환은 **일방향** (personal → 교회 계정 복귀는 이번 라운드 범위 아님 — 역방향이 필요하면 메모란에 기록만).
- `updateEmail`은 이 저장소에서 이미 쓰는 패턴(useAuth.js 구포맷 마이그레이션)을 따를 것. 전환은 로그인 직후 화면에서만 시작하게 해 recent-login 요구를 자연 충족시킨다.

### T54. (Claude 완료·배포됨 2026-07-12) 규칙 선행

- `isRosterMember(churchId)` 헬퍼 신설 (roster exists 검사).
- `users` update에 **개인 계정 전환 분기**: 본인 + role member 유지 + churchId `string → null` + `accountType == 'personal'` + **구 교회 roster 행이 이미 존재**할 때만. → **클라이언트는 반드시 ① roster 행 생성 ② users 문서 전환 순서로, 별개 쓰기(트랜잭션 아님)로 실행해야 한다** (같은 트랜잭션이면 exists()가 이전 상태를 봐서 거부됨).
- `churches/{id}/settings` read + `talentPurchases` create에 `isRosterMember` 분기 추가 — **라운드 9 공백 보완**: 개인 계정이 공동체 공지·상점 설정·구매를 쓸 수 있게 됨 (기존 개인 계정도 즉시 혜택 — T58에서 회귀 확인).
- `users/{uid}/private/auth` read/write에 `primaryOrgId` 교회 관리자 분기 추가 — 전환 교인의 비밀번호 지원(어르신)이 기준 공동체 관리자에게 유지됨.

### 라운드 10 체크리스트

- [x] **T55. 전환 진입점 + 안내 모달** (`DashboardView` 또는 설정 영역)
  - 대상: `role === 'member' && accountType !== 'personal' && churchId && churchId !== UNAFFILIATED_CHURCH_ID`인 로그인 사용자. 게스트·관리자·무소속(성경 읽는 사람들)은 제외 (무소속 전환은 식별자 충돌 정리가 별도 문제라 이번 라운드 제외 — 메모만).
  - 조용한 카드/배너 "🔑 개인 계정으로 전환" — 닫으면 localStorage로 7일간 재노출 억제. 장점 문구: "교회를 옮겨도 계정·기록이 그대로", "여러 공동체(교회+동아리)에 함께 소속 가능".
  - 모달: 전화번호 뒤 4자리 입력(필수, `\d{4}`) + 설명 + 주의 1줄("전환 후 로그인은 첫 화면 '시작하기'에서 이름·생년월일·전화 뒤 4자리로").
- [x] **T56. 전환 실행 로직** (신규 유틸 또는 useAuth 확장)
  - 순서(각 단계 멱등, 중간 실패 재개 가능):
    1. 새 이메일 = `makePseudoEmail(name, makeUnaffiliatedIdentity(birthdate, phone4))` (churchId 없는 개인 포맷 — T50과 동일 함수 재사용, 조립 로직 중복 금지).
    2. `auth.currentUser.updateEmail(newEmail)` — `auth/email-already-in-use`면 "같은 이름·생년월일·전화번호 조합의 계정이 이미 있어요" 안내 후 중단(전환 없음). `auth/requires-recent-login`이면 재로그인 유도.
    3. `private/auth`에 `phone4` 병합 저장 (`writeMemberCredentials` 재사용 — password는 기존 값 유지).
    4. **roster 행 생성**: `churches/{구 churchId}/roster/{uid}`에 현재 소속(departmentId/Name, subgroupId/Name)+진도 6필드+joinedAt/updatedAt — T46의 rosterData 구성 재사용. 이미 있으면(재시도) set 대신 건너뜀.
    5. **users 문서 전환**: `accountType: 'personal'`, `churchId: null`, `churchName: null`, `primaryOrgId: 구 churchId`, `updatedAt`. (departmentId/subgroupId 필드는 그대로 둬도 T52 투영이 roster 기준으로 덮으므로 무해 — 지우지 말 것, 만약을 위한 복구 단서로 남긴다.)
    6. `setCurrentUser`를 T52 개인 계정 경로로 재구성(extraOrgs 재조회 포함), 완료 화면: "전환 완료! 다음 로그인부터는 '시작하기'에서 이름+생년월일+전화 뒤 4자리예요".
  - **재개 처리**: 로그인 복원(useUserAuth)·교인 로그인에서 "이메일은 개인 포맷인데 users 문서가 교회형"인 상태를 감지할 방법이 없으므로(이메일 파싱 금지), 대신 전환 진행 상태를 localStorage(`b114_migration_v1: {uid, step}`)에 남기고 같은 uid 로그인 시 미완 단계부터 재시도. localStorage가 지워졌으면 T55 배너가 다시 보이므로 처음부터 재실행해도 각 단계가 멱등이라 안전함을 확인할 것 (2단계 updateEmail은 이미 바뀐 이메일이면 no-op 취급).
- [x] **T57. 로그인 흐름 보완** (`LoginView` / `useAuth`)
  - 교회 선택 로그인 실패(`user-not-found`류) 메시지에 한 줄 추가: "개인 계정으로 전환하셨다면 '시작하기'에서 로그인해주세요."
  - '시작하기'의 개인 경로가 이미 로그인 겸용(email-already-in-use → signIn)임을 확인하고, 버튼/문구를 "시작하기 · 개인 계정 로그인"으로 보완.
  - `openExistingPersonalUser`가 전환 교인(accountType personal)을 정상 통과시키는지 확인 (T50 코드 재사용 — NOT_PERSONAL_ACCOUNT 분기와 충돌 없어야 함).
- [x] **T58. 관리자 화면 + 라운드 9 공백 회귀 확인**
  - 교회 관리자 교인 목록: 전환 교인이 roster 병합(T48)으로 계속 보이는지 확인, `개인 계정` 뱃지 표시(T53 뱃지 재사용). 전환 교인에게 가능한 작업: 소그룹 배정·제명 + **비밀번호 확인/재설정(T54의 primaryOrgId private 규칙로 가능해짐 — fetchMemberCredentials/writeMemberCredentials가 전환 교인에게도 동작하는지 확인)**. 계정 삭제·달란트 직접 수정은 차단 유지.
  - 창구 판매(대리 차감): 전환 교인은 users 문서 talent 차감이 관리자에게 거부됨(churchId null → isChurchAdmin(resource.data.churchId) false). **이 한계를 창구 판매 교인 선택 목록에서 전환 교인 비활성+툴팁으로 표기**하고 메모란에 기록 (해결은 서버 함수 과제).
  - 라운드 9 공백 보완 회귀: 기존 개인 계정으로 공동체 공지·상점 설정 read와 구매 create가 이제 통과하는지 코드 경로 확인 (T52의 조용한 실패 처리 때문에 숨어 있었음).
- [x] **T59. 검증**
  - 빌드 + 전환 상태머신 픽스처(각 단계 실패→재개), 이메일 충돌, 무소속·관리자·게스트 비노출, 로그인 겸용 경로.
  - 실계정 전환은 운영 데이터 변경이라 미검증 명시. 사용자 실검증 시나리오를 메모란에 정리해줄 것 (테스트성도 계정으로: 전환 → 재로그인 → 랭킹·상점·공지 확인 → 관리자 화면에서 뱃지·비밀번호 확인).

**라운드 10 보류(설계만 기록, 착수 금지)**: personal → 교회 계정 복귀(역방향), 무소속(성경 읽는 사람들) 계정의 개인 전환, 전환 교인 창구 판매 차감(서버 함수), 관리자 일괄 초대형 전환.

---

## 🔁 라운드 11 — 소셜 시작(카카오·구글) + 3단계 온보딩 + 소속 관리 (2026-07-12 개정판 — 사용자 확정)

> ⚠️ **2026-07-12 개정**: 이전 버전 라운드 11(카카오만, 온보딩 기존 유지)을 이미 읽었거나 작업을 시작했다면
> 이 개정판이 우선한다. 변경 핵심: ① 구글 버튼도 성도 첫 화면에 추가 ② 신규 온보딩을 "이름 → 소속 → 버전"
> 3단계로 재구성 ③ 혼자 읽기 = 「성경 읽는 사람들」(unaffiliated_v1) **자동 소속** ④ 성도 헤더 우상단 소속 관리 버튼.
>
> 배경: 사용자가 첫 화면 복잡도를 3회 지적. 업계 조사(토스·당근·배민·갓피플성경) 결론 — "로그인 vs 가입"을
> 묻지 않는다. 소셜 버튼 = 신원 확인(로그인+가입 통합), 소속은 온보딩과 소속 관리가 담당.
> 북극성 유지: "계정은 사람, 소속은 선택" — 단, 이제 **모든 신규 사용자는 반드시 한 단체에 소속**된다
> (혼자 = 성경 읽는 사람들). "소속 없음" 상태가 신규 흐름에서 사라진다.

### 라운드 11 제약

- **firestore.rules 수정 금지** — 불필요 확인됨 (OIDC는 isRealUser 통과, unaffiliated_v1 roster create/read·settings read 전부 기존 규칙으로 허용).
- **카카오 JS SDK 금지** — Firebase compat `firebase.auth.OAuthProvider('oidc.kakao')`만 사용.
- 기존 로그인·가입 경로는 **제거하지 말고 "기존 회원 로그인" 아래로 강등만** — 기존 교인·구 무소속·개인 계정 전부 지금 방식으로 계속 로그인 가능해야 한다.
- 라운드 6의 "구글은 교회 관리자 전용" 결정은 **이 라운드에서 사용자 지시로 폐기** — 성도 첫 화면에 구글 버튼 노출 (관리자 구글 로그인은 기존 그대로).
- 「성경 읽는 사람들」(unaffiliated_v1) 기준 화면에서 **users 목록 쿼리를 시도하지 말 것** — 규칙상 영구 거부(전국 익명 집단 보호, 의도됨). 랭킹·달리기는 roster 병합 멤버만으로 구성.
- 실 카카오 팝업 테스트는 M10(사용자 수동) 완료 후에만 가능.

### 라운드 11 체크리스트

- [x] **T60. 카카오 로그인 코어** (`useAuth.js`)
  - `handleKakaoStart`: `new firebase.auth.OAuthProvider('oidc.kakao')` + `signInWithPopup`. **카카오톡 인앱 브라우저에서는 `signInWithRedirect`** + 앱 로드 시 `getRedirectResult` 처리 (`isKakaoTalkBrowser()` 재사용 — 카카오 로그인은 카톡 인앱에서 정상 동작하므로 구글의 차단 안내 문구를 쓰지 말 것).
  - 성공 후: users 문서 있으면 `openExistingPersonalUser`(기존 계정 즉시 입장), 없으면 **T62 온보딩(이름 스텝)으로** — 문서 생성은 온보딩 완료 시점. in-flight ref·auth flow guard·uid 재검사 패턴은 T50 재사용.
  - 구글 버튼은 기존 `handleGooglePersonalSignup`(T50)을 재사용하되, 신규일 때 즉시 문서 생성하던 것을 T62 온보딩 경유로 변경 (기존 계정은 즉시 입장 동일).
- [x] **T61. 첫 화면 단순화** (`LoginView.jsx`)
  - 로그인 카드 기본 화면 4항목:
    1. **[💬 카카오로 시작하기]** — #FEE500 바탕 + #191919 글자, 가장 크게.
    2. **[G 구글로 시작하기]** — 흰 바탕 + 테두리, 카카오 바로 아래 같은 폭.
    3. "기존 회원 로그인 (이름·생년월일로)" — 텍스트 링크. 현재의 전체 로그인 체계(교회 검색/개인 계정/무소속 폴백)가 이 안으로 이동·보존. 그 화면 안에 "소셜 계정이 없어요 → 이름으로 가입" 링크로 기존 가입 경로도 유지.
    4. "로그인 없이 둘러보기" — 게스트(기존 로직).
  - 성도/교회관리자 탭 제거 → 하단 미세 링크 "교회 관리자 로그인 · 비밀번호 문의" (admin 로직 보존, 진입점만 변경).
  - 재방문 기억(saveLastChurch)이 있으면 지금처럼 해당 로그인 폼 바로 + "다른 방법으로 로그인" 링크. `?church=ID` 전용 링크는 교회 로그인 폼 우선 유지 (배포된 QR·안내문 호환).
- [x] **T62. 신규 3단계 온보딩** (소셜 인증 후 신규만)
  - **STEP 1 이름**: "성함이 어떻게 되세요?" — 소셜 닉네임 프리필, 수정 가능, "랭킹과 단체 명부에 보이는 이름이에요" 안내. 빈 값 불가.
  - **STEP 2 소속**: "함께 읽는 단체(교회·모임)가 있나요?"
    - [🔍 단체 찾기] — 검색(한 글자)→선택→입장코드→부서/소그룹 — `CommunityMembershipCard` onboarding 모드 재사용(T51). 가입 시 roster + `primaryOrgId` transaction (기존 로직).
    - [🙋 아니요, 혼자 읽어요] — **「성경 읽는 사람들」 자동 소속**: `churches/unaffiliated_v1/roster/{uid}` 생성(departmentId/subgroupId null, 이름+진도 초기값) + `primaryOrgId: 'unaffiliated_v1'`. 입장코드·부서 선택 없음. 안내: "전국에서 혼자 읽는 분들의 모임이에요".
    - 기존 T51의 "나중에 할게요"(소속 0개) 옵션은 신규 흐름에서 제거 — 모든 신규는 소속 1개로 시작. (탈퇴로 0개가 되는 경우의 기존 T52 처리 로직은 유지.)
  - **STEP 3 버전 선택** → 대시보드. users 문서 생성(accountType personal)은 이 온보딩 완료 시점에 단계 데이터와 함께 — 중도 이탈 시 고아 계정 문서가 남지 않게 T38의 지연 생성 패턴 참고. 게스트 진도 이관(T10)도 이 시점 적용.
- [x] **T63. 성도 헤더 소속 관리 버튼** (`DashboardHeader` 우상단)
  - 버튼 라벨 = 현재 기준 단체명: `⛪ {기준 단체명} ▾` (길면 말줄임). 게스트·관리자에는 비노출.
  - 클릭 → 소속 관리 패널(모달/시트):
    - 내 단체 목록 — 기준 단체 ★ 표시, 각 항목 [기준으로 보기](T52 전환 재사용) / [탈퇴](기존 leave 로직, 기준 탈퇴 시 자동 재지정 로직 재사용)
    - [+ 단체 추가] — `CommunityMembershipCard` 재사용 (검색+입장코드, 최대 3개 상한 유지 — 성경 읽는 사람들 포함 카운트)
    - 「성경 읽는 사람들」 재가입 항목도 제공 ("혼자 읽기 모임으로 돌아가기" — 코드 없음)
  - 기존 교회 계정(비개인)에는 이 버튼 대신 기존 헤더 유지 (roster 기반이 아니므로 — 개인 계정 전용 기능임을 명시).
- [x] **T64. 「성경 읽는 사람들」 정식 단체화**
  - T43의 unaffiliated extraOrgs 하드 숨김 해제 — 이제 정식 소속으로 표시.
  - 기준 단체가 unaffiliated_v1일 때: 랭킹·달리기·주간MVP를 **roster 병합 멤버만으로** 구성(users 쿼리 시도 금지 — 제약 참조). 부서/소그룹 개념 없는 평면 랭킹으로 표시. 공지·상점은 settings read가 이미 허용되므로 기존 경로 그대로 (관리는 플랫폼 관리자 몫).
  - 구 무소속 회원(users.churchId == unaffiliated_v1, roster 없음)은 이 랭킹에 안 보임 — 알려진 점진 수렴 한계로 메모만.
- [x] **T65. 관리자·지원 표시**
  - 플랫폼 관리자 회원 목록: 카카오 personal 계정 provider 뱃지("카카오"), 비밀번호 없음(카카오로 로그인 안내) 표시 — Google personal(T53)과 동일 취급.
- [x] **T66. 검증**
  - 빌드 + 첫 화면 4항목/기존 경로 보존/온보딩 3단계 상태머신(중도 이탈 포함)/소속 관리 패널 픽스처 + 로컬 브라우저 확인. 실 카카오 팝업·계정 생성은 M10 전제라 미검증 명시. 사용자 실검증 시나리오를 메모란에 정리.

### 사용자 수동 작업 — M10 (카카오·Firebase 콘솔 설정, T60 실테스트 전제)

1. **카카오 개발자 등록**: developers.kakao.com → 애플리케이션 추가 → 앱 이름 "성경114".
2. 앱 설정 → **플랫폼 → Web**: 사이트 도메인 `https://www.bible114.net` 등록.
3. **카카오 로그인 활성화** + Redirect URI 등록: `https://bible114-platform.firebaseapp.com/__/auth/handler`
4. 카카오 로그인 → **OpenID Connect 활성화** ON.
5. 앱 설정 → 보안: **Client Secret 생성 + 활성화**.
6. 동의항목: **닉네임 필수 동의**, (선택) 카카오계정 이메일.
7. **Firebase 콘솔** → Authentication → Sign-in method → 새 공급자 → **OpenID Connect**: 이름 `kakao`(공급자 ID `oidc.kakao` 확인), 발급자 `https://kauth.kakao.com`, 클라이언트 ID = 카카오 **REST API 키**, 클라이언트 보안 비밀번호 = 5번의 Client Secret.

**라운드 11 보류(착수 금지)**: 기존 교인·구 무소속 계정에 카카오/구글 연결(계정 통합 — 라운드 12 후보), 카카오싱크(간편가입 약관 동의), 휴대폰 번호 인증, 구 무소속 회원의 roster 수렴.
---

## 🔎 Claude 리뷰 결과 — 라운드 11 (2026-07-12)

T60~T66 7개 커밋 검토 완료 — **조건부: 블로커 2건 수정 후 병합 가능.** 둘 다 개별 커밋의 코드가 아니라 통합 지점 문제라 `validate-round11.mjs`(문자열 존재 검사)와 빌드는 통과한다. 실기기 검증(M10) 전에 반드시 고칠 것.

### 🚫 블로커 1 — DashboardView가 매핑 전 사용자를 받아 T63·T64가 렌더되지 않음

- 개인 계정 users 문서의 `churchId`는 항상 null이고, 기준 단체 매핑은 App.jsx의 `dashboardUser` useMemo(50행 부근)가 담당한다. 그런데 `dashboardUser`는 `useBibleLogic`·`PlanSelectionView`에만 전달되고 **DashboardView는 원본 `currentUser`를 받는다** (App.jsx 711행 부근).
- 결과: DashboardView 내부의 `isReadingPeople`(`churchId === UNAFFILIATED_CHURCH_ID`)이 개인 계정에서 항상 false → **T64 평면 랭킹 섹션이 절대 표시되지 않는다.** `hasCommunity = Boolean(currentUser.churchId)`도 false → RaceMap·공지·상점·랭킹이 모든 개인 계정에서 숨겨진다(T64의 "공지·상점은 기존 경로 그대로" 위반). DashboardHeader의 `currentOrganizationName={currentUser.churchName}`도 null이라 T63 버튼 라벨이 항상 "소속 관리" 폴백이다.
- 데이터 로딩(useBibleLogic → useDepartment)은 이미 `dashboardUser`로 되어 있어 roster 병합 멤버가 `allMembersForRace`에 정상 적재된다 — 화면 게이트만 어긋난 상태.
- **T67 수정**: App.jsx의 DashboardView 호출을 `currentUser={dashboardUser}`로 바꾼다. 비개인 계정은 `dashboardUser === currentUser`(useMemo가 원본을 그대로 반환)라 무영향.
  - ⚠️ 제약: 매핑된 `churchId`가 **users 문서에 저장되는 경로가 생기면 안 된다** — 본인 update 규칙이 churchId 값 변경을 거부해 permission-denied가 난다. 검토 결과 DashboardView 계열에 사용자 문서 전체를 set하는 쓰기는 없고 `setCurrentUser`는 전부 함수형 업데이트(원본 기준)지만, 수정 후 이 불변식을 재확인하고 작업 로그에 남길 것.
  - `validate-round11.mjs`에 `currentUser={dashboardUser}` 존재 검사를 추가할 것.

### 🚫 블로커 2 — 세션 복원이 개인 계정을 재온보딩 트랩에 빠뜨림 (라운드 9 기원, 라운드 11로 주 퍼널 격상)

- App.jsx 네비게이션 effect(215행 부근)의 member 분기는 `currentUser.departmentId && currentUser.subgroupId`일 때만 dashboard로 보낸다. 개인 계정 users 문서는 부서/소그룹이 항상 null(부서는 roster 행에만 있음)이라, **모든 소셜 개인 계정이 새로고침할 때마다 `plan_type_select` → 버전 재선택 → 구 `personal_community_onboarding`으로 끌려간다.**
- 데이터 파괴 경로: 그 구 온보딩 화면에서 "나중에 할게요"를 누르면 `finishPersonalOnboarding()`이 `primaryOrgId: null`을 저장해 솔로 사용자의 「성경 읽는 사람들」 기준 지정이 풀린다(roster 행은 잔존). 이미 소속된 단체 재가입은 "이미 참여 중" 오류로 막혀 사실상 빠져나갈 수 없는 트랩이다. planId도 재선택 값으로 덮인다.
- **T68 수정**: 네비게이션 effect의 member 분기에서 `accountType === 'personal'`이면 dept/subgroup 검사 없이 바로 dashboard로 보낸다(`openExistingPersonalUser`와 동일한 결과). 라운드 11 구조상 users 문서는 온보딩 완료 시점에만 생성되므로 planId 없는 고아는 정상 경로에서 생기지 않는다 — 방어적으로 planId 부재 시에만 기존 plan_type_select 폴백을 유지해도 좋다.
- 참고: 이 버그는 라운드 9 출고분에 이미 있었으나(당시 리뷰가 세션 복원 경로를 안 봄), 라운드 11이 개인 계정을 기본 가입 경로로 만들어 심각도가 올라갔다.

### 통과 확인 (수정 불필요)

- 입장코드(codeHash) 검증이 `selectionOnly` 조기 반환보다 앞 단계에서 수행됨 — 온보딩 경유 코드 우회 없음.
- roster 생성 필드가 규칙의 13필드 화이트리스트와 정확히 일치(`handleSocialOnboardingComplete`·`joinSoloCommunity` 모두). users create 규칙에 roster 선존재 요구가 없어 동일 트랜잭션 생성 안전 — "규칙 수정 불필요" 판단 유효.
- 게스트 진도 이관이 온보딩 완료 시점에 적용되고(`buildNewMember`가 게스트 상태 흡수), 중도 이탈 시 users 고아 없음.
- 카카오 popup의 in-flight ref·auth flow guard·UID 재검사(T50 패턴 재사용), 카톡 인앱 redirect 분기, redirect 복귀 시 useUserAuth가 문서 부재를 currentUser=null로만 처리(로그아웃 없음) 후 `getRedirectResult`가 온보딩을 여는 순서 — 부작용 없음.
- 첫 화면 4항목·재방문(saveLastChurch)·`?church=ID` 교회 폼 우선·"변경"으로 소셜 입구 복귀·기존 가입 링크 보존. 관리자 진입 하단 링크화.
- 관리자 뱃지 휴리스틱: 카카오는 `authProvider`, 구 Google 개인은 `@bible.local` 부재로 구분 — 이름 가입 개인 계정(가짜 이메일)에 오탐 없음.
- `useBibleLogic`의 `else setDepartmentMembers(allMembers)`는 광역 변경이지만 실질 도달 계정이 unaffiliated 개인뿐이라 수용(경미).

### 🔧 라운드 11 수정 체크리스트

- [x] **T67. DashboardView에 dashboardUser 전달** — 블로커 1 수정 + 불변식(매핑 churchId 미저장) 확인 + validate 스크립트 보강.
- [x] **T68. 개인 계정 세션 복원 직행** — 블로커 2 수정. 새로고침 → dashboard 직행, 구 personal_community_onboarding 도달 불가 확인.

### ✅ Claude 재리뷰 — 라운드 11 수정 (2026-07-12): **통과, 병합 가능**

- **T67 (c38ae74)**: `currentUser={dashboardUser}` 교체 확인. `dashboardUser` useMemo(App.jsx:50)는 비개인 계정에 원본 `currentUser`를 그대로 반환하므로 회귀 없음. PlanSelectionView(699)와 DashboardView(713) 두 호출부 모두 `dashboardUser` 사용 일관됨.
- **불변식 재확인(리뷰가 요구한 것)**: 매핑된 churchId가 users 문서에 저장되는 경로 없음. 유일한 whole-user 저장은 `personalAccountMigration.js:43`인데, App.jsx:534가 최상위 `currentUser` state를 넘기고(DashboardView prop 아님) 교인(accountType≠personal) 대상이라 그 시점 `dashboardUser===currentUser`. permission-denied 위험 없음.
- **T68 (c9cd61a)**: 네비게이션 effect에 `accountType==='personal' && planId` → dashboard 직행 분기가 dept/subgroup 검사 앞에 추가됨. planId 없는 비정상 문서만 폴백 유지 — 리뷰 처방과 정확히 일치.
- `node scripts/validate-round11.mjs` 통과, `npm run build` 통과.
- **남은 게이트(Codex 아님)**: 사용자 수동 M10(카카오 개발자 앱 + Firebase OIDC `oidc.kakao`, redirect URI `https://bible114-platform.firebaseapp.com/__/auth/handler`) → 실기기 검증 → `npm run deploy`.

---

## 🎓 M10 가이드 모드 — Codex는 사용자를 한 단계씩 안내한다 (2026-07-12, Claude 작성)

> **Codex 행동 규칙 (이 모드에서):**
> 1. 코드를 고치지 마라. 이건 코딩 작업이 아니라 **사용자 교육 세션**이다.
> 2. 아래 단계를 **한 번에 하나씩** 안내하고, 사용자가 "됐어" / 스크린샷 / 결과를 알려주면 다음 단계로 넘어가라. 한꺼번에 전부 쏟아내지 말 것.
> 3. 사용자가 에러 메시지를 보여주면 아래 "문제 해결" 표에서 먼저 찾아 진단하라.
> 4. 각 단계 완료 시 이 문서의 체크박스를 `[x]`로 갱신하라 (이건 커밋해도 된다 — docs 커밋).
> 5. `firebase deploy`, `npm run deploy`, `git push`는 기본적으로 사용자 확인을 기다리되, 사용자가 현재 작업에서 명시적으로 요청하면 Codex가 직접 실행하고 실제 공개 결과까지 확인한다.

### 사전 지식 (사용자에게 먼저 설명해줄 것)

카카오 로그인은 두 회사를 연결하는 작업이다:
- **카카오 개발자 콘솔**: "우리 앱이 카카오 계정으로 로그인해도 된다"고 카카오에 등록.
- **Firebase 콘솔**: "카카오가 확인해준 사람을 우리 회원으로 받아준다"고 Firebase에 등록.
- 코드는 이미 완성돼 있다(`oidc.kakao`). 콘솔 설정만 하면 버튼이 살아난다.

### 1단계 — 카카오 개발자 앱 만들기

- [ ] **1-1.** https://developers.kakao.com 접속 → 카카오 계정 로그인 → 우상단 [내 애플리케이션] → [애플리케이션 추가하기]. 앱 이름 `천로역정 성경읽기`(아무거나 가능), 회사명은 개인 이름도 됨.
- [ ] **1-2.** 만든 앱 클릭 → 좌측 [앱 설정 > 플랫폼] → [Web 플랫폼 등록] → 사이트 도메인에 아래 2개 등록:
  - `https://www.bible114.net`
  - `https://bible114-platform.firebaseapp.com`
- [ ] **1-3.** 좌측 [제품 설정 > 카카오 로그인] → 활성화 설정 **ON**. 같은 화면의 Redirect URI에 아래 주소를 **정확히 그대로** 등록 (오타 나면 로그인이 안 됨):
  ```
  https://bible114-platform.firebaseapp.com/__/auth/handler
  ```
- [ ] **1-4.** 좌측 [제품 설정 > 카카오 로그인 > 동의항목] → **닉네임** 필수 동의로 설정. (이메일은 비즈 앱 심사가 필요하므로 건너뜀 — 코드가 이메일 없이도 동작하게 돼 있음.)
- [ ] **1-5.** 좌측 [제품 설정 > 카카오 로그인 > OpenID Connect] → 활성화 **ON**. (이게 꺼져 있으면 Firebase가 카카오를 못 읽는다 — 가장 흔한 실수.)
- [ ] **1-6.** 좌측 [제품 설정 > 카카오 로그인 > 보안] → **Client Secret 코드 생성** → 상태를 **사용함**으로. 생성된 코드를 복사해 둘 것 (2단계에서 씀).
- [ ] **1-7.** 좌측 [앱 설정 > 앱 키]에서 **REST API 키**를 복사해 둘 것 (2단계에서 씀).

### 2단계 — Firebase에 카카오 연결

- [ ] **2-1.** https://console.firebase.google.com → 프로젝트 **bible114-platform** → 좌측 [빌드 > Authentication] → [Sign-in method] 탭 → [새 제공업체 추가] → **OpenID Connect** 선택. (OpenID Connect가 목록에 없으면 화면 안내에 따라 Identity Platform 업그레이드 — 무료 한도 내.)
- [ ] **2-2.** 설정값을 정확히 입력:
  | 항목 | 값 |
  |---|---|
  | 승인 흐름 | **코드**(Code flow) 선택 |
  | 이름 | `kakao` → 아래 제공업체 ID가 **`oidc.kakao`** 로 표시되는지 확인 (코드와 일치해야 함) |
  | 클라이언트 ID | 1-7에서 복사한 **REST API 키** |
  | 발급기관(Issuer) URL | `https://kauth.kakao.com` |
  | 클라이언트 보안 비밀번호 | 1-6에서 복사한 **Client Secret** |
- [ ] **2-3.** 저장 후, 같은 [Sign-in method] 화면 하단 **승인된 도메인**에 `www.bible114.net`이 있는지 확인 (라운드 6 때 등록했으면 이미 있음).

### 3단계 — 로컬에서 먼저 테스트 (배포 전)

- [ ] **3-1.** 터미널에서 `npm run dev` → 브라우저에서 `http://localhost:5173` 접속.
- [ ] **3-2.** 첫 화면 [💬 카카오로 시작하기] 클릭 → 카카오 로그인 팝업이 뜨고 → 동의 → **온보딩 3단계(이름→소속→버전)** 화면이 나오면 성공.
- [ ] **3-3.** 온보딩 완료 후 대시보드 진입 → **새로고침(F5)** → 대시보드로 바로 돌아오는지 확인 (T68 검증).
- [ ] **3-4.** 대시보드에서 랭킹·공지 영역이 보이는지 확인 (T67 검증).
- [ ] **3-5.** [구글로 시작하기]도 같은 방식으로 1회 확인. 기존 회원(이름·생년월일) 로그인도 1회 확인 (회귀 검증).

### 4단계 — 배포 (사용자 터미널에서 직접)

- [ ] **4-1.** `git push origin main` (로컬 커밋들을 GitHub에 올림).
- [ ] **4-2.** `npm run deploy` (www.bible114.net 에 반영, 1~2분 소요).
- [ ] **4-3.** 휴대폰에서 www.bible114.net 접속 → 카카오 로그인 1회 재확인. **카카오톡 앱 안에서 링크를 열었을 때**(인앱 브라우저)도 로그인되는지 확인 — 이때는 팝업 대신 페이지 전체가 이동했다 돌아오는 게 정상.

### 문제 해결 (사용자가 에러를 보여주면 여기서 먼저 찾기)

| 증상 | 원인 | 해결 |
|---|---|---|
| "카카오 로그인이 아직 활성화되지 않았습니다" (`auth/operation-not-allowed`) | Firebase에 oidc.kakao 제공업체가 없거나 비활성 | 2-1~2-2 다시 확인 |
| 카카오 화면에서 "잘못된 요청(KOE101 등)" | REST API 키 오입력 또는 카카오 로그인 미활성화 | 1-3, 1-7, 2-2 확인 |
| 카카오 화면에서 "등록되지 않은 Redirect URI(KOE006)" | Redirect URI 오타 | 1-3의 주소를 복사-붙여넣기로 재등록 |
| 로그인 후 무한 로딩/에러 (`invalid_client`) | Client Secret 불일치 또는 "사용함" 미설정 | 1-6, 2-2 확인 |
| Firebase에서 "Invalid issuer" | Issuer URL 오타 | `https://kauth.kakao.com` (끝에 / 없음) |
| 팝업이 안 뜸 | 브라우저 팝업 차단 | 주소창 팝업 허용 후 재시도 |
| 카톡 인앱에서 팝업 에러 | 정상 아님 — 코드가 redirect로 자동 전환해야 함 | 재현되면 "Codex → Claude 메모"에 기록 (코드 버그) |

### 완료 후

- [ ] 이 섹션 체크박스가 전부 `[x]`면, "Codex → Claude 메모"에 "M10 완료, 실검증 통과" 한 줄을 남기고 사용자에게 축하 인사를 할 것. 다음 라운드(12 후보: 기존 계정 소셜 연결 등)는 Claude가 설계한다.
---

## 🔁 라운드 12 — 모바일 헤더 칩 겹침 수정 (2026-07-13 사용자 보고, T69)

> 실기기(iPhone) 스크린샷 증상: 성도 대시보드 상단 칩 줄에서 **로그아웃 버튼이 📆 달력 칩 위에 겹쳐서 렌더링**됨.
> 위치: `src/components/dashboard/DashboardHeader.jsx` 60~92행 칩 줄.

### 원인 진단 (Claude 분석 — 구현 전 재현으로 확인할 것)

- 칩 줄 컨테이너가 `overflow-x-auto` + `justify-between` + `w-full`이고, 내부 칩 전원이 `shrink-0`이다.
- 모바일 375px에서 칩 7개(🔥·pt·달란트·🏅·📅·📆·❓) + 구분선 + 로그아웃이 화면 폭을 초과 → 음수 여유 공간 상태의 `justify-between` + 가로 스크롤 조합이 iOS Safari에서 마지막 그룹(로그아웃)을 겹쳐 그린다.
- 구조적 문제: 애초에 한 줄에 다 안 들어가는 내용을 스크롤로 숨기는 방식이라, 겹침이 아니어도 어르신이 오른쪽 칩들을 발견하지 못한다.

### T69 요구사항

- [x] **줄바꿈 방식으로 전환** (스크롤 제거): 칩 줄 컨테이너에서 `overflow-x-auto`·`scrollbar-hide`·`justify-between`을 제거하고 `flex-wrap`으로 자연 줄바꿈. 칩이 많으면 두 줄로 흐른다. 로그아웃은 별도 우측 그룹이 아니라 **칩 흐름의 마지막 요소**로 편입(구분선 `w-px` divider는 모바일에서 숨김 `hidden md:block`).
- [x] md 이상(데스크톱)은 기존 한 줄 우측 정렬 레이아웃 유지 (`md:` 분기).
- [x] 소속 관리 버튼(T63, `onOpenMemberships`)·버전 버튼과의 세로 배치가 모바일에서 겹치거나 밀리지 않는지 함께 확인.
- [x] 완료 기준: 375px(iPhone SE)·390px(iPhone 14)에서 모든 칩+로그아웃이 겹침 없이 보이고 탭 가능, md 이상 기존과 동일, 빌드 통과. 로컬 dev를 375px로 리사이즈해 시드 계정 수준으로 확인(실로그인 불가 시 스타일 검증은 정적 + 스크린샷으로). *(인증 시드 부재로 실제 클릭 대신 반응형 클래스 정적 계약 검사로 확인.)*

수정 후 배포는 M10 가이드 모드의 배포 절차(빌드→사용자 npm run deploy 안내)를 따른다.

## 🔁 라운드 11-보완 — 카카오 로그인 무료(커스텀 토큰) 전환 (2026-07-13 사용자 확정, T60R)

> 배경: OIDC 방식은 Identity Platform Tier 2라 **월 50 MAU 초과 시 유료**(사용자가 무료 확정 요구).
> 커스텀 토큰 방식은 Tier 1(월 5만 MAU 무료, 기본 Firebase는 과금 자체 없음)이라 완전 무료.
> **기존 T60의 OIDC(`oidc.kakao`) 코드는 이 방식으로 교체**한다. 구글 로그인·온보딩(T61~T66)은 그대로.

### 아키텍처 (설계 확정 — 임의 변경 금지)

```
[클라이언트] 카카오 버튼 → kauth.kakao.com/oauth/authorize 로 페이지 이동 (SDK 불필요)
    → redirect_uri(사이트 루트)로 ?code=… 붙어 복귀
[클라이언트] code + state 검증 → Supabase Edge Function 'kakao-auth' 호출
[함수] ① code→토큰 교환(kauth/oauth/token, client_secret 사용)
       ② kapi.kakao.com/v2/user/me 로 카카오 회원번호·닉네임(·이메일) 획득
       ③ Firebase 서비스 계정으로 커스텀 토큰 서명 (uid = "kakao:{회원번호}")
       ④ { token, nickname, email } 반환
[클라이언트] auth.signInWithCustomToken(token) → 기존 흐름(문서 있으면 입장, 없으면 3단계 온보딩)
```

- **redirect 방식의 부수 이점**: 카카오톡 인앱 브라우저에서도 그대로 동작 — 기존 인앱 분기·팝업 처리 불필요(단순해짐).
- `sign_in_provider`가 'custom'이라 익명이 아님 → firestore.rules `isRealUser()` 그대로 통과, **규칙 변경 불필요**.
- uid가 `kakao:{회원번호}`로 영구 고정 → 재로그인 시 동일 계정 자동 연결.

### T60R 체크리스트

- [x] **T60R-a. Supabase Edge Function** — 신규 `supabase/functions/kakao-auth/index.ts` (Deno)
  - 입력 `{ code, redirectUri }`. ① `POST https://kauth.kakao.com/oauth/token` (grant_type=authorization_code, client_id=KAKAO_REST_KEY, client_secret=KAKAO_CLIENT_SECRET, redirect_uri, code) ② `GET https://kapi.kakao.com/v2/user/me` (Bearer access_token) → `id`(회원번호), `kakao_account.profile.nickname`, `kakao_account.email`(있으면).
  - ③ 커스텀 토큰: firebase-admin은 Deno 미지원 — **`jose` 라이브러리로 RS256 JWT 직접 서명**. 클레임: `{ iss: client_email, sub: client_email, aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", iat, exp: iat+3600, uid: "kakao:"+id }`. 서명키는 서비스 계정 JSON의 private_key.
  - 시크릿은 전부 Supabase secrets 환경변수(`KAKAO_REST_KEY`, `KAKAO_CLIENT_SECRET`, `FIREBASE_SERVICE_ACCOUNT` JSON 문자열)로만 — **코드·저장소에 커밋 절대 금지**.
  - CORS: `https://www.bible114.net`, `https://bible114.net`, `http://localhost:5173`(및 5177)만 허용. 실패 시 상태코드+한국어 오류 메시지 JSON.
- [x] **T60R-b. 클라이언트 교체** (`useAuth.js` 등 — 기존 `oidc.kakao` 코드 제거)
  - 시작: 랜덤 `state`를 sessionStorage에 저장 후 `location.href = https://kauth.kakao.com/oauth/authorize?client_id={REST_KEY}&redirect_uri={origin}/&response_type=code&state={state}` (REST_KEY는 공개값이라 constants.js에 둬도 됨).
  - 복귀 처리: 앱 부트 시 URL에 `code`+`state`가 있으면 → state 일치 검증(불일치 시 무시+정리) → 함수 호출 → `signInWithCustomToken` → `history.replaceState`로 URL의 code/state 제거 → 기존 T60 후속(문서 조회→입장 또는 온보딩). 실패·사용자 취소(error=access_denied)는 첫 화면 + 안내 문구.
  - in-flight 가드·중복 처리 방지(복귀 처리 1회성 — sessionStorage 플래그), `?church=` 전용 링크 파라미터와의 충돌 없는지 확인.
- [x] **T60R-c. 검증** — 함수 단위 픽스처(코드 교환·유저정보·JWT 클레임 모킹), 클라이언트 state 검증·URL 정리·취소 흐름 픽스처, 빌드. 실連동은 M10R 완료 후 가이드 모드로.

### M10 개정 (M10R — 사용자 수동, Codex가 가이드 모드로 안내)

1. 카카오 개발자 콘솔: 앱 생성 → Web 플랫폼 도메인 등록 → 카카오 로그인 활성화 → **Redirect URI = `https://www.bible114.net/` 와 `http://localhost:5173/`** → 동의항목 닉네임 필수(이메일 선택) → 보안 Client Secret 생성·활성화. (**OpenID Connect 활성화 불필요**, Firebase 콘솔 OIDC 공급자 등록도 **불필요** — 기존 M10의 해당 단계 폐기.)
2. Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성**(JSON 다운로드 — 이 파일은 절대 저장소에 넣지 않기).
3. Supabase(기존 프로젝트, 노션 동기화 쓰던 곳): `supabase login` → `supabase secrets set KAKAO_REST_KEY=… KAKAO_CLIENT_SECRET=… FIREBASE_SERVICE_ACCOUNT="$(cat 키.json)"` → `supabase functions deploy kakao-auth --no-verify-jwt`. (명령은 Codex가 복붙용으로 안내.)

**M10R 실행 상태(2026-07-13):** 위 1~3 완료. Supabase 프로젝트 ref `ejqnwajcvkvpcxechwzl`의 함수 배포 및 실제 카카오 로그인→Firebase 커스텀 사용자→온보딩 1단계 진입까지 통과. 남은 것은 사용자 승인 대상인 운영 사이트 배포와 신규 계정 온보딩 최종 저장 확인이다.

## ✅ Claude 리뷰 결과 — T60R·T69·M10R (2026-07-13)

3개 커밋 검토 완료 — **병합 가능, 수정 없음**. 검증 스크립트(카카오 계약·라운드 11)·빌드를 Claude가 재실행해 통과 확인.

- **보안 통과**: 카카오 Client Secret·Firebase 서비스 계정은 Supabase secrets에만 존재, 저장소·이력에 시크릿 없음(.env.local gitignore + 커밋 이력 0건, 저장소에는 공개값 자리만). 엣지 함수는 origin·redirectUri 이중 화이트리스트, 오류는 일반화 응답+서버 로그 분리.
- **T60R**: state CSRF·1회성 처리 플래그·URL 정리·취소/오류 경로 완비, OIDC 잔재 완전 제거, JWT 클레임 스펙 일치. 실연동으로 카카오 동의→`kakao:` UID 생성→이름 온보딩 진입까지 확인됨(CORS 204 버그 발견·수정 포함 — 좋은 처리).
- **T69**: 스펙 그대로(wrap 전환·로그아웃 편입·divider 모바일 숨김·md 유지).
- 남은 확인(배포 후 사용자): 카카오 신규의 온보딩 3단계 최종 완료(users/roster 실쓰기), 375px 실기기에서 칩 겹침 해소 확인.

---

## 🔁 라운드 13 — 실사용 점검 발견 수정 (2026-07-13 Claude 설계, T70~T74)

> 배경: Codex 실사용자 점검에서 발견한 5건 + 검증 공백 1건 ("2026-07-13 Codex 사이트 점검 발견" 메모 참조).
> 전부 rules 무관 — 자동 진행 대상. **⚠️ 이 라운드부터 git 커밋 금지** — 이 환경의 Codex 샌드박스가
> .git 쓰기를 차단하므로(index.lock 실패 확인됨), 코드 수정 + 작업 로그/메모 기록까지만 하고
> 커밋은 Claude가 리뷰 후 수행한다. 나머지 프로토콜(순서·빌드 통과·로그)은 동일.

### 라운드 13 제약

- firestore.rules 수정 금지. score/talent 적립·진도 저장 **로직 무변경** — T70은 표시(display)만 고친다.
- 기존 회원 데이터 마이그레이션 금지 (currentDay/readCount 의미는 그대로: currentDay = "다음에 읽을 날").

### 체크리스트

- [x] **T70. "총 N일" 진행일 표시 수정** — 원인: `(readCount-1)*365 + currentDay`는 "다음에 읽을 날"을 포함해 실제 읽은 일수보다 1 크다 (신규가 "총 1일", 1일 읽으면 "총 2일").
  - 공용 헬퍼 신설 `getDaysRead(member) = ((readCount||1)-1)*365 + Math.max(0, (currentDay||1)-1)` — helpers.js 또는 statsUtils.js.
  - **표시 지점만 교체**: `src/utils/statsUtils.js:76`, `src/components/DashboardView.jsx:206`, `src/components/ChurchAdminView.jsx:1152`(getTotalProgressDay 소비처 전부) + 같은 패턴 전수 검색(`(readCount`- 계열)로 누락 방지. 랭킹 정렬값도 같은 헬퍼로.
  - **바꾸지 말 것**: 달리기 맵의 위치 계산·본문 로딩·읽기 트랜잭션의 currentDay 사용처(진도 의미 자체는 유지). "DAY N" 라벨 중 "현재 읽는 날"을 뜻하는 곳(본문 헤더 등)은 currentDay가 맞으니 유지 — 구분 기준: "얼마나 읽었나"는 getDaysRead, "몇 일차를 읽고 있나"는 currentDay.
  - 0일인 신규는 "총 0일"로 표시 (별도 문구 불필요).
- [x] **T71. 퀴즈 선행 게이트 유도 개선** — 잠금 상태의 `오늘 읽기 완료` 자리를 비활성 버튼 대신 **활성 버튼 "☝️ 먼저 오늘 퀴즈 풀기"**로 교체: 클릭 시 퀴즈 카드로 부드럽게 스크롤 + 카드 테두리 강조(2초). 보조 문구 "퀴즈를 풀면 읽기 완료 버튼이 열려요"를 버튼 아래 표시. 퀴즈 게이트 해제 조건·로직(T33)은 무변경.
- [x] **T72. 퀴즈 완료 후 카드 상태 정리** — 오늘 퀴즈를 마친 뒤(정답·2회 소진 포함)에는 문항·보기를 접고 요약만: "✅ 오늘 퀴즈 완료 · 내일 새 문제가 나와요" (+획득 달란트). DAY 라벨/문항 노출 제거로 "본문은 DAY 2인데 퀴즈는 DAY 1" 대비 혼란 제거. 요약 카드에 "↓ 이어서 본문 읽기" 스크롤 버튼 추가 (T71과 함께 발견 5의 긴 스크롤 문제 완화). 접힌 카드는 탭하면 펼쳐 정답·해설 재확인 가능.
- [x] **T73. 헤더 아이콘 버튼 접근성** — 도움말(Icon helpbook) 버튼에 `aria-label="읽는 방법 도움말"` 추가. 같은 줄의 🏅(달성 뱃지)·📅(날짜 설정)·📆(읽기 달력) 아이콘 버튼에도 aria-label 일괄 추가.
- [ ] **T74. 모바일 375/390 재검증** — 로컬 dev를 375px·390px로 리사이즈해 헤더 칩 줄바꿈·로그아웃·소속 관리 버튼의 겹침/탭 가능 여부 확인, T70~T72 화면도 같은 폭에서 확인. 결과(스크린샷 또는 관찰 기록)를 작업 로그에 남김.

완료 기준: 각 작업 후 `npm run build` + `node scripts/validate-round11.mjs` 통과, 작업 로그 기록. 커밋 금지(위 참조).

## ✅ Claude 리뷰 결과 — 라운드 13 (2026-07-13)

T70~T73 diff 검토 완료 — **병합 가능, 수정 없음**. 핵심 확인: T70의 위치/표시 분리 정확(달리기 맵은 `mapDay`로 기존 위치 보존, 랭킹·평균·정렬만 `getDaysRead`), 진도 저장 로직 무변경, T71 게이트 버튼이 활성 버튼+스크롤+2초 강조로 교체, T72 완료 퀴즈 접힘/펼침·본문 스크롤 버튼, T73 aria-label. 빌드+검증기 3종 Claude 재실행 통과.

**T74는 Claude가 직접 수행**(Codex 브라우저 부재): 375×812에서 첫 화면 4항목·소셜 버튼·관리자 링크 겹침 없음 확인(스크린샷+텍스트 트리). 로그인 필요한 성도 헤더 칩은 정적 계약 검사로 갈음 — 사용자 실기기 확인 항목 유지.

nit(다음 라운드 참고): 완료 퀴즈 요약이 2회 오답(보상 0)일 때도 "⭐ +0달란트"로 표시됨 — 문구 분기하면 더 자연스러움.

---

## 🔁 라운드 14 — 개인 계정 관리자 지원 (2026-07-13 사용자 승인, T75~T77)

> 배경: 2차 점검 발견 3건 — 개인 계정(카카오/구글)의 ①창구 판매 차단 ②구매 환불 불가 ③관리자 비밀번호
> 변경이 실제 Auth에 미반영. **T75 규칙은 Claude가 이미 수정·배포함** — 기준 공동체(primaryOrgId) 관리자가
> 개인 계정 users의 `talent`(+updatedAt) 필드만 수정 가능해졌다.

### 라운드 14 제약

- firestore.rules 추가 수정 금지 (T75 배포 완료). git 커밋 금지(라운드 13과 동일 — Claude가 커밋).
- **시크릿을 코드·저장소에 절대 넣지 말 것** — 서버 함수의 서비스 계정은 기존 Supabase secret `FIREBASE_SERVICE_ACCOUNT` 재사용.
- 서버 함수 배포(`supabase functions deploy`)는 수행하되, 실패 시 명령어를 로그에 남기고 넘어갈 것.

### 체크리스트

- [x] **T75c. 창구 판매·환불에서 개인 계정 활성화** (`ChurchAdminView.jsx`)
  - 창구 판매 교인 선택에서 개인·외부 멤버 disabled 해제 — 단, **차감 시도 후 permission-denied면** "이 교인의 기준 공동체가 우리 조직이 아니라 차감할 수 없어요" 토스트로 구분 안내 (기준 공동체가 이 교회인 개인 계정만 규칙 통과).
  - 구매 취소·환불 batch의 users talent increment도 동일 — 개인 계정 대상 활성화 + 실패 시 같은 안내.
  - 창구 판매·환불 성공 시 로컬 members/purchases 상태 갱신은 기존 로직 재사용.
- [ ] **T76. 관리자 비밀번호 실변경 서버 함수** — 신규 `supabase/functions/admin-set-password/index.ts`
  - 입력: `{ targetUid, newPassword }` + 헤더 `Authorization: Bearer <호출자 Firebase idToken>`.
  - 서버 검증 순서(전부 서버에서, 클라이언트 신뢰 금지): ① idToken을 identitytoolkit `accounts:lookup`으로 검증해 호출자 uid 획득 ② 서비스 계정 OAuth2 토큰(jose JWT grant — kakao-auth의 서명 유틸 패턴 재사용)으로 Firestore REST 조회: 호출자 users 문서의 role이 churchAdmin/platformAdmin/superAdmin인지, 대상 users 문서의 `churchId` 또는 `primaryOrgId`가 호출자 churchId와 일치하는지(플랫폼 관리자는 전체 허용) ③ 통과 시 identitytoolkit `accounts:update`로 대상 비밀번호 실변경 ④ Firestore REST로 대상 `users/{uid}/private/auth`의 password 필드 갱신(조회용 동기화).
  - newPassword 6자 이상 검증, CORS는 kakao-auth와 동일 화이트리스트, 오류는 일반화 메시지+서버 로그.
  - 클라이언트: 교회 관리자 비밀번호 재설정·플랫폼 관리자 비밀번호 변경 UI가 이 함수를 호출하도록 교체(기존 private/auth 직접 쓰기 제거). 성공 문구 "실제 로그인 비밀번호가 변경되었습니다".
- [ ] **T77. 검증** — 함수 픽스처(권한 거부: 비관리자/타교회 관리자, 성공: 같은 교회·기준 공동체·플랫폼), 클라이언트 경로 계약 검사 추가, `npm run build` + 기존 검증기 3종. 실 Auth 변경은 테스트 교회 계정으로만.

## ✅ Claude 리뷰 결과 — 라운드 14 (2026-07-13)

T75c·T76 검토 완료 — **보안 차단급 1건 발견, Claude가 직접 수정 후 병합**:

1. **(차단급 → 수정됨)** `admin-set-password`의 Auth 비밀번호 변경 호출이 공개 API 키만 사용 — 관리자형 계정 수정(localId 지정)은 서비스 계정 OAuth 토큰이 필요해 이대로면 구글이 전부 거부. 수정: OAuth scope에 identitytoolkit 추가 + `projects/{id}/accounts:update`를 Bearer 토큰으로 호출.
2. (보강) 삭제 처리된(isDeleted) 관리자 계정의 잔존 세션이 함수를 호출하는 경로 차단.
3. 권한 모델 검증 통과: idToken lookup → 서비스 계정으로 호출자 role·교회 확인 → 대상의 churchId/primaryOrgId 일치 or 플랫폼 관리자 — 설계와 일치. 클라이언트 유틸·CORS·오류 일반화도 정상.

배포 상태: **함수 배포 완료**(ejqnwajcvkvpcxechwzl), `VITE_ADMIN_SET_PASSWORD_URL` 로컬 설정 완료. **T75 규칙과 클라이언트 배포는 Firebase 재인증 대기** — 사용자 `firebase login --reauth` 후 rules+client 동시 배포 예정. T77 실검증은 배포 후 테스트 교회 계정으로.

---

## ✅ Claude 리뷰 결과 — 3차 점검 대응 (2026-07-13)

3차 점검 발견 1건(개인 계정 창구 판매 음수 잔액) — **규칙 강화로 즉시 해결·배포**: 라운드 14 talent 분기에 `request.resource.data.talent is number && >= 0` 조건 추가 (관리자가 개인 잔액을 조회할 수 없으므로 음수 차감은 규칙이 거부, 권한 축소 방향이라 자동 적용). 클라이언트 거부 안내 문구를 잔액 부족 겸용으로 확장. rules+client 배포 완료. 이상 없음 5개 영역(매일 영상·퀴즈 경계일·A4 인쇄물·완독 전환·관리자 통계)과 검증기 5종 통과 확인. 남은 화면 검증(유튜브 실영상·인쇄 대화상자·365일 실계정·T77 비밀번호 실변경)은 사용자 실기기 체크리스트로 이관.

---

## 🔁 라운드 15 — 모바일 실제 사용자 E2E QA 대응 (2026-07-13 Claude 수정 설계, T78~T86)

> 근거: `QA_MOBILE_E2E_2026-07-13.md`. 같은 날 365일 진행·4,014점 적립, 퀴즈 게이트 우회,
> 업적 표시 불일치, 퀴즈 누락 검증 성공, 한국어 부적합 음성, 모바일 고정 요소 겹침,
> 기준 공동체 탈퇴 위험, 이름 가입 후 랜딩 복귀, 여정 지도 배지 잘림을 실사용으로 확인했다.

### 라운드 15 공통 원칙

- 기존 `currentDay`, `readCount`, `score`, `talent`, `lastReadDate`는 보존한다. 신규 필드는 없으면 기본값으로 처리한다.
- `한 장 더 읽기` 자체는 유지하되, 하루 허용 진도와 보상을 분리한다.
- Firebase compat(v8) 스타일을 유지하고 `firestore.rules`의 `users` read 규칙은 수정하지 않는다.
- 날짜/개인 진도 혼동과 묵상 다운로드는 정책·실기기 확인이 먼저이므로 이번 라운드에서 구현하지 않는다.

### 체크리스트

- [x] **T78. 하루 추가 읽기 상한·보상 분리** — `useUserBibleActions.js`
  - 사용자 문서에 날짜별 진행 횟수를 저장한다. 하루 최초 읽기 1회 + 추가 읽기 2회, 총 3회까지만 진도를 전진시킨다.
  - 점수·달란트·연속일·읽은 날짜 보상은 하루 최초 읽기에만 반영한다. 추가 읽기는 진도만 이동한다.
  - 상한 초과는 transaction 안에서 no-op 처리하고 사용자 안내를 표시한다. 기존 사용자에게 신규 필드가 없으면 0회로 호환한다.
- [x] **T79. 오늘 퀴즈 게이트와 추가 읽기 정책 정합** — `BibleReader.jsx`, 퀴즈 상태 경로
  - 오늘 퀴즈를 풀거나 허용된 건너뛰기를 한 뒤에만 오늘의 최초/추가 읽기를 진행할 수 있다.
  - 과거 DAY의 퀴즈 상태와 현재 진행 DAY 라벨이 섞이지 않도록 오늘 날짜 기준 완료 상태를 사용한다.
- [x] **T80. 업적 계산·표시 단일화** — 업적 계산 경로, `useUserBibleActions.js`, `useMemos.js`, 업적 모달
  - 토스트와 모달이 동일 조건 함수와 병합된 최신 업적 배열을 사용한다.
  - 첫 묵상·누적 점수 업적 직후 모달 카운트가 즉시 일치해야 한다.
- [x] **T81. 퀴즈 검증기 fail-close** — `scripts/validate-quiz.mjs`
  - 지원 플랜 필수 DAY에 문항 풀이 0개면 누락 책/장/DAY 요약 후 exit 1.
  - 런타임의 안전한 대체 문항 정책과 배포 전 완전성 검증을 분리한다.
- [x] **T82. 한국어 TTS 음성 우선** — `useTTS.js`, `BibleReader.jsx`
  - `lang`이 한국어인 음성만 기본 목록에 노출한다. 기존 저장 음성이 한국어가 아니면 한국어 기본값으로 안전 전환한다.
  - 음성 선택만으로 자동 재생하지 않는다.
- [x] **T83. 모바일 고정 요소 겹침 제거** — 공통 레이아웃/광고/카카오 채팅
  - safe-area와 하단 광고 높이를 공통 여백에 반영해 375/390/500px에서 콘텐츠·버튼을 가리지 않게 한다.
- [x] **T84. 기준 공동체 탈퇴 방지** — `CommunityMembershipCard.jsx`
  - 현재 `primaryOrgId` 공동체는 탈퇴를 막고 이유를 안내한다. 다른 공동체를 기준으로 지정한 뒤에만 기존 공동체 탈퇴를 허용한다.
- [x] **T85. 이름 가입 직후 자동 진입** — `LoginView.jsx`, `useAuth.js`, `App.jsx`
  - 가입 성공 후 현재 인증 세션을 유지하고 온보딩/대시보드로 즉시 진입한다. 랜딩에서 재로그인을 요구하지 않는다.
- [x] **T86. 여정 지도 배지 잘림 수정** — `RaceMap.jsx`
  - 초반 DAY의 이름·소속 배지 위치를 뷰포트 안으로 clamp하고 375~500px에서 잘림이 없어야 한다.

완료 기준: `npm run build`, 관련 기존 검증기, 신규 경계 픽스처, 모바일 375/390/500px 실사용 재검증.

### 다음 작업자 시작점

- **현재 코드 상태**: T78~T86 수정은 로컬에 있으며 미커밋·미배포다. 먼저 diff와 `scripts/validate-round15.mjs`를 리뷰한다.
- **통과 확인**: `node scripts/validate-round15.mjs`, `npm run build`, `node scripts/validate-round11.mjs`, `git diff --check`.
- **의도된 실패**: `node scripts/validate-quiz.mjs`는 미저작 본문 1,028개 때문에 exit 1이 정상이다. 검증기를 되돌리지 말고 콘텐츠를 보강한다.
- **실화면 완료**: Chrome 500×929에서 일일 3회 상한·최초 1회 보상·업적 1/14·한국어 음성 목록·상담 버튼 비겹침·이름 가입 자동 진입을 확인했다.
- **실화면 미확인**: 공동체가 있는 계정의 기준 공동체 탈퇴 버튼과 RaceMap 배지는 코드·계약 검사만 통과했다. 375/390px 실기기도 배포 전 추가 확인한다.
- **QA 계정 상태**: 새번역 114 테스트 계정은 DAY 4, 신약 일독 새번역 테스트 계정은 DAY 1이다. 하루 상한 때문에 같은 날 365회 반복 QA는 더 이상 수행하지 않는다.
- **금지 유지**: 사용자 승인 없이 배포·push하지 말고, `firestore.rules`의 `users` read 규칙과 `users.password` 설계는 건드리지 않는다.

## ✅ Claude 리뷰 결과 — 라운드 15 (2026-07-13)

T78~T86 검토 완료 — **병합·배포 가능, 수정 없음**. 핵심 확인: 하루 3회 상한이 트랜잭션 내부에서 no-op으로 강제(P0 어뷰징 차단), 점수·달란트·연속일이 첫 읽기에만 적립, 레거시 호환(신규 필드 없는 기존 사용자가 오늘 이미 읽었으면 첫 읽기 재보상 없음 — readPolicy.getDailyAdvanceState), 업적이 트랜잭션+병합으로 단일화(0/14 불일치 근본 해결), 재시작 시 신규 필드 리셋. Codex가 모바일 500px 실기기 확인까지 수행(4회차 no-op·업적 1/14·유나 음성·자동 진입). validate-round15/11 + 빌드 통과.

참고: `validate-quiz`는 fail-close 전환으로 **미저작 문항 1,028개(약 275일치)를 exit 1로 표면화** — 런타임은 카드 숨김(fail-open)이라 사용자 영향 없음. 이 검증기는 문항 저작 백로그 추적용이며 배포 게이트에서 제외. 프로세스 참고: codex exec가 작업 완료 후 종료하지 않고 잔류하는 현상 1회 — 결과물 확인 후 수동 정리함.

---

## 🔁 라운드 16 — 퀴즈 문항 저작 완결 (2026-07-13 사용자 승인, T87 반복 배치)

> 근거: T81 fail-close 검증기가 표면화한 미저작 문항 1,028개(약 275일치). 목표: `node scripts/validate-quiz.mjs` **exit 0**.
> 이 라운드는 코드 라운드가 아니라 **콘텐츠 저작 라운드**다 — 여러 사이클(배치)로 나눠 반복 실행된다.

### 라운드 16 제약

- **앱 코드 수정 금지** — `src/data/quiz/*.json` 신규/추가와 필요 시 검증 스크립트 픽스처만. git 커밋 금지(Claude 담당).
- 기존 저작 문항 수정 금지(사용자 검수 전). 문항 규격은 T28과 동일: `{ q, choices[4], answerIndex, ref }`, 개역개정 기준, 난이도 쉬움~중간, 어르신 친화 문장, **정확한 숫자·치수 암기형 금지**, 장당 구약 3·신약 5문항, day pool 5개 이상.
- 매 배치 작업 로그에 "퀴즈 문항 신학 검수 필요(사용자)" 명시.

### T87 완결 기준 (2026-07-13 사용자 강조 — 반드시 준수)

- **한 문제도 빠지지 않게**: 지원되는 **모든 플랜 × 365일 전부**에서 day pool 5개 이상. 특정 플랜/날짜라도 비면 미완.
- **신약일독은 "하루 = 장이 아니라 범위(세그먼트)"**: `read_schedules.json`의 실제 하루 읽기 범위(예: 눅 3:21-4:13, 장 경계 걸침 포함)를 `parseReadingRange`로 전개한 그 범위 본문에서만 출제해야 한다. 그날 안 읽는 장의 문항이 pool에 들어가면 안 되고, 범위가 짧아도 pool 5개는 채워야 한다 (T27b 파서·검증기가 기준).
- 완료 판정은 오직 `node scripts/validate-quiz.mjs` **exit 0** — 검증기를 약화시켜 통과시키는 것 금지.

### T87. 배치 저작 (사이클당 1배치) — ✅ 완료 (`validate-quiz` exit 0)

1. `node scripts/validate-quiz.mjs` 실행 → 누락 요약에서 **사용자 진도가 먼저 도달할 구간 우선**(일년일독 Day 1~190 → Day 281~365 → 신약일독 잔여 → 기타 플랜)으로 이번 배치 대상 **30~40일치**를 고른다.
2. 해당 책 JSON에 문항 저작 → 검증기 재실행으로 누락 수 감소 확인 → `npm run build` 통과 확인.
3. 작업 로그에 배치 범위·저작 문항 수·남은 누락 수 기록. 남은 누락이 0이면 "T87 완료 — exit 0"을 기록.

## 🔁 라운드 17 — 개발자 관점 코드 정리 (2026-07-13 사용자 승인 — ⚠️ 라운드 16 완결 후 시작)

> 목적: 기능 15라운드 동안 쌓인 기술 부채 정리. **동작 변경 절대 금지** — 순수 리팩터·정리만.
> 순서 고정(안전한 것부터), 각 작업 후 `npm run build` + 검증기 전체 통과 필수. firestore.rules 무수정, git 커밋 금지(Claude 담당).

- [x] **T88. 죽은 코드·루트 잔재 제거** — 사용처 0임을 grep으로 확인한 것만: 미사용 컴포넌트(예: DemoTour 연결 여부 확인), 미사용 export/import, 루트의 실험 파일(test_simulation.mjs 등 — 참조 없으면 삭제), 주석 처리된 코드 블록. 각 삭제의 근거(검색 결과 0건)를 작업 로그에 남길 것.
- [x] **T89. 검증 파이프라인 통합** — package.json에 `npm run validate` 하나로 validate-round11/round15/kakao-custom-auth/personal-migration(+quiz는 별도 `validate:quiz`)이 전부 도는 스크립트 등록. 실패 시 어느 검증기인지 명확히.
- [x] **T90. 번들 코드 스플리팅** — `PlatformAdminView`·`ChurchAdminView`를 React.lazy+Suspense로 지연 로딩(교인·게스트는 관리자 코드를 내려받지 않게). 메인 청크 크기 before/after를 로그에 기록. 500KB 경고 해소가 목표.
- [x] **T91. 거대 컴포넌트 분할 1차** — `ChurchAdminView.jsx`를 탭 단위 파일로 분리(대시보드/교인/상점/조직/공지/설정 → `src/components/churchAdmin/*.jsx`). **한 탭씩** 옮기고 매번 빌드 확인. props·상태·로직은 그대로 이동만(리네이밍·개선 금지). PlatformAdminView는 이번에 손대지 않음(2차 후보).
- [x] **T92. 마무리 청소** — 프로덕션 코드의 console.log 중 디버그성 제거(오류 로그 console.error는 유지), 미사용 CSS 클래스 확인, 작업 로그에 남긴 것/남긴 이유 기록.

완료 기준: 빌드+`npm run validate` 통과, 기능 diff 없음(리팩터 전후 화면 동작 동일 — 로그인 화면 렌더를 로컬로 확인).

## 🔁 라운드 18 — 실사용 피드백 7건 (2026-07-14 사용자 지시 — ⚠️ 라운드 17 완결 후 시작)

> 사용자 실사용 후 직접 지시 7건. 동작 우선순위: T93~T94(첫인상) → T98~T99(읽기 흐름) → T96 → T97(달란트 지갑) → T95(소셜 연결).
> **T97r 규칙 배포 및 활성 규칙셋 확인 완료(2026-07-14)** — roster talent 화이트리스트+음수 방지 라이브. **T97·T102까지 로컬 구현·검증 완료.**

- [x] **T93. 브랜딩 교체** — "천로역정 성경읽기" → **"성경통독 114"** 전체 교체: LoginView 로고(데스크톱·모바일), index.html `<title>`, A4 인쇄물 3종 문구, 기타 grep 전수. 히어로의 "천로역정 같은 통독의 길" 비유도 "함께 걷는 통독의 길"로.
- [x] **T94. 첫 화면 — 카카오 단일 주 버튼 (당근마켓 스타일, 2026-07-14 사용자 레퍼런스 확정)**
  - 레이아웃 (위→아래):
    1. 주황 테두리 말풍선 배지 **"5초만에 빠른 시작"** (버튼 위에 꼬리 달린 라운드 배지)
    2. **[💬 카카오로 시작]** — 전폭 노란(#FEE500) 대형 버튼. 첫 화면의 유일한 큰 버튼.
    3. ─── 또는 ─── (가는 구분선 + 가운데 회색 "또는")
    4. **원형 아이콘 버튼: G(구글) 하나만** — 흰 원 + 테두리, 아래 작은 캡션 "Google". 소셜은 카카오·구글 둘뿐 (다른 공급자 추가 금지).
    5. 하단 작은 텍스트 링크 줄: "기존 회원 로그인(이름으로) · 로그인 없이 둘러보기" / 맨 아래 미세 링크 "공동체 관리자 · 비밀번호 문의".
  - 재방문 기억(saveLastChurch)의 **자동 폼 스킵 제거** — 누구에게나 항상 이 화면이 기본. 기억된 교회는 "기존 회원 로그인" 링크 옆 "지난번: ○○교회" 뱃지로만. `?church=` 링크도 동일.
  - 첫 카드에 공동체 안내 블록(2026-07-14 문구 확정): "⛪ 교회·모임과 함께 읽고 싶으신가요? / **공동체 대표(관리자)가** 먼저 공동체를 등록해야 성도들이 찾아서 함께 읽을 수 있어요." + [공동체 등록하기 →]. 상단 "교회 등록 →" 버튼과 등록 화면 제목 등 사이트 전체 용어를 "공동체 등록"으로 통일.
  - 등록(adminSignup) 1단계 상단에 안내 박스: "공동체 등록이란? 우리 교회(모임)의 관리 계정을 만드는 것 — ①성도 검색 가입 가능 ②입장코드 보호 ③관리 화면·달란트 상점 운영. 무료, 5분 소요." + 성도 오진입 방지 줄: "성도이신가요? 가입은 첫 화면의 카카오로 시작을 눌러주세요 ← 돌아가기".
  - 등록 완료 화면에 다음 행동 연결: "이제 성도들에게 알리세요 — 설정 탭 → 성도용 가입 안내문 인쇄(QR)".
- [x] **T95. 기존 회원 소셜 로그인 연결(전환 유도)**
  - 로그인한 기존 회원(교회·무소속·이름 개인) 대시보드 상단에 1회성 배너: "다음부터 카카오/구글로 3초 로그인" (닫기 시 7일 숨김).
  - **구글 연결**: `auth.currentUser.linkWithPopup(GoogleAuthProvider)` → 성공 시 users.authProvider 갱신, 이후 구글 버튼 로그인 시 기존 계정으로 들어옴 (uid 동일).
  - **카카오 연결**: 커스텀 토큰이라 link 불가 → 매핑 방식. `kakao-auth` 함수 확장: ① link 모드(`{ code, redirectUri, linkIdToken }`) — idToken 검증한 기존 uid를 `kakaoLinks/{kakao:회원번호}` 문서에 `{ uid }` 로 저장(서비스 계정 쓰기, 이미 다른 uid에 연결돼 있으면 409 안내) ② 로그인 모드 — 커스텀 토큰 발급 전에 kakaoLinks 매핑을 조회해 **있으면 기존 uid로 발급**. kakaoLinks 컬렉션은 클라이언트 접근 금지(규칙 추가 불필요 — 기본 거부, 서비스 계정만).
  - 연결 흐름도 redirect 방식 재사용: 연결 시작 시 sessionStorage에 link 마커 저장 → 복귀 처리에서 로그인 대신 link 모드 호출 → "연결 완료, 다음부터 카카오로 로그인하세요".
- [x] **T96. "우리 교회 로그인 링크" 제거** — ChurchAdminView 설정 탭의 해당 카드 삭제(사용자 확정: 실동작 안 함). 성도용 A4 안내문의 QR·주소를 **루트 URL(https://www.bible114.net)**로 변경. `?church=` 파라미터 처리 코드는 남겨도 되나 신규 노출은 없앤다.
- [x] **T97. 공동체별 달란트 지갑 분리**
  - **모델**: ① 교회 계정의 주 소속 교회 지갑 = 기존 `users.talent` (무변경·호환) ② roster 소속(개인 계정의 모든 공동체 + 교회 계정의 추가 공동체) = **`roster.talent`** (조직별 독립).
  - **적립**: 하루 첫 읽기·퀴즈 보상 시 내 모든 소속 지갑에 **각각 동일 금액 적립** (교회 계정: users.talent + 각 roster.talent / 개인 계정: 각 roster.talent). 기존 진도 동기화 트랜잭션(T47)에 talent 필드만 추가하는 구조.
  - **이관**: 개인 계정의 기존 `users.talent` 잔액은 로그인 시 1회 primaryOrg roster.talent로 lazy 이관(멱등 플래그 `talentWalletMigrated`).
  - **표시·사용**: 헤더 잔액·상점·구매 차감 = "현재 보는 공동체" 지갑. 상점 구매 트랜잭션이 해당 지갑(users 또는 roster)을 차감. 창구 판매·환불: 자체 교인 → users.talent(기존), roster 멤버 → 그 조직 roster.talent (개인 계정 users.talent 차감 경로는 제거).
  - 플랫폼 관리자 달란트 리셋 버튼도 roster 지갑 포함하도록 확장.
  - **공동체별 잔액 한눈에 (2026-07-14 사용자 추가)**: 달란트 상점 화면 상단에 내 소속 공동체 전부의 지갑 잔액 목록 표시 — "⛪ ○○교회 ⭐120 · 성경 읽는 사람들 ⭐43" 형식, 현재 보는 공동체가 강조(★). 항목을 탭하면 그 공동체 상점으로 전환(기준 전환 재사용). 헤더 달란트 칩은 현재 공동체 지갑 기준.
- [x] **T102. 관리자도 성경 읽기 기본 + "관리" 버튼 + 명칭 통일** (2026-07-14 사용자 추가)
  - 관리자(churchAdmin)가 **어떤 방식으로 로그인하든**(카카오·구글·이메일) 첫 화면은 **성도와 같은 성경 읽기 대시보드**. 관리 화면 직행 제거.
  - 대시보드 헤더 상단에 **[⚙️ 관리] 버튼** (관리자에게만 표시, 기존 "⛪ 교회관리" 버튼을 이 위치·라벨로 통일) → 관리자 화면 진입. 관리자 화면에서 "← 성경 읽기로" 복귀 버튼 유지.
  - **명칭 전체 통일: "교회 관리자" → "공동체 관리자"** — 로그인 화면 링크, 관리자 화면 제목, 안내 문구, 인쇄 매뉴얼, 비밀번호 문의 모달 등 grep 전수 교체 (firestore.rules 주석·필드명 role 'churchAdmin' 값 자체는 변경 금지 — 표시 텍스트만).
  - 관리자 계정도 소셜 연결 배너(T95) 대상에 포함되는지 확인 (구글 link는 기존 관리자 연결 카드 T39와 중복되지 않게 정리).
- [x] **T98. 퀴즈 위치 이동 — 본문 뒤·완료 버튼 앞** (사용자: "읽고 나서 체크 전에 나와야지")
  - BibleQuizCard를 상단에서 **본문 텍스트 바로 아래, '오늘 읽기 완료' 버튼 바로 위**로 이동. 읽기 흐름: 본문 → (스크롤 끝) 퀴즈 → 완료 버튼. 게이트 로직(T33/T79)은 유지하되 T71의 "퀴즈로 스크롤" 유도는 위치상 불필요해지면 단순화.
- [x] **T99. 읽기 완료 피드백 단순화** (사용자: "별 모양 복잡, 빨라서 못 읽음")
  - 3초 토스트 제거 → 완료 버튼 자리에 **고정 요약 패널**: 큰 글씨 2줄 이내 "오늘 읽기 완료! 🎉 / +10점 · 달란트 +12" (조직별 적립이면 "모든 공동체에 적립됐어요" 한 줄). 자동 사라짐 없이 오늘 상태로 유지. 레벨업·업적 토스트는 유지하되 순차 표시(겹침 금지).

- [x] **T100. 헤더 포인트 칩 제거 + '나의 업적'을 내 기록 허브로** (2026-07-14 사용자 추가)
  - 헤더에서 점수(pt) 칩 제거 (🔥연속·⭐달란트·🏅 등은 유지).
  - 🏅 나의 업적 모달 상단에 **내 기록 요약** 추가: 총 읽은 날(getDaysRead), **최장 연속**(신규 `users.maxStreak` — handleRead에서 `max(기존, newStreak)` 갱신, 필드 없으면 현재 streak로 시드), 현재 점수, 현재 달란트.
  - 이어서 **계산 방식 안내** 짧은 표: "점수 = 하루 첫 읽기 10점 + 연속 보너스(최대 5)", "달란트 = 하루 첫 읽기 10+연속(최대 7), 퀴즈 정답 +10(2번째 +5) — **달란트는 하루 1번만**". 어르신 큰 글씨.
- [x] **T101. 추가 읽기에도 퀴즈 출제 (보상은 하루 1회)** (2026-07-14 사용자 추가)
  - 퀴즈를 '하루 1문제'에서 **'진도 DAY마다 1문제'**로: 추가 읽기로 DAY가 넘어가면 새 DAY 본문의 퀴즈가 다시 나오고 게이트도 그 DAY 기준으로 적용 (T79 정합의 완성형).
  - **달란트 적립은 하루 첫 퀴즈 정답만**. 이후 DAY의 퀴즈 정답은 +0으로 처리하되 명확히 안내: "정답이에요! 퀴즈 달란트는 하루 1번만 적립돼요." 완료 요약(T99 패널)에도 동일 원칙 반영.
  - 저장 구조: 문항 완료는 DAY별(quizKey 확장), 일일 보상 여부는 날짜 기준 필드로 분리 — 자정 넘김·재방문 호환 확인.

완료 기준: 빌드 + `npm run validate`(라운드 17에서 통합) + 지갑 이관·다중 적립·DAY별 퀴즈 픽스처, 375px 확인. 커밋 금지(Claude 담당).

## 🔍 라운드 Q — 퀴즈 저비용 모델 검수 (2026-07-14 사용자 승인 — 라운드 17·18과 병행 가능한 읽기 전용 작업)

> **저비용(mini급) 모델로 실행하는 검수 전용 라운드.** 4,719문항 전수를 훑어 의심 문항만 골라낸다.
> 코드·데이터 수정 금지, git 커밋 금지, **HANDOFF 작업 로그 기록도 생략** — 산출물은 아래 파일 하나뿐.

### 검수 방법

1. `src/data/quiz/*.json` 66권을 책 단위로 순회. 각 문항에 대해 다음만 판정:
   - **A. 정답 오류 의심**: answerIndex가 가리키는 보기가 성경 내용상 정답이 아닌 것 같음
   - **B. 이중 정답/모호**: 다른 보기도 정답으로 해석 가능하거나 보기끼리 중복
   - **C. 근거 불일치**: ref 구절이 문항 내용과 안 맞음
   - **D. 신학·표기 문제**: 논란 소지 표현, 개역개정과 다른 표기, 어색한 한국어·오타
2. **확실한 것만 기록** (애매하면 통과 — 최종 판단은 사람). 문항 수정은 절대 금지.
3. 산출물: 저장소 루트 `QUIZ_REVIEW_FINDINGS.md` — 표 형식:
   `| 책 | 장 | 문항(앞 20자) | 유형(A~D) | 사유 한 줄 | 수정 제안 |`
   맨 위에 요약(검사 문항 수 / 의심 건수 / 유형별 집계). 진행 중에는 책 단위로 이어서 append.

완료 후: Claude가 findings를 사용자 O/X용 짧은 문서로 정리 → 승인분만 데이터 수정 → 재배포.

## ✅ Claude 리뷰 결과 — 라운드 17·18 (2026-07-14)

T88~T96·T98~T101 검토 완료 — **병합·배포 가능**. 확인: T91 탭 분할이 이동만 수행(로직 무변경), T90 지연 로딩으로 메인 청크 -168KB, T95 카카오 연결의 idToken 검증이 서명·audience·issuer 3중 확인 + create-only 경합 409 — 견고함. Claude 보강 1건: 익명(게스트) 세션의 카카오 연결 차단 1줄 추가. kakao-auth 함수 재배포 완료. 검증기 전체+빌드 Claude 재실행 통과. T97은 규칙 미배포 판단으로 건너뛴 것이 올바른 프로토콜 준수 — 규칙은 이제 배포됐으므로 T97만 재개하면 라운드 18 완결.

---

## ✅ Claude 리뷰 결과 — T97·T102 (2026-07-14)

검토 완료 — **병합·배포 가능, 수정 없음**. 확인: 적립 트랜잭션이 모든 소속 지갑(교회 계정 users.talent + roster 지갑들)에 원자 적립·읽기 선행 규칙 준수, 개인 잔액 이관이 트랜잭션 내 플래그 재확인으로 멱등, 상점·헤더 잔액이 dashboardUser 투영(talentWalletType/보는 조직 지갑)으로 정확, 창구·환불·전체 리셋의 조직 지갑 전환, rules 무수정(Rules API로 활성 룰셋 검증 — 좋은 방식), 상점 지갑 목록·탭 전환, T102 관리자 읽기 기본+⚙️ 관리+명칭 통일. 검증기 4종+빌드 Claude 재실행 통과. 라운드 18 전체(T93~T102) 완결. 퀴즈 검수 75건 수정(라운드 Q)도 이번 배포에 동승.

---

## 🔁 라운드 20 — 전체 검수 대응: 새한글 완전 차단 + 규칙 강화 + 노출 축소 + 부수 정리 (2026-07-14 Claude 설계)

> 배경: Codex 전체 검수(2026-07-14)에서 "운영 배포 부적합" 판정. 우선순위는 검수 제안대로 **T107(새한글) → T108(자기 데이터 조작 축소) → T109(교회 문서·개인정보 노출 축소) → T110(부수 정리)**.
> 라운드 19(달란트 소실 차단)의 커밋·배포는 Claude/사용자 담당 — Codex 작업 아님.
> **참고(충돌 주의)**: 팝업 광고 기능은 Claude가 2026-07-14 직접 구현했다 — `settings/platformPopup` 문서, 신규 `src/components/PlatformPopupAd.jsx`, App.jsx 렌더 1줄, PlatformAdminView의 '📣 팝업 광고' 탭(기존 슈퍼관리자 교회별 공지 작성 UI는 제거, 교회별 카카오 링크 관리와 교회 관리자 자체 공지 탭은 유지). 이 파일들을 수정할 때 해당 변경을 되돌리지 말 것.

### [x] T107. 새한글·회수 버전 완전 차단

현황: 일반 버전 선택(PlanSelectionView.jsx:79)·게스트(GuestReaderView.jsx:18)·버전 변경(App.jsx:439)은 이미 `isBibleVersionVisibleForUser`로 필터한다. **구멍은 2종**: ① SocialOnboardingView.jsx:65가 `(BIBLE_VERSIONS[planType] || [])`를 필터 없이 렌더 ② 저장 단계 재검증 부재 — useAuth.js `handleSocialOnboardingComplete`(441행)가 planId를 그대로 저장하고, 게스트 가입 이관(useAuth.js:149)도 localStorage의 planId를 무검증 통과시킨다.

1. `src/data/bible_options.js`에 중앙 헬퍼 2개 추가:
```js
export const getVisibleBibleVersions = (planType, user) =>
    (BIBLE_VERSIONS[planType] || []).filter(version => isBibleVersionVisibleForUser(version, user));

// planId 형식: `${planType}_${versionId}` (예: '1year_revised')
export const isPlanIdAllowedForUser = (planId, user) =>
    Object.entries(BIBLE_VERSIONS).some(([planType, versions]) =>
        versions.some(version => `${planType}_${version.id}` === planId &&
            isBibleVersionVisibleForUser(version, user)));
```
2. SocialOnboardingView.jsx:65 — `getVisibleBibleVersions(planType, { ...tempUser, name })`로 교체.
3. useAuth.js `handleSocialOnboardingComplete` 진입부에 재검증: `if (!isPlanIdAllowedForUser(planId, newUser)) throw new Error('선택할 수 없는 성경 버전입니다. 버전을 다시 선택해주세요.');`
4. 게스트 이관(useAuth.js:149): `planId: isPlanIdAllowedForUser(guest.planId, null) ? guest.planId : '1year_revised'`
5. **기존 사용자가 이미 저장한 새한글 planId는 강제 변경하지 않는다** (2026-07-11 결정은 "신규 노출 회수"이며 본문 데이터는 유지) — 읽기 화면 회귀 없어야 함.
6. 검증: validate 스크립트에 ① `getVisibleBibleVersions` 결과 스냅샷(user=null 기준 1year → sequential·revised·new, nt → new) ② `isPlanIdAllowedForUser('1year_saehangul', null) === false`, `('nt_message', null) === false`, `('1year_revised', null) === true` assert 추가.

### [x] T108. firestore.rules — 자기 데이터 조작 축소

> **전제**: 점수·달란트·진도는 클라이언트가 직접 쓰는 구조라 규칙만으로는 완전 차단이 불가능하다. 이 라운드는 ①정체성 필드 보호 ②1회 쓰기 증분 상한(실수·단순 스크립트 차단, 남용 난이도 상승)까지만 한다. 완전 해결(Cloud Functions 이관)은 아래 "로드맵 R" — **이번 라운드에서 시도 금지**. 규칙 파일은 로컬 수정까지만, 배포·활성 룰셋 확인은 Claude 담당.

- **T108a. 본인 update 보호 필드 확장** (users 63~71행 분기):
  - 블랙리스트에 `accountType`, `isDeleted` 추가 (`role`, `churchId`는 기존 유지). `isDeleted`는 관리자 흐름(App.jsx:317, PlatformAdminView.jsx:579·588)에서만 쓰므로 본인 차단 안전. accountType 전환은 기존 별도 분기(86~92행)가 그대로 담당.
  - `primaryOrgId`는 값 변경 시 **그 조직에 내 roster 행이 실재할 때만** 허용:
```
(!request.resource.data.diff(resource.data).affectedKeys().hasAny(['primaryOrgId']) ||
  request.resource.data.primaryOrgId == null ||
  existsAfter(/databases/$(database)/documents/churches/$(request.resource.data.primaryOrgId)/roster/$(request.auth.uid)))
```
    `exists`가 아닌 **`existsAfter`** 필수 — 첫 가입(CommunityMembershipCard)·소셜 온보딩이 roster set과 users 쓰기를 같은 트랜잭션으로 묶으므로 커밋 후 상태로 평가해야 통과한다.
- **T108b. 게임 필드 1회 쓰기 증분 상한** (본인 분기에만 — 관리자 분기는 정정 용도로 상한 없음):
  - users 본인 update: `request.resource.data.get('talent', 0) >= 0 && request.resource.data.get('talent', 0) <= resource.data.get('talent', 0) + 17`, score 동일 패턴 `+15` (읽기 최대 10+연속7 / 10+보너스5. 퀴즈 +10은 별도 쓰기라 상한 내. 감소는 구매·재시작 흐름이므로 허용).
  - roster 본인 update(153~158행)에도 동일 상한. **예외 1개**: 개인 잔액 이관(`migratePersonalTalentWalletIfNeeded`)이 기존 users.talent를 roster.talent로 한 번에 옮기므로, `resource.data.get('talent', 0) == 0 && getAfter(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('talentWalletMigrated', false) == true`이면 상한 없이 허용.
  - 정상 흐름 회귀 확인 필수: 읽기 완료(다중 지갑 적립)·퀴즈 보상·상점 구매 차감·재시작(score 0)·개인 잔액 이관·관리자 창구 판매/환불/리셋.
- 검증: 규칙은 로컬 수정 + 위 흐름들의 실동작 클릭 확인(로컬 앱은 운영 규칙을 쓰므로 규칙 자체 검증은 Claude가 배포 단계에서 수행). 규칙 diff와 함께 "허용/차단 표"를 작업 로그에 남길 것.

### [x] T109. 교회 문서·개인정보 노출 축소

- **T109a. churches read 축소**: `allow read: if isSignedIn()` → `isRealUser()` (익명 게스트 차단). 게스트 플로우(둘러보기 → 읽기 → 영상)가 churches를 읽는 지점이 없는지 grep + 실제 클릭으로 확인하고, 있으면 해당 기능을 게스트에서 숨기는 쪽으로(게스트에 교회 정보 필요 없음).
- **T109b. 레거시 평문 입장코드 조사** (읽기 전용 스크립트): 현행 등록 코드는 `churchCodeHash`만 저장하지만(useAuth.js:1013·1071), 오래된 churches 문서에 평문 `churchCode`/`code` 필드가 남아 있는지 전수 조사 → 결과를 "Codex → Claude 메모"에 보고만 (필드 삭제 마이그레이션은 Claude/사용자 실행).
- **T109c. adminEmail·adminUid 이관 설계**: churches 본문서의 `adminEmail`·`adminUid`를 `churches/{id}/private/admin` 하위문서로 이동 (규칙: 그 교회 관리자 + 플랫폼 관리자만 read/write). 쓰기 지점 3곳(useAuth.js:1013·1071, PlatformAdminView.jsx:367), 표시 지점 2곳(PlatformAdminView.jsx:821·932 — 플랫폼 관리자 화면이라 private 읽기 가능, 목록 화면은 필요 시 지연 조회). 신규 등록부터 private에 쓰고 본문서에는 쓰지 않는다. 기존 문서 표시는 본문서 값 폴백 유지, 백필·본문서 필드 제거는 Claude 실행.
- **범위 밖 명시**: users 문서의 email·birthdate 같은-교회 노출은 규칙의 필드 단위 read 제어가 불가능해 구조 변경(민감 필드의 private/profile 이관 또는 랭킹의 roster 전환)이 필요하다 — **라운드 21 후보**로 보류, 이번 라운드에서 건드리지 말 것.

### [x] T110. 부수 정리 일괄

1. 카카오 상담 링크 `http` → `https` (src/data/constants.js:14).
2. **배포 식별자 자동화**: index.html:8의 고정 문자열(`2026-06-22-read-label-v1`)을 빌드 시각 기반으로 — vite.config.js에 `transformIndexHtml` 미니 플러그인을 추가해 `%BUILD_ID%` 플레이스홀더를 빌드 시각(`new Date().toISOString()` 기반 `YYYY-MM-DD-HHmm`)으로 치환. public/manifest.webmanifest:5의 버전 문자열은 기능상 불필요하면 제거, 필요하면 동일하게 빌드 스크립트로 갱신.
3. **보안 헤더** (firebase.json hosting.headers, 모든 경로): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, 클릭재킹 방지는 `Content-Security-Policy: frame-ancestors 'self'` 한 줄로. **전체 CSP는 이번에 강제하지 말고** `Content-Security-Policy-Report-Only`로 초안만 — 실동작에 필요한 외부 도메인(유튜브 embed, 카카오, 구글 로그인, gstatic, firestore/identitytoolkit 등)을 네트워크 요청 기준으로 수집해 초안 헤더와 함께 메모로 보고 (강제 적용은 다음 라운드에서 Claude 확인 후).
4. **의존성 취약점**: `npm audit` high 3건 내역 확인 → semver 호환(breaking 없는) 업데이트만 적용하고 빌드+validate 재확인. major 업그레이드가 필요한 건은 목록만 메모로 보고.
5. 번들 1.31MB: 주요인이 firebase compat 번들이라 "compat 유지" 방침과 충돌 — 이번 범위 밖, 손대지 말 것.

### 로드맵 R — 서버 권위(Cloud Functions) 이관 (2026-07-14 사용자 승인: 라운드 24로 Claude가 상세 설계 예정 — 설계 문서 나오기 전 Codex 시작 금지)

규칙만으로 못 막는 항목의 근본 해결. kakao-auth로 함수 인프라는 이미 있다. 대상: ① 읽기 완료·퀴즈 보상 적립 ② 상점 구매(잔액 차감+구매 기록 원자화) ③ 가입 입장코드 서버 검증 ④ churchDirectory·platformStats 쓰기 회수 ⑤ dailyVideos lazy-fill(미래 날짜 선점 차단). 별도 라운드로 설계 예정.
`videoAutoConfig`의 YouTube API 키 노출은 코드가 아니라 운영 조치 — Google Cloud 콘솔에서 키에 HTTP referrer 제한 + YouTube Data API 전용 스코프 적용 (Claude/사용자, 즉시 가능).

완료 기준: `npm run build` + `npm run validate` 통과, 게스트·기존 회원 로그인·소셜 온보딩(버전 선택 화면에 새한글 부재 확인)·읽기 완료·상점 구매 흐름 클릭 확인, 375px 가로 넘침 없음. 커밋 금지(Claude 담당).

---

## 🔁 라운드 21 — 로그인 지연 단축 + 관리자 진입 선택 화면 (2026-07-14 사용자 지시, Claude 설계 — ⚠️ 라운드 20 완결 후 시작)

> 사용자 보고: "로그인 후에 바로 안 들어가고 몇 초간 지연", "관리자는 로그인 후 관리 모드와 성경 읽기를 선택하고 싶다".
> 참고: 라운드 20 T109에서 "라운드 21 후보"로 적어둔 개인정보 필드 이관은 **라운드 22 후보로 밀린다** — 이 라운드가 아니다.

### [x] T111. 로그인 지연 단축 — 순차 네트워크 왕복 제거

**원인 (Claude 분석)**: 로그인 확정까지 Firestore/Auth 왕복이 직렬로 6~7회다. 이관이 끝난 기존 사용자도 매번 다 낸다:
`auth 로그인(1, 구포맷 재시도 시 2) → users 문서(1) → [자격증명·talent 이관: 이관 완료자는 0] → extraOrgs 대기(1, 병렬 시작이나 뒤에서 대기) → 개인 지갑 이관 트랜잭션(1~2, 이관 완료자도 매번 실행됨 ←낭비) → loadChurchCommunities await(1 ←불필요한 직렬화) → setView`.
세션 복원(useUserAuth)도 같은 체인이라 재방문 첫 화면도 같이 느리다.

- **T111a. `migratePersonalTalentWalletIfNeeded` 사전 단락** (src/utils/helpers.js:69):
  - 시그니처에 3번째 선택 인자 `knownUserData` 추가. `knownUserData`가 주어지고 `knownUserData.talentWalletMigrated === true || knownUserData.accountType !== 'personal'`이면 **트랜잭션 없이 즉시 null 반환**. 트랜잭션 내부의 기존 재확인(82행)은 동시성 안전용으로 유지.
  - 호출 지점 적용: useAuth.js `migratePersonalWallet`(53행 — `user` 전달), useUserAuth.js(124행 — `user` 전달). CommunityMembershipCard·personalAccountMigration의 호출은 "이관이 실제 필요한 시점"이므로 **건드리지 않는다**.
  - 효과: 이관 완료된 개인 계정의 매 로그인마다 나가던 트랜잭션(get×2+커밋) 제거.
- **T111b. `loadChurchCommunities` await 제거** (useAuth.js:642·710):
  - `await loadChurchCommunities(...)` → `loadChurchCommunities(...)` 시작만 하고 화면 전환. App.jsx 390~394의 효과가 dashboard 진입 시 어차피 재호출하며, PlanSelectionView·DashboardView 모두 `churchCommunities`를 prop으로 반응형 수신하므로 늦게 채워져도 된다.
  - 확인 필수: 부서·소그룹 선택 흐름(plan_type_select → community_select)에서 목록이 잠깐 비었다가 채워질 때 빈 상태 문구가 자연스러운지 클릭 확인 (어색하면 "불러오는 중..." 1줄만).
- **T111c. 소셜 로그인 경로 병렬화** (useAuth.js `openExistingSocialUser` 236~248, `openExistingPersonalUser` ~221):
  - `user.extraOrgs = await loadUserExtraOrgs(...)`가 migrateTalent 뒤에 직렬로 있다 → handleMemberLogin(627행)처럼 **문서 로드 직후 `extraOrgsPromise`를 먼저 시작**하고 마지막에 await.
- **T111d. 전/후 계측**: `import.meta.env.DEV`일 때만 `performance.now()` 기반으로 "로그인 진입~setView" 구간을 console.info 1줄 로그. 작업 로그에 전/후 수치(이관 완료 개인 계정·교회 계정 각 1회) 기록 후, 계측 코드는 DEV 가드 안에 남겨둔다.
- **알려진 한계 (수정 금지)**: ① 카카오 로그인의 Cloud Functions 콜드 스타트(1~3초)는 코드로 제거 불가 — min instances는 유료라 보류 ② auth 왕복 1회 + users 문서 1회는 필수 비용 ③ 구포맷 이메일 재시도(1회 추가)는 레거시 호환용이라 유지.
- 기대: 이관 완료 사용자 기준 직렬 왕복 6~7회 → **3회**(auth → users 문서 → extraOrgs 병렬 대기).

### [x] T112. 관리자 로그인 후 진입 선택 화면 (T102 개정)

> T102의 "관리자도 무조건 읽기 대시보드 직행"을 **선택 화면**으로 바꾼다. 이 라운드 이후 T102 서술과 충돌하면 이 설계가 우선.

- **신규 view `admin_entry`** (churchAdmin 전용):
  - App.jsx 인증 효과의 churchAdmin 분기(현재 `setView('dashboard')` 직행, 250~256행 부근)를 `setView('admin_entry')`로.
  - superAdmin/platformAdmin은 변경 없음(관리자 화면 직행). admin_signup_complete(등록 완료 → 관리 화면 유도) 흐름도 변경 없음.
- **화면 구성** (어르신 친화, 로그인 화면과 같은 톤 — App.jsx에 인라인 섹션이면 충분, 별도 파일로 뺄 필요 없음):
  - 상단 인사: "🙏 {이름}님, 어서 오세요" + 교회명 한 줄.
  - 대형 카드 버튼 2개 (세로 배치, 전폭):
    1. **📖 성경 읽기** — "오늘의 말씀을 읽어요" → `setView('dashboard')`
    2. **⚙️ 공동체 관리** — "성도 현황·달란트 상점·설정" → `setView('church_admin')`
  - 두 버튼은 시각적 비중 동급 (주/보조 구분 없음 — 사용자가 매일 고르는 화면).
- **세션당 1회만 표시**: 선택 시 `sessionStorage.setItem('b114_admin_entry_v1', 'dashboard'|'church_admin')`. 인증 효과에서 마커가 있으면 그 화면으로 직행 — 읽기 중 새로고침할 때마다 선택 화면이 다시 뜨는 성가심 방지. 로그아웃 시 마커 제거(handleLogout).
- 기존 상호 진입은 그대로: 대시보드 헤더 [⚙️ 관리] 버튼, 관리자 화면 [← 성경 읽기로] — 선택 후에도 언제든 오갈 수 있다.
- 확인 필수: 카카오·구글·이메일 세 가지 관리자 로그인 모두 선택 화면 경유, 375px 레이아웃, 게스트/일반 교인/개인 계정은 이 화면을 절대 보지 않음.

완료 기준: `npm run build` + `npm run validate` 통과, T111d 전/후 수치 기록, 관리자 3종 로그인·일반 로그인·소셜 로그인·부서 선택 흐름 클릭 확인, 375px 확인. 커밋 금지(Claude 담당).

---

## ✅ Claude 리뷰 결과 — 라운드 19·20·21 (2026-07-14)

검토 완료 — **Claude 보강 2건 반영 후 병합·배포**. 라운드 19(보상 전 strict 명부 조회, 실패의 빈 목록 강등 제거), 라운드 20(새한글 이중 차단, 정체성 필드 보호, churches read 축소, private/admin 분리, 보안 헤더 초안, 빌드 ID 자동화), 라운드 21(지갑 이관 사전 단락, loadChurchCommunities 비대기, 소셜 경로 병렬화, admin_entry 선택 화면) 모두 설계 일치 확인. 검증기 5종+빌드 Claude 재실행 통과.

**Claude 보강 2건 (firestore.rules — 배포 차단급이라 Claude가 직접 수정)**:
1. **users 본인 update 상한이 [점수 이중화] 마이그레이션을 깨뜨림** — `migrateTalentIfNeeded`(helpers.js:32)는 미이관 계정 로그인 시 `talent = score`(수백 점프)·`score += 사용분`을 한 번에 쓰므로 +17/+15 상한에 걸려 **레거시 계정 로그인이 영구 실패**한다. `talentMigrated false→true` 전환 쓰기 1회에 한해 상한 예외 추가. 신규 계정은 생성 시 `talentMigrated: true`(useAuth.js:160)라 예외를 재사용할 수 없다.
2. **roster 본인 update의 score +15 상한이 복구 경로를 깨뜨림** — 읽기 트랜잭션은 roster.score를 users.score 절대값으로 동기화하는데, 과거 명부 미로드 버그로 며칠 밀린 행(운영에 실존)은 점프가 +15를 넘어 **읽기 완료가 영구 실패**한다. "증분 +15 또는 `getAfter(users).score` 이하" 이중 조건으로 완화 — roster.score는 users.score(자체 상한 적용됨)의 미러라는 불변식을 규칙으로 표현.

배포(2026-07-14, Claude): firestore.rules → Firebase, 클라이언트 → gh-pages. 배포 후 사용자 실환경 검증 항목: ① 첫 화면에서 새한글 미노출(소셜 온보딩 3단계 포함) ② 기존 계정 로그인 속도 체감 ③ 관리자 로그인 → 선택 화면 ④ 읽기 완료·퀴즈 보상 정상 적립 ⑤ DEV 콘솔 `[로그인 속도]` 수치 기록.

---

## 🔁 라운드 22 — 공동체별 랭킹 보기 (2026-07-14 사용자 지시, Claude 설계)

> 사용자 요청: "공동체별로 순위가 나오니까, 내 단체 관리에서 자신이 속한 공동체를 누르면 그 공동체의 순위를 볼 수 있게 해달라."
> 현재는 랭킹이 항상 `dashboardUser.churchId`(개인 계정 = 기준 공동체 `primaryOrgId`) 하나로만 스코프되고, 다른 공동체 순위를 보려면 "기준으로 보기"로 기준 자체를 바꿔야 한다(지갑·상점·공지까지 전부 따라 바뀜).

### 설계 결정 (확정 — 재논의 불필요)

1. **보기 전용 — `primaryOrgId`를 바꾸지 않는다.** 기준 변경은 Firestore 쓰기가 발생하고 달란트 지갑·상점·공지 컨텍스트까지 전환된다. 순위 구경은 클라이언트 상태(`viewedRankingOrg`)로만 하고, 모달을 닫으면 원래대로 돌아온다. "기준으로 보기" 버튼과 그 동작은 그대로 둔다.
2. **firestore.rules 수정 불필요 — 금지.** 이미 전부 열려 있다: ① 타 조직 users 목록 read는 라운드 9 분기(users 60~67행, 단 쿼리에 `.where('churchId','==',org).where('password','==',null)` 필터 필수 — loadAllMembers가 이미 이 형태), ② 그 조직 roster read(166~170행, 명부에 오른 사람), ③ churches 문서 read(143행, isRealUser). **users 쿼리에서 password 필터를 빼면 규칙 증명이 실패한다 — 절대 유지.**
3. **대상은 개인 계정(accountType 'personal')만.** 내 단체 관리 모달 자체가 개인 계정 전용이고, 교회 계정은 공동체가 1개다. 전환 UI는 소속 공동체 2개 이상일 때만 노출.
4. **캐시 없음 — 공동체 선택 시마다 재조회.** users+roster+churches 문서 3회 read로 저렴하고, 실검증된 `loadAllMembers` 경로를 그대로 재사용한다.
5. **범위는 누적 랭킹 모달(RankingModal)만.** 헤더 상단 top3 프리뷰·소그룹 순위 카드·달리기 화면은 기준 공동체 유지 — 건드리지 않는다.
6. 무소속 가상 교회(unaffiliated_v1) 가드는 기존 그대로(users 쿼리 스킵, roster만 — useDepartment.js 20·24행 로직 유지).

### [x] T113. 데이터 로더 — `loadAllMembers` orgId 파라미터화 + 조회 함수

- **`src/hooks/useDepartment.js` `loadAllMembers` (16행)**: 선택 인자 `orgIdOverride`를 받아 `const orgId = orgIdOverride || currentUser?.churchId`로 해석하고, 함수 내부의 `currentUser.churchId` 사용 3곳(가드 19~20행, users 쿼리 24~27행, roster 쿼리 32행)을 `orgId`로 치환한다. UNAFFILIATED 가드(20행)와 users 쿼리 스킵(24행)도 `orgId` 기준으로. **무인자 호출(기존 전 지점) 동작은 완전히 동일해야 한다.** useCallback deps 변화 없음.
- **`src/App.jsx`에 `loadOrgRankingData(orgId)` 추가** (loadChurchCommunities 392행 근처): `Promise.all([loadAllMembers(orgId), db.collection('churches').doc(orgId).get()])` → `{ members, communities: doc.data().departments || doc.data().communities || [] }` 반환. 실패 시 throw(호출부에서 error 상태 처리). `loadAllMembers`는 App이 이미 호출 중인 useBibleLogic 반환값에서 꺼낸다(149행에 반환됨). 이 함수를 DashboardView prop으로 전달.

### [x] T114. DashboardView — 보기 전용 랭킹 컨텍스트

- 로컬 상태 2개: `viewedRankingOrg`(`{ orgId, name, departmentId, subgroupId, subgroupName } | null` — null이면 기준 공동체=기존 props 데이터), `orgRankingData`(`{ members: [], communities: [], loading: false, error: null }`).
- `openOrgRanking(org)`: `org.orgId === currentUser.churchId`면 `viewedRankingOrg`를 null로(재조회 불필요 — 기존 데이터), 아니면 `viewedRankingOrg` 세팅 후 `loadOrgRankingData(org.orgId)`로 fetch(loading/error 상태 반영). 호출 시마다 `setRankingCommunityFilter('all')`·`setSelectedSubgroupDetail(null)` 리셋.
- 파생값(useMemo): `orgProgressRanking = formatProgressRanking(calculateSubgroupStats(orgRankingData.members, orgRankingData.communities))` — 둘 다 `src/utils/statsUtils.js`의 순수 함수라 import만 하면 된다.
- RankingModal(343~356행)에 넘기는 값 분기: 다른 공동체를 보는 중(`viewedRankingOrg && viewedRankingOrg.orgId !== currentUser.churchId`)이면 `progressRanking={orgProgressRanking}` `allMembersForRace={orgRankingData.members}`, 아니면 기존 그대로.
- RankingModal `onClose` 시 `viewedRankingOrg` null 리셋(다음에 열면 기준 공동체부터).
- **공동체 탭 데이터**: 개인 계정이고 `extraOrgs.length >= 2`일 때만 `orgTabs = extraOrgs.map(o => ({ orgId: o.orgId, name: <디렉토리 해석> }))`. 이름은 `getChurchDirectory()`(`src/utils/churchDirectory.js`)로 해석 — CommunityMembershipCard 68행 `orgName()`과 같은 방식(UNAFFILIATED은 상수 이름). 디렉토리는 랭킹 모달이 열릴 때 1회 로드해 state에 둔다(개인 계정+2개 이상일 때만).
- **우리팀 하이라이트 기준**: 다른 공동체를 볼 때는 그 org의 내 소속을 `extraOrgs` 해당 행(departmentId/subgroupId/subgroupName)에서 꺼내 `viewedMembership` prop으로 전달. 기준 공동체를 볼 때는 전달하지 않음(기존 로직 사용).

### [x] T115. RankingModal — 공동체 탭 + 로딩/평면 랭킹 + 하이라이트

`src/components/modals/RankingModal.jsx`:

- 신규 props: `orgTabs = []`, `activeOrgId`, `onSelectOrg`, `orgLoading = false`, `orgError = null`, `viewedMembership = null`, `viewedOrgName = null`.
- **공동체 탭 행**: `orgTabs.length >= 2`일 때만, 부서 필터 행(39~44행) **위에** 별도 행으로. 스타일은 부서 필터 pill과 같되 활성 색만 구분(예: `bg-slate-800 text-white` — 부서 필터의 파란 활성과 시각적으로 다르게). 클릭 → `onSelectOrg(orgId)`.
- 제목: 다른 공동체를 보는 중이면 `🏆 {viewedOrgName} 랭킹`, 아니면 기존 "🏆 소그룹 누적 랭킹".
- `orgLoading`이면 목록 영역에 "공동체 순위를 불러오는 중..." 문구, `orgError`면 문구 + [다시 시도] 버튼(`onSelectOrg(activeOrgId)` 재호출).
- **평면 랭킹 fallback**: `progressRanking`이 비어 있는데 `allMembersForRace`가 있으면(부서·소그룹 미배정 위주 공동체 — 스크린샷의 "소속 미배정" 케이스) 소그룹 카드 대신 멤버 평면 목록을 렌더 — detail 뷰(136~155행)와 같은 멤버 카드 스타일, `getDaysRead` 내림차순. 기준 공동체 뷰에는 지금과 동일하게 빈 문구 유지가 아니라 이 fallback이 함께 적용돼도 무해하다(멤버가 있는데 그룹이 0인 경우에만 발동).
- 우리팀 판정(61~65행): `viewedMembership`이 있으면 그것을 기준으로, 없으면 기존 `currentUser.departmentId`/`subgroupId` 기준. 다른 공동체 뷰에서는 `extraMemberships` "추가 소속" 배지 판정을 건너뛴다(부모가 빈 배열 전달해도 됨 — 그 배지는 기준 공동체의 부서 간 추가 소속 개념).

### [x] T116. CommunityMembershipCard — "순위 보기" 진입점

`src/components/dashboard/CommunityMembershipCard.jsx`:

- 신규 prop `onViewOrgRanking` (없으면 버튼 미표시 — DashboardView 497행의 설정 탭 렌더링에는 전달하지 않으므로 자동으로 숨겨진다).
- 각 공동체 행(316행)에 **[🏆 순위]** 텍스트 버튼 추가 — "기준으로 보기" 왼쪽, 같은 크기(`text-xs font-bold`). 기준 공동체 행에도 표시(그 행엔 "기준으로 보기"가 없어 공간 충분).
- 클릭: `onViewOrgRanking({ orgId: org.orgId, name: orgName(org.orgId), departmentId: org.departmentId, subgroupId: org.subgroupId, subgroupName: org.subgroupName })`.
- **DashboardView 520행 내 단체 관리 모달**의 CommunityMembershipCard에 전달: `onViewOrgRanking={org => { setShowMemberships(false); openOrgRanking(org); setShowFullRanking(true); }}`.

### 검증 체크리스트

- [x] `npm run build` 통과, 무인자 `loadAllMembers()` 호출 전 지점 회귀 없음(기준 공동체 랭킹·달리기·소그룹 카드 기존 동작).
- [ ] 공동체 2개 소속 개인 계정: 내 단체 관리 → 각 공동체 [🏆 순위] → 그 공동체 랭킹 표시. **★ 기준 배지·달란트 잔액·공지는 변하지 않음** 확인.
- [x] 랭킹 모달 안 공동체 탭 왕복 전환, 전환 시 부서 필터 'all'·소그룹 상세 리셋.
- [x] 소속 미배정 위주 공동체에서 평면 멤버 랭킹 표시.
- [x] 교회 계정·공동체 1개 개인 계정: 탭 미노출, 기존 랭킹 화면 그대로.
- [ ] 다른 공동체 조회 시 콘솔에 permission-denied 없음 (users 쿼리 `password==null` 필터 유지 확인).
- [x] 375px 레이아웃(탭 행 줄바꿈 허용), 모달 닫고 다시 열면 기준 공동체로 초기화.

완료 기준: 위 체크리스트 전부 + 작업 로그 기록. 커밋 금지(Claude 담당).

### [x] T117 (2026-07-14 사용자 승인 — T116 완료 후 진행). 개인 계정 상점 공동체 전환의 기준 변경 부작용 제거

> 배경(2026-07-14 확인): 공동체별 달란트 마켓 자체는 T97로 이미 완성돼 있다 — 지갑(`churches/{org}/roster/{uid}.talent`)·적립(읽기/퀴즈 보상이 소속 전 공동체에 각각 적립)·상점 설정/구매내역(`settings/talentShop`·`talentPurchases`) 모두 공동체별 분리, 상점 안에 전환 UI도 존재(TalentShop.jsx 239~261행). **문제는 하나**: 개인 계정이 상점에서 공동체를 누르면 `handleTalentOrgChange`(App.jsx 540행)가 `handlePrimaryOrgChange`를 불러 **★ 기준 자체가 영구 변경**된다(Firestore 쓰기 + 상점 닫아도 대시보드 전체가 그 공동체로 남음). 교회 계정은 이미 보기 전용 메모리 전환(`viewingRosterOrgId`)을 쓴다.

- **App.jsx 56~62행**: `activePersonalOrg` 해석을 `personalOrgs.find(org => org.orgId === (viewingRosterOrgId || currentUser.primaryOrgId))`로 — 개인 계정도 `viewingRosterOrgId`가 있으면 그 공동체를 활성 컨텍스트로(메모리만, 새로고침·계정 전환 시 자동 리셋은 기존 86~88행 효과 재사용). `viewingRosterOrgId`가 소속에 없으면 기존대로 primaryOrgId fallback.
- **`handleTalentOrgChange`(540행)**: 개인 계정 분기를 `handlePrimaryOrgChange` 호출 → `setViewingRosterOrgId(orgId)`로 교체 (`orgId === primaryOrgId`면 null). ★ 기준 변경은 이제 "내 단체 관리 → 기준으로 보기"에서만 일어난다.
- **`handlePrimaryOrgChange`**: 성공 시 `setViewingRosterOrgId(null)` 추가(기준 변경이 임시 보기를 덮도록).
- 상점 안내 문구(TalentShop.jsx 242행)에 "(★ 기준은 바뀌지 않아요)" 한 줄 보강.
- **주의**: 이 전환은 교회 계정과 동일하게 대시보드 전체 컨텍스트(랭킹·공지·소속 표시)를 임시로 바꾼다 — 의도된 동작. 단 `dashboardUser`(파생값)가 Firestore로 저장되는 경로가 없는지 확인할 것(`setCurrentUser` 반영 저장은 `currentUser` 기준이어야 함). 라운드 22의 `viewedRankingOrg`(랭킹 모달 한정)와는 독립 상태라 충돌 없음.
- 검증: 개인 계정 2공동체 — 상점에서 B 전환 → B 상품·B 잔액·구매 시 B 지갑 차감, ★ 기준은 A 유지(내 단체 관리에서 확인), 새로고침 시 A로 복귀. 읽기 보상은 어느 쪽을 보고 있든 두 지갑 모두 적립.

**로컬 검증 결과(2026-07-14):** `handleTalentOrgChange`의 개인 계정 경로에 Firestore 쓰기와 `handlePrimaryOrgChange` 호출이 없고, 선택 org가 `dashboardUser.churchId`·`talentWalletOrgId`가 되어 TalentShop의 설정/구매내역/roster 차감 경로에 전달됨을 계약 검사로 고정했다. 기준 변경 성공 시 임시 상태 해제, 잘못된 orgId는 소속 검사로 차단, 새로고침·계정 전환은 React state 초기화로 기준 공동체에 복귀한다. `npm run validate`, `npm run validate:quiz`, `npm run validate:nt-easy`, `npm run build` 통과. 실제 구매·보상은 운영 데이터 변경이므로 테스트 계정으로 배포 후 확인 필요.

---

## 🔁 라운드 23 — 신약일독 쉬운 퀴즈 연결 (2026-07-14 사용자 승인, Claude 설계 — ⚠️ 라운드 22(T117 포함) 완결 후 시작)

> 배경: `review/nt_easy_quiz_candidates_*.json`에 신약일독 Day 1~365 × 5문항(총 1,825문항, 초신자·어린이용)이 교차검수까지 끝나 있다(오류/경고 0). 이번 라운드는 이 은행을 앱에 연결한다. **코드(T118~T120)는 후보 데이터로 바로 구현·테스트하고, 최종 문항 확정(T121)만 사용자 검수 승인 게이트 뒤에 둔다.**

### 설계 결정 (확정)

1. **쉬운 퀴즈는 신약일독(planType `nt`) 전용.** 후보 은행이 NT 스케줄 day 키잉이라 일년일독(1year)과는 구조적으로 호환 불가 — 1year 확장은 후속 후보(범위 밖).
2. **day 키잉 별도 경로로 연결한다** (책/장 스키마로 변환하지 않음). 현행 `range→책파일 필터→selectQuiz` 경로를 우회해 `day → 5문항 풀 → 시드 선택`으로 단순화. 기존 표준 경로는 무변경.
3. **난이도는 사용자 명시 토글 + 스마트 기본값.** 저장 필드 `users/{uid}.quizLevel: 'standard' | 'easy'`(게스트는 guestStorage 동일 키). 저장값이 없을 때 기본값: planId가 `nt_easy`이거나, `videoMode/videoType === 'kids'`이거나, `departmentId ∈ {elementary, kinder}`면 `'easy'`, 아니면 `'standard'`. 규칙 변경 불필요(quizLevel은 본인 update 블랙리스트 밖, talent/score 불변이라 상한 조건 통과).
4. **진행·보상 구조는 무변경.** `quizProgress[r${cycle}_d${day}]`·하루 1회 보상·2회 시도 그대로. 난이도를 바꿔도 그날 이미 완료한 퀴즈는 완료 상태 유지(레벨별 이중 보상 없음).
5. 후보 JSON의 `reviewStatus` 필드는 검수 파이프라인 전용 — 앱 데이터로 승격 시 제거.

### [x] T118. 데이터 승격 파이프라인 + 스케줄 별칭 보수

- **`scripts/promote-nt-easy.mjs` 신설** (`npm run promote:nt-easy`): `review/nt_easy_quiz_candidates_*.json` 3샤드를 읽어 → `reviewStatus` 제거 → `src/data/quizNtEasy/nt_easy_{001_122,123_244,245_365}.json`으로 출력(같은 3분할 유지 — 지연 로딩 단위). 실행 시 `validate-nt-easy-candidates.mjs`의 구조 검사(365일×5, date/range 스케줄 일치, answerIndex 등)를 승격 전 통과 필수 — 실패 시 출력하지 않음.
- **`src/data/schedules.js` 별칭 누락 보수**: `nt_easy`·`nt_message` → `schedules.new_testament` 별칭 추가 (현재 `nt_new`·`nt_saehangul`만 있음, 9~10행). 기존 캐시 title 우선 경로 덕에 잠복해 있던 갭이라 회귀 위험 낮음 — 그래도 두 버전의 본문 표시·퀴즈 range 폴백을 클릭 확인.
- 1회 실행해 후보 데이터 그대로 승격(코드 개발용 — 최종본은 T121에서 재실행).

### [x] T119. 출제 로직 — easy 경로 (`src/utils/quizEngine.js` + `BibleQuizCard.jsx`)

- `quizEngine.js`에 `loadNtEasyPoolForDay(actualDay)` 추가: `import.meta.glob`으로 `../data/quizNtEasy/*.json` 지연 로딩, day가 속한 샤드 1개만 import → 해당 day의 5문항 반환. quizKey는 `ntEasy-${actualDay}-${index+1}` (셔플 시드·진행 기록 겸용 — 기존 `${slug}-${ch}-${index}` 체계와 접두사로 구분).
- `buildDayQuiz`(BibleQuizCard.jsx 44~57행) 분기: 유효 난이도가 `'easy'`이고 planType이 `nt`면 easy 풀에서 `mulberry32` 시드 `(readCount-1)*365 + actualDay`로 1문항 선택(표준 경로의 selectQuiz와 같은 패턴 — 회독마다 다른 문항). `shuffleQuizChoices` 재사용. 풀 로드 실패·빈 풀이면 **표준 경로로 폴백**(콘솔 경고 1줄).
- `resolveQuizKey`(23행)에 `ntEasy-` 접두사 분기 추가 — 저장된 quizKey로 같은 문항 복원(정답·해설 다시 보기 경로).
- 배지 문구: easy일 때 "오늘 본문에서 쉬운 문제로 나왔어요 · {displayText}".

### [x] T120. 난이도 토글 UI + 저장

- BibleQuizCard 헤더에 소형 세그먼트 토글 **[표준 | 쉬움]** — planType `nt`일 때만 노출(1year는 미노출). 어르신 친화: 두 버튼 다 텍스트, 현재 선택 강조.
- 변경 시: 로그인 사용자는 `users/{uid}.quizLevel` merge 저장(+updatedAt), 게스트는 guestStorage `quizLevel`. `userDocToState`(helpers.js)에 `quizLevel` 필드 통과 추가.
- 그날 퀴즈를 이미 끝냈으면 토글은 보이되 "내일부터 적용" 안내 1줄(완료 상태는 유지).
- 기본값 결정 함수 `getDefaultQuizLevel(user)`는 설계 결정 3 그대로 — quizEngine 또는 quizProgress 유틸에 두고 카드·토글이 공용.

### [x] T121. 최종 문항 확정 반영 (2026-07-14 사용자 최종 승인)

- 사용자가 `review/NT_EASY_QUIZ_REVIEW.html`로 검수 → 수정 지시가 있으면 후보 JSON에 반영(+ `npm run validate:nt-easy` 재통과) → `npm run promote:nt-easy` 재실행으로 앱 데이터 최종 교체.
- 승인 즉시 반영이면 T118 승격본과 동일하므로 재실행만 확인.

### 검증 체크리스트

- [x] `npm run build`·`npm run validate`·`npm run validate:quiz`(기존 은행 회귀)·`npm run validate:nt-easy` 통과.
- [x] `nt_easy` 플랜 신규/기존 사용자: 기본값 '쉬움' → 오늘 본문 범위의 쉬운 문항 출제, 정답 시 달란트 적립 1회. *(실제 컴포넌트 출제+기존 단일 보상 transaction 계약 검사)*
- [x] `nt_new` 장년 사용자: 기본값 '표준', 토글로 '쉬움' 전환·새로고침 후 유지. *(기본값 순수 함수+저장 계약, 게스트 실제 새로고침 QA)*
- [x] 1year 사용자·게스트(1year): 토글 미노출, 기존 출제 무변경. *(실제 게스트 화면+기존 퀴즈 전체 검사)*
- [x] 게스트(nt): 토글 동작 + localStorage 유지, Firestore 쓰기 없음. *(실제 클릭·새로고침 및 역할 분기 계약)*
- [x] 회독 2회차(readCount 2)에서 1회차와 다른 문항 선택 확인(시드 회전). *(실제 컴포넌트 Day 1 비교)*
- [x] `nt_easy`·`nt_message` 버전의 본문 표시·퀴즈 range 폴백 정상(별칭 보수 회귀). *(일정 별칭·빌드 계약, nt_new 실제 본문 로드)*
- [x] 375px에서 토글 줄바꿈 없음. *(가로 overflow 0)*

완료 기준: T118~T120 + 체크리스트(T121 제외) + 작업 로그. T121은 사용자 승인 대기로 남긴다. 커밋 금지(Claude 담당).

---

## 🔁 라운드 24 — 핵심 쓰기 서버 권위 이관 (2026-07-14 사용자 승인, Codex 설계 + 하위 모델 3중 감사)

> 목적: 앱 화면에서 직접 바꿀 수 있는 보상·구매·가입·공개 디렉토리·통계·매일 영상 데이터를 서버가 검증하고 한 번만 반영하게 한다. 현재 운영 서버 기반은 Firebase Cloud Functions가 아니라 `supabase/functions` Edge Functions이므로 이를 재사용한다.
> **착수 게이트:** 라운드 23 미커밋 변경과 섞지 않는다. 라운드 23을 먼저 커밋·배포하고 운영 기본 동작을 확인한 뒤 T122부터 별도 커밋으로 시작한다.

### 감사에서 확인된 현재 위험

1. 읽기·퀴즈 보상과 상점 구매는 브라우저가 금액·정답·상품 가격을 포함한 여러 Firestore 문서를 직접 갱신한다. 앱의 transaction은 정상 사용 중 중복 클릭에는 강하지만, 신뢰 경계가 클라이언트라 변조 요청 자체를 막지 못한다.
2. 입장코드는 공개 `settings/churchDirectory`의 SHA-256 해시를 브라우저가 비교한다. 해시 대입 공격과 SDK 직접 호출 우회가 가능하고, roster 최대 3개 제한도 서버 규칙에서 원자적으로 강제되지 않는다.
3. `churchDirectory` 단일 배열과 `platformStats`를 일반 로그인 사용자가 직접 갱신할 수 있어 위조·마지막 저장 승리·날짜 전환 경합이 가능하다.
4. YouTube API 키가 `videoAutoConfig`에 있고 익명 로그인 사용자도 읽을 수 있다. 사용자마다 YouTube API를 반복 호출하며, 누구나 미래 `dailyVideos/{date}`를 선점할 수 있다.

### 확정 설계 원칙

1. **기존 Supabase Edge 재사용**: `kakao-auth`·`admin-set-password`의 CORS, Firebase ID token 검증, 서비스 계정 OAuth/Firestore REST 패턴을 `_shared`로 추출한다. 새 Firebase Functions 프로젝트는 만들지 않는다.
2. **서버 계산값만 신뢰**: 클라이언트가 보상액·상품 가격·잔액·정답 여부·통계 증가량·기준 날짜를 보내지 않는다. 서버가 사용자/roster/상점/문제은행/서버 KST 시각을 읽어 계산한다.
3. **멱등성 필수**: 모든 변경 호출에 의미 기반 키를 둔다. 읽기 `read:{uid}:{cycle}:{day}:{kstDate}`, 퀴즈 `quiz:{uid}:{progressKey}:{attempt}`, 구매 `purchase:{uid}:{requestId}`, 가입/통계는 생성 대상 uid/id를 키로 ledger를 만든다. 같은 요청 재전송은 같은 결과를 반환하고 중복 지급·차감하지 않는다.
4. **무중단 4단계 전환**: 서버 shadow 배포 → 새 앱이 서버 우선/안전 폴백 → 성공률·불일치 관찰 → Firestore 직접 쓰기 차단. 규칙부터 닫지 않는다.
5. **오래된 앱 보호**: 서버 전환 앱이 안정화되기 전까지 기존 직접 쓰기 규칙을 유지한다. 차단 시점은 최신 앱 7일 안정화, 서버 성공률 목표 충족, 구버전 직접 쓰기 0건을 확인한 뒤 사용자 승인으로 진행한다.
6. **민감값 응답 금지**: 입장코드 평문/해시와 YouTube API 키는 서버 secret/private 문서에만 둔다. 공개 디렉토리는 최종적으로 `{id,name,hidden}`만 제공한다.

### [x] T122. 공통 서버 기반 + 계약 검사

- `supabase/functions/_shared`에 허용 origin, JSON 응답, Firebase ID token 검증(익명 허용 옵션), 서비스 계정 access token, Firestore REST 읽기/원자 commit, 역할 검증, KST 날짜, 표준 오류 코드를 분리한다.
- `platform-api`는 인증이 필요한 변경 작업의 action router로 시작한다. T122에서는 무쓰기 `preflight`만 배포했다. 가입 전 코드 확인용 `join-code` 공개 함수와 IP 원문을 남기지 않는 속도 제한은 T125에서 별도 구현한다.
- 클라이언트 공용 `platformApi`는 현재 Firebase ID token을 Authorization에 붙이고 timeout·표준 오류·요청 ID를 처리한다. `.env.example`에 URL만 추가하고 실제 URL/secret은 커밋하지 않는다.
- 순수 함수 단위 테스트: token/role 가드, KST 오전 3시 경계, 숫자/문자열 Firestore 변환, 멱등키, 허용 origin, 재시도 가능한 오류 분류. `npm run validate:round24`로 묶는다.

### [x] T123. 읽기 완료·퀴즈 보상 서버 이관

- [x] **T123a. 읽기 완료 서버 계산 shadow** — KST 자정 기준 날짜, 진행 위치·하루 추가 읽기 상한·보상·연속일·개인 지갑을 서버 순수 함수로 계산하고 무쓰기 `previewReadCompletion`으로 배포한다.
- [x] **T123b. 로그인 사용자 shadow 비교** — 부서별 달란트 v2를 포함한 비교 장치·자동 검사 뒤, 2026-07-16 일회용 실제 로그인 계정에서 `[read-shadow] {"match":true,"serverStatus":"ready","clientStatus":"ready","mismatchKeys":[],"cycle":1,"day":1}`을 확인했다. 테스트 Auth/users/private/history는 즉시 완전 삭제했다.
- [x] **T123c. 읽기 완료 실제 쓰기 전환** — UUID 멱등 ledger와 한 transaction으로 users 진행·점수·지갑, 최대 3개 canonical roster 진도·지갑, history, 첫 독자·완독 통계를 처리한다. React의 직접 읽기 transaction과 통계 쓰기, 서버 실패 시 직접 쓰기 폴백을 제거했다.
- [x] **T123d. 퀴즈 보상 서버 이관** — 서버 정답 인덱스·출제 범위 검증·시도/보상 ledger를 구현하고 클라이언트 직접 쓰기를 제거했다.
  - [x] **T123d1. 정답 인덱스·순수 계산 기반** — 앱과 동일한 선택지 셔플로 6,657문항의 표시 정답 위치와 계획별 허용 Day를 생성한다. 현재/방금 완료 위치, 저장 문항 고정, 2회 시도, 하루 1회 보상을 무쓰기 순수 함수로 검증한다.
  - [x] **T123d2. 퀴즈 shadow API·클라이언트 비교** — 2026-07-16 같은 일회용 실제 로그인 계정에서 `[quiz-shadow] {"match":true,"serverStatus":"ready","clientStatus":"ready","mismatchKeys":[],"progressKey":"r1_d2","quizKey":"genesis-3-8"}`을 확인했다.
  - [x] **T123d3. 퀴즈 실제 쓰기 전환** — UUID 멱등 ledger와 진도별 1차·2차·건너뛰기 의미 원장, users/roster 원자 commit, 서버 정답 판정, 2회 시도, 당일 1회 보상, 오늘 건너뛰기를 구현했다. 여러 탭의 서로 다른 UUID도 같은 attempt slot을 두 번 소비하지 않고, 제출·건너뛰기 경합은 transaction으로 직렬화한다. 결과 불명 재시도는 최초 payload/requestId를 보존하고 strict 2xx 응답 뒤에만 키를 지우며 브라우저 직접 transaction은 없다. 사용자 marker와 progress를 모두 지우거나 과거 첫 요청을 replay해도 최신 terminal 의미 원장과 당일 ledger가 상태를 복구하고 재적립을 막는다.

- `completeRead({cycle, day, requestId})`: 현재 사용자 진행 위치·하루 추가 읽기 상한·서버 KST 날짜를 검증하고 users 진행/score, 최대 3개 실제 roster 지갑, history, 통계 ledger를 한 transaction으로 반영한다. 클라이언트의 `talentEarned`, `score`, roster 목록은 받지 않는다.
- `submitQuiz({progressKey, quizKey, selectedIndex, attemptSlot, requestId})`: 서버가 문제 정답과 해당 Day 출제 가능 범위, 기대 시도 슬롯을 검증하고 의미 원장·시도 횟수·하루 1회 보상·users/roster 지갑을 한 transaction으로 반영한다.
- 서버용 문제 정답 데이터는 앱 JSON에서 빌드 시 생성한 최소 인덱스(`quizKey → answerIndex + 적용 범위`)를 사용한다. 클라이언트가 정답 여부를 보내는 방식은 금지한다.
- 기존 React 코드는 결과 응답으로 상태/UI만 갱신한다. 서버 장애 시 보상을 직접 쓰는 폴백은 두지 않고 “저장 실패, 다시 시도”로 안전하게 실패한다.

### [ ] T124. 달란트 상점 구매 서버 이관

- [x] **T124a. 일반 구매 서버 권위 전환** — 서버가 실제 소속·활성 시장·상품·안전한 정수 가격·최신 지갑 잔액을 읽고 requestId 문서로 원자 차감·생성한다. 재전송은 입력 결속 뒤 최신 잔액을 반환하며 브라우저 직접 create 규칙은 닫혔다.
- [x] **T124b. 관리자 판매·수령·환불 서버 action** — 매 action이 transaction 안에서 최신 관리자 권한과 대상/구매/지갑을 다시 읽고, 지갑·구매·서비스 전용 `talentAdminActions/{requestId}` 불변 ledger를 한 commit으로 처리한다.
- [x] **T124c. 응답 유실·개인 전환 환불 안전장치** — 모든 구매 2xx 응답을 action/requestId/잔액/지갑/구매 상태까지 검증한 뒤에만 requestId를 정리한다. Firestore에서 완료 requestId를 관찰하면 세션 보존키를 정리하고 replay는 최신 잔액을 반환한다. v2 users 구매 뒤 personal 전환은 같은 공동체의 활성·동일 uid roster를 서버가 재검증하고 명시적 2차 확인 뒤 roster로 환불한다.
- [ ] **T124d. 운영 배포·실로그인 스모크** — 최신 Edge와 웹을 배포한 뒤 실제 공동체 관리자 계정에서 소액 창구 판매 1건, pending 일반 구매 수령 1건, 별도 pending 일반 구매 환불 1건(가능하면 개인 전환 환불 2차 확인 포함)을 확인한다. 기존 관리자 직접 쓰기 규칙은 T127 관찰 종료 전까지 호환용으로 유지한다.

- `purchaseItem({churchId,itemId,requestId})`: 호출자가 그 공동체 roster/소속인지, 상점 활성/상품 활성/서버 저장 가격, 지갑 종류와 잔액을 다시 읽는다.
- 지갑 차감과 `talentPurchases` 생성은 원자 처리한다. `purchaseId`는 requestId에서 결정적으로 만들어 재전송 시 같은 구매를 반환한다.
- 응답은 `purchase`, `nextTalent`, `walletKind`만 반환한다. 이름·가격·상태는 서버 저장값으로 만든다.
- 관리자 창구 판매/환불은 권한과 대상 지갑을 별도 action으로 검증하고 감사 로그를 남긴다. 일반 구매 전환 확인 뒤 기존 직접 create 규칙을 닫는다.

### [ ] T125. 입장코드·가입·공동체 참여·디렉토리·통계 이관

- `join-code`: `churchId + entryCode + purpose`를 검증하고 5분 일회용 join ticket을 발급한다. 존재 여부와 코드 오류 메시지는 통일한다. App Check/속도 제한을 적용한다.
- `completeMemberSignup`: 현재 Auth uid와 미사용 ticket을 묶어 users 생성·roster 생성·통계 ledger를 원자 반영한다. 추가 공동체는 `joinChurch`가 코드·부서/소그룹 실재·중복·최대 3개를 함께 검증한다.
- 입장코드는 `churches/{id}/private/access`에 저장한다. 서버는 이 문서를 우선 읽고 본문 레거시 필드에는 한시적으로만 폴백한다. 해시만 남아 원문 복원이 불가능한 교회는 관리자가 새 코드를 설정하게 한다.
- [x] **T125a. 서버 참여권 1차** — `issueJoinTicket` public action이 코드 해시를 서버에서 검증하고 5분 ticket을 발급한다. 원문 IP는 저장하지 않고 목적을 합산한 클라이언트·공동체 해시 rate-limit 문서만 쓴다. 회원가입·개인/소셜 온보딩·추가 공동체 참여는 공개 `codeHash` 비교 대신 ticket을 사용하고, 성공 transaction 안에서 ticket을 `usedBy/usedAt/usedRequestId`로 소비한다. 구버전 탭 호환을 위한 원문 코드 action도 같은 제한을 탄다.
- [x] **T125b. private/access 우선 저장** — 신규 교회 등록·관리자 입장코드 변경 시 `churches/{id}/private/access.codeHash`를 함께 저장한다. 서버 검증은 private/access를 우선 사용하고 레거시 `churchCodeHash`에는 한시 폴백한다.
- [x] **T125c. 공개 디렉토리 신규·운영 쓰기 정리** — 새 `churchDirectory` 쓰기는 `{id,name,hidden}`만 쓰며 클라이언트는 더 이상 `codeHash`를 읽어 코드 검증하지 않는다. 운영 `settings/churchDirectory.churches[].codeHash`와 공개 교회 코드 필드는 2026-07-15 원자 이전으로 0건이 됐다. `publicChurches/{churchId}` 백필 기반은 T125d에서 마련했고, 남은 writer 이관·public 활성화·legacy 직접 쓰기 차단은 T125e/T127에 남는다.
- [x] **T125d. `publicChurches` 안전 백필 기반** — 관리자 서버 action이 전체 원본을 dry-run/execute하고 service-only owner lease·레거시 updateTime fence로 동시 writer를 방어한다. 새 컬렉션과 meta rules는 서비스 계정만 쓰며 앱은 `mode:public` 전까지 legacy를 사용한다. 로컬 구현·검증만 완료했고 운영 백필·배포·활성화는 하지 않았다.
- [ ] **T125e. 남은 운영 writer·통계 서버 권위** — 변경/숨김/삭제/신규 교회 writer를 서버 action으로 모은 뒤 `churchDirectory` 직접 write를 닫을 준비를 한다. `platformStats`는 필드 의미를 먼저 확정하고, 클라이언트 숫자 입력 없이 생성/읽기 ledger에서 한 번만 집계하며 platformAdmin `rebuildPlatformStats({dryRun})`로 전수 재계산·차이를 확인한다.
  - [x] **T125e-1. 검색 숨김/노출 writer** — 교회 원본·legacy/public 디렉토리·불변 관리자 원장을 서버 transaction으로 이관하고 누락 public 문서와 legacy 비밀 필드 drift도 함께 복구한다.
  - [ ] **T125e-2. 신규/변경/삭제 교회 writer** — 아래 독립 단위 중 이름 변경과 비활성화 정책만 남았다.
    - [x] **T125e-2a. 신규 관리자 교회 생성** — 검증된 Auth uid/email/provider와 exact 가입·동의 입력으로 교회, 관리자 users/private, 입장코드, legacy/public 디렉토리, lifecycle 원장을 한 서버 transaction에서 만든다. 응답 유실·동시 생성·rebuild lock을 멱등 처리하고 브라우저 `churches`/churchAdmin users create를 닫았다.
    - [x] **T125e-2b. 입장코드·무소속 점검·관리자 이동 방어** — 입장코드는 서버 hash/version CAS/소유 증명과 불변 원장으로 회전하고, 무소속 가상 교회 점검도 platform/super 전용 action으로 이관했다. private access·legacy directory 직접 write를 닫고 플랫폼 회원 편집으로 churchAdmin 소속을 옮기는 우회도 차단했다.
    - [ ] **T125e-2c. 교회 이름 변경** — 현행 정식 이름 변경 UI는 없다. `churches.name`과 legacy/public 투영만 바꿀지, 기존 `users.churchName`·개인 계정의 저장된 조직명까지 fanout할지 아래 메모 결정 뒤 구현한다.
    - [ ] **T125e-2d. 교회 삭제/비활성화** — 기존 부분 삭제 UI는 데이터 손상을 막기 위해 중단했다. roster 지갑·pending 구매·외부 멤버·복원·보존 기간 정책을 아래 메모에서 확정한 뒤 서버 action을 설계한다.
  - [ ] **T125e-3. `platformStats` 의미 확정·재계산** — 아래 Codex → Claude 질문의 필드 의미 결정 뒤에만 구현한다.

### [x] T126. 매일 영상·기도제목 서버 이관 (2026-07-15 Claude 상세 설계 — Codex 소작업 순서대로 진행)

**설계 원칙 (Codex 라운드 24 확정안 그대로):**
- `resolveDailyVideo`는 클라이언트 날짜를 받지 않고 서버 KST 오전 3시 기준일을 계산한다. Firebase token은 필수이며 익명 게스트 token은 read에 한해 허용한다.
- YouTube 키는 Supabase `YOUTUBE_API_KEY` secret으로 이동한다. `dailyVideoJobs/{date}` lease로 한 작업자만 API를 호출하고, lazy 복구를 기본으로 한다 (예약 prewarm은 T126e에서 가능성만 확인).
- 제목이 오늘 날짜와 엄격히 일치하는 영상만 오늘 문서로 저장한다. 없으면 어제 영상을 오늘 문서에 고정하지 않고 `pending` 임시 응답으로 돌려 2/5/15/30분 backoff한다.
- 설명란 chapters/기도제목도 서버가 30~60분 TTL로 갱신·저장한다. 실패 시 기존 저장값을 유지한다. 수동 등록(`autoFilled:false`)은 절대 덮지 않는다.
- 앱은 Firestore 캐시 우선 → 서버 resolve 1회 → 저장 캐시 폴백만 수행하고 브라우저의 YouTube API 호출을 제거한다.

**현재 구조 (2026-07-15 조사 확정 — 구현 전 재확인만, 재조사 불필요):**
- 클라이언트 YouTube 직접 호출은 `src/components/dashboard/DailyVideoCard.jsx`의 `fetchPlaylistCandidates`(29행)·`fetchVideoDescriptionChapters`(44행)·`fetchLatestFromPlaylist`(55행) 3곳 + `PlatformAdminView.jsx` `testAutoConnection`(170행, `fetchLatestFromPlaylist` import 사용). apiKey는 `settings/videoAutoConfig`에서 읽는다 (`DailyVideoCard.jsx` 193·250행).
- 문서 ID는 `getVideoDateKST()`(`src/utils/helpers.js:176`) = KST 오전 3시 경계 `YYYY-MM-DD`. **서버 `_shared/time.ts`의 `getServiceDateKst()`가 정확히 같은 값이므로 그대로 사용한다** (둘 다 UTC+9h−3h).
- 제목 날짜 매칭·후보 선택·fill 상태 판정은 `src/utils/dailyVideoPolicy.js`의 순수 함수 `titleMatchesDate`/`selectDailyVideoCandidate`/`getDailyVideoFillState` (R25-2의 축약 날짜 머리말 제한 포함). chapters 파싱은 `src/utils/helpers.js`의 `parseAndMapChapters`(219~270행).
- `dailyVideos/{date}` 스키마: `{ adult|kids: {url, chapters:[{label,sec}], title?, publishedAt?, matchedDate?} | null, updatedAt, autoFilled }`. 수동 등록은 항상 `autoFilled:false`.
- 클라이언트 backoff: 2/5/15/30분 후 시간당 1회 + 포커스 복귀(5분 쿨다운) — `AUTO_RETRY_DELAYS_MS`/`scheduleAutoRetry`.
- rules: `dailyVideos` create는 로그인(익명 포함) 누구나 4필드 화이트리스트+URL 검증, update/delete는 platformAdmin만. `videoAutoConfig` read는 로그인 전체. **rules 차단은 T127 몫 — T126에서 건드리지 않는다.**

- [x] **T126a. 서버 resolve/lease** — `platform-api`에 `resolveDailyVideo` action 추가.
  - 인증: `verifyFirebaseIdToken(idToken, { allowAnonymous: true })`. index.ts의 공통 검증(`allowAnonymous:false`) **앞에** `issueJoinTicket`처럼 별도 분기로 배치한다. payload는 `requestId`만 받는다 (클라이언트 날짜·모드 입력 금지).
  - 기준일 = `getServiceDateKst()`. `dailyVideos/{date}` 존재 시: `autoFilled:false`(수동)면 그대로 반환하고 어떤 필드도 쓰지 않는다(T126b의 chapters TTL 갱신만 예외). `autoFilled:true`이고 `videoAutoConfig`에 설정된 모든 모드가 준비면 그대로 반환.
  - 미준비면 `dailyVideoJobs/{date}`를 transaction으로 획득: `{ leaseExpiresAt(now+90초), attemptCount, nextRetryAt }`. lease 선점됨 또는 `nextRetryAt` 미도래면 YouTube 호출 없이 `pending:true, retryAfterMs`만 반환한다. 서버 backoff는 attemptCount 기반 2/5/15/30분, 이후 시간당 1회 — 다중 클라이언트가 동시에 와도 quota를 태우지 않는 것이 lease의 목적이다.
  - lease 획득 시에만 YouTube API 호출. 키는 `YOUTUBE_API_KEY` secret 우선, 미설정이면 **한시적으로** `videoAutoConfig.apiKey` 폴백(폴백 제거·키 회전은 T127). playlist ID·enabled는 서버가 `settings/videoAutoConfig`에서 읽는다.
  - 신규 `dailyVideoCore.ts` 순수 모듈: `titleMatchesDate`·`selectDailyVideoCandidate`·`getDailyVideoFillState`·chapters 파싱을 앱과 동일 계약으로 Deno 이식하고 단위 테스트를 둔다. 표류 방지: validate 스크립트에 앱(`dailyVideoPolicy.js`·`parseAndMapChapters`)과 서버가 같은 케이스 표를 통과하는 계약 검사를 추가한다 (quizShuffle 방식 참고).
  - R25-1/2 결정 유지: 기준일 엄격 일치만 저장, 축약 날짜는 제목 머리말만, 어제 영상 고정 금지, **설정된 모드가 모두 준비될 때만 `autoFilled:true` 문서를 서비스 계정으로 저장**. 일부만 준비면 저장 없이 응답에만 담아 `pending:true`로 반환한다.
  - 응답: `{ ok, action, requestId, serviceDate, video|null, transient|null, pending, retryAfterMs? }`. apiKey·playlistId·config 내용·문서 경로·lease 내부 상태는 응답 금지.
- [x] **T126b. chapters·기도제목 서버 TTL 갱신** — resolve가 저장 문서를 반환할 때 문서의 `chaptersRefreshedAt`이 30~60분 경과했고 lease를 잡은 경우에만 videos API로 설명란을 다시 읽어 chapters를 갱신한다. 실패 시 기존 저장값 유지. 수동 문서는 현재 클라이언트 동작과 동일하게 chapters만 갱신하고 url 등 다른 필드는 절대 건드리지 않는다.
- [x] **T126c. 클라이언트 전환** — `DailyVideoCard.jsx`: Firestore 캐시 우선 → 미준비 시 `platformApi.resolveDailyVideo()` 1회 → 실패/pending이면 기존 2/5/15/30분·포커스 backoff 재사용(서버 `retryAfterMs`가 있으면 더 이른 재시도 금지). YouTube 직접 호출 3곳, `videoAutoConfig` 읽기, `dailyVideos` create/lazy-fill 쓰기를 전부 제거한다. 게스트(익명)도 같은 경로. `src/utils/platformApi.js`에 `previewReadCompletion` 형태의 wrapper + 응답 검증(ok/action/requestId echo, url이 있으면 youtube.com|youtu.be https만 허용)을 추가한다.
- [x] **T126d. 관리자 화면 전환** — `PlatformAdminView.jsx` `testAutoConnection`을 무쓰기 서버 action `adminPreviewDailyVideo`(platformAdmin 전용, 응답에 apiKey 미포함)로 교체한다. 설정 저장은 playlist·enabled만 쓰도록 바꾸고 apiKey 입력란은 "서버로 이동됨" 안내로 대체한다 (기존 저장된 apiKey 필드 삭제는 T127). 수동 등록·삭제는 admin 전용 직접 쓰기 그대로 유지한다.
- [x] **T126e. 배포·검증** — 사용자 명시 요청 시 Edge → 웹 순서로 배포. 검증: 게스트/로그인 resolve 200, 미인증 401, 잘못된 origin 403, 오늘 영상이 아직 없는 시간대의 pending+retryAfterMs 응답, 수동 문서 불변, 멀티탭 동시 접속 시 YouTube 호출 1회(lease 로그), 기존 저장 영상 표시 회귀 없음. 오전 3시 예약 prewarm은 Supabase cron 지원 여부를 확인해 가능하면 제안만 메모에 남긴다 (lazy 복구만으로 기능 완결 — 임의 구현 금지).
  - 운영 완료(2026-07-16): Edge v8→웹 배포, 게스트·비익명 200, 401/403/CORS, 자연 상태 동시 lease/pending, 저장 영상 보호 필드, 공개 성인·어린이 화면 회귀를 통과했다. 현재 날짜 수동 문서와 실 platformAdmin 자격증명이 없어 해당 두 라이브 확인만 운영 관찰 잔여로 남긴다.

**사용자 수동 작업 — M-V1** (T126a 배포 전): `npx supabase@latest secrets set YOUTUBE_API_KEY=<현재 videoAutoConfig.apiKey 값>`. 값은 Firestore `settings/videoAutoConfig`에서 복사 (키 회전은 T127에서 하므로 지금은 같은 키 재사용).

### [ ] T127. 규칙 차단·민감 데이터 정리·운영 검증

- [x] **T127a. 읽기 Day 1 재시작 서버 이관** — 비익명 로그인 사용자의 `restartReading`이 현재 cycle/day/`readingEpoch`를 precondition으로 검증하고 users·canonical roster·UUID 원장을 원자 갱신한다. 완독 횟수와 보상·기록은 보존하며 epoch만 증가시켜 재시작 전 completeRead/quiz/skip 요청과 과거 의미 원장을 차단한다. 브라우저의 직접 진행 초기화와 기록 삭제는 제거했고 실제 UI 진입·중복 제출·응답 유실 복구를 추가했다. 로컬 검증만 완료했고 아직 배포하지 않았다.
- [x] **T127b. 업적 동기화 서버 이관** — 비익명 `syncAchievements`가 서버 users 상태로 14개 업적을 판정해 신규 항목과 UUID 원장을 원자 기록한다. 브라우저의 업적 판정·직접 transaction을 제거했고 읽기/메모 source-server 최종 상태, strict 응답, 계정 전환·재시작·지연 toast guard를 적용했다. 로컬 검증만 완료했고 아직 배포하지 않았다.
- [x] **T127c. 긴급 rules 축소** — 본인 삭제 상태 변조와 공동체 관리자의 users/roster 전체 쓰기를 차단하고 삭제 감사 UID·시각을 강제했다. 개인 이관 완료 users와 모든 personal roster의 score/talent를 동결하고 개인 primary roster 및 양수 잔액 roster 삭제를 차단했다. 신규 관리자/무소속 users create의 잔액·이관·소속 초기값도 강제한다. 일반 공동체 계정·roster의 보상/진도 호환 상한은 최신 배포 뒤 관찰 전까지 유지한다.
- [x] **T127d. 개인 legacy 지갑 서버 이관** — exact `{requestId}` action이 users의 legacy 달란트를 서버가 판정한 primary roster로 원자 이동하고 표식을 닫는다. 원장 replay·409 재시도·late refund 재이관·primary roster 누락 무쓰기 복구와 source-server 클라이언트 확인을 추가했다.
- [x] **T127e. legacy 읽기 위치 정규화** — 매 비익명 로그인에서 서버 action이 users Day>365를 회차로 환산하고 모든 canonical roster drift/누락을 원자 보정한다. 특정 이름에 결속된 Day/readCount 직접 writer를 삭제했으며 정상 users의 일시적 5xx는 로그인과 분리하되 로컬 위치가 범위를 벗어나면 fail-closed한다.
- [x] **T127f. 최초 플랜·소속 서버 이관** — 첫 플랜·부서·소그룹 선택을 exact action으로 옮기고 조직명은 서버 교회 문서에서 파생한다. 신규 관리자는 `onboardingPending:true`와 빈 소속으로만 생성하고 action commit에서 false로 닫으며, source-server 확인·legacy 조직 schema·빈 소그룹·중복 제출·계정 전환을 검증한다. 죽은 직접 소그룹 writer도 제거했다.
- [x] **T127g. 혼자 읽기 참여 서버 이관·legacy roster 정규화** — personal 사용자의 `unaffiliated_v1` 참여를 exact 빈 payload·UUID action으로 옮겨 서버가 최대 3개 canonical roster, primary와 최소 원장을 한 transaction에서 생성·복구한다. T97 이전 roster의 실제 누락 `talent`/`extraMemberships`만 0/[]로 보정하고 명시적 손상 상태는 거부한다. 클라이언트는 지갑 이관까지 끝낸 source-server 상태만 적용하며 계정·요청 세대 경합을 차단한다. 로컬 검증만 완료했고 아직 배포하지 않았다.
- [x] **T127h. 교회 성도 → 개인 계정 전환 서버 이관** — Auth email claim과 canonical users/source church/source roster/최대 3개 소속을 서버가 검증해 users·필요한 source roster·사용자별 불변 원장을 원자 반영한다. 전원 초기화 표식과 late positive users 잔액, 응답 유실, 구 브라우저 단계 재개를 보존한다. Auth email만 바뀐 실패 상태는 다른 기기에서도 exact pseudo-email 계약으로 대기를 재구성하며, 후속 개인 지갑 action과 source-server 상태 확인 뒤 완료한다. 로컬 검증만 완료했고 아직 배포하지 않았다.
- 최신 앱과 Edge Functions를 먼저 배포하고 최소 7일 관찰한다. T126 영상 경로의 2026-07-16 05:14 KST 관찰은 별도로 유효하지만, T123 읽기·퀴즈와 T125 잔여를 포함한 최종 차단 시계는 이 변경들의 실제 배포 시점부터 새로 센다. 지표: action별 성공/실패/중복 재전송, 직접 쓰기 시도, 보상·잔액·통계 불일치, 영상 pending/stale, YouTube 쿼터.
- users 보호 필드를 닫기 전에 남은 보호 필드 직접 writer를 다시 전수 감사하고 필요한 서버 action 이관을 끝낸다. `handleRestart`, `checkAchievements`, `BibleQuizCard.skipToday`, 개인 계정 전환은 이미 서버 transaction으로 옮겼다. 다음 후보는 플랫폼 관리자의 stale 전체-user 편집/교회 이동, 개인 primary 변경, 일반 공동체 탈퇴, legacy 달란트 이관/관리자 초기화다. 사용자 작성 데이터에서 잔액을 계산하는 현 공식을 그대로 서버로 복제하지 않는다.
- 승인 후 rules에서 일반 사용자의 보호 필드 직접 증가, `talentPurchases` create, `churchDirectory`/`platformStats` write, `dailyVideos` create, `videoAutoConfig` read를 순서대로 닫는다. `users` read 규칙은 수정하지 않는다.
- `videoAutoConfig.apiKey` 삭제 후 노출된 YouTube 키를 회전한다. 미래 dailyVideos·본문 churchCode/code/hash·공개 directory codeHash를 dry-run 감사 후 단계 삭제한다.
- 복구 계획: 서버 장애 시 규칙을 다시 열어 보상을 클라이언트로 되돌리지 않는다. 변경 요청은 재시도 큐/안내로 멈추고, 읽기 본문·저장된 영상 같은 read-only 기능은 계속 제공한다.

### 완료 기준

- 서버 순수 함수/계약/클라이언트 회귀 검사와 `npm run validate`, `npm run build`, `git diff --check` 통과.
- 멀티탭·네트워크 재전송에서 읽기/퀴즈/구매가 정확히 한 번만 반영.
- 변조된 보상액·가격·quizKey/day·타 공동체 요청·미래 영상 날짜가 서버에서 거부됨.
- 게스트 영상, 일반/개인/관리자 로그인, 첫 읽기·추가 읽기·2회 퀴즈·다중 공동체 지갑·상점 구매/환불·가입/재가입 실검증.
- 규칙 차단 전후 불일치 0, 운영 교회 private/access 백필 100%, 공개 코드 해시/YouTube 키 0건.

---

## 🔁 라운드 25 — 문제 수정·재감사 3회 반복 (2026-07-15 사용자 지시, Codex 설계)

> 기존 T123 shadow 실계정 확인은 사용자 로그인이 필요한 수동 게이트라 상태를 유지한다. 이 라운드는 그와 독립적으로 2026-07-14 전체 기능 감사에서 확인된 운영 문제를 `수정 → 독립 재감사` 세 번 반복한다. 각 회차는 직전 재감사의 확정 문제만 다음 입력으로 사용한다.

### [x] R25-1. 1차 — 즉시 위험·명확한 회귀 수정

- 기존 공동체를 지정한 `churchAdmin` 자가 생성 차단. 신규 공동체·소유 증명·관리자 user가 한 원자적 쓰기에 있을 때만 최초 관리자 생성을 허용한다.
- 이메일 관리자 가입도 Google 가입과 같은 원자적 Firestore transaction으로 전환한다.
- `private/consent`에서 공동체 관리자 접근을 제거하고 본인·플랫폼 관리자 범위를 분리한다.
- 매일 영상은 제목 날짜가 기준일과 엄격히 일치할 때만 자동 선택한다. 없으면 과거 영상 저장 없이 pending/stale로 안전 실패하며 수동 등록은 유지한다.
- 네이버·Google 작은 TTS 안내와 카카오 기존 외부 브라우저 알림 판정을 분리한다.
- 관리자 구매 목록은 pending 전체와 최근 이력 200건을 합쳐 탈퇴자·오래된 미처리 구매를 보존한다.
- 레거시 구매 환불은 현재 소속으로 지갑을 추론하지 않고 관리자가 지갑을 명시 선택한다. 손상된 v2는 자동 환불하지 않는다.
- 기본 `npm run validate`에 전체 퀴즈와 신약 쉬운 퀴즈 검사를 포함한다.
- 검증: 전체 validate, production build, Firestore rules dry-run compile, diff-check 통과.

### [x] R25-2. 2차 — 1차 독립 재감사 발견 수정

- adult/kids 일부 게시 상태는 화면에만 임시 표시하고 두 모드가 모두 준비될 때만 자동 문서를 생성한다. 열린 화면과 기존 부분 문서는 2/5/15/30분 backoff로 재조회한다.
- 축약 날짜(`07.15`, `7/15`, `0715`)는 제목 머리말에서만 인정해 성경 장·절 오인을 막고, 명시적 `M월 D일`·`YYYYMMDD`는 유지한다.
- 이메일 관리자 가입의 Auth 성공·Firestore 실패 상태는 같은 password 인증 세션으로 재개한다. 이전 commit 응답만 유실된 경우 기존 관리자 문서를 복구해 공동체 중복 생성을 막는다.
- pending 구매는 문서 id 기준 100건씩 페이지 조회하고 최근 이력 200건과 독립적으로 불러온다. 한 쿼리 실패 시 다른 결과와 경고를 유지한다.
- v2 roster 환불은 `walletOrgId` 존재·현재 공동체 일치를 필수로 한다.
- 직접 교인 구매 뒤 개인 계정 전환으로 동일 공동체 roster 지갑이 생긴 경우, 관리자 2차 확인과 transaction 내 재검증 뒤 roster로 환불한다.
- 검증: 전체 validate, production build, Firestore rules dry-run compile, diff-check 통과.

### [x] R25-3. 3차 — 2차 독립 재감사 발견 수정·최종 감사

- 최초 교회 교인 가입, 개인·Google·카카오 가입, 추가 공동체 참여를 `platform-api` 서버 검증 경로로 전환했다. 서버가 Firebase 사용자, 삭제 상태, 동의·보호자 동의, 입장코드, 실제 부서·소그룹, 공동체 수 상한을 다시 검증하고 필요한 users/roster를 원자 생성한다.
- 일반 회원의 임의 타 공동체 roster 생성, 개인/소셜 users 직접 생성, 일반 구매 문서 직접 생성을 Firestore 규칙에서 닫았다. 기존 교인의 개인계정 전환용 base roster는 최신 users 원장과 정확히 일치할 때만 허용한다.
- 달란트 구매는 서버가 실제 활성 시장·상품·가격·지갑·잔액을 읽어 원자 차감·생성한다. 요청 ID를 구매 문서 ID로 사용하고, 브라우저는 결과 불명 재시도에 같은 ID를 보존해 이중 차감을 막는다.
- 삭제된 관리자뿐 아니라 일반·개인 회원도 세션 복원과 각 로그인 경로에서 즉시 로그아웃한다. 부서·소그룹은 서버 가입 또는 관리자만 배정할 수 있고 회원의 최초 입력·후속 변경을 모두 차단한다.
- 최종 교차감사에서 확인한 개인계정 전환 규칙 우회도 닫았다. 전환 시 허용된 6개 필드 외 달란트·점수·삭제 상태·역할 변경을 금지하고, 삭제/무소속 계정 전환과 무소속 계정의 임의 초기 잔액 발행을 막았다. 무소속·기본 공동체 roster도 활성 users 원장과 정확히 일치해야 생성된다.
- 자동 영상은 안전한 당일 캐시 우선, 누락 모드만 조회, 2/5/15/30분 뒤 시간당 재시도와 포커스 재개를 적용했다. 관리자 구매 목록은 미처리 100건 페이징과 완료·취소 최근 200건을 분리했고 인덱스를 선언했다.
- 검증: `npm run validate`, production build, Deno platform-api 47 tests, `deno check`, Firestore rules dry-run compile, diff-check 통과.
- **배포 순서 필수:** `platform-api Edge Function → Firestore indexes → 새 웹 → Firestore rules`. 규칙을 먼저 배포하면 열린 구버전 탭의 가입·공동체 추가·구매가 실패한다.
- **남은 별도 보안 과제:** 공개 `codeHash`와 4자리 코드 추측/속도 제한은 T125의 private access + join ticket 백필로 해결해야 한다. 읽기·퀴즈 보상의 클라이언트 직접 증가(+17/+15 반복)는 T123b/d2 실계정 shadow 일치 확인 뒤 T123c/d3 서버 commit으로 닫는다.

---

## 🔐 라운드 26 — 공개 4자리 입장코드 추측 방지 보완 · 운영 이전 완료 (2026-07-15 Codex)

- `platform-api`의 `issueJoinTicket` public action은 `churches/{id}/private/access.codeHash`를 우선 읽고 레거시 공개 해시에 한시 폴백한 뒤 5분 ticket을 발급한다. 없는 공동체·삭제된 공동체·해시 미설정·틀린 코드는 모두 `FORBIDDEN / 입장코드가 올바르지 않습니다.`로 응답해 존재 여부를 노출하지 않는다.
- 속도 제한은 가입 목적별로 갈라지지 않는다. 같은 공동체에 대해 `clientChurch` 10회/시간과 `churchGlobal` 200회/시간을 적용하며, 두 카운터를 같은 transaction에서 검사·증가한다. 원문 IP는 저장하지 않고 `JOIN_CODE_RATE_LIMIT_SALT`로 만든 해시 키만 저장한다.
- 교회 교인 가입, 개인/소셜 온보딩, 추가 공동체 참여는 ticket을 사용한다. 성공 transaction에서 `usedAt/usedBy/usedRequestId`를 함께 기록하고, 같은 uid와 **같은 requestId**인 응답 유실 재시도만 허용한다.
- Google·이메일 신규 공동체 가입 transaction은 공개 `churches/{id}`에 `churchCode/churchCodeHash`를 쓰지 않고 같은 transaction에 `private/access.codeHash`를 저장한다. 관리자 코드 변경도 한 batch에서 private 해시 저장과 공개 레거시 두 필드 삭제를 처리한다.
- 플랫폼 관리자용 `migrateChurchAccessSecrets` 도구를 추가했다. 기본 무쓰기 사전점검은 기존 private 해시, 공개 교회 해시, 기존 디렉토리 해시, 공개 원문 순으로 백필 원천을 찾는다. 실제 실행은 교회별 transaction에서 최신 private 해시를 보존하며 공개 `churchCode/churchCodeHash/code`를 삭제하고, 마지막 디렉토리 transaction에서 전체 배열을 `{id,name,hidden?}`로 정리한다. 무소속 공개 문서의 잔여 비밀 필드도 정리 대상이다. **운영 8개 공동체 이전과 공개·디렉토리 정리는 2026-07-15 완료했다.**
- 정적 보안 검증은 신규·변경 공개 쓰기, 이전 도구, 목적 통합 이중 제한, ticket requestId 결속, 동일 공개 오류를 검사하도록 보완했다.
- 검증: `npm run validate`, `npm run build`, Deno platform-api 64 tests, `deno check supabase/functions/platform-api/index.ts`, Deno format, Firebase rules/indexes dry-run, `git diff --check`, 독립 코드 재검토 통과.
- **운영 완료:** `JOIN_CODE_RATE_LIMIT_SALT` 설정, platform-api v5·인덱스·웹 `index-OCMsjSZz.js`·rules 순차 배포, 0600 원본 백업, 18 writes 원자 이전을 완료했다. 직후 감사에서 공개·디렉토리 비밀 필드 0, private/access 유효 8/8, 누락 0을 확인했다.
- **남은 방어:** Firebase App Check는 아직 적용하지 않았다. 현재 이중 속도 제한은 그 전까지의 중간 방어다. 이후 App Check 적용, `publicChurches/{churchId}` 점진 이관, `churchDirectory`/`platformStats` 직접 write 차단, T123 읽기·퀴즈 서버 commit 전환이 남았다.

---

## 📮 Claude → Codex 메모

- 이 설계는 3차 자체 점검을 거친 확정본이다. "더 나은 방법"이 보여도 위 설계 결정 4가지(가상 교회/익명 인증/localStorage 전용/클라이언트 상수)는 바꾸지 말고, 제안은 위 메모란에 적어라.
- ~~firestore.rules의 `users` read 규칙 버그 — 건드리지 말 것~~ (해결됨 — 현행 규칙 49~62행에 랭킹 read 분기 반영 완료). 2026-07-14부터 규칙 수정은 **라운드 20 T108·T109 범위 안에서만** 허용, 로컬 수정까지만 하고 배포는 Claude 담당.
- Firebase는 compat(v8 스타일) API만 쓴다. `import { doc, getDoc }` 같은 modular API를 섞지 마라.
- 커밋은 로컬에서 진행한다. push·배포는 기본적으로 사용자 확인을 기다리되, 사용자가 현재 작업에서 명시적으로 요청하면 Codex가 직접 실행하고 공개 결과까지 확인한다.

---

## 🧭 Claude 결정 회신 — T125e-2c/d·T125e-3·isPlatformAdmin P1 (2026-07-16, 사용자 확정 반영)

### T125e-2d. 교회 삭제 = **복원 가능한 비활성화** (Codex 제안 채택)

Codex의 5개 질문에 대한 확정 답:
1. **비활성화만 지원, purge 없음.** 최종 삭제(purge) 정책은 별도 결정 전까지 만들지 않는다.
2. **비활성 대상**: 교회 문서·legacy/public 디렉토리 즉시 원자 비활성화(검색·가입 차단). 기존 **주 소속 users만** action generation 표식으로 재개 가능한 batch soft-delete. **개인/외부 roster 문서는 삭제·soft-delete하지 않고 보존**한다 — 비활성 공동체의 보상 적립·구매·설정 변경은 서버 action이 거부하므로 활동은 자연 차단된다. 개인 계정의 primaryOrgId가 비활성 교회를 가리키면 로그인은 유지하되 기준 공동체 전환 안내를 표시한다.
3. **정산 주체 = 플랫폼 관리자, 자동 환불 금지.** 양수 roster 달란트와 pending 구매는 동결 보존하고, 플랫폼 관리자 읽기 전용 정산 조회(공동체별 잔액 합계·pending 목록)만 제공한다. 실물 정산은 오프라인 처리.
4. **비활성화 이전에 이미 개별 삭제된 users는 복원 대상에서 제외** — generation 표식으로 구분 (Codex 제안 그대로).
5. **보존 기간 무기한.** Auth·private access·구매·감사 원장 삭제 금지. 플랫폼 관리자 정산 조회는 비활성화 후에도 계속 가능.

### T125e-2c. 교회 이름 변경 = **점진 보정**

- 서버 action이 `churches.name` + legacy/public 디렉토리 + 불변 rename 원장을 한 transaction으로 변경한다.
- 기존 users/roster의 `churchName` snapshot은 일괄 fanout하지 않는다. **로그인 시 보정** — 기존 로그인 감사 경로(`normalizeLegacyReadingPosition`류)에 편입하거나 로그인 후 1회 비교·갱신. 표시 로직은 가능하면 ID 기반 최신 조회를 우선한다.
- 일시적으로 옛 이름이 보이는 것은 허용된 트레이드오프다 (사용자 확정).

### T125e-3. `platformStats` 필드 의미 확정

- **`total_readers` = 현재 비삭제 users 수** (게스트·익명 제외). 서버 가입 action이 증가, soft-delete action이 감소. rebuild = 비삭제 users count.
- **`total_churches` = 현재 활성(비삭제·비활성 제외) 교회 수**, 무소속 가상 교회(`unaffiliated_v1`) 제외. 생성 action 증가, 비활성화 action 감소. rebuild = 조건 count.
- **`readers_today` = 서버 KST 자정 기준 당일 첫 읽기 완료 고유 인원** (현행 completeRead 동작 유지, 게스트 제외).
- **`finished_total` = 완독 이벤트 누적 합계** (readCount 증가 1회 = +1). rebuild = 비삭제 users의 `max(readCount−1, 0)` 합. 랜딩 라벨이 "올해 완독자"라면 연도 한정이 아니므로 **"누적 완독"으로 라벨을 고친다** (연도별 통계는 별도 결정 전 만들지 않는다).
- 이 의미로 `rebuildPlatformStats({dryRun})`를 구현하고, dry-run 차이를 확인한 뒤에만 실제 덮어쓴다. 관리자 "통계 지금 갱신" 버튼은 이 서버 action 호출로 교체한다.

### isPlatformAdmin() P1 — 수정 허용 (범위 한정)

- T112b 감사에서 발견한 "삭제된 관리자의 `isPlatformAdmin()` 권한 잔존"은 **helper에 `isDeleted != true` 결속을 추가하는 방식으로 Codex가 수정해도 된다.** 이는 helper 수정이지 `users` read 규칙 구조 변경이 아니다 — read 규칙 자체(조건 분기·대상 범위)는 계속 건드리지 말 것. `isSuperAdmin`·`isChurchAdmin`도 같은 결속을 검토하되, get() 호출 수 증가로 인한 규칙 비용은 기존 myData() 패턴 재사용으로 억제한다. T127 rules 배포분에 포함한다.

---

## 🔁 라운드 27 — 읽기 일정 결측 3건 (2026-07-16 사용자 승인, Claude 설계)

> 배경: 퀴즈 인덱스 생성(T123d1)에서 발견된 일정 결측을 2026-07-16 전수 스캔으로 확정했다. 66권 전장 커버리지 기준 아래 3건 외 결측 없음.
> 사용자 결정: **T128a·T128b는 즉시 진행, T128c는 본문 텍스트(M-S1) 준비 후.**

**확정된 사실 (재조사 불필요):**
- `src/data/read_schedules.json`의 `whole_bible`은 1년일독 4플랜(sequential/revised/new/saehangul), `new_testament`는 신약 4플랜이 공유한다 (`src/data/schedules.js:3-13`).
- 본문 캐시 `verses/{planType}_{version}_{day}`는 **Day 번호 키**다 — range 텍스트만 바꾸면 본문과 어긋난다. 캐시 재생성 도구는 리포에 없다 (노션 동기화 삭제됨).
- 일정은 정확히 365개 하드 제약 (`generate-quiz-answer-index.mjs`가 throw). 일정 변경 시 `node scripts/generate-quiz-answer-index.mjs` 재생성 필수 (validate가 byte-for-byte 검사). **인덱스 재생성은 `platform-api/quiz-answer-index.json`을 바꾸므로 Edge 재배포가 필요하다.**
- 결측: ① whole_bible Day 337(`렘 29:24-32`)→338(`렘 33-36장`) 사이 **렘 30~32장 누락** (고아 문항 `jeremiah-30-88`~`32-96` 9개) ② new_testament Day 135(`행 10:24-48`)→136(`행 12장`) 사이 **행 11장 누락** (`acts-11-235~239` 5문항이 nt에서 고아, whole은 Day 169로 정상) ③ whole_bible Day 363 `"요일 3-5장, 요이, 요삼"`이 장 번호 없는 표기라 `quizParsing.js`가 미인식 (`2john/3john` 10문항 whole 고아 — **실제 독서 누락은 아님**).

- [ ] **T128a. 요이·요삼 표기 수정 (즉시, 무위험)** — `read_schedules.json` whole_bible Day 363의 range를 `"요일 3-5장, 요이 1장, 요삼 1장"`으로 변경. 독서 의미 불변이므로 verses 캐시 무관. `node scripts/generate-quiz-answer-index.mjs` 재생성 후 `2john-1-*`/`3john-1-*`의 `allowed.whole`에 363이 들어갔는지 확인. 전체 validate·build 통과로 완료.
- [ ] **T128b. 66권 전장 커버리지 검사 신설** — 신규 `scripts/validate-schedule-coverage.mjs`: `src/utils/quizParsing.js`와 같은 파서 계약으로 whole_bible은 66권 전체 장, new_testament는 신약 27권 전체 장이 최소 1개 Day의 range에 포함되는지 검증한다. **알려진 결측 2건(렘 30~32, 행 11)은 T128c 완료 전까지 사유 주석이 달린 명시적 allowlist로 예외 처리**해 검사 자체는 즉시 활성화한다. `npm run validate`에 포함. allowlist에 새 항목 추가는 금지(신규 결측은 실패해야 함).
- [ ] **T128c. 범위 확장 (M-S1 본문 준비 후 — 그 전 착수 금지)** —
  1. `read_schedules.json`: whole_bible Day 338 `렘 33-36장` → `렘 30-36장`, new_testament Day 136 `행 12장` → `행 11-12장`.
  2. **verses 캐시 주입 도구 신설**: 플랫폼 관리자 전용 서버 action 또는 서비스 계정 스크립트로, 대상 문서(1년일독 4버전 × Day 338, 신약 4버전 × Day 136 — easy 캐시 존재 여부는 실데이터로 확인)의 본문 텍스트를 **기존 본문 뒤가 아니라 새 range 순서에 맞게** 갱신한다. 기본 dry-run(대상 문서·길이만 출력, 본문 값 미출력), 실행 전 0600 로컬 백업, 실행 후 재감사.
  3. 인덱스 재생성 + T128b allowlist 제거 + 전체 validate·build.
  4. 배포 순서: Edge(인덱스 포함) → 웹. T127 관찰 기간과 겹치면 관찰 지표에 이 변경을 기록해 불일치 오탐을 막는다.

**사용자 수동 작업 — M-S1** (T128c 전제): 렘 30·31·32장, 행 11장의 본문 텍스트를 버전별(개역개정 등 실제 서비스 중인 버전)로 준비해 전달. 형식은 기존 verses 문서와 동일 (Codex가 T128c 착수 시 기존 Day 337/338 문서 형식을 먼저 확인해 필요한 형식을 사용자에게 안내할 것).
