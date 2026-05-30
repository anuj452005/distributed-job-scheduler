
import { SignIn } from '@clerk/react';
import { Activity } from 'lucide-react';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] p-4 relative overflow-hidden select-none">
      {/* Premium Background Accent Gradients */}
      <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--accent-primary-subtle)_0%,transparent_70%)] opacity-40 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--state-queued-bg)_0%,transparent_70%)] opacity-30 blur-3xl pointer-events-none"></div>

      <div className="z-10 flex flex-col items-center gap-6 w-full max-w-md">
        {/* Branding header */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-surface-raised)] border border-[var(--border-strong)] shadow-lg animate-pulse">
            <Activity className="h-6 w-6 text-[var(--accent-primary)]" strokeWidth={1.5} />
          </div>
          <h1 className="font-sans text-[var(--text-primary)] text-xl font-bold tracking-wider mt-2">
            FLOW<span className="text-[var(--accent-primary)]">FORGE</span>
          </h1>
          <p className="font-sans text-xs text-[var(--text-secondary)] text-center">
            Distributed Workflow & Job Orchestration Engine
          </p>
        </div>

        {/* Clerk Sign In component */}
        <div className="w-full border border-[var(--border-default)] rounded-xl bg-[var(--bg-surface)] overflow-hidden shadow-2xl p-1">
          <SignIn
            routing="hash"
            appearance={{
              variables: {
                colorPrimary: '#4f7eff',
                colorBackground: '#111318',
                colorInputBackground: '#0a0c10',
                colorInputText: '#e8ecf4',
                colorText: '#e8ecf4',
                colorTextSecondary: '#8b95b0',
                colorBorder: '#1f2535',
                colorTextOnPrimaryBackground: '#0a0c10',
              },
              elements: {
                card: "bg-transparent shadow-none border-none",
                headerTitle: "text-[var(--text-primary)] font-sans text-lg font-semibold",
                headerSubtitle: "text-[var(--text-secondary)] font-sans text-xs",
                socialButtonsBlockButton: "bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]",
                socialButtonsBlockButtonText: "text-[var(--text-primary)] font-sans font-medium",
                dividerLine: "bg-[var(--border-subtle)]",
                dividerText: "text-[var(--text-muted)] font-sans",
                formFieldLabel: "text-[var(--text-secondary)] font-sans font-medium text-xs",
                formFieldInput: "bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--accent-primary)] rounded-[var(--radius-md)] text-xs h-9",
                formButtonPrimary: "bg-[var(--accent-primary)] text-[var(--text-inverse)] hover:bg-[var(--accent-primary-hover)] rounded-[var(--radius-md)] h-9 text-xs font-semibold uppercase tracking-wider font-sans",
                footerActionText: "text-[var(--text-secondary)] font-sans text-xs",
                footerActionLink: "text-[var(--accent-primary)] hover:text-[var(--accent-primary-hover)] font-sans text-xs font-medium",
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
