#!/usr/bin/env python3
"""
Patch script para App.jsx del Aula Virtual CPG
Aplica 4 fixes:
1. APP_URL corregido a aulavirtualcpg.vercel.app
2. Flujo de recuperación de contraseña (PasswordResetView)
3. Fix botón "Volver al inicio de sesión"
4. Emisión masiva de certificados (BulkCertificateEmitter)
"""
import sys, os

def apply_patches(content):
    patches_applied = []

    # ═══════════════════════════════════════════════════
    # FIX 1: Corregir APP_URL
    # ═══════════════════════════════════════════════════
    old_url = "const APP_URL = 'https://aulacpg.vercel.app';"
    new_url = "const APP_URL = 'https://aulavirtualcpg.vercel.app';"
    if old_url in content:
        content = content.replace(old_url, new_url)
        patches_applied.append("✅ FIX 1: APP_URL corregido a aulavirtualcpg.vercel.app")
    else:
        patches_applied.append("⚠️  FIX 1: APP_URL ya estaba actualizado o no se encontró")

    # ═══════════════════════════════════════════════════
    # FIX 1b: Corregir redirectTo en handlePasswordReset
    # ═══════════════════════════════════════════════════
    old_redirect1 = "redirectTo: `${APP_URL}/?reset=true`,"
    new_redirect1 = "redirectTo: APP_URL,"
    count = content.count(old_redirect1)
    if count > 0:
        content = content.replace(old_redirect1, new_redirect1)
        patches_applied.append(f"✅ FIX 1b: {count} redirectTo corregidos (sin ?reset=true)")
    else:
        patches_applied.append("⚠️  FIX 1b: redirectTo ya estaba actualizado")

    # ═══════════════════════════════════════════════════
    # FIX 2: Agregar PasswordResetView component
    # ═══════════════════════════════════════════════════
    password_reset_component = '''
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

'''

    # Insertar PasswordResetView antes del LoginColModal
    marker_login = "// ── LOGIN MODAL (2 pasos)"
    if "PasswordResetView" not in content and marker_login in content:
        content = content.replace(marker_login, password_reset_component + marker_login)
        patches_applied.append("✅ FIX 2a: PasswordResetView component insertado")
    else:
        patches_applied.append("⚠️  FIX 2a: PasswordResetView ya existe o no se encontró marker")

    # ═══════════════════════════════════════════════════
    # FIX 2b: Agregar estado y detección de recovery en App
    # ═══════════════════════════════════════════════════
    # Agregar estado showPasswordReset
    old_state_marker = "const [siteLogos, setSiteLogos] = useState(DEFAULT_SITE_LOGOS);"
    new_state = """const [siteLogos, setSiteLogos] = useState(DEFAULT_SITE_LOGOS);
  // ── FIX #2: estado para recovery mode ──
  const [showPasswordReset, setShowPasswordReset] = useState(false);"""
    if "showPasswordReset" not in content and old_state_marker in content:
        content = content.replace(old_state_marker, new_state)
        patches_applied.append("✅ FIX 2b: Estado showPasswordReset agregado")

    # Agregar detección de recovery en useEffect
    recovery_detection = """
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

"""
    # Insertar antes del useEffect de onAuthStateChange
    auth_change_marker = "  useEffect(() => {\n    if (!supabase) return;\n    const { data: { subscription } } = supabase.auth.onAuthStateChange"
    if "FIX #2: Detectar callback" not in content and auth_change_marker in content:
        content = content.replace(auth_change_marker, recovery_detection + auth_change_marker)
        patches_applied.append("✅ FIX 2c: Detección de recovery en useEffect agregada")

    # Agregar detección de PASSWORD_RECOVERY event en onAuthStateChange
    old_signed_in = "      if (event === 'SIGNED_IN' && session) {"
    new_signed_in = """      // Detectar PASSWORD_RECOVERY event de Supabase
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
        return;
      }
      if (event === 'SIGNED_IN' && session) {"""
    if "PASSWORD_RECOVERY" not in content and old_signed_in in content:
        content = content.replace(old_signed_in, new_signed_in, 1)
        patches_applied.append("✅ FIX 2d: PASSWORD_RECOVERY event listener agregado")

    # Agregar renderizado de PasswordResetView antes del LoginColModal render
    old_login_render = "  if (!sessionUser) return <LoginColModal"
    new_login_render = """  // ── FIX #2: Mostrar formulario de nueva contraseña si estamos en recovery ──
  if (showPasswordReset) return <PasswordResetView onDone={() => { setShowPasswordReset(false); window.location.href = APP_URL; }} />;

  if (!sessionUser) return <LoginColModal"""
    if "showPasswordReset" not in content.split("if (!sessionUser)")[0][-200:] and old_login_render in content:
        content = content.replace(old_login_render, new_login_render, 1)
        patches_applied.append("✅ FIX 2e: Renderizado de PasswordResetView agregado")

    # ═══════════════════════════════════════════════════
    # FIX 3: Corregir botón "Volver al inicio de sesión"
    # ═══════════════════════════════════════════════════
    old_volver = """onClick={() => { setRegisteredEmail(null); setResetSent(false); setAuthMode('login'); }}"""
    new_volver = """onClick={() => { setResetSent(false); }}"""
    if old_volver in content:
        content = content.replace(old_volver, new_volver)
        patches_applied.append("✅ FIX 3: Botón 'Volver' corregido (mantiene registeredEmail)")
    else:
        patches_applied.append("⚠️  FIX 3: Botón 'Volver' ya estaba corregido o no se encontró")

    # ═══════════════════════════════════════════════════
    # FIX 4: Agregar BulkCertificateEmitter component
    # ═══════════════════════════════════════════════════
    bulk_cert_component = '''
// ══════════════════════════════════════════════════
// ██ FIX #4: EMISIÓN MASIVA DE CERTIFICADOS        ██
// ══════════════════════════════════════════════════
function BulkCertificateEmitter({ videos, activities, onClose, onCertsCreated }) {
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
    ...activities.map(a => ({ id: 'act-' + a.id, label: a.title, duration: '', videoId: a.id, type: 'activity' })),
  ];

  const parseColegiadosList = async () => {
    let numbers = [];
    if (inputMode === 'text') {
      numbers = colegiadosText.split(/[,\\n\\r;]+/).map(n => n.trim()).filter(n => n && /^\\d+$/.test(n));
    } else if (csvFile) {
      const text = await csvFile.text();
      numbers = text.split(/[,\\n\\r;]+/).map(n => n.trim()).filter(n => n && /^\\d+$/.test(n));
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

    for (const num of numbers) {
      try {
        const data = await consultarColegiado(num);
        const certCode = 'CPG-' + fmt(currentDate) + '-' + num + '-' + certVideoId;
        const certRecord = {
          certificate_code: certCode, collegiate_number: num,
          recipient_name: data.name || 'Colegiado ' + num, status: data.status || 'DESCONOCIDO',
          video_id: certVideoId, video_title: certTitle,
          video_duration: String(certDuration || ''), issued_at: currentDate.toISOString(),
          verify_url: APP_URL + '/?cert=' + certCode,
        };
        if (supabase) {
          const { error: insertErr } = await supabase.from('cpg_certificates').upsert(certRecord, { onConflict: 'certificate_code' });
          if (insertErr) resultsList.push({ num, name: data.name, status: 'error', msg: insertErr.message });
          else resultsList.push({ num, name: data.name, cpgStatus: data.status, status: 'ok', code: certCode });
        }
      } catch (e) {
        resultsList.push({ num, name: '', status: 'error', msg: e.message || 'Colegiado no encontrado' });
      }
    }
    setResults(resultsList); setProcessing(false);
    if (onCertsCreated) onCertsCreated();
  };

  const successCount = results ? results.filter(r => r.status === 'ok').length : 0;
  const errorCount = results ? results.filter(r => r.status === 'error').length : 0;

  return (
    <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center px-4 py-10">
      <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2"><Award size={20} className="text-yellow-400" /> Emitir certificados masivos</h3>
            <p className="text-sm text-gray-400">Genera certificados para múltiples colegiados a la vez.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-6 overflow-y-auto max-h-[75vh] space-y-5">
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
                <optgroup label="Actividades">{activities.map(a => <option key={'a-'+a.id} value={'act-'+a.id}>{a.title} ({a.date})</option>)}</optgroup>
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
                <textarea value={colegiadosText} onChange={e => setColegiadosText(e.target.value)} rows={5} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-sm font-mono focus:border-blue-500 outline-none resize-none" placeholder={"Separados por comas o saltos de línea:\\n4661, 1234, 5678"} />
                <p className="text-xs text-gray-500 mt-1">{colegiadosText.split(/[,\\n\\r;]+/).filter(n => n.trim() && /^\\d+$/.test(n.trim())).length} números detectados</p>
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
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-green-400">{successCount}</p><p className="text-xs text-gray-400">Emitidos</p></div>
                <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-red-400">{errorCount}</p><p className="text-xs text-gray-400">Errores</p></div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-800 max-h-60 overflow-y-auto">
                <table className="w-full text-sm"><thead className="bg-gray-900 text-gray-400 uppercase text-xs sticky top-0"><tr><th className="text-left px-3 py-2">Colegiado</th><th className="text-left px-3 py-2">Nombre</th><th className="text-left px-3 py-2">Estado</th><th className="text-left px-3 py-2">Resultado</th></tr></thead>
                <tbody>{results.map((r, i) => (<tr key={i} className="border-t border-gray-800"><td className="px-3 py-2 text-white font-mono">{r.num}</td><td className="px-3 py-2 text-gray-300">{r.name || '—'}</td><td className="px-3 py-2"><span className={`text-xs font-bold ${r.cpgStatus === 'ACTIVO' ? 'text-green-400' : 'text-gray-500'}`}>{r.cpgStatus || '—'}</span></td><td className="px-3 py-2">{r.status === 'ok' ? <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Emitido</span> : <span className="text-xs text-red-400 flex items-center gap-1"><XCircle size={12} /> {r.msg}</span>}</td></tr>))}</tbody></table>
              </div>
              <button onClick={() => { setResults(null); setColegiadosText(''); setCsvFile(null); }} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition">Emitir otro lote</button>
            </div>
          )}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-gray-800"><button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg font-semibold text-sm">Cerrar</button></div>
      </div>
    </div>
  );
}

'''

    # Insertar BulkCertificateEmitter antes del App component
    marker_app = "// ── APP PRINCIPAL"
    if "BulkCertificateEmitter" not in content and marker_app in content:
        content = content.replace(marker_app, bulk_cert_component + marker_app)
        patches_applied.append("✅ FIX 4a: BulkCertificateEmitter component insertado")

    # ═══════════════════════════════════════════════════
    # FIX 4b: Agregar estado y botón en AdminDashboard
    # ═══════════════════════════════════════════════════
    # Agregar estado showBulkCert
    old_admin_state = "const [showLogoManager, setShowLogoManager] = useState(false);"
    new_admin_state = """const [showLogoManager, setShowLogoManager] = useState(false);
  const [showBulkCert, setShowBulkCert] = useState(false);"""
    if "showBulkCert" not in content and old_admin_state in content:
        content = content.replace(old_admin_state, new_admin_state, 1)
        patches_applied.append("✅ FIX 4b: Estado showBulkCert agregado en AdminDashboard")

    # Agregar botón "Emitir certificados masivos" en la sección de certificados
    old_certs_header = """<div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-500 pointer-events-none" />
                <input type="text" value={certsFilter} onChange={e => setCertsFilter(e.target.value)} placeholder="Filtrar por colegiado, nombre o curso..." className="w-full bg-black border border-gray-700 rounded-lg pl-8 pr-4 py-2 text-sm text-white focus:border-yellow-500 outline-none" />
              </div>"""
    new_certs_header = """<div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-500 pointer-events-none" />
                <input type="text" value={certsFilter} onChange={e => setCertsFilter(e.target.value)} placeholder="Filtrar por colegiado, nombre o curso..." className="w-full bg-black border border-gray-700 rounded-lg pl-8 pr-4 py-2 text-sm text-white focus:border-yellow-500 outline-none" />
              </div>
              <button onClick={() => setShowBulkCert(true)} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-sm font-bold text-white transition shrink-0"><Award size={16} /> Emitir masivamente</button>"""
    if "Emitir masivamente" not in content and old_certs_header in content:
        content = content.replace(old_certs_header, new_certs_header, 1)
        patches_applied.append("✅ FIX 4c: Botón 'Emitir masivamente' agregado en certificados")

    # Agregar renderizado del modal BulkCertificateEmitter
    old_logo_manager_render = "      {showLogoManager && <LogoManagerModal"
    new_logo_manager_render = """      {showBulkCert && <BulkCertificateEmitter videos={videos} activities={activities} onClose={() => setShowBulkCert(false)} onCertsCreated={() => { setCertsLoaded(false); loadAdminCerts(); }} />}
      {showLogoManager && <LogoManagerModal"""
    if "showBulkCert &&" not in content and old_logo_manager_render in content:
        content = content.replace(old_logo_manager_render, new_logo_manager_render, 1)
        patches_applied.append("✅ FIX 4d: Renderizado de BulkCertificateEmitter en AdminDashboard")

    return content, patches_applied


