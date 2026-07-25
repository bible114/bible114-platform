# T132 직접 writer 최종 판정

기준 시각: 2026-07-25 KST

## 결론

- T127 기준 후보 30건을 전부 확인했다.
- legacy `users.score/talent/talentMigrated` 브라우저 이관 writer 1건은 운영 23개 문서 백필 뒤 제거했다.
- 재감사 결과는 29건이다: users 16, roster 7, churchDirectory 3, dailyVideos 2, videoAutoConfig 1.
- 보호 필드(점수, 달란트, 진도, 구매 원장, 공개 디렉토리, 플랫폼 통계)는 Firestore 브라우저 직접 쓰기를 차단했다.
- 남은 직접 writer는 본인 설정, 소속 관리, 운영자 수동 관리처럼 의도적으로 유지한 범위이며 필드 allowlist와 역할 검증을 적용한다.

## 후보별 판정

| 대상 | 기준 후보 | 최종 후보 | 판정 | 근거 |
|---|---:|---:|---|---|
| users | 17 | 16 | 1 제거, 16 의도적 유지 | legacy 달란트 이관 writer 제거. 본인 plan/dayOffset, primary 공동체 변경, 관리자 소속·삭제·복원, 플랫폼 운영 도구는 제한된 규칙 아래 유지 |
| roster | 7 | 7 | 의도적 유지 | 탈퇴·제명·소속 변경은 최신 잔액/primary 보호 및 관리자 allowlist를 적용. score/talent/currentDay/streak/readCount/lastReadDate는 exact freeze |
| churchDirectory | 3 | 3 | 코드 호환용 유지, 운영 쓰기 차단 | 공개 디렉토리 전환 뒤 브라우저 write는 rules에서 차단. 실제 재생성은 서버 action만 수행 |
| platformStats | 0 | 0 | 서버 전용 | 공개 read만 허용하고 write는 전부 차단. 재계산은 서버 action |
| dailyVideos | 2 | 2 | 플랫폼 관리자 전용 유지 | 일반 로그인 사용자의 lazy create 제거. 수동 등록·삭제는 삭제되지 않은 platformAdmin만 가능 |
| videoAutoConfig | 1 | 1 | 플랫폼 관리자 전용 유지 | 일반 로그인 read 차단. legacy `apiKey` 필드는 삭제하고 재생목록·enabled 설정만 관리자에게 허용 |
| talentPurchases | 0 | 0 | 서버 전용 | create/update/delete 모두 rules에서 차단. 판매·수령·환불은 멱등 ledger를 검증하는 서버 action만 사용 |

## users 16건 상세 분류

- 본인 설정 6건: 계획 선택, 시작일 보정(dayOffset), 기본 공동체 선택. 보호 필드와 역할·소속 필드는 변경 불가.
- 공동체 관리자 5건: 삭제·복원, 추가 소속, 부서·소그룹 배정. 허용 필드만 변경 가능.
- 플랫폼 운영 3건: 전체 사용자 편집, 운영용 seed/cleanup, 달란트 초기화. 삭제된 플랫폼 관리자는 권한을 가질 수 없고 운영 화면의 확인 절차를 거친다.
- 회원 상태 동기화 2건: 사용자/roster 동시 변경 경로. 서버 원장 필드는 Firestore rules가 동결한다.

## 운영 데이터 감사

- users 59개, active 58개, deleted 1개.
- legacy talent 미이관 23개를 updateTime precondition으로 백필했다.
- 백필 후 `talentMigrated` 누락/false 0, 비정상 roster progress 0, 잘못된 개인 지갑 0.
- 공개 교회 문서와 directory의 code/codeHash 필드 0, private access hash 8개는 모두 유효.
- RNKSV 365/365일 문서와 절 구조를 별도 감사에서 확인했다.

## 잔여 운영 주의

- 소셜 전환 대상 52명 중 연결 완료 5명, 미연결 47명이다. 서비스 기능 오류는 아니지만 2026-08-01 소셜 전환 전에 안내·연결이 필요하다.
- T124d 실제 공동체 관리자 판매·수령·환불 UI 스모크는 승인된 일회용 공동체와 실제 관리자 로그인이 있어야 한다. 서버 action·규칙 계약 검사는 통과했지만 임의 운영 계정으로 실행하지 않는다.
- 기존 YouTube 키는 다른 Google Cloud 프로젝트 소유라 조회·폐기 권한이 없다. 새 YouTube 전용 키 생성, Supabase secret 교체, Firestore legacy 필드 삭제는 완료했으며 구 키 소유 프로젝트에서의 폐기만 별도 권한이 필요하다.
