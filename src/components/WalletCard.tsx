import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Coins, Gift, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface WalletData {
  coins: number;
  last_daily_claim: string | null;
  total_earned: number;
}

export function WalletCard() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [canClaim, setCanClaim] = useState(false);

  useEffect(() => {
    if (user) {
      fetchWallet();
    }
  }, [user]);

  const fetchWallet = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Try to get existing wallet
      let { data, error } = await supabase
        .from('user_wallets')
        .select('coins, last_daily_claim, total_earned')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      // If no wallet exists, create one
      if (!data) {
        const { data: newWallet, error: createError } = await supabase
          .from('user_wallets')
          .insert({ user_id: user.id, coins: 5, total_earned: 5 })
          .select('coins, last_daily_claim, total_earned')
          .single();

        if (createError) throw createError;
        data = newWallet;
      }

      setWallet(data);
      
      // Check if user can claim daily coins
      if (data.last_daily_claim) {
        const lastClaim = new Date(data.last_daily_claim);
        const now = new Date();
        const hoursSinceClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
        setCanClaim(hoursSinceClaim >= 24);
      } else {
        setCanClaim(true);
      }
    } catch (error) {
      console.error('Error fetching wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  const claimDailyCoins = async () => {
    if (!user || !wallet || claiming) return;

    setClaiming(true);
    try {
      const { error } = await supabase
        .from('user_wallets')
        .update({
          coins: wallet.coins + 5,
          last_daily_claim: new Date().toISOString(),
          total_earned: wallet.total_earned + 5,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setWallet({
        ...wallet,
        coins: wallet.coins + 5,
        last_daily_claim: new Date().toISOString(),
        total_earned: wallet.total_earned + 5,
      });
      setCanClaim(false);
      toast.success('🎉 +5 Coins claimed! Come back tomorrow for more.');
    } catch (error) {
      console.error('Error claiming coins:', error);
      toast.error('Failed to claim coins. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-6 relative overflow-hidden"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-primary/10" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-accent" />
            <h3 className="font-heading font-semibold">Averia Wallet</h3>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent/30 to-primary/30 flex items-center justify-center">
            <Coins className="h-7 w-7 text-accent" />
          </div>
          <div>
            <p className="text-3xl font-heading font-bold gradient-text-gold">
              {wallet?.coins || 0}
            </p>
            <p className="text-sm text-muted-foreground">Available Coins</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="text-xs text-muted-foreground">
            Total earned: {wallet?.total_earned || 0} coins
          </div>
          
          {canClaim ? (
            <Button
              size="sm"
              onClick={claimDailyCoins}
              disabled={claiming}
              className="gap-1 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {claiming ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Gift className="h-3 w-3" />
              )}
              Claim +5
            </Button>
          ) : (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle className="h-3 w-3 text-success" />
              Claimed today
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
