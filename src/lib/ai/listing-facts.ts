import { z } from "zod";

export const priceQualifierSchema = z.enum(["exact", "from", "to", "approximate"]);

export const listingFactsSchema = z
  .object({
    intent: z.enum(["create_listing", "edit_listing", "other"]),
    product: z.string().trim().min(1).nullable(),
    price: z.number().int().nonnegative().nullable(),
    priceQualifier: priceQualifierSchema.nullable(),
    currency: z.enum(["RUB"]).nullable(),
    locations: z.array(z.string().trim().min(1)).max(6),
    dimensions: z.string().trim().min(1).nullable(),
    delivery: z.boolean().nullable(),
    missingFields: z.array(z.enum(["product", "price", "location"])),
    needsSenior: z.boolean(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type ListingFacts = z.infer<typeof listingFactsSchema>;
export type PriceQualifier = z.infer<typeof priceQualifierSchema>;
export type ListingIntent = ListingFacts["intent"];

export const LISTING_FACTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "product",
    "price",
    "priceQualifier",
    "currency",
    "locations",
    "dimensions",
    "delivery",
    "missingFields",
    "needsSenior",
    "confidence",
  ],
  properties: {
    intent: { type: "string", enum: ["create_listing", "edit_listing", "other"] },
    product: { type: ["string", "null"] },
    price: { type: ["integer", "null"] },
    priceQualifier: { type: ["string", "null"], enum: ["exact", "from", "to", "approximate", null] },
    currency: { type: ["string", "null"], enum: ["RUB", null] },
    locations: { type: "array", items: { type: "string" } },
    dimensions: { type: ["string", "null"] },
    delivery: { type: ["boolean", "null"] },
    missingFields: { type: "array", items: { type: "string", enum: ["product", "price", "location"] } },
    needsSenior: { type: "boolean" },
    confidence: { type: "number" },
  },
} as const;

export const EXTRACTION_SYSTEM_PROMPT = [
  "Верни только JSON по схеме. Без объяснений, рассуждений и текста вокруг.",
  "Извлеки поля объявления. Не выдумывай значения.",
  "intent: create_listing, edit_listing или other.",
  "product — название без размера, иначе null. Пустую строку не возвращай. «6 на 2.4», «6х2,4» и «6x2.4» пиши только в dimensions как 6x2.4.",
  "price — целое число рублей или null. Если суммы нет, ставь null, не 0 и не поясняй расчёт.",
  "priceQualifier: exact, from, to, approximate или null. «от» → from, «до» → to, «примерно» или «около» → approximate.",
  "currency: RUB, если цена есть, иначе null.",
  "locations — города в именительном падеже. «в Подольске» → [\"Подольск\"]. «Москва и МО» → [\"Москва\", \"Московская область\"].",
  "delivery: true, false или null.",
  "missingFields — только отсутствующие product, price, location. Для правки цены не требуй product и location.",
  "Неизвестная цена — price null, priceQualifier null, и price в missingFields.",
  "Оговорки вроде «плюс электричество» не добавляй отдельными полями и не ставь из-за них needsSenior.",
  "needsSenior=true только для совета, стратегии или нескольких разных задач.",
  "confidence — число от 0 до 1.",
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

export type ListingFactIssues = {
  validationIssuePaths: string[];
  validationIssueCodes: string[];
  missingRequiredFields: string[];
  unexpectedFields: string[];
};

export type CanonicalListing = {
  intent: ListingIntent;
  product: string | null;
  price: number | null;
  priceQualifier: PriceQualifier | null;
  currency: "RUB" | null;
  location: string | null;
  dimensions: string | null;
  delivery: boolean | null;
  missingFields: Array<"product" | "price" | "location">;
  needsSenior: boolean;
  senior: boolean;
};

const MOSCOW_REGION = "Москва и Московская область";
const PETERSBURG_REGION = "Санкт-Петербург и Ленинградская область";

const PLACE_STEMS: { test: RegExp; name: string }[] = [
  { test: /подольск/, name: "Подольск" },
  { test: /домодедов/, name: "Домодедово" },
  { test: /чехов/, name: "Чехов" },
  { test: /химк/, name: "Химки" },
  { test: /серпухов/, name: "Серпухов" },
  { test: /тул[аеиуы]/, name: "Тула" },
  { test: /казан/, name: "Казань" },
  { test: /воронеж/, name: "Воронеж" },
  { test: /рязан/, name: "Рязань" },
  { test: /калуг/, name: "Калуга" },
  { test: /ярославл/, name: "Ярославль" },
  { test: /сочи/, name: "Сочи" },
];

const DIMENSION_SOURCE = String.raw`(\d+(?:[.,]\d+)?)\s*(?:на|[xх×*])\s*(\d+(?:[.,]\d+)?)(?:\s*(?:на|[xх×*])\s*(\d+(?:[.,]\d+)?))?`;
const DIMENSION = new RegExp(DIMENSION_SOURCE, "i");

function fold(text: string) {
  return text.toLowerCase().replaceAll("ё", "е");
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function rulesNeedSenior(text: string) {
  return /стратег|конкурент|как лучше|посоветуй|что выгодн|возражен|лучше поставить|какую цену|быстрее продать|как быстрее/.test(fold(text));
}

export function canonicalLocation(text: string): string | null {
  const q = fold(text);
  if (/москв/.test(q) && (/област/.test(q) || /(?<![а-я])мо(?![а-я])/.test(q))) return MOSCOW_REGION;
  if (/ленинградск/.test(q) && /област/.test(q)) return PETERSBURG_REGION;
  if (/(?:петербург|питер|(?<![а-я])спб(?![а-я]))/.test(q) && /област|(?<![а-я])ло(?![а-я])/.test(q)) return PETERSBURG_REGION;
  for (const place of PLACE_STEMS) {
    if (place.test.test(q)) return place.name;
  }
  if (/москв/.test(q)) return "Москва";
  if (/петербург|питер|(?<![а-я])спб(?![а-я])/.test(q)) return "Санкт-Петербург";
  return null;
}

export function normalizeLocationList(locations: string[]): string | null {
  const raw = locations.map((item) => item.trim()).filter(Boolean);
  if (!raw.length) return null;
  const joined = canonicalLocation(raw.join(" "));
  if (joined === MOSCOW_REGION || joined === PETERSBURG_REGION) return joined;
  const named = [...new Set(raw.map((item) => canonicalLocation(item)).filter((item): item is string => Boolean(item)))];
  if (named.includes(MOSCOW_REGION) || (named.includes("Москва") && named.some((item) => item.includes("область")))) return MOSCOW_REGION;
  if (named.length === 1) return named[0];
  if (named.length > 1) return named.join(", ");
  return raw.length === 1 ? raw[0] : raw.join(", ");
}

export function locationLine(locations: string[]) {
  return normalizeLocationList(locations);
}

export function canonicalDimensions(value: string | null | undefined): string | null {
  if (!value) return null;
  const found = value.match(DIMENSION);
  if (!found) return null;
  return [found[1], found[2], found[3]]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(",", "."))
    .join("x");
}

export type ParsedPrice = {
  value: number | null;
  qualifier: PriceQualifier | null;
  explicit: boolean;
};

const UNIT_TAIL = /^\s*(?:футов|фута|фут|объявлен|правк|метр|см|мм|шт)/;
const PRICE_EDIT = "(?:поменяй|поменяйте|поменять|измени|измените|изменить|исправь|исправьте|исправить|смени|смените|сменить|сделай|сделайте|сделать)";

function amount(raw: string, factor: number) {
  const value = Math.round(Number(raw.replace(/[ \u00a0\u202f]/g, "").replace(",", ".")) * factor);
  if (!Number.isInteger(value) || value <= 0 || value > 100_000_000) return null;
  return value;
}

function firstAmount(source: string, pattern: RegExp, scale: (raw: string) => number | null) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (UNIT_TAIL.test(source.slice(match.index + match[0].length))) continue;
    const value = scale(match[1]);
    if (value != null) return value;
  }
  return null;
}

