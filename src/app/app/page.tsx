import { CabinetOverview } from "@/components/cabinet-overview";
import { CuratorChat } from "@/components/curator-chat";
import { DeskPulse, DeskTiles, FrameRunner, ReplyRunner } from "@/components/desk-board";
import { ReleaseGuest } from "@/components/release-guest";
import { TaskResume } from "@/components/task-resume";
import { loadDashboard } from "@/lib/queries/cabinet";
import { claimGuestDraftForCurrentUser, latestClaimedDraft } from "@/lib/services/guest-draft";
import { loadStudio } from "@/lib/services/studio";
import { requireClient } from "@/lib/session";

const workLine = {
  copy: "Копирайтер пишет",
  design: "Дизайнер работает",
  promo: "Менеджер продвижения считает ставку",
  reply: "Менеджер переписки готовит ответ",
} as const;

const focusHref = {
  copy: "/app/copy",
  design: "/app/design",
  promo: "/app/promo",
  reply: "/app/reply",
} as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireClient();
  const params = await searchParams;
  const claim = await claimGuestDraftForCurrentUser();
  const held =
    claim.status === "claimed" || claim.status === "already"
      ? { listingId: claim.listingId, title: claim.title }
      : await latestClaimedDraft(user.id);
  const studio = await loadStudio(user.id);
  const focus = studio.desk.focus;
  const state = studio.desk.marks[focus].state;
  const painting = studio.desk.marks.design.state === "work" && studio.desk.marks.design.task?.payload.paint === true;
  const data = await loadDashboard(user.id);
  const claimError =
    claim.status === "expired"
      ? "Временная сессия закончилась. Начните задачу ещё раз."
      : claim.status === "taken"
        ? "Эта работа уже сохранена в другом аккаунте."
        : claim.status === "failed"
          ? "Не удалось сохранить объявление. Обновите страницу: черновик на месте."
          : null;
  const claimNote =
    (claim.status === "claimed" || claim.status === "already") && !claim.listingId
      ? "Диалог сохранил. Объявление соберу, когда будут товар, место и цена."
      : null;
  const releaseGuest = claim.status === "claimed" || claim.status === "already" || claim.status === "taken" || claim.status === "expired";
  return (
    <main className="grid gap-6">
      <ReleaseGuest active={releaseGuest} />
      <TaskResume
        error={claimError}
        note={claimNote}
        title={held?.title}
        listingId={held?.listingId}
        celebrate={params.saved === "1" || claim.status === "claimed"}
        hasProfile={data.hasProfile}
        avitoConnected={data.avitoConnected}
      />
      <DeskPulse live={studio.desk.live} />
      <FrameRunner run={painting && studio.image} />
      <ReplyRunner run={studio.desk.marks.reply.state === "work"} />
      <CuratorChat variant="cabinet" layout="scene" />
      <DeskTiles marks={studio.desk.marks} />
      <section className="rounded-[20px] border border-line bg-card p-4">
        <p className="text-sm text-muted">{state === "work" ? workLine[focus] : "Сейчас на этом шаге"}</p>
        <a href={focusHref[focus]} className="mt-2 inline-block font-extrabold">
          {focus === "copy"
            ? "Копирайтер"
            : focus === "design"
              ? "Дизайнер"
              : focus === "promo"
                ? "Менеджер продвижения"
                : "Менеджер переписки"}
        </a>
      </section>
      <CabinetOverview data={data} />
    </main>
  );
}
