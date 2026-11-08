/**
 * Payment-enabled fetch for XACTUM (x402, USDC on Base), with a hard spend cap.
 * Requires the optional packages: npm i @x402/fetch@2.28.0 @x402/evm@2.28.0 viem
 *
 *   import { privateKeyToAccount } from "viem/accounts";
 *   import { xactumPaymentFetch } from "@xactum/agent-kit/x402";
 *   const fetch = xactumPaymentFetch(privateKeyToAccount(process.env.AGENT_WALLET_KEY as `0x${string}`));
 *   const xactum = createXactum({ acceptTerms: true, fetch });
 */
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
/** Base mainnet and native USDC on Base. */
export const BASE_NETWORK = "eip155:8453";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Default cap per payment: 0.05 USDC (XACTUM charges 0.03 per query). */
export const DEFAULT_MAX_MICRO_USDC = 50_000;
export function xactumPaymentFetch(signer, o = {}) {
    const client = new x402Client();
    client.register(BASE_NETWORK, new ExactEvmScheme(signer));
    client.setSpendControls({
        maxAmountPerPayment: false,
        allowedAssets: [{ network: BASE_NETWORK, asset: BASE_USDC, maxAmountPerPayment: String(o.maxMicroUsdcPerPayment ?? DEFAULT_MAX_MICRO_USDC) }],
    });
    return wrapFetchWithPayment(o.fetch ?? globalThis.fetch, client);
}
