/**
 * Scheme Registry for Buyer
 * 
 * Manages available scheme strategies for creating payment payloads
 */

import type { SchemeStrategy } from "./SchemeStrategy.js";
import { ExactScheme } from "./ExactScheme.js";
import { EscrowDeferredScheme } from "./EscrowDeferredScheme.js";

export class SchemeRegistry {
	private strategies = new Map<string, SchemeStrategy>();

	/**
	 * Register a scheme strategy
	 */
	register(scheme: string, strategy: SchemeStrategy): void {
		this.strategies.set(scheme, strategy);
	}

	/**
	 * Get a strategy by scheme name
	 */
	get(scheme: string): SchemeStrategy | undefined {
		return this.strategies.get(scheme);
	}

	/**
	 * Get all registered schemes
	 */
	getSchemes(): string[] {
		return Array.from(this.strategies.keys());
	}
}

/**
 * Create default scheme registry with exact scheme
 */
export function createDefaultRegistry(): SchemeRegistry {
	const registry = new SchemeRegistry();
	
	// Register exact scheme (current implementation)
	registry.register("intent", new ExactScheme());
	registry.register("x402-exact", new ExactScheme()); // Alias
	
	// Register escrow-deferred scheme [MOCK_CHAIN]
	// ⚠️ Uses mock Vault until deployment
	registry.register("x402-escrow-deferred", new EscrowDeferredScheme());
	
	return registry;
}

