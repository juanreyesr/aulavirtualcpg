// ══════════════════════════════════════════════════════════════════════
// VolunteerAccreditationManager.jsx — Acreditaciones de Voluntario
// ══════════════════════════════════════════════════════════════════════
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, Download, Loader2, CheckCircle, XCircle, Award, Shield, Move, Maximize2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const APP_URL = 'https://aulavirtualcpg.org';
const CANVAS_W = 1056;
const CANVAS_H = 816;

const getCertQrUrl = (code) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`${APP_URL}/?cert=${code}`)}&bgcolor=ffffff&color=1a1a2e&margin=4`;

// ── Elementos posicionables ───────────────────────────────────────────────
const ELEMENTS = [
  { id: 'titleBlock',      label: 'Título y comisiones',    color: '#3b82f6' },
  { id: 'recipientBlock',  label: 'Nombre del voluntario',  color: '#10b981' },
  { id: 'bodyText',        label: 'Texto descriptivo',      color: '#f59e0b' },
  { id: 'trainingsBlock',  label: 'Capacitaciones',         color: '#8b5cf6' },
  { id: 'signaturesBlock', label: 'Firmas',                 color: '#ec4899' },
  { id: 'seal',            label: 'Sello',                  color: '#6366f1' },
  { id: 'qrBlock',         label: 'Código QR',              color: '#14b8a6' },
  { id: 'dateText',        label: 'Fecha de emisión',       color: '#f97316' },
];

const DEFAULT_POSITIONS = {
  titleBlock:      { x: 50,  y: 155, w: 956, h: 108 },
  recipientBlock:  { x: 50,  y: 268, w: 956, h: 75  },
  bodyText:        { x: 50,  y: 348, w: 956, h: 40  },
  trainingsBlock:  { x: 50,  y: 393, w: 956, h: 215 },
  signaturesBlock: { x: 45,  y: 618, w: 660, h: 130 },
  seal:            { x: 458, y: 695, w: 100, h: 100 },
  qrBlock:         { x: 888, y: 706, w: 118, h: 95  },
  dateText:        { x: 45,  y: 788, w: 300, h: 20  },
};

const EMPTY_TRAINING = { title: '', dateRange: '', modality: 'Virtual', hours: '', aval: '', placeDate: '' };

const DEFAULT_FORM = {
  commissionName: 'Comisión de Atención en Crisis y Apoyo Psicosocial CICAPS',
  validFrom: 'abril 2026',
  validTo: 'abril 2027',
  recipientName: '',
  collegiateNumber: '',
  bodyText: 'Por medio de esta acreditación, se hace constar que el voluntario concluyó las siguientes capacitaciones en Salud Mental para la respuesta a emergencias y desastres.',
  includePresident: false,
  selectedCommissions: [],
  trainings: [{ ...EMPTY_TRAINING }, { ...EMPTY_TRAINING }],
};

// ── Canvas del certificado ─────────────────────────────────────────────────
function VolunteerCertCanvas({ certRef, tpl, data, positions: P, certCode, dateFormatted, selectedCommissions, onImageLoaded }) {
  const [loaded, setLoaded] = useState(0);
  const imgs = [
    tpl.logoCpgUrl, tpl.logoCaeducUrl, tpl.signatureUrl, tpl.sealUrl,
    ...(data.includePresident && tpl.presidenteSignatureUrl ? [tpl.presidenteSignatureUrl] : []),
    ...selectedCommissions.filter(c => c.signature_url).map(c => c.signature_url),
  ].filter(Boolean);

  const onLoad = useCallback(() => setLoaded(p => p + 1), []);
  useEffect(() => { if (imgs.length === 0) onImageLoaded?.(); }, []);
  useEffect(() => { if (loaded >= imgs.length && imgs.length > 0) onImageLoaded?.(); }, [loaded, imgs.length]);

  const qrUrl = getCertQrUrl(certCode);

  // All signers: CAEDUC coordinator first, then selected commissions, then president
  const signers = [
    { name: tpl.coordinatorName || 'M.A. Juan J. Reyes', title: tpl.coordinatorTitle || 'Coordinador CAEDUC', sigUrl: tpl.signatureUrl },
    ...selectedCommissions.map(c => ({ name: c.signer_name, title: c.signer_title, sigUrl: c.signature_url })),
    ...(data.includePresident && (tpl.presidenteSignatureUrl || tpl.presidenteName) ? [{ name: tpl.presidenteName || 'Presidenta', title: tpl.presidenteTitle || 'Presidenta Junta Directiva', sigUrl: tpl.presidenteSignatureUrl }] : []),
  ];

  const sigPerRow = signers.length <= 3 ? signers.length : Math.ceil(signers.length / 2);
  const sigRows = signers.length <= 3 ? [signers] : [signers.slice(0, sigPerRow), signers.slice(sigPerRow)];

  return (
    <div ref={certRef} style={{ width: CANVAS_W, height: CANVAS_H, position: 'relative', fontFamily: "'Georgia','Times New Roman',serif", background: '#f0ede8', overflow: 'hidden' }}>
      {/* Color strips left */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 30, display: 'flex', flexDirection: 'column' }}>
        {[['#e8c03a','18%'],['#1e5c8b','18%'],['#d63384','18%'],['#e8c03a','18%'],['#5bb363','18%'],['#d63384','10%']].map(([bg, h], i) => (
          <div key={i} style={{ background: bg, height: h }} />
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 75% 75%, rgba(200,195,185,0.2) 0%, transparent 55%)' }} />

      {/* ── Header estático ── */}
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
      <div style={{ position: 'absolute', top: 42, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <div style={{ color: '#c41f6b', fontSize: 22, fontStyle: 'italic', fontWeight: 700 }}>
          {tpl.boardText || 'Junta Directiva 2025-2027'}
        </div>
      </div>
      {/* Divider */}
      <div style={{ position: 'absolute', top: 148, left: 42, right: 40, height: 2, background: 'linear-gradient(to right, #1e5c8b, #d63384, #e8c03a)' }} />

      {/* ── Bloque título (posicionable) ── */}
      <div style={{ position: 'absolute', left: P.titleBlock.x, top: P.titleBlock.y, width: P.titleBlock.w, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          La Comisión de Acreditación y Educación Continua mediante el Aula Virtual
        </div>
        {selectedCommissions.map((c, i) => (
          <div key={c.id} style={{ fontSize: 11, color: '#1e5c8b', fontStyle: 'italic', marginTop: 1 }}>
            {i === 0 ? 'en conjunto con la' : 'y la'} {c.commission_name}
          </div>
        ))}
        <div style={{ fontSize: 24, fontWeight: 700, color: '#1e5c8b', marginTop: 6, letterSpacing: '0.04em' }}>
          ACREDITACIÓN DE VOLUNTARIO
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
          (válido de {data.validFrom} a {data.validTo})
        </div>
      </div>

      {/* ── Nombre del voluntario (posicionable) ── */}
      <div style={{ position: 'absolute', left: P.recipientBlock.x, top: P.recipientBlock.y, width: P.recipientBlock.w, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#555' }}>hace constar que el/la voluntario/a:</div>
        <div style={{ fontSize: 28, fontStyle: 'italic', fontWeight: 700, color: '#1a1a2e', marginTop: 3, lineHeight: 1.1 }}>
          {data.recipientName || '[Nombre del voluntario]'}
        </div>
        <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>
          Con número de colegiado activo: <strong>{data.collegiateNumber || '----'}</strong>
        </div>
      </div>

      {/* ── Texto descriptivo (posicionable) ── */}
      <div style={{ position: 'absolute', left: P.bodyText.x, top: P.bodyText.y, width: P.bodyText.w, fontSize: 11, color: '#444', textAlign: 'center', lineHeight: 1.4 }}>
        {data.bodyText}
      </div>

      {/* ── Capacitaciones (posicionable) ── */}
      <div style={{ position: 'absolute', left: P.trainingsBlock.x, top: P.trainingsBlock.y, width: P.trainingsBlock.w, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.trainings.filter(t => t.title || t.aval).map((t, i) => (
          <div key={i} style={{ background: 'rgba(30,92,139,0.06)', borderLeft: '3px solid #1e5c8b', paddingLeft: 10, paddingTop: 4, paddingBottom: 4, paddingRight: 8, borderRadius: '0 4px 4px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e5c8b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {i + 1}. {t.title}
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2, lineHeight: 1.35 }}>
              {t.dateRange && <span>Llevado a cabo {t.dateRange} ({t.modality})</span>}
              {t.hours && <span>, con una duración de <strong>{t.hours} horas</strong> en total.</span>}
              {t.placeDate && <span> {t.placeDate}.</span>}
              {t.aval && <span style={{ marginLeft: 6, fontWeight: 700, color: '#c41f6b' }}>Aval {t.aval}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Firmas (posicionable) ── */}
      <div style={{ position: 'absolute', left: P.signaturesBlock.x, top: P.signaturesBlock.y, width: P.signaturesBlock.w }}>
        {sigRows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', justifyContent: row.length === 1 ? 'flex-start' : 'space-around', alignItems: 'flex-end', gap: 12, marginBottom: ri < sigRows.length - 1 ? 12 : 0 }}>
            {row.map((s, si) => (
              <div key={si} style={{ textAlign: 'center', minWidth: 140, maxWidth: 200 }}>
                {s.sigUrl && (
                  <img src={s.sigUrl} alt="Firma" crossOrigin="anonymous"
                    style={{ width: 150, height: 55, objectFit: 'contain', display: 'block', margin: '0 auto' }}
                    onLoad={onLoad} onError={onLoad} />
                )}
                <div style={{ borderTop: '1px solid #999', paddingTop: 4, marginTop: s.sigUrl ? 4 : 59 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1a1a2e' }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: '#666' }}>{s.title}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Sello (posicionable) ── */}
      {tpl.sealUrl && (
        <img src={tpl.sealUrl} alt="Sello" crossOrigin="anonymous"
          style={{ position: 'absolute', left: P.seal.x, top: P.seal.y, width: P.seal.w, height: P.seal.h, objectFit: 'contain', opacity: 0.8 }}
          onLoad={onLoad} onError={onLoad} />
      )}

      {/* ── QR (posicionable) ── */}
      <div style={{ position: 'absolute', left: P.qrBlock.x, top: P.qrBlock.y, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <img src={qrUrl} alt="QR" style={{ width: P.qrBlock.w, height: P.qrBlock.h - 16 }} />
        <div style={{ fontSize: 7, color: '#888', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{certCode}</div>
      </div>

      {/* ── Fecha (posicionable) ── */}
      <div style={{ position: 'absolute', left: P.dateText.x, top: P.dateText.y, fontSize: 10, color: '#888' }}>
        Emitido el {dateFormatted}
      </div>
    </div>
  );
}

// ── Preview interactivo con drag/resize ─────────────────────────────────────
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
  const ch = CANVAS_H * scale;

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
    else { upd.w = Math.max(40, d.ew + dx); upd.h = Math.max(15, d.eh + dy); }
    onPositionChange(d.id, upd);
  }, [positions, toCanvas, onPositionChange]);

  const onUp = useCallback(() => { drag.current = null; }, []);

  return (
    <div ref={containerRef}
      style={{ position: 'relative', width: '100%', height: ch, userSelect: 'none', touchAction: 'none', overflow: 'hidden', borderRadius: 12, border: '1px solid #374151' }}
      onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      onTouchMove={onMove} onTouchEnd={onUp}
    >
      {/* Certificate at full size, CSS-scaled */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, transformOrigin: 'top left', transform: `scale(${scale})`, pointerEvents: 'none' }}>
        <VolunteerCertCanvas certRef={certRef} positions={positions} {...canvasProps} />
      </div>

      {/* Interaction overlay */}
      {ELEMENTS.map(({ id, label, color }) => {
        const p = positions[id];
        const isSel = selectedEl === id;
        return (
          <div key={id}
            style={{ position: 'absolute', left: p.x * scale, top: p.y * scale, width: p.w * scale, height: p.h * scale, boxSizing: 'border-box',
              border: isSel ? `2px solid ${color}` : '1px dashed rgba(160,160,160,0.3)',
              background: isSel ? `${color}18` : 'transparent', cursor: 'move' }}
            onMouseDown={e => onDown(id, 'drag', e)}
            onTouchStart={e => onDown(id, 'drag', e)}
          >
            {isSel && (
              <>
                <div style={{ position: 'absolute', top: -18, left: 0, background: color, color: '#fff', fontSize: 9, padding: '2px 5px', borderRadius: 3, whiteSpace: 'nowrap', fontFamily: 'sans-serif' }}>
                  <Move size={8} style={{ display: 'inline', marginRight: 3 }} />{label}
                </div>
                <div
                  style={{ position: 'absolute', bottom: -6, right: -6, width: 14, height: 14, background: color, borderRadius: 2, cursor: 'nwse-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseDown={e => { e.stopPropagation(); onDown(id, 'resize', e); }}
                  onTouchStart={e => { e.stopPropagation(); onDown(id, 'resize', e); }}
                >
                  <Maximize2 size={8} color="#fff" />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────
export default function VolunteerAccreditationManager({ certTemplate }) {
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [positions, setPositions] = useState({ ...DEFAULT_POSITIONS });
  const [selectedEl, setSelectedEl] = useState(null);
  const [availableCommissions, setAvailableCommissions] = useState([]);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savedCode, setSavedCode] = useState(null);
  const [msg, setMsg] = useState(null);
  const certRef = useRef(null);

  const tpl = { ...certTemplate };
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
  const certCode = savedCode ?? `VOL-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${(form.collegiateNumber||'0000').padStart(4,'0')}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;

  // Load available commissions
  useEffect(() => {
    if (!supabase) return;
    supabase.from('cpg_commissions').select('*').eq('active', true).order('display_order').then(({ data }) => {
      setAvailableCommissions(data || []);
    });
  }, []);

  // The selected commission objects (for rendering signatures)
  const selectedCommissions = availableCommissions.filter(c => form.selectedCommissions.includes(c.id));

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toggleCommission = (id) => {
    setForm(p => {
      const sel = p.selectedCommissions.includes(id)
        ? p.selectedCommissions.filter(x => x !== id)
        : [...p.selectedCommissions, id];
      return { ...p, selectedCommissions: sel };
    });
  };

  const setTraining = (i, k, v) => setForm(p => {
    const ts = [...p.trainings];
    ts[i] = { ...ts[i], [k]: v };
    return { ...p, trainings: ts };
  });

  const onPositionChange = useCallback((id, upd) => {
    setPositions(prev => ({ ...prev, [id]: upd }));
  }, []);

  const handleDownload = async () => {
    if (!form.recipientName.trim()) { setMsg({ type: 'error', text: 'Ingresa el nombre del voluntario.' }); return; }
    if (!form.collegiateNumber.trim()) { setMsg({ type: 'error', text: 'Ingresa el número de colegiado.' }); return; }
    if (!imageLoaded) { setMsg({ type: 'error', text: 'Espera a que cargue la vista previa.' }); return; }
    setGenerating(true); setMsg(null);
    try {
      // Save to DB first (get stable code)
      const code = certCode;
      if (!savedCode && supabase) {
        const { error } = await supabase.from('cpg_certificates').insert({
          certificate_code: code,
          collegiate_number: form.collegiateNumber.trim(),
          recipient_name: form.recipientName.trim(),
          status: 'ACTIVO',
          video_id: null,
          video_title: `Acreditación de Voluntario — ${form.commissionName}`,
          video_duration: null,
          issued_at: now.toISOString(),
          verify_url: `${APP_URL}/?cert=${code}`,
          cert_type: 'volunteer',
          cert_data: { commissionName: form.commissionName, validFrom: form.validFrom, validTo: form.validTo, bodyText: form.bodyText, trainings: form.trainings, includePresident: form.includePresident, selectedCommissions: form.selectedCommissions },
          commissions_snapshot: selectedCommissions.map(c => ({ id: c.id, commission_name: c.commission_name, signer_name: c.signer_name, signer_title: c.signer_title, signature_url: c.signature_url })),
        });
        if (error && error.code !== '23505') throw error;
        setSavedCode(code);
      }
      // Temporarily hide overlay interaction UI, then capture
      const canvas = await html2canvas(certRef.current, {
        scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#f0ede8', logging: false,
        width: CANVAS_W, height: CANVAS_H, windowWidth: CANVAS_W, windowHeight: CANVAS_H, scrollX: 0, scrollY: 0,
      });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save(`Acreditacion_${form.recipientName.replace(/\s+/g,'_')}_${code}.pdf`);
      setMsg({ type: 'success', text: '¡Acreditación descargada y guardada en el registro del colegiado!' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + e.message });
    }
    setGenerating(false);
  };

  const resetForm = () => {
    setForm({ ...DEFAULT_FORM });
    setPositions({ ...DEFAULT_POSITIONS });
    setSelectedEl(null);
    setImageLoaded(false);
    setSavedCode(null);
    setMsg(null);
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

      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-blue-200/90">
        <Shield size={14} className="text-blue-400 shrink-0 mt-0.5" />
        Se guarda en el registro de certificados del colegiado, verificable con QR igual que los diplomas de curso.
      </div>

      {/* ── Datos generales ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Comisión acreditante <span className="text-red-400">*</span></label>
          <input value={form.commissionName} onChange={e => setField('commissionName', e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
            placeholder="Nombre de la comisión" />
          <p className="text-[11px] text-gray-600 mt-1">Este nombre aparece en el cuerpo de la acreditación. Las comisiones firmantes se seleccionan abajo.</p>
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
        <div>
          <label className="block text-xs text-gray-400 mb-1">Nombre del voluntario <span className="text-red-400">*</span></label>
          <input value={form.recipientName} onChange={e => setField('recipientName', e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Lic./Mgtr. Nombre Completo" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Número de colegiado <span className="text-red-400">*</span></label>
          <input value={form.collegiateNumber} onChange={e => setField('collegiateNumber', e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none" placeholder="Ej. 4661" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Texto explicativo</label>
          <textarea value={form.bodyText} onChange={e => setField('bodyText', e.target.value)} rows={2}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none resize-none" />
        </div>
      </div>

      {/* ── Firmas a incluir ── */}
      <div>
        <h3 className="text-white font-bold text-sm mb-3">Firmas en el certificado</h3>
        <div className="bg-black/30 border border-gray-800 rounded-xl p-4 space-y-3">
          {/* Coordinador CAEDUC: siempre */}
          <div className="flex items-center gap-3 opacity-60">
            <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center"><CheckCircle size={11} className="text-white"/></div>
            <div>
              <div className="text-sm text-white">{tpl.coordinatorName || 'M.A. Juan J. Reyes'}</div>
              <div className="text-xs text-gray-500">{tpl.coordinatorTitle || 'Coordinador CAEDUC'} — siempre incluido</div>
            </div>
          </div>

          {/* Comisiones disponibles */}
          {availableCommissions.length === 0 && (
            <p className="text-xs text-gray-500 italic">No hay comisiones configuradas. Agrégalas en "Gestión de comisiones".</p>
          )}
          {availableCommissions.map(c => (
            <label key={c.id} className="flex items-center gap-3 cursor-pointer hover:bg-white/5 rounded-lg p-1 -m-1 transition">
              <input type="checkbox" checked={form.selectedCommissions.includes(c.id)} onChange={() => toggleCommission(c.id)} className="w-4 h-4 accent-blue-500" />
              <div className="flex-1">
                <div className="text-sm text-white">{c.signer_name}</div>
                <div className="text-xs text-gray-500">{c.signer_title} · {c.commission_name}</div>
              </div>
              {c.signature_url
                ? <img src={c.signature_url} alt="firma" className="h-8 w-16 object-contain bg-white/10 rounded" />
                : <span className="text-xs text-gray-600 italic">sin imagen</span>}
            </label>
          ))}

          {/* Presidenta */}
          {hasPresident ? (
            <label className="flex items-center gap-3 cursor-pointer hover:bg-white/5 rounded-lg p-1 -m-1 transition">
              <input type="checkbox" checked={form.includePresident} onChange={e => setField('includePresident', e.target.checked)} className="w-4 h-4 accent-pink-500" />
              <div className="flex-1">
                <div className="text-sm text-white">{tpl.presidenteName || 'Presidenta'}</div>
                <div className="text-xs text-gray-500">{tpl.presidenteTitle || 'Presidenta Junta Directiva'}</div>
              </div>
              {tpl.presidenteSignatureUrl
                ? <img src={tpl.presidenteSignatureUrl} alt="firma presidenta" className="h-8 w-16 object-contain bg-white/10 rounded" />
                : <span className="text-xs text-gray-600 italic">sin imagen</span>}
            </label>
          ) : (
            <p className="text-xs text-gray-500 italic">
              Para incluir la firma de la presidenta, configura nombre y firma en "Plantilla de certificado".
            </p>
          )}
        </div>
      </div>

      {/* ── Capacitaciones ── */}
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
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Capacitación {i + 1}</span>
                {form.trainings.length > 1 && (
                  <button onClick={() => setForm(p => ({ ...p, trainings: p.trainings.filter((_, idx) => idx !== i) }))}
                    className="text-red-400 hover:text-red-300 transition"><Trash2 size={14}/></button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Título</label>
                  <input value={t.title} onChange={e => setTraining(i,'title',e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="TALLER: FORMACIÓN BÁSICA..." />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Rango de fechas</label>
                  <input value={t.dateRange} onChange={e => setTraining(i,'dateRange',e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="del 21 de octubre al 13 de noviembre 2025" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Modalidad</label>
                  <select value={t.modality} onChange={e => setTraining(i,'modality',e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none">
                    <option>Virtual</option>
                    <option>Presencial</option>
                    <option>Virtual sincrónico y asincrónico</option>
                    <option>Mixto (virtual y presencial)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Horas totales</label>
                  <input value={t.hours} onChange={e => setTraining(i,'hours',e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none" placeholder="44" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Número de aval</label>
                  <input value={t.aval} onChange={e => setTraining(i,'aval',e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none" placeholder="CAEDUC-26-2025" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Lugar y fecha</label>
                  <input value={t.placeDate} onChange={e => setTraining(i,'placeDate',e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none" placeholder="Guatemala, Abril 2026" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Vista previa interactiva ── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <Award size={15} className="text-yellow-400"/> Vista previa — arrastra y redimensiona elementos
          </h3>
          <button onClick={() => setPositions({ ...DEFAULT_POSITIONS })}
            className="text-xs text-gray-500 hover:text-white transition border border-gray-700 px-3 py-1.5 rounded-lg">
            Restablecer posiciones
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Sidebar: lista de elementos */}
          <div className="lg:w-48 shrink-0">
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Elementos</p>
            <div className="space-y-1">
              {ELEMENTS.map(({ id, label, color }) => (
                <button key={id} onClick={() => setSelectedEl(selectedEl === id ? null : id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${selectedEl === id ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                  style={{ background: selectedEl === id ? `${color}25` : undefined, borderLeft: selectedEl === id ? `3px solid ${color}` : '3px solid transparent' }}>
                  <Move size={11} style={{ color, flexShrink: 0 }} />
                  {label}
                </button>
              ))}
            </div>
            {selectedEl && (
              <div className="mt-3 p-3 bg-black/30 border border-gray-800 rounded-xl text-xs text-gray-400 space-y-1">
                <p className="text-white font-bold mb-2">{ELEMENTS.find(e => e.id === selectedEl)?.label}</p>
                {['x','y','w','h'].map(k => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="uppercase text-gray-600">{k}</span>
                    <input type="number" value={Math.round(positions[selectedEl][k])}
                      onChange={e => onPositionChange(selectedEl, { ...positions[selectedEl], [k]: Number(e.target.value) })}
                      className="w-16 bg-black border border-gray-700 rounded px-1.5 py-0.5 text-white text-xs text-right focus:border-blue-500 outline-none" />
                  </div>
                ))}
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
                <Loader2 size={13} className="animate-spin"/> Cargando vista previa...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Acciones ── */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-800">
        <button onClick={handleDownload} disabled={generating}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-bold transition">
          {generating ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>}
          {generating ? 'Generando...' : 'Generar y descargar PDF'}
        </button>
        <button onClick={resetForm} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm transition">
          Nueva acreditación
        </button>
      </div>
    </div>
  );
}
