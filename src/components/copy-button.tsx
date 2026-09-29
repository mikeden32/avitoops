"use client";

export function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-medium"
      onClick={() => navigator.clipboard.writeText(value)}
    >
      Скопировать job
    </button>
  );
}
