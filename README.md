# XACTUM agent kit

Let your agents check, in one call, whether **an LLM price is competitive** and whether **the model served is the one claimed**, against an independent reference.

XACTUM is a neutral verification oracle for AI agents:

- **It verifies, it never routes.** Your calls to models never go through XACTUM.
- **No referral fees**, commissions or rebates from anyone it evaluates.
- **No prompts, no completions, no personal data.** Requests have a fixed set of fields; anything else is refused.
- **Verifiable.** Every verdict names the reference set it used and that set's SHA-256 fingerprint, published at [`/reference`](https://api.xactum.com/reference). Method and changes: [`/method`](https://api.xactum.com/method).

Pay per query with [x402](https://x402.org) (0.03 USDC on Base). **Launch period: answers are free**; inconclusive answers are always free.

## Two lines

```ts
import { createXactum } from "@xactum/agent-kit";

const xactum = createXactum({ acceptTerms: true }); // you have read https://api.xactum.com/terms (business use)
const { result } = await xactum.verifyPrice({ modelId: "anthropic/claude-sonnet-5.5", inputPerMTok: 3, outputPerMTok: 15 });
// result.verdict: COMPETITIVE | FLAG_HIGH | FLAG_LOW | FLAG_HIGH_STRONG | FLAG_LOW_STRONG | INCONCLUSIVE
```

Install from GitHub:

```bash
npm i github:xactum/xactum-agent-kit
```

## Paying (after the launch period)

```ts
import { privateKeyToAccount } from "viem/accounts";
import { createXactum } from "@xactum/agent-kit";
import { xactumPaymentFetch } from "@xactum/agent-kit/x402"; // npm i @x402/fetch@2.28.0 @x402/evm@2.28.0 viem

const fetch = xactumPaymentFetch(privateKeyToAccount(process.env.AGENT_WALLET_KEY as `0x${string}`)); // cap: 0.05 USDC per payment
const xactum = createXactum({ acceptTerms: true, fetch });
```

Use a dedicated wallet with a small USDC balance. The payment helper refuses any quote above the cap.

## Check the model served

Send only metadata of your own call:

```ts
const { result } = await xactum.verifyModel({
  modelId: "anthropic/claude-haiku-4.5",
  gateway: "openrouter",
  observedAt: new Date().toISOString(),
  modelFieldReturned: "anthropic/claude-haiku-4.5",
  usageCompletionTokens: 233,
  localCompletionTokens: 231,
  latencyMs: 840,
});
// CONSISTENT | MISMATCH | INCONCLUSIVE
```

## Tell us if it helped (free)

```ts
await xactum.feedback({ queryId: answer.queryId!, useful: "yes", outcome: "acted_on_verdict" });
```

Ratings are structured, with no free text. They improve the method and never change a verdict already given.

## Templates

- [`examples/price-guard.ts`](examples/price-guard.ts): before accepting an offer, check it; skip offers clearly above the reference.
- [`examples/model-check.ts`](examples/model-check.ts): after a call, check that the model served matches the model claimed.

## Any language (plain HTTP)

```bash
curl -s https://api.xactum.com/health -D - -o /dev/null | grep -i x-xactum-terms   # terms id and sha256
curl -s https://api.xactum.com/v1/verify/price \
  -H 'content-type: application/json' \
  -d '{"acceptTerms":{"id":"<terms id>","sha256":"<terms sha256>"},"businessUse":true,"query":{"modelId":"anthropic/claude-sonnet-5.5","inputPerMTok":3,"outputPerMTok":15}}'
```

A request without payment gets either the answer (free) or an HTTP 402 with the x402 payment details. Any x402 client can pay it. Discovery: [`/openapi.json`](https://api.xactum.com/openapi.json).

## Answers are advice

Verdicts are advisory, for business use, and are governed by the [Terms](https://api.xactum.com/terms). The [Privacy Notice](https://api.xactum.com/privacy) explains what is kept: no IP addresses, and no prompts.

MIT licence.
