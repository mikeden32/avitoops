export function imageReady() {
  return Boolean(process.env.XAI_IMAGE_KEY?.trim());
}

export async function paintFrame(prompt: string): Promise<Buffer | null> {
  const key = process.env.XAI_IMAGE_KEY?.trim();
  if (!key || !prompt.trim()) return null;
  try {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.XAI_IMAGE_MODEL?.trim() || "grok-2-image",
        prompt: prompt.slice(0, 900),
        n: 1,
        response_format: "b64_json",
      }),
      signal: AbortSignal.timeout(40000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = data.data?.[0];
    if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
    if (!first?.url) return null;
    const file = await fetch(first.url, { signal: AbortSignal.timeout(20000) });
    if (!file.ok) return null;
    const bytes = Buffer.from(await file.arrayBuffer());
    return bytes.byteLength > 80 ? bytes : null;
  } catch {
    return null;
  }
}