export function parseRussianPrice(text: string): ParsedPrice {
  const q = fold(text);
  const bare = q.replace(new RegExp(DIMENSION_SOURCE, "ig"), " ");
  const unknown = /неизвест|не\s+указан|нет\s+цены|без\s+цены/.test(q);
  const value =
    firstAmount(bare, /(\d+(?:[.,]\d+)?)\s*млн/, (raw) => amount(raw, 1_000_000)) ??
    firstAmount(bare, /(\d+(?:[.,]\d+)?)\s*тыс/, (raw) => amount(raw, 1_000)) ??
    firstAmount(bare, /(\d+(?:[.,]\d+)?)\s*к(?![а-я])/, (raw) => amount(raw, 1_000)) ??
    firstAmount(bare, /(\d{1,3}(?:[ \u00a0\u202f]\d{3})+)/, (raw) => amount(raw, 1)) ??
    firstAmount(bare, /(\d{1,3}(?:\.\d{3})+)/, (raw) => amount(raw.replace(/\./g, ""), 1)) ??
    firstAmount(bare, /(\d{4,8})(?!\d)/, (raw) => amount(raw, 1));
  if (value == null) return { value: null, qualifier: null, explicit: unknown };
  const qualifier: PriceQualifier = /(?:^|[^а-я])(?:примерно|около|порядка)(?![а-я])/.test(q)
    ? "approximate"
    : /(?:^|[^а-я])от\s+\d/.test(q)
      ? "from"
      : /(?:^|[^а-я])до\s+\d/.test(q)
        ? "to"
        : "exact";
  return { value, qualifier, explicit: true };
}

