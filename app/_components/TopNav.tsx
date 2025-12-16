"use client";

import { useRouter } from "next/navigation";
import { getSupabase } from "../../lib/supabase";

function clearSupabaseStorage() {
  try {
    if (typeof window === "undefined") return;
    for (const k of Object.keys(localStorage)) {
      if (k.toLowerCase().includes("supabase")) localStorage.removeItem(k);
    }
    for (const k of Object.keys(sessionStorage)) {
      if (k.toLowerCase().includes("supabase")) sessionStorage.removeItem(k);
    }
  } catch {}
}

export default function TopNav({
  showAdmin,
  title = "勤怠システム",
}: {
  showAdmin?: boolean;
  title?: string;
}) {
  const r = useRouter();

  const logout = async () => {
    const supabase = getSupabase() as any;
    await supabase.auth.signOut();
    clearSupabaseStorage();
    r.replace("/login");
    r.refresh?.();
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <b style={{ marginRight: 8 }}>{title}</b>
      <button onClick={() => r.replace("/")}>勤怠（ホーム）へ</button>
      {showAdmin && <button onClick={() => r.replace("/admin")}>管理者へ</button>}
      <button onClick={logout}>ログアウト</button>
    </div>
  );
}
