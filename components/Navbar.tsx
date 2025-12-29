"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Navbar() {
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!active) return;
      setEmail(user?.email ?? null);
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        setIsAdmin(profile?.role === "admin");
      } else {
        setIsAdmin(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setEmail(session?.user?.email ?? null);
      if (session?.user?.id) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
        setIsAdmin(profile?.role === "admin");
      } else {
        setIsAdmin(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-black/40 border-b border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
        <Link href="/" className="font-semibold tracking-wide text-lg">
          <span className="text-cpgGold">Aula</span> Virtual CPG
        </Link>

        <nav className="ml-2 hidden sm:flex items-center gap-3 text-sm text-white/80">
          <Link href="/" className="hover:text-white">Inicio</Link>
          <Link href="/my" className="hover:text-white">Mi progreso</Link>
          {isAdmin && <Link href="/admin" className="hover:text-white">Administración</Link>}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {email ? (
            <>
              <span className="text-xs text-white/70 hidden md:block">{email}</span>
              <button onClick={signOut} className="text-xs px-3 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/10">
                Cerrar sesión
              </button>
            </>
          ) : (
            <Link href="/login" className="text-xs px-3 py-2 rounded-full bg-cpgBlue hover:opacity-90">
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
