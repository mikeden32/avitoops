import type { Metadata } from "next";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";
import { sellerContacts } from "@/lib/seller";

export const metadata: Metadata = { title: "Контакты и реквизиты" };

export default function ContactsPage() {
  const seller = sellerContacts();
  const rows = [
    seller.name ? ["Продавец", seller.name] : null,
    seller.inn ? ["ИНН", seller.inn] : null,
    seller.ogrn ? ["ОГРНИП", seller.ogrn] : null,
    seller.address ? ["Адрес", seller.address] : null,
    seller.phone ? ["Телефон", seller.phone] : null,
    seller.email && !seller.email.toLowerCase().endsWith(".local") ? ["Email", seller.email] : null,
  ].filter((row): row is [string, string] => row !== null);

  return (
    <>
      <PublicHeader />
      <main className="shell grid gap-4 py-12">
        <div className="grid max-w-3xl gap-4">
          <h1 className="text-3xl font-extrabold tracking-tight">Контакты и реквизиты</h1>
          <p>
            AvitoOps ведёт ваш кабинет Авито. Объявление собираем в диалоге и отправляем в кабинет, когда Авито
            подключено и тариф оплачен. Услуга оказывается дистанционно: здесь, на сайте, и в вашем
            кабинете Авито.
          </p>
          {rows.length > 0 ? (
            <dl className="grid gap-3 rounded-[20px] border border-line bg-card p-5 text-sm">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-medium">
                    {label === "Email" ? (
                      <a href={`mailto:${value}`}>{value}</a>
                    ) : label === "Телефон" ? (
                      <a href={`tel:${value.replace(/[^\d+]/g, "")}`}>{value}</a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Контакты продавца появятся здесь, когда будут заполнены реквизиты.</p>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
