import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative mt-6 rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-r from-black/70 via-black/30 to-black/60">
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(229,9,20,0.55),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.10),transparent_50%)]" />
      <div className="relative p-8 md:p-10">
        <div className="text-xs uppercase tracking-[0.25em] text-white/60">Colegio de Psicólogos de Guatemala</div>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold leading-tight">
          Aula Virtual estilo “Netflix” para capacitación y certificación
        </h1>
        <p className="mt-3 max-w-2xl text-sm md:text-base text-white/70">
          Explora videos por categoría, revisa los recién añadidos y realiza evaluaciones autocorregibles.
          Al aprobar con 80% o más, descarga tu certificado con horas certificadas según la duración del video.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="#recientes" className="px-4 py-2 rounded-full bg-cpgRed hover:opacity-90 text-sm">
            Ver recién añadidos
          </Link>
          <Link href="/login" className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-sm">
            Iniciar sesión
          </Link>
        </div>
      </div>
    </section>
  );
}
