"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../../lib/supabase";

type EmpRow = {
  user_id: string;
  employee_no: string | null;
  full_name: string | null;
  approved: boolean;
  is_admin: boolean;
  updated_at: string;
};

export default function AdminEmployeesPage() {
  const r = useRouter();
  const supabase = getSupabase() as any;

  const [label, setLabel] = useState("確認中...");
  const [rows, setRows] = useState<EmpRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    setMsg("");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return r.push("/login");

    setLabel(u.user.email ?? u.user.id);

    // 管理者だけが全員を見れる（RLSはSQLで入れた is_admin 関数で制御）
    const res = await supabase
      .from("employees")
      .select("user_id,employee_no,full_name,approved,is_admin,updated_at")
      .order("employee_no", { ascending: true })
      .limit(2000);

    if (res.error) return setMsg(res.error.message);
    setRows((res.data ?? []) as EmpRow[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((x) => {
      const a = (x.employee_no ?? "").toLowerCase();
      const b = (x.full_name ?? "").toLowerCase();
      const c = x.user_id.toLowerCase();
      return a.includes(s) || b.includes(s) || c.includes(s);
    });
  }, [rows, q]);

  const saveName = async (user_id: string, full_name: string) => {
    const name = full_name.trim();
    if (!name) return setMsg("名前は空にできません");

    setBusy(true);
    setMsg("");
    try {
      const res = await supabase
        .from("employees")
        .update({ full_name: name })
        .eq("user_id", user_id);

      if (res.error) throw res.error;
      await load();
      setMsg("保存しました");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>社員一覧（管理者）</h1>
      <p>ログイン中：{label}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => r.push("/admin")}>管理者へ戻る</button>
        <button disabled={busy} onClick={load}>更新</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="検索（社員番号 / 氏名 / uid）"
          style={{ width: "100%", maxWidth: 520, padding: 8 }}
        />
      </div>

      {msg && <p style={{ color: msg.includes("保存") ? "green" : "crimson", marginTop: 10 }}>{msg}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>社員番号</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>氏名（編集）</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>承認</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>管理者</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>uid</th>
            <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((x) => (
            <Row key={x.user_id} x={x} onSave={saveName} busy={busy} />
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 8 }}>該当なし</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

function Row({
  x,
  onSave,
  busy,
}: {
  x: EmpRow;
  onSave: (user_id: string, full_name: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(x.full_name ?? "");
  useEffect(() => setName(x.full_name ?? ""), [x.full_name]);

  return (
    <tr>
      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{x.employee_no ?? "-"}</td>
      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", padding: 6, maxWidth: 360 }}
          placeholder="氏名"
        />
      </td>
      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{x.approved ? "true" : "false"}</td>
      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{x.is_admin ? "true" : "false"}</td>
      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{x.user_id}</td>
      <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
        <button disabled={busy} onClick={() => onSave(x.user_id, name)}>保存</button>
      </td>
    </tr>
  );
}