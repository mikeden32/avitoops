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
    <form action={action} className="grid gap-3">
      {listing ? <input type="hidden" name="listingId" value={listing.id} /> : null}
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      <Field label="Заголовок" hint="До 50 символов">
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
      <Field label="Описание">
        <textarea name="body" required defaultValue={listing?.body} />
      </Field>
      <Field label="Фото" hint={listing ? "Новые файлы добавятся к текущим" : "Минимум одно, JPEG/PNG/WebP"}>
        <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required={!listing} />
      </Field>
      <Field label="Артикул / SKU">
        <input name="sku" defaultValue={listing?.sku ?? ""} />
      </Field>
      <Field label="Доставка / выезд">
        <textarea name="delivery" defaultValue={listing?.deliveryNote ?? ""} />
      </Field>
      <Field label="Что в комплекте">
        <textarea name="kit" defaultValue={listing?.kitNote ?? ""} />
      </Field>
      <Field label="Заметки для оператора">
        <textarea name="notes" defaultValue={listing?.operatorNotes ?? ""} />
      </Field>
      <div className="flex flex-wrap gap-2">
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
