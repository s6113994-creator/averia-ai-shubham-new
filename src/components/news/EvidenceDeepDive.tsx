import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Shield, CheckCircle, XCircle, AlertTriangle, ExternalLink, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MediaNewsArticle } from '@/types/news-media';

interface EvidenceResult {
  sourceTrace: {
    origin: string;
    firstReported: string;
    propagationPath: string;
  };
  crossVerification: Array<{
    source: string;
    stance: string;
    summary: string;
  }>;
  aiVerdict: {
    classification: string;
    confidence: number;
    reasoning: string;
  };
}

interface EvidenceDeepDiveProps {
  article: MediaNewsArticle;
  onClose: () => void;
}

export function EvidenceDeepDive({ article, onClose }: EvidenceDeepDiveProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvidenceResult | null>(null);
  const [progress, setProgress] = useState(0);

  const analyze = async () => {
    setLoading(true);
    setProgress(0);

    // Animate progress bar
    const interval = setInterval(() => {
      setProgress(prev => Math.min(prev + Math.random() * 15, 90));
    }, 400);

    try {
      const { data, error } = await supabase.functions.invoke('evidence-dive', {
        body: {
          title: article.title,
          description: article.description,
          source: article.source.name,
          url: article.url,
        },
      });

      if (error) throw error;
      if (data?.success) {
        setProgress(100);
        setTimeout(() => setResult(data), 300);
      } else {
        toast.error(data?.error || 'Analysis failed');
      }
    } catch (e) {
      toast.error('Failed to analyze. Please try again.');
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const stanceIcon = (stance: string) => {
    if (stance === 'confirms') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (stance === 'debunks') return <XCircle className="h-4 w-4 text-destructive" />;
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  };

  const verdictColor = (classification: string) => {
    if (classification === 'Real') return 'text-green-500';
    if (classification === 'Fake') return 'text-destructive';
    return 'text-yellow-500';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-lg glass-card rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="font-heading font-bold text-lg">Averia Evidence Deep Dive</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{article.title}</p>

        {!result && !loading && (
          <Button onClick={analyze} className="w-full gap-2">
            <Search className="h-4 w-4" />
            Start Evidence Analysis
          </Button>
        )}

        {loading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Averia Intelligence is verifying...
            </div>
            <Progress value={progress} className="h-2" />
            <div className="text-xs text-muted-foreground text-right">{Math.round(progress)}%</div>
          </div>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Source Trace */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-primary" />
                  Source Trace
                </h3>
                <div className="glass-card rounded-lg p-3 space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Origin:</span> {result.sourceTrace.origin}</p>
                  <p><span className="text-muted-foreground">First Reported:</span> {result.sourceTrace.firstReported}</p>
                  <p><span className="text-muted-foreground">Spread:</span> {result.sourceTrace.propagationPath}</p>
                </div>
              </div>

              {/* Cross Verification */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Cross-Verification
                </h3>
                <div className="space-y-2">
                  {result.crossVerification.map((cv, i) => (
                    <div key={i} className="glass-card rounded-lg p-3 flex items-start gap-3">
                      {stanceIcon(cv.stance)}
                      <div className="text-sm">
                        <p className="font-medium">{cv.source}</p>
                        <p className="text-muted-foreground">{cv.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Verdict */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  AI Verdict
                </h3>
                <div className="glass-card rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-heading font-bold text-xl ${verdictColor(result.aiVerdict.classification)}`}>
                      {result.aiVerdict.classification}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {result.aiVerdict.confidence}% confidence
                    </span>
                  </div>
                  <Progress value={result.aiVerdict.confidence} className="h-1.5 mb-3" />
                  <p className="text-sm text-muted-foreground">{result.aiVerdict.reasoning}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
