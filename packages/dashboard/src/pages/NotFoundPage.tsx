
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center p-4 select-none">
      <div className="h-12 w-12 rounded-full bg-[var(--danger-bg)] border border-[var(--danger-border)] flex items-center justify-center mb-4">
        <ShieldAlert className="h-6 w-6 text-[var(--danger-text)]" strokeWidth={1.5} />
      </div>
      <h1 className="font-sans text-[var(--text-xl)] font-semibold text-[var(--text-primary)] mb-2">
        Page Not Found
      </h1>
      <p className="font-sans text-[var(--text-sm)] text-[var(--text-secondary)] max-w-sm mb-6">
        The requested path does not exist in the administration console layout structure.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
