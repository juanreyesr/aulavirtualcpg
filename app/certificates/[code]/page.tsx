import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDuration } from "@/lib/utils";

export default async function CertificateVerifyPage({ params }: { params: { code: string } }) {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_certificate_public", { p_code: params.code });

  const row = (!error && data) ? (Array.isArray(data) ? data[0] : data) : null;

  if (!row?.verify_code) {
    return (
      <div className="py-10">
        <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
          <h1 className="text-2xl font-semibold">Certificado no válido</h1>
          <p className="mt-2 text-white/70">No se encontró un certificado aprobado para este código.</p>
          <Link href="/" className="mt-4 inline-block rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-5 py-2 text-sm">
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10">
      <div className="rounded-2xl border border-white/10 bg-black/35 p-8">
        <div className="text-xs uppercase tracking-[0.25em] text-white/60">Verificación de certificado</div>
        <h1 className="mt-2 text-2xl font-semibold">Certificado válido</h1>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/60">Folio</div>
            <div className="mt-1 font-medium">{row.folio_code}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/60">Fecha de emisión</div>
            <div className="mt-1 font-medium">{new Date(row.issued_at).toLocaleDateString("es-GT", { year: "numeric", month: "long", day: "2-digit" })}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/60">Nombre</div>
            <div className="mt-1 font-medium">{row.full_name}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/60">No. colegiado</div>
            <div className="mt-1 font-medium">{row.colegiado}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 sm:col-span-2">
            <div className="text-xs text-white/60">Curso</div>
            <div className="mt-1 font-medium">{row.course_title ?? "Curso"}</div>
            <div className="mt-1 text-xs text-white/60">Duración certificada: {formatDuration(row.duration_seconds ?? null)}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <a href={`/api/public/certificates/${row.verify_code}`} className="rounded-full bg-cpgRed px-5 py-2 text-sm hover:opacity-90">
            Descargar PDF
          </a>
          <Link href="/" className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-5 py-2 text-sm">
            Inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
