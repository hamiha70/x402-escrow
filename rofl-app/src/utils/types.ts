/**
 * Type definitions for ROFL app (copied from main project to avoid dependencies)
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

export interface DepositRecord {
	amount: string;
	timestamp: number;
	chain: number;
	txHash: string;
}

export interface SpendRecord {
	seller: string;
	amount: string;
	resource: string;
	timestamp: number;
	chain: number;
	txHash: string;
	intentHash: string;
}

export interface ChainAccount {
	balance: string;
	nonce: number;
	deposits: DepositRecord[];
	spends: SpendRecord[];
}

export interface BuyerAccount {
	chains: Record<number, ChainAccount>;
}

export interface ActivityLogEntry {
	timestamp: number;
	type: "deposit" | "spend";
	buyer: string;
	chain: number;
	amount: string;
	txHash: string;
	ledgerHash: string;
	seller?: string;
	resource?: string;
	intentHash?: string;
}

export interface Ledger {
	buyers: Record<string, BuyerAccount>;
	activityLog: ActivityLogEntry[];
	metadata: {
		lastUpdated: number;
		totalDeposits: string;
		totalSpends: string;
		ledgerHash: string;
	};
}
