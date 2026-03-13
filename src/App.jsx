import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, CheckCircle, XCircle, LogOut, Plus, Trash2, Award,
  ChevronLeft, ChevronDown, Lock, ExternalLink, X, CalendarDays, Eye,
  Download, Loader2, UserCheck, UserX, Edit2, Users, Radio, Wifi, Video,
  Search, Mail, Shield, History, QrCode, KeyRound
} from 'lucide-react';
import { supabase } from './supabaseClient';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const ADMIN_CREDENTIALS = {
  email: 'gestor.caeduc@colegiodepsicologos.org.gt',
  password: 'CAEDUC2025',
};

const EDGE_URL = 'https://dvzgxmzzqzaapqfutaty.supabase.co/functions/v1/consultar-colegiado';
const APP_URL = 'https://aulacpg.vercel.app';

const INITIAL_VIDEOS = [
  { id: 1, title: 'Introducción a la Psicología Clínica', category: 'Psicología Clínica', youtubeId: 'hJKwF2rXGz4', duration: '2', description: 'Un recorrido fundamental por los principios de la práctica clínica moderna y el abordaje del paciente.', thumbnail: 'https://i.ytimg.com/vi/hJKwF2rXGz4/hqdefault.jpg', scheduledAt: '', quizEnabled: true, viewCount: 0, questions: Array(10).fill(null).map((_, i) => ({ question: 'Pregunta ' + (i+1) + ' sobre Psicología Clínica?', options: ['Opción A (Correcta)', 'Opción B', 'Opción C'], correctAnswer: 0 })) },
  { id: 2, title: 'Ética Profesional en la Salud Mental', category: 'Ética y Legislación', youtubeId: 'PrJj3sP7b-M', duration: '1.5', description: 'Análisis del código deontológico y dilemas éticos frecuentes en la consulta.', thumbnail: 'https://i.ytimg.com/vi/PrJj3sP7b-M/hqdefault.jpg', scheduledAt: '', quizEnabled: false, viewCount: 0, questions: [] },
  { id: 3, title: 'Neuropsicología del Aprendizaje', category: 'Neuropsicología', youtubeId: 'MMP3e9yZqIw', duration: '3', description: 'Exploración de las bases neurológicas que sustentan los procesos de aprendizaje y memoria.', thumbnail: 'https://i.ytimg.com/vi/MMP3e9yZqIw/hqdefault.jpg', scheduledAt: '', quizEnabled: true, viewCount: 0, questions: Array(10).fill(null).map((_, i) => ({ question: 'Pregunta conceptual ' + (i+1) + '?', options: ['Respuesta Incorrecta', 'Respuesta Correcta', 'Otra Incorrecta'], correctAnswer: 1 })) }
];

// ── UTILS ────────────────────────────────────────
const extractYouTubeId = (value) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!trimmed.includes('http')) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) return url.pathname.replace('/', '');
    if (url.searchParams.has('v')) return url.searchParams.get('v') || '';
    const m = url.pathname.match(/\/embed\/([^/?]+)/);
    return m ? m[1] : '';
  } catch { return ''; }
};

const getYouTubeThumbnail = (youtubeId, quality = 'hqdefault') => {
  const id = extractYouTubeId(youtubeId);
  if (!id) return 'https://via.placeholder.com/640x360';
  return 'https://i.ytimg.com/vi/' + id + '/' + quality + '.jpg';
};

const getVideoThumbnail = (video) => video?.thumbnail?.trim() || getYouTubeThumbnail(video?.youtubeId);
const getScheduledDate = (scheduledAt) => scheduledAt ? new Date(scheduledAt + 'T00:00:00') : null;
const isVideoPublished = (video) => { const d = getScheduledDate(video?.scheduledAt); return !d || d <= new Date(); };
const formatScheduleDate = (scheduledAt) => { const d = getScheduledDate(scheduledAt); if (!d) return ''; return d.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' }); };
const getFirstName = (fullName = '') => { const clean = fullName.replace(/^(Lic\.|Dr\.|Msc\.|Ing\.|Lcda\.|Dra\.)\s*/i, '').trim(); return clean.split(' ')[0] || fullName; };

const getCompletedKey = (num) => 'cpg_completed_' + num;
const loadCompleted = (num) => { if (!num || num === '0000') return new Set(); try { const r = localStorage.getItem(getCompletedKey(num)); return r ? new Set(JSON.parse(r)) : new Set(); } catch { return new Set(); } };
const saveCompleted = (num, s) => { if (!num || num === '0000') return; localStorage.setItem(getCompletedKey(num), JSON.stringify([...s])); };

async function consultarColegiado(id) {
  const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: String(id).trim() }) });
  const data = await res.json();
  if (!res.ok || !data.found) throw new Error(data.error || 'Colegiado no encontrado');
  return data;
}

// ── QR CODE URL ──────────────────────────────────
const getCertQrUrl = (code) => {
  const verifyUrl = `${APP_URL}/?cert=${code}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}&bgcolor=ffffff&color=1a1a2e&margin=4`;
};

// ── VERIFICACIÓN PÚBLICA DE CERTIFICADO ──────────
function CertificateVerifyView({ code }) {
  const [status, setStatus] = useState('loading'); // loading | found | not_found | error
  const [cert, setCert] = useState(null);

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
      {/* Logo y encabezado */}
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
        {/* Cargando */}
        {status === 'loading' && (
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-10 text-center">
            <Loader2 size={40} className="animate-spin text-blue-400 mx-auto mb-4" />
            <p className="text-gray-400">Verificando certificado...</p>
            <p className="text-gray-600 text-xs mt-1 font-mono">{code}</p>
          </div>
        )}

        {/* CERTIFICADO VÁLIDO */}
        {status === 'found' && cert && (
          <div className="bg-[#1a1a1a] border border-green-700/50 rounded-2xl overflow-hidden shadow-2xl shadow-green-900/20">
            {/* Header verde */}
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

            {/* Datos del certificado */}
            <div className="px-6 py-6 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {/* Nombre */}
                <div className="bg-black/30 rounded-xl p-4 flex items-start gap-3 border border-gray-800">
                  <UserCheck size={18} className="text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Profesional</p>
                    <p className="text-white font-bold text-lg">{cert.recipient_name}</p>
                  </div>
                </div>

                {/* Colegiado + Estado en la misma fila */}
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

                {/* Curso */}
                <div className="bg-black/30 rounded-xl p-4 flex items-start gap-3 border border-gray-800">
                  <Award size={18} className="text-yellow-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Curso completado</p>
                    <p className="text-white font-semibold">{cert.video_title}</p>
                  </div>
                </div>

                {/* Fecha y código */}
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

              {/* Sello de verificación */}
              <div className="flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-xl px-4 py-3 mt-2">
                <Shield size={16} className="text-green-400 shrink-0" />
                <p className="text-green-300 text-xs">Este certificado fue generado y registrado automáticamente por el sistema de Aula Virtual CPG. Su autenticidad está garantizada mediante código único e infalsificable.</p>
              </div>
            </div>
          </div>
        )}

        {/* NO ENCONTRADO */}
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

        {/* ERROR */}
        {status === 'error' && (
          <div className="bg-[#1a1a1a] border border-gray-700 rounded-2xl p-8 text-center">
            <Wifi size={40} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-300 font-semibold mb-2">No se pudo conectar al servidor</p>
            <p className="text-gray-500 text-sm">Intenta recargar la página. Si el problema persiste, contacta a CAEDUC.</p>
          </div>
        )}

        {/* Volver al Aula */}
        <div className="text-center mt-6">
          <a href="/" className="text-gray-500 hover:text-blue-400 text-sm transition flex items-center justify-center gap-1">
            <ChevronLeft size={14} /> Volver al Aula Virtual CPG
          </a>
        </div>
      </div>
    </div>
  );
}


// ── LOGIN MODAL (2 pasos) ─────────────────────────
// Enmascara correo: tucorreo@gmail.com → tuc***@gmail.com
function maskEmail(email) {
  const [user, domain] = email.split('@');
  const visible = user.slice(0, 3);
  return `${visible}***@${domain}`;
}

