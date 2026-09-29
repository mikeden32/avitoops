import Link from "next/link";

export function buttonClass(variant: "primary" | "ghost" | "danger" = "primary") {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-90";
  if (variant === "ghost") return `${base} border border-line bg-card text-ink`;
  if (variant === "danger") return `${base} bg-bad text-white`;
  return `${base} bg-accent text-white`;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Banner({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="rounded-xl border border-bad/30 bg-white px-3 py-2 text-sm text-bad">{message}</p>;
}

export function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="rounded-xl border border-good/30 bg-white px-3 py-2 text-sm text-good">{message}</p>;
}

export function PageTitle({ title, text }: { title: string; text?: string }) {
  return (
    <header className="grid gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {text ? <p className="text-sm text-muted">{text}</p> : null}
    </header>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-sm text-muted">{children}</p>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-card p-4 ${className}`}>{children}</section>;
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent">
      {children}
    </Link>
  );
}
