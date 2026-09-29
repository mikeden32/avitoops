import { askGrok } from "../src/lib/grok";
import { loadEnv } from "./load-env";

loadEnv();

async function main() {
  if (!process.env.XAI_API_KEY) {
    console.log("Ключа нет. Grok не вызывается, токены не тратятся.");
    process.exit(1);
  }
  const answer = await askGrok("Ответь одним словом по-русски.", "Скажи: готов");
  if (!answer) {
    console.log("Ключ есть, но Grok ничего не ответил. Проверьте ключ и название модели XAI_MODEL.");
    process.exit(1);
  }
  console.log(`Grok ответил: ${answer}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
