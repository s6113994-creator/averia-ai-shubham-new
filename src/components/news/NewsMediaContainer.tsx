import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Pause, Search, MessageCircle, Share2, Globe,
  Film, Smartphone, Image as ImageIcon, FileText, Headphones, Link as LinkIcon,
  Heart, Bookmark, Volume2, Loader2, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { VerificationBadge } from './VerificationBadge';
import { TrustScoreBadge } from './TrustScoreBadge';
import { EvidenceDeepDive } from './EvidenceDeepDive';
import { NewsMediaCard } from './NewsMediaCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatNewsDate, displayTrustScore } from '@/lib/date';
import { stripHtml, toBullets } from '@/lib/text';
import type { MediaNewsArticle, MediaType } from '@/types/news-media';

const SUBSECTIONS: { id: MediaType; label: string; icon: typeof Film }[] = [
  { id: 'long_video', label: 'Video', icon: Film },
  { id: 'short_video', label: 'Reels', icon: Smartphone },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'text', label: 'Text', icon: FileText },
];

const IDLE_MS = 3 * 60 * 1000;

interface NewsMediaContainerProps {
  /** Full pool of articles for the active mode (real OR debunked) — never mixed. */
  articles: MediaNewsArticle[];
  initialId: string;
  mode: 'real' | 'debunked';
  onClose: () => void;
  onLoadMore?: (type: MediaType) => void;
  loadingMore?: boolean;
}

function domainOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function ytIdOf(a?: MediaNewsArticle) {
  if (!a) return undefined;
  return a.videoId
    || a.url?.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
}

function InfoStrip({ article, debunked }: { article: MediaNewsArticle; debunked: boolean }) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-[13px] text-muted-foreground">
      <span className="font-medium text-foreground/90">{article.source.name}</span>
      <span className="opacity-40">|</span>
      <VerificationBadge score={displayTrustScore(article)} debunked={debunked} />
      <span className="opacity-40">|</span>
      <TrustScoreBadge score={displayTrustScore(article)} />
      <span className="opacity-40">|</span>
      <span>{formatNewsDate(article.publishedAt)}</span>
    </div>
  );
}

function ActionPills({
  onEvidence, onAsk, onShare, className = '',
}: { onEvidence: () => void; onAsk: () => void; onShare: () => void; className?: string }) {
  const base = 'inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium bg-white/[0.06] text-foreground/90 hover:bg-white/[0.12] transition';
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button className={base} onClick={onEvidence}><Search className="h-4 w-4" /> View AI Evidence</button>
      <button className={base} onClick={onAsk}><MessageCircle className="h-4 w-4" /> Ask Averia AI</button>
      <button className={base} onClick={onShare}><Share2 className="h-4 w-4" /> Share</button>
    </div>
  );
}

/** Averia Agentic AI Executive Summary — 3 clean bullets + verification badge. */
function ExecutiveSummary({ article, debunked }: { article: MediaNewsArticle; debunked: boolean }) {
  const bullets = useMemo(
    () => toBullets(article.content, article.description, article.title),
    [article],
  );
  return (
    <div className="rounded-2xl bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Sparkles className="h-4 w-4 text-foreground/80" />
        <p className="text-[13px] font-medium">Averia Agentic AI Executive Summary</p>
        <span className="ml-auto"><VerificationBadge score={displayTrustScore(article)} debunked={debunked} /></span>
      </div>
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-foreground/85">
            <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-foreground/50 shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted-foreground mt-3">Source: {domainOf(article.url)}</p>
    </div>
  );
}

function AudioPlayer({ article }: { article: MediaNewsArticle }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = useMemo(() => Array.from({ length: 56 }, (_, i) => 20 + ((i * 37) % 60)), []);

  const toggle = () => {
    const el = ref.current;
    if (!el || !article.audioUrl) { setPlaying(p => !p); return; }
    if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); }
  };

  return (
    <div className="rounded-2xl bg-white/[0.04] p-5">
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="h-14 w-14 rounded-full bg-foreground text-background flex items-center justify-center shrink-0"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-end gap-[2px] h-14">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-full bg-white/25"
                style={{
                  height: `${playing ? h : h * 0.55}%`,
                  transition: 'height 240ms ease',
                  transitionDelay: `${(i % 8) * 40}ms`,
                  background: (i / bars.length) * 100 < progress ? 'hsl(var(--foreground) / 0.75)' : undefined,
                }}
              />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => {
              const v = Number(e.target.value);
              setProgress(v);
              const el = ref.current;
              if (el && el.duration) el.currentTime = (v / 100) * el.duration;
            }}
            className="w-full mt-3 accent-white h-1"
          />
        </div>
        <Volume2 className="h-5 w-5 text-muted-foreground shrink-0" />
      </div>
      {article.audioUrl && (
        <audio
          ref={ref}
          src={article.audioUrl}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration) setProgress((el.currentTime / el.duration) * 100);
          }}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
}

