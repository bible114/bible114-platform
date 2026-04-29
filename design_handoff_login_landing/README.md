# Handoff: 성경통독 114 — 첫 페이지 (로그인 / 랜딩)

## Overview
"성경통독 114"는 한국 교회들이 함께 성경을 통독하는 플랫폼입니다. 이 핸드오프는 **첫 페이지 = 로그인 / 랜딩 페이지**의 디자인 시안을 담고 있습니다. 로그인 페이지지만 단순한 인증 화면이 아니라, "한국 전국의 여러 교회와 성도가 같은 페이지를 함께 펼치고 있다"는 메시지를 강하게 전달하는 랜딩 역할을 동시에 수행합니다.

핵심 기능:
- 좌측: 플랫폼 전체 라이브 통계, 헤드라인 카피, 오늘의 본문, 실시간 독서 피드
- 우측: 로그인 카드 — **성도 / 교회 관리자** 두 역할이 명확히 분리됨

## About the Design Files
번들에 포함된 HTML/JSX 파일들은 **디자인 레퍼런스**입니다 — 의도한 룩앤필과 동작을 보여주는 프로토타입이며, 그대로 프로덕션에 복사해 넣을 코드가 아닙니다. 작업 목표는 이 디자인을 **대상 코드베이스의 기존 환경 (React / Next.js / Vue / 기타) 의 패턴과 라이브러리에 맞게 재구현**하는 것입니다. 환경이 아직 없다면 프로젝트에 가장 적합한 프레임워크를 선택해서 구현해 주세요.

