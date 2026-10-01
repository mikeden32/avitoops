import type { LiteConfig } from "./config";

type Breaker = { failures: number; openUntil: number };

const breakers = new Map<string, Breaker>();

export function resetLiteCircuit() {
  breakers.clear();
}

export function liteCircuitOpen(config: LiteConfig, now = Date.now()) {
  const state = breakers.get(config.model);
  return Boolean(state && state.openUntil > now);
}

export function noteLiteSuccess(config: LiteConfig) {
  breakers.set(config.model, { failures: 0, openUntil: 0 });
}

export function noteLiteFailure(config: LiteConfig, now = Date.now()) {
  const state = breakers.get(config.model) ?? { failures: 0, openUntil: 0 };
  const failures = state.failures + 1;
  const openUntil = failures >= config.failureThreshold ? now + config.cooldownMs : 0;
  breakers.set(config.model, { failures: openUntil ? 0 : failures, openUntil });
}