def main():
    if len(sys.argv) < 2:
        print("Uso: python3 patch_app.py <ruta-a-tu-App.jsx>")
        print("Ejemplo: python3 patch_app.py src/App.jsx")
        sys.exit(1)

    input_path = sys.argv[1]
    if not os.path.exists(input_path):
        print(f"❌ Error: No se encontró el archivo '{input_path}'")
        sys.exit(1)

    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    print(f"📄 Leyendo: {input_path} ({len(content)} caracteres)")
    print("🔧 Aplicando patches...\n")

    patched_content, patches = apply_patches(content)

    for p in patches:
        print(f"  {p}")

    # Crear backup
    backup_path = input_path + '.backup'
    with open(backup_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"\n💾 Backup guardado en: {backup_path}")

    # Escribir archivo patcheado
    with open(input_path, 'w', encoding='utf-8') as f:
        f.write(patched_content)
    print(f"✅ Archivo patcheado: {input_path}")
    print(f"\n🚀 Listo! Haz deploy a Vercel y verifica los cambios.")
    print(f"\n⚠️  IMPORTANTE: Actualiza el Site URL en Supabase Dashboard:")
    print(f"   Dashboard → Authentication → URL Configuration → Site URL")
    print(f"   Cambia a: https://aulavirtualcpg.vercel.app")
    print(f"   Agrega en Redirect URLs: https://aulavirtualcpg.vercel.app/**")


if __name__ == '__main__':
    main()
