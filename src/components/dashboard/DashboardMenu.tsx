import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

/**
 * 3-dot button on the dashboard header. Pushes user into a dedicated
 * /dashboard/settings route instead of opening a dropdown.
 */
export function DashboardMenu(_props: { onScrollTo?: (id: string) => void } = {}) {
  const navigate = useNavigate();
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Open settings"
      onClick={() => navigate('/dashboard/settings')}
      className="h-9 w-9 rounded-full border-primary/30 bg-primary/5 hover:bg-primary/15"
    >
      <MoreVertical className="h-4 w-4" />
    </Button>
  );
}
