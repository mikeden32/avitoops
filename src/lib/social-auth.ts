export const SOCIAL_PROVIDERS = [
  { id: "yandex", title: "Яндекс", idEnv: "AUTH_YANDEX_ID", secretEnv: "AUTH_YANDEX_SECRET" },
  { id: "google", title: "Google", idEnv: "AUTH_GOOGLE_ID", secretEnv: "AUTH_GOOGLE_SECRET" },
  { id: "vk", title: "VK", idEnv: "AUTH_VK_ID", secretEnv: "AUTH_VK_SECRET" },
  { id: "mailru", title: "Mail", idEnv: "AUTH_MAILRU_ID", secretEnv: "AUTH_MAILRU_SECRET" },
  { id: "telegram", title: "Telegram", idEnv: "AUTH_TELEGRAM_ID", secretEnv: "AUTH_TELEGRAM_SECRET" },
  { id: "max", title: "MAX", idEnv: "AUTH_MAX_ID", secretEnv: "AUTH_MAX_SECRET" },
] as const;

const wiredProviders = new Set<SocialProviderId>(["yandex", "google", "vk", "mailru"]);

export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]["id"];

export function socialProvider(id: string) {
  return SOCIAL_PROVIDERS.find((item) => item.id === id) ?? null;
}

export function socialConfigured(id: string) {
  const item = socialProvider(id);
  if (!item || !wiredProviders.has(item.id)) return false;
  return Boolean(process.env[item.idEnv]?.trim() && process.env[item.secretEnv]?.trim());
}

export const SOCIAL_BUTTONS = [
  { id: "yandex", label: "Яндекс", src: "/brands/yandex.svg", fit: "fill" },
  { id: "google", label: "Google", src: "/brands/google.png", fit: "glyph" },
  { id: "vk", label: "ВКонтакте", src: "/brands/vk.svg", fit: "cover" },
  { id: "mailru", label: "Mail", src: "/brands/mail.svg", fit: "cover" },
  { id: "telegram", label: "Telegram", src: "/brands/telegram.svg", fit: "cover" },
  { id: "max", label: "MAX", src: "/brands/max.svg", fit: "cover" },
] as const;

export function configuredSocialButtons() {
  return SOCIAL_BUTTONS.filter((item) => socialConfigured(item.id));
}
