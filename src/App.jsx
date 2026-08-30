import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo, Suspense } from 'react';
import {
  Play, CheckCircle, XCircle, LogOut, Plus, Trash2, Award,
  ChevronLeft, ChevronDown, Lock, ExternalLink, X, CalendarDays, Eye, EyeOff,
  Download, Loader2, UserCheck, UserX, Edit2, Users, Radio, Wifi, Video,
  Search, Mail, Shield, History, QrCode, KeyRound, Upload, Image, Type, Settings, Printer, RefreshCw, Copy
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';
import { createEmptyQuestions, normalizeLegacyQuizQuestions, parseQuizImport, validateCertificateQuiz } from './utils/quizImport';
// html2canvas + jspdf se cargan dinámicamente al descargar PDFs (lazy)
// Componentes pesados de admin se lazy-loadan (lazy + Suspense más abajo)
const CommissionsManager = React.lazy(() => import('./components/CommissionsManager'));
const AttendanceReportView = React.lazy(() => import('./components/AttendanceReportView'));
const VolunteerAccreditationManager = React.lazy(() => import('./components/VolunteerAccreditationManager'));

const EDGE_URL = 'https://ilyospunwucdojrnfgti.supabase.co/functions/v1/consultar-colegiado';
const CREDITOS_EDGE_URL = 'https://ilyospunwucdojrnfgti.supabase.co/functions/v1/consultar-creditos';
const ADMIN_EDGE_URL = 'https://ilyospunwucdojrnfgti.supabase.co/functions/v1/manage-admin-user';
const APP_URL = 'https://aulavirtualcpg.org';
const CREDITOS_URL = 'https://caeducgt.org';

// ── Exportar XLSX usando SheetJS (cargado por CDN en index.html) ──
function exportXLSX(rows, filename) {
  const XLSX = window.XLSX;
  if (!XLSX) { alert('La librería de exportación no está disponible.'); return; }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, filename);
}

// Variante multi-hoja para informes complejos. Recibe array de { sheetName, rows }
function exportXLSXMultiSheet(sheets, filename) {
  const XLSX = window.XLSX;
  if (!XLSX) { alert('La librería de exportación no está disponible.'); return; }
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ sheetName, rows }) => {
    if (!rows || rows.length === 0) return;
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Limita nombre de hoja a 31 chars (límite Excel)
    const safeName = String(sheetName || 'Hoja').slice(0, 31).replace(/[\\\/\?\*\[\]:]/g, '');
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });
  XLSX.writeFile(wb, filename);
}

const DEFAULT_SITE_LOGOS = {
  navLogoCpg: '/logo-cpg-grande.png',
  navLogoCaeduc: '/logo-caeduc.png',
  footerLogoCpg: '/logo-cpg-grande.png',
  footerLogoCaeduc: '/logo-caeduc.png',
  loginLogoCpg: '/logo-cpg-grande.png',
};

const DEFAULT_HOMEPAGE_PROMO = {
  active: false,
  imageUrl: '',
  linkUrl: '',
  altText: 'Actividad destacada',
};

const isValidPublicUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const GUATEMALA_DEPARTMENTS = [
  'Guatemala', 'El Progreso', 'Sacatepéquez', 'Chimaltenango', 'Escuintla',
  'Santa Rosa', 'Sololá', 'Totonicapán', 'Quetzaltenango', 'Suchitepéquez',
  'Retalhuleu', 'San Marcos', 'Huehuetenango', 'Quiché', 'Baja Verapaz',
  'Alta Verapaz', 'Petén', 'Izabal', 'Zacapa', 'Chiquimula',
  'Jalapa', 'Jutiapa'
];

const INITIAL_VIDEOS = [
  { id: 1, platform: 'youtube', title: 'Introducción a la Psicología Clínica', category: 'Psicología Clínica', youtubeId: 'hJKwF2rXGz4', duration: '2', description: 'Un recorrido fundamental por los principios de la práctica clínica moderna y el abordaje del paciente.', thumbnail: 'https://i.ytimg.com/vi/hJKwF2rXGz4/hqdefault.jpg', scheduledAt: '', quizEnabled: true, viewCount: 0, questions: Array(10).fill(null).map((_, i) => ({ question: 'Pregunta ' + (i+1) + ' sobre Psicología Clínica?', options: ['Opción A (Correcta)', 'Opción B', 'Opción C'], correctAnswer: 0 })) },
  { id: 2, platform: 'youtube', title: 'Ética Profesional en la Salud Mental', category: 'Ética y Legislación', youtubeId: 'PrJj3sP7b-M', duration: '1.5', description: 'Análisis del código deontológico y dilemas éticos frecuentes en la consulta.', thumbnail: 'https://i.ytimg.com/vi/PrJj3sP7b-M/hqdefault.jpg', scheduledAt: '', quizEnabled: false, viewCount: 0, questions: [] },
  { id: 3, platform: 'youtube', title: 'Neuropsicología del Aprendizaje', category: 'Neuropsicología', youtubeId: 'MMP3e9yZqIw', duration: '3', description: 'Exploración de las bases neurológicas que sustentan los procesos de aprendizaje y memoria.', thumbnail: 'https://i.ytimg.com/vi/MMP3e9yZqIw/hqdefault.jpg', scheduledAt: '', quizEnabled: true, viewCount: 0, questions: Array(10).fill(null).map((_, i) => ({ question: 'Pregunta conceptual ' + (i+1) + '?', options: ['Respuesta Incorrecta', 'Respuesta Correcta', 'Otra Incorrecta'], correctAnswer: 1 })) }
];

// ── CONFIGURACIÓN POR DEFECTO DE PLANTILLA DE CERTIFICADO ──
const DEFAULT_CERT_CONFIG = {
  headerLine1: 'La Comisión de Acreditación y Educación continua',
  headerLine2: 'mediante el Aula Virtual',
  diplomaText: 'Otorgan el presente diploma a:',
  collegiateText: 'Con colegiado',
  numberText: 'número:',
  courseText: 'por completar el curso virtual y su evaluación:',
  hoursPrefix: 'Desarrollado en',
  hoursSuffix: 'horas de formación en modalidad virtual',
  motto: 'Etica-Crecimiento-Desarrollo',
  boardText: 'Junta Directiva 2025-2027',
  coordinatorName: 'M.A. Juan J. Reyes',
  coordinatorTitle: 'Coordinador CAEDUC',
  presidenteName: '',
  presidenteTitle: 'Presidenta Junta Directiva',
  presidenteSignatureUrl: '',
  logoCpgUrl: '',
  logoCaeducUrl: '',
  signatureUrl: '',
  sealUrl: '',
  backgroundUrl: '',
  // Layout: posiciones (top/left en px) y tamaños (fontSize en px, width/height en px)
  layout: {
    logoCpg:    { top: 12, left: 42, w: 350, h: 150 },
    boardText:  { top: 70, left: 528, fontSize: 26 },
    logoCaeduc: { top: 12, right: 40, w: 240, h: 120 },
    header:     { top: 175, fontSize: 23 },
    diploma:    { top: -1, fontSize: 17 },
    name:       { top: 310, fontSize: 38 },
    collegiate: { top: 385, fontSize: 16 },
    courseText:  { top: 422, fontSize: 15 },
    courseTitle: { top: 455, fontSize: 25 },
    hours:      { top: 530, fontSize: 15 },
    motto:      { top: 568, fontSize: 17 },
    date:       { top: 600, fontSize: 13 },
    signature:  { w: 300, h: 90, x: 0, y: 0 },
    sigLine:    { w: 0, x: 0, y: 0 },
    sigText:    { x: 0, y: 0 },
    coordName:  { fontSize: 16 },
    coordTitle: { fontSize: 13 },
    coordBlock: { x: 0, y: 0 },
    seal:       { w: 130, h: 130, x: 0, y: 0 },
    qr:         { w: 110, h: 110 },
    bottomY:    25,
    bottomGap:  60,
    // Layouts ABSOLUTOS por escenario de cantidad de firmas (2 y 3).
    // Cada firma/sello/QR con left(x)/top(y)/width(w)/height(h) en px sobre el canvas 1056x816.
    // El admin los ajusta arrastrando en el editor; el caso de 1 firma NO usa esto.
    signLayouts: {
      '2': {
        sigs: [ { x: 170, y: 650, w: 220, h: 150 }, { x: 430, y: 650, w: 220, h: 150 } ],
        seal: { x: 800, y: 560, w: 100, h: 100 },
        qr:   { x: 900, y: 668, w: 110, h: 130 },
      },
      '3': {
        sigs: [ { x: 95, y: 655, w: 200, h: 140 }, { x: 310, y: 655, w: 200, h: 140 }, { x: 525, y: 655, w: 200, h: 140 } ],
        seal: { x: 805, y: 560, w: 95, h: 95 },
        qr:   { x: 905, y: 670, w: 105, h: 125 },
      },
    },
  },
};

// Sube imagen al Storage de Supabase y devuelve la URL pública
const uploadCertAsset = async (file, filename) => {
  if (!supabase || !file) return null;
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${filename}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('cert-assets').upload(path, file, { cacheControl: '3600', upsert: true });
  if (error) throw new Error('Error subiendo imagen: ' + error.message);
  const { data: { publicUrl } } = supabase.storage.from('cert-assets').getPublicUrl(path);
  return publicUrl;
};

// Sube publicidad únicamente al bucket aislado de Aula Virtual.
const uploadHomepagePromoAsset = async (file) => {
  if (!supabase || !file) return null;
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `banner-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('cpg-homepage-promos').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error('Error subiendo imagen: ' + error.message);
  const { data: { publicUrl } } = supabase.storage.from('cpg-homepage-promos').getPublicUrl(path);
  return publicUrl;
};

// ── DOMINIOS DE CORREO PROBLEMÁTICOS ───────────────
// Cuando alguien crea cuenta con uno de estos dominios, el correo de
// verificación de Supabase frecuentemente no llega (Microsoft lo bloquea).
// Por eso acumulamos esas cuentas en cpg_email_verification_queue para
// que el admin pueda activarlas manualmente desde el panel.
const PROBLEMATIC_EMAIL_DOMAINS = [
  'hotmail.com', 'hotmail.es', 'hotmail.com.gt',
  'outlook.com', 'outlook.es',
  'live.com', 'live.com.mx',
  'msn.com',
];
const isProblematicEmailDomain = (email) => {
  if (!email) return false;
  const domain = String(email).toLowerCase().split('@')[1] || '';
  return PROBLEMATIC_EMAIL_DOMAINS.includes(domain);
};

// ── YOUTUBE UTILS ────────────────────────────────
const extractYouTubeId = (value) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!trimmed.includes('http')) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) return url.pathname.replace('/', '').split(/[?&]/)[0];
    if (url.searchParams.has('v')) return url.searchParams.get('v') || '';
    // Soporta /embed/ID, /live/ID (transmisiones en vivo), /shorts/ID y /v/ID
    const m = url.pathname.match(/\/(?:embed|live|shorts|v)\/([^/?#]+)/);
    return m ? m[1] : '';
  } catch { return ''; }
};

const getYouTubeThumbnail = (youtubeId, quality = 'hqdefault') => {
  const id = extractYouTubeId(youtubeId);
  if (!id) return 'https://via.placeholder.com/640x360';
  return 'https://i.ytimg.com/vi/' + id + '/' + quality + '.jpg';
};

// ── VIMEO UTILS ──────────────────────────────────
// Extrae la URL de Vimeo desde: iframe embed code, URL directa, o URL de evento
const extractVimeoUrl = (value) => {
  if (!value) return '';
  const trimmed = value.trim();
  // Caso 1: código iframe completo — extraer el atributo src
  const iframeMatch = trimmed.match(/src=["']([^"']*vimeo\.com[^"']*)["']/i);
  if (iframeMatch) return iframeMatch[1];
  // Caso 2: URL directa de Vimeo
  if (trimmed.includes('vimeo.com')) return trimmed;
  // Caso 3: solo un ID numérico de Vimeo
  if (/^\d+$/.test(trimmed)) return `https://vimeo.com/${trimmed}`;
  return trimmed;
};

// Genera URL embebible para el iframe del reproductor
const getVimeoEmbedUrl = (rawValue) => {
  const url = extractVimeoUrl(rawValue);
  if (!url) return '';
  // Ya es una URL de embed de evento
  if (url.includes('/event/') && url.includes('/embed')) return url;
  // URL de evento sin /embed
  const eventMatch = url.match(/vimeo\.com\/event\/([^/?#]+)/);
  if (eventMatch) return `https://vimeo.com/event/${eventMatch[1]}/embed`;
  // Player embed ya formateado
  if (url.includes('player.vimeo.com/video/')) return url;
  // Showcase / álbum con video específico
  const showcaseMatch = url.match(/vimeo\.com\/showcase\/\d+\/video\/(\d+)/);
  if (showcaseMatch) return `https://player.vimeo.com/video/${showcaseMatch[1]}`;
  // Video regular de Vimeo
  const vidMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vidMatch) return `https://player.vimeo.com/video/${vidMatch[1]}`;
  // Fallback: devolver tal cual
  return url;
};

// ── UTILS GENERALES ──────────────────────────────
const getVideoThumbnail = (video) => {
  if (video?.thumbnail?.trim()) return video.thumbnail.trim();
  if (video?.platform === 'vimeo') return 'https://via.placeholder.com/640x360/1a1a2e/60a5fa?text=▶+Vimeo';
  if (video?.platform === 'teams') return 'https://via.placeholder.com/640x360/1e1b4b/818cf8?text=▶+Teams';
  return getYouTubeThumbnail(video?.youtubeId);
};

// Helper: genera la URL correcta del embed según la plataforma
const getVideoEmbedUrl = (video) => {
  if (video?.platform === 'vimeo') return getVimeoEmbedUrl(video.youtubeId);
  if (video?.platform === 'teams') {
    const url = video.youtubeId?.trim() || '';
    // SharePoint embed URLs and classic Stream URLs can be iframed directly
    if (url.includes('sharepoint.com') || url.includes('microsoftstream.com')) return url;
    return null; // non-embeddable Teams link — PlayerView shows external button
  }
  return 'https://www.youtube-nocookie.com/embed/' + extractYouTubeId(video?.youtubeId) + '?playsinline=1&rel=0';
};

const getScheduledDate = (scheduledAt) => scheduledAt ? new Date(scheduledAt + 'T00:00:00') : null;
const isVideoPublished = (video) => { const d = getScheduledDate(video?.scheduledAt); return !d || d <= new Date(); };
const formatScheduleDate = (scheduledAt) => { const d = getScheduledDate(scheduledAt); if (!d) return ''; return d.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' }); };

// Una actividad es "pasada" cuando ya terminó: fecha + hora de inicio + duración (horas).
// Si no hay hora válida, se considera vigente hasta el fin de su día.
const isActivityPast = (a) => {
  if (!a?.date) return false;
  const end = new Date(a.date + 'T00:00:00');
  if (Number.isNaN(end.valueOf())) return false;
  const t = String(a.time || '').match(/^(\d{1,2}):(\d{2})/);
  if (t) {
    end.setHours(Number(t[1]), Number(t[2]), 0, 0);
    const dur = parseFloat(a.horas);
    if (!Number.isNaN(dur) && dur > 0) end.setMinutes(end.getMinutes() + Math.round(dur * 60));
  } else {
    end.setHours(23, 59, 59, 999); // sin hora → vigente todo el día
  }
  return end < new Date();
};
const getFirstName = (fullName = '') => { const clean = fullName.replace(/^(Lic\.|Dr\.|Msc\.|Ing\.|Lcda\.|Dra\.)\s*/i, '').trim(); return clean.split(' ')[0] || fullName; };

const getCompletedKey = (num) => 'cpg_completed_' + num;
const loadCompleted = (num) => { if (!num || num === '0000') return new Set(); try { const r = localStorage.getItem(getCompletedKey(num)); return r ? new Set(JSON.parse(r)) : new Set(); } catch { return new Set(); } };
const saveCompleted = (num, s) => { if (!num || num === '0000') return; localStorage.setItem(getCompletedKey(num), JSON.stringify([...s])); };

async function consultarColegiado(id) {
  const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: String(id).trim() }) });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Colegiado no encontrado');
  if (!data.nombre && !data.estatus) throw new Error('Colegiado no encontrado');
  return { colegiado: data.numero || id, name: data.nombre || '', status: data.estatus || 'DESCONOCIDO', ...data };
}

async function navigateToCreditos(sessionUser) {
  const base = CREDITOS_URL.endsWith('/') ? CREDITOS_URL : CREDITOS_URL + '/';
  const query = sessionUser?.collegiateNumber
    ? `?sso_colegiado=${encodeURIComponent(sessionUser.collegiateNumber)}&sso_nombre=${encodeURIComponent(sessionUser.name || '')}`
    : '';
  // Si por cualquier razón no hay sesión utilizable, navegamos igual.
  // El botón siempre debe llevar al usuario a la otra app.
  let session = null;
  if (supabase) {
    try {
      ({ data: { session } } = await supabase.auth.getSession());
      if (!session) {
        try { await supabase.auth.refreshSession(); } catch {}
        ({ data: { session } } = await supabase.auth.getSession());
      }
    } catch {}
  }
  if (!session) { window.location.href = `${base}${query}`; return; }
  const hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&token_type=bearer&expires_in=${session.expires_in || 3600}&type=magiclink`;
  window.location.href = `${base}${query}#${hash}`;
}


// ── LOG DE AUDITORÍA ─────────────────────────────
const SUPER_ADMIN_EMAIL = 'lic.juanreyesr@gmail.com';

const logAudit = async (adminEmail, adminName, action, resourceType, resourceId = '', details = {}) => {
  if (!supabase) return;
  if ((adminEmail || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL) return;
  try {
    await supabase.from('cpg_audit_log').insert({
      admin_email: adminEmail || '',
      admin_name: adminName || '',
      action,
      resource_type: resourceType,
      resource_id: String(resourceId),
      details,
    });
  } catch (e) { console.warn('[Audit] Error:', e.message); }
};

const logAuditAuto = async (action, resourceType, resourceId = '', details = {}) => {
  if (!supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const email = (session?.user?.email || '').toLowerCase().trim();
    if (!email || email === SUPER_ADMIN_EMAIL) return;

    // Solo registrar acciones de administradores reales: si el email no
    // pertenece a cpg_admin_users, NO insertar en el log de auditoría
    // (evita acumular eventos de usuarios regulares emitiendo sus propios certs).
    const { data: adminRow } = await supabase
      .from('cpg_admin_users')
      .select('email, active')
      .eq('email', email)
      .eq('active', true)
      .maybeSingle();
    if (!adminRow) return;

    await supabase.from('cpg_audit_log').insert({
      admin_email: email,
      admin_name: '',
      action,
      resource_type: resourceType,
      resource_id: String(resourceId),
      details,
    });
  } catch (e) { console.warn('[Audit] Error:', e.message); }
};

// ── QR CODE URL ──────────────────────────────────
const getCertQrUrl = (code) => {
  const verifyUrl = `${APP_URL}/?cert=${code}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}&bgcolor=ffffff&color=1a1a2e&margin=4`;
};

// ── VERIFICACIÓN PÚBLICA DE CERTIFICADO ──────────
function CertificateVerifyView({ code }) {
  const [status, setStatus] = useState('loading');
  const [cert, setCert] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null);
  const [fetchingLive, setFetchingLive] = useState(false);

  useEffect(() => {
    const verify = async () => {
      if (!supabase) { setStatus('error'); return; }
      try {
        const { data, error } = await supabase
          .from('cpg_certificates')
          .select('*')
          .eq('certificate_code', code)
          .single();
        if (error || !data) { setStatus('not_found'); return; }
        setCert(data);
        setStatus('found');
        // Consultar estado actual del CPG en tiempo real
        if (data.collegiate_number && data.collegiate_number !== '0000') {
          setFetchingLive(true);
          try {
            const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: String(data.collegiate_number).trim() }) });
            const cpgData = await res.json();
            const apiStatus = String(cpgData?.status || '').toUpperCase().trim();
            if (apiStatus && apiStatus !== 'DESCONOCIDO') {
              setLiveStatus(apiStatus);
              await supabase.from('cpg_certificates').update({ status: apiStatus }).eq('certificate_code', code);
            }
          } catch {}
          setFetchingLive(false);
        }
      } catch {
        setStatus('error');
      }
    };
    verify();
  }, [code]);

  const fmt = (iso) => new Date(iso).toLocaleDateString('es-GT', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex flex-col items-center justify-center px-4 py-12">
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="flex items-center gap-4">
          <img src="/logo-cpg-grande.png" alt="CPG" className="w-16 h-16 object-contain" onError={e => e.target.style.display='none'} />
          <img src="/logo-caeduc.png" alt="CAEDUC" className="w-16 h-16 object-contain" onError={e => e.target.style.display='none'} />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-white">Colegio de Psicólogos de Guatemala</h1>
          <p className="text-blue-400 text-xs tracking-widest uppercase">Verificación de Certificado · Aula Virtual CAEDUC</p>
        </div>
      </div>

      <div className="w-full max-w-xl">
        {status === 'loading' && (
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-10 text-center">
            <Loader2 size={40} className="animate-spin text-blue-400 mx-auto mb-4" />
            <p className="text-gray-400">Verificando certificado...</p>
            <p className="text-gray-600 text-xs mt-1 font-mono">{code}</p>
          </div>
        )}

        {status === 'found' && cert && (
          <div className="bg-[#1a1a1a] border border-green-700/50 rounded-2xl overflow-hidden shadow-2xl shadow-green-900/20">
            <div className="bg-gradient-to-r from-green-900/60 to-green-800/30 border-b border-green-700/40 px-6 py-5 flex items-center gap-4">
              <div className="bg-green-600 rounded-full p-3 shrink-0">
                <CheckCircle size={28} className="text-white" fill="white" />
              </div>
              <div>
                <p className="text-green-300 text-xs font-bold uppercase tracking-widest mb-0.5">Certificado válido</p>
                <h2 className="text-white text-xl font-bold leading-tight">Documento auténtico verificado</h2>
                <p className="text-green-400/80 text-xs mt-0.5">Emitido por el Aula Virtual — Colegio de Psicólogos de Guatemala</p>
              </div>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-black/30 rounded-xl p-4 flex items-start gap-3 border border-gray-800">
                  <UserCheck size={18} className="text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Profesional</p>
                    <p className="text-white font-bold text-lg">{cert.recipient_name}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/30 rounded-xl p-4 border border-gray-800">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">No. Colegiado</p>
                    <p className="text-white font-bold font-mono text-lg">{cert.collegiate_number}</p>
                  </div>
                  <div className="bg-black/30 rounded-xl p-4 border border-gray-800">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Estado CPG</p>
                    <span className={`inline-flex items-center gap-1.5 font-bold text-sm ${cert.status === 'ACTIVO' ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${cert.status === 'ACTIVO' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                      {cert.status}
                    </span>
                  </div>
                </div>
                <div className="bg-black/30 rounded-xl p-4 flex items-start gap-3 border border-gray-800">
                  <Award size={18} className="text-yellow-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Curso completado</p>
                    <p className="text-white font-semibold">{cert.video_title}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/30 rounded-xl p-4 border border-gray-800">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Fecha de emisión</p>
                    <p className="text-gray-200 text-sm font-medium">{fmt(cert.issued_at)}</p>
                  </div>
                  <div className="bg-black/30 rounded-xl p-4 border border-gray-800">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Código</p>
                    <p className="text-gray-400 text-xs font-mono break-all">{cert.certificate_code}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-xl px-4 py-3 mt-2">
                <Shield size={16} className="text-green-400 shrink-0" />
                <p className="text-green-300 text-xs">Este certificado fue generado y registrado automáticamente por el sistema de Aula Virtual CPG. Su autenticidad está garantizada mediante código único e infalsificable.</p>
              </div>
            </div>
          </div>
        )}

        {status === 'not_found' && (
          <div className="bg-[#1a1a1a] border border-red-700/40 rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-red-900/40 to-red-800/20 border-b border-red-700/30 px-6 py-5 flex items-center gap-4">
              <div className="bg-red-700 rounded-full p-3 shrink-0">
                <XCircle size={28} className="text-white" />
              </div>
              <div>
                <p className="text-red-300 text-xs font-bold uppercase tracking-widest mb-0.5">No encontrado</p>
                <h2 className="text-white text-xl font-bold">Certificado no registrado</h2>
              </div>
            </div>
            <div className="px-6 py-6 space-y-4">
              <p className="text-gray-300 text-sm">El código <span className="font-mono text-red-300 bg-red-900/20 px-2 py-0.5 rounded">{code}</span> no corresponde a ningún certificado emitido por el Aula Virtual CPG.</p>
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl px-4 py-3">
                <p className="text-yellow-300 text-xs font-semibold mb-1">Posibles causas:</p>
                <ul className="text-yellow-200/70 text-xs space-y-1 list-disc list-inside">
                  <li>El código fue alterado o es incorrecto</li>
                  <li>El documento es una falsificación</li>
                  <li>El certificado fue emitido antes de activarse el sistema de verificación</li>
                </ul>
              </div>
              <p className="text-gray-500 text-xs">Para verificación adicional comuníquese con CAEDUC: <a href="mailto:gestor.caeduc@colegiodepsicologos.org.gt" className="text-blue-400 hover:underline">gestor.caeduc@colegiodepsicologos.org.gt</a></p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-[#1a1a1a] border border-gray-700 rounded-2xl p-8 text-center">
            <Wifi size={40} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-300 font-semibold mb-2">No se pudo conectar al servidor</p>
            <p className="text-gray-500 text-sm">Intenta recargar la página. Si el problema persiste, contacta a CAEDUC.</p>
          </div>
        )}

        <div className="text-center mt-6">
          <a href="/" className="text-gray-500 hover:text-blue-400 text-sm transition flex items-center justify-center gap-1">
            <ChevronLeft size={14} /> Volver al Aula Virtual CPG
          </a>
        </div>
      </div>
    </div>
  );
}



// ══════════════════════════════════════════════════
// ██ FIX #2: FORMULARIO DE NUEVA CONTRASEÑA       ██
// ══════════════════════════════════════════════════
function PasswordResetView({ onDone }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!newPassword || newPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    if (!supabase) { setError('Supabase no configurado.'); return; }
    setLoading(true); setError('');
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) { setError('No se pudo actualizar la contraseña: ' + updateErr.message); setLoading(false); return; }
      setSuccess(true);
      await supabase.auth.signOut();
      setTimeout(() => {
        window.history.replaceState(null, '', window.location.pathname);
        onDone();
      }, 3000);
    } catch (e) { setError('Error: ' + e.message); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black z-[100] overflow-y-auto">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#0e0e0e] to-[#1a0a2e]" />
      <div className="relative z-10 w-full max-w-md mx-auto px-4 py-8 min-h-full flex flex-col justify-center">
        <div className="flex flex-col items-center mb-6 gap-2">
          <img src="/logo-cpg-grande.png" alt="CPG" className="w-20 h-20 object-contain drop-shadow-2xl" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="text-center">
            <h1 className="text-lg font-bold text-white leading-tight">Colegio de Psicólogos de Guatemala</h1>
            <p className="text-blue-400 text-xs tracking-widest uppercase mt-1">Aula Virtual — CAEDUC</p>
          </div>
        </div>
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-6 shadow-2xl">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-800/30 border border-green-600/40 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <h2 className="text-white font-bold text-xl mb-2">Contraseña actualizada</h2>
              <p className="text-gray-400 text-sm mb-2">Tu contraseña se ha cambiado exitosamente.</p>
              <p className="text-gray-500 text-xs">Redirigiendo al inicio de sesión...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-blue-600 p-2.5 rounded-xl"><KeyRound size={20} className="text-white" /></div>
                <div>
                  <h2 className="text-white font-bold text-xl">Nueva contraseña</h2>
                  <p className="text-gray-400 text-sm">Ingresa tu nueva contraseña para tu cuenta.</p>
                </div>
              </div>
              {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2"><XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}
              <div className="mb-4">
                <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Nueva contraseña</label>
                <input type="password" value={newPassword} onChange={e => { setNewPassword(e.target.value); setError(''); }} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition" placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="mb-5">
                <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Confirmar contraseña</label>
                <input type="password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition" placeholder="Repite la contraseña" />
              </div>
              <button onClick={handleSubmit} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={18} className="animate-spin" /> Actualizando...</> : <><KeyRound size={18} /> Establecer nueva contraseña</>}
              </button>
              <button onClick={() => { window.history.replaceState(null, '', window.location.pathname); onDone(); }} className="w-full text-gray-500 hover:text-gray-300 text-sm py-3 transition mt-2">
                Cancelar y volver al inicio
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cambio de contraseña OBLIGATORIO tras ingresar con una temporal ──
function ForcePasswordChangeView({ onDone }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!newPassword || newPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    if (!supabase) { setError('Supabase no configurado.'); return; }
    setLoading(true); setError('');
    try {
      // Cambia la contraseña Y limpia la marca de contraseña temporal, sin cerrar sesión.
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
        data: { must_change_password: false },
      });
      if (updateErr) { setError('No se pudo actualizar la contraseña: ' + updateErr.message); setLoading(false); return; }
      setSuccess(true);
      setTimeout(() => { onDone(); }, 1800);
    } catch (e) { setError('Error: ' + e.message); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black z-[100] overflow-y-auto">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#0e0e0e] to-[#1a0a2e]" />
      <div className="relative z-10 w-full max-w-md mx-auto px-4 py-8 min-h-full flex flex-col justify-center">
        <div className="flex flex-col items-center mb-6 gap-2">
          <img src="/logo-cpg-grande.png" alt="CPG" className="w-20 h-20 object-contain drop-shadow-2xl" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="text-center">
            <h1 className="text-lg font-bold text-white leading-tight">Colegio de Psicólogos de Guatemala</h1>
            <p className="text-blue-400 text-xs tracking-widest uppercase mt-1">Aula Virtual — CAEDUC</p>
          </div>
        </div>
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-6 shadow-2xl">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-800/30 border border-green-600/40 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <h2 className="text-white font-bold text-xl mb-2">Contraseña actualizada</h2>
              <p className="text-gray-400 text-sm">Ingresando al aula virtual...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-indigo-600 p-2.5 rounded-xl"><KeyRound size={20} className="text-white" /></div>
                <div>
                  <h2 className="text-white font-bold text-xl">Crea tu contraseña</h2>
                  <p className="text-gray-400 text-sm">Ingresaste con una contraseña temporal.</p>
                </div>
              </div>
              <div className="mb-4 bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-3 flex items-start gap-2">
                <Shield size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-200/90">Por seguridad, debes crear una contraseña nueva para continuar. <span className="text-white font-semibold">Guárdala bien</span> — la usarás para tus próximos ingresos.</p>
              </div>
              {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2"><XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}
              <div className="mb-4">
                <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Nueva contraseña</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={e => { setNewPassword(e.target.value); setError(''); }} className="w-full bg-black border border-gray-700 rounded-lg p-3 pr-11 text-white focus:border-indigo-500 outline-none transition" placeholder="Mínimo 6 caracteres" />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Repite la contraseña</label>
                <input type={showPw ? 'text' : 'password'} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-indigo-500 outline-none transition" placeholder="Repite la contraseña" />
              </div>
              <button onClick={handleSubmit} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={18} className="animate-spin" /> Guardando...</> : <><KeyRound size={18} /> Guardar y continuar</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── LOGIN MODAL (2 pasos) ─────────────────────────
function maskEmail(email) {
  const [user, domain] = email.split('@');
  const visible = user.slice(0, 3);
  return `${visible}***@${domain}`;
}

function LoginColModal({ onSession }) {
  const GUEST_COLEGIADO = '100000';
  const [step, setStep] = useState('collegiate');
  const [colegiadoInput, setColegiadoInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [guestName, setGuestName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cpgData, setCpgData] = useState(null);
  const [registeredEmail, setRegisteredEmail] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const [signUpSent, setSignUpSent] = useState(false);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [existingUser, setExistingUser] = useState(null); // { name, email } si ya está registrado

  useEffect(() => {
    const blocked = localStorage.getItem('cpg_google_blocked');
    if (blocked) {
      try {
        const { maskedEmail, colegiado } = JSON.parse(blocked);
        localStorage.removeItem('cpg_google_blocked');
        setError(`El colegiado ${colegiado} ya está registrado con ${maskedEmail}. Inicia sesión con ese correo o usa "Olvidé mi contraseña".`);
      } catch {}
    }
  }, []);

  const handleColegiadoBlur = async () => {
    const val = colegiadoInput.trim();
    if (!val || !/^\d+$/.test(val) || !supabase) return;
    setLookingUp(true);
    try {
      const { data: profile } = await supabase
        .from('cpg_user_profiles')
        .select('email, name')
        .eq('collegiate_number', val)
        .maybeSingle();
      if (profile?.name) {
        setExistingUser({ name: profile.name, email: profile.email });
        setNameInput(profile.name);
      } else {
        setExistingUser(null);
      }
    } catch {}
    setLookingUp(false);
  };

  const handleVerifyCollegiado = async () => {
    const val = colegiadoInput.trim();
    if (!val) { setError('Ingresa tu número de colegiado.'); return; }

    // Colegiado de prueba: salta verificación CPG y pide nombre
    if (val === GUEST_COLEGIADO) {
      setError(''); setGuestName('');
      setStep('guestname');
      return;
    }

    setLoading(true); setError('');
    try {
      const data = await consultarColegiado(val);
      setCpgData(data);
      setRegisteredEmail(null);
      setResetSent(false);
      setSignUpSent(false);
      setEmailNotConfirmed(false);
      if (supabase) {
        const { data: profile } = await supabase
          .from('cpg_user_profiles')
          .select('email')
          .eq('collegiate_number', val)
          .maybeSingle();
        if (profile?.email) {
          setRegisteredEmail(profile.email);
          setAuthMode('login');
        } else {
          // Primera vez: que el modo por defecto sea "Crear cuenta"
          setAuthMode('register');
        }
      }
      setStep('auth');
    } catch (e) {
      setError(e.message || 'No se encontró el colegiado.');
    } finally { setLoading(false); }
  };

  const handlePasswordReset = async () => {
    if (!registeredEmail || !supabase) return;
    setLoading(true);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(registeredEmail, {
      redirectTo: APP_URL,
    });
    setLoading(false);
    if (resetErr) { setError('No se pudo enviar el correo: ' + resetErr.message); return; }
    setResetSent(true);
  };

  const handleEmailAuth = async () => {
    if (!emailInput.trim()) { setError('Ingresa tu correo electrónico.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())) { setError('Correo electrónico inválido.'); return; }
    if (!passwordInput || passwordInput.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (!supabase) {
      onSession({ name: cpgData.name, collegiateNumber: cpgData.colegiado, status: cpgData.status, isGuest: false, email: emailInput.trim(), fechaColegiacion: cpgData.fecha_colegiacion || '', ultimoPago: cpgData.ultimo_pago || '', cuotaCongreso: cpgData.cuota_congreso || '' });
      return;
    }
    setLoading(true); setError('');
    try {
      if (authMode === 'register') {
        if (cpgData.colegiado !== GUEST_COLEGIADO) {
          const { data: existing } = await supabase
            .from('cpg_user_profiles')
            .select('email')
            .eq('collegiate_number', cpgData.colegiado)
            .maybeSingle();
          if (existing?.email) {
            setRegisteredEmail(existing.email);
            setAuthMode('login');
            setError('');
            setLoading(false);
            return;
          }
        }
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: emailInput.trim(),
          password: passwordInput,
          options: { emailRedirectTo: APP_URL },
        });
        if (signUpErr) {
          if (signUpErr.message.includes('already registered')) {
            setError('Este correo ya está registrado. Selecciona "Ingresar".');
          } else { setError(signUpErr.message); }
          setLoading(false); return;
        }
        const newEmail = emailInput.trim().toLowerCase();
        await supabase.from('cpg_user_profiles').upsert(
          { collegiate_number: cpgData.colegiado, email: newEmail, name: cpgData.name },
          { onConflict: 'collegiate_number' }
        );

        // Si el dominio del correo es de los que suelen no recibir verificación
        // (Hotmail/Outlook/Live/MSN), acumular en la cola para activación manual
        if (isProblematicEmailDomain(newEmail) && !signUpData?.session) {
          const domain = newEmail.split('@')[1] || '';
          try {
            await supabase
              .from('cpg_email_verification_queue')
              .upsert(
                {
                  email: newEmail,
                  collegiate_number: String(cpgData.colegiado || ''),
                  name: cpgData.name || '',
                  domain,
                },
                { onConflict: 'email' }
              );
          } catch {} // best-effort, no bloquea el signup
        }

        if (!signUpData?.session) {
          setSignUpSent(true);
          setRegisteredEmail(newEmail);
          setLoading(false);
          return;
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: emailInput.trim(), password: passwordInput });
        if (signInErr) {
          if (signInErr.message.includes('Invalid') || signInErr.message.includes('not found')) {
            setError('Contraseña incorrecta. Si olvidaste tu contraseña, usa "Recuperar contraseña".');
          } else if (signInErr.message.toLowerCase().includes('not confirmed') || signInErr.message.toLowerCase().includes('email not confirmed')) {
            setEmailNotConfirmed(true);
            setRegisteredEmail(emailInput.trim());
            setError('Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada (incluyendo spam).');
          } else { setError(signInErr.message); }
          setLoading(false); return;
        }
      }
      onSession({ name: cpgData.name, collegiateNumber: cpgData.colegiado, status: cpgData.status, isGuest: false, email: emailInput.trim(), fechaColegiacion: cpgData.fecha_colegiacion || '', ultimoPago: cpgData.ultimo_pago || '', cuotaCongreso: cpgData.cuota_congreso || '' });
    } catch (e) {
      setError('Error de autenticación: ' + e.message);
    } finally { setLoading(false); }
  };

  const handlePasswordResetNormal = async () => {
    if (!emailInput.trim()) { setError('Ingresa tu correo electrónico primero.'); return; }
    if (!supabase) return;
    setLoading(true);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailInput.trim(), {
      redirectTo: APP_URL,
    });
    setLoading(false);
    if (resetErr) { setError('No se pudo enviar el correo: ' + resetErr.message); return; }
    setResetSent(true);
    setRegisteredEmail(emailInput.trim());
  };

  const handleResendConfirmation = async () => {
    const email = registeredEmail || emailInput.trim();
    if (!email || !supabase) return;
    setLoading(true); setError('');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setLoading(false);
    if (error) { setError('Error al reenviar: ' + error.message); return; }
    setSignUpSent(true);
    setEmailNotConfirmed(false);
  };

  const handleGoogle = async () => {
    if (!supabase) { setError('Supabase no configurado.'); return; }
    setError('');
    if (cpgData) localStorage.setItem('cpg_google_pending', JSON.stringify(cpgData));
    const { error: googleErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (googleErr) setError('Error con Google: ' + googleErr.message);
  };

  const handleGuest = () => onSession({ name: 'Invitado', collegiateNumber: '0000', status: 'INVITADO', isGuest: true });

  return (
    <div className="fixed inset-0 bg-black z-[100] overflow-y-auto">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#0e0e0e] to-[#1a0a2e]" />
      <div className="relative z-10 w-full max-w-md mx-auto px-4 py-8 min-h-full flex flex-col justify-center">
        <div className="flex flex-col items-center mb-6 gap-2">
          <img src="/logo-cpg-grande.png" alt="CPG" className="w-20 h-20 object-contain drop-shadow-2xl" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="text-center">
            <h1 className="text-lg font-bold text-white leading-tight">Colegio de Psicólogos de Guatemala</h1>
            <p className="text-blue-400 text-xs tracking-widest uppercase mt-1">Aula Virtual — CAEDUC</p>
          </div>
        </div>

        <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-6">
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${step === 'collegiate' ? 'bg-blue-600 text-white' : 'bg-green-700/40 text-green-300'}`}>
              {step === 'collegiate' ? '1' : <CheckCircle size={12} />} Colegiado
            </div>
            <div className="flex-1 h-px bg-gray-700" />
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${step === 'auth' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
              2 Verificación
            </div>
          </div>

          {step === 'collegiate' && (
            <>
              <h2 className="text-white font-bold text-xl mb-1">Bienvenido</h2>
              <p className="text-gray-400 text-sm mb-6">{existingUser ? `Hola de nuevo, ${existingUser.name}.` : 'Ingresa tu número de colegiado para continuar.'}</p>
              <div className="mb-4">
                <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Número de Colegiado</label>
                <div className="relative">
                  <input
                    type="number" value={colegiadoInput}
                    onChange={e => { setColegiadoInput(e.target.value); setError(''); setExistingUser(null); }}
                    onBlur={handleColegiadoBlur}
                    onKeyDown={e => e.key === 'Enter' && handleVerifyCollegiado()}
                    className="w-full bg-black border border-gray-700 rounded-lg p-3.5 text-white text-lg font-mono focus:border-blue-500 outline-none transition"
                    placeholder="Ej. 4661" disabled={loading}
                  />
                  {lookingUp && <Loader2 size={16} className="animate-spin text-blue-400 absolute right-3 top-4" />}
                </div>
              </div>
              {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2"><XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}
              <button onClick={handleVerifyCollegiado} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-lg transition flex items-center justify-center gap-2 mb-3">
                {loading ? <><Loader2 size={18} className="animate-spin" /> Verificando con CPG...</> : <><UserCheck size={18} /> Verificar colegiado</>}
              </button>
              <button onClick={handleGuest} disabled={loading} className="w-full bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-700 font-medium py-3 rounded-lg transition flex items-center justify-center gap-2 text-sm">
                <UserX size={16} /> Ver como invitado (acceso limitado)
              </button>
              <p className="text-xs text-gray-600 text-center mt-4">El acceso como invitado no permite ver videos ni obtener certificados.</p>
            </>
          )}

          {step === 'guestname' && (
            <>
              <div className="bg-yellow-900/20 border border-yellow-600/40 rounded-xl p-4 mb-5">
                <p className="text-yellow-400 text-xs font-bold uppercase tracking-wider mb-1">Acceso de prueba</p>
                <p className="text-gray-300 text-sm">Colegiado No. <span className="text-white font-bold">{GUEST_COLEGIADO}</span> — acceso completo sin verificación CPG.</p>
              </div>
              <h2 className="text-white font-bold text-lg mb-1">¿Cuál es tu nombre?</h2>
              <p className="text-gray-400 text-sm mb-4">Ingresa tu nombre completo para continuar.</p>
              {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2"><XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}
              <div className="mb-4">
                <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Nombre completo</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={e => { setGuestName(e.target.value); setError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') {
                    if (!guestName.trim()) { setError('Ingresa tu nombre.'); return; }
                    setCpgData({ colegiado: GUEST_COLEGIADO, name: guestName.trim(), status: 'ACTIVO' });
                    setStep('auth');
                  }}}
                  className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition"
                  placeholder="Ej: María García"
                  maxLength={120}
                  autoFocus
                />
              </div>
              <button
                onClick={() => {
                  if (!guestName.trim()) { setError('Ingresa tu nombre.'); return; }
                  setCpgData({ colegiado: GUEST_COLEGIADO, name: guestName.trim(), status: 'ACTIVO' });
                  setStep('auth');
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 mb-3"
              >
                Continuar →
              </button>
              <button onClick={() => { setStep('collegiate'); setError(''); }} className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition">
                ← Cambiar número de colegiado
              </button>
            </>
          )}


          {step === 'auth' && cpgData && (
            <>
              <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-4 mb-6">
                <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-1">✓ Colegiado verificado</p>
                <p className="text-white font-bold">{cpgData.name}</p>
                <p className="text-gray-400 text-sm">No. {cpgData.colegiado} · <span className={`font-semibold ${cpgData.status === 'ACTIVO' ? 'text-green-400' : 'text-red-400'}`}>{cpgData.status}</span></p>
              </div>

              {(signUpSent || emailNotConfirmed) ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-blue-800/30 border border-blue-600/40 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail size={28} className="text-blue-400" />
                  </div>
                  <h2 className="text-white font-bold text-lg mb-2">Revisa tu correo</h2>
                  <p className="text-gray-400 text-sm mb-1">Enviamos un enlace de confirmación a:</p>
                  <p className="text-blue-300 font-mono text-sm mb-3">{maskEmail(registeredEmail || emailInput)}</p>
                  <p className="text-gray-500 text-xs mb-1">Haz clic en el enlace del correo para activar tu cuenta.</p>
                  <p className="text-gray-600 text-xs mb-5">Si no lo ves, revisa la carpeta de spam o correo no deseado.</p>
                  <button onClick={handleResendConfirmation} disabled={loading} className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2 text-sm mb-3">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <><Mail size={16} /> Reenviar correo de confirmación</>}
                  </button>
                  <button onClick={() => { setSignUpSent(false); setEmailNotConfirmed(false); setAuthMode('login'); }} className="text-gray-500 hover:text-gray-300 text-sm transition">
                    ← Ya confirmé, quiero ingresar
                  </button>
                </div>
              ) : registeredEmail ? (
                resetSent ? (
                  <div className="text-center py-4">
                    <div className="w-14 h-14 bg-green-800/30 border border-green-600/40 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={28} className="text-green-400" />
                    </div>
                    <h2 className="text-white font-bold text-lg mb-2">Correo enviado</h2>
                    <p className="text-gray-400 text-sm mb-1">Revisa tu bandeja de entrada en:</p>
                    <p className="text-blue-300 font-mono text-sm mb-4">{maskEmail(registeredEmail)}</p>
                    <p className="text-gray-500 text-xs">Sigue el enlace del correo para crear una nueva contraseña.</p>
                    <button onClick={() => { setResetSent(false); }} className="mt-5 text-gray-500 hover:text-gray-300 text-sm transition">
                      ← Volver al inicio de sesión
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="bg-yellow-900/20 border border-yellow-600/40 rounded-xl p-4 mb-5">
                      <p className="text-yellow-400 text-xs font-bold uppercase tracking-wider mb-1">⚠ Colegiado ya registrado</p>
                      <p className="text-gray-300 text-sm">El número <span className="text-white font-bold">{cpgData.colegiado}</span> ya está vinculado a una cuenta.</p>
                      <p className="text-gray-400 text-sm mt-1">Correo registrado: <span className="text-blue-300 font-mono">{maskEmail(registeredEmail)}</span></p>
                    </div>
                    <h2 className="text-white font-bold text-lg mb-1">Ingresa a tu cuenta</h2>
                    <p className="text-gray-400 text-sm mb-4">Usa el correo y contraseña con los que te registraste.</p>
                    {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2"><XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}
                    <div className="mb-3">
                      <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Correo electrónico</label>
                      <input type="email" value={emailInput} onChange={e => { setEmailInput(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition" placeholder={maskEmail(registeredEmail)} />
                    </div>
                    <div className="mb-4">
                      <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Contraseña</label>
                      <input type="password" value={passwordInput} onChange={e => { setPasswordInput(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition" placeholder="••••••••" />
                    </div>
                    <button onClick={handleEmailAuth} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 mb-3">
                      {loading ? <><Loader2 size={18} className="animate-spin" /> Verificando...</> : <><Mail size={18} /> Ingresar</>}
                    </button>

                    {/* Separador visual */}
                    <div className="flex items-center gap-3 my-3">
                      <div className="flex-1 h-px bg-gray-700" />
                      <span className="text-xs text-gray-500">o</span>
                      <div className="flex-1 h-px bg-gray-700" />
                    </div>

                    {/* Google OAuth */}
                    <button onClick={handleGoogle} disabled={loading} className="w-full bg-white hover:bg-gray-100 text-gray-800 font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2 mb-3 text-sm">
                      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.1-6.1C34.46 3.19 29.5 1 24 1 14.82 1 7.07 6.48 3.64 14.24l7.1 5.52C12.5 13.37 17.77 9.5 24 9.5z"/><path fill="#4285F4" d="M46.52 24.5c0-1.64-.15-3.22-.42-4.75H24v9h12.67c-.55 2.97-2.2 5.48-4.67 7.17l7.18 5.57C43.32 37.3 46.52 31.36 46.52 24.5z"/><path fill="#FBBC05" d="M10.74 28.24A14.54 14.54 0 0 1 9.5 24c0-1.48.26-2.91.7-4.24l-7.1-5.52A23.94 23.94 0 0 0 0 24c0 3.87.93 7.52 2.57 10.74l8.17-6.5z"/><path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.49-4.94l-7.18-5.57C28.6 37.84 26.42 38.5 24 38.5c-6.23 0-11.5-3.87-13.26-9.26l-8.17 6.5C6.07 43.52 14.82 47 24 47z"/></svg>
                      Ingresar con Google
                    </button>

                    <button onClick={handlePasswordReset} disabled={loading} className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2 text-sm mb-3">
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <><KeyRound size={16} /> Olvidé mi contraseña — enviar correo de recuperación</>}
                    </button>
                    <button onClick={() => { setStep('collegiate'); setError(''); setRegisteredEmail(null); }} className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition">
                      ← Cambiar número de colegiado
                    </button>
                  </div>
                )
              ) : (
                <>
                  {authMode === 'register' ? (
                    <div className="bg-blue-900/30 border border-blue-500/40 rounded-xl p-4 mb-5">
                      <p className="text-blue-300 text-xs font-bold uppercase tracking-wider mb-1">⚠ Necesitas crear tu cuenta</p>
                      <p className="text-gray-200 text-sm">Tu colegiado <span className="text-white font-bold">{cpgData.colegiado}</span> aún no está vinculado a una cuenta. Elige cómo crearla:</p>
                    </div>
                  ) : (
                    <h2 className="text-white font-bold text-lg mb-3">Ingresa a tu cuenta</h2>
                  )}

                  {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2"><XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}

                  {/* Google primero — más visible */}
                  <button onClick={handleGoogle} disabled={loading} className="w-full bg-white hover:bg-gray-100 text-gray-800 font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2 mb-3 text-sm shadow-md">
                    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.1-6.1C34.46 3.19 29.5 1 24 1 14.82 1 7.07 6.48 3.64 14.24l7.1 5.52C12.5 13.37 17.77 9.5 24 9.5z"/><path fill="#4285F4" d="M46.52 24.5c0-1.64-.15-3.22-.42-4.75H24v9h12.67c-.55 2.97-2.2 5.48-4.67 7.17l7.18 5.57C43.32 37.3 46.52 31.36 46.52 24.5z"/><path fill="#FBBC05" d="M10.74 28.24A14.54 14.54 0 0 1 9.5 24c0-1.48.26-2.91.7-4.24l-7.1-5.52A23.94 23.94 0 0 0 0 24c0 3.87.93 7.52 2.57 10.74l8.17-6.5z"/><path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.49-4.94l-7.18-5.57C28.6 37.84 26.42 38.5 24 38.5c-6.23 0-11.5-3.87-13.26-9.26l-8.17 6.5C6.07 43.52 14.82 47 24 47z"/></svg>
                    {authMode === 'register' ? 'Crear cuenta con Google' : 'Continuar con Google'}
                  </button>

                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-gray-700" />
                    <span className="text-xs text-gray-500">{authMode === 'register' ? 'o usa tu correo' : 'o'}</span>
                    <div className="flex-1 h-px bg-gray-700" />
                  </div>

                  <div className="mb-3">
                    <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Correo electrónico</label>
                    <input type="email" value={emailInput} onChange={e => { setEmailInput(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition" placeholder="tucorreo@ejemplo.com" />
                  </div>
                  <div className="mb-4">
                    <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Contraseña {authMode === 'register' && <span className="text-gray-600 normal-case">(mínimo 6 caracteres)</span>}</label>
                    <input type="password" value={passwordInput} onChange={e => { setPasswordInput(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition" placeholder="••••••••" />
                  </div>
                  <button onClick={handleEmailAuth} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 mb-3">
                    {loading ? <><Loader2 size={18} className="animate-spin" /> Procesando...</> : <><Mail size={18} /> {authMode === 'login' ? 'Ingresar' : 'Crear cuenta con correo'}</>}
                  </button>

                  {authMode === 'login' && (
                    <button onClick={handlePasswordResetNormal} disabled={loading} className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition flex items-center justify-center gap-1.5 mb-1">
                      <KeyRound size={14} /> Olvidé mi contraseña
                    </button>
                  )}

                  {/* Toggle al modo opuesto, abajo y discreto */}
                  {authMode === 'register' ? (
                    <button onClick={() => { setAuthMode('login'); setError(''); }} className="w-full text-gray-400 hover:text-gray-200 text-sm py-2 transition mt-1">
                      ¿Ya tienes cuenta? Inicia sesión →
                    </button>
                  ) : (
                    <button onClick={() => { setAuthMode('register'); setError(''); }} className="w-full text-gray-400 hover:text-gray-200 text-sm py-2 transition mt-1">
                      ¿Primera vez? Crear cuenta →
                    </button>
                  )}
                  <button onClick={() => { setStep('collegiate'); setError(''); setRegisteredEmail(null); }} className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition">
                    ← Cambiar número de colegiado
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════
// ██ FIX #4: EMISIÓN MASIVA DE CERTIFICADOS        ██
// ══════════════════════════════════════════════════
function BulkCertificateEmitter({ videos, activities, commissions = [], onClose, onCertsCreated }) {
  const [mode, setMode] = useState('existing');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  const [inputMode, setInputMode] = useState('text');
  const [colegiadosText, setColegiadosText] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const allItems = [
    ...videos.map(v => ({ id: 'video-' + v.id, label: v.title, duration: v.duration, videoId: v.id, type: 'video' })),
    ...activities.map(a => ({ id: 'act-' + a.id, label: a.title, duration: a.horas || a.duration || '', videoId: a.id, type: 'activity' })),
  ];

  const parseColegiadosList = async () => {
    let numbers = [];
    if (inputMode === 'text') {
      numbers = colegiadosText.split(/[,\n\r;]+/).map(n => n.trim()).filter(n => n && /^\d+$/.test(n));
    } else if (csvFile) {
      const text = await csvFile.text();
      numbers = text.split(/[,\n\r;]+/).map(n => n.trim()).filter(n => n && /^\d+$/.test(n));
    }
    return [...new Set(numbers)];
  };

  const handleProcess = async () => {
    setError(''); setResults(null);
    let certTitle = '', certDuration = '', certVideoId = 0;
    if (mode === 'existing') {
      const sel = allItems.find(i => i.id === selectedVideoId);
      if (!sel) { setError('Selecciona una actividad o curso.'); return; }
      certTitle = sel.label; certDuration = sel.duration || ''; certVideoId = sel.videoId;
    } else {
      if (!customTitle.trim()) { setError('Ingresa el nombre de la actividad.'); return; }
      certTitle = customTitle.trim(); certDuration = customDuration.trim(); certVideoId = Date.now();
    }
    const numbers = await parseColegiadosList();
    if (numbers.length === 0) { setError('No se encontraron números de colegiado válidos.'); return; }
    if (numbers.length > 500) { setError('Máximo 500 colegiados por lote.'); return; }

    setProcessing(true);
    const resultsList = [];
    const currentDate = new Date();
    const fmt = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');

    // Precalcular snapshot de comisiones del curso/actividad seleccionado
    let selectedCommissionIds = [];
    if (mode === 'existing') {
      const sel = allItems.find(i => i.id === selectedVideoId);
      if (sel?.type === 'video') {
        const v = videos.find(x => x.id === sel.videoId);
        if (v?.hasCommissions) selectedCommissionIds = v.commissions || [];
      } else if (sel?.type === 'activity') {
        const a = activities.find(x => x.id === sel.videoId);
        if (a?.hasCommissions) selectedCommissionIds = a.commissions || [];
      }
    }
    const commissionsSnapshot = commissions
      .filter(c => selectedCommissionIds.includes(c.id))
      .map(c => ({ id: c.id, commission_name: c.commission_name, signer_name: c.signer_name, signer_title: c.signer_title, signature_url: c.signature_url, logo_url: c.logo_url || null }));

    for (const num of numbers) {
      try {
        const data = await consultarColegiado(num);
        // Anti-duplicado: ¿ya tiene cert para este videoId?
        if (supabase) {
          const { data: existing } = await supabase.from('cpg_certificates').select('certificate_code').eq('collegiate_number', num).eq('video_id', certVideoId).maybeSingle();
          if (existing) {
            resultsList.push({ num, name: data.name, cpgStatus: data.status, status: 'duplicate', msg: 'Ya existía: ' + existing.certificate_code });
            continue;
          }
        }
        const certCode = 'CPG-' + fmt(currentDate) + '-' + num + '-' + certVideoId;
        const certRecord = {
          certificate_code: certCode, collegiate_number: num,
          recipient_name: data.name || 'Colegiado ' + num, status: data.status || 'DESCONOCIDO',
          video_id: certVideoId, video_title: certTitle,
          video_duration: String(certDuration || ''), issued_at: currentDate.toISOString(),
          verify_url: APP_URL + '/?cert=' + certCode,
          commissions_snapshot: commissionsSnapshot,
        };
        if (supabase) {
          const { error: insertErr } = await supabase.from('cpg_certificates').insert(certRecord);
          if (insertErr) {
            if (insertErr.code === '23505') resultsList.push({ num, name: data.name, cpgStatus: data.status, status: 'duplicate', msg: 'Ya contaba con el certificado' });
            else resultsList.push({ num, name: data.name, status: 'error', msg: insertErr.message });
          } else {
            resultsList.push({ num, name: data.name, cpgStatus: data.status, status: 'ok', code: certCode });
          }
        }
      } catch (e) {
        resultsList.push({ num, name: '', status: 'error', msg: e.message || 'Colegiado no encontrado' });
      }
    }
    setResults(resultsList); setProcessing(false);
    if (onCertsCreated) onCertsCreated();
  };

  const successCount = results ? results.filter(r => r.status === 'ok').length : 0;
  const dupCount = results ? results.filter(r => r.status === 'duplicate').length : 0;
  const errorCount = results ? results.filter(r => r.status === 'error').length : 0;

  return (
    // overlay scrolleable: si el modal excede la altura del viewport (zoom, pantallas
    // chicas), se puede scrollear TODO el overlay y siempre se alcanza header/footer.
    <div className="fixed inset-0 bg-black/70 z-[70] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 py-10">
        <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl my-4">
          {/* Header sticky para que la X esté siempre visible al hacer scroll */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-[#141414] z-10 rounded-t-2xl">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><Award size={20} className="text-yellow-400" /> Emitir certificados masivos</h3>
              <p className="text-sm text-gray-400">Genera certificados para múltiples colegiados a la vez.</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0"><X size={18} /></button>
          </div>
          <div className="px-6 py-6 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2"><XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}
          <div>
            <p className="text-white font-bold text-sm mb-3 uppercase tracking-wider">1. Actividad o curso</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMode('existing')} className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${mode === 'existing' ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-gray-700 text-gray-400'}`}>Seleccionar existente</button>
              <button onClick={() => setMode('custom')} className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${mode === 'custom' ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-gray-700 text-gray-400'}`}>Nombre personalizado</button>
            </div>
            {mode === 'existing' ? (
              <select value={selectedVideoId} onChange={e => setSelectedVideoId(e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-sm focus:border-blue-500 outline-none">
                <option value="">— Selecciona un curso o actividad —</option>
                <optgroup label="Cursos (videos)">{videos.map(v => <option key={'v-'+v.id} value={'video-'+v.id}>{v.title} ({v.duration}h)</option>)}</optgroup>
                <optgroup label="Actividades">{activities.map(a => <option key={'a-'+a.id} value={'act-'+a.id}>{a.title} ({a.date}{a.horas ? ` · ${a.horas}h` : ''})</option>)}</optgroup>
              </select>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2"><input type="text" value={customTitle} onChange={e => setCustomTitle(e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Nombre de la actividad" /></div>
                <div><input type="text" value={customDuration} onChange={e => setCustomDuration(e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Duración (hrs)" /></div>
              </div>
            )}
          </div>
          <div>
            <p className="text-white font-bold text-sm mb-3 uppercase tracking-wider">2. Números de colegiado</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setInputMode('text')} className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${inputMode === 'text' ? 'border-green-500 bg-green-900/30 text-green-300' : 'border-gray-700 text-gray-400'}`}>Pegar números</button>
              <button onClick={() => setInputMode('csv')} className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${inputMode === 'csv' ? 'border-green-500 bg-green-900/30 text-green-300' : 'border-gray-700 text-gray-400'}`}>Subir CSV</button>
            </div>
            {inputMode === 'text' ? (
              <div>
                <textarea value={colegiadosText} onChange={e => setColegiadosText(e.target.value)} rows={5} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-sm font-mono focus:border-blue-500 outline-none resize-none" placeholder={"Separados por comas o saltos de línea:\n4661, 1234, 5678"} />
                <p className="text-xs text-gray-500 mt-1">{colegiadosText.split(/[,\n\r;]+/).filter(n => n.trim() && /^\d+$/.test(n.trim())).length} números detectados</p>
              </div>
            ) : (
              <div>
                <label className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 px-4 py-3 rounded-lg cursor-pointer transition text-sm text-gray-300 hover:text-white w-fit">
                  <Upload size={16} />{csvFile ? csvFile.name : 'Seleccionar archivo CSV'}
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={e => setCsvFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            )}
          </div>
          {!results && <button onClick={handleProcess} disabled={processing} className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 text-white font-bold py-3.5 rounded-lg transition flex items-center justify-center gap-2 text-lg">{processing ? <><Loader2 size={20} className="animate-spin" /> Procesando...</> : <><Award size={20} /> Generar certificados</>}</button>}
          {results && (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-green-400">{successCount}</p><p className="text-xs text-gray-400">Emitidos</p></div>
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-amber-400">{dupCount}</p><p className="text-xs text-gray-400">Ya existían</p></div>
                <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-red-400">{errorCount}</p><p className="text-xs text-gray-400">Errores</p></div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-800 max-h-60 overflow-y-auto">
                <table className="w-full text-sm"><thead className="bg-gray-900 text-gray-400 uppercase text-xs sticky top-0"><tr><th className="text-left px-3 py-2">Colegiado</th><th className="text-left px-3 py-2">Nombre</th><th className="text-left px-3 py-2">Estado</th><th className="text-left px-3 py-2">Resultado</th></tr></thead>
                <tbody>{results.map((r, i) => (<tr key={i} className="border-t border-gray-800"><td className="px-3 py-2 text-white font-mono">{r.num}</td><td className="px-3 py-2 text-gray-300">{r.name || '—'}</td><td className="px-3 py-2"><span className={`text-xs font-bold ${r.cpgStatus === 'ACTIVO' ? 'text-green-400' : 'text-gray-500'}`}>{r.cpgStatus || '—'}</span></td><td className="px-3 py-2">{r.status === 'ok' ? <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Emitido</span> : r.status === 'duplicate' ? <span className="text-xs text-amber-400 flex items-center gap-1"><Shield size={12} /> {r.msg}</span> : <span className="text-xs text-red-400 flex items-center gap-1"><XCircle size={12} /> {r.msg}</span>}</td></tr>))}</tbody></table>
              </div>
              <button onClick={() => { setResults(null); setColegiadosText(''); setCsvFile(null); }} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition">Emitir otro lote</button>
            </div>
          )}
        </div>
          <div className="flex justify-end px-6 py-4 border-t border-gray-800"><button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg font-semibold text-sm">Cerrar</button></div>
        </div>
      </div>
    </div>
  );
}

// ── APP PRINCIPAL ─────────────────────────────────
export default function App() {
  const [sessionUser, setSessionUser] = useState(() => {
    try {
      const saved = localStorage.getItem('cpg_session');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [completedVideos, setCompletedVideos] = useState(new Set());
  const [view, setView] = useState('home');
  const [videos, setVideos] = useState([]);
  const [viewCounts, setViewCounts] = useState({});
  const [totalViews, setTotalViews] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState('');
  const [manualCertificate, setManualCertificate] = useState(null);
  const [authError, setAuthError] = useState('');
  const [activities, setActivities] = useState([]);
  const [userProfile, setUserProfile] = useState({ name: '', collegiateNumber: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [liveSession, setLiveSession] = useState(null);
  const [reprintCert, setReprintCert] = useState(null);
  const [certTemplate, setCertTemplate] = useState(DEFAULT_CERT_CONFIG);
  const [siteLogos, setSiteLogos] = useState(DEFAULT_SITE_LOGOS);
  const [homepagePromo, setHomepagePromo] = useState(DEFAULT_HOMEPAGE_PROMO);

  // ── Tracker de clicks en botones del nav ──
  // Usa navigator.sendBeacon — diseñado específicamente para enviar datos
  // ANTES de que la página se descargue. Garantiza que clicks como
  // "Créditos Académicos" (que hacen window.location.href = ...) sean
  // registrados sin importar la velocidad de la navegación.
  //
  // sendBeacon no permite headers custom, por eso usamos el wrapper en
  // schema public (public.increment_button_click) que sí está accesible
  // sin Content-Profile. El apikey va en la URL como query param.
  const trackClick = useCallback((key, label = null) => {
    if (!key || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    try {
      const url = `${SUPABASE_URL}/rest/v1/rpc/increment_button_click?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}`;
      const payload = JSON.stringify({ p_key: key, p_label: label });

      // Método principal: fetch con keepalive. Maneja el preflight CORS de
      // Supabase correctamente y sobrevive a la navegación gracias a keepalive.
      // (No usamos sendBeacon como principal porque, al enviar
      // Content-Type: application/json, requiere un preflight CORS que
      // sendBeacon no puede realizar y la petición se descarta en silencio.)
      const doFetch = () => fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: payload,
        keepalive: true,
      }).catch(e => console.warn('[trackClick]', e?.message));

      const p = doFetch();
      // Respaldo: si el fetch falla de inmediato, intenta sendBeacon.
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          try {
            if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
              navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
            }
          } catch {}
        });
      }
    } catch (e) {
      console.warn('[trackClick] exception:', e?.message);
    }
  }, []);

  // ── Botones personalizables del nav (gestionables desde admin) ──
  const [navButtons, setNavButtons] = useState([]);
  const loadNavButtons = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('cpg_nav_buttons')
        .select('*')
        .eq('active', true)
        .order('display_order', { ascending: true });
      setNavButtons(data || []);
    } catch {}
  }, []);
  useEffect(() => { loadNavButtons(); }, [loadNavButtons]);

  // ── Medición dinámica del nav superior — para que cualquier zoom/wrap no tape contenido ──
  const navRef = useRef(null);
  const [navHeight, setNavHeight] = useState(72); // valor inicial razonable
  // ── Actualizar sesión: reconsulta datos del colegiado para reflejar cambios (estado, pagos, etc.) ──
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  // ── Cambiar mi propio correo registrado (autogestión) ──
  const [showEmailEdit, setShowEmailEdit] = useState(false);
  const [newOwnEmail, setNewOwnEmail] = useState('');
  const [ownEmailMsg, setOwnEmailMsg] = useState('');
  const [savingOwnEmail, setSavingOwnEmail] = useState(false);

  const handleChangeOwnEmail = useCallback(async () => {
    const v = newOwnEmail.trim().toLowerCase();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setOwnEmailMsg('Escribe un correo válido.'); return; }
    if (!supabase) { setOwnEmailMsg('Sin conexión.'); return; }
    setSavingOwnEmail(true); setOwnEmailMsg('');
    try {
      const { data, error } = await supabase.rpc('change_own_email', { new_email: v });
      if (error) throw error;
      if (data?.success === false) {
        setOwnEmailMsg(data?.message || 'No se pudo cambiar el correo.');
      } else {
        // Actualizar la sesión local con el nuevo correo
        setSessionUser(prev => {
          const updated = { ...prev, email: v };
          try { localStorage.setItem('cpg_session', JSON.stringify(updated)); } catch {}
          return updated;
        });
        setOwnEmailMsg('✓ Correo actualizado. Úsalo para ingresar de ahora en adelante.');
        setNewOwnEmail('');
        setTimeout(() => { setShowEmailEdit(false); setOwnEmailMsg(''); }, 2500);
      }
    } catch (e) {
      setOwnEmailMsg('Error: ' + (e?.message || e));
    }
    setSavingOwnEmail(false);
  }, [newOwnEmail]);

  const handleRefreshSession = useCallback(async () => {
    if (!sessionUser || sessionUser.isGuest || !sessionUser.collegiateNumber) return;
    setRefreshingSession(true);
    setRefreshMsg('');
    try {
      const res = await fetch('https://ilyospunwucdojrnfgti.supabase.co/functions/v1/consultar-colegiado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionUser.collegiateNumber }),
      });
      const data = await res.json();
      if (data.error) {
        setRefreshMsg('No se pudo actualizar: ' + data.error);
      } else {
        const updated = {
          ...sessionUser,
          name: data.nombre ?? sessionUser.name,
          status: data.estatus ?? sessionUser.status,
          ...(data.fechaColegiacion !== undefined && { fechaColegiacion: data.fechaColegiacion }),
          ...(data.ultimoPago !== undefined && { ultimoPago: data.ultimoPago }),
          ...(data.cuotaCongreso !== undefined && { cuotaCongreso: data.cuotaCongreso }),
        };
        setSessionUser(updated);
        try { localStorage.setItem('cpg_session', JSON.stringify(updated)); } catch {}
        setRefreshMsg('✓ Sesión actualizada');
        setTimeout(() => setRefreshMsg(''), 2500);
      }
    } catch (e) {
      setRefreshMsg('Error de conexión');
    }
    setRefreshingSession(false);
  }, [sessionUser]);

  useLayoutEffect(() => {
    if (!navRef.current) return;
    // Medir una vez al montar
    setNavHeight(navRef.current.offsetHeight);
    // Observar cambios (zoom, resize, wrap de botones, etc.)
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = Math.ceil(entry.contentRect.height + 8); // +8 colchón visual
        setNavHeight(prev => prev !== h ? h : prev);
      }
    });
    ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [sessionUser]); // re-mide si cambia sesión (afecta qué botones se muestran)

  // ── FIX #2: estado para recovery mode ──
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  // ── Cambio de contraseña obligatorio (tras ingresar con contraseña temporal) ──
  const [forcePwChange, setForcePwChange] = useState(false);
  // ── Entrega 2: estados para comisiones y asistencia ──
  const [commissions, setCommissions] = useState([]);
  const [showProfile, setShowProfile] = useState(false);
  const [profileCredits, setProfileCredits] = useState({ creditos: null, actividades: null, loading: false });

  const fetchProfileCredits = useCallback(async () => {
    if (!supabase || !sessionUser || sessionUser.isGuest) return;
    setProfileCredits(p => ({ ...p, loading: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || supabase.supabaseKey;
      const res = await fetch(CREDITOS_EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': supabase.supabaseKey,
        },
        body: JSON.stringify({ colegiado_numero: sessionUser.collegiateNumber }),
      });
      if (!res.ok) {
        setProfileCredits({ creditos: null, actividades: null, loading: false });
        return;
      }
      const data = await res.json();
      setProfileCredits({
        creditos: data.creditos_anio ?? 0,
        actividades: data.actividades_anio ?? 0,
        totalCreditosHistorico: data.creditos_historico ?? 0,
        totalActividadesHistorico: data.actividades_historico ?? 0,
        loading: false,
      });
    } catch { setProfileCredits({ creditos: null, actividades: null, loading: false }); }
  }, [sessionUser]);

  useEffect(() => {
    if (!showProfile) return;
    const handler = (e) => {
      if (!e.target.closest('[data-profile-panel]')) setShowProfile(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfile]);

  // Auto-enriquecer datos CPG si la sesión guardada no los tiene (sesión anterior al fix)
  useEffect(() => {
    if (!sessionUser || sessionUser.isGuest || sessionUser.collegiateNumber === '100000') return;
    // Re-consultar al CPG si falta cualquiera de los datos (sesiones antiguas no tienen cuotaCongreso)
    const hasAll = sessionUser.fechaColegiacion && sessionUser.ultimoPago && sessionUser.cuotaCongreso;
    if (hasAll) return;
    const enrich = async () => {
      try {
        const data = await consultarColegiado(sessionUser.collegiateNumber);
        const updated = {
          ...sessionUser,
          fechaColegiacion: data.fecha_colegiacion || '',
          ultimoPago: data.ultimo_pago || '',
          cuotaCongreso: data.cuota_congreso || '',
        };
        localStorage.setItem('cpg_session', JSON.stringify(updated));
        setSessionUser(updated);
      } catch {}
    };
    enrich();
  }, [sessionUser?.collegiateNumber]);

  const certCodeFromUrl = new URLSearchParams(window.location.search).get('cert');
  const attendFromUrl = new URLSearchParams(window.location.search).get('attend') === '1';

  // ── Auto-navegar a sesión en vivo si viene con ?attend=1 ──
  useEffect(() => {
    if (attendFromUrl && liveSession?.active) setView('live');
  }, [attendFromUrl, liveSession?.active]);

  // ── Scroll automático al tope en cada cambio de vista ──
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  // ── Scroll al tope al abrir un certificado desde el historial ──
  useEffect(() => {
    if (reprintCert) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [reprintCert]);


  // ══════════════════════════════════════════════════
  // ██ FIX #2: Detectar callback de recovery de Supabase
  // ══════════════════════════════════════════════════
  useEffect(() => {
    if (!supabase) return;
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      const accessToken = params.get('access_token');
      const errorParam = params.get('error');
      if (errorParam) {
        console.warn('[CPG Auth] Error en enlace:', errorParam, params.get('error_description'));
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }
      if (type === 'recovery' && accessToken) {
        setShowPasswordReset(true);
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Detectar PASSWORD_RECOVERY event de Supabase
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
        return;
      }
      // Contraseña temporal: si la cuenta está marcada, forzar cambio antes de continuar.
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user?.user_metadata?.must_change_password) {
        setForcePwChange(true);
      }
      if (event === 'SIGNED_IN' && session) {
        const pending = localStorage.getItem('cpg_google_pending');
        if (pending) {
          try {
            const data = JSON.parse(pending);
            localStorage.removeItem('cpg_google_pending');
            const googleEmail = session.user.email;
            const collegiateNumber = data.colegiado;
            const { data: existing } = await supabase
              .from('cpg_user_profiles')
              .select('email')
              .eq('collegiate_number', collegiateNumber)
              .maybeSingle();
            // Colegiado de prueba (100000): permitir cualquier cuenta de Google
            if (collegiateNumber !== '100000' && existing?.email && existing.email.toLowerCase() !== googleEmail.toLowerCase()) {
              await supabase.auth.signOut();
              localStorage.setItem('cpg_google_blocked', JSON.stringify({
                maskedEmail: existing.email.slice(0,3) + '***@' + existing.email.split('@')[1],
                colegiado: collegiateNumber
              }));
              window.location.reload();
              return;
            }
            await supabase.from('cpg_user_profiles').upsert(
              { collegiate_number: collegiateNumber, email: googleEmail, name: data.name },
              { onConflict: 'collegiate_number' }
            );
            const user = { name: data.name, collegiateNumber: collegiateNumber, status: data.status, isGuest: false, email: googleEmail, fechaColegiacion: data.fecha_colegiacion || '', ultimoPago: data.ultimo_pago || '', cuotaCongreso: data.cuota_congreso || '' };
            localStorage.setItem('cpg_session', JSON.stringify(user));
            setSessionUser(user);
          } catch {}
        } else {
          // SSO desde Créditos Académicos
          try {
            const params = new URLSearchParams(window.location.search);
            const ssoColegiado = params.get('sso_colegiado');
            const ssoNombre = decodeURIComponent(params.get('sso_nombre') || '');
            if (ssoColegiado) {
              // Verificar/enriquecer con perfil existente
              const { data: profile } = await supabase.from('cpg_user_profiles').select('name, email').eq('collegiate_number', ssoColegiado).maybeSingle();
              const nombre = profile?.name || ssoNombre;
              // Preservar datos CPG si ya existían en la sesión guardada
              let prevCpg = {};
              try { const prev = JSON.parse(localStorage.getItem('cpg_session') || '{}'); if (prev.collegiateNumber === ssoColegiado) prevCpg = { status: prev.status, fechaColegiacion: prev.fechaColegiacion, ultimoPago: prev.ultimoPago, cuotaCongreso: prev.cuotaCongreso }; } catch {}
              const user = { name: nombre, collegiateNumber: ssoColegiado, isGuest: false, email: session.user.email, status: prevCpg.status || '', fechaColegiacion: prevCpg.fechaColegiacion || '', ultimoPago: prevCpg.ultimoPago || '', cuotaCongreso: prevCpg.cuotaCongreso || '' };
              // Salvaguarda: NO sobrescribir el correo vinculado si ya existe otro registrado
              // para este colegiado (típicamente cuando un admin con cuenta institucional
              // navega entre apps llevando un sso_colegiado del usuario regular).
              const existingEmail = profile?.email || '';
              const sameEmail = existingEmail.toLowerCase() === (session.user.email || '').toLowerCase();
              if (!existingEmail) {
                await supabase.from('cpg_user_profiles').upsert(
                  { collegiate_number: ssoColegiado, email: session.user.email, name: nombre },
                  { onConflict: 'collegiate_number' }
                );
              } else if (sameEmail) {
                // Mismo correo: solo actualizar el nombre si cambió.
                if (nombre && nombre !== profile?.name) {
                  await supabase.from('cpg_user_profiles')
                    .update({ name: nombre })
                    .eq('collegiate_number', ssoColegiado);
                }
              } else {
                console.warn('[SSO] Colegiado', ssoColegiado, 'ya está vinculado a otro correo; no se sobrescribe.');
              }
              localStorage.setItem('cpg_session', JSON.stringify(user));
              setSessionUser(user);
              window.history.replaceState(null, '', window.location.pathname);
            }
          } catch {}
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadViewCounts = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('cpg_video_views').select('video_id, view_count');
      if (data) {
        const counts = {};
        let total = 0;
        data.forEach(row => { counts[row.video_id] = row.view_count; total += row.view_count; });
        setViewCounts(counts);
        setTotalViews(total);
      }
    } catch {}
  };

  const loadLiveSession = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('cpg_live_session').select('*').eq('id', 1).single();
      if (!data) return;
      // Shallow-compare antes de setState: el polling cada 30s no debe disparar
      // un re-render completo del árbol App si nada cambió en la BD.
      setLiveSession(prev => {
        if (prev
          && prev.active === data.active
          && prev.url === data.url
          && prev.title === data.title
          && prev.platform === data.platform
          && prev.updated_at === data.updated_at) {
          return prev; // misma referencia → React no re-renderiza
        }
        return data;
      });
    } catch {}
  };

  const saveLiveSession = async (updates) => {
    const next = { ...liveSession, ...updates, updated_at: new Date().toISOString() };
    setLiveSession(next);
    if (!supabase) return { error: null };
    // Whitelist explícito — solo enviamos columnas escribibles del view/tabla.
    // Antes hacíamos spread de `next` (que incluye id, created_at, etc.) y eso
    // hacía fallar el upsert silenciosamente, revirtiendo el estado al siguiente poll.
    const payload = {
      id: 1,
      active: next.active ?? false,
      title: next.title || '',
      platform: next.platform || 'youtube',
      url: next.url || '',
      started_at: next.started_at || null,
      updated_at: next.updated_at,
      commissions_snapshot: next.commissions_snapshot ?? [],
    };
    const { error } = await supabase
      .from('cpg_live_session')
      .upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('[saveLiveSession] Error guardando en BD:', error.message, error);
      // No revertimos automáticamente — el admin debe ver el error y reintentar
      // (antes esto causaba que la transmisión "se prendiera y apagara sola")
      return { error };
    }
    return { error: null };
  };

  const registerAttendance = async (extraFields = {}) => {
    if (!supabase || !sessionUser || sessionUser.isGuest) return { success: false, message: 'No autenticado.' };
    if (!liveSession?.active) return { success: false, message: 'La sesión ya no está activa.' };
    try {
      const { error } = await supabase.from('cpg_live_attendance').insert({
        collegiate_number: sessionUser.collegiateNumber,
        name: sessionUser.name,
        email: extraFields.email || sessionUser.email || '',
        department: extraFields.department || '',
        phone: extraFields.phone || '',
        country: extraFields.country || '',
        platform: liveSession.platform,
        session_title: liveSession.title,
      });
      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (e) {
      return { success: false, message: e?.message || 'Error desconocido.' };
    }
  };

  // ── Cargar y guardar config de plantilla de certificado ──
  const loadCertConfig = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('cpg_cert_config').select('config').eq('id', 1).single();
      if (data?.config) setCertTemplate(prev => ({ ...DEFAULT_CERT_CONFIG, ...prev, ...data.config }));
    } catch {}
  };

  const loadCommissions = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('cpg_commissions').select('*').eq('active', true).order('display_order', { ascending: true });
      if (data) setCommissions(data);
    } catch {}
  };

  const loadSiteLogos = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('cpg_site_config').select('config').eq('id', 1).single();
      if (data?.config) setSiteLogos(prev => ({ ...DEFAULT_SITE_LOGOS, ...prev, ...data.config }));
    } catch {}
  };

  const loadHomepagePromo = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('cpg_homepage_promo')
        .select('active, image_url, link_url, alt_text')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setHomepagePromo({
          active: Boolean(data.active),
          imageUrl: data.image_url || '',
          linkUrl: data.link_url || '',
          altText: data.alt_text || DEFAULT_HOMEPAGE_PROMO.altText,
        });
      }
    } catch (error) {
      console.warn('[homepagePromo] No se pudo cargar la configuración:', error?.message);
    }
  };

  const saveSiteLogos = async (newLogos) => {
    const merged = { ...siteLogos, ...newLogos };
    if (!supabase) {
      setSiteLogos(merged);
      return merged;
    }
    const { error } = await supabase.from('cpg_site_config').upsert({ id: 1, config: merged, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
    setSiteLogos(merged);
    return merged;
  };

  const saveHomepagePromo = async (newPromo) => {
    const normalized = { ...DEFAULT_HOMEPAGE_PROMO, ...newPromo };
    if (!supabase) {
      setHomepagePromo(normalized);
      return normalized;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('cpg_homepage_promo').upsert({
      id: 1,
      active: Boolean(normalized.active),
      image_url: normalized.imageUrl || '',
      link_url: normalized.linkUrl || '',
      alt_text: normalized.altText || DEFAULT_HOMEPAGE_PROMO.altText,
      updated_at: new Date().toISOString(),
      updated_by: session?.user?.id || null,
    }, { onConflict: 'id' });
    if (error) throw error;
    setHomepagePromo(normalized);
    return normalized;
  };

  const saveCertConfig = async (newConfig) => {
    const merged = { ...certTemplate, ...newConfig };
    // Incrustar info del firmante principal para que apps externas (Créditos) puedan leerla
    const primaryComm = commissions.find(c => c.active) || commissions[0];
    if (primaryComm) {
      merged._signerName = merged._signerName || primaryComm.signer_name || '';
      merged._signerTitle = merged._signerTitle || primaryComm.signer_title || '';
      merged._commissionName = merged._commissionName || primaryComm.commission_name || '';
    }
    setCertTemplate(merged);
    if (!supabase) return;
    await supabase.from('cpg_cert_config').upsert({ id: 1, config: merged, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    logAuditAuto('cert_template_saved', 'cert_template', '1');
  };


  useEffect(() => {
    const interval = setInterval(loadLiveSession, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadContent = async () => {
      if (supabase) {
        try {
          const { data, error } = await supabase.from('cpg_content').select('videos, activities').eq('id', 1).single();
          if (!error) {
            if (data?.videos?.length) { setVideos(data.videos); localStorage.setItem('cpg_videos', JSON.stringify(data.videos)); }
            if (data?.activities?.length) { setActivities(data.activities); localStorage.setItem('cpg_activities', JSON.stringify(data.activities)); }
            if (data?.videos?.length || data?.activities?.length) { await loadViewCounts(); await loadLiveSession(); await loadCertConfig(); await loadSiteLogos(); await loadHomepagePromo(); await loadCommissions(); return; }
          }
        } catch {}
      }
      const sv = localStorage.getItem('cpg_videos');
      const sa = localStorage.getItem('cpg_activities');
      setVideos(sv ? JSON.parse(sv) : INITIAL_VIDEOS);
      if (sa) setActivities(JSON.parse(sa));
      await loadViewCounts();
      await loadLiveSession();
      await loadCertConfig();
      await loadSiteLogos();
      await loadHomepagePromo();
      await loadCommissions();
    };
    loadContent();
  }, []);

  useEffect(() => {
    if (sessionUser) {
      setCompletedVideos(loadCompleted(sessionUser.collegiateNumber));
      setUserProfile({ name: sessionUser.name, collegiateNumber: sessionUser.collegiateNumber, status: sessionUser.status });
    }
  }, [sessionUser]);

  const persistContent = async ({ nextVideos = videos, nextActivities = activities }) => {
    setVideos(nextVideos); setActivities(nextActivities);
    localStorage.setItem('cpg_videos', JSON.stringify(nextVideos));
    localStorage.setItem('cpg_activities', JSON.stringify(nextActivities));
    if (supabase) {
      // Usar update en lugar de upsert para respetar la política RLS que permite
      // UPDATE pero no INSERT en cpg_content
      const { error } = await supabase
        .from('cpg_content')
        .update({ videos: nextVideos, activities: nextActivities })
        .eq('id', 1);
      if (error) throw new Error(error.message);
    }
  };

  const persistVideos = (nv) => persistContent({ nextVideos: nv });
  const persistActivities = (na) => persistContent({ nextActivities: na });

  const incrementViewCount = async (videoId) => {
    if (!supabase) return;
    try {
      const { data } = await supabase.rpc('increment_video_view', { p_video_id: videoId });
      const newCount = data || 0;
      setViewCounts(prev => ({ ...prev, [videoId]: newCount }));
      setTotalViews(prev => prev + 1);
    } catch {}
  };

  const markVideoCompleted = (videoId) => {
    if (!sessionUser || sessionUser.isGuest) return;
    const next = new Set(completedVideos);
    next.add(videoId);
    setCompletedVideos(next);
    saveCompleted(sessionUser.collegiateNumber, next);
  };

  const handleLogin = async (email, password) => {
    setAuthError('');
    const trimEmail = email.trim().toLowerCase();
    const trimPass = password.trim();
    if (!supabase) { setAuthError('No se encontró la configuración de Supabase.'); return; }
    // 1) Autenticar PRIMERO. La política RLS de cpg_admin_users ahora exige
    //    sesión de admin para leer la tabla, así que el rol se consulta DESPUÉS del login.
    const { error } = await supabase.auth.signInWithPassword({ email: trimEmail, password: trimPass });
    if (error) { setAuthError('Contraseña incorrecta: ' + error.message); return; }
    // 2) Ya autenticado, verificar que sea admin activo
    const { data: adminRecord } = await supabase
      .from('cpg_admin_users')
      .select('role, active')
      .eq('email', trimEmail)
      .eq('active', true)
      .maybeSingle();
    if (!adminRecord) {
      // No es admin → cerrar la sesión recién abierta y rechazar
      await supabase.auth.signOut();
      setAuthError('Este correo no tiene permisos de administrador.');
      return;
    }
    setAdminRole(adminRecord.role);
    setIsAdmin(true); setView('admin');
    logAudit(trimEmail, '', 'login', 'session', '', { role: adminRecord.role });
  };

  const handleLogout = async () => {
    const em = sessionUser?.email || '';
    await logAudit(em, '', 'logout', 'session');
    if (supabase) await supabase.auth.signOut(); localStorage.removeItem('cpg_session'); setIsAdmin(false); setAdminRole(''); setSessionUser(null); setView('home');
  };
  const handleManualCertificate = (video, profile) => { setManualCertificate({ video, profile }); setView('certificate'); };
  const handleCloseManualCertificate = () => { setManualCertificate(null); setView('admin'); };

  // Derivados de `videos` — memoizados para evitar recomputar en cada keystroke / poll tick
  // Categorías ordenadas por cantidad de videos publicados (más videos = arriba)
  const categories = useMemo(() => {
    const counts = {};
    videos.forEach(v => {
      if (!isVideoPublished(v)) return; // solo contar publicados
      const cat = v.category || 'Sin categoría';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([cat]) => cat);
  }, [videos]);
  const publishedVideos = useMemo(() => videos.filter(isVideoPublished), [videos]);
  const upcomingVideos = useMemo(() => videos.filter(v => !isVideoPublished(v)), [videos]);
  const recentVideos = useMemo(() => [...publishedVideos].reverse().slice(0, 5), [publishedVideos]);

  if (certCodeFromUrl) return <CertificateVerifyView code={certCodeFromUrl} />;

  // ── FIX #2: Mostrar formulario de nueva contraseña si estamos en recovery ──
  if (showPasswordReset) return <PasswordResetView onDone={() => { setShowPasswordReset(false); window.location.href = APP_URL; }} />;

  // ── Contraseña temporal: obligar a crear una nueva antes de entrar ──
  if (forcePwChange) return <ForcePasswordChangeView onDone={() => { setForcePwChange(false); }} />;

  if (!sessionUser) return <LoginColModal onSession={(user) => {
    localStorage.setItem('cpg_session', JSON.stringify(user));
    setSessionUser(user);
  }} />;

  const firstName = getFirstName(sessionUser.name);

  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans selection:bg-blue-600 selection:text-white overflow-x-hidden" style={{ paddingTop: navHeight + 'px' }}>
      <nav ref={navRef} className="fixed top-0 w-full z-50 bg-[#0e0e0e] border-b border-gray-800 px-4 py-3 shadow-lg flex flex-col gap-2">
        {/* ─── Fila 1: Marca a la izquierda · Bienvenido + Admin SIEMPRE a la derecha ─── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={() => { setView('home'); setSearchQuery(''); }}>
            <img src={siteLogos.navLogoCpg} alt="Logo CPG" className="w-11 h-11 object-contain filter drop-shadow-lg flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
            <div className="hidden md:block min-w-0">
              <h1 className="text-base font-bold leading-tight text-gray-100 truncate">Colegio de Psicólogos de Guatemala</h1>
              <p className="text-xs text-blue-400 tracking-widest uppercase">Aula Virtual</p>
            </div>
            <img src={siteLogos.navLogoCaeduc} alt="Logo CAEDUC" className="w-11 h-11 object-contain filter drop-shadow-lg flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
          </div>

          {/* Bienvenido + Admin — anclado siempre a la derecha */}
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            {view !== 'home' && <button onClick={() => setView('home')} className="text-sm hover:text-blue-400 transition-colors">Inicio</button>}
            {liveSession?.active && (
              <button onClick={() => setView('live')} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg shadow-red-900/40 transition animate-pulse">
                <Radio size={12} />EN VIVO
              </button>
            )}

            {/* Botones de navegación — pegados al Bienvenido en la fila superior */}
            <a href="https://gestionescaeduc.vercel.app/" target="_blank" rel="noreferrer" onClick={() => trackClick('nav:avales_caeduc', 'Avales CAEDUC')} className="hidden lg:flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition flex-shrink-0"><ExternalLink size={12} /> Avales CAEDUC</a>
            {!sessionUser.isGuest
              ? <button onClick={() => { trackClick('nav:creditos_academicos', 'Créditos Académicos'); navigateToCreditos(sessionUser); }} className="hidden lg:flex items-center gap-1 text-xs text-blue-300 hover:text-white border border-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-900/40 transition font-medium flex-shrink-0" title="Ir a Créditos Académicos (sesión compartida)"><ExternalLink size={12} /> Créditos Académicos</button>
              : <a href={CREDITOS_URL} onClick={() => trackClick('nav:creditos_academicos', 'Créditos Académicos')} className="hidden lg:flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition flex-shrink-0"><ExternalLink size={12} /> Créditos Académicos</a>
            }
            <a href="https://colegiodepsicologos.org.gt" target="_blank" rel="noreferrer" onClick={() => trackClick('nav:sitio_oficial', 'Sitio Oficial')} className="hidden lg:flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition flex-shrink-0"><ExternalLink size={12} /> Sitio Oficial</a>
            {!sessionUser.isGuest && (
              <button onClick={() => { trackClick('nav:mis_certificados', 'Mis Certificados'); setView('history'); }} className="hidden lg:flex items-center gap-1.5 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition font-medium flex-shrink-0">
                <History size={13} /> Mis Certificados
              </button>
            )}

            <div className="relative" data-profile-panel>
            <button
              onClick={() => { setShowProfile(p => { if (!p) fetchProfileCredits(); return !p; }); }}
              className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-full px-3 py-1.5 hover:bg-gray-700/60 hover:border-gray-500 transition cursor-pointer"
              title="Ver perfil"
            >
              <div className={'w-2 h-2 rounded-full ' + (sessionUser.isGuest ? 'bg-gray-400' : 'bg-green-400')} />
              <span className="text-sm text-gray-200 font-medium">{sessionUser.isGuest ? 'Invitado' : 'Bienvenido, ' + firstName}</span>
              <ChevronDown size={13} className={'text-gray-500 transition-transform ' + (showProfile ? 'rotate-180' : '')} />
            </button>

            {(showProfile || sessionUser.isGuest) && showProfile && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-[#1a1a2e] border border-gray-700 rounded-2xl shadow-2xl shadow-black/60 z-[200] overflow-hidden">
                {!sessionUser.isGuest && (<>
                  <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/20 px-5 py-4 border-b border-gray-700">
                    <p className="text-white font-bold text-base leading-tight">{sessionUser.name}</p>
                    <p className="text-gray-400 text-xs mt-0.5">No. {sessionUser.collegiateNumber}</p>
                    {sessionUser.status ? (
                      <span className={`inline-flex items-center gap-1 mt-2 text-xs font-bold px-2 py-0.5 rounded-full ${sessionUser.status === 'ACTIVO' ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sessionUser.status === 'ACTIVO' ? 'bg-green-400' : 'bg-red-400'}`} />
                        {sessionUser.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="px-5 py-3 space-y-2.5 border-b border-gray-700/50">
                    {[
                      ['Fecha de colegiación', sessionUser.fechaColegiacion],
                      ['Último pago', sessionUser.ultimoPago],
                      ['Cuota congreso anual', sessionUser.cuotaCongreso],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-gray-400 text-xs">{label}</span>
                        <span className="text-gray-200 text-xs font-medium">{val || '—'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 py-3 border-b border-gray-700/50">
                    {profileCredits.loading ? (
                      <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={14} className="animate-spin" /> Cargando…</div>
                    ) : (() => {
                      const currentYear = new Date().getFullYear();
                      const hasCurrentYear = (profileCredits.creditos ?? 0) > 0 || (profileCredits.actividades ?? 0) > 0;
                      const hasHistoric = (profileCredits.totalCreditosHistorico ?? 0) > 0;
                      const showYear = hasCurrentYear ? currentYear : (hasHistoric ? 'Histórico' : currentYear);
                      const cred = hasCurrentYear ? profileCredits.creditos : (hasHistoric ? profileCredits.totalCreditosHistorico : 0);
                      const act = hasCurrentYear ? profileCredits.actividades : (hasHistoric ? profileCredits.totalActividadesHistorico : 0);
                      return (
                        <>
                          <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Créditos académicos {showYear}</p>
                          <div className="flex gap-3">
                            <div className="flex-1 bg-blue-900/20 rounded-xl p-3 text-center">
                              <p className="text-blue-300 font-bold text-xl">{cred ?? '—'}</p>
                              <p className="text-gray-400 text-xs mt-0.5">Créditos</p>
                            </div>
                            <div className="flex-1 bg-purple-900/20 rounded-xl p-3 text-center">
                              <p className="text-purple-300 font-bold text-xl">{act ?? '—'}</p>
                              <p className="text-gray-400 text-xs mt-0.5">Actividades</p>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="px-5 py-3">
                    {/* Actualizar sesión — reconsulta al Colegio para reflejar cambios (estado, pagos, congreso) */}
                    <button
                      onClick={handleRefreshSession}
                      disabled={refreshingSession}
                      className="w-full text-xs text-emerald-400 hover:text-emerald-200 border border-emerald-800/60 hover:border-emerald-600 rounded-lg py-2 transition flex items-center justify-center gap-1.5 mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Reconsulta tu información en el Colegio de Psicólogos (estado activo/inactivo, último pago, etc.)"
                    >
                      {refreshingSession ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {refreshingSession ? 'Actualizando…' : 'Actualizar sesión'}
                    </button>
                    {refreshMsg && (
                      <p className={`text-[10px] text-center mb-2 ${refreshMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{refreshMsg}</p>
                    )}

                    {/* Cambiar mi correo registrado (autogestión del usuario) */}
                    {!showEmailEdit ? (
                      <button
                        onClick={() => { setShowEmailEdit(true); setNewOwnEmail(''); setOwnEmailMsg(''); }}
                        className="w-full text-xs text-amber-400 hover:text-amber-200 border border-amber-800/60 hover:border-amber-600 rounded-lg py-2 transition flex items-center justify-center gap-1.5 mb-2"
                        title="Cambia el correo con el que ingresas al aula"
                      >
                        <Mail size={11} /> Cambiar mi correo registrado
                      </button>
                    ) : (
                      <div className="border border-amber-800/50 rounded-lg p-3 mb-2 bg-amber-900/10">
                        <p className="text-[11px] text-amber-200/90 mb-1.5">Nuevo correo (ingresarás con este de ahora en adelante):</p>
                        <input
                          type="email"
                          value={newOwnEmail}
                          onChange={e => { setNewOwnEmail(e.target.value); setOwnEmailMsg(''); }}
                          placeholder="nuevo.correo@ejemplo.com"
                          className="w-full bg-black border border-gray-700 rounded-lg px-2.5 py-2 text-white text-xs focus:border-amber-500 outline-none mb-2"
                        />
                        {ownEmailMsg && (
                          <p className={`text-[10px] mb-2 ${ownEmailMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{ownEmailMsg}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={handleChangeOwnEmail}
                            disabled={savingOwnEmail || !newOwnEmail.trim()}
                            className="flex-1 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-lg py-2 transition flex items-center justify-center gap-1.5"
                          >
                            {savingOwnEmail ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Guardar
                          </button>
                          <button onClick={() => setShowEmailEdit(false)} disabled={savingOwnEmail} className="text-xs text-gray-400 hover:text-white px-3 rounded-lg border border-gray-700">Cancelar</button>
                        </div>
                      </div>
                    )}

                    <button onClick={() => { navigateToCreditos(sessionUser); setShowProfile(false); }} className="w-full text-xs text-blue-400 hover:text-blue-200 border border-blue-800 hover:border-blue-600 rounded-lg py-2 transition flex items-center justify-center gap-1.5 mb-2">
                      <ExternalLink size={11} /> Ver historial completo en Créditos
                    </button>
                    <button onClick={() => { localStorage.removeItem('cpg_session'); if (supabase) supabase.auth.signOut().catch(() => {}); setSessionUser(null); setShowProfile(false); }} className="w-full text-xs text-red-500 hover:text-red-300 hover:bg-red-900/20 border border-red-900/50 hover:border-red-700 rounded-lg py-2 transition flex items-center justify-center gap-1.5">
                      <LogOut size={11} /> Cerrar sesión
                    </button>
                  </div>
                </>)}
                {sessionUser.isGuest && (
                  <div className="px-5 py-4">
                    <p className="text-gray-300 text-sm font-medium mb-3">Modo invitado</p>
                    <button onClick={() => { setSessionUser(null); setShowProfile(false); }} className="w-full text-xs text-red-500 hover:text-red-300 hover:bg-red-900/20 border border-red-900/50 hover:border-red-700 rounded-lg py-2 transition flex items-center justify-center gap-1.5">
                      <LogOut size={11} /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
            {isAdmin ? (
              <>
                {view !== 'admin' && (
                  <button onClick={() => setView('admin')} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded text-sm font-medium transition" title="Volver al panel de administración">
                    <Shield size={15} /> Panel admin
                  </button>
                )}
                <button onClick={handleLogout} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded text-sm font-medium transition" title="Cerrar sesión administrativa"><LogOut size={15} /> Salir</button>
              </>
            ) : (
              <button onClick={() => setView('login')} className="text-gray-400 hover:text-white transition p-2" title="Acceso Administrativo"><Lock size={17} /></button>
            )}
          </div>
        </div>

        {/* ─── Fila 2: Buscador + contador de reproducciones ─── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-shrink-0">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar cursos..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); if (view !== 'home') setView('home'); }}
              className="bg-gray-800/80 border border-gray-700 rounded-full pl-8 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-44 focus:w-56 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-gray-500 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>

          {totalViews > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-900/30 border border-blue-700/50 text-blue-300 text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">
              <Eye size={12} />{totalViews.toLocaleString()} reproducciones
            </div>
          )}

          {/* Botones personalizables — gestionables desde el panel admin */}
          {navButtons.map(b => {
            const Icon = NAV_BUTTON_ICONS[b.icon] || ExternalLink;
            const colorClasses = getNavButtonColorClasses(b.color);
            return (
              <a
                key={b.id}
                href={b.url}
                target={b.target || '_blank'}
                rel={b.target === '_blank' ? 'noreferrer' : undefined}
                onClick={() => trackClick(`custom:${b.id}`, b.label)}
                className={`flex items-center gap-1 text-xs border px-3 py-1.5 rounded-full transition flex-shrink-0 ${colorClasses}`}
              >
                <Icon size={12} /> {b.label}
              </a>
            );
          })}

          {/* En pantallas pequeñas (sm/md) los botones de nav se muestran aquí abajo en lugar de en la fila superior */}
          <a href="https://gestionescaeduc.vercel.app/" target="_blank" rel="noreferrer" onClick={() => trackClick('nav:avales_caeduc', 'Avales CAEDUC')} className="lg:hidden flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition flex-shrink-0"><ExternalLink size={12} /> Avales CAEDUC</a>
          {!sessionUser.isGuest
            ? <button onClick={() => { trackClick('nav:creditos_academicos', 'Créditos Académicos'); navigateToCreditos(sessionUser); }} className="lg:hidden flex items-center gap-1 text-xs text-blue-300 hover:text-white border border-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-900/40 transition font-medium flex-shrink-0" title="Ir a Créditos Académicos (sesión compartida)"><ExternalLink size={12} /> Créditos Académicos</button>
            : <a href={CREDITOS_URL} onClick={() => trackClick('nav:creditos_academicos', 'Créditos Académicos')} className="lg:hidden flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition flex-shrink-0"><ExternalLink size={12} /> Créditos Académicos</a>
          }
          <a href="https://colegiodepsicologos.org.gt" target="_blank" rel="noreferrer" onClick={() => trackClick('nav:sitio_oficial', 'Sitio Oficial')} className="lg:hidden flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition flex-shrink-0"><ExternalLink size={12} /> Sitio Oficial</a>
          {!sessionUser.isGuest && (
            <button onClick={() => { trackClick('nav:mis_certificados', 'Mis Certificados'); setView('history'); }} className="lg:hidden flex items-center gap-1.5 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition font-medium flex-shrink-0">
              <History size={13} /> Mis Certificados
            </button>
          )}
        </div>
      </nav>

      <div className="pt-0">
        {view === 'home' && liveSession?.active && (
          <div className="fixed bottom-6 right-6 z-40">
            <button onClick={() => setView('live')} className="flex items-center gap-3 bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-3 rounded-2xl shadow-2xl shadow-red-900/50 transition">
              <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span></span>
              <span>¡Sesión en vivo activa!</span>
              <span className="text-sm font-normal opacity-80">{liveSession.title}</span>
            </button>
          </div>
        )}

        {view === 'home' && <HomeView videos={videos} viewCounts={viewCounts} recentVideos={recentVideos} categories={categories} upcomingVideos={upcomingVideos} activities={activities} completedVideos={completedVideos} sessionUser={sessionUser} searchQuery={searchQuery} setSearchQuery={setSearchQuery} homepagePromo={homepagePromo} onVideoSelect={(v) => { if (!isVideoPublished(v)) return; setSelectedVideo(v); incrementViewCount(v.id); setView('player'); }} />}
        {view === 'live' && <LiveSessionView session={liveSession} onBack={() => setView('home')} sessionUser={sessionUser} onRegisterAttendance={registerAttendance} />}
        {view === 'player' && selectedVideo && <PlayerView video={selectedVideo} viewCounts={viewCounts} onBack={() => setView('home')} sessionUser={sessionUser} userProfile={userProfile} setUserProfile={setUserProfile} isCompleted={completedVideos.has(selectedVideo.id)} onMarkCompleted={() => markVideoCompleted(selectedVideo.id)} certTemplate={certTemplate} commissions={commissions} />}
        {view === 'login' && <LoginView onLogin={handleLogin} onBack={() => setView('home')} authError={authError} />}
        {view === 'admin' && isAdmin && (
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Loader2 size={40} className="animate-spin mx-auto mb-3 text-blue-500" />
                <p className="text-sm">Cargando panel administrativo…</p>
              </div>
            </div>
          }>
            <AdminDashboard videos={videos} viewCounts={viewCounts} totalViews={totalViews} activities={activities} liveSession={liveSession} onSaveLiveSession={saveLiveSession} onVideosChange={persistVideos} onActivitiesChange={persistActivities} onGenerateCertificate={handleManualCertificate} certTemplate={certTemplate} onSaveCertConfig={saveCertConfig} siteLogos={siteLogos} onSaveSiteLogos={saveSiteLogos} homepagePromo={homepagePromo} onSaveHomepagePromo={saveHomepagePromo} adminRole={adminRole} commissions={commissions} currentAdminEmail={sessionUser?.email || ''} onNavButtonsChange={loadNavButtons} />
          </Suspense>
        )}
        {view === 'certificate' && manualCertificate && <div className="min-h-screen bg-[#141414] pt-2 px-4 md:px-16 pb-12"><CertificateView video={manualCertificate.video} userProfile={manualCertificate.profile} onBack={handleCloseManualCertificate} certTemplate={certTemplate} commissions={commissions} /></div>}
        {view === 'history' && !sessionUser.isGuest && !reprintCert && <HistoryView sessionUser={sessionUser} onBack={() => setView('home')} onReprintCert={(cert) => setReprintCert(cert)} />}
        {view === 'history' && reprintCert && <div className="min-h-screen bg-[#141414] pt-2 px-4 md:px-16 pb-12"><CertificateReprintView cert={reprintCert} onBack={() => setReprintCert(null)} certTemplate={certTemplate} videos={videos} commissions={commissions} /></div>}
      </div>

      <footer className="py-12 px-10 bg-black/80 text-gray-500 text-sm border-t border-gray-800 mt-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
              <img src={siteLogos.footerLogoCpg} alt="Logo CPG" className="w-14 h-14 object-contain filter drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
              <img src={siteLogos.footerLogoCaeduc} alt="Logo CAEDUC" className="w-14 h-14 object-contain filter drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
            <h3 className="text-white font-serif font-bold mb-2">Colegio de Psicólogos de Guatemala</h3>
            <p>Formación continua y excelencia profesional.</p>
          </div>
          <div className="flex flex-col gap-2">
            <a href="https://gestionescaeduc.vercel.app/" target="_blank" rel="noreferrer" className="hover:underline hover:text-blue-400">Avales CAEDUC</a>
            <a href="https://caeducgt.org/" className="hover:underline hover:text-blue-400">Regresar a Créditos Académicos</a>
            <a href="https://colegiodepsicologos.org.gt" className="hover:underline hover:text-blue-400">Regresar al Colegio de Psicólogos</a>
          </div>
        </div>
        <div className="mt-8 text-center text-xs text-gray-700">© {new Date().getFullYear()} Aula Virtual CPG. Todos los derechos reservados.</div>
      </footer>
    </div>
  );
}

// ── HISTORIAL Y CERTIFICADOS EMITIDOS ────────────────
function HistoryView({ sessionUser, onBack, onReprintCert }) {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = async () => {
      if (!supabase) { setLoading(false); return; }
      try {
        const { data } = await supabase
          .from('cpg_certificates')
          .select('*')
          .eq('collegiate_number', sessionUser.collegiateNumber)
          .order('issued_at', { ascending: false });
        setCerts(data || []);
      } catch {}
      setLoading(false);
    };
    load();
  }, [sessionUser.collegiateNumber]);

  const fmt = (iso) => new Date(iso).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-[#141414] pt-2 px-4 md:px-16 pb-12">
      <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"><ChevronLeft /> Regresar</button>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Mis certificados</h1>
        <p className="text-gray-400 text-sm">Colegiado No. {sessionUser.collegiateNumber} · {certs.length} certificado{certs.length !== 1 ? 's' : ''} emitido{certs.length !== 1 ? 's' : ''}</p>
        <p className="text-gray-600 text-xs mt-1">Puedes descargar tus certificados las veces que necesites.</p>
      </div>

      {loading && (
        <div className="text-center py-20"><Loader2 size={40} className="animate-spin text-blue-400 mx-auto mb-4" /><p className="text-gray-400">Cargando certificados...</p></div>
      )}

      {!loading && certs.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <Award size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">Aún no tienes certificados emitidos.</p>
          <p className="text-sm mt-2">Completa la evaluación de un curso con más del 80% para obtener tu certificado.</p>
        </div>
      )}

      {!loading && certs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {certs.map(cert => (
            <div key={cert.id} className="bg-[#1a1a1a] border border-gray-800 rounded-xl overflow-hidden hover:border-yellow-700/50 transition">
              <div className="bg-gradient-to-r from-yellow-900/30 to-amber-900/10 border-b border-gray-800 px-4 py-3 flex items-center gap-2">
                <Award size={16} className="text-yellow-500 shrink-0" />
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Certificado oficial</span>
                <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${cert.status === 'ACTIVO' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>{cert.status}</span>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-white text-sm mb-1 line-clamp-2">{cert.video_title}</h3>
                <p className="text-xs text-gray-500 mb-3">{fmt(cert.issued_at)}</p>
                <p className="text-xs font-mono text-gray-600 mb-4 truncate">{cert.certificate_code}</p>
                <button
                  onClick={() => onReprintCert(cert)}
                  className="w-full bg-yellow-600/20 hover:bg-yellow-600/40 border border-yellow-700/50 text-yellow-300 hover:text-yellow-200 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  <Download size={14} /> Descargar certificado
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CONTEXTO de escala para el editor interactivo ──
const CertScaleContext = React.createContext(1);

// ── Caja arrastrable y redimensionable (solo activa en modo editor interactivo) ──
function DragResizeBox({ x = 0, y = 0, w, h, onChange, interactive, children, anchor = 'topleft', label }) {
  const scale = React.useContext(CertScaleContext) || 1;
  const [drag, setDrag] = React.useState(null);
  const start = (e, mode) => {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    setDrag({ mode, sx: e.clientX, sy: e.clientY, x, y, w, h });
  };
  React.useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      const dx = (e.clientX - drag.sx) / scale;
      const dy = (e.clientY - drag.sy) / scale;
      if (drag.mode === 'drag') {
        onChange({ x: Math.round(drag.x + dx), y: Math.round(drag.y + dy) });
      } else if (drag.mode === 'resize') {
        // anchor=bottomright invierte el drag para mantener punto fijo
        const sx = anchor === 'bottomright' ? -1 : 1;
        const newW = Math.max(40, Math.round(drag.w + dx * sx));
        const newH = Math.max(30, Math.round(drag.h + dy * sx));
        onChange({ w: newW, h: newH });
      }
    };
    const up = () => setDrag(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [drag, scale, onChange, anchor]);

  // En anchor=bottomright (firma/sello/qr): x/y NEGATIVO mueve el bloque hacia adentro (izq/arriba)
  const tx = anchor === 'bottomright' ? -x : x;
  const ty = anchor === 'bottomright' ? -y : y;
  const handlePos = anchor === 'bottomright'
    ? { left: -10, top: -10, cursor: 'nwse-resize' }
    : { right: -10, bottom: -10, cursor: 'nwse-resize' };

  return (
    <div
      style={{ transform: `translate(${tx}px, ${ty}px)`, position: 'relative', display: 'inline-block', cursor: interactive ? (drag?.mode === 'drag' ? 'grabbing' : 'grab') : 'default' }}
      onMouseDown={(e) => start(e, 'drag')}
    >
      {children}
      {interactive && (
        <>
          <div style={{ position: 'absolute', inset: 0, border: '2px dashed #6366f1', background: 'rgba(99,102,241,0.06)', pointerEvents: 'none' }} />
          {label && <div style={{ position: 'absolute', top: -22, left: 0, fontSize: 11, fontWeight: 700, color: '#6366f1', background: 'white', padding: '1px 6px', borderRadius: 4, border: '1px solid #6366f1', whiteSpace: 'nowrap' }}>{label}</div>}
          <div
            onMouseDown={(e) => start(e, 'resize')}
            style={{ position: 'absolute', width: 18, height: 18, background: '#6366f1', borderRadius: '50%', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.3)', ...handlePos }}
          />
        </>
      )}
    </div>
  );
}

// ── CERTIFICADO CANVAS COMPARTIDO — v2 con firmas múltiples ──
function CertificateCanvas({ certRef, onImageLoaded, tpl, recipientName, statusText, collegiateNumber, videoTitle, videoDuration, dateFormatted, certificateCode, qrUrl, commissionsSnapshot = [], interactive = false, onLayoutChange }) {
  const [imagesReady, setImagesReady] = useState(0);
  const commissionImages = commissionsSnapshot.filter(c => c.signature_url).length + commissionsSnapshot.filter(c => c.logo_url).length;
  const totalImages = [tpl.logoCpgUrl, tpl.logoCaeducUrl, tpl.signatureUrl, tpl.sealUrl, tpl.backgroundUrl].filter(Boolean).length + commissionImages;
  const handleImgLoad = () => { setImagesReady(p => p + 1); };
  useEffect(() => { if (imagesReady >= totalImages) onImageLoaded?.(); }, [imagesReady, totalImages]);
  useEffect(() => { if (totalImages === 0) onImageLoaded?.(); }, []);

  // Deep merge layout: saved values override defaults but missing keys get defaults
  const DL = DEFAULT_CERT_CONFIG.layout;
  const saved = tpl.layout || {};
  const L = Object.keys(DL).reduce((acc, key) => {
    if (typeof DL[key] === 'object' && DL[key] !== null) {
      acc[key] = { ...DL[key], ...(saved[key] || {}) };
    } else {
      acc[key] = saved[key] !== undefined ? saved[key] : DL[key];
    }
    return acc;
  }, {});
  const statusColor = statusText === 'ACTIVO' ? '#166534' : '#991b1b';
  const statusLabel = statusText === 'ACTIVO' ? 'ACTIVO' : statusText === 'INACTIVO' ? 'INACTIVO' : statusText;
  const showStatus = statusText && statusText !== 'DESCONOCIDO' && statusText !== 'INVITADO' && statusText.length > 0;
  const dynTitleSize = videoTitle.length > 60 ? Math.max(L.courseTitle.fontSize - 7, 14) : videoTitle.length > 40 ? Math.max(L.courseTitle.fontSize - 4, 16) : L.courseTitle.fontSize;

  // ── Construir array de firmantes (Coordinador CAEDUC primero, luego comisiones) ──
  const allSigners = [
    {
      isCoordinator: true,
      commission_name: 'CAEDUC',
      signer_name: tpl.coordinatorName || 'Coordinador CAEDUC',
      signer_title: tpl.coordinatorTitle || 'Coordinador',
      signature_url: tpl.signatureUrl || '',
    },
    ...commissionsSnapshot,
  ];
  const totalSigners = allSigners.length;

  // Layout:
  //   1 firma:    una fila, ancho completo (sin cambios — se ve perfecto)
  //   2-4 firmas: una fila, RESERVANDO espacio a la derecha para sello+QR
  //   5+ firmas:  dos filas (caso extremo)
  const hasMultipleSigners = totalSigners >= 2;
  const useTwoRows = totalSigners >= 5;
  const perRow = useTwoRows ? Math.ceil(totalSigners / 2) : totalSigners;
  const rows = useTwoRows
    ? [allSigners.slice(0, perRow), allSigners.slice(perRow)]
    : [allSigners];

  // Dimensiones dinámicas por firmante
  const sigAreaLeft = 60;
  // Cuando hay múltiples firmas, reservar ~200px a la derecha para sello+QR
  const rightReserved = hasMultipleSigners ? 200 : 0;
  const sigAreaWidth = hasMultipleSigners ? 740 : 700; // ligeramente más amplio si hay 1, pero respeta reserva si hay varios
  const sigBlockGap = 10;
  const sigCustomW = L.signature?.w || 300;
  // Cap por firmante: 500px si es la única; 200px si son varias (cabe el sello a la derecha sin solapar)
  const maxSigBlockBase = hasMultipleSigners ? 200 : 500;
  const maxSigWidth = useTwoRows
    ? Math.min(165, Math.round(sigCustomW * 0.55))
    : Math.min(maxSigBlockBase, sigCustomW);
  const sigBlockW = Math.min(
    maxSigWidth,
    Math.floor((sigAreaWidth - sigBlockGap * (perRow - 1)) / perRow)
  );
  // Altura de imagen de firma — escala según cantidad
  const baseImgH = L.signature?.h || 90;
  const sigImgH = useTwoRows
    ? Math.round(baseImgH * 0.70)
    : totalSigners >= 4
      ? Math.round(baseImgH * 0.85)
      : totalSigners === 3
        ? Math.round(baseImgH * 0.95)
        : totalSigners === 2
          ? Math.round(baseImgH * 1.00)
          : baseImgH;
  const sigBlockH = sigImgH + 55; // imagen + línea + texto coordinador

  const bottomY = L.bottomY || 25;
  const row1Y = useTwoRows ? bottomY + sigBlockH + 15 : bottomY;
  const row2Y = bottomY;

  const qrW = useTwoRows ? 85 : (L.qr.w || 110);
  const qrH = useTwoRows ? 85 : (L.qr.h || L.qr.w || 110);
  // Sello: reducido cuando hay múltiples firmas para que quede bien sobre el QR sin invadir
  const sealW = useTwoRows ? 85 : hasMultipleSigners ? 100 : (L.seal.w || 130);
  const sealH = useTwoRows ? 85 : hasMultipleSigners ? 100 : (L.seal.h || L.seal.w || 130);

  // ── Layout ABSOLUTO por escenario (2 o 3 firmas) ──
  // Si hay un layout guardado para esta cantidad de firmas, cada firma/sello/QR
  // se posiciona y arrastra libremente. El caso de 1 firma y 5+ NO usan esto.
  const sceneKey = String(totalSigners);
  const sceneLayout = (hasMultipleSigners && !useTwoRows && totalSigners <= 3
    && L.signLayouts && L.signLayouts[sceneKey]) ? L.signLayouts[sceneKey] : null;

  // Contenido visual de una firma (imagen + línea + nombre/cargo/comisión) escalado a w×h.
  // (El logo de la comisión NO va aquí; se muestra arriba del QR.)
  const renderSignerContent = (signer, w, h) => {
    const imgH = Math.round(h * 0.55);
    return (
      <div style={{ width: w + 'px', height: h + 'px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', textAlign: 'center' }}>
        {signer.signature_url
          ? <div style={{ height: imgH + 'px', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'visible' }}>
              <img src={signer.signature_url} alt={`Firma ${signer.commission_name}`} crossOrigin="anonymous"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', objectPosition: 'center bottom', display: 'block' }}
                onLoad={handleImgLoad} onError={(e) => { e.target.style.display='none'; handleImgLoad(); }} />
            </div>
          : <div style={{ height: imgH + 'px' }} />}
        <div style={{ borderTop: '1px solid #444', width: '90%', margin: '4px auto 0', height: '1px' }} />
        <div style={{ paddingTop: '4px' }}>
          <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a1a2e', lineHeight: '1.15', margin: 0 }}>{signer.signer_name}</p>
          <p style={{ fontSize: '10px', color: '#555', lineHeight: '1.1', margin: '1px 0 0' }}>{signer.signer_title}</p>
          <p style={{ fontSize: '9px', color: '#888', fontStyle: 'italic', lineHeight: '1.1', margin: '1px 0 0' }}>{signer.commission_name}</p>
        </div>
      </div>
    );
  };

  // Logos de comisiones firmantes (únicos por comisión, solo las que tengan logo) → se muestran arriba del QR
  const uniqueCommLogos = (() => {
    const seen = new Set(); const out = [];
    commissionsSnapshot.forEach(c => {
      if (c.logo_url && c.commission_name && !seen.has(c.commission_name)) { seen.add(c.commission_name); out.push(c); }
    });
    return out;
  })();

  return (
    <div ref={certRef} className="relative" style={{ width: '1056px', height: '816px', fontFamily: "'Georgia', 'Times New Roman', serif", background: '#f0ede8', overflow: 'hidden' }}>
      {tpl.backgroundUrl ? (
        <img src={tpl.backgroundUrl} alt="Fondo" className="absolute inset-0 w-full h-full object-fill" crossOrigin="anonymous" onLoad={handleImgLoad} onError={(e) => { e.target.style.display='none'; handleImgLoad(); }} />
      ) : (
        <>
          <div className="absolute left-0 top-0 bottom-0" style={{ width: '30px' }}>
            <div style={{ height: '18%', background: '#e8c03a' }}></div>
            <div style={{ height: '18%', background: '#1e5c8b' }}></div>
            <div style={{ height: '18%', background: '#d63384' }}></div>
            <div style={{ height: '18%', background: '#e8c03a' }}></div>
            <div style={{ height: '18%', background: '#5bb363' }}></div>
            <div style={{ height: '10%', background: '#d63384' }}></div>
          </div>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 75% 75%, rgba(200,195,185,0.2) 0%, transparent 55%)' }}></div>
        </>
      )}

      <div className="absolute inset-0" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>

        {/* Logo CPG */}
        <div className="absolute" style={{ top: L.logoCpg.top + 'px', left: L.logoCpg.left + 'px' }}>
          {tpl.logoCpgUrl && <img src={tpl.logoCpgUrl} alt="Logo CPG" crossOrigin="anonymous" style={{ width: L.logoCpg.w + 'px', height: L.logoCpg.h + 'px', objectFit: 'contain' }} onLoad={handleImgLoad} onError={(e) => { e.target.style.display='none'; handleImgLoad(); }} />}
        </div>

        {/* Junta Directiva */}
        <div className="absolute text-center" style={{ top: L.boardText.top + 'px', left: L.boardText.left + 'px', transform: 'translateX(-50%)' }}>
          <p style={{ fontSize: L.boardText.fontSize + 'px', fontWeight: 'bold', fontStyle: 'italic', color: '#c2185b' }}>{tpl.boardText}</p>
        </div>

        {/* Logo CAEDUC */}
        <div className="absolute" style={{ top: L.logoCaeduc.top + 'px', right: L.logoCaeduc.right + 'px' }}>
          {tpl.logoCaeducUrl && <img src={tpl.logoCaeducUrl} alt="Logo CAEDUC" crossOrigin="anonymous" style={{ width: L.logoCaeduc.w + 'px', height: L.logoCaeduc.h + 'px', objectFit: 'contain' }} onLoad={handleImgLoad} onError={(e) => { e.target.style.display='none'; handleImgLoad(); }} />}
        </div>

        {/* Encabezados */}
        <div className="absolute text-center" style={{ top: L.header.top + 'px', left: '80px', right: '80px' }}>
          <p style={{ fontSize: L.header.fontSize + 'px', fontWeight: 'bold', color: '#1a1a2e', lineHeight: '1.45' }}>{tpl.headerLine1}</p>
          <p style={{ fontSize: L.header.fontSize + 'px', fontWeight: 'bold', color: '#1a1a2e', lineHeight: '1.45' }}>{tpl.headerLine2}</p>
          {/* Comisiones firmantes adicionales — nombres únicos (sin duplicar por varios firmantes de la misma comisión) */}
          {(() => {
            const uniqueNames = [...new Set(commissionsSnapshot.map(c => c.commission_name).filter(Boolean))];
            if (uniqueNames.length === 0) return null;
            return (
              <p style={{ fontSize: Math.max(13, L.header.fontSize - 4) + 'px', fontWeight: 'bold', color: '#1a1a2e', lineHeight: '1.4', marginTop: '2px' }}>
                en conjunto con {uniqueNames.join(' y ')}
              </p>
            );
          })()}
          {L.diploma.top === -1 ? (
            <p style={{ fontSize: L.diploma.fontSize + 'px', color: '#444', marginTop: '10px', fontStyle: 'italic' }}>{tpl.diplomaText}</p>
          ) : null}
        </div>
        {L.diploma.top !== -1 && (
          <div className="absolute text-center" style={{ top: L.diploma.top + 'px', left: '80px', right: '80px' }}>
            <p style={{ fontSize: L.diploma.fontSize + 'px', color: '#444', fontStyle: 'italic' }}>{tpl.diplomaText}</p>
          </div>
        )}

        {/* Nombre */}
        <div className="absolute text-center" style={{ top: L.name.top + 'px', left: '50%', transform: 'translateX(-50%)', width: '700px' }}>
          <p style={{ fontSize: L.name.fontSize + 'px', fontWeight: 'bold', color: '#1a1a2e', letterSpacing: '0.3px', lineHeight: '1.15' }}>{recipientName}</p>
        </div>

        {/* Colegiado + Estado + Numero */}
        <div className="absolute text-center" style={{ top: L.collegiate.top + 'px', left: '50%', transform: 'translateX(-50%)', width: '600px' }}>
          <p style={{ fontSize: L.collegiate.fontSize + 'px', color: '#444' }}>
            {tpl.collegiateText}{'  '}
            {showStatus && <span style={{ fontWeight: 'bold', color: statusColor, textDecoration: 'underline', margin: '0 10px', fontSize: (L.collegiate.fontSize + 1) + 'px' }}>{statusLabel}</span>}
            {'  '}{tpl.numberText}{' '}
            <span style={{ fontWeight: 'bold', fontSize: (L.collegiate.fontSize + 2) + 'px', color: '#1a1a2e' }}>{collegiateNumber}</span>
          </p>
        </div>

        {/* Texto del curso */}
        <div className="absolute text-center" style={{ top: L.courseText.top + 'px', left: '50%', transform: 'translateX(-50%)', width: '640px' }}>
          <p style={{ fontSize: L.courseText.fontSize + 'px', color: '#444' }}>{tpl.courseText}</p>
        </div>

        {/* Titulo del curso */}
        <div className="absolute text-center" style={{ top: L.courseTitle.top + 'px', left: '50%', transform: 'translateX(-50%)', width: '750px' }}>
          <p style={{ fontSize: dynTitleSize + 'px', fontWeight: 'bold', color: '#1a1a2e', textTransform: 'uppercase', lineHeight: '1.3', wordBreak: 'break-word', letterSpacing: '0.5px' }}>{videoTitle}</p>
        </div>

        {/* Horas */}
        <div className="absolute text-center" style={{ top: L.hours.top + 'px', left: '50%', transform: 'translateX(-50%)', width: '640px' }}>
          <p style={{ fontSize: L.hours.fontSize + 'px', color: '#444' }}>
            {tpl.hoursPrefix} <span style={{ fontWeight: 'bold', fontSize: (L.hours.fontSize + 3) + 'px', color: '#1a1a2e' }}>{videoDuration}</span> {tpl.hoursSuffix}
          </p>
        </div>

        {/* Lema */}
        <div className="absolute text-center" style={{ top: L.motto.top + 'px', left: '50%', transform: 'translateX(-50%)', width: '640px' }}>
          <p style={{ fontSize: L.motto.fontSize + 'px', color: '#c2185b', fontStyle: 'italic', letterSpacing: '1px' }}>{tpl.motto}</p>
        </div>

        {/* Fecha */}
        <div className="absolute text-center" style={{ top: L.date.top + 'px', left: '50%', transform: 'translateX(-50%)', width: '400px' }}>
          <p style={{ fontSize: L.date.fontSize + 'px', color: '#333' }}>{dateFormatted}</p>
        </div>

        {/* ── FIRMAS (modo ABSOLUTO por escenario): cada firma arrastrable ── */}
        {sceneLayout && allSigners.map((signer, i) => {
          const pos = sceneLayout.sigs?.[i] || { x: 100 + i * 220, y: 650, w: 200, h: 140 };
          const content = renderSignerContent(signer, pos.w, pos.h);
          return (
            <div key={`scene-sig-${i}`} className="absolute" style={{ left: 0, top: 0 }}>
              {interactive && onLayoutChange ? (
                <DragResizeBox
                  x={pos.x} y={pos.y} w={pos.w} h={pos.h} anchor="topleft" interactive={true}
                  label={i === 0 ? 'Firma 1 (Coordinador)' : `Firma ${i + 1}`}
                  onChange={(p) => {
                    if ('x' in p) onLayoutChange({ [`signLayouts.${sceneKey}.sigs.${i}.x`]: p.x, [`signLayouts.${sceneKey}.sigs.${i}.y`]: p.y });
                    else onLayoutChange({ [`signLayouts.${sceneKey}.sigs.${i}.w`]: p.w, [`signLayouts.${sceneKey}.sigs.${i}.h`]: p.h });
                  }}
                >
                  {content}
                </DragResizeBox>
              ) : (
                <div style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, display: 'inline-block' }}>{content}</div>
              )}
            </div>
          );
        })}

        {/* ── FIRMAS: layout dinámico 1 o 2 filas (auto, cuando NO hay escenario absoluto) ── */}
        {!sceneLayout && rows.map((rowSigners, rowIdx) => {
          const rowY = useTwoRows ? (rowIdx === 0 ? row1Y : row2Y) : bottomY;
          const rowWidth = rowSigners.length * sigBlockW + (rowSigners.length - 1) * sigBlockGap;
          // Centrar respetando el espacio reservado a la derecha cuando hay múltiples firmas (sello+QR)
          const startX = useTwoRows
            ? Math.max(sigAreaLeft, Math.floor((1056 - 200 - rowWidth) / 2))
            : hasMultipleSigners
              ? Math.max(sigAreaLeft, Math.floor((1056 - rightReserved - rowWidth) / 2))
              : Math.max(sigAreaLeft, Math.floor((1056 - rowWidth) / 2));
          const isFirstRow = rowIdx === 0;
          // Con múltiples firmas, IGNORAR todos los offsets/widths personalizados — fueron guardados
          // para el caso de 1 firma y rompen el layout cuando se aplican a varias firmas
          const applyCustomLayout = isFirstRow && !hasMultipleSigners;
          const sigX = applyCustomLayout ? (L.signature?.x || 0) : 0;
          const sigY = applyCustomLayout ? (L.signature?.y || 0) : 0;
          const lineX = applyCustomLayout ? (L.sigLine?.x || 0) : 0;
          const lineY = applyCustomLayout ? (L.sigLine?.y || 0) : 0;
          const lineWCustom = applyCustomLayout ? (L.sigLine?.w || 0) : 0;
          const txtX = applyCustomLayout ? (L.sigText?.x || 0) : 0;
          const txtY = applyCustomLayout ? (L.sigText?.y || 0) : 0;

          // Tamaños de fuente proporcional al número de firmantes (solo aplica en multi-firmante)
          // 1 firma: 13/11/10  ·  2 firmas: 12/10/9  ·  3 firmas: 11/9/8  ·  4+: 10/8/7
          const sigNameFs = useTwoRows
            ? 11
            : totalSigners >= 4 ? 10
            : totalSigners === 3 ? 11
            : totalSigners === 2 ? 12
            : (L.coordName?.fontSize || 13);
          const sigTitleFs = useTwoRows
            ? 9
            : totalSigners >= 4 ? 8
            : totalSigners === 3 ? 9
            : totalSigners === 2 ? 10
            : (L.coordTitle?.fontSize || 11);
          const sigCommFs = useTwoRows
            ? 8
            : totalSigners >= 4 ? 7
            : totalSigners === 3 ? 8
            : totalSigners === 2 ? 9
            : 10;

          const rowInner = (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: sigBlockGap + 'px' }}>
              {rowSigners.map((signer, idx) => {
                const showHandlesHere = interactive && isFirstRow && idx === 0 && onLayoutChange;
                const lineWidth = lineWCustom > 0 ? lineWCustom : (sigBlockW - 20);

                // La firma del coordinador (Juan Reyes / CAEDUC) tiene padding transparente abajo
                // en el PNG, lo que hace que parezca flotar. Compensamos con un translateY
                // específico para esa firma en modo multi-firmante. Las otras firmas no se afectan.
                const isCoordinatorMulti = signer.isCoordinator && hasMultipleSigners;
                const sigImg = signer.signature_url ? (
                  <div style={{ height: sigImgH + 'px', width: (sigBlockW - 10) + 'px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', margin: '0 auto', overflow: 'visible' }}>
                    <img
                      src={signer.signature_url}
                      alt={`Firma ${signer.commission_name}`}
                      crossOrigin="anonymous"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        objectPosition: 'center bottom',
                        display: 'block',
                        transform: isCoordinatorMulti ? 'translateY(12%)' : 'none',
                      }}
                      onLoad={handleImgLoad}
                      onError={(e) => { e.target.style.display='none'; handleImgLoad(); }}
                    />
                  </div>
                ) : (
                  <div style={{ height: sigImgH + 'px', width: '1px' }} />
                );

                // Línea
                const lineEl = (
                  <div style={{ borderTop: '1px solid #444', width: lineWidth + 'px', margin: '0 auto', height: '1px' }} />
                );

                // Texto coordinador — fuentes escalan según cantidad de firmantes
                const textEl = (
                  <div style={{ paddingTop: '4px', width: (sigBlockW - 20) + 'px', margin: '0 auto', textAlign: 'center' }}>
                    <p style={{ fontSize: sigNameFs + 'px', fontWeight: 'bold', color: '#1a1a2e', lineHeight: '1.15', margin: 0 }}>{signer.signer_name}</p>
                    <p style={{ fontSize: sigTitleFs + 'px', color: '#555', lineHeight: '1.1', margin: '1px 0 0' }}>{signer.signer_title}</p>
                    <p style={{ fontSize: sigCommFs + 'px', color: '#888', fontStyle: 'italic', lineHeight: '1.1', margin: '1px 0 0' }}>{signer.commission_name}</p>
                  </div>
                );

                return (
                  <div key={idx} style={{ textAlign: 'center', width: sigBlockW + 'px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Firma (imagen) */}
                    {showHandlesHere ? (
                      <DragResizeBox
                        x={sigX} y={sigY}
                        w={L.signature?.w || 300} h={L.signature?.h || 90}
                        onChange={(p) => {
                          if ('x' in p) onLayoutChange({ 'signature.x': p.x, 'signature.y': p.y });
                          else onLayoutChange({ 'signature.w': p.w, 'signature.h': p.h });
                        }}
                        interactive={true} label="Firma"
                      >
                        {sigImg}
                      </DragResizeBox>
                    ) : (
                      <div style={{ transform: `translate(${sigX}px, ${sigY}px)` }}>{sigImg}</div>
                    )}

                    {/* Línea bajo la firma */}
                    {showHandlesHere ? (
                      <div style={{ marginTop: '4px' }}>
                        <DragResizeBox
                          x={lineX} y={lineY}
                          w={lineWidth} h={1}
                          onChange={(p) => {
                            if ('x' in p) onLayoutChange({ 'sigLine.x': p.x, 'sigLine.y': p.y });
                            else onLayoutChange({ 'sigLine.w': p.w });
                          }}
                          interactive={true} label="Línea"
                        >
                          {lineEl}
                        </DragResizeBox>
                      </div>
                    ) : (
                      <div style={{ marginTop: '4px', transform: `translate(${lineX}px, ${lineY}px)` }}>{lineEl}</div>
                    )}

                    {/* Texto del coordinador */}
                    {showHandlesHere ? (
                      <DragResizeBox
                        x={txtX} y={txtY}
                        w={sigBlockW - 20} h={48}
                        onChange={(p) => {
                          if ('x' in p) onLayoutChange({ 'sigText.x': p.x, 'sigText.y': p.y });
                          // resize de texto: lo ignoramos (el tamaño de fuente se ajusta con sliders)
                        }}
                        interactive={true} label="Texto"
                      >
                        {textEl}
                      </DragResizeBox>
                    ) : (
                      <div style={{ transform: `translate(${txtX}px, ${txtY}px)` }}>{textEl}</div>
                    )}
                  </div>
                );
              })}
            </div>
          );

          return (
            <div key={rowIdx} className="absolute" style={{ bottom: rowY + 'px', left: startX + 'px' }}>
              {rowInner}
            </div>
          );
        })}

        {/* ── SELLO (modo ABSOLUTO por escenario) ── */}
        {tpl.sealUrl && sceneLayout && (() => {
          const s = sceneLayout.seal || { x: 800, y: 560, w: 100, h: 100 };
          const sealImg = (
            <img src={tpl.sealUrl} alt="Sello" crossOrigin="anonymous" style={{ width: s.w + 'px', height: s.h + 'px', objectFit: 'contain', opacity: 0.85, display: 'block' }} onLoad={handleImgLoad} onError={(e) => { e.target.style.display='none'; handleImgLoad(); }} />
          );
          return (
            <div className="absolute" style={{ left: 0, top: 0 }}>
              {interactive && onLayoutChange ? (
                <DragResizeBox x={s.x} y={s.y} w={s.w} h={s.h} anchor="topleft" interactive={true} label="Sello"
                  onChange={(p) => {
                    if ('x' in p) onLayoutChange({ [`signLayouts.${sceneKey}.seal.x`]: p.x, [`signLayouts.${sceneKey}.seal.y`]: p.y });
                    else onLayoutChange({ [`signLayouts.${sceneKey}.seal.w`]: p.w, [`signLayouts.${sceneKey}.seal.h`]: p.h });
                  }}>
                  {sealImg}
                </DragResizeBox>
              ) : (
                <div style={{ transform: `translate(${s.x}px, ${s.y}px)`, display: 'inline-block' }}>{sealImg}</div>
              )}
            </div>
          );
        })()}

        {/* ── SELLO (auto, sin escenario) ── */}
        {tpl.sealUrl && !sceneLayout && (() => {
          const sealOffsetGap = useTwoRows ? 8 : 6;
          // Sello base: por encima del QR, anclado a la derecha
          const sealBaseBottom = bottomY + qrH + 32 + sealOffsetGap;
          // Con múltiples firmas, el sello queda directamente sobre el QR (ignora offsets guardados para evitar invadir firmas)
          const sealX = hasMultipleSigners ? 0 : (L.seal?.x || 0);
          const sealY = hasMultipleSigners ? 0 : (L.seal?.y || 0);
          // Centrar horizontalmente el sello sobre el QR (cuando hay anchos distintos, calculamos el offset)
          const sealRightPx = hasMultipleSigners ? Math.round(40 + (qrW - sealW) / 2) : 40;
          const sealImg = (
            <img src={tpl.sealUrl} alt="Sello" crossOrigin="anonymous" style={{ width: sealW + 'px', height: sealH + 'px', objectFit: 'contain', opacity: 0.85, display: 'block' }} onLoad={handleImgLoad} onError={(e) => { e.target.style.display='none'; handleImgLoad(); }} />
          );
          return (
            <div className="absolute" style={{ right: sealRightPx + 'px', bottom: sealBaseBottom + 'px' }}>
              {interactive && onLayoutChange ? (
                <DragResizeBox
                  x={sealX} y={sealY} w={sealW} h={sealH}
                  onChange={(p) => {
                    if ('x' in p) onLayoutChange({ 'seal.x': p.x, 'seal.y': p.y });
                    else onLayoutChange({ 'seal.w': p.w, 'seal.h': p.h });
                  }}
                  interactive={true} anchor="bottomright" label="Sello"
                >
                  {sealImg}
                </DragResizeBox>
              ) : (
                <div style={{ transform: `translate(${-sealX}px, ${-sealY}px)` }}>{sealImg}</div>
              )}
            </div>
          );
        })()}

        {/* ── QR (modo ABSOLUTO por escenario) ── */}
        {sceneLayout && (() => {
          const q = sceneLayout.qr || { x: 900, y: 668, w: 110, h: 130 };
          const qrBlock = (
            <div style={{ textAlign: 'center', width: q.w + 'px' }}>
              <img src={qrUrl} alt="QR" crossOrigin="anonymous" style={{ width: q.w + 'px', height: q.w + 'px', display: 'block', margin: '0 auto' }} />
              <p style={{ fontSize: '9px', color: '#555', marginTop: '3px', fontFamily: "'Courier New', monospace", letterSpacing: '0.3px', fontWeight: 'bold' }}>{certificateCode}</p>
              <p style={{ fontSize: '8px', color: '#999', marginTop: '1px' }}>Escanea para verificar</p>
            </div>
          );
          return (
            <div className="absolute" style={{ left: 0, top: 0 }}>
              {interactive && onLayoutChange ? (
                <DragResizeBox x={q.x} y={q.y} w={q.w} h={q.h} anchor="topleft" interactive={true} label="QR"
                  onChange={(p) => {
                    if ('x' in p) onLayoutChange({ [`signLayouts.${sceneKey}.qr.x`]: p.x, [`signLayouts.${sceneKey}.qr.y`]: p.y });
                    else onLayoutChange({ [`signLayouts.${sceneKey}.qr.w`]: p.w, [`signLayouts.${sceneKey}.qr.h`]: p.h });
                  }}>
                  {qrBlock}
                </DragResizeBox>
              ) : (
                <div style={{ transform: `translate(${q.x}px, ${q.y}px)`, display: 'inline-block' }}>{qrBlock}</div>
              )}
            </div>
          );
        })()}

        {/* ── QR (auto, sin escenario) ── */}
        {!sceneLayout && (() => {
          const qrX = L.qr?.x || 0;
          const qrY = L.qr?.y || 0;
          const qrBlock = (
            <div style={{ textAlign: 'center' }}>
              <img src={qrUrl} alt="QR" crossOrigin="anonymous" style={{ width: qrW + 'px', height: qrH + 'px', display: 'block', margin: '0 auto' }} />
              <p style={{ fontSize: (useTwoRows ? '8px' : '9px'), color: '#555', marginTop: (useTwoRows ? '2px' : '3px'), fontFamily: "'Courier New', monospace", letterSpacing: '0.3px', fontWeight: 'bold' }}>{certificateCode}</p>
              <p style={{ fontSize: (useTwoRows ? '7px' : '8px'), color: '#999', marginTop: '1px' }}>Escanea para verificar</p>
            </div>
          );
          return (
            <div className="absolute" style={{ right: '40px', bottom: bottomY + 'px' }}>
              {interactive && onLayoutChange ? (
                <DragResizeBox
                  x={qrX} y={qrY} w={qrW} h={qrH}
                  onChange={(p) => {
                    if ('x' in p) onLayoutChange({ 'qr.x': p.x, 'qr.y': p.y });
                    else onLayoutChange({ 'qr.w': p.w, 'qr.h': p.h });
                  }}
                  interactive={true} anchor="bottomright" label="QR"
                >
                  {qrBlock}
                </DragResizeBox>
              ) : (
                <div style={{ transform: `translate(${-qrX}px, ${-qrY}px)` }}>{qrBlock}</div>
              )}
            </div>
          );
        })()}

        {/* ── LOGOS de comisiones firmantes — arriba del QR ── */}
        {uniqueCommLogos.length > 0 && (() => {
          // Posición del QR en coordenadas absolutas (escenario → sceneLayout.qr; auto → esquina inferior derecha)
          const qrAbs = sceneLayout
            ? { x: sceneLayout.qr?.x ?? 900, y: sceneLayout.qr?.y ?? 668, w: sceneLayout.qr?.w ?? 110 }
            : { x: 1056 - 40 - qrW, y: 816 - bottomY - qrH - 22, w: qrW };
          const boxW = Math.max(qrAbs.w, 120);
          const boxH = 56;
          const left = Math.round(qrAbs.x + qrAbs.w / 2 - boxW / 2);
          const top = Math.round(qrAbs.y - boxH - 8);
          return (
            <div className="absolute" style={{ left: left + 'px', top: top + 'px', width: boxW + 'px', height: boxH + 'px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '6px' }}>
              {uniqueCommLogos.map((c, i) => (
                <img key={i} src={c.logo_url} alt={`Logo ${c.commission_name}`} crossOrigin="anonymous"
                  style={{ maxHeight: '100%', maxWidth: Math.floor(boxW / uniqueCommLogos.length) - 4 + 'px', objectFit: 'contain', display: 'block' }}
                  onLoad={handleImgLoad} onError={(e) => { e.target.style.display = 'none'; handleImgLoad(); }} />
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}


// ── REIMPRESIÓN DE CERTIFICADO DESDE HISTORIAL ────────────────
// Completa el logo_url faltante en un snapshot de comisiones (certs viejos guardados
// sin logo_url) buscando la comisión actual por id. No duplica nada.
const enrichSnapshotLogos = (snapshot, commissions = []) =>
  (snapshot || []).map(s =>
    s.logo_url ? s : { ...s, logo_url: (commissions.find(c => c.id === s.id)?.logo_url) || null }
  );

function CertificateReprintView({ cert, onBack, certTemplate, videos = [], commissions = [] }) {
  // Buscar duración actual del video (si existe) para reflejar correcciones posteriores
  const currentVideo = videos.find(v => v.id === cert.video_id);
  const effectiveDuration = (currentVideo && currentVideo.duration)
    ? String(currentVideo.duration)
    : (cert.video_duration || '');
  const certRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [liveStatus, setLiveStatus] = useState(null);

  useEffect(() => {
    const num = cert.collegiate_number;
    if (!num || num === '0000') return;
    fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: String(num).trim() }) })
      .then(r => r.json())
      .then(data => {
        const s = String(data?.estatus || data?.status || '').toUpperCase().trim();
        if (s && s !== 'DESCONOCIDO') {
          setLiveStatus(s);
          supabase.from('cpg_certificates').update({ status: s }).eq('certificate_code', cert.certificate_code).then(() => {});
        }
      })
      .catch(() => {});
  }, [cert.collegiate_number, cert.certificate_code]);

  const tpl = { ...DEFAULT_CERT_CONFIG, ...certTemplate };
  const issuedDate = new Date(cert.issued_at);
  const dateFormatted = issuedDate.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
  const qrUrl = getCertQrUrl(cert.certificate_code);
  const statusText = liveStatus || cert.status || '';

  const handleDownloadPDF = async () => {
    if (!certRef.current || !imageLoaded) { alert('Espera a que la plantilla cargue completamente.'); return; }
    setIsGenerating(true);
    try {
      // Lazy-load html2canvas + jspdf (~600KB) solo cuando el usuario descarga
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(certRef.current, {
        scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#f5f5f0', logging: false, imageTimeout: 15000,
        width: 1056, height: 816, windowWidth: 1056, windowHeight: 816, scrollX: 0, scrollY: 0,
      });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      const imgData = canvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save('Certificado_' + cert.recipient_name.replace(/\s+/g, '_') + '_' + cert.certificate_code + '.pdf');
    } catch (error) { console.error('Error generando PDF:', error); alert('Hubo un error al generar el PDF.'); }
    finally { setIsGenerating(false); }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full overflow-hidden">
      <div className="flex flex-wrap gap-3 print:hidden justify-center">
        <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm">← Mis certificados</button>
        <button onClick={handleDownloadPDF} disabled={isGenerating || !imageLoaded} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded font-bold flex items-center gap-2">
          {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Generando PDF...</> : <><Download size={18} /> Descargar PDF</>}
        </button>
      </div>
      <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-full px-4 py-1.5 text-xs text-gray-400 print:hidden">
        <Shield size={12} className="text-green-400" />
        <span className="font-mono">{cert.certificate_code}</span>
      </div>
      {!imageLoaded && <div className="text-yellow-400 text-sm flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Cargando plantilla...</div>}
      <div className="w-full overflow-hidden">
        <CertScaledPreview certRef={certRef} imageLoaded={imageLoaded}>
          <CertificateCanvas
            certRef={certRef} tpl={tpl} onImageLoaded={() => setImageLoaded(true)}
            recipientName={cert.recipient_name} statusText={statusText}
          collegiateNumber={cert.collegiate_number} videoTitle={cert.video_title}
          videoDuration={effectiveDuration} dateFormatted={dateFormatted}
          certificateCode={cert.certificate_code} qrUrl={qrUrl}
          commissionsSnapshot={enrichSnapshotLogos(cert.commissions_snapshot, commissions)}
          />
        </CertScaledPreview>
      </div>
    </div>
  );
}

// ── HOME VIEW ─────────────────────────────────────
function HomeView({ videos, viewCounts, recentVideos, categories, upcomingVideos, activities, completedVideos, sessionUser, searchQuery, setSearchQuery, homepagePromo, onVideoSelect }) {
  const heroVideo = recentVideos[0];
  const [activeCategory, setActiveCategory] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showEmbedCalendar, setShowEmbedCalendar] = useState(false);
  const [showHomepagePromoDetail, setShowHomepagePromoDetail] = useState(false);
  const homepagePromoTriggerRef = useRef(null);
  const homepagePromoCloseRef = useRef(null);
  const homepagePromoLinkRef = useRef(null);
  const isGuest = sessionUser?.isGuest;
  const showHomepagePromo = Boolean(
    homepagePromo?.active &&
    homepagePromo?.imageUrl &&
    isValidPublicUrl(homepagePromo?.linkUrl)
  );

  const closeHomepagePromoDetail = useCallback(() => {
    setShowHomepagePromoDetail(false);
    window.requestAnimationFrame(() => homepagePromoTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!showHomepagePromoDetail) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => homepagePromoCloseRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHomepagePromoDetail();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusableElements = [homepagePromoCloseRef.current, homepagePromoLinkRef.current].filter(Boolean);
      if (focusableElements.length === 0) return;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeHomepagePromoDetail, showHomepagePromoDetail]);

  const searchResults = searchQuery.trim()
    ? videos.filter(v => {
        const q = searchQuery.toLowerCase();
        return v.title?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q) || v.category?.toLowerCase().includes(q);
      })
    : null;

  const categoriesToRender = activeCategory ? [activeCategory] : categories;
  const now = new Date();

  const parseActDate = (a) => new Date(a.date + 'T00:00:00');
  // Pasada = ya terminó (fecha + hora de inicio + duración). Ver isActivityPast.
  const allActivities = activities.filter(a => a?.date).map(a => ({ ...a, parsedDate: parseActDate(a) })).filter(a => !Number.isNaN(a.parsedDate.valueOf())).sort((a, b) => a.parsedDate - b.parsedDate);
  const upcomingActs = allActivities.filter(a => !isActivityPast(a));
  const pastActs = allActivities.filter(a => isActivityPast(a)).reverse();

  const groupByMonth = (list) => list.reduce((acc, a) => {
    const key = a.parsedDate.getFullYear() + '-' + a.parsedDate.getMonth();
    if (!acc[key]) acc[key] = { label: a.parsedDate.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' }), items: [] };
    acc[key].items.push(a);
    return acc;
  }, {});

  const upcomingByMonth = groupByMonth(upcomingActs);
  const pastByMonth = groupByMonth(pastActs);

  const ActivityCard = ({ activity, isPast }) => (
    <div className={`bg-[#1f1f1f] border rounded-xl p-4 md:p-5 ${isPast ? 'border-gray-700 opacity-75' : 'border-gray-800'}`}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h5 className="text-lg font-bold text-white">{activity.title}</h5>
            {isPast && <span className="text-xs uppercase bg-gray-700 text-gray-300 border border-gray-600 px-2 py-0.5 rounded-full">Finalizada</span>}
            {activity.isFull && !isPast && <span className="text-xs uppercase bg-red-500/20 text-red-200 border border-red-500/40 px-2 py-1 rounded-full">Cupo lleno</span>}
          </div>
          <p className="text-sm text-gray-400">Organiza: {activity.organizer}</p>
          {activity.horas && <span className="inline-flex mt-1 mr-1 text-xs bg-blue-900/30 text-blue-300 border border-blue-700/40 px-2 py-0.5 rounded-full">{activity.horas} horas acreditadas</span>}
          {activity.costType === 'free' && <span className="inline-flex mt-1 text-xs bg-green-900/30 text-green-300 border border-green-700/40 px-2 py-0.5 rounded-full">Gratuito</span>}
          {activity.costType === 'paid' && <span className="inline-flex mt-1 text-xs bg-blue-900/30 text-blue-300 border border-blue-700/40 px-2 py-0.5 rounded-full">Costo: Q.{activity.cost}</span>}
          {activity.costType === 'scholarship' && <span className="inline-flex mt-1 text-xs bg-purple-900/30 text-purple-300 border border-purple-700/40 px-2 py-0.5 rounded-full">Con beca {activity.scholarshipPct}% — Agremiado paga Q.{activity.scholarshipAmt}</span>}
          {activity.participants > 0 && <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Users size={11} /> {activity.participants} participantes</p>}
        </div>
        <div className="text-sm text-gray-300 shrink-0">
          <p><span className="text-gray-400">Fecha:</span> {new Date(activity.date + 'T00:00:00').toLocaleDateString('es-GT')}</p>
          <p><span className="text-gray-400">Hora:</span> {activity.time || 'Por confirmar'}</p>
          <p><span className="text-gray-400">Lugar:</span> {activity.location || 'Por confirmar'}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 mt-4">
        {activity.meetingLink && (
          isGuest ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-not-allowed" title="Requiere colegiado activo">
              <Lock size={13} /> Enlace de actividad (requiere colegiado)
            </span>
          ) : isPast ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-500 line-through"><ExternalLink size={14} /> Enlace de actividad</span>
          ) : (
            <a href={activity.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200"><ExternalLink size={14} /> Enlace de actividad</a>
          )
        )}
        {activity.registrationLink && (
          isGuest ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-not-allowed" title="Requiere colegiado activo">
              <Lock size={13} /> Inscripción (requiere colegiado)
            </span>
          ) : isPast ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-500 line-through"><ExternalLink size={14} /> Inscripción</span>
          ) : (
            <a href={activity.registrationLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200"><ExternalLink size={14} /> Formulario de inscripción</a>
          )
        )}
      </div>
    </div>
  );

  if (searchResults !== null) {
    return (
      <div className="pb-10 pt-[57px] px-8 md:px-16">
        <div className="md:hidden mb-4 mt-4 relative">
          <Search size={14} className="absolute left-3 top-3 text-gray-500 pointer-events-none" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-full pl-8 pr-10 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" placeholder="Buscar cursos..." />
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3 text-gray-500 hover:text-white"><X size={14} /></button>
        </div>
        <div className="mt-6 mb-4 flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">Resultados para "{searchQuery}"</h2>
          <span className="text-gray-400 text-sm">({searchResults.length} video{searchResults.length !== 1 ? 's' : ''})</span>
          <button onClick={() => setSearchQuery('')} className="ml-auto text-sm text-gray-400 hover:text-white flex items-center gap-1"><X size={14} /> Limpiar</button>
        </div>
        {searchResults.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <Search size={48} className="mx-auto mb-4 opacity-30" />
            <p>No se encontraron videos que coincidan con tu búsqueda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {searchResults.map(v => (
              <VideoCard key={v.id} video={v} viewCount={viewCounts[v.id] || 0} onClick={() => onVideoSelect(v)} isPublished={isVideoPublished(v)} isCompleted={completedVideos.has(v.id)} isGuest={isGuest} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-10">
      {isGuest && (
        <div className="bg-gradient-to-r from-yellow-900/40 to-amber-900/20 border-b border-yellow-700/40 px-6 py-3 flex items-center justify-between gap-4 mt-[57px]">
          <div className="flex items-center gap-2 text-yellow-200 text-sm">
            <Lock size={14} className="text-yellow-400" />
            <span>Estás navegando como invitado. Ingresa con tu número de colegiado para ver videos y obtener certificados.</span>
          </div>
          <button onClick={() => window.location.reload()} className="shrink-0 bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold px-4 py-1.5 rounded-full transition">
            Ingresar con colegiado
          </button>
        </div>
      )}

      {!activeCategory ? (
        <div className={`flex flex-col md:flex-row items-stretch ${isGuest ? '' : 'mt-[57px]'}`}>
          {/* ── Destacado (mitad izquierda en desktop) ── */}
          {heroVideo && (
            <div className="relative w-full md:w-1/2 h-[50vh] overflow-hidden shrink-0">
              <div className="absolute inset-0">
                <img src={getVideoThumbnail(heroVideo)} alt={heroVideo.title} className="w-full h-full object-cover opacity-60 scale-105" onError={(e) => { const t = e.currentTarget; const s = t.dataset.fallbackStage || 'hqdefault'; if (s === 'hqdefault') { t.dataset.fallbackStage = 'mqdefault'; t.src = getYouTubeThumbnail(heroVideo.youtubeId, 'mqdefault'); return; } t.src = getYouTubeThumbnail(''); }} />
                <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/60 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
              </div>
              <div className="absolute bottom-0 left-0 p-6 md:p-10 max-w-lg z-10 flex flex-col gap-3">
                <span className="text-yellow-500 font-bold tracking-wider text-xs uppercase bg-black/50 w-fit px-2 py-1 rounded border border-yellow-500/30">Destacado</span>
                <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow-xl leading-tight">{heroVideo.title}</h1>
                <p className="text-gray-200 text-sm line-clamp-2 drop-shadow-md">{heroVideo.description}</p>
                <button onClick={() => onVideoSelect(heroVideo)} className="bg-white text-black px-6 py-2.5 rounded hover:bg-gray-200 font-bold flex items-center gap-2 transition transform hover:scale-105 text-sm w-fit"><Play fill="black" size={18} /> Ver Ahora</button>
              </div>
            </div>
          )}
          {/* ── Publicidad + calendario (mitad derecha en desktop) ── */}
          <div className={`${heroVideo ? 'md:w-1/2' : 'w-full'} flex items-center p-4 md:p-6 bg-[#0f0f0f]`}>
            <div className={`w-full ${heroVideo ? '' : 'max-w-6xl mx-auto'} flex flex-col gap-3`}>
              {showHomepagePromo && (
                <div className="group relative block w-full h-40 sm:h-44 md:h-[180px] overflow-hidden rounded-2xl border border-blue-500/30 bg-[#1c1c1c] shadow-[0_0_30px_rgba(59,130,246,0.14)]">
                  <button
                    ref={homepagePromoTriggerRef}
                    type="button"
                    onClick={() => setShowHomepagePromoDetail(true)}
                    aria-label={`Ampliar imagen: ${homepagePromo.altText || 'Actividad destacada'}`}
                    className="absolute inset-0 h-full w-full cursor-zoom-in touch-manipulation focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-400/70"
                  >
                    <img
                      src={homepagePromo.imageUrl}
                      alt={homepagePromo.altText || 'Actividad destacada'}
                      className="h-full w-full object-contain bg-[#111] transition-opacity duration-200 group-hover:opacity-95"
                      loading="eager"
                    />
                    <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/75 px-3 py-1.5 text-xs font-semibold text-white opacity-100 shadow-lg backdrop-blur-sm transition md:opacity-0 md:group-hover:opacity-100">
                      Ampliar imagen
                    </span>
                  </button>
                  <a
                    href={homepagePromo.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Ver actividad: ${homepagePromo.altText || 'Actividad destacada'} (abre en una pestaña nueva)`}
                    className="absolute bottom-3 right-3 z-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-black/80 px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-sm transition hover:bg-blue-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/70 touch-manipulation"
                  >
                    Ver actividad <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </div>
              )}
              <div className={`bg-[#1c1c1c] border border-gray-800 rounded-2xl w-full shadow-[0_0_30px_rgba(59,130,246,0.15)] flex flex-col ${showHomepagePromo ? 'p-4 gap-3' : 'p-5 md:p-7 gap-5'}`}>
              <div>
                <p className={`${showHomepagePromo ? 'text-xs' : 'text-sm'} uppercase tracking-[0.25em] text-blue-400`}>Calendario de capacitación</p>
                <h2 className={`${showHomepagePromo ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-bold text-white mt-1`}>Actividades programadas</h2>
                {!showHomepagePromo && <p className="text-gray-400 mt-1 text-sm">Consulta las fechas, organizadores y enlaces de inscripción.</p>}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => setShowCalendar(true)}
                  className="min-h-11 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center justify-center gap-2 text-sm touch-manipulation">
                  <CalendarDays size={18} /> Ver calendario
                </button>
                <button type="button" onClick={() => setShowSyncModal(true)}
                  className="min-h-11 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600/60 text-white px-4 py-2 rounded-xl font-semibold flex items-center justify-center gap-2 text-sm touch-manipulation">
                  <CalendarDays size={16} /> Agregar a mi calendario
                </button>
              </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={isGuest ? '' : 'mt-[57px]'} />
      )}

      <div className="md:hidden px-6 mt-4 relative">
        <Search size={14} className="absolute left-9 top-3 text-gray-500 pointer-events-none" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-full pl-8 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" placeholder="Buscar cursos..." />
      </div>

      {showHomepagePromoDetail && showHomepagePromo && (
        <div
          className="fixed inset-0 z-[80] flex min-h-dvh items-center justify-center bg-black/90 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="homepage-promo-detail-title"
          aria-describedby="homepage-promo-detail-description"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeHomepagePromoDetail();
          }}
        >
          <div className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#111] shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 id="homepage-promo-detail-title" className="truncate text-base font-bold text-white sm:text-lg">
                  {homepagePromo.altText || 'Actividad destacada'}
                </h2>
                <p id="homepage-promo-detail-description" className="text-xs text-gray-400 sm:text-sm">Vista ampliada de la publicidad</p>
              </div>
              <button
                ref={homepagePromoCloseRef}
                type="button"
                onClick={closeHomepagePromoDetail}
                aria-label="Cerrar imagen ampliada"
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/70 touch-manipulation"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black p-2 sm:p-4">
              <img
                src={homepagePromo.imageUrl}
                alt={homepagePromo.altText || 'Actividad destacada'}
                className="max-h-[calc(100dvh-10.5rem)] max-w-full object-contain"
              />
            </div>

            <div className="flex shrink-0 items-center justify-end border-t border-white/10 bg-[#161616] p-3 sm:p-4">
              <a
                ref={homepagePromoLinkRef}
                href={homepagePromo.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ver actividad: ${homepagePromo.altText || 'Actividad destacada'} (abre en una pestaña nueva)`}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/70 sm:w-auto touch-manipulation"
              >
                Ver actividad <ExternalLink size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      )}

      {showCalendar && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center px-4 py-10">
          <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-xl font-bold text-white">Calendario de actividades</h3>
                {isGuest && <p className="text-xs text-yellow-400 mt-0.5 flex items-center gap-1"><Lock size={11} /> Los enlaces requieren ingresar con colegiado activo</p>}
              </div>
              <button type="button" onClick={() => setShowCalendar(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="px-6 py-6 overflow-y-auto max-h-[70vh] space-y-8">
              {Object.keys(upcomingByMonth).length === 0 && pastActs.length === 0 && (
                <div className="text-center text-gray-400 py-10">No hay actividades programadas por el momento.</div>
              )}
              {Object.keys(upcomingByMonth).length === 0 && pastActs.length > 0 && (
                <div className="text-center text-gray-400 py-4 text-sm">No hay actividades próximas programadas.</div>
              )}
              {Object.keys(upcomingByMonth).map(key => (
                <div key={key}>
                  <h4 className="text-lg font-semibold text-blue-300 mb-4 capitalize">{upcomingByMonth[key].label}</h4>
                  <div className="grid gap-4">
                    {upcomingByMonth[key].items.map(activity => <ActivityCard key={activity.id} activity={activity} isPast={false} />)}
                  </div>
                </div>
              ))}
              {pastActs.length > 0 && (
                <div>
                  <button type="button" onClick={() => setShowPast(p => !p)} className="flex items-center gap-2 w-full bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 rounded-xl px-5 py-3 text-gray-300 font-semibold text-sm transition">
                    <CalendarDays size={16} className="text-gray-400" />Cursos pasados ({pastActs.length})
                    <ChevronDown size={16} className={`ml-auto transition-transform ${showPast ? 'rotate-180' : ''}`} />
                  </button>
                  {showPast && (
                    <div className="mt-4 space-y-8">
                      {Object.keys(pastByMonth).map(key => (
                        <div key={key}>
                          <h4 className="text-base font-semibold text-gray-500 mb-3 capitalize">{pastByMonth[key].label}</h4>
                          <div className="grid gap-4">
                            {pastByMonth[key].items.map(activity => <ActivityCard key={activity.id} activity={activity} isPast={true} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ── Modal: Agregar a mi calendario ── */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black/70 z-[65] flex items-center justify-center px-4 py-10">
          <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <CalendarDays size={20} className="text-emerald-400" /> Agregar a mi calendario
                </h3>
                <p className="text-sm text-gray-400">Sincroniza las actividades CAEDUC con tu app favorita</p>
              </div>
              <button type="button" onClick={() => setShowSyncModal(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="px-6 py-6 space-y-3">

              {/* Opción 1: Google Calendar */}
              <a href="https://calendar.google.com/calendar/u/0?cid=ZDQ0YTAxNDZhMTRhNmU1N2VhODgzM2VkMjY1MzA1YzY3ODUzNGM0OWE4NWMyMmFlMmVlZWZhNmMwNmU5Mjk5YkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t" target="_blank" rel="noreferrer"
                className="flex items-center gap-4 bg-[#1a1a1a] border border-gray-800 hover:border-blue-500 rounded-xl p-4 transition-all group cursor-pointer">
                <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0 shadow">
                  <svg width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.1-6.1C34.46 3.19 29.5 1 24 1 14.82 1 7.07 6.48 3.64 14.24l7.1 5.52C12.5 13.37 17.77 9.5 24 9.5z"/><path fill="#4285F4" d="M46.52 24.5c0-1.64-.15-3.22-.42-4.75H24v9h12.67c-.55 2.97-2.2 5.48-4.67 7.17l7.18 5.57C43.32 37.3 46.52 31.36 46.52 24.5z"/><path fill="#FBBC05" d="M10.74 28.24A14.54 14.54 0 0 1 9.5 24c0-1.48.26-2.91.7-4.24l-7.1-5.52A23.94 23.94 0 0 0 0 24c0 3.87.93 7.52 2.57 10.74l8.17-6.5z"/><path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.49-4.94l-7.18-5.57C28.6 37.84 26.42 38.5 24 38.5c-6.23 0-11.5-3.87-13.26-9.26l-8.17 6.5C6.07 43.52 14.82 47 24 47z"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white group-hover:text-blue-300 transition">Google Calendar</p>
                  <p className="text-xs text-gray-400 mt-0.5">Suscríbete si usas Google Calendar — se actualiza automáticamente</p>
                </div>
                <ExternalLink size={16} className="text-gray-600 group-hover:text-blue-400 transition shrink-0" />
              </a>

              {/* Opción 2: ICS / Outlook / Apple */}
              <a href="https://calendar.google.com/calendar/ical/d44a0146a14a6e57ea8833ed265305c678534c49a85c22ae2eeefa6c06e9299b%40group.calendar.google.com/public/basic.ics" target="_blank" rel="noreferrer"
                className="flex items-center gap-4 bg-[#1a1a1a] border border-gray-800 hover:border-indigo-500 rounded-xl p-4 transition-all group cursor-pointer">
                <div className="w-11 h-11 rounded-xl bg-indigo-900/60 border border-indigo-700/40 flex items-center justify-center shrink-0">
                  <CalendarDays size={22} className="text-indigo-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white group-hover:text-indigo-300 transition">Outlook / Apple / Otros</p>
                  <p className="text-xs text-gray-400 mt-0.5">Descarga el archivo .ics para importar en cualquier app de calendario</p>
                </div>
                <Download size={16} className="text-gray-600 group-hover:text-indigo-400 transition shrink-0" />
              </a>

              {/* Opción 3: Ver embebido */}
              <button type="button"
                onClick={() => { setShowSyncModal(false); setShowEmbedCalendar(true); }}
                className="w-full flex items-center gap-4 bg-[#1a1a1a] border border-gray-800 hover:border-emerald-600 rounded-xl p-4 transition-all group text-left">
                <div className="w-11 h-11 rounded-xl bg-emerald-900/40 border border-emerald-700/40 flex items-center justify-center shrink-0">
                  <Eye size={20} className="text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white group-hover:text-emerald-300 transition">Ver sin sincronizar</p>
                  <p className="text-xs text-gray-400 mt-0.5">Consulta el calendario de Google directamente desde el Aula Virtual</p>
                </div>
                <ChevronLeft size={16} className="rotate-180 text-gray-600 group-hover:text-emerald-400 transition shrink-0" />
              </button>

              <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 mt-1">
                <p className="text-xs text-gray-500">
                  <span className="text-gray-400 font-semibold">Consejo:</span> Usa <span className="text-blue-400">Google Calendar</span> para sincronización automática.
                  El calendario se actualiza en tiempo real cuando CAEDUC añade nuevas actividades.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Calendario embebido de Google ── */}
      {showEmbedCalendar && (
        <div className="fixed inset-0 bg-black/70 z-[65] flex items-center justify-center px-4 py-8">
          <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <CalendarDays size={18} className="text-emerald-400" /> Calendario CAEDUC
                </h3>
                <p className="text-xs text-gray-400">Vista de Google Calendar — solo lectura</p>
              </div>
              <div className="flex items-center gap-2">
                <a href="https://calendar.google.com/calendar/u/0?cid=ZDQ0YTAxNDZhMTRhNmU1N2VhODgzM2VkMjY1MzA1YzY3ODUzNGM0OWE4NWMyMmFlMmVlZWZhNmMwNmU5Mjk5YkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t" target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                  <CalendarDays size={12} /> Agregar a Google Calendar
                </a>
                <button type="button" onClick={() => setShowEmbedCalendar(false)} className="text-gray-400 hover:text-white ml-1"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-2">
              <iframe
                src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=America%2FGuatemala&showPrint=0&src=ZDQ0YTAxNDZhMTRhNmU1N2VhODgzM2VkMjY1MzA1YzY3ODUzNGM0OWE4NWMyMmFlMmVlZWZhNmMwNmU5Mjk5YkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&src=ZXMuZ3QjaG9saWRheUBncm91cC52LmNhbGVuZGFyLmdvb2dsZS5jb20&color=%23a79b8e&color=%230b8043"
                style={{ border: 'none' }}
                width="100%"
                height="100%"
                className="rounded-xl min-h-[500px]"
                frameBorder="0"
                scrolling="no"
                title="Calendario CAEDUC"
              />
            </div>
          </div>
        </div>
      )}
      {!activeCategory && (
        <div className="pl-8 md:pl-16 mt-8 md:mt-10">
          <h2 className="text-xl md:text-2xl font-bold mb-4 text-white">Recién Añadidos</h2>
          <div className="flex gap-4 overflow-x-auto pb-8 pr-8 scrollbar-hide snap-x">
            {recentVideos.map(v => <VideoCard key={v.id} video={v} viewCount={viewCounts[v.id] || 0} onClick={() => onVideoSelect(v)} isPublished={isVideoPublished(v)} isCompleted={completedVideos.has(v.id)} isGuest={isGuest} />)}
          </div>
        </div>
      )}
      {!activeCategory && upcomingVideos.length > 0 && (
        <div className="pl-8 md:pl-16 mt-8">
          <h2 className="text-xl md:text-2xl font-bold mb-4 text-white">Próximamente</h2>
          <div className="flex gap-4 overflow-x-auto pb-8 pr-8 scrollbar-hide snap-x">
            {upcomingVideos.map(v => <VideoCard key={v.id} video={v} viewCount={viewCounts[v.id] || 0} onClick={() => onVideoSelect(v)} isPublished={false} isCompleted={false} isGuest={isGuest} />)}
          </div>
        </div>
      )}
      {!activeCategory && (
        <div className="pl-8 md:pl-16 pr-8 mt-10 mb-2">
          <h2 className="text-xl md:text-2xl font-bold mb-1 text-white">Busca tus cursos por categoría</h2>
          <p className="text-sm text-gray-500 mb-5">Selecciona una categoría para ver todos sus cursos</p>
          <div className="flex flex-wrap gap-3">
            {categories.map(cat => {
              const count = videos.filter(v => v.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className="group flex items-center gap-2.5 bg-[#1c1c1c] hover:bg-blue-600 border border-gray-700 hover:border-blue-500 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-200 hover:text-white transition-all duration-200 hover:shadow-lg hover:shadow-blue-900/30 hover:-translate-y-0.5"
                >
                  <span>{cat}</span>
                  <span className="bg-gray-700 group-hover:bg-blue-500 text-gray-300 group-hover:text-white text-xs font-bold px-2 py-0.5 rounded-full transition-colors">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="pl-8 md:pl-16 mt-8">
        {activeCategory && (
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-white capitalize">{activeCategory}</h2>
            <button type="button" onClick={() => setActiveCategory(null)} className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-full text-gray-200">Volver al inicio</button>
          </div>
        )}
      </div>
      {categoriesToRender.map(category => (
        <div key={category} className="pl-8 md:pl-16 mt-4">
          {!activeCategory && <h2 className="text-lg md:text-xl font-bold mb-4 text-gray-200 hover:text-blue-400 cursor-pointer transition" onClick={() => setActiveCategory(category)}>{category}</h2>}
          <div className="flex gap-4 overflow-x-auto pb-4 pr-8 scrollbar-hide snap-x">
            {videos
              .filter(v => v.category === category)
              .sort((a, b) => {
                // Más reciente primero (izquierda). Usa scheduledAt si existe; fallback al id.
                const da = a.scheduledAt ? new Date(a.scheduledAt + 'T00:00:00').getTime() : 0;
                const db = b.scheduledAt ? new Date(b.scheduledAt + 'T00:00:00').getTime() : 0;
                if (da !== db) return db - da;
                return (b.id || 0) - (a.id || 0);
              })
              .map(v => <VideoCard key={v.id} video={v} viewCount={viewCounts[v.id] || 0} onClick={() => onVideoSelect(v)} isSmall={!activeCategory} isPublished={isVideoPublished(v)} isCompleted={completedVideos.has(v.id)} isGuest={isGuest} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── VIDEO CARD ────────────────────────────────────
function VideoCard({ video, viewCount = 0, onClick, isSmall, isPublished, isCompleted, isGuest }) {
  const scheduledLabel = !isPublished ? formatScheduleDate(video.scheduledAt) : null;
  const handleClick = () => { if (!isPublished) return; onClick(); };
  const isVimeo = video.platform === 'vimeo';
  return (
    <div onClick={handleClick} className={'relative flex-shrink-0 bg-gray-900 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-105 hover:z-50 hover:shadow-2xl hover:shadow-blue-900/40 group flex flex-col ' + (isSmall ? 'w-56' : 'w-72') + ' ' + (isPublished ? 'cursor-pointer' : 'cursor-not-allowed opacity-80')}>
      <div className={'relative flex-shrink-0 ' + (isSmall ? 'h-32' : 'h-40') + ' w-full'}>
        <img src={getVideoThumbnail(video)} alt={video.title} className="w-full h-full object-cover" onError={(e) => { const t = e.currentTarget; if (isVimeo) { t.src = 'https://via.placeholder.com/640x360/1a1a2e/60a5fa?text=▶+Vimeo'; return; } const s = t.dataset.fallbackStage || 'hqdefault'; if (s === 'hqdefault') { t.dataset.fallbackStage = 'mqdefault'; t.src = getYouTubeThumbnail(video.youtubeId, 'mqdefault'); return; } t.src = getYouTubeThumbnail(''); }} />
        <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-all" />
        {isCompleted && <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1 shadow-lg"><CheckCircle size={14} className="text-white" fill="white" /></div>}
        {isPublished && !isGuest && <div className="absolute top-2 left-2 bg-black/70 px-2 py-0.5 text-xs rounded text-white flex items-center gap-1"><Eye size={11} /> {viewCount}</div>}
        {/* Badge de plataforma */}
        {isVimeo && isPublished && <div className="absolute bottom-2 left-2 bg-[#1ab7ea]/90 px-1.5 py-0.5 text-[10px] rounded font-bold text-white tracking-wide">VIMEO</div>}
        {isGuest && isPublished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
            <Lock size={24} className="text-yellow-400 mb-1" />
            <span className="text-xs text-yellow-200 font-semibold px-2 text-center">Requiere colegiado</span>
          </div>
        )}
        {isPublished && !isGuest && <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><div className="bg-white/20 backdrop-blur-sm rounded-full p-3"><Play fill="white" size={20} className="text-white" /></div></div>}
        {!isPublished && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-center px-4"><span className="text-yellow-400 font-bold text-xs uppercase tracking-widest">Próximamente</span>{scheduledLabel && <span className="text-xs text-gray-200 mt-1">Disponible el {scheduledLabel}</span>}</div>}
      </div>
      <div className={'px-3 py-2.5 flex flex-col gap-0.5 ' + (isCompleted ? 'bg-green-900/20' : 'bg-[#1a1a1a]')}>
        <h3 className="font-semibold text-xs text-white leading-snug line-clamp-2">{video.title}</h3>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-green-400 font-semibold">{video.duration} hrs</span>
          <span className="text-gray-600 text-[11px]">•</span>
          <span className="text-[11px] text-gray-400 truncate">{video.category}</span>
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {isCompleted && <span className="text-[10px] text-green-400 font-bold">✓ Visto</span>}
            {/* Videos con evaluación para certificación */}
            {video.quizEnabled && (
              <span title="Cuenta con evaluación para generar certificación con créditos académicos">
                <Award size={13} className="text-yellow-500" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PLAYER VIEW ───────────────────────────────────
function PlayerView({ video, viewCounts, onBack, sessionUser, userProfile, setUserProfile, isCompleted, onMarkCompleted, certTemplate, commissions = [] }) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [showCert, setShowCert] = useState(false);
  const [lookingUpStatus, setLookingUpStatus] = useState(false);
  const viewCount = viewCounts[video.id] || 0;

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);

  // ── Scroll al tope al abrir quiz o certificado ──
  useEffect(() => {
    if (showQuiz || showCert) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [showQuiz, showCert]);

  if (sessionUser.isGuest) {
    return (
      <div className="min-h-screen bg-[#141414] pt-2 px-4 pb-12 flex items-center justify-center">
        <div className="text-center max-w-md bg-[#1a1a1a] border border-yellow-700/40 rounded-2xl p-10">
          <Lock size={56} className="text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Contenido exclusivo para colegiados</h2>
          <p className="text-gray-400 mb-6 text-sm">Para ver este video y obtener certificados necesitas ingresar con tu número de colegiado activo del CPG.</p>
          <div className="flex flex-col gap-3">
            <button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition flex items-center justify-center gap-2">
              <UserCheck size={18} /> Ingresar con colegiado
            </button>
            <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">
              ← Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleStartQuiz = async () => {
    setLookingUpStatus(true);
    try {
      const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sessionUser.collegiateNumber }) });
      const data = await res.json();
      if (data?.estatus) {
        const s = String(data.estatus).toUpperCase();
        setUserProfile(prev => ({ ...prev, status: s }));
      }
    } catch (err) {
      console.error('[CPG] Error consultando colegiado:', err);
    }
    setLookingUpStatus(false);
    setShowQuiz(true);
  };

  const embedUrl = getVideoEmbedUrl(video);
  const iframeAllow = video.platform === 'vimeo'
    ? 'autoplay; fullscreen; picture-in-picture'
    : video.platform === 'teams'
      ? 'autoplay; fullscreen'
      : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

  return (
    <div className="min-h-screen bg-[#141414] pt-2 px-4 md:px-16 pb-12">
      <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"><ChevronLeft /> Regresar</button>
      {showCert ? (
        <CertificateView video={video} userProfile={userProfile} sessionUser={sessionUser} onBack={() => setShowCert(false)} certTemplate={certTemplate} commissions={commissions} />
      ) : showQuiz ? (
        <QuizModal video={video} onCancel={() => setShowQuiz(false)} onPass={() => { onMarkCompleted(); setShowCert(true); }} sessionUser={sessionUser} userProfile={userProfile} setUserProfile={setUserProfile} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="aspect-video w-full bg-black rounded-lg overflow-hidden shadow-2xl shadow-blue-900/20 border border-gray-800">
              {embedUrl ? (
                <iframe
                  width="100%"
                  height="100%"
                  src={embedUrl}
                  title={video.title}
                  frameBorder="0"
                  allow={iframeAllow}
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-[#1e1b4b]">
                  <div className="text-5xl">💼</div>
                  <p className="text-purple-200 font-semibold">Este video está en Microsoft Teams</p>
                  <a href={video.youtubeId} target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 bg-purple-700 hover:bg-purple-600 text-white rounded-lg font-semibold text-sm transition">
                    Abrir en Teams
                  </a>
                </div>
              )}
            </div>
            {video.platform === 'vimeo' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span className="bg-[#1ab7ea]/20 text-[#1ab7ea] px-2 py-0.5 rounded font-bold">VIMEO</span>
                <span>Contenido alojado en Vimeo</span>
              </div>
            )}
            {video.platform === 'teams' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span className="bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded font-bold">TEAMS</span>
                <span>Contenido alojado en Microsoft Teams</span>
              </div>
            )}
            <div className="mt-4">
              <button onClick={onMarkCompleted} disabled={isCompleted} className={'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ' + (isCompleted ? 'bg-green-700/30 text-green-300 border border-green-600/40 cursor-default' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700')}>
                <CheckCircle size={16} fill={isCompleted ? 'currentColor' : 'none'} />
                {isCompleted ? 'Curso marcado como completado' : 'Marcar como completado'}
              </button>
            </div>
          </div>
          <div className="lg:col-span-1 space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{video.title}</h1>
              <div className="flex flex-wrap gap-3 text-sm text-gray-400 mb-4">
                <span className="bg-blue-900/40 text-blue-300 px-2 py-1 rounded border border-blue-900">{video.category}</span>
                <span className="bg-gray-800 px-2 py-1 rounded border border-gray-700">{video.duration} Horas Acreditadas</span>
                <span className="bg-gray-800 px-2 py-1 rounded border border-gray-700 flex items-center gap-1"><Eye size={14} /> {viewCount} visitas</span>
              </div>
              <p className="text-gray-300 leading-relaxed text-sm md:text-base">{video.description}</p>
            </div>
            {video.quizEnabled ? (
              <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3"><Award className="text-yellow-500" /> Certificación Disponible</h3>
                <p className="text-gray-400 text-sm mb-4">Completa la evaluación con más del 80% de aciertos para obtener tu certificado oficial.</p>
                <button onClick={handleStartQuiz} disabled={lookingUpStatus} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold py-3 rounded-md transition shadow-lg shadow-blue-900/50 flex justify-center items-center gap-2">
                  {lookingUpStatus ? <><Loader2 size={18} className="animate-spin" /> Verificando colegiado...</> : <><Award size={18} /> Iniciar Evaluación</>}
                </button>
              </div>
            ) : (
              <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-800 text-center text-gray-500 text-sm">Este video no cuenta con evaluación para la generación de certificación del mismo por lo que no genera créditos académicos.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── QUIZ MODAL ────────────────────────────────────
function QuizModal({ video, onCancel, onPass, sessionUser, userProfile, setUserProfile }) {
  const [step, setStep] = useState('questions');
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(0);

  const displayName = userProfile.name || sessionUser.name;

  const handleSubmit = () => {
    let correct = 0;
    video.questions.forEach((q, idx) => { if (answers[idx] === q.correctAnswer) correct++; });
    const percentage = Math.round((correct / video.questions.length) * 100);
    setScore(percentage);
    setStep('result');
  };

  if (step === 'result') {
    const passed = score >= 80;
    return (
      <div className="max-w-md mx-auto bg-gray-900 p-8 rounded-lg text-center border border-gray-800">
        <div className="flex justify-center mb-4">{passed ? <CheckCircle size={64} className="text-green-500" /> : <XCircle size={64} className="text-red-500" />}</div>
        <h2 className="text-2xl font-bold mb-2">{passed ? '¡Aprobado!' : 'No Aprobado'}</h2>
        <p className="text-4xl font-bold mb-4 text-blue-400">{score}%</p>
        <p className="text-gray-400 mb-6">{passed ? 'Has completado satisfactoriamente la evaluación.' : 'Necesitas un 80% para aprobar. Intenta de nuevo.'}</p>
        <div className="flex justify-center gap-4">
          <button onClick={onCancel} className="text-gray-400 hover:text-white">Cerrar</button>
          {passed ? (
            <button onClick={onPass} className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded font-bold flex items-center gap-2"><Award size={18} /> Obtener Certificado</button>
          ) : (
            <button onClick={() => { setAnswers({}); setStep('questions'); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold">Intentar de Nuevo</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-gray-900 p-6 md:p-8 rounded-lg border border-gray-800">
      <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-black/30 rounded-lg border border-gray-800">
        <div className="flex-1">
          <label className="block text-gray-500 text-xs mb-1 uppercase tracking-wider flex items-center gap-1">
            <Shield size={11} className="text-green-500" /> Nombre (registro CPG — no editable)
          </label>
          <div className="w-full bg-black/60 border border-gray-700 rounded p-2.5 text-white text-sm flex items-center gap-2">
            <Lock size={12} className="text-gray-600 shrink-0" />
            <span>{displayName}</span>
          </div>
        </div>
        <div className="md:w-40">
          <label className="block text-gray-500 text-xs mb-1 uppercase tracking-wider">Colegiado No.</label>
          <div className="bg-gray-900 border border-gray-700 rounded p-2.5 text-gray-400 text-sm font-mono flex items-center gap-2"><Lock size={12} className="text-gray-600" />{sessionUser.collegiateNumber}</div>
        </div>
        {userProfile.status && userProfile.status !== 'DESCONOCIDO' && (
          <div className="md:w-36">
            <label className="block text-gray-500 text-xs mb-1 uppercase tracking-wider">Estado</label>
            <div className={`rounded p-2.5 text-sm font-bold flex items-center gap-2 border ${String(userProfile.status).toUpperCase().includes('ACTIVO') ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-red-900/30 border-red-700 text-red-300'}`}>
              <span className={`w-2 h-2 rounded-full ${String(userProfile.status).toUpperCase().includes('ACTIVO') ? 'bg-green-400' : 'bg-red-400'}`}></span>
              {String(userProfile.status).toUpperCase().includes('ACTIVO') ? 'ACTIVO' : 'INACTIVO'}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-bold text-white">Evaluación: {video.title}</h2>
        <span className="text-sm text-gray-400">10 Preguntas</span>
      </div>
      <div className="space-y-8 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
        {video.questions.map((q, idx) => (
          <div key={idx} className="bg-black/30 p-4 rounded border border-gray-800">
            <p className="font-medium text-lg mb-3 text-gray-200">{idx + 1}. {q.question}</p>
            <div className="space-y-2">
              {q.options.map((opt, optIdx) => (
                <label key={optIdx} className={'flex items-center gap-3 p-3 rounded cursor-pointer transition ' + (answers[idx] === optIdx ? 'bg-blue-900/30 border border-blue-500' : 'hover:bg-gray-800 border border-transparent')}>
                  <input type="radio" name={'q-' + idx} className="w-4 h-4 text-blue-600" checked={answers[idx] === optIdx} onChange={() => setAnswers({ ...answers, [idx]: optIdx })} />
                  <span className="text-gray-300">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex justify-end gap-4 border-t border-gray-800 pt-4">
        <button onClick={onCancel} className="text-gray-400 hover:text-white">Cancelar</button>
        <button onClick={handleSubmit} disabled={Object.keys(answers).length < video.questions.length} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2 rounded font-bold transition">Finalizar Evaluación</button>
      </div>
    </div>
  );
}

// ── CERTIFICATE VIEW ──────────────────────────────
function CertificateView({ video, userProfile, sessionUser, onBack, certTemplate, commissions = [] }) {
  const certRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [resolvedStatus, setResolvedStatus] = useState('');
  const [saved, setSaved] = useState(false);
  const [editableName, setEditableName] = useState(userProfile.name || sessionUser?.name || '');

  const tpl = { ...DEFAULT_CERT_CONFIG, ...certTemplate };
  const currentDate = new Date();
  const fmt = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const collegiateNum = userProfile.collegiateNumber || sessionUser?.collegiateNumber || '0000';
  const certificateCode = 'CPG-' + fmt(currentDate) + '-' + collegiateNum + '-' + video.id;
  const dateFormatted = currentDate.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
  const qrUrl = getCertQrUrl(certificateCode);

  useEffect(() => {
    const tryResolve = async () => {
      const num = userProfile.collegiateNumber || sessionUser?.collegiateNumber;
      if (!num || num === '0000') {
        // Guest — use whatever status is available from profile/session
        const fallback = String(userProfile.status || sessionUser?.status || '').toUpperCase().trim();
        if (fallback) setResolvedStatus(fallback);
        return;
      }
      // Always fetch live status from CPG API for real colegiados
      try {
        const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: num }) });
        const data = await res.json();
        const apiStatus = String(data?.estatus || data?.status || '').toUpperCase().trim();
        if (apiStatus && apiStatus !== 'DESCONOCIDO') { setResolvedStatus(apiStatus); return; }
      } catch {}
      // Fallback to cached session status if API fails
      const fallback = String(userProfile.status || sessionUser?.status || '').toUpperCase().trim();
      if (fallback) setResolvedStatus(fallback);
    };
    tryResolve();
  }, [userProfile.collegiateNumber, sessionUser?.collegiateNumber]);

  useEffect(() => {
    if (!supabase || saved) return;
    if (!collegiateNum || collegiateNum === '0000') return;
    if (!imageLoaded) return;
    setSaved(true);
    // Construir snapshot de comisiones firmantes del curso (si tiene)
    const certCommissions = (video.hasCommissions && video.commissions && commissions.length > 0)
      ? commissions.filter(c => video.commissions.includes(c.id)).map(c => ({
          id: c.id,
          commission_name: c.commission_name,
          signer_name: c.signer_name,
          signer_title: c.signer_title,
          signature_url: c.signature_url,
          logo_url: c.logo_url || null,
        }))
      : [];
    // Chequear si ya existe certificado para este colegiado/curso (anti-duplicado)
    supabase.from('cpg_certificates').select('certificate_code').eq('collegiate_number', collegiateNum).eq('video_id', video.id).maybeSingle().then(({ data: existing }) => {
      if (existing) { console.log('[CPG Cert] Ya existía certificado para este colegiado/curso:', existing.certificate_code); return; }
      supabase.from('cpg_certificates').insert({
        certificate_code: certificateCode,
        collegiate_number: collegiateNum,
        recipient_name: editableName || userProfile.name || '',
        status: resolvedStatus || 'DESCONOCIDO',
        video_id: video.id,
        video_title: video.title,
        video_duration: String(video.duration || ''),
        issued_at: currentDate.toISOString(),
        verify_url: `${APP_URL}/?cert=${certificateCode}`,
        commissions_snapshot: certCommissions,
      }).then(({ error }) => {
        if (error && error.code !== '23505') console.warn('[CPG Cert] No se pudo guardar registro:', error.message);
        if (!error) logAuditAuto('cert_emitted', 'certificate', certificateCode, { recipient: editableName || userProfile.name || '', video: video.title, collegiate: collegiateNum });
      });
    });
  }, [resolvedStatus, saved, imageLoaded]);

  const handleDownloadPDF = async () => {
    if (!certRef.current || !imageLoaded) { alert('Espera a que la plantilla del certificado cargue completamente.'); return; }
    if (!editableName.trim()) { alert('Ingresa tu nombre completo antes de descargar el certificado.'); return; }
    setIsGenerating(true);
    // Guardar nombre actualizado en el perfil
    if (supabase && collegiateNum && collegiateNum !== '0000' && editableName.trim()) {
      supabase.from('cpg_user_profiles').upsert(
        { collegiate_number: collegiateNum, name: editableName.trim() },
        { onConflict: 'collegiate_number' }
      ).then(() => {});
    }
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(certRef.current, {
        scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#f5f5f0', logging: false, imageTimeout: 15000,
        width: 1056, height: 816, windowWidth: 1056, windowHeight: 816, scrollX: 0, scrollY: 0,
      });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      const imgData = canvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save('Certificado_' + (editableName || userProfile.name || 'CPG').replace(/\s+/g, '_') + '_' + certificateCode + '.pdf');
    } catch (error) { console.error('Error generando PDF:', error); alert('Hubo un error al generar el PDF.'); }
    finally { setIsGenerating(false); }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full overflow-hidden">
      <div className="flex flex-wrap gap-3 print:hidden justify-center">
        <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm">Cerrar</button>
        <button onClick={handleDownloadPDF} disabled={isGenerating || !imageLoaded} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-bold flex items-center gap-2 text-sm">
          {isGenerating ? <><Loader2 size={16} className="animate-spin" /> Generando...</> : <><Download size={16} /> Descargar PDF</>}
        </button>
      </div>
      <div className="print:hidden w-full max-w-md px-2">
        <label className="block text-gray-400 text-xs uppercase tracking-wider mb-1.5">Nombre en el certificado</label>
        <input
          type="text"
          value={editableName}
          onChange={e => setEditableName(e.target.value)}
          placeholder="Ingresa tu nombre completo"
          className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:border-blue-500 outline-none transition text-sm"
        />
        {!editableName && <p className="text-yellow-400 text-xs mt-1">⚠ Ingresa tu nombre para que aparezca en el certificado.</p>}
      </div>
      <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-full px-3 py-1 text-[11px] text-gray-400 print:hidden overflow-hidden max-w-full">
        <Shield size={10} className="text-green-400 shrink-0" />
        <span className="font-mono truncate">{certificateCode}</span>
      </div>
      {!imageLoaded && <div className="text-yellow-400 text-sm flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Cargando plantilla...</div>}
      <div className="w-full overflow-hidden">
        <CertScaledPreview certRef={certRef} imageLoaded={imageLoaded}>
          <CertificateCanvas
            certRef={certRef} tpl={tpl} onImageLoaded={() => setImageLoaded(true)}
            recipientName={editableName} statusText={resolvedStatus}
            collegiateNumber={userProfile.collegiateNumber || collegiateNum} videoTitle={video.title}
            videoDuration={String(video.duration || '')} dateFormatted={dateFormatted}
            certificateCode={certificateCode} qrUrl={qrUrl}
            commissionsSnapshot={(video.hasCommissions && video.commissions && commissions.length > 0) ? commissions.filter(c => video.commissions.includes(c.id)) : []}
          />
        </CertScaledPreview>
      </div>
    </div>
  );
}

// ── CERT SCALED PREVIEW ──
function CertScaledPreview({ certRef, imageLoaded, children, interactive = false }) {
  const [scale, setScale] = React.useState(() => Math.min(1, (typeof window !== 'undefined' ? window.innerWidth - 32 : 1056) / 1056));
  const wrapperRef = React.useRef(null);

  React.useEffect(() => {
    const updateScale = () => {
      if (wrapperRef.current) {
        const available = wrapperRef.current.parentElement?.offsetWidth || wrapperRef.current.offsetWidth || window.innerWidth - 32;
        setScale(Math.min(1, available / 1056));
      }
    };
    updateScale();
    const t1 = setTimeout(updateScale, 100);
    const t2 = setTimeout(updateScale, 500);
    window.addEventListener('resize', updateScale);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', updateScale); };
  }, []);

  return (
    <div ref={wrapperRef} className="w-full overflow-hidden" style={{ position: 'relative' }}>
      {/* 1. Scaled visual preview — rendered FIRST (decorative only, user sees this) */}
      <div className="w-full flex justify-center overflow-hidden">
        <div style={{ width: Math.floor(1056 * scale) + 'px', height: Math.floor(816 * scale) + 'px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ transform: 'scale(' + scale + ')', transformOrigin: 'top left', width: '1056px', height: '816px', position: 'absolute', top: 0, left: 0, pointerEvents: interactive ? 'auto' : 'none' }}>
            <CertScaleContext.Provider value={scale}>
              {children}
            </CertScaleContext.Provider>
          </div>
        </div>
      </div>
      {/* 2. Offscreen full-size render — rendered LAST so certRef attaches HERE (html2canvas captures this) */}
      <div style={{ position: 'absolute', left: '-99999px', top: '-99999px', width: '1056px', height: '816px', overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
        {children}
      </div>
    </div>
  );
}

// ── LOGIN ADMIN ───────────────────────────────────
function LoginView({ onLogin, onBack, authError }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const handleSubmit = (e) => { e.preventDefault(); onLogin(email, password); };
  return (
    <div className="min-h-screen flex items-center justify-center bg-black/90 px-4">
      <div className="w-full max-w-md bg-[#141414] p-8 rounded-lg shadow-2xl border border-gray-800 relative">
        <button onClick={onBack} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X /></button>
        <h2 className="text-3xl font-bold mb-8 text-white">Administrador</h2>
        {authError && <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{authError}</div>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div><label className="block text-gray-400 text-sm mb-2">Correo Electrónico</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 rounded bg-[#333] text-white border-none focus:ring-2 focus:ring-blue-600 outline-none" required /></div>
          <div><label className="block text-gray-400 text-sm mb-2">Contraseña</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 rounded bg-[#333] text-white border-none focus:ring-2 focus:ring-blue-600 outline-none" required /></div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded transition">Ingresar</button>
        </form>
      </div>
    </div>
  );
}

function QuestionEditor({ question, idx, onQuestionChange }) {
  return (
    <div className="bg-gray-800 p-4 rounded mb-4 border border-gray-700">
      <div className="mb-2"><label className="text-xs text-blue-300">Pregunta {idx + 1}</label><input type="text" value={question.question} onChange={e => onQuestionChange(idx, c => ({ ...c, question: e.target.value }))} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white" placeholder="Escribe la pregunta" /></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {question.options.map((opt, optIdx) => (
          <div key={optIdx} className="flex flex-col">
            <input type="text" value={opt} onChange={e => { onQuestionChange(idx, c => { const o = [...c.options]; o[optIdx] = e.target.value; return { ...c, options: o }; }); }} className={'w-full bg-gray-900 border rounded p-2 text-xs text-white ' + (question.correctAnswer === optIdx ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-600')} placeholder={'Opción ' + (optIdx + 1)} />
            <label className="flex items-center gap-1 mt-1 text-xs text-gray-400 cursor-pointer"><input type="radio" name={'correct-' + idx} checked={question.correctAnswer === optIdx} onChange={() => onQuestionChange(idx, c => ({ ...c, correctAnswer: optIdx }))} /> Correcta</label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── LIVE ADMIN PANEL ──────────────────────────────
function LiveAdminPanel({ liveSession, onSave, onOpenAttendance, commissions = [], activities = [] }) {
  const PLATFORMS = [
    { id: 'youtube', label: 'YouTube Live',   hint: 'Pega la URL del video en vivo',               color: 'border-red-600 bg-red-900/20 text-red-300' },
    { id: 'zoom',    label: 'Zoom',            hint: 'Pega el enlace de invitación de Zoom',         color: 'border-blue-600 bg-blue-900/20 text-blue-300' },
    { id: 'meet',    label: 'Google Meet',     hint: 'Pega el enlace de Google Meet',                color: 'border-green-600 bg-green-900/20 text-green-300' },
    { id: 'teams',   label: 'Microsoft Teams', hint: 'Pega el enlace de reunión de Microsoft Teams', color: 'border-purple-600 bg-purple-900/20 text-purple-300' },
  ];
  const EMPTY_LIVE_FORM = { title: '', platform: 'youtube', url: '', hasCommissions: false, commissions: [] };
  const [form, setForm] = useState(EMPTY_LIVE_FORM);
  const [selectedActivity, setSelectedActivity] = useState('');
  const [attendees, setAttendees] = useState([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAttendees, setShowAttendees] = useState(false);
  const [showSessionsLog, setShowSessionsLog] = useState(false);
  const [sessionsLog, setSessionsLog] = useState([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const isActive = liveSession?.active;
  const currentPlatform = PLATFORMS.find(p => p.id === form.platform);

  // ── Sincronizar el formulario con la transmisión ACTIVA ──
  // Carga los datos de la sesión en vivo (de la BD compartida) al montar el panel,
  // al iniciar una nueva sesión, y al entrar desde otro dispositivo. Así, tras salir
  // y volver — o desde cualquier equipo — se puede editar la transmisión (p.ej.
  // cambiar el enlace de Zoom por YouTube) SIN tener que finalizar y empezar de cero.
  // Solo re-sincroniza cuando cambia la sesión (started_at), no en cada poll, para
  // no pisar lo que el administrador esté escribiendo.
  const syncedSessionRef = useRef(null);
  useEffect(() => {
    if (liveSession?.active) {
      if (syncedSessionRef.current !== liveSession.started_at) {
        syncedSessionRef.current = liveSession.started_at;
        setForm({
          title: liveSession.title || '',
          platform: liveSession.platform || 'youtube',
          url: liveSession.url || '',
          hasCommissions: Array.isArray(liveSession.commissions_snapshot) && liveSession.commissions_snapshot.length > 0,
          commissions: (liveSession.commissions_snapshot || []).map(c => c?.id).filter(v => v != null),
        });
      }
    } else {
      syncedSessionRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSession?.active, liveSession?.started_at]);

  const detectPlatform = (url) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('zoom.us')) return 'zoom';
    if (lower.includes('meet.google.com')) return 'meet';
    if (lower.includes('teams.microsoft.com') || lower.includes('teams.live.com')) return 'teams';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    return null;
  };

  const handleActivityPreFill = (actId) => {
    setSelectedActivity(actId);
    if (!actId) return;
    const a = activities.find(x => String(x.id) === actId);
    if (!a) return;
    const link = a.meetingLink || a.zoomLink || '';
    setForm(prev => ({
      ...prev,
      title: a.title || prev.title,
      url: link || prev.url,
      platform: detectPlatform(link) || prev.platform,
      hasCommissions: !!a.hasCommissions,
      commissions: a.commissions || [],
    }));
  };

  const [toggleError, setToggleError] = useState('');

  const handleToggle = async () => {
    setSaving(true);
    setToggleError('');
    if (!isActive) {
      if (!form.url?.trim()) {
        setToggleError('Falta el enlace de la transmisión antes de iniciar.');
        setSaving(false);
        return;
      }
      const commSnap = form.hasCommissions
        ? commissions.filter(c => (form.commissions || []).includes(c.id)).map(c => ({ id: c.id, commission_name: c.commission_name, signer_name: c.signer_name, signer_title: c.signer_title, signature_url: c.signature_url }))
        : [];
      const res = await onSave({ active: true, title: form.title, platform: form.platform, url: form.url, started_at: new Date().toISOString(), commissions_snapshot: commSnap });
      if (res?.error) {
        setToggleError('Error al iniciar: ' + (res.error.message || 'error desconocido') + '. La transmisión NO quedó activa en la base de datos.');
        setSaving(false);
        return;
      }
    } else {
      // Al finalizar: contar asistentes de esta sesión y guardar en el log
      if (supabase && liveSession?.title) {
        try {
          const { data: att } = await supabase.from('cpg_live_attendance')
            .select('id')
            .eq('session_title', liveSession.title);
          await supabase.from('cpg_live_sessions_log').insert({
            title: liveSession.title,
            platform: liveSession.platform,
            url: liveSession.url || '',
            started_at: liveSession.started_at,
            ended_at: new Date().toISOString(),
            attendee_count: att?.length || 0,
          });
        } catch {}
      }
      await onSave({ active: false });
    }
    setSaving(false);
  };

  const handleUpdate = async () => {
    setSaving(true);
    const commSnap = form.hasCommissions
      ? commissions.filter(c => (form.commissions || []).includes(c.id)).map(c => ({ id: c.id, commission_name: c.commission_name, signer_name: c.signer_name, signer_title: c.signer_title, signature_url: c.signature_url }))
      : [];
    await onSave({ title: form.title, platform: form.platform, url: form.url, commissions_snapshot: commSnap });
    setSaving(false);
  };

  const loadAttendees = async () => {
    if (!supabase) return; setLoadingAtt(true);
    try { const { data } = await supabase.from('cpg_live_attendance').select('*').order('joined_at', { ascending: false }); setAttendees(data || []); } catch {}
    setLoadingAtt(false);
  };
  const handleShowAttendees = async () => { if (!showAttendees) await loadAttendees(); setShowAttendees(p => !p); };

  // Auto-refresh cada 20s mientras el panel de asistentes esté abierto
  useEffect(() => {
    if (!showAttendees) return;
    const interval = setInterval(() => { loadAttendees(); }, 20000);
    return () => clearInterval(interval);
  }, [showAttendees]);

  const loadSessionsLog = async () => {
    if (!supabase) return; setLoadingLog(true);
    try { const { data } = await supabase.from('cpg_live_sessions_log').select('*').order('ended_at', { ascending: false }); setSessionsLog(data || []); } catch {}
    setLoadingLog(false);
  };

  const exportAttendance = () => {
    if (!attendees.length) return;
    const rows = [
      ['Nombre', 'Colegiado', 'Correo', 'Departamento', 'Teléfono', 'Plataforma', 'Sesión', 'Fecha/Hora'],
      ...attendees.map(a => [a.name, a.collegiate_number, a.email || '', a.department || '', a.phone || '', a.platform, a.session_title, new Date(a.joined_at).toLocaleString('es-GT')])
    ];
    exportXLSX(rows, 'asistencia-sesiones-en-vivo.xlsx');
  };

  const exportSessionsLog = () => {
    if (!sessionsLog.length) return;
    const rows = [
      ['Título', 'Plataforma', 'Inicio', 'Fin', 'Asistentes'],
      ...sessionsLog.map(s => [s.title, s.platform, s.started_at ? new Date(s.started_at).toLocaleString('es-GT') : '', new Date(s.ended_at).toLocaleString('es-GT'), s.attendee_count])
    ];
    exportXLSX(rows, 'informe-sesiones-en-vivo.xlsx');
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isActive ? 'bg-red-600' : 'bg-gray-700'}`}><Radio size={20} /></div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isActive ? 'bg-red-600/30 text-red-300' : 'bg-gray-700 text-gray-400'}`}>{isActive ? '● ACTIVA' : '○ INACTIVA'}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => onOpenAttendance && onOpenAttendance()} className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-600 px-4 py-2 rounded-lg text-sm font-semibold transition"><Users size={16} /> Asistencia por actividad</button>
          <button onClick={() => { setShowSessionsLog(p => !p); if (!showSessionsLog) loadSessionsLog(); }} className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-600 px-4 py-2 rounded-lg text-sm font-semibold transition"><History size={16} /> Informe sesiones</button>
          <button onClick={handleToggle} disabled={saving} className={`flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm transition ${isActive ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />}
            {isActive ? 'Finalizar transmisión' : 'Iniciar transmisión'}
          </button>
        </div>
      </div>
      {toggleError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3 text-sm text-red-300 flex items-start gap-2">
          <XCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold mb-0.5">No se pudo activar la transmisión</p>
            <p className="text-xs text-red-300/80">{toggleError}</p>
          </div>
          <button onClick={() => setToggleError('')} className="text-red-400 hover:text-red-200 text-xs">✕</button>
        </div>
      )}
      {/* Prefill desde actividad existente */}
      {activities.length > 0 && !isActive && (
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Cargar datos desde actividad del calendario</label>
          <select
            value={selectedActivity}
            onChange={e => handleActivityPreFill(e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
          >
            <option value="">— Ingresar manualmente —</option>
            {activities.sort((a, b) => (a.date > b.date ? -1 : 1)).map(a => (
              <option key={a.id} value={String(a.id)}>{a.date ? a.date + ' · ' : ''}{a.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Título de la sesión</label>
          <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ej. Webinar: Neuropsicología" className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Plataforma</label>
          <div className="flex gap-2 flex-wrap">
            {PLATFORMS.map(p => (
              <button key={p.id} type="button" onClick={() => setForm({ ...form, platform: p.id, url: '' })} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${form.platform === p.id ? p.color : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-gray-400 mb-1">Enlace de la transmisión</label>
          <input type="url" value={form.url} onChange={e => { const url = e.target.value; const detected = detectPlatform(url); setForm(prev => ({ ...prev, url, platform: detected || prev.platform })); }} placeholder={currentPlatform?.hint} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" />
          <p className="text-[11px] text-gray-600 mt-1">La plataforma se detecta automáticamente al pegar el enlace.</p>
        </div>
      </div>

      {/* Comisiones de la transmisión */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 mt-4">
        <div className="flex items-center gap-3 mb-2">
          <input type="checkbox" id="liveCommToggle" checked={!!form.hasCommissions} onChange={e => setForm({ ...form, hasCommissions: e.target.checked, commissions: e.target.checked ? (form.commissions || []) : [] })} className="w-5 h-5 text-purple-600 rounded" />
          <label htmlFor="liveCommToggle" className="font-semibold cursor-pointer">¿Otra comisión involucrada?</label>
        </div>
        <p className="text-xs text-gray-500 mb-3">Las comisiones seleccionadas firmarán los certificados de asistencia a esta transmisión.</p>
        {form.hasCommissions && (
          <div>
            {(!commissions || commissions.length === 0) ? (
              <p className="text-sm text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-2">No hay comisiones activas.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {commissions.map(c => {
                  const ids = form.commissions || [];
                  const checked = ids.includes(c.id);
                  return (
                    <label key={c.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${checked ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 hover:border-gray-500'}`}>
                      <input type="checkbox" checked={checked} onChange={() => { const next = checked ? ids.filter(x => x !== c.id) : [...ids, c.id]; setForm({ ...form, commissions: next }); }} className="w-4 h-4 accent-purple-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{c.commission_name}</p>
                        <p className="text-gray-500 text-xs truncate">{c.signer_name} · {c.signer_title}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {isActive && (
        <div className="mt-4 flex flex-wrap gap-3 items-start">
          <button onClick={handleUpdate} disabled={saving} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm font-semibold transition">{saving ? <Loader2 size={14} className="animate-spin" /> : null}Actualizar configuración en vivo</button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-1">Enlace de asistencia para compartir:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-xs text-green-300 font-mono truncate">{APP_URL}/?attend=1</code>
              <button
                onClick={() => { navigator.clipboard.writeText(APP_URL + '/?attend=1'); }}
                className="shrink-0 flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-xs font-semibold transition"
                title="Copiar enlace"
              >
                Copiar
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">Quienes accedan a este enlace podrán registrar su asistencia directamente.</p>
          </div>
        </div>
      )}

      {/* ── INFORME DE SESIONES EN VIVO ── */}
      {showSessionsLog && (
        <div className="mt-6 border-t border-gray-800 pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Historial de sesiones en vivo ({sessionsLog.length})</h3>
            {sessionsLog.length > 0 && <button onClick={exportSessionsLog} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded text-xs font-semibold"><Download size={14} /> Exportar XLSX</button>}
          </div>
          {loadingLog && <div className="text-center py-6"><Loader2 className="animate-spin mx-auto text-gray-500" size={24} /></div>}
          {!loadingLog && sessionsLog.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No hay sesiones registradas aún. El historial se genera al finalizar cada transmisión.</p>}
          {!loadingLog && sessionsLog.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                  <tr><th className="text-left px-4 py-3">Sesión</th><th className="text-left px-4 py-3">Plataforma</th><th className="text-left px-4 py-3">Inicio</th><th className="text-left px-4 py-3">Fin</th><th className="text-left px-4 py-3">Asistentes</th></tr>
                </thead>
                <tbody>
                  {sessionsLog.map(s => (
                    <tr key={s.id} className="border-t border-gray-800 hover:bg-gray-900/40">
                      <td className="px-4 py-2 text-white font-medium max-w-xs truncate">{s.title}</td>
                      <td className="px-4 py-2 text-gray-400 capitalize">{s.platform}</td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">{s.started_at ? new Date(s.started_at).toLocaleString('es-GT') : '—'}</td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">{new Date(s.ended_at).toLocaleString('es-GT')}</td>
                      <td className="px-4 py-2 text-center"><span className="bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full text-xs font-bold">{s.attendee_count}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ASISTENTES ── */}
      {showAttendees && (
        <div className="mt-6 border-t border-gray-800 pt-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-bold text-white flex items-center gap-2">
              Registro de asistencia ({attendees.length})
              <span className="text-[10px] text-gray-500 font-normal">· se actualiza cada 20s</span>
            </h3>
            <div className="flex gap-2">
              <button onClick={loadAttendees} disabled={loadingAtt} className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-3 py-1.5 rounded text-xs font-semibold transition">
                {loadingAtt ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualizar
              </button>
              {attendees.length > 0 && <button onClick={exportAttendance} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded text-xs font-semibold"><Download size={14} /> Exportar CSV</button>}
            </div>
          </div>
          {loadingAtt && <div className="text-center py-6"><Loader2 className="animate-spin mx-auto text-gray-500" size={24} /></div>}
          {!loadingAtt && attendees.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No hay registros de asistencia aún.</p>}
          {!loadingAtt && attendees.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                  <tr>
                    <th className="text-left px-4 py-3">Nombre</th>
                    <th className="text-left px-4 py-3">Colegiado</th>
                    <th className="text-left px-4 py-3">Correo</th>
                    <th className="text-left px-4 py-3">Depto.</th>
                    <th className="text-left px-4 py-3">Teléfono</th>
                    <th className="text-left px-4 py-3">Sesión</th>
                    <th className="text-left px-4 py-3">Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map(a => (
                    <tr key={a.id} className="border-t border-gray-800 hover:bg-gray-900/40">
                      <td className="px-4 py-2 text-white">{a.name || '—'}</td>
                      <td className="px-4 py-2 text-gray-300">{a.collegiate_number}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{a.email || '—'}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{a.department || '—'}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{a.phone || '—'}</td>
                      <td className="px-4 py-2 text-gray-400 max-w-xs truncate text-xs">{a.session_title}</td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">{new Date(a.joined_at).toLocaleString('es-GT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── EMBED EXTERNO (Zoom / Meet / Teams) ──
// Intenta iframe primero. Si la plataforma bloquea con X-Frame-Options
// (Microsoft Teams casi siempre lo hace), muestra el botón externo.
function ExternalLiveEmbed({ session, meta }) {
  const [embedFailed, setEmbedFailed] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const iframeRef = useRef(null);
  // (la detección automática de bloqueo por X-Frame-Options no es confiable
  // entre orígenes; el usuario sabrá si quedó en blanco y usará el botón externo)

  // El botón "Intentar ver aquí dentro" solo aparece para plataformas que
  // ocasionalmente permiten embed (Meet a veces, Teams casi nunca, Zoom nunca).
  const canTryEmbed = session.platform === 'meet' || session.platform === 'teams';

  if (showEmbed && !embedFailed && session?.url) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-black aspect-video w-full relative">
          <iframe
            ref={iframeRef}
            src={session.url}
            title={`Transmisión ${meta.label}`}
            allow="camera; microphone; fullscreen; speaker; display-capture; autoplay; clipboard-read; clipboard-write"
            allowFullScreen
            className="w-full h-full"
            onError={() => setEmbedFailed(true)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>Si la pantalla queda en blanco, {meta.label} no permite mostrarse aquí. Usa el botón externo:</span>
          <div className="flex gap-2">
            <a href={session.url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition ${meta.color} hover:opacity-90`}><Video size={13} /> Abrir en {meta.label}</a>
            <button onClick={() => setShowEmbed(false)} className="text-gray-400 hover:text-white">Volver</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-700 bg-[#141414] p-8 md:p-12 text-center">
      <div className="text-5xl mb-4">{meta.icon}</div>
      <h2 className="text-xl font-bold text-white mb-2">La sesión se transmite por {meta.label}</h2>
      <p className="text-gray-400 text-sm mb-8 max-w-md mx-auto">
        Haz clic en el botón para unirte directamente.
        {session.platform === 'zoom' && ' Es posible que necesites tener instalada la aplicación de Zoom.'}
        {session.platform === 'teams' && ' Es posible que necesites tener instalada la aplicación de Microsoft Teams.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a href={session.url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-3 text-white font-bold px-8 py-4 rounded-xl text-lg shadow-lg transition ${meta.color} hover:opacity-90`}><Video size={22} /> Unirme a {meta.label}</a>
        {canTryEmbed && (
          <button onClick={() => { setShowEmbed(true); setEmbedFailed(false); }} className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold px-5 py-3 rounded-xl border border-gray-700 transition">
            Intentar ver aquí dentro
          </button>
        )}
      </div>
      {session.platform === 'teams' && (
        <p className="text-[11px] text-gray-600 mt-5 max-w-md mx-auto">
          Nota: Microsoft Teams normalmente bloquea la incrustación de reuniones en sitios externos por seguridad. Si el embed queda en blanco, usa "Unirme a {meta.label}".
        </p>
      )}
    </div>
  );
}

// ── LIVE SESSION VIEW ─────────────────────────────
function LiveSessionView({ session, onBack, sessionUser, onRegisterAttendance }) {
  const [attended, setAttended] = useState(false);
  const [attForm, setAttForm] = useState({ department: '', phone: '', email: sessionUser?.email || '', abroad: false, country: '' });
  const [attError, setAttError] = useState('');
  const [saving, setSaving] = useState(false);

  // Check if user already registered for this session (persists across navigation/reloads).
  useEffect(() => {
    if (sessionUser?.isGuest || !sessionUser?.collegiateNumber || !supabase || !session?.title) return;
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('check_attendance_registered', {
          p_collegiate: sessionUser.collegiateNumber,
          p_session_title: session.title,
        });
        if (active && data === true) setAttended(true);
      } catch {}
    })();
    return () => { active = false; };
  }, [sessionUser, session?.title]);

  // Precargar datos de la última asistencia del colegiado (correo, teléfono,
  // departamento, país) para que registrar sea prácticamente un solo clic.
  // Se usa una función RPC (SECURITY DEFINER) porque la lectura directa de la
  // tabla está restringida solo a admins; la función devuelve únicamente el
  // último registro con teléfono no vacío del colegiado solicitado.
  useEffect(() => {
    if (sessionUser?.isGuest || !sessionUser?.collegiateNumber || !supabase) return;
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_attendance_prefill', {
          p_collegiate: sessionUser.collegiateNumber,
        });
        const row = Array.isArray(data) ? data[0] : data;
        if (active && row) {
          setAttForm(prev => ({
            ...prev,
            email: prev.email || row.email || '',
            phone: prev.phone || row.phone || '',
            department: prev.department || row.department || '',
            country: prev.country || row.country || '',
            abroad: !!(prev.country || row.country),
          }));
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [sessionUser]);

  const handleSubmitAttendance = async () => {
    if (attForm.abroad) {
      if (!attForm.country.trim()) { setAttError('Escribe el país en el que te encuentras.'); return; }
    } else if (!attForm.department) {
      setAttError('Selecciona tu departamento.'); return;
    }
    if (!attForm.phone.trim()) { setAttError('Ingresa tu número de teléfono.'); return; }
    setAttError(''); setSaving(true);
    const result = await onRegisterAttendance({
      email: attForm.email,
      department: attForm.abroad ? '' : attForm.department,
      phone: attForm.phone.trim(),
      country: attForm.abroad ? attForm.country.trim() : '',
    });
    setSaving(false);
    if (result?.success === false) {
      setAttError(result.message || 'No se pudo registrar la asistencia. Intenta de nuevo.');
    } else {
      setAttended(true);
    }
  };

  // Reutilizamos el extractor canónico definido al inicio del archivo
  const platformMeta = { youtube: { label: 'YouTube Live', color: 'bg-red-700', icon: '▶', embedable: true }, zoom: { label: 'Zoom', color: 'bg-blue-700', icon: '🎥', embedable: false }, meet: { label: 'Google Meet', color: 'bg-green-700', icon: '📹', embedable: false }, teams: { label: 'Microsoft Teams', color: 'bg-purple-700', icon: '💼', embedable: false } };
  const meta = platformMeta[session?.platform] || platformMeta.zoom;

  return (
    <div className="min-h-screen bg-[#0e0e0e] pt-2 px-4 md:px-10 pb-16">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="text-gray-400 hover:text-white transition flex items-center gap-1 text-sm"><ChevronLeft size={18} /> Inicio</button>
          <span className="flex items-center gap-2 bg-red-600/20 border border-red-500/40 text-red-300 text-xs font-bold px-3 py-1 rounded-full">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>EN VIVO
          </span>
          <span className={`text-xs px-3 py-1 rounded-full text-white font-semibold ${meta.color}`}>{meta.label}</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{session?.title || 'Transmisión en vivo'}</h1>
        {session?.started_at && <p className="text-sm text-gray-400 mb-6">Inició: {new Date(session.started_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</p>}

        {/* ── REGISTRO DE ASISTENCIA (obligatorio antes de ver/entrar) ── */}
        {!sessionUser?.isGuest && !attended && (
          <div className="mb-6 bg-[#1a1a1a] border border-blue-700/40 rounded-2xl p-5 max-w-lg">
            <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-2"><Users size={18} className="text-blue-400" /> Marca tu asistencia</h3>
            <p className="text-gray-400 text-sm mb-4">Para ver la transmisión o entrar al enlace, primero registra tu asistencia. Tus datos vienen precargados — solo confirma (o edítalos si cambió algo).</p>
            {attError && <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-300">{attError}</div>}

            <div className="space-y-3">
              <div>
                <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wider">Correo electrónico</label>
                <input type="email" value={attForm.email} onChange={e => setAttForm({ ...attForm, email: e.target.value })} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="tucorreo@ejemplo.com" />
              </div>

              {/* Checkbox extranjero */}
              <label className="flex items-center gap-2 cursor-pointer py-1">
                <input type="checkbox" checked={attForm.abroad} onChange={e => { setAttForm({ ...attForm, abroad: e.target.checked }); setAttError(''); }} className="w-4 h-4 accent-blue-500" />
                <span className="text-sm text-gray-300">Estoy en el extranjero</span>
              </label>

              {attForm.abroad ? (
                <div>
                  <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wider">País donde te encuentras <span className="text-red-400">*</span></label>
                  <input type="text" value={attForm.country} onChange={e => { setAttForm({ ...attForm, country: e.target.value }); setAttError(''); }} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Ej. México, España, Estados Unidos…" />
                </div>
              ) : (
                <div>
                  <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wider">Departamento <span className="text-red-400">*</span></label>
                  <select value={attForm.department} onChange={e => { setAttForm({ ...attForm, department: e.target.value }); setAttError(''); }} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none">
                    <option value="">— Selecciona tu departamento —</option>
                    {GUATEMALA_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wider">Teléfono <span className="text-red-400">*</span></label>
                <input type="tel" value={attForm.phone} onChange={e => { setAttForm({ ...attForm, phone: e.target.value }); setAttError(''); }} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Ej. 5555-1234" />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={handleSubmitAttendance} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg transition flex items-center gap-2 text-sm">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Confirmar asistencia y ver transmisión
              </button>
            </div>
          </div>
        )}

        {/* Confirmación */}
        {!sessionUser?.isGuest && attended && (
          <div className="inline-flex items-center gap-3 mb-6 px-4 py-3 rounded-xl border border-green-600 bg-green-900/20 text-green-300">
            <CheckCircle size={18} />
            <span className="text-sm font-semibold">Tu asistencia fue registrada correctamente</span>
          </div>
        )}

        {sessionUser?.isGuest && <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-xl border border-yellow-700 bg-yellow-900/20 text-yellow-300 text-sm"><Lock size={15} /> Ingresa con tu número de colegiado para registrar asistencia y ver la transmisión</div>}

        {/* ── ACCESO A LA TRANSMISIÓN: solo después de marcar asistencia ── */}
        {!attended ? (
          !sessionUser?.isGuest && session?.url && (
            <div className="rounded-2xl border border-blue-800/50 bg-blue-900/10 p-10 text-center">
              <Lock size={40} className="mx-auto mb-4 text-blue-400" />
              <p className="text-blue-200 font-semibold">Marca tu asistencia para ver la transmisión</p>
              <p className="text-blue-300/70 text-sm mt-1">El enlace y el video se habilitan al confirmar tu asistencia arriba.</p>
            </div>
          )
        ) : (
          <>
            {/* Video embed — visible solo tras marcar asistencia */}
            {session?.platform === 'youtube' && session?.url && (
              <div className="rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-black aspect-video w-full">
                <iframe src={`https://www.youtube.com/embed/${extractYouTubeId(session.url)}?autoplay=1&rel=0&modestbranding=1`} title="Transmisión en vivo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" />
              </div>
            )}
            {(session?.platform === 'zoom' || session?.platform === 'meet' || session?.platform === 'teams') && session?.url && (
              <ExternalLiveEmbed session={session} meta={meta} />
            )}
          </>
        )}
        {!session?.url && (
          <div className="rounded-2xl border border-yellow-800 bg-yellow-900/10 p-10 text-center text-yellow-400">
            <Wifi size={40} className="mx-auto mb-4 opacity-50" />
            <p className="font-semibold">La transmisión estará disponible en breve</p>
            <p className="text-sm opacity-70 mt-1">El administrador aún no ha configurado el enlace</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EDITOR DE PLANTILLA DE CERTIFICADO (Admin) ────────────────
// Control de posición/tamaño reutilizable
function SliderControl({ label, value, onChange, step = 1, min = 0, max = 800, unit = 'px' }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{label}</span>
        <span style={{ fontSize: '12px', color: '#fff', fontWeight: 'bold', fontFamily: 'monospace' }}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', cursor: 'pointer', accentColor: '#6366f1', height: '4px' }}
      />
    </div>
  );
}

function CertTemplateAdmin({ certTemplate, onSave }) {
  const [form, setForm] = useState({ ...DEFAULT_CERT_CONFIG, ...certTemplate });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [interactiveEdit, setInteractiveEdit] = useState(true);
  const [editScene, setEditScene] = useState(1); // 1, 2 o 3 firmas a editar
  const previewRef = useRef(null);

  useEffect(() => { setForm({ ...DEFAULT_CERT_CONFIG, ...certTemplate }); }, [certTemplate]);

  const DL2 = DEFAULT_CERT_CONFIG.layout;
  const sL = form.layout || {};
  const L = Object.keys(DL2).reduce((acc, key) => {
    if (typeof DL2[key] === 'object' && DL2[key] !== null) {
      acc[key] = { ...DL2[key], ...(sL[key] || {}) };
    } else {
      acc[key] = sL[key] !== undefined ? sL[key] : DL2[key];
    }
    return acc;
  }, {});
  const setL = (path, val) => {
    const keys = path.split('.');
    const next = JSON.parse(JSON.stringify(L));
    if (keys.length === 2) {
      if (!next[keys[0]]) next[keys[0]] = {};
      next[keys[0]][keys[1]] = val;
    } else next[keys[0]] = val;
    setForm(prev => ({ ...prev, layout: next }));
  };
  // Aplica varios cambios de layout a la vez (usado por el editor interactivo drag/resize).
  // Soporta paths de profundidad arbitraria, p.ej. 'signLayouts.2.sigs.0.x'.
  const setLBatch = (patch) => {
    setForm(prev => {
      // Clon profundo para no mutar estado previo
      const merged = JSON.parse(JSON.stringify(prev.layout || {}));
      Object.entries(patch).forEach(([path, val]) => {
        const keys = path.split('.');
        let node = merged;
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          if (node[k] === undefined || node[k] === null || typeof node[k] !== 'object') node[k] = {};
          node = node[k];
        }
        node[keys[keys.length - 1]] = val;
      });
      return { ...prev, layout: merged };
    });
  };

  const handleSave = async () => {
    setSaving(true); setSaveMsg('');
    try { await onSave(form); setSaveMsg('Configuracion guardada'); setTimeout(() => setSaveMsg(''), 3000); }
    catch (e) { setSaveMsg('Error: ' + e.message); }
    setSaving(false);
  };

  const handleImageUpload = async (field, file) => {
    if (!file) return;
    setUploading(field);
    try {
      const url = await uploadCertAsset(file, field);
      if (url) { const next = { ...form, [field]: url }; setForm(next); await onSave(next); setSaveMsg('Imagen subida'); setTimeout(() => setSaveMsg(''), 3000); }
    } catch (e) { setSaveMsg('Error: ' + e.message); }
    setUploading('');
  };

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const textFields = [
    { label: 'Encabezado linea 1', field: 'headerLine1' },
    { label: 'Encabezado linea 2', field: 'headerLine2' },
    { label: 'Texto de diploma', field: 'diplomaText' },
    { label: 'Junta Directiva', field: 'boardText' },
    { label: 'Texto "Con colegiado"', field: 'collegiateText' },
    { label: 'Texto "numero:"', field: 'numberText' },
    { label: 'Texto del curso', field: 'courseText' },
    { label: 'Prefijo horas', field: 'hoursPrefix' },
    { label: 'Sufijo horas', field: 'hoursSuffix' },
    { label: 'Lema', field: 'motto' },
  ];

  const imageFields = [
    { label: 'Logo CPG', field: 'logoCpgUrl', hint: 'PNG transparente' },
    { label: 'Logo CAEDUC', field: 'logoCaeducUrl', hint: 'PNG transparente' },
    { label: 'Firma', field: 'signatureUrl', hint: 'PNG transparente' },
    { label: 'Sello', field: 'sealUrl', hint: 'PNG transparente' },
    { label: 'Fondo (opcional)', field: 'backgroundUrl', hint: '1056x816px' },
  ];

  const [advTextOpen, setAdvTextOpen] = useState(false);
  const [advLogosOpen, setAdvLogosOpen] = useState(false);

  const getLayoutVal = (path) => {
    const keys = path.split('.');
    if (keys.length === 2) return L[keys[0]]?.[keys[1]] ?? 0;
    return L[keys[0]] ?? 0;
  };

  return (
    <div className="p-6 space-y-6">
      {saveMsg && (
        <div className={`rounded-lg px-4 py-2 text-sm font-semibold ${saveMsg.startsWith('Error') ? 'bg-red-900/30 border border-red-500/40 text-red-300' : 'bg-green-900/30 border border-green-700/40 text-green-300'}`}>
          {saveMsg}
        </div>
      )}

      {/* IMAGENES */}
      <div>
        <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2"><Image size={18} className="text-blue-400" /> Imagenes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {imageFields.map(({ label, field, hint }) => (
            <div key={field} className="bg-black/30 border border-gray-800 rounded-xl p-4">
              <p className="text-sm text-gray-400 mb-2 font-semibold">{label}</p>
              {form[field] ? (
                <div className="flex items-center gap-3 mb-2">
                  <img src={form[field]} alt={label} className="w-20 h-20 object-contain bg-white/10 rounded-lg border border-gray-700 p-1" />
                  <div className="flex-1">
                    <p className="text-xs text-green-400 mb-1">Imagen cargada</p>
                    <button onClick={() => { const next = { ...form, [field]: '' }; setForm(next); onSave(next); }} className="text-xs text-red-400 hover:text-red-300 transition">Eliminar</button>
                  </div>
                </div>
              ) : <p className="text-xs text-gray-600 mb-2">Sin imagen</p>}
              <label className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 px-3 py-2 rounded-lg cursor-pointer transition text-sm text-gray-300 hover:text-white w-fit">
                {uploading === field ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading === field ? 'Subiendo...' : 'Subir'}
                <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(field, e.target.files?.[0])} disabled={!!uploading} />
              </label>
              <p className="text-[11px] text-gray-600 mt-1.5">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* TEXTOS */}
      <div>
        <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2"><Type size={18} className="text-purple-400" /> Textos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {textFields.map(({ label, field }) => (
            <div key={field}>
              <label className="block text-sm text-gray-400 mb-1">{label}</label>
              <input type="text" value={form[field] || ''} onChange={e => updateField(field, e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" />
            </div>
          ))}
        </div>
      </div>

      {/* COORDINADOR */}
      <div>
        <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2"><UserCheck size={18} className="text-yellow-400" /> Coordinador/a CAEDUC</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nombre</label>
            <input type="text" value={form.coordinatorName || ''} onChange={e => updateField('coordinatorName', e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cargo</label>
            <input type="text" value={form.coordinatorTitle || ''} onChange={e => updateField('coordinatorTitle', e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" />
          </div>
        </div>
      </div>

      {/* PRESIDENTA */}
      <div>
        <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-2"><Shield size={18} className="text-pink-400" /> Presidenta Junta Directiva</h3>
        <p className="text-xs text-gray-500 mb-3">Su firma puede activarse individualmente en cada Acreditación Especial que generes.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nombre</label>
            <input type="text" value={form.presidenteName || ''} onChange={e => updateField('presidenteName', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="Lic./Mgtr. Nombre Completo" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cargo</label>
            <input type="text" value={form.presidenteTitle || ''} onChange={e => updateField('presidenteTitle', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="Presidenta Junta Directiva" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-2">Imagen de firma</label>
            <div className="flex items-center gap-3 flex-wrap">
              {form.presidenteSignatureUrl && (
                <img src={form.presidenteSignatureUrl} alt="Firma presidenta"
                  className="w-24 h-16 object-contain bg-white/10 rounded-lg border border-gray-700 p-1" />
              )}
              <label className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 px-3 py-2 rounded-lg cursor-pointer transition text-sm text-gray-300 hover:text-white">
                {uploading === 'presidenteSignatureUrl' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading === 'presidenteSignatureUrl' ? 'Subiendo...' : form.presidenteSignatureUrl ? 'Cambiar firma' : 'Subir firma PNG'}
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => handleImageUpload('presidenteSignatureUrl', e.target.files?.[0])}
                  disabled={!!uploading} />
              </label>
              {form.presidenteSignatureUrl && (
                <button onClick={() => { const next = { ...form, presidenteSignatureUrl: '' }; setForm(next); onSave(next); }}
                  className="text-xs text-red-400 hover:text-red-300 transition">Eliminar</button>
              )}
            </div>
            <p className="text-[11px] text-gray-600 mt-1.5">PNG con fondo transparente. Se guardará para usarla cuando elijas incluirla en acreditaciones.</p>
          </div>
        </div>
      </div>

      {/* EDITOR DE DISEÑO — preview en vivo + sliders */}
      <div>
        <button type="button" onClick={() => setLayoutOpen(p => !p)} className="w-full flex items-center justify-between bg-gradient-to-r from-indigo-900/40 to-purple-900/30 border border-indigo-700/50 rounded-xl px-5 py-3.5 hover:from-indigo-900/50 transition">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-indigo-400" />
            <span className="text-white font-bold">Editor de diseño del certificado</span>
            <span className="text-xs text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded-full">Vista en tiempo real</span>
          </div>
          <span className="text-gray-400">{layoutOpen ? '▲' : '▼'}</span>
        </button>

        {layoutOpen && (
          <div className="mt-3 bg-black/40 border border-gray-800 rounded-xl overflow-hidden">
            {/* Preview en vivo */}
            <div className="border-b border-gray-800 bg-gray-950 p-3">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <p className="text-[11px] text-gray-500 tracking-wide uppercase">Vista previa — arrastra firma, sello y QR para reposicionarlos · usa el círculo para redimensionar</p>
                <button
                  type="button"
                  onClick={() => setInteractiveEdit(p => !p)}
                  className={`text-[11px] font-bold px-3 py-1 rounded-full border transition ${interactiveEdit ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                >
                  {interactiveEdit ? '✓ Edición interactiva' : 'Activar edición interactiva'}
                </button>
              </div>

              {/* Selector de escenario: cuántas firmas simular para editar su layout */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[11px] text-gray-500 uppercase tracking-wide">Editar layout para:</span>
                {[1, 2, 3].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEditScene(n)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${editScene === n ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                  >
                    {n} {n === 1 ? 'firma' : 'firmas'}
                  </button>
                ))}
                {editScene > 1 && (
                  <span className="text-[11px] text-indigo-300/80 ml-1">
                    Arrastra cada firma, el sello y el QR. Este layout se usará cuando un certificado tenga {editScene} firmas.
                  </span>
                )}
              </div>

              <CertScaledPreview certRef={previewRef} imageLoaded={true} interactive={interactiveEdit}>
                <CertificateCanvas
                  certRef={previewRef} tpl={form} onImageLoaded={() => {}}
                  recipientName="Nombre Completo del Profesional"
                  statusText="ACTIVO" collegiateNumber="0000"
                  videoTitle="Nombre del Curso o Actividad de Capacitación"
                  videoDuration="2" dateFormatted="22 de marzo de 2026"
                  certificateCode="CPG-20260322-0000"
                  qrUrl={getCertQrUrl('CPG-20260322-0000')}
                  commissionsSnapshot={Array.from({ length: Math.max(0, editScene - 1) }, (_, i) => ({
                    commission_name: `Comisión de ejemplo ${i + 1}`,
                    signer_name: `Firmante ${i + 2}`,
                    signer_title: 'Cargo de la comisión',
                    signature_url: form.signatureUrl || '',
                    logo_url: form.logoCaeducUrl || '', // placeholder para visualizar el logo de comisión
                  }))}
                  interactive={interactiveEdit}
                  onLayoutChange={setLBatch}
                />
              </CertScaledPreview>
            </div>

            {/* Controles agrupados */}
            <div className="p-5 space-y-6">

              {/* — Zona de firmas (más importante) — */}
              <div>
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                  Firmas, Sello y QR
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <SliderControl label="Ancho de firma" value={getLayoutVal('signature.w')} min={150} max={500} step={5} onChange={v => setL('signature.w', v)} />
                  <SliderControl label="Altura de firma" value={getLayoutVal('signature.h')} min={40} max={180} step={5} onChange={v => setL('signature.h', v)} />
                  <SliderControl label="Tamaño de nombre (coordinador)" value={getLayoutVal('coordName.fontSize')} min={10} max={24} step={1} onChange={v => setL('coordName.fontSize', v)} />
                  <SliderControl label="Tamaño de cargo" value={getLayoutVal('coordTitle.fontSize')} min={8} max={20} step={1} onChange={v => setL('coordTitle.fontSize', v)} />
                  <SliderControl label="Espacio desde la parte inferior" value={getLayoutVal('bottomY')} min={10} max={120} step={2} onChange={v => setL('bottomY', v)} />
                  <SliderControl label="Ancho del sello" value={getLayoutVal('seal.w')} min={60} max={220} step={5} onChange={v => setL('seal.w', v)} />
                  <SliderControl label="Alto del sello" value={getLayoutVal('seal.h')} min={60} max={220} step={5} onChange={v => setL('seal.h', v)} />
                  <SliderControl label="Ancho del QR" value={getLayoutVal('qr.w')} min={60} max={180} step={5} onChange={v => setL('qr.w', v)} />
                  <SliderControl label="Alto del QR" value={getLayoutVal('qr.h')} min={60} max={180} step={5} onChange={v => setL('qr.h', v)} />
                </div>
              </div>

              {/* — Posiciones verticales de texto — */}
              <div>
                <button type="button" onClick={() => setAdvTextOpen(p => !p)} className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 hover:text-gray-200 transition">
                  <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
                  Posición y tamaño de textos {advTextOpen ? '▲' : '▼'}
                </button>
                {advTextOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    <SliderControl label="Encabezado — posición Y" value={getLayoutVal('header.top')} min={100} max={400} step={2} onChange={v => setL('header.top', v)} />
                    <SliderControl label="Encabezado — tamaño" value={getLayoutVal('header.fontSize')} min={12} max={36} step={1} onChange={v => setL('header.fontSize', v)} />
                    <SliderControl label="Nombre — posición Y" value={getLayoutVal('name.top')} min={200} max={500} step={2} onChange={v => setL('name.top', v)} />
                    <SliderControl label="Nombre — tamaño" value={getLayoutVal('name.fontSize')} min={20} max={54} step={1} onChange={v => setL('name.fontSize', v)} />
                    <SliderControl label="Colegiado — posición Y" value={getLayoutVal('collegiate.top')} min={250} max={550} step={2} onChange={v => setL('collegiate.top', v)} />
                    <SliderControl label="Colegiado — tamaño" value={getLayoutVal('collegiate.fontSize')} min={10} max={24} step={1} onChange={v => setL('collegiate.fontSize', v)} />
                    <SliderControl label="Título del curso — posición Y" value={getLayoutVal('courseTitle.top')} min={350} max={620} step={2} onChange={v => setL('courseTitle.top', v)} />
                    <SliderControl label="Título del curso — tamaño" value={getLayoutVal('courseTitle.fontSize')} min={14} max={36} step={1} onChange={v => setL('courseTitle.fontSize', v)} />
                    <SliderControl label="Horas — posición Y" value={getLayoutVal('hours.top')} min={400} max={680} step={2} onChange={v => setL('hours.top', v)} />
                    <SliderControl label="Lema — posición Y" value={getLayoutVal('motto.top')} min={430} max={700} step={2} onChange={v => setL('motto.top', v)} />
                    <SliderControl label="Fecha — posición Y" value={getLayoutVal('date.top')} min={460} max={730} step={2} onChange={v => setL('date.top', v)} />
                  </div>
                )}
              </div>

              {/* — Logos — */}
              <div>
                <button type="button" onClick={() => setAdvLogosOpen(p => !p)} className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 hover:text-gray-200 transition">
                  <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
                  Logos {advLogosOpen ? '▲' : '▼'}
                </button>
                {advLogosOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    <SliderControl label="Logo CPG — ancho" value={getLayoutVal('logoCpg.w')} min={80} max={500} step={10} onChange={v => setL('logoCpg.w', v)} />
                    <SliderControl label="Logo CPG — alto" value={getLayoutVal('logoCpg.h')} min={40} max={300} step={10} onChange={v => setL('logoCpg.h', v)} />
                    <SliderControl label="Logo CAEDUC — ancho" value={getLayoutVal('logoCaeduc.w')} min={80} max={400} step={10} onChange={v => setL('logoCaeduc.w', v)} />
                    <SliderControl label="Logo CAEDUC — alto" value={getLayoutVal('logoCaeduc.h')} min={40} max={250} step={10} onChange={v => setL('logoCaeduc.h', v)} />
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-gray-800">
                <button onClick={() => { if (confirm('Restaurar posiciones y tamaños al diseño original?')) setForm(prev => ({ ...prev, layout: { ...DEFAULT_CERT_CONFIG.layout } })); }} className="text-xs text-gray-500 hover:text-red-400 transition">
                  Restaurar diseño por defecto
                </button>
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold px-5 py-2 rounded-lg transition flex items-center gap-2 text-sm">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Guardar diseño
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTONES */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-800">
        <button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold px-6 py-2.5 rounded-lg transition flex items-center gap-2">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          Guardar todo
        </button>
      </div>
    </div>
  );
}

// ── GESTOR DE LOGOS DEL SITIO ──────────────────
function LogoManagerModal({ siteLogos, onSave, onClose }) {
  const [logos, setLogos] = useState({ ...DEFAULT_SITE_LOGOS, ...siteLogos });
  const [uploading, setUploading] = useState('');
  const [msg, setMsg] = useState('');

  const handleUpload = async (field, file) => {
    if (!file) return;
    setUploading(field);
    try {
      const url = await uploadCertAsset(file, 'site-' + field);
      if (url) {
        const next = { ...logos, [field]: url };
        setLogos(next);
        await onSave(next);
        setMsg('Logo actualizado');
        setTimeout(() => setMsg(''), 3000);
      }
    } catch (e) { setMsg('Error: ' + e.message); }
    setUploading('');
  };

  const handleReset = async (field, defaultVal) => {
    const next = { ...logos, [field]: defaultVal };
    setLogos(next);
    await onSave(next);
    setMsg('Logo restaurado al original');
    setTimeout(() => setMsg(''), 3000);
  };

  const fields = [
    { label: 'Logo CPG — Barra de navegación', field: 'navLogoCpg', default: '/logo-cpg-grande.png', desc: 'Se muestra arriba a la izquierda en todas las páginas' },
    { label: 'Logo CAEDUC — Barra de navegación', field: 'navLogoCaeduc', default: '/logo-caeduc.png', desc: 'Se muestra junto al logo CPG en la barra superior' },
    { label: 'Logo CPG — Pie de página', field: 'footerLogoCpg', default: '/logo-cpg-grande.png', desc: 'Se muestra en el footer del sitio' },
    { label: 'Logo CAEDUC — Pie de página', field: 'footerLogoCaeduc', default: '/logo-caeduc.png', desc: 'Se muestra en el footer junto al logo CPG' },
    { label: 'Logo CPG — Pantalla de inicio de sesión', field: 'loginLogoCpg', default: '/logo-cpg-grande.png', desc: 'Logo grande en la pantalla de login' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center px-4 py-10">
      <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2"><Image size={20} className="text-pink-400" /> Logos del sitio</h3>
            <p className="text-sm text-gray-400">Sube o cambia los logos que se muestran en la barra de navegación y el pie de página.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-6 overflow-y-auto max-h-[65vh] space-y-5">
          {msg && <div className="rounded-lg px-4 py-2 text-sm font-semibold bg-green-900/30 border border-green-700/40 text-green-300">{msg}</div>}
          {fields.map(({ label, field, desc, default: def }) => (
            <div key={field} className="bg-black/30 border border-gray-800 rounded-xl p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-white font-semibold">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
                <div className="flex items-center gap-3">
                  <img src={logos[field]} alt={label} className="w-16 h-16 object-contain bg-white/10 rounded-lg border border-gray-700 p-1" onError={e => { e.target.src = def; }} />
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 px-3 py-1.5 rounded-lg cursor-pointer transition text-xs text-gray-300 hover:text-white">
                      {uploading === field ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      {uploading === field ? 'Subiendo...' : 'Cambiar'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(field, e.target.files?.[0])} disabled={!!uploading} />
                    </label>
                    <button onClick={() => handleReset(field, def)} className="text-[10px] text-gray-600 hover:text-gray-400 transition">Restaurar original</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg font-semibold text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ── GESTOR DE PUBLICIDAD EN PORTADA ─────────────
function HomepagePromoManagerModal({ promo, onSave, onClose }) {
  const [form, setForm] = useState({ ...DEFAULT_HOMEPAGE_PROMO, ...(promo || {}) });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleUpload = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setMsg({ type: 'error', text: 'Selecciona un archivo de imagen válido.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'La imagen no debe superar 5 MB.' });
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      const url = await uploadHomepagePromoAsset(file);
      if (url) {
        setForm(prev => ({ ...prev, imageUrl: url }));
        setMsg({ type: 'success', text: 'Imagen cargada. Revisa la vista previa y guarda los cambios.' });
      }
    } catch (error) {
      setMsg({ type: 'error', text: error?.message || 'No se pudo cargar la imagen.' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const normalized = {
      active: Boolean(form.active),
      imageUrl: String(form.imageUrl || '').trim(),
      linkUrl: String(form.linkUrl || '').trim(),
      altText: String(form.altText || '').trim() || DEFAULT_HOMEPAGE_PROMO.altText,
    };
    if (normalized.active && !normalized.imageUrl) {
      setMsg({ type: 'error', text: 'Sube una imagen antes de activar la publicidad.' });
      return;
    }
    if (normalized.active && !isValidPublicUrl(normalized.linkUrl)) {
      setMsg({ type: 'error', text: 'Escribe un enlace válido que comience con https:// o http://.' });
      return;
    }
    if (normalized.linkUrl && !isValidPublicUrl(normalized.linkUrl)) {
      setMsg({ type: 'error', text: 'El enlace debe comenzar con https:// o http://.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await onSave(normalized);
      setForm(normalized);
      logAuditAuto('homepage_promo_saved', 'site_config', 'homepagePromo', { active: normalized.active });
      setMsg({ type: 'success', text: normalized.active ? 'Publicidad guardada y visible en la portada.' : 'Publicidad guardada y desactivada.' });
    } catch (error) {
      setMsg({ type: 'error', text: 'No se pudo guardar: ' + (error?.message || 'error desconocido') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-[70] flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="homepage-promo-title">
      <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 md:px-6 py-4 border-b border-gray-800">
          <div>
            <h3 id="homepage-promo-title" className="text-xl font-bold text-white flex items-center gap-2"><Image size={20} className="text-blue-400" /> Imagen de portada</h3>
            <p className="text-sm text-gray-400 mt-1">Publica una actividad con acceso directo a su página, inscripción o reunión de Zoom.</p>
          </div>
          <button type="button" onClick={onClose} className="min-w-11 min-h-11 -mr-2 -mt-2 flex items-center justify-center text-gray-400 hover:text-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" aria-label="Cerrar"><X size={20} /></button>
        </div>

        <div className="px-5 md:px-6 py-5 overflow-y-auto max-h-[72vh] space-y-5">
          {msg && (
            <div role="status" className={`rounded-xl px-4 py-3 text-sm font-semibold border ${msg.type === 'error' ? 'bg-red-900/20 border-red-700/50 text-red-200' : 'bg-emerald-900/20 border-emerald-700/50 text-emerald-200'}`}>
              {msg.text}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-800 bg-black/30 p-4">
            <div>
              <p className="text-white font-semibold">Mostrar publicidad en la portada</p>
              <p className="text-xs text-gray-500 mt-1">Puedes desactivarla sin perder la imagen ni el enlace.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              onClick={() => setForm(prev => ({ ...prev, active: !prev.active }))}
              className={`relative inline-flex h-11 w-[76px] shrink-0 items-center rounded-full border transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/60 ${form.active ? 'bg-emerald-600 border-emerald-400' : 'bg-gray-800 border-gray-600'}`}
            >
              <span className={`absolute text-[9px] font-bold uppercase tracking-wide ${form.active ? 'left-2 text-white' : 'right-2 text-gray-300'}`}>{form.active ? 'Activa' : 'Inactiva'}</span>
              <span className={`h-8 w-8 rounded-full bg-white shadow-lg transition-transform ${form.active ? 'translate-x-[40px]' : 'translate-x-1'}`} />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div>
                <label className="block text-sm font-semibold text-white">Imagen publicitaria</label>
                <p className="text-xs text-gray-500">Se ajusta completa dentro de un espacio fijo, sin recortar información. Recomendado: 1600 × 600 px.</p>
              </div>
              <label className="min-h-11 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white px-4 py-2 rounded-xl cursor-pointer transition text-sm font-semibold">
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? 'Subiendo…' : form.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="hidden" onChange={event => { handleUpload(event.target.files?.[0]); event.target.value = ''; }} disabled={uploading || saving} />
              </label>
            </div>
            <div className="relative w-full h-40 sm:h-52 overflow-hidden rounded-2xl border border-gray-700 bg-[#0d0d0d]">
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="Vista previa de la publicidad" className="h-full w-full object-contain bg-[#111]" />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2"><Image size={36} /><p className="text-sm">Aún no hay una imagen</p></div>
              )}
              <span className="absolute bottom-3 right-3 rounded-full border border-white/20 bg-black/75 px-4 py-2 text-xs font-bold text-white">Ver actividad</span>
            </div>
            {form.imageUrl && <button type="button" onClick={() => setForm(prev => ({ ...prev, imageUrl: '', active: false }))} className="mt-2 min-h-11 text-xs text-red-400 hover:text-red-300">Quitar imagen de la configuración</button>}
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="homepage-promo-url" className="block text-sm font-semibold text-white mb-1.5">Enlace de la actividad</label>
              <input id="homepage-promo-url" type="url" inputMode="url" value={form.linkUrl} onChange={event => setForm(prev => ({ ...prev, linkUrl: event.target.value }))} className="w-full min-h-11 bg-black border border-gray-700 rounded-xl px-3 py-2.5 text-white text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" placeholder="https://zoom.us/... o https://sitio-web.com/actividad" />
              <p className="text-xs text-gray-500 mt-1.5">Al tocar la imagen, este enlace se abrirá en una pestaña nueva.</p>
            </div>
            <div>
              <label htmlFor="homepage-promo-alt" className="block text-sm font-semibold text-white mb-1.5">Descripción accesible de la imagen</label>
              <input id="homepage-promo-alt" type="text" value={form.altText} onChange={event => setForm(prev => ({ ...prev, altText: event.target.value }))} maxLength={140} className="w-full min-h-11 bg-black border border-gray-700 rounded-xl px-3 py-2.5 text-white text-base focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" placeholder="Ej. Taller de intervención en crisis — 25 de agosto" />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 md:px-6 py-4 border-t border-gray-800 bg-black/20">
          <button type="button" onClick={onClose} disabled={saving || uploading} className="min-h-11 px-5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-semibold disabled:opacity-50">Cerrar</button>
          <button type="button" onClick={handleSave} disabled={saving || uploading} className="min-h-11 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 disabled:bg-emerald-900 disabled:cursor-wait">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// ██ VERIFICAR Y ACTIVAR CUENTAS DE USUARIOS                  ██
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// ██ BOTONES PERSONALIZABLES DEL NAV SUPERIOR                 ██
// ══════════════════════════════════════════════════════════════

// Catálogo de íconos disponibles para los botones del nav.
// Mapa nombre→componente; se exporta para reuso desde el render del nav.
const NAV_BUTTON_ICONS = {
  ExternalLink, CalendarDays, Award, Video, Mail, History, QrCode, Users,
  Radio, Wifi, Shield, Eye, Search, Image, KeyRound, Settings, Printer, Type, Upload,
};

// Paleta de colores disponibles (Tailwind classes — clase ya completa para evitar purge)
const NAV_BUTTON_COLORS = [
  { id: 'gray',    label: 'Gris (neutral)',  classes: 'text-gray-300 hover:text-white border-gray-600 hover:bg-gray-800' },
  { id: 'blue',    label: 'Azul',            classes: 'text-blue-300 hover:text-white border-blue-700 hover:bg-blue-900/40' },
  { id: 'emerald', label: 'Verde esmeralda', classes: 'text-emerald-300 hover:text-white border-emerald-700 hover:bg-emerald-900/40' },
  { id: 'amber',   label: 'Ámbar',           classes: 'text-amber-300 hover:text-white border-amber-700 hover:bg-amber-900/40' },
  { id: 'rose',    label: 'Rosa',            classes: 'text-rose-300 hover:text-white border-rose-700 hover:bg-rose-900/40' },
  { id: 'purple',  label: 'Morado',          classes: 'text-purple-300 hover:text-white border-purple-700 hover:bg-purple-900/40' },
  { id: 'cyan',    label: 'Cian',            classes: 'text-cyan-300 hover:text-white border-cyan-700 hover:bg-cyan-900/40' },
];

const getNavButtonColorClasses = (colorId) =>
  (NAV_BUTTON_COLORS.find(c => c.id === colorId) || NAV_BUTTON_COLORS[0]).classes;

function NavButtonsManager({ currentAdminRole, currentAdminEmail, onChange }) {
  const [buttons, setButtons] = useState([]);
  const [clickStats, setClickStats] = useState({}); // { button_key: { count, label, last } }
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ label: '', url: '', icon: 'ExternalLink', color: 'gray', target: '_blank', active: true });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const isSuperAdmin = currentAdminRole === 'super_admin';

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [btnsRes, statsRes] = await Promise.all([
        supabase.from('cpg_nav_buttons').select('*').order('display_order', { ascending: true }),
        supabase.from('cpg_button_clicks').select('*'),
      ]);
      setButtons(btnsRes.data || []);
      const map = {};
      (statsRes.data || []).forEach(s => { map[s.button_key] = s; });
      setClickStats(map);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <p className="text-gray-400">Solo los administradores con rol <span className="text-white font-bold">Super Admin</span> pueden gestionar los botones del menú.</p>
      </div>
    );
  }

  const resetForm = () => {
    setForm({ label: '', url: '', icon: 'ExternalLink', color: 'gray', target: '_blank', active: true });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (b) => {
    setForm({
      label: b.label || '', url: b.url || '',
      icon: b.icon || 'ExternalLink', color: b.color || 'gray',
      target: b.target || '_blank', active: b.active !== false,
    });
    setEditingId(b.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.label.trim() || !form.url.trim()) {
      setMsg({ type: 'error', text: 'Etiqueta y URL son obligatorios.' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        url: form.url.trim(),
        icon: form.icon,
        color: form.color,
        target: form.target,
        active: form.active,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        await supabase.from('cpg_nav_buttons').update(payload).eq('id', editingId);
        logAudit(currentAdminEmail, '', 'nav_button_updated', 'nav_button', editingId, payload);
      } else {
        const nextOrder = buttons.length > 0 ? Math.max(...buttons.map(b => b.display_order || 0)) + 1 : 1;
        await supabase.from('cpg_nav_buttons').insert({ ...payload, display_order: nextOrder });
        logAudit(currentAdminEmail, '', 'nav_button_created', 'nav_button', '', payload);
      }
      setMsg({ type: 'success', text: editingId ? 'Botón actualizado.' : 'Botón creado.' });
      setTimeout(() => setMsg(null), 2500);
      resetForm();
      await load();
      onChange?.();
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + (e?.message || e) });
    }
    setSaving(false);
  };

  const handleToggle = async (b) => {
    try {
      await supabase.from('cpg_nav_buttons').update({ active: !b.active, updated_at: new Date().toISOString() }).eq('id', b.id);
      logAudit(currentAdminEmail, '', 'nav_button_toggled', 'nav_button', b.id, { active: !b.active });
      await load();
      onChange?.();
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + e.message });
    }
  };

  const handleDelete = async (b) => {
    if (!confirm(`¿Eliminar el botón "${b.label}"?`)) return;
    try {
      await supabase.from('cpg_nav_buttons').delete().eq('id', b.id);
      logAudit(currentAdminEmail, '', 'nav_button_deleted', 'nav_button', b.id, { label: b.label });
      await load();
      onChange?.();
      setMsg({ type: 'success', text: 'Botón eliminado.' });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + e.message });
    }
  };

  const handleMove = async (b, direction) => {
    const sorted = [...buttons].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const idx = sorted.findIndex(x => x.id === b.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      await supabase.from('cpg_nav_buttons').update({ display_order: other.display_order }).eq('id', b.id);
      await supabase.from('cpg_nav_buttons').update({ display_order: b.display_order }).eq('id', other.id);
      await load();
      onChange?.();
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + e.message });
    }
  };

  // Preview en vivo del botón
  const FormIcon = NAV_BUTTON_ICONS[form.icon] || ExternalLink;
  const previewClasses = getNavButtonColorClasses(form.color);

  return (
    <div className="p-6 space-y-5">
      {msg && (
        <div className={`rounded-xl px-4 py-2.5 text-sm border flex items-start gap-2 ${
          msg.type === 'error' ? 'bg-red-900/20 border-red-700/40 text-red-300' :
          'bg-green-900/20 border-green-700/40 text-green-300'
        }`}>
          {msg.type === 'error' ? <XCircle size={15} className="mt-0.5 flex-shrink-0" /> : <CheckCircle size={15} className="mt-0.5 flex-shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="bg-cyan-900/15 border border-cyan-700/30 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <Settings size={15} className="text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-cyan-200/90 text-xs">
          <p className="font-semibold mb-0.5">Botones del menú superior</p>
          <p className="text-cyan-200/70">Los botones que crees aquí aparecerán en la <span className="text-white font-semibold">fila 2 del menú</span>, al lado del contador de reproducciones. Útil para agregar accesos al Congreso 2026, eventos, sitios externos, etc.</p>
        </div>
      </div>

      {/* ── Estadísticas de uso del menú (incluye los 4 botones fijos + custom) ── */}
      {(() => {
        const STATIC_LABELS = {
          'nav:avales_caeduc': 'Avales CAEDUC',
          'nav:creditos_academicos': 'Créditos Académicos',
          'nav:sitio_oficial': 'Sitio Oficial',
          'nav:mis_certificados': 'Mis Certificados',
        };
        const statsArr = Object.entries(clickStats)
          .map(([key, s]) => ({
            key,
            isCustom: key.startsWith('custom:'),
            label: s.label || STATIC_LABELS[key] || key,
            count: s.click_count || 0,
            last: s.last_clicked_at,
          }))
          .sort((a, b) => b.count - a.count);
        const total = statsArr.reduce((acc, s) => acc + s.count, 0);
        return (
          <div className="bg-gradient-to-br from-emerald-900/15 to-cyan-900/10 border border-emerald-700/30 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-600/80 p-1.5 rounded-lg"><Eye size={13} className="text-white" /></div>
                <div>
                  <h4 className="text-white font-bold text-sm">Estadísticas de uso del menú</h4>
                  <p className="text-[11px] text-gray-500">Clicks totales en cada botón del menú superior</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-emerald-300 font-bold text-lg leading-none">{total.toLocaleString('es-GT')}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">clicks totales</p>
              </div>
            </div>
            {statsArr.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">Aún no se han registrado clicks. Cuando alguien presione un botón del menú, aparecerá aquí.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-xs">
                  <thead className="bg-gray-900 text-gray-400 uppercase text-[10px]">
                    <tr>
                      <th className="text-left px-3 py-2">Botón</th>
                      <th className="text-left px-3 py-2">Tipo</th>
                      <th className="text-right px-3 py-2">Clicks</th>
                      <th className="text-left px-3 py-2">Último click</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsArr.map(s => (
                      <tr key={s.key} className="border-t border-gray-800/60 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 text-white font-medium">{s.label}</td>
                        <td className="px-3 py-2">
                          {s.isCustom
                            ? <span className="text-cyan-300 bg-cyan-900/30 px-1.5 py-0.5 rounded text-[10px] font-bold">Personalizado</span>
                            : <span className="text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Fijo</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-300 font-mono font-bold">{(s.count || 0).toLocaleString('es-GT')}</td>
                        <td className="px-3 py-2 text-gray-500">{s.last ? new Date(s.last).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-400">
          <span className="text-white font-bold">{buttons.filter(b => b.active).length}</span> activos ·{' '}
          <span className="text-gray-500">{buttons.length} en total</span>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-700 to-cyan-600 hover:from-cyan-600 hover:to-cyan-500 px-4 py-2 rounded-lg text-sm font-bold transition shadow-lg shadow-cyan-900/30"
          >
            <Plus size={15} /> Nuevo botón
          </button>
        )}
      </div>

      {/* ── Form crear/editar ── */}
      {showForm && (
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold text-lg">{editingId ? 'Editar botón' : 'Nuevo botón'}</h3>

          {/* Preview */}
          <div className="bg-black/40 border border-gray-700 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Vista previa</p>
            <span className={`inline-flex items-center gap-1 text-xs border px-3 py-1.5 rounded-full transition ${previewClasses}`}>
              <FormIcon size={12} /> {form.label || 'Etiqueta del botón'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Etiqueta <span className="text-red-400">*</span></label>
              <input
                value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="Ej. Congreso 2026"
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">URL <span className="text-red-400">*</span></label>
              <input
                value={form.url}
                onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="https://..."
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Color</label>
              <div className="grid grid-cols-7 gap-1.5">
                {NAV_BUTTON_COLORS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setForm({ ...form, color: c.id })}
                    title={c.label}
                    className={`h-9 rounded-lg border-2 transition flex items-center justify-center text-xs font-bold ${
                      form.color === c.id ? 'border-white scale-105' : 'border-transparent opacity-70 hover:opacity-100'
                    } ${c.classes.split(' ').filter(cl => cl.startsWith('text-')).join(' ')}`}
                  >
                    Aa
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Abrir en</label>
              <select
                value={form.target}
                onChange={e => setForm({ ...form, target: e.target.value })}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
              >
                <option value="_blank">Pestaña nueva</option>
                <option value="_self">Misma pestaña</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Ícono</label>
              <div className="bg-black/40 border border-gray-700 rounded-lg p-2 max-h-44 overflow-y-auto">
                <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
                  {Object.entries(NAV_BUTTON_ICONS).map(([name, IconComp]) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setForm({ ...form, icon: name })}
                      title={name}
                      className={`aspect-square rounded-lg flex items-center justify-center transition border ${
                        form.icon === name
                          ? 'bg-cyan-600/30 border-cyan-500 text-white'
                          : 'bg-gray-900/50 border-transparent text-gray-400 hover:text-white hover:bg-gray-800'
                      }`}
                    >
                      <IconComp size={16} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm({ ...form, active: e.target.checked })}
                  className="w-4 h-4 accent-cyan-500"
                />
                <span className="text-sm text-gray-300">Botón activo (visible en el menú)</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-lg transition flex items-center gap-2 text-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {editingId ? 'Guardar cambios' : 'Crear botón'}
            </button>
            <button
              onClick={resetForm}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista de botones existentes ── */}
      {loading ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          <Loader2 size={20} className="animate-spin mx-auto mb-2 text-cyan-500" />
          Cargando…
        </div>
      ) : buttons.length === 0 ? (
        <div className="bg-black/30 border border-gray-800 border-dashed rounded-2xl p-8 text-center">
          <Settings size={32} className="mx-auto mb-2 text-gray-600" />
          <p className="text-gray-400 text-sm font-semibold">No hay botones creados aún</p>
          <p className="text-gray-500 text-xs mt-1">Crea el primero para que aparezca en el menú superior.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...buttons]
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
            .map((b, idx, arr) => {
              const Icon = NAV_BUTTON_ICONS[b.icon] || ExternalLink;
              const colorClasses = getNavButtonColorClasses(b.color);
              return (
                <div key={b.id} className={`bg-[#1a1a1a] border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 transition ${!b.active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => handleMove(b, 'up')} disabled={idx === 0} className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20"><ChevronDown size={11} className="rotate-180" /></button>
                      <span className="text-[10px] text-gray-600 text-center font-mono">{b.display_order}</span>
                      <button onClick={() => handleMove(b, 'down')} disabled={idx === arr.length - 1} className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20"><ChevronDown size={11} /></button>
                    </div>

                    <span className={`inline-flex items-center gap-1 text-xs border px-3 py-1.5 rounded-full ${colorClasses}`}>
                      <Icon size={12} /> {b.label}
                    </span>
                    {(() => {
                      const stats = clickStats[`custom:${b.id}`];
                      const count = stats?.click_count || 0;
                      return (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md ${
                          count > 0 ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40' : 'bg-gray-800/60 text-gray-500 border border-gray-700/40'
                        }`} title={stats?.last_clicked_at ? `Último click: ${new Date(stats.last_clicked_at).toLocaleString('es-GT')}` : 'Sin clicks aún'}>
                          <Eye size={10} /> {count.toLocaleString('es-GT')} {count === 1 ? 'click' : 'clicks'}
                        </span>
                      );
                    })()}

                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 truncate font-mono">{b.url}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {b.target === '_blank' ? 'Abre en pestaña nueva' : 'Misma pestaña'}
                        {!b.active && ' · INACTIVO'}
                      </p>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(b)}
                        className="p-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 rounded-lg"
                        title="Editar"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleToggle(b)}
                        className={`p-1.5 rounded-lg ${b.active ? 'bg-orange-900/40 hover:bg-orange-800/60 text-orange-300' : 'bg-green-900/40 hover:bg-green-800/60 text-green-300'}`}
                        title={b.active ? 'Desactivar' : 'Activar'}
                      >
                        {b.active ? <XCircle size={13} /> : <CheckCircle size={13} />}
                      </button>
                      <button
                        onClick={() => handleDelete(b)}
                        className="p-1.5 bg-red-900/40 hover:bg-red-800/60 text-red-300 rounded-lg"
                        title="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ██ CAMBIAR CORREO REGISTRADO                                ██
// ══════════════════════════════════════════════════════════════
function EmailChangeManager({ currentAdminRole, currentAdminEmail }) {
  const [oldEmail, setOldEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [profileMatch, setProfileMatch] = useState(null); // { collegiate_number, name }
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  // ── Eliminar cuenta de usuario (typos / duplicados) ──
  const [delEmail, setDelEmail] = useState('');
  const [delClearProfile, setDelClearProfile] = useState(false);
  const [delConfirmOpen, setDelConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delMsg, setDelMsg] = useState(null);
  // Buscar por colegiado para revelar el correo real (el de la web va enmascarado)
  const [delLookup, setDelLookup] = useState('');
  const [delSearching, setDelSearching] = useState(false);
  const [delFound, setDelFound] = useState(null); // { collegiate_number, name, email }
  // ── Crear contraseña temporal ──
  const [tmpLookup, setTmpLookup] = useState('');
  const [tmpGenerating, setTmpGenerating] = useState(false);
  const [tmpResult, setTmpResult] = useState(null); // { email, password }
  const [tmpMsg, setTmpMsg] = useState(null);
  const [tmpCopied, setTmpCopied] = useState(false);

  // Genera una contraseña legible (evita caracteres ambiguos como 0/O, 1/l/I)
  const genTempPassword = () => {
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const pick = (set, n) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
    return `${pick(upper, 1)}${pick(lower, 3)}-${pick(digits, 4)}-${pick(lower, 3)}`;
  };

  const handleGenerateTemp = async () => {
    const v = tmpLookup.trim();
    if (!v) { setTmpMsg({ type: 'error', text: 'Escribe el número de colegiado o el correo del usuario.' }); return; }
    setTmpGenerating(true); setTmpMsg(null); setTmpResult(null); setTmpCopied(false);
    try {
      // Si es numérico, resolver el correo real a partir del número de colegiado
      let email = v.toLowerCase();
      if (/^\d+$/.test(v)) {
        const { data, error } = await supabase
          .from('cpg_user_profiles')
          .select('email, name, collegiate_number')
          .eq('collegiate_number', v)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!data?.email) { setTmpMsg({ type: 'error', text: 'No se encontró un correo registrado para ese colegiado.' }); setTmpGenerating(false); return; }
        email = data.email.toLowerCase();
      }
      const pwd = genTempPassword();
      const { data, error } = await supabase.rpc('set_temporary_password', { target_email: email, new_password: pwd });
      if (error) throw error;
      if (data?.success === false) {
        setTmpMsg({ type: 'error', text: data?.message || 'No se pudo asignar la contraseña temporal.' });
      } else {
        setTmpResult({ email, password: pwd });
        logAudit(currentAdminEmail, '', 'temp_password_set', 'user', email, {});
      }
    } catch (e) {
      setTmpMsg({ type: 'error', text: 'Error: ' + (e?.message || e) });
    }
    setTmpGenerating(false);
  };

  const copyTempPassword = async () => {
    if (!tmpResult?.password) return;
    try {
      await navigator.clipboard.writeText(tmpResult.password);
      setTmpCopied(true);
      setTimeout(() => setTmpCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  const handleDelLookup = async () => {
    const v = delLookup.trim();
    if (!v) { setDelMsg({ type: 'error', text: 'Escribe el número de colegiado o el correo.' }); return; }
    setDelSearching(true); setDelMsg(null); setDelFound(null);
    try {
      // Buscar por colegiado o por correo en el perfil
      const byNumber = /^\d+$/.test(v);
      let q = supabase.from('cpg_user_profiles').select('collegiate_number, name, email');
      q = byNumber ? q.eq('collegiate_number', v) : q.ilike('email', v);
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw error;
      if (data) {
        setDelFound(data);
        setDelEmail(data.email || '');
      } else {
        setDelMsg({ type: 'error', text: 'No se encontró perfil con ese colegiado/correo.' });
      }
    } catch (e) {
      setDelMsg({ type: 'error', text: 'Error buscando: ' + (e?.message || e) });
    }
    setDelSearching(false);
  };

  const isSuperAdmin = currentAdminRole === 'super_admin';

  const handleSearch = async () => {
    const raw = oldEmail.trim();
    const v = raw.toLowerCase();
    if (!v) { setMsg({ type: 'error', text: 'Ingresa el correo actual o el número de colegiado del usuario.' }); return; }
    setSearching(true); setMsg(null); setProfileMatch(null);
    try {
      // Si lo ingresado son solo dígitos, buscamos por número de colegiado;
      // de lo contrario, por correo.
      const byNumber = /^\d+$/.test(raw);
      let q = supabase.from('cpg_user_profiles').select('collegiate_number, name, email');
      q = byNumber ? q.eq('collegiate_number', raw) : q.ilike('email', v);
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw error;
      if (data) {
        setProfileMatch(data);
        // Al buscar por colegiado obtenemos el correo real registrado: lo fijamos
        // como "correo actual" para que el cambio funcione aunque el agremiado no lo recuerde.
        if (data.email) {
          setOldEmail(data.email);
        } else if (byNumber) {
          // Evita que el número de colegiado quede como "correo actual" y provoque un cambio inválido.
          setOldEmail('');
          setMsg({ type: 'error', text: 'El perfil fue encontrado, pero no tiene un correo electrónico registrado.' });
        }
      } else if (byNumber) {
        setMsg({ type: 'error', text: 'No se encontró ningún perfil con ese número de colegiado.' });
      } else {
        setMsg({ type: 'info', text: 'No encontramos perfil con ese correo en la tabla local. Aun así puedes intentar el cambio (puede que solo exista en Supabase Auth).' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error buscando: ' + (e?.message || e) });
    }
    setSearching(false);
  };

  const performChange = async () => {
    const oldE = oldEmail.trim().toLowerCase();
    const newE = newEmail.trim().toLowerCase();
    if (!oldE || !newE) {
      setMsg({ type: 'error', text: 'Ingresa ambos correos.' });
      setConfirmOpen(false);
      return;
    }
    if (oldE === newE) {
      setMsg({ type: 'error', text: 'El nuevo correo es igual al actual.' });
      setConfirmOpen(false);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newE)) {
      setMsg({ type: 'error', text: 'El nuevo correo no tiene formato válido.' });
      setConfirmOpen(false);
      return;
    }
    setSaving(true); setMsg(null);
    try {
      // El admin se deriva de la sesión autenticada dentro de la función (seguridad).
      const { data, error } = await supabase.rpc('change_user_email', {
        target_old_email: oldE,
        new_email: newE,
      });
      if (error) throw error;
      if (data?.success === false) {
        setMsg({ type: 'error', text: data?.message || 'No se pudo cambiar el correo.' });
      } else {
        setMsg({ type: 'success', text: data?.message || 'Correo cambiado correctamente.' });
        setOldEmail(''); setNewEmail(''); setProfileMatch(null);
        logAudit(currentAdminEmail, '', 'email_changed', 'user', oldE, { newEmail: newE });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + (e?.message || e) });
    }
    setSaving(false);
    setConfirmOpen(false);
  };

  const performDelete = async () => {
    const v = delEmail.trim().toLowerCase();
    if (!v) { setDelMsg({ type: 'error', text: 'Ingresa el correo de la cuenta a eliminar.' }); setDelConfirmOpen(false); return; }
    setDeleting(true); setDelMsg(null);
    try {
      const { data, error } = await supabase.rpc('delete_user_account', {
        target_email: v,
        p_clear_profile: delClearProfile,
      });
      if (error) throw error;
      if (data?.success === false) {
        setDelMsg({ type: 'error', text: data?.message || 'No se pudo eliminar la cuenta.' });
      } else {
        setDelMsg({ type: 'success', text: data?.message || 'Cuenta eliminada.' });
        logAudit(currentAdminEmail, '', 'user_account_deleted', 'user', v, { clearedProfile: delClearProfile });
        setDelEmail(''); setDelClearProfile(false); setDelLookup(''); setDelFound(null);
      }
    } catch (e) {
      setDelMsg({ type: 'error', text: 'Error: ' + (e?.message || e) });
    }
    setDeleting(false);
    setDelConfirmOpen(false);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Cambio de correo — solo Super Admin */}
      {isSuperAdmin && (<>
      <div className="flex items-start gap-3 bg-amber-900/15 border border-amber-700/30 rounded-xl px-4 py-3">
        <Shield size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-amber-200/90">
          <p className="font-semibold mb-0.5">Acción sensible</p>
          <p className="text-amber-200/70">El nuevo correo se activa automáticamente — el usuario podrá ingresar de inmediato con su contraseña actual y el nuevo correo. El cambio queda registrado en el audit log.</p>
        </div>
      </div>

      {/* Paso 1: Buscar usuario */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600/80 p-1.5 rounded-lg"><Search size={13} className="text-white" /></div>
          <h3 className="text-white font-semibold text-sm">1. Buscar usuario por correo o número de colegiado</h3>
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={oldEmail}
              onChange={e => { setOldEmail(e.target.value); setProfileMatch(null); setMsg(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="correo.actual@ejemplo.com  o  7881"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 outline-none"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !oldEmail.trim()}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-bold transition"
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
        </div>
        {profileMatch && (
          <div className="bg-emerald-900/15 border border-emerald-700/30 rounded-lg px-3 py-2 flex items-center gap-3">
            <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="text-white font-semibold">{profileMatch.name || '(sin nombre)'}</p>
              <p className="text-xs text-gray-400">Colegiado: <span className="text-gray-200 font-mono">{profileMatch.collegiate_number || '—'}</span></p>
              <p className="text-xs text-gray-400">Correo actual: <span className="text-gray-200">{profileMatch.email || '—'}</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Paso 2: Nuevo correo */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-600/80 p-1.5 rounded-lg"><Mail size={13} className="text-white" /></div>
          <h3 className="text-white font-semibold text-sm">2. Nuevo correo</h3>
        </div>
        <input
          type="email"
          value={newEmail}
          onChange={e => { setNewEmail(e.target.value); setMsg(null); }}
          placeholder="nuevo.correo@ejemplo.com"
          className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-emerald-500 outline-none"
        />
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={saving || !oldEmail.trim() || !newEmail.trim()}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-lg transition shadow-lg shadow-emerald-900/30"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
          Cambiar correo registrado
        </button>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm border flex items-start gap-2 ${
          msg.type === 'error' ? 'bg-red-900/20 border-red-700/40 text-red-300' :
          msg.type === 'success' ? 'bg-green-900/20 border-green-700/40 text-green-300' :
          'bg-blue-900/20 border-blue-700/40 text-blue-300'
        }`}>
          {msg.type === 'error' ? <XCircle size={16} className="mt-0.5 flex-shrink-0" /> :
           msg.type === 'success' ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" /> :
           <Mail size={16} className="mt-0.5 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
      </>)}

      {/* ─── CREAR CONTRASEÑA TEMPORAL (todos los administradores) ─── */}
      <div className={isSuperAdmin ? 'border-t border-gray-800 pt-5 mt-2' : ''}>
        <div className="flex items-center gap-2.5 mb-3">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-2 rounded-lg shadow-lg shadow-indigo-900/30"><KeyRound size={15} className="text-white" /></div>
          <div>
            <h3 className="text-white font-bold text-sm">Crear contraseña temporal</h3>
            <p className="text-[11px] text-gray-500">Para usuarios que no logran recuperar su contraseña</p>
          </div>
        </div>
        <div className="bg-indigo-900/10 border border-indigo-700/30 rounded-xl px-4 py-3 mb-3 flex items-start gap-2">
          <Shield size={15} className="text-indigo-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-indigo-200/80">
            Genera una contraseña provisional y compártela con el colegiado. Al iniciar sesión con ella, el aula virtual
            le pedirá <span className="text-white font-semibold">obligatoriamente crear una nueva contraseña</span> antes de entrar.
            No funciona con cuentas de administradores.
          </p>
        </div>
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wider">Número de colegiado o correo</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tmpLookup}
                onChange={e => { setTmpLookup(e.target.value); setTmpMsg(null); setTmpResult(null); }}
                onKeyDown={e => { if (e.key === 'Enter') handleGenerateTemp(); }}
                placeholder="Ej. 14846  o  correo@ejemplo.com"
                className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-indigo-500 outline-none"
              />
              <button onClick={handleGenerateTemp} disabled={tmpGenerating || !tmpLookup.trim()}
                className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-700 to-indigo-600 hover:from-indigo-600 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg text-sm font-bold transition whitespace-nowrap">
                {tmpGenerating ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Generar
              </button>
            </div>
          </div>

          {tmpResult && (
            <div className="bg-emerald-900/15 border border-emerald-700/30 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Contraseña temporal para <span className="text-emerald-300 break-all">{tmpResult.email}</span>:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/60 border border-emerald-700/40 rounded-lg px-3 py-2 text-emerald-200 font-mono text-base tracking-wide select-all break-all">{tmpResult.password}</code>
                <button onClick={copyTempPassword} className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap">
                  {tmpCopied ? <><CheckCircle size={13} className="text-emerald-400" /> Copiado</> : <><Copy size={13} /> Copiar</>}
                </button>
              </div>
              <p className="text-[11px] text-amber-300/90 mt-2">⚠️ Guarda y comparte esta contraseña ahora — no se volverá a mostrar. El usuario deberá cambiarla al ingresar.</p>
            </div>
          )}

          {tmpMsg && (
            <div className={`rounded-lg px-3 py-2 text-sm border flex items-start gap-2 ${
              tmpMsg.type === 'error' ? 'bg-red-900/20 border-red-700/40 text-red-300' : 'bg-blue-900/20 border-blue-700/40 text-blue-300'
            }`}>
              <XCircle size={15} className="mt-0.5 flex-shrink-0" /><span>{tmpMsg.text}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── ELIMINAR CUENTA DE USUARIO (typos / duplicados) — solo Super Admin ─── */}
      {isSuperAdmin && (
      <div className="border-t border-gray-800 pt-5 mt-2">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="bg-gradient-to-br from-red-600 to-red-800 p-2 rounded-lg shadow-lg shadow-red-900/30"><Trash2 size={15} className="text-white" /></div>
          <div>
            <h3 className="text-white font-bold text-sm">Eliminar cuenta de usuario</h3>
            <p className="text-[11px] text-gray-500">Para cuentas creadas con un correo mal escrito o duplicadas</p>
          </div>
        </div>
        <div className="bg-red-900/10 border border-red-700/30 rounded-xl px-4 py-3 mb-3 flex items-start gap-2">
          <XCircle size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-200/80">
            Elimina la cuenta de acceso (correo + contraseña) de un colegiado. Úsalo cuando alguien se registró con un correo
            equivocado. <span className="text-white font-semibold">Es irreversible</span> y la persona deberá registrarse de nuevo con su correo correcto.
            No se pueden eliminar cuentas de administradores por aquí.
          </p>
        </div>
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 space-y-3">
          {/* Buscar por colegiado/correo para revelar el correo real */}
          <div>
            <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wider">Buscar por colegiado o correo</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={delLookup}
                onChange={e => { setDelLookup(e.target.value); setDelMsg(null); }}
                onKeyDown={e => { if (e.key === 'Enter') handleDelLookup(); }}
                placeholder="Ej. 14846  o  correo@ejemplo.com"
                className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-red-500 outline-none"
              />
              <button onClick={handleDelLookup} disabled={delSearching || !delLookup.trim()}
                className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-bold transition">
                {delSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar
              </button>
            </div>
            {delFound && (
              <div className="mt-2 bg-emerald-900/15 border border-emerald-700/30 rounded-lg px-3 py-2 flex items-center gap-3">
                <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                <div className="flex-1 text-sm min-w-0">
                  <p className="text-white font-semibold truncate">{delFound.name || '(sin nombre)'} · No. {delFound.collegiate_number}</p>
                  <p className="text-xs text-gray-300 break-all">Correo real: <span className="font-mono text-emerald-300">{delFound.email}</span></p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wider">Correo de la cuenta a eliminar</label>
            <input
              type="email"
              value={delEmail}
              onChange={e => { setDelEmail(e.target.value); setDelMsg(null); }}
              placeholder="correo.mal.escrito@ejemplo.com"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-red-500 outline-none"
            />
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={delClearProfile} onChange={e => setDelClearProfile(e.target.checked)} className="w-4 h-4 accent-red-500 mt-0.5" />
            <span className="text-xs text-gray-300">Borrar también el perfil del colegiado <span className="text-amber-300">(necesario para que la persona pueda registrarse de nuevo — si no lo marcas, seguirá apareciendo "colegiado ya registrado")</span></span>
          </label>
          <button
            onClick={() => setDelConfirmOpen(true)}
            disabled={deleting || !delEmail.trim()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-lg transition shadow-lg shadow-red-900/30"
          >
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Eliminar cuenta
          </button>
        </div>
        {delMsg && (
          <div className={`mt-3 rounded-xl px-4 py-3 text-sm border flex items-start gap-2 ${
            delMsg.type === 'error' ? 'bg-red-900/20 border-red-700/40 text-red-300' : 'bg-green-900/20 border-green-700/40 text-green-300'
          }`}>
            {delMsg.type === 'error' ? <XCircle size={16} className="mt-0.5 flex-shrink-0" /> : <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />}
            <span>{delMsg.text}</span>
          </div>
        )}
      </div>
      )}

      {/* Modal de confirmación de ELIMINACIÓN */}
      {delConfirmOpen && (
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center px-4">
          <div className="bg-[#1a1a2e] border border-red-800/50 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-600 p-2.5 rounded-xl"><Trash2 size={18} className="text-white" /></div>
              <h3 className="text-white font-bold text-lg">¿Eliminar esta cuenta?</h3>
            </div>
            <div className="bg-black/40 border border-gray-700 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cuenta a eliminar</p>
              <p className="text-white font-mono text-sm break-all">{delEmail}</p>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              Esta acción <span className="text-red-300 font-semibold">no se puede deshacer</span>.
              {delClearProfile ? ' También se borrará el perfil del colegiado vinculado.' : ' El perfil del colegiado se conserva.'}
              {' '}La persona deberá registrarse de nuevo con su correo correcto.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDelConfirmOpen(false)} disabled={deleting} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition disabled:opacity-50">Cancelar</button>
              <button onClick={performDelete} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center px-4">
          <div className="bg-[#1a1a2e] border border-gray-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-amber-600/80 p-2.5 rounded-xl">
                <Shield size={18} className="text-white" />
              </div>
              <h3 className="text-white font-bold text-lg">Confirmar cambio de correo</h3>
            </div>
            <p className="text-sm text-gray-300 mb-4">Estás a punto de cambiar el correo registrado de:</p>
            <div className="bg-black/40 border border-gray-700 rounded-lg p-3 mb-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Actual</p>
              <p className="text-white font-mono text-sm break-all">{oldEmail}</p>
            </div>
            <div className="text-center my-2 text-gray-500">↓</div>
            <div className="bg-emerald-900/15 border border-emerald-700/40 rounded-lg p-3 mb-5">
              <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Nuevo</p>
              <p className="text-white font-mono text-sm break-all">{newEmail}</p>
            </div>
            <p className="text-xs text-gray-400 mb-5">La cuenta se activa automáticamente. El usuario podrá ingresar inmediatamente con su nueva dirección y la misma contraseña.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={performChange}
                disabled={saving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirmar cambio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserVerifyManager({ currentAdminRole }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  // Cola de cuentas Hotmail pendientes
  const [queueRows, setQueueRows] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  // Estado por fila (verifying/activating)
  const [rowState, setRowState] = useState({});

  const isSuperAdmin = currentAdminRole === 'super_admin';

  const loadQueue = useCallback(async () => {
    if (!supabase) return;
    setQueueLoading(true);
    try {
      const { data, error } = await supabase
        .from('cpg_email_verification_queue')
        .select('*')
        .is('activated_at', null)
        .order('created_at', { ascending: false });
      if (!error) setQueueRows(data || []);
    } catch {}
    setQueueLoading(false);
  }, []);

  useEffect(() => { if (isSuperAdmin) loadQueue(); }, [isSuperAdmin, loadQueue]);

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <p className="text-gray-400">Solo los administradores con rol <span className="text-white font-bold">Super Admin</span> pueden verificar y activar cuentas.</p>
      </div>
    );
  }

  const handleCheck = async () => {
    const trimmed = email.trim();
    if (!trimmed) { setStatus('Ingresa el correo del usuario.'); return; }
    setLoading(true); setStatus('Consultando...');
    try {
      const { data, error } = await supabase.rpc('check_user_status', { target_email: trimmed });
      if (error) { setStatus('Error: ' + error.message); }
      else { setStatus(data?.message || JSON.stringify(data)); }
    } catch (e) { setStatus('Error: ' + (e?.message || e)); }
    setLoading(false);
  };

  const handleActivate = async () => {
    const trimmed = email.trim();
    if (!trimmed) { setStatus('Ingresa el correo del usuario.'); return; }
    if (!confirm('¿Activar la cuenta de ' + trimmed + '?\nEsta acción confirma su correo sin necesidad de verificación.')) return;
    setLoading(true); setStatus('Activando...');
    try {
      const { data, error } = await supabase.rpc('activate_user_by_email', { target_email: trimmed });
      if (error) { setStatus('Error: ' + error.message); }
      else { setStatus(data?.message || 'Usuario activado.'); }
    } catch (e) { setStatus('Error: ' + (e?.message || e)); }
    setLoading(false);
  };

  // ── Acciones por fila de cola ──
  const setRow = (id, patch) => setRowState(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));

  const checkRow = async (row) => {
    setRow(row.id, { loading: 'check', status: 'Consultando…' });
    try {
      const { data, error } = await supabase.rpc('check_user_status', { target_email: row.email });
      setRow(row.id, { loading: null, status: error ? 'Error: ' + error.message : (data?.message || JSON.stringify(data)) });
    } catch (e) {
      setRow(row.id, { loading: null, status: 'Error: ' + (e?.message || e) });
    }
  };

  const activateRow = async (row) => {
    if (!confirm(`¿Activar la cuenta de ${row.email}?\nSe marcará como resuelta y desaparecerá de esta cola.`)) return;
    setRow(row.id, { loading: 'activate', status: 'Activando…' });
    try {
      const { data, error } = await supabase.rpc('activate_user_by_email', { target_email: row.email });
      if (error) {
        setRow(row.id, { loading: null, status: 'Error: ' + error.message });
        return;
      }
      // Marcar como resuelto en la cola
      const { data: { session } } = await supabase.auth.getSession();
      const adminEmail = session?.user?.email || 'admin';
      await supabase
        .from('cpg_email_verification_queue')
        .update({ activated_at: new Date().toISOString(), activated_by: adminEmail })
        .eq('id', row.id);
      // Quitar de la lista local
      setQueueRows(prev => prev.filter(r => r.id !== row.id));
    } catch (e) {
      setRow(row.id, { loading: null, status: 'Error: ' + (e?.message || e) });
    }
  };

  const dismissRow = async (row) => {
    if (!confirm(`¿Descartar ${row.email} de la cola?\nEsto solo lo quita de la lista (no toca la cuenta).`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const adminEmail = session?.user?.email || 'admin';
      await supabase
        .from('cpg_email_verification_queue')
        .update({ activated_at: new Date().toISOString(), activated_by: adminEmail, notes: 'Descartado sin activar' })
        .eq('id', row.id);
      setQueueRows(prev => prev.filter(r => r.id !== row.id));
    } catch {}
  };

  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  return (
    <div className="p-6 space-y-6">
      {/* ═══ Cola de cuentas problemáticas pendientes ═══ */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-2 rounded-lg shadow-lg shadow-amber-900/30">
              <Mail size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Cuentas pendientes de activación</h3>
              <p className="text-[11px] text-gray-500">Correos Hotmail / Outlook / Live / MSN que crearon cuenta y suelen no recibir el correo de verificación</p>
            </div>
          </div>
          <button
            onClick={loadQueue}
            disabled={queueLoading}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-full px-3 py-1.5 transition disabled:opacity-50"
            title="Recargar lista"
          >
            {queueLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Recargar
          </button>
        </div>

        {queueLoading ? (
          <div className="bg-black/30 border border-gray-800 rounded-xl px-4 py-8 text-center text-gray-500 text-sm">
            <Loader2 size={20} className="animate-spin mx-auto mb-2 text-amber-500" />
            Cargando cuentas pendientes…
          </div>
        ) : queueRows.length === 0 ? (
          <div className="bg-emerald-900/10 border border-emerald-700/30 rounded-xl px-4 py-6 text-center">
            <CheckCircle size={22} className="mx-auto mb-2 text-emerald-500" />
            <p className="text-emerald-300 text-sm font-semibold">No hay cuentas pendientes</p>
            <p className="text-emerald-200/60 text-xs mt-0.5">Cuando alguien con correo problemático cree una cuenta, aparecerá aquí.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queueRows.map(row => {
              const st = rowState[row.id] || {};
              return (
                <div key={row.id} className="bg-[#1a1a1a] border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 transition">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold text-sm truncate">{row.email}</p>
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 font-bold">{row.domain || 'pendiente'}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        {row.name && <span><span className="text-gray-400">Nombre:</span> {row.name}</span>}
                        {row.collegiate_number && <span><span className="text-gray-400">Colegiado:</span> {row.collegiate_number}</span>}
                        <span><span className="text-gray-400">Creado:</span> {fmtDate(row.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => checkRow(row)}
                        disabled={!!st.loading}
                        className="flex items-center gap-1 text-xs bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/50 text-blue-300 px-2.5 py-1.5 rounded-lg transition disabled:opacity-50 font-medium"
                        title="Verificar estado de la cuenta en Supabase"
                      >
                        {st.loading === 'check' ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                        Verificar
                      </button>
                      <button
                        onClick={() => activateRow(row)}
                        disabled={!!st.loading}
                        className="flex items-center gap-1 text-xs bg-green-900/40 hover:bg-green-800/60 border border-green-700/50 text-green-300 px-2.5 py-1.5 rounded-lg transition disabled:opacity-50 font-medium"
                        title="Activar cuenta manualmente y quitar de esta lista"
                      >
                        {st.loading === 'activate' ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
                        Activar
                      </button>
                      <button
                        onClick={() => dismissRow(row)}
                        disabled={!!st.loading}
                        className="flex items-center text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-white p-1.5 rounded-lg transition disabled:opacity-50"
                        title="Descartar de la cola (sin activar la cuenta)"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  {st.status && (
                    <div className={`mt-2 rounded-lg px-3 py-1.5 text-xs border ${
                      st.status.startsWith('Error') ? 'bg-red-900/20 border-red-700/40 text-red-300' :
                      st.status.includes('NO está') ? 'bg-yellow-900/20 border-yellow-700/40 text-yellow-300' :
                      (st.status.includes('activado') || st.status.includes('ya está activo') || st.status.includes('verificado')) ? 'bg-green-900/20 border-green-700/40 text-green-300' :
                      'bg-gray-900/30 border-gray-700/40 text-gray-400'
                    }`}>
                      {st.status}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ Búsqueda manual (para casos no-hotmail) ═══ */}
      <section className="border-t border-gray-800 pt-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="bg-blue-600/80 p-2 rounded-lg">
            <Search size={15} className="text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">Búsqueda manual</h3>
            <p className="text-[11px] text-gray-500">Verifica o activa cualquier correo, no solo los de la cola</p>
          </div>
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-400 mb-1">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setStatus(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleCheck(); }}
              placeholder="usuario@ejemplo.com"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 outline-none"
            />
          </div>
          <button
            onClick={handleCheck}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-bold transition"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Verificar
          </button>
          <button
            onClick={handleActivate}
            disabled={loading}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-bold transition"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />}
            Activar cuenta
          </button>
        </div>
        {status && (
          <div className={`mt-3 rounded-lg px-4 py-3 text-sm border ${
            status.startsWith('Error') ? 'bg-red-900/30 border-red-700 text-red-300' :
            status.includes('NO está') ? 'bg-yellow-900/30 border-yellow-700 text-yellow-300' :
            status.includes('activado') || status.includes('ya está activo') || status.includes('verificado') ? 'bg-green-900/30 border-green-700 text-green-300' :
            'bg-gray-800 border-gray-700 text-gray-300'
          }`}>
            {status}
          </div>
        )}
      </section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ██ GESTIÓN DE USUARIOS ADMINISTRATIVOS                      ██
// ══════════════════════════════════════════════════════════════
function AdminUsersManager({ currentAdminRole }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'admin' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showResetPw, setShowResetPw] = useState(null);
  const [newPw, setNewPw] = useState('');

  const isSuperAdmin = currentAdminRole === 'super_admin';

  const loadUsers = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('cpg_admin_users').select('*').order('created_at', { ascending: true });
      setUsers((data || []).filter(u => u.email?.toLowerCase().trim() !== SUPER_ADMIN_EMAIL));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const getAuthToken = async () => {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  const callEdge = async (body) => {
    const token = await getAuthToken();
    if (!token) throw new Error('No hay sesión activa');
    const res = await fetch(ADMIN_EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Error del servidor');
    return data;
  };

  const handleCreate = async () => {
    if (!form.email.trim()) { setError('El correo es obligatorio.'); return; }
    if (!form.password || form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    setSaving(true); setError('');
    try {
      await callEdge({ action: 'create', email: form.email.trim(), password: form.password, name: form.name.trim(), role: form.role });
      logAuditAuto('admin_created', 'admin_user', form.email.trim(), { name: form.name.trim(), role: form.role });
      setSuccessMsg('Administrador creado exitosamente');
      setTimeout(() => setSuccessMsg(''), 4000);
      setShowForm(false); setForm({ email: '', name: '', password: '', role: 'admin' });
      await loadUsers();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    setSaving(true); setError('');
    try {
      await callEdge({ action: 'update', id: editingUser.id, name: form.name.trim(), role: form.role, active: editingUser.active });
      logAuditAuto('admin_updated', 'admin_user', editingUser.email, { name: form.name.trim(), role: form.role });
      setSuccessMsg('Administrador actualizado');
      setTimeout(() => setSuccessMsg(''), 4000);
      setEditingUser(null); setForm({ email: '', name: '', password: '', role: 'admin' });
      await loadUsers();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleToggleActive = async (user) => {
    if (!confirm(user.active ? '¿Desactivar este administrador? No podrá iniciar sesión.' : '¿Reactivar este administrador?')) return;
    try {
      await callEdge({ action: 'update', id: user.id, active: !user.active });
      logAuditAuto('admin_toggled', 'admin_user', user.email, { active: !user.active });
      await loadUsers();
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (user) => {
    if (!confirm(`¿Eliminar a "${user.name || user.email}" como administrador? Esta acción no se puede deshacer.`)) return;
    try {
      await callEdge({ action: 'delete', id: user.id });
      logAuditAuto('admin_deleted', 'admin_user', user.email, { name: user.name || '' });
      setSuccessMsg('Administrador eliminado');
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadUsers();
    } catch (e) { setError(e.message); }
  };

  const handleResetPassword = async () => {
    if (!showResetPw || !newPw || newPw.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    setSaving(true); setError('');
    try {
      await callEdge({ action: 'reset_password', email: showResetPw.email, new_password: newPw });
      logAuditAuto('admin_password_reset', 'admin_user', showResetPw.email, {});
      setSuccessMsg('Contraseña actualizada para ' + showResetPw.email);
      setTimeout(() => setSuccessMsg(''), 4000);
      setShowResetPw(null); setNewPw('');
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const startEdit = (user) => {
    setEditingUser(user);
    setForm({ email: user.email, name: user.name, password: '', role: user.role });
    setShowForm(false);
    setError('');
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6 text-center">
        <Lock size={40} className="text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Solo los administradores con rol <span className="text-white font-bold">Super Admin</span> pueden gestionar usuarios.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2"><XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}<button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-white"><X size={14} /></button></div>}
      {successMsg && <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-300 flex items-center gap-2"><CheckCircle size={16} />{successMsg}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-gray-400">{users.filter(u => u.active).length} activos de {users.length} registrados</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingUser(null); setForm({ email: '', name: '', password: '', role: 'admin' }); setError(''); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-bold transition">
          <Plus size={16} /> Nuevo administrador
        </button>
      </div>

      {/* ── Formulario crear/editar ── */}
      {(showForm || editingUser) && (
        <div className="bg-black/40 border border-gray-800 rounded-xl p-5 mb-6">
          <h3 className="text-white font-bold text-lg mb-4">{editingUser ? 'Editar administrador' : 'Nuevo administrador'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Correo electrónico</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!!editingUser} className={`w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none ${editingUser ? 'opacity-60 cursor-not-allowed' : ''}`} placeholder="correo@ejemplo.com" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nombre completo</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Nombre del administrador" />
            </div>
            {!editingUser && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Contraseña inicial</label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Mínimo 6 caracteres" />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Rol</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none">
                <option value="admin">Administrador</option>
                <option value="super_admin">Super Administrador</option>
              </select>
              <p className="text-xs text-gray-600 mt-1">{form.role === 'super_admin' ? 'Puede gestionar otros administradores' : 'Acceso completo al panel, sin gestión de usuarios'}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={editingUser ? handleUpdate : handleCreate} disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold px-5 py-2 rounded-lg transition flex items-center gap-2 text-sm">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {editingUser ? 'Guardar cambios' : 'Crear administrador'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingUser(null); setError(''); }} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Modal cambiar contraseña ── */}
      {showResetPw && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center px-4">
          <div className="bg-[#141414] border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-2">Cambiar contraseña</h3>
            <p className="text-gray-400 text-sm mb-4">Para: <span className="text-white font-mono">{showResetPw.email}</span></p>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Nueva contraseña</label>
              <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setError(''); }} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleResetPassword} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold px-5 py-2 rounded-lg transition flex items-center gap-2 text-sm">{saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Cambiar contraseña</button>
              <button onClick={() => { setShowResetPw(null); setNewPw(''); setError(''); }} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabla de admins ── */}
      {loading && <div className="text-center py-10"><Loader2 size={28} className="animate-spin text-blue-400 mx-auto mb-3" /><p className="text-gray-400 text-sm">Cargando administradores...</p></div>}
      {!loading && users.length === 0 && <div className="text-center py-10 text-gray-500"><Users size={40} className="mx-auto mb-3 opacity-30" /><p>No hay administradores registrados.</p></div>}
      {!loading && users.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-3">Nombre</th>
                <th className="text-left px-4 py-3">Correo</th>
                <th className="text-left px-4 py-3">Rol</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Creado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={`border-t border-gray-800 hover:bg-gray-900/40 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-white font-medium">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${u.role === 'super_admin' ? 'bg-purple-900/40 text-purple-300 border border-purple-700/50' : 'bg-blue-900/40 text-blue-300 border border-blue-700/50'}`}>
                      {u.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${u.active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{new Date(u.created_at).toLocaleDateString('es-GT')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => startEdit(u)} className="p-1.5 bg-blue-900/40 hover:bg-blue-900/70 text-blue-300 rounded" title="Editar"><Edit2 size={13} /></button>
                      <button onClick={() => { setShowResetPw(u); setNewPw(''); setError(''); }} className="p-1.5 bg-yellow-900/40 hover:bg-yellow-900/70 text-yellow-300 rounded" title="Cambiar contraseña"><KeyRound size={13} /></button>
                      <button onClick={() => handleToggleActive(u)} className={`p-1.5 rounded ${u.active ? 'bg-orange-900/40 hover:bg-orange-900/70 text-orange-300' : 'bg-green-900/40 hover:bg-green-900/70 text-green-300'}`} title={u.active ? 'Desactivar' : 'Activar'}>
                        {u.active ? <XCircle size={13} /> : <CheckCircle size={13} />}
                      </button>
                      <button onClick={() => handleDelete(u)} className="p-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded" title="Eliminar"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 bg-gray-900/40 border border-gray-800 rounded-lg px-4 py-3">
        <p className="text-xs text-gray-500"><span className="text-purple-400 font-bold">Super Admin</span>: acceso completo + gestión de administradores. <span className="text-blue-400 font-bold">Admin</span>: acceso completo al panel sin gestión de usuarios.</p>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// ██ INFORME DE ESTADÍSTICAS DE USO                           ██
// ══════════════════════════════════════════════════════════════
// Cada item: { key, label, group, generator: async (ctx) => { sheetName, rows } }
// `ctx` contiene fetchedData (cacheado) y helpers
const STAT_GROUPS = [
  {
    id: 'aula_virtual',
    title: 'Aula Virtual',
    icon: 'Eye',
    color: 'blue',
    items: [
      { key: 'total_views', label: 'Total de reproducciones acumuladas', table: 'cpg_view_counts' },
      { key: 'total_users', label: 'Total de usuarios registrados', table: 'cpg_user_profiles' },
      { key: 'users_by_status', label: 'Usuarios por estado colegial (ACTIVO/INACTIVO)', table: 'cpg_user_profiles' },
      { key: 'users_by_month', label: 'Usuarios registrados por mes', table: 'cpg_user_profiles' },
      { key: 'hotmail_queue', label: 'Cuentas Hotmail/Outlook que requirieron activación manual', table: 'cpg_email_verification_queue' },
      { key: 'menu_clicks', label: 'Clicks por botón del menú superior', table: 'cpg_button_clicks' },
    ],
  },
  {
    id: 'videos',
    title: 'Videos del aula',
    icon: 'Video',
    color: 'purple',
    items: [
      { key: 'total_videos', label: 'Total de videos publicados', table: 'cpg_videos' },
      { key: 'videos_list', label: 'Lista completa de videos (título, categoría, reproducciones)', table: 'cpg_videos' },
      { key: 'top_videos', label: 'Top 20 videos más vistos', table: 'cpg_videos' },
      { key: 'videos_by_category', label: 'Cantidad de videos por categoría', table: 'cpg_videos' },
      { key: 'total_hours', label: 'Total de horas de contenido educativo', table: 'cpg_videos' },
    ],
  },
  {
    id: 'certs',
    title: 'Certificados emitidos',
    icon: 'Award',
    color: 'amber',
    items: [
      { key: 'total_certs', label: 'Total de certificados emitidos', table: 'cpg_certificates' },
      { key: 'certs_by_month', label: 'Certificados emitidos por mes', table: 'cpg_certificates' },
      { key: 'certs_by_type', label: 'Certificados por tipo (regular vs voluntariado)', table: 'cpg_certificates' },
      { key: 'certs_list', label: 'Lista completa de certificados emitidos', table: 'cpg_certificates' },
      { key: 'top_cert_videos', label: 'Top 20 cursos con más certificados', table: 'cpg_certificates' },
    ],
  },
  {
    id: 'activities',
    title: 'Actividades del calendario',
    icon: 'CalendarDays',
    color: 'rose',
    items: [
      { key: 'total_activities', label: 'Total de actividades creadas', table: 'cpg_activities' },
      { key: 'activities_list', label: 'Lista de actividades (título, fecha, modalidad)', table: 'cpg_activities' },
      { key: 'activities_by_month', label: 'Actividades por mes', table: 'cpg_activities' },
    ],
  },
  {
    id: 'live',
    title: 'Transmisiones en vivo',
    icon: 'Radio',
    color: 'red',
    items: [
      { key: 'total_live', label: 'Total de sesiones realizadas', table: 'cpg_live_sessions_log' },
      { key: 'live_list', label: 'Lista de sesiones (título, plataforma, fecha, asistentes)', table: 'cpg_live_sessions_log' },
      { key: 'live_by_platform', label: 'Sesiones por plataforma (YouTube/Zoom/Meet/Teams)', table: 'cpg_live_sessions_log' },
      { key: 'live_attendees', label: 'Asistentes únicos totales', table: 'cpg_live_attendance' },
    ],
  },
  {
    id: 'commissions',
    title: 'Comisiones acreditantes',
    icon: 'Users',
    color: 'emerald',
    items: [
      { key: 'commissions_list', label: 'Lista de comisiones configuradas', table: 'cpg_commissions' },
      { key: 'certs_by_commission', label: 'Certificados firmados por cada comisión', table: 'cpg_certificates' },
    ],
  },
  {
    id: 'admin',
    title: 'Acciones administrativas',
    icon: 'Shield',
    color: 'cyan',
    items: [
      { key: 'admin_actions', label: 'Acciones por admin', table: 'cpg_audit_log' },
      { key: 'admin_actions_by_type', label: 'Acciones por tipo', table: 'cpg_audit_log' },
    ],
  },
];

const STAT_GROUP_COLOR_CLASSES = {
  blue: { bg: 'from-blue-900/20 to-blue-900/5', border: 'border-blue-700/40', icon: 'bg-blue-600/80', text: 'text-blue-300' },
  purple: { bg: 'from-purple-900/20 to-purple-900/5', border: 'border-purple-700/40', icon: 'bg-purple-600/80', text: 'text-purple-300' },
  amber: { bg: 'from-amber-900/20 to-amber-900/5', border: 'border-amber-700/40', icon: 'bg-amber-600/80', text: 'text-amber-300' },
  rose: { bg: 'from-rose-900/20 to-rose-900/5', border: 'border-rose-700/40', icon: 'bg-rose-600/80', text: 'text-rose-300' },
  red: { bg: 'from-red-900/20 to-red-900/5', border: 'border-red-700/40', icon: 'bg-red-600/80', text: 'text-red-300' },
  emerald: { bg: 'from-emerald-900/20 to-emerald-900/5', border: 'border-emerald-700/40', icon: 'bg-emerald-600/80', text: 'text-emerald-300' },
  cyan: { bg: 'from-cyan-900/20 to-cyan-900/5', border: 'border-cyan-700/40', icon: 'bg-cyan-600/80', text: 'text-cyan-300' },
};

function UsageStatsReport() {
  // Por defecto todo seleccionado (informe completo)
  const defaultSelected = useMemo(() => {
    const sel = {};
    STAT_GROUPS.forEach(g => g.items.forEach(it => { sel[it.key] = true; }));
    return sel;
  }, []);
  const [selected, setSelected] = useState(defaultSelected);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const toggleStat = (key) => setSelected(s => ({ ...s, [key]: !s[key] }));
  const toggleGroup = (groupId, value) => {
    const grp = STAT_GROUPS.find(g => g.id === groupId);
    setSelected(s => {
      const next = { ...s };
      grp.items.forEach(it => { next[it.key] = value; });
      return next;
    });
  };
  const selectAll = (value) => {
    setSelected(s => {
      const next = { ...s };
      STAT_GROUPS.forEach(g => g.items.forEach(it => { next[it.key] = value; }));
      return next;
    });
  };

  const groupAllSelected = (groupId) => {
    const grp = STAT_GROUPS.find(g => g.id === groupId);
    return grp.items.every(it => selected[it.key]);
  };
  const totalSelected = Object.values(selected).filter(Boolean).length;

  // ───────── Constructores de hojas ─────────
  // Cada generador recibe ctx con los datasets ya cacheados.
  const buildSheets = async () => {
    const sheets = [];
    setProgress('Cargando datos…');

    // Helper: fetch with optional date filter on a column
    const fetchTable = async (table, dateCol = null) => {
      let q = supabase.from(table).select('*');
      if (dateCol && dateFrom) q = q.gte(dateCol, dateFrom + 'T00:00:00');
      if (dateCol && dateTo) q = q.lte(dateCol, dateTo + 'T23:59:59');
      const { data } = await q;
      return data || [];
    };

    // Fetch del set de admins reales (para filtrar acciones administrativas)
    const adminListResp = await supabase.from('cpg_admin_users').select('email');
    const adminEmails = new Set((adminListResp.data || []).map(a => (a.email || '').toLowerCase().trim()));
    // Incluir super admin del código
    adminEmails.add('lic.juanreyesr@gmail.com');

    // Videos + activities viven en cpg_content (JSONB en una sola fila id=1)
    const contentResp = await supabase.from('cpg_content').select('videos, activities').eq('id', 1).single();
    const videos = contentResp.data?.videos || [];
    const activities = contentResp.data?.activities || [];

    // Carga paralela del resto
    const [
      certificates, liveSessions, liveAttendance,
      commissions, userProfiles, viewCounts, hotmailQueue, buttonClicks, auditLog,
    ] = await Promise.all([
      fetchTable('cpg_certificates', 'issued_at'),
      fetchTable('cpg_live_sessions_log', 'started_at'),
      fetchTable('cpg_live_attendance', 'joined_at'),
      fetchTable('cpg_commissions'),
      fetchTable('cpg_user_profiles', 'created_at'),
      fetchTable('cpg_video_views'), // ← nombre real de la tabla
      fetchTable('cpg_email_verification_queue', 'created_at'),
      fetchTable('cpg_button_clicks'),
      fetchTable('cpg_audit_log', 'created_at'),
    ]);
    // Filtrar audit log a solo admins reales (igual que el visor)
    const auditLogClean = auditLog.filter(l => adminEmails.has((l.admin_email || '').toLowerCase().trim()));
    setProgress('Construyendo informe…');

    // ── PORTADA ──
    const now = new Date();
    const periodo = (dateFrom || dateTo) ? `${dateFrom || '(inicio)'} a ${dateTo || '(hoy)'}` : 'Todo el histórico';
    const totalReproducciones = viewCounts.reduce((acc, v) => acc + (v.view_count || 0), 0);
    sheets.push({
      sheetName: 'Portada',
      rows: [
        ['INFORME DE USO — AULA VIRTUAL CPG'],
        [],
        ['Colegio de Psicólogos de Guatemala'],
        ['Comisión de Acreditación y Educación Continua (CAEDUC)'],
        [],
        ['Generado', now.toLocaleString('es-GT')],
        ['Período', periodo],
        ['Total de estadísticas incluidas', totalSelected],
        [],
        ['Resumen rápido'],
        ['Reproducciones acumuladas', totalReproducciones],
        ['Videos publicados', videos.filter(v => !v.scheduledAt || new Date(v.scheduledAt + 'T00:00:00') <= new Date()).length],
        ['Total de certificados emitidos', certificates.length],
        ['Actividades programadas', activities.length],
        ['Sesiones en vivo realizadas', liveSessions.length],
        ['Usuarios registrados', userProfiles.length],
        ['Comisiones acreditantes activas', commissions.filter(c => c.active).length],
        ['Acciones admin (limpias)', auditLogClean.length],
      ],
    });

    // ── Helper para reducir contador por mes ──
    const groupByMonth = (rows, dateField) => {
      const counts = {};
      rows.forEach(r => {
        const d = r[dateField];
        if (!d) return;
        const key = d.slice(0, 7); // YYYY-MM
        counts[key] = (counts[key] || 0) + 1;
      });
      return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    };

    // ─────── AULA VIRTUAL ───────
    if (selected.total_views) {
      const total = viewCounts.reduce((acc, v) => acc + (v.view_count || 0), 0);
      sheets.push({ sheetName: 'Reproducciones', rows: [
        ['Total de reproducciones acumuladas'],
        ['Total', total],
      ]});
    }
    if (selected.total_users) {
      sheets.push({ sheetName: 'Total usuarios', rows: [
        ['Total de usuarios registrados'],
        ['Total', userProfiles.length],
      ]});
    }
    if (selected.users_by_status) {
      // El estado del colegiado no se guarda en cpg_user_profiles (viene del API).
      // Derivar del campo `status` de los certificados emitidos: para cada
      // colegiado, su última emisión refleja su estado más reciente conocido.
      const lastStatusByCol = {};
      [...certificates]
        .sort((a, b) => new Date(a.issued_at) - new Date(b.issued_at))
        .forEach(c => { if (c.collegiate_number) lastStatusByCol[c.collegiate_number] = c.status; });
      const byStatus = {};
      Object.values(lastStatusByCol).forEach(s => {
        const k = s || 'DESCONOCIDO';
        byStatus[k] = (byStatus[k] || 0) + 1;
      });
      sheets.push({ sheetName: 'Usuarios por estado', rows: [
        ['Nota', 'Estado derivado de la última emisión de certificado por colegiado'],
        [],
        ['Estado', 'Cantidad de colegiados'],
        ...Object.entries(byStatus).sort(([, a], [, b]) => b - a),
      ]});
    }
    if (selected.users_by_month) {
      sheets.push({ sheetName: 'Usuarios por mes', rows: [
        ['Mes', 'Usuarios nuevos'],
        ...groupByMonth(userProfiles, 'created_at'),
      ]});
    }
    if (selected.hotmail_queue) {
      const total = hotmailQueue.length;
      const pendientes = hotmailQueue.filter(q => !q.activated_at).length;
      const activadas = hotmailQueue.filter(q => q.activated_at).length;
      sheets.push({ sheetName: 'Cola Hotmail', rows: [
        ['Resumen'],
        ['Total ingresadas a la cola', total],
        ['Activadas manualmente', activadas],
        ['Pendientes', pendientes],
        [],
        ['Detalle'],
        ['Correo', 'Colegiado', 'Nombre', 'Dominio', 'Creado', 'Activado el', 'Activado por'],
        ...hotmailQueue.map(q => [q.email, q.collegiate_number, q.name, q.domain, q.created_at, q.activated_at || '—', q.activated_by || '—']),
      ]});
    }
    if (selected.menu_clicks) {
      const STATIC_LABELS = {
        'nav:avales_caeduc': 'Avales CAEDUC',
        'nav:creditos_academicos': 'Créditos Académicos',
        'nav:sitio_oficial': 'Sitio Oficial',
        'nav:mis_certificados': 'Mis Certificados',
      };
      sheets.push({ sheetName: 'Clicks del menú', rows: [
        ['Botón', 'Tipo', 'Clicks', 'Último click'],
        ...buttonClicks
          .map(b => [b.label || STATIC_LABELS[b.button_key] || b.button_key, b.button_key.startsWith('custom:') ? 'Personalizado' : 'Fijo', b.click_count, b.last_clicked_at])
          .sort((a, b) => (b[2] || 0) - (a[2] || 0)),
      ]});
    }

    // ─────── VIDEOS ───────
    const viewMap = {};
    viewCounts.forEach(v => { viewMap[v.video_id] = v.view_count || 0; });
    const videosWithViews = videos.map(v => ({ ...v, _views: viewMap[v.id] || 0 }));

    if (selected.total_videos) {
      sheets.push({ sheetName: 'Total videos', rows: [
        ['Resumen de videos'],
        ['Total registrados', videos.length],
        ['Publicados (visibles)', videos.filter(v => !v.scheduledAt || new Date(v.scheduledAt + 'T00:00:00') <= new Date()).length],
        ['Programados (futuros)', videos.filter(v => v.scheduledAt && new Date(v.scheduledAt + 'T00:00:00') > new Date()).length],
      ]});
    }
    if (selected.videos_list) {
      sheets.push({ sheetName: 'Lista de videos', rows: [
        ['Título', 'Categoría', 'Duración (h)', 'Plataforma', 'Programado para', 'Reproducciones'],
        ...videosWithViews.map(v => [v.title, v.category, v.duration, v.platform || 'youtube', v.scheduledAt || '(inmediato)', v._views]),
      ]});
    }
    if (selected.top_videos) {
      sheets.push({ sheetName: 'Top 20 más vistos', rows: [
        ['#', 'Título', 'Categoría', 'Reproducciones'],
        ...videosWithViews.sort((a, b) => b._views - a._views).slice(0, 20).map((v, i) => [i + 1, v.title, v.category, v._views]),
      ]});
    }
    if (selected.videos_by_category) {
      const byCat = {};
      videos.forEach(v => { byCat[v.category] = (byCat[v.category] || 0) + 1; });
      sheets.push({ sheetName: 'Videos por categoría', rows: [
        ['Categoría', 'Cantidad de videos'],
        ...Object.entries(byCat).sort(([, a], [, b]) => b - a),
      ]});
    }
    if (selected.total_hours) {
      const total = videos.reduce((acc, v) => acc + (Number(v.duration) || 0), 0);
      sheets.push({ sheetName: 'Horas de contenido', rows: [
        ['Total horas de contenido educativo'],
        ['Total horas', total.toFixed(2)],
        ['Total videos contabilizados', videos.filter(v => Number(v.duration) > 0).length],
      ]});
    }

    // ─────── CERTIFICADOS ───────
    if (selected.total_certs) {
      sheets.push({ sheetName: 'Total certificados', rows: [
        ['Resumen de certificados emitidos'],
        ['Total emitidos', certificates.length],
        ['Regulares (videos)', certificates.filter(c => c.cert_type !== 'volunteer').length],
        ['Voluntariado/Especiales', certificates.filter(c => c.cert_type === 'volunteer').length],
      ]});
    }
    if (selected.certs_by_month) {
      sheets.push({ sheetName: 'Certs por mes', rows: [
        ['Mes', 'Certificados emitidos'],
        ...groupByMonth(certificates, 'issued_at'),
      ]});
    }
    if (selected.certs_by_type) {
      sheets.push({ sheetName: 'Certs por tipo', rows: [
        ['Tipo', 'Cantidad'],
        ['Regular (de videos)', certificates.filter(c => c.cert_type !== 'volunteer').length],
        ['Voluntariado/Especial', certificates.filter(c => c.cert_type === 'volunteer').length],
      ]});
    }
    if (selected.certs_list) {
      sheets.push({ sheetName: 'Lista de certificados', rows: [
        ['Código', 'Colegiado', 'Nombre', 'Estado colegial', 'Tipo', 'Video/Título', 'Duración', 'Emitido'],
        ...certificates.map(c => [c.certificate_code, c.collegiate_number, c.recipient_name, c.status, c.cert_type === 'volunteer' ? 'Voluntariado' : 'Regular', c.video_title, c.video_duration, c.issued_at]),
      ]});
    }
    if (selected.top_cert_videos) {
      const byVideo = {};
      certificates.forEach(c => { const t = c.video_title || '(sin título)'; byVideo[t] = (byVideo[t] || 0) + 1; });
      sheets.push({ sheetName: 'Top 20 cursos certificados', rows: [
        ['#', 'Curso / Título', 'Certificados emitidos'],
        ...Object.entries(byVideo).sort(([, a], [, b]) => b - a).slice(0, 20).map(([t, c], i) => [i + 1, t, c]),
      ]});
    }

    // ─────── ACTIVIDADES ───────
    if (selected.total_activities) {
      sheets.push({ sheetName: 'Total actividades', rows: [
        ['Total de actividades en el calendario'],
        ['Total', activities.length],
      ]});
    }
    if (selected.activities_list) {
      sheets.push({ sheetName: 'Lista de actividades', rows: [
        ['Título', 'Organizador', 'Fecha', 'Hora', 'Horas', 'Lugar', 'Costo', 'Comisión(es)'],
        ...activities.map(a => [
          a.title || '',
          a.organizer || '',
          a.date || '',
          a.time || '',
          a.horas || '',
          a.location || '',
          a.costType === 'free' ? 'Gratuito' : (a.cost ? `Q${a.cost}` : ''),
          a.hasCommissions ? 'Sí' : 'No',
        ]),
      ]});
    }
    if (selected.activities_by_month) {
      sheets.push({ sheetName: 'Actividades por mes', rows: [
        ['Mes', 'Cantidad'],
        ...groupByMonth(activities.map(a => ({ _d: a.date })), '_d'),
      ]});
    }

    // ─────── LIVE SESSIONS ───────
    if (selected.total_live) {
      sheets.push({ sheetName: 'Total live', rows: [
        ['Total de transmisiones realizadas'],
        ['Total', liveSessions.length],
        ['Total asistentes (suma)', liveSessions.reduce((acc, l) => acc + (l.attendee_count || 0), 0)],
      ]});
    }
    if (selected.live_list) {
      sheets.push({ sheetName: 'Lista de live', rows: [
        ['Título', 'Plataforma', 'Inicio', 'Fin', 'Asistentes'],
        ...liveSessions.map(l => [l.title, l.platform, l.started_at, l.ended_at, l.attendee_count || 0]),
      ]});
    }
    if (selected.live_by_platform) {
      const byPlat = {};
      liveSessions.forEach(l => { byPlat[l.platform] = (byPlat[l.platform] || 0) + 1; });
      sheets.push({ sheetName: 'Live por plataforma', rows: [
        ['Plataforma', 'Sesiones'],
        ...Object.entries(byPlat).sort(([, a], [, b]) => b - a),
      ]});
    }
    if (selected.live_attendees) {
      const uniqueCol = new Set(liveAttendance.map(a => a.collegiate_number));
      sheets.push({ sheetName: 'Asistentes live', rows: [
        ['Total registros de asistencia', liveAttendance.length],
        ['Asistentes únicos (por colegiado)', uniqueCol.size],
      ]});
    }

    // ─────── COMISIONES ───────
    if (selected.commissions_list) {
      sheets.push({ sheetName: 'Comisiones', rows: [
        ['Comisión', 'Firmante', 'Cargo', 'Activa'],
        ...commissions.map(c => [c.commission_name, c.signer_name, c.signer_title, c.active ? 'Sí' : 'No']),
      ]});
    }
    if (selected.certs_by_commission) {
      const byComm = {};
      certificates.forEach(c => {
        (c.commissions_snapshot || []).forEach(comm => {
          const k = comm.commission_name || '(sin nombre)';
          byComm[k] = (byComm[k] || 0) + 1;
        });
      });
      sheets.push({ sheetName: 'Certs por comisión', rows: [
        ['Comisión', 'Certificados firmados'],
        ...Object.entries(byComm).sort(([, a], [, b]) => b - a),
      ]});
    }

    // ─────── ACCIONES ADMIN ───────
    if (selected.admin_actions) {
      const byAdmin = {};
      auditLogClean.forEach(l => { byAdmin[l.admin_email] = (byAdmin[l.admin_email] || 0) + 1; });
      sheets.push({ sheetName: 'Acciones por admin', rows: [
        ['Nota', 'Solo se contabilizan administradores registrados en cpg_admin_users'],
        [],
        ['Admin', 'Acciones'],
        ...Object.entries(byAdmin).sort(([, a], [, b]) => b - a),
      ]});
    }
    if (selected.admin_actions_by_type) {
      const byAction = {};
      auditLogClean.forEach(l => { byAction[l.action] = (byAction[l.action] || 0) + 1; });
      sheets.push({ sheetName: 'Acciones por tipo', rows: [
        ['Nota', 'Solo se contabilizan acciones de admins reales'],
        [],
        ['Tipo de acción', 'Cantidad'],
        ...Object.entries(byAction).sort(([, a], [, b]) => b - a),
      ]});
    }

    return sheets;
  };

  const handleGenerate = async () => {
    if (totalSelected === 0) { alert('Selecciona al menos una estadística.'); return; }
    setGenerating(true); setProgress('Iniciando…');
    try {
      const sheets = await buildSheets();
      const ts = new Date().toISOString().slice(0, 10);
      exportXLSXMultiSheet(sheets, `Informe_Aula_Virtual_CPG_${ts}.xlsx`);
      setProgress('');
    } catch (e) {
      alert('Error generando informe: ' + (e?.message || e));
    }
    setGenerating(false);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Banner */}
      <div className="flex items-start gap-3 bg-gradient-to-r from-indigo-900/20 to-purple-900/15 border border-indigo-700/30 rounded-xl px-4 py-3">
        <Download size={18} className="text-indigo-300 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-indigo-200/90">
          <p className="font-semibold mb-0.5">Informe de uso para auditoría</p>
          <p className="text-indigo-200/70">Selecciona las estadísticas que necesites incluir y descarga un archivo Excel con una hoja por categoría. Útil para reportes anuales, justificación de uso, métricas de impacto.</p>
        </div>
      </div>

      {/* Filtros + acción global */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Período — desde (opcional)</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Hasta (opcional)</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:border-indigo-500 outline-none" />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => selectAll(true)}
              className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg transition"
            >
              Marcar todas
            </button>
            <button
              onClick={() => selectAll(false)}
              className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg transition"
            >
              Limpiar
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-500">
          <span className="text-white font-bold">{totalSelected}</span> estadísticas seleccionadas
          {(dateFrom || dateTo) && (
            <span className="ml-2 text-indigo-300">· Período: {dateFrom || '(inicio)'} → {dateTo || '(hoy)'}</span>
          )}
        </p>
      </div>

      {/* Grid de grupos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {STAT_GROUPS.map(group => {
          const IconComp = NAV_BUTTON_ICONS[group.icon] || Eye;
          const cls = STAT_GROUP_COLOR_CLASSES[group.color] || STAT_GROUP_COLOR_CLASSES.blue;
          const allSel = groupAllSelected(group.id);
          return (
            <div key={group.id} className={`bg-gradient-to-br ${cls.bg} border ${cls.border} rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`${cls.icon} p-1.5 rounded-lg flex-shrink-0`}>
                    <IconComp size={13} className="text-white" />
                  </div>
                  <h4 className="text-white font-semibold text-sm truncate">{group.title}</h4>
                </div>
                <button
                  onClick={() => toggleGroup(group.id, !allSel)}
                  className={`text-[10px] uppercase tracking-wider font-bold transition ${cls.text} hover:text-white`}
                >
                  {allSel ? 'Quitar' : 'Marcar'} todo
                </button>
              </div>
              <div className="space-y-1.5">
                {group.items.map(item => (
                  <label key={item.key} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!selected[item.key]}
                      onChange={() => toggleStat(item.key)}
                      className="mt-0.5 w-3.5 h-3.5 accent-indigo-500 flex-shrink-0"
                    />
                    <span className="text-xs text-gray-300 group-hover:text-white transition leading-snug">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Acción descargar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {progress && <span className="text-xs text-gray-400">{progress}</span>}
        <button
          onClick={handleGenerate}
          disabled={generating || totalSelected === 0}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-xl text-sm transition shadow-lg shadow-indigo-900/40"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {generating ? 'Generando…' : `Descargar informe XLSX (${totalSelected})`}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ██ VISOR DE LOG DE AUDITORÍA                                ██
// ══════════════════════════════════════════════════════════════
function AuditLogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAdmin, setFilterAdmin] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [limit, setLimit] = useState(50);
  // Set de correos de admins reales — usado para filtrar el log y descartar
  // registros antiguos contaminados (cuando usuarios regulares emitían certs
  // y se logueaban como admins por error).
  const [adminEmails, setAdminEmails] = useState(null);

  const loadAdmins = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('cpg_admin_users').select('email');
      const set = new Set((data || []).map(a => (a.email || '').toLowerCase().trim()));
      // Incluir al super admin que no está en la tabla pero sí es admin real
      set.add(SUPER_ADMIN_EMAIL);
      setAdminEmails(set);
    } catch { setAdminEmails(new Set()); }
  }, []);

  const loadLogs = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // Traer un poco más del límite para filtrar luego por admins reales sin quedarnos cortos
      const fetchLimit = Math.max(limit * 3, 200);
      let query = supabase.from('cpg_audit_log').select('*').order('created_at', { ascending: false }).limit(fetchLimit);
      if (filterAdmin) query = query.ilike('admin_email', '%' + filterAdmin + '%');
      if (filterAction) query = query.eq('action', filterAction);
      if (filterDate) {
        query = query.gte('created_at', filterDate + 'T00:00:00').lte('created_at', filterDate + 'T23:59:59');
      }
      const { data } = await query;
      let filtered = data || [];
      // Filtrar a solo admins registrados (descarta usuarios regulares que aparecieron en logs viejos)
      if (adminEmails && adminEmails.size > 0) {
        filtered = filtered.filter(l => adminEmails.has((l.admin_email || '').toLowerCase().trim()));
      }
      setLogs(filtered.slice(0, limit));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadAdmins(); }, [loadAdmins]);
  useEffect(() => { if (adminEmails !== null) loadLogs(); }, [filterAdmin, filterAction, filterDate, limit, adminEmails]);

  const actionLabels = {
    login: '🔑 Inicio de sesión',
    logout: '🚪 Cierre de sesión',
    video_created: '🎬 Video creado',
    video_updated: '✏️ Video editado',
    video_deleted: '🗑️ Video eliminado',
    activity_created: '📅 Actividad creada',
    activity_updated: '✏️ Actividad editada',
    activity_deleted: '🗑️ Actividad eliminada',
    live_started: '🔴 Transmisión iniciada',
    live_ended: '⏹️ Transmisión finalizada',
    live_updated: '📡 Transmisión actualizada',
    cert_emitted: '📜 Certificado emitido',
    cert_bulk_emitted: '📜 Certificados masivos',
    cert_deleted: '🗑️ Certificado eliminado',
    cert_template_saved: '🎨 Plantilla editada',
    site_logos_saved: '🖼️ Logos actualizados',
    admin_created: '👤 Admin creado',
    admin_updated: '✏️ Admin editado',
    admin_toggled: '🔄 Admin activado/desactivado',
    admin_deleted: '🗑️ Admin eliminado',
    admin_password_reset: '🔐 Contraseña cambiada',
    sistema_inicializado: '⚙️ Sistema inicializado',
  };
  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const actionColor = (action) => {
    if (action.includes('delete') || action.includes('deleted')) return 'text-red-400';
    if (action.includes('create') || action.includes('created') || action.includes('emitted')) return 'text-green-400';
    if (action.includes('login')) return 'text-blue-400';
    if (action.includes('live')) return 'text-red-300';
    return 'text-gray-300';
  };

  const exportCSV = () => {
    if (!logs.length) return;
    const rows = [
      ['Fecha/Hora', 'Admin', 'Email Admin', 'Acción', 'Recurso', 'ID Recurso', 'Detalles'],
      ...logs.map(l => [
        new Date(l.created_at).toLocaleString('es-GT'),
        l.admin_name,
        l.admin_email,
        actionLabels[l.action] || l.action,
        l.resource_type,
        l.resource_id,
        JSON.stringify(l.details || {}),
      ])
    ];
    exportXLSX(rows, 'audit-log-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };

  return (
    <div className="p-6">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-500 pointer-events-none" />
          <input type="text" value={filterAdmin} onChange={e => setFilterAdmin(e.target.value)} placeholder="Filtrar por admin..." className="w-full bg-black border border-gray-700 rounded-lg pl-8 pr-4 py-2 text-sm text-white focus:border-blue-500 outline-none" />
        </div>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none">
          <option value="">Todas las acciones</option>
          {uniqueActions.map(a => <option key={a} value={a}>{actionLabels[a] || a}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
        <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none">
          <option value={50}>50 registros</option>
          <option value={100}>100 registros</option>
          <option value={200}>200 registros</option>
          <option value={500}>500 registros</option>
        </select>
        <button onClick={() => { setFilterAdmin(''); setFilterAction(''); setFilterDate(''); }} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-300 transition">Limpiar</button>
        <button onClick={loadLogs} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-300 transition flex items-center gap-1"><Loader2 size={12} className={loading ? 'animate-spin' : ''} /> Actualizar</button>
        {logs.length > 0 && <button onClick={exportCSV} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg text-xs font-semibold transition"><Download size={12} /> XLSX</button>}
      </div>

      {/* Stats rápidos */}
      {logs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-400">{logs.length}</p>
            <p className="text-xs text-gray-400">Eventos mostrados</p>
          </div>
          <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-400">{new Set(logs.map(l => l.admin_email)).size}</p>
            <p className="text-xs text-gray-400">Admins activos</p>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-yellow-400">{logs.filter(l => l.action === 'login').length}</p>
            <p className="text-xs text-gray-400">Sesiones</p>
          </div>
          <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-purple-400">{logs.filter(l => l.action.includes('cert')).length}</p>
            <p className="text-xs text-gray-400">Acciones de certs.</p>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading && <div className="text-center py-10"><Loader2 size={28} className="animate-spin text-blue-400 mx-auto mb-3" /><p className="text-gray-400 text-sm">Cargando log...</p></div>}
      {!loading && logs.length === 0 && <div className="text-center py-10 text-gray-500"><History size={40} className="mx-auto mb-3 opacity-30" /><p>No hay eventos registrados{filterAdmin || filterAction || filterDate ? ' con estos filtros' : ''}.</p></div>}
      {!loading && logs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-800 max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3">Fecha/Hora</th>
                <th className="text-left px-4 py-3">Administrador</th>
                <th className="text-left px-4 py-3">Acción</th>
                <th className="text-left px-4 py-3">Recurso</th>
                <th className="text-left px-4 py-3">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-t border-gray-800 hover:bg-gray-900/40">
                  <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-white text-xs font-medium">{l.admin_name || '—'}</div>
                    <div className="text-gray-500 text-[10px] font-mono">{l.admin_email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold ${actionColor(l.action)}`}>
                      {actionLabels[l.action] || l.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">
                    {l.resource_type}{l.resource_id ? ` #${l.resource_id}` : ''}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate" title={JSON.stringify(l.details)}>
                    {l.details && Object.keys(l.details).length > 0
                      ? Object.entries(l.details).map(([k, v]) => `${k}: ${v}`).join(', ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ADMIN DASHBOARD ───────────────────────────────
function AdminDashboard({ videos, viewCounts, totalViews, activities, liveSession, onSaveLiveSession, onVideosChange, onActivitiesChange, onGenerateCertificate, certTemplate, onSaveCertConfig, siteLogos, onSaveSiteLogos, homepagePromo, onSaveHomepagePromo, adminRole, commissions = [], currentAdminEmail = '', onNavButtonsChange = null }) {
  const [editingVideo, setEditingVideo] = useState(null);
  const [manualCertVideo, setManualCertVideo] = useState(null);
  const [manualProfile, setManualProfile] = useState({ name: '', collegiateNumber: '', status: '' });
  const [lookingUpStatus, setLookingUpStatus] = useState(false);
  const [showLiveSection, setShowLiveSection] = useState(false);
  const [showActivitiesSection, setShowActivitiesSection] = useState(false);
  const [showCertsSection, setShowCertsSection] = useState(false);
  const [showCertTemplateSection, setShowCertTemplateSection] = useState(false);
  const [showLogoManager, setShowLogoManager] = useState(false);
  const [showHomepagePromoManager, setShowHomepagePromoManager] = useState(false);
  const [showAdminUsersSection, setShowAdminUsersSection] = useState(false);
  const [showUserVerifySection, setShowUserVerifySection] = useState(false);
  const [showEmailChangeSection, setShowEmailChangeSection] = useState(false);
  const [showNavButtonsSection, setShowNavButtonsSection] = useState(false);
  const [showVolunteerCertSection, setShowVolunteerCertSection] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState({});
  const [showAllVideos, setShowAllVideos] = useState(false);
  const [volunteerReprintCert, setVolunteerReprintCert] = useState(null); // registro completo a reimprimir
  const [volunteerAutoDownload, setVolunteerAutoDownload] = useState(false); // descarga directa sin abrir editor
  const volunteerSectionRef = useRef(null);
  const [showAuditLogSection, setShowAuditLogSection] = useState(false);
  const [showStatsReportSection, setShowStatsReportSection] = useState(false);
  const [showBulkCert, setShowBulkCert] = useState(false);
  const [showAttendanceReport, setShowAttendanceReport] = useState(false);
  const [showCommissionsSection, setShowCommissionsSection] = useState(false);
  const [certsData, setCertsData] = useState([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [certsLoaded, setCertsLoaded] = useState(false);
  const [certsFilter, setCertsFilter] = useState('');
  const [certsDateMode, setCertsDateMode] = useState('month'); // 'month' | 'range' | 'all'
  const [certsDateMonth, setCertsDateMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [certsDateStart, setCertsDateStart] = useState('');
  const [certsDateEnd, setCertsDateEnd] = useState('');
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [saveError, setSaveError] = useState('');
  const [editingActivity, setEditingActivity] = useState(null);
  const [activityError, setActivityError] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportRange, setReportRange] = useState({ start: '', end: '' });
  const [reportError, setReportError] = useState('');
  // ── CAMBIO 4+5: formData incluye platform ──
  const [formData, setFormData] = useState({ title: '', category: '', youtubeId: '', duration: '', description: '', thumbnail: '', scheduledAt: '', quizEnabled: false, platform: 'youtube' });
  const [questions, setQuestions] = useState([]);
  const [quizImportText, setQuizImportText] = useState('');
  const [quizImportMessage, setQuizImportMessage] = useState('');
  const EMPTY_ACTIVITY_FORM = { title: '', organizer: '', date: '', time: '', horas: '', location: '', registrationLink: '', meetingLink: '', isFull: false, participants: '', costType: 'free', cost: '', scholarshipPct: '', scholarshipAmt: '', hasCommissions: false, commissions: [] };
  const [activityForm, setActivityForm] = useState(EMPTY_ACTIVITY_FORM);
  const [syncMsg, setSyncMsg] = useState('');
  const [verifyStatusLoading, setVerifyStatusLoading] = useState(false);
  const [verifyStatusMsg, setVerifyStatusMsg] = useState('');

  // Verifica y actualiza el estado CPG de los certificados filtrados que no están como ACTIVO
  const verifyFilteredStatus = async () => {
    if (!supabase || verifyStatusLoading) return;
    // Replicar la misma lógica de filtrado de la vista
    const dateFiltered = certsData.filter(c => {
      const d = new Date(c.issued_at);
      if (certsDateMode === 'month' && certsDateMonth) {
        const [y, m] = certsDateMonth.split('-').map(Number);
        return d.getFullYear() === y && (d.getMonth() + 1) === m;
      }
      if (certsDateMode === 'range') {
        if (certsDateStart && d < new Date(certsDateStart + 'T00:00:00')) return false;
        if (certsDateEnd && d > new Date(certsDateEnd + 'T23:59:59')) return false;
      }
      return true;
    });
    const filtered = certsFilter
      ? dateFiltered.filter(c => {
          const q = certsFilter.toLowerCase();
          return c.collegiate_number?.includes(q) || c.recipient_name?.toLowerCase().includes(q) || c.video_title?.toLowerCase().includes(q);
        })
      : dateFiltered;
    // Solo los que NO son ACTIVO y tienen número válido
    const toVerify = filtered.filter(c => c.status !== 'ACTIVO' && c.collegiate_number && c.collegiate_number !== '0000' && c.collegiate_number !== '100000');
    if (toVerify.length === 0) {
      setVerifyStatusMsg('✓ Todos los certificados filtrados ya están ACTIVO');
      setTimeout(() => setVerifyStatusMsg(''), 4000);
      return;
    }
    setVerifyStatusLoading(true);
    setVerifyStatusMsg(`Verificando ${toVerify.length} certificado(s)...`);
    // Agrupar por collegiate_number para no hacer llamadas duplicadas
    const uniqueNums = [...new Set(toVerify.map(c => c.collegiate_number))];
    let updated = 0;
    for (const num of uniqueNums) {
      try {
        const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: String(num).trim() }) });
        const cpgData = await res.json();
        const newStatus = String(cpgData?.status || cpgData?.estatus || '').toUpperCase().trim();
        if (newStatus && newStatus !== 'DESCONOCIDO') {
          await supabase.from('cpg_certificates').update({ status: newStatus }).eq('collegiate_number', num).neq('status', newStatus);
          updated++;
        }
      } catch {}
    }
    // Recargar la tabla
    setCertsLoaded(false);
    try {
      const allCerts = await fetchAllCerts();
      setCertsData(allCerts);
      setCertsLoaded(true);
      setVerifyStatusMsg(`✓ ${updated} colegiado(s) actualizados`);
    } catch (err) {
      setVerifyStatusMsg(`Error al recargar certificados: ${err.message}`);
    } finally {
      setVerifyStatusLoading(false);
    }
    setTimeout(() => setVerifyStatusMsg(''), 5000);
  };

  // Backfill: actualiza video_duration y video_title en certificados que tienen horas vacías
  const syncCertHours = React.useCallback(async (showMsg = false) => {
    if (!supabase || !videos.length) return;
    try {
      const allSources = [
        ...videos.filter(v => v.duration).map(v => ({ id: String(v.id), title: v.title || '', duration: String(v.duration) })),
        ...activities.filter(a => a.horas).map(a => ({ id: String(a.id), title: a.title || '', duration: String(a.horas) })),
      ];
      let updated = 0;
      for (const src of allSources) {
        const { error } = await supabase
          .from('cpg_certificates')
          .update({ video_duration: src.duration, video_title: src.title })
          .eq('video_id', src.id)
          .or('video_duration.is.null,video_duration.eq.');
        if (!error) updated++;
      }
      if (showMsg) { setSyncMsg(`✓ Sincronizado: ${updated} actividades/videos procesados`); setTimeout(() => setSyncMsg(''), 4000); }
    } catch (e) { if (showMsg) { setSyncMsg('Error al sincronizar: ' + e.message); setTimeout(() => setSyncMsg(''), 5000); } }
  }, [videos, activities]);

  // Ejecutar backfill automáticamente al abrir el panel
  React.useEffect(() => { syncCertHours(false); }, [syncCertHours]);

  const handleCollegiateBlur = async () => {
    const num = manualProfile.collegiateNumber.trim();
    if (!num || num.length < 3) return;
    setLookingUpStatus(true);
    try {
      const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: num }) });
      const data = await res.json();
      if (data?.estatus && data.estatus !== 'DESCONOCIDO') {
        setManualProfile(prev => ({ ...prev, status: data.estatus, name: prev.name || data.nombre || '' }));
      }
    } catch {}
    setLookingUpStatus(false);
  };

  // ── CAMBIO 5: handleEdit preserva platform ──
  const handleEdit = (video) => {
    setSaveError('');
    setQuizImportText('');
    setQuizImportMessage('');
    setEditingVideo(video);
    setFormData({ ...video, scheduledAt: video.scheduledAt || '', thumbnail: video.thumbnail || '', platform: video.platform || 'youtube', hasCommissions: !!video.hasCommissions, commissions: video.commissions || [] });
    const normalizedQuestions = normalizeLegacyQuizQuestions(video.questions || []);
    const editableQuestions = video.quizEnabled && normalizedQuestions.length === 0 ? createEmptyQuestions() : normalizedQuestions;
    setQuestions(editableQuestions.map(q => ({ ...q, options: [...(q.options || [])] })));
  };
  // ── CAMBIO 5: handleCreate con platform default ──
  const handleCreate = () => { setSaveError(''); setQuizImportText(''); setQuizImportMessage(''); const e = { id: Date.now(), title: '', category: '', youtubeId: '', duration: '', description: '', thumbnail: '', scheduledAt: '', quizEnabled: false, viewCount: 0, platform: 'youtube', hasCommissions: false, commissions: [] }; setEditingVideo(e); setFormData(e); setQuestions(createEmptyQuestions()); };
  const updateQuestion = useCallback((idx, updater) => { setQuestions(prev => prev.map((q, i) => i !== idx ? q : updater(q))); }, []);
  const handleQuizImport = () => {
    const result = parseQuizImport(quizImportText);
    if (!result.ok) { setQuizImportMessage(result.error); return; }
    setQuestions(result.questions);
    setQuizImportMessage('Las 10 preguntas se importaron correctamente. Revisa y guarda los cambios.');
  };
  const handleClearQuiz = () => {
    if (!confirm('¿Vaciar las 10 preguntas de esta evaluación? Esta acción solo afecta lo que estás editando y se aplicará de forma permanente cuando guardes los cambios.')) return;
    setQuestions(createEmptyQuestions());
    setQuizImportMessage('Las 10 preguntas se vaciaron. Completa o importa la evaluación y luego guarda los cambios.');
    setSaveError('');
  };
  const handleSave = async () => {
    if (formData.quizEnabled) {
      const quizError = validateCertificateQuiz(questions);
      if (quizError) { setSaveError(quizError); return; }
    }
    const nv = { ...formData, questions, viewCount: formData.viewCount || 0 };
    setSaveError('');
    try {
      const isNew = !videos.some(v => v.id === nv.id);
      const prev = videos.find(v => v.id === nv.id);
      await onVideosChange(isNew ? [...videos, nv] : videos.map(v => v.id === nv.id ? nv : v));
      logAuditAuto(isNew ? 'video_created' : 'video_updated', 'video', String(nv.id), { title: nv.title });
      // Si cambió la duración u el título, propagar a certificados ya emitidos
      if (!isNew && prev && supabase && (String(prev.duration || '') !== String(nv.duration || '') || String(prev.title || '') !== String(nv.title || ''))) {
        try {
          await supabase.from('cpg_certificates').update({
            video_duration: String(nv.duration || ''),
            video_title: nv.title || '',
          }).eq('video_id', String(nv.id));
        } catch (err) { console.warn('No se pudieron actualizar certificados:', err); }
      }
      setEditingVideo(null);
    } catch (e) { setSaveError('No se pudieron guardar los cambios: ' + e.message); }
  };
  const handleDelete = async (id) => {
    if (confirm('¿Eliminar este video?')) {
      setSaveError('');
      try {
        const v = videos.find(x => x.id === id);
        await onVideosChange(videos.filter(v => v.id !== id));
        logAuditAuto('video_deleted', 'video', String(id), { title: v?.title || '' });
      } catch (e) { setSaveError('No se pudo eliminar: ' + e.message); }
    }
  };
  const handleActivityEdit = (a) => { setActivityError(''); setEditingActivity(a); setActivityForm({ title: a.title || '', organizer: a.organizer || '', date: a.date || '', time: a.time || '', horas: a.horas || '', location: a.location || '', registrationLink: a.registrationLink || '', meetingLink: a.meetingLink || '', isFull: Boolean(a.isFull), participants: a.participants || '', costType: a.costType || 'free', cost: a.cost || '', scholarshipPct: a.scholarshipPct || '', scholarshipAmt: a.scholarshipAmt || '', hasCommissions: !!a.hasCommissions, commissions: a.commissions || [] }); };
  const handleActivitySave = async () => {
    if (!activityForm.title || !activityForm.date) { setActivityError('El título y la fecha son obligatorios.'); return; }
    setActivityError('');
    const next = { ...editingActivity, ...activityForm };
    try {
      const exists = activities.some(a => a.id === next.id);
      const prev = activities.find(a => a.id === next.id);
      await onActivitiesChange(exists ? activities.map(a => a.id === next.id ? next : a) : [...activities, next]);
      logAuditAuto(exists ? 'activity_updated' : 'activity_created', 'activity', String(next.id), { title: next.title });
      // Si cambió horas o título, propagar a certificados ya emitidos para esta actividad
      if (exists && prev && supabase && (String(prev.horas || '') !== String(next.horas || '') || String(prev.title || '') !== String(next.title || ''))) {
        try {
          await supabase.from('cpg_certificates').update({
            video_duration: String(next.horas || ''),
            video_title: next.title || '',
          }).eq('video_id', String(next.id));
        } catch (err) { console.warn('No se pudieron actualizar certificados de actividad:', err); }
      }
      setEditingActivity(null);
      setActivityForm(EMPTY_ACTIVITY_FORM);
    } catch (e) { setActivityError('No se pudo guardar: ' + e.message); }
  };
  const handleActivityDelete = async (id) => {
    if (!confirm('¿Eliminar esta actividad?')) return;
    setActivityError('');
    try {
      const a = activities.find(x => x.id === id);
      await onActivitiesChange(activities.filter(a => a.id !== id));
      logAuditAuto('activity_deleted', 'activity', String(id), { title: a?.title || '' });
    } catch (e) { setActivityError('No se pudo eliminar: ' + e.message); }
  };
  const handleReportGenerate = () => {
    if (!reportRange.start || !reportRange.end) { setReportError('Selecciona un rango de fechas completo.'); return; }
    const s = new Date(reportRange.start + 'T00:00:00'), e = new Date(reportRange.end + 'T23:59:59');
    if (isNaN(s) || isNaN(e)) { setReportError('Rango inválido.'); return; }
    if (e < s) { setReportError('La fecha final debe ser posterior.'); return; }
    const filtered = activities.filter(a => a?.date).map(a => ({ ...a, pd: new Date(a.date + 'T00:00:00') })).filter(a => !isNaN(a.pd) && a.pd >= s && a.pd <= e).sort((a, b) => b.pd - a.pd);
    if (!filtered.length) { setReportError('No hay actividades en este rango.'); return; }
    const costLabel = (a) => { if (a.costType === 'paid') return 'Con costo'; if (a.costType === 'scholarship') return 'Con beca'; return 'Gratuito'; };
    const rows = [
      ['Título', 'Organizador', 'Fecha', 'Hora', 'Lugar', 'Participantes', 'Cupo lleno', 'Modalidad de costo', 'Costo total (Q.)', 'Pago agremiado (Q.)', '% de beca', 'Enlace actividad', 'Enlace inscripción'],
      ...filtered.map(a => [a.title, a.organizer || '', a.date, a.time || '', a.location || '', a.participants || '0', a.isFull ? 'Sí' : 'No', costLabel(a), a.costType === 'paid' ? (a.cost || '') : a.costType === 'scholarship' ? (a.cost || '') : '', a.costType === 'scholarship' ? (a.scholarshipAmt || '') : '', a.costType === 'scholarship' ? (a.scholarshipPct ? a.scholarshipPct + '%' : '') : '', a.meetingLink || '', a.registrationLink || ''])
    ];
    exportXLSX(rows, 'informe-actividades-' + reportRange.start + '-a-' + reportRange.end + '.xlsx');
    setShowReportModal(false);
  };

  const fetchAllCerts = async () => {
    const PAGE = 1000;
    let all = [], from = 0, done = false;
    while (!done) {
      const { data, error } = await supabase
        .from('cpg_certificates')
        .select('*')
        .order('issued_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (data?.length) all = all.concat(data);
      done = !data || data.length < PAGE;
      from += PAGE;
    }
    return all;
  };

  const loadAdminCerts = async () => {
    if (!supabase || certsLoaded) return;
    setCertsLoading(true);
    try {
      const all = await fetchAllCerts();
      setCertsData(all);
      setCertsLoaded(true);
    } catch {}
    setCertsLoading(false);
  };

  const handleDeleteCert = async (id) => {
    if (!confirm('¿Eliminar este certificado del registro? Esta acción no puede deshacerse.')) return;
    if (!supabase) return;
    try {
      await supabase.from('cpg_certificates').delete().eq('id', id);
      setCertsData(prev => prev.filter(c => c.id !== id));
    } catch (e) { alert('Error al eliminar: ' + e.message); }
  };

  const exportCertsCSV = (data) => {
    const rows = [
      ['Código', 'Colegiado', 'Nombre', 'Estado CPG', 'Curso', 'Duración (hrs)', 'Fecha de emisión', 'URL verificación'],
      ...data.map(c => [c.certificate_code, c.collegiate_number, c.recipient_name, c.status, c.video_title, c.video_duration || '', new Date(c.issued_at).toLocaleString('es-GT'), c.verify_url || ''])
    ];
    exportXLSX(rows, 'certificados-emitidos-' + new Date().toISOString().slice(0,10) + '.xlsx');
  };

  if (editingVideo) {
    return (
      <div className="min-h-screen bg-[#141414] pt-2 px-4 md:px-16 pb-12 text-white">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">{formData.title ? 'Editar Video' : 'Nuevo Video'}</h2>
            <div className="flex gap-2"><button onClick={() => setEditingVideo(null)} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Cancelar</button><button onClick={handleSave} className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 font-bold">Guardar Cambios</button></div>
          </div>
          {saveError && <div role="alert" className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{saveError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-400">Título</label><input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /></div>
              <div>
                <label className="block text-sm text-gray-400">Categoría</label>
                <input
                  type="text"
                  list="admin-categories-list"
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white"
                  placeholder="Selecciona o escribe una categoría nueva"
                />
                <datalist id="admin-categories-list">
                  {[...new Set(videos.map(v => v.category).filter(Boolean))].sort().map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Plataforma de video</label>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={() => setFormData({ ...formData, platform: 'youtube', youtubeId: '' })} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-semibold transition ${formData.platform === 'youtube' ? 'border-red-600 bg-red-900/30 text-red-300' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                    <Play size={14} /> YouTube
                  </button>
                  <button type="button" onClick={() => setFormData({ ...formData, platform: 'vimeo', youtubeId: '' })} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-semibold transition ${formData.platform === 'vimeo' ? 'border-[#1ab7ea] bg-[#1ab7ea]/20 text-[#1ab7ea]' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                    <Video size={14} /> Vimeo
                  </button>
                  <button type="button" onClick={() => setFormData({ ...formData, platform: 'teams', youtubeId: '' })} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-semibold transition ${formData.platform === 'teams' ? 'border-purple-500 bg-purple-900/30 text-purple-300' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                    💼 Teams
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400">
                  {formData.platform === 'vimeo' ? 'URL, ID o código iframe de Vimeo' : formData.platform === 'teams' ? 'URL del video de Teams / SharePoint' : 'YouTube ID o URL'}
                </label>
                <input
                  type="text"
                  value={formData.youtubeId}
                  onChange={e => setFormData({ ...formData, youtubeId: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white"
                  placeholder={formData.platform === 'vimeo'
                    ? 'Pega URL, ID numérico, o el <iframe> completo de Vimeo'
                    : formData.platform === 'teams'
                      ? 'Pega el enlace del video grabado de Teams o SharePoint'
                      : 'ID del video o URL completa de YouTube'
                  }
                />
                {formData.platform === 'vimeo' && (
                  <div className="mt-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-blue-300 font-semibold mb-1">Formatos aceptados:</p>
                    <ul className="text-xs text-blue-200/70 space-y-0.5 list-disc list-inside">
                      <li>Código iframe: <span className="font-mono text-[10px]">{'<iframe src="https://vimeo.com/event/...">'}</span></li>
                      <li>URL de evento: <span className="font-mono text-[10px]">https://vimeo.com/event/4029480</span></li>
                      <li>URL de video: <span className="font-mono text-[10px]">https://vimeo.com/123456789</span></li>
                      <li>Solo el ID numérico: <span className="font-mono text-[10px]">123456789</span></li>
                    </ul>
                    {formData.youtubeId && (
                      <div className="mt-2 pt-2 border-t border-blue-700/30">
                        <p className="text-[10px] text-gray-500">URL de embed generada:</p>
                        <p className="text-[10px] font-mono text-green-400 break-all">{getVimeoEmbedUrl(formData.youtubeId)}</p>
                      </div>
                    )}
                  </div>
                )}
                {formData.platform === 'teams' && (
                  <div className="mt-2 bg-purple-900/20 border border-purple-700/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-purple-300 font-semibold mb-1">Formatos aceptados:</p>
                    <ul className="text-xs text-purple-200/70 space-y-0.5 list-disc list-inside">
                      <li>URL de SharePoint Stream (se incrusta en la plataforma)</li>
                      <li>Enlace de Teams (abre en la app de Teams)</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-400">Duración (Horas)</label><input type="number" value={formData.duration} onChange={e => setFormData({ ...formData, duration: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /></div>
              <div><label className="block text-sm text-gray-400">URL Imagen Portada (opcional)</label><input type="text" value={formData.thumbnail} onChange={e => setFormData({ ...formData, thumbnail: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /><p className="text-xs text-gray-500 mt-1">{formData.platform === 'vimeo' ? 'Recomendado para Vimeo: sube una imagen de portada ya que no se genera automáticamente.' : 'Si no se carga, se usará la portada de YouTube.'}</p></div>
              <div><label className="block text-sm text-gray-400">Descripción</label><textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white h-24" /></div>
              <div><label className="block text-sm text-gray-400">Programar publicación</label><input type="date" value={formData.scheduledAt} onChange={e => setFormData({ ...formData, scheduledAt: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /><p className="text-xs text-gray-500 mt-1">Deja vacío para publicar de inmediato.</p></div>
            </div>
          </div>
          <div className="bg-gray-900 p-6 rounded border border-gray-800">
            <div className="flex items-center gap-3 mb-4"><input type="checkbox" id="quizToggle" checked={formData.quizEnabled} onChange={e => { const enabled = e.target.checked; setFormData({ ...formData, quizEnabled: enabled }); if (enabled && questions.length === 0) setQuestions(createEmptyQuestions()); }} className="w-5 h-5 text-blue-600 rounded" /><label htmlFor="quizToggle" className="font-bold text-lg cursor-pointer">Activar Evaluación para Certificado</label></div>
            {formData.quizEnabled && <div className="space-y-4">
              <p className="text-yellow-500 text-sm">Configura exactamente 10 preguntas. Marca la respuesta correcta en cada una.</p>
              <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-4">
                <label htmlFor="quiz-import-text" className="block text-base font-semibold text-blue-100">Importar las 10 preguntas de una vez</label>
                <p className="mt-1 text-sm text-gray-400">Pega el formato: <span className="font-mono text-xs">1. Pregunta... A) opción B) opción C) opción Respuesta correcta: B</span>. Se admiten opciones de A a F.</p>
                <textarea id="quiz-import-text" value={quizImportText} onChange={e => { setQuizImportText(e.target.value); setQuizImportMessage(''); }} className="mt-3 min-h-36 w-full rounded border border-gray-600 bg-gray-900 p-3 text-sm text-white focus:ring-2 focus:ring-blue-500" placeholder="Pega aquí las 10 preguntas..." aria-describedby="quiz-import-help" />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span id="quiz-import-help" className="text-xs text-gray-500">La importación reemplaza las 10 preguntas actuales solo si el contenido es válido.</span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button type="button" onClick={handleQuizImport} className="min-h-11 rounded bg-blue-600 px-4 py-2 font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300">Importar preguntas</button>
                    <button type="button" onClick={handleClearQuiz} className="min-h-11 rounded border border-gray-500 px-4 py-2 font-semibold text-gray-200 transition hover:border-red-400 hover:bg-red-950/30 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-300" aria-describedby="quiz-clear-help">Vaciar preguntas</button>
                  </div>
                </div>
                <p id="quiz-clear-help" className="mt-2 text-xs text-gray-500">Solo vacía las preguntas de esta evaluación abierta; los cambios no se guardan hasta presionar “Guardar Cambios”.</p>
                {quizImportMessage && <p role={quizImportMessage.startsWith('Las 10') ? 'status' : 'alert'} className={'mt-3 text-sm ' + (quizImportMessage.startsWith('Las 10') ? 'text-green-300' : 'text-red-300')}>{quizImportMessage}</p>}
              </div>
              {questions.map((q, idx) => <QuestionEditor key={idx} question={q} idx={idx} onQuestionChange={updateQuestion} />)}
            </div>}
          </div>
          {/* ── Entrega 3: Comisiones firmantes del curso ── */}
          <div className="bg-gray-900 p-6 rounded border border-gray-800 mt-4">
            <div className="flex items-center gap-3 mb-2">
              <input type="checkbox" id="commissionsToggle" checked={!!formData.hasCommissions} onChange={e => setFormData({ ...formData, hasCommissions: e.target.checked, commissions: e.target.checked ? (formData.commissions || []) : [] })} className="w-5 h-5 text-purple-600 rounded" />
              <label htmlFor="commissionsToggle" className="font-bold text-lg cursor-pointer">¿Otra comisión involucrada?</label>
            </div>
            <p className="text-xs text-gray-500 mb-4">Además del Coordinador CAEDUC (firma siempre), marca qué comisiones firmarán los certificados de este curso.</p>
            {formData.hasCommissions && (
              <div>
                {(!commissions || commissions.length === 0) ? (
                  <p className="text-sm text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-2">No hay comisiones activas. Agrégalas en "Comisiones y firmantes" del panel principal.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {commissions.map(c => {
                      const ids = formData.commissions || [];
                      const checked = ids.includes(c.id);
                      return (
                        <label key={c.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${checked ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 hover:border-gray-500'}`}>
                          <input type="checkbox" checked={checked} onChange={() => { const next = checked ? ids.filter(x => x !== c.id) : [...ids, c.id]; setFormData({ ...formData, commissions: next }); }} className="w-4 h-4 accent-purple-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{c.commission_name}</p>
                            <p className="text-gray-500 text-xs truncate">{c.signer_name} · {c.signer_title}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">{(formData.commissions || []).length} comisión{(formData.commissions || []).length !== 1 ? 'es' : ''} seleccionada{(formData.commissions || []).length !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414] pt-2 px-4 md:px-16 text-white">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8 border-b border-gray-800 pb-4">
        <div><h1 className="text-3xl font-bold">Panel de Administración</h1><p className="text-sm text-gray-400">Gestiona videos y actividades de capacitación.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-bold flex items-center gap-2"><Plus size={20} /> Nuevo Video</button>
          <button onClick={() => { setEditingActivity({ id: Date.now() }); setActivityForm(EMPTY_ACTIVITY_FORM); }} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded font-bold flex items-center gap-2"><CalendarDays size={18} /> Nueva actividad</button>
          {adminRole === 'super_admin' && (
            <button onClick={() => setShowHomepagePromoManager(true)} className="min-h-11 bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded font-bold flex items-center gap-2">
              <Image size={18} /> Imagen de portada
              <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-white/30 ${homepagePromo?.active ? 'bg-emerald-300' : 'bg-gray-300/70'}`} aria-hidden="true" />
              <span className="sr-only">{homepagePromo?.active ? 'Publicidad activa' : 'Publicidad inactiva'}</span>
            </button>
          )}
          <button onClick={() => setShowLogoManager(true)} className="bg-pink-600 hover:bg-pink-700 px-4 py-2 rounded font-bold flex items-center gap-2"><Image size={18} /> Logos del sitio</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-900/40 to-blue-900/20 border border-blue-800 rounded-xl p-5"><div className="flex items-center gap-3"><div className="bg-blue-600 p-3 rounded-lg"><Play size={24} /></div><div><p className="text-sm text-gray-400">Total de Cursos</p><p className="text-2xl font-bold">{videos.length}</p></div></div></div>
        <div className="bg-gradient-to-br from-green-900/40 to-green-900/20 border border-green-800 rounded-xl p-5"><div className="flex items-center gap-3"><div className="bg-green-600 p-3 rounded-lg"><Eye size={24} /></div><div><p className="text-sm text-gray-400">Total de Visitas</p><p className="text-2xl font-bold">{totalViews}</p></div></div></div>
        <div className="bg-gradient-to-br from-purple-900/40 to-purple-900/20 border border-purple-800 rounded-xl p-5"><div className="flex items-center gap-3"><div className="bg-purple-600 p-3 rounded-lg"><CalendarDays size={24} /></div><div><p className="text-sm text-gray-400">Actividades</p><p className="text-2xl font-bold">{activities.length}</p></div></div></div>
      </div>

      {saveError && <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{saveError}</div>}
      {activityError && <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{activityError}</div>}

      {/* ── TRANSMISIÓN EN VIVO (colapsable) ── */}
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowLiveSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-lg"><span className="text-white text-xs font-bold">LIVE</span></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Transmisión en vivo</h2>
              <p className="text-xs text-gray-400">{liveSession?.active ? '🔴 Sesión activa: ' + liveSession.title : 'Sin sesión activa'}</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showLiveSection ? '▲' : '▼'}</span>
        </button>
        {showLiveSection && <div className="border-t border-gray-800"><LiveAdminPanel liveSession={liveSession} onSave={onSaveLiveSession} onOpenAttendance={() => setShowAttendanceReport(true)} commissions={commissions} activities={activities} /></div>}
      </div>

      {/* ── PLANTILLA DE CERTIFICADO (colapsable) ── */}
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowCertTemplateSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-pink-600 p-2 rounded-lg"><Settings size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Plantilla de certificado</h2>
              <p className="text-xs text-gray-400">Personaliza textos, logos, firma, sello y fondo</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showCertTemplateSection ? '▲' : '▼'}</span>
        </button>
        {showCertTemplateSection && <div className="border-t border-gray-800"><CertTemplateAdmin certTemplate={certTemplate} onSave={onSaveCertConfig} /></div>}
      </div>

      {/* ── COMISIONES Y FIRMANTES (colapsable) ── */}
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowCommissionsSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-2 rounded-lg"><Users size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Comisiones y firmantes</h2>
              <p className="text-xs text-gray-400">Gestiona hasta 6 comisiones que pueden firmar certificados además del Coordinador CAEDUC</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showCommissionsSection ? '▲' : '▼'}</span>
        </button>
        {showCommissionsSection && <div className="border-t border-gray-800"><CommissionsManager /></div>}
      </div>

      {/* ── ACTIVIDADES (colapsable) ── */}
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-10 overflow-hidden">
        <button type="button" onClick={() => setShowActivitiesSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg"><CalendarDays size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Actividades de capacitación</h2>
              <p className="text-xs text-gray-400">{activities.length} actividades registradas</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showActivitiesSection ? '▲' : '▼'}</span>
        </button>
        {showActivitiesSection && (
          <div className="border-t border-gray-800 p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-400 whitespace-nowrap">Ver mes:</label>
                <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="bg-black border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:border-indigo-500 outline-none" />
                <span className="text-xs text-gray-500">{activities.filter(a => a.date && a.date.startsWith(filterMonth)).length} actividades</span>
              </div>
              <button type="button" onClick={() => { setReportError(''); setShowReportModal(true); }} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded font-semibold text-sm">Informe de actividades</button>
            </div>
            {editingActivity !== null && (
              <div className="bg-[#141414] border border-gray-800 rounded-xl p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm text-gray-400 mb-1">Nombre de la actividad</label><input type="text" value={activityForm.title} onChange={e => setActivityForm({ ...activityForm, title: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" /></div>
                  <div><label className="block text-sm text-gray-400 mb-1">Organizador</label><input type="text" value={activityForm.organizer} onChange={e => setActivityForm({ ...activityForm, organizer: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" /></div>
                  <div><label className="block text-sm text-gray-400 mb-1">Fecha</label><input type="date" value={activityForm.date} onChange={e => setActivityForm({ ...activityForm, date: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" /></div>
                  <div><label className="block text-sm text-gray-400 mb-1">Hora</label><input type="time" value={activityForm.time} onChange={e => setActivityForm({ ...activityForm, time: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" /></div>
                  <div><label className="block text-sm text-gray-400 mb-1">Duración <span className="text-xs text-blue-400">(horas — para certificados y créditos)</span></label><input type="number" step="0.5" min="0.5" value={activityForm.horas} onChange={e => setActivityForm({ ...activityForm, horas: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" placeholder="Ej: 2" /></div>
                  <div><label className="block text-sm text-gray-400 mb-1">Lugar</label><input type="text" value={activityForm.location} onChange={e => setActivityForm({ ...activityForm, location: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" /></div>
                  <div><label className="block text-sm text-gray-400 mb-1">Enlace (Zoom/Meet)</label><input type="url" value={activityForm.meetingLink} onChange={e => setActivityForm({ ...activityForm, meetingLink: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" /></div>
                  <div><label className="block text-sm text-gray-400 mb-1">Enlace de inscripción</label><input type="url" value={activityForm.registrationLink} onChange={e => setActivityForm({ ...activityForm, registrationLink: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" /></div>
                  <div><label className="block text-sm text-gray-400 mb-1">Participantes</label><input type="number" min="0" value={activityForm.participants} onChange={e => setActivityForm({ ...activityForm, participants: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" placeholder="0" /></div>
                  <div className="flex items-center gap-2 mt-1"><input id="activity-full" type="checkbox" checked={activityForm.isFull} onChange={e => setActivityForm({ ...activityForm, isFull: e.target.checked })} className="w-5 h-5 text-blue-600 rounded" /><label htmlFor="activity-full" className="text-sm text-gray-300">Cupo lleno</label></div>
                </div>
                <div className="mt-5 border-t border-gray-800 pt-4">
                  <p className="text-sm text-gray-400 mb-3 font-semibold uppercase tracking-wider">Modalidad de costo</p>
                  <div className="flex flex-wrap gap-4 mb-4">
                    {[['free', 'Gratuito'], ['paid', 'Con costo'], ['scholarship', 'Con beca']].map(([val, label]) => (
                      <label key={val} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition text-sm font-medium ${activityForm.costType === val ? 'border-blue-500 bg-blue-900/30 text-blue-200' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        <input type="radio" name="costType" value={val} checked={activityForm.costType === val} onChange={() => setActivityForm({ ...activityForm, costType: val, cost: '', scholarshipPct: '', scholarshipAmt: '' })} className="accent-blue-500" />{label}
                      </label>
                    ))}
                  </div>
                  {activityForm.costType === 'paid' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><label className="block text-sm text-gray-400 mb-1">Costo total (Q.)</label><div className="flex items-center gap-2"><span className="text-gray-400 font-bold">Q.</span><input type="number" min="0" step="0.01" value={activityForm.cost} onChange={e => setActivityForm({ ...activityForm, cost: e.target.value })} className="flex-1 bg-black border border-gray-700 rounded p-2 text-white" placeholder="0.00" /></div></div>
                    </div>
                  )}
                  {activityForm.costType === 'scholarship' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div><label className="block text-sm text-gray-400 mb-1">Costo total (Q.)</label><div className="flex items-center gap-2"><span className="text-gray-400 font-bold">Q.</span><input type="number" min="0" step="0.01" value={activityForm.cost} onChange={e => setActivityForm({ ...activityForm, cost: e.target.value })} className="flex-1 bg-black border border-gray-700 rounded p-2 text-white" placeholder="0.00" /></div></div>
                      <div><label className="block text-sm text-gray-400 mb-1">Pago del agremiado (Q.)</label><div className="flex items-center gap-2"><span className="text-gray-400 font-bold">Q.</span><input type="number" min="0" step="0.01" value={activityForm.scholarshipAmt} onChange={e => setActivityForm({ ...activityForm, scholarshipAmt: e.target.value })} className="flex-1 bg-black border border-gray-700 rounded p-2 text-white" placeholder="0.00" /></div></div>
                      <div><label className="block text-sm text-gray-400 mb-1">Porcentaje de beca (%)</label><div className="flex items-center gap-2"><input type="number" min="0" max="100" value={activityForm.scholarshipPct} onChange={e => setActivityForm({ ...activityForm, scholarshipPct: e.target.value })} className="flex-1 bg-black border border-gray-700 rounded p-2 text-white" placeholder="0" /><span className="text-gray-400 font-bold">%</span></div></div>
                    </div>
                  )}
                </div>
                {/* ── Comisiones firmantes de la actividad ── */}
                <div className="bg-gray-900 p-4 rounded border border-gray-800 mt-4">
                  <div className="flex items-center gap-3 mb-2">
                    <input type="checkbox" id="actCommToggle" checked={!!activityForm.hasCommissions} onChange={e => setActivityForm({ ...activityForm, hasCommissions: e.target.checked, commissions: e.target.checked ? (activityForm.commissions || []) : [] })} className="w-5 h-5 text-purple-600 rounded" />
                    <label htmlFor="actCommToggle" className="font-bold cursor-pointer">¿Otra comisión involucrada?</label>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Además del Coordinador CAEDUC, marca qué comisiones firmarán los certificados de esta actividad.</p>
                  {activityForm.hasCommissions && (
                    <div>
                      {(!commissions || commissions.length === 0) ? (
                        <p className="text-sm text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-2">No hay comisiones activas. Agrégalas en "Comisiones y firmantes" del panel principal.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {commissions.map(c => {
                            const ids = activityForm.commissions || [];
                            const checked = ids.includes(c.id);
                            return (
                              <label key={c.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${checked ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 hover:border-gray-500'}`}>
                                <input type="checkbox" checked={checked} onChange={() => { const next = checked ? ids.filter(x => x !== c.id) : [...ids, c.id]; setActivityForm({ ...activityForm, commissions: next }); }} className="w-4 h-4 accent-purple-500" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-semibold truncate">{c.commission_name}</p>
                                  <p className="text-gray-500 text-xs truncate">{c.signer_name} · {c.signer_title}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">{(activityForm.commissions || []).length} comisión{(activityForm.commissions || []).length !== 1 ? 'es' : ''} seleccionada{(activityForm.commissions || []).length !== 1 ? 's' : ''}</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setEditingActivity(null)} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Cancelar</button>
                  <button onClick={handleActivitySave} className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 font-bold">Guardar actividad</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activities.filter(a => !a.date || a.date.startsWith(filterMonth)).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(a => {
                const isPast = isActivityPast(a); // pasada = fecha + hora + duración ya transcurrida
                return (
                  <div key={a.id} className={`bg-[#141414] border rounded-xl p-4 ${isPast ? 'border-gray-700 opacity-80' : 'border-gray-800'}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="text-lg font-bold text-white">{a.title}</h3>
                      <div className="flex gap-1 flex-wrap">
                        {isPast && <span className="text-xs uppercase bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">Pasada</span>}
                        {a.isFull && <span className="text-xs uppercase bg-red-500/20 text-red-200 border border-red-500/40 px-2 py-0.5 rounded-full">Cupo lleno</span>}
                      </div>
                    </div>
                    <p className="text-sm text-gray-400">Organiza: {a.organizer || 'Por definir'}</p>
                    <div className="text-sm text-gray-300 mt-2 space-y-0.5">
                      <p><span className="text-gray-500">Fecha:</span> {a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('es-GT') : 'Pendiente'}</p>
                      <p><span className="text-gray-500">Hora:</span> {a.time || 'Por confirmar'}</p>
                      {a.horas && <p><span className="text-gray-500">Duración:</span> <span className="text-blue-300 font-semibold">{a.horas} h</span></p>}
                      <p><span className="text-gray-500">Lugar:</span> {a.location || 'Por confirmar'}</p>
                      {a.participants > 0 && <p className="flex items-center gap-1"><Users size={12} className="text-gray-500" /> <span className="text-gray-500">Participantes:</span> {a.participants}</p>}
                    </div>
                    <div className="mt-2">
                      {(!a.costType || a.costType === 'free') && <span className="text-xs bg-green-900/30 text-green-300 border border-green-700/30 px-2 py-0.5 rounded-full">Gratuito</span>}
                      {a.costType === 'paid' && <span className="text-xs bg-blue-900/30 text-blue-300 border border-blue-700/30 px-2 py-0.5 rounded-full">Q.{a.cost}</span>}
                      {a.costType === 'scholarship' && <span className="text-xs bg-purple-900/30 text-purple-300 border border-purple-700/30 px-2 py-0.5 rounded-full">Beca {a.scholarshipPct}% — Q.{a.scholarshipAmt}</span>}
                    </div>
                    {a.meetingLink && <a href={a.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-3 text-sm text-blue-300 hover:text-blue-200"><ExternalLink size={14} /> Enlace de actividad</a>}
                    {a.registrationLink && <a href={a.registrationLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-1 text-sm text-blue-300 hover:text-blue-200 block"><ExternalLink size={14} /> Inscripción</a>}
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => handleActivityEdit(a)} className="flex-1 bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 py-2 rounded text-sm transition">Editar</button>
                      <button onClick={() => handleActivityDelete(a.id)} className="px-3 bg-red-900/40 hover:bg-red-900/60 text-red-300 rounded transition"><Trash2 size={16} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showReportModal && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center px-4 py-10">
          <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800"><div><h3 className="text-lg font-bold text-white">Informe de actividades</h3><p className="text-sm text-gray-400">Selecciona el rango de fechas.</p></div><button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-white"><X size={18} /></button></div>
            <div className="px-6 py-6 space-y-4">{reportError && <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{reportError}</div>}<div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm text-gray-400 mb-1">Desde</label><input type="date" value={reportRange.start} onChange={e => setReportRange({ ...reportRange, start: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" /></div><div><label className="block text-sm text-gray-400 mb-1">Hasta</label><input type="date" value={reportRange.end} onChange={e => setReportRange({ ...reportRange, end: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-2 text-white" /></div></div></div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-800"><button onClick={() => setShowReportModal(false)} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Cancelar</button><button onClick={handleReportGenerate} className="px-4 py-2 bg-emerald-600 rounded hover:bg-emerald-700 font-bold">Descargar informe</button></div>
          </div>
        </div>
      )}

      {/* ── CERTIFICADOS EMITIDOS (colapsable) ── */}
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-10 overflow-hidden">
        <button type="button" onClick={() => { setShowCertsSection(v => !v); if (!showCertsSection) loadAdminCerts(); }} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-600 p-2 rounded-lg"><Award size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Certificados emitidos</h2>
              <p className="text-xs text-gray-400">{certsLoaded ? `${certsData.length} certificados registrados` : 'Haz clic para cargar'}</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showCertsSection ? '▲' : '▼'}</span>
        </button>

        {showCertsSection && (
          <div className="border-t border-gray-800 p-6">
            {/* Barra superior: búsqueda + acciones */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-500 pointer-events-none" />
                <input type="text" value={certsFilter} onChange={e => setCertsFilter(e.target.value)} placeholder="Filtrar por colegiado, nombre o curso..." className="w-full bg-black border border-gray-700 rounded-lg pl-8 pr-4 py-2 text-sm text-white focus:border-yellow-500 outline-none" />
              </div>
              <button onClick={() => setShowBulkCert(true)} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-sm font-bold text-white transition shrink-0"><Award size={16} /> Emitir masivamente</button>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <button onClick={() => { setCertsLoaded(false); loadAdminCerts(); }} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm font-semibold transition">
                  <Loader2 size={14} className={certsLoading ? 'animate-spin' : ''} /> Actualizar
                </button>
                <button
                  onClick={() => syncCertHours(true)}
                  title="Actualiza las horas y el título en todos los certificados que los tienen vacíos"
                  className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-600 px-3 py-2 rounded-lg text-sm font-semibold transition text-white"
                >
                  ⟳ Sincronizar horas
                </button>
                <button
                  onClick={verifyFilteredStatus}
                  disabled={verifyStatusLoading}
                  title="Consulta el CPG y actualiza el estado de los certificados filtrados que no están ACTIVO"
                  className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:bg-teal-900 disabled:cursor-not-allowed px-3 py-2 rounded-lg text-sm font-semibold transition text-white"
                >
                  {verifyStatusLoading ? <><Loader2 size={14} className="animate-spin" /> Verificando...</> : <><UserCheck size={14} /> Verificar estado</>}
                </button>
                {syncMsg && <span className="text-xs self-center text-indigo-300">{syncMsg}</span>}
                {verifyStatusMsg && <span className="text-xs self-center text-teal-300">{verifyStatusMsg}</span>}
              </div>
            </div>

            {/* Filtros de fecha */}
            <div className="bg-black/30 border border-gray-800 rounded-xl px-4 py-3 mb-5">
              <div className="flex flex-wrap gap-2 mb-3 items-center">
                <span className="text-xs text-gray-500 uppercase tracking-wider mr-1">Filtrar por fecha:</span>
                {[['month','Por mes'],['range','Por período'],['all','Mostrar todos']].map(([val, lbl]) => (
                  <button key={val} onClick={() => setCertsDateMode(val)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${certsDateMode === val ? 'border-yellow-600 bg-yellow-900/30 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              {certsDateMode === 'month' && (
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400">Mes:</label>
                  <input type="month" value={certsDateMonth} onChange={e => setCertsDateMonth(e.target.value)}
                    className="bg-black border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:border-yellow-500 outline-none" />
                </div>
              )}
              {certsDateMode === 'range' && (
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-xs text-gray-400">Desde:</label>
                  <input type="date" value={certsDateStart} onChange={e => setCertsDateStart(e.target.value)} className="bg-black border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:border-yellow-500 outline-none" />
                  <label className="text-xs text-gray-400">Hasta:</label>
                  <input type="date" value={certsDateEnd} onChange={e => setCertsDateEnd(e.target.value)} className="bg-black border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:border-yellow-500 outline-none" />
                </div>
              )}
            </div>

            {certsLoading && <div className="text-center py-10"><Loader2 size={32} className="animate-spin text-yellow-500 mx-auto mb-3" /><p className="text-gray-400 text-sm">Cargando certificados...</p></div>}

            {!certsLoading && certsData.length === 0 && certsLoaded && (
              <div className="text-center py-10 text-gray-500"><Award size={40} className="mx-auto mb-3 opacity-30" /><p>No hay certificados emitidos aún.</p></div>
            )}

            {!certsLoading && certsData.length > 0 && (() => {
              // Aplicar filtro de fecha
              const dateFiltered = certsData.filter(c => {
                const d = new Date(c.issued_at);
                if (certsDateMode === 'month' && certsDateMonth) {
                  const [y, m] = certsDateMonth.split('-').map(Number);
                  return d.getFullYear() === y && (d.getMonth() + 1) === m;
                }
                if (certsDateMode === 'range') {
                  if (certsDateStart && d < new Date(certsDateStart + 'T00:00:00')) return false;
                  if (certsDateEnd && d > new Date(certsDateEnd + 'T23:59:59')) return false;
                }
                return true; // 'all'
              });

              // Aplicar búsqueda de texto sobre los ya filtrados por fecha
              const filtered = certsFilter
                ? dateFiltered.filter(c => {
                    const q = certsFilter.toLowerCase();
                    return c.collegiate_number?.includes(q) || c.recipient_name?.toLowerCase().includes(q) || c.video_title?.toLowerCase().includes(q);
                  })
                : dateFiltered;

              return (
                <>
                  {/* Stats siempre sobre el total global */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-yellow-400">{certsData.length}</p>
                      <p className="text-xs text-gray-400">Total emitidos</p>
                    </div>
                    <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-green-400">{certsData.filter(c => c.status === 'ACTIVO').length}</p>
                      <p className="text-xs text-gray-400">Colegiados activos</p>
                    </div>
                    <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-blue-400">{new Set(certsData.map(c => c.collegiate_number)).size}</p>
                      <p className="text-xs text-gray-400">Profesionales únicos</p>
                    </div>
                    <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-purple-400">{new Set(certsData.map(c => c.video_id)).size}</p>
                      <p className="text-xs text-gray-400">Cursos con certs.</p>
                    </div>
                  </div>

                  {/* Conteo + exportar de lo filtrado */}
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <p className="text-xs text-gray-500">
                      {filtered.length} certificado{filtered.length !== 1 ? 's' : ''} mostrado{filtered.length !== 1 ? 's' : ''}
                      {(certsDateMode !== 'all' || certsFilter) ? ' (con filtros aplicados)' : ''}
                    </p>
                    {filtered.length > 0 && (
                      <button onClick={() => exportCertsCSV(filtered)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                        <Download size={13} /> Exportar XLSX ({filtered.length})
                      </button>
                    )}
                  </div>

                  {filtered.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      <Award size={36} className="mx-auto mb-3 opacity-30" />
                      <p>No hay certificados para los filtros seleccionados.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-800">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                          <tr>
                            <th className="text-left px-4 py-3">Profesional</th>
                            <th className="text-left px-4 py-3">Colegiado</th>
                            <th className="text-left px-4 py-3">Estado</th>
                            <th className="text-left px-4 py-3">Curso</th>
                            <th className="text-left px-4 py-3">Emisión</th>
                            <th className="text-left px-4 py-3">Código</th>
                            <th className="px-4 py-3">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(c => (
                            <tr key={c.id} className="border-t border-gray-800 hover:bg-gray-900/40">
                              <td className="px-4 py-2.5 text-white font-medium">{c.recipient_name}</td>
                              <td className="px-4 py-2.5 text-gray-300 font-mono">{c.collegiate_number}</td>
                              <td className="px-4 py-2.5">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.status === 'ACTIVO' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>{c.status}</span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-300 max-w-xs truncate">{c.video_title}</td>
                              <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap text-xs">{new Date(c.issued_at).toLocaleDateString('es-GT')}</td>
                              <td className="px-4 py-2.5 text-gray-600 font-mono text-xs truncate max-w-[140px]">{c.certificate_code}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1 justify-center">
                                  {c.verify_url && (
                                    <a href={c.verify_url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-900/40 hover:bg-blue-900/70 text-blue-300 rounded" title="Ver verificación"><ExternalLink size={13} /></a>
                                  )}
                                  {/* Reimprimir: certs de video */}
                                  {c.cert_type !== 'volunteer' && (
                                    <button
                                      onClick={() => {
                                        const video = videos.find(v => v.id === c.video_id) || { id: c.video_id, title: c.video_title, duration: c.video_duration };
                                        const profile = { name: c.recipient_name, collegiateNumber: c.collegiate_number, status: c.status };
                                        onGenerateCertificate(video, profile);
                                      }}
                                      className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded" title="Reimprimir certificado">
                                      <Printer size={13} />
                                    </button>
                                  )}
                                  {/* Reimprimir: acreditaciones especiales — descarga directa, sin abrir editor */}
                                  {c.cert_type === 'volunteer' && (
                                    <button
                                      onClick={() => {
                                        setVolunteerReprintCert(c);
                                        setVolunteerAutoDownload(true); // activa descarga automática
                                        setShowVolunteerCertSection(true);
                                        setTimeout(() => volunteerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
                                      }}
                                      className="p-1.5 bg-yellow-900/40 hover:bg-yellow-800/60 text-yellow-300 rounded" title="Descargar acreditación especial">
                                      <Printer size={13} />
                                    </button>
                                  )}
                                  <button onClick={() => handleDeleteCert(c.id)} className="p-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded" title="Eliminar registro"><Trash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>



      {/* ── ACREDITACIONES ESPECIALES ── */}
      {adminRole === 'super_admin' && (
      <div ref={volunteerSectionRef} className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowVolunteerCertSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-600 p-2 rounded-lg"><Award size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Acreditaciones Especiales</h2>
              <p className="text-xs text-gray-400">Genera acreditaciones especiales de comisiones — voluntarios, talleres, formaciones</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showVolunteerCertSection ? '▲' : '▼'}</span>
        </button>
        {showVolunteerCertSection && (
          <div className="border-t border-gray-800">
            <VolunteerAccreditationManager
              certTemplate={certTemplate}
              reprintCert={volunteerReprintCert}
              onReprintConsumed={() => setVolunteerReprintCert(null)}
              autoDownload={volunteerAutoDownload}
              onAutoDownloadConsumed={() => setVolunteerAutoDownload(false)}
            />
          </div>
        )}
      </div>
      )}

      {/* ── INFORME DE ESTADÍSTICAS DE USO (solo Super Admin) ── */}
      {adminRole === 'super_admin' && (
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowStatsReportSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-900/30"><Download size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Informe de estadísticas para auditoría</h2>
              <p className="text-xs text-gray-400">Selecciona métricas y descarga un Excel con resumen completo de uso de la página</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showStatsReportSection ? '▲' : '▼'}</span>
        </button>
        {showStatsReportSection && <div className="border-t border-gray-800"><UsageStatsReport /></div>}
      </div>
      )}

      {/* ── LOG DE AUDITORÍA (solo Super Admin) ── */}
      {adminRole === 'super_admin' && (
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowAuditLogSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg"><History size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Log de auditoría</h2>
              <p className="text-xs text-gray-400">Solo muestra acciones de administradores registrados</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showAuditLogSection ? '▲' : '▼'}</span>
        </button>
        {showAuditLogSection && <div className="border-t border-gray-800"><AuditLogViewer /></div>}
      </div>
      )}

      {/* ── VERIFICAR Y ACTIVAR CUENTAS DE USUARIOS (solo Super Admin) ── */}
      {adminRole === 'super_admin' && (
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowUserVerifySection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-teal-600 p-2 rounded-lg"><UserCheck size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Verificar y activar cuentas de usuarios</h2>
              <p className="text-xs text-gray-400">Cuentas Hotmail/Outlook pendientes + búsqueda manual</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showUserVerifySection ? '▲' : '▼'}</span>
        </button>
        {showUserVerifySection && <div className="border-t border-gray-800"><UserVerifyManager currentAdminRole={adminRole} /></div>}
      </div>
      )}

      {/* ── CAMBIAR CORREO REGISTRADO ── */}
      {(adminRole === 'super_admin' || adminRole === 'admin') && (
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowEmailChangeSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-2 rounded-lg shadow-lg shadow-emerald-900/30"><KeyRound size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Acceso de usuarios</h2>
              <p className="text-xs text-gray-400">{adminRole === 'super_admin' ? 'Contraseñas temporales, cambio de correo y borrado de cuentas' : 'Genera contraseñas temporales para usuarios sin acceso'}</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showEmailChangeSection ? '▲' : '▼'}</span>
        </button>
        {showEmailChangeSection && <div className="border-t border-gray-800"><EmailChangeManager currentAdminRole={adminRole} currentAdminEmail={currentAdminEmail} /></div>}
      </div>
      )}

      {/* ── BOTONES PERSONALIZABLES DEL MENÚ SUPERIOR ── */}
      {adminRole === 'super_admin' && (
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowNavButtonsSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-cyan-500 to-cyan-700 p-2 rounded-lg shadow-lg shadow-cyan-900/30"><Settings size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Botones del menú superior</h2>
              <p className="text-xs text-gray-400">Agregar accesos directos al congreso, eventos, sitios externos, etc.</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showNavButtonsSection ? '▲' : '▼'}</span>
        </button>
        {showNavButtonsSection && <div className="border-t border-gray-800"><NavButtonsManager currentAdminRole={adminRole} currentAdminEmail={currentAdminEmail} onChange={onNavButtonsChange} /></div>}
      </div>
      )}

      {/* ── GESTIÓN DE ADMINISTRADORES (colapsable) ── */}
      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl mb-6 overflow-hidden">
        <button type="button" onClick={() => setShowAdminUsersSection(v => !v)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-2 rounded-lg"><Users size={18} className="text-white" /></div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Gestión de administradores</h2>
              <p className="text-xs text-gray-400">{adminRole === 'super_admin' ? 'Agregar, editar y eliminar usuarios admin' : 'Solo visible para Super Admin'}</p>
            </div>
          </div>
          <span className="text-gray-400 text-lg">{showAdminUsersSection ? '▲' : '▼'}</span>
        </button>
        {showAdminUsersSection && <div className="border-t border-gray-800"><AdminUsersManager currentAdminRole={adminRole} /></div>}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Cursos</h2>
        <button onClick={() => setShowAllVideos(v => !v)} className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition">
          {showAllVideos ? 'Ver por categoría' : 'Mostrar todos'}
        </button>
      </div>
      {(() => {
        const sorted = [...videos].sort((a, b) => Number(b.id) - Number(a.id));
        const renderVideoCard = (video) => (
          <div key={video.id} className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800 flex flex-col">
            <div className="h-40 relative">
              <img src={getVideoThumbnail(video)} className="w-full h-full object-cover" alt="" onError={(e) => { const t = e.currentTarget; if (video.platform === 'vimeo') { t.src = 'https://via.placeholder.com/640x360/1a1a2e/60a5fa?text=▶+Vimeo'; return; } if (video.platform === 'teams') { t.src = 'https://via.placeholder.com/640x360/1e1b4b/818cf8?text=▶+Teams'; return; } const s = t.dataset.fallbackStage || 'hqdefault'; if (s === 'hqdefault') { t.dataset.fallbackStage = 'mqdefault'; t.src = getYouTubeThumbnail(video.youtubeId, 'mqdefault'); return; } t.src = getYouTubeThumbnail(''); }} />
              <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 text-xs rounded text-white">ID: {video.id}</div>
              <div className="absolute top-2 left-2 bg-green-600/90 px-2 py-1 text-xs rounded text-white flex items-center gap-1"><Eye size={12} /> {viewCounts[video.id] || 0} visitas</div>
              {video.platform === 'vimeo' && <div className="absolute bottom-2 left-2 bg-[#1ab7ea]/90 px-1.5 py-0.5 text-[10px] rounded font-bold text-white">VIMEO</div>}
              {video.platform === 'teams' && <div className="absolute bottom-2 left-2 bg-purple-700/90 px-1.5 py-0.5 text-[10px] rounded font-bold text-white">TEAMS</div>}
            </div>
            <div className="p-4 flex-1"><h3 className="font-bold text-lg mb-1">{video.title}</h3><p className="text-sm text-gray-400 mb-2">{video.category}</p><div className="flex items-center gap-2 text-xs mb-4 flex-wrap">{video.quizEnabled ? <span className="text-green-400 border border-green-400/30 px-2 py-0.5 rounded">Evaluación Activa</span> : <span className="text-gray-500">Sin Evaluación</span>}{!isVideoPublished(video) && <span className="text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded">Programado {formatScheduleDate(video.scheduledAt)}</span>}</div></div>
            <div className="p-4 border-t border-gray-800 flex gap-2">
              <button onClick={() => handleEdit(video)} className="flex-1 bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 py-2 rounded text-sm transition">Editar</button>
              {video.quizEnabled && <button onClick={() => { setManualCertVideo(video); setManualProfile({ name: '', collegiateNumber: '', status: '' }); }} className="flex-1 bg-yellow-700/40 hover:bg-yellow-700/60 text-yellow-200 py-2 rounded text-sm transition">Generar Certificado</button>}
              <button onClick={() => handleDelete(video.id)} className="px-3 bg-red-900/40 hover:bg-red-900/60 text-red-300 rounded transition"><Trash2 size={16} /></button>
            </div>
          </div>
        );
        if (showAllVideos) {
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
              {sorted.map(video => renderVideoCard(video))}
            </div>
          );
        }
        // Group by category preserving newest-first order within each category
        const catOrder = [];
        const byCat = {};
        sorted.forEach(video => {
          const cat = video.category || 'Sin categoría';
          if (!byCat[cat]) { byCat[cat] = []; catOrder.push(cat); }
          byCat[cat].push(video);
        });
        return (
          <div className="pb-12 space-y-4">
            {catOrder.map(cat => {
              const collapsed = collapsedCats[cat] ?? true;
              return (
                <div key={cat} className="bg-[#1b1b1b] border border-gray-800 rounded-xl overflow-hidden">
                  <button type="button" onClick={() => setCollapsedCats(prev => ({ ...prev, [cat]: !collapsed }))} className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/5 transition">
                    <span className="font-semibold text-white">{cat} <span className="text-gray-500 font-normal text-sm">({byCat[cat].length})</span></span>
                    <span className="text-gray-400 text-sm">{collapsed ? '▼' : '▲'}</span>
                  </button>
                  {!collapsed && (
                    <div className="border-t border-gray-800 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {byCat[cat].map(video => renderVideoCard(video))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {showBulkCert && <BulkCertificateEmitter videos={videos} activities={activities} commissions={commissions} onClose={() => setShowBulkCert(false)} onCertsCreated={() => { setCertsLoaded(false); loadAdminCerts(); }} />}
      {showAttendanceReport && <AttendanceReportView videos={videos} activities={activities} commissions={commissions} onClose={() => { setShowAttendanceReport(false); setCertsLoaded(false); }} />}
      {showLogoManager && <LogoManagerModal siteLogos={siteLogos} onSave={onSaveSiteLogos} onClose={() => setShowLogoManager(false)} />}
      {showHomepagePromoManager && adminRole === 'super_admin' && <HomepagePromoManagerModal promo={homepagePromo} onSave={onSaveHomepagePromo} onClose={() => setShowHomepagePromoManager(false)} />}

      {manualCertVideo && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4">Generar Certificado Manual</h2>
            <p className="text-sm text-gray-400 mb-4">Curso: {manualCertVideo.title}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Número de colegiado</label>
                <div className="relative">
                  <input type="text" value={manualProfile.collegiateNumber} onChange={e => setManualProfile({ ...manualProfile, collegiateNumber: e.target.value, status: '', name: '' })} onBlur={handleCollegiateBlur} className="w-full bg-black border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none pr-10" placeholder="Ej. 4661" />
                  {lookingUpStatus && <Loader2 size={16} className="absolute right-3 top-3.5 animate-spin text-blue-400" />}
                </div>
                {manualProfile.status && <p className={`text-xs font-bold mt-1 ${manualProfile.status === 'ACTIVO' ? 'text-green-400' : 'text-red-400'}`}>Estado consultado: {manualProfile.status}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nombre del profesional</label>
                <input type="text" value={manualProfile.name} onChange={e => setManualProfile({ ...manualProfile, name: e.target.value })} className="w-full bg-black border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none" placeholder="Se auto-completa al consultar el colegiado" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Estado en certificado</label>
                {manualProfile.status ? (
                  <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-bold ${manualProfile.status === 'ACTIVO' ? 'border-green-600 bg-green-900/30 text-green-300' : 'border-red-600 bg-red-900/30 text-red-300'}`}>
                    <span className={`w-2 h-2 rounded-full ${manualProfile.status === 'ACTIVO' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                    {manualProfile.status}
                    <span className="text-xs font-normal opacity-60 ml-1">(obtenido del CPG)</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-700 text-sm text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-gray-600"></span>
                    Ingresa el número de colegiado para consultar
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setManualCertVideo(null)} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Cancelar</button>
              <button onClick={() => { if (!manualProfile.name || !manualProfile.collegiateNumber) { alert('Ingresa nombre y colegiado.'); return; } onGenerateCertificate(manualCertVideo, manualProfile); setManualCertVideo(null); }} className="px-4 py-2 bg-yellow-600 rounded hover:bg-yellow-700 font-bold">Generar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
