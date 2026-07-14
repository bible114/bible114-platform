# bible114-platform 에이전트 안내

## "작업 이어서 해줘"라는 지시를 받으면

1. 저장소 루트의 **`HANDOFF_CODEX.md`** 를 열어라.
2. 그 문서의 "작업 프로토콜" 절차를 그대로 따라라 — 체크리스트에서 완료되지 않은 첫 작업부터 순서대로 진행하고, 작업 로그와 인수인계 메모를 갱신한다.
3. 문서에 없는 판단이 필요하면 임의로 결정하지 말고 "Codex → Claude 메모" 섹션에 질문을 남기고 다음 독립 작업으로 넘어가라.

## 프로젝트 기본 정보

- 스택: React 18 + Vite + Tailwind, Firebase(compat SDK — `db.collection(...)` v8 스타일 API 사용, modular API 쓰지 말 것), gh-pages 배포(www.bible114.net).
- 빌드 확인: `npm run build`. 로컬 실행: `npm run dev`.
- **기본 금지, 사용자 명시 지시 시 허용**: 평소에는 `firebase deploy`, `npm run deploy`, git push를 실행하지 않는다. 사용자가 현재 작업에서 배포·push를 명시적으로 지시하면 Codex가 검증 후 직접 실행하고 실제 공개 결과까지 확인한다.
- `users` 문서의 평문 `password` 필드는 의도된 설계다(어르신 지원 — 관리자가 비밀번호를 조회해 알려주는 용도). 보안 개선이라며 제거하지 말 것.
- firestore.rules의 `users` read 규칙은 별도 세션에서 다루는 중이므로 이 저장소 작업에서 수정하지 말 것 (HANDOFF_CODEX.md 참고).
