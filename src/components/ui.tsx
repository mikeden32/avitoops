import Link from "next/link";

export function buttonClass(variant: "primary" | "ghost" | "danger" = "primary") {
  const base =
    "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[0_8px_18px_rgba(20,20,20,0.14)] motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
  if (variant === "ghost") return `${base} border border-line bg-card text-ink hover:bg-paper`;
  if (variant === "danger") return `${base} bg-bad text-white hover:bg-bad/90`;
  return `${base} bg-ink text-white hover:bg-black`;
}

export function Wordmark({ className = "text-[28px]" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-extrabold leading-none tracking-[-0.05em] ${className}`}>
      <span className="text-brand">avito</span>
      <span className="text-ink">ops</span>
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 text-sm ${className}`}>
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Banner({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="rounded-xl border border-bad/30 bg-white px-3 py-2 text-sm text-bad">
      {message}
    </p>
  );
}

export function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="rounded-xl border border-good/30 bg-white px-3 py-2 text-sm text-good">{message}</p>;
}

export function PageTitle({ title, text, className = "" }: { title: string; text?: string; className?: string }) {
  return (
    <header className={`grid gap-1 ${className}`}>
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {text ? <p className="text-sm text-muted">{text}</p> : null}
    </header>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[20px] border border-dashed border-line bg-card px-4 py-8 text-center text-sm text-muted">
      {children}
    </p>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-line bg-card p-4 ${className}`}>{children}</section>;
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent">
      {children}
    </Link>
  );
}
