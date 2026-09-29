import { AdminNav } from "@/components/admin-nav";
import { PublicHeader } from "@/components/public-header";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <PublicHeader />
      <div className="shell grid gap-6 py-6">
        <AdminNav />
        {children}
      </div>
    </>
  );
}
