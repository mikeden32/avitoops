export function AgentLine({ children }: { children: string }) {
  return <p className="text-lg font-extrabold">{children}</p>;
}

export function deskWord(state: "wait" | "work" | "done") {
  if (state === "work") return "работает";
  if (state === "done") return "готово";
  return "ждёт";
}
