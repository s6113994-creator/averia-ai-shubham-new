import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X, LogOut, Crown, MessageCircle, Headphones } from 'lucide-react';
import { AveriaLogo } from '@/components/AveriaLogo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { NotificationCenter } from '@/components/NotificationCenter';
import { GlobalSearch } from '@/components/GlobalSearch';
import { UserAvatar } from '@/components/UserAvatar';
import { ContactForm } from '@/components/ContactForm';
import { AccountSwitcher } from '@/components/joint/AccountSwitcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global horizontal navbar is deprecated — the persistent AppShell sidebar owns navigation.
  // Only guest (unauthenticated) views still render the legacy header for landing/marketing.
  if (user) return null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const navLinks = [
    { label: 'Verify', href: '/scanner' },
    { label: 'Real News', href: '/news' },
    { label: 'Averia AI', href: '/averia-ai' },
    { label: 'Community', href: '/social' },
    { label: 'Debunked', href: '/debunked' },
    { label: 'Pricing', href: '/pricing' },
  ];

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      data-app-chrome
      className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-border/50"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex items-center justify-center w-10 h-10 overflow-visible">
              <AveriaLogo size="lg" animate className="transition-transform group-hover:scale-110" style={{ height: '100%', width: 'auto', objectFit: 'contain', imageRendering: 'crisp-edges', padding: 0, margin: 0 }} />
            </div>
            <span className="font-heading font-semibold text-xl tracking-wide" style={{ color: '#FFFFFF' }}>
              Averia AI
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={(e) => {
                  // Mirror protection: navbar buttons must always exit any read-only peer mirror
                  // and load the unified workspace (Joint Brain when in JOINT scope).
                  e.preventDefault();
                  navigate(link.href, { replace: false });
                }}
                className="text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {/* Global Search */}
            <GlobalSearch />

            {user && (
              <>
                <AccountSwitcher />
                <NotificationCenter />
                <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
                  <MessageCircle className="h-5 w-5" />
                </Button>
              </>
            )}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2">
                    <UserAvatar size="sm" />
                    <span className="max-w-32 truncate hidden sm:inline">
                      {user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0]}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                    <UserAvatar size="sm" />
                    <span className="ml-2">Dashboard</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/pricing')}>
                    <Crown className="h-4 w-4 mr-2" />
                    Upgrade to Pro
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/news')}>
                  Browse as Guest
                </Button>
                <Button variant="ghost" onClick={() => navigate('/auth')}>
                  Sign In
                </Button>
                <Button onClick={() => navigate('/auth?mode=signup')} className="glow-primary">
                  Get Started
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden py-4 border-t border-border/50"
          >
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="mailto:s6113994@gmail.com"
                className="px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors flex items-center gap-2"
              >
                <Headphones className="h-4 w-4" />
                Contact Support
              </a>
              {user ? (
                <>
                  <Link
                    to="/dashboard"
                    className="px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="px-4 py-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/news"
                    className="px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Browse as Guest
                  </Link>
                  <Link
                    to="/auth"
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-center font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Get Started
                  </Link>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </div>
    </motion.header>
  );
}
