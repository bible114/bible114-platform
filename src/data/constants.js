// 기본 텍스트 (창세기 1장 - 캐시/노션 로드 실패 시 기본값)
export const GENESIS_1 = `### 1. 태초에 하나님이 천지를 창조하시니라
2. 땅이 혼돈하고 공허하며 흑암이 깊음 위에 있고 하나님의 영은 수면 위에 운행하시니라
3. 하나님이 이르시되 빛이 있으라 하시니 빛이 있었고
4. 빛이 하나님이 보시기에 좋았더라 하나님이 빛과 어둠을 나누사
(중략)`;

export const TOTAL_DAYS = 365;
export const PANIC_DISTANCE = 5;
export const AUDIO_BASE_URL = "https://bible114.net/html/audio";
// 인쇄물(QR·링크 텍스트)에는 절대 localhost/개발 주소가 들어가면 안 되므로
// window.location.origin 대신 이 고정 주소를 사용한다.
export const SITE_URL = "https://www.bible114.net";
export const SUPABASE_FUNCTION_URL = "https://mvwhepqqzdtqtorgkrtf.supabase.co/functions/v1/notion-proxy";
// 카카오톡 채널 상담 URL (실제 채널 ID로 교체 필요)
export const KAKAO_CHANNEL_URL = "http://pf.kakao.com/_xdJrRX/chat";

// 무소속(개인) 성도 가상 교회 — 문서 ID를 클라이언트 상수로 고정한다.
// 입장코드 검증 스킵은 "이 상수와의 ID 일치"로만 판단한다.
export const UNAFFILIATED_CHURCH_ID = 'unaffiliated_v1';
// 표시명은 「성경 읽는 사람들」로 브랜딩 (2026-07-10 확정 — "소속 없음" 결핍 프레임 대신
// 이름 있는 모임으로). 주의: 레거시 실제 교회 "성경읽는 사람들"과는 별개 공동체.
export const UNAFFILIATED_CHURCH_NAME = '성경 읽는 사람들';
