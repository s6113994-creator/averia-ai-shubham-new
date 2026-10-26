import { FloatingAIChatBubble } from '@/components/FloatingAIChatBubble';
import { motion } from 'framer-motion';
import { Link, Navigate } from 'react-router-dom';
import { 
  Shield, 
  Globe, 
  AlertTriangle, 
  Zap, 
  CheckCircle,
  ArrowRight,
  Brain,
  Lock
} from 'lucide-react';
import { AveriaLogo } from '@/components/AveriaLogo';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const { user, loading } = useAuth();

  if (!loading && user) return <Navigate to="/averia-ai" replace />;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3">
          <AveriaLogo size="md" animate />
          <span className="font-heading text-lg font-semibold">Averia AI</span>
        </div>
      </div>
    );
  }

  const features = [
    {
      icon: Shield,
      title: 'Universal Detector',
      description: 'Multi-modal AI verification for text, images, and videos. Detect deepfakes with precision.',
      color: 'text-primary',
      gradient: 'from-primary/20 to-primary/5',
    },
    {
      icon: Globe,
      title: 'Global Real News',
      description: 'Curated feed of verified news from trusted sources worldwide. No fake news, only facts.',
      color: 'text-success',
      gradient: 'from-success/20 to-success/5',
    },
    {
      icon: AlertTriangle,
      title: 'Debunked Repository',
      description: 'Archive of busted misinformation with AI-generated reasoning and evidence links.',
      color: 'text-destructive',
      gradient: 'from-destructive/20 to-destructive/5',
    },
    {
      icon: Brain,
      title: 'AI-Powered Analysis',
      description: 'Advanced Averia AI technology for deep content analysis and truth verification.',
      color: 'text-accent',
      gradient: 'from-accent/20 to-accent/5',
    },
  ];

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 star-field opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
        
        <div className="container mx-auto px-4 pt-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-4xl mx-auto"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-8"
            >
              <AveriaLogo size="xs" style={{ filter: 'none', borderRadius: 0 }} />
              <span className="text-sm font-medium">AI-Powered News Intelligence</span>
            </motion.div>

            {/* Headline */}
            <h1 className="font-heading text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="gradient-text">Averia AI</span>
              <br />
              <span className="text-foreground">Truth in Every Pixel</span>
            </h1>

            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Your intelligent companion for verified global news and AI-powered deepfake detection. 
              Stay informed with real-time verification, fact-checking, and media authenticity analysis.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="glow-primary text-lg px-8">
                <Link to="/detector">
                  <AveriaLogo size="xs" style={{ filter: 'none', borderRadius: 0 }} className="mr-2" />
                  Verify Content
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8">
                <Link to="/news">
                  <Globe className="mr-2 h-5 w-5" />
                  Explore News
                </Link>
              </Button>
            </div>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <span>Real-time Verification</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span>Deepfake Detection</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-accent" />
                <span>Privacy Protected</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-heading text-4xl font-bold mb-4">
              <span className="gradient-text-purple">Powerful</span> Features
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Everything you need to verify content and stay informed in the age of AI-generated media.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="glass-card p-6 rounded-2xl hover:border-primary/50 transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="font-heading font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-card/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-heading text-4xl font-bold mb-4">
              How It <span className="gradient-text-gold">Works</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Simple three-step process to verify any content
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: '01', title: 'Upload Content', desc: 'Paste a URL or upload an image/video for verification' },
              { step: '02', title: 'AI Analysis', desc: 'Our advanced AI scans for deepfakes and misinformation' },
              { step: '03', title: 'Get Results', desc: 'Receive a detailed trust score with reasoning' },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="text-center"
              >
                <div className="text-6xl font-heading font-bold gradient-text mb-4">{item.step}</div>
                <h3 className="font-heading font-semibold text-xl mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="glass-card p-12 rounded-3xl text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10" />
            <div className="relative z-10">
              <Zap className="h-12 w-12 text-accent mx-auto mb-6" />
              <h2 className="font-heading text-4xl font-bold mb-4">
                Ready to Verify?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Join thousands of users who trust Averia AI for authentic news and content verification.
              </p>
              <Button asChild size="lg" className="glow-accent bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/auth?mode=signup">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
      <FloatingAIChatBubble />
    </Layout>
  );
}
