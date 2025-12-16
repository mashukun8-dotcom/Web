"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../../lib/supabase";

type Req = {
  id: string;
  user_id: string;
  work_date: string; // YYYY-MM-DD
  request_type: "edit_day";
  payload: any;
  reason: string; // "1".."5" もしくは文字列
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  decided_at: string | null;
};

type EmpMini = {
  user_id: string;
  employee_no: string | null;
  full_name: string | null;
};

type DayBase = {
  in_at: string | null;
  out_at: string | null;
  break_minutes: number;
  location: string | null;
};

function safeStr(v: any) {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
}

// local: "YYYY-MM-DDTHH:mm" (JST) -> ISO(UTC)
function jstLocalToISO(local: string | null) {
  const s = safeStr(local);
  if (!s) return null;

  const [date, time] = s.split("T");
  if (!date || !time) return null;

  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d || hh == null || mm == null) return null;

  // JST = UTC+9
  const utc = new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0));
  return utc.toISOString();
}

function reasonLabel(code: any) {
  const c = String(code ?? "").trim();
  switch (c) {
    case "1":
      return "打刻忘れ";
    case "2":
      return "誤操作";
    case "3":
      return "端末/通信エラー";
    case "4":
      return "直行/直帰";
    case "5":
      return "その他";
    default:
      return c || "-";
  }
}

function statusLabel(s: Req["status"]) {
  if (s === "pending") return "承認待ち";
  if (s === "approved") return "承認済み";
  if (s === "rejected") return "却下";
  return s;
}

function fmtPayloadJP(payload: any) {
  const p = payload ?? {};
  const lines: string[] = [];

  // 送られてくる形式に合わせて、ある項目だけ表示（空は出さない）
  const inLocal = safeStr(p.in_at_local);
  const outLocal = safeStr(p.out_at_local);

  if (inLocal) lines.push(`出勤：${inLocal.split("T")[1] ?? inLocal}（時刻）`);
  if (outLocal) lines.push(`退勤：${outLocal.split("T")[1] ?? outLocal}（時刻）`);

  // 休憩（分）
  if (p.break_minutes !== undefined && p.break_minutes !== null && String(p.break_minutes).trim() !== "") {
    lines.push(`休憩：${Number(p.break_minutes)} 分`);
  }

  // 勤務場所
  if (p.location !== undefined) {
    const loc = safeStr(p.location);
    lines.push(`勤務場所：${loc ?? "（空）"}`);
  }

  if (lines.length === 0) return "（変更なし）";
  return lines.join(" / ");
}

