import { isPlan } from "./plans";

export function planToBill(fromTask: boolean, planRaw: string) {
  if (fromTask) return null;
  return isPlan(planRaw) ? planRaw : null;
}
