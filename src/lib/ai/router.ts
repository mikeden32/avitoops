import { logInfo } from "../redact";
import { applyFacts, composeTask, type TaskState } from "../services/sale";
import { liteConfig, type LiteConfig } from "./config";
import { liteCircuitOpen, noteLiteFailure, noteLiteSuccess } from "./circuit";
import { extractionRequest, LiteCallError, groqLiteClient, type LiteClient } from "./groq-lite";
import {
  liteReadyLine,
  locationLine,
  mergeListingFacts,
  parseListingFacts,
  rulesNeedSenior,
  type KnownFacts,
  type ListingFacts,
} from "./listing-facts";

export type AiProvider = "rules" | "groq-lite" | "grok-senior";

export type RouteDecision = {
  apply: boolean;
  provider: AiProvider;
  fallbackUsed: boolean;
  escalation?: string;
  task?: TaskState;
  reply?: string;
  facts?: ListingFacts | null;
};

type RouteInput = {
  text: string;
  known?: KnownFacts;
  rules?: TaskState | null;
  config?: LiteConfig;
  client?: LiteClient;
  sample?: number;
};

function rulesTask(text: string, known?: KnownFacts): TaskState {
  const current = {
    product: known?.product ?? null,
    location: known?.location ?? null,
    price: known?.price ?? null,
  };
  return composeTask(applyFacts(current, text));
}

function logRoute(entry: Record<string, string | number | boolean | null | undefined>) {
  logInfo(`[ai] ${JSON.stringify(entry)}`);
}

export async function routeListingExtraction(input: RouteInput): Promise<RouteDecision> {
  const config = input.config ?? liteConfig();
  const rules = input.rules ?? rulesTask(input.text, input.known);
  const senior = rulesNeedSenior(input.text);
  if (!config.enabled) {
    return { apply: false, provider: senior ? "grok-senior" : "rules", fallbackUsed: false, escalation: senior ? "strategy" : undefined };
  }
  if (senior) {
    logRoute({ task: "extract_listing", provider: "grok-senior", model: config.model, success: true, fallback: true, escalation: "strategy" });
    return { apply: false, provider: "grok-senior", fallbackUsed: true, escalation: "strategy" };
  }
  if (config.shadow) {
    const sample = input.sample ?? Math.random();
    if (sample >= config.sampleRate) {
      logRoute({ task: "extract_listing", provider: "rules", model: config.model, success: true, fallback: false, skipped: "sample" });
      return { apply: false, provider: "rules", fallbackUsed: false };
    }
  }
  if (liteCircuitOpen(config)) {
    logRoute({ task: "extract_listing", provider: "rules", model: config.model, success: false, fallback: true, error: "circuit" });
    return { apply: false, provider: "rules", fallbackUsed: true, escalation: "circuit" };
  }
  const started = Date.now();
  const client = input.client ?? groqLiteClient(config);
  try {
    const request = extractionRequest(input.text, input.known);
    const completion = await client({ ...request, timeoutMs: config.timeoutMs });
    let parsed: unknown;
    try {
      parsed = JSON.parse(completion.raw) as unknown;
    } catch {
      parsed = null;
    }
    const facts = parseListingFacts(parsed);
    const latencyMs = Date.now() - started;
    if (!facts) {
      noteLiteFailure(config);
      logRoute({
        task: "extract_listing",
        provider: "groq-lite",
        model: config.model,
        latencyMs,
        success: false,
        fallback: true,
        status: completion.status,
        schemaValid: false,
        escalation: "schema",
        inputTokens: completion.inputTokens ?? null,
        outputTokens: completion.outputTokens ?? null,
      });
      return { apply: false, provider: "rules", fallbackUsed: true, escalation: "schema" };
    }
    noteLiteSuccess(config);
    const merged = mergeListingFacts({ ...input.known, confirmed: input.known?.confirmed !== false }, facts, input.text);
    const location = locationLine(facts.locations);
    const productMatch = (facts.product ?? null) === (rules.product ?? null);
    const priceMatch = facts.price === rules.price;
    const locationMatch = location === rules.location;
    const escalate = senior || facts.needsSenior || merged.conflict || facts.intent === "other";
    logRoute({
      task: "extract_listing",
      provider: "groq-lite",
      model: config.model,
      latencyMs,
      success: true,
      fallback: escalate,
      shadow: config.shadow,
      status: completion.status,
      schemaValid: true,
      escalation: senior ? "strategy" : facts.needsSenior ? "senior" : merged.conflict ? "conflict" : null,
      inputTokens: completion.inputTokens ?? null,
      outputTokens: completion.outputTokens ?? null,
      productMatch,
      priceMatch,
      locationMatch,
    });
    if (config.shadow || escalate) {
      return {
        apply: false,
        provider: escalate ? "grok-senior" : "groq-lite",
        fallbackUsed: escalate,
        escalation: senior ? "strategy" : facts.needsSenior ? "senior" : merged.conflict ? "conflict" : undefined,
        facts,
      };
    }
    const task = composeTask({ product: merged.product, location: merged.location, price: merged.price });
    if (facts.attributes.delivery === true) task.attributes = { ...task.attributes, delivery: "да" };
    if (facts.attributes.dimensions && !task.attributes.size) task.attributes = { ...task.attributes, size: facts.attributes.dimensions };
    const ready = task.completeness === "ready" && facts.intent === "create_listing" && !facts.needsSenior;
    return {
      apply: ready,
      provider: "groq-lite",
      fallbackUsed: false,
      task,
      reply: ready ? liteReadyLine(merged) : undefined,
      facts,
    };
  } catch (error) {
    noteLiteFailure(config);
    const kind = error instanceof LiteCallError ? error.kind : "network";
    const status = error instanceof LiteCallError ? error.status : 0;
    logRoute({
      task: "extract_listing",
      provider: "groq-lite",
      model: config.model,
      latencyMs: Date.now() - started,
      success: false,
      fallback: true,
      status,
      schemaValid: false,
      error: kind,
    });
    return { apply: false, provider: senior ? "grok-senior" : "rules", fallbackUsed: true, escalation: kind };
  }
}

export function routeMode(config = liteConfig()) {
  if (!config.enabled) return "off" as const;
  return config.shadow ? ("shadow" as const) : ("live" as const);
}

