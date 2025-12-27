import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  renderToStream,
  type DocumentProps,
} from "@react-pdf/renderer";
import { formatDuration } from "@/lib/utils";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { flexDirection: "column", backgroundColor: "#0b0b0f", padding: 36 },
  border: {
    borderWidth: 2,
    borderColor: "#e50914",
    padding: 26,
    height: "100%",
    borderRadius: 10,
    position: "relative",
    overflow: "hidden",
  },
  watermark: {
    position: "absolute",
    left: 80,
    top: 20,
    width: 600,
    height: 360,
    opacity: 0.08,
    objectFit: "contain",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 90, height: 90, objectFit: "contain" },
  subtitle: { fontSize: 10, color: "#c9c9c9", letterSpacing: 2, textTransform: "uppercase" as any },
  title: { fontSize: 28, color: "#ffffff", marginTop: 10, fontWeight: 700 as any },
  text: { fontSize: 12, color: "#eaeaea", marginTop: 10, lineHeight: 1.45 },
  highlight: { color: "#e50914", fontWeight: 700 as any },
  name: { fontSize: 22, color: "#ffffff", marginTop: 12, fontWeight: 700 as any },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 8, flexWrap: "wrap" as any },
  metaPill: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  metaText: { fontSize: 10, color: "#d8d8d8" },
  footer: { marginTop: "auto", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  sigBlock: { width: "45%", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.25)", paddingTop: 8 },
  sigName: { fontSize: 10, color: "#eaeaea" },
  sigRole: { fontSize: 9, color: "#bdbdbd", marginTop: 2 },
  sigImg: { width: 160, height: 48, objectFit: "contain", marginBottom: 6 },
  verify: { fontSize: 9, color: "#bdbdbd", marginTop: 10 },
});

type Authority = { name: string; title: string; signatureUrl?: string | null };

function CertificateDoc(props: {
  fullName: string;
  colegiado: string;
  courseTitle: string;
  issuedDate: string;
  durationLabel: string;
  verifyUrl: string;
  verifyCode: string;
  folio?: string | null;
  authorities?: Authority[] | null;
  logoUrl?: string | null;
  watermarkUrl?: string | null;
}): React.ReactElement<DocumentProps> {
  const e = React.createElement;

  const authorityBlocks =
    props.authorities && props.authorities.length
      ? props.authorities.slice(0, 2).map((a, idx) =>
          e(
            View,
            { key: `auth-${idx}`, style: styles.sigBlock },
            a.signatureUrl ? e(Image, { src: a.signatureUrl, style: styles.sigImg }) : null,
            e(Text, { style: styles.sigName }, a.name || "Firma autorizada"),
            e(Text, { style: styles.sigRole }, a.title || "Colegio de Psicólogos de Guatemala")
          )
        )
      : [
          e(
            View,
            { key: "auth-0", style: styles.sigBlock },
            e(Text, { style: styles.sigName }, "Firma autorizada"),
            e(Text, { style: styles.sigRole }, "Colegio de Psicólogos de Guatemala")
          ),
          e(
            View,
            { key: "auth-1", style: styles.sigBlock },
            e(Text, { style: styles.sigName }, "Sello / Validación institucional"),
            e(Text, { style: styles.sigRole }, "Aula Virtual")
          ),
        ];

  return e(
    Document,
    null,
    e(
      Page,
      { size: "A4", orientation: "landscape", style: styles.page },
      e(
        View,
        { style: styles.border },
        props.watermarkUrl ? e(Image, { src: props.watermarkUrl, style: styles.watermark }) : null,
        e(
          View,
          { style: styles.header },
          props.logoUrl ? e(Image, { src: props.logoUrl, style: styles.logo }) : e(View, null),
          e(Text, { style: styles.subtitle }, "Colegio de Psicólogos de Guatemala"),
          e(View, null)
        ),
        e(Text, { style: styles.title }, "Certificado de Aprobación"),
        e(Text, { style: styles.text }, "Se certifica que:"),
        e(Text, { style: styles.name }, props.fullName),
        e(
          View,
          { style: styles.metaRow },
          e(View, { style: styles.metaPill }, e(Text, { style: styles.metaText }, `No. colegiado: ${props.colegiado}`)),
          e(View, { style: styles.metaPill }, e(Text, { style: styles.metaText }, `Duración certificada: ${props.durationLabel}`)),
          e(View, { style: styles.metaPill }, e(Text, { style: styles.metaText }, `Fecha de emisión: ${props.issuedDate}`)),
          props.folio ? e(View, { style: styles.metaPill }, e(Text, { style: styles.metaText }, `Folio: ${props.folio}`)) : null
        ),
        e(
          Text,
          { style: styles.text },
          "Ha aprobado con éxito la evaluación del curso: ",
          e(Text, { style: styles.highlight }, props.courseTitle)
        ),
        e(Text, { style: styles.verify }, `Verificación: ${props.verifyUrl} (código: ${props.verifyCode})`),
        e(View, { style: styles.footer }, ...authorityBlocks)
      )
    )
  );
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const supabase = await createClient();

  // RPC recomendado (seguridad definer) para no abrir tablas al público
  const { data, error } = await supabase.rpc("get_certificate_public", {
    p_verify_code: (await ctx.params).code,
  });

  if (error || !data) {
    return NextResponse.json({ error: "Certificado no válido." }, { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const verifyUrl = `${baseUrl}/certificates/${data.verify_code}`;

  const element = CertificateDoc({
    fullName: data.full_name,
    colegiado: data.colegiado,
    courseTitle: data.course_title ?? "Curso",
    issuedDate: data.issued_date_label ?? data.issued_date ?? "",
    durationLabel: data.duration_label ?? "Duración pendiente",
    verifyUrl,
    verifyCode: data.verify_code,
    folio: data.folio ?? null,
    authorities: (data.authorities ?? null) as Authority[] | null,
    logoUrl: (data.logo_url ?? null) as string | null,
    watermarkUrl: (data.watermark_url ?? null) as string | null,
  });

  const stream = await renderToStream(element);

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  const { code } = await ctx.params;

  headers.set("Content-Disposition", `inline; filename="certificado-cpg-${code}.pdf"`);

  // @ts-ignore
  return new NextResponse(stream as any, { headers });
}
