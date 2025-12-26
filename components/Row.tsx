import Link from "next/link";
import Image from "next/image";
import { formatDuration } from "@/lib/utils";

export type CourseCard = {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  duration_seconds: number | null;
};

export default function Row({
  title,
  courses,
}: {
  title: string;
  courses: CourseCard[];
}) {
  if (!courses?.length) return null;

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between px-1">
        <h2 className="text-lg font-semibold tracking-wide">{title}</h2>
        <span className="text-xs text-white/60">{courses.length} video(s)</span>
      </div>

      <div className="row-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
        {courses.map((c) => (
          <Link
            key={c.id}
            href={`/v/${c.id}`}
            className="group relative min-w-[220px] max-w-[220px] rounded-xl overflow-hidden border border-white/10 bg-black/30 hover:border-white/20 transition"
          >
            <div className="relative h-[130px] w-full bg-white/5">
              {c.cover_image_url ? (
                <Image
                  src={c.cover_image_url}
                  alt={c.title}
                  fill
                  className="object-cover transition duration-300 group-hover:scale-[1.06]"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-xs text-white/50">
                  Sin portada
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
              <div className="absolute left-3 bottom-3 right-3">
                <div className="text-xs text-white/70">{formatDuration(c.duration_seconds)}</div>
              </div>
            </div>

            <div className="p-3">
              <div className="font-medium leading-tight line-clamp-2">{c.title}</div>
              <p className="mt-2 text-xs text-white/60 line-clamp-2">{c.description ?? ""}</p>
            </div>

            <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition">
              <div className="absolute inset-0 shadow-lift" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
