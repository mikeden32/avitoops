export type SaleBrief = {
  item?: string;
  city?: string;
  priceRub?: number;
};

export type AssistantCard = {
  href: string;
  title: string;
  city: string;
  priceRub: number;
  body: string;
  photo: string | null;
};

export type DeskRole = "copy" | "design" | "promo" | "reply";

const CITIES: Record<string, string> = {
  туле: "Тула",
  тула: "Тула",
  москве: "Москва",
  москва: "Москва",
  казани: "Казань",
  казань: "Казань",
  петербурге: "Санкт-Петербург",
  питере: "Санкт-Петербург",
  воронеже: "Воронеж",
  воронеж: "Воронеж",
  рязани: "Рязань",
  рязань: "Рязань",
  калуге: "Калуга",
  калуга: "Калуга",
  ярославле: "Ярославль",
  ярославль: "Ярославль",
  сочи: "Сочи",
};

function fold(text: string) {
  return text.toLowerCase().replaceAll("ё", "е");
}

function cap(word: string) {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1);
}

export function moneyOf(text: string) {
  const q = fold(text);
  const thousands = q.match(/(\d+)\s*тысяч/);
  if (thousands) return Number(thousands[1]) * 1000;
  const rub = q.match(/(\d[\d\s]*)\s*(?:₽|руб)/);
  if (rub) return Number(rub[1].replace(/[\s\u00a0\u202f]/g, ""));
  const plain = q.match(/(?:за|на)\s+(\d{2,7})\b/);
  if (plain) return Number(plain[1]);
  return null;
}

const MOSCOW_REGION = "Москва и Московская область";
const PETERSBURG_REGION = "Санкт-Петербург и Ленинградская область";

export type TaskField = "product" | "location" | "price";

export type TaskFacts = {
  product: string | null;
  location: string | null;
  price: number | null;
};

export type TaskState = TaskFacts & {
  title: string | null;
  description: string | null;
  attributes: Record<string, string>;
  missingFields: TaskField[];
  completeness: "partial" | "ready";
};

function cityOf(text: string) {
  const q = fold(text).trim();
  if (CITIES[q]) return CITIES[q];
  for (const part of q.split(/[,.]/)) {
    const bit = part.trim();
    if (CITIES[bit]) return CITIES[bit];
  }
  const word = q.match(/(?:^|[\s,])в\s+([а-я-]{3,})/)?.[1];
  if (!word) return null;
  return CITIES[word] ?? cap(word);
}

export function locationOf(text: string) {
  const q = fold(text);
  if (/москв[а-я]*\s+и\s+(?:область|мо(?![а-я])|московск[а-я]*\s+област[а-я]*)/.test(q)) return MOSCOW_REGION;
  if (/московск[а-я]*\s+област[а-я]*/.test(q)) return MOSCOW_REGION;
  if (/(?:^|[\s,.])мо(?![а-я])\s+и\s+москв/.test(q)) return MOSCOW_REGION;
  if (
    /(?:санкт-?петербург[а-я]*|петербург[а-я]*|спб(?![а-я])|питер[а-я]*)\s+и\s+(?:область|ло(?![а-я])|ленинградск[а-я]*\s+област[а-я]*)/.test(
      q,
    )
  ) {
    return PETERSBURG_REGION;
  }
  if (/ленинградск[а-я]*\s+област[а-я]*/.test(q)) return PETERSBURG_REGION;
  const generic = q.match(/(?:^|[\s,.])([а-я-]{3,})\s+и\s+область/);
  if (generic) {
    const known = CITIES[generic[1]];
    if (known === "Москва") return MOSCOW_REGION;
    return `${known ?? cap(generic[1])} и область`;
  }
  return cityOf(text);
}

function barePrice(text: string) {
  const q = fold(text).trim();
  if (!/^\d[\d\s]*$/.test(q)) return null;
  const value = Number(q.replace(/[\s\u00a0\u202f]/g, ""));
  if (!Number.isInteger(value) || value < 100 || value > 100_000_000) return null;
  return value;
}

function normalizeProduct(raw: string) {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => {
      if (/\d/.test(word)) return word;
      const lower = fold(word);
      if (lower.endsWith("ую") && lower.length > 3) return `${lower.slice(0, -2)}ая`;
      if (lower.endsWith("юю") && lower.length > 3) return `${lower.slice(0, -2)}яя`;
      if (lower.endsWith("ю") && lower.length > 3) return `${lower.slice(0, -1)}я`;
      return lower;
    })
    .join(" ")
    .slice(0, 80);
}

