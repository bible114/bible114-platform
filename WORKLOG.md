# 작업 일지

> 이 문서는 Claude(Opus 4.7)가 수정한 내역을 날짜별로 기록합니다.
> 문제가 생기면 아래 "되돌리는 법" 섹션을 보고 git으로 복구하세요.

---

## 2026-05-01 — 멀티 교회 신 포맷(`{id, name}`) 호환 버그 수정

### 배경

REFACTOR_PLAN.md Step 0~7 완료 후, 신규 교회가 가입하는 흐름에서
`subgroups: [{ id: "sub_xxx", name: "1구역" }]` 객체 포맷이 도입됨.
그러나 여러 컴포넌트/유틸이 여전히 subgroups를 **문자열 배열**로 가정해서
신 포맷 교회에서 통계/관리/소그룹 변경/순위 표시가 깨지는 상황.
레거시(기존) 교회는 문자열 그대로라 영향 없음.

### 발견·수정한 버그 (총 10건)

| # | 위치 | 증상 | 수정 |
|---|---|---|---|
| 1 | `src/App.jsx:143` 인증 useEffect | 페이지 새로고침 시 churchAdmin이 `departmentId/subgroupId` 없다고 `plan_type_select`로 강제 이동 | `role === 'churchAdmin'` 분기 추가, 바로 dashboard로 |
| 2 | `src/utils/statsUtils.js:4` `calculateSubgroupStats` | 신 포맷에서 `subgroupName`에 `{id,name}` 객체가 통째로 들어가 멤버 매칭이 항상 실패 | `getSubId/getSubName` 헬퍼 도입, 키는 id 기준, 매칭은 id 또는 name 둘 다 |
| 3 | `src/components/ChurchAdminView.jsx:170` `saveOrg` | `s.trim()`을 객체에 호출 → TypeError → "조직 저장" 버튼이 신 포맷에서 동작 안 함 | `getSubName(s).trim()` + id 보존(없으면 새로 발급) |
| 4 | `src/components/ChurchAdminView.jsx:191` `subgroupGroups` | `${comm.id}__${sub}` 인터폴레이션 시 객체가 `[object Object]` | `getSubId/getSubName` 적용, 멤버 필터에 id/name 둘 다 매칭 |
| 5 | `src/components/ChurchAdminView.jsx:257` 소그룹 변경 드롭다운 | `<option key={s} value={s}>{s}</option>`에서 `s`가 객체 → `[object Object]` | id를 value로, name을 표시로 |
| 6 | `src/hooks/useBibleContent.js:200~214` `fetchNotionData` | `cacheKey` 가 try 블록 스코프라 두 번째 try(localStorage 저장)에서 ReferenceError, 침묵 catch에 묻힘 | `cacheKey` 선언을 try 밖으로 끌어올림 |
| 7 | `src/components/modals/SubgroupChangeModal.jsx` | 하드코딩된 `DEFAULT_DEPARTMENTS`만 보여줌 + 매칭이 신 포맷 미지원 | `churchCommunities` prop 받아 실제 교회 데이터 사용, id/name 둘 다 매칭 |
| 8 | `src/components/modals/RankingModal.jsx` | 필터 바 하드코딩 + `g.name === subgroupId` + `m.subgroupId === selectedSubgroupDetail`(이름과 id 비교) | `churchCommunities` 사용, 부서 필터 id 기준, `selectedSubgroupDetail`을 `{id, name}` 객체로 전환 (레거시 문자열 fallback 유지) |
| 9 | `src/components/dashboard/SubgroupRankingCard.jsx:28` & `DashboardHeader.jsx:97` | "(우리팀)" 표시가 이름 비교만 함 → 신 포맷에서 강조 안 보임 | `subgroupId` 비교도 추가 |
| 10 | `ChurchAdminView` 멤버 행 + 조직 미리보기 | `m.subgroupId` 노출 시 내부 ID(`sub_xyz`) 그대로 표시, 미리보기에서 객체로 빈 칩 | `subgroupName` 우선 표시, 없으면 orgComms에서 lookup |

### 변경된 파일 (총 10개)

