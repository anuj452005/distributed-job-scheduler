

interface DependencySelectorProps {
  currentStepKey: string;
  allStepKeys: string[];
  selectedDependencies: string[];
  onChange: (dependencies: string[]) => void;
}

export default function DependencySelector({
  currentStepKey,
  allStepKeys,
  selectedDependencies,
  onChange,
}: DependencySelectorProps) {
  // Filter out the current step key to prevent self-dependency
  const availableKeys = allStepKeys.filter((key) => key !== currentStepKey && key.trim() !== '');

  const handleToggle = (key: string) => {
    if (selectedDependencies.includes(key)) {
      onChange(selectedDependencies.filter((d) => d !== key));
    } else {
      onChange([...selectedDependencies, key]);
    }
  };

  if (availableKeys.length === 0) {
    return (
      <span className="font-sans text-[11px] text-[var(--text-muted)] italic">
        No other step keys configured in form to select as dependencies.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 mt-1 select-none">
      {availableKeys.map((key) => {
        const isSelected = selectedDependencies.includes(key);
        return (
          <button
            type="button"
            key={key}
            onClick={() => handleToggle(key)}
            className={`px-3 py-1 rounded-[var(--radius-sm)] border font-mono text-[10px] font-semibold transition-colors duration-150 active:scale-95 ${
              isSelected
                ? 'bg-[var(--accent-primary-subtle)] text-[var(--accent-primary)] border-[var(--accent-primary-border)] font-bold'
                : 'bg-[var(--bg-base)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
