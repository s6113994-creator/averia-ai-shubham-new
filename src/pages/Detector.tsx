import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Upload, 
  Link as LinkIcon, 
  Image, 
  Video, 
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Brain,
} from 'lucide-react';
import { AveriaLogo } from '@/components/AveriaLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface VerificationResult {
  trustScore: number;
  verdict: 'real' | 'fake' | 'misleading' | 'ai_generated' | 'manipulated';
  reasoning: string;
  confidence: number;
  indicators: string[];
}

export default function Detector() {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
    }
  };

  const analyzeContent = async (type: 'url' | 'image' | 'video') => {
    if (!user) {
      toast.error('Please sign in to use the detector');
      return;
    }

    if (type === 'url' && !url) {
      toast.error('Please enter a URL to analyze');
      return;
    }

    if ((type === 'image' || type === 'video') && !selectedFile) {
      toast.error('Please select a file to analyze');
      return;
    }

    setIsAnalyzing(true);
    setResult(null);

    try {
      // Simulate AI analysis with realistic delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Mock result - In production, this would call the Averia AI edge function
      const mockResults: VerificationResult[] = [
        {
          trustScore: 87,
          verdict: 'real',
          reasoning: 'The content appears to be from a verified source with consistent metadata. Cross-referencing with multiple trusted news outlets confirms the information accuracy. No signs of manipulation detected in the media.',
          confidence: 0.92,
          indicators: ['Verified source', 'Consistent metadata', 'No manipulation detected']
        },
        {
          trustScore: 23,
          verdict: 'fake',
          reasoning: 'Multiple red flags detected: The source is not credible, factual inconsistencies found, and the image shows signs of digital manipulation. This content has been flagged by multiple fact-checking organizations.',
          confidence: 0.88,
          indicators: ['Unverified source', 'Factual errors', 'Image manipulation detected', 'Previously debunked']
        },
        {
          trustScore: 45,
          verdict: 'misleading',
          reasoning: 'While the core facts are accurate, the presentation is misleading. Key context is omitted, and the headline does not accurately represent the content. This appears to be designed to provoke emotional reactions.',
          confidence: 0.79,
          indicators: ['Missing context', 'Misleading headline', 'Emotional manipulation']
        },
        {
          trustScore: 15,
          verdict: 'ai_generated',
          reasoning: 'Advanced analysis indicates this content was generated using AI. Artifacts consistent with generative models detected. The image/video contains telltale signs of synthetic generation.',
          confidence: 0.94,
          indicators: ['AI generation artifacts', 'Synthetic patterns', 'Metadata anomalies']
        }
      ];

      const randomResult = mockResults[Math.floor(Math.random() * mockResults.length)];
      setResult(randomResult);

      // Save to scan history
      if (user) {
        await supabase.from('scan_history').insert({
          user_id: user.id,
          content_type: type,
          content_url: type === 'url' ? url : 'uploaded_file',
          trust_score: randomResult.trustScore,
          verdict: randomResult.verdict,
          reasoning: randomResult.reasoning
        });
      }

      toast.success('Analysis complete!');
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'real':
        return 'text-success';
      case 'fake':
        return 'text-destructive';
      case 'misleading':
        return 'text-warning';
      case 'ai_generated':
      case 'manipulated':
        return 'text-primary';
      default:
        return 'text-muted-foreground';
    }
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'real':
        return <CheckCircle className="h-6 w-6 text-success" />;
      case 'fake':
        return <XCircle className="h-6 w-6 text-destructive" />;
      case 'misleading':
        return <AlertTriangle className="h-6 w-6 text-warning" />;
      case 'ai_generated':
      case 'manipulated':
        return <Brain className="h-6 w-6 text-primary" />;
      default:
        return null;
    }
  };

  const getTrustMeterRotation = (score: number) => {
    return (score / 100) * 180 - 90;
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-4">
              <AveriaLogo size="xs" style={{ filter: 'none', borderRadius: 0 }} />
              <span className="text-sm font-medium">Universal Detector</span>
            </div>
            <h1 className="font-heading text-4xl md:text-5xl font-bold mb-4">
              <span className="gradient-text">Verification</span> Zone
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Detect AI-generated content, deepfakes, and misinformation with our advanced Averia AI analysis.
            </p>
          </div>

          {/* Input Section */}
          <div className="glass-card p-8 rounded-2xl mb-8">
            <Tabs defaultValue="url" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="url" className="gap-2">
                  <LinkIcon className="h-4 w-4" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="image" className="gap-2">
                  <Image className="h-4 w-4" />
                  Image
                </TabsTrigger>
                <TabsTrigger value="video" className="gap-2">
                  <Video className="h-4 w-4" />
                  Video
                </TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-4">
                <div className="flex gap-3">
                  <Input
                    type="url"
                    placeholder="Paste news article or content URL..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="bg-secondary/50 border-border flex-1"
                  />
                  <Button 
                    onClick={() => analyzeContent('url')} 
                    disabled={isAnalyzing || !url}
                    className="glow-primary"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <AveriaLogo size="xs" className="mr-2" style={{ filter: 'none', borderRadius: 0 }} />
                        Analyze
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="image" className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="image-upload"
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer flex flex-col items-center gap-3"
                  >
                    {previewUrl && selectedFile?.type.startsWith('image/') ? (
                      <img src={previewUrl} alt="Preview" className="max-h-48 rounded-lg" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Upload className="h-8 w-8 text-primary" />
                      </div>
                    )}
                    <p className="text-muted-foreground">
                      Click to upload or drag and drop an image
                    </p>
                  </label>
                </div>
                <Button 
                  onClick={() => analyzeContent('image')} 
                  disabled={isAnalyzing || !selectedFile}
                  className="w-full glow-primary"
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <AveriaLogo size="xs" className="mr-2" style={{ filter: 'none', borderRadius: 0 }} />
                  )}
                  Analyze Image
                </Button>
              </TabsContent>

              <TabsContent value="video" className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="video-upload"
                  />
                  <label
                    htmlFor="video-upload"
                    className="cursor-pointer flex flex-col items-center gap-3"
                  >
                    {previewUrl && selectedFile?.type.startsWith('video/') ? (
                      <video src={previewUrl} className="max-h-48 rounded-lg" controls />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Upload className="h-8 w-8 text-primary" />
                      </div>
                    )}
                    <p className="text-muted-foreground">
                      Click to upload or drag and drop a video
                    </p>
                  </label>
                </div>
                <Button 
                  onClick={() => analyzeContent('video')} 
                  disabled={isAnalyzing || !selectedFile}
                  className="w-full glow-primary"
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <AveriaLogo size="xs" className="mr-2" style={{ filter: 'none', borderRadius: 0 }} />
                  )}
                  Analyze Video
                </Button>
              </TabsContent>
            </Tabs>
          </div>

          {/* Analyzing Animation */}
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card p-12 rounded-2xl text-center mb-8"
            >
              <div className="relative w-32 h-32 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
                <div className="absolute inset-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Brain className="h-12 w-12 text-primary pulse-glow" />
                </div>
              </div>
              <h3 className="font-heading text-xl font-semibold mb-2">AI Scanning...</h3>
              <p className="text-muted-foreground">Analyzing content for authenticity and manipulation</p>
            </motion.div>
          )}

          {/* Results */}
          {result && !isAnalyzing && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-8 rounded-2xl"
            >
              <div className="grid md:grid-cols-2 gap-8">
                {/* Trust Meter */}
                <div className="text-center">
                  <h3 className="font-heading text-lg font-semibold mb-4">Truth Meter</h3>
                  <div className="relative w-48 h-24 mx-auto mb-4 overflow-hidden">
                    <div className="absolute inset-0 truth-meter rounded-t-full" style={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 0, 0 0)' }} />
                    <div className="absolute bottom-0 left-1/2 w-2 h-20 bg-foreground origin-bottom rounded-full" 
                         style={{ transform: `translateX(-50%) rotate(${getTrustMeterRotation(result.trustScore)}deg)` }} />
                    <div className="absolute bottom-0 left-1/2 w-8 h-8 bg-card rounded-full border-4 border-foreground -translate-x-1/2 translate-y-1/2" />
                  </div>
                  <div className="text-5xl font-heading font-bold gradient-text">
                    {result.trustScore}%
                  </div>
                  <p className="text-muted-foreground text-sm mt-1">Trust Score</p>
                </div>

                {/* Verdict */}
                <div>
                  <h3 className="font-heading text-lg font-semibold mb-4">Verdict</h3>
                  <div className={`flex items-center gap-3 mb-4 ${getVerdictColor(result.verdict)}`}>
                    {getVerdictIcon(result.verdict)}
                    <span className="text-2xl font-heading font-bold capitalize">
                      {result.verdict.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-muted-foreground mb-4">{result.reasoning}</p>
                  
                  {/* Indicators */}
                  <div className="flex flex-wrap gap-2">
                    {result.indicators.map((indicator, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-secondary/50 rounded-full text-sm border border-border"
                      >
                        {indicator}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      AI Confidence: <span className="text-foreground font-medium">{(result.confidence * 100).toFixed(1)}%</span>
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </Layout>
  );
}
