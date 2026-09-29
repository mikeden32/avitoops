"use client";

import { PHOTO_LIMITS, photoTooBigMessage } from "@/lib/photo-limits";

export function PhotoInput({ required }: { required?: boolean }) {
  return (
    <input
      name="photos"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      required={required}
      onChange={(event) => {
        const input = event.currentTarget;
        const files = Array.from(input.files ?? []);
        const tooBig = files.some((file) => file.size > PHOTO_LIMITS.maxIncomingBytes);
        if (files.length > PHOTO_LIMITS.maxCount) {
          input.setCustomValidity(`Не больше ${PHOTO_LIMITS.maxCount} фото`);
        } else if (tooBig) {
          input.setCustomValidity(photoTooBigMessage());
        } else {
          input.setCustomValidity("");
        }
      }}
    />
  );
}
