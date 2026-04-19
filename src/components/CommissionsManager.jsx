// ══════════════════════════════════════════════════════════════════════
// CommissionsManager.jsx — Gestión de comisiones firmantes
// ══════════════════════════════════════════════════════════════════════
// Aula Virtual CPG · Schema: aulacaeduc
//
// Permite crear, editar, reordenar y eliminar las comisiones que pueden
// firmar certificados además del Coordinador CAEDUC (fijo).
// Máx. 6 comisiones activas simultáneamente.
//
// Uso en App.jsx:
//   import CommissionsManager from './components/CommissionsManager';
//   <CommissionsManager />
// ══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Edit2, Users, CheckCircle, XCircle, Loader2,
  Upload, ChevronDown, Shield
} from 'lucide-react';
import { supabase } from '../supabaseClient';

const MAX_ACTIVE = 6;

// Helper compartido — sube imagen al bucket cert-assets
async function uploadCertAsset(file, prefix) {
  if (!supabase || !file) return null;
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('cert-assets')
    .upload(path, file, { cacheControl: '3600', upsert: true });
  if (error) throw new Error('Error subiendo imagen: ' + error.message);
  const { data: { publicUrl } } = supabase.storage.from('cert-assets').getPublicUrl(path);
  return publicUrl;
}

