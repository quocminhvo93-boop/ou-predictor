// app/api/sources/fixture/route.js  (v2.1.0)
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

const LEAGUE_ID_MAP = {
  "England|Premier League": 39,
  "Spain|La Liga": 140,
  "Italy|Serie A": 135,
  "Germany|Bundesliga": 78,
  "France|Ligue 1": 61,
  "Netherlands|Eredivisie": 88,
  "Portugal|Primeira Liga": 94,
  "Turkey|Super Lig": 203,
  "Scotland|Premiership": 179,
  "Austria|Bundesliga": 218,
  "Switzerland|Super League": 207,
  "Sweden|Allsvenskan": 113
};

async function afGet(path, params = {}) {
  const base = "https://v3.football.api-sports.io";
  const url  = new URL(path, base);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }, cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(`API-Football ${r.status}: ${JSON.stringify(j)}`);
  return j;
}
async function teamIdByName(name) {
  const js = await afGet("/teams", { search: name });
  return js?.response?.[0]?.team?.id || null;
}
async function leagueIdByName(country, league, season) {
  const js = await afGet("/leagues", { country, name: league, season });
  return js?.response?.[0]?.league?.id || null;
}
function inferSeason(dateISO) {
  if (!dateISO) return new Date().getUTCFullYear();
  const [y, m] = dateISO.split("-").map(Number);
  return (m >= 7) ? y : (y - 1);
}
async function lastNStatsInLeague(teamId, leagueId, season, n = 10) {
  const js = await afGet("/fixtures", { team: teamId, league: leagueId, season, status: "FT" });
  const rows = (js?.response || [])
    .map(f => ({
      ts: new Date(f.fixture.date).getTime(),
      goalsFor: f.teams.home.id === teamId ? f.goals.home : f.goals.away,
      goalsAg:  f.teams.home.id === teamId ? f.goals.away : f.goals.home,
    }))
    .filter(r => Number.isFinite(r.goalsFor) && Number.isFinite(r.goalsAg))
    .sort((a,b) => b.ts - a.ts)
    .slice(0, n);

  if (!rows.length) return { gf: 1.2, ga: 1.2, count: 0 };
  const gf = rows.reduce((s,r)=>s+r.goalsFor,0)/rows.length;
  const ga = rows.reduce((s,r)=>s+r.goalsAg ,0)/rows.length;
  return { gf, ga, count: rows.length };
}

export async function GET(req) {
  try {
    if (!process.env.API_FOOTBALL_KEY)
      return Response.json({ version:"2.1.0", error: "Missing API_FOOTBALL_KEY" }, { status: 500 });

    const { searchParams } = new URL(req.url);
    const home    = searchParams.get("home");
    const away    = searchParams.get("away");
    const country = searchParams.get("country");
    const league  = searchParams.get("league");
    const dateISO = searchParams.get("date");
    let   season  = Number(searchParams.get("season") || inferSeason(dateISO));

    if (!home || !away)
      return Response.json({ version:"2.1.0", error: "home & away required" }, { status: 400 });

    const [homeId, awayId] = await Promise.all([teamIdByName(home), teamIdByName(away)]);
    let leagueId = null;

    if (country && league) {
      leagueId = await leagueIdByName(country, league, season);
      if (!leagueId) {
        const key = `${country}|${league}`;
        if (LEAGUE_ID_MAP[key]) leagueId = LEAGUE_ID_MAP[key];
      }
    }

    let h = { gf: 1.2, ga: 1.2, count: 0 }, a = { gf: 1.2, ga: 1.2, count: 0 }, usedSeason = season;
    if (leagueId) {
      for (const s of [season, season - 1, season - 2]) {
        const [hh, aa] = await Promise.all([
          lastNStatsInLeague(homeId, leagueId, s, 10),
          lastNStatsInLeague(awayId, leagueId, s, 10)
        ]);
        if (hh.count > 0 && aa.count > 0) { h = hh; a = aa; usedSeason = s; break; }
      }
    }

    const leagueAvg = 1.30;
    const lamH = clamp((h.gf * a.ga) / leagueAvg, 0.05, 5.0);
    const lamA = clamp((a.gf * h.ga) / leagueAvg, 0.05, 5.0);

    return Response.json({
      version: "2.1.0",
      source: "api-football",
      home, away,
      input: { country, league, season_requested: season },
      resolved: { leagueId, season_used: usedSeason, homeId, awayId },
      last10: { home: h, away: a },
      lambda: { home: lamH, away: lamA }
    });
  } catch (e) {
    return Response.json({ version:"2.1.0", error: String(e) }, { status: 500 });
  }
}
