const MAP = {
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
export async function GET(req) {
  try {
    if (!process.env.ODDS_API_KEY) return Response.json({ error: "Missing ODDS_API_KEY" }, { status: 500 });
    const { searchParams } = new URL(req.url);
    const home = searchParams.get("home"); const away = searchParams.get("away");
    const country = searchParams.get("country"); const league = searchParams.get("league");
    const line = parseFloat(searchParams.get("line") || "2.5");
    if (!home || !away || !country || !league) return Response.json({ error: "home, away, country, league required" }, { status: 400 });

    const sport = MAP[`${country}|${league}`];
    if (!sport) return Response.json({ error: "league not mapped" }, { status: 400 });

    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
    url.searchParams.set("apiKey", process.env.ODDS_API_KEY);
    url.searchParams.set("regions", "eu");
    url.searchParams.set("markets", "totals");
    url.searchParams.set("oddsFormat", "decimal");

    const resp = await fetch(url, { cache: "no-store" });
    const list = await resp.json();
    if (!resp.ok) throw new Error(JSON.stringify(list));

    const norm = (s)=> (s||"").trim().toLowerCase();
    let best = null;
    for (const ev of list || []) {
      if (norm(ev.home_team) !== norm(home) || norm(ev.away_team) !== norm(away)) continue;
      for (const bm of ev.bookmakers || []) {
        for (const mk of bm.markets || []) {
          if (mk.key !== "totals") continue;
          const points = {};
          for (const o of mk.outcomes || []) { const pt = parseFloat(o.point); (points[pt] ||= []).push(o); }
          for (const pt of Object.keys(points)) {
            const diff = Math.abs(parseFloat(pt) - line);
            const over = points[pt].find(x=>norm(x.name)==="over");
            const under= points[pt].find(x=>norm(x.name)==="under");
            if (over && under) {
              const cand = { diff, bookmaker: bm.key, line: parseFloat(pt), over: over.price, under: under.price };
              if (!best || cand.diff < best.diff) best = cand;
            }
          }
        }
      }
    }
    return Response.json({ source: "the-odds-api", query: { home, away, country, league, line }, best });
  } catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
}
