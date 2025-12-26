import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function MyPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return (
      <div className="py-10">
        <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
          <h1 className="text-2xl font-semibold">Mi progreso</h1>
          <p className="mt-2 text-white/70">Debes iniciar sesión para ver tus evaluaciones y certificados.</p>
          <Link className="mt-4 inline-block rounded-full bg-cpgRed px-5 py-2 text-sm" href="/login">
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id,score_percent,passed,created_at,course_id,verify_code")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);

  const attemptIds = (attempts ?? []).filter((a: any) => a.passed).map((a: any) => a.id);

  const { data: certs } = attemptIds.length
    ? await supabase
        .from("certificates")
        .select("attempt_id,folio_code")
        .in("attempt_id", attemptIds)
    : { data: [] as any[] };

  const folioMap = new Map<string, string>();
  (certs ?? []).forEach((c: any) => {
    if (c?.attempt_id && c?.folio_code) folioMap.set(c.attempt_id, c.folio_code);
  });

  return (
    <div className="py-8">
      <h1 className="text-2xl font-semibold">Mi progreso</h1>
      <p className="mt-2 text-sm text-white/70">Evaluaciones recientes y certificados disponibles.</p>

      <div className="mt-6 space-y-3">
        {(attempts ?? []).length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-white/70">
            Aún no has realizado evaluaciones.
          </div>
        )}

        {(attempts ?? []).map((a: any) => (
          <div key={a.id} className="rounded-2xl border border-white/10 bg-black/30 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-sm text-white/70">Puntaje</div>
              <div className="text-xl font-semibold">{Math.round(a.score_percent)}%</div>
              <div className="mt-1 text-xs text-white/60">{a.passed ? "Aprobado" : "No aprobado"}</div>
              {a.passed && folioMap.get(a.id) ? (
                <div className="mt-1 text-xs text-white/60">Folio: <span className="text-white/80">{folioMap.get(a.id)}</span></div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/v/${a.course_id}`} className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm">
                Ver video
              </Link>
              {a.passed && (
                <a href={`/api/certificates/${a.id}`} className="rounded-full bg-cpgRed hover:opacity-90 px-4 py-2 text-sm">
                  Descargar certificado
                </a>
              )}
              {a.passed && a.verify_code && (
                <Link href={`/certificates/${a.verify_code}`} className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm">
                  Verificación
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
