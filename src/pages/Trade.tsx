import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity as ActivityIcon, ArrowUpRight, Check, CheckCircle2, Clock3, Download,
  ExternalLink, FileArchive, ImagePlus, Loader2, LockKeyhole, Plus, QrCode,
  RefreshCw, ShieldCheck, ShoppingBag, Store, Upload, WalletCards, X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { decodeUpiQrFile, extractUpiDetails } from '@/lib/averiaChat';
import { toast } from 'sonner';

type Project = {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_averia_id: string;
  current_owner_id: string;
  current_owner_name: string;
  current_owner_averia_id: string;
  title: string;
  description: string;
  category: string;
  tech_stack: string[];
  demo_url: string | null;
  asking_price_inr: number;
  seller_upi_id: string;
  seller_upi_registered_name: string;
  seller_qr_code_url: string | null;
  source_code_file_url: string | null;
  is_sold: boolean;
  audit_status: string;
  created_at: string;
  updated_at: string;
};

type Activity = {
  id: string;
  project_id: string;
  project_title: string;
  action_type: string;
  actor_name: string;
  actor_averia_id: string;
  target_name: string | null;
  target_averia_id: string | null;
  price_inr: number | null;
  timestamp: string;
};

const categories = ['Website', 'App', 'Image', 'Video', 'Audio', 'SaaS'];
const sb = supabase as any;
const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function identity(user: any) {
  return {
    name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Averia member',
    averiaId: user?.user_metadata?.averia_id || `AV-${String(user?.id || '').slice(0, 8).toUpperCase()}`,
  };
}

