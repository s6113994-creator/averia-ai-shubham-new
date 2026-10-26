import { useState, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Send, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { AveriaLogo } from '@/components/AveriaLogo';

export function FloatingAIChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const constraintsRef = useRef<HTMLDivElement>(null);

  const handleQuickSend = () => {
    if (!quickInput.trim()) return;
    if (!user) { navigate('/auth'); return; }
    navigate(`/averia-ai?q=${encodeURIComponent(quickInput.trim())}`);
    setQuickInput('');
    setIsOpen(false);
  };

  const handleOpenFull = () => {
    if (!user) { navigate('/auth'); return; }
    navigate('/averia-ai');
    setIsOpen(false);
  };

  if (isMinimized) {
    return (
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[70]">
        <motion.div
          drag
          dragConstraints={constraintsRef}
          dragElastic={0.1}
          className="absolute bottom-6 right-6 pointer-events-auto cursor-grab active:cursor-grabbing"
        >
          <button
            onClick={() => setIsMinimized(false)}
            className="w-10 h-10 flex items-center justify-center"
          >
            <AveriaLogo size="sm" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[70]">
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        className="absolute bottom-6 right-6 pointer-events-auto cursor-grab active:cursor-grabbing"
      >
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="absolute bottom-16 right-0 w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 to-accent/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AveriaLogo size="xs" />
                    <span className="font-heading font-bold text-sm">Averia AI</span>
                    <span className="text-[9px] px-1 py-0.5 rounded-full bg-primary/20 text-primary font-bold">V4.0</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(true)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <p className="text-xs text-muted-foreground mb-3">Quick question? Type below or open the full Agentic AI.</p>
                <div className="flex items-center gap-2">
                  <input
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickSend()}
                    placeholder="Ask anything..."
                    className="flex-1 bg-secondary/40 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button size="icon" className="h-9 w-9 rounded-lg" onClick={handleQuickSend} disabled={!quickInput.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="outline" className="w-full mt-3 text-xs" onClick={handleOpenFull}>
                  Open Full AI Experience →
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className="w-14 h-14 flex items-center justify-center relative"
          style={{ filter: 'drop-shadow(0 0 10px rgba(156, 77, 255, 0.4))' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AveriaLogo size="md" animate />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-success rounded-full border-2 border-background animate-pulse" />
        </motion.button>
      </motion.div>
    </div>
  );
}
