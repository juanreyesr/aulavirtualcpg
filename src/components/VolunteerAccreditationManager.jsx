// ══════════════════════════════════════════════════════════════════════
// VolunteerAccreditationManager.jsx — Acreditaciones Especiales
// ══════════════════════════════════════════════════════════════════════
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Download, Loader2, CheckCircle, XCircle,
  Award, Move, Save, Users, Search, Minus, Printer,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const APP_URL      = 'https://aulavirtualcpg.org';
const EDGE_URL     = 'https://ilyospunwucdojrnfgti.supabase.co/functions/v1/consultar-colegiado';
const CANVAS_W     = 1056;
const CANVAS_H     = 816;
const SETTINGS_KEY = 'special_cert_settings';
const LS_KEY       = 'cpg_special_cert_v2'; // localStorage key

const getCertQrUrl = (code) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`${APP_URL}/?cert=${code}`)}&bgcolor=ffffff&color=1a1a2e&margin=4`;

// ── Elementos — titleBlock y recipientBlock tienen textos secundarios (fs2) ──
// Elementos de texto — siguen siendo constantes
const TEXT_ELEMENTS = [
  { id: 'boardText',       label: 'Junta Directiva',       color: '#c41f6b' },
  { id: 'titleBlock',      label: 'Título y comisiones',   color: '#3b82f6', hasFs2: true, fs2Label: 'Comisiones / "válido de..."' },
  { id: 'recipientBlock',  label: 'Nombre del acreditado', color: '#10b981', hasFs2: true, fs2Label: '"Hace constar" / colegiado' },
  { id: 'bodyText',        label: 'Texto descriptivo',     color: '#f59e0b' },
  { id: 'trainingsBlock',  label: 'Capacitaciones',        color: '#8b5cf6' },
  { id: 'signaturesBlock', label: 'Firmas',                color: '#ec4899' },
  { id: 'seal',            label: 'Sello',                 color: '#6366f1' },
  { id: 'qrBlock',         label: 'Código QR',             color: '#14b8a6' },
  { id: 'dateText',        label: 'Fecha de emisión',      color: '#f97316' },
];

// Logos fijos (CPG + CAEDUC) — siempre presentes
const LOGO_ELEMENTS_STATIC = [
  { id: 'logoCpg',    label: 'Logo CPG',    color: '#e879f9', isLogo: true },
  { id: 'logoCaeduc', label: 'Logo CAEDUC', color: '#a78bfa', isLogo: true },
];

const DEFAULT_POSITIONS = {
  // ── Logos ──
  logoCpg:    { x: 42,  y: 12, w: 200, h: 90 },
  logoCaeduc: { x: 820, y: 12, w: 190, h: 100 },
  // Logos de comisiones adicionales (hasta 6 slots, defaults en fila central)
  commLogo_0: { x: 270, y: 15, w: 110, h: 80 },
  commLogo_1: { x: 390, y: 15, w: 110, h: 80 },
  commLogo_2: { x: 510, y: 15, w: 110, h: 80 },
  commLogo_3: { x: 630, y: 15, w: 110, h: 80 },
  commLogo_4: { x: 270, y: 15, w: 110, h: 80 },
  commLogo_5: { x: 390, y: 15, w: 110, h: 80 },
  // ── Texto ──
  boardText:       { x: 395, y: 42,  w: 280, h: 38,  fs: 22 },
  titleBlock:      { x: 50,  y: 155, w: 956, h: 108, fs: 24, fs2: 20 },
  recipientBlock:  { x: 50,  y: 268, w: 956, h: 75,  fs: 28, fs2: 16 },
  bodyText:        { x: 50,  y: 348, w: 956, h: 40,  fs: 11 },
  trainingsBlock:  { x: 50,  y: 393, w: 956, h: 215, fs: 11 },
  signaturesBlock: { x: 45,  y: 618, w: 700, h: 140, fs: 11 },
  seal:            { x: 458, y: 695, w: 100, h: 100, fs: 10 },
  qrBlock:         { x: 888, y: 706, w: 118, h: 95,  fs: 7  },
  dateText:        { x: 45,  y: 788, w: 300, h: 20,  fs: 10 },
};

const EMPTY_TRAINING = { title: '', dateRange: '', modality: 'Virtual', hours: '', aval: '', placeDate: '' };
const DEFAULT_FORM = {
  // ── Textos del diploma (todos editables) ──
  caeducLine:         'La Comisión de Acreditación y Educación Continua mediante el Aula Virtual',
  commissionPrefix:   'en conjunto con la',          // prefijo antes de cada comisión adicional
  conferText:         'confieren la siguiente:',      // línea antes del título
  certTitle:          'Acreditación de Voluntario',
  totalHours:         '',
  validLabel:         'válido de',                   // "válido de {from} a {to}"
  haceConstarLabel:   'y hace constar que el/la voluntario/a:',
  collegiateLabel:    'Con número de colegiado activo:',
  dateLabel:          'Emitido el',
  // ── Configuración ──
  commissionName:     'Comisión de Atención en Crisis y Apoyo Psicosocial CICAPS',
  validFrom:          'abril 2026',
  validTo:            'abril 2027',
  bodyText:           'Concluyó las siguientes capacitaciones en Salud Mental para la respuesta a emergencias y desastres para lograr dicha acreditación por parte de la Comisión de Atención en Crisis y Apoyo Psicosocial CICAPS',
  includePresident:   false,
  selectedCommissions:[],
  trainings:          [{ ...EMPTY_TRAINING }, { ...EMPTY_TRAINING }],
  recipientName:      '',
  collegiateNumber:   '',
};

// ── Canvas del certificado ───────────────────────────────────────────────────
function SpecialCertCanvas({ certRef, tpl, data, positions: P, certCode, dateFormatted, selectedCommissions, onImageLoaded }) {
  const [loaded, setLoaded] = useState(0);
  const imgs = [
    tpl.logoCpgUrl, tpl.logoCaeducUrl, tpl.signatureUrl, tpl.sealUrl,
    ...(data.includePresident && tpl.presidenteSignatureUrl ? [tpl.presidenteSignatureUrl] : []),
    ...selectedCommissions.filter(c => c.signature_url).map(c => c.signature_url),
    ...selectedCommissions.filter(c => c.logo_url).map(c => c.logo_url),
  ].filter(Boolean);

  const onLoad = useCallback(() => setLoaded(p => p + 1), []);
  useEffect(() => { if (imgs.length === 0) onImageLoaded?.(); }, []);
  useEffect(() => { if (loaded >= imgs.length && imgs.length > 0) onImageLoaded?.(); }, [loaded, imgs.length]);

  const signers = [
    { name: tpl.coordinatorName || 'M.A. Juan J. Reyes', title: tpl.coordinatorTitle || 'Coordinador CAEDUC', sigUrl: tpl.signatureUrl },
    ...selectedCommissions.map(c => ({ name: c.signer_name, title: c.signer_title, sigUrl: c.signature_url })),
    ...(data.includePresident && (tpl.presidenteSignatureUrl || tpl.presidenteName)
      ? [{ name: tpl.presidenteName || 'Presidenta', title: tpl.presidenteTitle || 'Presidenta Junta Directiva', sigUrl: tpl.presidenteSignatureUrl }]
      : []),
  ];
  const sigPerRow = signers.length <= 3 ? signers.length : Math.ceil(signers.length / 2);
  const sigRows   = signers.length <= 3 ? [signers] : [signers.slice(0, sigPerRow), signers.slice(sigPerRow)];

  const fs  = (id) => P[id]?.fs  ?? DEFAULT_POSITIONS[id].fs;
  const fs2 = (id) => P[id]?.fs2 ?? DEFAULT_POSITIONS[id].fs2 ?? 14;
  const commStyle = { fontSize: fs2('titleBlock'), color: '#333', fontStyle: 'italic', lineHeight: 1.6, textAlign: 'center' };

  return (
    <div ref={certRef} style={{ width: CANVAS_W, height: CANVAS_H, position: 'relative', fontFamily: "'Georgia','Times New Roman',serif", background: '#f0ede8', overflow: 'hidden' }}>
      {/* Color strips */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 30, display: 'flex', flexDirection: 'column' }}>
        {[['#e8c03a','18%'],['#1e5c8b','18%'],['#d63384','18%'],['#e8c03a','18%'],['#5bb363','18%'],['#d63384','10%']].map(([bg, h], i) => (
          <div key={i} style={{ background: bg, height: h }} />
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 75% 75%, rgba(200,195,185,0.2) 0%, transparent 55%)' }} />

      {/* Logo CPG — posición desde layout */}
      {tpl.logoCpgUrl && (
        <img src={tpl.logoCpgUrl} alt="CPG" crossOrigin="anonymous"
          style={{ position: 'absolute', left: P.logoCpg.x, top: P.logoCpg.y, width: P.logoCpg.w, height: P.logoCpg.h, objectFit: 'contain' }}
          onLoad={onLoad} onError={onLoad} />
      )}
      {/* Logo CAEDUC — posición desde layout */}
      {tpl.logoCaeducUrl && (
        <img src={tpl.logoCaeducUrl} alt="CAEDUC" crossOrigin="anonymous"
          style={{ position: 'absolute', left: P.logoCaeduc.x, top: P.logoCaeduc.y, width: P.logoCaeduc.w, height: P.logoCaeduc.h, objectFit: 'contain' }}
          onLoad={onLoad} onError={onLoad} />
      )}
      {/* Logos de comisiones adicionales — posición desde layout */}
      {selectedCommissions.map((c, i) => c.logo_url ? (
        <img key={`commlogo-${i}`} src={c.logo_url} alt={c.commission_name} crossOrigin="anonymous"
          style={{
            position: 'absolute',
            left: (P[`commLogo_${i}`] ?? DEFAULT_POSITIONS[`commLogo_${i}`] ?? DEFAULT_POSITIONS.commLogo_0).x,
            top:  (P[`commLogo_${i}`] ?? DEFAULT_POSITIONS[`commLogo_${i}`] ?? DEFAULT_POSITIONS.commLogo_0).y,
            width: (P[`commLogo_${i}`] ?? DEFAULT_POSITIONS[`commLogo_${i}`] ?? DEFAULT_POSITIONS.commLogo_0).w,
            height:(P[`commLogo_${i}`] ?? DEFAULT_POSITIONS[`commLogo_${i}`] ?? DEFAULT_POSITIONS.commLogo_0).h,
            objectFit: 'contain',
          }}
          onLoad={onLoad} onError={onLoad} />
      ) : null)}

      {/* Junta Directiva */}
      <div style={{ position: 'absolute', left: P.boardText.x, top: P.boardText.y, width: P.boardText.w, textAlign: 'center' }}>
        <span style={{ color: '#c41f6b', fontSize: fs('boardText'), fontStyle: 'italic', fontWeight: 700, wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
          {tpl.boardText || 'Junta Directiva 2025-2027'}
        </span>
      </div>

      {/* Título y comisiones */}
      <div style={{ position: 'absolute', left: P.titleBlock.x, top: P.titleBlock.y, width: P.titleBlock.w, textAlign: 'center' }}>
        {/* Línea principal (CAEDUC u otra institución) — vacía si el usuario la borró */}
        {data.caeducLine ? <div style={commStyle}>{data.caeducLine}</div> : null}
        {/* Comisiones adicionales */}
        {selectedCommissions.map((c, i) => (
          <div key={c.id} style={commStyle}>
            {data.commissionPrefix ? `${data.commissionPrefix} ` : ''}{c.commission_name}
          </div>
        ))}
        {/* Transición hacia el título — vacía si el usuario la borró */}
        {data.conferText ? (
          <div style={{ fontSize: fs2('titleBlock'), color: '#555', fontStyle: 'italic', lineHeight: 1.4, textAlign: 'center', marginTop: 6 }}>
            {data.conferText}
          </div>
        ) : null}
        {/* Título principal */}
        <div style={{ fontSize: fs('titleBlock'), fontWeight: 700, color: '#1e5c8b', marginTop: 4, letterSpacing: '0.03em', wordWrap: 'break-word' }}>
          {data.certTitle || 'Acreditación de Voluntario'}
        </div>
        {/* Validez + horas */}
        <div style={{ fontSize: fs2('titleBlock'), color: '#666', marginTop: 4, textAlign: 'center' }}>
          {data.validLabel || 'válido de'} {data.validFrom} a {data.validTo}
          {data.totalHours && (
            <span style={{ marginLeft: 10, fontWeight: 700, color: '#1e5c8b' }}>· {data.totalHours} horas acreditadas</span>
          )}
        </div>
      </div>

      {/* Nombre del acreditado */}
      <div style={{ position: 'absolute', left: P.recipientBlock.x, top: P.recipientBlock.y, width: P.recipientBlock.w, textAlign: 'center' }}>
        {data.haceConstarLabel ? (
          <div style={{ fontSize: fs2('recipientBlock'), color: '#555' }}>{data.haceConstarLabel}</div>
        ) : null}
        <div style={{ fontSize: fs('recipientBlock'), fontStyle: 'italic', fontWeight: 700, color: '#1a1a2e', marginTop: 3, lineHeight: 1.1, wordWrap: 'break-word' }}>
          {data.recipientName || '[Nombre del acreditado]'}
        </div>
        <div style={{ fontSize: fs2('recipientBlock'), color: '#555', marginTop: 3 }}>
          {data.collegiateLabel ? `${data.collegiateLabel} ` : ''}<strong>{data.collegiateNumber || '----'}</strong>
        </div>
      </div>

      {/* Texto descriptivo */}
      <div style={{ position: 'absolute', left: P.bodyText.x, top: P.bodyText.y, width: P.bodyText.w, fontSize: fs('bodyText'), color: '#444', textAlign: 'center', lineHeight: 1.4, wordWrap: 'break-word' }}>
        {data.bodyText}
      </div>

      {/* Capacitaciones */}
      <div style={{ position: 'absolute', left: P.trainingsBlock.x, top: P.trainingsBlock.y, width: P.trainingsBlock.w, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.trainings.filter(t => t.title || t.aval).map((t, i) => (
          <div key={i} style={{ background: 'rgba(30,92,139,0.06)', border: '1px solid rgba(30,92,139,0.25)', paddingLeft: 10, paddingTop: 4, paddingBottom: 4, paddingRight: 10, borderRadius: 4, textAlign: 'center' }}>
            <div style={{ fontSize: fs('trainingsBlock'), fontWeight: 700, color: '#1e5c8b', letterSpacing: '0.02em' }}>{i + 1}. {t.title}</div>
            <div style={{ fontSize: Math.max(8, fs('trainingsBlock') * 0.9), color: '#555', marginTop: 2, lineHeight: 1.35 }}>
              {t.dateRange && <span>Llevado a cabo {t.dateRange} ({t.modality})</span>}
              {t.hours && <span>, con una duración de <strong>{t.hours} horas</strong> en total.</span>}
              {t.placeDate && <span> {t.placeDate}.</span>}
              {t.aval && <span style={{ marginLeft: 6, fontWeight: 700, color: '#c41f6b' }}>Aval {t.aval}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Firmas — doble de alta, pegada a la línea */}
      <div style={{ position: 'absolute', left: P.signaturesBlock.x, top: P.signaturesBlock.y, width: P.signaturesBlock.w }}>
        {sigRows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', justifyContent: row.length === 1 ? 'center' : 'space-around', alignItems: 'flex-end', gap: 12, marginBottom: ri < sigRows.length - 1 ? 14 : 0 }}>
            {row.map((s, si) => (
              <div key={si} style={{ textAlign: 'center', minWidth: 150, maxWidth: 220 }}>
                {s.sigUrl && (
                  <img src={s.sigUrl} alt="Firma" crossOrigin="anonymous"
                    style={{ width: 170, height: 110, objectFit: 'contain', display: 'block', margin: '0 auto', marginBottom: 0 }}
                    onLoad={onLoad} onError={onLoad} />
                )}
                <div style={{ borderTop: '1px solid #999', paddingTop: 3, marginTop: s.sigUrl ? 0 : 110 }}>
                  <div style={{ fontSize: fs('signaturesBlock'), fontWeight: 700, color: '#1a1a2e' }}>{s.name}</div>
                  <div style={{ fontSize: Math.max(8, fs('signaturesBlock') * 0.9), color: '#666' }}>{s.title}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Sello */}
      {tpl.sealUrl && (
        <img src={tpl.sealUrl} alt="Sello" crossOrigin="anonymous"
          style={{ position: 'absolute', left: P.seal.x, top: P.seal.y, width: P.seal.w, height: P.seal.h, objectFit: 'contain', opacity: 0.8 }}
          onLoad={onLoad} onError={onLoad} />
      )}

      {/* QR */}
      <div style={{ position: 'absolute', left: P.qrBlock.x, top: P.qrBlock.y, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <img src={getCertQrUrl(certCode)} alt="QR" style={{ width: P.qrBlock.w, height: P.qrBlock.h - 16 }} />
        <div style={{ fontSize: fs('qrBlock'), color: '#888', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{certCode}</div>
      </div>

      {/* Fecha */}
      <div style={{ position: 'absolute', left: P.dateText.x, top: P.dateText.y, fontSize: fs('dateText'), color: '#888', textAlign: 'center', width: P.dateText.w }}>
        {data.dateLabel ? `${data.dateLabel} ` : ''}{dateFormatted}
      </div>
    </div>
  );
}

// ── Preview interactivo — usa ref INTERNO para display, NO para PDF ──────────
function InteractiveCertPreview({ positions, onPositionChange, selectedEl, onSelectEl, elements, ...canvasProps }) {
  const containerRef = useRef(null);
  const displayRef   = useRef(null); // solo para mostrar, no se usa en html2canvas
  const [cw, setCw] = useState(640);
  const drag = useRef(null);

  useEffect(() => {
    const update = () => { if (containerRef.current) setCw(containerRef.current.clientWidth); };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const scale = cw / CANVAS_W;

  const toCanvas = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const src = e.touches?.[0] ?? e;
    return { x: (src.clientX - rect.left) / scale, y: (src.clientY - rect.top) / scale };
  }, [scale]);

  const onDown = useCallback((id, mode, e) => {
    e.preventDefault(); e.stopPropagation();
    onSelectEl(id);
    const { x, y } = toCanvas(e);
    const p = positions[id];
    drag.current = { id, mode, sx: x, sy: y, ex: p.x, ey: p.y, ew: p.w, eh: p.h };
  }, [positions, toCanvas, onSelectEl]);

  const onMove = useCallback((e) => {
    if (!drag.current) return;
    e.preventDefault();
    const { x, y } = toCanvas(e);
    const d = drag.current;
    const dx = x - d.sx, dy = y - d.sy;
    const upd = { ...positions[d.id] };
    if (d.mode === 'drag') { upd.x = Math.max(0, d.ex + dx); upd.y = Math.max(0, d.ey + dy); }
    else                   { upd.w = Math.max(40, d.ew + dx); upd.h = Math.max(15, d.eh + dy); }
    onPositionChange(d.id, upd);
  }, [positions, toCanvas, onPositionChange]);

  const onUp = useCallback(() => { drag.current = null; }, []);

  return (
    <div ref={containerRef}
      style={{ position: 'relative', width: '100%', height: CANVAS_H * scale, userSelect: 'none', touchAction: 'none', overflow: 'hidden', borderRadius: 12, border: '1px solid #374151' }}
      onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      onTouchMove={onMove} onTouchEnd={onUp}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, transformOrigin: 'top left', transform: `scale(${scale})`, pointerEvents: 'none' }}>
        <SpecialCertCanvas certRef={displayRef} positions={positions} {...canvasProps} />
      </div>
      {elements.map(({ id, label, color }) => {
        const p = positions[id] ?? DEFAULT_POSITIONS[id] ?? { x: 0, y: 0, w: 100, h: 80 };
        const isSel = selectedEl === id;
        return (
          <div key={id}
            style={{ position: 'absolute', left: p.x * scale, top: p.y * scale, width: p.w * scale, height: p.h * scale, boxSizing: 'border-box',
              border: isSel ? `2px solid ${color}` : '1px dashed rgba(160,160,160,0.22)',
              background: isSel ? `${color}18` : 'transparent', cursor: 'move' }}
            onMouseDown={e => onDown(id, 'drag', e)}
            onTouchStart={e => onDown(id, 'drag', e)}
          >
            {isSel && (
              <>
                <div style={{ position: 'absolute', top: -18, left: 0, background: color, color: '#fff', fontSize: 9, padding: '2px 5px', borderRadius: 3, whiteSpace: 'nowrap', fontFamily: 'sans-serif', pointerEvents: 'none' }}>
                  ✥ {label}
                </div>
                <div
                  style={{ position: 'absolute', bottom: -7, right: -7, width: 14, height: 14, background: color, borderRadius: 2, cursor: 'nwse-resize' }}
                  onMouseDown={e => { e.stopPropagation(); onDown(id, 'resize', e); }}
                  onTouchStart={e => { e.stopPropagation(); onDown(id, 'resize', e); }}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function VolunteerAccreditationManager({ certTemplate, reprintCert, onReprintConsumed, autoDownload = false, onAutoDownloadConsumed }) {
  const [tab, setTab] = useState('individual');
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  // Individual cert lookup
  const [singleNum, setSingleNum] = useState('');
  const [singleLookup, setSingleLookup] = useState(null);
  const [singleLooking, setSingleLooking] = useState(false);
  // Layout editor
  const [positions, setPositions] = useState({ ...DEFAULT_POSITIONS });
  const [selectedEl, setSelectedEl] = useState(null);
  // Commissions
  const [availableCommissions, setAvailableCommissions] = useState([]);
  // UI state
  const [imageLoaded, setImageLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savedCode, setSavedCode] = useState(null);
  const [msg, setMsg] = useState(null);
  const [savingLayout, setSavingLayout] = useState(false);
  // Bulk state
  const [bulkInput, setBulkInput] = useState('');
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkLooking, setBulkLooking] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState('');
  const [bulkAllPdfUrl, setBulkAllPdfUrl] = useState(null);

  const certRef = useRef(null);
  // Ref para fijar el código durante la captura y evitar que Math.random() cambie en cada re-render
  const certCodeRef = useRef(null);
  const [autoDownloadPending, setAutoDownloadPending] = useState(false);

  const tpl = { ...certTemplate };
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
  const genCode = (num) => `VOL-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(num).padStart(4,'0')}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
  // certCode: usa el ref fijado durante generación, luego savedCode, luego genera uno temporal estable
  const certCode = certCodeRef.current ?? savedCode ?? genCode(form.collegiateNumber || '0000');

  // ── Load commissions ──
  useEffect(() => {
    if (!supabase) return;
    supabase.from('cpg_commissions').select('*').eq('active', true).order('display_order').then(({ data }) => {
      setAvailableCommissions(data || []);
    });
  }, []);

  // ── Aplicar configuración guardada ──
  const applySettings = useCallback((saved) => {
    if (!saved) return;
    if (saved.positions) {
      const merged = {};
      Object.keys(DEFAULT_POSITIONS).forEach(id => {
        merged[id] = { ...DEFAULT_POSITIONS[id], ...(saved.positions[id] || {}) };
      });
      setPositions(merged);
    }
    if (saved.formDefaults) {
      setForm(prev => ({ ...DEFAULT_FORM, ...saved.formDefaults, recipientName: '', collegiateNumber: '' }));
    }
  }, []);

  // ── Cargar ajustes: localStorage (primario) + Supabase (backup cross-device) ──
  useEffect(() => {
    // 1. localStorage — siempre disponible, instantáneo
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { applySettings(JSON.parse(raw)); }
    } catch {}

    // 2. Supabase — por si se guardó desde otro dispositivo
    if (supabase) {
      supabase.rpc('get_cpg_setting', { p_key: SETTINGS_KEY })
        .then(({ data }) => {
          if (data) {
            try {
              const parsed = typeof data === 'string' ? JSON.parse(data) : data;
              applySettings(parsed);
              // Sincronizar al localStorage local
              localStorage.setItem(LS_KEY, JSON.stringify(parsed));
            } catch {}
          }
        })
        .catch(() => {});
    }
  }, [applySettings]);

  // Cuando se viene de una reimpresión, usar el snapshot guardado en BD (firmas exactas del momento de emisión)
  const [reprintCommissionsSnap, setReprintCommissionsSnap] = useState(null);
  const selectedCommissions = reprintCommissionsSnap ?? availableCommissions.filter(c => form.selectedCommissions.includes(c.id));

  // Elementos dinámicos: logos fijos + logos de comisiones que tengan logo_url + elementos de texto
  const elements = [
    ...LOGO_ELEMENTS_STATIC,
    ...selectedCommissions.reduce((acc, c, i) => {
      if (c.logo_url) acc.push({ id: `commLogo_${i}`, label: `Logo: ${(c.commission_name || '').slice(0, 18)}`, color: '#2dd4bf', isLogo: true });
      return acc;
    }, []),
    ...TEXT_ELEMENTS,
  ];

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleCommission = (id) => {
    setReprintCommissionsSnap(null); // salir del modo snapshot al editar comisiones
    setForm(p => ({
      ...p, selectedCommissions: p.selectedCommissions.includes(id)
        ? p.selectedCommissions.filter(x => x !== id)
        : [...p.selectedCommissions, id],
    }));
  };
  const setTraining = (i, k, v) => setForm(p => { const ts = [...p.trainings]; ts[i] = { ...ts[i], [k]: v }; return { ...p, trainings: ts }; });
  const onPositionChange = useCallback((id, upd) => setPositions(prev => ({ ...prev, [id]: upd })), []);
  const adjFs = useCallback((id, delta) => setPositions(prev => ({
    ...prev, [id]: { ...prev[id], fs: Math.max(6, (prev[id].fs ?? DEFAULT_POSITIONS[id].fs) + delta) }
  })), []);
  const adjFs2 = useCallback((id, delta) => setPositions(prev => ({
    ...prev, [id]: { ...prev[id], fs2: Math.max(6, (prev[id].fs2 ?? DEFAULT_POSITIONS[id].fs2 ?? 14) + delta) }
  })), []);

  // ── Lookup single ──
  const lookupSingleByNum = async (num) => {
    if (!num) return;
    setSingleLooking(true); setSingleLookup(null);
    try {
      const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: num }) });
      const data = await res.json();
      if (data.error) { setSingleLookup({ error: data.error }); }
      else {
        setSingleLookup({ num, name: data.nombre, status: data.estatus });
        setForm(p => ({ ...p, recipientName: data.nombre, collegiateNumber: num }));
      }
    } catch (e) { setSingleLookup({ error: e.message }); }
    setSingleLooking(false);
  };

  const lookupSingle = () => lookupSingleByNum(singleNum.trim());

  // ── Reimpresión desde tabla de admin ──
  // Carga todos los datos del registro original: no genera código nuevo ni llama al API externo.
  useEffect(() => {
    if (!reprintCert) return;
    const { recipient_name, collegiate_number, certificate_code, status, cert_data, commissions_snapshot } = reprintCert;
    const num = String(collegiate_number).trim();

    setTab('individual');
    setSingleNum(num);
    setSingleLookup({ num, name: recipient_name, status: status || 'ACTIVO' });
    setSavedCode(certificate_code); // previene crear un registro duplicado al descargar
    setImageLoaded(false);
    setMsg({ type: 'info', text: `Reimprimiendo acreditación ${certificate_code}. Los datos son los del registro original.` });

    // Cargar los campos del certificado original — si cert_data no tiene el campo (cert viejo), usa el valor actual del form
    setForm(p => ({
      ...p,
      recipientName:       recipient_name,
      collegiateNumber:    num,
      certTitle:           cert_data?.certTitle           ?? p.certTitle,
      totalHours:          cert_data?.totalHours          ?? p.totalHours,
      commissionName:      cert_data?.commissionName      ?? p.commissionName,
      validFrom:           cert_data?.validFrom           ?? p.validFrom,
      validTo:             cert_data?.validTo             ?? p.validTo,
      bodyText:            cert_data?.bodyText            ?? p.bodyText,
      trainings:           cert_data?.trainings           ?? p.trainings,
      includePresident:    cert_data?.includePresident    ?? p.includePresident,
      selectedCommissions: cert_data?.selectedCommissions ?? p.selectedCommissions,
      // Textos del diploma — solo se restauran si estaban guardados (nuevos registros)
      ...(cert_data?.caeducLine        !== undefined && { caeducLine:        cert_data.caeducLine }),
      ...(cert_data?.commissionPrefix  !== undefined && { commissionPrefix:  cert_data.commissionPrefix }),
      ...(cert_data?.conferText        !== undefined && { conferText:        cert_data.conferText }),
      ...(cert_data?.validLabel        !== undefined && { validLabel:        cert_data.validLabel }),
      ...(cert_data?.haceConstarLabel  !== undefined && { haceConstarLabel:  cert_data.haceConstarLabel }),
      ...(cert_data?.collegiateLabel   !== undefined && { collegiateLabel:   cert_data.collegiateLabel }),
      ...(cert_data?.dateLabel         !== undefined && { dateLabel:         cert_data.dateLabel }),
    }));

    // Si cert_data no tiene los campos de texto (registro viejo), NO auto-descargar:
    // el editor se abrirá para que el usuario ajuste los textos antes de imprimir
    const hasFullCertData = cert_data?.caeducLine !== undefined;
    if (autoDownload && hasFullCertData) setAutoDownloadPending(true);

    // Usar el snapshot de comisiones exacto (firmas y datos del momento de emisión)
    if (commissions_snapshot?.length) {
      setReprintCommissionsSnap(commissions_snapshot);
    }

    onReprintConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reprintCert]);

  const resetSingle = () => {
    setSingleNum(''); setSingleLookup(null); setSavedCode(null); setImageLoaded(false); setMsg(null);
    setReprintCommissionsSnap(null); setAutoDownloadPending(false);
    setForm(p => ({ ...p, recipientName: '', collegiateNumber: '' }));
  };

  // ── Auto-descarga cuando se solicita desde botón imprimir en tabla admin ──
  // Se activa cuando: hay pendiente + imágenes cargadas + datos del colegiado disponibles + no generando
  useEffect(() => {
    if (!autoDownloadPending || !imageLoaded || !singleLookup?.name || generating) return;
    setAutoDownloadPending(false);
    onAutoDownloadConsumed?.();
    // Pequeño delay para que React termine el render con el certCode correcto
    setTimeout(() => handleDownload(), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDownloadPending, imageLoaded, singleLookup?.name, generating]);

  // ── Guardar: localStorage primario (siempre funciona) + Supabase backup ──
  const saveLayout = async () => {
    setSavingLayout(true);
    try {
      const formDefaults = {
        certTitle: form.certTitle, totalHours: form.totalHours,
        commissionName: form.commissionName, validFrom: form.validFrom, validTo: form.validTo,
        bodyText: form.bodyText, includePresident: form.includePresident,
        selectedCommissions: form.selectedCommissions, trainings: form.trainings,
      };
      const payload = { positions, formDefaults };

      // Primario: localStorage — síncrono, nunca falla
      localStorage.setItem(LS_KEY, JSON.stringify(payload));

      // Backup: Supabase — asíncrono, best-effort (para sincronizar entre dispositivos)
      if (supabase) {
        supabase.rpc('save_cpg_setting', {
          p_key: SETTINGS_KEY,
          p_value: JSON.stringify(payload),
        }).catch(() => {});
      }

      setMsg({ type: 'success', text: '✓ Estilo y datos guardados correctamente.' });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setMsg({ type: 'error', text: 'Error al guardar: ' + e.message }); }
    setSavingLayout(false);
  };

  // ── HTML2canvas helper — captura desde el canvas OCULTO (sin transform) ──
  const captureCanvas = () => new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        if (!certRef.current) throw new Error('Canvas no disponible');
        const canvas = await html2canvas(certRef.current, {
          scale: 2,                   // scale:2 → ~4MB JPEG vs 31MB PNG anterior
          useCORS: true, allowTaint: true, backgroundColor: '#f0ede8', logging: false,
          width: CANVAS_W, height: CANVAS_H, windowWidth: CANVAS_W, windowHeight: CANVAS_H,
          x: 0, y: 0, scrollX: 0, scrollY: 0,
        });
        resolve(canvas);
      } catch (e) { reject(e); }
    }, 600);
  });

  // ── Download individual cert ──
  const handleDownload = async () => {
    if (!singleLookup?.name) { setMsg({ type: 'error', text: 'Primero consulta el número de colegiado.' }); return; }
    if (!imageLoaded) { setMsg({ type: 'error', text: 'Espera a que cargue la vista previa.' }); return; }
    setGenerating(true); setMsg(null);
    try {
      const code = savedCode ?? genCode(singleLookup.num);
      if (!savedCode && supabase) {
        const { error } = await supabase.from('cpg_certificates').insert({
          certificate_code: code, collegiate_number: singleLookup.num,
          recipient_name: singleLookup.name, status: singleLookup.status || 'ACTIVO',
          video_id: null,
          video_title: `${form.certTitle} — ${form.commissionName}`,
          video_duration: form.totalHours ? Number(form.totalHours) : null,
          issued_at: now.toISOString(),
          verify_url: `${APP_URL}/?cert=${code}`,
          cert_type: 'volunteer',
          cert_data: {
            certTitle: form.certTitle, totalHours: form.totalHours,
            commissionName: form.commissionName, validFrom: form.validFrom, validTo: form.validTo,
            bodyText: form.bodyText, trainings: form.trainings,
            includePresident: form.includePresident, selectedCommissions: form.selectedCommissions,
            // Campos de texto del diploma — guardados para reimpresión exacta
            caeducLine: form.caeducLine, commissionPrefix: form.commissionPrefix,
            conferText: form.conferText, validLabel: form.validLabel,
            haceConstarLabel: form.haceConstarLabel, collegiateLabel: form.collegiateLabel,
            dateLabel: form.dateLabel,
          },
          commissions_snapshot: selectedCommissions.map(c => ({ id: c.id, commission_name: c.commission_name, signer_name: c.signer_name, signer_title: c.signer_title, signature_url: c.signature_url, logo_url: c.logo_url || null })),
        });
        if (error && error.code !== '23505') throw error;
        setSavedCode(code);
      }
      const canvas = await captureCanvas();
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save(`Acreditacion_${singleLookup.name.replace(/\s+/g,'_')}_${code}.pdf`);
      setMsg({ type: 'success', text: '¡Acreditación descargada y guardada en el registro!' });
    } catch (e) { setMsg({ type: 'error', text: 'Error: ' + e.message }); }
    setGenerating(false);
  };

  // ── Bulk lookup ──
  const handleBulkLookup = async () => {
    const nums = bulkInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (!nums.length) return;
    setBulkLooking(true); setBulkResults([]); setBulkAllPdfUrl(null);
    const results = await Promise.allSettled(nums.map(async (num) => {
      try {
        const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: num }) });
        const data = await res.json();
        if (data.error) return { num, error: data.error, include: false };
        return { num, name: data.nombre, status: data.estatus, include: true, generated: false, pdfDataUrl: null, code: null };
      } catch (e) { return { num, error: e.message, include: false }; }
    }));
    setBulkResults(results.map(r => r.value ?? { num: '?', error: 'Error', include: false }));
    setBulkLooking(false);
  };

  // ── Bulk generate ──
  const handleBulkGenerate = async () => {
    const toGen = bulkResults.filter(r => r.include && r.name && !r.generated);
    if (!toGen.length) { setMsg({ type: 'error', text: 'No hay personas marcadas para generar.' }); return; }
    setBulkGenerating(true); setMsg(null); setBulkAllPdfUrl(null);
    try {
      const allPdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      const pw = allPdf.internal.pageSize.getWidth();
      const ph = allPdf.internal.pageSize.getHeight();

      for (let i = 0; i < toGen.length; i++) {
        const r = toGen[i];
        setBulkProgress(`Generando ${i + 1} de ${toGen.length}: ${r.name}…`);
        const code = genCode(r.num);

        // Save to DB
        if (supabase) {
          await supabase.from('cpg_certificates').insert({
            certificate_code: code, collegiate_number: r.num, recipient_name: r.name,
            status: r.status || 'ACTIVO', video_id: null,
            video_title: `${form.certTitle} — ${form.commissionName}`,
            video_duration: form.totalHours ? Number(form.totalHours) : null,
            issued_at: now.toISOString(), verify_url: `${APP_URL}/?cert=${code}`,
            cert_type: 'volunteer',
            cert_data: {
              certTitle: form.certTitle, totalHours: form.totalHours,
              commissionName: form.commissionName, validFrom: form.validFrom, validTo: form.validTo,
              bodyText: form.bodyText, trainings: form.trainings,
              includePresident: form.includePresident, selectedCommissions: form.selectedCommissions,
              // Campos de texto del diploma — guardados para reimpresión exacta
              caeducLine: form.caeducLine, commissionPrefix: form.commissionPrefix,
              conferText: form.conferText, validLabel: form.validLabel,
              haceConstarLabel: form.haceConstarLabel, collegiateLabel: form.collegiateLabel,
              dateLabel: form.dateLabel,
            },
            commissions_snapshot: selectedCommissions.map(c => ({ id: c.id, commission_name: c.commission_name, signer_name: c.signer_name, signer_title: c.signer_title, signature_url: c.signature_url, logo_url: c.logo_url || null })),
          }).then(() => {});
        }

        // Fijar el código en el ref ANTES de forzar el re-render, para que certCode
        // use este valor exacto (no un random diferente generado en el próximo render)
        certCodeRef.current = code;
        setSavedCode(code);
        setForm(prev => ({ ...prev, recipientName: r.name, collegiateNumber: r.num }));
        const canvas = await captureCanvas(); // 600ms → React re-renderiza con certCode = code
        certCodeRef.current = null;
        const imgData = canvas.toDataURL('image/jpeg', 0.93);

        // Individual PDF
        const singlePdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
        singlePdf.addImage(imgData, 'JPEG', 0, 0, pw, ph);
        const singleDataUrl = singlePdf.output('datauristring');

        // Add page to all-in-one PDF
        if (i > 0) allPdf.addPage();
        allPdf.addImage(imgData, 'JPEG', 0, 0, pw, ph);

        setBulkResults(prev => prev.map(x => x.num === r.num ? { ...x, generated: true, code, pdfDataUrl: singleDataUrl } : x));
      }

      // All-in-one download
      const allDataUrl = allPdf.output('datauristring');
      setBulkAllPdfUrl(allDataUrl);
      setBulkProgress('');
      setSavedCode(null); // Limpiar después del bloque para no contaminar la siguiente generación
      certCodeRef.current = null;
      setMsg({ type: 'success', text: `¡${toGen.length} acreditaciones generadas y guardadas en el registro!` });
    } catch (e) {
      setSavedCode(null);
      certCodeRef.current = null;
      setMsg({ type: 'error', text: 'Error: ' + e.message });
    }
    setBulkGenerating(false);
    setBulkProgress('');
  };

  const downloadBulkAll = () => {
    if (!bulkAllPdfUrl) return;
    const link = document.createElement('a');
    link.href = bulkAllPdfUrl;
    link.download = `Acreditaciones_Bloque_${now.toISOString().slice(0,10)}.pdf`;
    link.click();
  };

  const downloadSingleFromBulk = (r) => {
    if (!r.pdfDataUrl) return;
    const link = document.createElement('a');
    link.href = r.pdfDataUrl;
    link.download = `Acreditacion_${r.name.replace(/\s+/g,'_')}_${r.code}.pdf`;
    link.click();
  };

  const hasPresident = tpl.presidenteSignatureUrl || tpl.presidenteName;

  return (
    <div className="p-6 space-y-6">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 border ${msg.type === 'success' ? 'bg-green-900/20 border-green-700 text-green-300' : msg.type === 'info' ? 'bg-blue-900/20 border-blue-700 text-blue-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
          {msg.type === 'success' ? <CheckCircle size={15}/> : msg.type === 'info' ? <Printer size={15}/> : <XCircle size={15}/>}
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-black/40 rounded-xl p-1 w-fit">
        {[{ id: 'individual', label: 'Individual', icon: Award }, { id: 'bulk', label: 'En bloque', icon: Users }].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${tab === id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Icon size={14}/>{label}
          </button>
        ))}
      </div>

      {/* ══ CONFIGURACIÓN COMÚN ══ */}
      <div className="space-y-4">
        {/* Título del certificado especial + Total horas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Título del certificado especial <span className="text-red-400">*</span></label>
            <input value={form.certTitle} onChange={e => setField('certTitle', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="Acreditación de Voluntario" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Total horas acreditadas</label>
            <input value={form.totalHours} onChange={e => setField('totalHours', e.target.value)}
              type="number" min="0"
              className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="44" />
            <p className="text-[10px] text-gray-600 mt-1">Para contabilización en créditos académicos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Comisión acreditante <span className="text-red-400">*</span></label>
            <input value={form.commissionName} onChange={e => setField('commissionName', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Válido desde</label>
            <input value={form.validFrom} onChange={e => setField('validFrom', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="abril 2026" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Válido hasta</label>
            <input value={form.validTo} onChange={e => setField('validTo', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="abril 2027" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Texto explicativo del certificado</label>
            <textarea value={form.bodyText} onChange={e => setField('bodyText', e.target.value)} rows={2}
              className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none resize-none" />
          </div>
        </div>
      </div>

      {/* ══ TEXTOS DEL DIPLOMA ══ */}
      <div>
        <h3 className="text-white font-bold text-sm mb-1">Textos del diploma</h3>
        <p className="text-xs text-gray-500 mb-3">Edita cada línea de texto que aparece en el certificado. Todos se guardan con "Guardar estilo".</p>
        <div className="bg-black/20 border border-gray-800 rounded-xl p-4 space-y-3">
          {/* Fila CAEDUC */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              <span className="text-gray-400 font-semibold">Línea 1 —</span> Primera línea (CAEDUC / institución principal)
            </label>
            <input value={form.caeducLine} onChange={e => setField('caeducLine', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none" />
          </div>
          {/* Prefijo de comisiones adicionales */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              <span className="text-gray-400 font-semibold">Línea 2 —</span> Prefijo antes de cada comisión adicional
            </label>
            <input value={form.commissionPrefix} onChange={e => setField('commissionPrefix', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="en conjunto con la" />
          </div>
          {/* Texto de transición */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              <span className="text-gray-400 font-semibold">Transición —</span> Texto antes del título del diploma
            </label>
            <input value={form.conferText} onChange={e => setField('conferText', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="confieren la siguiente:" />
          </div>
          {/* Prefijo validez */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              <span className="text-gray-400 font-semibold">Validez —</span> Etiqueta antes de las fechas (se une: "[validLabel] [desde] a [hasta]")
            </label>
            <input value={form.validLabel} onChange={e => setField('validLabel', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="válido de" />
          </div>
          {/* Etiqueta antes del nombre */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              <span className="text-gray-400 font-semibold">Antes del nombre —</span> Texto introductorio al nombre del acreditado
            </label>
            <input value={form.haceConstarLabel} onChange={e => setField('haceConstarLabel', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="y hace constar que el/la voluntario/a:" />
          </div>
          {/* Etiqueta colegiado */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              <span className="text-gray-400 font-semibold">Colegiado —</span> Etiqueta antes del número de colegiado
            </label>
            <input value={form.collegiateLabel} onChange={e => setField('collegiateLabel', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="Con número de colegiado activo:" />
          </div>
          {/* Etiqueta de fecha */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              <span className="text-gray-400 font-semibold">Fecha —</span> Texto antes de la fecha de emisión
            </label>
            <input value={form.dateLabel} onChange={e => setField('dateLabel', e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none"
              placeholder="Emitido el" />
          </div>
        </div>
      </div>

      {/* Firmas */}
      <div>
        <h3 className="text-white font-bold text-sm mb-3">Firmas a incluir</h3>
        <div className="bg-black/30 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3 opacity-50">
            <CheckCircle size={15} className="text-blue-400 shrink-0"/>
            <div><div className="text-sm text-white">{tpl.coordinatorName || 'M.A. Juan J. Reyes'}</div><div className="text-xs text-gray-500">{tpl.coordinatorTitle || 'Coordinador CAEDUC'} — siempre incluido</div></div>
          </div>
          {availableCommissions.length === 0 && <p className="text-xs text-gray-500 italic">No hay comisiones configuradas.</p>}
          {availableCommissions.map(c => (
            <label key={c.id} className="flex items-center gap-3 cursor-pointer hover:bg-white/5 rounded-lg p-1 -m-1 transition">
              <input type="checkbox" checked={form.selectedCommissions.includes(c.id)} onChange={() => toggleCommission(c.id)} className="w-4 h-4 accent-blue-500" />
              <div className="flex-1"><div className="text-sm text-white">{c.signer_name}</div><div className="text-xs text-gray-500">{c.signer_title} · {c.commission_name}</div></div>
              {c.signature_url ? <img src={c.signature_url} alt="firma" className="h-8 w-16 object-contain bg-white/10 rounded"/> : <span className="text-xs text-gray-600 italic">sin imagen</span>}
            </label>
          ))}
          {hasPresident ? (
            <label className="flex items-center gap-3 cursor-pointer hover:bg-white/5 rounded-lg p-1 -m-1 transition">
              <input type="checkbox" checked={form.includePresident} onChange={e => setField('includePresident', e.target.checked)} className="w-4 h-4 accent-pink-500" />
              <div className="flex-1"><div className="text-sm text-white">{tpl.presidenteName || 'Presidenta'}</div><div className="text-xs text-gray-500">{tpl.presidenteTitle || 'Presidenta Junta Directiva'}</div></div>
              {tpl.presidenteSignatureUrl ? <img src={tpl.presidenteSignatureUrl} alt="firma" className="h-8 w-16 object-contain bg-white/10 rounded"/> : <span className="text-xs text-gray-600 italic">sin imagen</span>}
            </label>
          ) : (
            <p className="text-xs text-gray-500 italic">Configura la firma de la presidenta en "Plantilla de certificado".</p>
          )}
        </div>
      </div>

      {/* Capacitaciones */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-sm">Capacitaciones acreditadas</h3>
          <button onClick={() => setForm(p => ({ ...p, trainings: [...p.trainings, { ...EMPTY_TRAINING }] }))}
            className="flex items-center gap-1.5 bg-blue-800/50 hover:bg-blue-700/60 border border-blue-700/40 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-200 transition">
            <Plus size={13}/> Agregar
          </button>
        </div>
        <div className="space-y-4">
          {form.trainings.map((t, i) => (
            <div key={i} className="bg-black/30 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Capacitación {i+1}</span>
                {form.trainings.length > 1 && <button onClick={() => setForm(p => ({ ...p, trainings: p.trainings.filter((_,idx) => idx !== i) }))} className="text-red-400 hover:text-red-300 transition"><Trash2 size={14}/></button>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Título</label>
                  <input value={t.title} onChange={e => setTraining(i,'title',e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none" placeholder="TALLER: FORMACIÓN BÁSICA..."/>
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">Rango de fechas</label><input value={t.dateRange} onChange={e => setTraining(i,'dateRange',e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none" placeholder="del 21 de octubre al 13 de noviembre 2025"/></div>
                <div><label className="block text-xs text-gray-500 mb-1">Modalidad</label>
                  <select value={t.modality} onChange={e => setTraining(i,'modality',e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none">
                    <option>Virtual</option><option>Presencial</option><option>Virtual sincrónico y asincrónico</option><option>Mixto (virtual y presencial)</option>
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">Horas totales</label><input value={t.hours} onChange={e => setTraining(i,'hours',e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none" placeholder="44"/></div>
                <div><label className="block text-xs text-gray-500 mb-1">Número de aval</label><input value={t.aval} onChange={e => setTraining(i,'aval',e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none" placeholder="CAEDUC-26-2025"/></div>
                <div className="md:col-span-2"><label className="block text-xs text-gray-500 mb-1">Lugar y fecha</label><input value={t.placeDate} onChange={e => setTraining(i,'placeDate',e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none" placeholder="Guatemala, Abril 2026"/></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ TAB INDIVIDUAL ══ */}
      {tab === 'individual' && (
        <div className="space-y-4 border-t border-gray-800 pt-6">
          <h3 className="text-white font-bold text-sm">Datos del acreditado</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Número de colegiado</label>
              <input value={singleNum} onChange={e => { setSingleNum(e.target.value); setSingleLookup(null); setSavedCode(null); }}
                onKeyDown={e => e.key === 'Enter' && lookupSingle()}
                className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Ej. 4661" />
            </div>
            <button onClick={lookupSingle} disabled={singleLooking || !singleNum.trim()}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-bold transition">
              {singleLooking ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>} Consultar
            </button>
          </div>
          {singleLookup?.error && <div className="bg-red-900/20 border border-red-700 rounded-lg px-4 py-2 text-sm text-red-300">{singleLookup.error}</div>}
          {singleLookup?.name && (
            <div className="bg-green-900/20 border border-green-700 rounded-xl px-4 py-3 flex items-center gap-4">
              <CheckCircle size={18} className="text-green-400 shrink-0"/>
              <div>
                <div className="text-white font-bold">{singleLookup.name}</div>
                <div className="text-xs text-gray-400">Colegiado {singleLookup.num} · Estado: <span className={singleLookup.status === 'ACTIVO' ? 'text-green-400' : 'text-red-400'}>{singleLookup.status}</span></div>
              </div>
              <button onClick={resetSingle} className="ml-auto text-xs text-gray-500 hover:text-white transition">Cambiar</button>
            </div>
          )}
          {singleLookup?.name && (
            <button onClick={handleDownload} disabled={generating}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-bold transition">
              {generating ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>}
              {generating ? 'Generando PDF…' : 'Generar y descargar PDF'}
            </button>
          )}
        </div>
      )}

      {/* ══ TAB EN BLOQUE ══ */}
      {tab === 'bulk' && (
        <div className="space-y-4 border-t border-gray-800 pt-6">
          <h3 className="text-white font-bold text-sm flex items-center gap-2"><Users size={15} className="text-blue-400"/> Generación en bloque</h3>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Números de colegiado (uno por línea o separados por coma)</label>
            <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={5}
              className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none resize-none font-mono"
              placeholder={"1234\n5678\n9012\n..."} />
          </div>
          <button onClick={handleBulkLookup} disabled={bulkLooking || !bulkInput.trim()}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-bold transition">
            {bulkLooking ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>}
            {bulkLooking ? 'Consultando…' : 'Consultar colegiados'}
          </button>

          {bulkResults.length > 0 && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left w-10">✓</th>
                      <th className="px-3 py-2 text-left">Colegiado</th>
                      <th className="px-3 py-2 text-left">Nombre</th>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-left">Cert.</th>
                      <th className="px-3 py-2 text-center">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((r, i) => (
                      <tr key={i} className="border-t border-gray-800 hover:bg-gray-900/30">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={r.include} disabled={!!r.error}
                            onChange={() => setBulkResults(prev => prev.map((x, xi) => xi === i ? { ...x, include: !x.include } : x))}
                            className="w-4 h-4 accent-blue-500" />
                        </td>
                        <td className="px-3 py-2 text-white font-mono">{r.num}</td>
                        <td className="px-3 py-2">{r.error ? <span className="text-red-400 text-xs">{r.error}</span> : <span className="text-white">{r.name}</span>}</td>
                        <td className="px-3 py-2"><span className={`text-xs font-bold ${r.status === 'ACTIVO' ? 'text-green-400' : r.status ? 'text-red-400' : 'text-gray-600'}`}>{r.status || '—'}</span></td>
                        <td className="px-3 py-2"><span className={`text-xs ${r.generated ? 'text-green-400' : 'text-gray-600'}`}>{r.generated ? '✓ Listo' : '—'}</span></td>
                        <td className="px-3 py-2 text-center">
                          {r.pdfDataUrl ? (
                            <button onClick={() => downloadSingleFromBulk(r)}
                              className="p-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 rounded transition" title="Descargar PDF individual">
                              <Download size={13}/>
                            </button>
                          ) : <span className="text-gray-700 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleBulkGenerate} disabled={bulkGenerating || !bulkResults.some(r => r.include && r.name)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-bold transition">
                  {bulkGenerating ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>}
                  {bulkGenerating ? (bulkProgress || 'Generando…') : `Generar ${bulkResults.filter(r=>r.include&&r.name).length} acreditaciones`}
                </button>
                {bulkAllPdfUrl && (
                  <button onClick={downloadBulkAll}
                    className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600/60 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition">
                    <Printer size={14}/> Descargar todas en un PDF
                  </button>
                )}
                <button onClick={() => { setBulkResults([]); setBulkAllPdfUrl(null); }} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm transition">Limpiar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ EDITOR DE LAYOUT ══ */}
      <div className="border-t border-gray-800 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-white font-bold text-sm flex items-center gap-2"><Move size={15} className="text-purple-400"/> Editor de posiciones y estilo</h3>
          <div className="flex gap-2">
            <button onClick={() => setPositions({ ...DEFAULT_POSITIONS })}
              className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition">
              Restablecer
            </button>
            <button onClick={saveLayout} disabled={savingLayout}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 border border-emerald-600/60 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition">
              {savingLayout ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
              Guardar estilo
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-600 mb-4">Selecciona un elemento, luego arrástralo o redimensiónalo en la vista previa. Usa los botones +/− para ajustar el tamaño del texto.</p>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Sidebar */}
          <div className="lg:w-52 shrink-0 space-y-1">
            {elements.map(({ id, label, color, isLogo }) => (
              <button key={id} onClick={() => setSelectedEl(selectedEl === id ? null : id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${selectedEl === id ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                style={{ background: selectedEl === id ? `${color}25` : undefined, borderLeft: selectedEl === id ? `3px solid ${color}` : '3px solid transparent' }}>
                {isLogo
                  ? <svg width="10" height="10" viewBox="0 0 10 10" style={{ color, flexShrink: 0 }}><rect x="0" y="0" width="10" height="7" rx="1" fill={color}/><circle cx="3" cy="3" r="1.2" fill="#fff"/></svg>
                  : <Move size={10} style={{ color, flexShrink: 0 }} />
                }
                {label}
              </button>
            ))}

            {selectedEl && (() => {
              const elDef = elements.find(e => e.id === selectedEl);
              const curPos = positions[selectedEl] ?? DEFAULT_POSITIONS[selectedEl] ?? { x: 0, y: 0, w: 100, h: 80 };
              return (
                <div className="mt-2 p-3 bg-black/30 border border-gray-800 rounded-xl text-xs text-gray-400 space-y-2">
                  <p className="text-white font-bold text-[11px]">{elDef?.label}</p>
                  {['x','y','w','h'].map(k => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <span className="uppercase text-gray-600 w-3">{k}</span>
                      <input type="number" value={Math.round(curPos[k] ?? 0)}
                        onChange={e => onPositionChange(selectedEl, { ...curPos, [k]: Number(e.target.value) })}
                        className="w-16 bg-black border border-gray-700 rounded px-1.5 py-0.5 text-white text-xs text-right focus:border-blue-500 outline-none" />
                    </div>
                  ))}
                  {/* Controles de fuente — solo para elementos de texto (no logos) */}
                  {!elDef?.isLogo && (
                    <>
                      <div className="pt-1 border-t border-gray-800">
                        <p className="text-gray-600 text-[10px] mb-1.5">
                          {elDef?.hasFs2 ? 'Título principal' : 'Tamaño de fuente'}
                        </p>
                        <div className="flex items-center gap-2">
                          <button onClick={() => adjFs(selectedEl, -1)}
                            className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-white font-bold transition">
                            <Minus size={11}/>
                          </button>
                          <span className="flex-1 text-center text-white text-sm font-mono font-bold">
                            {curPos.fs ?? DEFAULT_POSITIONS[selectedEl]?.fs ?? 12}
                          </span>
                          <button onClick={() => adjFs(selectedEl, +1)}
                            className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-white font-bold transition">
                            +
                          </button>
                        </div>
                      </div>
                      {elDef?.hasFs2 && (
                        <div className="pt-1 border-t border-gray-800">
                          <p className="text-gray-600 text-[10px] mb-1.5">{elDef.fs2Label}</p>
                          <div className="flex items-center gap-2">
                            <button onClick={() => adjFs2(selectedEl, -1)}
                              className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-white font-bold transition">
                              <Minus size={11}/>
                            </button>
                            <span className="flex-1 text-center text-white text-sm font-mono font-bold">
                              {curPos.fs2 ?? DEFAULT_POSITIONS[selectedEl]?.fs2 ?? 14}
                            </span>
                            <button onClick={() => adjFs2(selectedEl, +1)}
                              className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-white font-bold transition">
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Canvas interactivo — solo para display, usa ref interno */}
          <div className="flex-1 min-w-0">
            <InteractiveCertPreview
              positions={positions}
              onPositionChange={onPositionChange}
              selectedEl={selectedEl}
              onSelectEl={setSelectedEl}
              elements={elements}
              tpl={tpl}
              data={form}
              certCode={certCode}
              dateFormatted={dateFormatted}
              selectedCommissions={selectedCommissions}
              onImageLoaded={() => {}}
            />
            {!imageLoaded && (
              <div className="flex items-center gap-2 text-yellow-400 text-xs mt-2">
                <Loader2 size={13} className="animate-spin"/> Cargando imágenes…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Canvas oculto para captura PDF — en 0,0 detrás del contenido, sin transform ── */}
      <div style={{ position: 'fixed', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, pointerEvents: 'none', zIndex: -9999 }} aria-hidden="true">
        <SpecialCertCanvas
          certRef={certRef}
          tpl={tpl}
          data={form}
          positions={positions}
          certCode={certCode}
          dateFormatted={dateFormatted}
          selectedCommissions={selectedCommissions}
          onImageLoaded={() => setImageLoaded(true)}
        />
      </div>
    </div>
  );
}