export function readMoney(text: string): { price: number | null; priceQualifier: PriceQualifier | null } {
  const parsed = parseRussianPrice(text);
  return { price: parsed.value, priceQualifier: parsed.qualifier };
}

function inflectWord(word: string) {
  if (/\d/.test(word)) return word;
  const lower = fold(word);
  if (lower.endsWith("ую") && lower.length > 3) return `${lower.slice(0, -2)}ая`;
  if (lower.endsWith("юю") && lower.length > 3) return `${lower.slice(0, -2)}яя`;
  if (lower.endsWith("ю") && lower.length > 3) return `${lower.slice(0, -1)}я`;
  if (lower.endsWith("ку") && lower.length > 4) return `${lower.slice(0, -1)}а`;
  return lower;
}

export function canonicalProductName(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutSize = value.replace(new RegExp(DIMENSION_SOURCE, "ig"), " ");
  const words = withoutSize
    .replace(/[.,;!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(inflectWord);
  const name = words.join(" ").trim();
  return name.length >= 3 ? name : null;
}

function canonicalDelivery(text: string): boolean | null {
  const q = fold(text);
  if (/без доставк|самовывоз/.test(q)) return false;
  if (/с доставк|доставк[ауи]/.test(q)) return true;
  return null;
}

function regionLocations(name: string) {
  if (name === MOSCOW_REGION) return ["Москва", "Московская область"];
  if (name === PETERSBURG_REGION) return ["Санкт-Петербург", "Ленинградская область"];
  return [name];
}

function blankFacts(patch: Partial<ListingFacts>): ListingFacts {
  return {
    intent: "edit_listing",
    product: null,
    price: null,
    priceQualifier: null,
    currency: null,
    locations: [],
    dimensions: null,
    delivery: null,
    missingFields: [],
    needsSenior: false,
    confidence: 1,
    ...patch,
  };
}

export type DeterministicEdit = {
  changedField: "price" | "location";
  facts: ListingFacts;
};

export function deterministicEdit(text: string): DeterministicEdit | null {
  if (rulesNeedSenior(text)) return null;
  const q = fold(text);
  const money = parseRussianPrice(text);
  const place = canonicalLocation(text);
  const priceCommand =
    new RegExp(`${PRICE_EDIT}\\s+цен[ауы]\\s+(?:на\\s+)?`).test(q) ||
    /цен[аы]\s+теперь/.test(q) ||
    (/(?:^|[^а-я])(?:поставь|поставьте)\s+\d/.test(q) && money.value != null && place == null);
  const locationCommand =
    new RegExp(`${PRICE_EDIT}\\s+город\\s+на\\s+`).test(q) ||
    /город\s+теперь/.test(q) ||
    (/работаем\s+теперь/.test(q) && place != null) ||
    (/(?:^|[^а-я])(?:поставь|поставьте)\s+/.test(q) && place != null && money.value == null);
  if (priceCommand && locationCommand) return null;
  if (priceCommand && money.explicit && money.value != null && money.qualifier) {
    return {
      changedField: "price",
      facts: blankFacts({ price: money.value, priceQualifier: money.qualifier, currency: "RUB" }),
    };
  }
  if (locationCommand && place) {
    return { changedField: "location", facts: blankFacts({ locations: regionLocations(place) }) };
  }
  return null;
}

function namesPriceEdit(text: string) {
  const q = fold(text);
  return deterministicEdit(text)?.changedField === "price" || (/цен[ауы]/.test(q) && /поменя|измени|исправ|смени|сделай|теперь|поставь/.test(q));
}

function namesLocationEdit(text: string) {
  const q = fold(text);
  return (
    deterministicEdit(text)?.changedField === "location" ||
    (/город/.test(q) && /поменя|измени|исправ|смени|теперь|поставь/.test(q)) ||
    /работаем\s+теперь/.test(q)
  );
}

function listingIntent(text: string): ListingIntent {
  const q = fold(text);
  if (rulesNeedSenior(text)) return "other";
  if (deterministicEdit(text) || /поменя|измени|исправ|смени|поставь цен|поставьте цен|город теперь|цена теперь|работаем теперь/.test(q)) return "edit_listing";
  if (/сколько|тариф|привет|кто ты|кто вы|оферт|погод|добрый|здравствуй|спасибо/.test(q)) return "other";
  return "create_listing";
}

function productFromText(text: string): { product: string | null; dimensions: string | null } {
  const dimensions = canonicalDimensions(text);
  let rest = text.replace(/^(?:прода(?:ю|ем|ём|ть|вать|м)|сда(?:ю|ем|ём)|устанавлива(?:ю|ем)|предлага(?:ю|ем))\s+/i, "");
  rest = rest.replace(new RegExp(DIMENSION_SOURCE, "ig"), " ");
  rest = rest.replace(/(?:примерно|около|порядка|от|до)\s+\d[\d\s.,]*(?:\s*(?:млн|тыс[а-яё]*|к(?![а-яё])))?/gi, " ");
  rest = rest.replace(/\d[\d\s.,]*\s*(?:млн|тыс[а-яё]*|₽|руб[а-яё]*)/gi, " ");
  rest = rest.replace(/\d+\s*к(?![а-яё])/gi, " ");
  rest = rest.replace(/\d{1,3}(?:[ \u00a0\u202f]\d{3})+/g, " ");
  rest = rest.replace(/(^|[^\d])(\d{4,8})(?!\d)/g, "$1 ");
  rest = rest.replace(/цена[^,.]*/gi, " ");
  rest = rest.replace(/пока неизвест[а-яё]*/gi, " ");
  rest = rest.replace(/с доставкой|без доставки|доставка/gi, " ");
  rest = rest.replace(/плюс электричество/gi, " ");
  rest = rest.replace(/москва\s+и\s+(?:московская\s+область|область|мо)(?![а-яё])/gi, " ");
  rest = rest.replace(/\s+в\s+[а-яё-]{3,}(?:\s+и\s+[а-яё-]+)*/gi, " ");
  rest = rest.replace(/[,]\s*(?:подольск[а-яё]*|чехов[а-яё]*|домодедов[а-яё]*|тул[а-яё]*|москв[а-яё]*|казан[а-яё]*|химк[а-яё]*|серпухов[а-яё]*)/gi, " ");
  rest = rest.replace(/(?:^|\s)(?:за|на)(?=\s|$)/gi, " ");
  return { product: canonicalProductName(rest), dimensions };
}

export function canonicalListing(text: string): CanonicalListing {
  const intent = listingIntent(text);
  const senior = rulesNeedSenior(text);
  const money = readMoney(text);
  const location = canonicalLocation(text);
  const delivery = intent === "create_listing" ? canonicalDelivery(text) : null;
  const extracted = intent === "create_listing" ? productFromText(text) : { product: null, dimensions: null };
  const product = extracted.product;
  const dimensions = extracted.dimensions;
  const price = intent === "other" && senior ? null : money.price;
  const priceQualifier = price == null ? null : money.priceQualifier;
  const missingFields: Array<"product" | "price" | "location"> = [];
  if (intent === "create_listing") {
    if (!product) missingFields.push("product");
    if (!location) missingFields.push("location");
    if (price == null) missingFields.push("price");
  }
  return {
    intent,
    product,
    price,
    priceQualifier,
    currency: price != null ? "RUB" : null,
    location: intent === "other" && senior ? null : location,
    dimensions,
    delivery,
    missingFields,
    needsSenior: senior,
    senior,
  };
}

export function listingFactIssues(raw: unknown): ListingFactIssues {
  const empty = { validationIssuePaths: [] as string[], validationIssueCodes: [] as string[], missingRequiredFields: [] as string[], unexpectedFields: [] as string[] };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...empty, validationIssuePaths: ["$"], validationIssueCodes: ["invalid_json"] };
  }
  const parsed = listingFactsSchema.safeParse(raw);
  if (parsed.success) return empty;
  const paths: string[] = [];
  const codes: string[] = [];
  const missing: string[] = [];
  const unexpected: string[] = [];
  for (const issue of parsed.error.issues) {
    const path = issue.path.length ? issue.path.map(String).join(".") : "$";
    paths.push(path);
    codes.push(issue.code);
    if (issue.code === "invalid_type" && "received" in issue && issue.received === "undefined") missing.push(path);
    if (issue.code === "unrecognized_keys" && "keys" in issue && Array.isArray(issue.keys)) {
      for (const key of issue.keys) {
        if (typeof key === "string" && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) unexpected.push(key);
      }
    }
  }
  return {
    validationIssuePaths: unique(paths).slice(0, 12),
    validationIssueCodes: unique(codes).slice(0, 12),
    missingRequiredFields: unique(missing).slice(0, 12),
    unexpectedFields: unique(unexpected).slice(0, 12),
  };
}

