# 묶음 B2 — 비밀번호·옛 로그인 제거 (부분 진행)

2026-10-20

## 완료된 수정

- `firestore.rules`: users/{uid}/private/{privateId} 브라우저 읽기·쓰기를 모두 거부하도록 변경. 비밀번호/전화번호 자격증명 원문을 private/auth에 만들거나 이관하는 규칙과 플랫폼 관리자의 parent password 정리 예외도 제거.
- users 본문서의 자체 변경 허용 목록에서 `password`, `phone4`를 제외하고 auth provider 허용값에서 `password`를 제거.
- 변경 파일: `firestore.rules` (다른 묶음 파일은 수정하지 않음).

## 검사 결과

| 명령 | 결과 |
|---|---|
| `git diff --check` | 통과 |
| `npm run build` | 통과 |
| `npm run test:firestore-rules-safety` | 미실행 완료 — Firebase CLI refresh credential이 만료되어 `Authentication Error: Your credentials are no longer valid. Please run firebase login --reauth`로 시작 단계에서 종료. 인증 창은 자동으로 열지 않음. |

## 못한 것

| 항목 | 이유 |
|---|---|
| `src/utils/memberCredentials.js`의 password 저장·조회·이관 제거 | 아직 수정하지 않음 |
| `src/hooks/useAuth.js`의 이메일/비밀번호 회원·개인·관리자 가입/로그인 및 레거시 소셜 복구 제거 | 아직 수정하지 않음 |
| `LoginView`의 기존 성도 이름+비밀번호 진입을 소셜 시작 후 관리자에게 기록 연결 요청 안내로 대체 | 요리사4 C4와 파일 경합 가능성 검토 필요; 미수정 |
| `ChurchAdminView.jsx`, `churchAdmin/MembersTab.jsx`의 비밀번호 확인·초기화 UI/동작 제거 | 아직 수정하지 않음 |
| `supabase/functions/admin-set-password` 클라이언트 사용처 제거 및 함수 배포 삭제 안내 | 아직 수정하지 않음 |
| `scripts/purge-plaintext-passwords.mjs` dry-run 작성 및 count-only 확인 | 아직 작성하지 않음 |
| 관련 validate 및 전체 빌드 외 검증·커밋 | 규칙 안전성 게이트에서 Firebase 인증 재인가 필요. 코드 범위도 미완료. |

## 재개 지점

저장소 `/Users/jaeam/b114`, 갈래 `fix/live-audit-20261020`. 먼저 Firebase CLI 자격증명을 사용자가 재인증한 뒤 `npm run test:firestore-rules-safety`를 재실행한다. 그 다음 useAuth 및 회원자격증명 유틸의 모든 잔존 이메일/비밀번호·평문 저장 경로를 제거하고 관리자 초기화 UI/서버 함수 사용처, LoginView 안내, count-only dry-run 스크립트를 처리한다. LoginView 수정은 C4 완료 후 충돌을 재확인한다. 배포·실DB 쓰기·로그인은 하지 않는다.

## 관리자 비밀번호 화면 제거 (2026-10-20)

- 수정: `src/components/ChurchAdminView.jsx` — 비밀번호 조회 import/state/함수, 임시 비밀번호 생성·초기화 처리, 교인 상세의 비밀번호 영역과 초기화 버튼 제거. 인쇄용 안내의 비밀번호 재설정 문구도 카카오·구글 로그인 후 관리자에게 기록 연결을 요청하는 안내로 교체.
- 수정: `src/components/churchAdmin/MembersTab.jsx` — 일괄 비밀번호 초기화 버튼 및 비밀번호 복구 경고 제거.
- 확인: 두 파일에서 `fetchMemberCredentials`, `admin-set-password`, 비밀번호 조회·초기화 관련 참조 없음. `npm run build` 통과. `git diff --check` 실행 예정.
- 커밋: 빌드·diff 검사 후 이 작업 파일만 별도 커밋으로 기록.
