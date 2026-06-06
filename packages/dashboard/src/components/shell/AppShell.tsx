import { useAuth, RedirectToSignIn } from '@clerk/react';
import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav.tsx';
import Sidebar from './Sidebar.tsx';
import LandingPage from '../../pages/LandingPage.tsx';

export default function AppShell() {
  const { isSignedIn, isLoaded } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-base)] text-[var(--text-secondary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent"></div>
          <span className="text-xs font-medium tracking-wider uppercase font-sans">Loading Workspace...</span>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    if (location.pathname === '/') {
      return <LandingPage />;
    }
    return <RedirectToSignIn />;
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <TopNav />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--bg-base)]">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--bg-base)] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
