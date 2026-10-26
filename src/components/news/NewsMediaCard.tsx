import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ExternalLink, Bookmark, Shield, Loader2, 
  Image as ImageIcon, FileText, Headphones, Link as LinkIcon, 
  XCircle, Play, Search
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { VerificationBadge } from './VerificationBadge';
import { TrustScoreBadge } from './TrustScoreBadge';
import { EvidenceDeepDive } from './EvidenceDeepDive';
import type { MediaNewsArticle } from '@/types/news-media';
import { formatNewsDate, displayTrustScore } from '@/lib/date';
import { stripHtml } from '@/lib/text';


/** Check if a date string falls within the last 24 hours */
function isWithin24Hours(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000;
}

interface NewsMediaCardProps {
  article: MediaNewsArticle;
  onSave?: () => void;
  onVerify?: () => void;
  isSaved?: boolean;
  isVerifying?: boolean;
  onOpen?: () => void;
  /** `compact` renders the dense horizontal card reused inside the Up-Next drawer. */
  variant?: 'default' | 'compact';
}


function MediaBadge({ type }: { type: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    image: { icon: <ImageIcon className="h-3 w-3" />, label: 'Image', className: 'bg-white/[0.08] text-foreground/90' },
    text: { icon: <FileText className="h-3 w-3" />, label: 'Text', className: 'bg-white/[0.08] text-foreground/90' },
    audio: { icon: <Headphones className="h-3 w-3" />, label: 'Audio', className: 'bg-white/[0.08] text-foreground/90' },
    url: { icon: <LinkIcon className="h-3 w-3" />, label: 'URL', className: 'bg-white/[0.08] text-foreground/90' },
  };

  const c = config[type] || config.text;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-full ${c.className}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

export function NewsMediaCard({ article, onSave, onVerify, isSaved, isVerifying, onOpen, variant = 'default' }: NewsMediaCardProps) {
  const navigate = useNavigate();
  const [showEvidence, setShowEvidence] = useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpen) { onOpen(); return; }
    navigate('/article', { state: { article } });
  };

  if (variant === 'compact') {
    return (
      <article
        onClick={handleCardClick}
        className="w-full flex gap-3 p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition cursor-pointer"
      >
        <div className="relative w-24 h-16 rounded-lg overflow-hidden bg-white/[0.06] shrink-0">
          {article.urlToImage ? (
            <img
              src={article.urlToImage}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug line-clamp-2 font-medium">{stripHtml(article.title)}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground truncate max-w-[90px]">{article.source.name}</span>
            <VerificationBadge score={displayTrustScore(article)} debunked={article.isDebunked} />
            <TrustScoreBadge score={displayTrustScore(article)} />
          </div>
        </div>
      </article>
    );
  }



  return (
    <motion.article
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl overflow-hidden hover:bg-white/[0.08] transition-all group relative cursor-pointer"
      style={{ minHeight: '200px' }}
      onClick={handleCardClick}
    >
      {/* Source indicator dot - Green = today's data, Purple = historical */}
      <div
        className={`absolute top-2 right-2 z-20 h-2.5 w-2.5 rounded-full border border-background/50 ${
          isWithin24Hours(article._fetchedAt || article.publishedAt)
            ? 'bg-green-500 animate-[pulse-glow_2s_ease-in-out_infinite]'
            : 'bg-purple-500'
        }`}
        title={isWithin24Hours(article._fetchedAt || article.publishedAt) ? '🟢 Live (< 24h)' : '🟣 Archived'}
      />
      {article.isDebunked && (
        <div className="absolute top-3 right-8 z-10">
          <span className="debunked-badge flex items-center gap-1 text-xs">
            <XCircle className="h-3 w-3" />
            DEBUNKED
          </span>
        </div>
      )}

      {article.mediaType === 'image' && article.urlToImage && (
        <div className="relative h-52 overflow-hidden">
          <img
            src={article.urlToImage}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/placeholder.svg';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          {article.isDebunked && (
            <div className="absolute inset-0 bg-destructive/10" />
          )}
        </div>
      )}

      {(article.mediaType === 'long_video' || article.mediaType === 'short_video') && article.urlToImage && (
        <div className={`relative overflow-hidden ${article.mediaType === 'short_video' ? 'aspect-[9/16]' : 'h-52'}`}>
          <img
            src={article.urlToImage}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/placeholder.svg';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-14 w-14 rounded-full bg-primary/80 flex items-center justify-center backdrop-blur-sm">
              <Play className="h-7 w-7 text-primary-foreground ml-0.5" />
            </div>
          </div>
        </div>
      )}

      {article.mediaType === 'audio' && (
        <div className="h-32 bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center">
              <Headphones className="h-7 w-7 text-primary" />
            </div>
            <div className="flex gap-0.5">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-primary/40 rounded-full"
                  style={{ height: `${Math.random() * 24 + 8}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="p-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <MediaBadge type={article.mediaType} />
          <span className="text-[13px] text-muted-foreground">{article.source.name}</span>
          <span className="text-[13px] text-muted-foreground">•</span>
          <span className="text-[13px] text-muted-foreground">
            {formatNewsDate(article.publishedAt)}
          </span>
          <VerificationBadge score={displayTrustScore(article)} debunked={article.isDebunked} />
          <TrustScoreBadge score={displayTrustScore(article)} />
        </div>

        <h3 className={`font-heading font-semibold text-[17px] leading-snug mb-2.5 line-clamp-2 group-hover:text-primary transition-colors ${article.isDebunked ? 'text-destructive/80' : ''}`}>
          {stripHtml(article.title)}
        </h3>

        <p className="text-[14px] text-muted-foreground line-clamp-2 mb-4">
          {stripHtml(article.description)}
        </p>


        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEvidence(true)}
            className="flex-1 gap-1 text-xs"
          >
            <Search className="h-3 w-3" />
            View Evidence
          </Button>
          {onVerify && (
            <Button
              variant="outline"
              size="sm"
              onClick={onVerify}
              disabled={isVerifying}
              className="flex-1 gap-1 text-xs"
            >
              {isVerifying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Shield className="h-3 w-3" />
              )}
              Verify
            </Button>
          )}
          {onSave && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onSave}
            >
              <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-primary text-primary' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showEvidence && (
          <EvidenceDeepDive article={article} onClose={() => setShowEvidence(false)} />
        )}
      </AnimatePresence>
    </motion.article>
  );
}
