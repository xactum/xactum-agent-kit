/**
 * Template: after a call to a gateway, check that the model served looks like the model you paid for.
 * Only metadata of YOUR call is sent (model field returned, token counts, latency); never the prompt or the answer.
 *
 * Run: npx tsx examples/model-check.ts
 */
import { createXactum, isModelMismatch } from "../src/index.js";

const xactum = createXactum({ acceptTerms: true });

// Fill these from the response of the call your agent just made.
const answer = await xactum.verifyModel({
  modelId: "anthropic/claude-haiku-4.5",
  gateway: "openrouter",
  observedAt: new Date().toISOString(),
  modelFieldReturned: "anthropic/claude-haiku-4.5",
  promptTokens: 412,
  usageCompletionTokens: 233,
  localCompletionTokens: 231,
  latencyMs: 840,
});

console.log(`verdict: ${answer.result.verdict} (confidence ${answer.result.confidence}, charged: ${answer.charged})`);
if (isModelMismatch(answer)) console.log("The model served does not look like the model claimed: consider another gateway.");
