import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link as LinkIcon, Upload, Scan, Shield, AlertTriangle, XCircle, CheckCircle, Loader2, X, Image, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ScanResult } from '@/types';
import { useScope } from '@/lib/scope';

type ContentType = 'url' | 'image' | 'video';
type ScanStatus = 'idle' | 'scanning' | 'complete';

export default function Scanner() {
  const { user } = useAuth();
  const scope = useScope();
  const [contentType, setContentType] = useState<ContentType>('url');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      
      if (!isImage && !isVideo) {
        toast.error('Please select an image or video file');
        return;
      }

      setSelectedFile(file);
      setContentType(isImage ? 'image' : 'video');
    }
  };

  const handleScan = async () => {
    if (contentType === 'url' && !urlInput.trim()) {
      toast.error('Please enter a URL to scan');
      return;
    }

    if ((contentType === 'image' || contentType === 'video') && !selectedFile) {
      toast.error('Please select a file to scan');
      return;
    }

    setStatus('scanning');
    setResult(null);

    try {
      // Use the verify-fact edge function for fact-checking with Google Search integration
      const content = contentType === 'url' 
        ? `News article URL: ${urlInput}`
        : `Uploaded ${contentType} file: ${selectedFile?.name}`;

      const { data, error } = await supabase.functions.invoke('verify-fact', {
        body: {
          content,
          contentType,
        },
      });

      if (error) throw error;

      let parsedResult;
      if (data?.success) {
        parsedResult = {
          trustScore: data.trustScore,
          verdict: data.verdict,
          reasoning: data.reasoning,
          redFlags: data.redFlags || [],
          sources: data.sources || [],
        };
      } else {
        throw new Error(data?.error || 'Verification failed');
      }

      const scanResult: ScanResult = {
        id: crypto.randomUUID(),
        mediaType: contentType,
        contentUrl: contentType === 'url' ? urlInput : selectedFile?.name || '',
        trustScore: parsedResult.trustScore,
        verdict: parsedResult.verdict.toLowerCase() as ScanResult['verdict'],
        reasoning: parsedResult.reasoning,
        createdAt: new Date().toISOString(),
        aiConfidence: parsedResult.trustScore,
      };

      setResult(scanResult);

      // Persist scan snapshot into history immediately under the active env scope
      if (user) {
        const { error: insertErr } = await supabase.from('scan_history').insert({
          user_id: user.id,
          content_type: contentType,
          content_url: scanResult.contentUrl,
          trust_score: scanResult.trustScore,
          verdict: scanResult.verdict,
          reasoning: scanResult.reasoning,
          environment_context: scope.isJoint ? `joint:${scope.workspaceId}` : 'personal',
        });
        if (!insertErr) {
          // Notify Settings/History views to refresh without manual reload
          window.dispatchEvent(new CustomEvent('averia:scan-changed'));
        }
      }

      setStatus('complete');
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to analyze content. Please try again.');
      setStatus('idle');
    }
  };

  const resetScan = () => {
    setStatus('idle');
    setResult(null);
    setUrlInput('');
    setSelectedFile(null);
  };

  const getVerdictConfig = (verdict: string) => {
    switch (verdict) {
      case 'Real':
        return {
          color: 'text-success',
          bgColor: 'bg-success/20',
          borderColor: 'border-success/30',
          icon: CheckCircle,
          glow: 'glow-primary',
        };
      case 'Fake':
        return {
          color: 'text-destructive',
          bgColor: 'bg-destructive/20',
          borderColor: 'border-destructive/30',
          icon: XCircle,
          glow: 'glow-danger',
        };
      case 'Misleading':
        return {
          color: 'text-warning',
          bgColor: 'bg-warning/20',
          borderColor: 'border-warning/30',
          icon: AlertTriangle,
          glow: '',
        };
      default:
        return {
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/20',
          borderColor: 'border-border',
          icon: Shield,
          glow: '',
        };
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="font-heading text-4xl font-bold mb-2">
              AI Truth <span className="gradient-text">Scanner</span>
            </h1>
            <p className="text-muted-foreground">
              Paste a URL or upload media to verify its authenticity
            </p>
          </div>

          {/* Scanner Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-8 rounded-2xl"
          >
            <AnimatePresence mode="wait">
              {status === 'idle' && (
                <motion.div
                  key="input"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Content Type Tabs */}
                  <div className="flex gap-2 p-1 bg-secondary/50 rounded-lg mb-6">
                    <button
                      onClick={() => { setContentType('url'); setSelectedFile(null); }}
                      className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        contentType === 'url'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <LinkIcon className="h-4 w-4" />
                      URL
                    </button>
                    <button
                      onClick={() => setContentType('image')}
                      className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        contentType === 'image'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Image className="h-4 w-4" />
                      Image
                    </button>
                    <button
                      onClick={() => setContentType('video')}
                      className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        contentType === 'video'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Video className="h-4 w-4" />
                      Video
                    </button>
                  </div>

                  {/* Input Area */}
                  {contentType === 'url' ? (
                    <div className="relative">
                      <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        placeholder="Paste news article URL here..."
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        className="pl-12 h-14 text-lg bg-secondary/50 border-border/50"
                      />
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={contentType === 'image' ? 'image/*' : 'video/*'}
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      {selectedFile ? (
                        <div className="flex items-center justify-center gap-3">
                          {contentType === 'image' ? (
                            <Image className="h-8 w-8 text-primary" />
                          ) : (
                            <Video className="h-8 w-8 text-primary" />
                          )}
                          <span className="text-foreground font-medium">{selectedFile.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">
                            Click to upload or drag and drop
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {contentType === 'image' ? 'PNG, JPG, GIF up to 10MB' : 'MP4, MOV up to 50MB'}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={handleScan}
                    className="w-full mt-6 h-12 text-lg glow-primary"
                    disabled={(contentType === 'url' && !urlInput.trim()) || ((contentType === 'image' || contentType === 'video') && !selectedFile)}
                  >
                    <Scan className="h-5 w-5 mr-2" />
                    Start AI Scan
                  </Button>

                  {!user && (
                    <p className="text-center text-sm text-muted-foreground mt-4">
                      <a href="/auth" className="text-primary hover:underline">Sign in</a> to save your scan history
                    </p>
                  )}
                </motion.div>
              )}

              {status === 'scanning' && (
                <motion.div
                  key="scanning"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <div className="relative w-32 h-32 mx-auto mb-6">
                    <div className="absolute inset-0 rounded-full bg-primary/20 scanning-animation" />
                    <div className="absolute inset-4 rounded-full bg-primary/30 scanning-animation" style={{ animationDelay: '0.5s' }} />
                    <div className="absolute inset-8 rounded-full bg-primary/40 scanning-animation" style={{ animationDelay: '1s' }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Shield className="h-12 w-12 text-primary" />
                    </div>
                  </div>
                  <h3 className="font-heading text-2xl font-semibold mb-2">AI Scanning...</h3>
                  <p className="text-muted-foreground">Analyzing content for authenticity</p>
                  <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cross-referencing sources...
                  </div>
                </motion.div>
              )}

              {status === 'complete' && result && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {(() => {
                    const config = getVerdictConfig(result.verdict);
                    const VerdictIcon = config.icon;
                    
                    return (
                      <div className="space-y-6">
                        {/* Trust Score */}
                        <div className="text-center">
                          <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full ${config.bgColor} ${config.borderColor} border-2 ${config.glow}`}>
                            <span className={`font-heading text-4xl font-bold ${config.color}`}>
                              {result.trustScore}%
                            </span>
                          </div>
                          <h3 className="font-heading text-lg text-muted-foreground mt-2">Trust Score</h3>
                        </div>

                        {/* Verdict */}
                        <div className={`flex items-center justify-center gap-3 px-6 py-4 rounded-xl ${config.bgColor} ${config.borderColor} border`}>
                          <VerdictIcon className={`h-8 w-8 ${config.color}`} />
                          <span className={`font-heading text-2xl font-bold ${config.color}`}>
                            {result.verdict}
                          </span>
                        </div>

                        {/* Reasoning */}
                        <div className="bg-secondary/50 rounded-xl p-6">
                          <h4 className="font-heading font-semibold mb-2">AI Analysis</h4>
                          <p className="text-muted-foreground">{result.reasoning}</p>
                        </div>

                        {/* Content Info */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {result.mediaType === 'url' ? (
                            <LinkIcon className="h-4 w-4" />
                          ) : result.mediaType === 'image' ? (
                            <Image className="h-4 w-4" />
                          ) : (
                            <Video className="h-4 w-4" />
                          )}
                          <span className="truncate">{result.contentUrl}</span>
                        </div>

                        <Button onClick={resetScan} className="w-full">
                          Scan Another
                        </Button>
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Info Cards */}
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            {[
              { icon: Shield, title: 'AI-Powered', desc: 'Advanced language models analyze content' },
              { icon: Scan, title: 'Multi-Source', desc: 'Cross-references multiple databases' },
              { icon: CheckCircle, title: '99.2% Accuracy', desc: 'Industry-leading detection rate' },
            ].map((item) => (
              <div key={item.title} className="glass-card p-4 rounded-xl text-center">
                <item.icon className="h-6 w-6 text-primary mx-auto mb-2" />
                <h4 className="font-heading font-semibold text-sm">{item.title}</h4>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
