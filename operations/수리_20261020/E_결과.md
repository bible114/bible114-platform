# 묶음 E 결과 (2026-10-20)

## 진행 상태: 일부 완료 (관리자 화면 완료, 7번 본문 검수 보류)

관리자 화면 관련 변경을 검증하고 E 소유 파일만 커밋했습니다.

- 19번: 설정 화면에서 과거 일정 안내 제거 — `src/components/churchAdmin/SettingsTab.jsx`
- 20번: 공지 표시를 끈 상태에서 사용자 안내 표시, 저장 결과를 화면 내 toast로 표시 — `src/components/churchAdmin/AnnouncementTab.jsx`, `src/components/ChurchAdminView.jsx`
- 21번: 달란트 상점에 첫 상품 등록·상점 켜기 안내 추가 — `src/components/churchAdmin/TalentShopTab.jsx`
- 하위 항목: 조직 탭의 중복 안내 제거, 저장 결과를 toast로 표시 — `src/components/churchAdmin/OrganizationTab.jsx`, `src/components/ChurchAdminView.jsx`

## 검증

- `npm run validate:talent-shop-ux` — 통과
- `npm run validate:org-editor` — 통과
- `npm run build` — 통과 (Browserslist 데이터 오래됨 및 번들 크기 경고는 출력됨)

## 본문 7번 조사 결과 및 미완료

현 실행환경에서 대한성서공회 본문 URL `https://bible.bskorea.or.kr/bible/RNKSV/MAT.2`를 조회했으나 HTTP 403으로 차단되었습니다. 따라서 후보 목록(신약 21권 319절)을 공식 원문과 대조해 확정하지 못했고, 구약 새번역·개역개정 비교 자료도 확인하지 못했습니다. 본문 JSON이나 생성 스크립트는 수정하지 않았고 Firestore 쓰기도 하지 않았습니다. 문맥 추정으로 구절을 고치지 않았습니다.

| 항목 | 이유 |
|---|---|
| 7번 후보 본문 대조·선별 수정·전후 목록·dry-run | 공식 원문 조회가 HTTP 403으로 실패해 정확한 수정 근거를 확보하지 못함. 구약/개역개정 비교 자료도 확인되지 않음. |

## 미완료 추가 항목

| 항목 | 이유 |
|---|---|
| 7번 본문 수정·dry-run | 위 사유로 안전한 본문 변경을 하지 않음. |

## 다음 재개 위치

1. 본문 데이터·생성/업로드 스크립트 위치를 확인하고 공백 손실 발생 경로를 추적한다.
2. 공식 새번역 원문을 사용할 수 있는 경로와 개역개정 비교 자료를 확보한 뒤, 후보 구절을 검수해 전/후 목록과 읽기 전용 dry-run을 만든다. Firestore 쓰기는 하지 않는다.
3. 관련 validate와 `npm run build`를 재확인한다.

## 커밋 및 검증

- 커밋: 관리자 화면 파일 4개와 이 결과 문서만 선별 포함.
- `npm run validate:talent-shop-ux` — 통과
- `npm run validate:org-editor` — 통과
- `npm run build` — 통과 (caniuse-lite 및 chunk 크기 경고 출력)
- `git diff --check` — 통과

배포 및 실사이트 DB 쓰기는 하지 않았습니다.
