import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, ArrowLeft, Search, Plus, Image as ImageIcon, FileText, Mic, ShieldCheck,
  Lock, MoreVertical, Paperclip, X, CheckCheck, Check, Pin, Square, Loader2, Reply,
  MessageSquarePlus, Users, Flame, Radio, BellOff, Archive, Bookmark, Clock,
  PenLine, Languages, CalendarPlus, Smile, Sparkles, MonitorPlay, MapPin, Download,
  Megaphone, ShieldAlert, FileDown, Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
} from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { UserAvatar } from '@/components/UserAvatar';
import { NewChatModal, type ChatProfile } from '@/components/chat/NewChatModal';
import { ChatMedia, MediaLightbox, AudioWave } from '@/components/chat/ChatMedia';
import { ChatAIAssistant } from '@/components/chat/ChatAIAssistant';
import { ChatCanvas } from '@/components/chat/ChatCanvas';
import { EscrowDialog } from '@/components/chat/EscrowDialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useScope } from '@/lib/scope';
import { askAveria } from '@/lib/averiaChat';
import { exportEncryptedJson, exportPrintablePdf, downloadIcs } from '@/lib/exportThread';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const sb = supabase as any;

interface ChatMsg {
  id: string; sender_id: string; receiver_id: string; content: string; kind: string;
  media_url: string | null; metadata: any; reply_to: string | null; read: boolean;
  self_destruct: boolean; viewed_at: string | null; created_at: string;
}
interface ContactRow {
  contact_id: string; pinned: boolean; muted: boolean; archived: boolean;
  guard: boolean; disappear_seconds: number;
}
interface Contact {
  userId: string; name: string; avatar?: string | null; averiaId?: string | null;
  last: string; lastAt: string | null; unread: number; hasVault: boolean; row?: ContactRow;
}
interface Bookmark { id: string; label: string; content: string | null; message_id: string | null }

const MEDIA_KINDS = ['image', 'video', 'voice', 'file'];
const URL_RE = /https?:\/\/[^\s]+/gi;

const fmt = (d: string | null) => {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), day = Math.floor(diff / 86400000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  if (day < 7) return `${day}d`;
  return new Date(d).toLocaleDateString();
};

const preview = (m: ChatMsg | undefined) => {
  if (!m) return 'Tap to start a secure thread';
  if (m.kind === 'image') return '📷 Photo';
  if (m.kind === 'video') return '🎬 Video';
  if (m.kind === 'file') return '📄 Document';
  if (m.kind === 'voice') return '🎙 Voice note';
  if (m.kind === 'location') return '📍 Location';
  if (m.kind === 'vault' || m.kind === 'vault_burned') return '🔒 Encrypted one-time code';
  if (m.kind === 'pin') return '📌 Pinned workspace item';
  if (m.kind === 'deal') return '🤝 Escrow agreement';
  return m.content;
};

