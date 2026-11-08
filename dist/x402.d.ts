/** Base mainnet and native USDC on Base. */
export declare const BASE_NETWORK = "eip155:8453";
export declare const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Default cap per payment: 0.05 USDC (XACTUM charges 0.03 per query). */
export declare const DEFAULT_MAX_MICRO_USDC = 50000;
export type EvmSigner = {
    address: `0x${string}`;
    signTypedData(message: unknown): Promise<`0x${string}`>;
};
export declare function xactumPaymentFetch(signer: EvmSigner, o?: {
    maxMicroUsdcPerPayment?: number;
    fetch?: typeof globalThis.fetch;
}): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
