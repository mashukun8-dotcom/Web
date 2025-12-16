"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../../lib/supabase";
import TopNav from "../../_components/TopNav";
import { period16to15 } from "../../../lib/period";

type Row = {
  user_id: string;
  work_date: string; // YYYY-MM-DD
  in_at: string | null;
  out_at: string | null;
  break_minutes: number | null;
  location: string | null;
  employee_no: string | null;
  full_name: string | null;
};

const jstHM = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("ja-JP", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const diffMins = (a: string | null, b: string | null) =>
  a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000) : 0;

const hhmm = (m: number) => {
  const mm = Math.max(0, Math.floor(m));
  return `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}`;
};

const csv = (v: any) => {
  const s = (v ?? "").toString();
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replaceAll('"', '""')}"`
    : s;
};

export default function AdminExportPage() {
  const r = useRouter();
  const supabase = getSupabase() as any;

  const [periodMonth, setPeriodMonth] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" }).slice(0, 7)
  );
  const [label, setLabel] = useState("確認中...");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return r.replace("/login");
      setLabel(data.user.email ?? data.user.id);
    })();
  }, [r, supabase]);

  const download = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { start, end, label: periodLabel } = period16to15(periodMonth);

      const res = await supabase
        .from("attendance_days_v")
        .select("user_id,work_date,in_at,out_at,break_minutes,location,employee_no,full_name")
        .gte("work_date", start)
        .lte("work_date", end)
        .order("employee_no", { ascending: true })
        .order("work_date", { ascending: true })
        .limit(50000);

      if (res.error) throw res.error;

      const rows = (res.data ?? []) as Row[];

      const header = [
        "社員番号",
        "氏名",
        "勤務日",
        "出勤",
        "退勤",
        "休憩(分)",
        "実働",
        "残業(8h超)",
        "勤務場所",
        "締期間",
        "uid",
      ];
      const lines = [header.map(csv).join(",")];

      for (const x of rows) {
        const gross = diffMins(x.in_at, x.out_at);
        const br = Number(x.break_minutes ?? 0);
        const net = Math.max(0, gross - br);
        const ot = Math.max(0, net - 8 * 60);

        lines.push(
          [
            x.employee_no ?? "",
            x.full_name ?? "",
            x.work_date,
            jstHM(x.in_at),
            jstHM(x.out_at),
            br,
            hhmm(net),
            hhmm(ot),
            x.location ?? "",
            periodLabel,
            x.user_id,
          ].map(csv).join(",")
        );
      }

      const filename = `attendance_all_${periodMonth}_cutoff16-15.csv`;
      const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = (() => {
    try {
      const { label } = period16to15(periodMonth);
      return label;
    } catch {
      return "";
    }
  })();

  return (
    <main style={{ padding: 24 }}>
      <TopNav showAdmin title="管理者：CSV出力（16〜15）" />

      <h1 style={{ marginTop: 12 }}>全社員 締日CSV出力（16〜15）</h1>
      <p>ログイン中：{label}</p>

      <div style={{ marginTop: 12 }}>
        <label>
          対象（YYYY-MM）：
          <input
            value={periodMonth}
            onChange={(e) => setPeriodMonth(e.target.value.trim())}
            style={{ marginLeft: 8, padding: 6 }}
            placeholder="2025-12"
          />
        </label>

        <button style={{ marginLeft: 12 }} disabled={busy} onClick={download}>
          全社員CSVダウンロード
        </button>
      </div>

      {preview && <p style={{ marginTop: 10, color: "#555" }}>締期間：{preview}</p>}
      {msg && <p style={{ color: "crimson", marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
