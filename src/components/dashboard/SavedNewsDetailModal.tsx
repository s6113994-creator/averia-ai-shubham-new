import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Calendar, Tag, Newspaper } from 'lucide-react';

interface SavedItem {
  id: string;
  title: string;
  description: string | null;
  url: string;
  image_url: string | null;
  source: string | null;
  category: string | null;
  published_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: SavedItem | null;
}

function detectKind(url: string): 'youtube' | 'video' | 'audio' | 'image' | 'link' {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return 'video';
  if (/\.(mp3|wav|m4a|ogg)(\?|$)/i.test(url)) return 'audio';
  if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url)) return 'image';
  return 'link';
}

function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

export function SavedNewsDetailModal({ open, onOpenChange, item }: Props) {
  if (!item) return null;
  const kind = detectKind(item.url);
  const yt = kind === 'youtube' ? youtubeEmbed(item.url) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-primary/20">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl pr-8">{item.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {item.source && (
              <span className="flex items-center gap-1"><Newspaper className="h-3 w-3" /> {item.source}</span>
            )}
            {item.category && (
              <span className="flex items-center gap-1 capitalize"><Tag className="h-3 w-3" /> {item.category}</span>
            )}
            {item.published_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {new Date(item.published_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Native player */}
          <div className="rounded-xl overflow-hidden border border-border/40 bg-black">
            {yt && (
              <div className="aspect-video">
                <iframe src={yt} className="w-full h-full" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" />
              </div>
            )}
            {!yt && kind === 'video' && (
              <video src={item.url} controls className="w-full max-h-[60vh]" />
            )}
            {!yt && kind === 'audio' && (
              <div className="p-6 bg-secondary/30">
                <audio src={item.url} controls className="w-full" />
              </div>
            )}
            {!yt && (kind === 'image' || (kind === 'link' && item.image_url)) && (
              <img src={kind === 'image' ? item.url : (item.image_url as string)} alt={item.title} className="w-full max-h-[60vh] object-contain" />
            )}
            {!yt && kind === 'link' && !item.image_url && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                External link — preview only available inside Averia.
              </div>
            )}
          </div>

          {item.description && (
            <div className="rounded-xl bg-secondary/20 border border-border/30 p-4">
              <h4 className="font-heading font-semibold text-sm mb-2">Analysis & Summary</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{item.description}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-[11px] text-muted-foreground truncate flex-1">{item.url}</p>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(item.url); }}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Copy link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