function money(value: number) { return `₹${rupees.format(value || 0)}`; }
function dateLabel(value: string) { return new Date(value).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }); }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function FileDrop({ accept, onChange, icon, title, subtitle }: {
  accept: string; onChange: (file: File | null) => void; icon: React.ReactNode; title: string; subtitle: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <div className="relative flex min-h-28 items-center justify-center rounded-2xl bg-white/[0.04] px-4 py-5 text-center transition hover:bg-white/[0.07]">
    <input ref={inputRef} type="file" accept={accept} className="absolute inset-0 cursor-pointer opacity-0" onChange={e => onChange(e.target.files?.[0] ?? null)} />
    <div className="pointer-events-none flex flex-col items-center gap-2 text-muted-foreground">{icon}<span className="text-sm text-foreground">{title}</span><span className="text-xs">{subtitle}</span></div>
  </div>;
}

function EmailOtpStep({ email, code, setCode, sent, verified, sending, onSend, onVerify }: {
  email: string; code: string; setCode: (value: string) => void; sent: boolean; verified: boolean; sending: boolean; onSend: () => void; onVerify: () => void;
}) {
  return <div className="space-y-3 rounded-2xl bg-white/[0.04] p-4">
    <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" /><p className="text-sm font-medium">Email confirmation</p>{verified && <CheckCircle2 className="ml-auto h-4 w-4 text-success" />}</div>
    <div className="flex flex-col gap-2 sm:flex-row"><Input value={email} readOnly aria-label="Signed-in email" /><Button type="button" variant="outline" onClick={onSend} disabled={sending || !email}>{sending ? <Loader2 className="animate-spin" /> : sent ? 'Resend OTP' : 'Send OTP to Email'}</Button></div>
    {sent && <div className="flex flex-col gap-2 sm:flex-row"><Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit OTP code" inputMode="numeric" maxLength={6} disabled={verified} /><Button type="button" variant="outline" onClick={onVerify} disabled={sending || verified || code.length !== 6}>{verified ? 'Verified' : 'Verify OTP'}</Button></div>}
  </div>;
}

function PhoneOtpStep({ phone, setPhone, code, setCode, sent, sending, onSend }: {
  phone: string; setPhone: (value: string) => void; code: string; setCode: (value: string) => void; sent: boolean; sending: boolean; onSend: () => void;
}) {
  return <div className="space-y-3 rounded-2xl bg-white/[0.04] p-4">
    <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" /><p className="text-sm font-medium">Phone confirmation</p></div>
    <div className="flex flex-col gap-2 sm:flex-row"><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" /><Button type="button" variant="outline" onClick={onSend} disabled={sending || !phone.trim()}>{sending ? <Loader2 className="animate-spin" /> : sent ? 'Resend' : 'Send OTP'}</Button></div>
    {sent && <Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit OTP" inputMode="numeric" maxLength={6} />}
  </div>;
}

function ListingModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (value: boolean) => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Website');
  const [demoUrl, setDemoUrl] = useState('');
  const [techStack, setTechStack] = useState('');
  const [price, setPrice] = useState('');
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [qrMessage, setQrMessage] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const reset = () => { setTitle(''); setDescription(''); setCategory('Website'); setDemoUrl(''); setTechStack(''); setPrice(''); setUpiId(''); setUpiName(''); setQrFile(null); setZipFile(null); setQrMessage(''); setOtp(''); setOtpSent(false); setOtpVerified(false); };
  const close = (value: boolean) => { if (!value) reset(); onOpenChange(value); };

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? user?.email ?? ''));
  }, [open, user?.email]);

  const onQrFile = async (file: File | null) => {
    setQrFile(file); setQrMessage('');
    if (!file) return;
    const details = await decodeUpiQrFile(file);
    if (details) { setUpiId(details.upiId); setUpiName(details.registeredName); setQrMessage('verified'); return; }
    toast.info('QR could not be decoded in this browser. Paste the UPI details to continue.');
  };

  const sendOtp = async () => {
    if (!email) return;
    setSendingOtp(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setSendingOtp(false);
    if (error) { toast.error(error.message); return; }
    setOtpSent(true); setOtpVerified(false); toast.success('OTP sent to your email');
  };

  const verifyOtp = async () => {
    if (!email || otp.length !== 6) return;
    setSendingOtp(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    setSendingOtp(false);
    if (error) { toast.error(error.message); return; }
    setOtpVerified(true); toast.success('Email verified');
  };

  const submit = async () => {
    if (!user) { toast.error('Sign in to list a project'); return; }
    if (!title.trim() || !description.trim() || !price || !upiId.trim() || !upiName.trim() || !zipFile || !qrFile || !otpVerified) { toast.error('Complete every listing and verification field'); return; }
    setSaving(true);
    try {
      const { data: profile } = await sb.from('profiles').select('full_name, averia_id').eq('user_id', user.id).maybeSingle();
      const seller = identity({ ...user, user_metadata: { ...user.user_metadata, full_name: profile?.full_name || user.user_metadata?.full_name, averia_id: profile?.averia_id || user.user_metadata?.averia_id } });
      const zipPath = `${user.id}/${crypto.randomUUID()}-${zipFile.name}`;
      const qrPath = `${user.id}/${crypto.randomUUID()}-${qrFile.name}`;
      const [zipUpload, qrUpload] = await Promise.all([
        sb.storage.from('project-files').upload(zipPath, zipFile, { upsert: false }),
        sb.storage.from('project-files').upload(qrPath, qrFile, { upsert: false }),
      ]);
      if (zipUpload.error) throw zipUpload.error;
      if (qrUpload.error) throw qrUpload.error;
      const { error } = await sb.from('trade_projects').insert({
        seller_id: user.id, seller_name: seller.name, seller_averia_id: seller.averiaId,
        current_owner_id: user.id, current_owner_name: seller.name, current_owner_averia_id: seller.averiaId,
        title: title.trim(), description: description.trim(), category, demo_url: demoUrl.trim() || null,
        tech_stack: techStack.split(',').map(value => value.trim()).filter(Boolean), asking_price_inr: Number(price),
        seller_upi_id: upiId.trim(), seller_upi_registered_name: upiName.trim(), seller_qr_code_url: qrPath,
        source_code_file_url: zipPath, is_sold: false, audit_status: 'pending',
      });
      if (error) throw error;
      toast.success('Project submitted for marketplace review'); close(false); onCreated();
    } catch (error: any) { toast.error(error?.message || 'Could not create the listing'); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
    <DialogHeader><DialogTitle>List a new project</DialogTitle><DialogDescription>Publish a digital asset with verified payout details.</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="A clear project name" maxLength={160} /></Field></div>
      <div className="sm:col-span-2"><Field label="Description"><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is included in the handover?" maxLength={5000} className="min-h-24 w-full resize-y rounded-xl bg-white/[0.05] px-4 py-3 text-[15px] outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" /></Field></div>
      <Field label="Category"><select value={category} onChange={e => setCategory(e.target.value)} className="h-12 w-full rounded-xl bg-white/[0.05] px-4 text-sm outline-none">{categories.map(item => <option key={item} value={item} className="bg-card">{item}</option>)}</select></Field>
      <Field label="Price (₹)"><Input value={price} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="4999" inputMode="numeric" /></Field>
      <div className="sm:col-span-2"><Field label="Demo URL"><Input value={demoUrl} onChange={e => setDemoUrl(e.target.value)} placeholder="https://your-demo.example" type="url" /></Field></div>
      <div className="sm:col-span-2"><Field label="Tech stack"><Input value={techStack} onChange={e => setTechStack(e.target.value)} placeholder="React, TypeScript, Tailwind" /></Field></div>
      <Field label="Project ZIP"><FileDrop accept=".zip,application/zip" onChange={setZipFile} icon={<FileArchive className="h-6 w-6" />} title={zipFile?.name || 'Upload source ZIP'} subtitle="Private project-files storage" /></Field>
      <Field label="UPI QR image"><FileDrop accept="image/*" onChange={onQrFile} icon={<QrCode className="h-6 w-6" />} title={qrFile?.name || 'Upload payout QR'} subtitle="Used to verify the payout name" /></Field>
      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2"><Field label="UPI ID"><Input value={upiId} onChange={e => { setUpiId(e.target.value); setQrMessage(''); }} placeholder="name@bank" /></Field><Field label="Registered UPI name"><Input value={upiName} onChange={e => { setUpiName(e.target.value); setQrMessage(''); }} placeholder="Account holder name" /></Field></div>
      {qrMessage === 'verified' && <div className="sm:col-span-2 flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm text-success"><CheckCircle2 className="h-4 w-4" />Verified UPI Name: {upiName} ✓</div>}
      <div className="sm:col-span-2"><EmailOtpStep email={email} code={otp} setCode={setOtp} sent={otpSent} verified={otpVerified} sending={sendingOtp} onSend={sendOtp} onVerify={verifyOtp} /></div>
    </div>
    <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => close(false)}>Cancel</Button><Button onClick={submit} disabled={saving || !otpVerified}>{saving ? <Loader2 className="animate-spin" /> : <Upload />} Submit listing</Button></div>
  </DialogContent></Dialog>;
}

function BuyModal({ project, open, onOpenChange, onComplete }: { project: Project | null; open: boolean; onOpenChange: (value: boolean) => void; onComplete: () => void }) {
  const { user } = useAuth();
  const [receipt, setReceipt] = useState<File | null>(null);
  const [utr, setUtr] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [processing, setProcessing] = useState(false);
  if (!project) return null;
  const sellerAmount = project.asking_price_inr * 0.8;
  const escrowAmount = project.asking_price_inr * 0.2;
  const upiLink = `upi://pay?pa=${encodeURIComponent(project.seller_upi_id)}&pn=${encodeURIComponent(project.seller_upi_registered_name)}&am=${project.asking_price_inr}&cu=INR&tn=Averia_Asset_Purchase_${project.id}`;
  const sendOtp = async () => {
    setSending(true); const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() }); setSending(false);
    if (error) toast.error(error.message); else { setOtpSent(true); toast.success('OTP sent to your phone'); }
  };
  const submit = async () => {
    if (!user) { toast.error('Sign in to buy this asset'); return; }
    if (!receipt || !/^\d{12}$/.test(utr) || !otpSent || otp.length !== 6) { toast.error('Add the receipt, 12-digit UTR, and OTP'); return; }
    setProcessing(true);
    try {
      const { error: otpError } = await supabase.auth.verifyOtp({ phone: phone.trim(), token: otp, type: 'sms' }); if (otpError) throw otpError;
      const path = `${user.id}/${crypto.randomUUID()}-${receipt.name}`;
      const upload = await sb.storage.from('payment-proofs').upload(path, receipt, { upsert: false }); if (upload.error) throw upload.error;
      const buyer = identity(user);
      const { data: transaction, error: transactionError } = await sb.from('trade_transactions').insert({
        project_id: project.id, seller_id: project.seller_id, buyer_id: user.id, buyer_name: buyer.name, buyer_averia_id: buyer.averiaId,
        total_amount_inr: project.asking_price_inr, platform_fee_20: escrowAmount, seller_payout_80: sellerAmount,
        buyer_screenshot_url: path, utr_transaction_id: utr, seller_otp_verified: true, buyer_otp_verified: false,
        transaction_type: 'BUY', status: 'payment_pending',
      }).select('id').single();
      if (transactionError) throw transactionError;
      const verified = await sb.rpc('mark_trade_buyer_verified', { _transaction_id: transaction.id }); if (verified.error) throw verified.error;
      const completed = await sb.rpc('complete_trade_purchase', { _transaction_id: transaction.id }); if (completed.error) throw completed.error;
      toast.success('Purchase complete — ownership transferred'); onOpenChange(false); onComplete();
    } catch (error: any) { toast.error(error?.message || 'Purchase could not be completed'); }
    finally { setProcessing(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
    <DialogHeader><DialogTitle>Buy {project.title}</DialogTitle><DialogDescription>Secure UPI payment with verified ownership transfer.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2"><div className="rounded-2xl bg-white/[0.05] p-4"><p className="text-xs text-muted-foreground">Seller · 80%</p><p className="mt-1 text-lg font-semibold">{money(sellerAmount)}</p></div><div className="rounded-2xl bg-white/[0.05] p-4"><p className="text-xs text-muted-foreground">Escrow · 20%</p><p className="mt-1 text-lg font-semibold">{money(escrowAmount)}</p></div></div>
      <div className="rounded-2xl bg-white/[0.04] p-4"><p className="text-xs text-muted-foreground">Paying {project.seller_upi_registered_name}</p><p className="mt-1 font-mono text-sm">{project.seller_upi_id}</p><Button asChild className="mt-4 w-full bg-purple-600 text-white shadow-lg shadow-purple-500/20 hover:bg-purple-700"><a href={upiLink}>Pay {money(project.asking_price_inr)} via UPI <ArrowUpRight /></a></Button></div>
      <Field label="Payment receipt"><FileDrop accept="image/*,application/pdf" onChange={setReceipt} icon={<ImagePlus className="h-6 w-6" />} title={receipt?.name || 'Upload payment receipt'} subtitle="Private payment-proofs storage" /></Field>
      <Field label="12-digit UTR"><Input value={utr} onChange={e => setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="123456789012" inputMode="numeric" maxLength={12} /></Field>
      <PhoneOtpStep phone={phone} setPhone={setPhone} code={otp} setCode={setOtp} sent={otpSent} sending={sending} onSend={sendOtp} />
      <Button onClick={submit} disabled={processing} className="w-full">{processing ? <Loader2 className="animate-spin" /> : <Check />} Verify payment & transfer ownership</Button>
    </div>
  </DialogContent></Dialog>;
}

function ProjectCard({ project, onBuy, own }: { project: Project; onBuy: () => void; own: boolean }) {
  return <article className="group flex h-full flex-col rounded-2xl bg-white/[0.04] p-5 transition hover:bg-white/[0.07]">
    <div className="mb-5 flex items-start justify-between gap-3"><div><span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{project.category}</span><h2 className="mt-2 text-xl font-semibold tracking-tight">{project.title}</h2></div><div className="rounded-full bg-white/[0.07] px-3 py-1 text-sm font-medium">{money(project.asking_price_inr)}</div></div>
    <p className="line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">{project.description}</p>
    <div className="mt-5 flex flex-wrap gap-2">{project.tech_stack.slice(0, 4).map(stack => <span key={stack} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-muted-foreground">{stack}</span>)}</div>
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/5 pt-4"><div><p className="text-xs text-muted-foreground">Listed by</p><p className="text-sm">{project.seller_name}</p></div>{project.demo_url && <Button asChild variant="ghost" size="icon" aria-label="Open demo"><a href={project.demo_url} target="_blank" rel="noreferrer"><ExternalLink /></a></Button>}</div>
    {!own && <Button onClick={onBuy} className="mt-3 w-full bg-purple-600 text-white shadow-lg shadow-purple-500/20 hover:bg-purple-700">Buy</Button>}
    {own && <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" />{project.audit_status === 'pending' ? 'Awaiting review' : 'Your active listing'}</div>}
  </article>;
}

function ActivityOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const load = useCallback(async () => { const { data } = await sb.from('trade_activities').select('*').order('timestamp', { ascending: false }).limit(80); setActivities(data || []); }, []);
  useEffect(() => { if (!open) return; load(); const channel = supabase.channel('trade-activity-live').on('postgres_changes', { event: '*', schema: 'public', table: 'trade_activities' }, load).subscribe(); return () => { supabase.removeChannel(channel); }; }, [open, load]);
  const chartData = useMemo(() => Object.entries(activities.reduce<Record<string, number>>((result, row) => { const day = dateLabel(row.timestamp).slice(0, 6); result[day] = (result[day] || 0) + (row.price_inr || 0); return result; }, {})).reverse().slice(-10).map(([day, volume]) => ({ day, volume })), [activities]);
  const sales = activities.filter(item => item.action_type === 'SOLD');
  const volume = sales.reduce((sum, item) => sum + (item.price_inr || 0), 0);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none p-5 sm:p-10"><DialogHeader className="mx-auto w-full max-w-6xl"><div className="flex items-center justify-between gap-4"><div><DialogTitle className="text-2xl sm:text-3xl">Trade activity</DialogTitle><DialogDescription>Live marketplace movement across Averia.</DialogDescription></div><Button variant="outline" size="icon" onClick={load} aria-label="Refresh activity"><RefreshCw /></Button></div></DialogHeader>
    <div className="mx-auto grid w-full max-w-6xl gap-4 py-6 sm:grid-cols-3"><Metric label="Volume" value={money(volume)} icon={<WalletCards />} /><Metric label="Listings" value={String(new Set(activities.map(item => item.project_id)).size)} icon={<Store />} /><Metric label="Sales" value={String(sales.length)} icon={<ShoppingBag />} /></div>
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.3fr_0.7fr]"><div className="rounded-2xl bg-white/[0.04] p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Volume graph</h3><span className="text-xs text-muted-foreground">INR</span></div><div className="h-72">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '0', borderRadius: 12, color: 'hsl(var(--foreground))' }} /><Bar dataKey="volume" fill="hsl(var(--foreground))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState compact title="Activity will appear here" />}</div></div><div className="rounded-2xl bg-white/[0.04] p-5"><h3 className="mb-4 font-semibold">Live feed</h3><div className="space-y-1">{activities.length ? activities.slice(0, 12).map(item => <div key={item.id} className="flex gap-3 border-b border-white/5 py-3 last:border-0"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-success" /><div className="min-w-0"><p className="text-sm"><span className="font-medium">{item.actor_name}</span> {item.action_type.toLowerCase()} <span className="font-medium">{item.project_title}</span></p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(item.timestamp)} {item.price_inr ? `· ${money(item.price_inr)}` : ''}</p></div></div>) : <EmptyState compact title="No activity yet" />}</div></div></div>
    </DialogContent></Dialog>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-5"><div className="text-muted-foreground">{icon}</div><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div></div>; }
function EmptyState({ title, compact = false }: { title: string; compact?: boolean }) { return <div className={`flex h-full flex-col items-center justify-center text-center text-muted-foreground ${compact ? 'py-10' : 'min-h-72'}`}><ShoppingBag className="mb-3 h-8 w-8 opacity-50" /><p>{title}</p></div>; }

function MyTrade({ userId }: { userId: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('listings');
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: listingData }, { data: purchasedData }, { data: activityData }] = await Promise.all([
      sb.from('trade_projects').select('*').eq('seller_id', userId).eq('is_sold', false).order('created_at', { ascending: false }),
      sb.from('trade_projects').select('*').eq('current_owner_id', userId).order('updated_at', { ascending: false }),
      sb.from('trade_activities').select('*').or(`actor_id.eq.${userId},target_id.eq.${userId}`).order('timestamp', { ascending: false }),
    ]);
    setProjects([...(listingData || []), ...(purchasedData || []).filter((item: Project) => item.seller_id !== userId)]); setActivities(activityData || []); setLoading(false);
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  const listings = projects.filter(item => item.seller_id === userId && !item.is_sold);
  const purchased = projects.filter(item => item.current_owner_id === userId && item.seller_id !== userId);
  const download = async (project: Project) => {
    if (!project.source_code_file_url) { toast.error('Source file is not attached'); return; }
    try { const signed = await sb.storage.from('project-files').createSignedUrl(project.source_code_file_url, 60); if (signed.error) throw signed.error; const response = await fetch(signed.data.signedUrl); if (!response.ok) throw new Error('Download failed'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${project.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.zip`; anchor.click(); URL.revokeObjectURL(url); } catch (error: any) { toast.error(error?.message || 'Could not download source file'); }
  };
  if (loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Private workspace</p><h2 className="mt-1 text-xl font-semibold">My Trade</h2></div><Button variant="outline" size="icon" onClick={load} aria-label="Refresh My Trade"><RefreshCw /></Button></div><Tabs value={tab} onValueChange={setTab}><TabsList className="w-full justify-start overflow-x-auto"><TabsTrigger value="listings">My Active Listings</TabsTrigger><TabsTrigger value="purchased">My Purchased Assets</TabsTrigger><TabsTrigger value="history">My Personal Activity History</TabsTrigger></TabsList><TabsContent value="listings"><div className="grid gap-4 md:grid-cols-2">{listings.length ? listings.map(item => <ProjectCard key={item.id} project={item} own onBuy={() => undefined} />) : <EmptyState title="You have no active listings" />}</div></TabsContent><TabsContent value="purchased"><div className="grid gap-4 md:grid-cols-2">{purchased.length ? purchased.map(item => <div key={item.id} className="rounded-2xl bg-white/[0.04] p-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.category}</p><h3 className="mt-2 text-lg font-semibold">{item.title}</h3><p className="mt-2 text-sm text-muted-foreground">Transferred {dateLabel(item.updated_at)}</p><Button onClick={() => download(item)} className="mt-5 w-full"><Download />Download Source File</Button></div>) : <EmptyState title="Purchased assets will appear here" />}</div></TabsContent><TabsContent value="history"><div className="rounded-2xl bg-white/[0.04] p-5">{activities.length ? activities.map(item => <div key={item.id} className="flex items-start justify-between gap-4 border-b border-white/5 py-4 last:border-0"><div><p className="text-sm font-medium">{item.action_type} · {item.project_title}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(item.timestamp)} · {item.actor_name}</p></div>{item.price_inr ? <span className="text-sm">{money(item.price_inr)}</span> : null}</div>) : <EmptyState title="Your activity history is empty" />}</div></TabsContent></Tabs></div>;
}

export default function Trade() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [listingOpen, setListingOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [buyProject, setBuyProject] = useState<Project | null>(null);
  const [view, setView] = useState<'market' | 'mine'>(searchParams.get('view') === 'mine' ? 'mine' : 'market');
  const loadProjects = useCallback(async () => { setLoading(true); const { data, error } = await sb.from('trade_projects').select('*').eq('is_sold', false).order('created_at', { ascending: false }); if (error) toast.error(error.message); setProjects(data || []); setLoading(false); }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);
  if (authLoading) return <Layout showFooter={false}><div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div></Layout>;
  return <Layout showFooter={false}><main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-12 pt-3 sm:px-8 lg:px-12">
    <header className="sticky top-0 z-30 mb-6 flex min-h-[52px] flex-wrap items-center gap-2 bg-background/90 py-1 backdrop-blur-xl"><Button variant={view === 'market' ? 'secondary' : 'outline'} onClick={() => setView('market')}><Store />Marketplace</Button>{user && <Button variant={view === 'mine' ? 'secondary' : 'outline'} onClick={() => setView('mine')}><LockKeyhole />My Trade</Button>}<Button variant="outline" onClick={() => setActivityOpen(true)}><ActivityIcon />Activity</Button>{user && <Button onClick={() => setListingOpen(true)}><Plus />List New Project</Button>}</header>
    {view === 'mine' && user ? <MyTrade userId={user.id} /> : <><div className="mb-6 flex items-center justify-between"><div><h2 className="text-xl font-semibold">Active listings</h2><p className="mt-1 text-sm text-muted-foreground">Verified projects from the Averia community.</p></div><Button variant="ghost" size="icon" onClick={loadProjects} aria-label="Refresh listings"><RefreshCw /></Button></div>{loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-72 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div> : projects.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map(project => <ProjectCard key={project.id} project={project} own={project.seller_id === user?.id} onBuy={() => { if (!user) { navigate('/auth'); return; } setBuyProject(project); }} />)}</div> : <div className="rounded-2xl bg-white/[0.04]"><EmptyState title="No active listings yet. Be the first to list a project!" /></div>}</>}
    <ListingModal open={listingOpen} onOpenChange={setListingOpen} onCreated={loadProjects} /><BuyModal project={buyProject} open={!!buyProject} onOpenChange={value => !value && setBuyProject(null)} onComplete={loadProjects} /><ActivityOverlay open={activityOpen} onOpenChange={setActivityOpen} />
  </main></Layout>;
}