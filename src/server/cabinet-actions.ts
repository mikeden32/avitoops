"use server";

import { redirect } from "next/navigation";
import { isPlan } from "@/lib/plans";
import { pauseSubscription, resumeSubscription } from "@/lib/services/access";
import { createDepositRequest, createSubscriptionRequest } from "@/lib/services/billing";
import { startCheckout } from "@/lib/services/checkout";
import { yookassaConfigured } from "@/lib/yookassa";
import { escalateLead, templateReply } from "@/lib/services/leads";
import { createListing, movePhoto, updateListing } from "@/lib/services/listings";
import { saveProfile, updateContacts } from "@/lib/services/profile";
import { requestPromo, setPromoSettings } from "@/lib/services/promo";
import { requireClient } from "@/lib/session";
import { bail, readText, readUploads, tags } from "./form";
import { AppError } from "@/lib/errors";

function listingInput(formData: FormData) {
  return {
    title: readText(formData, "title"),
    category: readText(formData, "category"),
    city: readText(formData, "city"),
    priceRub: Number(readText(formData, "price")),
    body: readText(formData, "body"),
    sku: readText(formData, "sku"),
    deliveryNote: readText(formData, "delivery"),
    kitNote: readText(formData, "kit"),
    operatorNotes: readText(formData, "notes"),
  };
}

export async function onboardingAction(formData: FormData) {
  const user = await requireClient();
  try {
    await saveProfile(user.id, {
      companyName: readText(formData, "company"),
      phone: readText(formData, "phone"),
      telegram: readText(formData, "telegram"),
      avitoPhone: readText(formData, "avitoPhone"),
      workMode: readText(formData, "workMode") === "materials_only" ? "materials_only" : "own_cabinet",
      cities: tags(readText(formData, "cities")),
      categories: tags(readText(formData, "categories")),
      replyRules: readText(formData, "replyRules"),
      escalateRules: readText(formData, "escalateRules"),
      consent: formData.get("consent") === "on",
    });
  } catch (error) {
    bail("/app/onboarding", error);
  }
  redirect("/app");
}

export async function createListingAction(formData: FormData) {
  const user = await requireClient();
  const intent = readText(formData, "intent") === "send" ? "send" : "draft";
  try {
    const uploads = await readUploads(formData);
    await createListing(user.id, listingInput(formData), uploads, intent);
  } catch (error) {
    bail("/app/listings/new", error);
  }
  redirect("/app/listings");
}

export async function updateListingAction(formData: FormData) {
  const user = await requireClient();
  const listingId = readText(formData, "listingId");
  const intent = readText(formData, "intent") === "send" ? "send" : "draft";
  try {
    const uploads = await readUploads(formData);
    await updateListing(
      user.id,
      listingId,
      listingInput(formData),
      uploads,
      formData.getAll("remove").map(String),
      intent,
    );
  } catch (error) {
    bail(`/app/listings/${listingId}`, error);
  }
  redirect(`/app/listings/${listingId}?ok=1`);
}

export async function movePhotoAction(formData: FormData) {
  const user = await requireClient();
  const listingId = readText(formData, "listingId");
  const dir = readText(formData, "dir") === "down" ? "down" : "up";
  try {
    await movePhoto(user.id, listingId, readText(formData, "filename"), dir);
  } catch (error) {
    bail(`/app/listings/${listingId}`, error);
  }
  redirect(`/app/listings/${listingId}`);
}

export async function escalateAction(formData: FormData) {
  const user = await requireClient();
  try {
    await escalateLead(user.id, readText(formData, "id"));
  } catch (error) {
    bail("/app/leads", error);
  }
  redirect("/app/leads");
}

export async function replyAction(formData: FormData) {
  const user = await requireClient();
  try {
    await templateReply(user.id, readText(formData, "id"));
  } catch (error) {
    bail("/app/leads", error);
  }
  redirect("/app/leads?ok=1");
}

export async function promoSettingsAction(formData: FormData) {
  const user = await requireClient();
  try {
    await setPromoSettings(user.id, {
      enabled: formData.get("enabled") === "on",
      weekLimitRub: Number(readText(formData, "weekLimit")),
    });
  } catch (error) {
    bail("/app/promo", error);
  }
  redirect("/app/promo?ok=1");
}

export async function promoJobAction(formData: FormData) {
  const user = await requireClient();
  try {
    await requestPromo(user.id, readText(formData, "listingId"), Number(readText(formData, "maxRub")), user.id);
  } catch (error) {
    bail("/app/promo", error);
  }
  redirect("/app/promo?ok=1");
}

export async function subscriptionRequestAction(formData: FormData) {
  const user = await requireClient();
  const plan = readText(formData, "plan");
  let url: string | null = null;
  try {
    if (!isPlan(plan)) throw new AppError("Выберите тариф");
    const request = await createSubscriptionRequest(user.id, plan);
    if (yookassaConfigured()) url = await startCheckout(user.id, request.id);
  } catch (error) {
    bail("/app/billing", error);
  }
  if (url) redirect(url);
  redirect("/app/billing?ok=1");
}

export async function depositRequestAction(formData: FormData) {
  const user = await requireClient();
  let url: string | null = null;
  try {
    const request = await createDepositRequest(user.id, Number(readText(formData, "amount")));
    if (yookassaConfigured()) url = await startCheckout(user.id, request.id);
  } catch (error) {
    bail("/app/billing", error);
  }
  if (url) redirect(url);
  redirect("/app/billing?ok=1");
}

export async function payRequestAction(formData: FormData) {
  const user = await requireClient();
  let url: string | null = null;
  try {
    url = await startCheckout(user.id, readText(formData, "id"));
  } catch (error) {
    bail("/app/billing", error);
  }
  if (url) redirect(url);
  redirect("/app/billing?check=1");
}

export async function contactsAction(formData: FormData) {
  const user = await requireClient();
  try {
    await updateContacts(user.id, {
      phone: readText(formData, "phone"),
      telegram: readText(formData, "telegram"),
    });
  } catch (error) {
    bail("/app/settings", error);
  }
  redirect("/app/settings?ok=1");
}

export async function stopServiceAction(formData: FormData) {
  const user = await requireClient();
  if (formData.get("confirm") !== "on") bail("/app/settings", new AppError("Подтвердите остановку"));
  try {
    await pauseSubscription(user.id, user.id);
  } catch (error) {
    bail("/app/settings", error);
  }
  redirect("/app/settings?ok=1");
}

export async function resumeServiceAction() {
  const user = await requireClient();
  try {
    await resumeSubscription(user.id, user.id);
  } catch (error) {
    bail("/app/settings", error);
  }
  redirect("/app/settings?ok=1");
}
