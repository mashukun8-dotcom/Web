"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabase } from "../../../../lib/supabase";

/* =====================
   型定義
===================== */

type EmployeeRow = {
  employee_no: string | null;
};

type AttendanceDay = {
  user_id: string;
  work_date: string; // YYYY-MM-DD
  in_at: string | null;
  out_at: string | null;
  break_minutes: number;
  location: string | null;
  updated_at: string;
};

/* =====================
   ユーティリティ
===================== */

const hmJSTFromISO = (iso: string | null) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
};

const fmtMinutes = (m: number) => {
  const mm = Math.max(0, Math.floor(m));
  const h = Math.floor(mm / 60);
  const r = mm % 60;
  return `${h}h ${String(r).padStart(2, "0")}m`;
};

/* =====================
   ページ本体
===================== */

export default function AdminEmployeePage() {
  const r = useRouter();
  const params = useParams();
  const uid = String((params as any)?.uid ?? "");

  const [label, setLabel] = useState("確認中...");
  const [employeeNo, setEmployeeNo] = useState("");
  const [rows, setRows] = useState<AttendanceDay[]>([]);
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [msg, setMsg] = useState("");

  /* =====================
     データ取得
  ===================== */

  const load = async () => {
    setMsg("");
    const supabase = getSupabase();

    // 管理者ログイン確認
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return r.push("/login");

    setLabel(u.user.email ?? u.user.id);

    // 社員番号取得（★ never 回避）
    const emp = await supabase
      .from("employees")
      .select("employee_no")
      .eq("user_id", uid)
      .maybeSingle<EmployeeRow>();

    setEmployeeNo(emp.data?.employee_no ?? "");

    // 勤怠取得
    const days = await supabase
      .from("attendance_days")
      .select(
        "user_id,work_date,in_at,out_at,break_minutes,location,updated_at"
      )
      .eq("user_id", uid)
      .order("work_date", { ascending: false })
      .limit(400);

    if (days.error) {
      setMsg(days.error.message);
      return;
    }

    setRows(days.data ?? []);
  };

  useEffect(() => {
    if (!uid) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  /* =====================
     月フィルタ
  ===================== */

  const monthRows = useMemo(
    () => rows.filter((r) => r.work_date.startsWith(month)),
    [rows, month]
  );

  const totalNet = useMemo(
    () =>
      monthRows.reduce((s, x) => {
        if (!x.in_at || !x.out_at) return s;
        const mins =
          (new Date(x.out_at).getTime() -
            new Date(x.in_at).getTime()) /
            60000 -
          (x.break_minutes ?? 0);
        return s + Math.max(0, mins);
      }, 0),
    [monthRows]
  );

  /* =====================
     表示
  ===================== */

  return (
    <main style={{ padding: 24 }}>
      <h1>社員別 勤怠（管理者）</h1>

      <p>ログイン中：{label}</p>
      <p>
        対象社員：<b>{employeeNo || "（社員番号未設定）"}</b>
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => r.push("/admin")}>管理者へ戻る</button>
        <button onClick={load}>更新</button>
      </div>

      {msg && <p style={{ color: "crimson" }}>{msg}</p>}

      <div style={{ marginTop: 12 }}>
        <label>
          対象月：
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="YYYY-MM"
            style={{ marginLeft: 8, padding: 4 }}
          />
        </label>
      </div>

      <p style={{ marginTop: 8 }}>
        今月の実労働合計：<b>{fmtMinutes(totalNet)}</b>
      </p>

      <table
        style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}
      >
        <thead>
          <tr>
            <th style={{ padding: 6, borderBottom: "1px solid #ddd" }}>日付</th>
            <th style={{ padding: 6, borderBottom: "1px solid #ddd" }}>出勤</th>
            <th style={{ padding: 6, borderBottom: "1px solid #ddd" }}>退勤</th>
            <th style={{ padding: 6, borderBottom: "1px solid #ddd" }}>休憩</th>
            <th style={{ padding: 6, borderBottom: "1px solid #ddd" }}>実労働</th>
            <th style={{ padding: 6, borderBottom: "1px solid #ddd" }}>場所</th>
          </tr>
        </thead>
        <tbody>
          {monthRows.map((x) => {
            const net =
              x.in_at && x.out_at
                ? Math.max(
                    0,
                    (new Date(x.out_at).getTime() -
                      new Date(x.in_at).getTime()) /
                      60000 -
                      (x.break_minutes ?? 0)
                  )
                : 0;

            return (
              <tr key={`${x.user_id}-${x.work_date}`}>
                <td style={{ padding: 6 }}>{x.work_date}</td>
                <td style={{ padding: 6 }}>{hmJSTFromISO(x.in_at)}</td>
                <td style={{ padding: 6 }}>{hmJSTFromISO(x.out_at)}</td>
                <td style={{ padding: 6 }}>
                  {fmtMinutes(x.break_minutes ?? 0)}
                </td>
                <td style={{ padding: 6 }}>{fmtMinutes(net)}</td>
                <td style={{ padding: 6 }}>{x.location || "-"}</td>
              </tr>
            );
          })}

          {monthRows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 8 }}>
                この月の勤怠データがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}