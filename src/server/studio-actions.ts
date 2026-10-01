"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { confirmPromoStake, curatorTurn } from "@/lib/services/dispatch";
import { rememberLine } from "@/lib/services/desk";
import { completeFrame, completeReply, keepOwnPhoto, queueFrame } from "@/lib/services/studio";
import { requireClient } from "@/lib/session";
import { readUploads } from "./form";

function refresh(path: string) {
  revalidatePath("/app");
  revalidatePath(path);
}

export async function keepCopyAction() {
  const user = await requireClient();
  await curatorTurn(user.id, "оставить");
  refresh("/app/copy");
  redirect("/app/copy");
}

export async function ownTextAction() {
  const user = await requireClient();
  const turned = await curatorTurn(user.id, "свой текст");
  if (turned.reply) await rememberLine(user.id, "assistant", turned.reply);
  refresh("/app");
  redirect("/app");
}

export async function startFrameAction() {
  const user = await requireClient();
  try {
    await queueFrame(user.id);
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Кадр не запустился.";
    redirect(`/app/design?error=${encodeURIComponent(message)}`);
  }
  refresh("/app/design");
  redirect("/app/design");
}

export async function finishFrameAction() {
  const user = await requireClient();
  await completeFrame(user.id);
  refresh("/app/design");
}

export async function ownPhotoAction(formData: FormData) {
  const user = await requireClient();
  try {
    const uploads = await readUploads(formData, "photo");
    await keepOwnPhoto(user.id, uploads);
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Фото не прочиталось.";
    redirect(`/app/design?error=${encodeURIComponent(message)}`);
  }
  refresh("/app/design");
  redirect("/app/design");
}

export async function placePromoAction() {
  const user = await requireClient();
  const turned = await confirmPromoStake(user.id);
  refresh("/app/promo");
  redirect(`/app/promo?note=${encodeURIComponent(turned.reply)}`);
}

export async function finishReplyAction() {
  const user = await requireClient();
  await completeReply(user.id);
  refresh("/app/reply");
}
