/**
 * XACTUM agent kit: let your agents check an LLM price or the model actually
 * served against XACTUM, the neutral verification oracle.
 *
 * XACTUM verifies, it never routes or proxies your calls, and it takes no
 * referral fees from anyone it evaluates. Nothing in this kit sends a prompt,
 * a completion or personal data anywhere: only the fields below.
 *
 *   const xactum = createXactum({ acceptTerms: true });
 *   const { result } = await xactum.verifyPrice({ modelId: "anthropic/claude-sonnet-5.5", inputPerMTok: 3, outputPerMTok: 15 });
 */

export const XACTUM_BASE_URL = "https://api.xactum.com";

export type Confidence = "low" | "medium" | "high";

export type PriceQuery = {
  /** Model id, e.g. "anthropic/claude-sonnet-5.5". */
  modelId: string;
  /** USD per million input tokens you were quoted or paid. */
  inputPerMTok?: number;
  /** USD per million output tokens you were quoted or paid. */
  outputPerMTok?: number;
  /** Tier if not standard (e.g. "batch", "off-peak"). */
  tier?: string;
};

/** Metadata of your own call (never the prompt or the completion). */
export type ModelSample = {
  modelId: string;
  /** Gateway or provider that served the call, e.g. "openrouter". */
  gateway: string;
  /** ISO time of the call. */
  observedAt: string;
  modelFieldReturned?: string;
  promptTokens?: number;
  usageCompletionTokens?: number;
  localCompletionTokens?: number;
  latencyMs?: number;
  canonicalPromptId?: string;
  knownAnswerHits?: number;
  knownAnswerTotal?: number;
};

export type PriceVerdict = "COMPETITIVE" | "FLAG_HIGH" | "FLAG_LOW" | "FLAG_HIGH_STRONG" | "FLAG_LOW_STRONG" | "INCONCLUSIVE";
export type ModelVerdict = "CONSISTENT" | "MISMATCH" | "INCONCLUSIVE";

export type PriceResult = {
  verdict: PriceVerdict;
  confidence: Confidence;
  reasons: string[];
  methodVersion: string;
  snapshotId: string;
  referenceAsOf: string | null;
  dimensions: { dimension: string; quoted: number; reference: number; ratio: number; verdict: string }[];
  [k: string]: unknown;
};

export type ModelResult = {
  verdict: ModelVerdict;
  confidence: Confidence;
  reasons: string[];
  methodVersion: string;
  baselineSetId: string;
  [k: string]: unknown;
};

export type Answer<R> = {
  result: R;
  /** false: answered free (launch period, or not enough reference). Nothing was charged. */
  charged: boolean;
  chargeReason?: string;
  /** Present on paid answers: use it with feedback(). */
  queryId: string | null;
  /** The reference set used and its public SHA-256 fingerprint (see /reference). */
  reference: { kind: string; setId: string; sha256: string } | null;
  terms: { id: string; sha256: string; url: string };
  advisory: string;
};

export type FeedbackInput = {
  queryId: string;
  useful: "yes" | "partly" | "no";
  outcome?: "acted_on_verdict" | "used_as_input" | "ignored" | "verdict_seemed_wrong" | "verdict_unclear";
};

export class XactumError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "XactumError";
  }
}

export type XactumOptions = {
  /**
   * You confirm that your organisation has read and accepts the XACTUM Terms
   * (https://api.xactum.com/terms) and uses the service for business purposes.
   * The kit sends the current terms id and hash with every request.
   */
  acceptTerms: true;
  /**
   * The fetch used for requests. Pass a payment-enabled fetch (see "@xactum/agent-kit/x402")
   * so paid answers are paid automatically. During the launch period plain fetch is enough.
   */
  fetch?: typeof globalThis.fetch;
  /** Optional VAT id of the business (EU), e.g. "ES12345678Z". */
  vatId?: string;
  baseUrl?: string;
};

export type Xactum = {
  verifyPrice(query: PriceQuery): Promise<Answer<PriceResult>>;
  verifyModel(sample: ModelSample): Promise<Answer<ModelResult>>;
  /** Free: rate a paid answer. Structured only, no free text. */
  feedback(input: FeedbackInput): Promise<void>;
  /** The terms id and hash currently in force. */
  terms(): Promise<{ id: string; sha256: string; url: string }>;
};

const TERMS_HEADER = /^([A-Za-z0-9._-]+); sha256=([0-9a-f]{64}); url=(\S+)$/;

export function createXactum(opts: XactumOptions): Xactum {
  if (opts?.acceptTerms !== true) throw new Error("createXactum: set acceptTerms: true after reading https://api.xactum.com/terms (business use only)");
  const f = opts.fetch ?? globalThis.fetch;
  const base = (opts.baseUrl ?? XACTUM_BASE_URL).replace(/\/$/, "");
  let termsCache: { id: string; sha256: string; url: string } | null = null;

  const terms = async () => {
    if (termsCache) return termsCache;
    const r = await f(`${base}/health`, { headers: { accept: "application/json" } });
    const m = TERMS_HEADER.exec(r.headers.get("x-xactum-terms") ?? "");
    if (!m) throw new XactumError("could not read the XACTUM terms", r.status);
    termsCache = { id: m[1]!, sha256: m[2]!, url: m[3]! };
    return termsCache;
  };

  const ask = async <R>(path: string, key: "query" | "sample", payload: unknown, retried = false): Promise<Answer<R>> => {
    const t = await terms();
    const body: Record<string, unknown> = { acceptTerms: { id: t.id, sha256: t.sha256 }, businessUse: true, [key]: payload };
    if (opts.vatId) body.vatId = opts.vatId;
    const r = await f(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    const text = await r.text();
    let j: Record<string, unknown> = {};
    try {
      j = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
    if (r.status === 422 && j.error === "TERMS_NOT_ACCEPTED" && !retried) {
      // The terms changed since we read them: read again once.
      termsCache = null;
      return ask<R>(path, key, payload, true);
    }
    if (r.status === 402) throw new XactumError("payment required: pass a payment-enabled fetch (see @xactum/agent-kit/x402)", 402, "PAYMENT_REQUIRED");
    if (!r.ok) throw new XactumError(String(j.detail ?? j.error ?? `HTTP ${r.status}`), r.status, typeof j.error === "string" ? j.error : undefined);
    return j as unknown as Answer<R>;
  };

  return {
    verifyPrice: (query) => ask<PriceResult>("/v1/verify/price", "query", query),
    verifyModel: (sample) => ask<ModelResult>("/v1/verify/model", "sample", sample),
    feedback: async (input) => {
      const r = await f(`${base}/v1/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      if (r.status !== 201) {
        let j: Record<string, unknown> = {};
        try {
          j = (await r.json()) as Record<string, unknown>;
        } catch {
          /* not JSON */
        }
        throw new XactumError(String(j.detail ?? `HTTP ${r.status}`), r.status, typeof j.error === "string" ? j.error : undefined);
      }
    },
    terms,
  };
}

/** Helper for agents: true when the price you were quoted is clearly above the independent reference. */
export function isOverpriced(a: Answer<PriceResult>): boolean {
  return a.result.verdict === "FLAG_HIGH" || a.result.verdict === "FLAG_HIGH_STRONG";
}

/** Helper for agents: true when the model served does not look like the model claimed. */
export function isModelMismatch(a: Answer<ModelResult>): boolean {
  return a.result.verdict === "MISMATCH";
}
