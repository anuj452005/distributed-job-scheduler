import { NavLink } from 'react-router-dom';
import { LayoutDashboard, GitBranch, Play, BookOpen } from 'lucide-react';

export default function Sidebar() {
  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Workflows', path: '/workflows', icon: GitBranch },
    { label: 'Runs', path: '/runs', icon: Play },
    { label: 'Docs', path: 'https://app.mintlify.com/anuj-fe65eb23/anuj-fe65eb23', icon: BookOpen, isExternal: true },
  ];

  return (
    <aside className="flex h-full w-[240px] shrink-0 select-none flex-col justify-between border-r border-[var(--border-default)] bg-[var(--bg-surface)] py-4">
      <div className="flex flex-col gap-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          if (item.isExternal) {
            return (
              <a
                key={item.path}
                href={item.path}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-2 font-sans text-[var(--text-sm)] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span>{item.label}</span>
              </a>
            );
          }
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 font-sans text-[var(--text-sm)] font-medium transition-colors ${isActive
                  ? 'bg-[var(--accent-primary-subtle)] text-[var(--accent-primary)] border border-[var(--accent-primary-border)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] border border-transparent'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
      <div className="border-t border-[var(--border-subtle)] px-4 py-2">
        <div className="text-[10px] text-[var(--text-muted)] font-mono tracking-wider uppercase">
          FlowForge v0.1.0
        </div>
      </div>
    </aside>
  );
}
