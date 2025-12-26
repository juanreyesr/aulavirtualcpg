import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/utils";

export default async function VideoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("id,title,description,youtube_video_id,youtube_url,cover_image_url,duration_seconds,published")
    .eq("id", params.id)
    .maybeSingle();

  if (!course || !course.published) {
    return (
      <div className="py-10">
        <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
          <h1 className="text-2xl font-semibold">Video no disponible</h1>
          <p className="mt-2 text-white/70">Este contenido no existe o no está publicado.</p>
          <Link href="/" className="mt-4 inline-block rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-5 py-2 text-sm">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id,is_enabled,pass_percent")
    .eq("course_id", course.id)
    .maybeSingle();

  const videoId = course.youtube_video_id || null;
  const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : null;

  return (
    <div className="py-8">
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <div className="flex-1">
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title={course.title}
                className="w-full aspect-video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="aspect-video grid place-items-center text-white/60">
                Video pendiente de configuración.
              </div>
            )}
          </div>

          <h1 className="mt-5 text-2xl font-semibold">{course.title}</h1>
          <div className="mt-2 text-sm text-white/70">{course.description}</div>

          <div className="mt-3 text-xs text-white/60">
            Duración: <span className="text-white/80">{formatDuration(course.duration_seconds)}</span>
          </div>

          {course.youtube_url && (
            <a
              href={course.youtube_url}
              target="_blank"
              className="mt-4 inline-block text-xs text-white/60 hover:text-white"
              rel="noreferrer"
            >
              Abrir en YouTube
            </a>
          )}
        </div>

        <aside className="w-full md:w-[340px]">
          <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
            <h2 className="text-lg font-semibold">Evaluación y certificado</h2>
            <p className="mt-2 text-sm text-white/70">
              {quiz?.is_enabled
                ? "Realiza la evaluación para obtener tu certificado."
                : "La evaluación de este video aún no está habilitada."}
            </p>

            <div className="mt-4 space-y-2">
              {quiz?.is_enabled ? (
                <Link href={`/v/${course.id}/quiz`} className="block text-center rounded-full bg-cpgRed px-5 py-2 text-sm hover:opacity-90">
                  Hacer evaluación
                </Link>
              ) : (
                <span className="block text-center rounded-full bg-white/10 border border-white/10 px-5 py-2 text-sm text-white/50">
                  Evaluación no disponible
                </span>
              )}

              <Link href="/" className="block text-center rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-5 py-2 text-sm">
                Seguir explorando
              </Link>
            </div>

            <div className="mt-5 text-xs text-white/50">
              Criterio de aprobación: {quiz?.pass_percent ?? 80}% o más.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
