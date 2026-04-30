# bible114-platform — 리팩터 + 디자인 적용 플랜

> 작성일: 2026-04-29
> 목적: `design_handoff_login_landing/`의 새 디자인을 적용하기 전,
> 멀티 교회 구조 도입으로 어수선해진 코드를 정리한다.
> Sonnet이 이 문서 하나로 작업을 이어갈 수 있도록 자기충족적으로 작성.

---

## 0. 컨텍스트 (작업자가 알아야 할 것)

- **이 프로젝트는 멀티 교회 성경 통독 플랫폼** (https://bible114.github.io/bible114-platform/)
- **현재 Firestore 데이터 모델은 이미 멀티 교회 지원 중**
  - `churches/{churchId}` — 교회별 문서 (`name`, `churchCode`, `adminUid`, `adminEmail`, `communities[]`)
  - `churches/{churchId}/settings/{announcement|kakao}` — 교회별 설정
  - `users/{uid}` — `role` ('member'|'churchAdmin'), `churchId`, `churchName`, `communityId`, `subgroupId`, `name`, `birthdate`, `password(평문)`, `planId` 등
- **레거시 단일 교회 코드가 일부 남아 공존 중** (`MOCK_COMMUNITIES`, `community` 네이밍, `admin/08283` 슈퍼관리자 등)
- **2026-04-29 시점, 부모 repo에 미커밋 변경 20개 파일** + 신규 파일 (`ChurchAdminView.jsx`, `OrgEditor.jsx`)
- **새 디자인 시안**: `design_handoff_login_landing/` 폴더 (`성경통독 첫페이지.html`, `hero-a.jsx`, `README.md`) — 데스크톱 1440×900 따뜻한 서재 톤. 좌측 에디토리얼 히어로 + 우측 로그인 카드(성도/관리자 탭).

---

## 1. 왜 이 플랜을 만들었나 (학습 사항)

Claude가 처음에 워크트리(`pensive-ardinghelli-13d10d`) 안의 코드만 보고 "이 프로젝트는 단일 교회 전용"이라고 잘못 판단함. 원인:

1. 워크트리는 main의 "Initial commit" 시점에서 분기되어 미커밋 작업이 안 들어와 있음
2. 부모 repo의 `git status`를 먼저 안 찍었음
3. 레거시 `MOCK_COMMUNITIES` 네이밍에 속음

**규칙**: 워크트리에서 작업 시작 전 **반드시** 부모 repo `git status`로 미커밋 변경사항 파악할 것.

---

## 2. 현재 코드 진단

### 2.1 좋은 점
- 멀티 교회 데이터 모델 잡힘
- `LoginView`, `OrgEditor`, `ChurchAdminView` 등 컴포넌트 분리 시도 중
- Firestore 구조가 합리적

### 2.2 이슈 (큰 것 → 작은 것)

| # | 이슈 | 위치 | 영향 |
|---|---|---|---|
| 1 | 20개 파일 미커밋 | 부모 repo 전체 | 변경 추적 불가 |
| 2 | `community` 네이밍 혼재 (실제 의미는 "부서") | App.jsx, useCommunity.js, 전역 | 가독성 저하 |
| 3 | `MOCK_COMMUNITIES` 하드코딩 잔존 | `data/communities.js` | 진실의 원천 이중화 |
| 4 | App.jsx 865줄, 인증 핸들러 4개가 모두 거기 | App.jsx:322~470 | 단일 책임 깨짐 |
| 5 | 옛 `AdminView`(1022줄, `admin/08283`)와 새 `ChurchAdminView`(598줄)가 정리 안 됨 | components/ | 역할 모호 |
| 6 | **비밀번호 평문 저장** | users.password | 보안 사고 |
| 7 | **`churchCode` 평문** | churches.{id}.churchCode | 다른 교회 잠입 가능 |
| 8 | Firestore 보안 룰 미정 (정황상) | firestore.rules | 교차 교회 데이터 누출 |
| 9 | `subgroupId`가 사실상 이름 문자열 ("1구역") | 전역 | 부서명 변경 시 매칭 끊김 |
| 10 | 디자인 핸드오프는 데스크톱 전용, 현 LoginView는 모바일 퍼스트 | LoginView.jsx | 적용 시 충돌 |

---

## 3. 리팩터 단계 (Sonnet 작업 순서)

각 Step은 **독립 커밋**. 끝마다 `npm run build` + 라이브 사이트 동작 확인 후 다음 진행.

### Step 0. 베이스라인 확정 ⏱5분
- 부모 repo 미커밋 20개 파일을 의미 단위로 나눠 커밋:
  - 묶음 A: 멀티 교회 도입 (App, LoginView, useCommunity, AdminView, helpers, statsUtils 등 main 흐름 파일)
  - 묶음 B: 신규 파일 (ChurchAdminView.jsx, OrgEditor.jsx)
  - 묶음 C: 사소한 dashboard/modals 수정
- `main`에 푸시 → 워크트리 재분기
- **완료 조건**: `git status` 깨끗, gh-pages 배포 정상

### Step 1. 네이밍 통일 `community` → `department` ⏱1~2h
**왜 지금**: 디자인 적용 전 의미가 명확해야 새 컴포넌트 만들 때 혼란이 없음.

- 변수/필드 리네임:
  - `communityId` → `departmentId`
  - `communityName` → `departmentName`
  - `MOCK_COMMUNITIES` → `DEFAULT_DEPARTMENTS`
  - `useCommunity` → `useDepartment`
  - `churches.{id}.communities[]` → `churches.{id}.departments[]`
- 한국어 UI 라벨은 그대로 ("부서별 오늘 현황")
- Firestore 호환 레이어: 한 시즌 동안 양쪽 필드 다 읽기 / 새 필드로 쓰기
- **완료 조건**: 코드에서 `community` 사라짐(호환 레이어 제외), 라이브 사이트 동작 동일

### Step 2. 인증 로직 추출 → `hooks/useAuth.js` ⏱1~2h
- App.jsx의 다음 핸들러를 `hooks/useAuth.js`로 이동:
  - `handleMemberLogin`
  - `handleMemberSignup`
  - `handleChurchAdminLogin`
  - `handleChurchAdminSignup`
- 각 핸들러는 순수 함수 + `errorMsg` 반환 (App에서 setErrorMsg)
- **완료 조건**: App.jsx ≤ 700줄, LoginView가 useAuth 훅 사용

### Step 3. 관리자 뷰 정리 ⏱1h
- `AdminView.jsx` → `PlatformAdminView.jsx` 리네임 (슈퍼 관리자)
- `ChurchAdminView` 그대로 유지
- App.jsx 라우팅:
  - `role === 'platformAdmin'` → PlatformAdminView
  - `role === 'churchAdmin'` → ChurchAdminView
  - `role === 'member'` → DashboardView
- `admin/08283` 하드코딩 제거 → Firestore `users` 중 `role: 'platformAdmin'` 1개 만들고 정식 인증 사용
- **완료 조건**: 슈퍼/교회 관리자 진입 동작, 권한 분리 명확

### Step 4. 보안 ⏱2~3h **(반드시)**
- **`users.password` 평문 필드 제거**
  - Firebase Auth가 이미 인증 처리하므로 불필요
  - "관리자가 회원 비번 리셋" 기능 사용 중이면 → "임시 비번 발급" 방식으로 교체 (관리자가 비번 보지 않음)
- **`churchCode` 해싱**
  - `churches.{id}.churchCodeHash` (sha256) 저장
  - 검증 로직 변경: 입력값을 같은 방식으로 해시해서 비교
  - 즉시 어려우면 최소한 Firestore 룰로 read 차단
- **Firestore 보안 룰 작성** (`firestore.rules` 신규/수정):
  - `users/{uid}` read: 본인 OR 같은 churchId의 churchAdmin OR platformAdmin
  - `churches/{id}` read: 인증 사용자(가입 화면용), 단 `churchCode/Hash`는 응답 제외
  - `churches/{id}/settings/*` write: 해당 교회 admin만
- **완료 조건**: 다른 교회 사용자 데이터 읽기 시도 거부, 평문 비번 0건

### Step 5. `subgroupId` ID/Name 분리 ⏱1h **(선택, 권장)**
- 현재: `subgroupId = '1구역'` (이름과 ID 동일)
- 변경: `{ id: 'sub_xxx', name: '1구역' }` — user엔 불변 ID만 저장, 표시명은 church 문서에서 lookup
- 마이그레이션 필요 (기존 user의 `subgroupId` 문자열 → id 매핑 후 `subgroupName` 별도 필드)
- 안 하면: 부서명 바꾸는 순간 기존 멤버 매칭 끊김

### Step 6. 디자인 토큰 + Tailwind 확장 ⏱30m
- `tailwind.config.js`에 토큰 등록:
  ```js
  colors: {
    cream: '#f5efe4',
    'cream-card': '#fbf6ec',
    ink: '#2b3a2a',
    accent: '#b8702a',
    hairline: 'rgba(43,58,42,0.16)',
    pulse: '#3b6b4a',
  },
  fontFamily: {
    serif: ['"Noto Serif KR"', '"Nanum Myeongjo"', 'Georgia', 'serif'],
    sans: ['Pretendard', '"Apple SD Gothic Neo"', 'system-ui', 'sans-serif'],
  },
  ```
- `index.html`에 폰트 CDN 추가:
  - Noto Serif KR (Google Fonts)
  - Pretendard (jsdelivr)
- `index.css`에 keyframes 추가:
  - `pulseRing` (1.8s, scale 1→2.6, opacity .55→0)
  - `scrollFeed` (32s, translateY 0→-50%)
  - `fadeUp` (.5s, opacity+translateY)

### Step 7. LoginView 디자인 적용 ⏱3~4h
**드디어 디자인 핸드오프 입힘.**

- 데스크톱 (`md:` 이상): 2단 그리드 (좌 1.15fr / 우 1fr) — 핸드오프 그대로
  - 좌: 라이브 카운터 / 헤드라인(serif 56px) / 서브헤드 / 4컬럼 stat strip / 오늘의 본문 카드 / 라이브 피드(자동 스크롤)
  - 우: 로그인 카드 (성도/관리자 세그먼트 컨트롤)
- 모바일 (`md:` 미만): 단일 컬럼, 히어로 축약 (헤드라인 + stat 한 줄 + 오늘 말씀 카드까지), 카드 하단 큰 비중
  - 현재 LoginView의 모바일 디자인 일부 살리되 톤만 새 디자인에 맞춤 (cream 배경, serif 헤드라인)
- 좌측 라이브 통계는 실제 데이터:
  - `total_churches`: `churches` 컬렉션 count
  - `total_readers`: `users` where role='member' count
  - `chapters_read_today`: 오늘 read events 합계 (없으면 mock으로 시작)
  - 라이브 피드: 최근 read events 또는 mock 시작
- 우측 폼은 **`useAuth` 훅 그대로** 연결
  - 성도 탭: `<select churches>` + 이름 + 생년월일 + 비번 (현재 흐름 유지, placeholder는 우리 데이터에 맞게)
  - 관리자 탭: 이메일 + 비번 (`handleChurchAdminLogin`)
- 회원가입은 디자인엔 없음 → 카드 하단에 "처음 오셨나요? 회원가입" 링크 → 별도 화면/모달
- 슈퍼관리자 진입은 nav 우측에 작게 숨김(현재처럼)
- **완료 조건**: 데스크톱 픽셀 근접, 모바일 깨지지 않음, 모든 인증 플로우 정상

---

## 4. 사장님 결정이 필요한 항목

작업 중 도달하면 멈추고 물어볼 것:

1. **Step 1 네이밍 통일을 할 것인가** (코드 가독성↑ vs 마이그레이션 비용)
2. **Step 4 `users.password` 제거 시, "관리자가 회원 비번 리셋" 기능을 어떻게 할 것인가** (관리자가 비번 보지 못하게 + 임시 비번 발급?)
3. **Step 5 `subgroupId` 구조 개선을 지금 할 것인가**
4. **Step 7 모바일 디자인은 유지인가, 별도 모바일 시안 받아올 것인가**

---

## 5. 진행 상태 추적

작업하면서 이 섹션 업데이트:

- [x] Step 0 — 베이스라인 확정 (2026-04-29, 커밋 4개: 419d542 / 055cc3c / 98b0e36 / 83fe725, 빌드 ✓)
- [x] Step 1 — 네이밍 통일 (community → department) (2026-04-29, 커밋 6baa658, 빌드 ✓)
- [x] Step 2 — useAuth 훅 추출 (2026-04-30, 빌드 ✓, App.jsx 865→717줄)
- [x] Step 3 — 관리자 뷰 정리 (2026-04-30, 빌드 ✓, role 기반 라우팅 완료)
- [ ] Step 4 — 보안 (비번 평문 제거, churchCode 해시, Firestore 룰) ← 사장님 결정 필요
- [ ] Step 5 — subgroupId ID/Name 분리 (선택) ← 사장님 결정 필요
- [ ] Step 6 — 디자인 토큰 / Tailwind 확장
- [ ] Step 7 — LoginView 디자인 적용 ← 사장님 결정 필요

---

## 6. 참고 자료

- 디자인 시안: `design_handoff_login_landing/README.md`, `hero-a.jsx`, `hero-shared.jsx`, `성경통독 첫페이지.html`
- 디자인 토큰 표 / 키프레임은 `design_handoff_login_landing/README.md` "Design Tokens" 섹션 참고
- 라이브 사이트: https://bible114.github.io/bible114-platform/
