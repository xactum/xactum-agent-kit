import { describe, expect, it } from "vitest";
import { createXactum, isOverpriced, XactumError } from "../src/index.js";

const TERMS = { id: "xactum-tos-2.0", sha256: "a".repeat(64), url: "https://api.xactum.com/terms/xactum-tos-2.0" };
const header = { "x-xactum-terms": `${TERMS.id}; sha256=${TERMS.sha256}; url=${TERMS.url}` };

type Call = { url: string; method: string; body?: unknown };

function fakeServer(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const c: Call = { url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    if (c.url.endsWith("/health")) return new Response("{}", { status: 200, headers: header });
    return handler(c);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const answer = (verdict: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ result: { verdict, confidence: "low", reasons: [] }, charged: false, queryId: null, reference: null, terms: TERMS, advisory: "a", ...extra }), { status: 200 });

describe("agent kit", () => {
  it("requires an explicit acceptance of the terms", () => {
    expect(() => createXactum({} as never)).toThrow(/acceptTerms/);
  });

  it("sends only the defined fields, with the current terms id and hash", async () => {
    const s = fakeServer(() => answer("COMPETITIVE"));
    const x = createXactum({ acceptTerms: true, fetch: s.fetch, vatId: "ES12345678Z" });
    const a = await x.verifyPrice({ modelId: "m/a", inputPerMTok: 1 });
    expect(a.result.verdict).toBe("COMPETITIVE");
    const post = s.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("https://api.xactum.com/v1/verify/price");
    expect(post.body).toEqual({ acceptTerms: { id: TERMS.id, sha256: TERMS.sha256 }, businessUse: true, query: { modelId: "m/a", inputPerMTok: 1 }, vatId: "ES12345678Z" });
  });

  it("re-reads the terms once if they changed", async () => {
    let n = 0;
    const s = fakeServer(() => (++n === 1 ? new Response(JSON.stringify({ error: "TERMS_NOT_ACCEPTED" }), { status: 422 }) : answer("CONSISTENT")));
    const x = createXactum({ acceptTerms: true, fetch: s.fetch });
    expect((await x.verifyModel({ modelId: "m/a", gateway: "g", observedAt: "2026-11-08T00:00:00Z" })).result.verdict).toBe("CONSISTENT");
    expect(s.calls.filter((c) => c.url.endsWith("/health"))).toHaveLength(2);
  });

  it("explains a 402 (needs a payment-enabled fetch) and other refusals", async () => {
    const pay = createXactum({ acceptTerms: true, fetch: fakeServer(() => new Response("{}", { status: 402 })).fetch });
    await expect(pay.verifyPrice({ modelId: "m/a" })).rejects.toMatchObject({ status: 402, code: "PAYMENT_REQUIRED" });
    const bad = createXactum({ acceptTerms: true, fetch: fakeServer(() => new Response(JSON.stringify({ error: "INVALID_QUERY", detail: "modelId required" }), { status: 400 })).fetch });
    await expect(bad.verifyPrice({ modelId: "" })).rejects.toBeInstanceOf(XactumError);
  });

  it("feedback posts structured fields only", async () => {
    const s = fakeServer(() => new Response("{}", { status: 201 }));
    const x = createXactum({ acceptTerms: true, fetch: s.fetch });
    await x.feedback({ queryId: "q1", useful: "partly", outcome: "used_as_input" });
    expect(s.calls[0]!.body).toEqual({ queryId: "q1", useful: "partly", outcome: "used_as_input" });
  });

  it("isOverpriced", async () => {
    const x = createXactum({ acceptTerms: true, fetch: fakeServer(() => answer("FLAG_HIGH_STRONG")).fetch });
    expect(isOverpriced(await x.verifyPrice({ modelId: "m/a", inputPerMTok: 9 }))).toBe(true);
  });
});
