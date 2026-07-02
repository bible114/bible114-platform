// hero-a.jsx — "성경통독 114" 로그인/랜딩 페이지
// 따뜻한 서재 톤. 전체 플랫폼 뷰. 성도 / 교회 관리자 로그인 명확히 구분.

function HeroA({ tweaks }) {
  const t = tweaks;
  const cream = t.bg || "#f5efe4";
  const ink = "#2b3a2a";
  const accent = t.accent || "#b8702a";
  const muted = "rgba(43,58,42,0.55)";
  const hairline = "rgba(43,58,42,0.16)";

  const serif = `"Noto Serif KR", "Nanum Myeongjo", ui-serif, Georgia, serif`;
  const sans = `"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;

  // 로그인 탭 상태
  const [loginRole, setLoginRole] = React.useState("member"); // 'member' | 'admin'
  const [readingNow, setReadingNow] = React.useState(PLATFORM.reading_now);

  // 살아있는 카운터 — 1~3씩 출렁임
  React.useEffect(() => {
    const id = setInterval(() => {
      setReadingNow((n) => Math.max(1100, n + (Math.floor(Math.random() * 7) - 3)));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const headline = t.headline || "혼자가 아니라,\n같이 펼칩니다.";

  return (
    <div style={{
      width: "100%", height: "100%", background: cream, color: ink,
      fontFamily: sans, position: "relative", overflow: "hidden",
      display: "grid", gridTemplateColumns: "1.15fr 1fr",
    }}>
      {/* paper warmth */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.55,
        backgroundImage:
          "radial-gradient(circle at 18% 12%, rgba(184,112,42,0.06), transparent 42%)," +
          "radial-gradient(circle at 82% 88%, rgba(43,58,42,0.05), transparent 40%)",
      }} />

      {/* ═══════════════ Top Nav ═══════════════ */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 56px", zIndex: 5,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 7, background: ink, color: cream,
            display: "grid", placeItems: "center", fontFamily: serif, fontWeight: 700, fontSize: 14,
            letterSpacing: "0.02em",
          }}>114</div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontFamily: serif, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>성경통독 114</span>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 28, fontSize: 13, color: muted }}>
          <a style={{ color: ink, textDecoration: "none", borderBottom: `1.5px solid ${accent}`, paddingBottom: 2, cursor: "pointer" }}>소개</a>
          <a style={{ textDecoration: "none", color: muted, cursor: "pointer" }}>참여 교회</a>
          <a style={{ textDecoration: "none", color: muted, cursor: "pointer" }}>읽는 방법</a>
          <a style={{ textDecoration: "none", color: muted, cursor: "pointer" }}>도움말</a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: muted }}>
          <span style={{ cursor: "pointer" }}>교회 등록 신청 →</span>
        </div>
      </div>

      {/* ═══════════════ LEFT — Editorial Hero ═══════════════ */}
      <div style={{
        padding: "100px 56px 40px",
        display: "flex", flexDirection: "column", minHeight: 0,
        position: "relative", zIndex: 1,
      }}>
        {/* eyebrow — live counter */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <Pulse color={accent} size={7} />
          <span style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: muted, fontWeight: 600 }}>
            지금 <span className="num-tick" key={readingNow} style={{ color: ink, fontVariantNumeric: "tabular-nums" }}>{readingNow.toLocaleString()}</span>명이 함께 펼치는 중
          </span>
        </div>

        {/* headline */}
        <h1 style={{
          fontFamily: serif, fontWeight: 600, fontSize: 56, lineHeight: 1.16,
          margin: "0 0 18px", letterSpacing: "-0.022em", whiteSpace: "pre-line",
        }}>
          {headline.split("\n").map((line, i) => {
            if (line.includes("같이")) {
              const idx = line.indexOf("같이");
              return (
                <span key={i} style={{ display: "block" }}>
                  {line.slice(0, idx)}
                  <span style={{ color: accent }}>같이</span>
                  {line.slice(idx + 2)}
                </span>
              );
            }
            return <span key={i} style={{ display: "block" }}>{line}</span>;
          })}
        </h1>

        <p style={{
          fontSize: 15, lineHeight: 1.65, color: "rgba(43,58,42,0.78)",
          maxWidth: 480, margin: "0 0 24px",
        }}>
          전국 <b style={{ color: ink }}>{PLATFORM.total_churches}개 교회</b>,
          {" "}<b style={{ color: ink }}>{PLATFORM.total_readers.toLocaleString()}명</b>의 성도가
          오늘도 같은 페이지를 넘기고 있습니다. 천로역정 같은 통독의 길, 함께 걸어요.
        </p>

        {/* Big stat strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          padding: "18px 0", borderTop: `1px solid ${hairline}`, borderBottom: `1px solid ${hairline}`,
          marginBottom: 22,
        }}>
          {[
            { num: PLATFORM.total_churches.toString(), label: "함께하는 교회" },
            { num: PLATFORM.total_readers.toLocaleString(), label: "참여 성도" },
            { num: PLATFORM.finished_total.toLocaleString(), label: "올해 완독자" },
            { num: PLATFORM.chapters_read_today.toLocaleString(), label: "오늘 읽은 장수" },
          ].map((s, i) => (
            <div key={i} style={{
              padding: i === 0 ? "0 16px 0 0" : "0 16px",
              borderLeft: i === 0 ? "none" : `1px solid ${hairline}`,
            }}>
              <div style={{
                fontFamily: serif, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums", lineHeight: 1.05,
              }}>{s.num}</div>
              <div style={{ fontSize: 11, color: muted, marginTop: 5, letterSpacing: "0.02em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Today passage card — bookmark folded */}
        <div style={{
          background: "#fbf6ec", border: `1px solid ${hairline}`,
          borderRadius: 4, padding: "18px 22px", maxWidth: 520, position: "relative",
          marginBottom: 20,
        }}>
          <div style={{
            position: "absolute", top: -1, left: 22, width: 36, height: 12,
            background: accent, borderRadius: "0 0 4px 4px",
          }} />
          <p style={{
            fontFamily: serif, fontSize: 16, lineHeight: 1.65, color: "rgba(43,58,42,0.85)",
            margin: "0 0 8px", fontStyle: "italic", fontWeight: 500,
          }}>"{TODAY_PASSAGE.preview}"</p>
          <div style={{ fontFamily: serif, fontSize: 13, color: muted, letterSpacing: "0.02em", textAlign: "right" }}>
            — {TODAY_PASSAGE.ref}
          </div>
        </div>

        {/* Live feed strip */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: muted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
              방금 펼친 성도들
            </span>
            <span style={{ fontSize: 11, color: muted, display: "flex", alignItems: "center", gap: 6 }}>
              <Pulse color="#3b6b4a" size={6} /> 실시간
            </span>
          </div>
          <div style={{ flex: 1, overflow: "hidden", position: "relative", maskImage: "linear-gradient(180deg, #000 70%, transparent)", minHeight: 0 }}>
            <div className="feed-scroll" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...LIVE_READERS, ...LIVE_READERS].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar initial={r.name[0]} size={28} bg={ink} fg={cream} font={serif} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: serif, fontSize: 14, fontWeight: 600 }}>{r.name}</span>
                      <span style={{ fontSize: 11, color: accent }}>{r.church}</span>
                      <span style={{ fontSize: 11, color: muted, marginLeft: "auto" }}>{r.at}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(43,58,42,0.65)", marginTop: 1 }}>
                      {r.book} 펼침
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ RIGHT — Login Card ═══════════════ */}
      <div style={{
        padding: "100px 56px 40px 28px",
        display: "flex", flexDirection: "column", justifyContent: "center",
        minHeight: 0, overflow: "hidden",
      }}>
        <div style={{
          background: "#fbf7ee", border: `1px solid ${hairline}`,
          borderRadius: 8, padding: "36px 38px",
          boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 60px -30px rgba(43,58,42,0.28)",
          position: "relative",
        }}>
          {/* Card header */}
          <div style={{ marginBottom: 22 }}>
            <div style={{
              fontFamily: serif, fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em",
            }}>로그인</div>
          </div>

          {/* Role tabs */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
            background: "rgba(43,58,42,0.06)", padding: 4, borderRadius: 10,
            marginBottom: 24,
          }}>
            {[
              { key: "member", title: "성도", sub: "오늘의 본문 읽기" },
              { key: "admin",  title: "교회 관리자", sub: "구역·진행률 관리" },
            ].map((tab) => {
              const active = loginRole === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setLoginRole(tab.key)}
                  style={{
                    border: "none", cursor: "pointer", textAlign: "left",
                    padding: "10px 14px", borderRadius: 7,
                    background: active ? cream : "transparent",
                    color: ink, fontFamily: sans,
                    boxShadow: active ? "0 1px 2px rgba(43,58,42,0.12)" : "none",
                    transition: "all .15s ease",
                  }}
                >
                  <div style={{
                    fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    {tab.title}
                    {active && tab.key === "admin" && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: cream, background: accent,
                        padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em",
                      }}>ADMIN</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{tab.sub}</div>
                </button>
              );
            })}
          </div>

          {/* Form */}
          {loginRole === "member" ? (
            <MemberLoginForm ink={ink} cream={cream} accent={accent} muted={muted} hairline={hairline} serif={serif} sans={sans} />
          ) : (
            <AdminLoginForm ink={ink} cream={cream} accent={accent} muted={muted} hairline={hairline} serif={serif} sans={sans} />
          )}
        </div>

        {/* Beneath card — helpful links */}
        <div style={{ display: "none" }} />
      </div>
    </div>
  );
}

// ─── Member Login Form ────────────────────────────────────────────
function MemberLoginForm({ ink, cream, accent, muted, hairline, serif, sans }) {
  return (
    <>
      {/* Church selector */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>
          출석 교회
        </label>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: cream, border: `1px solid ${hairline}`, borderRadius: 8,
          padding: "12px 14px", cursor: "pointer",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: ink, color: cream,
            display: "grid", placeItems: "center", fontSize: 11, fontFamily: serif, fontWeight: 700,
          }}>은</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>은혜교회</div>
            <div style={{ fontSize: 11, color: muted }}>서울 강남 · 성도 312명</div>
          </div>
          <span style={{ fontSize: 12, color: muted }}>변경 ↓</span>
        </div>
      </div>

      {/* ID */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>
          아이디 또는 이메일
        </label>
        <input
          type="text"
          placeholder="grace@church.kr"
          style={{
            width: "100%", background: cream, border: `1px solid ${hairline}`, borderRadius: 8,
            padding: "12px 14px", fontSize: 14, fontFamily: sans, color: ink, outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Password */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <label style={{ fontSize: 11, color: muted, fontWeight: 600, letterSpacing: "0.02em" }}>비밀번호</label>
          <a style={{ fontSize: 11, color: muted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
            잊으셨나요?
          </a>
        </div>
        <input
          type="password"
          placeholder="••••••••"
          style={{
            width: "100%", background: cream, border: `1px solid ${hairline}`, borderRadius: 8,
            padding: "12px 14px", fontSize: 14, fontFamily: sans, color: ink, outline: "none",
            boxSizing: "border-box", letterSpacing: "0.1em",
          }}
        />
      </div>

      {/* Submit */}
      <button style={{
        width: "100%", background: ink, color: cream, border: "none",
        padding: "14px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600,
        fontFamily: sans, cursor: "pointer", display: "inline-flex", alignItems: "center",
        justifyContent: "center", gap: 10, letterSpacing: "-0.005em",
      }}>
        오늘의 본문 펼치기 <span style={{ opacity: 0.6 }}>→</span>
      </button>
    </>
  );
}

// ─── Admin Login Form ────────────────────────────────────────────
function AdminLoginForm({ ink, cream, accent, muted, hairline, serif, sans }) {
  return (
    <>
      {/* admin notice */}
      <div style={{
        background: "rgba(184,112,42,0.08)", border: `1px solid rgba(184,112,42,0.22)`,
        borderRadius: 8, padding: "10px 12px", marginBottom: 16,
        display: "flex", gap: 10, alignItems: "flex-start",
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: accent, color: cream,
          display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
        }}>!</div>
        <div style={{ fontSize: 12, color: ink, lineHeight: 1.5 }}>
          <b>교회 관리자 전용</b>입니다. 구역 편성, 성도 관리, 통독 진행률 대시보드를 사용할 수 있어요.
        </div>
      </div>

      {/* church code */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>
          교회 코드
        </label>
        <input
          type="text"
          placeholder="예) GRACE-2026"
          style={{
            width: "100%", background: cream, border: `1px solid ${hairline}`, borderRadius: 8,
            padding: "12px 14px", fontSize: 14, fontFamily: "ui-monospace, SFMono-Regular, monospace",
            color: ink, outline: "none", boxSizing: "border-box", letterSpacing: "0.06em",
          }}
        />
      </div>

      {/* admin email */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>
          관리자 이메일
        </label>
        <input
          type="email"
          placeholder="admin@church.kr"
          style={{
            width: "100%", background: cream, border: `1px solid ${hairline}`, borderRadius: 8,
            padding: "12px 14px", fontSize: 14, fontFamily: sans, color: ink, outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* password */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <label style={{ fontSize: 11, color: muted, fontWeight: 600, letterSpacing: "0.02em" }}>비밀번호</label>
          <a style={{ fontSize: 11, color: muted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
            잊으셨나요?
          </a>
        </div>
        <input
          type="password"
          placeholder="••••••••"
          style={{
            width: "100%", background: cream, border: `1px solid ${hairline}`, borderRadius: 8,
            padding: "12px 14px", fontSize: 14, fontFamily: sans, color: ink, outline: "none",
            boxSizing: "border-box", letterSpacing: "0.1em",
          }}
        />
      </div>

      {/* 2FA hint */}
      <label style={{
        display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: muted,
        marginBottom: 18, cursor: "pointer",
      }}>
        <input type="checkbox" style={{ accentColor: accent }} />
        이 기기 신뢰 (다음 로그인 시 2단계 인증 생략)
      </label>

      <button style={{
        width: "100%", background: accent, color: cream, border: "none",
        padding: "14px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600,
        fontFamily: sans, cursor: "pointer", display: "inline-flex", alignItems: "center",
        justifyContent: "center", gap: 10, marginBottom: 8,
      }}>
        관리자 대시보드 열기 <span style={{ opacity: 0.7 }}>→</span>
      </button>
      <div style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 6 }}>
        교회 코드가 없으신가요?
        {" "}<a style={{ color: ink, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>교회 등록 신청</a>
      </div>
    </>
  );
}

window.HeroA = HeroA;
