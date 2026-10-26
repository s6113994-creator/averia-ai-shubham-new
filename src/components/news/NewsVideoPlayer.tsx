import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from './VerifiedBadge';
import { TrustScoreBadge } from './TrustScoreBadge';
import { CinemaPlayer } from './CinemaPlayer';
import type { MediaNewsArticle } from '@/types/news-media';
import type { FeedTab } from './FeedSwitcherBar';
import { formatNewsDate } from '@/lib/date';

interface NewsVideoPlayerProps {
  articles: MediaNewsArticle[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onSwitchFeed?: (tab: FeedTab) => void;
  onOpen?: (article: MediaNewsArticle) => void;
}

function VideoCard({ article, onClick }: { article: MediaNewsArticle; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl overflow-hidden group cursor-pointer"
      onClick={onClick}
    >
      <div className="relative aspect-video bg-secondary">
        {/* Source indicator dot - MANDATORY */}
        <div
          className={`absolute top-2 right-2 z-20 h-2.5 w-2.5 rounded-full border border-background/50 ${
            article._source === 'live' ? 'bg-green-500' : 'bg-purple-500'
          }`}
          title={article._source === 'live' ? 'Live (API)' : 'Archived (Database)'}
        />
        {article.urlToImage ? (
          <img
            src={article.urlToImage}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-secondary to-card flex items-center justify-center">
            <Play className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-background/20 flex items-center justify-center group-hover:bg-background/40 transition-colors">
          <div className="h-14 w-14 rounded-full bg-primary/90 flex items-center justify-center hover:bg-primary transition-colors glow-primary">
            <Play className="h-7 w-7 text-primary-foreground ml-1" />
          </div>
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-background/80 rounded text-xs text-foreground backdrop-blur-sm">
          <Clock className="h-3 w-3" />
          <span>Video</span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 flex-wrap">
          <span className="font-medium text-primary">{article.source.name}</span>
          <span>•</span>
          <span>{formatNewsDate(article.publishedAt)}</span>
          <VerifiedBadge />
          <TrustScoreBadge score={article.tier === 'top' ? 91 : article.tier === 'trending' ? 77 : 64} />
        </div>
        <h3 className="font-heading font-semibold line-clamp-2 mb-2 group-hover:text-primary transition-colors">
          {article.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{article.description}</p>
      </div>
    </motion.div>
  );
}

export function NewsVideoPlayer({ articles, onLoadMore, hasMore, loadingMore, onSwitchFeed, onOpen }: NewsVideoPlayerProps) {
  const [cinemaIndex, setCinemaIndex] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onLoadMore || !hasMore || loadingMore) return;
    const grid = gridRef.current;
    if (!grid) return;

    const lastCard = grid.lastElementChild;
    if (!lastCard) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.05, rootMargin: '220px 0px' },
    );

    observer.observe(lastCard);
    return () => observer.disconnect();
  }, [articles.length, onLoadMore, hasMore, loadingMore]);

  if (articles.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 glass-card rounded-xl">
        <p className="text-muted-foreground">No video content available</p>
      </div>
    );
  }

  return (
    <div>
      <div ref={gridRef} className="grid md:grid-cols-2 gap-4">
        {articles.map((article, i) => (
          <VideoCard key={article.id} article={article} onClick={() => (onOpen ? onOpen(article) : setCinemaIndex(i))} />
        ))}
      </div>
      {hasMore && onLoadMore && (
        <div className="flex justify-center mt-6">
          <Button variant="outline" onClick={onLoadMore} className="gap-2">
            Load More Videos
          </Button>
        </div>
      )}

      <AnimatePresence>
        {cinemaIndex !== null && (
          <CinemaPlayer
            articles={articles}
            initialIndex={cinemaIndex}
            onClose={() => setCinemaIndex(null)}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onSwitchFeed={onSwitchFeed}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
