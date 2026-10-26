import { useState } from 'react';
import { Film, Image as ImageIcon, FileText, Headphones, Link as LinkIcon, Smartphone, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const KINDS = [
  { id: 'long_video', label: 'Long Video', icon: Film },
  { id: 'short_video', label: 'Reel', icon: Smartphone },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'text', label: 'Text', icon: FileText },
  { id: 'audio', label: 'Audio', icon: Headphones },
  { id: 'url', label: 'Link', icon: LinkIcon },
];

interface CreateNewsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateNewsModal({ open, onOpenChange }: CreateNewsModalProps) {
  const [kind, setKind] = useState('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [source, setSource] = useState('');

  const submit = () => {
    if (!title.trim()) {
      toast.error('Add a headline first');
      return;
    }
    toast.success('Submitted for Averia verification');
    setTitle('');
    setBody('');
    setSource('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create news</DialogTitle>
          <DialogDescription>Publish a story to the Averia feed. It runs through verification before it goes live.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[13px] font-medium transition ${
                kind === k.id ? 'bg-foreground text-background' : 'bg-white/[0.06] text-muted-foreground hover:text-foreground'
              }`}
            >
              <k.icon className="h-3.5 w-3.5" />
              {k.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 pt-1">
          <Input placeholder="Headline" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Write the story or paste the claim…" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          <Input placeholder="Source URL (optional)" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} className="gap-2">
            <Upload className="h-4 w-4" />
            Publish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
