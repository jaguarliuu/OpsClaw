import { SectionCard } from '@/components/ui/SectionCard';

export function AuditPage() {
  return (
    <div className="min-h-screen bg-[#141517] p-4">
      <SectionCard
        title="Audit Workspace"
        description="Separate route for broader audit search, filters, and export workflows."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <article className="grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <strong>Session activity</strong>
            <span className="text-sm text-neutral-400">
              Search transcripts, reconnect history, and access paths by operator.
            </span>
          </article>
          <article className="grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <strong>Execution records</strong>
            <span className="text-sm text-neutral-400">
              Correlate batch runs, scheduled inspections, and notification delivery.
            </span>
          </article>
          <article className="grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <strong>Policy events</strong>
            <span className="text-sm text-neutral-400">
              Track dangerous-command confirmations and AI invocation boundaries.
            </span>
          </article>
        </div>
      </SectionCard>
    </div>
  );
}
