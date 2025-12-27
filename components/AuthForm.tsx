"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm() {
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/";
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Cuenta creada. Revisa tu correo si tu proyecto requiere confirmación de email.");
      }
    } catch (err: any) {
      setMsg(err?.message ?? "No se pudo completar la acción.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}</h2>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-xs text-white/70 hover:text-white"
        >
          {mode === "signin" ? "Crear cuenta" : "Ya tengo cuenta"}
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-xs text-white/70">
          Correo
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
          />
        </label>

        <label className="block text-xs text-white/70">
          Contraseña
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
          />
        </label>

        <button
          disabled={loading}
          className="w-full rounded-full bg-cpgBlue px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Procesando..." : mode === "signin" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>

      {msg && <p className="mt-3 text-xs text-white/70">{msg}</p>}

      <p className="mt-4 text-xs text-white/50">
        Nota: En producción, se recomienda restringir el registro a agremiados (por invitación o verificación interna).
      </p>
    </div>
  );
}