export default function CommissionsManager() {
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    commission_name: '',
    signer_name: '',
    signer_title: '',
    signature_url: '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('cpg_commissions')
        .select('*')
        .order('display_order', { ascending: true });
      setCommissions(data || []);
    } catch (e) {
      setMsg({ type: 'error', text: 'Error cargando: ' + e.message });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeCount = commissions.filter(c => c.active).length;

  const resetForm = () => {
    setForm({ commission_name: '', signer_name: '', signer_title: '', signature_url: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (c) => {
    setForm({
      commission_name: c.commission_name || '',
      signer_name: c.signer_name || '',
      signer_title: c.signer_title || '',
      signature_url: c.signature_url || '',
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleUploadSignature = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadCertAsset(file, 'commission-sig');
      setForm(prev => ({ ...prev, signature_url: url }));
      setMsg({ type: 'success', text: 'Firma subida correctamente' });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg({ type: 'error', text: 'Error subiendo firma: ' + e.message });
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.commission_name.trim() || !form.signer_name.trim() || !form.signer_title.trim()) {
      setMsg({ type: 'error', text: 'Comisión, nombre y cargo son obligatorios.' });
      return;
    }
    if (!editingId && activeCount >= MAX_ACTIVE) {
      setMsg({ type: 'error', text: `Máximo ${MAX_ACTIVE} comisiones activas. Desactiva alguna primero.` });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        commission_name: form.commission_name.trim(),
        signer_name: form.signer_name.trim(),
        signer_title: form.signer_title.trim(),
        signature_url: form.signature_url || null,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        await supabase.from('cpg_commissions').update(payload).eq('id', editingId);
      } else {
        const nextOrder = commissions.length > 0
          ? Math.max(...commissions.map(c => c.display_order || 0)) + 1
          : 1;
        await supabase.from('cpg_commissions').insert({
          ...payload,
          display_order: nextOrder,
          active: true,
        });
      }
      setMsg({ type: 'success', text: editingId ? 'Comisión actualizada' : 'Comisión creada' });
      setTimeout(() => setMsg(null), 2500);
      resetForm();
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al guardar: ' + e.message });
    }
    setSaving(false);
  };

  const handleToggleActive = async (c) => {
    if (!c.active && activeCount >= MAX_ACTIVE) {
      setMsg({ type: 'error', text: `Ya tienes ${MAX_ACTIVE} comisiones activas. Desactiva otra primero.` });
      return;
    }
    try {
      await supabase
        .from('cpg_commissions')
        .update({ active: !c.active, updated_at: new Date().toISOString() })
        .eq('id', c.id);
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + e.message });
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(
      `¿Eliminar la comisión "${c.commission_name}"?\n\n` +
      `Los certificados ya emitidos conservan su firma original (snapshot).`
    )) return;
    try {
      await supabase.from('cpg_commissions').delete().eq('id', c.id);
      await load();
      setMsg({ type: 'success', text: 'Comisión eliminada' });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg({ type: 'error', text: 'Error: ' + e.message });
    }
  };

  const handleMove = async (c, direction) => {
    const sorted = [...commissions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const idx = sorted.findIndex(x => x.id === c.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      await supabase.from('cpg_commissions')
        .update({ display_order: other.display_order }).eq('id', c.id);
      await supabase.from('cpg_commissions')
        .update({ display_order: c.display_order }).eq('id', other.id);
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al reordenar: ' + e.message });
    }
  };

  return (
    <div className="p-6">
      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-semibold flex items-start gap-2 ${
          msg.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {msg.type === 'success'
            ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
            : <XCircle size={16} className="mt-0.5 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="text-sm text-gray-400">
          <span className="text-white font-bold">{activeCount}</span> de {MAX_ACTIVE} comisiones activas ·{' '}
          <span className="text-gray-500">{commissions.length} en total</span>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            disabled={activeCount >= MAX_ACTIVE}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-bold transition"
          >
            <Plus size={16} /> Nueva comisión
          </button>
        )}
      </div>

      <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5 text-sm">
        <Shield size={15} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="text-amber-200/90">
          <p className="font-bold mb-0.5">Importante</p>
          <p className="text-xs">
            El <span className="text-white font-semibold">Coordinador de CAEDUC</span> firma siempre todos los certificados y se gestiona en la sección{' '}
            <span className="text-white font-semibold">"Plantilla de certificado"</span>. Aquí configuras las comisiones{' '}
            <span className="text-white font-semibold">adicionales</span> que pueden firmar cuando se asocian a un curso.
          </p>
        </div>
      </div>

      {/* ── Formulario crear/editar ── */}
      {showForm && (
        <div className="bg-black/40 border border-gray-800 rounded-xl p-5 mb-6">
          <h3 className="text-white font-bold text-lg mb-4">
            {editingId ? 'Editar comisión' : 'Nueva comisión'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-1">
                Nombre de la comisión <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.commission_name}
                onChange={e => setForm({ ...form, commission_name: e.target.value })}
                className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                placeholder="Ej. Comisión de Ética"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Nombre del firmante <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.signer_name}
                onChange={e => setForm({ ...form, signer_name: e.target.value })}
                className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                placeholder="M.A. Nombre Apellido"
              />
              <p className="text-[11px] text-gray-600 mt-1">Tal cual aparecerá en el certificado</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Cargo <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.signer_title}
                onChange={e => setForm({ ...form, signer_title: e.target.value })}
                className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white text-sm focus:border-blue-500 outline-none"
                placeholder="Coordinador/a"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-1">Imagen de firma (opcional)</label>
              <div className="flex items-center gap-3 flex-wrap">
                {form.signature_url && (
                  <img
                    src={form.signature_url}
                    alt="Firma"
                    className="w-24 h-16 object-contain bg-white/10 rounded-lg border border-gray-700 p-1"
                  />
                )}
                <label className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 px-3 py-2 rounded-lg cursor-pointer transition text-sm text-gray-300 hover:text-white">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading
                    ? 'Subiendo...'
                    : form.signature_url ? 'Cambiar imagen' : 'Subir firma PNG'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handleUploadSignature(e.target.files?.[0])}
                    disabled={uploading}
                  />
                </label>
                {form.signature_url && (
                  <button
                    onClick={() => setForm({ ...form, signature_url: '' })}
                    className="text-xs text-red-400 hover:text-red-300 transition"
                  >
                    Eliminar
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-600 mt-1">
                PNG con fondo transparente. Si no hay firma, solo se muestra el nombre y cargo.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold px-5 py-2 rounded-lg transition flex items-center gap-2 text-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {editingId ? 'Guardar cambios' : 'Crear comisión'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Tabla ── */}
      {loading && (
        <div className="text-center py-10">
          <Loader2 size={28} className="animate-spin text-blue-400 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      )}
      {!loading && commissions.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay comisiones registradas aún.</p>
          <p className="text-xs mt-1">Agrega la primera para que aparezca en el selector de cursos.</p>
        </div>
      )}
      {!loading && commissions.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-3 w-16">Orden</th>
                <th className="text-left px-4 py-3">Comisión</th>
                <th className="text-left px-4 py-3">Firmante</th>
                <th className="text-left px-4 py-3">Firma</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {[...commissions]
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                .map((c, idx, arr) => (
                  <tr
                    key={c.id}
                    className={`border-t border-gray-800 hover:bg-gray-900/40 ${!c.active ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 items-center">
                        <button
                          onClick={() => handleMove(c, 'up')}
                          disabled={idx === 0}
                          className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Subir"
                        >
                          <ChevronDown size={12} className="rotate-180" />
                        </button>
                        <span className="text-xs text-gray-600">{c.display_order}</span>
                        <button
                          onClick={() => handleMove(c, 'down')}
                          disabled={idx === arr.length - 1}
                          className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Bajar"
                        >
                          <ChevronDown size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{c.commission_name}</td>
                    <td className="px-4 py-3">
                      <div className="text-white text-xs font-medium">{c.signer_name}</div>
                      <div className="text-gray-500 text-[10px]">{c.signer_title}</div>
                    </td>
                    <td className="px-4 py-3">
                      {c.signature_url ? (
                        <img
                          src={c.signature_url}
                          alt="Firma"
                          className="w-16 h-10 object-contain bg-white/10 rounded p-0.5"
                        />
                      ) : (
                        <span className="text-xs text-gray-600 italic">Sin imagen</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        c.active
                          ? 'bg-green-900/40 text-green-400'
                          : 'bg-gray-800 text-gray-500'
                      }`}>
                        {c.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => handleEdit(c)}
                          className="p-1.5 bg-blue-900/40 hover:bg-blue-900/70 text-blue-300 rounded"
                          title="Editar"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(c)}
                          className={`p-1.5 rounded ${
                            c.active
                              ? 'bg-orange-900/40 hover:bg-orange-900/70 text-orange-300'
                              : 'bg-green-900/40 hover:bg-green-900/70 text-green-300'
                          }`}
                          title={c.active ? 'Desactivar' : 'Activar'}
                        >
                          {c.active ? <XCircle size={13} /> : <CheckCircle size={13} />}
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="p-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded"
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
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
