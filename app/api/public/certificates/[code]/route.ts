import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Document, Page, Text, View, StyleSheet, Image, renderToStream } from "@react-pdf/renderer";
import { formatDuration } from "@/lib/utils";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { flexDirection: "column", backgroundColor: "#0b0b0f", padding: 36 },
  border: { borderWidth: 2, borderColor: "#e50914", padding: 26, height: "100%", borderRadius: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 90, height: 90, objectFit: "contain" },
  subtitle: { fontSize: 10, color: "#c9c9c9", letterSpacing: 2, textTransform: "uppercase" },
  title: { fontSize: 28, color: "#ffffff", marginTop: 10, fontWeight: 700 },
  folio: { fontSize: 10, color: "#ffffff", marginTop: 6 },
  text: { fontSize: 12, color: "#eaeaea", marginTop: 10, lineHeight: 1.45 },
  highlight: { color: "#e50914", fontWeight: 700 },
  name: { fontSize: 22, color: "#ffffff", marginTop: 12, fontWeight: 700 },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 8, flexWrap: "wrap" },
  metaPill: { borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  metaText: { fontSize: 10, color: "#d8d8d8" },
  footer: { marginTop: "auto", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  sigBlock: { width: "45%", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.25)", paddingTop: 8 },
  sigName: { fontSize: 10, color: "#eaeaea" },
  sigRole: { fontSize: 9, color: "#bdbdbd", marginTop: 2 },
  sigImg: { width: 160, height: 48, objectFit: "contain", marginBottom: 6 },
  verify: { fontSize: 9, color: "#bdbdbd", marginTop: 10 },
  watermark: { position: "absolute", opacity: 0.08, left: 180, top: 90, width: 420, height: 420, objectFit: "contain" },
});

function CertificateDoc(props: any) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.border}>
          {props.watermarkUrl ? <Image src={props.watermarkUrl} style={styles.watermark} /> : null}

          <View style={styles.header}>
            {props.logoUrl ? <Image src={props.logoUrl} style={styles.logo} /> : <View />}
            <Text style={styles.subtitle}>{props.institutionName}</Text>
            <View />
          </View>

          <Text style={styles.title}>{props.headerLine}</Text>
          <Text style={styles.folio}>Folio: {props.folioCode}</Text>

          <Text style={styles.text}>Se certifica que:</Text>
          <Text style={styles.name}>{props.fullName}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaPill}><Text style={styles.metaText}>No. colegiado: {props.colegiado}</Text></View>
            <View style={styles.metaPill}><Text style={styles.metaText}>Duración certificada: {props.durationLabel}</Text></View>
            <View style={styles.metaPill}><Text style={styles.metaText}>Fecha de emisión: {props.issuedDate}</Text></View>
          </View>

          <Text style={styles.text}>
            Ha aprobado con éxito la evaluación del curso:
            {" "}<Text style={styles.highlight}>{props.courseTitle}</Text>
          </Text>

          <Text style={styles.verify}>
            Verificación: {props.verifyUrl} (código: {props.verifyCode})
          </Text>

          {props.footerNote ? (
            <Text style={[styles.verify, { marginTop: 6 }]}>{props.footerNote}</Text>
          ) : null}

          <View style={styles.footer}>
            <View style={styles.sigBlock}>
              {props.signer1Img ? <Image src={props.signer1Img} style={styles.sigImg} /> : null}
              <Text style={styles.sigName}>{props.signer1Name}</Text>
              <Text style={styles.sigRole}>{props.signer1Title}</Text>
            </View>
            <View style={styles.sigBlock}>
              {props.signer2Img ? <Image src={props.signer2Img} style={styles.sigImg} /> : null}
              <Text style={styles.sigName}>{props.signer2Name}</Text>
              <Text style={styles.sigRole}>{props.signer2Title}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_certificate_pdf", { p_code: ctx.params.code });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return NextResponse.json({ error: "Certificado no encontrado." }, { status: 404 });
  }

  const row = Array.isArray(data) ? data[0] : data;

  const durationLabel = row.duration_seconds ? formatDuration(row.duration_seconds) : "Duración pendiente";
  const issuedDate = new Date(row.issued_at).toLocaleDateString("es-GT", { year: "numeric", month: "long", day: "2-digit" });

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const verifyUrl = `${baseUrl}/certificates/${row.verify_code}`;

  const s = (row.settings_snapshot ?? {}) as any;

  const institutionName = s.institution_name ?? "Colegio de Psicólogos de Guatemala";
  const headerLine = s.header_line ?? "Certificado de Aprobación";

  const logoUrl = s.logo_url ?? process.env.NEXT_PUBLIC_CERT_LOGO_URL ?? null;
  const watermarkUrl = s.background_watermark_url ?? null;

  const signer1Name = s.signer1_name ?? "Presidencia";
  const signer1Title = s.signer1_title ?? "Junta Directiva";
  const signer1Img = s.signer1_image_url ?? process.env.NEXT_PUBLIC_CERT_SIGNATURE1_URL ?? null;

  const signer2Name = s.signer2_name ?? "Secretaría";
  const signer2Title = s.signer2_title ?? "Junta Directiva";
  const signer2Img = s.signer2_image_url ?? process.env.NEXT_PUBLIC_CERT_SIGNATURE2_URL ?? null;

  const footerNote = s.footer_note ?? null;

  const stream = await renderToStream(
    <CertificateDoc
      institutionName={institutionName}
      headerLine={headerLine}
      fullName={row.full_name}
      colegiado={row.colegiado}
      courseTitle={row.course_title ?? "Curso"}
      issuedDate={issuedDate}
      durationLabel={durationLabel}
      folioCode={row.folio_code ?? "CPG-AV-—"}
      verifyUrl={verifyUrl}
      verifyCode={row.verify_code ?? "—"}
      footerNote={footerNote}
      logoUrl={logoUrl}
      watermarkUrl={watermarkUrl}
      signer1Name={signer1Name}
      signer1Title={signer1Title}
      signer1Img={signer1Img}
      signer2Name={signer2Name}
      signer2Title={signer2Title}
      signer2Img={signer2Img}
    />
  );

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="certificado-${row.folio_code ?? "cpg"}.pdf"`);

  // @ts-ignore
  return new NextResponse(stream as any, { headers });
}
