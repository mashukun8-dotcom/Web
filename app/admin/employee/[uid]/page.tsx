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

  const supabase = getSupabase() as any;

  const [label, setLabel] = useState("確認中...");
  const [employeeNo, setEmployeeNo] = useState("");
  const [month, setMonth] = useState(() => ymdJST(new Date()).slice(0, 7)); // YYYY-MM
  const [events, setEvents] = useState<Ev[]>([]);
  const [msg, setMsg] = useState("");

  const today = useMemo(() => ymdJST(new Date()), []);

  const load = async () => {
    setMsg("");

    // auth
    const { data: u, error: uerr } = await supabase.auth.getUser();
    if (uerr) return setMsg(uerr.message);
    if (!u.user) return r.push("/login");
    setLabel(u.user.email ?? `uid: ${u.user.id}`);

    if (!uid) {
      setMsg("uid が不正です");
      return;
    }

    // 社員番号取得（型引数を使わず any で読む）
    const empRes = await supabase
      .from("employees")
      .select("employee_no,full_name")
      .eq("user_id", uid)
      .maybeSingle();

    if (empRes.error) return setMsg(empRes.error.message);
    const emp = (empRes.data ?? null) as any;
    setEmployeeNo(emp?.employee_no ?? "");

    // 勤怠イベント取得
    const evRes = await supabase
      .from("attendance_events")
      .select("id,user_id,type,happened_at,work_date,location")
      .eq("user_id", uid)
      .order("happened_at", { ascending: false })
      .limit(5000);

    if (evRes.error) return setMsg(evRes.error.message);
    setEvents((evRes.data ?? []) as Ev[]);
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

  return (
    <main style={{ padding: 24 }}>
      <TopNav showAdmin title="社員別 勤怠" />

      <h1 style={{ marginTop: 12 }}>社員別 勤怠</h1>
      <p>管理者ログイン中：{label}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={() => r.push("/admin")}>管理者へ戻る</button>
        <button onClick={load}>更新</button>
      </div>

      {msg && <p style={{ color: "crimson" }}>{msg}</p>}

      <h2 style={{ marginTop: 18 }}>
        対象：{employeeNo || "(社員番号未設定)"} / uid: {uid}
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
        今月の実労働合計：<b>{fmtMinutes(totalNet)}</b>
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
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
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
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 8 }}>
                この月の打刻がありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}