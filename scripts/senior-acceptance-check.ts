import { guideGuestOnboarding, judgeSeniorSpeech, type SeniorClient } from "../src/lib/ai/onboarding";
import { composeTask } from "../src/lib/services/sale";

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log(`ok ${name}`);
}

const complete = { product: "баня", location: "Чехов", price: 620000, size: "6x4", priceDeferred: false };
const missingPrice = { product: "баня", location: "Чехов", price: null, size: "6x4", priceDeferred: false };
const declarative = "Понял. Баня 6×4 в Чехове, цена 620 000 ₽. Основные данные уже есть. Я собрал черновик и могу усилить заголовок и описание.";

function packet(message: string, nextQuestion: string | null, readyForDraft = true) {
  return JSON.stringify({
    intent: "create_listing",
    message,
    nextQuestion,
    draftPatch: { product: null },
    readyForDraft,
    offerEnhancement: true,
  });
}

function main() {
  const accepted = judgeSeniorSpeech(packet(declarative, null, false), complete);
  check(
    "A complete declarative message is accepted",
    accepted.acceptance === "accepted" &&
      accepted.message === declarative &&
      accepted.questionCount === 0 &&
      accepted.factsComplete &&
      accepted.contractViolation === null,
  );

  const asked = judgeSeniorSpeech(packet("Хотите, я усилю заголовок?", null), complete);
  check(
    "B question on a complete card is rejected",
    asked.acceptance === "question_when_complete" && asked.message === null && asked.questionCount === 1,
  );

  const extra = judgeSeniorSpeech(packet(declarative, "Хотите, я усилю заголовок?"), complete);
  check(
    "C extra nextQuestion is ignored",
    extra.acceptance === "accepted" &&
      extra.message === declarative &&
      extra.questionCount === 0 &&
      extra.contractViolation === "extra_next_question",
  );

  const oneQuestion = judgeSeniorSpeech(packet("Записал баню в Чехове. Какую цену поставить?", "Какую цену поставить?"), missingPrice);
  check(
    "D one new question is accepted",
    oneQuestion.acceptance === "accepted" && Boolean(oneQuestion.message?.includes("Какую цену")) && oneQuestion.questionCount === 1 && !oneQuestion.factsComplete,
  );

  const silent = judgeSeniorSpeech(packet("Записал баню в Чехове.", null), missingPrice);
  check("E missing question is rejected", silent.acceptance === "missing_question_when_incomplete" && silent.message === null);

  const known = judgeSeniorSpeech(packet("В каком городе она находится?", "В каком городе она находится?"), missingPrice);
  check("F known city question is rejected", known.acceptance === "asks_known_fact" && known.message === null);

  const broken = judgeSeniorSpeech("не json", complete);
  check("G invalid json is rejected", broken.acceptance === "invalid_json" && broken.schemaValid === false && broken.message === null);

  const schema = judgeSeniorSpeech(JSON.stringify({ message: 12, nextQuestion: null }), complete);
  check("H invalid schema is rejected", schema.acceptance === "schema_invalid" && schema.schemaValid === false);

  const logs: string[] = [];
  const previous = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  const task = composeTask({ product: "баня", location: "Чехов", price: 620000 });
  task.attributes.size = "6x4";
  const senior: SeniorClient = async () => packet(declarative, "Хотите, я усилю заголовок?", false);
  return guideGuestOnboarding({
    text: "Продаю баню 6 на 4 в Чехове за 620000",
    task,
    senior,
  }).then((turn) => {
    const aiLog = logs.filter((line) => line.includes("guided_onboarding")).join("\n");
    check(
      "C wiring keeps the declarative reply",
      turn.route === "guided-senior" &&
        turn.readyForDraft &&
        turn.action?.href === "/register?from=task" &&
        !turn.reply.includes("?") &&
        turn.reply.includes("черновик") &&
        aiLog.includes('"providerStatus":200') &&
        aiLog.includes('"seniorAcceptance":"accepted"') &&
        aiLog.includes('"fallback":false') &&
        aiLog.includes('"contractViolation":"extra_next_question"') &&
        aiLog.includes('"readyForDraft":true') &&
        aiLog.includes('"schemaValid":true') &&
        !aiLog.includes("Хотите") &&
        !aiLog.includes("Продаю баню"),
    );
    return guideGuestOnboarding({
      text: "Продаю баню 6 на 4 в Чехове за 620000",
      task,
      senior: async () => packet("Хотите, я усилю заголовок?", null),
    });
  }).then(() => {
    const aiLog = logs.filter((line) => line.includes("guided_onboarding")).join("\n");
    check(
      "rejected wording still records provider 200",
      aiLog.includes('"providerStatus":200') &&
        aiLog.includes('"seniorAcceptance":"question_when_complete"') &&
        aiLog.includes('"fallback":true') &&
        !aiLog.includes("Хотите") &&
        !aiLog.includes("Продаю баню"),
    );
  }).finally(() => {
    console.log = previous;
  }).then(() => {
    console.log("senior acceptance check passed");
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "senior acceptance check failed");
  process.exit(1);
});
