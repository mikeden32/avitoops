import { confirmPayment } from "./services/billing";

export interface BillingProvider {
  readonly name: "manual";
  confirm(requestId: string, actor: string): Promise<unknown>;
}

export const billingProvider: BillingProvider = {
  name: "manual",
  confirm(requestId, actor) {
    return confirmPayment(actor, requestId);
  },
};
