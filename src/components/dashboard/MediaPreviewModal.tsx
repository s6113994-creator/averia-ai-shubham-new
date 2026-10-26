import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: 'photo' | 'video' | null;
  url: string | null;
  title?: string | null;
  caption?: string | null;
}

export function MediaPreviewModal({ open, onOpenChange, kind, url, title, caption }: Props) {
  if (!url || !kind) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-black/95 border-primary/20 p-0 overflow-hidden">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="w-full max-h-[85vh] flex items-center justify-center bg-black">
          {kind === 'photo' ? (
            <img src={url} alt={title || ''} className="w-full h-auto max-h-[85vh] object-contain" />
          ) : (
            <video src={url} controls autoPlay className="w-full h-auto max-h-[85vh] object-contain" />
          )}
        </div>
        {(title || caption) && (
          <div className="p-4 bg-background/95">
            {title && <h3 className="font-heading font-bold text-base mb-1">{title}</h3>}
            {caption && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{caption}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