export default function AdminRequestsPage() {
  const r = useRouter();
  const supabase = getSupabase() as any;

  const [label, setLabel] = useState("確認中...");
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);

  // user_id -> employee info
  const [empMap, setEmpMap] = useState<Record<string, EmpMini>>({});

  const pendingCount = useMemo(
    () => rows.filter((x) => x.status === "pending").length,
    [rows]
  );

  const load = async () => {
    setMsg("");
    const { data: u, error: uerr } = await supabase.auth.getUser();
    if (uerr) return setMsg(uerr.message);
    if (!u.user) return r.push("/login");

    setLabel(u.user.email ?? `uid: ${u.user.id}`);

    // 1) 申請一覧
    const res = await supabase
      .from("attendance_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(800);

    if (res.error) return setMsg(res.error.message);

    const reqs = (res.data ?? []) as Req[];
    setRows(reqs);

    // 2) 申請に出てきた user_id の社員情報をまとめて取得
    const uids = Array.from(new Set(reqs.map((x) => x.user_id))).filter(Boolean);
    if (uids.length === 0) {
      setEmpMap({});
      return;
    }

    const emps = await supabase
      .from("employees")
      .select("user_id,employee_no,full_name")
      .in("user_id", uids)
      .limit(2000);

    if (emps.error) {
      // 名前が取れなくても申請自体は見せたいので落とさない
      setEmpMap({});
      return;
    }

    const map: Record<string, EmpMini> = {};
    for (const e of (emps.data ?? []) as EmpMini[]) map[e.user_id] = e;
    setEmpMap(map);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayUser = (uid: string) => {
    const e = empMap[uid];
    const no = (e?.employee_no ?? "").trim();
    const name = (e?.full_name ?? "").trim();
    if (no && name) return `${no} ${name}`;
    if (name) return name;
    if (no) return no;
    return uid; // 最後の手段
  };

  const applyEditDaySafely = async (x: Req) => {
    const p = x.payload ?? {};

    // 変更が1つも無い申請なら触らない
    const hasAnyChange =
      (p.in_at_local && String(p.in_at_local).trim()) ||
      (p.out_at_local && String(p.out_at_local).trim()) ||
      (p.break_minutes !== undefined &&
        p.break_minutes !== null &&
        String(p.break_minutes).trim() !== "") ||
      (p.location !== undefined);

    if (!hasAnyChange) return;

    // 既存行を取得（無ければデフォルト）
    const cur = await supabase
      .from("attendance_days")
      .select("in_at,out_at,break_minutes,location")
      .eq("user_id", x.user_id)
      .eq("work_date", x.work_date)
      .maybeSingle();

    if (cur.error) throw cur.error;

    const base: DayBase = (cur.data as any) ?? {
      in_at: null,
      out_at: null,
      break_minutes: 0,
      location: null,
    };

    // payloadに値がある項目だけ更新（NULL上書きしない）
    const inLocal = safeStr(p.in_at_local);
    const outLocal = safeStr(p.out_at_local);

    const inISO = inLocal ? jstLocalToISO(inLocal) : base.in_at;
    const outISO = outLocal ? jstLocalToISO(outLocal) : base.out_at;

    let breakMins = base.break_minutes ?? 0;
    if (
      p.break_minutes !== undefined &&
      p.break_minutes !== null &&
      String(p.break_minutes).trim() !== ""
    ) {
      breakMins = Number(p.break_minutes);
    }
    if (!Number.isFinite(breakMins) || breakMins < 0 || breakMins > 24 * 60) {
      throw new Error("休憩分が不正です（0〜1440）");
    }

    let loc: string | null = base.location ?? null;
    if (p.location !== undefined) {
      loc = safeStr(p.location);
    }

    const up2 = await supabase
      .from("attendance_days")
      .upsert(
        {
          user_id: x.user_id,
          work_date: x.work_date,
          in_at: inISO,
          out_at: outISO,
          break_minutes: breakMins,
          location: loc,
        },
        { onConflict: "user_id,work_date" }
      );

    if (up2.error) throw up2.error;
  };

  const approveAndApply = async (x: Req) => {
    const note = prompt("承認メモ（任意）") ?? "";

    setBusy(true);
    setMsg("");
    try {
      // 1) 申請を承認に更新
      const up1 = await supabase
        .from("attendance_requests")
        .update({
          status: "approved",
          admin_note: note.trim() ? note.trim() : null,
          decided_at: new Date().toISOString(),
        })
        .eq("id", x.id);

      if (up1.error) throw up1.error;

      // 2) 勤怠へ反映（安全）
      if (x.request_type === "edit_day") {
        await applyEditDaySafely(x);
      }

      await load();
      setMsg("承認して反映しました");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (x: Req) => {
    const note = prompt("却下理由（任意）") ?? "";

    setBusy(true);
    setMsg("");
    try {
      const { error } = await supabase
        .from("attendance_requests")
        .update({
          status: "rejected",
          admin_note: note.trim() ? note.trim() : null,
          decided_at: new Date().toISOString(),
        })
        .eq("id", x.id);

      if (error) throw error;
      await load();
      setMsg("却下しました");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>修正申請（管理者）</h1>
      <p>ログイン中：{label}</p>
      <p>
        承認待ち：<b>{pendingCount}</b> 件
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => r.push("/admin")}>
          管理者へ戻る
        </button>
        <button disabled={busy} onClick={load}>
          更新
        </button>
      </div>

      {msg && <p style={{ color: "crimson", marginTop: 10 }}>{msg}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>勤務日</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>社員</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>内容</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>理由</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>状態</th>
            <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}></th>
          </tr>
        </thead>

        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{x.work_date}</td>

              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                <div style={{ fontWeight: 600 }}>{displayUser(x.user_id)}</div>
                <div style={{ fontFamily: "monospace", color: "#666", fontSize: 12 }}>{x.user_id}</div>
              </td>

              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                {fmtPayloadJP(x.payload)}
              </td>

              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                {reasonLabel(x.reason)}
              </td>

              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                {statusLabel(x.status)}
              </td>

              <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                {x.status === "pending" ? (
                  <>
                    <button disabled={busy} onClick={() => approveAndApply(x)}>承認</button>
                    <button disabled={busy} style={{ marginLeft: 8 }} onClick={() => reject(x)}>却下</button>
                  </>
                ) : (
                  <span style={{ color: "#666" }}>
                    {x.status === "approved" ? "承認済み" : "却下"}{x.decided_at ? "" : ""}
                  </span>
                )}
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 8 }}>
                申請がありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}