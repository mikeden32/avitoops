import { appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logInfo } from "../redact";
import { composeTask, type TaskState } from "../services/sale";
import { seniorModelId } from "../grok";
import { liteConfig, type LiteConfig } from "./config";
import { liteCircuitOpen, noteLiteBlocked, noteLiteFailure, noteLiteSuccess } from "./circuit";
import { cloudruLiteClient } from "./cloudru-lite";
import { extractionRequest, LiteCallError, groqLiteClient, type LiteClient } from "./groq-lite";
import {
  alignListingFacts,
  canonicalDimensions,
  coerceListingFacts,
  deterministicEdit,
  extractionQuality,
  liteReadyLine,
  listingFactIssues,
  mergeListingFacts,
  rulesNeedSenior,
  type KnownFacts,
  type ListingFacts,
} from "./listing-facts";

export type AiProvider = "rules" | "cloudru-lite" | "groq-lite" | "grok-senior";

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

function logRoute(entry: Record<string, unknown>) {
  logInfo(`[ai] ${JSON.stringify(entry)}`);
}

function liteProvider(config: LiteConfig): "cloudru-lite" | "groq-lite" {
  return config.provider === "groq" ? "groq-lite" : "cloudru-lite";
}

function liteClient(config: LiteConfig): LiteClient {
  return config.provider === "groq" ? groqLiteClient(config) : cloudruLiteClient(config);
}

function saveTruncatedLiteResponse(raw: string) {
  try {
    const dir = join(tmpdir(), "avitoops-lite");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "truncated.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), finishReason: "length", raw })}\n`, "utf8");
  } catch {
    // Local analysis only. The journal must not receive the model body.
  }
}

export async function routeListingExtraction(input: RouteInput): Promise<RouteDecision> {
  const config = input.config ?? liteConfig();
  const senior = rulesNeedSenior(input.text);
  if (senior) {
    logRoute({ task: "extract_listing", provider: "grok-senior", model: seniorModelId(), success: true, fallback: true, escalation: "strategy" });
    return { apply: false, provider: "grok-senior", fallbackUsed: true, escalation: "strategy" };
  }
  const edit = deterministicEdit(input.text);
  if (edit) {
    logRoute({ task: "extract_listing", provider: "rules", success: true, intent: "edit_listing", changedField: edit.changedField });
    return { apply: false, provider: "rules", fallbackUsed: false, facts: edit.facts };
  }
  if (!config.enabled) {
    return { apply: false, provider: "rules", fallbackUsed: false };
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
  const client = input.client ?? liteClient(config);
  const provider = liteProvider(config);
  try {
    const request = extractionRequest(input.text, input.known);
    const completion = await client({ ...request, timeoutMs: config.timeoutMs });
    let parsed: unknown;
    try {
      parsed = JSON.parse(completion.raw) as unknown;
    } catch {
      parsed = null;
    }
    const accepted = coerceListingFacts(parsed);
    const facts = accepted.facts ? alignListingFacts(input.text, accepted.facts) : null;
    const latencyMs = Date.now() - started;
    if (!facts) {
      noteLiteFailure(config);
      const finishReason = completion.finishReason ?? null;
      const schemaFailureReason = finishReason === "length" ? "truncated" : parsed == null ? "invalid_json" : "schema";
      if (finishReason === "length") saveTruncatedLiteResponse(completion.raw);
      logRoute({
        task: "extract_listing",
        provider,
        model: config.model,
        latencyMs,
        success: false,
        fallback: true,
        status: completion.status,
        schemaValid: false,
        escalation: "schema",
        inputTokens: completion.inputTokens ?? null,
        outputTokens: completion.outputTokens ?? null,
        finishReason,
        schemaFailureReason,
        ...listingFactIssues(parsed),
        ...(accepted.unexpectedFields.length ? { unexpectedFields: accepted.unexpectedFields } : {}),
      });
      return { apply: false, provider: "rules", fallbackUsed: true, escalation: "schema" };
    }
    noteLiteSuccess(config);
    const merged = mergeListingFacts({ ...input.known, confirmed: input.known?.confirmed !== false }, facts, input.text);
    const escalate = senior || facts.needsSenior || merged.conflict || facts.intent === "other";
    logRoute({
      task: "extract_listing",
      provider,
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
      finishReason: completion.finishReason ?? null,
      ...extractionQuality(input.text, facts),
      ...(accepted.unexpectedFields.length ? { unexpectedFields: accepted.unexpectedFields } : {}),
    });
    if (config.shadow || escalate) {
      return {
        apply: false,
        provider: escalate ? "grok-senior" : provider,
        fallbackUsed: escalate,
        escalation: senior ? "strategy" : facts.needsSenior ? "senior" : merged.conflict ? "conflict" : undefined,
        facts,
      };
    }
    const task = composeTask({ product: merged.product, location: merged.location, price: merged.price });
    if (facts.delivery === true) task.attributes = { ...task.attributes, delivery: "да" };
    const size = canonicalDimensions(facts.dimensions);
    if (size && !task.attributes.size) task.attributes = { ...task.attributes, size };
    const ready = task.completeness === "ready" && facts.intent === "create_listing" && !facts.needsSenior;
    return {
      apply: ready,
      provider,
      fallbackUsed: false,
      task,
      reply: ready ? liteReadyLine(merged) : undefined,
      facts,
    };
  } catch (error) {
    const kind = error instanceof LiteCallError ? error.kind : "network";
    const status = error instanceof LiteCallError ? error.status : 0;
    if (kind === "permission" || kind === "auth") noteLiteBlocked(config);
    else noteLiteFailure(config);
    logRoute({
      task: "extract_listing",
      provider,
      model: config.model,
      latencyMs: Date.now() - started,
      success: false,
      fallback: true,
      status,
      schemaValid: false,
      error: kind,
      errorType: error instanceof LiteCallError ? error.errorType ?? null : null,
      errorCode: error instanceof LiteCallError ? error.errorCode ?? null : null,
      errorMessage: error instanceof LiteCallError ? error.errorMessage ?? null : null,
    });
    return { apply: false, provider: senior ? "grok-senior" : "rules", fallbackUsed: true, escalation: kind };
  }
}

export function routeMode(config = liteConfig()) {
  if (!config.enabled) return "off" as const;
  return config.shadow ? ("shadow" as const) : ("live" as const);
}

