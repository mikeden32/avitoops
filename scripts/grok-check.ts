import { askGrok, GrokCallError, seniorConfigured } from "../src/lib/grok";
import { loadEnv } from "./load-env";

loadEnv();

async function main() {
  if (!seniorConfigured()) {
    console.log("Senior не настроен.");
    process.exit(1);
  }
  const answer = await askGrok("Ответь одним словом по-русски.", "Скажи: готов");
  if (!answer) {
    console.log("Senior ничего не ответил.");
    process.exit(1);
  }
  console.log(`Senior ответил: ${answer}`);
}

main().catch((error) => {
  if (error instanceof GrokCallError) {
    console.error(JSON.stringify({
      providerStatus: error.providerStatus,
      providerErrorType: error.providerErrorType,
      providerErrorCode: error.providerErrorCode,
      providerRequestId: error.providerRequestId,
      providerMessageClass: error.providerMessageClass,
    }));
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
