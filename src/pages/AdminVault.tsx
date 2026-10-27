import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Crown, Check, X, Clock, AlertTriangle, RefreshCw, User, Mail, MessageSquare, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SUBSCRIPTION_PLANS } from '@/lib/subscriptionPlans';

interface AIVerificationResult {
  verified: boolean;
  confidence: number;
  amount_detected?: string;
  utr_detected?: string;
  issues?: string[];
}

interface PaymentRequest {
  id: string;
  user_id: string;
  plan: string;
  amount: number;
  utr_number: string;
  screenshot_url: string;
  status: 'pending' | 'approved' | 'rejected';
  ai_verification_result: AIVerificationResult | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  user_email?: string;
}

interface SupportMessage {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  responded_at: string | null;
  admin_response: string | null;
}

const ADMIN_EMAIL = 's6113994@gmail.com';

export default function AdminVault() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<SupportMessage | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [adminResponse, setAdminResponse] = useState('');
  const [processing, setProcessing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    // Check if user email matches admin email
    if (user.email !== ADMIN_EMAIL) {
      toast.error('Access Denied: Super Admin only');
      navigate('/');
      return;
    }

    checkAdminStatus();
  }, [user, navigate]);

  useEffect(() => {
    if (!isAdmin) return;

    // Subscribe to realtime updates for payment requests
    const paymentsChannel = supabase
      .channel('admin_payments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_requests',
        },
        () => {
          fetchPaymentRequests();
        }
      )
      .subscribe();

    // Subscribe to support messages
    const messagesChannel = supabase
      .channel('admin_messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_messages',
        },
        () => {
          fetchSupportMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [isAdmin]);

  const checkAdminStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error('Access Denied: Admin only');
        navigate('/');
        return;
      }

      setIsAdmin(true);
      await Promise.all([fetchPaymentRequests(), fetchSupportMessages()]);
    } catch (error) {
      console.error('Admin check error:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const requestsWithEmails = await Promise.all(
        (data || []).map(async (request) => {
          const { data: email } = await supabase
            .rpc('admin_get_user_email', { _user_id: request.user_id });

          return {
            ...request,
            ai_verification_result: request.ai_verification_result as unknown as AIVerificationResult | null,
            user_email: (email as string | null) || 'Unknown',
          };
        })
      );


      setRequests(requestsWithEmails);
      setPendingCount(requestsWithEmails.filter((r) => r.status === 'pending').length);
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load payment requests');
    }
  };

  const fetchSupportMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSupportMessages(data || []);
      setUnreadMessages((data || []).filter((m) => m.status === 'unread').length);
    } catch (error) {
      console.error('Fetch messages error:', error);
    }
  };

  // The database owns payment status and tier changes; the browser only asks.
  const tierFromReview = (result: unknown): string | null => {
    if (!result || typeof result !== 'object') return null;
    const payload = result as Record<string, unknown>;
    const candidate = payload.tier;
    return typeof candidate === 'string' ? candidate : null;
  };

  const approveRequest = async (request: PaymentRequest, notes: string) => {
    setProcessing(true);
    try {
      // admin_review_payment flips the status and unlocks the tier server-side.
      const { data, error } = await supabase.rpc('admin_review_payment', {
        _payment_id: request.id,
        _decision: 'approved',
        _admin_notes: notes || undefined,
      });

      if (error) throw error;

      const tier = tierFromReview(data) ?? request.plan;
      toast.success(`Payment approved — ${tier} tier unlocked.`);

      setSelectedRequest(null);
      setAdminNotes('');
      await fetchPaymentRequests();
    } catch (error) {
      console.error('Approve error:', error);
      toast.error('Failed to approve payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    await approveRequest(selectedRequest, adminNotes);
  };

  const handleReject = async () => {
    if (!selectedRequest) return;

    setProcessing(true);
    try {
      const { error } = await supabase.rpc('admin_review_payment', {
        _payment_id: selectedRequest.id,
        _decision: 'rejected',
        _admin_notes: adminNotes || undefined,
      });

      if (error) throw error;

      await supabase.functions.invoke('send-notification', {
        body: {
          userId: selectedRequest.user_id,
          title: 'Payment Not Verified',
          body: adminNotes || 'Your payment could not be verified. Please contact support.',
          type: 'payment_rejected',
          data: { amount: selectedRequest.amount },
        },
      });

      toast.success('Payment rejected');
      setSelectedRequest(null);
      setAdminNotes('');
      await fetchPaymentRequests();
    } catch (error) {
      console.error('Reject error:', error);
      toast.error('Failed to reject payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleRespondToMessage = async () => {
    if (!selectedMessage || !adminResponse.trim()) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('support_messages')
        .update({
          status: 'responded',
          admin_response: adminResponse,
          responded_at: new Date().toISOString(),
        })
        .eq('id', selectedMessage.id);

      if (error) throw error;

      toast.success('Response saved');
      setSelectedMessage(null);
      setAdminResponse('');
      await fetchSupportMessages();
    } catch (error) {
      console.error('Respond error:', error);
      toast.error('Failed to save response');
    } finally {
      setProcessing(false);
    }
  };

  const markMessageAsRead = async (message: SupportMessage) => {
    if (message.status === 'unread') {
      await supabase
        .from('support_messages')
        .update({ status: 'read' })
        .eq('id', message.id);
      
      await fetchSupportMessages();
    }
    setSelectedMessage(message);
    setAdminResponse(message.admin_response || '');
  };

  const planLabel = (plan: string) =>
    SUBSCRIPTION_PLANS.find((item) => item.id === plan)?.name ?? plan;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-success bg-success/10 border-success/30';
      case 'rejected': return 'text-destructive bg-destructive/10 border-destructive/30';
      case 'responded': return 'text-success bg-success/10 border-success/30';
      case 'read': return 'text-muted-foreground bg-secondary/30 border-border';
      default: return 'text-warning bg-warning/10 border-warning/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <Check className="h-4 w-4" />;
      case 'rejected': return <X className="h-4 w-4" />;
      case 'responded': return <Check className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex items-center justify-center">
          <div className="text-center">
            <Shield className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h1 className="font-heading text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground">This area is restricted to the Super Admin.</p>
            <p className="text-sm text-muted-foreground mt-2">Only {ADMIN_EMAIL} can access this page.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-8 w-8 text-primary" />
                <h1 className="font-heading text-4xl font-bold">
                  Admin <span className="gradient-text">Vault</span>
                </h1>
              </div>
              <p className="text-muted-foreground">
                Super Admin Dashboard • {ADMIN_EMAIL}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {pendingCount > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 px-4 py-2 bg-warning/10 border border-warning/30 rounded-full"
                >
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="font-medium text-warning">
                    {pendingCount} Pending
                  </span>
                </motion.div>
              )}
              {unreadMessages > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full"
                >
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <span className="font-medium text-primary">
                    {unreadMessages} Messages
                  </span>
                </motion.div>
              )}
              <Button variant="outline" onClick={() => { fetchPaymentRequests(); fetchSupportMessages(); }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Pending Payments', value: requests.filter((r) => r.status === 'pending').length, color: 'text-warning' },
              { label: 'Approved', value: requests.filter((r) => r.status === 'approved').length, color: 'text-success' },
              { label: 'Rejected', value: requests.filter((r) => r.status === 'rejected').length, color: 'text-destructive' },
              { label: 'Unread Messages', value: unreadMessages, color: 'text-primary' },
            ].map((stat) => (
              <div key={stat.label} className="glass-card rounded-xl p-6">
                <p className="text-muted-foreground text-sm">{stat.label}</p>
                <p className={`font-heading text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="payments" className="space-y-6">
            <TabsList className="glass-card">
              <TabsTrigger value="payments" className="gap-2">
                <Crown className="h-4 w-4" />
                Payment Requests
                {pendingCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-warning/20 text-warning text-xs">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="messages" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Support Messages
                {unreadMessages > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs">
                    {unreadMessages}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Payments Tab */}
            <TabsContent value="payments">
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="font-heading font-semibold">Payment Requests</h2>
                </div>

                {requests.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Crown className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No payment requests yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {requests.map((request) => (
                      <motion.div
                        key={request.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-4 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{request.user_email}</p>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${getStatusColor(request.status)}`}>
                                  {getStatusIcon(request.status)}
                                  {request.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span>₹{request.amount}</span>
                                <span>•</span>
                                <span className="text-foreground/80">{planLabel(request.plan)}</span>
                                <span>•</span>
                                <span>UTR: {request.utr_number}</span>
                                <span>•</span>
                                <span>{new Date(request.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedRequest(request);
                                setAdminNotes('');
                              }}
                            >
                              Details
                            </Button>
                            {request.status === 'pending' && (
                              <Button
                                size="sm"
                                onClick={() => approveRequest(request, '')}
                                disabled={processing}
                                className="glow-success"
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Approve &amp; Unlock Tier
                              </Button>
                            )}
                            {request.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setAdminNotes('');
                                }}
                              >
                                Review
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Messages Tab */}
            <TabsContent value="messages">
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="font-heading font-semibold">Support Messages</h2>
                </div>

                {supportMessages.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No support messages yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {supportMessages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`p-4 hover:bg-secondary/30 transition-colors cursor-pointer ${
                          message.status === 'unread' ? 'bg-primary/5' : ''
                        }`}
                        onClick={() => markMessageAsRead(message)}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                              <Mail className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{message.name}</p>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${getStatusColor(message.status)}`}>
                                  {message.status}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground truncate">{message.subject}</p>
                              <p className="text-xs text-muted-foreground">{message.email} • {new Date(message.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Payment Request</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="font-medium text-sm truncate">{selectedRequest.user_email}</p>
                </div>
                <div className="glass-card p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-heading font-bold">₹{selectedRequest.amount}</p>
                </div>
                <div className="glass-card p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <p className="font-medium text-sm">{planLabel(selectedRequest.plan)}</p>
                </div>
                <div className="glass-card p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">UTR Number</p>
                  <p className="font-mono text-sm">{selectedRequest.utr_number}</p>
                </div>
                <div className="glass-card p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm">{new Date(selectedRequest.created_at).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Admin Notes (optional)</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about this verification..."
                  className="bg-secondary/30"
                />
              </div>

              {selectedRequest.status === 'pending' ? (
                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleReject}
                    disabled={processing}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    className="flex-1 glow-primary"
                    onClick={handleApprove}
                    disabled={processing}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approve &amp; Unlock Tier
                  </Button>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  This request was already {selectedRequest.status}.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Support Message</DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="glass-card p-4 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{selectedMessage.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedMessage.email}</p>
                  </div>
                </div>
                <p className="font-semibold mb-2">{selectedMessage.subject}</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{selectedMessage.message}</p>
                <p className="text-xs text-muted-foreground mt-3">
                  {new Date(selectedMessage.created_at).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Admin Response</Label>
                <Textarea
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                  placeholder="Write your response..."
                  rows={4}
                  className="bg-secondary/30"
                />
              </div>

              <Button
                className="w-full"
                onClick={handleRespondToMessage}
                disabled={processing || !adminResponse.trim()}
              >
                <Check className="h-4 w-4 mr-2" />
                Save Response
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
