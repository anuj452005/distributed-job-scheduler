
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, GitBranch, Play } from 'lucide-react';

export default function Sidebar() {
  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Workflows', path: '/workflows', icon: GitBranch },
    { label: 'Runs', path: '/runs', icon: Play },
  ];

  return (
    <aside className="w-60 h-full border-r border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col justify-between py-4 select-none">
      <div className="flex flex-col gap-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] font-sans text-[var(--text-sm)] font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--accent-primary-subtle)] text-[var(--accent-primary)] border border-[var(--accent-primary-border)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] border border-transparent'
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
      <div className="px-4 py-2 border-t border-[var(--border-subtle)]">
        <div className="text-[10px] text-[var(--text-muted)] font-mono tracking-wider uppercase">
          FlowForge v0.1.0
        </div>
      </div>
    </aside>
  );
}
