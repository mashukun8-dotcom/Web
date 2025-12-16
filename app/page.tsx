"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../lib/supabase";
import TopNav from "./_components/TopNav";

type Ev = {
  id: string;
  type: "in" | "out" | "break_in" | "break_out";
  happened_at: string;
  work_date: string; // YYYY-MM-DD
  location?: string | null;
};

const STANDARD_DAY_MINS = 8 * 60; // 1日8時間超えを残業とする（480分）

function ymdJST(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}
function hmJST(date: Date) {
  return date.toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtMinutes(mins: number) {
  const m = Math.max(0, Math.floor(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${String(r).padStart(2, "0")}m`;
}

function calcDay(events: Ev[], ymd: string, today: string) {
  const day = events
    .filter((e) => e.work_date === ymd)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.happened_at).getTime() - new Date(b.happened_at).getTime()
    );

  const firstIn = day.find((x) => x.type === "in");
  const lastOut = [...day].reverse().find((x) => x.type === "out");

  const now = new Date();
  const workStart = firstIn ? new Date(firstIn.happened_at) : null;
  const workEnd = lastOut
    ? new Date(lastOut.happened_at)
    : ymd === today && workStart
    ? now
    : null;

  // 休憩計算（break_in〜break_out）
  let breakMins = 0;
  let openBreak: Date | null = null;

  for (const ev of day) {
    if (ev.type === "break_in") openBreak = new Date(ev.happened_at);
    if (ev.type === "break_out" && openBreak) {
      breakMins +=
        (new Date(ev.happened_at).getTime() - openBreak.getTime()) / 60000;
      openBreak = null;
    }
  }
  if (openBreak && ymd === today) {
    breakMins += (now.getTime() - openBreak.getTime()) / 60000;
  }

  const grossMins =
    workStart && workEnd
      ? Math.max(0, (workEnd.getTime() - workStart.getTime()) / 60000)
      : 0;

  const netMins = Math.max(0, grossMins - breakMins);

  // ✅ 残業（1日8h超え）
  const overtimeMins = Math.max(0, netMins - STANDARD_DAY_MINS);

  let status = "未出勤";
  if (workStart && !lastOut) status = ymd === today ? "勤務中" : "退勤未打刻";
  if (workStart && lastOut) status = "退勤済み";

  const has = (t: Ev["type"]) => day.some((x) => x.type === t);

  // 勤務場所（入れるなら in の location を優先）
  const location =
    (firstIn as any)?.location ??
    [...day].reverse().find((x: any) => x.location)?.location ??
    null;

  return {
    ymd,
    status,
    inAt: workStart,
    outAt: lastOut ? new Date(lastOut.happened_at) : null,
    grossMins,
    breakMins,
    netMins,
    overtimeMins,
    location,
    flags: {
      in: has("in"),
      out: has("out"),
      break_in: has("break_in"),
      break_out: has("break_out"),
    },
  };
}

export default function Home() {
  const r = useRouter();
  const [label, setLabel] = useState("確認中...");
  const [approved, setApproved] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [events, setEvents] = useState<Ev[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const today = useMemo(() => ymdJST(new Date()), []);
  const thisMonth = useMemo(() => today.slice(0, 7), [today]);

  const load = async () => {
    setMsg("");
    const supabase = getSupabase() as any;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return r.push("/login");

    setLabel(u.user.email ?? `user_id: ${u.user.id}`);

    const emp = await supabase
      .from("employees")
      .select("approved,is_admin,employee_no,full_name")
      .eq("user_id", u.user.id)
      .maybeSingle();

    if (emp.error || !emp.data) {
      setApproved(false);
      setIsAdmin(false);
      setEvents([]);
      return;
    }

    setApproved(!!emp.data.approved);
    setIsAdmin(!!emp.data.is_admin);

    // ✅ 名前表示も入れる（name未登録ならemail）
    const name = (emp.data.full_name ?? "").trim();
    if (name) setLabel(`${name}（${u.user.email ?? u.user.id}）`);

    if (!emp.data.approved) {
      setEvents([]);
      return;
    }

    const ev = await supabase
      .from("attendance_events")
      .select("id,type,happened_at,work_date,location")
      .order("happened_at", { ascending: false })
      .limit(800);

    if (ev.error) return setMsg(ev.error.message);
    setEvents((ev.data ?? []) as any);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todaySum = useMemo(() => calcDay(events, today, today), [events, today]);

  const monthDays = useMemo(() => {
    const keys = Array.from(new Set(events.map((e) => e.work_date)))
      .filter((k) => k.startsWith(thisMonth))
      .sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => calcDay(events, k, today));
  }, [events, thisMonth, today]);

  const monthNet = useMemo(
    () => monthDays.reduce((s, d) => s + d.netMins, 0),
    [monthDays]
  );

  // ✅ 月間残業合計
  const monthOver = useMemo(
    () => monthDays.reduce((s, d) => s + d.overtimeMins, 0),
    [monthDays]
  );

  const punch = async (type: Ev["type"]) => {
    setMsg("");
    setBusy(true);
    try {
      const supabase = getSupabase() as any;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return r.push("/login");

      const { error } = await supabase
        .from("attendance_events")
        .insert({ user_id: u.user.id, type });

      if (error) setMsg(error.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const downloadCSV = () => {
    const header = [
      "date",
      "status",
      "in",
      "out",
      "gross_minutes",
      "break_minutes",
      "net_minutes",
      "overtime_minutes",
    ];
    const lines = [header.join(",")];

    for (const d of monthDays.slice().reverse()) {
      lines.push(
        [
          d.ymd,
          d.status,
          d.inAt ? hmJST(d.inAt) : "",
          d.outAt ? hmJST(d.outAt) : "",
          Math.round(d.grossMins),
          Math.round(d.breakMins),
          Math.round(d.netMins),
          Math.round(d.overtimeMins),
        ].join(",")
      );
    }

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${thisMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const logout = async () => {
    const supabase = getSupabase() as any;
    await supabase.auth.signOut();
    r.push("/login");
  };

  if (approved === false) {
    return (
      <main style={{ padding: 24, maxWidth: 720 }}>
        <h1>勤怠</h1>
        <p>ログイン中：{label}</p>
        <p style={{ color: "crimson" }}>
          まだ社員登録（承認）が完了していません。先に申請してください。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => r.push("/apply")}>社員登録申請へ</button>
          {isAdmin && <button onClick={() => r.push("/admin")}>管理者へ</button>}
          <button onClick={logout}>ログアウト</button>
        </div>
        {msg && <p style={{ color: "crimson" }}>{msg}</p>}
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>勤怠</h1>
      <p>ログイン中：{label}</p>

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={logout}>
          ログアウト
        </button>
        {isAdmin && (
          <button disabled={busy} onClick={() => r.push("/admin")}>
            管理者
          </button>
        )}
        <button disabled={busy} onClick={downloadCSV}>
          CSVダウンロード
        </button>
      </div>

      {msg && <p style={{ color: "crimson" }}>{msg}</p>}

      <h2 style={{ marginTop: 18 }}>今日（{today}）</h2>
      <p>
        状態：<b>{todaySum.status}</b>
      </p>
      <p>
        出勤：{todaySum.inAt ? hmJST(todaySum.inAt) : "-"} / 退勤：
        {todaySum.outAt ? hmJST(todaySum.outAt) : "-"}
      </p>
      <p>
        総労働：<b>{fmtMinutes(todaySum.grossMins)}</b> ／ 休憩：
        <b>{fmtMinutes(todaySum.breakMins)}</b> ／ 実労働：
        <b>{fmtMinutes(todaySum.netMins)}</b>
      </p>
      <p>
        ✅ 残業（8h超）：<b>{fmtMinutes(todaySum.overtimeMins)}</b>
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button disabled={busy || todaySum.flags.in} onClick={() => punch("in")}>
          出勤
        </button>
        <button
          disabled={busy || !todaySum.flags.in || todaySum.flags.out}
          onClick={() => punch("out")}
        >
          退勤
        </button>

        {/* 休憩開始/終了ボタンは消す要望があったので表示しない */}
      </div>

      <h2 style={{ marginTop: 22 }}>今月（{thisMonth}）</h2>
      <p>
        今月の実労働合計：<b>{fmtMinutes(monthNet)}</b>
      </p>
      <p>
        ✅ 今月の残業合計（8h超）：<b>{fmtMinutes(monthOver)}</b>
      </p>

      <h3 style={{ marginTop: 12 }}>日別</h3>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ddd" }}>日付</th>
            <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ddd" }}>状態</th>
            <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ddd" }}>出勤</th>
            <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ddd" }}>退勤</th>
            <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ddd" }}>休憩</th>
            <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ddd" }}>実労働</th>
            <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ddd" }}>残業(8h超)</th>
          </tr>
        </thead>
        <tbody>
          {monthDays.map((d) => (
            <tr key={d.ymd}>
              <td style={{ padding: 6, borderBottom: "1px solid #eee" }}>{d.ymd}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #eee" }}>{d.status}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #eee" }}>{d.inAt ? hmJST(d.inAt) : "-"}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #eee" }}>{d.outAt ? hmJST(d.outAt) : "-"}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #eee" }}>{fmtMinutes(d.breakMins)}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #eee" }}>{fmtMinutes(d.netMins)}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #eee" }}>
                {fmtMinutes(d.overtimeMins)}
              </td>
            </tr>
          ))}
          {monthDays.length === 0 && (
            <tr>
              <td style={{ padding: 6 }} colSpan={7}>
                今月の打刻がまだありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}