import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useScope } from '@/lib/scope';
import { toast } from 'sonner';

interface ProjectRecord {
  id: string;
  title: string | null;
  created_at: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  environment_context: string | null;
}

type ProjectFilter = 'all' | 'recent' | 'published';

export default function Projects() {
  const { user } = useAuth();
  const scope = useScope();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) {
        setProjects([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('vault_items')
        .select('id, title, created_at, content, metadata, environment_context')
        .eq('user_id', user.id)
        .eq('vault_type', 'agentic')
        .eq('kind', 'project')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) {
        toast.error('Could not load your projects');
        setProjects([]);
      } else {
        const environment = scope.isJoint ? 'joint' : 'personal';
        setProjects((data || []).filter((project: any) => (project.environment_context || 'personal') === environment) as ProjectRecord[]);
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [user, scope.isJoint, scope.workspaceId]);

  const visibleProjects = useMemo(() => projects.filter((project) => {
    const matchesText = `${project.title || ''} ${project.content || ''}`.toLowerCase().includes(search.toLowerCase());
    const isPublished = Boolean(project.metadata?.published);
    const matchesFilter = filter === 'all' || (filter === 'published' ? isPublished : !isPublished);
    return matchesText && matchesFilter;
  }), [projects, search, filter]);

  return (
    <Layout showFooter={false}>
      <main className="min-h-screen px-4 pb-12 pt-16 md:px-8 md:pt-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Averia AI</p>
              <h1 className="flex items-center gap-3 text-3xl font-semibold"><FolderOpen className="h-7 w-7" /> All Projects</h1>
            </div>
            <Button onClick={() => navigate('/averia-ai')} className="gap-2"><Sparkles className="h-4 w-4" /> New project</Button>
          </header>

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" className="pl-10" />
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Project filters">
              {(['all', 'recent', 'published'] as const).map((item) => (
                <Button key={item} variant={filter === item ? 'secondary' : 'ghost'} onClick={() => setFilter(item)} className="capitalize">{item === 'recent' ? 'In progress' : item}</Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading projects…</div>
          ) : visibleProjects.length === 0 ? (
            <div className="py-20 text-center">
              <FolderOpen className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
              <p className="text-lg font-medium">No matching projects</p>
              <p className="mt-1 text-sm text-muted-foreground">Projects you create will appear here.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => navigate(`/averia-ai?project=${encodeURIComponent(project.id)}&resume=1`)}
                  className="group min-h-40 rounded-xl border border-border bg-card p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl active:scale-[.98]"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <FolderOpen className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5" />
                    {Boolean(project.metadata?.published) && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">Published</span>}
                  </div>
                  <h2 className="mb-2 text-lg font-semibold">{project.title || 'Untitled Project'}</h2>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{project.content || 'Open this project to continue working.'}</p>
                  <time className="mt-5 block text-xs text-muted-foreground" dateTime={project.created_at}>
                    {new Date(project.created_at).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}
                  </time>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </Layout>
  );
}