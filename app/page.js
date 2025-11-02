"use client";
import { useEffect, useState } from "react";

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export default function Fixtures24h() {
  const [fixtures, setFixtures] = useState([]);
  const [odds, setOdds] = useState({});
  const [running, setRunning] = useState({});
  const [results, setResults] = useState({});
  const [loadingPage, setLoadingPage] = useState(true);

  // tải danh sách 24h
  useEffect(() => {
    (async () => {
      setLoadingPage(true);
      try {
        const r = await fetch("/api/fixtures24h");
        const js = await r.json();
        setFixtures(js?.ok ? (js.fixtures || []) : []);
      } catch { setFixtures([]); }
      setLoadingPage(false);
    })();
  }, []);

  // cập nhật odds mỗi 30s cho tối đa 20 trận có sport key
  useEffect(() => {
    let timer;
    const tick = async () => {
      const updates = {};
      const subset = fixtures.filter(f => !!f.sport).slice(0, 20);
      await Promise.all(subset.map(async (f, idx) => {
        try {
          const q = new URLSearchParams({
            home: f.home, away: f.away, country: f.country, league: f.league, line: "2.5"
          }).toString();
          const r = await fetch(`/api/sources/odds?${q}`);
          const js = await r.json();
          updates[idx] = js?.best
            ? { line: js.best.line, over: js.best.over, under: js.best.under, bookmaker: js.best.bookmaker }
            : { line: 2.5, over: null, under: null, bookmaker: null };
        } catch {}
      }));
      if (Object.keys(updates).length) setOdds(prev => ({ ...prev, ...updates }));
    };
    if (fixtures.length) {
      tick();
      timer = setInterval(tick, 30000);
    }
    return () => timer && clearInterval(timer);
  }, [fixtures]);

  const runOne = async (idx) => {
    const f = fixtures[idx];
    if (!f) return;
    setRunning(s => ({ ...s, [idx]: true }));
    try {
      const payload = {
        home: f.home, away: f.away,
        country: f.country, league: f.league,
        date: f.dateUTC.slice(0,10),
        line: 2.5
      };
      const r = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const js = await r.json();
      setResults(prev => ({ ...prev, [idx]: js?.ok
        ? { p_over: js.result.p_over, p_under: js.result.p_under, lambdas: js.lambdas }
        : { error: js?.error || "Server error" }
      }));
    } catch (e) {
      setResults(prev => ({ ...prev, [idx]: { error: String(e) } }));
    } finally {
      setRunning(s => ({ ...s, [idx]: false }));
    }
  };

  return (
    <div style={{ maxWidth: 980, margin: "24px auto", padding: 16 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>⚽ Over/Under Predictor — 24h (EU Tier 1–3)</h2>

      {loadingPage && <div>Đang tải lịch 24h…</div>}
      {!loadingPage && fixtures.length === 0 && <div>Không có trận phù hợp trong 24h tới.</div>}

      <div style={{ display: "grid", gap: 10 }}>
        {fixtures.map((f, idx) => {
          const o = odds[idx];
          const r = results[idx];
          return (
            <div key={f.fixtureId} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 280 }}>
                  <div style={{ fontWeight: 700 }}>{f.home} vs {f.away}</div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {f.country} • {f.league} • {fmtTime(f.dateUTC)} UTC • {f.status}
                  </div>
                </div>
                <div style={{ fontSize: 13 }}>
                  {o ? (
                    <>
                      <div><b>Totals ~ {o.line}</b></div>
                      <div>Over: {o.over ?? "—"} | Under: {o.under ?? "—"} {o.bookmaker ? `(${o.bookmaker})` : ""}</div>
                    </>
                  ) : <div>Đang lấy odds…</div>}
                </div>
                <div>
                  <button
                    onClick={() => runOne(idx)}
                    disabled={!!running[idx]}
                    style={{ padding: "8px 14px", borderRadius: 10, background: "#2563eb", color: "#fff", fontWeight: 700 }}
                  >
                    {running[idx] ? "Đang chạy…" : "Chạy mô phỏng & dự đoán"}
                  </button>
                </div>
              </div>
              {r && (
                <div style={{ marginTop: 8, fontSize: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 8 }}>
                  {r.error ? (
                    <div>⚠️ {r.error}</div>
                  ) : (
                    <>
                      <div>P(Over 2.5): {(r.p_over*100).toFixed(1)}% • P(Under): {(r.p_under*100).toFixed(1)}%</div>
                      <div style={{ marginTop: 4, color: "#475569" }}>
                        λ_home: {r.lambdas?.home?.toFixed(2)} • λ_away: {r.lambdas?.away?.toFixed(2)}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
