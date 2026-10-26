import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  AlertTriangle, 
  Search, 
  ExternalLink, 
  Clock,
  XCircle,
  Link as LinkIcon
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import type { DebunkedNews } from '@/types';

// Mock debunked news - In production, this would come from the database
const mockDebunkedNews: DebunkedNews[] = [
  {
    id: '1',
    title: 'Viral Video Claims New Vaccine Causes Immediate Side Effects',
    originalSource: 'Unknown Social Media Account',
    claim: 'A widely shared video claims that a new vaccine causes immediate, visible side effects in recipients.',
    verdict: 'FALSE',
    aiReasoning: 'The video has been digitally manipulated. Frame-by-frame analysis reveals editing artifacts. Medical experts confirm that the symptoms shown are not consistent with any known vaccine reactions. The original footage was taken from an unrelated medical training video.',
    evidenceLinks: ['https://factcheck.org/example1', 'https://snopes.com/example1'],
    category: 'Health',
    imageUrl: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=800',
    debunkedAt: new Date().toISOString()
  },
  {
    id: '2',
    title: 'Photo Shows World Leader in Secret Meeting',
    originalSource: 'Anonymous Blog',
    claim: 'An image circulating online purports to show a world leader in a secret meeting with controversial figures.',
    verdict: 'MANIPULATED',
    aiReasoning: 'AI image analysis confirms this is a deepfake composite. The lighting angles are inconsistent, shadow analysis reveals multiple light sources that contradict each other. Reverse image search shows the original photos were taken years apart at different locations.',
    evidenceLinks: ['https://factcheck.org/example2'],
    category: 'Politics',
    imageUrl: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800',
    debunkedAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: '3',
    title: 'Breaking: Major Tech Company to File Bankruptcy',
    originalSource: 'Fake News Site',
    claim: 'Reports claim a major technology company is about to file for bankruptcy due to mounting losses.',
    verdict: 'FALSE',
    aiReasoning: 'No credible financial news outlets have reported this claim. The company\'s latest SEC filings show strong financial performance. The source website has a history of publishing false financial news. Stock market analysis shows no unusual trading activity that would indicate insider knowledge.',
    evidenceLinks: ['https://sec.gov/example', 'https://reuters.com/example'],
    category: 'Business',
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800',
    debunkedAt: new Date(Date.now() - 172800000).toISOString()
  },
  {
    id: '4',
    title: 'AI-Generated Audio of Celebrity Making Controversial Statement',
    originalSource: 'Twitter/X Account',
    claim: 'An audio clip allegedly shows a celebrity making inflammatory political statements.',
    verdict: 'AI GENERATED',
    aiReasoning: 'Spectral analysis reveals patterns consistent with AI voice synthesis. The audio contains unnatural pauses and cadence patterns. The celebrity\'s representatives have denied the statement. Audio forensics team confirmed synthesis artifacts in multiple frequency ranges.',
    evidenceLinks: ['https://factcheck.org/example4'],
    category: 'Entertainment',
    imageUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800',
    debunkedAt: new Date(Date.now() - 259200000).toISOString()
  }
];

export default function Debunked() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debunkedNews, setDebunkedNews] = useState<DebunkedNews[]>(mockDebunkedNews);

  const filteredNews = debunkedNews.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.claim.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getVerdictStyle = (verdict: string) => {
    switch (verdict.toUpperCase()) {
      case 'FALSE':
        return 'bg-destructive text-destructive-foreground';
      case 'MANIPULATED':
        return 'bg-warning text-warning-foreground';
      case 'AI GENERATED':
        return 'bg-primary text-primary-foreground';
      case 'MISLEADING':
        return 'bg-warning text-warning-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-4">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium">Fake News Repository</span>
          </div>
          <h1 className="font-heading text-4xl md:text-5xl font-bold mb-4">
            <span className="text-destructive">Debunked</span> Misinformation
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Archive of verified fake news, manipulated media, and AI-generated content with detailed analysis.
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 rounded-xl mb-8 max-w-2xl mx-auto"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search debunked claims..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border"
            />
          </div>
        </motion.div>

        {/* Debunked Items */}
        <div className="space-y-6 max-w-4xl mx-auto">
          {filteredNews.map((item, index) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-card rounded-xl overflow-hidden"
            >
              <div className="md:flex">
                {item.imageUrl && (
                  <div className="md:w-64 h-48 md:h-auto relative">
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-destructive/20" />
                    <div className="absolute top-3 left-3">
                      <span className="debunked-badge flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        DEBUNKED
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex-1 p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getVerdictStyle(item.verdict)}`}>
                      {item.verdict}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(item.debunkedAt)}
                    </span>
                    {item.category && (
                      <span className="text-xs text-muted-foreground">
                        {item.category}
                      </span>
                    )}
                  </div>
                  
                  <h2 className="font-heading text-xl font-semibold mb-2 text-destructive/90">
                    {item.title}
                  </h2>
                  
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-1">Original Claim:</p>
                    <p className="text-sm italic border-l-2 border-destructive/50 pl-3 text-foreground/80">
                      "{item.claim}"
                    </p>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      AI Analysis:
                    </p>
                    <p className="text-sm text-foreground/90">
                      {item.aiReasoning}
                    </p>
                  </div>

                  {item.evidenceLinks && item.evidenceLinks.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {item.evidenceLinks.map((link, i) => (
                        <Button
                          key={i}
                          asChild
                          variant="outline"
                          size="sm"
                          className="text-xs"
                        >
                          <span className="inline-flex items-center cursor-pointer" onClick={() => { navigator.clipboard.writeText(link); }}>
                            <LinkIcon className="h-3 w-3 mr-1" />
                            Evidence {i + 1}
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}

                  {item.originalSource && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Original Source: {item.originalSource}
                    </p>
                  )}
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        {filteredNews.length === 0 && (
          <div className="text-center py-16">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-heading text-xl font-semibold mb-2">No debunked items found</h3>
            <p className="text-muted-foreground">Try adjusting your search</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
