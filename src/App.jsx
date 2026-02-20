import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, CheckCircle, XCircle, LogOut, Plus, Trash2, Award, ChevronLeft, Lock, Save, ExternalLink, Menu, X, CalendarDays, Eye, Download, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// --- CONFIGURACIÓN Y DATOS INICIALES ---

const ADMIN_CREDENTIALS = {
  email: "gestor.caeduc@colegiodepsicologos.org.gt",
  password: "CAEDUC2025"
};

const INITIAL_VIDEOS = [
  {
    id: 1,
    title: "Introducción a la Psicología Clínica",
    category: "Psicología Clínica",
    youtubeId: "hJKwF2rXGz4",
    duration: "2",
    description: "Un recorrido fundamental por los principios de la práctica clínica moderna y el abordaje del paciente.",
    thumbnail: "https://i.ytimg.com/vi/hJKwF2rXGz4/hqdefault.jpg",
    scheduledAt: "",
    quizEnabled: true,
    viewCount: 0,
    questions: Array(10).fill(null).map((_, i) => ({
      question: `¿Pregunta de prueba ${i + 1} sobre Psicología Clínica?`,
      options: ["Opción A (Correcta)", "Opción B", "Opción C"],
      correctAnswer: 0
    }))
  },
  {
    id: 2,
    title: "Ética Profesional en la Salud Mental",
    category: "Ética y Legislación",
    youtubeId: "PrJj3sP7b-M", 
    duration: "1.5",
    description: "Análisis del código deontológico y dilemas éticos frecuentes en la consulta.",
    thumbnail: "https://i.ytimg.com/vi/PrJj3sP7b-M/hqdefault.jpg",
    scheduledAt: "",
    quizEnabled: false,
    viewCount: 0,
    questions: []
  },
  {
    id: 3,
    title: "Neuropsicología del Aprendizaje",
    category: "Neuropsicología",
    youtubeId: "MMP3e9yZqIw",
    duration: "3",
    description: "Exploración de las bases neurológicas que sustentan los procesos de aprendizaje y memoria.",
    thumbnail: "https://i.ytimg.com/vi/MMP3e9yZqIw/hqdefault.jpg",
    scheduledAt: "",
    quizEnabled: true,
    viewCount: 0,
    questions: Array(10).fill(null).map((_, i) => ({
      question: `¿Pregunta conceptual ${i + 1}?`,
      options: ["Respuesta Incorrecta", "Respuesta Correcta", "Otra Incorrecta"],
      correctAnswer: 1
    }))
  }
];

const extractYouTubeId = (value) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!trimmed.includes('http')) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.replace('/', '');
    }
    if (url.searchParams.has('v')) {
      return url.searchParams.get('v') || '';
    }
    const pathMatch = url.pathname.match(/\/embed\/([^/?]+)/);
    return pathMatch ? pathMatch[1] : '';
  } catch (error) {
    return '';
  }
};

const getYouTubeThumbnail = (youtubeId, quality = 'hqdefault') => {
  const safeId = extractYouTubeId(youtubeId);
  if (!safeId) {
    return "https://via.placeholder.com/640x360";
  }
  return `https://i.ytimg.com/vi/${safeId}/${quality}.jpg`;
};

const getVideoThumbnail = (video) => {
  const custom = video?.thumbnail?.trim();
  return custom || getYouTubeThumbnail(video?.youtubeId);
};

const getScheduledDate = (scheduledAt) => {
  if (!scheduledAt) return null;
  return new Date(`${scheduledAt}T00:00:00`);
};

const isVideoPublished = (video) => {
  const scheduledDate = getScheduledDate(video?.scheduledAt);
  if (!scheduledDate) return true;
  return scheduledDate <= new Date();
};

