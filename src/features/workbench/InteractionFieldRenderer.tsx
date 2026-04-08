import type {
  InteractionFieldViewModel,
  InteractionFormValue,
} from './agentInteractionModel';

type InteractionFieldRendererProps = {
  fields: InteractionFieldViewModel[];
  values: Record<string, InteractionFormValue>;
  disabled?: boolean;
  onChange: (key: string, value: InteractionFormValue) => void;
};

function getStringValue(
  values: Record<string, InteractionFormValue>,
  key: string,
  fallback: string
) {
  const value = values[key];
  return typeof value === 'string' ? value : fallback;
}

function getStringArrayValue(
  values: Record<string, InteractionFormValue>,
  key: string,
  fallback: string[]
) {
  const value = values[key];
  return Array.isArray(value) ? value : fallback;
}

function getBooleanValue(
  values: Record<string, InteractionFormValue>,
  key: string,
  fallback: boolean
) {
  const value = values[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function InteractionFieldRenderer({
  fields,
  values,
  disabled = false,
  onChange,
}: InteractionFieldRendererProps) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        if (field.kind === 'display') {
          return (
            <div
              key={field.key}
              className="rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2"
            >
              {field.label ? (
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-tertiary)]">
                  {field.label}
                </div>
              ) : null}
              <div className="mt-1 break-all text-sm text-[var(--app-text-primary)]">
                {field.value}
              </div>
            </div>
          );
        }

        if (field.kind === 'input') {
          return (
            <label
              key={field.key}
              className="flex flex-col gap-1 text-xs text-[var(--app-text-secondary)]"
            >
              <span className="flex items-center gap-1">
                <span>{field.label}</span>
                {field.required ? <span className="text-red-400">*</span> : null}
              </span>
              <input
                type={field.inputType}
                value={getStringValue(values, field.key, field.value)}
                disabled={disabled}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.key, event.target.value)}
                className="h-9 rounded-md border border-white/10 bg-white/[0.02] px-3 text-sm text-[var(--app-text-primary)] outline-none transition-colors focus:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          );
        }

        if (field.kind === 'textarea') {
          return (
            <label
              key={field.key}
              className="flex flex-col gap-1 text-xs text-[var(--app-text-secondary)]"
            >
              <span className="flex items-center gap-1">
                <span>{field.label}</span>
                {field.required ? <span className="text-red-400">*</span> : null}
              </span>
              <textarea
                value={getStringValue(values, field.key, field.value)}
                disabled={disabled}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.key, event.target.value)}
                className="min-h-24 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition-colors focus:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          );
        }

        if (field.kind === 'single_select') {
          return (
            <label
              key={field.key}
              className="flex flex-col gap-1 text-xs text-[var(--app-text-secondary)]"
            >
              <span className="flex items-center gap-1">
                <span>{field.label}</span>
                {field.required ? <span className="text-red-400">*</span> : null}
              </span>
              <select
                value={getStringValue(values, field.key, field.value)}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.value)}
                className="h-9 rounded-md border border-white/10 bg-[var(--app-bg-base)] px-3 text-sm text-[var(--app-text-primary)] outline-none transition-colors focus:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">请选择</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (field.kind === 'multi_select') {
          const selectedValues = getStringArrayValue(values, field.key, field.value);
          return (
            <fieldset
              key={field.key}
              className="space-y-2 rounded-lg border border-white/8 bg-[var(--app-bg-base)] p-3"
            >
              <legend className="px-1 text-xs text-[var(--app-text-secondary)]">
                {field.label}
                {field.required ? <span className="ml-1 text-red-400">*</span> : null}
              </legend>
              {field.options.map((option) => {
                const checked = selectedValues.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex items-start gap-2 text-sm text-[var(--app-text-primary)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) => {
                        const nextValues = event.target.checked
                          ? [...selectedValues, option.value]
                          : selectedValues.filter((selectedValue) => selectedValue !== option.value);
                        onChange(field.key, nextValues);
                      }}
                      className="mt-0.5"
                    />
                    <span>
                      {option.label}
                      {option.description ? (
                        <span className="ml-2 text-xs text-[var(--app-text-secondary)]">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          );
        }

        const checked = getBooleanValue(values, field.key, field.value);
        return (
          <label
            key={field.key}
            className="flex items-start gap-2 rounded-lg border border-white/8 bg-[var(--app-bg-base)] px-3 py-3 text-sm text-[var(--app-text-primary)]"
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(event) => onChange(field.key, event.target.checked)}
              className="mt-0.5"
            />
            <span>
              {field.label}
              {field.required ? <span className="ml-1 text-red-400">*</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
