export type MediaType = 'long_video' | 'short_video' | 'image' | 'text' | 'audio' | 'url';

export interface MediaNewsArticle {
  id: string;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  content: string | null;
  category?: string;
  tier?: 'top' | 'trending' | 'latest';
  mediaType: MediaType;
  videoId?: string;
  videoUrl?: string;
  audioUrl?: string;
  isDebunked?: boolean;
  verdict?: 'real' | 'fake' | 'misleading' | 'debunked';
  /** 'live' = freshly fetched from API, 'archived' = loaded from database */
  _source?: 'live' | 'archived';
  /** Date the article was fetched/cached - used for green/purple dot rotation */
  _fetchedAt?: string;
}

export interface NewsSubsection {
  id: string;
  label: string;
  icon: string;
  mediaType: MediaType;
  isDebunked: boolean;
}

export const REAL_NEWS_SECTIONS: NewsSubsection[] = [
  { id: 'real-long-video', label: 'Long Video', icon: 'Film', mediaType: 'long_video', isDebunked: false },
  { id: 'real-short-video', label: 'Reels', icon: 'Smartphone', mediaType: 'short_video', isDebunked: false },
  { id: 'real-image', label: 'Image News', icon: 'Image', mediaType: 'image', isDebunked: false },
  { id: 'real-text', label: 'Text News', icon: 'FileText', mediaType: 'text', isDebunked: false },
  { id: 'real-audio', label: 'Audio', icon: 'Headphones', mediaType: 'audio', isDebunked: false },
  { id: 'real-url', label: 'URL Sources', icon: 'Link', mediaType: 'url', isDebunked: false },
];

export const DEBUNKED_SECTIONS: NewsSubsection[] = [
  { id: 'debunked-long-video', label: 'Long Video', icon: 'Film', mediaType: 'long_video', isDebunked: true },
  { id: 'debunked-short-video', label: 'Reels', icon: 'Smartphone', mediaType: 'short_video', isDebunked: true },
  { id: 'debunked-image', label: 'Image News', icon: 'Image', mediaType: 'image', isDebunked: true },
  { id: 'debunked-text', label: 'Text News', icon: 'FileText', mediaType: 'text', isDebunked: true },
  { id: 'debunked-audio', label: 'Audio', icon: 'Headphones', mediaType: 'audio', isDebunked: true },
  { id: 'debunked-url', label: 'URL Sources', icon: 'Link', mediaType: 'url', isDebunked: true },
];

// Classify articles into media types based on content analysis
export function classifyMediaType(article: {
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  content: string | null;
}): MediaType {
  const url = article.url.toLowerCase();
  const title = article.title.toLowerCase();
  const desc = (article.description || '').toLowerCase();

  // Video detection
  if (
    url.includes('youtube.com') || url.includes('youtu.be') ||
    url.includes('vimeo.com') || url.includes('dailymotion.com') ||
    title.includes('watch:') || title.includes('[video]') ||
    desc.includes('video')
  ) {
    if (url.includes('shorts') || url.includes('/reel') || desc.includes('reel') || desc.includes('shorts')) {
      return 'short_video';
    }
    return 'long_video';
  }

  // Audio detection - broadened
  if (
    url.includes('podcast') || url.includes('spotify.com') ||
    url.includes('anchor.fm') || url.includes('soundcloud') ||
    url.includes('apple.com/podcast') || url.includes('audible') ||
    title.includes('podcast') || title.includes('episode') ||
    title.includes('[audio]') || title.includes('listen') ||
    desc.includes('podcast') || desc.includes('listen') ||
    desc.includes('episode') || desc.includes('audio') ||
    desc.includes('interview') || desc.includes('conversation')
  ) {
    return 'audio';
  }

  // Image-heavy detection
  if (
    title.includes('photos') || title.includes('gallery') ||
    title.includes('pictures') || title.includes('in pics') ||
    title.includes('[photos]') || desc.includes('photo gallery')
  ) {
    return 'image';
  }

  // URL/link aggregation - broadened
  if (
    url.includes('reddit.com') || url.includes('hackernews') ||
    url.includes('medium.com') || url.includes('substack.com') ||
    url.includes('github.com') || url.includes('dev.to') ||
    title.includes('roundup') || title.includes('links') ||
    title.includes('resources') || title.includes('source') ||
    desc.includes('curated') || desc.includes('compilation') ||
    desc.includes('list of') || desc.includes('round-up')
  ) {
    return 'url';
  }

  // Default: distribute across image, text, audio, url using hash
  if (article.urlToImage) {
    const hash = article.title.length % 7;
    if (hash === 0) return 'image';
    if (hash === 1) return 'audio';
    if (hash === 2) return 'url';
    return 'text';
  }

  // No image: distribute between text, audio, url
  const hash = article.title.length % 5;
  if (hash === 0) return 'audio';
  if (hash === 1) return 'url';
  return 'text';
}
