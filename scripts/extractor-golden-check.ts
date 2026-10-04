import { resetLiteCircuit } from "../src/lib/ai/circuit";
import type { LiteConfig } from "../src/lib/ai/config";
import {
  canonicalDimensions,
  canonicalListing,
  canonicalLocation,
  extractionQuality,
  listingFactIssues,
  parseListingFacts,
  readMoney,
  type ListingFacts,
  type PriceQualifier,
} from "../src/lib/ai/listing-facts";
import { routeListingExtraction } from "../src/lib/ai/router";

type Intent = ListingFacts["intent"];

type GoldenCase = {
  text: string;
  intent: Intent;
  product: string | null;
  price: number | null;
  priceQualifier: PriceQualifier | null;
  location: string | null;
  dimensions: string | null;
  delivery: boolean | null;
  missing: Array<"product" | "price" | "location">;
  senior: boolean;
};

const cases: GoldenCase[] = [
  row("Продаю баню за 500000 в Подольске", "create_listing", "баня", 500000, "exact", "Подольск", null, null, []),
  row("Продаю баню за 500 000 в Подольске", "create_listing", "баня", 500000, "exact", "Подольск", null, null, []),
  row("Продаю баню за 500к в Подольске", "create_listing", "баня", 500000, "exact", "Подольск", null, null, []),
  row("Продаю баню за 500 тыс в Подольске", "create_listing", "баня", 500000, "exact", "Подольск", null, null, []),
  row("Каркасный дом 1,8 млн в Москве", "create_listing", "каркасный дом", 1800000, "exact", "Москва", null, null, []),
  row("Каркасный дом от 1,8 млн, Москва и область", "create_listing", "каркасный дом", 1800000, "from", "Москва и Московская область", null, null, []),
  row("Каркасный дом от 1,8 млн, Москва и МО", "create_listing", "каркасный дом", 1800000, "from", "Москва и Московская область", null, null, []),
  row("Каркасный дом от 1,8 млн, Москва и Московская область", "create_listing", "каркасный дом", 1800000, "from", "Москва и Московская область", null, null, []),
  row("Баня около 2 млн в Москве", "create_listing", "баня", 2000000, "approximate", "Москва", null, null, []),
  row("примерно 1,8 млн за баню в Подольске", "create_listing", "баня", 1800000, "approximate", "Подольск", null, null, []),
  row("Дом до 2 млн в Туле", "create_listing", "дом", 2000000, "to", "Тула", null, null, []),
  row("Продаю стол, цена пока неизвестна, Тула", "create_listing", "стол", null, null, "Тула", null, null, ["price"]),
  row("Продаю стол в Москве", "create_listing", "стол", null, null, "Москва", null, null, ["price"]),
  row("Продаю баню, Москва и МО", "create_listing", "баня", null, null, "Москва и Московская область", null, null, ["price"]),
  row("Продаю баню в Подольске", "create_listing", "баня", null, null, "Подольск", null, null, ["price"]),
  row("Баня в Подольске за 500000", "create_listing", "баня", 500000, "exact", "Подольск", null, null, []),
  row("Сдаю контейнер в Чехове", "create_listing", "контейнер", null, null, "Чехов", null, null, ["price"]),
  row("Продаю баню в Чехове", "create_listing", "баня", null, null, "Чехов", null, null, ["price"]),
  row("Продам бытовку в Домодедово", "create_listing", "бытовка", null, null, "Домодедово", null, null, ["price"]),
  row("Каркасная баня 6x2.4 за 570000 в Москве", "create_listing", "каркасная баня", 570000, "exact", "Москва", "6x2.4", null, []),
  row("Продам бытовку 6х2,4 за 340к в Домодедово", "create_listing", "бытовка", 340000, "exact", "Домодедово", "6x2.4", null, []),
  row("Каркасная баня 6 на 2.4, 570 тысяч, Москва и МО", "create_listing", "каркасная баня", 570000, "exact", "Москва и Московская область", "6x2.4", null, []),
  row("Продаю баню с доставкой за 500000 в Туле", "create_listing", "баня", 500000, "exact", "Тула", null, true, []),
  row("Продаю баню без доставки за 500000 в Туле", "create_listing", "баня", 500000, "exact", "Тула", null, false, []),
  row("Поменяй цену на 620000", "edit_listing", null, 620000, "exact", null, null, null, []),
  row("Измени город на Тулу", "edit_listing", null, null, null, "Тула", null, null, []),
  row("Сколько стоит тариф?", "other", null, null, null, null, null, null, []),
  row("Какая сегодня погода?", "other", null, null, null, null, null, null, []),
  row("Проанализируй конкурентов и предложи стратегию цены", "other", null, null, null, null, null, null, [], true),
  row("Какую цену мне лучше поставить?", "other", null, null, null, null, null, null, [], true),
  row("Как быстрее продать эту баню?", "other", null, null, null, null, null, null, [], true),
  row("Что сделать, чтобы обойти конкурентов?", "other", null, null, null, null, null, null, [], true),
  row("Сдаю рефконтейнер 40 футов в Чехове за 59000 плюс электричество", "create_listing", "рефконтейнер 40 футов", 59000, "exact", "Чехов", null, null, []),
  row("Продаю шкаф за 8000 в Казани", "create_listing", "шкаф", 8000, "exact", "Казань", null, null, []),
];