const formatScheduleDate = (scheduledAt) => {
  const date = getScheduledDate(scheduledAt);
  if (!date) return '';
  return date.toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// --- COMPONENTES PRINCIPALES ---

export default function App() {
  // Estado Global
  const [view, setView] = useState('home');
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [manualCertificate, setManualCertificate] = useState(null);
  const [authError, setAuthError] = useState('');
  const [activities, setActivities] = useState([]);
  
  // Estado de Usuario (para certificados)
  const [userProfile, setUserProfile] = useState({ name: '', collegiateNumber: '' });

  // Cargar datos
  useEffect(() => {
    const loadContent = async () => {
      const savedVideos = localStorage.getItem('cpg_videos');
      const savedActivities = localStorage.getItem('cpg_activities');
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('cpg_content')
            .select('videos, activities')
            .eq('id', 1)
            .single();
          if (!error) {
            if (data?.videos?.length) {
              setVideos(data.videos);
              localStorage.setItem('cpg_videos', JSON.stringify(data.videos));
            }
            if (data?.activities?.length) {
              setActivities(data.activities);
              localStorage.setItem('cpg_activities', JSON.stringify(data.activities));
            }
            if (data?.videos?.length || data?.activities?.length) {
              return;
            }
          }
        } catch (error) {
          // fallback to local storage
        }
      }

      if (savedVideos) {
        setVideos(JSON.parse(savedVideos));
      } else {
        setVideos(INITIAL_VIDEOS);
      }
      if (savedActivities) {
        setActivities(JSON.parse(savedActivities));
      }
    };

    loadContent();
  }, []);

  // Guardar datos cuando cambian
  const persistContent = async ({ nextVideos = videos, nextActivities = activities }) => {
    setVideos(nextVideos);
    setActivities(nextActivities);
    localStorage.setItem('cpg_videos', JSON.stringify(nextVideos));
    localStorage.setItem('cpg_activities', JSON.stringify(nextActivities));
    if (supabase) {
      const { error } = await supabase
        .from('cpg_content')
        .upsert({ id: 1, videos: nextVideos, activities: nextActivities }, { onConflict: 'id' });
      if (error) {
        throw new Error(error.message);
      }
    }
  };

  const persistVideos = async (nextVideos) => persistContent({ nextVideos });
  const persistActivities = async (nextActivities) => persistContent({ nextActivities });

  // Incrementar contador de visitas
  const incrementViewCount = async (videoId) => {
    const updatedVideos = videos.map(v => {
      if (v.id === videoId) {
        return { ...v, viewCount: (v.viewCount || 0) + 1 };
      }
      return v;
    });
    await persistVideos(updatedVideos);
  };

  // --- NAVEGACIÓN Y VISTAS ---

  const handleLogin = async (email, password) => {
    setAuthError('');
    if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
      if (!supabase) {
        setAuthError("No se encontró la configuración de Supabase. Verifica las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(`No se pudo iniciar sesión: ${error.message}`);
        return;
      }
      setIsAdmin(true);
      setView('admin');
    } else {
      setAuthError("Credenciales incorrectas");
    }
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setIsAdmin(false);
    setView('home');
  };

  const handleManualCertificate = (video, profile) => {
    setManualCertificate({ video, profile });
    setView('certificate');
  };

  const handleCloseManualCertificate = () => {
    setManualCertificate(null);
    setView('admin');
  };

  const categories = [...new Set(videos.map(v => v.category))];
  const publishedVideos = videos.filter(isVideoPublished);
  const upcomingVideos = videos.filter(v => !isVideoPublished(v));
  const recentVideos = [...publishedVideos].reverse().slice(0, 5);

  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans selection:bg-blue-600 selection:text-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-gradient-to-b from-black/90 to-transparent px-4 py-5 flex justify-between items-center transition-all duration-300">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView('home')}>
          <img 
            src="/logo-cpg-grande.png" 
            alt="Logo CPG" 
            className="w-14 h-14 object-contain filter drop-shadow-lg"
            onError={(e) => {e.target.style.display='none';}}
          />
          <div className="hidden md:block">
            <h1 className="text-lg font-bold leading-tight text-gray-100">Colegio de Psicólogos de Guatemala</h1>
            <p className="text-xs text-blue-400 tracking-widest uppercase">Aula Virtual</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {view !== 'home' && (
            <button onClick={() => setView('home')} className="text-sm hover:text-blue-400 transition-colors mr-2">
              Inicio
            </button>
          )}
          
          <a href="https://caeducgt.org/" className="hidden md:flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1 rounded-full hover:bg-gray-800 transition">
            <ExternalLink size={12} /> Créditos Académicos
          </a>
          <a href="https://colegiodepsicologos.org.gt" className="hidden md:flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-gray-600 px-3 py-1 rounded-full hover:bg-gray-800 transition">
            <ExternalLink size={12} /> Sitio Oficial
          </a>

          {isAdmin ? (
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded text-sm font-medium transition"
            >
              <LogOut size={16} /> Salir
            </button>
          ) : (
            <button 
              onClick={() => setView('login')}
              className="text-gray-400 hover:text-white transition p-2"
              title="Acceso Administrativo"
            >
              <Lock size={18} />
            </button>
          )}
        </div>
      </nav>

      {/* Main Content Router */}
      <div className="pt-0">
        {view === 'home' && (
          <HomeView 
            videos={videos} 
            recentVideos={recentVideos} 
            categories={categories} 
            upcomingVideos={upcomingVideos}
            activities={activities}
            onVideoSelect={(v) => {
              if (!isVideoPublished(v)) return;
              setSelectedVideo(v);
              incrementViewCount(v.id);
              setView('player');
            }} 
          />
        )}
        
        {view === 'player' && selectedVideo && (
          <PlayerView 
            video={selectedVideo} 
            onBack={() => setView('home')} 
            userProfile={userProfile}
            setUserProfile={setUserProfile}
          />
        )}

        {view === 'login' && (
          <LoginView onLogin={handleLogin} onBack={() => setView('home')} authError={authError} />
        )}

        {view === 'admin' && isAdmin && (
          <AdminDashboard 
            videos={videos} 
            activities={activities}
            onVideosChange={persistVideos}
            onActivitiesChange={persistActivities}
            onGenerateCertificate={handleManualCertificate}
          />
        )}

        {view === 'certificate' && manualCertificate && (
          <div className="min-h-screen bg-[#141414] pt-20 px-4 md:px-16 pb-12">
            <CertificateView 
              video={manualCertificate.video} 
              userProfile={manualCertificate.profile} 
              onBack={handleCloseManualCertificate} 
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="py-12 px-10 bg-black/80 text-gray-500 text-sm border-t border-gray-800 mt-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <img 
            src="/logo-cpg-grande.png" 
            alt="Logo CPG" 
            className="w-14 h-14 object-contain filter drop-shadow-lg"
            onError={(e) => {e.target.style.display='none';}}
          />
            <h3 className="text-white font-serif font-bold mb-2">Colegio de Psicólogos de Guatemala</h3>
            <p>Formación continua y excelencia profesional.</p>
          </div>
          <div className="flex flex-col gap-2">
             <a href="https://caeducgt.org/" className="hover:underline hover:text-blue-400">Regresar a Créditos Académicos</a>
             <a href="https://colegiodepsicologos.org.gt" className="hover:underline hover:text-blue-400">Regresar al Colegio de Psicólogos</a>
          </div>
        </div>
        <div className="mt-8 text-center text-xs text-gray-700">
          © {new Date().getFullYear()} Aula Virtual CPG. Todos los derechos reservados.
        </div>
      </footer>
    </div>
  );
}

// --- VISTAS ESPECÍFICAS ---

