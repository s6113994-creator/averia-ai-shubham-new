import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Smartphone, Image, FileText, Headphones, Link as LinkIcon,
  XCircle, CheckCircle, Loader2, LayoutGrid, Plus
} from 'lucide-react';

import { NewsMediaContainer } from './NewsMediaContainer';
import { CreateNewsModal } from './CreateNewsModal';
import { Skeleton } from '@/components/ui/skeleton';
import { NewsReelPlayer } from './NewsReelPlayer';
import { NewsVideoPlayer } from './NewsVideoPlayer';
import { NewsMediaCard } from './NewsMediaCard';
import type { MediaNewsArticle, MediaType } from '@/types/news-media';
import type { FeedTab } from './FeedSwitcherBar';

const iconMap: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid className="h-4 w-4" />,
  Film: <Film className="h-4 w-4" />,
  Smartphone: <Smartphone className="h-4 w-4" />,
  Image: <Image className="h-4 w-4" />,
  FileText: <FileText className="h-4 w-4" />,
  Headphones: <Headphones className="h-4 w-4" />,
  Link: <LinkIcon className="h-4 w-4" />,
};

interface SectionConfig {
  id: string;
  label: string;
  icon: string;
  mediaType: MediaType | 'all';
}

const SECTIONS: SectionConfig[] = [
  { id: 'all', label: 'All', icon: 'LayoutGrid', mediaType: 'all' },
  { id: 'long_video', label: 'Video', icon: 'Film', mediaType: 'long_video' },
  { id: 'short_video', label: 'Reels', icon: 'Smartphone', mediaType: 'short_video' },
  { id: 'image', label: 'Image', icon: 'Image', mediaType: 'image' },
  { id: 'text', label: 'Text', icon: 'FileText', mediaType: 'text' },
];



interface NewsSectionGridProps {
  realNews: MediaNewsArticle[];
  debunkedNews: MediaNewsArticle[];
  onSave?: (article: MediaNewsArticle) => void;
  onVerify?: (article: MediaNewsArticle) => void;
  savedIds?: Set<string>;
  verifyingId?: string | null;
  onLoadMoreVideos?: (type: 'long' | 'short') => void;
  onLoadMoreNews?: () => void;
  hasMoreVideos?: { long: boolean; short: boolean };
  hasMoreNews?: boolean;
  loadingMoreNews?: boolean;
  loadingMoreLong?: boolean;
  loadingMoreShort?: boolean;
  categories?: { value: string; label: string }[];
  selectedCategory?: string;
  onCategoryChange?: (v: string) => void;
  searchQuery?: string;
  onSearchChange?: (v: string) => void;
}




function InfiniteScrollGrid({
  articles, onSave, onVerify, savedIds, verifyingId, onLoadMore, hasMore, loadingMore,
}: {
  articles: MediaNewsArticle[];
  onSave?: (article: MediaNewsArticle) => void;
  onVerify?: (article: MediaNewsArticle) => void;
  savedIds?: Set<string>;
  verifyingId?: string | null;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !loadingMore) onLoadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore]);

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map((article) => (
          <NewsMediaCard
            key={article.id}
            article={article}
            onSave={onSave ? () => onSave(article) : undefined}
            onVerify={onVerify ? () => onVerify(article) : undefined}
            isSaved={savedIds?.has(article.id)}
            isVerifying={verifyingId === article.id}
          />
        ))}
      </div>
      {/* Always show spinner - never stop */}
      <div ref={sentinelRef} className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    </div>
  );
}

