export async function GET() {
  const ok = !!process.env.OPENAI_API_KEY;
  return Response.json({ ok: true, openai_key_detected: ok ? "YES" : "NO" });
}