/** Best-effort natural date detection for the AI task scheduler. */
function detectDate(text: string): Date | null {
  const t = text.toLowerCase();
  const time = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const base = new Date();
  let matched = false;
  if (/\btomorrow\b/.test(t)) { base.setDate(base.getDate() + 1); matched = true; }
  else if (/\btoday\b|\btonight\b/.test(t)) { matched = true; }
  else {
    const dm = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (dm) {
      base.setDate(Number(dm[1])); base.setMonth(Number(dm[2]) - 1);
      if (dm[3]) base.setFullYear(Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]));
      matched = true;
    }
  }
  if (time) {
    let h = Number(time[1]) % 12;
    if (time[3] === 'pm') h += 12;
    base.setHours(h, Number(time[2] ?? 0), 0, 0);
    matched = true;
  }
  return matched ? base : null;
}

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scope = useScope();
  const isJoint = scope.isJoint && !!scope.workspaceId;
  const table = isJoint ? 'joint_workspace_chats' : 'user_personal_chats';
  const envTag = isJoint ? `joint:${scope.workspaceId}` : 'personal';

  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [threadQuery, setThreadQuery] = useState('');
  const [showThreadSearch, setShowThreadSearch] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'vault' | 'pinned'>('all');
  const [loading, setLoading] = useState(true);
  const [newChat, setNewChat] = useState(false);
  const [online, setOnline] = useState<string[]>([]);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultCode, setVaultCode] = useState('');
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaTab, setMediaTab] = useState<'visual' | 'voice' | 'vault'>('visual');
  const [pinPickerOpen, setPinPickerOpen] = useState(false);
  const [pinItems, setPinItems] = useState<any[]>([]);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [lightbox, setLightbox] = useState<ChatMsg | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(true);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [translate, setTranslate] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [escrowOpen, setEscrowOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPwd, setExportPwd] = useState('');
  const [massOpen, setMassOpen] = useState(false);
  const [massSel, setMassSel] = useState<string[]>([]);
  const [massText, setMassText] = useState('');
  const [summary, setSummary] = useState<{ name: string; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const typingCh = useRef<any>(null);

  useEffect(() => { if (!user) navigate('/auth'); }, [user, navigate]);

  /* ---------------- isolated load per environment ---------------- */
  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = sb.from(table).select('*').order('created_at', { ascending: true });
    if (isJoint) q = q.eq('workspace_id', scope.workspaceId);
    const [{ data: mrows }, { data: cts }, { data: bms }, { data: notes }] = await Promise.all([
      q,
      sb.from('chat_contacts').select('*').eq('owner_id', user.id).eq('environment_context', envTag),
      sb.from('chat_bookmarks').select('*').eq('user_id', user.id).eq('environment_context', envTag),
      sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    ]);
    const list: ChatMsg[] = (mrows ?? []) as ChatMsg[];
    const contactRows: ContactRow[] = (cts ?? []) as ContactRow[];
    setMsgs(list);
    setRows(contactRows);
    setBookmarks((bms ?? []) as Bookmark[]);
    setBroadcasts(notes ?? []);
    const ids = new Set<string>(contactRows.map((r) => r.contact_id));
    list.forEach((m) => { ids.add(m.sender_id); ids.add(m.receiver_id); });
    ids.delete(user.id);
    if (ids.size) {
      const { data: pr } = await supabase.from('profiles')
        .select('user_id, full_name, display_name, avatar_url, averia_id').in('user_id', Array.from(ids));
      setProfiles(Object.fromEntries((pr ?? []).map((p: any) => [p.user_id, p])));
    } else setProfiles({});
    setLoading(false);
  }, [user, table, isJoint, scope.workspaceId, envTag]);

  useEffect(() => {
    setMsgs([]); setProfiles({}); setRows([]); setActive(null); setRevealed({}); setBookmarks([]);
    loadAll();
  }, [loadAll]);

  /* ---------------- realtime: messages, contacts, bookmarks, presence, typing ---------------- */
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`chat-sync-${envTag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (p: any) => {
        const row = (p.new ?? p.old) as ChatMsg;
        if (!row) return;
        if (isJoint && (row as any).workspace_id !== scope.workspaceId) return;
        if (!isJoint && row.sender_id !== user.id && row.receiver_id !== user.id) return;
        setMsgs((prev) => {
          if (p.eventType === 'DELETE') return prev.filter((m) => m.id !== row.id);
          const i = prev.findIndex((m) => m.id === row.id);
          if (i >= 0) { const c = [...prev]; c[i] = row; return c; }
          return [...prev, row];
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_contacts' }, (p: any) => {
        const row = (p.new ?? p.old) as any;
        if (!row || row.owner_id !== user.id || row.environment_context !== envTag) return;
        setRows((prev) => {
          if (p.eventType === 'DELETE') return prev.filter((r) => r.contact_id !== row.contact_id);
          const i = prev.findIndex((r) => r.contact_id === row.contact_id);
          if (i >= 0) { const c = [...prev]; c[i] = row; return c; }
          return [...prev, row];
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_bookmarks' }, () => {
        sb.from('chat_bookmarks').select('*').eq('user_id', user.id).eq('environment_context', envTag)
          .then(({ data }: any) => setBookmarks(data ?? []));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (p: any) => {
        setBroadcasts((b) => [p.new, ...b].slice(0, 5));
      })
      .subscribe();

    const pres = supabase.channel('averia-presence', { config: { presence: { key: user.id } } })
      .on('presence', { event: 'sync' }, () => setOnline(Object.keys(pres.presenceState())))
      .subscribe(async (s) => { if (s === 'SUBSCRIBED') await pres.track({ at: Date.now() }); });

    const typing = supabase.channel(`typing-${envTag}`)
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload?.from === user.id) return;
        setTypingFrom(payload.from);
        setTimeout(() => setTypingFrom((f) => (f === payload.from ? null : f)), 2500);
      })
      .subscribe();
    typingCh.current = typing;

    return () => {
      supabase.removeChannel(ch); supabase.removeChannel(pres); supabase.removeChannel(typing);
    };
  }, [user, table, envTag, isJoint, scope.workspaceId]);

  /* ---------------- disappearing message sweeper ---------------- */
  useEffect(() => {
    const tick = async () => {
      const now = Date.now();
      const dead = msgs.filter((m) => m.metadata?.expires_at && new Date(m.metadata.expires_at).getTime() < now);
      if (!dead.length) return;
      setMsgs((p) => p.filter((m) => !dead.some((d) => d.id === m.id)));
      const mine = dead.filter((m) => m.sender_id === user?.id).map((m) => m.id);
      if (mine.length) await sb.from(table).delete().in('id', mine);
    };
    const id = setInterval(tick, 20000);
    tick();
    return () => clearInterval(id);
  }, [msgs, table, user?.id]);

  const rowFor = useCallback((id: string) => rows.find((r) => r.contact_id === id), [rows]);

  /* ---------------- derived contact list ---------------- */
  const contacts: Contact[] = useMemo(() => {
    if (!user) return [];
    const map = new Map<string, ChatMsg[]>();
    rows.forEach((r) => map.set(r.contact_id, []));
    msgs.forEach((m) => {
      const peer = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (peer === user.id) return;
      if (!map.has(peer)) map.set(peer, []);
      map.get(peer)!.push(m);
    });
    const out: Contact[] = Array.from(map.entries()).map(([id, list]) => {
      const p = profiles[id];
      const last = list[list.length - 1];
      return {
        userId: id,
        name: p?.display_name || p?.full_name || 'Agent',
        avatar: p?.avatar_url,
        averiaId: p?.averia_id,
        last: preview(last),
        lastAt: last?.created_at ?? null,
        unread: list.filter((m) => m.receiver_id === user.id && !m.read).length,
        hasVault: list.some((m) => m.kind === 'vault' || m.kind === 'vault_burned'),
        row: rows.find((r) => r.contact_id === id),
      };
    });
    const t = listQuery.trim().toLowerCase();
    return out
      .filter((c) => (filter === 'pinned' ? c.row?.pinned : filter === 'unread' ? c.unread > 0 : filter === 'vault' ? c.hasVault : !c.row?.archived))
      .filter((c) => !t || c.name.toLowerCase().includes(t) || (c.averiaId ?? '').toLowerCase().includes(t))
      .sort((a, b) => {
        if (!!a.row?.pinned !== !!b.row?.pinned) return a.row?.pinned ? -1 : 1;
        return new Date(b.lastAt ?? 0).getTime() - new Date(a.lastAt ?? 0).getTime();
      });
  }, [msgs, profiles, rows, user, listQuery, filter]);

  const activeRow = active ? rowFor(active) : undefined;
  const guardOn = !!activeRow?.guard;

  const thread = useMemo(() => {
    if (!user || !active) return [];
    const t = threadQuery.trim().toLowerCase();
    return msgs
      .filter((m) => (m.sender_id === user.id && m.receiver_id === active) || (m.sender_id === active && m.receiver_id === user.id))
      .filter((m) => !t || (m.content ?? '').toLowerCase().includes(t));
  }, [msgs, active, user, threadQuery]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.length, active]);

  /* mark read */
  useEffect(() => {
    if (!user || !active) return;
    const unread = msgs.filter((m) => m.sender_id === active && m.receiver_id === user.id && !m.read).map((m) => m.id);
    if (!unread.length) return;
    sb.from(table).update({ read: true }).in('id', unread).then(() => {
      setMsgs((p) => p.map((m) => (unread.includes(m.id) ? { ...m, read: true } : m)));
    });
  }, [active, msgs, user, table]);

  /* ---------------- send helpers ---------------- */
  const insertMsg = async (payload: Partial<ChatMsg>, to?: string) => {
    const target = to ?? active;
    if (!user || !target) return;
    const secs = rowFor(target)?.disappear_seconds ?? 0;
    const meta = { ...(payload.metadata ?? {}) };
    if (secs > 0) meta.expires_at = new Date(Date.now() + secs * 1000).toISOString();
    const base: any = {
      sender_id: user.id, receiver_id: target, content: '', kind: 'text',
      reply_to: to ? null : replyTo?.id ?? null, ...payload, metadata: meta,
    };
    if (isJoint) base.workspace_id = scope.workspaceId;
    const { error } = await sb.from(table).insert(base);
    if (error) { toast.error(error.message || 'Send failed'); return; }
    if (!to) setReplyTo(null);
  };

  const send = async () => {
    if (!text.trim()) return;
    const body = text.trim();
    setText(''); setQuickReplies([]);
    await insertMsg({ content: body });
  };

  const onType = (v: string) => {
    setText(v);
    typingCh.current?.send({ type: 'broadcast', event: 'typing', payload: { from: user?.id, to: active } });
  };

  const upload = async (file: File, kind: 'image' | 'video' | 'file' | 'voice', extra: any = {}) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    const { error } = await supabase.storage.from('chat-media').upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) { toast.error('Upload failed: ' + error.message); return; }
    await insertMsg({ kind, media_url: path, content: kind === 'file' ? file.name : '', metadata: { name: file.name, size: file.size, ...extra } });
  };

  const pickMedia = (f: File) => upload(f, f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'voice' : 'image');

  const toggleRecord = async () => {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        await upload(new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' }), 'voice');
      };
      recorder.current = mr; mr.start(); setRecording(true); setPlusOpen(false);
      toast.info('Recording — tap stop to send');
    } catch { toast.error('Microphone access denied'); }
  };

  const shareLocation = () => {
    setPlusOpen(false);
    if (!navigator.geolocation) { toast.error('Location unsupported on this device'); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await insertMsg({
          kind: 'location',
          content: `Live location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          metadata: { lat: latitude, lng: longitude },
        });
      },
      () => toast.error('Location permission denied'),
    );
  };

  /** Screen snapshot with instant Averia analysis. */
  const screenSnapshot = async () => {
    setPlusOpen(false);
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      await new Promise((r) => setTimeout(r, 400));
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d')!.drawImage(video, 0, 0);
      track.stop();
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      await upload(new File([blob], `snapshot-${Date.now()}.png`, { type: 'image/png' }), 'image', { snapshot: true });
      toast.success('Screen snapshot shared');
    } catch { toast.error('Screen capture cancelled'); }
  };

  const sendVault = async () => {
    if (!vaultCode.trim()) return;
    await insertMsg({ kind: 'vault', content: vaultCode, self_destruct: true });
    setVaultCode(''); setVaultOpen(false);
    toast.success('One-time encrypted snippet sent');
  };

  const burn = async (m: ChatMsg) => {
    setRevealed((r) => ({ ...r, [m.id]: m.content }));
    await sb.from(table).update({ content: '', viewed_at: new Date().toISOString(), kind: 'vault_burned' }).eq('id', m.id);
  };

  /* ---------------- verification ---------------- */
  const verify = async (m: ChatMsg) => {
    setVerifying(m.id);
    try {
      const isMedia = MEDIA_KINDS.includes(m.kind);
      let payload = m.content;
      if (isMedia && m.media_url) {
        const { data } = await supabase.storage.from('chat-media').createSignedUrl(m.media_url, 600);
        payload = `${m.kind.toUpperCase()} attachment shared in chat (${m.metadata?.name ?? 'file'}): ${data?.signedUrl ?? m.media_url}`;
      }
      const { data, error } = await supabase.functions.invoke('verify-fact', {
        body: { content: payload, contentType: isMedia ? m.kind : 'url' },
      });
      if (error) throw error;
      const res: any = (data as any)?.data ?? data;
      const meta = { ...(m.metadata || {}), verify: { verdict: res?.verdict ?? 'Unclear', score: res?.trustScore ?? null, reasoning: res?.reasoning } };
      await sb.from(table).update({ metadata: meta }).eq('id', m.id);
      setMsgs((p) => p.map((x) => (x.id === m.id ? { ...x, metadata: meta } : x)));
    } catch { toast.error('Verification unavailable right now'); }
    setVerifying(null);
  };

  /* ---------------- reactions & AI helpers ---------------- */
  const react = async (m: ChatMsg, emoji: string) => {
    const reactions = { ...(m.metadata?.reactions ?? {}) };
    reactions[emoji] = Array.from(new Set([...(reactions[emoji] ?? []), user!.id]));
    const meta = { ...(m.metadata ?? {}), reactions };
    setMsgs((p) => p.map((x) => (x.id === m.id ? { ...x, metadata: meta } : x)));
    await sb.from(table).update({ metadata: meta }).eq('id', m.id);
  };

  const rephrase = async (m: ChatMsg) => {
    setAiBusy(true);
    try {
      const out = await askAveria([{ role: 'user', content: `Rephrase this chat message to be clear and professional. Reply with the rewritten message only:\n\n${m.content}` }]);
      setText(out);
      toast.success('Rephrased into your composer');
    } catch (e: any) { toast.error(e.message); }
    setAiBusy(false);
  };

  const suggestReplies = async () => {
    if (!thread.length) return;
    setAiBusy(true);
    try {
      const last = thread.slice(-6).map((m) => `${m.sender_id === user!.id ? 'Me' : 'Them'}: ${m.content || preview(m)}`).join('\n');
      const out = await askAveria([{ role: 'user', content: `Suggest 3 very short chat replies (max 5 words each) for this conversation. Reply as a plain list, one per line, no numbering:\n${last}` }]);
      setQuickReplies(out.split('\n').map((s) => s.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 3));
    } catch (e: any) { toast.error(e.message); }
    setAiBusy(false);
  };

  const summarize = async (c: Contact) => {
    setAiBusy(true);
    try {
      const list = msgs.filter((m) => m.sender_id === c.userId || m.receiver_id === c.userId).slice(-40)
        .map((m) => `${m.sender_id === user!.id ? 'Me' : c.name}: ${m.content || preview(m)}`).join('\n');
      const out = await askAveria([{ role: 'user', content: `Summarise this conversation. Give "Key points" and "Pending tasks" as short bullet lists:\n${list}` }]);
      setSummary({ name: c.name, text: out });
    } catch (e: any) { toast.error(e.message); }
    setAiBusy(false);
  };

  const translateMsg = async (m: ChatMsg) => {
    if (translations[m.id]) return;
    try {
      const out = await askAveria([{ role: 'user', content: `Translate this message into ${navigator.language || 'English'}. Reply with the translation only:\n${m.content}` }]);
      setTranslations((t) => ({ ...t, [m.id]: out }));
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!translate) return;
    thread.filter((m) => m.sender_id !== user?.id && m.kind === 'text' && m.content && !translations[m.id])
      .slice(-8).forEach(translateMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translate, thread.length]);

  /* ---------------- contact row controls ---------------- */
  const setRowFlag = async (contactId: string, patch: Partial<ContactRow>) => {
    if (!user) return;
    const existing = rowFor(contactId);
    const next = { owner_id: user.id, contact_id: contactId, environment_context: envTag, ...existing, ...patch };
    delete (next as any).id;
    const { error } = await sb.from('chat_contacts').upsert(next, { onConflict: 'owner_id,contact_id,environment_context' });
    if (error) { toast.error(error.message); return; }
    setRows((p) => {
      const i = p.findIndex((r) => r.contact_id === contactId);
      const merged = { contact_id: contactId, pinned: false, muted: false, archived: false, guard: false, disappear_seconds: 0, ...existing, ...patch } as ContactRow;
      if (i >= 0) { const c = [...p]; c[i] = merged; return c; }
      return [...p, merged];
    });
  };

  const addContact = async (p: ChatProfile) => {
    if (!user) return;
    await sb.from('chat_contacts').upsert(
      { owner_id: user.id, contact_id: p.user_id, environment_context: envTag },
      { onConflict: 'owner_id,contact_id,environment_context' },
    );
    setProfiles((prev) => ({ ...prev, [p.user_id]: p }));
    setRows((prev) => prev.some((r) => r.contact_id === p.user_id) ? prev
      : [...prev, { contact_id: p.user_id, pinned: false, muted: false, archived: false, guard: false, disappear_seconds: 0 }]);
    setActive(p.user_id);
  };

  const removeContact = async (id: string) => {
    if (!user) return;
    await sb.from('chat_contacts').delete().eq('owner_id', user.id).eq('contact_id', id).eq('environment_context', envTag);
    setRows((p) => p.filter((r) => r.contact_id !== id));
    if (active === id) setActive(null);
    toast.success('Contact removed');
  };

  const clearThread = async () => {
    if (!user || !active) return;
    const ids = thread.filter((m) => m.sender_id === user.id).map((m) => m.id);
    if (!ids.length) return;
    await sb.from(table).delete().in('id', ids);
    setMsgs((p) => p.filter((m) => !ids.includes(m.id)));
    toast.success('Your messages deleted');
  };

  /* ---------------- bookmarks ---------------- */
  const addBookmark = async (m: ChatMsg) => {
    if (!user || !active) return;
    const { data, error } = await sb.from('chat_bookmarks').insert({
      user_id: user.id, peer_id: active, environment_context: envTag,
      message_id: m.id, label: (m.content || preview(m)).slice(0, 60), content: m.content,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setBookmarks((b) => [...b, data]);
    toast.success('Pinned as sticky note');
  };

  const removeBookmark = async (id: string) => {
    await sb.from('chat_bookmarks').delete().eq('id', id);
    setBookmarks((b) => b.filter((x) => x.id !== id));
  };

  const threadBookmarks = bookmarks.filter((b: any) => b.peer_id === active);

  /* ---------------- export ---------------- */
  const doExport = async (mode: 'json' | 'pdf') => {
    const rowsOut = thread.map((m) => ({
      who: m.sender_id === user!.id ? 'Me' : activeName,
      when: new Date(m.created_at).toLocaleString(),
      body: m.content || preview(m),
    }));
    if (mode === 'pdf') {
      if (!exportPrintablePdf(`Averia thread — ${activeName}`, rowsOut)) toast.error('Allow pop-ups to export PDF');
      setExportOpen(false);
      return;
    }
    if (exportPwd.length < 4) { toast.error('Use a password of at least 4 characters'); return; }
    await exportEncryptedJson(`averia-thread-${activeName}`, { peer: activeName, exported: new Date().toISOString(), messages: rowsOut }, exportPwd);
    setExportPwd(''); setExportOpen(false);
    toast.success('Encrypted archive downloaded');
  };

  /* ---------------- mass broadcast ---------------- */
  const sendBroadcast = async () => {
    if (!massText.trim() || !massSel.length) return;
    for (const id of massSel) await insertMsg({ content: massText.trim(), metadata: { broadcast: true } }, id);
    if (user) {
      await sb.from('notifications').insert(massSel.map((id) => ({
        user_id: id, type: 'broadcast', title: 'Broadcast alert', body: massText.trim().slice(0, 160),
      })));
    }
    toast.success(`Broadcast sent to ${massSel.length} contacts`);
    setMassText(''); setMassSel([]); setMassOpen(false);
  };

  const openPinPicker = async () => {
    setPlusOpen(false);
    const { data } = isJoint
      ? await sb.from('shared_vault_items').select('id,title,content,kind').eq('workspace_id', scope.workspaceId).order('created_at', { ascending: false }).limit(20)
      : await sb.from('vault_items').select('id,title,content,kind').eq('user_id', user?.id).eq('environment_context', envTag).order('created_at', { ascending: false }).limit(20);
    setPinItems(data ?? []);
    setPinPickerOpen(true);
  };

  const pinItem = async (it: any) => {
    setPinPickerOpen(false);
    await insertMsg({ kind: 'pin', content: it.title || 'Workspace item', metadata: { note: (it.content ?? '').slice(0, 240), itemId: it.id } });
  };

  const activeProfile = active ? profiles[active] : null;
  const activeName = activeProfile?.display_name || activeProfile?.full_name || 'Agent';
  const sharedVisual = thread.filter((m) => ['image', 'video'].includes(m.kind));
  const sharedVoice = thread.filter((m) => m.kind === 'voice');
  const sharedFiles = thread.filter((m) => m.kind === 'file');

  if (!user) return null;

  const disappearLabel = (s?: number) => (!s ? 'Off' : s >= 604800 ? '7d' : s >= 86400 ? '24h' : `${s}s`);

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-background pt-0">
      <div className="flex-1 min-h-0 flex">
        {/* ============ CHAT LIST ============ */}
        <aside className={`w-full md:w-[310px] xl:w-[340px] shrink-0 border-r border-border/60 flex flex-col min-h-0 ${active ? 'hidden md:flex' : 'flex'}`}>
          <div className="w-full pl-14 pr-3 md:px-3 pt-3 pb-2 border-b border-white/5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h1 className="font-heading text-lg md:text-xl font-semibold tracking-tight whitespace-nowrap flex items-center gap-1.5">
                Messages
                {isJoint && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">JOINT</span>}
              </h1>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Mass broadcast" onClick={() => setMassOpen(true)}>
                  <Megaphone className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" className="h-7 px-2 text-[11px] gap-1" onClick={() => setNewChat(true)}>
                  <Plus className="h-3.5 w-3.5" /> New Chat
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={listQuery} onChange={(e) => setListQuery(e.target.value)}
                placeholder="Search conversations or Averia ID..." className="pl-8 h-8 text-xs bg-secondary/40" />
            </div>
            <div className="flex w-full gap-1.5 overflow-x-auto no-scrollbar">
              {([['all', 'All'], ['unread', 'Unread'], ['vault', 'Encrypted Vault'], ['pinned', 'Pinned']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k as any)}
                  className={`px-2.5 py-1 rounded-full text-[10px] whitespace-nowrap transition ${
                    filter === k ? 'bg-zinc-700 text-foreground' : 'bg-zinc-900 text-muted-foreground hover:bg-zinc-800'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Broadcast hub */}
          {broadcasts.length > 0 && (
            <div className="px-3 py-2 border-b border-cyan-300/20 bg-cyan-400/5">
              <p className="text-[9px] uppercase tracking-wider text-cyan-300/80 flex items-center gap-1 mb-1">
                <Radio className="h-3 w-3" /> Broadcast hub
              </p>
              <p className="text-[11px] font-medium truncate">{broadcasts[0].title}</p>
              <p className="text-[10px] text-muted-foreground truncate">{broadcasts[0].body}</p>
            </div>
          )}

          <ScrollArea className="flex-1 min-h-0 thin-scroll">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-14 px-6">
                <MessageSquarePlus className="h-10 w-10 mx-auto mb-3 text-primary/50" />
                <p className="text-xs text-muted-foreground">No threads here. Attach a contact via their Averia ID.</p>
                <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]" onClick={() => setNewChat(true)}>+ New Chat</Button>
              </div>
            ) : contacts.map((c) => (
              <ContextMenu key={c.userId}>
                <ContextMenuTrigger asChild>
                  <div
                    onClick={() => setActive(c.userId)}
                    className={`group w-full flex items-center gap-2.5 px-3 py-2 border-b border-border/30 text-left cursor-pointer transition-colors ${active === c.userId ? 'bg-primary/10' : 'hover:bg-secondary/40'}`}
                  >
                    <div className="relative shrink-0">
                      <span className={online.includes(c.userId) ? 'block rounded-full ring-2 ring-cyan-400/80 shadow-[0_0_12px_-1px_rgba(34,211,238,0.9)] animate-pulse' : 'block'}>
                        <UserAvatar url={c.avatar} name={c.name} size="sm" />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium truncate flex items-center gap-1">
                          {c.row?.pinned && <Pin className="h-2.5 w-2.5 text-cyan-300" />}
                          {c.row?.muted && <BellOff className="h-2.5 w-2.5 text-muted-foreground" />}
                          {c.name}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{fmt(c.lastAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground truncate">{c.last}</p>
                        {c.unread > 0 && (
                          <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-cyan-400 text-[10px] font-bold text-slate-900 flex items-center justify-center">{c.unread}</span>
                        )}
                      </div>
                    </div>
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button title="Pin" onClick={(e) => { e.stopPropagation(); setRowFlag(c.userId, { pinned: !c.row?.pinned }); }} className="h-6 w-6 grid place-items-center rounded hover:bg-secondary"><Pin className="h-3 w-3" /></button>
                      <button title="Mute" onClick={(e) => { e.stopPropagation(); setRowFlag(c.userId, { muted: !c.row?.muted }); }} className="h-6 w-6 grid place-items-center rounded hover:bg-secondary"><BellOff className="h-3 w-3" /></button>
                      <button title="Archive" onClick={(e) => { e.stopPropagation(); setRowFlag(c.userId, { archived: !c.row?.archived }); }} className="h-6 w-6 grid place-items-center rounded hover:bg-secondary"><Archive className="h-3 w-3" /></button>
                      {c.unread > 0 && (
                        <button title="AI summary" onClick={(e) => { e.stopPropagation(); summarize(c); }} className="h-6 w-6 grid place-items-center rounded hover:bg-secondary"><Sparkles className="h-3 w-3 text-cyan-300" /></button>
                      )}
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="z-[130] w-52">
                  <ContextMenuItem onClick={() => setRowFlag(c.userId, { pinned: !c.row?.pinned })}>{c.row?.pinned ? 'Unpin' : 'Pin'} conversation</ContextMenuItem>
                  <ContextMenuItem onClick={() => setRowFlag(c.userId, { muted: !c.row?.muted })}>{c.row?.muted ? 'Unmute' : 'Mute'}</ContextMenuItem>
                  <ContextMenuItem onClick={() => setRowFlag(c.userId, { archived: !c.row?.archived })}>{c.row?.archived ? 'Unarchive' : 'Archive'}</ContextMenuItem>
                  <ContextMenuItem onClick={() => setRowFlag(c.userId, { guard: !c.row?.guard })}>
                    {c.row?.guard ? 'Disable' : 'Enable'} security guard
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => summarize(c)}>AI priority summary</ContextMenuItem>
                  <ContextMenuItem className="text-destructive" onClick={() => removeContact(c.userId)}>Remove contact</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </ScrollArea>
        </aside>

        {/* ============ THREAD ============ */}
        <AnimatePresence mode="wait">
          <motion.section
            key={active ?? 'empty'}
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={`flex-1 min-w-0 flex flex-col min-h-0 ${active ? 'flex' : 'hidden md:flex'}`}
          >
            {!active || !activeProfile ? (
              <div className="flex-1 flex items-center justify-center text-center px-6">
                <div>
                  <Users className="h-12 w-12 mx-auto mb-3 text-primary/40" />
                  <p className="text-sm text-muted-foreground">Select a thread to open the encrypted workspace</p>
                </div>
              </div>
            ) : (
              <>
                <header className="h-14 shrink-0 pl-14 md:pl-3 pr-14 border-b border-white/5 flex flex-row items-center justify-between gap-1.5 bg-card/40 backdrop-blur-sm shadow-none">
                  <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setActive(null)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="relative shrink-0">
                    <span className={online.includes(active) ? 'block rounded-full ring-2 ring-cyan-400/80 shadow-[0_0_12px_-1px_rgba(34,211,238,0.9)]' : 'block'}>
                      <UserAvatar url={activeProfile.avatar_url} name={activeName} size="sm" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-semibold truncate">{activeName}</p>
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-primary/15 text-primary border border-primary/25 shrink-0">{activeProfile.averia_id}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {typingFrom === active ? 'typing…' : online.includes(active) ? 'Online' : 'Offline'}
                    </p>
                  </div>

                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowThreadSearch((v) => !v)} title="Search in chat">
                    <Search className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[130] w-56">
                      <DropdownMenuItem onClick={() => setTranslate((v) => !v)}>
                        <Languages className="h-3.5 w-3.5 mr-2" /> Live translator {translate ? '· On' : '· Off'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mb-1">
                          <Clock className="h-3 w-3" /> Self-destruct: {disappearLabel(activeRow?.disappear_seconds)}
                        </p>
                        <div className="flex gap-1">
                          {[['Off', 0], ['24h', 86400], ['7d', 604800]].map(([label, secs]) => (
                            <button key={label as string} onClick={() => setRowFlag(active, { disappear_seconds: secs as number })}
                              className="px-2 py-1 rounded-full text-[11px] bg-zinc-900 hover:bg-zinc-700">{label}</button>
                          ))}
                        </div>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setMediaOpen(true)}>
                        <Paperclip className="h-3.5 w-3.5 mr-2" /> Shared media
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setCanvasOpen(true)}>Shared canvas</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEscrowOpen(true)}>Escrow deal locker</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setExportOpen(true)}>Export thread</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-[12px] flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5 text-cyan-300" /> Security guard</span>
                        <Switch checked={guardOn} onCheckedChange={(v) => setRowFlag(active, { guard: v })} />
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={clearThread}>Delete my messages</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => removeContact(active)} className="text-destructive">Remove contact</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </header>

                {/* Sticky bookmark sub-header */}
                {threadBookmarks.length > 0 && (
                  <div className="shrink-0 border-b border-cyan-300/20 bg-cyan-400/5 px-3 py-1.5">
                    <button onClick={() => setShowBookmarks((v) => !v)} className="text-[9px] uppercase tracking-wider text-cyan-300/80 flex items-center gap-1">
                      <Bookmark className="h-3 w-3" /> Sticky notes ({threadBookmarks.length})
                    </button>
                    {showBookmarks && (
                      <div className="flex gap-1.5 mt-1.5 overflow-x-auto no-scrollbar">
                        {threadBookmarks.map((b) => (
                          <span key={b.id} className="shrink-0 max-w-[200px] flex items-center gap-1 px-2 py-1 rounded-lg border border-cyan-300/30 bg-background/50 text-[10px]">
                            <span className="truncate">{b.label}</span>
                            <button onClick={() => removeBookmark(b.id)}><X className="h-2.5 w-2.5" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {showThreadSearch && (
                  <div className="px-3 py-2 border-b border-border/40">
                    <Input value={threadQuery} onChange={(e) => setThreadQuery(e.target.value)} placeholder="Search in this thread…" className="h-8 text-xs bg-secondary/40" />
                  </div>
                )}

                {/* messages */}
                <ScrollArea className="flex-1 min-h-0 thin-scroll">
                  <div className="px-3 py-3 space-y-1.5">
                    {thread.map((m) => {
                      const mine = m.sender_id === user.id;
                      const parent = m.reply_to ? msgs.find((x) => x.id === m.reply_to) : null;
                      const v = m.metadata?.verify;
                      const isMedia = MEDIA_KINDS.includes(m.kind);
                      const blockedLink = guardOn && !mine && URL_RE.test(m.content ?? '');
                      const due = !mine && m.kind === 'text' ? detectDate(m.content ?? '') : null;
                      const reactions: Record<string, string[]> = m.metadata?.reactions ?? {};
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`group relative max-w-[82%] sm:max-w-[68%] px-2.5 py-1.5 rounded-2xl text-[13px] leading-snug ${
                              mine
                                ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white rounded-br-sm'
                                : 'bg-secondary/50 backdrop-blur border border-border/50 rounded-bl-sm'
                            }`}
                          >
                            {/* hover action overlay */}
                            <div className={`absolute -top-3 ${mine ? 'right-1' : 'left-1'} hidden group-hover:flex items-center gap-0.5 rounded-full border border-border/60 bg-background/95 backdrop-blur px-1 py-0.5 shadow z-10`}>
                              {['👍', '🔥', '✅', '❤️'].map((e) => (
                                <button key={e} onClick={() => react(m, e)} className="text-[11px] px-0.5 hover:scale-125 transition">{e}</button>
                              ))}
                              <button onClick={() => setReplyTo(m)} title="Reply" className="px-0.5"><Reply className="h-3 w-3" /></button>
                              <button onClick={() => addBookmark(m)} title="Pin as sticky note" className="px-0.5"><Bookmark className="h-3 w-3" /></button>
                              {m.content && <button onClick={() => rephrase(m)} title="AI rephrase" className="px-0.5"><Wand2 className="h-3 w-3 text-cyan-400" /></button>}
                            </div>

                            {parent && (
                              <div className={`mb-1 px-2 py-1 rounded-lg text-[10px] truncate ${mine ? 'bg-black/20' : 'bg-background/60'}`}>
                                ↪ {preview(parent)}
                              </div>
                            )}

                            {m.kind === 'pin' && (
                              <div className={`rounded-lg p-2 mb-1 ${mine ? 'bg-black/20' : 'bg-background/60'}`}>
                                <p className="text-[11px] font-semibold flex items-center gap-1"><Pin className="h-3 w-3" /> {m.content}</p>
                                {m.metadata?.note && <p className="text-[10px] opacity-80 mt-0.5 whitespace-pre-wrap">{m.metadata.note}</p>}
                                <button onClick={() => navigate('/dashboard')} className="text-[10px] underline mt-1">Open workspace</button>
                              </div>
                            )}

                            {m.kind === 'deal' && (
                              <button onClick={() => setEscrowOpen(true)} className={`rounded-lg p-2 mb-1 w-full text-left ${mine ? 'bg-black/20' : 'bg-background/60'}`}>
                                <p className="text-[11px] font-semibold flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Escrow: {m.content}</p>
                                <p className="text-[10px] opacity-80">Open deal locker to review & sign</p>
                              </button>
                            )}

                            {m.kind === 'location' && (
                              <a href={`https://www.google.com/maps?q=${m.metadata?.lat},${m.metadata?.lng}`} target="_blank" rel="noreferrer"
                                className={`flex items-center gap-1.5 rounded-lg p-2 ${mine ? 'bg-black/20' : 'bg-background/60'}`}>
                                <MapPin className="h-3.5 w-3.5" /> <span className="text-[11px]">{m.content}</span>
                              </a>
                            )}

                            {m.kind === 'code' && (
                              <pre className={`rounded-lg p-2 text-[10px] font-mono whitespace-pre-wrap break-all max-h-56 overflow-auto thin-scroll ${mine ? 'bg-black/25' : 'bg-background/70'}`}>{m.content}</pre>
                            )}

                            {(m.kind === 'vault' || m.kind === 'vault_burned') && (
                              <div className={`rounded-lg p-2 ${mine ? 'bg-black/20' : 'bg-background/60'}`}>
                                {revealed[m.id] ? (
                                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-all">{revealed[m.id]}</pre>
                                ) : m.kind === 'vault_burned' || (!mine && m.viewed_at) ? (
                                  <p className="text-[11px] flex items-center gap-1 opacity-80"><Flame className="h-3 w-3" /> Snippet burned after reading</p>
                                ) : mine ? (
                                  <p className="text-[11px] flex items-center gap-1 opacity-90"><Lock className="h-3 w-3" /> One-time snippet sent</p>
                                ) : (
                                  <button onClick={() => burn(m)} className="text-[11px] flex items-center gap-1 underline">
                                    <Lock className="h-3 w-3" /> Tap to reveal once
                                  </button>
                                )}
                              </div>
                            )}

                            {m.media_url && (
                              <div className="my-1">
                                <ChatMedia path={m.media_url} kind={m.kind} name={m.metadata?.name} onOpen={() => setLightbox(m)} />
                              </div>
                            )}

                            {['text', 'file'].includes(m.kind) && m.content && (
                              blockedLink ? (
                                <p className="text-[11px] flex items-center gap-1 text-amber-300">
                                  <ShieldAlert className="h-3 w-3" /> Link blocked by security guard — verify before opening.
                                </p>
                              ) : (
                                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                              )
                            )}

                            {translate && translations[m.id] && (
                              <p className="mt-1 text-[11px] italic opacity-80 border-t border-border/30 pt-1">{translations[m.id]}</p>
                            )}

                            {/* verification shield for text + all media */}
                            {!mine && (m.kind === 'text' || isMedia) && (m.content || m.media_url) && (
                              <div className="mt-1 flex items-center gap-1.5">
                                {v ? (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                    /real|authentic/i.test(v.verdict) ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                      : /fake/i.test(v.verdict) ? 'bg-red-500/15 text-red-300 border-red-500/40'
                                      : 'bg-amber-500/15 text-amber-200 border-amber-500/40'}`}
                                    title={v.reasoning}>
                                    {/real|authentic/i.test(v.verdict) ? 'Real Verified' : /fake/i.test(v.verdict) ? 'Debunked Fake' : v.verdict}
                                    {v.score != null ? ` · ${v.score}` : ''}
                                  </span>
                                ) : (
                                  <button onClick={() => verify(m)} disabled={verifying === m.id}
                                    className="text-[10px] flex items-center gap-1 text-cyan-300 hover:underline">
                                    {verifying === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Verify with Averia
                                  </button>
                                )}
                              </div>
                            )}

                            {due && (
                              <button onClick={() => downloadIcs(m.content.slice(0, 60), due)}
                                className="mt-1 text-[10px] flex items-center gap-1 text-cyan-300 hover:underline">
                                <CalendarPlus className="h-3 w-3" /> Add reminder · {due.toLocaleString()}
                              </button>
                            )}

                            {Object.keys(reactions).length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {Object.entries(reactions).map(([e, users]) => (
                                  <span key={e} className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/60 border border-border/40">{e} {users.length}</span>
                                ))}
                              </div>
                            )}

                            <div className={`flex items-center gap-1 justify-end mt-0.5 ${mine ? 'text-gray-300' : 'text-muted-foreground'}`}>
                              <span className="text-[9px]">{fmt(m.created_at)}</span>
                              {m.metadata?.expires_at && <Clock className="h-2.5 w-2.5" />}
                              {mine && (m.read ? <CheckCheck className="h-3 w-3 text-cyan-300" /> : <Check className="h-3 w-3" />)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={endRef} />
                  </div>
                </ScrollArea>

                {/* composer */}
                <div className="shrink-0 border-t border-border/60 bg-card/40 backdrop-blur px-2 py-2">
                  {replyTo && (
                    <div className="flex items-center gap-2 mb-1.5 px-2 py-1 rounded-lg bg-secondary/50 text-[11px]">
                      <Reply className="h-3 w-3 text-primary" />
                      <span className="flex-1 truncate">{preview(replyTo)}</span>
                      <button onClick={() => setReplyTo(null)}><X className="h-3 w-3" /></button>
                    </div>
                  )}

                  {/* smart quick replies */}
                  <div className="flex items-center gap-1.5 mb-1.5 overflow-x-auto no-scrollbar">
                    <button onClick={suggestReplies} disabled={aiBusy}
                      className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border border-cyan-300/40 bg-cyan-400/10 text-cyan-200">
                      {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Smart replies
                    </button>
                    {(quickReplies.length ? quickReplies : ['Got it!', 'Verify link']).map((q) => (
                      <button key={q} onClick={() => setText(q)}
                        className="shrink-0 px-2 py-1 rounded-full text-[10px] border border-border/50 hover:bg-secondary/50">{q}</button>
                    ))}
                  </div>

                  <div className="flex items-end gap-1.5">
                    <Popover open={plusOpen} onOpenChange={setPlusOpen}>
                      <PopoverTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full bg-secondary/60">
                          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" className="w-52 p-1 z-[130]">
                        {[
                          { icon: ImageIcon, label: 'Image / Video', fn: () => { setPlusOpen(false); imgInput.current?.click(); } },
                          { icon: FileText, label: 'File', fn: () => { setPlusOpen(false); fileInput.current?.click(); } },
                          { icon: Mic, label: recording ? 'Stop & send audio' : 'Audio', fn: toggleRecord },
                          { icon: MapPin, label: 'Location', fn: shareLocation },
                          { icon: MonitorPlay, label: 'Screen snapshot', fn: screenSnapshot },
                          { icon: PenLine, label: 'Shared canvas', fn: () => { setPlusOpen(false); setCanvasOpen(true); } },
                          { icon: ShieldCheck, label: 'Escrow deal', fn: () => { setPlusOpen(false); setEscrowOpen(true); } },
                          { icon: Lock, label: 'Encrypted code vault', fn: () => { setPlusOpen(false); setVaultOpen(true); } },
                          { icon: Pin, label: 'Pin workspace item', fn: openPinPicker },
                        ].map((a) => (
                          <button key={a.label} onClick={a.fn}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[12px] hover:bg-primary/10 transition text-left">
                            <a.icon className="h-3.5 w-3.5 text-cyan-300" /> {a.label}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>

                    {recording && (
                      <Button size="icon" variant="destructive" className="h-9 w-9 shrink-0 rounded-full" onClick={toggleRecord} title="Stop recording">
                        <Square className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    <div className="flex-1 relative">
                      <Textarea
                        value={text} onChange={(e) => onType(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder="Write a secure message…" rows={1}
                        className="min-h-9 max-h-32 py-2 pr-12 resize-none text-[13px] bg-secondary/40 thin-scroll"
                      />
                      {(text.length > 0 || recording) && (
                        <div className="absolute right-3 bottom-2.5 flex items-end gap-[2px] h-3.5 pointer-events-none">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <span key={i} style={{ animationDelay: `${i * 90}ms` }}
                              className="w-[2px] h-full rounded-full bg-cyan-300/80 animate-pulse" />
                          ))}
                        </div>
                      )}
                    </div>

                    <Button size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={send} disabled={!text.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <input ref={imgInput} type="file" accept="image/*,video/*" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) pickMedia(f); e.target.value = ''; }} />
                  <input ref={fileInput} type="file" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, 'file'); e.target.value = ''; }} />
                </div>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <ChatAIAssistant context={thread.slice(-25).map((m) => `${m.sender_id === user.id ? 'Me' : activeName}: ${m.content || preview(m)}`).join('\n')} />

      <NewChatModal open={newChat} onOpenChange={setNewChat} onPick={addContact} />

      {lightbox?.media_url && (
        <MediaLightbox path={lightbox.media_url} kind={lightbox.kind} name={lightbox.metadata?.name} onClose={() => setLightbox(null)} />
      )}

      {active && (
        <>
          <ChatCanvas
            open={canvasOpen} onOpenChange={setCanvasOpen}
            onSendImage={(f) => upload(f, 'image', { canvas: true })}
            onSendCode={(code) => insertMsg({ kind: 'code', content: code })}
          />
          <EscrowDialog
            open={escrowOpen} onOpenChange={setEscrowOpen}
            userId={user.id} peerId={active} envTag={envTag}
            onPosted={(title, id) => insertMsg({ kind: 'deal', content: title, metadata: { dealId: id } })}
          />
        </>
      )}

      {/* Encrypted one-time code vault */}
      <Dialog open={vaultOpen} onOpenChange={setVaultOpen}>
        <DialogContent className="glass-card max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-cyan-300" /> Self-destruct code vault</DialogTitle>
            <DialogDescription>The snippet is wiped from the database the moment the recipient reads it.</DialogDescription>
          </DialogHeader>
          <Textarea value={vaultCode} onChange={(e) => setVaultCode(e.target.value)} rows={7}
            placeholder="Paste secret code / credentials…" className="font-mono text-xs bg-secondary/40 thin-scroll" />
          <Button onClick={sendVault} disabled={!vaultCode.trim()}>Send one-time snippet</Button>
        </DialogContent>
      </Dialog>

      {/* Pin workspace item */}
      <Dialog open={pinPickerOpen} onOpenChange={setPinPickerOpen}>
        <DialogContent className="glass-card max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pin className="h-4 w-4 text-cyan-300" /> Pin workspace item</DialogTitle>
            <DialogDescription>Attach a live {isJoint ? 'joint' : 'personal'} workspace note or task into this thread.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1 thin-scroll">
            {pinItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No workspace items found</p>}
            {pinItems.map((it) => (
              <button key={it.id} onClick={() => pinItem(it)}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-primary/10 border border-transparent hover:border-primary/30">
                <p className="text-[12px] font-medium truncate">{it.title || 'Untitled'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{it.content || it.kind}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Export */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="glass-card max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm"><FileDown className="h-4 w-4 text-cyan-300" /> Export thread</DialogTitle>
            <DialogDescription className="text-xs">Download an AES-256 encrypted archive, or a printable PDF transcript.</DialogDescription>
          </DialogHeader>
          <Input type="password" value={exportPwd} onChange={(e) => setExportPwd(e.target.value)}
            placeholder="Archive password" className="h-8 text-xs bg-secondary/40" />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => doExport('json')}>Encrypted JSON</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => doExport('pdf')}>Printable PDF</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mass broadcast */}
      <Dialog open={massOpen} onOpenChange={setMassOpen}>
        <DialogContent className="glass-card max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm"><Megaphone className="h-4 w-4 text-cyan-300" /> Mass broadcast</DialogTitle>
            <DialogDescription className="text-xs">Send one alert to many verified contacts at once.</DialogDescription>
          </DialogHeader>
          <div className="max-h-52 overflow-y-auto thin-scroll space-y-1">
            {contacts.map((c) => (
              <label key={c.userId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/40 cursor-pointer">
                <input type="checkbox" checked={massSel.includes(c.userId)}
                  onChange={(e) => setMassSel((s) => (e.target.checked ? [...s, c.userId] : s.filter((x) => x !== c.userId)))} />
                <UserAvatar url={c.avatar} name={c.name} size="sm" />
                <span className="text-[12px]">{c.name}</span>
              </label>
            ))}
          </div>
          <Textarea value={massText} onChange={(e) => setMassText(e.target.value)} rows={3}
            placeholder="Broadcast message…" className="text-xs bg-secondary/40" />
          <Button size="sm" disabled={!massText.trim() || !massSel.length} onClick={sendBroadcast}>
            Broadcast to {massSel.length} contacts
          </Button>
        </DialogContent>
      </Dialog>

      {/* AI summary */}
      <Dialog open={!!summary} onOpenChange={(v) => !v && setSummary(null)}>
        <DialogContent className="glass-card max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-300" /> Priority summary — {summary?.name}</DialogTitle>
          </DialogHeader>
          <div className="text-[12px] whitespace-pre-wrap max-h-[60vh] overflow-y-auto thin-scroll">{summary?.text}</div>
        </DialogContent>
      </Dialog>

      {/* Shared media drawer */}
      <Sheet open={mediaOpen} onOpenChange={setMediaOpen}>
        <SheetContent side="right" className="w-[330px] sm:w-[400px] z-[130]">
          <SheetHeader><SheetTitle className="text-sm">Shared media</SheetTitle></SheetHeader>
          <div className="flex gap-1.5 mt-3">
            {([['visual', 'Photos & Videos'], ['voice', 'Voice Audio'], ['vault', 'Vault Files']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setMediaTab(k as any)}
                className={`px-2.5 py-1 rounded-full text-[10px] border transition ${
                  mediaTab === k ? 'bg-cyan-400/15 border-cyan-300/50 text-cyan-200' : 'border-border/50 text-muted-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 overflow-y-auto max-h-[78vh] thin-scroll">
            {mediaTab === 'visual' && (
              <div className="grid grid-cols-2 gap-2">
                {sharedVisual.length === 0 && <p className="col-span-2 text-xs text-muted-foreground py-6 text-center">Nothing shared yet</p>}
                {sharedVisual.map((m) => (
                  <button key={m.id} onClick={() => setLightbox(m)} className="rounded-lg border border-border/50 p-1.5">
                    <ChatMedia path={m.media_url!} kind={m.kind} name={m.metadata?.name} />
                  </button>
                ))}
              </div>
            )}
            {mediaTab === 'voice' && (
              <div className="space-y-2">
                {sharedVoice.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">No voice notes yet</p>}
                {sharedVoice.map((m) => <AudioWave key={m.id} path={m.media_url!} name={m.metadata?.name} compact />)}
              </div>
            )}
            {mediaTab === 'vault' && (
              <div className="space-y-2">
                {sharedFiles.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">No files yet</p>}
                {sharedFiles.map((m) => (
                  <button key={m.id} onClick={() => setLightbox(m)}
                    className="w-full flex items-center gap-2 rounded-lg border border-border/50 px-2 py-2 text-left">
                    <FileText className="h-4 w-4 text-cyan-300 shrink-0" />
                    <span className="text-[11px] truncate flex-1">{m.metadata?.name || m.content}</span>
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