function LoginColModal({ onSession }) {
  const [step, setStep] = useState('collegiate');
  const [colegiadoInput, setColegiadoInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cpgData, setCpgData] = useState(null);
  // Para el caso de colegiado ya registrado
  const [registeredEmail, setRegisteredEmail] = useState(null); // email ya vinculado
  const [resetSent, setResetSent] = useState(false);

  const handleVerifyCollegiado = async () => {
    const val = colegiadoInput.trim();
    if (!val) { setError('Ingresa tu número de colegiado.'); return; }
    setLoading(true); setError('');
    try {
      const data = await consultarColegiado(val);
      setCpgData(data);
      setRegisteredEmail(null);
      setResetSent(false);
      // Verificar si el colegiado ya tiene cuenta registrada
      if (supabase) {
        const { data: profile } = await supabase
          .from('cpg_user_profiles')
          .select('email')
          .eq('collegiate_number', val)
          .maybeSingle();
        if (profile?.email) {
          setRegisteredEmail(profile.email);
          setAuthMode('login'); // Forzar modo login
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
      redirectTo: `${APP_URL}/?reset=true`,
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
      onSession({ name: cpgData.name, collegiateNumber: cpgData.colegiado, status: cpgData.status, isGuest: false, email: emailInput.trim() });
      return;
    }
    setLoading(true); setError('');
    try {
      if (authMode === 'register') {
        // Verificar doble: que el colegiado no esté ya registrado
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
        // Registrar en Supabase Auth
        const { error: signUpErr } = await supabase.auth.signUp({ email: emailInput.trim(), password: passwordInput });
        if (signUpErr) {
          if (signUpErr.message.includes('already registered')) {
            setError('Este correo ya está registrado. Selecciona "Ingresar".');
          } else { setError(signUpErr.message); }
          setLoading(false); return;
        }
        // Vincular colegiado ↔ correo en la tabla de perfiles
        await supabase.from('cpg_user_profiles').upsert(
          { collegiate_number: cpgData.colegiado, email: emailInput.trim(), name: cpgData.name },
          { onConflict: 'collegiate_number' }
        );
      } else {
        // Login normal
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: emailInput.trim(), password: passwordInput });
        if (signInErr) {
          if (signInErr.message.includes('Invalid') || signInErr.message.includes('not found')) {
            setError('Contraseña incorrecta. Si olvidaste tu contraseña, usa "Recuperar contraseña".');
          } else { setError(signInErr.message); }
          setLoading(false); return;
        }
      }
      onSession({ name: cpgData.name, collegiateNumber: cpgData.colegiado, status: cpgData.status, isGuest: false, email: emailInput.trim() });
    } catch (e) {
      setError('Error de autenticación: ' + e.message);
    } finally { setLoading(false); }
  };

  // Reset para el flujo normal (sin registeredEmail): usa el email que escribió el usuario
  const handlePasswordResetNormal = async () => {
    if (!emailInput.trim()) { setError('Ingresa tu correo electrónico primero.'); return; }
    if (!supabase) return;
    setLoading(true);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailInput.trim(), {
      redirectTo: `${APP_URL}/?reset=true`,
    });
    setLoading(false);
    if (resetErr) { setError('No se pudo enviar el correo: ' + resetErr.message); return; }
    setResetSent(true);
    setRegisteredEmail(emailInput.trim()); // reutiliza la pantalla de confirmación
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
          {/* Indicador de pasos */}
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
              <p className="text-gray-400 text-sm mb-6">Ingresa tu número de colegiado para continuar.</p>
              <div className="mb-4">
                <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Número de Colegiado</label>
                <input type="number" value={colegiadoInput} onChange={e => { setColegiadoInput(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleVerifyCollegiado()} className="w-full bg-black border border-gray-700 rounded-lg p-3.5 text-white text-lg font-mono focus:border-blue-500 outline-none transition" placeholder="Ej. 4661" disabled={loading} />
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

          {step === 'auth' && cpgData && (
            <>
              {/* Card de colegiado verificado */}
              <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-4 mb-6">
                <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-1">✓ Colegiado verificado</p>
                <p className="text-white font-bold">{cpgData.name}</p>
                <p className="text-gray-400 text-sm">No. {cpgData.colegiado} · <span className={`font-semibold ${cpgData.status === 'ACTIVO' ? 'text-green-400' : 'text-red-400'}`}>{cpgData.status}</span></p>
              </div>

              {/* ── CASO: colegiado ya tiene correo registrado ── */}
              {registeredEmail ? (
                resetSent ? (
                  <div className="text-center py-4">
                    <div className="w-14 h-14 bg-green-800/30 border border-green-600/40 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={28} className="text-green-400" />
                    </div>
                    <h2 className="text-white font-bold text-lg mb-2">Correo enviado</h2>
                    <p className="text-gray-400 text-sm mb-1">Revisa tu bandeja de entrada en:</p>
                    <p className="text-blue-300 font-mono text-sm mb-4">{maskEmail(registeredEmail)}</p>
                    <p className="text-gray-500 text-xs">Sigue el enlace del correo para crear una nueva contraseña.</p>
                    <button onClick={() => { setRegisteredEmail(null); setResetSent(false); setAuthMode('login'); }} className="mt-5 text-gray-500 hover:text-gray-300 text-sm transition">
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

                    <button onClick={handlePasswordReset} disabled={loading} className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2 text-sm mb-3">
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <><KeyRound size={16} /> Olvidé mi contraseña — enviar correo de recuperación</>}
                    </button>

                    <button onClick={() => { setStep('collegiate'); setError(''); setRegisteredEmail(null); }} className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition">
                      ← Cambiar número de colegiado
                    </button>
                  </div>
                )
              ) : (
                /* ── CASO NORMAL: colegiado nuevo, toggle login/registro ── */
                <>
                  <div className="flex bg-gray-900 border border-gray-700 rounded-xl p-1 mb-5">
                    <button onClick={() => { setAuthMode('login'); setError(''); }} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${authMode === 'login' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Ingresar</button>
                    <button onClick={() => { setAuthMode('register'); setError(''); }} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${authMode === 'register' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Crear cuenta</button>
                  </div>

                  <h2 className="text-white font-bold text-lg mb-1">{authMode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</h2>
                  <p className="text-gray-400 text-sm mb-5">{authMode === 'login' ? 'Ingresa con tu correo y contraseña.' : 'Registra tu correo para acceder al aula virtual.'}</p>

                  {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start gap-2"><XCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}

                  <div className="mb-3">
                    <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Correo electrónico</label>
                    <input type="email" value={emailInput} onChange={e => { setEmailInput(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition" placeholder="tucorreo@ejemplo.com" />
                  </div>
                  <div className="mb-4">
                    <label className="block text-gray-400 text-xs mb-1.5 uppercase tracking-wider">Contraseña {authMode === 'register' && <span className="text-gray-600 normal-case">(mínimo 6 caracteres)</span>}</label>
                    <input type="password" value={passwordInput} onChange={e => { setPasswordInput(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition" placeholder="••••••••" />
                  </div>

                  <button onClick={handleEmailAuth} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 mb-3">
                    {loading ? <><Loader2 size={18} className="animate-spin" /> Procesando...</> : <><Mail size={18} /> {authMode === 'login' ? 'Ingresar' : 'Crear cuenta e ingresar'}</>}
                  </button>

                  {/* Google */}
                  <button onClick={handleGoogle} disabled={loading} className="w-full bg-white hover:bg-gray-100 text-gray-800 font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2 mb-3 text-sm">
                    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.84l6.1-6.1C34.46 3.19 29.5 1 24 1 14.82 1 7.07 6.48 3.64 14.24l7.1 5.52C12.5 13.37 17.77 9.5 24 9.5z"/><path fill="#4285F4" d="M46.52 24.5c0-1.64-.15-3.22-.42-4.75H24v9h12.67c-.55 2.97-2.2 5.48-4.67 7.17l7.18 5.57C43.32 37.3 46.52 31.36 46.52 24.5z"/><path fill="#FBBC05" d="M10.74 28.24A14.54 14.54 0 0 1 9.5 24c0-1.48.26-2.91.7-4.24l-7.1-5.52A23.94 23.94 0 0 0 0 24c0 3.87.93 7.52 2.57 10.74l8.17-6.5z"/><path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.49-4.94l-7.18-5.57C28.6 37.84 26.42 38.5 24 38.5c-6.23 0-11.5-3.87-13.26-9.26l-8.17 6.5C6.07 43.52 14.82 47 24 47z"/></svg>
                    Continuar con Google
                  </button>

                  {authMode === 'login' && (
                    <button onClick={handlePasswordResetNormal} disabled={loading} className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition flex items-center justify-center gap-1.5 mb-1">
                      <KeyRound size={14} /> Olvidé mi contraseña
                    </button>
                  )}

                  {authMode === 'login' && (
                    <button onClick={() => { setAuthMode('register'); setError(''); }} className="w-full text-gray-600 hover:text-gray-400 text-xs py-1 transition mb-2">
                      ¿Primera vez? Crear cuenta →
                    </button>
                  )}

                  <button onClick={() => { setStep('collegiate'); setError(''); }} className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition">
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
  const [manualCertificate, setManualCertificate] = useState(null);
  const [authError, setAuthError] = useState('');
  const [activities, setActivities] = useState([]);
  const [userProfile, setUserProfile] = useState({ name: '', collegiateNumber: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [liveSession, setLiveSession] = useState(null);
  const [reprintCert, setReprintCert] = useState(null);

  // Detectar ?cert=CPG-... en la URL (verificación pública de certificados)
  const certCodeFromUrl = new URLSearchParams(window.location.search).get('cert');

  // Manejar retorno de OAuth Google
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const pending = localStorage.getItem('cpg_google_pending');
        if (pending) {
          try {
            const data = JSON.parse(pending);
            localStorage.removeItem('cpg_google_pending');
            const user = { name: data.name, collegiateNumber: data.colegiado, status: data.status, isGuest: false, email: session.user.email };
            localStorage.setItem('cpg_session', JSON.stringify(user));
            setSessionUser(user);
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
      if (data) setLiveSession(data);
    } catch {}
  };

  const saveLiveSession = async (updates) => {
    const next = { ...liveSession, ...updates, updated_at: new Date().toISOString() };
    setLiveSession(next);
    if (!supabase) return;
    await supabase.from('cpg_live_session').upsert({ id: 1, ...next }, { onConflict: 'id' });
  };

  const registerAttendance = async () => {
    if (!supabase || !sessionUser || sessionUser.isGuest || !liveSession?.active) return;
    try {
      await supabase.from('cpg_live_attendance').insert({
        collegiate_number: sessionUser.collegiateNumber,
        name: sessionUser.name,
        platform: liveSession.platform,
        session_title: liveSession.title,
      });
    } catch {}
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
            if (data?.videos?.length || data?.activities?.length) { await loadViewCounts(); await loadLiveSession(); return; }
          }
        } catch {}
      }
      const sv = localStorage.getItem('cpg_videos');
      const sa = localStorage.getItem('cpg_activities');
      setVideos(sv ? JSON.parse(sv) : INITIAL_VIDEOS);
      if (sa) setActivities(JSON.parse(sa));
      await loadViewCounts();
      await loadLiveSession();
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
      const { error } = await supabase.from('cpg_content').upsert({ id: 1, videos: nextVideos, activities: nextActivities }, { onConflict: 'id' });
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
    if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
      if (!supabase) { setAuthError('No se encontró la configuración de Supabase.'); return; }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setAuthError('No se pudo iniciar sesión: ' + error.message); return; }
      setIsAdmin(true); setView('admin');
    } else { setAuthError('Credenciales incorrectas'); }
  };

  const handleLogout = async () => { if (supabase) await supabase.auth.signOut(); localStorage.removeItem('cpg_session'); setIsAdmin(false); setSessionUser(null); setView('home'); };
  const handleManualCertificate = (video, profile) => { setManualCertificate({ video, profile }); setView('certificate'); };
  const handleCloseManualCertificate = () => { setManualCertificate(null); setView('admin'); };

  const categories = [...new Set(videos.map(v => v.category))];
  const publishedVideos = videos.filter(isVideoPublished);
  const upcomingVideos = videos.filter(v => !isVideoPublished(v));
  const recentVideos = [...publishedVideos].reverse().slice(0, 5);

  // Vista pública de verificación de certificado (no requiere login)
  if (certCodeFromUrl) return <CertificateVerifyView code={certCodeFromUrl} />;

  if (!sessionUser) return <LoginColModal onSession={(user) => {
    localStorage.setItem('cpg_session', JSON.stringify(user));
    setSessionUser(user);
  }} />;

  const firstName = getFirstName(sessionUser.name);

  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans selection:bg-blue-600 selection:text-white overflow-x-hidden">
      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 w-full z-50 bg-[#0e0e0e] border-b border-gray-800 px-4 py-3 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setView('home'); setSearchQuery(''); }}>
          <img src="/logo-cpg-grande.png" alt="Logo CPG" className="w-11 h-11 object-contain filter drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="hidden md:block">
            <h1 className="text-base font-bold leading-tight text-gray-100">Colegio de Psicólogos de Guatemala</h1>
            <p className="text-xs text-blue-400 tracking-widest uppercase">Aula Virtual</p>
          </div>
          <img src="/logo-caeduc.png" alt="Logo CAEDUC" className="w-11 h-11 object-contain filter drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
          {totalViews > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 bg-blue-900/30 border border-blue-700/50 text-blue-300 text-xs font-semibold px-3 py-1.5 rounded-full">
              <Eye size={12} />{totalViews.toLocaleString()} reproducciones
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {/* ── BARRA DE BÚSQUEDA ── */}
          <div className="relative hidden md:block">
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

          {view !== 'home' && <button onClick={() => setView('home')} className="text-sm hover:text-blue-400 transition-colors">Inicio</button>}
          {liveSession?.active && (
            <button onClick={() => setView('live')} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg shadow-red-900/40 transition animate-pulse">
              <Radio size={12} />EN VIVO
            </button>
          )}
          <a href="https://gestionescaeduc.vercel.app/" target="_blank" rel="noreferrer" className="hidden md:flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition"><ExternalLink size={12} /> Avales CAEDUC</a>
          <a href="https://caeducgt.org/" target="_blank" rel="noreferrer" className="hidden md:flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition"><ExternalLink size={12} /> Créditos Académicos</a>
          <a href="https://colegiodepsicologos.org.gt" target="_blank" rel="noreferrer" className="hidden md:flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-800 transition"><ExternalLink size={12} /> Sitio Oficial</a>

          {/* Historial (solo colegiados) */}
          {!sessionUser.isGuest && (
            <button onClick={() => setView('history')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white border border-gray-700 px-2.5 py-1.5 rounded-full hover:bg-gray-800 transition" title="Mis cursos">
              <History size={13} />
            </button>
          )}

          <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-full px-3 py-1.5">
            <div className={'w-2 h-2 rounded-full ' + (sessionUser.isGuest ? 'bg-gray-400' : 'bg-green-400')} />
            <span className="text-sm text-gray-200 font-medium">{sessionUser.isGuest ? 'Invitado' : 'Bienvenido, ' + firstName}</span>
            <button onClick={() => setSessionUser(null)} className="text-gray-500 hover:text-red-400 transition ml-1" title="Cerrar sesión"><X size={14} /></button>
          </div>
          {isAdmin ? (
            <button onClick={handleLogout} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded text-sm font-medium transition"><LogOut size={15} /> Salir</button>
          ) : (
            <button onClick={() => setView('login')} className="text-gray-400 hover:text-white transition p-2" title="Acceso Administrativo"><Lock size={17} /></button>
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

        {view === 'home' && <HomeView videos={videos} viewCounts={viewCounts} recentVideos={recentVideos} categories={categories} upcomingVideos={upcomingVideos} activities={activities} completedVideos={completedVideos} sessionUser={sessionUser} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onVideoSelect={(v) => { if (!isVideoPublished(v)) return; setSelectedVideo(v); incrementViewCount(v.id); setView('player'); }} />}
        {view === 'live' && <LiveSessionView session={liveSession} onBack={() => setView('home')} sessionUser={sessionUser} onRegisterAttendance={registerAttendance} />}
        {view === 'player' && selectedVideo && <PlayerView video={selectedVideo} viewCounts={viewCounts} onBack={() => setView('home')} sessionUser={sessionUser} userProfile={userProfile} setUserProfile={setUserProfile} isCompleted={completedVideos.has(selectedVideo.id)} onMarkCompleted={() => markVideoCompleted(selectedVideo.id)} />}
        {view === 'login' && <LoginView onLogin={handleLogin} onBack={() => setView('home')} authError={authError} />}
        {view === 'admin' && isAdmin && <AdminDashboard videos={videos} viewCounts={viewCounts} totalViews={totalViews} activities={activities} liveSession={liveSession} onSaveLiveSession={saveLiveSession} onVideosChange={persistVideos} onActivitiesChange={persistActivities} onGenerateCertificate={handleManualCertificate} />}
        {view === 'certificate' && manualCertificate && <div className="min-h-screen bg-[#141414] pt-20 px-4 md:px-16 pb-12"><CertificateView video={manualCertificate.video} userProfile={manualCertificate.profile} onBack={handleCloseManualCertificate} /></div>}
        {view === 'history' && !sessionUser.isGuest && !reprintCert && <HistoryView sessionUser={sessionUser} onBack={() => setView('home')} onReprintCert={(cert) => setReprintCert(cert)} />}
        {view === 'history' && reprintCert && <div className="min-h-screen bg-[#141414] pt-20 px-4 md:px-16 pb-12"><CertificateReprintView cert={reprintCert} onBack={() => setReprintCert(null)} /></div>}
      </div>

      <footer className="py-12 px-10 bg-black/80 text-gray-500 text-sm border-t border-gray-800 mt-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
              <img src="/logo-cpg-grande.png" alt="Logo CPG" className="w-14 h-14 object-contain filter drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
              <img src="/logo-caeduc.png" alt="Logo CAEDUC" className="w-14 h-14 object-contain filter drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
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
    <div className="min-h-screen bg-[#141414] pt-24 px-4 md:px-16 pb-12">
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

// ── REIMPRESIÓN DE CERTIFICADO DESDE HISTORIAL ────────────────
function CertificateReprintView({ cert, onBack }) {
  const certRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const issuedDate = new Date(cert.issued_at);
  const dateFormatted = issuedDate.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
  const qrUrl = getCertQrUrl(cert.certificate_code);
  const statusText = cert.status || '';

  const handleDownloadPDF = async () => {
    if (!certRef.current || !imageLoaded) { alert('Espera a que la plantilla cargue completamente.'); return; }
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(certRef.current, { scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false, imageTimeout: 15000 });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      const imgData = canvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save('Certificado_' + cert.recipient_name.replace(/\s+/g, '_') + '_' + cert.certificate_code + '.pdf');
    } catch (error) { console.error('Error generando PDF:', error); alert('Hubo un error al generar el PDF.'); }
    finally { setIsGenerating(false); }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-4 print:hidden">
        <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded">← Mis certificados</button>
        <button onClick={handleDownloadPDF} disabled={isGenerating || !imageLoaded} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded font-bold flex items-center gap-2">
          {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Generando PDF...</> : <><Download size={18} /> Descargar PDF</>}
        </button>
      </div>
      <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-full px-4 py-1.5 text-xs text-gray-400 print:hidden">
        <Shield size={12} className="text-green-400" />
        <span className="font-mono">{cert.certificate_code}</span>
      </div>
      {!imageLoaded && <div className="text-yellow-400 text-sm flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Cargando plantilla...</div>}
      <div className="overflow-auto w-full flex justify-center p-4">
        <div ref={certRef} className="relative shadow-2xl" style={{ width: '1056px', height: '816px', fontFamily: "'Georgia', 'Times New Roman', serif" }}>
          <img src="/certificado-plantilla1.png" alt="Plantilla" className="absolute inset-0 w-full h-full object-fill" crossOrigin="anonymous" onLoad={() => setImageLoaded(true)} onError={(e) => { e.target.style.display = 'none'; setImageLoaded(true); }} />
          <div className="absolute inset-0" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
            <div className="absolute text-center" style={{ top: '315px', left: '53%', transform: 'translateX(-50%)', width: '580px' }}>
              <p style={{ fontSize: '34px', fontWeight: 'bold', color: '#1a1a2e', letterSpacing: '0.3px', lineHeight: '1.2' }}>{cert.recipient_name}</p>
            </div>
            {statusText && statusText !== 'DESCONOCIDO' && statusText !== 'INVITADO' && (
              <div className="absolute" style={{ top: '387px', left: '490px' }}>
                <p style={{ fontSize: '15px', fontWeight: 'bold', color: statusText.includes('ACTIVO') ? '#166534' : '#991b1b', letterSpacing: '0.5px' }}>
                  {statusText.includes('ACTIVO') ? 'ACTIVO' : 'INACTIVO'}
                </p>
              </div>
            )}
            <div className="absolute" style={{ top: '385px', left: '700px' }}>
              <p style={{ fontSize: '17px', fontWeight: 'bold', color: '#1a1a2e' }}>{cert.collegiate_number}</p>
            </div>
            <div className="absolute text-center" style={{ top: '478px', left: '53%', transform: 'translateX(-50%)', width: '640px' }}>
              <p style={{ fontSize: cert.video_title.length > 60 ? '18px' : cert.video_title.length > 40 ? '21px' : '25px', fontWeight: 'bold', color: '#1a1a2e', textTransform: 'uppercase', lineHeight: '1.35', wordBreak: 'break-word' }}>{cert.video_title}</p>
            </div>
            <div className="absolute" style={{ top: '540px', left: '430px' }}>
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a1a2e' }}>{cert.video_duration || ''}</p>
            </div>
            <div className="absolute text-center" style={{ top: '606px', left: '53%', transform: 'translateX(-50%)', width: '400px' }}>
              <p style={{ fontSize: '13px', color: '#333333' }}>{dateFormatted}</p>
            </div>
            <div className="absolute text-center" style={{ top: '622px', left: '53%', transform: 'translateX(-50%)', width: '400px' }}>
              <p style={{ fontSize: '11px', color: '#555555', fontFamily: "'Courier New', monospace", letterSpacing: '0.5px' }}>{cert.certificate_code}</p>
            </div>
            <div className="absolute" style={{ bottom: '48px', right: '52px', textAlign: 'center' }}>
              <img src={qrUrl} alt="QR Verificación" crossOrigin="anonymous" style={{ width: '90px', height: '90px', display: 'block' }} />
              <p style={{ fontSize: '7px', color: '#888888', marginTop: '3px', fontFamily: 'monospace', letterSpacing: '0.3px' }}>Escanea para verificar</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── HOME VIEW ─────────────────────────────────────
function HomeView({ videos, viewCounts, recentVideos, categories, upcomingVideos, activities, completedVideos, sessionUser, searchQuery, setSearchQuery, onVideoSelect }) {
  const heroVideo = recentVideos[0];
  const [activeCategory, setActiveCategory] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const isGuest = sessionUser?.isGuest;

  // Búsqueda
  const searchResults = searchQuery.trim()
    ? videos.filter(v => {
        const q = searchQuery.toLowerCase();
        return v.title?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q) || v.category?.toLowerCase().includes(q);
      })
    : null;

  const categoriesToRender = activeCategory ? [activeCategory] : categories;
  const now = new Date();

  const parseActDate = (a) => new Date(a.date + 'T00:00:00');
  const allActivities = activities.filter(a => a?.date).map(a => ({ ...a, parsedDate: parseActDate(a) })).filter(a => !Number.isNaN(a.parsedDate.valueOf())).sort((a, b) => a.parsedDate - b.parsedDate);
  const upcomingActs = allActivities.filter(a => a.parsedDate >= now);
  const pastActs = allActivities.filter(a => a.parsedDate < now).reverse();

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
        {/* Invitados: ven los links pero no pueden acceder */}
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

  // ── RESULTADOS DE BÚSQUEDA ──
  if (searchResults !== null) {
    return (
      <div className="pb-10 pt-[57px] px-8 md:px-16">
        {/* Búsqueda móvil */}
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
      {/* Banner invitado */}
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

      {!activeCategory && heroVideo && (
        <div className={`relative h-[50vh] w-full overflow-hidden ${isGuest ? '' : 'mt-[57px]'}`}>
          <div className="absolute inset-0">
            <img src={getVideoThumbnail(heroVideo)} alt={heroVideo.title} className="w-full h-full object-cover opacity-60 scale-105" onError={(e) => { const t = e.currentTarget; const s = t.dataset.fallbackStage || 'hqdefault'; if (s === 'hqdefault') { t.dataset.fallbackStage = 'mqdefault'; t.src = getYouTubeThumbnail(heroVideo.youtubeId, 'mqdefault'); return; } t.src = getYouTubeThumbnail(''); }} />
            <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
          </div>
          <div className="absolute bottom-0 left-0 p-6 md:p-12 max-w-xl z-10 flex flex-col gap-3">
            <span className="text-yellow-500 font-bold tracking-wider text-xs uppercase bg-black/50 w-fit px-2 py-1 rounded border border-yellow-500/30">Destacado</span>
            <h1 className="text-2xl md:text-4xl font-bold text-white drop-shadow-xl leading-tight">{heroVideo.title}</h1>
            <p className="text-gray-200 text-sm md:text-base line-clamp-2 drop-shadow-md">{heroVideo.description}</p>
            <button onClick={() => onVideoSelect(heroVideo)} className="bg-white text-black px-6 py-2.5 rounded hover:bg-gray-200 font-bold flex items-center gap-2 transition transform hover:scale-105 text-sm w-fit"><Play fill="black" size={18} /> Ver Ahora</button>
          </div>
        </div>
      )}
      {activeCategory && <div className={isGuest ? '' : 'mt-[57px]'} />}

      {/* Búsqueda móvil */}
      <div className="md:hidden px-6 mt-4 relative">
        <Search size={14} className="absolute left-9 top-3 text-gray-500 pointer-events-none" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-full pl-8 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" placeholder="Buscar cursos..." />
      </div>

      <div className="px-8 md:px-16 mt-8">
        <div className="bg-[#1c1c1c] border border-gray-800 rounded-2xl p-5 md:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-blue-400">Calendario de capacitación</p>
            <h2 className="text-xl md:text-2xl font-bold text-white mt-1">Actividades programadas</h2>
            <p className="text-gray-400 mt-1 max-w-2xl text-sm">Consulta las fechas, organizadores y enlaces de inscripción.</p>
          </div>
          <button type="button" onClick={() => setShowCalendar(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 text-sm"><CalendarDays size={18} /> Ver calendario</button>
        </div>
      </div>

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
            {videos.filter(v => v.category === category).map(v => <VideoCard key={v.id} video={v} viewCount={viewCounts[v.id] || 0} onClick={() => onVideoSelect(v)} isSmall={!activeCategory} isPublished={isVideoPublished(v)} isCompleted={completedVideos.has(v.id)} isGuest={isGuest} />)}
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
  return (
    <div onClick={handleClick} className={'relative flex-shrink-0 bg-gray-900 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-105 hover:z-50 hover:shadow-2xl hover:shadow-blue-900/40 group flex flex-col ' + (isSmall ? 'w-56' : 'w-72') + ' ' + (isPublished ? 'cursor-pointer' : 'cursor-not-allowed opacity-80')}>
      <div className={'relative flex-shrink-0 ' + (isSmall ? 'h-32' : 'h-40') + ' w-full'}>
        <img src={getVideoThumbnail(video)} alt={video.title} className="w-full h-full object-cover" onError={(e) => { const t = e.currentTarget; const s = t.dataset.fallbackStage || 'hqdefault'; if (s === 'hqdefault') { t.dataset.fallbackStage = 'mqdefault'; t.src = getYouTubeThumbnail(video.youtubeId, 'mqdefault'); return; } t.src = getYouTubeThumbnail(''); }} />
        <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-all" />
        {isCompleted && <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1 shadow-lg"><CheckCircle size={14} className="text-white" fill="white" /></div>}
        {isPublished && !isGuest && <div className="absolute top-2 left-2 bg-black/70 px-2 py-0.5 text-xs rounded text-white flex items-center gap-1"><Eye size={11} /> {viewCount}</div>}
        {/* Overlay de bloqueo para invitados */}
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
          {isCompleted && <span className="ml-auto text-[10px] text-green-400 font-bold">✓ Visto</span>}
        </div>
      </div>
    </div>
  );
}

// ── PLAYER VIEW ───────────────────────────────────
function PlayerView({ video, viewCounts, onBack, sessionUser, userProfile, setUserProfile, isCompleted, onMarkCompleted }) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [showCert, setShowCert] = useState(false);
  const [lookingUpStatus, setLookingUpStatus] = useState(false);
  const viewCount = viewCounts[video.id] || 0;

  // Bloqueo para invitados
  if (sessionUser.isGuest) {
    return (
      <div className="min-h-screen bg-[#141414] pt-20 px-4 pb-12 flex items-center justify-center">
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
      console.log('[CPG] Respuesta API colegiado:', JSON.stringify(data));
      if (data?.status) {
        const s = String(data.status).toUpperCase();
        console.log('[CPG] Status normalizado:', s);
        setUserProfile(prev => ({ ...prev, status: s }));
      }
    } catch (err) {
      console.error('[CPG] Error consultando colegiado:', err);
    }
    setLookingUpStatus(false);
    setShowQuiz(true);
  };

  return (
    <div className="min-h-screen bg-[#141414] pt-20 px-4 md:px-16 pb-12">
      <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"><ChevronLeft /> Regresar</button>
      {showCert ? (
        <CertificateView video={video} userProfile={userProfile} sessionUser={sessionUser} onBack={() => setShowCert(false)} />
      ) : showQuiz ? (
        <QuizModal video={video} onCancel={() => setShowQuiz(false)} onPass={() => { onMarkCompleted(); setShowCert(true); }} sessionUser={sessionUser} userProfile={userProfile} setUserProfile={setUserProfile} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="aspect-video w-full bg-black rounded-lg overflow-hidden shadow-2xl shadow-blue-900/20 border border-gray-800">
              <iframe width="100%" height="100%" src={'https://www.youtube-nocookie.com/embed/' + extractYouTubeId(video.youtubeId) + '?playsinline=1&rel=0'} title={video.title} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
            </div>
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
              <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-800 text-center text-gray-500 text-sm">Esta clase no requiere evaluación para certificación.</div>
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

  // Nombre NO editable — viene directamente de la API del CPG
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
        {/* Nombre NO editable */}
        <div className="flex-1">
          <label className="block text-gray-500 text-xs mb-1 uppercase tracking-wider flex items-center gap-1">
            <Shield size={11} className="text-green-500" /> Nombre (registro CPG — no editable)
          </label>
          <div className="w-full bg-black/60 border border-gray-700 rounded p-2.5 text-white text-sm flex items-center gap-2">
            <Lock size={12} className="text-gray-600 shrink-0" />
            <span>{displayName}</span>
          </div>
        </div>
        {/* Colegiado */}
        <div className="md:w-40">
          <label className="block text-gray-500 text-xs mb-1 uppercase tracking-wider">Colegiado No.</label>
          <div className="bg-gray-900 border border-gray-700 rounded p-2.5 text-gray-400 text-sm font-mono flex items-center gap-2"><Lock size={12} className="text-gray-600" />{sessionUser.collegiateNumber}</div>
        </div>
        {/* Estado */}
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
function CertificateView({ video, userProfile, sessionUser, onBack }) {
  const certRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [resolvedStatus, setResolvedStatus] = useState('');
  const [saved, setSaved] = useState(false);

  const currentDate = new Date();
  const fmt = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const certificateCode = 'CPG-' + fmt(currentDate) + '-' + (userProfile.collegiateNumber || sessionUser?.collegiateNumber || '0000');
  const dateFormatted = currentDate.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
  const qrUrl = getCertQrUrl(certificateCode);

  // Resolver estado
  useEffect(() => {
    const tryResolve = async () => {
      const profileStatus = String(userProfile.status || '').toUpperCase().trim();
      if (profileStatus && profileStatus !== 'DESCONOCIDO' && profileStatus !== 'INVITADO') {
        setResolvedStatus(profileStatus); return;
      }
      const sessionStatus = String(sessionUser?.status || '').toUpperCase().trim();
      if (sessionStatus && sessionStatus !== 'DESCONOCIDO' && sessionStatus !== 'INVITADO') {
        setResolvedStatus(sessionStatus); return;
      }
      const collegiateNum = userProfile.collegiateNumber || sessionUser?.collegiateNumber;
      if (!collegiateNum || collegiateNum === '0000') return;
      try {
        const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: collegiateNum }) });
        const data = await res.json();
        const apiStatus = String(data?.status || '').toUpperCase().trim();
        if (apiStatus && apiStatus !== 'DESCONOCIDO') setResolvedStatus(apiStatus);
      } catch {}
    };
    tryResolve();
  }, [userProfile.status, userProfile.collegiateNumber]);

  // Guardar registro del certificado en Supabase
  useEffect(() => {
    if (!supabase || saved || !resolvedStatus) return;
    const collegiateNum = userProfile.collegiateNumber || sessionUser?.collegiateNumber;
    if (!collegiateNum || collegiateNum === '0000') return;
    setSaved(true);
    supabase.from('cpg_certificates').upsert({
      certificate_code: certificateCode,
      collegiate_number: collegiateNum,
      recipient_name: userProfile.name,
      status: resolvedStatus,
      video_id: video.id,
      video_title: video.title,
      video_duration: String(video.duration || ''),
      issued_at: currentDate.toISOString(),
      verify_url: `${APP_URL}/?cert=${certificateCode}`,
    }, { onConflict: 'certificate_code' }).then(({ error }) => {
      if (error) console.warn('[CPG Cert] No se pudo guardar registro:', error.message);
    });
  }, [resolvedStatus, saved]);

  const statusText = resolvedStatus;

  const handleDownloadPDF = async () => {
    if (!certRef.current || !imageLoaded) { alert('Espera a que la plantilla del certificado cargue completamente.'); return; }
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(certRef.current, { scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false, imageTimeout: 15000 });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      const imgData = canvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save('Certificado_' + userProfile.name.replace(/\s+/g, '_') + '_' + certificateCode + '.pdf');
    } catch (error) { console.error('Error generando PDF:', error); alert('Hubo un error al generar el PDF.'); }
    finally { setIsGenerating(false); }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-4 print:hidden">
        <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded">Cerrar</button>
        <button onClick={handleDownloadPDF} disabled={isGenerating || !imageLoaded} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded font-bold flex items-center gap-2">
          {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Generando PDF...</> : <><Download size={18} /> Descargar PDF</>}
        </button>
      </div>

      {/* Código de verificación */}
      <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-full px-4 py-1.5 text-xs text-gray-400 print:hidden">
        <Shield size={12} className="text-green-400" />
        <span className="font-mono">{certificateCode}</span>
        <span className="text-gray-600">·</span>
        <span>Verificable mediante QR</span>
      </div>

      {!imageLoaded && <div className="text-yellow-400 text-sm flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Cargando plantilla...</div>}
      <div className="overflow-auto w-full flex justify-center p-4">
        <div ref={certRef} className="relative shadow-2xl" style={{ width: '1056px', height: '816px', fontFamily: "'Georgia', 'Times New Roman', serif" }}>

          <img src="/certificado-plantilla1.png" alt="Plantilla Certificado" className="absolute inset-0 w-full h-full object-fill" crossOrigin="anonymous" onLoad={() => setImageLoaded(true)} onError={(e) => { e.target.style.display = 'none'; setImageLoaded(true); }} />

          <div className="absolute inset-0" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>

            {/* NOMBRE */}
            <div className="absolute text-center" style={{ top: '315px', left: '53%', transform: 'translateX(-50%)', width: '580px' }}>
              <p style={{ fontSize: '34px', fontWeight: 'bold', color: '#1a1a2e', letterSpacing: '0.3px', lineHeight: '1.2' }}>
                {userProfile.name}
              </p>
            </div>

            {/* ESTADO */}
            {statusText && statusText !== 'DESCONOCIDO' && statusText !== 'INVITADO' && statusText.length > 0 && (
              <div className="absolute" style={{ top: '387px', left: '490px' }}>
                <p style={{ fontSize: '15px', fontWeight: 'bold', color: statusText.includes('ACTIVO') ? '#166534' : '#991b1b', letterSpacing: '0.5px' }}>
                  {statusText.includes('ACTIVO') ? 'ACTIVO' : statusText.includes('INACTIVO') ? 'INACTIVO' : statusText}
                </p>
              </div>
            )}

            {/* NÚMERO DE COLEGIADO */}
            <div className="absolute" style={{ top: '385px', left: '700px' }}>
              <p style={{ fontSize: '17px', fontWeight: 'bold', color: '#1a1a2e' }}>
                {userProfile.collegiateNumber}
              </p>
            </div>

            {/* TÍTULO DEL CURSO */}
            <div className="absolute text-center" style={{ top: '478px', left: '53%', transform: 'translateX(-50%)', width: '640px' }}>
              <p style={{ fontSize: video.title.length > 60 ? '18px' : video.title.length > 40 ? '21px' : '25px', fontWeight: 'bold', color: '#1a1a2e', textTransform: 'uppercase', lineHeight: '1.35', wordBreak: 'break-word' }}>
                {video.title}
              </p>
            </div>

            {/* HORAS */}
            <div className="absolute" style={{ top: '540px', left: '430px' }}>
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a1a2e' }}>{video.duration}</p>
            </div>

            {/* FECHA */}
            <div className="absolute text-center" style={{ top: '606px', left: '53%', transform: 'translateX(-50%)', width: '400px' }}>
              <p style={{ fontSize: '13px', color: '#333333' }}>{dateFormatted}</p>
            </div>

            {/* CÓDIGO */}
            <div className="absolute text-center" style={{ top: '622px', left: '53%', transform: 'translateX(-50%)', width: '400px' }}>
              <p style={{ fontSize: '11px', color: '#555555', fontFamily: "'Courier New', monospace", letterSpacing: '0.5px' }}>{certificateCode}</p>
            </div>

            {/* QR CODE — esquina inferior derecha */}
            <div className="absolute" style={{ bottom: '48px', right: '52px', textAlign: 'center' }}>
              <img
                src={qrUrl}
                alt="QR Verificación"
                crossOrigin="anonymous"
                style={{ width: '90px', height: '90px', display: 'block' }}
              />
              <p style={{ fontSize: '7px', color: '#888888', marginTop: '3px', fontFamily: 'monospace', letterSpacing: '0.3px' }}>Escanea para verificar</p>
            </div>

          </div>
        </div>
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
      <div className="mb-2"><label className="text-xs text-blue-300">Pregunta {idx + 1}</label><input type="text" value={question.question} onChange={e => onQuestionChange(idx, c => ({ ...c, question: e.target.value }))} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white" /></div>
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
function LiveAdminPanel({ liveSession, onSave }) {
  const PLATFORMS = [
    { id: 'youtube', label: 'YouTube Live', hint: 'Pega la URL del video en vivo (ej. https://youtube.com/watch?v=XYZ)', color: 'border-red-600 bg-red-900/20 text-red-300' },
    { id: 'zoom',    label: 'Zoom',         hint: 'Pega el enlace de invitación de Zoom',                               color: 'border-blue-600 bg-blue-900/20 text-blue-300' },
    { id: 'meet',    label: 'Google Meet',  hint: 'Pega el enlace de Google Meet (https://meet.google.com/...)',        color: 'border-green-600 bg-green-900/20 text-green-300' },
  ];
  const [form, setForm] = useState({ title: liveSession?.title || '', platform: liveSession?.platform || 'youtube', url: liveSession?.url || '' });
  const [attendees, setAttendees] = useState([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAttendees, setShowAttendees] = useState(false);
  const isActive = liveSession?.active;
  const currentPlatform = PLATFORMS.find(p => p.id === form.platform);

  const handleToggle = async () => {
    setSaving(true);
    if (!isActive) { await onSave({ active: true, title: form.title, platform: form.platform, url: form.url, started_at: new Date().toISOString() }); }
    else { await onSave({ active: false }); }
    setSaving(false);
  };
  const handleUpdate = async () => { setSaving(true); await onSave({ title: form.title, platform: form.platform, url: form.url }); setSaving(false); };
  const loadAttendees = async () => { if (!supabase) return; setLoadingAtt(true); try { const { data } = await supabase.from('cpg_live_attendance').select('*').order('joined_at', { ascending: false }); setAttendees(data || []); } catch {} setLoadingAtt(false); };
  const handleShowAttendees = async () => { if (!showAttendees) await loadAttendees(); setShowAttendees(p => !p); };
  const exportAttendance = () => {
    if (!attendees.length) return;
    const esc = v => { const s = String(v || ''); return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['Nombre', 'Colegiado', 'Plataforma', 'Título de sesión', 'Fecha/Hora'], ...attendees.map(a => [a.name, a.collegiate_number, a.platform, a.session_title, new Date(a.joined_at).toLocaleString('es-GT')])];
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url;
    link.download = 'asistencia-sesiones-en-vivo.csv'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isActive ? 'bg-red-600' : 'bg-gray-700'}`}><Radio size={20} /></div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isActive ? 'bg-red-600/30 text-red-300' : 'bg-gray-700 text-gray-400'}`}>{isActive ? '● ACTIVA' : '○ INACTIVA'}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleShowAttendees} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-semibold transition"><Users size={16} /> Asistentes</button>
          <button onClick={handleToggle} disabled={saving} className={`flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm transition ${isActive ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />}
            {isActive ? 'Finalizar transmisión' : 'Iniciar transmisión'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Título de la sesión</label>
          <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ej. Webinar: Neuropsicología del aprendizaje" className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" />
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
          <input type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder={currentPlatform?.hint} className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none" />
          {currentPlatform && <p className="text-xs text-gray-600 mt-1">{currentPlatform.hint}</p>}
        </div>
      </div>
      {isActive && <button onClick={handleUpdate} disabled={saving} className="mt-4 flex items-center gap-2 bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm font-semibold transition">{saving ? <Loader2 size={14} className="animate-spin" /> : null}Actualizar configuración en vivo</button>}
      {showAttendees && (
        <div className="mt-6 border-t border-gray-800 pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Registro de asistencia ({attendees.length})</h3>
            {attendees.length > 0 && <button onClick={exportAttendance} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded text-xs font-semibold"><Download size={14} /> Exportar CSV</button>}
          </div>
          {loadingAtt && <div className="text-center py-6"><Loader2 className="animate-spin mx-auto text-gray-500" size={24} /></div>}
          {!loadingAtt && attendees.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No hay registros de asistencia aún.</p>}
          {!loadingAtt && attendees.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                  <tr><th className="text-left px-4 py-3">Nombre</th><th className="text-left px-4 py-3">Colegiado</th><th className="text-left px-4 py-3">Plataforma</th><th className="text-left px-4 py-3">Sesión</th><th className="text-left px-4 py-3">Hora</th></tr>
                </thead>
                <tbody>
                  {attendees.map(a => (
                    <tr key={a.id} className="border-t border-gray-800 hover:bg-gray-900/40">
                      <td className="px-4 py-2 text-white">{a.name || '—'}</td>
                      <td className="px-4 py-2 text-gray-300">{a.collegiate_number}</td>
                      <td className="px-4 py-2 text-gray-400 capitalize">{a.platform}</td>
                      <td className="px-4 py-2 text-gray-400 max-w-xs truncate">{a.session_title}</td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{new Date(a.joined_at).toLocaleString('es-GT')}</td>
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

// ── LIVE SESSION VIEW ─────────────────────────────
function LiveSessionView({ session, onBack, sessionUser, onRegisterAttendance }) {
  const [attended, setAttended] = useState(false);
  const handleAttend = async () => { if (attended || sessionUser?.isGuest) return; await onRegisterAttendance(); setAttended(true); };
  const extractYTId = (url) => { if (!url) return ''; try { const u = new URL(url); if (u.hostname.includes('youtu.be')) return u.pathname.replace('/', ''); if (u.searchParams.has('v')) return u.searchParams.get('v'); } catch {} return url.trim().replace(/^https?:\/\/.*?v=/, '').split('&')[0]; };
  const platformMeta = { youtube: { label: 'YouTube Live', color: 'bg-red-700', icon: '▶', embedable: true }, zoom: { label: 'Zoom', color: 'bg-blue-700', icon: '🎥', embedable: false }, meet: { label: 'Google Meet', color: 'bg-green-700', icon: '📹', embedable: false } };
  const meta = platformMeta[session?.platform] || platformMeta.zoom;
  return (
    <div className="min-h-screen bg-[#0e0e0e] pt-20 px-4 md:px-10 pb-16">
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
        {!sessionUser?.isGuest && (
          <div className={`inline-flex items-center gap-3 mb-6 px-4 py-3 rounded-xl border ${attended ? 'border-green-600 bg-green-900/20 text-green-300' : 'border-blue-700 bg-blue-900/20 text-blue-300'}`}>
            {attended ? <CheckCircle size={18} /> : <Users size={18} />}
            {attended ? <span className="text-sm font-semibold">Tu asistencia fue registrada correctamente</span> : <button onClick={handleAttend} className="text-sm font-semibold hover:text-white transition">Registrar mi asistencia a esta sesión</button>}
          </div>
        )}
        {sessionUser?.isGuest && <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-xl border border-yellow-700 bg-yellow-900/20 text-yellow-300 text-sm"><Lock size={15} /> Ingresa con tu número de colegiado para registrar asistencia</div>}
        {session?.platform === 'youtube' && session?.url && (
          <div className="rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-black aspect-video w-full">
            <iframe src={`https://www.youtube.com/embed/${extractYTId(session.url)}?autoplay=1&rel=0&modestbranding=1`} title="Transmisión en vivo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" />
          </div>
        )}
        {(session?.platform === 'zoom' || session?.platform === 'meet') && session?.url && (
          <div className="rounded-2xl border border-gray-700 bg-[#141414] p-8 md:p-12 text-center">
            <div className="text-5xl mb-4">{meta.icon}</div>
            <h2 className="text-xl font-bold text-white mb-2">La sesión se transmite por {meta.label}</h2>
            <p className="text-gray-400 text-sm mb-8 max-w-md mx-auto">Haz clic en el botón para unirte directamente.{session.platform === 'zoom' && ' Es posible que necesites tener instalada la aplicación de Zoom.'}</p>
            <a href={session.url} target="_blank" rel="noreferrer" onClick={handleAttend} className={`inline-flex items-center gap-3 text-white font-bold px-8 py-4 rounded-xl text-lg shadow-lg transition ${meta.color} hover:opacity-90`}><Video size={22} /> Unirme a {meta.label}</a>
            <p className="text-gray-600 text-xs mt-6">Al unirte, tu asistencia se registrará automáticamente</p>
          </div>
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

// ── ADMIN DASHBOARD ───────────────────────────────
function AdminDashboard({ videos, viewCounts, totalViews, activities, liveSession, onSaveLiveSession, onVideosChange, onActivitiesChange, onGenerateCertificate }) {
  const [editingVideo, setEditingVideo] = useState(null);
  const [manualCertVideo, setManualCertVideo] = useState(null);
  const [manualProfile, setManualProfile] = useState({ name: '', collegiateNumber: '', status: '' });
  const [lookingUpStatus, setLookingUpStatus] = useState(false);
  const [showLiveSection, setShowLiveSection] = useState(false);
  const [showActivitiesSection, setShowActivitiesSection] = useState(false);
  const [showCertsSection, setShowCertsSection] = useState(false);
  const [certsData, setCertsData] = useState([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [certsLoaded, setCertsLoaded] = useState(false);
  const [certsFilter, setCertsFilter] = useState('');
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [saveError, setSaveError] = useState('');
  const [editingActivity, setEditingActivity] = useState(null);
  const [activityError, setActivityError] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportRange, setReportRange] = useState({ start: '', end: '' });
  const [reportError, setReportError] = useState('');
  const [formData, setFormData] = useState({ title: '', category: '', youtubeId: '', duration: '', description: '', thumbnail: '', scheduledAt: '', quizEnabled: false });
  const [questions, setQuestions] = useState([]);
  const EMPTY_ACTIVITY_FORM = { title: '', organizer: '', date: '', time: '', location: '', registrationLink: '', meetingLink: '', isFull: false, participants: '', costType: 'free', cost: '', scholarshipPct: '', scholarshipAmt: '' };
  const [activityForm, setActivityForm] = useState(EMPTY_ACTIVITY_FORM);

  const handleCollegiateBlur = async () => {
    const num = manualProfile.collegiateNumber.trim();
    if (!num || num.length < 3) return;
    setLookingUpStatus(true);
    try {
      const res = await fetch(EDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: num }) });
      const data = await res.json();
      if (data?.status && data.status !== 'DESCONOCIDO') {
        setManualProfile(prev => ({ ...prev, status: data.status, name: prev.name || data.name || '' }));
      }
    } catch {}
    setLookingUpStatus(false);
  };

  const handleEdit = (video) => { setSaveError(''); setEditingVideo(video); setFormData({ ...video, scheduledAt: video.scheduledAt || '', thumbnail: video.thumbnail || '' }); setQuestions((video.questions || []).map(q => ({ ...q, options: [...(q.options || [])] }))); };
  const handleCreate = () => { setSaveError(''); const e = { id: Date.now(), title: '', category: '', youtubeId: '', duration: '', description: '', thumbnail: '', scheduledAt: '', quizEnabled: false, viewCount: 0 }; setEditingVideo(e); setFormData(e); setQuestions(Array(10).fill(null).map((_, i) => ({ question: 'Pregunta ' + (i+1), options: ['Opción 1', 'Opción 2', 'Opción 3'], correctAnswer: 0 }))); };
  const updateQuestion = useCallback((idx, updater) => { setQuestions(prev => prev.map((q, i) => i !== idx ? q : updater(q))); }, []);
  const handleSave = async () => { const nv = { ...formData, questions, viewCount: formData.viewCount || 0 }; setSaveError(''); try { if (videos.some(v => v.id === nv.id)) await onVideosChange(videos.map(v => v.id === nv.id ? nv : v)); else await onVideosChange([...videos, nv]); setEditingVideo(null); } catch (e) { setSaveError('No se pudieron guardar los cambios: ' + e.message); } };
  const handleDelete = async (id) => { if (confirm('¿Eliminar este video?')) { setSaveError(''); try { await onVideosChange(videos.filter(v => v.id !== id)); } catch (e) { setSaveError('No se pudo eliminar: ' + e.message); } } };
  const handleActivityEdit = (a) => { setActivityError(''); setEditingActivity(a); setActivityForm({ title: a.title || '', organizer: a.organizer || '', date: a.date || '', time: a.time || '', location: a.location || '', registrationLink: a.registrationLink || '', meetingLink: a.meetingLink || '', isFull: Boolean(a.isFull), participants: a.participants || '', costType: a.costType || 'free', cost: a.cost || '', scholarshipPct: a.scholarshipPct || '', scholarshipAmt: a.scholarshipAmt || '' }); };
  const handleActivitySave = async () => { if (!activityForm.title || !activityForm.date) { setActivityError('El título y la fecha son obligatorios.'); return; } setActivityError(''); const next = { ...editingActivity, ...activityForm }; try { const exists = activities.some(a => a.id === next.id); await onActivitiesChange(exists ? activities.map(a => a.id === next.id ? next : a) : [...activities, next]); setEditingActivity(null); setActivityForm(EMPTY_ACTIVITY_FORM); } catch (e) { setActivityError('No se pudo guardar: ' + e.message); } };
  const handleActivityDelete = async (id) => { if (!confirm('¿Eliminar esta actividad?')) return; setActivityError(''); try { await onActivitiesChange(activities.filter(a => a.id !== id)); } catch (e) { setActivityError('No se pudo eliminar: ' + e.message); } };
  const handleReportGenerate = () => {
    if (!reportRange.start || !reportRange.end) { setReportError('Selecciona un rango de fechas completo.'); return; }
    const s = new Date(reportRange.start + 'T00:00:00'), e = new Date(reportRange.end + 'T23:59:59');
    if (isNaN(s) || isNaN(e)) { setReportError('Rango inválido.'); return; }
    if (e < s) { setReportError('La fecha final debe ser posterior.'); return; }
    const filtered = activities.filter(a => a?.date).map(a => ({ ...a, pd: new Date(a.date + 'T00:00:00') })).filter(a => !isNaN(a.pd) && a.pd >= s && a.pd <= e);
    if (!filtered.length) { setReportError('No hay actividades en este rango.'); return; }
    const esc = v => { if (!v) return ''; const str = String(v); return (str.includes('"') || str.includes(',') || str.includes('\n')) ? '"' + str.replace(/"/g, '""') + '"' : str; };
    const costLabel = (a) => { if (a.costType === 'paid') return 'Con costo'; if (a.costType === 'scholarship') return 'Con beca'; return 'Gratuito'; };
    const rows = [
      ['Título', 'Organizador', 'Fecha', 'Hora', 'Lugar', 'Participantes', 'Cupo lleno', 'Modalidad de costo', 'Costo total (Q.)', 'Pago agremiado (Q.)', '% de beca', 'Enlace actividad', 'Enlace inscripción'],
      ...filtered.map(a => [a.title, a.organizer || '', a.date, a.time || '', a.location || '', a.participants || '0', a.isFull ? 'Sí' : 'No', costLabel(a), a.costType === 'paid' ? (a.cost || '') : a.costType === 'scholarship' ? (a.cost || '') : '', a.costType === 'scholarship' ? (a.scholarshipAmt || '') : '', a.costType === 'scholarship' ? (a.scholarshipPct ? a.scholarshipPct + '%' : '') : '', a.meetingLink || '', a.registrationLink || ''])
    ];
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'informe-actividades-' + reportRange.start + '-a-' + reportRange.end + '.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    setShowReportModal(false);
  };

  const loadAdminCerts = async () => {
    if (!supabase || certsLoaded) return;
    setCertsLoading(true);
    try {
      const { data } = await supabase.from('cpg_certificates').select('*').order('issued_at', { ascending: false });
      setCertsData(data || []);
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
    const esc = v => { const s = String(v || ''); return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""')+'"' : s; };
    const rows = [
      ['Código', 'Colegiado', 'Nombre', 'Estado CPG', 'Curso', 'Duración (hrs)', 'Fecha de emisión', 'URL verificación'],
      ...data.map(c => [c.certificate_code, c.collegiate_number, c.recipient_name, c.status, c.video_title, c.video_duration || '', new Date(c.issued_at).toLocaleString('es-GT'), c.verify_url || ''])
    ];
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    link.download = 'certificados-emitidos-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  if (editingVideo) {
    return (
      <div className="min-h-screen bg-[#141414] pt-24 px-4 md:px-16 pb-12 text-white">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">{formData.title ? 'Editar Video' : 'Nuevo Video'}</h2>
            <div className="flex gap-2"><button onClick={() => setEditingVideo(null)} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Cancelar</button><button onClick={handleSave} className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 font-bold">Guardar Cambios</button></div>
          </div>
          {saveError && <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{saveError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-400">Título</label><input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /></div>
              <div><label className="block text-sm text-gray-400">Categoría</label><input type="text" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /></div>
              <div><label className="block text-sm text-gray-400">YouTube ID</label><input type="text" value={formData.youtubeId} onChange={e => setFormData({ ...formData, youtubeId: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /></div>
            </div>
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-400">Duración (Horas)</label><input type="number" value={formData.duration} onChange={e => setFormData({ ...formData, duration: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /></div>
              <div><label className="block text-sm text-gray-400">URL Imagen Portada (opcional)</label><input type="text" value={formData.thumbnail} onChange={e => setFormData({ ...formData, thumbnail: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /><p className="text-xs text-gray-500 mt-1">Si no se carga, se usará la portada de YouTube.</p></div>
              <div><label className="block text-sm text-gray-400">Descripción</label><textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white h-24" /></div>
              <div><label className="block text-sm text-gray-400">Programar publicación</label><input type="date" value={formData.scheduledAt} onChange={e => setFormData({ ...formData, scheduledAt: e.target.value })} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" /><p className="text-xs text-gray-500 mt-1">Deja vacío para publicar de inmediato.</p></div>
            </div>
          </div>
          <div className="bg-gray-900 p-6 rounded border border-gray-800">
            <div className="flex items-center gap-3 mb-4"><input type="checkbox" id="quizToggle" checked={formData.quizEnabled} onChange={e => setFormData({ ...formData, quizEnabled: e.target.checked })} className="w-5 h-5 text-blue-600 rounded" /><label htmlFor="quizToggle" className="font-bold text-lg cursor-pointer">Activar Evaluación para Certificado</label></div>
            {formData.quizEnabled && <div className="space-y-4"><p className="text-yellow-500 text-sm mb-4">Configura exactamente 10 preguntas. Marca la respuesta correcta en cada una.</p>{questions.map((q, idx) => <QuestionEditor key={idx} question={q} idx={idx} onQuestionChange={updateQuestion} />)}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414] pt-24 px-4 md:px-16 text-white">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8 border-b border-gray-800 pb-4">
        <div><h1 className="text-3xl font-bold">Panel de Administración</h1><p className="text-sm text-gray-400">Gestiona videos y actividades de capacitación.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-bold flex items-center gap-2"><Plus size={20} /> Nuevo Video</button>
          <button onClick={() => { setEditingActivity({ id: Date.now() }); setActivityForm(EMPTY_ACTIVITY_FORM); }} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded font-bold flex items-center gap-2"><CalendarDays size={18} /> Nueva actividad</button>
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
        {showLiveSection && <div className="border-t border-gray-800"><LiveAdminPanel liveSession={liveSession} onSave={onSaveLiveSession} /></div>}
      </div>

      {/* ── ACTIVIDADES (colapsable + filtro mes) ── */}
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
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setEditingActivity(null)} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Cancelar</button>
                  <button onClick={handleActivitySave} className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 font-bold">Guardar actividad</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activities.filter(a => !a.date || a.date.startsWith(filterMonth)).map(a => {
                const isPast = new Date(a.date + 'T00:00:00') < new Date();
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
            {/* Barra de herramientas */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  value={certsFilter}
                  onChange={e => setCertsFilter(e.target.value)}
                  placeholder="Filtrar por colegiado, nombre o curso..."
                  className="w-full bg-black border border-gray-700 rounded-lg pl-8 pr-4 py-2 text-sm text-white focus:border-yellow-500 outline-none"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setCertsLoaded(false); loadAdminCerts(); }} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm font-semibold transition">
                  <Loader2 size={14} className={certsLoading ? 'animate-spin' : ''} /> Actualizar
                </button>
                {certsData.length > 0 && (
                  <button onClick={() => exportCertsCSV(certsFilter ? certsData.filter(c => {
                    const q = certsFilter.toLowerCase();
                    return c.collegiate_number?.includes(q) || c.recipient_name?.toLowerCase().includes(q) || c.video_title?.toLowerCase().includes(q);
                  }) : certsData)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg text-sm font-semibold transition">
                    <Download size={14} /> Exportar CSV
                  </button>
                )}
              </div>
            </div>

            {certsLoading && <div className="text-center py-10"><Loader2 size={32} className="animate-spin text-yellow-500 mx-auto mb-3" /><p className="text-gray-400 text-sm">Cargando certificados...</p></div>}

            {!certsLoading && certsData.length === 0 && certsLoaded && (
              <div className="text-center py-10 text-gray-500"><Award size={40} className="mx-auto mb-3 opacity-30" /><p>No hay certificados emitidos aún.</p></div>
            )}

            {!certsLoading && certsData.length > 0 && (() => {
              const filtered = certsFilter
                ? certsData.filter(c => {
                    const q = certsFilter.toLowerCase();
                    return c.collegiate_number?.includes(q) || c.recipient_name?.toLowerCase().includes(q) || c.video_title?.toLowerCase().includes(q);
                  })
                : certsData;

              return (
                <>
                  {/* Resumen */}
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

                  {certsFilter && <p className="text-xs text-gray-500 mb-3">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para "{certsFilter}"</p>}

                  {/* Tabla */}
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
                                <button onClick={() => handleDeleteCert(c.id)} className="p-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded" title="Eliminar registro"><Trash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      <h2 className="text-xl font-bold mb-4">Cursos</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
        {videos.map(video => (
          <div key={video.id} className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800 flex flex-col">
            <div className="h-40 relative">
              <img src={getVideoThumbnail(video)} className="w-full h-full object-cover" alt="" onError={(e) => { const t = e.currentTarget; const s = t.dataset.fallbackStage || 'hqdefault'; if (s === 'hqdefault') { t.dataset.fallbackStage = 'mqdefault'; t.src = getYouTubeThumbnail(video.youtubeId, 'mqdefault'); return; } t.src = getYouTubeThumbnail(''); }} />
              <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 text-xs rounded text-white">ID: {video.id}</div>
              <div className="absolute top-2 left-2 bg-green-600/90 px-2 py-1 text-xs rounded text-white flex items-center gap-1"><Eye size={12} /> {viewCounts[video.id] || 0} visitas</div>
            </div>
            <div className="p-4 flex-1"><h3 className="font-bold text-lg mb-1">{video.title}</h3><p className="text-sm text-gray-400 mb-2">{video.category}</p><div className="flex items-center gap-2 text-xs mb-4 flex-wrap">{video.quizEnabled ? <span className="text-green-400 border border-green-400/30 px-2 py-0.5 rounded">Evaluación Activa</span> : <span className="text-gray-500">Sin Evaluación</span>}{!isVideoPublished(video) && <span className="text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded">Programado {formatScheduleDate(video.scheduledAt)}</span>}</div></div>
            <div className="p-4 border-t border-gray-800 flex gap-2">
              <button onClick={() => handleEdit(video)} className="flex-1 bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 py-2 rounded text-sm transition">Editar</button>
              {video.quizEnabled && <button onClick={() => { setManualCertVideo(video); setManualProfile({ name: '', collegiateNumber: '', status: '' }); }} className="flex-1 bg-yellow-700/40 hover:bg-yellow-700/60 text-yellow-200 py-2 rounded text-sm transition">Generar Certificado</button>}
              <button onClick={() => handleDelete(video.id)} className="px-3 bg-red-900/40 hover:bg-red-900/60 text-red-300 rounded transition"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>

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
