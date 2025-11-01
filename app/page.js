"use client";
import { useState } from "react";

export default function OverUnderForm() {
  const [form, setForm] = useState({
    home: "Manchester City",
    away: "Liverpool",
    country: "England",
    league: "Premier League",
    date: "2025-05-10",
    line: 2.5,
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const runPrediction = async () => {
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setResult(data.result ?? "Không có kết quả");
    } catch {
      setResult("Không thể kết nối server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: "32px auto", background: "#fff", padding: 16, borderRadius: 16, boxShadow: "0 6px 20px rgba(0,0,0,0.06)" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>⚽ Over/Under Predictor (Web Mini)</h2>

      <div style={{ display: "grid", gap: 8 }}>
        <input name="home" value={form.home} onChange={handleChange} placeholder="Home team" />
        <input name="away" value={form.away} onChange={handleChange} placeholder="Away team" />
        <input name="country" value={form.country} onChange={handleChange} placeholder="Country (ví dụ: England)" />
        <input name="league" value={form.league} onChange={handleChange} placeholder="League (ví dụ: Premier League)" />
        <input name="date" type="date" value={form.date} onChange={handleChange} />
        <input name="line" type="number" step="0.25" value={form.line} onChange={handleChange} />

        <button onClick={runPrediction} disabled={loading} style={{ padding: 10, borderRadius: 12, background: "#2563eb", color: "#fff", fontWeight: 600 }}>
          {loading ? "Đang mô phỏng..." : "Chạy mô phỏng"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 12, background: "#f8fafc", padding: 12, borderRadius: 12, border: "1px solid #e2e8f0", whiteSpace: "pre-wrap" }}>
          {result}
        </div>
      )}
    </div>
  );
}
