/**
 * Template: a "price guard" step for any agent that buys LLM inference.
 *
 * Before the agent accepts a quoted price (or after it paid one), it asks XACTUM
 * whether the price is competitive against an independent reference.
 * If the price is clearly high, the agent tries the next offer.
 * After acting, it rates the answer (free), which improves the method for everyone.
 *
 * Run: npx tsx examples/price-guard.ts
 * Paid answers need a wallet: set AGENT_WALLET_KEY (a dedicated wallet with a little USDC on Base).
 */
import { createXactum, isOverpriced } from "../src/index.js";
import type { PriceQuery } from "../src/index.js";

type Offer = { provider: string } & PriceQuery;

// Replace with the offers your agent actually received.
const offers: Offer[] = [
  { provider: "gateway-a", modelId: "anthropic/claude-haiku-4.5", inputPerMTok: 1.6, outputPerMTok: 8 },
  { provider: "gateway-b", modelId: "anthropic/claude-haiku-4.5", inputPerMTok: 1, outputPerMTok: 5 },
];

async function paymentFetch() {
  const key = process.env.AGENT_WALLET_KEY;
  if (!key) return undefined; // launch period: plain fetch is enough
  const { privateKeyToAccount } = await import("viem/accounts");
  const { xactumPaymentFetch } = await import("../src/x402.js");
  return xactumPaymentFetch(privateKeyToAccount(key as `0x${string}`));
}

const xactum = createXactum({ acceptTerms: true, fetch: await paymentFetch() });

for (const offer of offers) {
  const { provider, ...query } = offer;
  const answer = await xactum.verifyPrice(query);
  console.log(`${provider}: ${answer.result.verdict} (confidence ${answer.result.confidence}, charged: ${answer.charged})`);
  if (isOverpriced(answer)) {
    console.log(`  -> skipping ${provider}: clearly above the independent reference`);
    if (answer.queryId) await xactum.feedback({ queryId: answer.queryId, useful: "yes", outcome: "acted_on_verdict" });
    continue;
  }
  console.log(`  -> using ${provider}`);
  if (answer.queryId) await xactum.feedback({ queryId: answer.queryId, useful: "yes", outcome: "acted_on_verdict" });
  break;
}
