"use client";
import { useState, useEffect } from "react";

/** Chuẩn hoá ngày từ Date -> YYYY-MM-DD, tránh lệch múi giờ */
function toISODateFromDateObj(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  // Dùng UTC để không bị lệch ngày theo timezone người dùng
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Chuẩn hoá mọi kiểu input date về YYYY-MM-DD */
function normalizeDateFromInput(e) {
  // 1) Trường hợp chuẩn: input type=date thường đã là YYYY-MM-DD
  const v = e.target.value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // 2) Trình duyệt không trả YYYY-MM-DD, thử valueAsDate (khi chọn từ lịch)
  const d = e.target.valueAsDate;
  if (d) return toISODateFromDateObj(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));

  // 3) Cuối cùng: cố parse chuỗi hiển thị
  const parsed = new Date(v);
  if (!isNaN(parsed)) return toISODateFromDateObj(new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())));
  return "";
}

export default function OverUnderForm() {
  const [form, setForm] = useState({
    home: "Tottenham Hotspur",
    away: "Chelsea",
    country: "England",
    league: "Premier League",
    // Lưu hai trường: displayDate (để hiển thị trong input) & dateISO (để gửi lên server)
    displayDate: "2025-11-02",
    dateISO: "2025-11-02",
    line: 2.5,
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [debug, setDebug] = useState(null);

  // Khi người dùng chọn ngày từ lịch
  const onDateChange = (e) => {
    const iso = normalizeDateFromInput(e); // luôn thành YYYY-MM-DD
    setForm((f) => ({ ...f, displayDate: e.target.value || iso, dateISO: iso }));
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const runPrediction = async () => {
    setLoading(true);
    setResult("");
    setDebug(null);

    // Server hiện chưa dùng date để gọi API; nếu bạn muốn chỉ dùng cho hiển thị,
    // có thể bỏ qua. Ở đây mình vẫn gửi dateISO để bạn thấy đầu–cuối khớp nhau.
    const payload = {
      home: form.home,
      away: form.away,
      country: form.country,
      league: form.league,
      date: form.dateISO || "",   // luôn là YYYY-MM-DD (hoặc rỗng)
      line: Number(form.line),
    };

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}

      if (!res.ok) {
        setResult("⚠️ Lỗi từ server.");
        setDebug({ status: res.status, raw: text });
        return;
      }
      if (!data || !data.ok) {
        setResult("⚠️ Server trả về cấu trúc không hợp lệ.");
        setDebug({ raw: text });
        return;
      }

      const pOver = data.result?.p_over ?? 0;
      const pUnder = data.result?.p_under ?? 0;

      setResult(`P(Over): ${(pOver * 100).toFixed(1)}%\nP(Under): ${(pUnder * 100).toFixed(1)}%`);
      setDebug({
        inputs_sent: payload,        // bạn xem được dateISO đã gửi
        lambdas: data.lambdas,
        data_used: data.data_used,
      });
    } catch (err) {
      setResult("⚠️ Không thể kết nối server.");
      setDebug({ error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const checkSources = async () => {
    setLoading(true);
    setDebug(null);
    try {
      const [fx, wx, ox] = await Promise.allSettled([
        fetch(`/api/sources/fixture?home=${encodeURIComponent(form.home)}&away=${encodeURIComponent(form.away)}`).then(r=>r.json()),
        // City thật tốt nhất nên cho nhập riêng; tạm dùng London để minh hoạ
        fetch(`/api/sources/weather?city=${encodeURIComponent("London")}&country=${encodeURIComponent(form.country)}`).then(r=>r.json()),
        fetch(`/api/sources/odds?home=${encodeURIComponent(form.home)}&away=${encodeURIComponent(form.away)}&country=${encodeURIComponent(form.country)}&league=${encodeURIComponent(form.league)}&line=${encodeURIComponent(form.line)}`).then(r=>r.json()),
      ]);
      setDebug({
        fixture: fx.status === "fulfilled" ? fx.value : { error: String(fx.reason) },
        weather: wx.status === "fulfilled" ? wx.value : { error: String(wx.reason) },
        odds:    ox.status === "fulfilled" ? ox.value : { error: String(ox.reason) },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "32px auto", background: "#fff", padding: 16, borderRadius: 16, boxShadow: "0 6px 20px rgba(0,0,0,0.06)" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>⚽ Over/Under Predictor (Web Mini)</h2>

      <div style={{ display: "grid", gap: 8 }}>
        <input name="home" value={form.home} onChange={handleChange} placeholder="Home team" />
        <input name="away" value={form.away} onChange={handleChange} placeholder="Away team" />
        <input name="country" value={form.country} onChange={handleChange} placeholder="Country (ví dụ: England)" />
        <input name="league" value={form.league} onChange={handleChange} placeholder="League (ví dụ: Premier League)" />
        <input
          name="date"
          type="date"
          value={form.displayDate}
          onChange={onDateChange}
        />
        <input name="line" type="number" step="0.25" value={form.line} onChange={handleChange} />

        <button onClick={runPrediction} disabled={loading} style={{ padding: 10, borderRadius: 12, background: "#2563eb", color: "#fff", fontWeight: 600 }}>
          {loading ? "Đang mô phỏng..." : "Chạy mô phỏng"}
        </button>
        <button onClick={checkSources} disabled={loading} style={{ padding: 10, borderRadius: 12, background: "#eef2ff", color: "#1e293b", fontWeight: 600 }}>
          Kiểm tra nguồn (hiện JSON)
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 12, background: "#f8fafc", padding: 12, borderRadius: 12, border: "1px solid #e2e8f0", whiteSpace: "pre-wrap" }}>
          {result}
        </div>
      )}

      {debug && (
        <pre style={{ marginTop: 12, background: "#f1f5f9", padding: 12, borderRadius: 12, border: "1px solid #e2e8f0", maxHeight: 360, overflow: "auto" }}>
{JSON.stringify(debug, null, 2)}
        </pre>
      )}
    </div>
  );
}
