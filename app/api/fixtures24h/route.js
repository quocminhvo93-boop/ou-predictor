// app/api/fixtures24h/route.js (next + debug errors)
const LEAGUES_EU = [
  { country: "England", league: "Premier League",   sport: "soccer_epl" },
  { country: "England", league: "Championship",     sport: null },
  { country: "England", league: "League One",       sport: null },
  { country: "Scotland", league: "Premiership",     sport: "soccer_scotland_premiership" },
  { country: "Spain",    league: "La Liga",         sport: "soccer_spain_la_liga" },
  { country: "Spain",    league: "La Liga 2",       sport: null },
  { country: "Italy",    league: "Serie A",         sport: "soccer_italy_serie_a" },
  { country: "Italy",    league: "Serie B",         sport: null },
  { country: "Germany",  league: "Bundesliga",      sport: "soccer_germany_bundesliga" },
  { country: "Germany",  league: "2. Bundesliga",   sport: null },
  { country: "Germany",  league: "3. Liga",         sport: null },
  { country: "France",   league: "Ligue 1",         sport: "soccer_france_ligue_one" },
  { country: "France",   league: "Ligue 2",         sport: null },
  { country: "Netherlands", league: "Eredivisie",      sport: "soccer_netherlands_eredivisie" },
  { country: "Netherlands", league: "Eerste Divisie",  sport: null },
  { country: "Portugal", league: "Primeira Liga",   sport: "soccer_portugal_primeira_liga" },
  { country: "Portugal", league: "Liga Portugal 2", sport: null },
  { country: "Turkey",   league: "Super Lig",       sport: "soccer_turkey_super_lig" },
  { country: "Austria",  league: "Bundesliga",      sport: "soccer_austria_bundesliga" },
  { country: "Switzerland", league: "Super League",   sport: "soccer_switzerland_superleague" },
  { country: "Switzerland", league: "Challenge League", sport: null },
  { country: "Sweden",   league: "Allsvenskan",     sport: "soccer_sweden_allsvenskan" },
  { country: "Sweden",   league: "Superettan",      sport: null },
  { country: "Hungary",  league: "NB I",            sport: null },
  { country: "Bulgaria", league: "First League",    sport: null },
];

async function afGet(path, params = {}) {
  const base = "https://v3.football.api-sports.io";
  const url  = new URL(path, base);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }, cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(`AF ${r.status}: ${JSON.stringify(j)}`);
  return j;
}
async function resolveLeagueId(country, league) {
  let js = await afGet("/leagues", { country, name: league, current: true });
  if (js?.response?.length) return js.response[0].league.id;
  js = await afGet("/leagues", { country, name: league });
  return js?.response?.[0]?.league?.id || null;
}
function withinHours(iso, hours) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  return t >= now && t <= now + hours*3600*1000;
}

export async function GET(req) {
  try {
    if (!process.env.API_FOOTBALL_KEY)
      return Response.json({ ok:false, error: "Missing API_FOOTBALL_KEY" }, { status: 500 });

    const url = new URL(req.url);
    const hours = Math.max(1, Math.min(168, Number(url.searchParams.get("hours") || 24)));
    const idCache = new Map();
    const errors = [];
    const all = [];

    const getId = async (c,l) => {
      const k = `${c}|${l}`;
      if (idCache.has(k)) return idCache.get(k);
      const id = await resolveLeagueId(c,l);
      idCache.set(k, id);
      return id;
    };

    for (const lg of LEAGUES_EU) {
      try {
        const id = await getId(lg.country, lg.league);
        if (!id) { errors.push({ league: lg, error: "leagueId not found" }); continue; }
        const js = await afGet("/fixtures", { league: id, next: 80, timezone: "UTC" });
        for (const f of js?.response || []) {
          if (!withinHours(f.fixture.date, hours)) continue;
          all.push({
            leagueId: id, league: lg.league, country: lg.country, sport: lg.sport,
            fixtureId: f.fixture.id, dateUTC: f.fixture.date,
            home: f.teams?.home?.name, away: f.teams?.away?.name,
            status: f.fixture?.status?.short, venue: f.fixture?.venue?.name || null,
          });
        }
      } catch (e) { errors.push({ league: lg, error: String(e) }); }
    }

    all.sort((a,b)=> new Date(a.dateUTC)-new Date(b.dateUTC));
    if (!all.length) return Response.json({ ok:false, hours, count: 0, errors });
    return Response.json({ ok:true, hours, count: all.length, fixtures: all.slice(0, 120) });
  } catch (e) {
    return Response.json({ ok:false, error: String(e) }, { status: 500 });
  }
}
