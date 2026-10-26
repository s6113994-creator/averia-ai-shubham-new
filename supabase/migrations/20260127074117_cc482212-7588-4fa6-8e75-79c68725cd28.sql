-- Create user_wallets table for coin system
CREATE TABLE public.user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  coins INTEGER NOT NULL DEFAULT 5,
  last_daily_claim TIMESTAMP WITH TIME ZONE,
  total_earned INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

-- Users can view their own wallet
CREATE POLICY "Users can view their own wallet"
ON public.user_wallets
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own wallet
CREATE POLICY "Users can update their own wallet"
ON public.user_wallets
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can insert their own wallet
CREATE POLICY "Users can insert their own wallet"
ON public.user_wallets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_wallets_updated_at
BEFORE UPDATE ON public.user_wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to initialize wallet on user creation
CREATE OR REPLACE FUNCTION public.create_wallet_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_wallets (user_id, coins)
  VALUES (NEW.id, 5)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-create wallet when profile is created
CREATE TRIGGER on_profile_created_create_wallet
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.create_wallet_for_new_user();