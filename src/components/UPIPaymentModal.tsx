import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Upload, CheckCircle, AlertCircle, Loader2, Smartphone, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';

interface UPIPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  amount: number;
}

const UPI_ID = 'ganeshrajak123451@okhdfcbank';

export function UPIPaymentModal({ open, onOpenChange, planName, amount }: UPIPaymentModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'pay' | 'upload' | 'verifying' | 'submitted'>('pay');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [aiResult, setAiResult] = useState<{
    verified: boolean;
    confidence: number;
    amount_detected?: string;
    utr_detected?: string;
    issues?: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upiIntentUrl = `upi://pay?pa=${UPI_ID}&pn=Averia%20AI&am=${amount}&cu=INR&tn=Averia%20AI%20Pro%20Subscription`;

  const handlePayClick = () => {
    // Try to open UPI app
    window.location.href = upiIntentUrl;
    
    // After a short delay, show upload step
    setTimeout(() => {
      setStep('upload');
    }, 1000);
  };

  const handleCopyUPI = () => {
    navigator.clipboard.writeText(UPI_ID);
    toast.success('UPI ID copied!');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setScreenshot(file);
      setScreenshotPreview(URL.createObjectURL(file));
    }
  };

  const verifyWithAI = async () => {
    if (!screenshot || !user) return;

    setVerifying(true);
    setStep('verifying');

    try {
      // Convert image to base64
      const reader = new FileReader();
      reader.readAsDataURL(screenshot);
      
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
      });

      // Call AI verification
      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: {
          screenshotBase64: base64,
          utrNumber,
          expectedAmount: amount,
        },
      });

      if (error) throw error;

      setAiResult(data);

      // If UTR was detected, auto-fill it
      if (data.utr_detected && !utrNumber) {
        setUtrNumber(data.utr_detected);
      }

      if (data.verified) {
        toast.success('Payment verified by AI!');
      } else {
        toast.warning('AI could not fully verify. You can still submit for manual review.');
      }
    } catch (error) {
      console.error('AI verification error:', error);
      toast.error('AI verification failed. Please enter details manually.');
    } finally {
      setVerifying(false);
      setStep('upload');
    }
  };

  const handleSubmit = async () => {
    if (!screenshot || !utrNumber || !user) {
      toast.error('Please provide screenshot and UTR number');
      return;
    }

    setVerifying(true);

    try {
      // Upload screenshot to storage (we'll use base64 for now since storage isn't set up)
      const reader = new FileReader();
      reader.readAsDataURL(screenshot);
      
      const base64Url = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });

      // Create payment request
      const { error } = await supabase
        .from('payment_requests')
        .insert({
          user_id: user.id,
          amount,
          utr_number: utrNumber,
          screenshot_url: base64Url,
          ai_verification_result: aiResult,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('This UTR has already been submitted');
        } else {
          throw error;
        }
        return;
      }

      setStep('submitted');
      toast.success('Payment submitted for verification!');
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed to submit payment');
    } finally {
      setVerifying(false);
    }
  };

  const resetModal = () => {
    setStep('pay');
    setScreenshot(null);
    setScreenshotPreview(null);
    setUtrNumber('');
    setAiResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {step === 'submitted' ? 'Payment Submitted!' : `Upgrade to ${planName}`}
          </DialogTitle>
          <DialogDescription>
            {step === 'submitted' 
              ? 'Your payment is being reviewed'
              : 'Pay securely via UPI'}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 'pay' && (
            <motion.div
              key="pay"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 py-4"
            >
              <div className="glass-card p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span>Monthly subscription</span>
                  <span className="font-heading font-bold text-xl">₹{amount}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">UPI ID</p>
                    <p className="font-mono font-medium">{UPI_ID}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleCopyUPI}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <Button onClick={handlePayClick} className="w-full glow-primary" size="lg">
                  <Smartphone className="h-5 w-5 mr-2" />
                  Pay ₹{amount} via UPI
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  This will open your UPI app (GPay, PhonePe, Paytm, etc.)
                </p>
              </div>

              <Button 
                variant="ghost" 
                className="w-full" 
                onClick={() => setStep('upload')}
              >
                I've already paid, upload screenshot
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-4 w-4" />
                Secured Manual UPI Verification
              </div>
            </motion.div>
          )}

          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 py-4"
            >
              {/* Screenshot Upload */}
              <div className="space-y-2">
                <Label>Payment Screenshot</Label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {screenshotPreview ? (
                  <div className="relative">
                    <img
                      src={screenshotPreview}
                      alt="Payment screenshot"
                      className="w-full h-48 object-cover rounded-lg border border-border"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Upload payment screenshot
                    </span>
                  </button>
                )}
              </div>

              {/* AI Verification Button */}
              {screenshot && !aiResult && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={verifyWithAI}
                  disabled={verifying}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      AI Scanning...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Auto-scan with AI
                    </>
                  )}
                </Button>
              )}

              {/* AI Result */}
              {aiResult && (
                <div className={`p-4 rounded-lg border ${
                  aiResult.verified 
                    ? 'bg-success/10 border-success/30' 
                    : 'bg-warning/10 border-warning/30'
                }`}>
                  <div className="flex items-start gap-3">
                    {aiResult.verified ? (
                      <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium text-sm">
                        {aiResult.verified ? 'Payment Verified' : 'Needs Manual Review'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Confidence: {aiResult.confidence}%
                      </p>
                      {aiResult.amount_detected && (
                        <p className="text-xs text-muted-foreground">
                          Amount found: {aiResult.amount_detected}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* UTR Input */}
              <div className="space-y-2">
                <Label htmlFor="utr">UTR / Transaction ID</Label>
                <Input
                  id="utr"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  placeholder="12-digit UPI Transaction ID"
                  className="bg-secondary/30"
                />
                <p className="text-xs text-muted-foreground">
                  Find this in your payment app's transaction details
                </p>
              </div>

              <Button
                onClick={handleSubmit}
                className="w-full glow-primary"
                disabled={!screenshot || !utrNumber || verifying}
              >
                {verifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Submit for Verification
              </Button>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-4 w-4" />
                Secured Manual UPI Verification
              </div>
            </motion.div>
          )}

          {step === 'verifying' && (
            <motion.div
              key="verifying"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-12 text-center"
            >
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <p className="font-medium">AI is scanning your screenshot...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Extracting payment details automatically
              </p>
            </motion.div>
          )}

          {step === 'submitted' && (
            <motion.div
              key="submitted"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <h3 className="font-heading text-xl font-bold mb-2">
                Payment Submitted!
              </h3>
              <p className="text-muted-foreground text-sm mb-6">
                Your payment is being reviewed. You'll receive a notification once approved.
              </p>
              <Button onClick={resetModal}>
                Got it!
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
