import Hero from "@/components/Hero";
import Row, { type CourseCard } from "@/components/Row";
import { createClient } from "@/lib/supabase/server";

type Category = { id: string; name: string; slug: string | null };

export default async function HomePage() {
  const supabase = createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("id,name,slug")
    .order("sort_order", { ascending: true });

  const { data: courses } = await supabase
    .from("courses")
    .select("id,title,description,cover_image_url,duration_seconds,category_id,created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });

  const cats = (categories ?? []) as Category[];
  const allCourses = (courses ?? []) as any[];

  const recent = allCourses.slice(0, 12).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    cover_image_url: c.cover_image_url,
    duration_seconds: c.duration_seconds,
  })) as CourseCard[];

  const byCategory = new Map<string, CourseCard[]>();
  for (const c of allCourses) {
    const k = c.category_id ?? "uncategorized";
    const arr = byCategory.get(k) ?? [];
    arr.push({
      id: c.id,
      title: c.title,
      description: c.description,
      cover_image_url: c.cover_image_url,
      duration_seconds: c.duration_seconds,
    });
    byCategory.set(k, arr);
  }

  return (
    <>
      <Hero />

      <div id="recientes">
        <Row title="Recién añadidos" courses={recent} />
      </div>

      {cats.map((cat) => (
        <Row
          key={cat.id}
          title={cat.name}
          courses={(byCategory.get(cat.id) ?? []).slice(0, 15)}
        />
      ))}
    </>
  );
}
