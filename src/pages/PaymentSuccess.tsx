import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout/Layout';

export default function PaymentSuccess() {
  return (
    <Layout showFooter={false}>
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
            <div className="relative w-full h-full rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-success" />
            </div>
          </div>

          <h1 className="font-heading text-3xl font-bold mb-4">
            Payment <span className="gradient-text">Successful!</span>
          </h1>
          
          <p className="text-muted-foreground mb-8">
            Welcome to Averia AI Pro! You now have access to all premium features.
          </p>

          <div className="glass-card p-6 rounded-xl mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Crown className="h-5 w-5 text-primary" />
              <span className="font-heading font-semibold text-primary">Pro Member</span>
            </div>
            <ul className="text-left space-y-2 text-sm">
              {[
                'Unlimited scans',
                'Deepfake detection',
                'Ad-free experience',
                'Priority support',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success shrink-0" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild className="glow-primary">
              <Link to="/scanner">
                Start Scanning
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">
                Go to Dashboard
              </Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
