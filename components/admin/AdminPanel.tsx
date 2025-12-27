"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { extractYouTubeVideoId, formatDuration } from "@/lib/utils";

type Category = { id: string; name: string; slug: string | null; sort_order: number | null };
type Course = {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  cover_image_url: string | null;
  duration_seconds: number | null;
  category_id: string | null;
  published: boolean;
  created_at: string;
};
type Quiz = { id: string; course_id: string; is_enabled: boolean; pass_percent: number };

const CategorySchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  slug: z.string().optional(),
  sort_order: z.coerce.number().int().optional(),
});

const CourseSchema = z.object({
  title: z.string().min(3, "Título requerido"),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  youtube_url: z.string().url("URL inválida").optional(),
  cover_image_url: z.string().url("URL inválida").optional(),
  published: z.boolean().optional(),
});

export default function AdminPanel() {
  const supabase = createClient();

  const [tab, setTab] = useState<"categories" | "courses" | "quizzes" | "certificates" | "security">("courses");

  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [certSettings, setCertSettings] = useState<any>(null);
  const [certificates, setCertificates] = useState<any[]>([]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [catForm, setCatForm] = useState({ name: "", slug: "", sort_order: 1 });
  const [courseForm, setCourseForm] = useState({
    title: "",
    description: "",
    category_id: "",
    youtube_url: "",
    cover_image_url: "",
    published: true,
  });

  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const selectedCourse = useMemo(() => courses.find((c) => c.id === selectedCourseId) ?? null, [courses, selectedCourseId]);
  const selectedQuiz = useMemo(() => quizzes.find((q) => q.course_id === selectedCourseId) ?? null, [quizzes, selectedCourseId]);
  const [questions, setQuestions] = useState<any[]>([]);

  async function refresh() {
    setMsg(null);
    const { data: cats } = await supabase.from("categories").select("*").order("sort_order", { ascending: true });
    const { data: crs } = await supabase.from("courses").select("*").order("created_at", { ascending: false });
    const { data: qz } = await supabase.from("quizzes").select("*");
    setCategories((cats ?? []) as any);
    setCourses((crs ?? []) as any);
    setQuizzes((qz ?? []) as any);
const { data: cs } = await supabase.from("certificate_settings").select("*").eq("id", 1).maybeSingle();
const { data: certs } = await supabase
  .from("certificates")
  .select("attempt_id,folio_code,full_name,colegiado,course_title,issued_at,verify_code")
  .order("issued_at", { ascending: false })
  .limit(50);
setCertSettings(cs ?? null);
setCertificates((certs ?? []) as any[]);

  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!selectedCourseId) {
        setQuestions([]);
        return;
      }
      const q = quizzes.find((x) => x.course_id === selectedCourseId);
      if (!q) { setQuestions([]); return; }
      const { data } = await supabase.from("quiz_questions").select("*").eq("quiz_id", q.id).order("sort_order", { ascending: true });
      setQuestions((data ?? []) as any[]);
    })();
  }, [selectedCourseId, quizzes, supabase]);

  async function addCategory() {
    setBusy(true); setMsg(null);
    try {
      const parsed = CategorySchema.parse(catForm);
      const slug = parsed.slug?.trim() ? parsed.slug!.trim() : parsed.name.toLowerCase().replace(/\s+/g, "-");
      const { error } = await supabase.from("categories").insert({
        name: parsed.name.trim(),
        slug,
        sort_order: parsed.sort_order ?? 1,
      });
      if (error) throw error;
      setCatForm({ name: "", slug: "", sort_order: (parsed.sort_order ?? 1) + 1 });
      await refresh();
      setMsg("Categoría creada.");
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo crear la categoría.");
    } finally {
      setBusy(false);
    }
  }

  async function addCourse() {
    setBusy(true); setMsg(null);
    try {
      const parsed = CourseSchema.parse(courseForm);
      const youtube_video_id = parsed.youtube_url ? extractYouTubeVideoId(parsed.youtube_url) : null;
      const { error } = await supabase.from("courses").insert({
        title: parsed.title.trim(),
        description: parsed.description?.trim() || null,
        category_id: parsed.category_id || null,
        youtube_url: parsed.youtube_url || null,
        youtube_video_id,
        cover_image_url: parsed.cover_image_url || null,
        published: parsed.published ?? true,
      });
      if (error) throw error;
      setCourseForm({ title: "", description: "", category_id: "", youtube_url: "", cover_image_url: "", published: true });
      await refresh();
      setMsg("Video/curso creado.");
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo crear el video/curso.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(courseId: string, published: boolean) {
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase.from("courses").update({ published }).eq("id", courseId);
      if (error) throw error;
      await refresh();
      setMsg("Estado actualizado.");
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo actualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function ensureQuiz(courseId: string) {
    setBusy(true); setMsg(null);
    try {
      const existing = quizzes.find((q) => q.course_id === courseId);
      if (existing) {
        setMsg("Este curso ya tiene evaluación.");
        return;
      }
      const { error } = await supabase.from("quizzes").insert({ course_id: courseId, is_enabled: false, pass_percent: 80 });
      if (error) throw error;
      await refresh();
      setMsg("Evaluación creada (aún deshabilitada).");
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo crear la evaluación.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleQuizEnabled(quizId: string, is_enabled: boolean) {
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase.from("quizzes").update({ is_enabled }).eq("id", quizId);
      if (error) throw error;
      await refresh();
      setMsg("Evaluación actualizada.");
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo actualizar la evaluación.");
    } finally {
      setBusy(false);
    }
  }

  function newQuestionTemplate(idx: number) {
    return {
      question: `Pregunta ${idx + 1}`,
      option_a: "Opción A",
      option_b: "Opción B",
      option_c: "Opción C",
      correct_option: "A",
      sort_order: idx + 1,
    };
  }

  async function seedTenQuestions() {
    if (!selectedQuiz) return;
    setBusy(true); setMsg(null);
    try {
      // enforce exactly 10: delete existing and recreate
      await supabase.from("quiz_questions").delete().eq("quiz_id", selectedQuiz.id);
      const payload = Array.from({ length: 10 }).map((_, idx) => ({
        quiz_id: selectedQuiz.id,
        ...newQuestionTemplate(idx),
      }));
      const { error } = await supabase.from("quiz_questions").insert(payload);
      if (error) throw error;
      const { data } = await supabase.from("quiz_questions").select("*").eq("quiz_id", selectedQuiz.id).order("sort_order", { ascending: true });
      setQuestions((data ?? []) as any[]);
      setMsg("Se cargaron 10 preguntas plantilla (puedes editarlas).");
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudieron crear las preguntas.");
    } finally {
      setBusy(false);
    }
  }

  async function saveQuestions() {
    if (!selectedQuiz) return;
    setBusy(true); setMsg(null);
    try {
      if (questions.length !== 10) throw new Error("La evaluación debe tener exactamente 10 preguntas.");
      for (const q of questions) {
        if (!q.question?.trim()) throw new Error("Todas las preguntas deben tener texto.");
        if (!q.option_a?.trim() || !q.option_b?.trim() || !q.option_c?.trim()) throw new Error("Cada pregunta debe tener 3 opciones.");
        if (!["A","B","C"].includes(q.correct_option)) throw new Error("Respuesta correcta inválida.");
      }
      const updates = questions.map((q) => ({
        id: q.id,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        correct_option: q.correct_option,
        sort_order: q.sort_order,
      }));
      const { error } = await supabase.from("quiz_questions").upsert(updates, { onConflict: "id" });
      if (error) throw error;
      setMsg("Preguntas guardadas.");
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudieron guardar las preguntas.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDuration() {
    if (!selectedCourse?.youtube_video_id) {
      setMsg("Este curso no tiene youtube_video_id. Revisa la URL de YouTube.");
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/youtube/duration?videoId=${encodeURIComponent(selectedCourse.youtube_video_id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo consultar duración.");
      await refresh();
      setMsg(`Duración actualizada: ${formatDuration(data.durationSeconds)}`);
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo actualizar la duración.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Administración</h1>
        <div className="text-xs text-white/60">Gestión de videos, categorías y evaluaciones</div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["courses","categories","quizzes","certificates","security"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm border ${tab === t ? "bg-white/10 border-white/20" : "bg-black/20 border-white/10 hover:border-white/20"}`}
          >
            {t === "courses" ? "Videos" : t === "categories" ? "Categorías" : t === "quizzes" ? "Evaluaciones" : t === "certificates" ? "Certificados" : "Seguridad"}
          </button>
        ))}
        <button
          onClick={refresh}
          className="ml-auto rounded-full px-4 py-2 text-sm bg-black/20 border border-white/10 hover:border-white/20"
        >
          Recargar
        </button>
      </div>

      {msg && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/80">
          {msg}
        </div>
      )}

      {tab === "categories" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
            <h2 className="text-lg font-semibold">Nueva categoría</h2>
            <div className="mt-4 grid gap-3">
              <label className="text-xs text-white/70">
                Nombre
                <input value={catForm.name} onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
              </label>
              <label className="text-xs text-white/70">
                Slug (opcional)
                <input value={catForm.slug} onChange={(e) => setCatForm((p) => ({ ...p, slug: e.target.value }))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
              </label>
              <label className="text-xs text-white/70">
                Orden
                <input type="number" value={catForm.sort_order} onChange={(e) => setCatForm((p) => ({ ...p, sort_order: Number(e.target.value) }))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
              </label>
              <button disabled={busy} onClick={addCategory} className="rounded-full bg-cpgBlue px-5 py-2 text-sm hover:opacity-90 disabled:opacity-60">
                Crear categoría
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
            <h2 className="text-lg font-semibold">Listado</h2>
            <div className="mt-4 space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-white/60">{c.slug ?? ""}</div>
                  </div>
                  <div className="text-xs text-white/50">Orden: {c.sort_order ?? "-"}</div>
                </div>
              ))}
              {categories.length === 0 && <div className="text-sm text-white/60">Aún no hay categorías.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === "courses" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
            <h2 className="text-lg font-semibold">Nuevo video / curso</h2>
            <div className="mt-4 grid gap-3">
              <label className="text-xs text-white/70">
                Título
                <input value={courseForm.title} onChange={(e) => setCourseForm((p) => ({ ...p, title: e.target.value }))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
              </label>
              <label className="text-xs text-white/70">
                Descripción breve
                <textarea value={courseForm.description} onChange={(e) => setCourseForm((p) => ({ ...p, description: e.target.value }))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30 min-h-[90px]" />
              </label>
              <label className="text-xs text-white/70">
                Categoría
                <select value={courseForm.category_id} onChange={(e) => setCourseForm((p) => ({ ...p, category_id: e.target.value }))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30">
                  <option value="">(Sin categoría)</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-white/70">
                URL de YouTube (video)
                <input value={courseForm.youtube_url} onChange={(e) => setCourseForm((p) => ({ ...p, youtube_url: e.target.value }))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
              </label>
              <label className="text-xs text-white/70">
                URL de portada (imagen)
                <input value={courseForm.cover_image_url} onChange={(e) => setCourseForm((p) => ({ ...p, cover_image_url: e.target.value }))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
              </label>
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={courseForm.published} onChange={(e) => setCourseForm((p) => ({ ...p, published: e.target.checked }))} />
                Publicado (visible al agremiado)
              </label>
              <button disabled={busy} onClick={addCourse} className="rounded-full bg-cpgBlue px-5 py-2 text-sm hover:opacity-90 disabled:opacity-60">
                Crear video/curso
              </button>
              <p className="text-xs text-white/50">
                La duración se obtiene vía YouTube Data API y se guarda en la tabla <code>courses.duration_seconds</code>.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
            <h2 className="text-lg font-semibold">Listado</h2>
            <div className="mt-4 space-y-2">
              {courses.map((c) => (
                <div key={c.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{c.title}</div>
                      <div className="mt-1 text-xs text-white/60">{formatDuration(c.duration_seconds)}</div>
                      <div className="mt-1 text-xs text-white/50">{c.published ? "Publicado" : "No publicado"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-xs"
                        onClick={() => togglePublish(c.id, !c.published)}
                        disabled={busy}
                      >
                        {c.published ? "Ocultar" : "Publicar"}
                      </button>
                      <button
                        className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-xs"
                        onClick={() => { setSelectedCourseId(c.id); setTab("quizzes"); }}
                      >
                        Evaluación
                      </button>
                      <a className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-xs" href={`/v/${c.id}`}>
                        Ver
                      </a>
                    </div>
                  </div>
                </div>
              ))}
              {courses.length === 0 && <div className="text-sm text-white/60">Aún no hay videos/cursos.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === "quizzes" && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6">
          <h2 className="text-lg font-semibold">Evaluaciones</h2>
          <p className="mt-2 text-sm text-white/70">
            Selecciona un curso, crea su evaluación, carga 10 preguntas y habilítala cuando esté lista.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/70">
              Curso
              <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30">
                <option value="">(Selecciona)</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/60">Duración del video</div>
              <div className="mt-1 font-medium">{selectedCourse ? formatDuration(selectedCourse.duration_seconds) : "-"}</div>
              <button
                disabled={busy || !selectedCourseId}
                onClick={refreshDuration}
                className="mt-3 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-xs"
              >
                Actualizar duración (YouTube API)
              </button>
              <div className="mt-2 text-[11px] text-white/50">
                Requiere <code>YOUTUBE_API_KEY</code> en Vercel.
              </div>
            </div>
          </div>

          {!selectedCourseId && (
            <div className="mt-4 text-sm text-white/60">Selecciona un curso para administrar su evaluación.</div>
          )}

          {selectedCourseId && !selectedQuiz && (
            <div className="mt-4">
              <button disabled={busy} onClick={() => ensureQuiz(selectedCourseId)} className="rounded-full bg-cpgBlue px-5 py-2 text-sm hover:opacity-90 disabled:opacity-60">
                Crear evaluación para este curso
              </button>
            </div>
          )}

          {selectedQuiz && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-white/70">
                  Estado: <span className="font-semibold text-white">{selectedQuiz.is_enabled ? "Habilitada" : "Deshabilitada"}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    onClick={() => toggleQuizEnabled(selectedQuiz.id, !selectedQuiz.is_enabled)}
                    className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm"
                  >
                    {selectedQuiz.is_enabled ? "Deshabilitar" : "Habilitar"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={seedTenQuestions}
                    className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm"
                  >
                    Cargar plantilla 10 preguntas
                  </button>
                  <button
                    disabled={busy || questions.length !== 10}
                    onClick={saveQuestions}
                    className="rounded-full bg-cpgBlue hover:opacity-90 px-4 py-2 text-sm disabled:opacity-60"
                  >
                    Guardar preguntas
                  </button>
                </div>
              </div>

              <div className="mt-4 text-xs text-white/50">
                Requisito: exactamente 10 preguntas, 3 opciones (A/B/C) y una respuesta correcta.
              </div>

              <div className="mt-4 space-y-3">
                {questions.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                    Aún no hay preguntas. Usa “Cargar plantilla 10 preguntas”.
                  </div>
                )}

                {questions.map((q, idx) => (
                  <div key={q.id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                    <div className="text-sm font-medium">Pregunta {idx + 1}</div>
                    <div className="mt-3 grid gap-3">
                      <label className="text-xs text-white/70">
                        Enunciado
                        <input value={q.question} onChange={(e) => setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, question: e.target.value } : x))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
                      </label>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="text-xs text-white/70">
                          Opción A
                          <input value={q.option_a} onChange={(e) => setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, option_a: e.target.value } : x))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
                        </label>
                        <label className="text-xs text-white/70">
                          Opción B
                          <input value={q.option_b} onChange={(e) => setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, option_b: e.target.value } : x))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
                        </label>
                        <label className="text-xs text-white/70">
                          Opción C
                          <input value={q.option_c} onChange={(e) => setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, option_c: e.target.value } : x))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30" />
                        </label>
                      </div>
                      <label className="text-xs text-white/70">
                        Respuesta correcta
                        <select value={q.correct_option} onChange={(e) => setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, correct_option: e.target.value } : x))} className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30">
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      
{tab === "certificates" && (
  <div className="mt-6 grid gap-4 lg:grid-cols-2">
    <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
      <h2 className="text-lg font-semibold">Configuración del certificado</h2>
      <p className="mt-2 text-sm text-white/70">
        Estos datos se incluyen como “snapshot” en cada certificado emitido (registro histórico).
      </p>

      {!certSettings && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
          No se encontró configuración. Verifica que ejecutaste el SQL v2.
        </div>
      )}

      {certSettings && (
        <div className="mt-4 grid gap-3">
          <label className="text-xs text-white/70">
            Nombre institucional
            <input
              value={certSettings.institution_name ?? ""}
              onChange={(e) => setCertSettings((p: any) => ({ ...p, institution_name: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
          </label>

          <label className="text-xs text-white/70">
            Encabezado (título del certificado)
            <input
              value={certSettings.header_line ?? ""}
              onChange={(e) => setCertSettings((p: any) => ({ ...p, header_line: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
          </label>

          <label className="text-xs text-white/70">
            Logo (URL PNG)
            <input
              value={certSettings.logo_url ?? ""}
              onChange={(e) => setCertSettings((p: any) => ({ ...p, logo_url: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
          </label>

          <label className="text-xs text-white/70">
            Marca de agua (URL PNG, opcional)
            <input
              value={certSettings.background_watermark_url ?? ""}
              onChange={(e) => setCertSettings((p: any) => ({ ...p, background_watermark_url: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
          </label>

          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-medium">Firmante 1</div>
              <label className="mt-3 block text-xs text-white/70">
                Nombre
                <input
                  value={certSettings.signer1_name ?? ""}
                  onChange={(e) => setCertSettings((p: any) => ({ ...p, signer1_name: e.target.value }))}
                  className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
                />
              </label>
              <label className="mt-3 block text-xs text-white/70">
                Cargo
                <input
                  value={certSettings.signer1_title ?? ""}
                  onChange={(e) => setCertSettings((p: any) => ({ ...p, signer1_title: e.target.value }))}
                  className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
                />
              </label>
              <label className="mt-3 block text-xs text-white/70">
                Firma (URL PNG)
                <input
                  value={certSettings.signer1_image_url ?? ""}
                  onChange={(e) => setCertSettings((p: any) => ({ ...p, signer1_image_url: e.target.value }))}
                  className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
                />
              </label>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-medium">Firmante 2</div>
              <label className="mt-3 block text-xs text-white/70">
                Nombre
                <input
                  value={certSettings.signer2_name ?? ""}
                  onChange={(e) => setCertSettings((p: any) => ({ ...p, signer2_name: e.target.value }))}
                  className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
                />
              </label>
              <label className="mt-3 block text-xs text-white/70">
                Cargo
                <input
                  value={certSettings.signer2_title ?? ""}
                  onChange={(e) => setCertSettings((p: any) => ({ ...p, signer2_title: e.target.value }))}
                  className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
                />
              </label>
              <label className="mt-3 block text-xs text-white/70">
                Firma (URL PNG)
                <input
                  value={certSettings.signer2_image_url ?? ""}
                  onChange={(e) => setCertSettings((p: any) => ({ ...p, signer2_image_url: e.target.value }))}
                  className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
                />
              </label>
            </div>
          </div>

          <label className="text-xs text-white/70">
            Nota al pie (opcional)
            <input
              value={certSettings.footer_note ?? ""}
              onChange={(e) => setCertSettings((p: any) => ({ ...p, footer_note: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
          </label>

          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              try {
                const { error } = await supabase
                  .from("certificate_settings")
                  .update({
                    institution_name: certSettings.institution_name,
                    header_line: certSettings.header_line,
                    logo_url: certSettings.logo_url || null,
                    background_watermark_url: certSettings.background_watermark_url || null,
                    signer1_name: certSettings.signer1_name,
                    signer1_title: certSettings.signer1_title,
                    signer1_image_url: certSettings.signer1_image_url || null,
                    signer2_name: certSettings.signer2_name,
                    signer2_title: certSettings.signer2_title,
                    signer2_image_url: certSettings.signer2_image_url || null,
                    footer_note: certSettings.footer_note || null,
                  })
                  .eq("id", 1);

                if (error) throw error;
                await refresh();
                setMsg("Configuración guardada.");
              } catch (e: any) {
                setMsg(e?.message ?? "No se pudo guardar la configuración.");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-full bg-cpgBlue px-5 py-2 text-sm hover:opacity-90 disabled:opacity-60"
          >
            Guardar configuración
          </button>
        </div>
      )}
    </div>

    <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
      <h2 className="text-lg font-semibold">Registro de certificados (últimos 50)</h2>
      <p className="mt-2 text-sm text-white/70">
        Folio correlativo y verificación pública por código.
      </p>

      <div className="mt-4 space-y-2">
        {certificates.map((c) => (
          <div key={c.attempt_id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{c.folio_code ?? "—"}</div>
                <div className="mt-1 text-xs text-white/70">
                  {c.full_name} — {c.colegiado}
                </div>
                <div className="mt-1 text-xs text-white/60 line-clamp-2">{c.course_title}</div>
                <div className="mt-1 text-xs text-white/50">{new Date(c.issued_at).toLocaleString("es-GT")}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/certificates/${c.attempt_id}`} className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-xs">
                  PDF
                </a>
                {c.verify_code ? (
                  <a href={`/certificates/${c.verify_code}`} className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-xs">
                    Verificar
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {certificates.length === 0 && <div className="text-sm text-white/60">Aún no hay certificados emitidos.</div>}
      </div>
    </div>
  </div>
)}

{tab === "security" && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6">
          <h2 className="text-lg font-semibold">Seguridad y operación</h2>
          <ul className="mt-3 list-disc pl-5 text-sm text-white/70 space-y-2">
            <li>
              No se incluyen contraseñas “hardcodeadas” en el repositorio. Los administradores se gestionan en Supabase Auth y por rol <code>profiles.role=admin</code>.
            </li>
            <li>
              Para que la duración del certificado coincida con el video, configura <code>YOUTUBE_API_KEY</code> (YouTube Data API v3) y usa “Actualizar duración”.
            </li>
            <li>
              Recomendación: deshabilitar registro público (signups) y crear cuentas solo para agremiados.
            </li>
            <li>
              Mantén Next.js y React en versiones parchadas. Este repositorio arranca en Next.js 16.0.10 y React 19.2.3.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