function productOf(text: string) {
  const match = text.match(/(?:прода(?:ю|ем|ём|ть|вать)|сда(?:ю|ем|ём)|устанавлива(?:ю|ем)|предлага(?:ю|ем))\s+(.+)/i);
  if (!match?.[1]) return null;
  let rest = match[1];
  rest = rest.replace(/\s+за\s+\d[\s\S]*$/i, "");
  rest = rest.split(/[.?!]/)[0] ?? rest;
  rest = rest.replace(/\s+в\s+[а-яё-]{3,}.*$/i, "");
  rest = rest.replace(/[,]\s*(?:москв|петербург|питер|спб|тул\w*|казан\w*|воронеж\w*|рязан\w*|калуг\w*|ярославл\w*|сочи).*$/i, "");
  rest = rest.replace(/[.,;\s]+$/g, "").trim();
  if (rest.length < 3) return null;
  const product = normalizeProduct(rest);
  return product.length >= 3 ? product : null;
}

function sizeOf(product: string | null) {
  if (!product) return null;
  const found = product.match(/\d+(?:[.,]\d+)?(?:\s*[×xх*]\s*\d+(?:[.,]\d+)?)+/);
  if (!found) return null;
  return found[0].replace(/\s+/g, "").replace(/[xх*]/g, "×");
}

function capFirst(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}

export function emptyFacts(): TaskFacts {
  return { product: null, location: null, price: null };
}

export function factsFromSale(sale: SaleBrief): TaskFacts {
  return {
    product: sale.item ?? null,
    location: sale.city ?? null,
    price: sale.priceRub ?? null,
  };
}

export function saleFromFacts(facts: TaskFacts): SaleBrief {
  return {
    item: facts.product ?? undefined,
    city: facts.location ?? undefined,
    priceRub: facts.price ?? undefined,
  };
}

export function factsChanged(before: TaskFacts, after: TaskFacts) {
  return before.product !== after.product || before.location !== after.location || before.price !== after.price;
}

export function applyFacts(current: TaskFacts, text: string): TaskFacts {
  const q = fold(text).trim();
  if (!q || /сколько|тариф|стоим|парол|привет|кто ты|кто вы|оферт|добрый|здравствуй|спасибо/.test(q)) return current;
  const next: TaskFacts = { ...current };
  const price = moneyOf(text) ?? barePrice(text);
  const location = locationOf(text);
  const product = productOf(text);
  if (price) next.price = price;
  if (location) next.location = location;
  if (product) next.product = product;
  else if (!location && !price) {
    const bare = text.replace(/[.?!\s]+$/g, "").trim();
    const words = bare.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length <= 8 && bare.length >= 3) next.product = normalizeProduct(bare);
  }
  return next;
}

export function composeTask(facts: TaskFacts): TaskState {
  const missingFields: TaskField[] = [];
  if (!facts.product) missingFields.push("product");
  if (!facts.location) missingFields.push("location");
  if (!facts.price || facts.price <= 0) missingFields.push("price");
  const ready = missingFields.length === 0;
  const size = sizeOf(facts.product);
  const title = facts.product ? capFirst(facts.product).slice(0, 50) : null;
  const priceLabel = facts.price ? new Intl.NumberFormat("ru-RU").format(facts.price).replace(/[\u00a0\u202f]/g, " ") : "";
  const description =
    ready && facts.product && facts.location && facts.price
      ? `${capFirst(facts.product)}. ${facts.location}. Цена ${priceLabel} руб.`
      : null;
  return {
    product: facts.product,
    location: facts.location,
    price: facts.price,
    title,
    description,
    attributes: size ? { size } : {},
    missingFields,
    completeness: ready ? "ready" : "partial",
  };
}

export function taskQuestion(state: TaskState) {
  if (state.missingFields[0] === "product") return "Что именно хотите продавать?";
  if (state.missingFields[0] === "location") return "В каком городе?";
  if (state.missingFields[0] === "price") return "За какую цену?";
  return null;
}

export function taskReadyLine(state: TaskState) {
  const priceLabel = new Intl.NumberFormat("ru-RU").format(state.price ?? 0).replace(/[\u00a0\u202f]/g, " ");
  return `Собрал объявление: ${state.title}. ${state.location}. Цена ${priceLabel} руб. Проверьте карточку.`;
}

export function saleReady(sale: SaleBrief) {
  return Boolean(sale.item && sale.city && sale.priceRub && sale.priceRub > 0);
}

export function absorbSale(current: SaleBrief, text: string): SaleBrief {
  return saleFromFacts(applyFacts(factsFromSale(current), text));
}

export function saleChanged(before: SaleBrief, after: SaleBrief) {
  return before.item !== after.item || before.city !== after.city || before.priceRub !== after.priceRub;
}

export function missingSaleQuestion(sale: SaleBrief) {
  if (!sale.item) return "Что именно хотите продавать?";
  if (!sale.city) return "В каком городе?";
  if (!sale.priceRub) return "За какую цену?";
  return null;
}

export function saleLabel(sale: SaleBrief) {
  return [sale.item, sale.city, sale.priceRub ? String(sale.priceRub) : ""].filter(Boolean).join(", ");
}
