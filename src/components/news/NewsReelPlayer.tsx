import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play } from 'lucide-react';
import { VerifiedBadge } from './VerifiedBadge';
import { ReelsFullscreen } from './ReelsFullscreen';
import type { MediaNewsArticle } from '@/types/news-media';
import type { FeedTab } from './FeedSwitcherBar';

interface NewsReelPlayerProps {
  articles: MediaNewsArticle[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  maxRows?: number;
  onSwitchFeed?: (tab: FeedTab) => void;
  onOpen?: (article: MediaNewsArticle) => void;
}

function ReelThumbnail({ article, onClick }: { article: MediaNewsArticle; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative aspect-[9/16] rounded-xl overflow-hidden cursor-pointer group w-full"
      onClick={onClick}
    >
      {/* Source indicator dot - MANDATORY */}
      <div className={`absolute top-2 right-2 z-10 h-2.5 w-2.5 rounded-full border border-background/50 ${article._source === 'live' ? 'bg-green-500' : 'bg-purple-500'}`} title={article._source === 'live' ? 'Live (API)' : 'Archived (Database)'} />
      {article.urlToImage ? (
        <img
          src={article.urlToImage}
          alt={article.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
        />
      ) : (
        <div className="w-full h-full bg-secondary flex items-center justify-center">
          <Play className="h-10 w-10 text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="h-12 w-12 rounded-full bg-primary/80 flex items-center justify-center backdrop-blur-sm glow-primary">
          <Play className="h-6 w-6 text-primary-foreground ml-0.5" />
        </div>
      </div>

      <div className="absolute top-2.5 left-2.5 z-10">
        <VerifiedBadge />
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-3.5 pb-3.5 pt-6">
        <h4 className="text-[14px] leading-snug font-medium text-foreground line-clamp-2">{article.title}</h4>
      </div>
    </motion.div>
  );
}

export function NewsReelPlayer({ articles, onLoadMore, hasMore, maxRows, onSwitchFeed, onOpen }: NewsReelPlayerProps) {
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onLoadMore || !hasMore || maxRows) return;
    const el = scrollRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) onLoadMore(); },
      { threshold: 0.1 }
    );
    const lastChild = el.lastElementChild;
    if (lastChild) observer.observe(lastChild);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, articles.length, maxRows]);

  if (articles.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 glass-card rounded-xl">
        <p className="text-muted-foreground">No reels available</p>
      </div>
    );
  }

  const cols = typeof window !== 'undefined' && window.innerWidth >= 640 ? 4 : 3;
  const displayArticles = maxRows ? articles.slice(0, maxRows * cols) : articles;

  return (
    <div>
      <div
        ref={scrollRef}
        className="grid grid-cols-3 sm:grid-cols-4 gap-3 pb-2"
      >
        {displayArticles.map((article, i) => (
          <ReelThumbnail
            key={article.id}
            article={article}
            onClick={() => (onOpen ? onOpen(article) : setFullscreenIndex(i))}
          />
        ))}
      </div>

      <AnimatePresence>
        {fullscreenIndex !== null && (
          <ReelsFullscreen
            articles={articles}
            initialIndex={fullscreenIndex}
            onClose={() => setFullscreenIndex(null)}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            onSwitchFeed={onSwitchFeed}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
