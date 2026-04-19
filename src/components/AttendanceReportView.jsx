// ══════════════════════════════════════════════════════════════════════
// AttendanceReportView.jsx — Asistencia agrupada por actividad
// ══════════════════════════════════════════════════════════════════════
// Aula Virtual CPG · Schema: aulacaeduc
//
// Vista modal para:
//   • Ver asistencia agrupada por actividad (session_title)
//   • Filtrar por año y por actividad específica
//   • Eliminar duplicados (mismo colegiado registrado varias veces en la misma sesión)
//   • Emitir certificado individual o por bloque (toda la sesión o selección)
//   • Exportar CSV (global, por actividad o de la selección)
//   • Chequeo anti-duplicados al emitir
//
// Props:
//   videos, activities      — para seleccionar curso/actividad del certificado
//   commissions             — comisiones activas (para firmar el certificado)
//   onClose                 — callback al cerrar el modal
//
// Uso en App.jsx:
//   {showAttendanceReport && (
//     <AttendanceReportView
//       videos={videos}
//       activities={activities}
//       commissions={commissions}
//       onClose={() => setShowAttendanceReport(false)}
//     />
//   )}
// ══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Award, Download, X, Loader2, ChevronDown,
  CheckCircle, XCircle, Shield
} from 'lucide-react';
import { supabase } from '../supabaseClient';

const APP_URL = 'https://aulavirtualcpg.vercel.app';

