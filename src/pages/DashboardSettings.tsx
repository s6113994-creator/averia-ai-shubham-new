import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, History, Bookmark, Sun, Moon, Rocket, Crown, Settings as SettingsIcon, LogOut, Newspaper, Zap, Fingerprint, Copy, Bell, Trash2, ExternalLink, Shield, Users } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { WalletCard } from '@/components/WalletCard';
import { useScope } from '@/lib/scope';
import { lockPersonalVault } from '@/components/dashboard/TripleVault';
import { SavedNewsDetailModal } from '@/components/dashboard/SavedNewsDetailModal';

const LAUNCH_KEY = 'averia.defaultLaunch';
const THEME_KEY = 'averia.theme';

import { applyTheme } from '@/lib/theme';

type Section = { id: string; label: string; icon: any; danger?: boolean };
const SECTIONS: Section[] = [
  { id: 'profile',  label: 'Profile',         icon: User },
  { id: 'history',  label: 'Scan History',    icon: History },
  { id: 'saved',    label: 'Saved News',      icon: Bookmark },
  { id: 'theme',    label: 'Theme',           icon: Sun },
  { id: 'launch',   label: 'Default Launch',  icon: Rocket },
  { id: 'upgrade',  label: 'Upgrade',         icon: Crown },
  { id: 'settings', label: 'Settings',        icon: SettingsIcon },
  { id: 'signout',  label: 'Sign Out',        icon: LogOut, danger: true },
];

type SectionId = string;

