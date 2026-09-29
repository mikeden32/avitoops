import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Banner, PageTitle, buttonClass } from "@/components/ui";
import { formatDateTime, jobStatusLabel } from "@/lib/format";
import { loadJobs } from "@/lib/queries/admin";
import { cancelJobAction } from "@/server/admin-actions";

const filters = ["", "queued", "running", "done", "failed", "canceled"];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const rows = await loadJobs(params.status);
  return (
    <main className="grid gap-4">
      <PageTitle title="Задачи" text="Сайт пишет очередь. Авитолог забирает её внутренним ключом или копией payload." />
      <Banner message={params.error} />
      <div className="flex flex-wrap gap-2 text-sm">
        {filters.map((status) => (
          <Link
            key={status || "all"}
            href={status ? `/admin/jobs?status=${status}` : "/admin/jobs"}
            className="rounded-full bg-card px-3 py-1"
          >
            {status || "все"}
          </Link>
        ))}
      </div>
      <ul className="grid gap-3">
        {rows.map((job) => {
          const payload = JSON.stringify(
            {
              id: job.id,
              user_id: job.userId,
              listing_id: job.listingId,
              type: job.type,
              payload: job.payload,
              status: job.status,
            },
            null,
            2,
          );
          return (
            <li key={job.id} className="grid gap-2 rounded-2xl border border-line bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  {job.type} · {jobStatusLabel(job.status)} · {job.email}
                </p>
                <span className="text-muted">{formatDateTime(job.createdAt)}</span>
              </div>
              {job.errorCode ? <p className="text-bad">{job.errorCode}</p> : null}
              {job.errorNote ? <p className="text-muted">{job.errorNote}</p> : null}
              <div className="flex flex-wrap gap-2">
                <CopyButton value={payload} />
                {job.status === "queued" || job.status === "running" ? (
                  <form action={cancelJobAction}>
                    <input type="hidden" name="id" value={job.id} />
                    <button className={buttonClass("ghost")}>Отменить</button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
