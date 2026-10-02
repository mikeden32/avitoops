import { z } from "zod";

export const listingFactsSchema = z.object({
  intent: z.enum(["create_listing", "edit_listing", "other"]),
  product: z.string().trim().min(1).nullable(),
  price: z.number().int().nonnegative().nullable(),
  currency: z.enum(["RUB"]).nullable(),
  locations: z.array(z.string().trim().min(1)).max(6),
  attributes: z.object({
    dimensions: z.string().trim().min(1).nullable(),
    delivery: z.boolean().nullable(),
  }),
  missingFields: z.array(z.enum(["product", "price", "location"])),
  confidence: z.number().min(0).max(1),
  needsSenior: z.boolean(),
});

export type ListingFacts = z.infer<typeof listingFactsSchema>;

export const LISTING_FACTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "product", "price", "currency", "locations", "attributes", "missingFields", "confidence", "needsSenior"],
  properties: {
    intent: { type: "string", enum: ["create_listing", "edit_listing", "other"] },
    product: { type: ["string", "null"] },
    price: { type: ["integer", "null"] },
    currency: { type: ["string", "null"], enum: ["RUB", null] },
    locations: { type: "array", items: { type: "string" } },
    attributes: {
      type: "object",
      additionalProperties: false,
      required: ["dimensions", "delivery"],
      properties: {
        dimensions: { type: ["string", "null"] },
        delivery: { type: ["boolean", "null"] },
      },
    },
    missingFields: {
      type: "array",
      items: { type: "string", enum: ["product", "price", "location"] },
    },
    confidence: { type: "number" },
    needsSenior: { type: "boolean" },
  },
} as const;

export const EXTRACTION_SYSTEM_PROMPT = [
  "Ты извлекаешь структурированные данные объявления из сообщения пользователя AvitoOps.",
  "Не придумывай отсутствующие значения.",
  "Сохраняй смысл объекта полностью. «каркасная баня 6×2,4» — это не просто «баня».",
  "Цену переводи в целое число рублей только если она явно указана.",
  "«Москва и область», «Москва и МО», «Москва и Московская область» записывай как два места: Москва и Московская область.",
  "Если поле неизвестно — null или пустой список.",
  "needsSenior=true, если запрос неоднозначный, содержит несколько разных задач, просит совет или стратегию, либо не укладывается в схему.",
  "Не выполняй действия и не обещай публикацию.",
].join(" ");

export type FactSource = "user_explicit" | "lite_extracted" | "senior" | "default";

export type KnownFacts = {
  product?: string | null;
  location?: string | null;
  price?: number | null;
  attributes?: Record<string, string>;
  confirmed?: boolean;
};

export type MergedFacts = {
  product: string | null;
  location: string | null;
  price: number | null;
  conflict: boolean;
};

function fold(text: string) {
  return text.toLowerCase().replaceAll("ё", "е");
}

export function rulesNeedSenior(text: string) {
  return /стратег|конкурент|как лучше|посоветуй|что выгодн|возражен|лучше поставить|какую цену|быстрее продать|как быстрее/.test(fold(text));
}

export function locationLine(locations: string[]) {
  const names = locations.map((item) => item.trim()).filter(Boolean);
  const folded = names.map(fold);
  const moscow = folded.some((item) => item.includes("москв") && !item.includes("област"));
  const oblast = folded.some((item) => (item.includes("московск") && item.includes("област")) || item === "мо");
  if (moscow && oblast) return "Москва и Московская область";
  if (names.length === 1) return names[0] ?? null;
  if (names.length > 1) return names.join(", ");
  return null;
}

export function parseListingFacts(raw: unknown): ListingFacts | null {
  const parsed = listingFactsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const facts = parsed.data;
  if (facts.price && facts.price > 0 && !facts.currency) facts.currency = "RUB";
  return facts;
}

export function mergeListingFacts(existing: KnownFacts, extracted: ListingFacts, text = ""): MergedFacts {
  const confirmed = existing.confirmed !== false && Boolean(existing.product || existing.location || existing.price);
  const nextLocation = locationLine(extracted.locations);
  const nextPrice = extracted.price && extracted.price > 0 ? extracted.price : null;
  let conflict = false;
  const product = pick(existing.product ?? null, blank(extracted.product), confirmed, textHasPhrase(text, blank(extracted.product)), () => {
    conflict = true;
  });
  const location = pick(existing.location ?? null, nextLocation, confirmed, textHasLocation(text, nextLocation), () => {
    conflict = true;
  });
  const price = pick(existing.price ?? null, nextPrice, confirmed, nextPrice != null && textHasPrice(text, nextPrice), () => {
    conflict = true;
  });
  return { product, location, price, conflict };
}

function blank(value: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function pick<T>(current: T | null, incoming: T | null, confirmed: boolean, explicit: boolean, onConflict: () => void) {
  if (incoming == null) return current;
  if (current == null) return incoming;
  if (current === incoming) return current;
  if (!confirmed || explicit) return incoming;
  onConflict();
  return current;
}

function textHasPrice(text: string, price: number) {
  return text.replace(/[\s\u00a0\u202f]/g, "").includes(String(price));
}

function textHasPhrase(text: string, value: string | null) {
  if (!value) return false;
  const q = fold(text);
  const words = fold(value).split(/[^a-zа-я0-9]+/).filter((word) => word.length >= 3);
  if (!words.length) return q.includes(fold(value));
  return words.every((word) => q.includes(word));
}

function textHasLocation(text: string, value: string | null) {
  if (!value) return false;
  const q = fold(text);
  if (q.includes(fold(value))) return true;
  if ((q.includes("москва") || q.includes("москве")) && /московск|област|(?<![а-я])мо(?![а-я])/.test(q) && fold(value).includes("моск")) return true;
  const words = fold(value).split(/[^a-zа-я0-9]+/).filter((word) => word.length >= 4);
  return words.some((word) => q.includes(word));
}

export function liteReadyLine(facts: MergedFacts) {
  const price = facts.price ? new Intl.NumberFormat("ru-RU").format(facts.price).replace(/[\u00a0\u202f]/g, " ") : "";
  return `Понял. Собрал данные: ${facts.product}. ${price} руб. ${facts.location}. Готовлю карточку.`;
}