/* ============ Instagram-style vertical snap reel feed ============ */
function ReelsFeed({
  reels, startId, onActiveChange, onAsk, onShare, debunked,
}: {
  reels: MediaNewsArticle[];
  startId: string;
  onActiveChange: (id: string) => void;
  onAsk: () => void;
  onShare: () => void;
  debunked: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(startId);
  const [ready, setReady] = useState<Record<string, boolean>>({});

  // Land on the reel the user tapped.
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-reel-id="${startId}"]`);
    if (el) el.scrollIntoView({ block: 'start' });
  }, [startId]);

  // Auto-play the centred reel, auto-pause the rest.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
            const id = (entry.target as HTMLElement).dataset.reelId!;
            setActiveId(id);
            onActiveChange(id);
          }
        }
      },
      { root, threshold: [0.8] },
    );
    root.querySelectorAll('[data-reel-id]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [reels.length, onActiveChange]);

  return (
    <div
      ref={scrollerRef}
      className="h-full w-full overflow-y-auto snap-y snap-mandatory scrollbar-hide overscroll-contain"
    >
      {reels.map((reel) => {
        const isActive = reel.id === activeId;
        const vid = ytIdOf(reel);
        return (
          <div
            key={reel.id}
            data-reel-id={reel.id}
            className="relative h-full w-full snap-start snap-always bg-black overflow-hidden"
          >
            {isActive && vid ? (
              <>
                {!ready[reel.id] && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <Loader2 className="h-7 w-7 animate-spin text-white/70" />
                  </div>
                )}
                <iframe
                  key={vid}
                  src={`https://www.youtube.com/embed/${vid}?autoplay=1&mute=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${vid}`}
                  className="absolute inset-0 w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={reel.title}
                  onLoad={() => setReady(r => ({ ...r, [reel.id]: true }))}
                />
              </>
            ) : (
              <img
                src={reel.urlToImage || '/placeholder.svg'}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover opacity-80"
                onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
              />
            )}

            {/* floating right action bar */}
            <div className="absolute right-3 bottom-32 z-20 flex flex-col gap-4">
              {[Heart, MessageCircle, Bookmark, Share2].map((Icon, i) => (
                <button
                  key={i}
                  onClick={i === 3 ? onShare : i === 1 ? onAsk : undefined}
                  className="h-11 w-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center text-white"
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>

            {/* bottom gradient overlay */}
            <div className="absolute inset-x-0 bottom-0 z-10 pt-16 pb-24 px-4 bg-gradient-to-t from-black/85 to-transparent pointer-events-none">
              <div className="flex items-center gap-2 mb-1.5">
                <VerificationBadge score={displayTrustScore(reel)} debunked={debunked} />
                <TrustScoreBadge score={displayTrustScore(reel)} />
              </div>
              <p className="text-[15px] font-medium leading-snug line-clamp-2 text-white">{stripHtml(reel.title)}</p>
              <p className="text-[12px] text-white/70 mt-1">{reel.source.name} · {formatNewsDate(reel.publishedAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NewsMediaContainer({ articles, initialId, mode, onClose, onLoadMore, loadingMore }: NewsMediaContainerProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [stack, setStack] = useState<string[]>([initialId]);
  const [showEvidence, setShowEvidence] = useState(false);
  const [backVisible, setBackVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const idleTimer = useRef<number | null>(null);
  const debunked = mode === 'debunked';

  const currentId = stack[stack.length - 1];
  const current = articles.find(a => a.id === currentId) || articles[0];
  const [subsection, setSubsection] = useState<MediaType>(
    SUBSECTIONS.some(s => s.id === current?.mediaType) ? (current!.mediaType as MediaType) : 'long_video',
  );

  /* --- immersive chrome lockdown: no header, sidebar, DP or bottom nav --- */
  useEffect(() => {
    document.body.classList.add('averia-immersive');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('averia-immersive');
      document.body.style.overflow = prev;
    };
  }, []);

  /* --- back button idle auto-hide (3 min) --- */
  const pingActivity = useCallback(() => {
    setBackVisible(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setBackVisible(false), IDLE_MS);
  }, []);

  useEffect(() => {
    pingActivity();
    return () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); };
  }, [pingActivity, currentId]);

  /* --- hardware back walks the media stack before leaving --- */
  useEffect(() => {
    window.history.pushState({ averiaContainer: true }, '');
    const onPop = () => {
      setStack(prev => {
        if (prev.length > 1) {
          window.history.pushState({ averiaContainer: true }, '');
          return prev.slice(0, -1);
        }
        onClose();
        return prev;
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onClose]);

  const openArticle = useCallback((id: string) => {
    setStack(prev => [...prev, id]);
    setDrawerOpen(true);
    pingActivity();
  }, [pingActivity]);

  const replaceCurrent = useCallback((id: string) => {
    setStack(prev => [...prev.slice(0, -1), id]);
  }, []);

  const upNext = useMemo(
    () => articles.filter(a => a.mediaType === subsection && a.id !== currentId),
    [articles, subsection, currentId],
  );

  const reels = useMemo(() => articles.filter(a => a.mediaType === 'short_video'), [articles]);

  const onAsk = () => {
    onClose();
    navigate('/averia-ai?q=' + encodeURIComponent(`Analyse this news: ${current?.title}`));
  };
  const onShare = () => {
    navigator.clipboard.writeText(current?.url || window.location.href);
    toast.success('Link copied');
  };

  /* Drawer horizontal scroll boundary → home infinite pagination */
  const drawerScrollRef = useRef<HTMLDivElement>(null);
  const handleDrawerScroll = useCallback(() => {
    const el = drawerScrollRef.current;
    if (!el || !onLoadMore || loadingMore) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 120) onLoadMore(subsection);
  }, [onLoadMore, loadingMore, subsection]);

  const handleSidebarScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!onLoadMore || loadingMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) onLoadMore(subsection);
  }, [onLoadMore, loadingMore, subsection]);

  if (!current) return null;

  const ytId = ytIdOf(current);

  const videoFrame = ytId ? (
    <iframe
      key={ytId}
      src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`}
      className="absolute inset-0 w-full h-full border-0"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title={current.title}
    />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">Media unavailable</div>
  );

  const isReel = current.mediaType === 'short_video';

  /* ---------------- per-subsection media stage ---------------- */
  const renderStage = () => {
    switch (current.mediaType) {
      case 'long_video':
        return <div className="relative w-full aspect-video bg-black overflow-hidden">{videoFrame}</div>;

      case 'image':
        return (
          <div className="w-full overflow-hidden bg-black">
            <img
              src={current.urlToImage || '/placeholder.svg'}
              alt={current.title}
              className="w-full max-h-[60vh] object-contain bg-black"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
            />
          </div>
        );

      case 'audio':
        return <AudioPlayer article={current} />;

      case 'url':
        return (
          <div className="rounded-2xl bg-white/[0.04] p-5 space-y-4">
            <div className="flex items-center gap-3">
              <img
                src={`https://www.google.com/s2/favicons?domain=${domainOf(current.url)}&sz=64`}
                alt=""
                className="h-10 w-10 rounded-lg bg-white/[0.06]"
              />
              <div className="min-w-0">
                <p className="text-[15px] font-medium truncate">{domainOf(current.url)}</p>
                <p className="text-[13px] text-muted-foreground truncate">{current.url}</p>
              </div>
            </div>
            <button
              onClick={onShare}
              className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-foreground text-background text-[13px] font-medium"
            >
              <Globe className="h-4 w-4" /> Open Original Source
            </button>
          </div>
        );

      case 'text':
      default:
        return null; // pure reader view — no forced image
    }
  };

  const bodyText = stripHtml(current.content || current.description);

  const body = (
    <div>
      {renderStage()}
      <div className="space-y-4 px-4 lg:px-8 pt-4 pb-10">
        <InfoStrip article={current} debunked={debunked} />
        <h1 className="font-heading font-semibold text-[21px] lg:text-[26px] leading-snug">{stripHtml(current.title)}</h1>
        {(current.mediaType === 'image' || current.mediaType === 'text' || current.mediaType === 'audio') && (
          <p className="text-[15.5px] leading-relaxed text-foreground/85 whitespace-pre-line">{bodyText}</p>
        )}
        <ActionPills onEvidence={() => setShowEvidence(true)} onAsk={onAsk} onShare={onShare} />
        <ExecutiveSummary article={current} debunked={debunked} />
      </div>
    </div>
  );

  const subsectionPills = (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
      {SUBSECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => { setSubsection(s.id); pingActivity(); }}
          className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] font-medium whitespace-nowrap shrink-0 transition ${
            subsection === s.id ? 'bg-foreground text-background' : 'bg-white/[0.06] text-muted-foreground hover:text-foreground'
          }`}
        >
          <s.icon className="h-3.5 w-3.5" />
          {s.label}
        </button>
      ))}
    </div>
  );

  const backButton = (
    <AnimatePresence>
      {backVisible && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="fixed top-3 left-3 z-[130] h-8 w-8 rounded-full bg-black/45 backdrop-blur-xl flex items-center justify-center text-white"
          aria-label="Close player"
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );

  const stage = isReel && reels.length > 0 ? (
    <ReelsFeed
      reels={reels}
      startId={current.id}
      onActiveChange={replaceCurrent}
      onAsk={onAsk}
      onShare={onShare}
      debunked={debunked}
    />
  ) : null;

  /* ======================= MOBILE ======================= */
  if (isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-background overflow-hidden"
        style={{ width: '100vw', height: '100dvh' }}
        onClick={pingActivity}
        onTouchStart={pingActivity}
      >
        {backButton}

        {stage ? (
          <div className="absolute inset-0">{stage}</div>
        ) : (
          <div className="h-full overflow-y-auto" style={{ paddingBottom: drawerOpen ? '46vh' : '72px' }}>
            {body}
          </div>
        )}

        {/* Bottom Up-Next drawer */}
        <motion.div
          animate={{ y: drawerOpen ? 0 : 'calc(100% - 52px)' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          onDragEnd={(_, info) => { if (info.offset.y > 60) setDrawerOpen(false); if (info.offset.y < -60) setDrawerOpen(true); }}
          className="absolute inset-x-0 bottom-0 z-[125] rounded-t-3xl bg-background/85 backdrop-blur-2xl shadow-2xl"
          style={{ height: '45vh' }}
        >
          <button
            onClick={() => setDrawerOpen(o => !o)}
            className="w-full h-13 py-4 flex items-center justify-center"
            aria-label="Toggle up next"
          >
            <span className="h-1.5 w-12 rounded-full bg-white/25" />
          </button>
          <div className="px-4 pb-2">{subsectionPills}</div>
          <div
            ref={drawerScrollRef}
            onScroll={handleDrawerScroll}
            className="px-4 pb-6 pt-3 flex gap-3 overflow-x-auto scrollbar-hide"
          >
            {upNext.map(a => (
              <div key={a.id} className="w-64 shrink-0">
                <NewsMediaCard article={a} variant="compact" onOpen={() => openArticle(a.id)} />
              </div>
            ))}
            <div className="flex items-center justify-center w-16 shrink-0">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {showEvidence && <EvidenceDeepDive article={current} onClose={() => setShowEvidence(false)} />}
        </AnimatePresence>
      </motion.div>
    );
  }

  /* ======================= DESKTOP ======================= */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-background flex"
      style={{ width: '100vw', height: '100vh' }}
      onMouseMove={pingActivity}
    >
      {backButton}

      <div className="flex-1 min-w-0 overflow-hidden" style={{ flexBasis: '80%' }}>
        {stage ? stage : <div className="h-full overflow-y-auto">{body}</div>}
      </div>

      <aside className="hidden lg:flex flex-col shrink-0 bg-white/[0.02]" style={{ width: '20%', minWidth: 280 }}>
        <div className="px-3 pt-4 pb-3 bg-background/80 backdrop-blur-xl z-10 space-y-3 shrink-0">
          <p className="text-[13px] font-semibold px-1">Up Next · {debunked ? 'Debunked' : 'Real'}</p>
          {subsectionPills}
        </div>
        <div onScroll={handleSidebarScroll} className="flex-1 overflow-y-auto px-2 pb-8 space-y-2">
          {upNext.map(a => (
            <NewsMediaCard key={a.id} article={a} variant="compact" onOpen={() => openArticle(a.id)} />
          ))}
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {showEvidence && <EvidenceDeepDive article={current} onClose={() => setShowEvidence(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}
