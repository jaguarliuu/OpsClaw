import { useEffect, useState } from 'react';

import {
  buildInteractionSubmissionPayload,
  createInteractionFormValues,
  toInteractionViewModel,
  type InteractionFormValue,
} from './agentInteractionModel';
import { validateInteractionSubmission } from './agentInteractionModel';
import type { InteractionRequest } from './types.agent';
import { InteractionFieldRenderer } from './InteractionFieldRenderer';

type InteractionCardProps = {
  request: InteractionRequest;
  disabled?: boolean;
  onSubmit: (selectedAction: string, payload: Record<string, unknown>) => Promise<void> | void;
};

function getRiskBadgeClassName(riskLevel: InteractionRequest['riskLevel']) {
  if (riskLevel === 'critical') {
    return 'border-red-500/30 bg-red-500/10 text-red-200';
  }

  if (riskLevel === 'high') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }

  if (riskLevel === 'medium') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  }

  return 'border-white/10 bg-white/[0.04] text-[var(--app-text-secondary)]';
}

function getActionClassName(style: InteractionRequest['actions'][number]['style']) {
  if (style === 'danger') {
    return 'bg-red-500 text-white hover:bg-red-400';
  }

  if (style === 'secondary') {
    return 'border border-white/10 text-[var(--app-text-primary)] hover:bg-white/[0.04]';
  }

  return 'bg-amber-500 text-black hover:bg-amber-400';
}

export function InteractionCard({
  request,
  disabled = false,
  onSubmit,
}: InteractionCardProps) {
  const view = toInteractionViewModel(request);
  const [values, setValues] = useState<Record<string, InteractionFormValue>>(() =>
    createInteractionFormValues(request)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(createInteractionFormValues(request));
    setError(null);
  }, [request]);

  return (
    <section className="overflow-hidden rounded-xl border border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(245,158,11,0.04))] shadow-[0_16px_38px_rgba(245,158,11,0.08)]">
      <header className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-200">
              Interaction
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${getRiskBadgeClassName(
                request.riskLevel
              )}`}
            >
              {request.riskLevel}
            </span>
          </div>
          <h3 className="text-sm font-medium text-[var(--app-text-primary)]">{view.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-secondary)]">
            {view.message}
          </p>
        </div>
        <div className="text-[11px] text-[var(--app-text-secondary)]">
          {request.interactionKind}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        <InteractionFieldRenderer
          fields={view.fields}
          values={values}
          disabled={disabled}
          onChange={(key, value) => {
            setValues((current) => ({
              ...current,
              [key]: value,
            }));
            setError(null);
          }}
        />

        {error ? <div className="text-xs text-red-300">{error}</div> : null}

        {view.actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {view.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const validation = validateInteractionSubmission({
                    request,
                    actionId: action.id,
                    values,
                  });
                  if (!validation.ok) {
                    setError(validation.message);
                    return;
                  }

                  setError(null);
                  void onSubmit(action.id, buildInteractionSubmissionPayload(request, values));
                }}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${getActionClassName(
                  action.style
                )}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
