export const PHOTO_LIMITS = {
  maxCount: 10,
  maxIncomingBytes: 1 * 1024 * 1024,
  maxEdge: 1920,
  jpegQuality: 85,
  maxInputPixels: 40_000_000,
} as const;

export function photoTooBigMessage() {
  return "Фото больше 1 МБ";
}

export function photoFieldHint(adding: boolean) {
  const rule = "JPEG, PNG или WebP, до 10 штук, каждое до 1 МБ. При загрузке сожмём сами, чёткость сохранится";
  return adding ? `Новые добавятся к текущим. ${rule}` : `Минимум одно. ${rule}`;
}
