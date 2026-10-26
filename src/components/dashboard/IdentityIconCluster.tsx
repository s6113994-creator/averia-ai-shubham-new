import { useState } from 'react';
import { UserPlus, Bell } from 'lucide-react';
import { AccountSwitcher } from '@/components/joint/AccountSwitcher';
import { GenerateJointAccountModal } from '@/components/joint/GenerateJointAccountModal';
import { JointRequestsPopup } from '@/components/joint/JointRequestsPopup';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Inline iconography cluster of three textless action buttons positioned
 * to the right of the username row.
 *   1. Shuffle  → AccountSwitcher popover (existing)
 *   2. UserPlus → GenerateJointAccountModal (existing)
 *   3. Bell     → JointRequestsPopup (existing)
 * No backend/logic is recreated; this only re-routes triggers.
 */
export function IdentityIconCluster() {
  const [genOpen, setGenOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);

  const btn = 'h-8 w-8 rounded-full bg-secondary/50 hover:bg-primary/20 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors';

  return (
    <div className="flex items-center gap-1.5">
      {/* Shuffle → AccountSwitcher (already renders its own popover trigger) */}
      <AccountSwitcher />

      <Tooltip>
        <TooltipTrigger asChild>
          <button aria-label="Generate Joint Account" className={btn} onClick={() => setGenOpen(true)}>
            <UserPlus className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Generate Joint Account</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button aria-label="Joint Account Requests" className={btn} onClick={() => setReqOpen(true)}>
            <Bell className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Joint Requests</TooltipContent>
      </Tooltip>

      <GenerateJointAccountModal open={genOpen} onOpenChange={setGenOpen} />
      <JointRequestsPopup open={reqOpen} onOpenChange={setReqOpen} />
    </div>
  );
}