```
src/App.jsx
src/utils/statsUtils.js
src/components/ChurchAdminView.jsx
src/hooks/useBibleContent.js
src/hooks/useDepartment.js                      (주석 보강만)
src/components/modals/SubgroupChangeModal.jsx
src/components/modals/RankingModal.jsx
src/components/dashboard/SubgroupRankingCard.jsx
src/components/dashboard/DashboardHeader.jsx
src/components/DashboardView.jsx                (churchCommunities prop 전달)
```

### 호환성 정책

- 레거시 string subgroup(`"1구역"`)과 신 포맷 객체(`{id,name}`) 모두 지원
- 통계 키와 저장은 **id 기준**으로 정규화 (단, id 없으면 name으로 fallback)
- 표시는 항상 **사람이 읽는 name**

### 검증 상태

- 직접 변경한 10개 파일 `@babel/parser` 문법 통과 확인
- **빌드/실행 검증 미완료**: `node_modules/.bin/vite`가 0바이트로 깨진 심볼릭
  링크였음 (Google Drive 동기화 부작용). `node_modules` 삭제 후
  `npm install` 진행 중. Google Drive 위에서는 너무 느려서 `/tmp/bible114-build`로
  소스 복사 후 그쪽에서 빌드 시도 중.

### 수동 검증 체크리스트 (사장님이 확인하실 항목)

1. **교회 관리자 새로고침**: 관리자 계정으로 로그인 후 F5 → 대시보드 그대로 유지(통독 플랜 선택으로 안 튕김)
2. **교회 등록 흐름**: 신규 교회 가입 → 조직 구성에서 부서/소그룹 입력 후 "교회 만들기 완료" → 에러 없이 가입 완료
3. **관리자 조직 저장**: ChurchAdmin → 조직 관리 탭에서 "조직 저장하기" 클릭 → 정상 저장 (이전엔 신 포맷에서 TypeError)
4. **소그룹 표시**: ChurchAdmin → 교인 관리, 소그룹 칸에 `sub_xxx` 같은 내부 ID가 아니라 한글 이름("1구역" 등) 표시
5. **소그룹 변경 모달**: 사용자 대시보드에서 소그룹 변경 → 자기 교회의 부서/소그룹이 보이는지 (이전엔 하드코딩된 5부서만)
6. **소그룹 누적 랭킹**: 자기 소그룹에 "(우리팀)" 강조 표시되는지

### 되돌리는 법

전부 한 번에 되돌리기:

```bash
git diff main -- src/App.jsx src/utils/statsUtils.js src/components/ChurchAdminView.jsx \
  src/hooks/useBibleContent.js src/hooks/useDepartment.js \
  src/components/modals/SubgroupChangeModal.jsx src/components/modals/RankingModal.jsx \
  src/components/dashboard/SubgroupRankingCard.jsx src/components/dashboard/DashboardHeader.jsx \
  src/components/DashboardView.jsx
# 변경이 마음에 안 들면:
git checkout -- src/App.jsx src/utils/statsUtils.js src/components/ChurchAdminView.jsx \
  src/hooks/useBibleContent.js src/hooks/useDepartment.js \
  src/components/modals/SubgroupChangeModal.jsx src/components/modals/RankingModal.jsx \
  src/components/dashboard/SubgroupRankingCard.jsx src/components/dashboard/DashboardHeader.jsx \
  src/components/DashboardView.jsx
```

특정 파일만 되돌리려면 그 파일 경로만 남겨서 `git checkout --` 하시면 됩니다.

### 후속 작업 메모

- `getMonthlyContest` (`statsUtils.js:142`)는 dead code (import만 되고 호출 안 됨). 정리 권장.
- `useDepartment.changeSubgroup`과 `useUserBibleActions.handleRead`에서
  `calculateSubgroupStats(allMembers)`를 communities 인자 없이 호출하는데,
  Effect 3가 곧 communities로 다시 계산하므로 transient 문제. 깔끔히 하려면
  hook 시그니처에 communities 추가.
- `users.password` 평문 저장은 사장님 결정으로 유지 중 (어르신 지원).
  보안 컴플라이언스 필요해지면 재검토.
