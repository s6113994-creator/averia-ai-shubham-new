import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, Share2, Search, Loader2, Play, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from './VerifiedBadge';
import { TrustScoreBadge } from './TrustScoreBadge';
import { EvidenceDeepDive } from './EvidenceDeepDive';
import { FeedSwitcherBar, type FeedTab } from './FeedSwitcherBar';
import { useMediaPlayer } from '@/contexts/MediaPlayerContext';
import type { MediaNewsArticle } from '@/types/news-media';

interface ReelsFullscreenProps {
  articles: MediaNewsArticle[];
  initialIndex: number;
  onClose: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onSwitchFeed?: (tab: FeedTab) => void;
}

const SNAP_RELEASE_MS = 420;
const SCROLL_SETTLE_MS = 120;
const WHEEL_THRESHOLD = 24;

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function getViewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

export function ReelsFullscreen({ articles, initialIndex, onClose, onLoadMore, hasMore, onSwitchFeed }: ReelsFullscreenProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [showEvidence, setShowEvidence] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { requestPlay } = useMediaPlayer();
  const isScrollingRef = useRef(false);
  const isWheelNavigatingRef = useRef(false);
  const currentIndexRef = useRef(initialIndex);

  const current = articles[currentIndex];
  const ytId = current?.videoId || (current ? extractYouTubeId(current.url) : null);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const scrollToIndex = useCallback((idx: number, behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const viewportHeight = getViewportHeight();
    isScrollingRef.current = true;
    container.scrollTo({ top: idx * viewportHeight, behavior });
    window.setTimeout(() => {
      isScrollingRef.current = false;
    }, SNAP_RELEASE_MS);

    setCurrentIndex(idx);
  }, []);

  useEffect(() => {
    if (ytId) requestPlay(`reel-${ytId}`);
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [ytId, requestPlay]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') scrollToIndex(Math.min(currentIndexRef.current + 1, articles.length - 1));
      if (e.key === 'ArrowUp') scrollToIndex(Math.max(currentIndexRef.current - 1, 0));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [articles.length, onClose, scrollToIndex]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let timeout: number | undefined;

    const handleScroll = () => {
      if (isScrollingRef.current) return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        const h = getViewportHeight();
        if (!h) return;
        const rawIndex = Math.round(container.scrollTop / h);
        const bounded = Math.max(0, Math.min(rawIndex, articles.length - 1));
        const prev = currentIndexRef.current;
        const nextIndex = Math.abs(bounded - prev) > 1 ? prev + Math.sign(bounded - prev) : bounded;

        if (nextIndex !== prev) {
          scrollToIndex(nextIndex, 'smooth');
        } else {
          setCurrentIndex(nextIndex);
        }

        if (nextIndex >= articles.length - 3 && onLoadMore && hasMore) {
          onLoadMore();
        }
      }, SCROLL_SETTLE_MS);
    };

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < WHEEL_THRESHOLD || isScrollingRef.current || isWheelNavigatingRef.current) return;
      e.preventDefault();
      isWheelNavigatingRef.current = true;
      const direction = e.deltaY > 0 ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(currentIndexRef.current + direction, articles.length - 1));
      scrollToIndex(nextIndex, 'smooth');
      window.setTimeout(() => { isWheelNavigatingRef.current = false; }, SNAP_RELEASE_MS);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
      clearTimeout(timeout);
    };
  }, [articles.length, hasMore, onLoadMore, scrollToIndex]);

  useEffect(() => {
    scrollToIndex(initialIndex, 'auto');
  }, [initialIndex, scrollToIndex]);

  const toggleLike = () => {
    setLiked(prev => {
      const next = new Set(prev);
      if (next.has(currentIndex)) next.delete(currentIndex);
      else next.add(currentIndex);
      return next;
    });
  };

  const handleHomeClick = useCallback(() => {
    onClose();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onClose]);

  const handleFeedSwitch = useCallback((tab: FeedTab) => {
    if (tab === 'reels') return;
    if (tab === 'community') {
      onClose();
      navigate('/social');
      return;
    }
    if (tab === 'ai_chat') {
      onClose();
      navigate('/chat');
      return;
    }
    onSwitchFeed?.(tab);
    onClose();
  }, [onClose, onSwitchFeed, navigate]);

  if (!current) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Top-left: Home + Close */}
      <div className="absolute top-4 left-4 z-[60] flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={handleHomeClick} className="text-white bg-black/40 backdrop-blur-sm hover:bg-black/60" title="Home">
          <Home className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white bg-black/40 backdrop-blur-sm hover:bg-black/60">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Vertical scroll-snap container */}
      <div
        ref={scrollContainerRef}
        className="h-full w-full"
        style={{
          overflowY: 'scroll',
          overflowX: 'hidden',
          scrollSnapType: 'y mandatory',
          scrollSnapStop: 'always',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          paddingBottom: onSwitchFeed ? '52px' : undefined,
        }}
      >
        {articles.map((article, idx) => {
          const id = article.videoId || extractYouTubeId(article.url);
          const isActive = idx === currentIndex;

          return (
            <div
              key={article.id}
              className="relative w-full"
              style={{ height: '100vh', scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div
                  className="relative overflow-hidden bg-black"
                  style={{ width: 'min(100vw, calc(100vh * 9 / 16))', aspectRatio: '9 / 16' }}
                >
                  {id && isActive ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=0&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&playsinline=1&showinfo=0`}
                      className="absolute inset-0 h-full w-full"
                      style={{ border: 'none' }}
                      sandbox="allow-scripts allow-same-origin allow-presentation"
                      allow="autoplay; encrypted-media; accelerometer; clipboard-write; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={article.title}
                    />
                  ) : article.urlToImage ? (
                    <img src={article.urlToImage} alt={article.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="h-16 w-16 text-white/40" />
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/40" />

                  <div className="absolute bottom-6 left-4 right-20 z-30 pointer-events-none">
                    <div className="pointer-events-auto mb-2 flex items-center gap-2">
                      <span className="text-xs font-bold text-white drop-shadow-lg">{article.source.name}</span>
                      <VerifiedBadge />
                      <TrustScoreBadge score={article.tier === 'top' ? 90 : 76} />
                    </div>
                    <h3 className="line-clamp-3 text-sm font-bold leading-snug text-white drop-shadow-lg">{article.title}</h3>
                    {article.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-white/75 drop-shadow-md">{article.description}</p>
                    )}
                  </div>

                  {isActive && (
                    <div className="absolute bottom-6 right-3 z-30 flex flex-col items-center gap-5">
                      <button onClick={toggleLike} className="group flex flex-col items-center gap-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-colors group-hover:bg-black/50">
                          <Heart className={`h-5 w-5 ${liked.has(idx) ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                        </div>
                        <span className="text-[10px] font-medium text-white/80">Like</span>
                      </button>
                      <button className="group flex flex-col items-center gap-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-colors group-hover:bg-black/50">
                          <Share2 className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-[10px] font-medium text-white/80">Share</span>
                      </button>
                      <button onClick={() => setShowEvidence(true)} className="group flex flex-col items-center gap-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-colors group-hover:bg-black/50">
                          <Search className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-[10px] font-medium text-white/80">Evidence</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <div className="flex items-center justify-center py-10" style={{ height: '80px', scrollSnapAlign: 'none' }}>
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
          </div>
        )}
      </div>

      {onSwitchFeed && <FeedSwitcherBar active="reels" onChange={handleFeedSwitch} />}

      <AnimatePresence>
        {showEvidence && <EvidenceDeepDive article={current} onClose={() => setShowEvidence(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}
