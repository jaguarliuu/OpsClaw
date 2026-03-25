import { SectionCard } from '@/components/ui/SectionCard';

export function InspectionsPage() {
  return (
    <div className="min-h-screen bg-[#141517] p-4">
      <SectionCard
        title="Inspection Center"
        description="Dedicated route for scheduled templates, task health, and historical runs."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <article className="grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <strong>Templates</strong>
            <span className="text-sm text-neutral-400">
              Manage the fixed inspection templates shipped with the MVP.
            </span>
          </article>
          <article className="grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <strong>Schedules</strong>
            <span className="text-sm text-neutral-400">
              Track enabled jobs, next run windows, and manual trigger actions.
            </span>
          </article>
          <article className="grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <strong>Snapshots</strong>
            <span className="text-sm text-neutral-400">
              Compare recent inspection outputs once the execution pipeline is wired.
            </span>
          </article>
        </div>
      </SectionCard>
    </div>
  );
}
