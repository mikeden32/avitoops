import { AgentLine, deskWord } from "@/components/agent-sheet";
import { DeskPulse, FrameRunner, OwnPhotoForm } from "@/components/desk-board";
import { buttonClass } from "@/components/ui";
import { loadStudio } from "@/lib/services/studio";
import { requireClient } from "@/lib/session";
import { ownPhotoAction, startFrameAction } from "@/server/studio-actions";

export default async function DesignPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireClient();
  const studio = await loadStudio(user.id);
  const params = await searchParams;
  const state = studio.desk.marks.design.state;
  const photo = studio.listing?.photos[0];
  const painting = state === "work" && studio.desk.marks.design.task?.payload.paint === true;
  return (
    <main className="grid gap-4">
      <DeskPulse live={state === "work"} />
      <FrameRunner run={painting && studio.image} />
      <section className="grid gap-4 rounded-[28px] border border-line bg-white p-5">
        <div>
          <h1 className="text-2xl font-extrabold">Дизайнер</h1>
          <p className="text-sm text-muted">{state === "work" ? "Дизайнер работает" : deskWord(state)}</p>
        </div>
        {params.error ? <p className="text-sm text-warn">{params.error}</p> : null}
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={`/api/photos/${user.id}/${studio.listing?.id}/${photo}`}
            className="max-h-80 w-full rounded-2xl object-cover"
          />
        ) : state === "work" ? (
          <AgentLine>Дизайнер работает</AgentLine>
        ) : (
          <p>Пришлите своё фото. Без кадра в Авито не отправлю.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <form action={startFrameAction}>
            <button className={buttonClass()} disabled={!studio.image || !studio.listing}>
              Сделать кадр
            </button>
          </form>
          <OwnPhotoForm action={ownPhotoAction} />
        </div>
        {!studio.image ? <p className="text-sm text-muted">Свой снимок кладётся на объявление сразу.</p> : null}
      </section>
    </main>
  );
}
