/**
 * Injectable NOWPayments client surface (EH-053).
 * Live HTTP calls stay behind this port; unit tests inject the memory client.
 * Never log API keys or IPN secrets.
 */

export type NowPaymentsStatusSnapshot = {
  message: string;
};

export type NowPaymentsPlanSnapshot = {
  id: string;
  title: string;
  intervalDay: number;
  amount: number;
  currency: string;
};

export type NowPaymentsSubscriptionSnapshot = {
  id: string;
  planId: string;
  status: string;
  invoiceUrl: string | null;
};

export type NowPaymentsBillingClient = {
  status(): Promise<NowPaymentsStatusSnapshot>;
  listPlans(): Promise<NowPaymentsPlanSnapshot[]>;
  createPlan(input: {
    title: string;
    intervalDay: number;
    amount: number;
    currency: string;
  }): Promise<NowPaymentsPlanSnapshot>;
  createSubscription(input: {
    planId: string;
    email?: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<NowPaymentsSubscriptionSnapshot>;
};

export function createMemoryNowPaymentsClient(opts?: {
  accountReady?: boolean;
}): NowPaymentsBillingClient {
  const plans = new Map<string, NowPaymentsPlanSnapshot>();
  let planSeq = 1;
  let subSeq = 1;
  const ready = opts?.accountReady !== false;

  return {
    async status() {
      if (!ready) {
        throw new Error("nowpayments_account_not_ready");
      }
      return { message: "OK" };
    },
    async listPlans() {
      return [...plans.values()];
    },
    async createPlan(input) {
      const id = `np_plan_${planSeq++}`;
      const plan: NowPaymentsPlanSnapshot = {
        id,
        title: input.title,
        intervalDay: input.intervalDay,
        amount: input.amount,
        currency: input.currency.toUpperCase()
      };
      plans.set(id, plan);
      return plan;
    },
    async createSubscription(input) {
      if (!plans.has(input.planId)) {
        throw new Error("nowpayments_plan_not_found");
      }
      const id = `np_sub_${subSeq++}`;
      return {
        id,
        planId: input.planId,
        status: "WAITING_PAY",
        invoiceUrl: `https://nowpayments.io/payment/?iid=${id}`
      };
    }
  };
}