export default function AttendanceReportView({
  videos = [],
  activities = [],
  commissions = [],
  onClose,
}) {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState('all');
  const [filterSession, setFilterSession] = useState('all');
  const [dedupMode, setDedupMode] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedSessions, setExpandedSessions] = useState(new Set());
  const [showCertModal, setShowCertModal] = useState(null);

  // ── Cargar asistencia ──
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('cpg_live_attendance')
        .select('*')
        .order('joined_at', { ascending: false });
      setAttendees(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Datos derivados ──
  const availableYears = useMemo(() => {
    const years = new Set();
    attendees.forEach(a => {
      if (a.joined_at) years.add(new Date(a.joined_at).getFullYear());
    });
    return [...years].sort((a, b) => b - a);
  }, [attendees]);

  const availableSessions = useMemo(() => {
    const s = new Set();
    attendees.forEach(a => { if (a.session_title) s.add(a.session_title); });
    return [...s].sort();
  }, [attendees]);

  const filtered = useMemo(() => {
    return attendees.filter(a => {
      if (filterYear !== 'all') {
        const y = a.joined_at ? new Date(a.joined_at).getFullYear() : null;
        if (y !== Number(filterYear)) return false;
      }
      if (filterSession !== 'all' && a.session_title !== filterSession) return false;
      return true;
    });
  }, [attendees, filterYear, filterSession]);

  const deduplicated = useMemo(() => {
    if (!dedupMode) return filtered;
    const seen = new Map();
    filtered.forEach(a => {
      const key = `${a.collegiate_number}|${a.session_title}`;
      if (!seen.has(key) || new Date(a.joined_at) > new Date(seen.get(key).joined_at)) {
        seen.set(key, a);
      }
    });
    return [...seen.values()];
  }, [filtered, dedupMode]);

  const duplicatesHidden = filtered.length - deduplicated.length;

  const grouped = useMemo(() => {
    const g = new Map();
    deduplicated.forEach(a => {
      const key = a.session_title || '(sin título)';
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(a);
    });
    return [...g.entries()].sort((a, b) => {
      const maxA = Math.max(...a[1].map(x => new Date(x.joined_at).getTime()));
      const maxB = Math.max(...b[1].map(x => new Date(x.joined_at).getTime()));
      return maxB - maxA;
    });
  }, [deduplicated]);

  // ── Helpers UI ──
  const toggleSession = (title) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectSession = (items) => {
    const ids = items.map(a => a.id);
    const allSelected = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  // ── Exportar CSV ──
  const exportCSV = (scope) => {
    let data = [];
    let filename = 'asistencia';
    if (scope === 'global') {
      data = deduplicated;
      filename = 'asistencia-global';
    } else if (scope === 'filtered') {
      data = deduplicated;
      filename = `asistencia-${filterSession !== 'all'
        ? filterSession.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40)
        : 'filtrado'}`;
    } else if (scope === 'selected') {
      data = deduplicated.filter(a => selectedIds.has(a.id));
      filename = 'asistencia-seleccion';
    }
    if (!data.length) return;

    const esc = v => {
      const s = String(v || '');
      return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [
      ['Nombre', 'Colegiado', 'Correo', 'Departamento', 'Teléfono', 'Plataforma', 'Sesión', 'Año', 'Fecha/Hora'],
      ...data.map(a => [
        a.name, a.collegiate_number, a.email || '', a.department || '', a.phone || '',
        a.platform, a.session_title,
        a.joined_at ? new Date(a.joined_at).getFullYear() : '',
        a.joined_at ? new Date(a.joined_at).toLocaleString('es-GT') : '',
      ]),
    ];
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openCertModal = (mode, items) => {
    setShowCertModal({ mode, items });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex items-start justify-center px-4 py-6 overflow-y-auto">
      <div
        className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col"
        style={{ maxHeight: 'calc(100vh - 3rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Users size={20} className="text-indigo-400" /> Registro de asistencia a sesiones en vivo
            </h3>
            <p className="text-sm text-gray-400">
              {deduplicated.length} asistentes en {grouped.length} sesión(es)
              {duplicatesHidden > 0 && (
                <span className="ml-2 text-amber-400">
                  · {duplicatesHidden} duplicado{duplicatesHidden !== 1 ? 's' : ''} oculto{duplicatesHidden !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* Filtros */}
        <div className="px-6 py-4 border-b border-gray-800 bg-black/30 shrink-0">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider">Año:</label>
              <select
                value={filterYear}
                onChange={e => setFilterYear(e.target.value)}
                className="bg-black border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-indigo-500 outline-none"
              >
                <option value="all">Todos</option>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[250px] max-w-md">
              <label className="text-xs text-gray-400 uppercase tracking-wider whitespace-nowrap">Actividad:</label>
              <select
                value={filterSession}
                onChange={e => setFilterSession(e.target.value)}
                className="bg-black border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-indigo-500 outline-none flex-1 min-w-0 truncate"
              >
                <option value="all">Todas las actividades</option>
                {availableSessions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={dedupMode}
                onChange={e => setDedupMode(e.target.checked)}
                className="w-4 h-4 accent-indigo-500"
              />
              Eliminar duplicados (mismo colegiado/sesión)
            </label>
            <button
              onClick={load}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg text-xs text-gray-300 transition"
            >
              <Loader2 size={12} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
            <div className="ml-auto flex gap-2 flex-wrap">
              {selectedIds.size > 0 ? (
                <>
                  <span className="bg-indigo-900/40 text-indigo-300 text-xs font-bold px-3 py-1.5 rounded-full border border-indigo-700/50 self-center">
                    {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => openCertModal('block', deduplicated.filter(a => selectedIds.has(a.id)))}
                    className="flex items-center gap-1.5 bg-yellow-600 hover:bg-yellow-700 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                  >
                    <Award size={12} /> Emitir cert. al bloque
                  </button>
                  <button
                    onClick={() => exportCSV('selected')}
                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                  >
                    <Download size={12} /> CSV selección
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-gray-500 hover:text-white px-2 self-center"
                  >
                    Limpiar
                  </button>
                </>
              ) : deduplicated.length > 0 && (
                <button
                  onClick={() => exportCSV(filterSession !== 'all' ? 'filtered' : 'global')}
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                >
                  <Download size={12} /> {filterSession !== 'all' ? 'CSV actividad' : 'CSV global'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lista agrupada */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading && (
            <div className="text-center py-10">
              <Loader2 size={28} className="animate-spin text-indigo-400 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Cargando asistencia...</p>
            </div>
          )}
          {!loading && grouped.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay registros de asistencia con los filtros actuales.</p>
            </div>
          )}
          {!loading && grouped.map(([sessionTitle, items]) => {
            const isExpanded = expandedSessions.has(sessionTitle);
            const sessionIds = items.map(a => a.id);
            const allSelected = sessionIds.every(id => selectedIds.has(id));
            const someSelected = sessionIds.some(id => selectedIds.has(id));
            const mostRecent = items.reduce(
              (m, a) => new Date(a.joined_at) > new Date(m.joined_at) ? a : m
            );
            return (
              <div key={sessionTitle} className="mb-4 bg-[#1a1a1a] border border-gray-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-900/60 gap-3 flex-wrap">
                  <button
                    onClick={() => toggleSession(sessionTitle)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left hover:text-white transition"
                  >
                    <ChevronDown
                      size={16}
                      className={`text-gray-400 transition-transform shrink-0 ${isExpanded ? '' : '-rotate-90'}`}
                    />
                    <div className="min-w-0">
                      <h4 className="text-white font-bold text-sm truncate">{sessionTitle}</h4>
                      <p className="text-xs text-gray-500">
                        {items.length} asistente{items.length !== 1 ? 's' : ''} ·{' '}
                        {new Date(mostRecent.joined_at).toLocaleDateString('es-GT', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })} ·
                        <span className="capitalize"> {mostRecent.platform}</span>
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleSelectSession(items)}
                      className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${
                        allSelected
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : someSelected
                          ? 'bg-indigo-900/40 border-indigo-700 text-indigo-300'
                          : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {allSelected ? '✓ Toda la sesión' : 'Seleccionar todos'}
                    </button>
                    <button
                      onClick={() => openCertModal('block', items)}
                      className="flex items-center gap-1.5 bg-yellow-600/30 hover:bg-yellow-600/60 text-yellow-300 hover:text-yellow-100 text-xs font-bold px-3 py-1 rounded-full border border-yellow-700/50 transition"
                    >
                      <Award size={11} /> Emitir a todos
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-900/30 text-gray-500 uppercase text-[10px]">
                        <tr>
                          <th className="w-10 px-3 py-2"></th>
                          <th className="text-left px-3 py-2">Nombre</th>
                          <th className="text-left px-3 py-2">Colegiado</th>
                          <th className="text-left px-3 py-2">Contacto</th>
                          <th className="text-left px-3 py-2">Depto.</th>
                          <th className="text-left px-3 py-2">Fecha</th>
                          <th className="text-right px-3 py-2">Certificado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(a => {
                          const selected = selectedIds.has(a.id);
                          return (
                            <tr
                              key={a.id}
                              className={`border-t border-gray-800 ${
                                selected ? 'bg-indigo-900/10' : 'hover:bg-gray-900/40'
                              }`}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleSelect(a.id)}
                                  className="w-4 h-4 accent-indigo-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-white font-medium">{a.name || '—'}</td>
                              <td className="px-3 py-2 text-gray-300 font-mono text-xs">{a.collegiate_number}</td>
                              <td className="px-3 py-2 text-gray-400 text-xs">
                                <div className="truncate max-w-[180px]">{a.email || '—'}</div>
                                <div className="text-gray-600">{a.phone || '—'}</div>
                              </td>
                              <td className="px-3 py-2 text-gray-400 text-xs">{a.department || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                                {new Date(a.joined_at).toLocaleString('es-GT', {
                                  day: '2-digit', month: '2-digit', year: '2-digit',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => openCertModal('one', [a])}
                                  className="inline-flex items-center gap-1 bg-yellow-600/30 hover:bg-yellow-600/60 text-yellow-300 hover:text-yellow-100 text-xs font-bold px-2.5 py-1 rounded border border-yellow-700/50 transition"
                                >
                                  <Award size={11} /> Emitir
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showCertModal && (
          <CertEmissionConfigModal
            items={showCertModal.items}
            mode={showCertModal.mode}
            videos={videos}
            activities={activities}
            commissions={commissions}
            onClose={() => setShowCertModal(null)}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CertEmissionConfigModal — configuración y emisión del lote
// ══════════════════════════════════════════════════════════════════════
function CertEmissionConfigModal({ items, mode, videos, activities, commissions, onClose }) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [selectedCommissionIds, setSelectedCommissionIds] = useState([]);
  const [error, setError] = useState('');
  const [emitting, setEmitting] = useState(false);
  const [results, setResults] = useState(null);

  const activeCommissions = commissions.filter(c => c.active);
  const allItems = [
    ...videos.map(v => ({
      id: `video-${v.id}`,
      label: v.title,
      duration: v.duration,
      refId: v.id,
      type: 'video',
      commissions: v.commissions || [],
    })),
    ...activities.map(a => ({
      id: `act-${a.id}`,
      label: a.title,
      duration: '',
      refId: a.id,
      type: 'activity',
      commissions: a.commissions || [],
    })),
  ];

  // Precargar comisiones asociadas al curso/actividad seleccionado
  useEffect(() => {
    if (!useCustom && selectedItemId) {
      const sel = allItems.find(i => i.id === selectedItemId);
      if (sel?.commissions?.length) setSelectedCommissionIds(sel.commissions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId, useCustom]);

  const toggleCommission = (id) => {
    setSelectedCommissionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleStart = async () => {
    setError('');
    let videoId, videoTitle, videoDuration;
    if (useCustom) {
      if (!customTitle.trim()) {
        setError('Ingresa el título del certificado.');
        return;
      }
      videoId = Date.now();
      videoTitle = customTitle.trim();
      videoDuration = customDuration.trim();
    } else {
      const sel = allItems.find(i => i.id === selectedItemId);
      if (!sel) {
        setError('Selecciona una actividad o curso.');
        return;
      }
      videoId = sel.refId;
      videoTitle = sel.label;
      videoDuration = sel.duration || '';
    }

    setEmitting(true);
    const commissionsSnapshot = commissions
      .filter(c => selectedCommissionIds.includes(c.id))
      .map(c => ({
        id: c.id,
        commission_name: c.commission_name,
        signer_name: c.signer_name,
        signer_title: c.signer_title,
        signature_url: c.signature_url,
      }));

    const resultsList = [];
    const now = new Date();
    const fmt = d => d.getFullYear()
      + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0');

    for (const a of items) {
      const num = a.collegiate_number;
      try {
        const { data: existing } = await supabase
          .from('cpg_certificates')
          .select('certificate_code')
          .eq('collegiate_number', num)
          .eq('video_id', videoId)
          .maybeSingle();
        if (existing) {
          resultsList.push({
            num, name: a.name,
            status: 'duplicate',
            msg: `Ya existía: ${existing.certificate_code}`,
          });
          continue;
        }
        const certCode = `CPG-${fmt(now)}-${num}-${videoId}`;
        const record = {
          certificate_code: certCode,
          collegiate_number: num,
          recipient_name: a.name || `Colegiado ${num}`,
          status: 'ACTIVO',
          video_id: videoId,
          video_title: videoTitle,
          video_duration: String(videoDuration || ''),
          issued_at: now.toISOString(),
          verify_url: `${APP_URL}/?cert=${certCode}`,
          commissions_snapshot: commissionsSnapshot,
        };
        const { error: insErr } = await supabase.from('cpg_certificates').insert(record);
        if (insErr) {
          if (insErr.code === '23505') {
            resultsList.push({
              num, name: a.name,
              status: 'duplicate',
              msg: 'Ya contaba con este certificado',
            });
          } else {
            resultsList.push({ num, name: a.name, status: 'error', msg: insErr.message });
          }
        } else {
          resultsList.push({ num, name: a.name, status: 'ok', code: certCode });
        }
      } catch (e) {
        resultsList.push({ num, name: a.name, status: 'error', msg: e.message });
      }
    }
    setResults(resultsList);
    setEmitting(false);
  };

  const successCount = results ? results.filter(r => r.status === 'ok').length : 0;
  const dupCount     = results ? results.filter(r => r.status === 'duplicate').length : 0;
  const errorCount   = results ? results.filter(r => r.status === 'error').length : 0;

  return (
    <div className="fixed inset-0 bg-black/80 z-[80] flex items-start justify-center px-4 py-6 overflow-y-auto">
      <div
        className="bg-[#1a1a1a] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: 'calc(100vh - 3rem)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Award size={18} className="text-yellow-400" />
              Emitir certificado{items.length > 1 ? 's' : ''}
            </h3>
            <p className="text-xs text-gray-400">
              {items.length} destinatario{items.length !== 1 ? 's' : ''}{' '}
              {mode === 'one' ? `· ${items[0]?.name}` : '(bloque)'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2">
              <XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}
            </div>
          )}

          {!results && (
            <>
              <div>
                <p className="text-white font-bold text-sm mb-3 uppercase tracking-wider">
                  1. Curso o actividad
                </p>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setUseCustom(false)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                      !useCustom ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-gray-700 text-gray-400'
                    }`}
                  >
                    Existente
                  </button>
                  <button
                    onClick={() => setUseCustom(true)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                      useCustom ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-gray-700 text-gray-400'
                    }`}
                  >
                    Personalizado
                  </button>
                </div>
                {!useCustom ? (
                  <select
                    value={selectedItemId}
                    onChange={e => setSelectedItemId(e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                  >
                    <option value="">— Selecciona —</option>
                    <optgroup label="Cursos (videos)">
                      {videos.map(v => (
                        <option key={`v-${v.id}`} value={`video-${v.id}`}>
                          {v.title} ({v.duration}h)
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Actividades">
                      {activities.map(a => (
                        <option key={`a-${a.id}`} value={`act-${a.id}`}>
                          {a.title}{a.date ? ` (${a.date})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        value={customTitle}
                        onChange={e => setCustomTitle(e.target.value)}
                        className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                        placeholder="Título del certificado"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={customDuration}
                        onChange={e => setCustomDuration(e.target.value)}
                        className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                        placeholder="Duración (hrs)"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className="text-white font-bold text-sm mb-3 uppercase tracking-wider">
                  2. Comisiones firmantes{' '}
                  <span className="text-gray-500 normal-case font-normal text-xs">
                    (además del Coordinador CAEDUC, que firma siempre)
                  </span>
                </p>
                {activeCommissions.length === 0 ? (
                  <p className="text-xs text-gray-500 italic bg-black/40 border border-gray-800 rounded-lg px-3 py-2">
                    No hay comisiones activas. Agrégalas en la sección "Comisiones y firmantes".
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {activeCommissions.map(c => {
                      const checked = selectedCommissionIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                            checked ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 hover:border-gray-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCommission(c.id)}
                            className="w-4 h-4 accent-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{c.commission_name}</p>
                            <p className="text-gray-500 text-xs truncate">
                              {c.signer_name} · {c.signer_title}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  {selectedCommissionIds.length} comisión
                  {selectedCommissionIds.length !== 1 ? 'es' : ''} seleccionada
                  {selectedCommissionIds.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div>
                <p className="text-white font-bold text-sm mb-2 uppercase tracking-wider">
                  3. Destinatarios ({items.length})
                </p>
                <div className="bg-black/40 border border-gray-800 rounded-lg max-h-40 overflow-y-auto">
                  {items.map(a => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between px-3 py-2 border-b border-gray-800 last:border-b-0 text-xs"
                    >
                      <span className="text-white font-medium">{a.name || '—'}</span>
                      <span className="text-gray-500 font-mono">{a.collegiate_number}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleStart}
                disabled={emitting}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
              >
                {emitting
                  ? <><Loader2 size={18} className="animate-spin" /> Emitiendo...</>
                  : <><Award size={18} /> Emitir {items.length} certificado{items.length !== 1 ? 's' : ''}</>}
              </button>
            </>
          )}

          {results && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{successCount}</p>
                  <p className="text-xs text-gray-400">Emitidos</p>
                </div>
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-amber-400">{dupCount}</p>
                  <p className="text-xs text-gray-400">Ya existían</p>
                </div>
                <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-400">{errorCount}</p>
                  <p className="text-xs text-gray-400">Errores</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-800 max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400 uppercase text-xs sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Colegiado</th>
                      <th className="text-left px-3 py-2">Nombre</th>
                      <th className="text-left px-3 py-2">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-t border-gray-800">
                        <td className="px-3 py-2 text-white font-mono text-xs">{r.num}</td>
                        <td className="px-3 py-2 text-gray-300 text-xs">{r.name || '—'}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.status === 'ok' && (
                            <span className="text-green-400 flex items-center gap-1">
                              <CheckCircle size={11} /> Emitido
                            </span>
                          )}
                          {r.status === 'duplicate' && (
                            <span className="text-amber-400 flex items-center gap-1">
                              <Shield size={11} /> {r.msg}
                            </span>
                          )}
                          {r.status === 'error' && (
                            <span className="text-red-400 flex items-center gap-1">
                              <XCircle size={11} /> {r.msg}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-gray-800 shrink-0">
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg font-semibold text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
