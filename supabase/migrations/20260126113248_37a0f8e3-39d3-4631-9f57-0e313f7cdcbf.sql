-- Create support_messages table for contact form
CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  admin_response TEXT
);

-- Enable Row Level Security
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Only admins can view support messages
CREATE POLICY "Admins can view all support messages"
ON public.support_messages
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can create support messages (including guests)
CREATE POLICY "Anyone can create support messages"
ON public.support_messages
FOR INSERT
WITH CHECK (true);

-- Only admins can update support messages
CREATE POLICY "Admins can update support messages"
ON public.support_messages
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));