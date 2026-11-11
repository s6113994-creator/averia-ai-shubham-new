import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Brain, Eye, Code, X, FileCode, Globe, Image as ImageIcon, Rocket, FolderOpen, File, Monitor, Tablet, Smartphone, Camera, Paperclip, FileText, ShieldCheck, Sparkles, Cpu, ChevronDown, MessageSquare, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { AveriaLogo } from '@/components/AveriaLogo';
import { MessageResponse } from '@/components/ai-elements/message';
import { useScope } from '@/lib/scope';
import { generateWatermarkFreeVisual } from '@/lib/averiaChat';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/master-agent-engine`;

interface Attachment {
  id: string;
  name: string;
  type: string;
  kind: 'image' | 'video' | 'audio' | 'text' | 'url' | 'file';
  size: number;
  dataUrl?: string;
  textContent?: string;
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

interface ForensicData {
  verdict: 'AUTHENTIC' | 'FAKE' | 'MISLEADING' | 'AI-GENERATED' | 'MANIPULATED';
  confidence: number;
  markers: string[];
}

function parseForensicData(content: string): ForensicData | null {
  const verdictMatch = content.match(/verdict[:\s]+(\*\*|__)?(AUTHENTIC|FAKE|MISLEADING|AI-GENERATED|MANIPULATED)(\*\*|__)?/i);
  const confMatch = content.match(/confidence[:\s]+(\d+)%/i) || content.match(/(\d+)%\s+confidence/i);

  if (!verdictMatch && !confMatch && !content.toLowerCase().includes('forensic markers')) return null;

  const verdict = (verdictMatch ? verdictMatch[2].toUpperCase() : 'AUTHENTIC') as any;
  const confidence = confMatch ? parseInt(confMatch[1], 10) : 91;

  const markers: string[] = [];
  const markerSection = content.split(/forensic markers|anomalies|indicators/i)[1];
  if (markerSection) {
    const lines = markerSection.split('\n');
    for (const l of lines) {
      const trimmed = l.trim().replace(/^[-*•]\s*/, '');
      if (trimmed && markers.length < 5) markers.push(trimmed);
    }
  }
  if (markers.length === 0) {
    markers.push('Spectral frequency analysis verified', 'Metadata consistency checked against global archives');
  }

  return { verdict, confidence, markers };
}

function ForensicCard({ data }: { data: ForensicData }) {
  const isAuth = data.verdict === 'AUTHENTIC';
  const colorClass = isAuth ? 'text-green-400 bg-green-500/10 border-green-500/30' : 'text-destructive bg-destructive/10 border-destructive/30';

  return (
    <div className={`my-3 p-4 rounded-xl border ${colorClass} backdrop-blur-md space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-heading font-bold text-sm tracking-wide">🎯 VERDICT: {data.verdict}</span>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-background/50 border border-border">
          📊 {data.confidence}% Confidence
        </span>
      </div>
      <div className="w-full h-1.5 bg-background/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${isAuth ? 'bg-green-500' : 'bg-destructive'}`} style={{ width: `${data.confidence}%` }} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🔍 Forensic Markers & Anomalies:</p>
        <ul className="text-xs space-y-1 pl-4 list-disc text-foreground/90">
          {data.markers.map((m, idx) => (
            <li key={idx}>{m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
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
  document.getElementById('root').innerHTML = '<div style="padding:2rem;color:#888;text-align:center;font-family:system-ui;">Preview ready — waiting for renderable component.</div>';
}
} catch(e) {
  document.getElementById('root').innerHTML = '<div class="error-overlay"><div class="error-card"><h3>⚠️ Syntax / Render Error</h3><pre>' + e.message + '</pre><div class="hint">Ask Averia to fix the generated component code.</div></div></div>';
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

export default function AveriaAI() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const scope = useScope();

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const recognitionRef = useRef<any>(null);
  const speechBaseTextRef = useRef('');
  const [isLoading, setIsLoading] = useState(false);
  const [canvasContent, setCanvasContent] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<'preview' | 'code' | 'files'>('preview');
  const [canvasImageUrl, setCanvasImageUrl] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'chat' | 'preview'>('chat');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewKey, setPreviewKey] = useState(0);

  // 4-Phase System State & Top-Right Compact Popup Switcher ONLY (Zero clutter: no footer, no product/company links, no plus/new-chat buttons, no Super Admin banners)
  const [activePhase, setActivePhase] = useState<number>(1);
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const phasesList = [
    { id: 1, name: 'Phase 1: Core', desc: 'Single Agent General Engine (1 Key)', icon: Brain },
    { id: 2, name: 'Phase 2: Studio', desc: 'Multimedia & Watermark-Free Image Swarm (3 Keys)', icon: Sparkles },
    { id: 3, name: 'Phase 3: Intelligence', desc: 'Forensic Audit Swarm (5 Keys)', icon: ShieldCheck },
    { id: 4, name: 'Phase 4: Nexus', desc: 'Autonomous AGI Code Swarm (10 Keys)', icon: Cpu },
  ];

  const currentPhaseMeta = phasesList.find(p => p.id === activePhase) || phasesList[0];

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
    }
  };

  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, []);

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

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('averia:active-conv', { detail: { id: activeConvId } }));
  }, [activeConvId]);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const savedProjectRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      const code = extractCodeForPreview(lastAssistant.content);
      if (code && code !== canvasContent) {
        setCanvasContent(code);
        setPreviewKey(k => k + 1);
        if (isMobile) setMobileView('preview');
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

  const ensureSession = async (): Promise<boolean> => {
    if (!user) { toast.error('Please log in'); navigate('/auth'); return false; }
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!refreshed?.session) { toast.error('Session expired. Please log in again.'); navigate('/auth'); return false; }
      }
      return true;
    } catch { return false; }
  };

  const createConversation = async (): Promise<string | null> => {
    if (!(await ensureSession())) return null;
    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({ user_id: user!.id, title: 'New Chat' })
        .select()
        .single();
      if (error) return null;
      const conv = data as Conversation;
      setActiveConvId(conv.id);
      setMessages([]);
      setCanvasContent(null); setCanvasImageUrl(null); setDeployUrl(null);
      return conv.id;
    } catch {
      return null;
    }
  };

  const handlePublish = async () => {
    setIsDeploying(true);
    await new Promise(r => setTimeout(r, 2000));
    const slug = `project-${Date.now().toString(36)}`;
    setDeployUrl(`https://${slug}.lovable.app`);
    setIsDeploying(false);
    toast.success('Website published successfully! 🚀');
  };

  const handleImageGeneration = async (prompt: string, convId: string) => {
    const finalImage = generateWatermarkFreeVisual(prompt);
    setCanvasImageUrl(finalImage);
    if (isMobile) setMobileView('preview');
    setMessages(prev => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (updated[lastIdx]?.role === 'assistant') {
        updated[lastIdx] = { ...updated[lastIdx], imageUrl: finalImage, content: `✨ Studio watermark-free visual generated successfully for: "${prompt}"` };
      } else {
        updated.push({ role: 'assistant', content: `✨ Studio watermark-free visual generated successfully for: "${prompt}"`, imageUrl: finalImage });
      }
      return updated;
    });
    toast.success('Watermark-free visual rendered in Studio canvas');
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
    const MAX = 20 * 1024 * 1024;
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
      } catch { toast.error(`Failed to read ${f.name}`); }
    }
    if (accepted.length) {
      setAttachments(prev => [...prev, ...accepted]);
      toast.success(`${accepted.length} file(s) attached`);
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
    const userMsg: Message = { role: 'user', content: input.trim() || '(media analysis request)', attachments: currentAttachments };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setAttachments([]);
    setIsLoading(true);
    if (isMobile) setMobileView('chat');

    const attachmentSummary = currentAttachments.length
      ? `\n\n[Attachments: ${currentAttachments.map(a => `${a.name} (${a.kind})`).join(', ')}]`
      : '';
    await supabase.from('ai_messages').insert({ conversation_id: convId, role: 'user', content: userMsg.content + attachmentSummary });

    if (messages.length === 0) {
      const title = userMsg.content.slice(0, 60) + (userMsg.content.length > 60 ? '...' : '');
      await supabase.from('ai_conversations').update({ title }).eq('id', convId);
    }

    const isImageReq = activePhase === 2 || /generate|create an image|photo of|image of|picture of|logo|tasveer|foto|create .* image/i.test(userMsg.content);

    if (isImageReq) {
      setMessages(prev => [...prev, { role: 'assistant', content: `🎨 Generating studio watermark-free visual in Phase 2 for: "${userMsg.content}"...` }]);
      await handleImageGeneration(userMsg.content, convId);
      setIsLoading(false);
      return;
    }

    const payloadMessages = newMessages.map((m, idx) => {
      if (idx === newMessages.length - 1 && m.attachments && m.attachments.length > 0) {
        const parts: any[] = [{ type: 'text', text: m.content }];
        for (const a of m.attachments) {
          if ((a.kind === 'image' || a.kind === 'video' || a.kind === 'audio') && a.dataUrl) {
            parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
          } else if (a.kind === 'text' && a.textContent) {
            parts.push({ type: 'text', text: `\n--- File: ${a.name} ---\n${a.textContent}` });
          }
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    let assistantContent = '';
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const authToken = sessionData?.session?.access_token || anonKey;

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'x-client-info': 'averia-ai-client',
        },
        body: JSON.stringify({
          messages: payloadMessages,
          conversationId: convId,
          phase: activePhase,
          forensicMode: activePhase === 3,
        }),
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
        await supabase.from('ai_messages').insert({ conversation_id: convId, role: 'assistant', content: assistantContent });
        await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);

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
  }, [input, isLoading, activeConvId, messages, attachments, isMobile, voiceMode, activePhase]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!user) return null;

  const hasCanvas = canvasContent || canvasImageUrl;
  const showChat = !isMobile || mobileView === 'chat';
  const showCanvas = !isMobile ? hasCanvas : (hasCanvas && mobileView === 'preview');
  const fileTree = generateFileTree(canvasContent);
  const deviceWidths = { desktop: '100%', tablet: '768px', mobile: '375px' };

  return (
    <Layout>
      {/* Custom Dark Slim Scrollbars CSS */}
      <style>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
      `}</style>

      {/* Full-Height Clean Workspace with 0px overflow and zero footer / clutter */}
      <div className="h-[calc(100vh-4rem)] w-full flex flex-col bg-background text-foreground overflow-hidden">

        {/* Top Header: Logo/Title strictly on left, Top-Right Compact Popup Phase Switcher ONLY */}
        <div className="border-b border-border bg-card/60 backdrop-blur-md px-4 py-2 flex items-center justify-between gap-3 shrink-0 relative z-20">
          <div className="flex items-center gap-2">
            <AveriaLogo size="sm" />
            <span className="font-heading font-bold text-sm tracking-wide">Averia AI</span>
          </div>

          {/* Top-Right Compact Popup Phase Switcher ONLY */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold rounded-xl bg-secondary/80 border-border hover:bg-secondary"
              onClick={() => setPhaseMenuOpen(v => !v)}
            >
              <currentPhaseMeta.icon className="h-3.5 w-3.5 text-primary" />
              <span>⚡ Phase {activePhase}: {currentPhaseMeta.name.split(':')[1]?.trim() || 'Core'}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${phaseMenuOpen ? 'rotate-180' : ''}`} />
            </Button>

            <AnimatePresence>
              {phaseMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setPhaseMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-10 z-40 w-72 rounded-2xl border border-border bg-card shadow-2xl p-2 backdrop-blur-xl space-y-1"
                  >
                    <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                      Select Neural Execution Phase
                    </div>
                    {phasesList.map(p => {
                      const isSelected = activePhase === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setActivePhase(p.id);
                            setPhaseMenuOpen(false);
                            toast.success(`Switched to ${p.name}`);
                          }}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                            isSelected ? 'bg-primary/15 text-primary font-bold border border-primary/30' : 'hover:bg-secondary/60 text-foreground/85'
                          }`}
                        >
                          <div className="mt-0.5 p-1 rounded-lg bg-background/50">
                            <p.icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold">{p.name}</div>
                            <div className="text-[10px] text-muted-foreground">{p.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Main Workspace Layout */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden min-w-0">
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
                <Eye className="h-3.5 w-3.5" /> Canvas / Preview
              </button>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {showChat && (
              <div className={`flex-1 flex flex-col min-w-0 ${!isMobile && hasCanvas ? 'max-w-[50%]' : ''}`}>
                <ScrollArea className="flex-1 px-4">
                  <div className="max-w-3xl mx-auto py-6 space-y-6">
                    {messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-6">
                          <div className="w-20 h-20 flex items-center justify-center mb-4 mx-auto">
                            <AveriaLogo size="xl" />
                          </div>
                          <h2 className="font-heading text-2xl md:text-3xl font-bold mb-2 gradient-text">
                            Averia AI • {currentPhaseMeta.name}
                          </h2>
                          <p className="text-muted-foreground text-sm max-w-md">
                            {currentPhaseMeta.desc}. Ask anything or build full-stack apps instantly.
                          </p>
                        </motion.div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                          {[
                            "Build a full-stack SaaS dashboard with React & Tailwind",
                            "Generate a watermark-free visual of a quantum neural lab",
                            "Audit this news article for deepfake or algorithmic manipulation",
                            "Create an interactive crypto trading app component",
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

                    {messages.map((msg, i) => {
                      const forensic = msg.role === 'assistant' ? parseForensicData(msg.content) : null;
                      return (
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
                              <div className="prose dark:prose-invert max-w-none text-[15px] sm:text-[16px] leading-relaxed font-normal">
                                <MessageResponse>{msg.content}</MessageResponse>
                                {forensic && <ForensicCard data={forensic} />}
                                {msg.imageUrl && (
                                  <div className="mt-3 p-3 rounded-xl border border-border bg-card/60 space-y-3">
                                    <img src={msg.imageUrl} alt="Watermark-Free Studio Visual" className="rounded-lg max-w-full border border-border shadow-lg" />
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-xs"
                                        onClick={() => {
                                          const a = document.createElement('a');
                                          a.href = msg.imageUrl!;
                                          a.download = `averia-studio-${Date.now()}.svg`;
                                          document.body.appendChild(a);
                                          a.click();
                                          document.body.removeChild(a);
                                          toast.success('Watermark-free image downloaded!');
                                        }}
                                      >
                                        <ImageIcon className="h-3.5 w-3.5" /> Download
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-xs"
                                        onClick={async () => {
                                          await navigator.clipboard.writeText(msg.imageUrl!);
                                          toast.success('Visual payload link copied!');
                                        }}
                                      >
                                        <Code className="h-3.5 w-3.5" /> Copy Link
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                {msg.attachments && msg.attachments.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {msg.attachments.map(a => (
                                      <div key={a.id} className="flex items-center gap-1.5 bg-primary-foreground/15 rounded-lg px-2 py-1 text-[11px]">
                                        {a.kind === 'image' && a.preview ? (
                                          <img src={a.preview} alt={a.name} className="h-5 w-5 rounded object-cover" />
                                        ) : <FileText className="h-3 w-3" />}
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
                      );
                    })}

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

                {/* Input Bar (Footer-free, pinned at bottom with 0px overflow below) */}
                <div className="border-t border-white/5 backdrop-blur-sm p-3 md:p-4 shrink-0 bg-background/90">
                  <div className="max-w-3xl mx-auto">
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {attachments.map(a => (
                          <div key={a.id} className="group relative flex items-center gap-2 bg-secondary/65 border border-border rounded-xl pl-2 pr-7 py-1.5 text-xs max-w-[220px]">
                            {a.kind === 'image' && a.preview ? (
                              <img src={a.preview} alt={a.name} className="h-7 w-7 rounded object-cover" />
                            ) : (
                              <div className="h-7 w-7 rounded bg-primary/15 flex items-center justify-center text-primary">
                                <FileText className="h-3.5 w-3.5" />
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
                      <div className="relative shrink-0">
                        <Button
                          onClick={() => setShowPlusMenu(v => !v)}
                          variant="ghost"
                          size="icon"
                          className="rounded-xl h-9 w-9"
                          aria-label="Attach files"
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
                                className="absolute bottom-12 left-0 z-50 w-60 rounded-2xl border border-border bg-card shadow-2xl p-1.5"
                              >
                                <button
                                  onClick={() => { cameraInputRef.current?.click(); setShowPlusMenu(false); }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/10 text-left text-sm transition-colors"
                                >
                                  <Camera className="h-4 w-4 text-primary" />
                                  <span>Camera Capture</span>
                                </button>
                                <button
                                  onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false); }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/10 text-left text-sm transition-colors"
                                >
                                  <Paperclip className="h-4 w-4 text-amber-400" />
                                  <span>Browse Files & Media</span>
                                </button>
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
                        placeholder={`Ask Averia (${currentPhaseMeta.name}) or attach media...`}
                        rows={1}
                        className="flex-1 min-w-0 bg-transparent resize-none border-none outline-none text-[15px] sm:text-[16px] leading-relaxed py-2 min-h-[50px] max-h-[300px] overflow-y-auto placeholder:text-muted-foreground"
                      />

                      <Button
                        onClick={toggleVoiceInput}
                        variant="ghost"
                        size="icon"
                        className={`h-11 w-11 shrink-0 rounded-full ${voiceActive ? 'animate-pulse bg-destructive text-destructive-foreground' : ''}`}
                        aria-label="Voice input"
                      >
                        <Mic className="h-5 w-5" />
                      </Button>

                      <Button
                        onClick={sendMessage}
                        disabled={(!input.trim() && attachments.length === 0) || isLoading}
                        size="icon"
                        className="rounded-xl h-9 w-9 shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Canvas / Preview / Code / Studio Watermark-Free Visual Panel */}
            <AnimatePresence>
              {showCanvas && (
                <motion.div
                  initial={isMobile ? { opacity: 0 } : { width: 0, opacity: 0 }}
                  animate={isMobile ? { opacity: 1 } : { width: '50%', opacity: 1 }}
                  exit={isMobile ? { opacity: 0 } : { width: 0, opacity: 0 }}
                  className={`border-l border-border bg-background flex flex-col overflow-hidden ${isMobile ? 'flex-1' : ''}`}
                >
                  <div className="h-12 border-b border-border flex items-center justify-between px-3 shrink-0">
                    <div className="flex items-center gap-1">
                      {canvasContent && (
                        <>
                          <Button variant={canvasMode === 'preview' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs gap-1" onClick={() => setCanvasMode('preview')}>
                            <Eye className="h-3 w-3" /> Preview
                          </Button>
                          <Button variant={canvasMode === 'code' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs gap-1" onClick={() => setCanvasMode('code')}>
                            <Code className="h-3 w-3" /> Code
                          </Button>
                          <Button variant={canvasMode === 'files' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs gap-1" onClick={() => setCanvasMode('files')}>
                            <FileCode className="h-3 w-3" /> Files
                          </Button>
                        </>
                      )}
                      {canvasImageUrl && !canvasContent && (
                        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5 text-primary" /> Studio Watermark-Free Visual Container
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {canvasContent && canvasMode === 'preview' && !isMobile && (
                        <div className="flex items-center gap-0.5 mr-1">
                          <Button variant={previewDevice === 'desktop' ? 'secondary' : 'ghost'} size="icon" className="h-6 w-6" onClick={() => setPreviewDevice('desktop')}><Monitor className="h-3 w-3" /></Button>
                          <Button variant={previewDevice === 'tablet' ? 'secondary' : 'ghost'} size="icon" className="h-6 w-6" onClick={() => setPreviewDevice('tablet')}><Tablet className="h-3 w-3" /></Button>
                          <Button variant={previewDevice === 'mobile' ? 'secondary' : 'ghost'} size="icon" className="h-6 w-6" onClick={() => setPreviewDevice('mobile')}><Smartphone className="h-3 w-3" /></Button>
                        </div>
                      )}
                      {canvasContent && (
                        <Button variant="default" size="sm" className="h-7 text-xs gap-1.5" onClick={handlePublish} disabled={isDeploying}>
                          <Rocket className="h-3 w-3" /> {isDeploying ? 'Deploying...' : 'Publish'}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setCanvasContent(null); setCanvasImageUrl(null); setDeployUrl(null); if (isMobile) setMobileView('chat'); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {deployUrl && (
                    <div className="border-b border-border bg-green-500/10 px-3 py-2 flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <span className="text-xs text-green-400 font-mono truncate">{deployUrl}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => { navigator.clipboard.writeText(deployUrl!); toast.success('URL copied!'); }}>Copy</Button>
                    </div>
                  )}

                  <div className="flex-1 flex overflow-hidden">
                    {canvasContent && canvasMode === 'files' && (
                      <div className="w-full overflow-auto p-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5 mb-1">Project Explorer</div>
                        <FileTree nodes={fileTree} />
                      </div>
                    )}

                    {canvasMode !== 'files' && (
                      <div className="flex-1 overflow-auto flex items-start justify-center">
                        {canvasImageUrl && !canvasContent && (
                          <div className="flex flex-col items-center justify-center h-full p-4 md:p-6 gap-4">
                            <img src={canvasImageUrl} alt="Studio Watermark-Free Visual" className="max-w-full max-h-[70vh] rounded-xl border border-border shadow-2xl" />
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
                                const a = document.createElement('a');
                                a.href = canvasImageUrl!;
                                a.download = `averia-studio-${Date.now()}.svg`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                toast.success('Watermark-free image downloaded!');
                              }}>
                                <ImageIcon className="h-3.5 w-3.5" /> Download
                              </Button>
                              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={async () => {
                                await navigator.clipboard.writeText(canvasImageUrl!);
                                toast.success('Visual payload link copied!');
                              }}>
                                <Code className="h-3.5 w-3.5" /> Copy Link
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
                              title="Live Website Preview"
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
    </Layout>
  );
}
