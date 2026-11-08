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
export declare const XACTUM_BASE_URL = "https://api.xactum.com";
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
    dimensions: {
        dimension: string;
        quoted: number;
        reference: number;
        ratio: number;
        verdict: string;
    }[];
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
    reference: {
        kind: string;
        setId: string;
        sha256: string;
    } | null;
    terms: {
        id: string;
        sha256: string;
        url: string;
    };
    advisory: string;
};
export type FeedbackInput = {
    queryId: string;
    useful: "yes" | "partly" | "no";
    outcome?: "acted_on_verdict" | "used_as_input" | "ignored" | "verdict_seemed_wrong" | "verdict_unclear";
};
export declare class XactumError extends Error {
    readonly status: number;
    readonly code?: string | undefined;
    constructor(message: string, status: number, code?: string | undefined);
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
    terms(): Promise<{
        id: string;
        sha256: string;
        url: string;
    }>;
};
export declare function createXactum(opts: XactumOptions): Xactum;
/** Helper for agents: true when the price you were quoted is clearly above the independent reference. */
export declare function isOverpriced(a: Answer<PriceResult>): boolean;
/** Helper for agents: true when the model served does not look like the model claimed. */
export declare function isModelMismatch(a: Answer<ModelResult>): boolean;