function AllSectionContent({
  articles, onSave, onVerify, savedIds, verifyingId,
  onLoadMoreVideos, onLoadMoreNews, hasMoreVideos, hasMoreNews,
  loadingMoreNews, loadingMoreLong, loadingMoreShort, onSwitchFeed, onOpen,
}: {
  articles: MediaNewsArticle[];
  onSave?: (article: MediaNewsArticle) => void;
  onVerify?: (article: MediaNewsArticle) => void;
  savedIds?: Set<string>;
  verifyingId?: string | null;
  onLoadMoreVideos?: (type: 'long' | 'short') => void;
  onLoadMoreNews?: () => void;
  hasMoreVideos?: { long: boolean; short: boolean };
  hasMoreNews?: boolean;
  loadingMoreNews?: boolean;
  loadingMoreLong?: boolean;
  loadingMoreShort?: boolean;
  onSwitchFeed?: (tab: FeedTab) => void;
  onOpen?: (article: MediaNewsArticle) => void;
}) {
  const longSentinelRef = useRef<HTMLDivElement>(null);
  const shortSentinelRef = useRef<HTMLDivElement>(null);
  const newsSentinelRef = useRef<HTMLDivElement>(null);

  const reels = articles.filter(a => a.mediaType === 'short_video');
  const longVideos = articles.filter(a => a.mediaType === 'long_video');
  const otherArticles = articles.filter(a => !['short_video', 'long_video'].includes(a.mediaType));

  useEffect(() => {
    if (!longSentinelRef.current || !hasMoreVideos?.long) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !loadingMoreLong) onLoadMoreVideos?.('long'); },
      { threshold: 0.1 }
    );
    observer.observe(longSentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMoreVideos, hasMoreVideos?.long, loadingMoreLong]);

  useEffect(() => {
    if (!shortSentinelRef.current || !hasMoreVideos?.short) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !loadingMoreShort) onLoadMoreVideos?.('short'); },
      { threshold: 0.1 }
    );
    observer.observe(shortSentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMoreVideos, hasMoreVideos?.short, loadingMoreShort]);

  useEffect(() => {
    if (!newsSentinelRef.current || !hasMoreNews) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !loadingMoreNews) onLoadMoreNews?.(); },
      { threshold: 0.1 }
    );
    observer.observe(newsSentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMoreNews, hasMoreNews, loadingMoreNews]);

  // Limit long videos to 4 rows (8 items at 2 cols) in All view
  const MAX_LONG_IN_ALL = 8;
  const displayLongVideos = longVideos.slice(0, MAX_LONG_IN_ALL);

  return (
    <div className="space-y-8">
      {reels.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold text-lg mb-3 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" /> Reels
          </h3>
          <NewsReelPlayer
            key={`all-reels-${reels.length}`}
            articles={reels}
            onLoadMore={() => onLoadMoreVideos?.('short')}
            hasMore={hasMoreVideos?.short}
            maxRows={2}
            onSwitchFeed={onSwitchFeed}
            onOpen={onOpen}
          />
          <div ref={shortSentinelRef} className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        </div>
      )}

      {displayLongVideos.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold text-lg mb-3 flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" /> Long Videos
            {longVideos.length > MAX_LONG_IN_ALL && (
              <span className="text-xs text-muted-foreground ml-2">(Showing {MAX_LONG_IN_ALL} — tap Long Video tab for full feed)</span>
            )}
          </h3>
          <NewsVideoPlayer
            key={`all-long-${displayLongVideos.length}`}
            articles={displayLongVideos}
            onSwitchFeed={onSwitchFeed}
            onOpen={onOpen}
          />
        </div>
      )}

      {otherArticles.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold text-lg mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Articles
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherArticles.map((article) => (
              <NewsMediaCard
                key={article.id}
                article={article}
                onSave={onSave ? () => onSave(article) : undefined}
                onVerify={onVerify ? () => onVerify(article) : undefined}
                isSaved={savedIds?.has(article.id)}
                isVerifying={verifyingId === article.id}
                onOpen={onOpen ? () => onOpen(article) : undefined}
              />
            ))}
          </div>
          <div ref={newsSentinelRef} className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Check if a date string falls within the last 24 hours */
function isLiveContent(article: MediaNewsArticle): boolean {
  const dateStr = article._fetchedAt || article.publishedAt;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000;
}