const LISTING_FACT_KEYS = new Set(Object.keys(listingFactsSchema.shape));

export function coerceListingFacts(raw: unknown): { facts: ListingFacts | null; unexpectedFields: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { facts: null, unexpectedFields: [] };
  const body: Record<string, unknown> = {};
  const unexpectedFields: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (LISTING_FACT_KEYS.has(key)) body[key] = value;
    else if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) unexpectedFields.push(key);
  }
  if (typeof body.product === "string" && !body.product.trim()) body.product = null;
  if (typeof body.price === "string") {
    const trimmed = body.price.trim();
    if (!trimmed || /неизвест|не указан|нет цены/.test(fold(trimmed))) {
      body.price = null;
      body.priceQualifier = null;
    } else {
      const money = readMoney(trimmed);
      if (money.price != null) {
        body.price = money.price;
        if (body.priceQualifier == null) body.priceQualifier = money.priceQualifier;
      }
    }
  }
  if (body.price == null) body.currency = null;
  else if (typeof body.price === "number" && body.price > 0 && body.currency == null) body.currency = "RUB";
  if (typeof body.locations === "string") {
    const trimmed = body.locations.trim();
    body.locations = trimmed ? [trimmed] : [];
  }
  if (typeof body.dimensions === "string") {
    const size = canonicalDimensions(body.dimensions);
    body.dimensions = size ?? (body.dimensions.trim() || null);
  }
  if (Array.isArray(body.missingFields)) {
    body.missingFields = body.missingFields.filter((item) => item === "product" || item === "price" || item === "location");
  }
  if (body.intent === "create_listing" && body.price == null && Array.isArray(body.missingFields) && !body.missingFields.includes("price")) {
    body.missingFields = [...body.missingFields, "price"];
  }
  if (typeof body.price === "number" && body.price > 0 && Array.isArray(body.missingFields)) {
    body.missingFields = body.missingFields.filter((item) => item !== "price");
  }
  if (typeof body.confidence === "string" && body.confidence.trim()) {
    const value = Number(body.confidence);
    if (Number.isFinite(value)) body.confidence = value;
  }
  const parsed = listingFactsSchema.safeParse(body);
  if (!parsed.success) return { facts: null, unexpectedFields };
  const facts = parsed.data;
  if (facts.price && facts.price > 0 && !facts.currency) facts.currency = "RUB";
  return { facts, unexpectedFields };
}

