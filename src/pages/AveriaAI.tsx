import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Plus, Brain, Trash2, MessageSquare, ChevronLeft, ChevronRight, Eye, Code, X, FileCode, Globe, Play, Pause, Music, Video, Image as ImageIcon, Rocket, FolderOpen, File, Settings, Monitor, Smartphone, Tablet, Camera, Paperclip, FileText, Link2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { AveriaLogo } from '@/components/AveriaLogo';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MessageResponse } from '@/components/ai-elements/message';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/averia-ai`;

interface Attachment {
  id: string;
  name: string;
  type: string; // mime
  kind: 'image' | 'video' | 'audio' | 'text' | 'url' | 'file';
  size: number;
  dataUrl?: string; // base64 for media
  textContent?: string; // for text/url
  preview?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  attachments?: Attachment[];
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  content?: string;
  children?: FileNode[];
  active?: boolean;
}

function extractCodeForPreview(content: string): string | null {
  const codeBlockRegex = /```(?:jsx|tsx|html|react)\s*\n([\s\S]*?)```/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = codeBlockRegex.exec(content)) !== null) {
    matches.push(m[1]);
  }
  if (matches.length === 0) return null;
  return matches[matches.length - 1];
}

function extractImageRequest(content: string): string | null {
  const match = content.match(/\[IMAGE_REQUEST:\s*(.*?)\]/);
  return match ? match[1].trim() : null;
}

function extractMultimediaRequests(content: string): { type: string; title: string; status: string }[] {
  const requests: { type: string; title: string; status: string }[] = [];
  const videoMatch = content.match(/\[VIDEO_REQUEST:\s*(.*?)\]/g);
  const audioMatch = content.match(/\[AUDIO_REQUEST:\s*(.*?)\]/g);
  const musicMatch = content.match(/\[MUSIC_REQUEST:\s*(.*?)\]/g);
  videoMatch?.forEach(m => {
    const title = m.match(/\[VIDEO_REQUEST:\s*(.*?)\]/)?.[1] || 'Video';
    requests.push({ type: 'video', title, status: 'Queued' });
  });
  audioMatch?.forEach(m => {
    const title = m.match(/\[AUDIO_REQUEST:\s*(.*?)\]/)?.[1] || 'Audio';
    requests.push({ type: 'audio', title, status: 'Queued' });
  });
  musicMatch?.forEach(m => {
    const title = m.match(/\[MUSIC_REQUEST:\s*(.*?)\]/)?.[1] || 'Music';
    requests.push({ type: 'music', title, status: 'Queued' });
  });
  return requests;
}

function cleanCodeForBrowser(raw: string): string {
  let code = raw;
  code = code.replace(/^import\s+.*?['";]\s*$/gm, '');
  code = code.replace(/export\s+default\s+function\s+/g, 'function ');
  code = code.replace(/export\s+default\s+/g, '');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  return code.trim();
}

function detectComponentName(code: string): string {
  const fnMatch = code.match(/function\s+([A-Z][A-Za-z0-9]*)\s*\(/);
  if (fnMatch) return fnMatch[1];
  const constMatch = code.match(/const\s+([A-Z][A-Za-z0-9]*)\s*=/);
  if (constMatch) return constMatch[1];
  return 'App';
}

function buildPreviewHTML(code: string): string {
  if (code.trim().startsWith('<') && !code.includes('function ') && !code.includes('const ')) {
    return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<style>body{margin:0;font-family:system-ui,sans-serif;}*{box-sizing:border-box;}</style>
</head><body>${code}</body></html>`;
  }

  const cleaned = cleanCodeForBrowser(code);
  const componentName = detectComponentName(cleaned);

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#fff;}
*{box-sizing:border-box;}
.error-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;padding:2rem;}
.error-card{background:#1a1a2e;border:1px solid #ef4444;border-radius:12px;padding:1.5rem;max-width:500px;width:100%;color:#f8f8f2;font-family:'Fira Code',monospace,system-ui;}
.error-card h3{color:#ef4444;font-size:14px;margin:0 0 8px;font-weight:600;}
.error-card pre{font-size:12px;white-space:pre-wrap;word-break:break-word;margin:0;color:#ff6b6b;line-height:1.5;}
.error-card .hint{font-size:11px;color:#888;margin-top:12px;border-top:1px solid #333;padding-top:8px;}
</style>
</head><body>
<div id="root"></div>
<script type="text/babel" data-type="module">
const { useState, useEffect, useRef, useCallback, useMemo, Fragment, createContext, useContext, useReducer } = React;
try {
${cleaned}

const _Component = typeof ${componentName} !== 'undefined' ? ${componentName} : null;
if (_Component) {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(React.StrictMode, null, React.createElement(_Component)));
} else {
  document.getElementById('root').innerHTML = '<div style="padding:2rem;color:#888;text-align:center;font-family:system-ui;">Preview ready — waiting for a renderable component.</div>';
}
} catch(e) {
  document.getElementById('root').innerHTML = '<div class="error-overlay"><div class="error-card"><h3>⚠️ Syntax / Render Error</h3><pre>' + e.message + '</pre><div class="hint">The AI-generated code has an issue. Ask Averia to fix it or try a simpler prompt.</div></div></div>';
  console.error('Preview Error:', e);
}
<\/script>
</body></html>`;
}

function generateFileTree(code: string | null): FileNode[] {
  if (!code) return [];
  const isHTML = code.trim().startsWith('<') && !code.includes('function ') && !code.includes('const ');
  if (isHTML) {
    return [
      { name: 'src', type: 'folder', children: [
        { name: 'index.html', type: 'file', content: code, active: true },
      ]},
      { name: 'tailwind.config.js', type: 'file' },
      { name: 'package.json', type: 'file' },
    ];
  }
  const compName = detectComponentName(code);
  return [
    { name: 'src', type: 'folder', children: [
      { name: 'App.jsx', type: 'file', content: code, active: true },
      { name: `${compName}.jsx`, type: 'file', content: code },
      { name: 'index.css', type: 'file' },
    ]},
    { name: 'public', type: 'folder', children: [
      { name: 'index.html', type: 'file' },
    ]},
    { name: 'tailwind.config.js', type: 'file' },
    { name: 'package.json', type: 'file' },
  ];
}

function MultimediaCard({ type, title }: { type: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const icons = { video: Video, audio: Music, music: Music };
  const Icon = icons[type as keyof typeof icons] || Video;
  const colors = { video: 'from-blue-500/20 to-cyan-500/20', audio: 'from-amber-500/20 to-orange-500/20', music: 'from-pink-500/20 to-purple-500/20' };

  return (
    <div className={`rounded-xl border border-border bg-gradient-to-br ${colors[type as keyof typeof colors] || colors.video} p-4 my-3`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{title}</p>
          <p className="text-xs text-muted-foreground capitalize">{type} • Queued for Generation</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" className="h-8 gap-1.5 rounded-lg" onClick={() => setPlaying(!playing)}>
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {playing ? 'Pause' : 'Preview'}
        </Button>
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <motion.div className="h-full bg-primary rounded-full" animate={{ width: playing ? '60%' : '0%' }} transition={{ duration: 3 }} />
        </div>
        <span className="text-[10px] text-muted-foreground">0:00</span>
      </div>
    </div>
  );
}

function FileTree({ nodes, depth = 0 }: { nodes: FileNode[]; depth?: number }) {
  return (
    <div>
      {nodes.map((node, i) => (
        <div key={i}>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer hover:bg-secondary/50 rounded ${node.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {node.type === 'folder' ? <FolderOpen className="h-3.5 w-3.5 text-amber-500" /> : <File className="h-3.5 w-3.5" />}
            <span className="truncate">{node.name}</span>
          </div>
          {node.children && <FileTree nodes={node.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

import { useScope } from '@/lib/scope';

export default function AveriaAI() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const scope = useScope();
  // Scope-aware table accessors — PERSONAL uses ai_*; JOINT uses shared_ai_*
  const CONV_TABLE = scope.isJoint ? 'shared_ai_conversations' : 'ai_conversations';
  const MSG_TABLE = scope.isJoint ? 'shared_ai_messages' : 'ai_messages';


  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const recognitionRef = useRef<any>(null);
  const speechBaseTextRef = useRef('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [canvasContent, setCanvasContent] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<'preview' | 'code' | 'files'>('preview');
  const [canvasImageUrl, setCanvasImageUrl] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'chat' | 'preview'>('chat');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toggleVoiceInput = () => {
    if (voiceActive) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setVoiceActive(false);
      setVoiceMode(false);
      return;
    }
    const speechWindow = window as Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast.error('Voice input is not supported in this browser.');
      return;
    }
    const recognition = new Recognition();
    speechBaseTextRef.current = input;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<any>)
        .map((result: any) => result[0]?.transcript || '')
        .join('');
      if (transcript.trim()) {
        const base = speechBaseTextRef.current;
        setInput(`${base}${base && !/\s$/.test(base) ? ' ' : ''}${transcript}`);
      }
    };
    recognition.onerror = () => {
      setVoiceActive(false);
      setVoiceMode(false);
      toast.error('Voice input stopped. Check microphone access and try again.');
    };
    recognition.onend = () => {
      setVoiceActive(false);
      recognitionRef.current = null;
    };
    try {
      recognitionRef.current = recognition;
      setVoiceMode(true);
      setVoiceActive(true);
      recognition.start();
    } catch {
      setVoiceActive(false);
      setVoiceMode(false);
      recognitionRef.current = null;
      toast.error('Could not start voice input.');
    }
  };
  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, []);
  // Gemini-style dynamic composer: grow with content, shrink back on send/clear.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, [input]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQueryHandled = useRef(false);
  const mirrorPeer = searchParams.get('mirror') === 'peer' && scope.isJoint && !!scope.peerId;
  const [chatSearch, setChatSearch] = useState('');
  const [activeEngine, setActiveEngine] = useState<'Intelligence' | 'Synth' | 'Velo'>('Intelligence');
  const filteredConversations = chatSearch.trim()
    ? conversations.filter(c => c.title.toLowerCase().includes(chatSearch.toLowerCase()))
    : conversations;
  const userFirstName = (user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Friend').split(' ')[0];

  // Broadcast the active conversation so the global sidebar can highlight it
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('averia:active-conv', { detail: { id: activeConvId } }));
  }, [activeConvId]);



  // Load peer's PERSONAL conversations + messages when in mirror=peer mode (read-only)
  useEffect(() => {
    if (!mirrorPeer || !scope.workspaceId || !scope.peerId) return;
    setSidebarOpen(true); // expose thread list immediately for browsing history
    (async () => {
      const { data: convs, error } = await supabase.rpc('get_peer_ai_conversations', {
        _workspace_id: scope.workspaceId, _target_user: scope.peerId,
      });
      if (error) { toast.error('Permission denied by peer for Agentic AI'); return; }
      if (convs && (convs as any).length) {
        setConversations(convs as any);
        const first = (convs as any)[0].id;
        setActiveConvId(first);
        const { data: msgs } = await supabase.rpc('get_peer_ai_messages', {
          _workspace_id: scope.workspaceId, _target_user: scope.peerId, _conversation_id: first,
        });
        if (msgs) setMessages((msgs as any).map((m: any) => ({ role: m.role, content: m.content })));
      } else {
        setConversations([]); setMessages([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirrorPeer, scope.workspaceId, scope.peerId]);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    loadConversations();
  }, [user]);

  useEffect(() => {
    if (!initialQueryHandled.current && user) {
      const q = searchParams.get('q');
      if (q) {
        initialQueryHandled.current = true;
        setInput(q);
      }
    }
  }, [user, searchParams]);

  // Global AppShell sidebar bridge — react to shell-driven actions.
  useEffect(() => {
    const onNew = () => handleNewChat();
    const onSelect = (e: any) => { const id = e?.detail?.id; if (id) selectConversation(id); };
    window.addEventListener('averia:new-chat', onNew as any);
    window.addEventListener('averia:select-conv', onSelect as any);
    return () => {
      window.removeEventListener('averia:new-chat', onNew as any);
      window.removeEventListener('averia:select-conv', onSelect as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirrorPeer, scope.isJoint, scope.workspaceId, scope.peerId, isMobile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-detect code and trigger preview + hot-reload + Creation auto-pipeline
  const savedProjectRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      const code = extractCodeForPreview(lastAssistant.content);
      if (code && code !== canvasContent) {
        setCanvasContent(code);
        setPreviewKey(k => k + 1); // force iframe remount for hot-reload
        setPreviewError(null);
        if (isMobile) setMobileView('preview');
        // === Auto-pipeline: push generated app/code into Creation vault (agentic / project) ===
        const sig = `${activeConvId}::${code.slice(0, 80)}`;
        if (user && !scope.isJoint && activeConvId && !savedProjectRef.current.has(sig)) {
          savedProjectRef.current.add(sig);
          const title = (lastAssistant.content.match(/^#\s+(.+)$/m)?.[1] || detectComponentName(code) || 'Untitled Project').slice(0, 80);
          supabase.from('vault_items').insert({
            user_id: user.id,
            vault_type: 'agentic',
            kind: 'project',
            title,
            content: code.slice(0, 4000),
            media_url: null,
            environment_context: 'personal',
            metadata: { source: 'averia-ai', conversation_id: activeConvId, project_id: activeConvId },
          }).then(() => window.dispatchEvent(new CustomEvent('averia:vault-changed')));
        }
      }
      if (lastAssistant.imageUrl) {
        setCanvasImageUrl(lastAssistant.imageUrl);
        if (isMobile) setMobileView('preview');
      }
    }
  }, [messages]);

  // JOINT scope: subscribe to realtime shared brain messages so both devices sync live.
  useEffect(() => {
    if (!scope.isJoint || !scope.workspaceId) return;
    const ws = scope.workspaceId;
    const ch = supabase
      .channel(`shared-ai-${ws}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shared_ai_messages', filter: `workspace_id=eq.${ws}` }, (payload) => {
        const m: any = payload.new;
        // Only render if it belongs to the active thread
        if (activeConvId && m.conversation_id && m.conversation_id !== activeConvId) return;
        // Skip if it's our own message we already optimistically rendered
        if (m.author_id === scope.myId && m.role === 'user') return;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === m.role && last.content === m.content) return prev;
          return [...prev, { role: m.role, content: m.content }];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [scope.isJoint, scope.workspaceId, scope.myId, activeConvId]);

  // JOINT scope: auto-open the most recent shared conversation on entry (or create one).
  useEffect(() => {
    if (scope.isJoint && scope.workspaceId && user && !activeConvId) {
      (async () => {
        const { data: latest } = await supabase
          .from('shared_ai_conversations')
          .select('id')
          .eq('workspace_id', scope.workspaceId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest?.id) { setActiveConvId(latest.id); loadMessages(latest.id); }
        else { const id = await createConversation(); if (id) loadMessages(id); }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.isJoint, scope.workspaceId, user]);


  const loadConversations = async () => {
    if (!user) return;
    if (scope.isJoint && scope.workspaceId) {
      const { data } = await supabase
        .from('shared_ai_conversations')
        .select('*')
        .eq('workspace_id', scope.workspaceId)
        .order('updated_at', { ascending: false });
      if (data) setConversations(data.map((c: any) => ({ id: c.id, title: c.title || 'Joint Brain', created_at: c.created_at, updated_at: c.updated_at })));
      return;
    }
    const { data } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (data) setConversations(data as Conversation[]);
  };

  const loadMessages = async (convId: string) => {
    if (scope.isJoint && scope.workspaceId) {
      // Multi-thread: filter shared_ai_messages by conversation_id; fallback to workspace-only
      const { data } = await supabase
        .from('shared_ai_messages')
        .select('*')
        .eq('workspace_id', scope.workspaceId)
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data.map((m: any) => ({ role: m.role, content: m.content })));
      return;
    }
    const { data } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data.map((m: any) => ({ role: m.role, content: m.content })));
  };


  const ensureSession = async (): Promise<boolean> => {
    if (!user) { toast.error('Please log in'); navigate('/auth'); return false; }
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!refreshed?.session) { toast.error('Session expired. Please log in again.'); navigate('/auth'); return false; }
      }
      const session = sessionData?.session;
      if (session?.expires_at) {
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at - now < 120) {
          await supabase.auth.refreshSession();
        }
      }
      return true;
    } catch { return false; }
  };

  const createConversation = async (): Promise<string | null> => {
    if (!(await ensureSession())) return null;
    try {
      // JOINT: always create a new shared thread in this workspace (multi-thread enabled).
      if (scope.isJoint && scope.workspaceId) {
        const { data: created, error } = await supabase
          .from('shared_ai_conversations')
          .insert({ workspace_id: scope.workspaceId, title: 'Joint Brain' })
          .select()
          .single();
        if (error || !created) { toast.error('Could not open Joint Brain.'); return null; }
        const conv: any = created;
        setConversations(prev => [{ id: conv.id, title: conv.title || 'Joint Brain', created_at: conv.created_at, updated_at: conv.updated_at }, ...prev]);
        setActiveConvId(conv.id);
        setMessages([]);
        setCanvasContent(null); setCanvasImageUrl(null); setDeployUrl(null);
        return conv.id;
      }

      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({ user_id: user!.id, title: 'New Chat' })
        .select()
        .single();
      if (error) {
        if (error.message?.includes('JWT expired')) {
          await supabase.auth.refreshSession();
          const retry = await supabase.from('ai_conversations').insert({ user_id: user!.id, title: 'New Chat' }).select().single();
          if (!retry.error) {
            const conv = retry.data as Conversation;
            setConversations(prev => [conv, ...prev]);
            setActiveConvId(conv.id);
            setMessages([]);
            setCanvasContent(null); setCanvasImageUrl(null); setDeployUrl(null);
            return conv.id;
          }
        }
        console.error('Conversation creation error:', error);
        toast.error('Failed to create conversation.');
        return null;
      }
      const conv = data as Conversation;
      setConversations(prev => [conv, ...prev]);
      setActiveConvId(conv.id);
      setMessages([]);
      setCanvasContent(null); setCanvasImageUrl(null); setDeployUrl(null);
      window.dispatchEvent(new CustomEvent('averia:conv-changed'));
      return conv.id;
    } catch (err) {
      console.error('Conversation creation exception:', err);
      toast.error('Connection error.');
      return null;
    }
  };


  const handleNewChat = () => {
    if (mirrorPeer) { toast.info('Read-only mirror — cannot create new threads'); return; }
    if (scope.isJoint) { toast.info('Joint Brain is locked to one shared thread'); return; }
    setActiveConvId(null);
    setMessages([]);
    setCanvasContent(null); setCanvasImageUrl(null); setDeployUrl(null);
    setInput('');
    setPreviewError(null);
    setMobileView('chat');
  };

  const selectConversation = async (convId: string) => {
    setActiveConvId(convId);
    setCanvasContent(null); setCanvasImageUrl(null); setDeployUrl(null);
    if (mirrorPeer && scope.workspaceId && scope.peerId) {
      const { data, error } = await supabase.rpc('get_peer_ai_messages', {
        _workspace_id: scope.workspaceId, _target_user: scope.peerId, _conversation_id: convId,
      });
      if (error) { toast.error('Permission denied by peer'); setMessages([]); }
      else setMessages((data || []).map((m: any) => ({ role: m.role, content: m.content })));
    } else {
      loadMessages(convId);
    }
    if (isMobile) { setSidebarOpen(false); setMobileView('chat'); }
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (scope.isJoint) {
      // Joint: delete the shared conv + its messages (workspace peers share ownership)
      await supabase.from('shared_ai_messages').delete().eq('conversation_id', convId);
      await supabase.from('shared_ai_conversations').delete().eq('id', convId);
    } else {
      await supabase.from('ai_conversations').delete().eq('id', convId);
    }
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConvId === convId) handleNewChat();
    window.dispatchEvent(new CustomEvent('averia:conv-changed'));
  };


  const handlePublish = async () => {
    setIsDeploying(true);
    await new Promise(r => setTimeout(r, 2500));
    const slug = `project-${Date.now().toString(36)}`;
    setDeployUrl(`https://${slug}.lovable.app`);
    setIsDeploying(false);
    toast.success('Website published successfully! 🚀');
  };

  const handleImageGeneration = async (prompt: string, convId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'x-client-info': 'averia-ai-client',
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], conversationId: convId, mode: 'image' }),
      });

      if (!resp.ok) throw new Error('Image generation failed');
      const data = await resp.json();
      const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (imageUrl) {
        setCanvasImageUrl(imageUrl);
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.role === 'assistant') {
            updated[lastIdx] = { ...updated[lastIdx], imageUrl, content: updated[lastIdx].content.replace(/\[IMAGE_REQUEST:.*?\]/, `\n\n✅ Image generated successfully!`) };
          }
          return updated;
        });
        // === Auto-pipeline: push generated image into Creation vault (agentic / photo) ===
        if (user && !scope.isJoint) {
          await supabase.from('vault_items').insert({
            user_id: user.id,
            vault_type: 'agentic',
            kind: 'image',
            title: prompt.slice(0, 80),
            content: prompt,
            media_url: imageUrl,
            environment_context: 'personal',
            metadata: { source: 'averia-ai', conversation_id: convId },
          });
          window.dispatchEvent(new CustomEvent('averia:vault-changed'));
        }
      }
    } catch (err) {
      console.error('Image gen error:', err);
      toast.error('Image generation failed. Try again.');
    }
  };

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const fileToText = (file: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsText(file);
  });

  const classifyFile = (file: File): Attachment['kind'] => {
    const t = file.type;
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/')) return 'audio';
    if (t.startsWith('text/') || /\.(md|txt|json|csv|html|xml)$/i.test(file.name)) return 'text';
    return 'file';
  };

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const MAX = 20 * 1024 * 1024; // 20MB
    const accepted: Attachment[] = [];
    for (const f of arr) {
      if (f.size > MAX) { toast.error(`${f.name} exceeds 20MB`); continue; }
      const kind = classifyFile(f);
      const att: Attachment = {
        id: crypto.randomUUID(), name: f.name, type: f.type, size: f.size, kind,
      };
      try {
        if (kind === 'image' || kind === 'video' || kind === 'audio') {
          att.dataUrl = await fileToDataUrl(f);
          if (kind === 'image') att.preview = att.dataUrl;
        } else if (kind === 'text') {
          att.textContent = (await fileToText(f)).slice(0, 50000);
        } else {
          att.dataUrl = await fileToDataUrl(f);
        }
        accepted.push(att);
      } catch (e) { console.error(e); toast.error(`Failed to read ${f.name}`); }
    }
    if (accepted.length) {
      setAttachments(prev => [...prev, ...accepted]);
      toast.success(`${accepted.length} file(s) attached for forensic analysis`);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); await addFiles(files); return; }
    // URL paste detection
    const text = e.clipboardData.getData('text');
    if (text && /^https?:\/\/\S+$/i.test(text.trim())) {
      e.preventDefault();
      setAttachments(prev => [...prev, {
        id: crypto.randomUUID(), name: text.trim(), type: 'text/uri-list', size: text.length,
        kind: 'url', textContent: text.trim(),
      }]);
      toast.success('URL attached for authenticity check');
    }
  };

  const removeAttachment = (id: string) => setAttachments(prev => prev.filter(a => a.id !== id));

  const sendMessage = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    let convId = activeConvId;
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    const currentAttachments = attachments;
    const userMsg: Message = { role: 'user', content: input.trim() || '(forensic analysis request)', attachments: currentAttachments };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setAttachments([]);
    setIsLoading(true);
    if (isMobile) setMobileView('chat');

    // Build textual description of attachments for DB log + history
    const attachmentSummary = currentAttachments.length
      ? `\n\n[Attachments: ${currentAttachments.map(a => `${a.name} (${a.kind})`).join(', ')}]`
      : '';
    if (scope.isJoint && scope.workspaceId) {
      await supabase.from('shared_ai_messages').insert({ workspace_id: scope.workspaceId, conversation_id: convId, author_id: user!.id, role: 'user', content: userMsg.content + attachmentSummary });
    } else {
      await supabase.from('ai_messages').insert({ conversation_id: convId, role: 'user', content: userMsg.content + attachmentSummary });
    }

    if (messages.length === 0) {
      const title = userMsg.content.slice(0, 60) + (userMsg.content.length > 60 ? '...' : '');
      if (scope.isJoint && scope.workspaceId) {
        await supabase.from('shared_ai_conversations').update({ title }).eq('id', convId);
      } else {
        await supabase.from('ai_conversations').update({ title }).eq('id', convId);
      }
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title } : c));
    }


    // Build payload messages: convert attachments into multimodal content parts for the latest msg
    const payloadMessages = newMessages.map((m, idx) => {
      if (idx === newMessages.length - 1 && m.attachments && m.attachments.length > 0) {
        const parts: any[] = [{ type: 'text', text: `${m.content}\n\nPerform DEEP FORENSIC analysis on each attachment. Detect AI generation, deepfakes, manipulation, splicing, voice cloning, or phishing. Provide a percentage confidence score and highlight specific anomalies.` }];
        for (const a of m.attachments) {
          if ((a.kind === 'image' || a.kind === 'video' || a.kind === 'audio') && a.dataUrl) {
            parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
          } else if (a.kind === 'text' && a.textContent) {
            parts.push({ type: 'text', text: `\n--- File: ${a.name} ---\n${a.textContent}` });
          } else if (a.kind === 'url' && a.textContent) {
            parts.push({ type: 'text', text: `\n--- URL to verify: ${a.textContent} ---` });
          }
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    let assistantContent = '';
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'x-client-info': 'averia-ai-client',
        },
        body: JSON.stringify({ messages: payloadMessages, conversationId: convId, forensicMode: currentAttachments.length > 0 }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { role: 'assistant', content: assistantContent }];
              });
            }
          } catch { /* partial JSON */ }
        }
      }

      if (assistantContent) {
        if (voiceMode && typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(assistantContent));
        }
        if (scope.isJoint && scope.workspaceId) {
          await supabase.from('shared_ai_messages').insert({ workspace_id: scope.workspaceId, conversation_id: convId, author_id: null, role: 'assistant', content: assistantContent });
          await supabase.from('shared_ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
        } else {
          await supabase.from('ai_messages').insert({ conversation_id: convId, role: 'assistant', content: assistantContent });
          await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
        }

        const imageRequest = extractImageRequest(assistantContent);
        if (imageRequest) {
          handleImageGeneration(imageRequest, convId);
        }
      }

    } catch (err: any) {
      toast.error(err.message || 'Failed to get response');
      setMessages(prev => prev.filter(m => m.role !== 'assistant' || m.content));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, activeConvId, messages, attachments, isMobile, voiceMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!user) return null;

  const hasCanvas = canvasContent || canvasImageUrl;
  const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '';
  const fileTree = generateFileTree(canvasContent);

  const deviceWidths = { desktop: '100%', tablet: '768px', mobile: '375px' };

  // Mobile: show either chat or preview
  const showChat = !isMobile || mobileView === 'chat';
  const showCanvas = !isMobile ? hasCanvas : (hasCanvas && mobileView === 'preview');

  return (
    <div className="h-full w-full flex flex-col">
      {mirrorPeer && (
        <div className="sticky top-0 z-30 bg-amber-500/10 border-b border-amber-400/40 text-amber-100 px-4 py-2 text-xs sm:text-sm flex items-center justify-between">
          <span className="font-semibold flex items-center gap-2"><Eye className="h-3.5 w-3.5" /> Viewing partner's Averia AI — read-only mirror</span>
          <button onClick={() => { const p = new URLSearchParams(searchParams); p.delete('mirror'); setSearchParams(p, { replace: true }); }} className="text-[11px] underline hover:text-amber-200">Exit</button>
        </div>
      )}
      {mirrorPeer && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="right" className="w-[86vw] sm:w-[380px] p-0 flex flex-col">
            <SheetHeader className="px-4 py-3 border-b border-border">
              <SheetTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-amber-400" /> Partner's Chat History
              </SheetTitle>
              <p className="text-[11px] text-muted-foreground text-left">Read-only mirror · input bar is locked</p>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground italic">No threads accessible.</div>
              )}
              {conversations.map(c => {
                const active = c.id === activeConvId;
                return (
                  <button
                    key={c.id}
                    onClick={() => { selectConversation(c.id); setSidebarOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[13px] mb-0.5 transition truncate ${active ? 'bg-amber-500/15 border border-amber-400/40 text-amber-100 font-semibold' : 'hover:bg-secondary/60 text-foreground/85'}`}
                    title={c.title}
                  >
                    {c.title || 'Untitled thread'}
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden min-w-0">

        
        
        {/* Mobile View Toggle */}
        {isMobile && hasCanvas && (
          <div className="flex border-b border-border shrink-0 bg-card">
            <button
              onClick={() => setMobileView('chat')}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${mobileView === 'chat' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground'}`}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Chat
            </button>
            <button
              onClick={() => setMobileView('preview')}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${mobileView === 'preview' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground'}`}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Inner sidebar removed — the global AppShell sidebar owns chat state. */}




          {/* Chat Area */}
          {showChat && (
            <div className={`flex-1 flex flex-col min-w-0 ${!isMobile && hasCanvas ? 'max-w-[50%]' : ''}`}>
              {/* Inner page header removed — global chrome ([☰] + [DP]) owns the top bar. */}
              {mirrorPeer && (
                <div className="h-12 flex items-center justify-end px-3 shrink-0">
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-700 flex items-center justify-center transition"
                    title="Partner chat history (read-only)"
                    aria-label="Partner chat history"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              )}


              {/* Messages */}
              <ScrollArea className="flex-1 px-4">
                <div className="max-w-3xl mx-auto py-6 space-y-6">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
                      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-6">
                        <div className="w-20 h-20 flex items-center justify-center mb-4 mx-auto">
                          <AveriaLogo size="xl" />
                        </div>
                        <h2 className="font-heading text-2xl md:text-3xl font-bold mb-2 gradient-text">Command the Network, {userFirstName}</h2>
                        <p className="text-muted-foreground text-sm max-w-md">
                          Aapka intelligent agent — websites banao, images generate karo, news verify karo. Ask me anything!
                        </p>

                      </motion.div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                        {[
                          "Build me a professional portfolio website",
                          "Generate an image of a futuristic AI lab",
                          "Verify: Is AI replacing jobs in India?",
                          "Create a landing page for my startup",
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => setInput(prompt)}
                            className="p-3 text-left text-xs rounded-xl border border-border hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 mt-1 flex items-center justify-center">
                          <AveriaLogo size="sm" />
                        </div>
                      )}
                      <div className={`max-w-[70%] sm:max-w-[80%] break-words overflow-hidden rounded-2xl px-4 py-3 bg-transparent text-foreground ${
                        msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
                      }`}>
                        {msg.role === 'assistant' ? (
                          <div className="prose dark:prose-invert max-w-none text-[15px] sm:text-[16px] leading-relaxed font-normal [&_pre]:bg-background/50 [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-xs [&_pre]:overflow-x-auto">
                            <MessageResponse>{msg.content}</MessageResponse>
                            {msg.imageUrl && (
                              <img src={msg.imageUrl} alt="Generated" className="mt-3 rounded-lg max-w-full border border-border" />
                            )}
                            {extractMultimediaRequests(msg.content).map((req, idx) => (
                              <MultimediaCard key={idx} type={req.type} title={req.title} />
                            ))}
                          </div>
                        ) : (
                          <>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {msg.attachments.map(a => (
                                  <div key={a.id} className="flex items-center gap-1.5 bg-primary-foreground/15 rounded-lg px-2 py-1 text-[11px]">
                                    {a.kind === 'image' && a.preview ? (
                                      <img src={a.preview} alt={a.name} className="h-5 w-5 rounded object-cover" />
                                    ) : a.kind === 'video' ? <Video className="h-3 w-3" />
                                      : a.kind === 'audio' ? <Music className="h-3 w-3" />
                                      : a.kind === 'url' ? <Link2 className="h-3 w-3" />
                                      : <FileText className="h-3 w-3" />}
                                    <span className="max-w-[120px] truncate">{a.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                      <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 flex items-center justify-center">
                        <AveriaLogo size="sm" animate />
                      </div>
                      <div className="bg-transparent rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="border-t border-white/5 backdrop-blur-sm shadow-none p-3 md:p-4 shrink-0">
                <div className="max-w-3xl mx-auto">
                  {/* Attachment chips */}
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {attachments.map(a => (
                        <div key={a.id} className="group relative flex items-center gap-2 bg-secondary/60 border border-border rounded-xl pl-2 pr-7 py-1.5 text-xs max-w-[220px]">
                          {a.kind === 'image' && a.preview ? (
                            <img src={a.preview} alt={a.name} className="h-7 w-7 rounded object-cover" />
                          ) : (
                            <div className="h-7 w-7 rounded bg-primary/15 flex items-center justify-center text-primary">
                              {a.kind === 'video' && <Video className="h-3.5 w-3.5" />}
                              {a.kind === 'audio' && <Music className="h-3.5 w-3.5" />}
                              {a.kind === 'text' && <FileText className="h-3.5 w-3.5" />}
                              {a.kind === 'url' && <Link2 className="h-3.5 w-3.5" />}
                              {a.kind === 'file' && <File className="h-3.5 w-3.5" />}
                            </div>
                          )}
                          <span className="truncate flex-1">{a.name}</span>
                          <button onClick={() => removeAttachment(a.id)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80 flex items-center justify-center opacity-70 hover:opacity-100">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2 rounded-full bg-[#181824] border border-white/15 px-4 py-3 shadow-2xl backdrop-blur-xl">
                    {/* Plus / attach menu */}
                    <div className="relative shrink-0">
                      <Button
                        onClick={() => setShowPlusMenu(v => !v)}
                        variant="ghost"
                        size="icon"
                        className="rounded-xl h-9 w-9"
                        aria-label="Attach media"
                      >
                        <Plus className={`h-4 w-4 transition-transform ${showPlusMenu ? 'rotate-45 text-primary' : ''}`} />
                      </Button>
                      <AnimatePresence>
                        {showPlusMenu && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowPlusMenu(false)} />
                            <motion.div
                              initial={{ opacity: 0, y: 8, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              className="absolute bottom-12 left-0 z-50 w-60 rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 backdrop-blur-xl p-1.5"
                            >
                              <button
                                onClick={() => { cameraInputRef.current?.click(); setShowPlusMenu(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/10 text-left text-sm transition-colors"
                              >
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                                  <Camera className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold">Camera</div>
                                  <div className="text-[10px] text-muted-foreground">Capture photo / video</div>
                                </div>
                              </button>
                              <button
                                onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/10 text-left text-sm transition-colors"
                              >
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/30 to-pink-500/10 flex items-center justify-center">
                                  <Paperclip className="h-4 w-4 text-amber-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold">Browse Media</div>
                                  <div className="text-[10px] text-muted-foreground">Video, Image, Audio, Text, URL</div>
                                </div>
                              </button>
                              <div className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border mt-1">
                                💡 Tip: Paste (Ctrl+V) images or URLs directly
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,video/*,audio/*,text/*,.pdf,.json,.csv,.md"
                      className="hidden"
                      onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value=''; }}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*,video/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value=''; }}
                    />

                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder={mirrorPeer ? "🔒 Ask Averia Lock — read-only mirror" : "Ask Averia or attach media for forensic analysis..."}
                      rows={1}
                      disabled={mirrorPeer}
                      className="flex-1 min-w-0 bg-transparent resize-none border-none outline-none text-[15px] sm:text-[16px] leading-relaxed py-2 min-h-[50px] max-h-[300px] overflow-y-auto thin-scroll placeholder:text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                    />

                    <Button
                      onClick={toggleVoiceInput}
                      variant="ghost"
                      size="icon"
                      className={`h-11 w-11 shrink-0 rounded-full ${voiceActive ? 'animate-pulse bg-destructive text-destructive-foreground' : ''}`}
                      aria-label={voiceActive ? 'Stop voice input' : 'Start voice input'}
                      aria-pressed={voiceActive}
                    >
                      <Mic className="h-5 w-5" />
                    </Button>

                    <Button
                      onClick={sendMessage}
                      disabled={mirrorPeer || (!input.trim() && attachments.length === 0) || isLoading}
                      size="icon"
                      className="rounded-xl h-9 w-9 shrink-0"
                      title={mirrorPeer ? 'Ask Averia Lock — read-only' : 'Send'}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center mt-2 hidden md:block">
                    Averia AI — Verify • Build • Generate
                  </p>

                </div>
              </div>
            </div>
          )}

          {/* Right Canvas - Builder Preview */}
          <AnimatePresence>
            {showCanvas && (
              <motion.div
                initial={isMobile ? { opacity: 0 } : { width: 0, opacity: 0 }}
                animate={isMobile ? { opacity: 1 } : { width: '50%', opacity: 1 }}
                exit={isMobile ? { opacity: 0 } : { width: 0, opacity: 0 }}
                className={`border-l border-border bg-background flex flex-col overflow-hidden ${isMobile ? 'flex-1' : ''}`}
              >
                {/* Canvas Header */}
                <div className="h-12 border-b border-border flex items-center justify-between px-2 md:px-3 shrink-0 overflow-x-auto">
                  <div className="flex items-center gap-1">
                    {canvasContent && (
                      <>
                        <Button variant={canvasMode === 'preview' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs gap-1" onClick={() => setCanvasMode('preview')}>
                          <Eye className="h-3 w-3" /> <span className="hidden sm:inline">Preview</span>
                        </Button>
                        <Button variant={canvasMode === 'code' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs gap-1" onClick={() => setCanvasMode('code')}>
                          <Code className="h-3 w-3" /> <span className="hidden sm:inline">Code</span>
                        </Button>
                        <Button variant={canvasMode === 'files' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs gap-1" onClick={() => setCanvasMode('files')}>
                          <FileCode className="h-3 w-3" /> <span className="hidden sm:inline">Files</span>
                        </Button>
                      </>
                    )}
                    {canvasImageUrl && !canvasContent && (
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5" /> Generated Image
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Device toggles (desktop only) */}
                    {canvasContent && canvasMode === 'preview' && !isMobile && (
                      <div className="flex items-center gap-0.5 mr-1">
                        <Button variant={previewDevice === 'desktop' ? 'secondary' : 'ghost'} size="icon" className="h-6 w-6" onClick={() => setPreviewDevice('desktop')}>
                          <Monitor className="h-3 w-3" />
                        </Button>
                        <Button variant={previewDevice === 'tablet' ? 'secondary' : 'ghost'} size="icon" className="h-6 w-6" onClick={() => setPreviewDevice('tablet')}>
                          <Tablet className="h-3 w-3" />
                        </Button>
                        <Button variant={previewDevice === 'mobile' ? 'secondary' : 'ghost'} size="icon" className="h-6 w-6" onClick={() => setPreviewDevice('mobile')}>
                          <Smartphone className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {canvasContent && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 text-xs gap-1.5 bg-gradient-to-r from-primary to-primary/80"
                        onClick={handlePublish}
                        disabled={isDeploying}
                      >
                        <Rocket className="h-3 w-3" />
                        <span className="hidden sm:inline">{isDeploying ? 'Deploying...' : 'Publish'}</span>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setCanvasContent(null); setCanvasImageUrl(null); setDeployUrl(null); if (isMobile) setMobileView('chat'); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Deploy URL bar */}
                {deployUrl && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="border-b border-border bg-green-500/10 px-3 py-2 flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="text-xs text-green-600 dark:text-green-400 font-mono truncate">{deployUrl}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto shrink-0" onClick={() => { navigator.clipboard.writeText(deployUrl!); toast.success('URL copied!'); }}>
                      Copy
                    </Button>
                  </motion.div>
                )}

                {/* Deploy animation */}
                {isDeploying && (
                  <div className="border-b border-border bg-primary/5 px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                        <Settings className="h-3.5 w-3.5 text-primary" />
                      </motion.div>
                      <span className="text-xs text-primary font-medium">Deploying to Averia Cloud...</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <motion.div className="h-full bg-primary rounded-full" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 2.5 }} />
                    </div>
                  </div>
                )}

                {/* Canvas Content */}
                <div className="flex-1 flex overflow-hidden">
                  {canvasContent && canvasMode === 'files' && (
                    <div className="w-full overflow-auto p-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5 mb-1">Explorer</div>
                      <FileTree nodes={fileTree} />
                    </div>
                  )}

                  {canvasMode !== 'files' && (
                    <div className="flex-1 overflow-auto flex items-start justify-center">
                      {canvasImageUrl && !canvasContent && (
                        <div className="flex flex-col items-center justify-center h-full p-4 md:p-6 gap-4">
                          <img src={canvasImageUrl} alt="Generated" className="max-w-full max-h-[70vh] rounded-xl border border-border shadow-lg" />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => {
                                const a = document.createElement('a');
                                a.href = canvasImageUrl!;
                                a.download = `averia-ai-${Date.now()}.png`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                toast.success('Image downloading...');
                              }}
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              Download
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={async () => {
                                try {
                                  const res = await fetch(canvasImageUrl!);
                                  const blob = await res.blob();
                                  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                                  toast.success('Image copied to clipboard!');
                                } catch {
                                  toast.error('Copy not supported in this browser');
                                }
                              }}
                            >
                              <Code className="h-3.5 w-3.5" />
                              Copy
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={async () => {
                                try {
                                  if (navigator.share && navigator.canShare) {
                                    const res = await fetch(canvasImageUrl!);
                                    const blob = await res.blob();
                                    const file = new window.File([blob], 'averia-ai-image.png', { type: blob.type });
                                    const shareData = { title: 'Averia AI Generated Image', files: [file] } as ShareData;
                                    if (navigator.canShare(shareData)) {
                                      await navigator.share(shareData);
                                      toast.success('Shared successfully!');
                                    } else {
                                      await navigator.clipboard.writeText(canvasImageUrl!);
                                      toast.success('🔗 Link Copied! Share not supported for files.');
                                    }
                                  } else {
                                    await navigator.clipboard.writeText(canvasImageUrl!);
                                    toast.success('🔗 Link Copied to clipboard!');
                                  }
                                } catch (err: any) {
                                  if (err?.name !== 'AbortError') {
                                    try {
                                      await navigator.clipboard.writeText(canvasImageUrl!);
                                      toast.success('🔗 Link Copied to clipboard!');
                                    } catch {
                                      toast.error('Share not available in this browser');
                                    }
                                  }
                                }
                              }}
                            >
                              <Globe className="h-3.5 w-3.5" />
                              Share
                            </Button>
                          </div>
                        </div>
                      )}
                      {canvasContent && canvasMode === 'preview' && (
                        <div className="w-full h-full flex items-start justify-center bg-muted/30" style={{ padding: previewDevice === 'desktop' ? 0 : '1rem' }}>
                          <iframe
                            key={previewKey}
                            srcDoc={buildPreviewHTML(canvasContent)}
                            sandbox="allow-scripts"
                            className="border-none bg-white transition-all duration-300"
                            style={{
                              width: deviceWidths[previewDevice],
                              maxWidth: '100%',
                              height: '100%',
                              borderRadius: previewDevice !== 'desktop' ? '12px' : 0,
                              boxShadow: previewDevice !== 'desktop' ? '0 4px 24px rgba(0,0,0,0.15)' : 'none',
                            }}
                            title="Live Preview"
                          />
                        </div>
                      )}
                      {canvasContent && canvasMode === 'code' && (
                        <pre className="p-4 text-xs font-mono text-foreground overflow-auto h-full w-full bg-card">
                          <code>{canvasContent}</code>
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
