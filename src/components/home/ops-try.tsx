"use client";

export function focusOpsCommand() {
  const input = document.getElementById("ops-command");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (input instanceof HTMLInputElement) {
    input.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    input.focus();
    return;
  }
  window.location.href = "/#ops-command";
}

export function OpsTryButton({ children, className }: { children: string; className: string }) {
  return (
    <button type="button" className={className} onClick={focusOpsCommand}>
      {children}
    </button>
  );
}
