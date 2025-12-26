import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { iso8601DurationToSeconds } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Uses YouTube Data API v3: videos.list?part=contentDetails&id=VIDEO_ID
 * Reads contentDetails.duration (ISO 8601) and stores it in courses.duration_seconds
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const videoId = url.searchParams.get("videoId");

  if (!videoId) return NextResponse.json({ error: "videoId requerido." }, { status: 400 });
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Falta YOUTUBE_API_KEY en variables de entorno." }, { status: 500 });

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Only admins should refresh durations (enforced by RLS by updating only as admin).
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Solo administradores." }, { status: 403 });

  const yt = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`);
  const payload = await yt.json();
  const durationIso = payload?.items?.[0]?.contentDetails?.duration as string | undefined;
  if (!durationIso) return NextResponse.json({ error: "No se pudo obtener duration desde YouTube." }, { status: 400 });

  const durationSeconds = iso8601DurationToSeconds(durationIso);
  if (!durationSeconds) return NextResponse.json({ error: "Duración inválida o cero." }, { status: 400 });

  const { error } = await supabase.from("courses").update({ duration_seconds: durationSeconds }).eq("youtube_video_id", videoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ durationSeconds });
}
