// app/api/predict/route.js

// -------- helpers --------
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function implied(p) { return p > 0 ? 1 / p : null; }

// API-Football
async function afGet(path, params = {}) {
  const base = "https://v3.football.api-sports.io";
  const url = new URL(path, base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }, cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(`API-Football ${r.status}: ${JSON.stringify(j)}`);
  return j;
}
async function teamId(name) {
  const js = await afGet("/teams", { search: name });
  return js?.response?.[0]?.team?.id || null;
}
async function lastN(teamId, n = 10) {
  const js = await afGet("/fixtures", { team: teamId, last: n });
  let gf = 0, ga = 0, c = 0;
  for (const f of js?.response || []) {
    const home = f?.teams?.home?.id === teamId;
    const forG = home ? f?.goals?.home : f?.goals?.away;
    const agG  = home ? f?.goals?.away : f?.goals?.home;
    if (Number.isFinite(forG) && Number.isFinite(agG)) { gf += forG; ga += agG; c++; }
  }
  return c ? { gf: gf / c, ga: ga / c, count: c } : { gf: 1.2, ga: 1.2, count: 0 };
}

// OpenWeather
async function owGet(url, params) {
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(`OpenWeather ${r.status}: ${JSON.stringify(j)}`);
  return j;
}
async function weatherImpact(city, country) {
  if (!city) return { impact: 1.0, detail: null };
  const geo = await owGet("http://api.openweathermap.org/geo/1.0/direct", {
    q: country ? `${city},${country}` : city,
    limit: 1, appid: process.env.OPENWEATHER_KEY
  });
  if (!Array.isArray(geo) || !geo[0]) return { impact: 1.0, detail: { error: "geocode not found" } };
  const { lat, lon } = geo[0];
  const w = await owGet("https://api.openweathermap.org/data/2.5/weather", {
    lat, lon, units: "metric", appid: process.env.OPENWEATHER_KEY
  });
  const weather = (w?.weather?.[0]?.main || "").toLowerCase();
  const wind = Number(w?.wind?.speed || 0);
  const temp = Number(w?.main?.temp || 15);
  let impact = 1.0;
  if (weather.includes("rain") || weather.includes("snow")) impact *= 0.95;
  if (wind >= 12) impact *= 0.90; else if (wind >= 8) impact *= 0.95;
  if (temp <= 0 || temp >= 30) impact *= 0.97;
  return { impact: clamp(impact, 0.85, 1.10), detail: w };
}

// The Odds API (optional)
const SPORT_MAP = {
  "England|Premier League": "soccer_epl",
  "Spain|La Liga": "soccer_spain_la_liga",
  "Italy|Serie A": "soccer_italy_serie_a",
  "Germany|Bundesliga": "soccer_germany_bundesliga",
  "France|Ligue 1": "soccer_france_ligue_one",
  "Netherlands|Eredivisie": "soccer_netherlands_eredivisie",
  "Portugal|Primeira Liga": "soccer_portugal_primeira_liga",
  "Turkey|Super Lig": "soccer_turkey_super_lig",
  "USA|MLS": "soccer_usa_mls",
  "UEFA|Champions League": "soccer_uefa_champs_league"
};
async function bestTotalsOdds({ country, league, home, away, line }) {
  const sport = SPORT_MAP[`${country}|${league}`];
  if (!sport || !process.env.ODDS_API_KEY) return null;
  const u = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  u.searchParams.set("apiKey", process.env.ODDS_API_KEY);
  u.searchParams.set("regions", "eu");
  u.searchParams.set("markets", "totals");
  u.searchParams.set("oddsFormat", "decimal");
  const r = await fetch(u, { cache: "no-store" });
  const list = await r.json();
  if (!r.ok) return null;
  const norm = (s)=> (s||"").trim().toLowerCase();
  let best = null;
  for (const ev of list || []) {
    if (norm(ev.home_team) !== norm(home) || norm(ev.away_team) !== norm(away)) continue;
    for (const bm of ev.bookmakers || []) {
      for (const mk of bm.markets || []) {
        if (mk.key !== "totals") continue;
        const points = {};
        for (const o of mk.outcomes || []) {
          const pt = parseFloat(o.point); (points[pt] ||= []).push(o);
        }
        for (const pt of Object.keys(points)) {
          const diff = Math.abs(parseFloat(pt) - line);
          const over = points[pt].find(x => norm(x.name) === "over");
          const under= points[pt].find(x => norm(x.name) === "under");
          if (over && under) {
            const cand = { diff, bookmaker: bm.key, line: parseFloat(pt), over: over.price, under: under.price };
            if (!best || cand.diff < best.diff) best = cand;
          }
        }
      }
    }
  }
  return best;
}

// -------- main handler --------
export async function POST(req) {
  try {
    const { home, away, country, league, date, line } = await req.json();

    // 1) dữ liệu thật từ API-Football
    if (!process.env.API_FOOTBALL_KEY) throw new Error("Missing API_FOOTBALL_KEY");
    const [hid, aid] = await Promise.all([teamId(home), teamId(away)]);
    if (!hid || !aid) throw new Error("Không tìm thấy team id");
    const [h10, a10] = await Promise.all([lastN(hid), lastN(aid)]);
    const leagueAvg = 1.30;
    let lamH = clamp((h10.gf * a10.ga) / leagueAvg, 0.05, 5.0);
    let lamA = clamp((a10.gf * h10.ga) / leagueAvg, 0.05, 5.0);

    // 2) thời tiết (nếu điền country/city)
    let weather = { impact: 1.0, detail: null };
    if (country) {
      // city không có trong form; tạm dùng tên đội chủ nhà như city fallback (bạn có thể thêm ô nhập City riêng)
      const cityGuess = home.split(" ").slice(-1)[0]; // ví dụ "Manchester City" -> "City" (bạn có thể đổi sang tên thành phố thật)
      if (process.env.OPENWEATHER_KEY) {
        try { weather = await weatherImpact(cityGuess, country); } catch { /* giữ impact = 1.0 */ }
      }
    }
    lamH *= weather.impact; lamA *= weather.impact;

    // 3) mô phỏng Poisson (Monte Carlo)
    const iters = 20000;
    let overCount = 0;
    for (let i = 0; i < iters; i++) {
      // Poisson sampling bằng Knuth (đơn giản)
      const pois = (lambda) => {
        const L = Math.exp(-lambda);
        let k = 0, p = 1;
        do { k++; p *= Math.random(); } while (p > L);
        return k - 1;
      };
      const h = pois(lamH), a = pois(lamA);
      const total = h + a;
      if (total > Number(line)) overCount++;
    }
    const pOver = overCount / iters;
    const pUnder = 1 - pOver;

    // 4) odds (nếu có)
    let odds = null;
    try { odds = await bestTotalsOdds({ country, league, home, away, line: Number(line) }); } catch {}

    return Response.json({
      ok: true,
      inputs: { home, away, country, league, date, line: Number(line) },
      data_used: {
        api_football: { home_id: hid, away_id: aid, last10: { home: h10, away: a10 } },
        weather: { impact: weather.impact, raw: weather.detail ? weather.detail : null },
        odds
      },
      lambdas: { home: lamH, away: lamA },
      result: { p_over: pOver, p_under: pUnder }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