기존 사이트(https://bible114.github.io/bible114-platform/)의 다른 페이지/컴포넌트와 일관성을 맞춰주세요.

## Fidelity
**High-fidelity (hifi)** — 색상, 타이포그래피, 간격, 인터랙션이 픽셀 레벨로 확정된 시안입니다. 코드베이스의 기존 컴포넌트 라이브러리를 사용해 픽셀에 가깝게 재현해 주세요.

## Screens / Views

### 1. Login / Landing (단일 화면)

- **Name**: 첫 페이지 (Login / Landing)
- **Purpose**:
  - 방문자에게 "함께 읽는 통독 플랫폼"임을 즉시 인지시킴
  - 성도 또는 교회 관리자로 로그인하는 진입점
  - 신규 교회 등록 / 신규 성도 합류 안내
- **Viewport**: 데스크톱 1440×900 기준으로 설계 (반응형 미구현)
- **Layout**: `display: grid; grid-template-columns: 1.15fr 1fr;` — 좌측이 살짝 더 넓음. 전체 화면 풀-블리드. 상단에 절대 위치된 64px nav.

#### Top Nav (좌우 공통, 절대 위치)
- 위치: `position: absolute; top: 0; left: 0; right: 0; height: 64px; padding: 0 56px`
- 좌: 로고 — 32×32 ink 사각형 (`#2b3a2a`, radius 7) 안에 명조 "114" + 로고 텍스트 "성경통독 114" (Noto Serif KR 17px / 600)
- 중: 네비 — `소개`, `참여 교회`, `읽는 방법`, `도움말` (13px, 색 muted, 활성은 ink + 황토 underline)
- 우: "교회 등록 신청 →" (12px, muted, 클릭 가능)

#### LEFT — Editorial Hero
패딩: `100px 56px 40px`. 콘텐츠는 위→아래 다음 순서로 쌓임.

1. **Eyebrow (라이브 카운터)**
   - 황토 펄스 점(7px) + "지금 **N,NNN명**이 함께 펼치는 중"
   - 12px / uppercase / letter-spacing 0.14em / muted; 숫자는 ink, tabular-nums
   - 숫자는 2.2초마다 ±1~3 출렁임 (단순 setInterval로 살아있는 느낌만)

2. **Headline (H1)** — Noto Serif KR / 600 / 56px / line-height 1.16 / letter-spacing -0.022em
   - 기본 카피: `혼자가 아니라,\n같이 펼칩니다.` (2줄, `\n`으로 줄바꿈)
   - "같이"라는 단어만 황토(`#b8702a`) 색

3. **Subhead (P)** — 15px / line-height 1.65 / muted (rgba(43,58,42,0.78)) / max-width 480px
   - `전국 247개 교회, 18,432명의 성도가 오늘도 같은 페이지를 넘기고 있습니다. 천로역정 같은 통독의 길, 함께 걸어요.`
   - "247개 교회"와 "18,432명"은 ink 색 + bold

4. **Stat strip** — 4컬럼 그리드, 상하 hairline border (`1px solid rgba(43,58,42,0.16)`), padding `18px 0`, 컬럼 사이 left border
   - 함께하는 교회 / 참여 성도 / 올해 완독자 / 오늘 읽은 장수
   - 숫자: Noto Serif KR 26px / 600 / tabular-nums
   - 라벨: 11px / muted / margin-top 5px

5. **오늘의 본문 카드** — `#fbf6ec` 배경, hairline 보더, radius 4px, padding 18px 22px, max-width 520px
   - 카드 위에 절대 위치된 작은 황토 북마크 탭 (top: -1, left: 22, w36 h12, radius 0 0 4 4)
   - 본문(P): Noto Serif KR / 16px / italic / 500 / line-height 1.65 / 색 rgba(43,58,42,0.85)
     - `"주의 말씀은 내 발에 등이요 내 길에 빛이니이다."`
   - 출처: 우측 정렬, Noto Serif KR 13px, muted: `— 시편 119:105`

6. **Live Feed (방금 펼친 성도들)**
   - 헤더: "방금 펼친 성도들" (11px / uppercase / 600 / muted) + 우측 "● 실시간" (3b6b4a 펄스)
   - 콘텐츠: 위→아래 무한 스크롤 (32초 1바퀴, 마지막에서 첫 항목으로 자연스럽게 이어지도록 LIVE_READERS 배열을 2번 이어붙여 `translateY 0% → -50%` 애니메이션)
   - 각 항목: 28px ink 아바타(이름 첫 글자, cream fg, 명조) + [이름(serif 14 bold) · 교회명(11 황토) · "N분 전"(11 muted, 우측 끝)] + "{책} {장} 펼침" (12 muted)
   - 하단 마스크: `mask-image: linear-gradient(180deg, #000 70%, transparent)` 로 페이드 아웃
   - `gap: 10px`

#### RIGHT — Login Card
패딩: `100px 56px 40px 28px`. `justify-content: center` 로 카드를 세로 중앙 배치.

**카드**:
- 배경 `#fbf7ee`, hairline 보더, radius 8px, padding `36px 38px`
- 그림자: `0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 60px -30px rgba(43,58,42,0.28)`

**카드 내부 순서**:

1. **헤더**: "로그인" (Noto Serif KR / 30px / 600 / letter-spacing -0.02em)

2. **역할 탭 (세그먼트 컨트롤)** — 2개 버튼 그리드, padding 4px, 트랙 배경 rgba(43,58,42,0.06), radius 10px
   - 옵션: **성도** (서브: "오늘의 본문 읽기") / **교회 관리자** (서브: "구역·진행률 관리")
   - 활성 탭: 배경 cream + subtle shadow, 비활성: transparent
   - 관리자 탭이 활성일 때 우측에 황토 "ADMIN" 배지 (9px / 700 / cream fg / radius 4)

3. **폼** — 활성 탭에 따라 분기:

##### 3a. Member (성도) Form
- **출석 교회 셀렉터** — cream 배경, hairline 보더, radius 8px, padding 12 14, 클릭 가능
  - 28px 이니셜 아바타 (ink bg / cream fg / 명조) + [교회명(14/600), "지역 · 성도 N명"(11/muted)] + "변경 ↓"
  - 라벨 위에: "출석 교회" (11/600/muted/letter-spacing 0.02em)
- **아이디/이메일 input** — placeholder `grace@church.kr`
- **비밀번호 input** — placeholder `••••••••` (letter-spacing 0.1em), 라벨 우측에 "잊으셨나요?" (11/muted/underline)
- 모든 input: cream bg, hairline 보더, radius 8, padding 12 14, font-size 14, sans
- **Submit 버튼**: 풀 너비, ink bg + cream fg, radius 999px (pill), padding 14 20, "오늘의 본문 펼치기 →" (14/600)

##### 3b. Admin (교회 관리자) Form
- **상단 안내 배너** — 황토 톤 배경 `rgba(184,112,42,0.08)` + 보더 `rgba(184,112,42,0.22)`, radius 8, padding 10 12
  - 18px 황토 원형 "!" 배지 + "**교회 관리자 전용**입니다. 구역 편성, 성도 관리, 통독 진행률 대시보드를 사용할 수 있어요." (12/ink/line-height 1.5)
- **교회 코드 input** — placeholder `예) GRACE-2026`, font: ui-monospace, letter-spacing 0.06em
- **관리자 이메일 input** — placeholder `admin@church.kr`
- **비밀번호 input** — Member와 동일
- **2FA 체크박스**: "이 기기 신뢰 (다음 로그인 시 2단계 인증 생략)" — accent-color: 황토
- **Submit 버튼**: 풀 너비, **황토 bg** + cream fg, pill, "관리자 대시보드 열기 →"
- 버튼 아래 11px 푸터: "교회 코드가 없으신가요? **교회 등록 신청**"(밑줄)

## Interactions & Behavior

- **역할 탭 전환**: useState (`'member' | 'admin'`), 클릭 시 전체 폼 교체. 트랜지션은 단순 swap (필요 시 200ms fade 추가 가능)
- **라이브 카운터**: `setInterval` 2200ms, 값 ±1~3 변동, 1100 미만으로 떨어지지 않도록 clamp. 숫자가 바뀔 때 `key={count}` 로 fade-up(0.4s) 재생
- **라이브 피드 자동 스크롤**: CSS keyframe `scrollFeed` (translateY 0 → -50%, 32초, linear, 무한). 리스트는 동일 항목 2번 이어붙여 seamless
- **펄스 점**: `pulseRing` keyframe — 동심원이 scale(1) → scale(2.6), opacity 0.55 → 0, 1.8초 무한
- **호버**: nav 링크, "변경 ↓", "잊으셨나요?", 푸터 링크는 cursor pointer + 호버 시 underline 강조 (현재 미구현, 구현 시 0.05초 ease)
- **로그인 동작**: 현재 디자인에는 검증 로직 없음. 실제 구현 시 표준 폼 검증 + 서버 인증 추가
  - 성공 시: 성도는 "오늘의 본문" 페이지, 관리자는 "관리자 대시보드"로 라우팅
- **반응형**: 데스크톱 1440 기준만 설계됨. 태블릿(2단→1단), 모바일은 별도 시안 필요

## State Management

```
loginRole: 'member' | 'admin'           // 역할 탭
readingNow: number                      // 라이브 카운터, 2.2초마다 출렁임

// 로그인 폼 (실제 구현 시 추가)
selectedChurchId: string | null         // 성도용 출석 교회
memberEmail, memberPassword: string
churchCode, adminEmail, adminPassword: string
trustDevice: boolean                    // 관리자 2FA 체크박스
isSubmitting: boolean
errors: { [field: string]: string }
```

## Design Tokens

### Colors
| 토큰 | 값 | 용도 |
|---|---|---|
| `bg.cream` | `#f5efe4` | 페이지 메인 배경 |
| `bg.cream-card` | `#fbf6ec` / `#fbf7ee` | 본문 카드, 로그인 카드 배경 (살짝 더 밝음) |
| `text.ink` | `#2b3a2a` | 메인 텍스트, 로고, ink 버튼 |
| `text.muted` | `rgba(43,58,42,0.55)` | 서브 텍스트, 라벨 |
| `text.body` | `rgba(43,58,42,0.78)` | 본문 단락 |
| `accent.warm` | `#b8702a` | 황토 — 강조 단어, ADMIN 버튼/배지, 북마크 탭 |
| `border.hairline` | `rgba(43,58,42,0.16)` | 모든 hairline 보더 |
| `pulse.green` | `#3b6b4a` | "실시간" 펄스 점 |

### Typography
- **Headline serif**: `Noto Serif KR` (폴백: `Nanum Myeongjo`, Georgia)
- **Body sans**: `Pretendard` (폴백: `Apple SD Gothic Neo`, `Noto Sans KR`)
- **Mono (교회 코드)**: `ui-monospace, SFMono-Regular, monospace`
- 스케일:
  - H1 (Headline): 56 / 600 / lh 1.16 / ls -0.022em — serif
  - 카드 헤더 "로그인": 30 / 600 / ls -0.02em — serif
  - Stat 숫자: 26 / 600 / tabular-nums — serif
  - 본문 인용: 16 / 500 / italic / lh 1.65 — serif
  - 출처 (— 시편…): 13 — serif
  - 단락: 15 / lh 1.65 — sans
  - 라벨/eyebrow: 11 / 600 / uppercase / ls 0.06–0.14em — sans
  - 인풋: 14 — sans
  - 캡션/메타: 11–12 — sans

### Spacing / Radius / Shadow
- 페이지 좌우 패딩: 56px
- 섹션 간 수직 간격: 18–28px (상황별 조정)
- input/카드 패딩: 12–14 / 36–38
- Radius: 4 (북마크 카드), 8 (input, 작은 카드, 안내 배너), 10 (세그먼트 트랙), 999 (pill 버튼)
- 카드 그림자: `0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 60px -30px rgba(43,58,42,0.28)`
- ink 버튼 그림자: 없음 (flat)

### Animation Keyframes
```css
@keyframes pulseRing {
  0%   { transform: scale(1);   opacity: .55 }
  100% { transform: scale(2.6); opacity: 0 }
}
@keyframes scrollFeed {
  0%   { transform: translateY(0) }
  100% { transform: translateY(-50%) }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px) }
  to   { opacity: 1; transform: none }
}
```

## Mock Data
실제 데이터 연동 전까지의 placeholder. `hero-shared.jsx` 참고:

- `PLATFORM`: total_churches 247, total_readers 18432, reading_now 1284, finished_today 4920, finished_total 6128, current_streak_days 412, chapters_read_today 31204
- `TODAY_PASSAGE`: ref "시편 119:105", preview "주의 말씀은 내 발에 등이요 내 길에 빛이니이다.", minutes 4
- `LIVE_READERS`: 8명 — 이름, 교회명, "{책} {장}", "N분 전"
- `RECENT_CHURCHES`, `RECENT_FINISHERS`: 보조 데이터

실제 구현 시 백엔드에서 제공할 엔드포인트(예시):
- `GET /api/platform/stats` → PLATFORM 통계
- `GET /api/today/passage` → 오늘의 본문
- `GET /api/live/readers?limit=20` → 실시간 피드 (WebSocket 또는 폴링)

## Assets
- 로고는 텍스트 기반 ("114" + "성경통독 114") — 별도 이미지 없음. 추후 SVG 로고 마크 도입 시 32×32 / radius 7 / ink bg + cream fg 자리에 교체
- 아이콘 없음 — 펄스 점, 화살표(→), 체크박스만 사용

## Files (이 번들에 포함)
- `성경통독 첫페이지.html` — 메인 엔트리. React + Babel CDN으로 hero-a.jsx 마운트
- `hero-a.jsx` — 좌측 hero + 우측 로그인 카드 컴포넌트 (HeroA, MemberLoginForm, AdminLoginForm)
- `hero-shared.jsx` — 공통 mock 데이터 + ProgressBar / Avatar / Pulse 프리미티브 + keyframes 인젝터
- `design-canvas.jsx`, `tweaks-panel.jsx` — 시안을 캔버스에 띄우고 색/카피를 토글하기 위한 디자인 도구. **프로덕션 구현 시 무시해도 됩니다.**

## 구현 시 권장 순서
1. 디자인 토큰을 코드베이스의 theme/tokens 파일에 등록
2. `Pulse`, `Avatar`, `ProgressBar` 같은 프리미티브 먼저 추출
3. 좌측 영역 정적 마크업 (라이브 카운터/피드는 mock 데이터로 시작)
4. 우측 로그인 카드 + 역할 탭 + 두 폼 분기
5. 실제 API 연결, 폼 검증, 라우팅
6. 모바일/태블릿 반응형 별도 시안 받아 구현
