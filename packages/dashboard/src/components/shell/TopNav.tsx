
import { UserButton, useUser } from '@clerk/react';
import { Network } from 'lucide-react';

export default function TopNav() {
  const { user } = useUser();

  return (
    <header className="relative z-50 flex h-12 w-full select-none items-center justify-between border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--accent-primary-border)] bg-[var(--accent-primary-subtle)]">
          <Network className="h-4 w-4 text-[var(--accent-primary)]" strokeWidth={1.8} />
        </div>
        <span className="font-sans text-[var(--text-primary)] text-xs font-black tracking-[0.15em] uppercase">
          FLOW<span className="text-[var(--accent-primary)]">FORGE</span>
        </span>
        <span className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Engine Console
        </span>
      </div>

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
