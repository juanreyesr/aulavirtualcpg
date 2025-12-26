"use client";

import { useMemo, useState } from "react";

type Question = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
};

export default function QuizRunner({
  quizId,
  courseId,
  courseTitle,
  questions,
}: {
  quizId: string;
  courseId: string;
  courseTitle: string;
  questions: Question[];
}) {
  const [fullName, setFullName] = useState("");
  const [colegiado, setColegiado] = useState("");
  const [answers, setAnswers] = useState<Record<string, "A" | "B" | "C" | "">>(() => {
    const init: Record<string, any> = {};
    questions.forEach((q) => (init[q.id] = ""));
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { passed: boolean; score: number; attemptId: string; verifyCode?: string; folioCode?: string | null }>(null);
  const allAnswered = useMemo(() => questions.every((q) => !!answers[q.id]), [answers, questions]);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          colegiado,
          answers: answers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error en el envío.");
      setResult({ passed: data.passed, score: data.score, attemptId: data.attemptId, verifyCode: data.verifyCode, folioCode: data.folioCode });
    } catch (e: any) {
      alert(e?.message ?? "No se pudo enviar la evaluación.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
        <div className="text-xs uppercase tracking-[0.25em] text-white/60">Evaluación</div>
        <h1 className="mt-2 text-2xl font-semibold">{courseTitle}</h1>
        <p className="mt-2 text-sm text-white/70">
          Responde 10 preguntas. Aprobación: 80% o más. El sistema autocorrige y, si apruebas, habilita la descarga del certificado.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-white/70">
            Nombre completo
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
              required
            />
          </label>
          <label className="block text-xs text-white/70">
            Número de colegiado
            <input
              value={colegiado}
              onChange={(e) => setColegiado(e.target.value)}
              className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
              required
            />
          </label>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {questions.map((q, idx) => (
          <div key={q.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <div className="text-sm font-medium">{idx + 1}. {q.question}</div>
            <div className="mt-3 grid gap-2">
              {(["A", "B", "C"] as const).map((opt) => {
                const label = opt === "A" ? q.option_a : opt === "B" ? q.option_b : q.option_c;
                const checked = answers[q.id] === opt;
                return (
                  <label key={opt} className={`flex items-center gap-3 rounded-xl border px-3 py-2 cursor-pointer ${checked ? "border-white/30 bg-white/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}>
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      value={opt}
                      checked={checked}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                    />
                    <span className="text-sm text-white/80">{label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          disabled={loading || !allAnswered || !fullName.trim() || !colegiado.trim() || !!result}
          onClick={submit}
          className="rounded-full bg-cpgRed px-5 py-2 text-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Enviando..." : "Enviar evaluación"}
        </button>

        {result && (
          <div className="text-sm text-white/80">
            Resultado: <span className="font-semibold">{result.score}%</span> — {result.passed ? "Aprobado" : "No aprobado"}
            {result.passed && result.folioCode ? (
              <div className="mt-1 text-xs text-white/60">Folio: <span className="text-white/80">{result.folioCode}</span></div>
            ) : null}
          </div>
        )}

        {result?.passed && (
          <a
            href={`/api/certificates/${result.attemptId}`}
            className="rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-5 py-2 text-sm"
          >
            Descargar certificado (PDF)
          </a>
        )}

        {result?.passed && result.verifyCode && (
          <a
            href={`/certificates/${result.verifyCode}`}
            className="text-xs text-white/60 hover:text-white"
          >
            Verificación pública del certificado
          </a>
        )}
      </div>

      <p className="mt-4 text-xs text-white/50">
        Si el sistema indica “Duración pendiente” en el certificado, el administrador debe actualizar la duración del video (YouTube API) desde Administración.
      </p>
    </div>
  );
}