export function parseListingFacts(raw: unknown): ListingFacts | null {
  return coerceListingFacts(raw).facts;
}

export function alignListingFacts(text: string, facts: ListingFacts): ListingFacts {
  let next = facts;
  const parsed = parseRussianPrice(text);
  if (parsed.explicit && parsed.value != null) {
    next = {
      ...next,
      price: parsed.value,
      priceQualifier: parsed.qualifier,
      currency: "RUB",
      missingFields: next.missingFields.filter((field) => field !== "price"),
    };
  } else if (parsed.explicit && parsed.value == null) {
    next = {
      ...next,
      price: null,
      priceQualifier: null,
      currency: null,
      missingFields:
        next.intent === "create_listing"
          ? next.missingFields.includes("price")
            ? next.missingFields
            : [...next.missingFields, "price"]
          : next.missingFields.filter((field) => field !== "price"),
    };
  }
  const size = canonicalDimensions(text);
  if (size && !next.dimensions) next = { ...next, dimensions: size };
  return next;
}

export type ExtractionQuality = {
  intentMatch: boolean;
  productMatch?: boolean;
  priceMatch?: boolean;
  locationMatch?: boolean;
  dimensionsMatch?: boolean;
  changedFieldMatch?: boolean;
};

export function extractionQuality(text: string, facts: ListingFacts): ExtractionQuality {
  const expected = canonicalListing(text);
  const intentMatch = facts.intent === expected.intent;
  const location = normalizeLocationList(facts.locations);
  const product = canonicalProductName(facts.product);
  const dimensions = canonicalDimensions(facts.dimensions) ?? canonicalDimensions(facts.product);
  if (expected.intent === "edit_listing") {
    const priceOk = expected.price == null ? facts.price == null : facts.price === expected.price && facts.priceQualifier === expected.priceQualifier;
    const locationOk = expected.location == null ? location == null : location === expected.location;
    return { intentMatch, changedFieldMatch: priceOk && locationOk };
  }
  if (expected.intent === "other") return { intentMatch };
  return {
    intentMatch,
    productMatch: product === expected.product,
    priceMatch: facts.price === expected.price && facts.priceQualifier === expected.priceQualifier,
    locationMatch: location === expected.location,
    dimensionsMatch: dimensions === expected.dimensions,
  };
}

