// hero-shared.jsx — 전체 플랫폼 통계 + 작은 프리미티브

const PLATFORM = {
  total_churches: 247,
  total_readers: 18432,
  reading_now: 1284,            // 지금 이 순간 읽고 있는 사람
  finished_today: 4920,
  finished_total: 6128,         // 누적 완독자
  current_streak_days: 412,     // 플랫폼 누적 연속일
  chapters_read_today: 31204,
};

const TODAY_PASSAGE = {
  ref: "시편 119:105",
  preview: "주의 말씀은 내 발에 등이요 내 길에 빛이니이다.",
  minutes: 4,
};

// 라이브 피드: 어느 교회 누구가 무엇을 읽었는지
const LIVE_READERS = [
  { name: "김은혜", church: "은혜교회",       book: "마태복음 5장",  at: "방금" },
  { name: "박성도", church: "새생명교회",     book: "창세기 12장",   at: "1분 전" },
  { name: "이주영", church: "사랑의교회",     book: "시편 119편",    at: "2분 전" },
  { name: "정민수", church: "산성교회",       book: "요한복음 3장",  at: "3분 전" },
  { name: "최서연", church: "광림교회",       book: "로마서 8장",    at: "4분 전" },
  { name: "한지호", church: "온누리교회",     book: "잠언 3장",      at: "5분 전" },
  { name: "오다은", church: "주안장로교회",   book: "이사야 40장",   at: "6분 전" },
  { name: "윤민준", church: "남서울은혜교회", book: "에베소서 1장",  at: "7분 전" },
];

// 이번 주 합류한 교회들
const RECENT_CHURCHES = [
  { name: "은혜교회",       members: 312, region: "서울 강남" },
  { name: "새생명교회",     members: 184, region: "경기 성남" },
  { name: "사랑의교회",     members: 521, region: "서울 서초" },
  { name: "산성교회",       members: 96,  region: "부산 동래" },
  { name: "광림교회",       members: 267, region: "서울 마포" },
];

// 이번 달 완독자 표시용
const RECENT_FINISHERS = [
  { initial: "은", color: "#b8702a" },
  { initial: "성", color: "#2b3a2a" },
  { initial: "주", color: "#7a3b2e" },
  { initial: "민", color: "#3b6b4a" },
  { initial: "서", color: "#b8702a" },
  { initial: "지", color: "#2b3a2a" },
];

// ── small primitives ────────────────────────────────────────
function ProgressBar({ value, color = "currentColor", track = "rgba(0,0,0,0.08)", height = 6, radius = 999 }) {
  return (
    <div style={{ width: "100%", height, background: track, borderRadius: radius, overflow: "hidden" }}>
      <div style={{ width: `${Math.round(value * 100)}%`, height: "100%", background: color, borderRadius: radius, transition: "width .6s ease" }} />
    </div>
  );
}

function Avatar({ initial, size = 28, bg = "#2b3a2a", fg = "#f5efe4", font = "inherit" }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, color: fg,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 600, fontFamily: font, flexShrink: 0,
    }}>{initial}</div>
  );
}

function Pulse({ color = "#3b6b4a", size = 8 }) {
  return (
    <span style={{ display: "inline-block", position: "relative", width: size, height: size }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%", background: color,
        animation: "pulseRing 1.8s ease-out infinite",
      }} />
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%", background: color,
      }} />
    </span>
  );
}

// inject keyframes once
if (typeof document !== "undefined" && !document.getElementById("hero-shared-css")) {
  const s = document.createElement("style");
  s.id = "hero-shared-css";
  s.textContent = `
    @keyframes pulseRing { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(2.6); opacity: 0 } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
    @keyframes scrollFeed { 0% { transform: translateY(0) } 100% { transform: translateY(-50%) } }
    @keyframes count { from { opacity: .3 } to { opacity: 1 } }
    .feed-scroll { animation: scrollFeed 32s linear infinite; }
    .fade-up { animation: fadeUp .5s ease both; }
    .num-tick { animation: count .4s ease both; }
  `;
  document.head.appendChild(s);
}

Object.assign(window, {
  PLATFORM, TODAY_PASSAGE, LIVE_READERS, RECENT_CHURCHES, RECENT_FINISHERS,
  ProgressBar, Avatar, Pulse,
});