function row(
  text: string,
  intent: Intent,
  product: string | null,
  price: number | null,
  priceQualifier: PriceQualifier | null,
  location: string | null,
  dimensions: string | null,
  delivery: boolean | null,
  missing: Array<"product" | "price" | "location">,
  senior = false,
): GoldenCase {
  return { text, intent, product, price, priceQualifier, location, dimensions, delivery, missing, senior };
}

function modelFacts(item: GoldenCase, locations = item.location ? [item.location] : []): ListingFacts {
  return {
    intent: item.intent,
    product: item.product,
    price: item.price,
    priceQualifier: item.priceQualifier,
    currency: item.price != null ? "RUB" : null,
    locations,
    dimensions: item.dimensions,
    delivery: item.delivery,
    missingFields: item.missing,
    needsSenior: item.senior,
    confidence: 0.9,
  };
}

function same<T>(actual: T, expected: T) {
  return actual === expected;
}

const base: LiteConfig = {
  enabled: true,
  shadow: true,
  sampleRate: 1,
  provider: "cloudru",
  model: "ai-sage/GigaChat3-10B-A1.8B",
  baseUrl: "https://foundation-models.api.cloud.ru/v1",
  timeoutMs: 3500,
  failureThreshold: 5,
  cooldownMs: 60_000,
  retryAfterMs: 1000,
};