export default function DashboardSettings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const scope = useScope();
  const [params, setParams] = useSearchParams();
  const initial = (params.get('section') as SectionId) || 'profile';
  const [active, setActive] = useState<SectionId>(initial);
  const { isSupported, isSubscribed, isLoading: pushLoading, subscribe, unsubscribe } = usePushNotifications();

  useEffect(() => { if (!user) navigate('/auth'); }, [user, navigate]);

  const switchSection = (id: SectionId) => {
    setActive(id);
    setParams({ section: id }, { replace: true });
  };

  if (!user) return null;

  return (
    <Layout>
      <div className="container mx-auto px-4 pt-0 pb-5 sm:pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-row items-center gap-3 mb-5 h-14 pl-14 pr-14 md:pl-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-heading text-lg md:text-xl font-semibold leading-none whitespace-nowrap">
              <span className="gradient-text">Settings</span>
            </h1>
            {scope.isJoint && (
              <span className="ml-2 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 flex items-center gap-1">
                <Users className="h-3 w-3" /> Joint
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
            {/* Left rail */}
            <nav className="glass-card rounded-xl p-2 h-fit md:sticky md:top-20">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => switchSection(s.id)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active === s.id
                      ? 'bg-primary/15 text-primary font-semibold'
                      : s.danger
                        ? 'text-destructive/80 hover:bg-destructive/10'
                        : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  }`}
                >
                  <s.icon className="h-4 w-4 shrink-0" /> {s.label}
                </button>
              ))}
            </nav>

            {/* Right viewport */}
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="glass-card rounded-xl p-5 sm:p-6 min-h-[300px]"
              >
                {active === 'profile' && <ProfileSection />}
                {active === 'history' && <HistorySection />}
                {active === 'saved'   && <SavedSection />}
                {active === 'theme'   && <ThemeSection />}
                {active === 'launch'  && <LaunchSection />}
                {active === 'upgrade' && <UpgradeSection />}
                {active === 'settings' && (
                  isSupported ? <PushSection isSubscribed={isSubscribed} pushLoading={pushLoading} subscribe={subscribe} unsubscribe={unsubscribe} /> : <p className="text-sm text-muted-foreground">No additional settings yet.</p>
                )}
                {active === 'signout' && <SignOutSection onSignOut={async () => { lockPersonalVault(); await signOut(); navigate('/'); }} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ============ Sections ============

function ProfileSection() {
  const { user } = useAuth();
  const scope = useScope();
  const [profile, setProfile] = useState<{ full_name: string | null; display_name: string | null; averia_id: string | null; is_pro: boolean; avatar_url: string | null } | null>(null);
  const [peer, setPeer] = useState<typeof profile>(null);
  const [fullName, setFullName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('full_name, display_name, averia_id, is_pro, avatar_url').eq('user_id', user.id).maybeSingle();
      if (data) { setProfile(data as any); setFullName(data.display_name || data.full_name || ''); }
    })();
  }, [user]);

  useEffect(() => {
    if (!scope.isJoint || !scope.peerId) { setPeer(null); return; }
    (async () => {
      const { data } = await supabase.from('profiles').select('full_name, display_name, averia_id, is_pro, avatar_url').eq('user_id', scope.peerId).maybeSingle();
      if (data) setPeer(data as any);
    })();
  }, [scope.isJoint, scope.peerId]);

  const updateProfile = async () => {
    const name = fullName.trim();
    if (name.length < 3 || name.length > 24) return toast.error('Name must be 3–24 characters');
    const { error } = await supabase.from('profiles').update({ display_name: name, full_name: name }).eq('user_id', user!.id);
    if (error) toast.error('Failed to update profile');
    else { toast.success('Identity updated'); setProfile(p => p ? { ...p, display_name: name, full_name: name } : p); }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Max 5MB');
    if (!file.type.startsWith('image/')) return toast.error('Pick an image');
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' });
      if (upErr) { toast.error('Upload failed: ' + upErr.message); return; }
      const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signed?.signedUrl;
      if (!url) { toast.error('Could not sign URL'); return; }
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', user.id);
      if (dbErr) { toast.error('Could not save'); return; }
      setProfile(p => p ? { ...p, avatar_url: url } : p);
      window.dispatchEvent(new CustomEvent('averia:avatar-changed', { detail: { url } }));
      toast.success('Profile photo updated');
    } finally { setUploading(false); }
  };

  if (!profile) return <div className="h-40 animate-pulse bg-secondary/20 rounded-xl" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-bold mb-1">Profile Settings</h2>
        <p className="text-muted-foreground text-sm">Manage your account information</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full ring-2 ring-primary/40 overflow-hidden bg-gradient-to-br from-primary to-fuchsia-600 flex items-center justify-center text-2xl font-bold text-primary-foreground">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="DP" className="h-full w-full object-cover" /> : (fullName?.[0] || user!.email?.[0] || '?').toUpperCase()}
        </div>
        <div className="space-y-1.5">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} />
          <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : profile.avatar_url ? 'Change photo' : 'Upload photo'}
          </Button>
          <p className="text-[10px] text-muted-foreground">JPG/PNG up to 5MB. Syncs across the app.</p>
        </div>
      </div>

      <div className="grid gap-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user!.email || ''} disabled className="bg-secondary/50" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="averiaId" className="flex items-center gap-1.5">
            <Fingerprint className="h-3.5 w-3.5 text-primary" /> Permanent Averia ID
          </Label>
          <div className="flex gap-2">
            <Input id="averiaId" value={profile.averia_id || ''} disabled className="bg-primary/5 border-primary/30 font-mono text-primary font-semibold" />
            <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(profile.averia_id || ''); toast.success('Copied'); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullName">Neural Display Name</Label>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value.replace(/\s+/g, '_'))} placeholder="Agent_Aryan" maxLength={24} className="bg-secondary/50" />
        </div>
        <Button onClick={updateProfile} className="w-fit"><SettingsIcon className="h-4 w-4 mr-2" /> Save Changes</Button>
      </div>

      <WalletCard />

      {scope.isJoint && peer && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-4 flex items-center gap-3">
          {peer.avatar_url ? (
            <img src={peer.avatar_url} className="h-12 w-12 rounded-full object-cover ring-2 ring-amber-400/40" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-amber-500/20 ring-2 ring-amber-400/40 flex items-center justify-center font-bold text-amber-200">
              {(peer.display_name || peer.full_name || 'P')[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-amber-200 flex items-center gap-1.5"><Users className="h-3 w-3" /> Partner Profile</p>
            <p className="font-heading font-semibold truncate">{peer.display_name || peer.full_name || 'Partner'}</p>
            <p className="text-xs font-mono text-primary mt-0.5">{peer.averia_id}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function HistorySection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[] | null>(null);

  const reload = async () => {
    if (!user) return;
    const { data } = await supabase.from('scan_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setItems(data || []);
  };

  useEffect(() => {
    reload();
    const h = () => reload();
    window.addEventListener('averia:scan-changed', h);
    return () => window.removeEventListener('averia:scan-changed', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const remove = async (id: string) => {
    await supabase.from('scan_history').delete().eq('id', id);
    setItems(prev => prev?.filter(i => i.id !== id) ?? null);
  };

  const verdictColor = (v: string) => v === 'Real' ? 'text-success' : v === 'Fake' ? 'text-destructive' : v === 'Misleading' ? 'text-warning' : 'text-muted-foreground';

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-heading text-xl font-bold">Fact-Check History</h2>
        <p className="text-muted-foreground text-sm">Your previous scans and their results</p>
      </div>
      {items === null ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
        : items.length === 0 ? (
          <div className="text-center py-10">
            <Shield className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No scans yet</p>
            <Button onClick={() => navigate('/scanner')} className="mt-3">Start Scanning</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="bg-secondary/30 rounded-lg p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-heading font-semibold ${verdictColor(item.verdict)}`}>{item.verdict}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">{item.trust_score}% Trust</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{item.content_url}</p>
                  <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(item.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function SavedSection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('saved_news').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      setItems(data || []);
    })();
  }, [user]);

  const remove = async (id: string) => {
    await supabase.from('saved_news').delete().eq('id', id);
    setItems(prev => prev?.filter(i => i.id !== id) ?? null);
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-heading text-xl font-bold">Saved News</h2>
        <p className="text-muted-foreground text-sm">Tap any row to open the full report inside Averia.</p>
      </div>
      {items === null ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
        : items.length === 0 ? (
          <div className="text-center py-10">
            <Bookmark className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No saved articles</p>
            <Button onClick={() => navigate('/news')} className="mt-3">Browse News</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="w-full text-left bg-secondary/30 hover:bg-secondary/50 rounded-lg p-3 flex items-start gap-3 transition-colors"
              >
                {item.image_url && <img src={item.image_url} alt="" className="w-16 h-16 object-cover rounded-lg shrink-0" />}
                <div className="flex-1 min-w-0">
                  <h4 className="font-heading font-semibold line-clamp-2 mb-1 text-sm">{item.title}</h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{item.source}</span>
                    {item.category && <><span>•</span><span className="capitalize">{item.category}</span></>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(item.url); toast.success('Link copied'); }}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(item.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </button>
            ))}
          </div>
        )}
      <SavedNewsDetailModal open={!!selected} onOpenChange={(o) => !o && setSelected(null)} item={selected} />
    </div>
  );
}

