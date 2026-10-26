import { Link } from 'react-router-dom';
import { Youtube, Instagram, Linkedin, Mail } from 'lucide-react';
import { AveriaLogo } from '@/components/AveriaLogo';
import { ContactForm } from '@/components/ContactForm';
import { Button } from '@/components/ui/button';

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-card/50 mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <AveriaLogo size="sm" />
              <span className="font-heading font-bold text-lg" style={{ color: '#FFFFFF' }}>
                Averia AI
              </span>
            </Link>
            <p className="text-muted-foreground text-sm">
              Your intelligent companion for verified global news and AI-powered deepfake detection. Stay informed, stay protected.
            </p>
            <div className="flex gap-3">
              <a 
                href="https://linkedin.com" 
                className="text-muted-foreground hover:text-primary transition-colors"
                onClick={(e) => { e.preventDefault(); }}
              >
                <Linkedin className="h-5 w-5" />
              </a>
              <a 
                href="https://youtube.com" 
                className="text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => { e.preventDefault(); }}
              >
                <Youtube className="h-5 w-5" />
              </a>
              <a 
                href="https://instagram.com" 
                className="text-muted-foreground hover:text-accent transition-colors"
                onClick={(e) => { e.preventDefault(); }}
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a 
                href="mailto:s6113994@gmail.com"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-heading font-semibold mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/detector" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  AI Detector
                </Link>
              </li>
              <li>
                <Link to="/scanner" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  Fact Scanner
                </Link>
              </li>
              <li>
                <Link to="/news" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  Real News
                </Link>
              </li>
              <li>
                <Link to="/debunked" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  Debunked
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-heading font-semibold mb-4">Company</h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  Blog
                </a>
              </li>
              <li>
                <Link to="/contact" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Support & Legal */}
          <div>
            <h4 className="font-heading font-semibold mb-4">Support & Legal</h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                  Cookie Policy
                </a>
              </li>
            </ul>
            
            {/* Contact Support Form */}
            <div className="mt-4">
              <ContactForm />
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 mt-8 pt-8 text-center text-muted-foreground text-sm">
          <p>© {new Date().getFullYear()} Averia AI. All rights reserved.</p>
          <p className="mt-2 text-xs">Founded by Ganesh Rajak</p>
        </div>
      </div>
    </footer>
  );
}
