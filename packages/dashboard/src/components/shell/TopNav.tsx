
import { UserButton, useUser } from '@clerk/react';
import { Activity } from 'lucide-react';

export default function TopNav() {
  const { user } = useUser();

  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4">
      {/* Brand logo & title */}
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={1.5} />
        <span className="font-sans text-[var(--text-primary)] text-sm font-semibold tracking-wide">
          FLOW<span className="text-[var(--accent-primary)]">FORGE</span>
        </span>
        <span className="rounded bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary-border)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--accent-primary)]">
          Console
        </span>
      </div>

      {/* User Actions */}
      <div className="flex items-center gap-4">
        {user && (
          <span className="font-mono text-xs text-[var(--text-secondary)] hidden md:inline">
            {user.primaryEmailAddress?.emailAddress}
          </span>
        )}
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-7 w-7 rounded-full border border-[var(--border-default)]",
              userButtonPopoverCard: "bg-[var(--bg-surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)]",
              userButtonPopoverActionButtonText: "text-[var(--text-primary)] font-sans",
              userButtonPopoverFooter: "hidden"
            }
          }}
        />
      </div>
    </header>
  );
}
