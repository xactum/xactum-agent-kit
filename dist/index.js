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
export class XactumError extends Error {
    status;
    code;
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = "XactumError";
    }
}
const TERMS_HEADER = /^([A-Za-z0-9._-]+); sha256=([0-9a-f]{64}); url=(\S+)$/;
export function createXactum(opts) {
    if (opts?.acceptTerms !== true)
        throw new Error("createXactum: set acceptTerms: true after reading https://api.xactum.com/terms (business use only)");
    const f = opts.fetch ?? globalThis.fetch;
    const base = (opts.baseUrl ?? XACTUM_BASE_URL).replace(/\/$/, "");
    let termsCache = null;
    const terms = async () => {
        if (termsCache)
            return termsCache;
        const r = await f(`${base}/health`, { headers: { accept: "application/json" } });
        const m = TERMS_HEADER.exec(r.headers.get("x-xactum-terms") ?? "");
        if (!m)
            throw new XactumError("could not read the XACTUM terms", r.status);
        termsCache = { id: m[1], sha256: m[2], url: m[3] };
        return termsCache;
    };
    const ask = async (path, key, payload, retried = false) => {
        const t = await terms();
        const body = { acceptTerms: { id: t.id, sha256: t.sha256 }, businessUse: true, [key]: payload };
        if (opts.vatId)
            body.vatId = opts.vatId;
        const r = await f(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
        const text = await r.text();
        let j = {};
        try {
            j = JSON.parse(text);
        }
        catch {
            /* not JSON */
        }
        if (r.status === 422 && j.error === "TERMS_NOT_ACCEPTED" && !retried) {
            // The terms changed since we read them: read again once.
            termsCache = null;
            return ask(path, key, payload, true);
        }
        if (r.status === 402)
            throw new XactumError("payment required: pass a payment-enabled fetch (see @xactum/agent-kit/x402)", 402, "PAYMENT_REQUIRED");
        if (!r.ok)
            throw new XactumError(String(j.detail ?? j.error ?? `HTTP ${r.status}`), r.status, typeof j.error === "string" ? j.error : undefined);
        return j;
    };
    return {
        verifyPrice: (query) => ask("/v1/verify/price", "query", query),
        verifyModel: (sample) => ask("/v1/verify/model", "sample", sample),
        feedback: async (input) => {
            const r = await f(`${base}/v1/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
            if (r.status !== 201) {
                let j = {};
                try {
                    j = (await r.json());
                }
                catch {
                    /* not JSON */
                }
                throw new XactumError(String(j.detail ?? `HTTP ${r.status}`), r.status, typeof j.error === "string" ? j.error : undefined);
            }
        },
        terms,
    };
}
/** Helper for agents: true when the price you were quoted is clearly above the independent reference. */
export function isOverpriced(a) {
    return a.result.verdict === "FLAG_HIGH" || a.result.verdict === "FLAG_HIGH_STRONG";
}
/** Helper for agents: true when the model served does not look like the model claimed. */
export function isModelMismatch(a) {
    return a.result.verdict === "MISMATCH";
}
