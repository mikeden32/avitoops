export function seniorModelId(env: NodeJS.ProcessEnv = process.env) {
  const id = env.XAI_MODEL?.trim();
  return id || "grok-4.6";
}

export async function askGrok(system: string, user: string) {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const model = seniorModelId();
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("grok");
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text ? text.slice(0, 1500) : null;
}

export async function speakGrok(text: string): Promise<Uint8Array | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const spoken = text.replaceAll("₽", " рублей ").replace(/\s+/g, " ").trim().slice(0, 700);
  if (!spoken) return null;
  try {
    const response = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: spoken,
        voice_id: process.env.XAI_VOICE?.trim() || "ara",
        language: "ru",
        text_normalization: true,
        speed: 1,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("json")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > 80 ? bytes : null;
  } catch {
    return null;
  }
}
