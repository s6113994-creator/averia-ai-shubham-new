import { useState, useEffect } from 'react';
import { Youtube, Film, Image, Users } from 'lucide-react';
import { AveriaLogo } from '@/components/AveriaLogo';

export type FeedTab = 'videos' | 'reels' | 'images' | 'community' | 'ai_chat';

interface FeedSwitcherBarProps {
  active: FeedTab;
  onChange: (tab: FeedTab) => void;
}

const tabs: { id: FeedTab; label: string; icon: React.ReactNode }[] = [
  { id: 'videos', label: 'Videos', icon: <Youtube className="h-5 w-5" /> },
  { id: 'reels', label: 'Reels', icon: <Film className="h-5 w-5" /> },
  { id: 'images', label: 'Images', icon: <Image className="h-5 w-5" /> },
  { id: 'community', label: 'Community', icon: <Users className="h-5 w-5" /> },
  { id: 'ai_chat', label: 'AI Chat', icon: <AveriaLogo size="xs" style={{ filter: 'none', borderRadius: 0 }} /> },
];

export function FeedSwitcherBar({ active, onChange }: FeedSwitcherBarProps) {
  const [pulse, setPulse] = useState(false);

  // Pulse AI Chat icon every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 1500);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div data-bottom-nav className="absolute bottom-0 left-0 right-0 z-[60] flex items-center justify-around border-t border-border/30 bg-background/90 backdrop-blur-md px-1 py-1.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
            active === tab.id
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          } ${tab.id === 'ai_chat' && pulse ? 'animate-pulse' : ''}`}
        >
          {tab.icon}
          <span className="text-[10px] font-medium">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
