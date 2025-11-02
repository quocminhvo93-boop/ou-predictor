// app/api/fixtures24h/route.js
// Lấy các trận 0..hours tới (mặc định 24h) cho EU tier 1–3.
// Ưu tiên dùng LEAGUE_ID_MAP (ổn định), nếu không có thì fallback search.

const LEAGUE_ID_MAP = {
  // England
  "England|Premier League": 39,
  "England|Championship": 40,
  "England|League One": 41,
  // Scotland
  "Scotland|Premiership": 179,
  "Scotland|Championship": 180,
  "Scotland|League One": 181,
  // Spain
  "Spain|La Liga": 140,
  "Spain|La Liga 2": 141,
  // Italy
  "Italy|Serie A": 135,
  "Italy|Serie B": 136,
  // Germany
  "Germany|Bundesliga": 78,
  "Germany|2. Bundesliga": 79,
  "Germany|3. Liga": 195,
  // France
  "France|Ligue 1": 61,
  "France|Ligue 2": 62,
  // Netherlands
  "Netherlands|Eredivisie": 88,
  "Netherlands|Eerste Divisie": 90,
  // Portugal
  "Portugal|Primeira Liga": 94,
  "Portugal|Liga Portugal 2": 95,
  // Turkey
  "Turkey|Super Lig": 203,
  // Austria
  "Austria|Bundesliga": 218,
  "Austria|2. Liga": 219,
  // Switzerland
  "Switzerland|Super League": 207,
  "Switzerland|Challenge League": 208,
  // Sweden
  "Sweden|Allsvenskan": 113,
  "Sweden|Superettan": 114,
  // Hungary / Bulgaria (có thể khác tuỳ mùa; nếu sai sẽ fallback)
  "Hungary|NB I": 271,
  "Bulgaria|First League": 157,
};

const LEAGUES_EU = Object.keys(LEAGUE_ID_MAP).map(k => {
  const [country, league] = k.split("|");
  return { country, league, sport: sportKey(country, league) };
});

// sport key cho The Odds API (giải có feed totals)
function sportKey(country, league) {
  const m = {
    "England|Premier League": "soccer_epl",
    "Spain|La Liga": "soccer_spain_la_liga",
    "Italy|Serie A": "soccer_italy_serie_a",
    "Germany|Bundesliga": "soccer_germany_bundesliga",
    "France|Ligue 1": "soccer_france_ligue_one",
    "Netherlands|Eredivisie": "soccer_netherlands_eredivisie",
    "Portugal|Primeira Liga": "soccer_portugal_primeira_liga",
    "Turkey|Super Lig": "soccer_turkey_super_lig",
    "Scotland|Premiership": "soccer_scotland_premiership",
    "Austria|Bundesliga": "soccer_austria_bundesliga",
    "Switzerland|Super League": "soccer_switzerland_superleague",
    "Sweden|Allsvenskan": "soccer_sweden_allsvenskan",
  };
  return m[`${country}|${league}`] || null;
}

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
  // 1) map tĩnh
  const key = `${country}|${league}`;
  if (LEAGUE_ID_MAP[key]) return LEAGUE_ID_MAP[key];

  // 2) search theo tên, lọc country
  // (một số giải đặt tên khác, ví dụ "Premier League" vs "Premier League 2024/2025")
  const js = await afGet("/leagues", { search: league });
  for (const row of js?.response || []) {
    const ctry = row?.country?.name;
    const name = row?.league?.name;
    if (!ctry || !name) continue;
    if (ctry.toLowerCase() === country.toLowerCase() &&
        name.toLowerCase().includes(league.toLowerCase())) {
      return row.league.id;
    }
  }
  return null;
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
      let id = LEAGUE_ID_MAP[k] || null;
      if (!id) {
        try { id = await resolveLeagueId(c,l); }
        catch (e) { errors.push({ league: {country:c, league:l}, error: `resolve failed: ${String(e)}` }); }
      }
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
      } catch (e) {
        errors.push({ league: lg, error: String(e) });
      }
    }

    all.sort((a,b)=> new Date(a.dateUTC)-new Date(b.dateUTC));
    if (!all.length) return Response.json({ ok:false, hours, count: 0, errors });
    return Response.json({ ok:true, hours, count: all.length, fixtures: all.slice(0, 120) });
  } catch (e) {
    return Response.json({ ok:false, error: String(e) }, { status: 500 });
  }
}
