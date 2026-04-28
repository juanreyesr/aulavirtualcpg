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
const ELEMENTS = [
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

const DEFAULT_POSITIONS = {
  boardText:       { x: 395, y: 42,  w: 280, h: 38,  fs: 22 },
  titleBlock:      { x: 50,  y: 155, w: 956, h: 108, fs: 24, fs2: 20 },  // fs2: nombres de comisiones + "válido de..."
  recipientBlock:  { x: 50,  y: 268, w: 956, h: 75,  fs: 28, fs2: 16 },  // fs2: "hace constar" + "con colegiado"
  bodyText:        { x: 50,  y: 348, w: 956, h: 40,  fs: 11 },
  trainingsBlock:  { x: 50,  y: 393, w: 956, h: 215, fs: 11 },
  signaturesBlock: { x: 45,  y: 618, w: 700, h: 140, fs: 11 },
  seal:            { x: 458, y: 695, w: 100, h: 100, fs: 10 },
  qrBlock:         { x: 888, y: 706, w: 118, h: 95,  fs: 7  },
  dateText:        { x: 45,  y: 788, w: 300, h: 20,  fs: 10 },
};

const EMPTY_TRAINING = { title: '', dateRange: '', modality: 'Virtual', hours: '', aval: '', placeDate: '' };
const DEFAULT_FORM = {
  certTitle:          'Acreditación de Voluntario',
  totalHours:         '',
  commissionName:     'Comisión de Atención en Crisis y Apoyo Psicosocial CICAPS',
  validFrom:          'abril 2026',
  validTo:            'abril 2027',
  bodyText:           'Por medio de esta acreditación, se hace constar que el voluntario concluyó las siguientes capacitaciones en Salud Mental para la respuesta a emergencias y desastres.',
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

      {/* Logos */}
      {tpl.logoCpgUrl && (
        <img src={tpl.logoCpgUrl} alt="CPG" crossOrigin="anonymous"
          style={{ position: 'absolute', top: 12, left: 42, width: 200, height: 90, objectFit: 'contain' }}
          onLoad={onLoad} onError={onLoad} />
      )}
      {tpl.logoCaeducUrl && (
        <img src={tpl.logoCaeducUrl} alt="CAEDUC" crossOrigin="anonymous"
          style={{ position: 'absolute', top: 12, right: 40, width: 190, height: 100, objectFit: 'contain' }}
          onLoad={onLoad} onError={onLoad} />
      )}

      {/* Junta Directiva */}
      <div style={{ position: 'absolute', left: P.boardText.x, top: P.boardText.y, width: P.boardText.w, textAlign: 'center' }}>
        <span style={{ color: '#c41f6b', fontSize: fs('boardText'), fontStyle: 'italic', fontWeight: 700, wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
          {tpl.boardText || 'Junta Directiva 2025-2027'}
        </span>
      </div>

      {/* Divider */}
      <div style={{ position: 'absolute', top: 148, left: 42, right: 40, height: 2, background: 'linear-gradient(to right, #1e5c8b, #d63384, #e8c03a)' }} />

      {/* Título y comisiones */}
      <div style={{ position: 'absolute', left: P.titleBlock.x, top: P.titleBlock.y, width: P.titleBlock.w, textAlign: 'center' }}>
        <div style={commStyle}>La Comisión de Acreditación y Educación Continua mediante el Aula Virtual</div>
        {selectedCommissions.map((c, i) => (
          <div key={c.id} style={commStyle}>
            {i === 0 ? 'en conjunto con la' : 'y la'} {c.commission_name}
          </div>
        ))}
        <div style={{ fontSize: fs('titleBlock'), fontWeight: 700, color: '#1e5c8b', marginTop: 8, letterSpacing: '0.03em', wordWrap: 'break-word' }}>
          {data.certTitle || 'Acreditación de Voluntario'}
        </div>
        <div style={{ fontSize: fs2('titleBlock'), color: '#666', marginTop: 4, textAlign: 'center' }}>
          válido de {data.validFrom} a {data.validTo}
          {data.totalHours && (
            <span style={{ marginLeft: 10, fontWeight: 700, color: '#1e5c8b' }}>· {data.totalHours} horas acreditadas</span>
          )}
        </div>
      </div>

      {/* Nombre del acreditado */}
      <div style={{ position: 'absolute', left: P.recipientBlock.x, top: P.recipientBlock.y, width: P.recipientBlock.w, textAlign: 'center' }}>
        <div style={{ fontSize: fs2('recipientBlock'), color: '#555' }}>hace constar que el/la voluntario/a:</div>
        <div style={{ fontSize: fs('recipientBlock'), fontStyle: 'italic', fontWeight: 700, color: '#1a1a2e', marginTop: 3, lineHeight: 1.1, wordWrap: 'break-word' }}>
          {data.recipientName || '[Nombre del acreditado]'}
        </div>
        <div style={{ fontSize: fs2('recipientBlock'), color: '#555', marginTop: 3 }}>
          Con número de colegiado activo: <strong>{data.collegiateNumber || '----'}</strong>
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
        Emitido el {dateFormatted}
      </div>
    </div>
  );
}

// ── Preview interactivo ──────────────────────────────────────────────────────
function InteractiveCertPreview({ certRef, positions, onPositionChange, selectedEl, onSelectEl, ...canvasProps }) {
  const containerRef = useRef(null);
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
        <SpecialCertCanvas certRef={certRef} positions={positions} {...canvasProps} />
      </div>
      {ELEMENTS.map(({ id, label, color }) => {
        const p = positions[id];
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
export default function VolunteerAccreditationManager({ certTemplate }) {
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
  const tpl = { ...certTemplate };
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
  const genCode = (num) => `VOL-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(num).padStart(4,'0')}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
  const certCode = savedCode ?? genCode(form.collegiateNumber || '0000');

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

  const selectedCommissions = availableCommissions.filter(c => form.selectedCommissions.includes(c.id));
  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleCommission = (id) => setForm(p => ({
    ...p, selectedCommissions: p.selectedCommissions.includes(id)
      ? p.selectedCommissions.filter(x => x !== id)
      : [...p.selectedCommissions, id],
  }));
  const setTraining = (i, k, v) => setForm(p => { const ts = [...p.trainings]; ts[i] = { ...ts[i], [k]: v }; return { ...p, trainings: ts }; });
  const onPositionChange = useCallback((id, upd) => setPositions(prev => ({ ...prev, [id]: upd })), []);
  const adjFs = useCallback((id, delta) => setPositions(prev => ({
    ...prev, [id]: { ...prev[id], fs: Math.max(6, (prev[id].fs ?? DEFAULT_POSITIONS[id].fs) + delta) }
  })), []);
  const adjFs2 = useCallback((id, delta) => setPositions(prev => ({
    ...prev, [id]: { ...prev[id], fs2: Math.max(6, (prev[id].fs2 ?? DEFAULT_POSITIONS[id].fs2 ?? 14) + delta) }
  })), []);

  // ── Lookup single ──
  const lookupSingle = async () => {
    const num = singleNum.trim();
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

  const resetSingle = () => {
    setSingleNum(''); setSingleLookup(null); setSavedCode(null); setImageLoaded(false); setMsg(null);
    setForm(p => ({ ...p, recipientName: '', collegiateNumber: '' }));
  };

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

  // ── HTML2canvas helper ──
  const captureCanvas = () => new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(certRef.current, {
          scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#f0ede8', logging: false,
          width: CANVAS_W, height: CANVAS_H, windowWidth: CANVAS_W, windowHeight: CANVAS_H, scrollX: 0, scrollY: 0,
        });
        resolve(canvas);
      } catch (e) { reject(e); }
    }, 500);
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
          },
          commissions_snapshot: selectedCommissions.map(c => ({ id: c.id, commission_name: c.commission_name, signer_name: c.signer_name, signer_title: c.signer_title, signature_url: c.signature_url })),
        });
        if (error && error.code !== '23505') throw error;
        setSavedCode(code);
      }
      const canvas = await captureCanvas();
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
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
            },
            commissions_snapshot: selectedCommissions.map(c => ({ id: c.id, commission_name: c.commission_name, signer_name: c.signer_name, signer_title: c.signer_title, signature_url: c.signature_url })),
          }).then(() => {});
        }

        // Render canvas for this recipient
        setForm(prev => ({ ...prev, recipientName: r.name, collegiateNumber: r.num }));
        const canvas = await captureCanvas();
        const imgData = canvas.toDataURL('image/png', 0.95);

        // Individual PDF
        const singlePdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
        singlePdf.addImage(imgData, 'PNG', 0, 0, pw, ph);
        const singleDataUrl = singlePdf.output('datauristring');

        // Add page to all-in-one PDF
        if (i > 0) allPdf.addPage();
        allPdf.addImage(imgData, 'PNG', 0, 0, pw, ph);

        setBulkResults(prev => prev.map(x => x.num === r.num ? { ...x, generated: true, code, pdfDataUrl: singleDataUrl } : x));
      }

      // All-in-one download
      const allDataUrl = allPdf.output('datauristring');
      setBulkAllPdfUrl(allDataUrl);
      setBulkProgress('');
      setMsg({ type: 'success', text: `¡${toGen.length} acreditaciones generadas y guardadas en el registro!` });
    } catch (e) { setMsg({ type: 'error', text: 'Error: ' + e.message }); }
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
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 border ${msg.type === 'success' ? 'bg-green-900/20 border-green-700 text-green-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
          {msg.type === 'success' ? <CheckCircle size={15}/> : <XCircle size={15}/>}
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
            {ELEMENTS.map(({ id, label, color }) => (
              <button key={id} onClick={() => setSelectedEl(selectedEl === id ? null : id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${selectedEl === id ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                style={{ background: selectedEl === id ? `${color}25` : undefined, borderLeft: selectedEl === id ? `3px solid ${color}` : '3px solid transparent' }}>
                <Move size={10} style={{ color, flexShrink: 0 }} />{label}
              </button>
            ))}

            {selectedEl && (
              <div className="mt-2 p-3 bg-black/30 border border-gray-800 rounded-xl text-xs text-gray-400 space-y-2">
                <p className="text-white font-bold text-[11px]">{ELEMENTS.find(e => e.id === selectedEl)?.label}</p>
                {['x','y','w','h'].map(k => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="uppercase text-gray-600 w-3">{k}</span>
                    <input type="number" value={Math.round(positions[selectedEl][k])}
                      onChange={e => onPositionChange(selectedEl, { ...positions[selectedEl], [k]: Number(e.target.value) })}
                      className="w-16 bg-black border border-gray-700 rounded px-1.5 py-0.5 text-white text-xs text-right focus:border-blue-500 outline-none" />
                  </div>
                ))}
                {/* Font size — texto principal */}
                <div className="pt-1 border-t border-gray-800">
                  <p className="text-gray-600 text-[10px] mb-1.5">
                    {ELEMENTS.find(e => e.id === selectedEl)?.hasFs2 ? 'Título principal' : 'Tamaño de fuente'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => adjFs(selectedEl, -1)}
                      className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-white font-bold transition">
                      <Minus size={11}/>
                    </button>
                    <span className="flex-1 text-center text-white text-sm font-mono font-bold">
                      {positions[selectedEl].fs ?? DEFAULT_POSITIONS[selectedEl].fs}
                    </span>
                    <button onClick={() => adjFs(selectedEl, +1)}
                      className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-white font-bold transition">
                      +
                    </button>
                  </div>
                </div>
                {/* Font size — textos secundarios (solo titleBlock y recipientBlock) */}
                {ELEMENTS.find(e => e.id === selectedEl)?.hasFs2 && (
                  <div className="pt-1 border-t border-gray-800">
                    <p className="text-gray-600 text-[10px] mb-1.5">
                      {ELEMENTS.find(e => e.id === selectedEl)?.fs2Label}
                    </p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => adjFs2(selectedEl, -1)}
                        className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-white font-bold transition">
                        <Minus size={11}/>
                      </button>
                      <span className="flex-1 text-center text-white text-sm font-mono font-bold">
                        {positions[selectedEl].fs2 ?? DEFAULT_POSITIONS[selectedEl].fs2 ?? 14}
                      </span>
                      <button onClick={() => adjFs2(selectedEl, +1)}
                        className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-white font-bold transition">
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Canvas interactivo */}
          <div className="flex-1 min-w-0">
            <InteractiveCertPreview
              certRef={certRef}
              positions={positions}
              onPositionChange={onPositionChange}
              selectedEl={selectedEl}
              onSelectEl={setSelectedEl}
              tpl={tpl}
              data={form}
              certCode={certCode}
              dateFormatted={dateFormatted}
              selectedCommissions={selectedCommissions}
              onImageLoaded={() => setImageLoaded(true)}
            />
            {!imageLoaded && (
              <div className="flex items-center gap-2 text-yellow-400 text-xs mt-2">
                <Loader2 size={13} className="animate-spin"/> Cargando vista previa…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
