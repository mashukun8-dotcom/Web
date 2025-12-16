"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../lib/supabase";

export default function ApplyPage() {
  const r = useRouter();
  const supabase = getSupabase() as any;

  const [fullName, setFullName] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) r.push("/login");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = async () => {
    setMsg("");
    const name = fullName.trim();
    const no = employeeNo.trim();

    if (!name) return setMsg("名前を入力してね（必須）");
    if (!no) return setMsg("社員番号を入力してね（必須）");

    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return r.push("/login");

      // 申請：approved=false
      const res = await supabase.from("employees").upsert(
        {
          user_id: u.user.id,
          employee_no: no,
          full_name: name,
          approved: false,
          is_admin: false,
        },
        { onConflict: "user_id" }
      );

      if (res.error) throw res.error;

      setMsg("申請しました。管理者の承認待ちです。");
      // 申請後トップへ戻す（任意）
      setTimeout(() => r.push("/"), 800);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h1>社員登録申請</h1>

      <label>
        氏名（必須）
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="例：服部 真周"
          style={{ width: "100%", padding: 8, marginTop: 6 }}
        />
      </label>

      <label style={{ display: "block", marginTop: 12 }}>
        社員番号（必須）
        <input
          value={employeeNo}
          onChange={(e) => setEmployeeNo(e.target.value)}
          placeholder="例：E25-0001"
          style={{ width: "100%", padding: 8, marginTop: 6 }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button disabled={busy} onClick={apply}>申請する</button>
        <button disabled={busy} onClick={() => r.push("/")}>戻る</button>
      </div>

      {msg && <p style={{ color: msg.includes("申請") ? "green" : "crimson", marginTop: 12 }}>{msg}</p>}
    </main>
  );
}