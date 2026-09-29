"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { billingProvider } from "@/lib/billing-provider";
import { AppError } from "@/lib/errors";
import {
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  setAccess,
  setAvitoStatus,
} from "@/lib/services/access";
import { rejectPayment } from "@/lib/services/billing";
import { cancelJob, enqueueJob } from "@/lib/services/jobs";
import { createDigest } from "@/lib/services/leads";
import { dispatchPending } from "@/lib/services/notifications";
import { assignSlot, createSlot, unassignSlot } from "@/lib/services/proxy";
import { requireAdmin } from "@/lib/session";
import { bail, readText } from "./form";

const jobTypes = ["publish", "update", "reply", "promo", "report", "heal_access"] as const;

export async function confirmPaymentAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = readText(formData, "id");
  try {
    await billingProvider.confirm(id, admin.id);
  } catch (error) {
    bail("/admin/payments", error);
  }
  redirect("/admin/payments?ok=1");
}

export async function rejectPaymentAction(formData: FormData) {
  const admin = await requireAdmin();
  try {
    await rejectPayment(admin.id, readText(formData, "id"));
  } catch (error) {
    bail("/admin/payments", error);
  }
  redirect("/admin/payments");
}

export async function pauseClientAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = readText(formData, "userId");
  try {
    await pauseSubscription(admin.id, userId);
  } catch (error) {
    bail(`/admin/clients/${userId}`, error);
  }
  redirect(`/admin/clients/${userId}`);
}

export async function resumeClientAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = readText(formData, "userId");
  try {
    await resumeSubscription(admin.id, userId);
  } catch (error) {
    bail(`/admin/clients/${userId}`, error);
  }
  redirect(`/admin/clients/${userId}`);
}

export async function cancelClientAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = readText(formData, "userId");
  try {
    await cancelSubscription(admin.id, userId);
  } catch (error) {
    bail(`/admin/clients/${userId}`, error);
  }
  redirect(`/admin/clients/${userId}`);
}

export async function accessAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = readText(formData, "userId");
  try {
    await setAccess(admin.id, userId, readText(formData, "state"), readText(formData, "reason"));
  } catch (error) {
    bail(`/admin/clients/${userId}`, error);
  }
  redirect(`/admin/clients/${userId}`);
}

export async function avitoAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = readText(formData, "userId");
  const status = readText(formData, "status");
  if (status !== "pending" && status !== "connected" && status !== "blocked") {
    bail(`/admin/clients/${userId}`, new AppError("Некорректный статус Авито"));
  }
  try {
    await setAvitoStatus(admin.id, userId, status, readText(formData, "notes"));
  } catch (error) {
    bail(`/admin/clients/${userId}`, error);
  }
  redirect(`/admin/clients/${userId}`);
}

export async function manualJobAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = readText(formData, "userId");
  const type = readText(formData, "type");
  try {
    const parsedType = z.enum(jobTypes).parse(type);
    const raw = readText(formData, "payload") || "{}";
    const payload = z.record(z.unknown()).parse(JSON.parse(raw));
    const listingId = readText(formData, "listingId") || null;
    await enqueueJob({
      userId,
      type: parsedType,
      payload,
      listingId,
      createdBy: admin.id,
      asAdmin: true,
    });
  } catch (error) {
    if (error instanceof SyntaxError) bail(`/admin/clients/${userId}`, new AppError("Payload не JSON"));
    bail(`/admin/clients/${userId}`, error instanceof AppError ? error : new AppError("Не удалось создать задачу"));
  }
  redirect("/admin/jobs");
}

export async function cancelJobAction(formData: FormData) {
  const admin = await requireAdmin();
  try {
    await cancelJob(admin.id, readText(formData, "id"));
  } catch (error) {
    bail("/admin/jobs", error);
  }
  redirect("/admin/jobs");
}

export async function createSlotAction(formData: FormData) {
  const admin = await requireAdmin();
  const provider = readText(formData, "provider");
  try {
    if (provider !== "ltespace" && provider !== "ltecenter" && provider !== "other") {
      throw new AppError("Некорректный провайдер");
    }
    await createSlot({
      actor: admin.id,
      provider,
      label: readText(formData, "label"),
      region: readText(formData, "region"),
      operator: readText(formData, "operator"),
      secretRef: readText(formData, "secretRef"),
    });
  } catch (error) {
    bail("/admin/proxies", error);
  }
  redirect("/admin/proxies");
}

export async function assignSlotAction(formData: FormData) {
  const admin = await requireAdmin();
  try {
    await assignSlot(admin.id, readText(formData, "slotId"), readText(formData, "userId"));
  } catch (error) {
    bail("/admin/proxies", error);
  }
  redirect("/admin/proxies");
}

export async function unassignSlotAction(formData: FormData) {
  const admin = await requireAdmin();
  try {
    await unassignSlot(admin.id, readText(formData, "slotId"));
  } catch (error) {
    bail("/admin/proxies", error);
  }
  redirect("/admin/proxies");
}

export async function digestAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = readText(formData, "userId");
  try {
    await createDigest({
      userId,
      listingId: readText(formData, "listingId") || null,
      preview: readText(formData, "preview"),
      urgency: readText(formData, "urgency") === "hot" ? "hot" : "normal",
      actor: admin.id,
    });
    await dispatchPending();
  } catch (error) {
    bail(`/admin/clients/${userId}`, error);
  }
  redirect(`/admin/clients/${userId}`);
}

export async function dispatchAction() {
  await requireAdmin();
  await dispatchPending();
  redirect("/admin/notifications");
}
