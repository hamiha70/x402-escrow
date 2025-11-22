/**
 * Type definitions for ROFL app (copied from shared/types.ts to avoid dependencies)
 */

export interface PaymentIntent {
	buyer: string;
	seller: string;
	amount: string;
	token: string;
	nonce: string;
	expiry: number;
	resource: string;
	chainId: number;
}

export interface TEEPaymentPayload {
	intentStruct: PaymentIntent;
	signature: string;
}

export interface TEESettlementResponse {
	success: boolean;
	txHash: string;
	intentHash: string;
	newBalance: string;
	seller: string;
	amount: string;
	chain: number;
}

