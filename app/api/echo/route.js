export async function POST(req) {
  const bodyText = await req.text();
  let json = null;
  try { json = JSON.parse(bodyText); } catch {}
  return Response.json({
    ok: true,
    received_raw: bodyText,
    received_json: json
  });
}
