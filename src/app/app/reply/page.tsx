import { AgentLine, deskWord } from "@/components/agent-sheet";
import { DeskPulse, ReplyRunner } from "@/components/desk-board";
import { loadStudio } from "@/lib/services/studio";
import { requireClient } from "@/lib/session";

export default async function ReplyPage() {
  const user = await requireClient();
  const studio = await loadStudio(user.id);
  const state = studio.desk.marks.reply.state;
  const task = studio.desk.marks.reply.task;
  const preview =
    (typeof task?.payload.preview === "string" && task.payload.preview) || studio.lead?.preview || "";
  const answer = typeof task?.payload.answer === "string" ? task.payload.answer : "";
  const escalated = task?.payload.escalated === true || studio.lead?.status === "escalated_to_client";
  return (
    <main className="grid gap-4">
      <DeskPulse live={state === "work"} />
      <ReplyRunner run={state === "work" && !escalated} />
      <section className="grid gap-4 rounded-[28px] border border-line bg-white p-5">
        <div>
          <h1 className="text-2xl font-extrabold">Менеджер переписки</h1>
          <p className="text-sm text-muted">{deskWord(state)}</p>
        </div>
        {state === "work" ? <AgentLine>Менеджер переписки готовит ответ</AgentLine> : null}
        {preview ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted">Покупатель</p>
            <p>{preview}</p>
            {escalated ? <p className="font-semibold">Написать вам. На Авито не отправляется.</p> : null}
            {answer && !escalated ? (
              <div className="grid gap-1">
                <p className="text-sm text-muted">Ответ</p>
                <p>{answer}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted">Когда покупатель напишет, ответ появится здесь.</p>
        )}
      </section>
    </main>
  );
}
