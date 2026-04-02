type SessionTreeSearchProps = {
  filterQuery: string;
  onClearFilterQuery: () => void;
  onFilterQueryChange: (value: string) => void;
  showClearButton: boolean;
};

export function SessionTreeSearch({
  filterQuery,
  onClearFilterQuery,
  onFilterQueryChange,
  showClearButton,
}: SessionTreeSearchProps) {
  return (
    <div className="border-b border-[var(--app-border-default)]/60 px-3 py-2">
      <div className="relative">
        <svg
          className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
        </svg>
        <input
          type="text"
          value={filterQuery}
          onChange={(event) => onFilterQueryChange(event.target.value)}
          placeholder="过滤节点..."
          className="w-full rounded-md bg-[var(--app-bg-elevated3)]/60 py-1.5 pl-7 pr-6 text-[12px] text-[var(--app-text-secondary)] outline-none placeholder:text-neutral-600 focus:bg-[var(--app-bg-elevated3)]"
        />
        {showClearButton ? (
          <button
            type="button"
            onClick={onClearFilterQuery}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
