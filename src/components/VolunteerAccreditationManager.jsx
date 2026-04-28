// ══════════════════════════════════════════════════════════════════════
// VolunteerAccreditationManager.jsx — Acreditaciones de Voluntario
// ══════════════════════════════════════════════════════════════════════
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, Download, Loader2, CheckCircle, XCircle, Award, Shield } from 'lucide-react';
import { supabase } from '../supabaseClient';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const APP_URL = 'https://aulavirtualcpg.org';

const getCertQrUrl = (code) => {
  const verifyUrl = `${APP_URL}/?cert=${code}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}&bgcolor=ffffff&color=1a1a2e&margin=4`;
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
  trainings: [{ ...EMPTY_TRAINING }, { ...EMPTY_TRAINING }],
};

// ── Canvas del certificado de acreditación ──────────────────────────────────
function VolunteerCertCanvas({ certRef, tpl, data, certCode, dateFormatted, onImageLoaded }) {
  const [imgsLoaded, setImgsLoaded] = useState(0);
  const imgs = [tpl.logoCpgUrl, tpl.logoCaeducUrl, tpl.signatureUrl, tpl.sealUrl,
    ...(data.includePresident && tpl.presidenteSignatureUrl ? [tpl.presidenteSignatureUrl] : [])
  ].filter(Boolean);
  const handleLoad = useCallback(() => setImgsLoaded(p => p + 1), []);
  useEffect(() => { if (imgs.length === 0) onImageLoaded?.(); }, []);
  useEffect(() => { if (imgsLoaded >= imgs.length && imgs.length > 0) onImageLoaded?.(); }, [imgsLoaded, imgs.length]);

  const qrUrl = getCertQrUrl(certCode);
  const signers = [
    { name: tpl.coordinatorName || 'M.A. Juan J. Reyes', title: tpl.coordinatorTitle || 'Coordinador CAEDUC', sigUrl: tpl.signatureUrl },
    ...(data.includePresident ? [{ name: tpl.presidenteName || 'Presidenta', title: tpl.presidenteTitle || 'Presidenta Junta Directiva', sigUrl: tpl.presidenteSignatureUrl }] : []),
  ];

  return (
    <div
      ref={certRef}
      style={{
        width: '1056px', height: '816px', position: 'relative',
        fontFamily: "'Georgia', 'Times New Roman', serif",
        background: '#f0ede8', overflow: 'hidden',
      }}
    >
      {/* Color strips left */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30px', display: 'flex', flexDirection: 'column' }}>
        {['#e8c03a','#1e5c8b','#d63384','#e8c03a','#5bb363','#d63384'].map((c, i, a) => (
          <div key={i} style={{ background: c, height: i < 5 ? '18%' : '10%', flex: i === 5 ? '1' : 'none' }} />
        ))}
      </div>
      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 75% 75%, rgba(200,195,185,0.2) 0%, transparent 55%)' }} />

      {/* ── Header ── */}
      {tpl.logoCpgUrl && (
        <img src={tpl.logoCpgUrl} alt="CPG" crossOrigin="anonymous"
          style={{ position: 'absolute', top: 12, left: 42, width: 200, height: 90, objectFit: 'contain' }}
          onLoad={handleLoad} onError={handleLoad} />
      )}
      {tpl.logoCaeducUrl && (
        <img src={tpl.logoCaeducUrl} alt="CAEDUC" crossOrigin="anonymous"
          style={{ position: 'absolute', top: 12, right: 40, width: 190, height: 100, objectFit: 'contain' }}
          onLoad={handleLoad} onError={handleLoad} />
      )}
      <div style={{ position: 'absolute', top: 42, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <div style={{ color: '#c41f6b', fontSize: '22px', fontStyle: 'italic', fontWeight: 700 }}>
          {tpl.boardText || 'Junta Directiva 2025-2027'}
        </div>
      </div>
      {/* Divider */}
      <div style={{ position: 'absolute', top: '148px', left: '42px', right: '40px', height: '2px', background: 'linear-gradient(to right, #1e5c8b, #d63384, #e8c03a)' }} />

      {/* ── Body ── */}
      <div style={{ position: 'absolute', top: '160px', left: '50px', right: '44px' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '13px', color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            La Comisión de Acreditación y Educación Continua mediante el Aula Virtual
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e5c8b', marginTop: '4px', letterSpacing: '0.04em' }}>
            ACREDITACIÓN DE VOLUNTARIO
          </div>
          <div style={{ fontSize: '13px', color: '#c41f6b', fontStyle: 'italic', marginTop: '2px' }}>
            {data.commissionName}
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
            (válido de {data.validFrom} a {data.validTo})
          </div>
        </div>

        {/* Recipient */}
        <div style={{ textAlign: 'center', margin: '10px 0 6px' }}>
          <div style={{ fontSize: '11px', color: '#555' }}>hace constar que el/la voluntario/a:</div>
          <div style={{ fontSize: '26px', fontStyle: 'italic', fontWeight: 700, color: '#1a1a2e', marginTop: '2px', lineHeight: 1.1 }}>
            {data.recipientName || '[Nombre del voluntario]'}
          </div>
          <div style={{ fontSize: '12px', color: '#555', marginTop: '3px' }}>
            Con número de colegiado activo: <strong>{data.collegiateNumber || '----'}</strong>
          </div>
        </div>

        {/* Body text */}
        <div style={{ fontSize: '11px', color: '#444', textAlign: 'center', marginBottom: '8px', lineHeight: 1.4 }}>
          {data.bodyText}
        </div>

        {/* Trainings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {data.trainings.filter(t => t.title || t.aval).map((t, i) => (
            <div key={i} style={{ background: 'rgba(30,92,139,0.06)', borderLeft: '3px solid #1e5c8b', paddingLeft: '10px', paddingTop: '4px', paddingBottom: '4px', paddingRight: '8px', borderRadius: '0 4px 4px 0' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e5c8b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {i + 1}. {t.title}
              </div>
              <div style={{ fontSize: '10px', color: '#555', marginTop: '2px', lineHeight: 1.35 }}>
                {t.dateRange && <span>Llevado a cabo {t.dateRange} ({t.modality})</span>}
                {t.hours && <span>, con una duración de <strong>{t.hours} horas</strong> en total.</span>}
                {t.placeDate && <span> {t.placeDate}.</span>}
                {t.aval && <span style={{ marginLeft: '6px', fontWeight: 700, color: '#c41f6b' }}>Aval {t.aval}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer: Firmas ── */}
      <div style={{ position: 'absolute', bottom: '80px', left: '50px', right: '44px', display: 'flex', justifyContent: signers.length === 1 ? 'flex-start' : 'space-around', alignItems: 'flex-end', gap: '20px' }}>
        {signers.map((s, i) => (
          <div key={i} style={{ textAlign: 'center', minWidth: '160px', maxWidth: '220px' }}>
            {s.sigUrl && (
              <img src={s.sigUrl} alt="Firma" crossOrigin="anonymous"
                style={{ width: '160px', height: '60px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                onLoad={handleLoad} onError={handleLoad} />
            )}
            <div style={{ borderTop: '1px solid #999', paddingTop: '4px', marginTop: s.sigUrl ? '4px' : '64px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#1a1a2e' }}>{s.name}</div>
              <div style={{ fontSize: '10px', color: '#666' }}>{s.title}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Sello */}
      {tpl.sealUrl && (
        <img src={tpl.sealUrl} alt="Sello" crossOrigin="anonymous"
          style={{ position: 'absolute', bottom: '55px', left: '50%', transform: 'translateX(-50%)', width: '90px', height: '90px', objectFit: 'contain', opacity: 0.8 }}
          onLoad={handleLoad} onError={handleLoad} />
      )}

      {/* QR + código */}
      <div style={{ position: 'absolute', bottom: '14px', right: '44px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
        <img src={qrUrl} alt="QR" style={{ width: '72px', height: '72px' }} />
        <div style={{ fontSize: '8px', color: '#888', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{certCode}</div>
      </div>

      {/* Fecha emisión */}
      <div style={{ position: 'absolute', bottom: '18px', left: '50px', fontSize: '10px', color: '#888' }}>
        Emitido el {dateFormatted}
      </div>
    </div>
  );
}

// ── Formulario de datos ─────────────────────────────────────────────────────
export default function VolunteerAccreditationManager({ certTemplate }) {
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState(null);
  const certRef = useRef(null);

  const tpl = { ...certTemplate };
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
  const certCode = saved
    ? saved
    : `VOL-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${form.collegiateNumber || '0000'}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setTraining = (i, k, v) => setForm(p => {
    const ts = [...p.trainings];
    ts[i] = { ...ts[i], [k]: v };
    return { ...p, trainings: ts };
  });
  const addTraining = () => setForm(p => ({ ...p, trainings: [...p.trainings, { ...EMPTY_TRAINING }] }));
  const removeTraining = (i) => setForm(p => ({ ...p, trainings: p.trainings.filter((_, idx) => idx !== i) }));

  const handleSaveToDB = async (code) => {
    if (!supabase || !form.collegiateNumber || !form.recipientName) return;
    setSaving(true);
    try {
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
        cert_data: {
          commissionName: form.commissionName,
          validFrom: form.validFrom,
          validTo: form.validTo,
          bodyText: form.bodyText,
          trainings: form.trainings,
          includePresident: form.includePresident,
        },
        commissions_snapshot: [],
      });
      if (error && error.code !== '23505') throw error;
      setSaved(code);
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al guardar: ' + e.message });
    }
    setSaving(false);
  };

  const handleDownload = async () => {
    if (!form.recipientName.trim()) { setMsg({ type: 'error', text: 'Ingresa el nombre del voluntario.' }); return; }
    if (!form.collegiateNumber.trim()) { setMsg({ type: 'error', text: 'Ingresa el número de colegiado.' }); return; }
    if (!imageLoaded) { setMsg({ type: 'error', text: 'Espera a que cargue la vista previa.' }); return; }
    setGenerating(true);
    setMsg(null);
    try {
      // Save first to get stable code
      if (!saved) await handleSaveToDB(certCode);
      const canvas = await html2canvas(certRef.current, {
        scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#f0ede8', logging: false,
        width: 1056, height: 816, windowWidth: 1056, windowHeight: 816, scrollX: 0, scrollY: 0,
      });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', 0, 0,
        pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save(`Acreditacion_${form.recipientName.replace(/\s+/g,'_')}_${certCode}.pdf`);
      setMsg({ type: 'success', text: '¡Acreditación descargada y guardada en el registro!' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al generar PDF: ' + e.message });
    }
    setGenerating(false);
  };

  const resetForm = () => {
    setForm({ ...DEFAULT_FORM });
    setImageLoaded(false);
    setSaved(false);
    setMsg(null);
  };

  const isSuperAdmin = tpl.presidenteSignatureUrl || tpl.presidenteName;

  return (
    <div className="p-6 space-y-6">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 border ${
          msg.type === 'success' ? 'bg-green-900/20 border-green-700 text-green-300' : 'bg-red-900/20 border-red-700 text-red-300'
        }`}>
          {msg.type === 'success' ? <CheckCircle size={15}/> : <XCircle size={15}/>}
          {msg.text}
        </div>
      )}

      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm">
        <Shield size={15} className="text-blue-400 shrink-0 mt-0.5" />
        <div className="text-blue-200/90 text-xs">
          Esta acreditación se guarda en el registro de certificados del colegiado y puede verificarse con el código QR, igual que los diplomas de curso.
        </div>
      </div>

      {/* ── Datos de la acreditación ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Nombre de la comisión <span className="text-red-400">*</span></label>
          <input value={form.commissionName} onChange={e => setField('commissionName', e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
            placeholder="Ej. Comisión de Atención en Crisis CICAPS" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Válido desde</label>
          <input value={form.validFrom} onChange={e => setField('validFrom', e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
            placeholder="abril 2026" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Válido hasta</label>
          <input value={form.validTo} onChange={e => setField('validTo', e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
            placeholder="abril 2027" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Nombre del voluntario <span className="text-red-400">*</span></label>
          <input value={form.recipientName} onChange={e => setField('recipientName', e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
            placeholder="Lic./Mgtr. Nombre Completo" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Número de colegiado <span className="text-red-400">*</span></label>
          <input value={form.collegiateNumber} onChange={e => setField('collegiateNumber', e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
            placeholder="Ej. 4661" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Texto explicativo</label>
          <textarea value={form.bodyText} onChange={e => setField('bodyText', e.target.value)} rows={2}
            className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none resize-none"
            placeholder="Por medio de esta acreditación se hace constar que..." />
        </div>

        {/* Firma presidenta */}
        {(tpl.presidenteSignatureUrl || tpl.presidenteName) && (
          <div className="md:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.includePresident} onChange={e => setField('includePresident', e.target.checked)}
                className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-white">
                Incluir firma de {tpl.presidenteName || 'la Presidenta'} ({tpl.presidenteTitle || 'Presidenta Junta Directiva'})
              </span>
            </label>
          </div>
        )}
        {!tpl.presidenteSignatureUrl && !tpl.presidenteName && (
          <div className="md:col-span-2 text-xs text-gray-500 italic">
            Para incluir la firma de la presidenta, configúrala primero en "Plantilla de certificado".
          </div>
        )}
      </div>

      {/* ── Capacitaciones ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-sm">Capacitaciones acreditadas</h3>
          <button onClick={addTraining} className="flex items-center gap-1.5 bg-blue-800/50 hover:bg-blue-700/60 border border-blue-700/40 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-200 transition">
            <Plus size={13}/> Agregar
          </button>
        </div>
        <div className="space-y-4">
          {form.trainings.map((t, i) => (
            <div key={i} className="bg-black/30 border border-gray-800 rounded-xl p-4 relative">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Capacitación {i+1}</span>
                {form.trainings.length > 1 && (
                  <button onClick={() => removeTraining(i)} className="text-red-400 hover:text-red-300 transition"><Trash2 size={14}/></button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Título <span className="text-red-400">*</span></label>
                  <input value={t.title} onChange={e => setTraining(i,'title',e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="TALLER: FORMACIÓN BÁSICA PARA LA RESPUESTA A EMERGENCIAS..." />
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
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="44" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Número de aval</label>
                  <input value={t.aval} onChange={e => setTraining(i,'aval',e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="CAEDUC-26-2025" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Lugar y fecha</label>
                  <input value={t.placeDate} onChange={e => setTraining(i,'placeDate',e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="Guatemala, Abril 2026" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Botones de acción ── */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-800">
        <button onClick={handleDownload} disabled={generating || saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-bold transition">
          {generating ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>}
          {generating ? 'Generando...' : 'Generar y descargar PDF'}
        </button>
        <button onClick={resetForm} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm transition">
          Nueva acreditación
        </button>
      </div>

      {/* ── Vista previa (oculta, usada para html2canvas) ── */}
      <div>
        <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><Award size={15} className="text-yellow-400"/> Vista previa</h3>
        <div className="w-full overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
          <div style={{ transform: 'scale(0.6)', transformOrigin: 'top left', width: '1056px', height: '816px', marginBottom: '-330px' }}>
            <VolunteerCertCanvas
              certRef={certRef} tpl={tpl} data={form}
              certCode={certCode} dateFormatted={dateFormatted}
              onImageLoaded={() => setImageLoaded(true)}
            />
          </div>
        </div>
        {!imageLoaded && (
          <div className="flex items-center gap-2 text-yellow-400 text-xs mt-2"><Loader2 size={13} className="animate-spin"/> Cargando vista previa...</div>
        )}
      </div>
    </div>
  );
}