function DualContainerHeader({ isLive }: { isLive: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 mb-4 px-3 py-2.5 rounded-lg border ${
      isLive
        ? 'bg-green-500/5 border-green-500/20'
        : 'bg-purple-500/5 border-purple-500/20'
    }`}>
      <div className={`h-3 w-3 rounded-full shrink-0 ${
        isLive
          ? 'bg-green-500 animate-[pulse-glow_2s_ease-in-out_infinite]'
          : 'bg-purple-500'
      }`} />
      <h3 className={`font-heading font-semibold text-sm ${
        isLive ? 'text-green-400' : 'text-purple-400'
      }`}>
        {isLive ? "Today's Fresh News" : 'Averia Archive'}
      </h3>
      <span className={`text-[10px] ml-auto font-medium ${
        isLive ? 'text-green-500/60' : 'text-purple-500/60'
      }`}>
        {isLive ? 'LIVE • < 24h' : 'HISTORICAL'}
      </span>
    </div>
  );
}

function SectionContent({
  articles, mediaType, onSave, onVerify, savedIds, verifyingId,
  onLoadMore, hasMore, loadingMore, onSwitchFeed, onOpen,
}: {
  articles: MediaNewsArticle[];
  mediaType: MediaType;
  onSave?: (article: MediaNewsArticle) => void;
  onVerify?: (article: MediaNewsArticle) => void;
  savedIds?: Set<string>;
  verifyingId?: string | null;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onSwitchFeed?: (tab: FeedTab) => void;
  onOpen?: (article: MediaNewsArticle) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !loadingMore) onLoadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore]);

  // Split into Container A (live <24h) and Container B (archive >24h)
  const liveArticles = articles.filter(isLiveContent);
  const archivedArticles = articles.filter(a => !isLiveContent(a));

  if (mediaType === 'short_video') {
    return (
      <div className="space-y-8">
        {liveArticles.length > 0 && (
          <div>
            <DualContainerHeader isLive />
            <NewsReelPlayer key={`live-reels-${liveArticles.length}`} articles={liveArticles} onLoadMore={onLoadMore} hasMore={hasMore} onSwitchFeed={onSwitchFeed} onOpen={onOpen} />
          </div>
        )}
        {archivedArticles.length > 0 && (
          <div>
            <DualContainerHeader isLive={false} />
            <NewsReelPlayer key={`archive-reels-${archivedArticles.length}`} articles={archivedArticles} onSwitchFeed={onSwitchFeed} onOpen={onOpen} />
          </div>
        )}
        <div ref={sentinelRef} className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (mediaType === 'long_video') {
    return (
      <div className="space-y-8">
        {liveArticles.length > 0 && (
          <div>
            <DualContainerHeader isLive />
            <NewsVideoPlayer key={`live-long-${liveArticles.length}`} articles={liveArticles} onLoadMore={onLoadMore} hasMore={hasMore} onSwitchFeed={onSwitchFeed} onOpen={onOpen} />
          </div>
        )}
        {archivedArticles.length > 0 && (
          <div>
            <DualContainerHeader isLive={false} />
            <NewsVideoPlayer key={`archive-long-${archivedArticles.length}`} articles={archivedArticles} onSwitchFeed={onSwitchFeed} onOpen={onOpen} />
          </div>
        )}
        <div ref={sentinelRef} className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // For image, text, audio, url — card grid with dual containers
  return (
    <div className="space-y-8">
      {liveArticles.length > 0 && (
        <div>
          <DualContainerHeader isLive />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveArticles.map((article) => (
              <NewsMediaCard
                key={article.id}
                article={article}
                onSave={onSave ? () => onSave(article) : undefined}
                onVerify={onVerify ? () => onVerify(article) : undefined}
                isSaved={savedIds?.has(article.id)}
                isVerifying={verifyingId === article.id}
                onOpen={onOpen ? () => onOpen(article) : undefined}
              />
            ))}
          </div>
        </div>
      )}
      {archivedArticles.length > 0 && (
        <div>
          <DualContainerHeader isLive={false} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {archivedArticles.map((article) => (
              <NewsMediaCard
                key={article.id}
                article={article}
                onSave={onSave ? () => onSave(article) : undefined}
                onVerify={onVerify ? () => onVerify(article) : undefined}
                isSaved={savedIds?.has(article.id)}
                isVerifying={verifyingId === article.id}
                onOpen={onOpen ? () => onOpen(article) : undefined}
              />
            ))}
          </div>
        </div>
      )}
      <div ref={sentinelRef} className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    </div>
  );
}

function ContentSkeletonLoader() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-medium animate-pulse">Fetching latest news...</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass-card rounded-xl overflow-hidden">
            <Skeleton className="h-48 w-full rounded-none" />
            <div className="p-4 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NewsSectionGrid({
  realNews, debunkedNews, onSave, onVerify, savedIds, verifyingId,
  onLoadMoreVideos, onLoadMoreNews, hasMoreVideos, hasMoreNews,
  loadingMoreNews, loadingMoreLong, loadingMoreShort,
  categories, selectedCategory, onCategoryChange, searchQuery, onSearchChange,
}: NewsSectionGridProps) {
  const [activeView, setActiveView] = useState<'real' | 'debunked'>('real');
  const [activeTab, setActiveTab] = useState('long_video');

  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Scroll direction: down hides Rows 1 & 2 (Row 3 stays pinned), up restores them.
  useEffect(() => {
    const scroller: HTMLElement | Window =
      (tabsRef.current?.closest('main') as HTMLElement | null) || window;
    const readY = () =>
      scroller === window ? window.scrollY : (scroller as HTMLElement).scrollTop;
    let last = readY();
    const onScroll = () => {
      const y = readY();
      if (Math.abs(y - last) < 8) return;
      const hide = y > last && y > 90;
      setChromeHidden(hide);
      document.body.classList.toggle('averia-chrome-collapsed', hide);
      last = y;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      document.body.classList.remove('averia-chrome-collapsed');
    };
  }, []);

  const handleOpen = useCallback((article: MediaNewsArticle) => setOpenId(article.id), []);

  const getArticlesByType = (articles: MediaNewsArticle[], type: MediaType) =>
    articles.filter((a) => a.mediaType === type);

  const currentArticles = activeView === 'real' ? realNews : debunkedNews;

  // Row 1 [+] button in the page header opens the create modal.
  useEffect(() => {
    const open = () => setCreateOpen(true);
    window.addEventListener('averia:create-news', open);
    return () => window.removeEventListener('averia:create-news', open);
  }, []);

  const handleSwitchFeed = useCallback((tab: FeedTab) => {
    const tabMap: Record<FeedTab, string> = {
      videos: 'long_video',
      reels: 'short_video',
      images: 'image',
      community: 'long_video',
      ai_chat: 'long_video',
    };
    setActiveTab(tabMap[tab] || 'long_video');
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);


  const renderContent = () => {
    if (activeTab === 'all') {
      return currentArticles.length === 0 ? (
        <ContentSkeletonLoader />
      ) : (
        <AllSectionContent
          articles={currentArticles}
          onSave={onSave}
          onVerify={onVerify}
          savedIds={savedIds}
          verifyingId={verifyingId}
          onLoadMoreVideos={onLoadMoreVideos}
          onLoadMoreNews={onLoadMoreNews}
          hasMoreVideos={hasMoreVideos}
          hasMoreNews={hasMoreNews}
          loadingMoreNews={loadingMoreNews}
          loadingMoreLong={loadingMoreLong}
          loadingMoreShort={loadingMoreShort}
          onSwitchFeed={handleSwitchFeed}
          onOpen={handleOpen}
        />
      );
    }

    const section = SECTIONS.find(s => s.id === activeTab);
    if (!section) return null;
    const filtered = getArticlesByType(currentArticles, section.mediaType as MediaType);

    if (filtered.length === 0) {
      return <ContentSkeletonLoader />;
    }

    return (
      <SectionContent
        articles={filtered}
        mediaType={section.mediaType as MediaType}
        onSave={onSave}
        onVerify={onVerify}
        savedIds={savedIds}
        verifyingId={verifyingId}
        onLoadMore={
          section.mediaType === 'long_video'
            ? () => onLoadMoreVideos?.('long')
            : section.mediaType === 'short_video'
            ? () => onLoadMoreVideos?.('short')
            : onLoadMoreNews
        }
        hasMore={
          section.mediaType === 'long_video'
            ? hasMoreVideos?.long
            : section.mediaType === 'short_video'
            ? hasMoreVideos?.short
            : hasMoreNews
        }
        loadingMore={
          section.mediaType === 'long_video'
            ? loadingMoreLong
            : section.mediaType === 'short_video'
            ? loadingMoreShort
            : loadingMoreNews
        }
        onSwitchFeed={handleSwitchFeed}
        onOpen={handleOpen}
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* ---------- ROW 2: collapsible verification switch ---------- */}
      <div
        className={`flex flex-row flex-nowrap items-center justify-between gap-1.5 overflow-hidden origin-top transition-transform duration-300 ${chromeHidden ? '-translate-y-full h-0 opacity-0 pointer-events-none' : 'translate-y-0 h-11 opacity-100'}`}
      >
        <div className="inline-flex p-0.5 rounded-full bg-white/[0.06] shrink-0">
          {(['real', 'debunked'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className={`h-9 px-2.5 sm:px-3 rounded-full text-[11.5px] sm:text-[12.5px] font-medium whitespace-nowrap transition ${
                activeView === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === 'real' ? 'Verified' : 'Debunked'}
            </button>
          ))}
        </div>

        <span className="text-xs text-muted-foreground">{categories?.find(category => category.value === selectedCategory)?.label ?? 'All'}</span>
      </div>



      {/* ---------- ROW 3: sticky subsection pills ---------- */}
      <div
        ref={tabsRef}
        className={`sticky top-[52px] z-30 -mx-4 bg-background/85 px-4 py-2 backdrop-blur-xl transition-transform duration-300 ${chromeHidden ? '-translate-y-full' : 'translate-y-0'}`}
      >
        <div className="flex gap-2 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => {
                setActiveTab(section.id);
                if (section.id === 'all') {
                  onCategoryChange?.('all');
                  onSearchChange?.('');
                }
              }}

              className={`flex items-center gap-1.5 px-4 h-10 text-[13px] font-medium rounded-full whitespace-nowrap shrink-0 transition ${
                activeTab === section.id
                  ? 'bg-foreground text-background'
                  : 'bg-white/[0.06] text-muted-foreground hover:text-foreground'
              }`}
            >
              {iconMap[section.icon]}
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <motion.div
        key={activeTab + activeView}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {renderContent()}
      </motion.div>

      <CreateNewsModal open={createOpen} onOpenChange={setCreateOpen} />

      <AnimatePresence>
        {openId && (
          <NewsMediaContainer
            articles={currentArticles}
            initialId={openId}
            mode={activeView}
            onClose={() => setOpenId(null)}
            onLoadMore={(type) => {
              if (type === 'long_video') onLoadMoreVideos?.('long');
              else if (type === 'short_video') onLoadMoreVideos?.('short');
              else onLoadMoreNews?.();
            }}
            loadingMore={loadingMoreNews || loadingMoreLong || loadingMoreShort}
          />

        )}
      </AnimatePresence>
    </div>
  );
}