async function main() {
  if (cases.length < 30) throw new Error("golden set is shorter than 30");
  let schemaPass = 0;
  let intentPass = 0;
  let productPass = 0;
  let pricePass = 0;
  let locationPass = 0;
  let seniorPass = 0;
  const failures: string[] = [];
  console.log("case | intent | schema | product | price | location | senior");
  for (const item of cases) {
    const actual = canonicalListing(item.text);
    const facts = modelFacts(item);
    const schema = parseListingFacts(facts) != null;
    const quality = extractionQuality(item.text, facts);
    const intent = same(actual.intent, item.intent) && quality.intentMatch;
    const product = item.intent === "create_listing" ? same(actual.product, item.product) && quality.productMatch === true : actual.product == null;
    const price = same(actual.price, item.price) && same(actual.priceQualifier, item.priceQualifier) && (item.intent !== "create_listing" || quality.priceMatch === true);
    const location = same(actual.location, item.location) && (item.intent !== "create_listing" || quality.locationMatch === true);
    const dimensions = same(actual.dimensions, item.dimensions) && (item.intent !== "create_listing" || quality.dimensionsMatch === true);
    const delivery = same(actual.delivery, item.delivery);
    const missing = JSON.stringify(actual.missingFields) === JSON.stringify(item.missing);
    const senior = actual.senior === item.senior;
    const changed = item.intent !== "edit_listing" || quality.changedFieldMatch === true;
    const ok = schema && intent && product && price && location && dimensions && delivery && missing && senior && changed;
    if (schema) schemaPass += 1;
    if (intent) intentPass += 1;
    if (product) productPass += 1;
    if (price) pricePass += 1;
    if (location) locationPass += 1;
    if (senior) seniorPass += 1;
    const mark = (value: boolean) => (value ? "ok" : "FAIL");
    console.log(
      `${item.text} | ${item.intent} | ${mark(schema)} | ${mark(product)} | ${mark(price)} | ${mark(location)} | ${item.senior ? "senior" : "-"}`,
    );
    if (!ok) {
      failures.push(`${item.text} => ${JSON.stringify({ actual, schema, intent, product, price, location, dimensions, delivery, missing, senior, changed })}`);
    }
  }

  const fragments = [
    readMoney("500000").price === 500000,
    readMoney("500 000").price === 500000,
    readMoney("500к").price === 500000,
    readMoney("500 тыс").price === 500000,
    readMoney("1,8 млн").price === 1800000 && readMoney("1,8 млн").priceQualifier === "exact",
    readMoney("от 1,8 млн").priceQualifier === "from",
    readMoney("около 2 млн").priceQualifier === "approximate",
    readMoney("до 2 млн").priceQualifier === "to",
    readMoney("цена пока неизвестна").price == null,
    canonicalLocation("Москва") === "Москва",
    canonicalLocation("Москва и МО") === "Москва и Московская область",
    canonicalLocation("Подольск") === "Подольск",
    canonicalLocation("в Подольске") === "Подольск",
    canonicalLocation("Чехов") === "Чехов",
    canonicalLocation("в Чехове") === "Чехов",
    canonicalLocation("Домодедово") === "Домодедово",
    canonicalDimensions("6x2.4") === "6x2.4",
    canonicalDimensions("6х2,4") === "6x2.4",
    canonicalDimensions("6 на 2.4") === "6x2.4",
  ];
  if (fragments.some((item) => !item)) failures.push("fragment normalizer mismatch");

  const podolsk = cases[0];
  const inflected = extractionQuality(podolsk.text, modelFacts(podolsk, ["Подольске"]));
  if (inflected.locationMatch !== true) failures.push("Подольске did not normalize");
  const sized = extractionQuality(
    "Каркасная баня 6 на 2.4, 570 тысяч, Москва и МО",
    modelFacts(cases.find((item) => item.text.startsWith("Каркасная баня 6 на 2.4"))!, ["Москва", "Московская область"]),
  );
  const sizedFacts = modelFacts(cases.find((item) => item.text.startsWith("Каркасная баня 6 на 2.4"))!, ["Москва", "Московская область"]);
  sizedFacts.product = "каркасная баня 6×2,4";
  sizedFacts.dimensions = null;
  if (extractionQuality("Каркасная баня 6 на 2.4, 570 тысяч, Москва и МО", sizedFacts).productMatch !== true) {
    failures.push("size inside product did not match the split contract");
  }
  if (sized.locationMatch !== true) failures.push("split moscow locations did not match");

  const unknownPrice = parseListingFacts({
    intent: "create_listing",
    product: "стол",
    price: null,
    priceQualifier: null,
    currency: null,
    locations: ["Тула"],
    dimensions: null,
    delivery: null,
    missingFields: ["price"],
    needsSenior: false,
    confidence: 0.8,
  });
  if (!unknownPrice || unknownPrice.price !== null || JSON.stringify(unknownPrice.missingFields) !== '["price"]') {
    failures.push("unknown price was treated as a schema failure");
  }
  const framed = parseListingFacts({
    intent: "create_listing",
    product: "каркасная баня",
    price: "570 тысяч",
    priceQualifier: null,
    currency: null,
    locations: "Москва и МО",
    dimensions: "6 на 2.4",
    delivery: null,
    missingFields: [],
    needsSenior: false,
    confidence: 0.9,
    sizeNote: "extra",
  });
  if (!framed || framed.price !== 570000 || framed.dimensions !== "6x2.4" || !Array.isArray(framed.locations)) {
    failures.push("frame bath payload was not schema-valid");
  }
  const powered = parseListingFacts({
    intent: "create_listing",
    product: "рефконтейнер 40 футов",
    price: 59000,
    priceQualifier: "exact",
    currency: "RUB",
    locations: ["Чехов"],
    dimensions: null,
    delivery: null,
    missingFields: [],
    needsSenior: false,
    confidence: 0.9,
    electricity: "плюс",
  });
  if (!powered || powered.price !== 59000 || powered.needsSenior) failures.push("electricity broke the reefer card");
  const cabin = parseListingFacts({
    intent: "create_listing",
    product: "бытовка",
    price: "340к",
    priceQualifier: null,
    currency: null,
    locations: ["Домодедово"],
    dimensions: "6х2,4",
    delivery: null,
    missingFields: ["price"],
    needsSenior: false,
    confidence: 0.9,
  });
  if (!cabin || cabin.price !== 340000 || cabin.dimensions !== "6x2.4" || cabin.missingFields.includes("price")) {
    failures.push("340k was not read as 340000");
  }

  const issues = listingFactIssues({ intent: "create_listing", note: "ivan@example.com" });
  if (issues.unexpectedFields.includes("note") === false || JSON.stringify(issues).includes("ivan@example.com")) {
    failures.push("issue telemetry leaked a value");
  }

  resetLiteCircuit();
  const strategyCalls = { n: 0 };
  for (const item of cases.filter((entry) => entry.senior)) {
    const route = await routeListingExtraction({
      text: item.text,
      config: base,
      client: async () => {
        strategyCalls.n += 1;
        return { raw: "{}", status: 200 };
      },
    });
    if (route.provider !== "grok-senior" || route.escalation !== "strategy" || route.apply !== false) failures.push(`senior route ${item.text}`);
  }
  if (strategyCalls.n !== 0) failures.push("strategy called lite");

  const total = cases.length;
  console.log(
    `summary cases=${total} schema=${schemaPass}/${total} intent=${intentPass}/${total} product=${productPass}/${total} price=${pricePass}/${total} location=${locationPass}/${total} senior=${seniorPass}/${total}`,
  );
  if (failures.length) {
    console.error(failures.join("\n"));
    throw new Error("extractor golden set failed");
  }
  console.log("extractor golden set passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "extractor golden set failed");
  process.exit(1);
});
