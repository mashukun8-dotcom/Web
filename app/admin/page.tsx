"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../lib/supabase";
import TopNav from "../_components/TopNav";

type Emp = {
  user_id: string;
  employee_no: string | null;
  full_name: string | null;
  approved: boolean;
  is_admin: boolean;
};

export default function AdminPage() {
  const r = useRouter();
  const supabase = getSupabase() as any;

  const [label, setLabel] = useState("確認中...");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Emp[]>([]);
  const [q, setQ] = useState("");

  const load = async () => {
    setMsg("");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return r.replace("/login");
    setLabel(u.user.email ?? u.user.id);

    const res = await supabase
      .from("employees")
      .select("user_id,employee_no,full_name,approved,is_admin")
      .order("employee_no", { ascending: true })
      .limit(2000);

    if (res.error) return setMsg(res.error.message);
    setRows((res.data ?? []) as Emp[]);
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

  return (
    <main style={{ padding: 24 }}>
      <TopNav showAdmin={true} title="管理者" />

      <h1 style={{ marginTop: 12 }}>管理者</h1>
      <p>ログイン中：{label}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => r.push("/admin/requests")}>
          修正申請（承認）
        </button>

        <button disabled={busy} onClick={() => r.push("/admin/employees")}>
          社員一覧（氏名編集）
        </button>

        <button disabled={busy} onClick={() => r.push("/admin/export")}>
          月次CSV（全社員）
        </button>

        <button disabled={busy} onClick={load}>
          更新
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="検索（社員番号 / 氏名 / uid）"
          style={{ width: "100%", maxWidth: 520, padding: 8 }}
        />
      </div>

      {msg && <p style={{ color: "crimson", marginTop: 10 }}>{msg}</p>}

      <h2 style={{ marginTop: 18 }}>社員一覧（社員別勤怠へ）</h2>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>社員</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>承認</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>管理者</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>uid</th>
            <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((x) => {
            const name = (x.full_name ?? "").trim();
            const no = (x.employee_no ?? "").trim();
            const display = no && name ? `${no} ${name}` : name ? name : no ? no : "(未設定)";
            return (
              <tr key={x.user_id}>
                <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 600 }}>
                  {display}
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{x.approved ? "true" : "false"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{x.is_admin ? "true" : "false"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>
                  {x.user_id}
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                  <button onClick={() => r.push(`/admin/employee/${x.user_id}`)}>勤怠を見る</button>
                </td>
              </tr>
            );
          })}

          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 8 }}>
                該当なし
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
