import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BodySchema = z.object({
  fullName: z.string().min(3).max(120),
  colegiado: z.string().min(1).max(50),
  answers: z.record(z.string(), z.enum(["A","B","C",""])).refine((r) => Object.values(r).every((v) => v === "A" || v === "B" || v === "C"), {
    message: "Todas las respuestas deben estar seleccionadas (A/B/C).",
  }),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ quizId: string }> }) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const { quizId } = await ctx.params;

  const { data: quiz } = await supabase.from("quizzes").select("id,course_id,is_enabled,pass_percent").eq("id", quizId).maybeSingle();
  if (!quiz || !quiz.is_enabled) return NextResponse.json({ error: "Evaluación no disponible." }, { status: 400 });

  const { data: course } = await supabase.from("courses").select("id,title,duration_seconds,published").eq("id", quiz.course_id).maybeSingle();
  if (!course || !course.published) return NextResponse.json({ error: "Curso no disponible." }, { status: 400 });

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id,correct_option")
    .eq("quiz_id", quiz.id)
    .order("sort_order", { ascending: true });

  if (!questions || questions.length !== 10) {
    return NextResponse.json({ error: "La evaluación no está configurada (deben existir 10 preguntas)." }, { status: 400 });
  }

  // Score server-side
  let correct = 0;
  for (const q of questions as any[]) {
    const ans = body.answers[q.id];
    if (ans && ans === q.correct_option) correct += 1;
  }
  const score = Math.round((correct / 10) * 100);
  const passed = score >= (quiz.pass_percent ?? 80);

  const verifyCode = passed ? crypto.randomBytes(10).toString("hex") : null;

  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .insert({
      quiz_id: quiz.id,
      course_id: quiz.course_id,
      user_id: user.id,
      full_name: body.fullName,
      colegiado: body.colegiado,
      score_percent: score,
      passed,
      answers: body.answers,
      verify_code: verifyCode,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

let folioCode: string | null = null;

// V2: emitir certificado con folio correlativo (registro histórico)
if (passed) {
  const { data: cert, error: certErr } = await supabase
    .from("certificates")
    .insert({ attempt_id: attempt.id })
    .select("folio_code")
    .single();

  if (!certErr) {
    folioCode = cert?.folio_code ?? null;
  }
}


  return NextResponse.json({
    attemptId: attempt.id,
    score,
    passed,
    verifyCode: verifyCode,
    folioCode,
  });
}
