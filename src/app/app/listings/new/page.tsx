import { PageTitle } from "@/components/ui";
import { ListingForm } from "@/components/listing-form";
import { requireClient } from "@/lib/session";
import { createListingAction } from "@/server/cabinet-actions";

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireClient();
  const params = await searchParams;
  return (
    <main className="grid max-w-xl gap-4">
      <PageTitle title="Новое объявление" />
      <ListingForm action={createListingAction} error={params.error} />
    </main>
  );
}
