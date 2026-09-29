import { photoFieldHint } from "@/lib/photo-limits";
import { PhotoInput } from "./photo-input";
import { Field, buttonClass } from "./ui";

export function ListingForm({
  action,
  listing,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  error?: string;
  listing?: {
    id: string;
    title: string;
    category: string;
    city: string;
    priceRub: number;
    body: string;
    sku: string | null;
    deliveryNote: string | null;
    kitNote: string | null;
    operatorNotes: string | null;
  };
}) {
  return (
    <form action={action} className="grid gap-4 rounded-[20px] border border-line bg-card p-5 sm:grid-cols-2">
      {listing ? <input type="hidden" name="listingId" value={listing.id} /> : null}
      {error ? <p className="text-sm text-bad sm:col-span-2">{error}</p> : null}
      <Field className="sm:col-span-2" label="Заголовок" hint="До 50 символов">
        <input name="title" maxLength={50} required defaultValue={listing?.title} />
      </Field>
      <Field label="Категория Авито">
        <input name="category" required defaultValue={listing?.category} />
      </Field>
      <Field label="Город">
        <input name="city" required defaultValue={listing?.city} />
      </Field>
      <Field label="Цена, ₽">
        <input name="price" type="number" min={0} required defaultValue={listing?.priceRub ?? ""} />
      </Field>
      <Field className="sm:col-span-2" label="Описание">
        <textarea name="body" required defaultValue={listing?.body} />
      </Field>
      <Field className="sm:col-span-2" label="Фото" hint={photoFieldHint(Boolean(listing))}>
        <PhotoInput required={!listing} />
      </Field>
      <Field label="Артикул / SKU">
        <input name="sku" defaultValue={listing?.sku ?? ""} />
      </Field>
      <Field className="sm:col-span-2" label="Доставка / выезд">
        <textarea name="delivery" defaultValue={listing?.deliveryNote ?? ""} />
      </Field>
      <Field className="sm:col-span-2" label="Что в комплекте">
        <textarea name="kit" defaultValue={listing?.kitNote ?? ""} />
      </Field>
      <Field className="sm:col-span-2" label="Заметки для оператора">
        <textarea name="notes" defaultValue={listing?.operatorNotes ?? ""} />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className={buttonClass("ghost")} name="intent" value="draft">
          Сохранить черновик
        </button>
        <button className={buttonClass()} name="intent" value="send">
          Отправить в работу
        </button>
      </div>
    </form>
  );
}
