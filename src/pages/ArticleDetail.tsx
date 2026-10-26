import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, ExternalLink, Bookmark, Share2, Loader2, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout/Layout';
import { VerifiedBadge } from '@/components/news/VerifiedBadge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MediaNewsArticle } from '@/types/news-media';
import { formatNewsDate } from '@/lib/date';

export default function ArticleDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const article = location.state?.article as MediaNewsArticle | undefined;
  const [expanded, setExpanded] = useState(false);
  const [trustScore, setTrustScore] = useState<number | null>(
    location.state?.trustScore ?? null
  );
  const [verifying, setVerifying] = useState(false);
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (!article) {
      navigate('/news');
      return;
    }
    // Generate AI summary on mount
    generateSummary();
  }, []);

  const generateSummary = async () => {
    if (!article) return;
    setLoadingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-fact', {
        body: {
          content: `Summarize this news article in 4-5 bullet points:\n\nTitle: ${article.title}\n\nDescription: ${article.description}\n\nContent: ${article.content || article.description}`,
          contentType: 'summary',
        },
      });

      if (data?.success && data?.reasoning) {
        // Parse reasoning into bullet points
        const points = data.reasoning
          .split(/[.!?]\s+/)
          .filter((s: string) => s.trim().length > 15)
          .slice(0, 5)
          .map((s: string) => s.trim() + '.');
        setAiSummary(points.length > 0 ? points : [data.reasoning]);
        if (data.trustScore) setTrustScore(data.trustScore);
      } else {
        // Fallback summary from description
        setAiSummary(article.description ? [article.description] : ['No summary available.']);
      }
    } catch {
      setAiSummary(article?.description ? [article.description] : ['Summary unavailable.']);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleVerify = async () => {
    if (!article) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-fact', {
        body: {
          content: `${article.title}\n\n${article.description}`,
          contentType: 'news',
        },
      });
      if (data?.success) {
        setTrustScore(data.trustScore);
        toast.success(`${data.verdict}: ${data.trustScore}% trust score`);
      }
    } catch {
      toast.error('Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  if (!article) return null;

  const isVideo = article.mediaType === 'long_video' || article.mediaType === 'short_video';
  const ytId = (article as any).videoId || article.url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Back button */}
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to News
        </Button>

        {/* Video / Image Hero */}
        {isVideo && ytId ? (
          <div className="aspect-video rounded-xl overflow-hidden mb-6 bg-secondary">
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`}
              className="w-full h-full"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={article.title}
            />
          </div>
        ) : article.urlToImage ? (
          <div className="relative rounded-xl overflow-hidden mb-6 max-h-[400px]">
            <img
              src={article.urlToImage}
              alt={article.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
            />
          </div>
        ) : null}

        {/* Trust Score Badge */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <VerifiedBadge />
          {trustScore !== null && (
            <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-bold rounded-full border ${
              trustScore >= 70 ? 'bg-green-500/20 text-green-400 border-green-500/30' :
              trustScore >= 40 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
              'bg-destructive/20 text-destructive border-destructive/30'
            }`}>
              <Shield className="h-3.5 w-3.5" />
              Trust: {trustScore}%
            </span>
          )}
          {trustScore === null && (
            <Button variant="outline" size="sm" onClick={handleVerify} disabled={verifying} className="gap-1">
              {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
              Verify
            </Button>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3 flex-wrap">
          <span className="font-medium text-primary">{article.source.name}</span>
          <span>•</span>
          <span>{formatNewsDate(article.publishedAt)}</span>
          {article.author && (
            <>
              <span>•</span>
              <span>By {article.author}</span>
            </>
          )}
        </div>

        {/* Title */}
        <h1 className="font-heading text-2xl md:text-3xl font-bold mb-4">{article.title}</h1>

        {/* AI Summary */}
        <div className="glass-card rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            AI Summary by Averia
          </h3>
          {loadingSummary ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating summary...
            </div>
          ) : (
            <ul className="space-y-2">
              {aiSummary.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Full Content */}
        <div className="prose prose-invert max-w-none">
          <p className="text-foreground/80 leading-relaxed">
            {article.description}
          </p>

          {!expanded && article.content && (
            <Button
              variant="outline"
              onClick={() => setExpanded(true)}
              className="mt-4 gap-2"
            >
              <ChevronDown className="h-4 w-4" />
              Read Full Article
            </Button>
          )}

          {expanded && article.content && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4"
            >
              <p className="text-foreground/80 leading-relaxed whitespace-pre-line">
                {article.content.replace(/\[\+\d+ chars\]/, '')}
              </p>
            </motion.div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-8 pt-6 border-t border-border/30">
          <Button variant="outline" className="gap-2" onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            toast.success('Link copied!');
          }}>
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => {
            navigator.clipboard.writeText(article.url);
            toast.success('Source URL copied!');
          }}>
            <ExternalLink className="h-4 w-4" />
            Copy Source
          </Button>
        </div>
      </div>
    </Layout>
  );
}
