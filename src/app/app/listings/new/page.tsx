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
    <main className="grid gap-4">
      <PageTitle
        title="Объявление"
        text="Объявление заводится разговором с OPS. Форма ниже — если удобнее руками."
      />
      <ListingForm action={createListingAction} error={params.error} />
    </main>
  );
}
