import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Newspaper, Shield, Users, FileText, TrendingUp, Film, Smartphone, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { searchFullArchive } from '@/lib/youtube-client';
import type { MediaNewsArticle } from '@/types/news-media';

interface SearchResult {
  id: string;
  title: string;
  description: string;
  category: 'news' | 'scanner' | 'community' | 'debunked' | 'page' | 'video' | 'reel' | 'article';
  url: string;
  imageUrl?: string | null;
}

const staticPages: SearchResult[] = [
  { id: 'news', title: 'Real News', description: 'Browse verified global news', category: 'page', url: '/news' },
  { id: 'scanner', title: 'AI Scanner', description: 'Verify content authenticity', category: 'page', url: '/scanner' },
  { id: 'detector', title: 'Deepfake Detector', description: 'Detect AI-generated media', category: 'page', url: '/detector' },
  { id: 'community', title: 'Community', description: 'Explore reels and stories', category: 'page', url: '/social' },
  { id: 'debunked', title: 'Debunked', description: 'View fact-checked misinformation', category: 'page', url: '/debunked' },
  { id: 'pricing', title: 'Pricing', description: 'Upgrade to Pro', category: 'page', url: '/pricing' },
  { id: 'dashboard', title: 'Dashboard', description: 'Manage your profile and history', category: 'page', url: '/dashboard' },
];

function mapArticleToResult(article: MediaNewsArticle): SearchResult {
  const category = article.mediaType === 'long_video' ? 'video'
    : article.mediaType === 'short_video' ? 'reel'
    : 'article';

  return {
    id: article.id,
    title: article.title,
    description: article.description || article.source?.name || '',
    category,
    url: article.url,
    imageUrl: article.urlToImage,
  };
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [archiveResults, setArchiveResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Search static pages
  useEffect(() => {
    if (query.trim()) {
      const filtered = staticPages.filter(
        (page) =>
          page.title.toLowerCase().includes(query.toLowerCase()) ||
          page.description.toLowerCase().includes(query.toLowerCase())
      );
      setResults(filtered);
    } else {
      setResults([]);
      setArchiveResults([]);
    }
  }, [query]);

  // Search archive (debounced)
  useEffect(() => {
    if (!query.trim() || query.trim().length < 3) {
      setArchiveResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const articles = await searchFullArchive(query.trim(), 20);
        setArchiveResults(articles.map(mapArticleToResult));
      } catch {
        setArchiveResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
    if (result.url.startsWith('http')) {
      navigate(`/article?url=${encodeURIComponent(result.url)}&title=${encodeURIComponent(result.title || '')}`);
    } else {
      navigate(result.url);
    }
    setIsOpen(false);
    setQuery('');
  }, [navigate]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'news': return <Newspaper className="h-4 w-4" />;
      case 'scanner': return <Shield className="h-4 w-4" />;
      case 'community': return <Users className="h-4 w-4" />;
      case 'debunked': return <FileText className="h-4 w-4" />;
      case 'video': return <Film className="h-4 w-4" />;
      case 'reel': return <Smartphone className="h-4 w-4" />;
      case 'article': return <Newspaper className="h-4 w-4" />;
      default: return <TrendingUp className="h-4 w-4" />;
    }
  };

  const allResults = [...results, ...archiveResults];

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors text-sm"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="fixed left-1/2 top-20 -translate-x-1/2 w-full max-w-lg z-50"
            >
              <div className="glass-card rounded-xl shadow-2xl overflow-hidden border border-border">
                <div className="flex items-center gap-3 p-4 border-b border-border">
                  <Search className="h-5 w-5 text-muted-foreground" />
                  <Input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search news, videos, archive..."
                    className="flex-1 bg-transparent border-0 focus-visible:ring-0 text-lg"
                  />
                  {searching && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {query && !searching && (
                    <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto p-2">
                  {allResults.length > 0 ? (
                    <div className="space-y-1">
                      {results.length > 0 && (
                        <p className="text-xs text-muted-foreground px-3 py-1.5">Pages</p>
                      )}
                      {results.map((result) => (
                        <button
                          key={result.id}
                          onClick={() => handleSelect(result)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 text-left transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            {getCategoryIcon(result.category)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{result.title}</p>
                            <p className="text-sm text-muted-foreground truncate">{result.description}</p>
                          </div>
                        </button>
                      ))}

                      {archiveResults.length > 0 && (
                        <>
                          <p className="text-xs text-muted-foreground px-3 py-1.5 mt-2">Archive Results</p>
                          {archiveResults.map((result) => (
                            <button
                              key={result.id}
                              onClick={() => handleSelect(result)}
                              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 text-left transition-colors"
                            >
                              {result.imageUrl ? (
                                <img src={result.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                  {getCategoryIcon(result.category)}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{result.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                              </div>
                              <span className="text-[10px] text-muted-foreground capitalize shrink-0">
                                {result.category}
                              </span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  ) : query ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {searching ? (
                        <p>Searching archive...</p>
                      ) : (
                        <p>No results for &ldquo;{query}&rdquo;</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground px-3 py-2">Quick Links</p>
                      {staticPages.slice(0, 5).map((page) => (
                        <button
                          key={page.id}
                          onClick={() => handleSelect(page)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 text-left transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            {getCategoryIcon(page.category)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{page.title}</p>
                            <p className="text-sm text-muted-foreground truncate">{page.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>↑↓ to navigate</span>
                  <span>↵ to select</span>
                  <span>esc to close</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
