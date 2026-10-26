import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, ChevronRight, Search, Loader2, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VerifiedBadge } from './VerifiedBadge';
import { TrustScoreBadge } from './TrustScoreBadge';
import { EvidenceDeepDive } from './EvidenceDeepDive';
import { FeedSwitcherBar, type FeedTab } from './FeedSwitcherBar';
import { useMediaPlayer } from '@/contexts/MediaPlayerContext';
import { useIsMobile } from '@/hooks/use-mobile';
import type { MediaNewsArticle } from '@/types/news-media';
import { formatNewsDate } from '@/lib/date';

interface CinemaPlayerProps {
  articles: MediaNewsArticle[];
  initialIndex: number;
  onClose: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onSwitchFeed?: (tab: FeedTab) => void;
}

function SidebarItem({ article, onClick, isActive }: { article: MediaNewsArticle; onClick: () => void; isActive?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex gap-3 p-2 rounded-lg transition-colors text-left group ${isActive ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-card/80'}`}
    >
      <div className="relative w-36 h-20 rounded-md overflow-hidden shrink-0 bg-secondary">
        {article._source && (
          <div className={`absolute top-1 right-1 z-10 h-2 w-2 rounded-full ${article._source === 'live' ? 'bg-green-500' : 'bg-purple-500'}`} />
        )}
        {article.urlToImage ? (
          <img src={article.urlToImage} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-background/40">
          <Play className="h-6 w-6 text-primary-foreground" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">{article.title}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{article.source.name}</p>
        <p className="text-[10px] text-muted-foreground">{formatNewsDate(article.publishedAt)}</p>
      </div>
    </button>
  );
}

function MobileThumbnailCard({ article, onClick, isActive }: { article: MediaNewsArticle; onClick: () => void; isActive?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex flex-col rounded-lg overflow-hidden transition-colors text-left ${isActive ? 'ring-2 ring-primary/50' : 'hover:bg-card/80'}`}
    >
      <div className="relative w-full aspect-video bg-secondary">
        {article.urlToImage ? (
          <img src={article.urlToImage} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-background/20">
          <div className="h-10 w-10 rounded-full bg-primary/80 flex items-center justify-center">
            <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium line-clamp-2">{article.title}</p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.description}</p>
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
          <span className="font-medium text-primary">{article.source.name}</span>
          <span>•</span>
          <span>{formatNewsDate(article.publishedAt)}</span>
        </div>
      </div>
    </button>
  );
}

export function CinemaPlayer({ articles, initialIndex, onClose, onLoadMore, hasMore, loadingMore, onSwitchFeed }: CinemaPlayerProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showEvidence, setShowEvidence] = useState(false);
  const { requestPlay } = useMediaPlayer();
  const isMobile = useIsMobile();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const current = articles[currentIndex];
  const videoId = current?.videoId;

  useEffect(() => {
    if (videoId) requestPlay(`cinema-${videoId}`);
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [videoId, requestPlay]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setCurrentIndex(i => Math.min(i + 1, articles.length - 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setCurrentIndex(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [articles.length, onClose]);

  // Sidebar infinite scroll sentinel
  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const scrollRoot = sidebarScrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !loadingMore) onLoadMore(); },
      { threshold: 0.1, root: scrollRoot || null, rootMargin: '200px 0px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore, articles.length]);

  // Auto-load more when near end of sidebar list
  useEffect(() => {
    if (currentIndex >= articles.length - 3 && onLoadMore && hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [currentIndex, articles.length, onLoadMore, hasMore, loadingMore]);

  const handleHomeClick = useCallback(() => {
    onClose();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onClose]);

  const handleFeedSwitch = useCallback((tab: FeedTab) => {
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

  const suggested = articles.filter((_, i) => i !== currentIndex);

  const videoEmbed = videoId ? (
    <iframe
      key={videoId}
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
      className="absolute inset-0 w-full h-full border-0"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title={current.title}
    />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">No video available</div>
  );

  const infoBar = (
    <div className="p-3 sm:p-4 border-t border-border/30 shrink-0">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-sm font-medium text-primary">{current.source.name}</span>
        <VerifiedBadge />
        <TrustScoreBadge score={current.tier === 'top' ? 92 : current.tier === 'trending' ? 78 : 65} />
        <span className="text-xs text-muted-foreground">
          {formatNewsDate(current.publishedAt)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{current.description}</p>
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowEvidence(true)}>
        <Search className="h-3 w-3" /> View Evidence
      </Button>
    </div>
  );

  const thumbnailList = (
    <>
      {suggested.map((article) => {
        const origIdx = articles.indexOf(article);
        return isMobile ? (
          <MobileThumbnailCard key={article.id} article={article} onClick={() => setCurrentIndex(origIdx)} />
        ) : (
          <SidebarItem key={article.id} article={article} onClick={() => setCurrentIndex(origIdx)} />
        );
      })}
      {/* Always show spinner in sidebar */}
      <div ref={sentinelRef} className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    </>
  );

  /* ======================== MOBILE LAYOUT ======================== */
  if (isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 shrink-0">
          <h2 className="font-heading font-bold text-sm truncate flex-1 mr-2">{current.title}</h2>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={handleHomeClick} className="h-8 w-8" title="Home">
              <Home className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative w-full bg-card shrink-0" style={{ height: '35vh' }}>
          {videoEmbed}
        </div>

        {infoBar}

        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0, paddingBottom: '64px' }}>
          <div className="px-3 py-2 flex items-center gap-2 border-b border-border/30 sticky top-0 bg-background z-10">
            <ChevronRight className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Up Next</span>
          </div>
          <div className="p-2 space-y-2">
            {thumbnailList}
          </div>
        </div>

        {onSwitchFeed && <FeedSwitcherBar active="videos" onChange={handleFeedSwitch} />}

        <AnimatePresence>
          {showEvidence && <EvidenceDeepDive article={current} onClose={() => setShowEvidence(false)} />}
        </AnimatePresence>
      </motion.div>
    );
  }

  /* ======================== DESKTOP LAYOUT ======================== */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
        <h2 className="font-heading font-bold text-lg truncate flex-1 mr-4">{current.title}</h2>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={handleHomeClick} title="Home">
            <Home className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden" style={{ minHeight: 0, paddingBottom: '52px' }}>
        {/* LEFT 70% */}
        <div className="flex flex-col" style={{ width: '70%', minHeight: 0 }}>
          <div className="relative w-full bg-card" style={{ flex: '1 1 0%', minHeight: '300px' }}>
            {videoEmbed}
          </div>
          {infoBar}
        </div>

        {/* RIGHT 30% */}
        <div className="flex flex-col border-l border-border/30" style={{ width: '30%', minHeight: 0 }}>
          <div className="px-4 py-3 flex items-center gap-2 border-b border-border/30 shrink-0">
            <ChevronRight className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Up Next</span>
          </div>
          <div ref={sidebarScrollRef} className="flex-1" style={{ minHeight: 0 }}>
            <ScrollArea className="h-full">
              <div className="p-2 space-y-1">
                {thumbnailList}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {onSwitchFeed && <FeedSwitcherBar active="videos" onChange={handleFeedSwitch} />}

      <AnimatePresence>
        {showEvidence && <EvidenceDeepDive article={current} onClose={() => setShowEvidence(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}
