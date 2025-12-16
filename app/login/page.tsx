"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../lib/supabase";

export default function LoginPage() {
  const r = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setMsg("");
    const e = email.trim();
    const p = pw.trim();
    if (!e) return setMsg("メールアドレスを入力してね");
    if (!p) return setMsg("パスワードを入力してね");

    const supabase = getSupabase();
    let error: any = null;

    if (mode === "login") {
      ({ error } = await supabase.auth.signInWithPassword({ email: e, password: p }));
    } else {
      ({ error } = await supabase.auth.signUp({ email: e, password: p }));
    }

    if (error) return setMsg(error.message);
    r.push("/");
  };

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>勤怠ログイン</h1>

      <input
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 8, marginTop: 8 }}
      />

      <input
        placeholder="password"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        style={{ width: "100%", padding: 8, marginTop: 8 }}
      />

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button onClick={submit}>{mode === "login" ? "ログイン" : "新規登録"}</button>
        <button onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "新規登録へ" : "ログインへ"}
        </button>
      </div>

      {msg && <p style={{ color: "crimson", marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
