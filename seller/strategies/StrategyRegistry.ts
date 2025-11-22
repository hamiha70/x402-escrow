/**
 * Strategy Registry
 * 
 * Manages available payment strategies and routes requests to the correct one.
 */

import type { PaymentStrategy } from "./PaymentStrategy.js";
import { ExactStrategy } from "./ExactStrategy.js";
import { EscrowDeferredStrategy } from "./EscrowDeferredStrategy.js";

export class StrategyRegistry {
	private strategies = new Map<string, PaymentStrategy>();

	/**
	 * Register a payment strategy
	 */
	register(strategy: PaymentStrategy): void {
		this.strategies.set(strategy.scheme, strategy);
	}

	/**
	 * Get a strategy by scheme name
	 */
	get(scheme: string): PaymentStrategy | undefined {
		return this.strategies.get(scheme);
	}

	/**
	 * Get all registered schemes
	 */
	getSchemes(): string[] {
		return Array.from(this.strategies.keys());
	}

	/**
	 * Check if a scheme is supported
	 */
	has(scheme: string): boolean {
		return this.strategies.has(scheme);
	}
}

/**
 * Create default strategy registry with exact strategy
 */
export function createDefaultRegistry(
	facilitatorUrl: string,
	paymentAmountDisplay: string,
	paymentAmountRaw: string,
	usdcDecimals: number
): StrategyRegistry {
	const registry = new StrategyRegistry();
	
	// Register exact strategy (current implementation)
	const exactStrategy = new ExactStrategy(
		facilitatorUrl,
		paymentAmountDisplay,
		paymentAmountRaw,
		usdcDecimals
	);
	registry.register(exactStrategy);
	
	// Register escrow-deferred strategy [MOCK_CHAIN]
	// ⚠️ Uses mock Vault until deployment
	const escrowDeferredStrategy = new EscrowDeferredStrategy(
		facilitatorUrl,
		paymentAmountDisplay,
		paymentAmountRaw,
		usdcDecimals
	);
	registry.register(escrowDeferredStrategy);
	
	return registry;
}

