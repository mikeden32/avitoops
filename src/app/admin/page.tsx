import Link from "next/link";
import { PageTitle } from "@/components/ui";
import { accessLabel, subscriptionStatusLabel } from "@/lib/format";
import { loadClients } from "@/lib/queries/admin";

export default async function AdminClientsPage() {
  const clients = await loadClients();
  return (
    <main className="grid gap-4">
      <PageTitle title="Клиенты" />
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Тариф</th>
              <th className="px-3 py-2 font-medium">Подписка</th>
              <th className="px-3 py-2 font-medium">Доступ</th>
              <th className="px-3 py-2 font-medium">Объявления</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/admin/clients/${client.id}`} className="font-medium">
                    {client.email}
                  </Link>
                </td>
                <td className="px-3 py-2">{client.plan ?? "—"}</td>
                <td className="px-3 py-2">
                  {client.subscriptionStatus ? subscriptionStatusLabel(client.subscriptionStatus) : "—"}
                </td>
                <td className="px-3 py-2">{accessLabel(client.access ?? "green")}</td>
                <td className="px-3 py-2">{client.listings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