function ThemeSection() {
  const initial = (typeof window !== 'undefined' && (localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null)) || 'dark';
  const [theme, setTheme] = useState<'light' | 'dark'>(initial);
  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1">Theme</h2>
      <p className="text-muted-foreground text-sm mb-5">Switch the visual canvas across the entire app.</p>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        {(['dark', 'light'] as const).map(m => (
          <button key={m}
            onClick={() => { applyTheme(m); setTheme(m); toast.success(`${m === 'dark' ? 'Dark' : 'Light'} theme applied`); }}
            className={`rounded-2xl border-2 p-5 text-left transition-all ${
              theme === m ? 'border-primary bg-primary/10' : 'border-border/40 bg-secondary/20 hover:border-primary/40'
            }`}
          >
            {m === 'dark' ? <Moon className="h-5 w-5 text-primary mb-2" /> : <Sun className="h-5 w-5 text-amber-400 mb-2" />}
            <p className="font-heading font-bold capitalize">{m}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{m === 'dark' ? 'Deep space ambient' : 'High-clarity light'}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function LaunchSection() {
  const initial = (typeof window !== 'undefined' && localStorage.getItem(LAUNCH_KEY)) || 'default';
  const [v, setV] = useState(initial);
  const update = (val: string) => {
    setV(val);
    try {
      if (val === 'default') localStorage.removeItem(LAUNCH_KEY);
      else localStorage.setItem(LAUNCH_KEY, val);
    } catch {}
    toast.success('Default launch updated');
  };
  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1">Default Launch</h2>
      <p className="text-muted-foreground text-sm mb-5">Which screen opens when you sign in.</p>
      <div className="grid gap-3 max-w-md">
        {[
          { id: 'default',    label: 'Real News (default)', icon: Newspaper },
          { id: 'averia-ai',  label: 'Averia Agentic AI',    icon: Zap },
          { id: 'news',       label: 'Real News Section',    icon: Newspaper },
        ].map(o => (
          <button key={o.id} onClick={() => update(o.id)}
            className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
              v === o.id ? 'border-primary bg-primary/10' : 'border-border/40 bg-secondary/20 hover:border-primary/40'
            }`}>
            <o.icon className="h-5 w-5 text-primary" />
            <span className="font-semibold">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UpgradeSection() {
  const navigate = useNavigate();
  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1">Upgrade to Pro</h2>
      <p className="text-muted-foreground text-sm mb-5">Unlimited scans, deepfake detection, ad-free experience.</p>
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-5 max-w-md">
        <Crown className="h-8 w-8 text-primary mb-3" />
        <p className="font-heading text-2xl font-bold mb-1">₹499 <span className="text-xs font-normal text-muted-foreground">one-time</span></p>
        <p className="text-sm text-muted-foreground mb-4">Tip: hit 500 ATS from Public uploads to unlock Pro free!</p>
        <Button onClick={() => navigate('/pricing')}>View Plans</Button>
      </div>
    </div>
  );
}

function PushSection({ isSubscribed, pushLoading, subscribe, unsubscribe }: any) {
  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1">Settings</h2>
      <p className="text-muted-foreground text-sm mb-5">Account-wide preferences.</p>
      <div className="bg-secondary/30 border border-border/50 rounded-xl p-5 flex items-center justify-between max-w-md">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-primary" />
          <div>
            <h4 className="font-medium">Push Notifications</h4>
            <p className="text-sm text-muted-foreground">Alerts for payments and breaking news</p>
          </div>
        </div>
        <Switch checked={isSubscribed} onCheckedChange={() => isSubscribed ? unsubscribe() : subscribe()} disabled={pushLoading} />
      </div>
    </div>
  );
}

function SignOutSection({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1 text-destructive">Sign Out</h2>
      <p className="text-muted-foreground text-sm mb-5">End your session on this device.</p>
      <Button variant="destructive" onClick={onSignOut}><LogOut className="h-4 w-4 mr-2" /> Sign Out Now</Button>
    </div>
  );
}
