import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuizRunner from "@/components/QuizRunner";

export default async function QuizPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: course } = await supabase
    .from("courses")
    .select("id,title,published")
    .eq("id", params.id)
    .maybeSingle();

  if (!course || !course.published) redirect("/");

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id,is_enabled,pass_percent")
    .eq("course_id", course.id)
    .maybeSingle();

  if (!quiz?.is_enabled) redirect(`/v/${course.id}`);

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id,question,option_a,option_b,option_c")
    .eq("quiz_id", quiz.id)
    .order("sort_order", { ascending: true });

  return (
    <div className="py-8">
      <QuizRunner quizId={quiz.id} courseId={course.id} courseTitle={course.title} questions={(questions ?? []) as any} />
    </div>
  );
}
