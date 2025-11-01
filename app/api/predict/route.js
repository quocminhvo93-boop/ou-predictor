// app/api/predict/route.js

// ---------- utils ----------
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function implied(p) { return p > 0 ? 1 / p : null; } // (để dành nếu bạn muốn so odds)

// ---------- API-Football ----------
async function afGet(path, params = {}) {
  const base = "https://v3.football.api-sports.io";
  const url = new URL(path, base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`API-Football ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function teamId(name) {
  const js = await afGet("/teams", { search: name });
  return js?.response?.[0]?.team?.id || null;
}

// Lấy leagueId theo country + league + season
async function leagueIdByName(country, league, season) {
  const js = await afGet("/leagues", { country, name: league, season });
  return js?.response?.[0]?.league?.id || null;
}

// Suy mùa giải từ ngày (EU: mùa bắt đầu ~ tháng 7)
// - Nếu ngày 2025-11-02  -> season = 2025
// - Nếu ngày 2025-02-10  -> season = 2024
function inferSeason(dateISO) {
  if (!dateISO) return new Date().getUTCFullYear();
  const [y, m] = dateISO.split("-").map(Number);
  return (m >= 7) ? y : (y - 1);
}

// Lấy 10 trận FT gần nhất của 1 đội trong ĐÚNG giải & mùa
async function lastNStatsInLeague(teamId, leagueId, season, n = 10) {
  const js = await afGet("/fixtures", {
    team: teamId,
    league: leagueId,
    season,
    status: "FT", // chỉ lấy trận đã kết thúc
  });

  const rows = (js?.response || [])
    .map(f => ({
      ts: new Date(f.fixture.date).getTime(),
      isHome: f.teams.home.id === teamId,
      goalsFor: f.teams.home.id === teamId ? f.goals.home : f.goals.away,
      goalsAg:  f.teams.home.id === teamId ? f.goals.away : f.goals.home,
    }))
    .filter(r => Number.isFinite(r.goalsFor) && Number.isFinite(r.goalsAg))
    .sort((a, b) => b.ts - a.ts) // mới nhất trước
    .slice(0, n);

  if (!rows.length) return { gf: 1.2, ga: 1.2, count: 0 }; // fallback an toàn

  const gf = rows.reduce((s, r) => s + r.goalsFor, 0) / rows.length;
  const ga = rows.reduce((s, r) => s + r.goalsAg , 0) / rows.length;
  return { gf, ga, count: rows.length };
}

// Lấy city/country của sân nhà để gọi thời tiết
async function homeCityByTeamId(teamId) {
  const js = await afGet("/teams", { id: teamId });
  const venue = js?.response?.[0]?.venue;
  return {
    city: venue?.city || null,
    country: venue?.country || null,
  };
}

// ---------- OpenWeather ----------
async function owGet(url, params) {
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(`OpenWeather ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function weatherImpactByCity(city, country) {
  if (!city || !process.env.OPENWEATHER_KEY) return { impact: 1.0, detail: null };

  const q = country ? `${city},${country}` : city;
  const w = await owGet("https://api.openweathermap.org/data/2.5/weather", {
    q,
    units: "metric",
    appid: process.env.OPENWEATHER_KEY,
  });

  const main = (w?.weather?.[0]?.main || "").toLowerCase();
  const wind = Number(w?.wind?.speed || 0);
  const temp = Number(w?.main?.temp || 15);

  let impact = 1.0;
  if (main.includes("rain") || main.includes("snow")) impact *= 0.95;
  if (wind >= 12) impact *= 0.90; else if (wind >= 8) impact *= 0.95;
  if (temp <= 0 || temp >= 30) impact *= 0.97;

  return { impact: clamp(impact, 0.85, 1.10), detail: { city, country, raw: w } };
}

// ---------- The Odds API (tùy chọn) ----------
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
  "UEFA|Champions League": "soccer_uefa_champs_league",
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

  const norm = (s) => (s || "").trim().toLowerCase();
  let best = null;

  for (const ev of list || []) {
    if (norm(ev.home_team) !== norm(home) || norm(ev.away_team) !== norm(away)) continue;
    for (const bm of ev.bookmakers || []) {
      for (const mk of bm.markets || []) {
        if (mk.key !== "totals") continue;

        const points = {};
        for (const o of mk.outcomes || []) {
          const pt = parseFloat(o.point);
          (points[pt] ||= []).push(o);
        }

        for (const pt of Object.keys(points)) {
          const diff  = Math.abs(parseFloat(pt) - line);
          const over  = points[pt].find(x => norm(x.name) === "over");
          const under = points[pt].find(x => norm(x.name) === "under");
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

// ---------- handler ----------
export async function POST(req) {
  try {
    const { home, away, country, league, date, line } = await req.json();

    if (!process.env.API_FOOTBALL_KEY) throw new Error("Missing API_FOOTBALL_KEY");

    // 1) League + Season
    const season = inferSeason(date); // ví dụ 2025-11-02 -> 2025
    const leagueId = await leagueIdByName(country, league, season);
    if (!leagueId) throw new Error(`Không tìm thấy leagueId cho ${league} (${country}) mùa ${season}`);

    // 2) Team IDs
    const [homeId, awayId] = await Promise.all([teamId(home), teamId(away)]);
    if (!homeId || !awayId) throw new Error("Không tìm thấy team id");

    // 3) 10 trận FT gần nhất trong đúng giải/mùa
    const [h10, a10] = await Promise.all([
      lastNStatsInLeague(homeId, leagueId, season, 10),
      lastNStatsInLeague(awayId, leagueId, season, 10),
    ]);

    // 4) Ước lượng lambda
    const leagueAvg = 1.30; // có thể tinh chỉnh theo từng giải
    let lamH = clamp((h10.gf * a10.ga) / leagueAvg, 0.05, 5.0);
    let lamA = clamp((a10.gf * h10.ga) / leagueAvg, 0.05, 5.0);

    // 5) Thời tiết: dùng city/country sân nhà từ API-Football
    let weather = { impact: 1.0, detail: null };
    try {
      const v = await homeCityByTeamId(homeId);
      if (v.city && process.env.OPENWEATHER_KEY) {
        weather = await weatherImpactByCity(v.city, v.country || country);
        lamH *= weather.impact;
        lamA *= weather.impact;
      }
    } catch { /* giữ impact = 1.0 nếu lỗi */ }

    // 6) Mô phỏng Poisson
    const iters = 20000;
    let overCount = 0;
    const pois = (lambda) => {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= Math.random(); } while (p > L);
      return k - 1;
    };
    for (let i = 0; i < iters; i++) {
      const h = pois(lamH), a = pois(lamA);
      if (h + a > Number(line)) overCount++;
    }
    const pOver = overCount / iters;
    const pUnder = 1 - pOver;

    // 7) Odds (tùy chọn)
    let odds = null;
    try { odds = await bestTotalsOdds({ country, league, home, away, line: Number(line) }); } catch {}

    return Response.json({
      ok: true,
      inputs: { home, away, country, league, date, season, line: Number(line) },
      data_used: {
        api_football: {
          league_id: leagueId,
          home_id: homeId,
          away_id: awayId,
          last10: { home: h10, away: a10 },
        },
        weather,
        odds,
      },
      lambdas: { home: lamH, away: lamA },
      result: { p_over: pOver, p_under: pUnder },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
