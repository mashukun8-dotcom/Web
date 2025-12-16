"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabase } from "../../../../lib/supabase";
import TopNav from "../../../_components/TopNav";

type Ev = {
  id: string;
  user_id: string;
  type: "in" | "out" | "break_in" | "break_out";
  happened_at: string;
  work_date: string; // YYYY-MM-DD
  location: string | null;
};

const ymdJST = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });

const hmJST = (d: Date) =>
  d.toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtMinutes = (m: number) => {
  const mm = Math.max(0, Math.floor(m));
  const h = Math.floor(mm / 60);
  const r = mm % 60;
  return `${h}h ${String(r).padStart(2, "0")}m`;
};

function calcDay(events: Ev[], ymd: string, today: string) {
  const day = events
    .filter((e) => e.work_date === ymd)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.happened_at).getTime() - new Date(b.happened_at).getTime()
    );

  const firstIn = day.find((e) => e.type === "in");
  const lastOut = [...day].reverse().find((e) => e.type === "out");

  const start = firstIn ? new Date(firstIn.happened_at) : null;
  const end = lastOut
    ? new Date(lastOut.happened_at)
    : start && ymd === today
    ? new Date()
    : null;

  // 休憩計算（休憩開始/終了が残っている前提。ボタンは消していても過去データがある場合に対応）
  let breakMins = 0;
  let open: Date | null = null;
  for (const e of day) {
    if (e.type === "break_in") open = new Date(e.happened_at);
    if (e.type === "break_out" && open) {
      breakMins +=
        (new Date(e.happened_at).getTime() - open.getTime()) / 60000;
      open = null;
    }
  }
  if (open && ymd === today) breakMins += (Date.now() - open.getTime()) / 60000;

  const gross = start && end ? (end.getTime() - start.getTime()) / 60000 : 0;
  const net = Math.max(0, gross - breakMins);

  const location =
    firstIn?.location ??
    [...day].reverse().find((x) => x.location)?.location ??
    "";

  return { ymd, start, end, breakMins, netMins: net, location };
}

export default function AdminEmployeePage() {
  const r = useRouter();
  const params = useParams();
  const uid = (params as any)?.uid as string;

  // ✅ 型引数を一切使わないため、supabase は any で統一（Vercel build で落ちない）
  const supabase = getSupabase() as any;

  const [label, setLabel] = useState("確認中...");
  const [employeeNo, setEmployeeNo] = useState("");
  const [fullName, setFullName] = useState<string>("");
  const [month, setMonth] = useState(() => ymdJST(new Date()).slice(0, 7)); // YYYY-MM
  const [events, setEvents] = useState<Ev[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const today = useMemo(() => ymdJST(new Date()), []);

  const load = async () => {
    setMsg("");
    setBusy(true);
    try {
      // auth
      const { data: u, error: uerr } = await supabase.auth.getUser();
      if (uerr) return setMsg(uerr.message);
      if (!u.user) return r.push("/login");
      setLabel(u.user.email ?? `uid: ${u.user.id}`);

      if (!uid) {
        setMsg("uid が不正です");
        return;
      }

      // 社員情報（employee_no, full_name）
      const empRes = await supabase
        .from("employees")
        .select("employee_no,full_name")
        .eq("user_id", uid)
        .maybeSingle();

      if (empRes.error) return setMsg(empRes.error.message);

      const emp = (empRes.data ?? null) as any;
      setEmployeeNo(emp?.employee_no ?? "");
      setFullName(emp?.full_name ?? "");

      // イベント
      const evRes = await supabase
        .from("attendance_events")
        .select("id,user_id,type,happened_at,work_date,location")
        .eq("user_id", uid)
        .order("happened_at", { ascending: false })
        .limit(5000);

      if (evRes.error) return setMsg(evRes.error.message);
      setEvents((evRes.data ?? []) as Ev[]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const rows = useMemo(() => {
    const keys = Array.from(new Set(events.map((e) => e.work_date)))
      .filter((d) => d.startsWith(month))
      .sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => calcDay(events, k, today));
  }, [events, month, today]);

  const totalNet = useMemo(
    () => rows.reduce((s, d) => s + d.netMins, 0),
    [rows]
  );

  const totalOver = useMemo(() => {
    // 8h超を残業（分）
    const overMins = rows.reduce((s, d) => s + Math.max(0, d.netMins - 8 * 60), 0);
    return overMins;
  }, [rows]);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      r.push("/login");
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <TopNav showAdmin title="社員別 勤怠" />

      <h1 style={{ marginTop: 12 }}>社員別 勤怠</h1>
      <p>管理者ログイン中：{label}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button disabled={busy} onClick={() => r.push("/admin")}>管理者へ戻る</button>
        <button disabled={busy} onClick={() => r.push("/")}>勤怠（ホーム）へ</button>
        <button disabled={busy} onClick={load}>更新</button>
        <button disabled={busy} onClick={logout}>ログアウト</button>
      </div>

      {msg && <p style={{ color: "crimson", marginTop: 10 }}>{msg}</p>}

      <h2 style={{ marginTop: 18 }}>
        対象：{employeeNo || "(社員番号未設定)"} {fullName ? ` / ${fullName}` : ""} / uid: {uid}
      </h2>

      <div style={{ marginTop: 10 }}>
        <label>
          対象月（YYYY-MM）：
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value.trim())}
            style={{ marginLeft: 8, padding: 6 }}
            placeholder="2025-12"
          />
        </label>
      </div>

      <p style={{ marginTop: 10 }}>
        今月の実労働合計：<b>{fmtMinutes(totalNet)}</b> ／ 残業（8h超）：<b>{fmtMinutes(totalOver)}</b>
      </p>

      <table
        style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
              勤務日付
            </th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
              勤務時間
            </th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
              休憩時間
            </th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
              勤務場所
            </th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
              残業
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const over = Math.max(0, d.netMins - 8 * 60);
            return (
              <tr key={d.ymd}>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{d.ymd}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  {fmtMinutes(d.netMins)}
                  <span style={{ marginLeft: 10, color: "#666" }}>
                    （{d.start ? hmJST(d.start) : "-"} → {d.end ? hmJST(d.end) : "-"}）
                  </span>
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  {fmtMinutes(d.breakMins)}
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  {d.location || "-"}
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  {over > 0 ? fmtMinutes(over) : "-"}
                </td>
              </tr>
            );
          })}

          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 8 }}>
                この月の打刻がありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}