export function mergeListingFacts(existing: KnownFacts, extracted: ListingFacts, text = ""): MergedFacts {
  const confirmed = existing.confirmed !== false && Boolean(existing.product || existing.location || existing.price);
  const nextLocation = locationLine(extracted.locations);
  const parsed = parseRussianPrice(text);
  const nextPrice = parsed.explicit && parsed.value != null ? parsed.value : extracted.price && extracted.price > 0 ? extracted.price : null;
  const priceExplicit = nextPrice != null && (namesPriceEdit(text) || !confirmed) && (parsed.value === nextPrice || textHasPrice(text, nextPrice));
  const locationExplicit = nextLocation != null && (namesLocationEdit(text) || !confirmed) && textHasLocation(text, nextLocation);
  let conflict = false;
  const product = pick(existing.product ?? null, blank(extracted.product), confirmed, textHasPhrase(text, blank(extracted.product)), () => {
    conflict = true;
  });
  const location = pick(existing.location ?? null, nextLocation, confirmed, locationExplicit, () => {
    conflict = true;
  });
  const price = pick(existing.price ?? null, nextPrice, confirmed, priceExplicit, () => {
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
  if (text.replace(/[\s\u00a0\u202f]/g, "").includes(String(price))) return true;
  return readMoney(text).price === price;
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