function HomeView({ videos, recentVideos, categories, upcomingVideos, activities, onVideoSelect }) {
  const heroVideo = recentVideos[0];
  const [activeCategory, setActiveCategory] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const categoriesToRender = activeCategory ? [activeCategory] : categories;
  const activitiesByMonth = activities
    .filter(activity => activity?.date)
    .map(activity => ({ ...activity, parsedDate: new Date(`${activity.date}T00:00:00`) }))
    .filter(activity => !Number.isNaN(activity.parsedDate.valueOf()))
    .sort((a, b) => a.parsedDate - b.parsedDate)
    .reduce((acc, activity) => {
      const monthKey = `${activity.parsedDate.getFullYear()}-${activity.parsedDate.getMonth()}`;
      if (!acc[monthKey]) {
        acc[monthKey] = {
          label: activity.parsedDate.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' }),
          items: []
        };
      }
      acc[monthKey].items.push(activity);
      return acc;
    }, {});
  const monthKeys = Object.keys(activitiesByMonth);

  return (
    <div className="pb-10">
      {/* Hero Section */}
      {!activeCategory && heroVideo && (
        <div className="relative h-[70vh] w-full overflow-hidden">
          <div className="absolute inset-0">
            <img 
              src={getVideoThumbnail(heroVideo)} 
              alt={heroVideo.title} 
              className="w-full h-full object-cover opacity-60 scale-105"
              onError={(e) => {
                if (!heroVideo) return;
                const target = e.currentTarget;
                const stage = target.dataset.fallbackStage || 'hqdefault';
                if (stage === 'hqdefault') {
                  target.dataset.fallbackStage = 'mqdefault';
                  target.src = getYouTubeThumbnail(heroVideo.youtubeId, 'mqdefault');
                  return;
                }
                if (stage === 'mqdefault') {
                  target.dataset.fallbackStage = 'placeholder';
                  target.src = getYouTubeThumbnail('');
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
          </div>
          
          <div className="absolute bottom-0 left-0 p-8 md:p-16 max-w-2xl z-10 flex flex-col gap-4">
            <span className="text-yellow-500 font-bold tracking-wider text-sm uppercase bg-black/50 w-fit px-2 py-1 rounded border border-yellow-500/30">
              Destacado
            </span>
            <h1 className="text-4xl md:text-6xl font-bold text-white drop-shadow-xl leading-tight">
              {heroVideo.title}
            </h1>
            <p className="text-gray-200 text-lg md:text-xl line-clamp-3 drop-shadow-md">
              {heroVideo.description}
            </p>
            <div className="flex gap-4 mt-4">
              <button 
                onClick={() => onVideoSelect(heroVideo)}
                className="bg-white text-black px-8 py-3 rounded hover:bg-gray-200 font-bold flex items-center gap-2 transition transform hover:scale-105"
              >
                <Play fill="black" size={24} /> Ver Ahora
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-8 md:px-16 mt-10">
        <div className="bg-[#1c1c1c] border border-gray-800 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-blue-400">Calendario de capacitación</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mt-2">Actividades programadas</h2>
            <p className="text-gray-400 mt-2 max-w-2xl">
              Consulta las fechas, organizadores y enlaces de inscripción de las actividades disponibles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCalendar(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2"
          >
            <CalendarDays size={20} /> Ver calendario
          </button>
        </div>
      </div>

      {showCalendar && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center px-4 py-10">
          <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-xl font-bold text-white">Calendario de actividades</h3>
                <p className="text-sm text-gray-400">Solo se muestran los meses con actividades programadas.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCalendar(false)}
                className="text-gray-400 hover:text-white"
                aria-label="Cerrar calendario"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-6 overflow-y-auto max-h-[70vh] space-y-8">
              {monthKeys.length === 0 && (
                <div className="text-center text-gray-400 py-10">
                  No hay actividades programadas por el momento.
                </div>
              )}
              {monthKeys.map((key) => (
                <div key={key}>
                  <h4 className="text-lg font-semibold text-blue-300 mb-4 capitalize">
                    {activitiesByMonth[key].label}
                  </h4>
                  <div className="grid gap-4">
                    {activitiesByMonth[key].items.map((activity) => (
                      <div key={activity.id} className="bg-[#1f1f1f] border border-gray-800 rounded-xl p-4 md:p-5">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <div>
                              <h5 className="text-lg font-bold text-white">{activity.title}</h5>
                              <p className="text-sm text-gray-400">Organiza: {activity.organizer}</p>
                              {activity.isFull && (
                                <span className="inline-flex mt-2 text-xs uppercase tracking-wide bg-red-500/20 text-red-200 border border-red-500/40 px-2 py-1 rounded-full">
                                  Cupo lleno
                                </span>
                              )}
                            </div>
                          <div className="text-sm text-gray-300">
                            <p><span className="text-gray-400">Fecha:</span> {new Date(`${activity.date}T00:00:00`).toLocaleDateString('es-GT')}</p>
                            <p><span className="text-gray-400">Hora:</span> {activity.time || 'Por confirmar'}</p>
                            <p><span className="text-gray-400">Lugar:</span> {activity.location || 'Por confirmar'}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-4 mt-4">
                          {activity.meetingLink && (
                            <a
                              href={activity.meetingLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200"
                            >
                              <ExternalLink size={14} /> Enlace de actividad
                            </a>
                          )}
                          {activity.registrationLink && (
                            <a
                              href={activity.registrationLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200"
                            >
                              <ExternalLink size={14} /> Formulario de inscripción
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recién Añadidos */}
      {!activeCategory && (
        <div className="pl-8 md:pl-16 mt-8 md:mt-12 relative z-20">
          <h2 className="text-xl md:text-2xl font-bold mb-4 text-white">Recién Añadidos</h2>
          <div className="flex gap-4 overflow-x-auto pb-8 pr-8 scrollbar-hide snap-x">
            {recentVideos.map(video => (
              <VideoCard 
                key={video.id} 
                video={video} 
                onClick={() => onVideoSelect(video)} 
                isPublished={isVideoPublished(video)}
              />
            ))}
          </div>
        </div>
      )}

      {!activeCategory && upcomingVideos.length > 0 && (
        <div className="pl-8 md:pl-16 mt-8">
          <h2 className="text-xl md:text-2xl font-bold mb-4 text-white">Próximamente</h2>
          <div className="flex gap-4 overflow-x-auto pb-8 pr-8 scrollbar-hide snap-x">
            {upcomingVideos.map(video => (
              <VideoCard 
                key={video.id} 
                video={video} 
                onClick={() => onVideoSelect(video)} 
                isPublished={isVideoPublished(video)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Categorías */}
      <div className="pl-8 md:pl-16 mt-10">
        {activeCategory && (
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-white capitalize">{activeCategory}</h2>
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-full text-gray-200"
            >
              Volver al inicio
            </button>
          </div>
        )}
      </div>
      {categoriesToRender.map(category => (
        <div key={category} className="pl-8 md:pl-16 mt-4">
          {!activeCategory && (
            <h2
              className="text-lg md:text-xl font-bold mb-4 text-gray-200 hover:text-blue-400 cursor-pointer transition"
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </h2>
          )}
          <div className="flex gap-4 overflow-x-auto pb-4 pr-8 scrollbar-hide snap-x">
            {videos.filter(v => v.category === category).map(video => (
              <VideoCard 
                key={video.id} 
                video={video} 
                onClick={() => onVideoSelect(video)} 
                isSmall={!activeCategory} 
                isPublished={isVideoPublished(video)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VideoCard({ video, onClick, isSmall, isPublished }) {
  const scheduledLabel = !isPublished ? formatScheduleDate(video.scheduledAt) : null;

  return (
    <div 
      onClick={isPublished ? onClick : undefined}
      className={`relative flex-shrink-0 bg-gray-900 rounded-md overflow-hidden transition-all duration-300 transform hover:scale-110 hover:z-50 hover:shadow-2xl hover:shadow-blue-900/40 group ${isSmall ? 'w-64 h-36' : 'w-80 h-44'} ${isPublished ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
    >
      <img 
        src={getVideoThumbnail(video)} 
        alt={video.title} 
        className="w-full h-full object-cover" 
        onError={(e) => {
          const target = e.currentTarget;
          const stage = target.dataset.fallbackStage || 'hqdefault';
          if (stage === 'hqdefault') {
            target.dataset.fallbackStage = 'mqdefault';
            target.src = getYouTubeThumbnail(video.youtubeId, 'mqdefault');
            return;
          }
          if (stage === 'mqdefault') {
            target.dataset.fallbackStage = 'placeholder';
            target.src = getYouTubeThumbnail('');
          }
        }}
      />
      <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-all" />
      {/* Contador de visitas */}
      {isPublished && (
        <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 text-xs rounded text-white flex items-center gap-1">
          <Eye size={12} /> {video.viewCount || 0}
        </div>
      )}
      {!isPublished && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-center px-4">
          <span className="text-yellow-400 font-bold text-sm uppercase tracking-widest">Próximamente</span>
          {scheduledLabel && (
            <span className="text-xs text-gray-200 mt-2">Disponible el {scheduledLabel}</span>
          )}
        </div>
      )}
      <div className="absolute bottom-0 left-0 w-full p-3 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-all">
        <h3 className="font-bold text-sm text-white truncate">{video.title}</h3>
        <p className="text-xs text-gray-300 flex items-center gap-2 mt-1">
          <span className="text-green-400 font-semibold">{video.duration} hrs</span>
          <span>•</span>
          <span>{video.category}</span>
        </p>
      </div>
    </div>
  );
}

function PlayerView({ video, onBack, userProfile, setUserProfile }) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [showCert, setShowCert] = useState(false);

  return (
    <div className="min-h-screen bg-[#141414] pt-20 px-4 md:px-16 pb-12">
      <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition">
        <ChevronLeft /> Regresar
      </button>

      {showCert ? (
        <CertificateView video={video} userProfile={userProfile} onBack={() => setShowCert(false)} />
      ) : showQuiz ? (
        <QuizModal 
          video={video} 
          onCancel={() => setShowQuiz(false)} 
          onPass={() => setShowCert(true)} 
          userProfile={userProfile}
          setUserProfile={setUserProfile}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Player */}
          <div className="lg:col-span-2">
            <div className="aspect-video w-full bg-black rounded-lg overflow-hidden shadow-2xl shadow-blue-900/20 border border-gray-800">
              <iframe 
                width="100%" 
                height="100%" 
                src={`https://www.youtube-nocookie.com/embed/${extractYouTubeId(video.youtubeId)}?playsinline=1&rel=0`} 
                title={video.title} 
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen
              ></iframe>
            </div>
          </div>

          {/* Details */}
          <div className="lg:col-span-1 space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{video.title}</h1>
              <div className="flex flex-wrap gap-3 text-sm text-gray-400 mb-4">
                <span className="bg-blue-900/40 text-blue-300 px-2 py-1 rounded border border-blue-900">
                  {video.category}
                </span>
                <span className="bg-gray-800 px-2 py-1 rounded border border-gray-700">
                  {video.duration} Horas Acreditadas
                </span>
                <span className="bg-gray-800 px-2 py-1 rounded border border-gray-700 flex items-center gap-1">
                  <Eye size={14} /> {video.viewCount || 0} visitas
                </span>
              </div>
              <p className="text-gray-300 leading-relaxed text-sm md:text-base">
                {video.description}
              </p>
            </div>

            {video.quizEnabled ? (
              <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                  <Award className="text-yellow-500" /> Certificación Disponible
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Completa la evaluación con más del 80% de aciertos para obtener tu certificado oficial del Colegio de Psicólogos.
                </p>
                <button 
                  onClick={() => setShowQuiz(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-md transition shadow-lg shadow-blue-900/50 flex justify-center items-center gap-2"
                >
                  Hacer Evaluación
                </button>
              </div>
            ) : (
              <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-800 text-center text-gray-500 text-sm">
                Esta clase no requiere evaluación para certificación o no está disponible actualmente.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QuizModal({ video, onCancel, onPass, userProfile, setUserProfile }) {
  const [step, setStep] = useState('info');
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(0);

  const handleStart = () => {
    if (!userProfile.name || !userProfile.collegiateNumber) {
      alert("Por favor ingrese su nombre y número de colegiado.");
      return;
    }
    setStep('questions');
  };

  const handleSubmit = () => {
    let correct = 0;
    video.questions.forEach((q, idx) => {
      if (answers[idx] === q.correctAnswer) correct++;
    });
    
    const percentage = (correct / video.questions.length) * 100;
    setScore(percentage);
    setStep('result');
  };

  if (step === 'info') {
    return (
      <div className="max-w-2xl mx-auto bg-gray-900 p-8 rounded-lg border border-gray-800 shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-yellow-500 border-b border-gray-800 pb-2">Datos del Colegiado</h2>
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Nombre Completo (como aparecerá en el certificado)</label>
            <input 
              type="text" 
              value={userProfile.name} 
              onChange={e => setUserProfile({...userProfile, name: e.target.value})}
              className="w-full bg-black border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none"
              placeholder="Ej. Lic. Juan Pérez"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Número de Colegiado</label>
            <input 
              type="text" 
              value={userProfile.collegiateNumber} 
              onChange={e => setUserProfile({...userProfile, collegiateNumber: e.target.value})}
              className="w-full bg-black border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none"
              placeholder="Ej. 12345"
            />
          </div>
        </div>
        <div className="flex justify-end gap-4">
          <button onClick={onCancel} className="text-gray-400 hover:text-white">Cancelar</button>
          <button onClick={handleStart} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold">Comenzar Evaluación</button>
        </div>
      </div>
    );
  }

  if (step === 'result') {
    const passed = score >= 80;
    return (
      <div className="max-w-md mx-auto bg-gray-900 p-8 rounded-lg text-center border border-gray-800">
        <div className="flex justify-center mb-4">
          {passed ? <CheckCircle size={64} className="text-green-500" /> : <XCircle size={64} className="text-red-500" />}
        </div>
        <h2 className="text-2xl font-bold mb-2">{passed ? "¡Aprobado!" : "No Aprobado"}</h2>
        <p className="text-4xl font-bold mb-4 text-blue-400">{score}%</p>
        <p className="text-gray-400 mb-6">
          {passed ? "Has completado satisfactoriamente la evaluación." : "Necesitas un 80% para aprobar. Intenta de nuevo prestando atención al video."}
        </p>
        <div className="flex justify-center gap-4">
          <button onClick={onCancel} className="text-gray-400 hover:text-white">Cerrar</button>
          {passed ? (
            <button onClick={onPass} className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded font-bold flex items-center gap-2">
              <Award size={18} /> Obtener Certificado
            </button>
          ) : (
            <button onClick={() => setStep('questions')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold">
              Intentar de Nuevo
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-gray-900 p-6 md:p-8 rounded-lg border border-gray-800">
      <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-bold text-white">Evaluación: {video.title}</h2>
        <span className="text-sm text-gray-400">10 Preguntas</span>
      </div>
      
      <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        {video.questions.map((q, idx) => (
          <div key={idx} className="bg-black/30 p-4 rounded border border-gray-800">
            <p className="font-medium text-lg mb-3 text-gray-200">{idx + 1}. {q.question}</p>
            <div className="space-y-2">
              {q.options.map((opt, optIdx) => (
                <label key={optIdx} className={`flex items-center gap-3 p-3 rounded cursor-pointer transition ${answers[idx] === optIdx ? 'bg-blue-900/30 border border-blue-500' : 'hover:bg-gray-800 border border-transparent'}`}>
                  <input 
                    type="radio" 
                    name={`q-${idx}`} 
                    className="w-4 h-4 text-blue-600"
                    checked={answers[idx] === optIdx}
                    onChange={() => setAnswers({...answers, [idx]: optIdx})}
                  />
                  <span className="text-gray-300">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end gap-4 border-t border-gray-800 pt-4">
        <button onClick={onCancel} className="text-gray-400 hover:text-white">Cancelar</button>
        <button 
          onClick={handleSubmit} 
          disabled={Object.keys(answers).length < 10}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2 rounded font-bold transition"
        >
          Finalizar Evaluación
        </button>
      </div>
    </div>
  );
}

function CertificateView({ video, userProfile, onBack }) {
  const certRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const currentDate = new Date();
  const formatDateYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };
  const certificateCode = `CPG-${formatDateYYYYMMDD(currentDate)}-${userProfile.collegiateNumber}`;

  const handleDownloadPDF = async () => {
    if (!certRef.current || !imageLoaded) {
      alert('Espera a que la plantilla del certificado cargue completamente.');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const canvas = await html2canvas(certRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000
      });
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'letter'
      });
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const fileName = `Certificado_${userProfile.name.replace(/\s+/g, '_')}_${certificateCode}.pdf`;
      pdf.save(fileName);
      
    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('Hubo un error al generar el PDF. Por favor intenta de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-4 print:hidden">
        <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded">Cerrar</button>
        <button 
          onClick={handleDownloadPDF}
          disabled={isGenerating || !imageLoaded}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded font-bold flex items-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Generando PDF...
            </>
          ) : (
            <>
              <Download size={18} /> Descargar PDF
            </>
          )}
        </button>
      </div>

      {!imageLoaded && (
        <div className="text-yellow-400 text-sm flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Cargando plantilla del certificado...
        </div>
      )}

      {/* CERTIFICADO CON PLANTILLA */}
      <div className="overflow-auto w-full flex justify-center p-4">
        <div 
          ref={certRef}
          className="relative shadow-2xl"
          style={{ 
            width: '1056px', 
            height: '816px',
            fontFamily: "'Georgia', 'Times New Roman', serif"
          }}
        >
          {/* Imagen de fondo - Plantilla del certificado */}
          <img 
            src="/certificado-plantilla.png"
            alt="Plantilla Certificado"
            className="absolute inset-0 w-full h-full object-cover"
            crossOrigin="anonymous"
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              console.error('Error cargando plantilla');
              e.target.style.display = 'none';
              setImageLoaded(true);
            }}
          />
          
          {/* Contenido superpuesto - Datos dinámicos */}
          <div className="absolute inset-0">
            
            {/* Nombre del profesional - en la línea debajo de "Por medio del presente hace constar que:" */}
            <div 
              className="absolute text-center"
              style={{ top: '222px', left: '50%', transform: 'translateX(-50%)', width: '650px' }}
            >
              <p 
                className="font-bold text-[#1a1a2e]"
                style={{ 
                  fontSize: '38px',
                  fontFamily: "'Georgia', serif",
                  letterSpacing: '0.5px'
                }}
              >
                {userProfile.name}
              </p>
            </div>

            {/* Número de colegiado - después de "NÚMERO DE COLEGIADO:" */}
            <div 
              className="absolute"
              style={{ top: '302px', left: '595px' }}
            >
              <p 
                className="text-[#1a1a2e] font-semibold"
                style={{ 
                  fontSize: '16px',
                  fontFamily: "'Georgia', serif"
                }}
              >
                {userProfile.collegiateNumber}
              </p>
            </div>

            {/* Nombre del curso - debajo de "Ha completado y aprobado satisfactoriamente el curso virtual:" */}
            <div 
              className="absolute text-center"
              style={{ top: '388px', left: '50%', transform: 'translateX(-50%)', width: '750px' }}
            >
              <p 
                className="font-bold text-[#1a1a2e] uppercase"
                style={{ 
                  fontSize: '24px',
                  fontFamily: "'Georgia', serif",
                  lineHeight: '1.3'
                }}
              >
                {video.title}
              </p>
            </div>

            {/* Horas acreditadas - entre "Acreditando" y "horas de formación continua." */}
            <div 
              className="absolute"
              style={{ top: '448px', left: '445px' }}
            >
              <p 
                className="text-[#1a1a2e] font-bold"
                style={{ 
                  fontSize: '18px',
                  fontFamily: "'Georgia', serif"
                }}
              >
                {video.duration}
              </p>
            </div>

            {/* Fecha de evaluación aprobada - después de "Evaluación Aprobada:" */}
            <div 
              className="absolute"
              style={{ top: '565px', left: '50%', transform: 'translateX(-50%)' }}
            >
              <p 
                className="text-[#333]"
                style={{ 
                  fontSize: '14px',
                  fontFamily: "'Georgia', serif"
                }}
              >
                {currentDate.toLocaleDateString('es-GT', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>

            {/* Código del certificado - sobre la línea amarilla */}
            <div 
              className="absolute"
              style={{ bottom: '95px', right: '50px' }}
            >
              <p 
                className="text-[#333] font-medium"
                style={{ 
                  fontSize: '11px',
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: '0.5px'
                }}
              >
                {certificateCode}
              </p>
            </div>
          </div>

          {/* Fallback si no carga la imagen */}
          <div 
            className="absolute inset-0 flex flex-col items-center justify-between text-black bg-white border-8 border-double border-[#003366] p-8"
            style={{ 
              display: imageLoaded ? 'none' : 'flex',
              fontFamily: "'Georgia', 'Times New Roman', serif"
            }}
          >
            <div className="text-center mt-8">
              <h1 className="text-3xl font-bold text-[#003366] uppercase tracking-wider">Colegio de Psicólogos de Guatemala</h1>
              <p className="text-lg italic text-gray-600 mt-6">Por medio del presente hace constar que:</p>
            </div>
            
            <div className="text-center flex-1 flex flex-col justify-center gap-4">
              <h2 className="text-4xl font-bold text-[#003366] border-b-2 border-[#d4af37] pb-2 px-8">
                {userProfile.name}
              </h2>
              <p className="text-lg">Número de Colegiado: <strong>{userProfile.collegiateNumber}</strong></p>
              <p className="text-lg mt-4">Ha completado y aprobado satisfactoriamente el curso virtual:</p>
              <h3 className="text-2xl font-bold uppercase">"{video.title}"</h3>
              <p className="text-lg">Acreditando <strong className="text-[#003366]">{video.duration} horas</strong> de formación continua.</p>
            </div>
            
            <div className="text-center mb-8">
              <div className="w-64 border-b border-black mb-2 mx-auto"></div>
              <p className="text-sm">Comisión de Acreditación y Educación Continua</p>
              <p className="text-sm text-gray-600">Evaluación Aprobada: {currentDate.toLocaleDateString('es-GT')}</p>
              <p className="text-xs text-gray-500 mt-2">{certificateCode}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginView({ onLogin, onBack, authError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black/90 px-4">
      <div className="w-full max-w-md bg-[#141414] p-8 rounded-lg shadow-2xl border border-gray-800 relative">
        <button onClick={onBack} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X /></button>
        <h2 className="text-3xl font-bold mb-8 text-white">Administrador</h2>
        {authError && (
          <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {authError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Correo Electrónico</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded bg-[#333] text-white border-none focus:ring-2 focus:ring-blue-600 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Contraseña</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded bg-[#333] text-white border-none focus:ring-2 focus:ring-blue-600 outline-none"
              required
            />
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded transition">
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

function QuestionEditor({ question, idx, onQuestionChange }) {
  return (
    <div className="bg-gray-800 p-4 rounded mb-4 border border-gray-700">
      <div className="mb-2">
        <label className="text-xs text-blue-300">Pregunta {idx + 1}</label>
        <input
          type="text"
          value={question.question}
          onChange={(e) => onQuestionChange(idx, (current) => ({ ...current, question: e.target.value }))}
          className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {question.options.map((opt, optIdx) => (
          <div key={optIdx} className="flex flex-col">
            <input
              type="text"
              value={opt}
              onChange={(e) => {
                onQuestionChange(idx, (current) => {
                  const newOpts = [...current.options];
                  newOpts[optIdx] = e.target.value;
                  return { ...current, options: newOpts };
                });
              }}
              className={`w-full bg-gray-900 border rounded p-2 text-xs text-white ${question.correctAnswer === optIdx ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-600'}`}
              placeholder={`Opción ${optIdx + 1}`}
            />
            <label className="flex items-center gap-1 mt-1 text-xs text-gray-400 cursor-pointer">
              <input
                type="radio"
                name={`correct-${idx}`}
                checked={question.correctAnswer === optIdx}
                onChange={() => onQuestionChange(idx, (current) => ({ ...current, correctAnswer: optIdx }))}
              /> Correcta
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDashboard({ videos, activities, onVideosChange, onActivitiesChange, onGenerateCertificate }) {
  const [editingVideo, setEditingVideo] = useState(null);
  const [manualCertVideo, setManualCertVideo] = useState(null);
  const [manualProfile, setManualProfile] = useState({ name: '', collegiateNumber: '' });
  const [saveError, setSaveError] = useState('');
  const [editingActivity, setEditingActivity] = useState(null);
  const [activityError, setActivityError] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportRange, setReportRange] = useState({ start: '', end: '' });
  const [reportError, setReportError] = useState('');
  
  const [formData, setFormData] = useState({
    title: '', category: '', youtubeId: '', duration: '', description: '', thumbnail: '', scheduledAt: '', quizEnabled: false
  });
  const [questions, setQuestions] = useState([]);
  const [activityForm, setActivityForm] = useState({
    title: '',
    organizer: '',
    date: '',
    time: '',
    location: '',
    registrationLink: '',
    meetingLink: '',
    isFull: false
  });

  // Calcular totales de visitas
  const totalViews = videos.reduce((sum, v) => sum + (v.viewCount || 0), 0);

  const handleEdit = (video) => {
    setSaveError('');
    setEditingVideo(video);
    setFormData({
      ...video,
      scheduledAt: video.scheduledAt || '',
      thumbnail: video.thumbnail || ''
    });
    setQuestions((video.questions || []).map((question) => ({
      ...question,
      options: [...(question.options || [])]
    })));
  };

  const handleCreate = () => {
    setSaveError('');
    const empty = {
      id: Date.now(),
      title: '', category: '', youtubeId: '', duration: '', description: '', 
      thumbnail: '',
      scheduledAt: '',
      quizEnabled: false,
      viewCount: 0
    };
    setEditingVideo(empty);
    setFormData(empty);
    setQuestions(Array(10).fill(null).map((_, i) => ({
      question: `Pregunta ${i + 1}`,
      options: ["Opción 1", "Opción 2", "Opción 3"],
      correctAnswer: 0
    })));
  };

  const updateQuestion = useCallback((idx, updater) => {
    setQuestions((prev) => prev.map((question, index) => {
      if (index !== idx) return question;
      return updater(question);
    }));
  }, []);

  const handleSave = async () => {
    const newVideo = { ...formData, questions: questions, viewCount: formData.viewCount || 0 };
    setSaveError('');
    try {
      if (videos.some(v => v.id === newVideo.id)) {
        await onVideosChange(videos.map(v => v.id === newVideo.id ? newVideo : v));
      } else {
        await onVideosChange([...videos, newVideo]);
      }
      setEditingVideo(null);
    } catch (error) {
      setSaveError(`No se pudieron guardar los cambios: ${error.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (confirm("¿Estás seguro de eliminar este video?")) {
      setSaveError('');
      try {
        await onVideosChange(videos.filter(v => v.id !== id));
      } catch (error) {
        setSaveError(`No se pudo eliminar el video: ${error.message}`);
      }
    }
  };

  const handleActivityEdit = (activity) => {
    setActivityError('');
    setEditingActivity(activity);
    setActivityForm({
      title: activity.title || '',
      organizer: activity.organizer || '',
      date: activity.date || '',
      time: activity.time || '',
      location: activity.location || '',
      registrationLink: activity.registrationLink || '',
      meetingLink: activity.meetingLink || '',
      isFull: Boolean(activity.isFull)
    });
  };

  const handleActivitySave = async () => {
    if (!activityForm.title || !activityForm.date) {
      setActivityError('El título y la fecha de la actividad son obligatorios.');
      return;
    }
    setActivityError('');
    const nextActivity = { ...editingActivity, ...activityForm };
    try {
      const exists = activities.some(activity => activity.id === nextActivity.id);
      const nextActivities = exists
        ? activities.map(activity => activity.id === nextActivity.id ? nextActivity : activity)
        : [...activities, nextActivity];
      await onActivitiesChange(nextActivities);
      setEditingActivity(null);
      setActivityForm({
        title: '',
        organizer: '',
        date: '',
        time: '',
        location: '',
        registrationLink: '',
        meetingLink: '',
        isFull: false
      });
    } catch (error) {
      setActivityError(`No se pudo guardar la actividad: ${error.message}`);
    }
  };

  const handleActivityDelete = async (id) => {
    if (!confirm("¿Eliminar esta actividad?")) return;
    setActivityError('');
    try {
      await onActivitiesChange(activities.filter(activity => activity.id !== id));
    } catch (error) {
      setActivityError(`No se pudo eliminar la actividad: ${error.message}`);
    }
  };

  const handleReportOpen = () => {
    setReportError('');
    setShowReportModal(true);
  };

  const handleReportGenerate = () => {
    if (!reportRange.start || !reportRange.end) {
      setReportError('Selecciona un rango de fechas completo para generar el informe.');
      return;
    }
    const startDate = new Date(`${reportRange.start}T00:00:00`);
    const endDate = new Date(`${reportRange.end}T23:59:59`);
    if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
      setReportError('El rango de fechas no es válido.');
      return;
    }
    if (endDate < startDate) {
      setReportError('La fecha final debe ser posterior a la fecha inicial.');
      return;
    }

    const filteredActivities = activities
      .filter(activity => activity?.date)
      .map(activity => ({
        ...activity,
        parsedDate: new Date(`${activity.date}T00:00:00`)
      }))
      .filter(activity => !Number.isNaN(activity.parsedDate.valueOf()))
      .filter(activity => activity.parsedDate >= startDate && activity.parsedDate <= endDate);

    if (filteredActivities.length === 0) {
      setReportError('No hay actividades registradas en este rango.');
      return;
    }

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const headers = [
      'Título',
      'Organizador',
      'Fecha',
      'Hora',
      'Lugar',
      'Cupo lleno',
      'Enlace actividad',
      'Enlace inscripción'
    ];

    const rows = filteredActivities.map(activity => ([
      activity.title,
      activity.organizer || 'Por definir',
      activity.date,
      activity.time || 'Por confirmar',
      activity.location || 'Por confirmar',
      activity.isFull ? 'Sí' : 'No',
      activity.meetingLink || '',
      activity.registrationLink || ''
    ]));

    const csvContent = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `informe-actividades-${reportRange.start}-a-${reportRange.end}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowReportModal(false);
  };

  const handleManualCertOpen = (video) => {
    setManualCertVideo(video);
    setManualProfile({ name: '', collegiateNumber: '' });
  };

  const handleManualCertGenerate = () => {
    if (!manualProfile.name || !manualProfile.collegiateNumber) {
      alert("Por favor ingrese el nombre del profesional y el número de colegiado.");
      return;
    }
    onGenerateCertificate(manualCertVideo, manualProfile);
    setManualCertVideo(null);
  };

  if (editingVideo) {
    return (
      <div className="min-h-screen bg-[#141414] pt-24 px-4 md:px-16 pb-12 text-white">
        <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">{formData.id ? 'Editar Video' : 'Nuevo Video'}</h2>
          <div className="flex gap-2">
            <button onClick={() => setEditingVideo(null)} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 font-bold">Guardar Cambios</button>
          </div>
        </div>
        {saveError && (
          <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {saveError}
          </div>
        )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400">Título</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400">Categoría</label>
                <input type="text" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" placeholder="Ej. Psicología Clínica" />
              </div>
              <div>
                <label className="block text-sm text-gray-400">YouTube ID</label>
                <input type="text" value={formData.youtubeId} onChange={e => setFormData({...formData, youtubeId: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" placeholder="Ej. hJKwF2rXGz4" />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400">Duración (Horas)</label>
                <input type="number" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400">URL Imagen Portada (opcional)</label>
                <input type="text" value={formData.thumbnail} onChange={e => setFormData({...formData, thumbnail: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" />
                <p className="text-xs text-gray-500 mt-1">Si no se carga, se usará automáticamente la portada de YouTube.</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400">Descripción</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white h-24" />
              </div>
              <div>
                <label className="block text-sm text-gray-400">Programar publicación</label>
                <input 
                  type="date" 
                  value={formData.scheduledAt} 
                  onChange={e => setFormData({...formData, scheduledAt: e.target.value})} 
                  className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" 
                />
                <p className="text-xs text-gray-500 mt-1">Deja vacío para publicar de inmediato.</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 p-6 rounded border border-gray-800">
            <div className="flex items-center gap-3 mb-4">
              <input 
                type="checkbox" 
                id="quizToggle"
                checked={formData.quizEnabled}
                onChange={e => setFormData({...formData, quizEnabled: e.target.checked})}
                className="w-5 h-5 text-blue-600 rounded"
              />
              <label htmlFor="quizToggle" className="font-bold text-lg cursor-pointer">Activar Evaluación para Certificado</label>
            </div>

            {formData.quizEnabled && (
              <div className="space-y-4">
                <p className="text-yellow-500 text-sm mb-4">Debes configurar exactamente 10 preguntas. Marca la respuesta correcta en cada una.</p>
                {questions.map((q, idx) => (
                  <QuestionEditor key={idx} question={q} idx={idx} onQuestionChange={updateQuestion} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414] pt-24 px-4 md:px-16 text-white">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold">Panel de Administración</h1>
          <p className="text-sm text-gray-400">Gestiona videos y actividades de capacitación.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-bold flex items-center gap-2">
            <Plus size={20} /> Nuevo Video
          </button>
          <button onClick={() => { setEditingActivity({ id: Date.now() }); setActivityForm({ title: '', organizer: '', date: '', time: '', location: '', registrationLink: '', meetingLink: '', isFull: false }); }} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded font-bold flex items-center gap-2">
            <CalendarDays size={18} /> Nueva actividad
          </button>
        </div>
      </div>

      {/* Resumen de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-900/40 to-blue-900/20 border border-blue-800 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-3 rounded-lg">
              <Play size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total de Cursos</p>
              <p className="text-2xl font-bold">{videos.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-900/40 to-green-900/20 border border-green-800 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="bg-green-600 p-3 rounded-lg">
              <Eye size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total de Visitas</p>
              <p className="text-2xl font-bold">{totalViews}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-900/40 to-purple-900/20 border border-purple-800 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-3 rounded-lg">
              <CalendarDays size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-400">Actividades</p>
              <p className="text-2xl font-bold">{activities.length}</p>
            </div>
          </div>
        </div>
      </div>

      {saveError && (
        <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {saveError}
        </div>
      )}
      {activityError && (
        <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {activityError}
        </div>
      )}

      <div className="bg-[#1b1b1b] border border-gray-800 rounded-2xl p-6 mb-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Actividades de capacitación</h2>
            <span className="text-xs text-gray-400">{activities.length} actividades registradas</span>
          </div>
          <button
            type="button"
            onClick={handleReportOpen}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded font-semibold text-sm"
          >
            Informe de actividades
          </button>
        </div>
        {editingActivity !== null && (
          <div className="bg-[#141414] border border-gray-800 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nombre de la actividad</label>
                <input
                  type="text"
                  value={activityForm.title}
                  onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Organizador</label>
                <input
                  type="text"
                  value={activityForm.organizer}
                  onChange={(e) => setActivityForm({ ...activityForm, organizer: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Fecha</label>
                <input
                  type="date"
                  value={activityForm.date}
                  onChange={(e) => setActivityForm({ ...activityForm, date: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Hora</label>
                <input
                  type="time"
                  value={activityForm.time}
                  onChange={(e) => setActivityForm({ ...activityForm, time: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Lugar</label>
                <input
                  type="text"
                  value={activityForm.location}
                  onChange={(e) => setActivityForm({ ...activityForm, location: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Enlace de la actividad (Zoom/Meet)</label>
                <input
                  type="url"
                  value={activityForm.meetingLink}
                  onChange={(e) => setActivityForm({ ...activityForm, meetingLink: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Enlace de inscripción (opcional)</label>
                <input
                  type="url"
                  value={activityForm.registrationLink}
                  onChange={(e) => setActivityForm({ ...activityForm, registrationLink: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="activity-full"
                  type="checkbox"
                  checked={activityForm.isFull}
                  onChange={(e) => setActivityForm({ ...activityForm, isFull: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded"
                />
                <label htmlFor="activity-full" className="text-sm text-gray-300">Cupo lleno</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setEditingActivity(null); setActivityForm({ title: '', organizer: '', date: '', time: '', location: '', registrationLink: '', meetingLink: '', isFull: false }); }}
                className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleActivitySave}
                className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 font-bold"
              >
                Guardar actividad
              </button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activities.map((activity) => (
            <div key={activity.id} className="bg-[#141414] border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-white">{activity.title}</h3>
                {activity.isFull && (
                  <span className="text-xs uppercase tracking-wide bg-red-500/20 text-red-200 border border-red-500/40 px-2 py-1 rounded-full">
                    Cupo lleno
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400">Organiza: {activity.organizer || 'Por definir'}</p>
              <div className="text-sm text-gray-300 mt-2 space-y-1">
                <p><span className="text-gray-500">Fecha:</span> {activity.date ? new Date(`${activity.date}T00:00:00`).toLocaleDateString('es-GT') : 'Pendiente'}</p>
                <p><span className="text-gray-500">Hora:</span> {activity.time || 'Por confirmar'}</p>
                <p><span className="text-gray-500">Lugar:</span> {activity.location || 'Por confirmar'}</p>
              </div>
              {activity.meetingLink && (
                <a
                  href={activity.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 mt-3 text-sm text-blue-300 hover:text-blue-200"
                >
                  <ExternalLink size={14} /> Enlace de actividad
                </a>
              )}
              {activity.registrationLink && (
                <a
                  href={activity.registrationLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 mt-3 text-sm text-blue-300 hover:text-blue-200"
                >
                  <ExternalLink size={14} /> Inscripción
                </a>
              )}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handleActivityEdit(activity)}
                  className="flex-1 bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 py-2 rounded text-sm transition"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleActivityDelete(activity.id)}
                  className="px-3 bg-red-900/40 hover:bg-red-900/60 text-red-300 rounded transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showReportModal && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center px-4 py-10">
          <div className="bg-[#141414] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-lg font-bold text-white">Informe de actividades</h3>
                <p className="text-sm text-gray-400">Selecciona el rango de fechas para el informe.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-gray-400 hover:text-white"
                aria-label="Cerrar informe"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              {reportError && (
                <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {reportError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Desde</label>
                  <input
                    type="date"
                    value={reportRange.start}
                    onChange={(e) => setReportRange({ ...reportRange, start: e.target.value })}
                    className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Hasta</label>
                  <input
                    type="date"
                    value={reportRange.end}
                    onChange={(e) => setReportRange({ ...reportRange, end: e.target.value })}
                    className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReportGenerate}
                className="px-4 py-2 bg-emerald-600 rounded hover:bg-emerald-700 font-bold"
              >
                Descargar informe
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold mb-4">Cursos</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
        {videos.map(video => (
          <div key={video.id} className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800 flex flex-col">
            <div className="h-40 relative">
              <img 
                src={getVideoThumbnail(video)} 
                className="w-full h-full object-cover" 
                alt="" 
                onError={(e) => {
                  const target = e.currentTarget;
                  const stage = target.dataset.fallbackStage || 'hqdefault';
                  if (stage === 'hqdefault') {
                    target.dataset.fallbackStage = 'mqdefault';
                    target.src = getYouTubeThumbnail(video.youtubeId, 'mqdefault');
                    return;
                  }
                  if (stage === 'mqdefault') {
                    target.dataset.fallbackStage = 'placeholder';
                    target.src = getYouTubeThumbnail('');
                  }
                }}
              />
              <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 text-xs rounded text-white">ID: {video.id}</div>
              <div className="absolute top-2 left-2 bg-green-600/90 px-2 py-1 text-xs rounded text-white flex items-center gap-1">
                <Eye size={12} /> {video.viewCount || 0} visitas
              </div>
            </div>
            <div className="p-4 flex-1">
              <h3 className="font-bold text-lg mb-1">{video.title}</h3>
              <p className="text-sm text-gray-400 mb-2">{video.category}</p>
              <div className="flex items-center gap-2 text-xs mb-4 flex-wrap">
                {video.quizEnabled ? <span className="text-green-400 border border-green-400/30 px-2 py-0.5 rounded">Evaluación Activa</span> : <span className="text-gray-500">Sin Evaluación</span>}
                {!isVideoPublished(video) && (
                  <span className="text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded">
                    Programado {formatScheduleDate(video.scheduledAt)}
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 flex gap-2">
              <button onClick={() => handleEdit(video)} className="flex-1 bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 py-2 rounded text-sm transition">Editar</button>
              {video.quizEnabled && (
                <button 
                  onClick={() => handleManualCertOpen(video)} 
                  className="flex-1 bg-yellow-700/40 hover:bg-yellow-700/60 text-yellow-200 py-2 rounded text-sm transition"
                >
                  Generar Certificado
                </button>
              )}
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
                <label className="block text-sm text-gray-400 mb-1">Nombre del profesional</label>
                <input 
                  type="text" 
                  value={manualProfile.name}
                  onChange={(e) => setManualProfile({ ...manualProfile, name: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Número de colegiado</label>
                <input 
                  type="text" 
                  value={manualProfile.collegiateNumber}
                  onChange={(e) => setManualProfile({ ...manualProfile, collegiateNumber: e.target.value })}
                  className="w-full bg-black border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setManualCertVideo(null)} 
                className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button 
                onClick={handleManualCertGenerate} 
                className="px-4 py-2 bg-yellow-600 rounded hover:bg-yellow-700 font-bold"
              >
                Generar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
