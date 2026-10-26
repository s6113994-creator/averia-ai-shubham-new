import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { useAuth } from '@/hooks/useAuth';

interface LayoutProps {
  children: ReactNode;
  showFooter?: boolean;
  hideHeader?: boolean;
}

export function Layout({ children, showFooter = true, hideHeader = false }: LayoutProps) {
  const { user } = useAuth();
  // Header only renders for guests; authorized users get a full-bleed top-0 canvas.
  const headerVisible = !hideHeader && !user;
  return (
    <div className="min-h-screen flex flex-col">
      {!hideHeader && <Header />}
      <main className={`flex-1 ${headerVisible ? 'pt-16' : 'pt-0'}`}>
        {children}
      </main>
      {showFooter && <Footer />}
    </div>
  );
}
