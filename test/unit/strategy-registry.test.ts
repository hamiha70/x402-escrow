/**
 * Unit tests for StrategyRegistry (Seller)
 * 
 * Tests the registry pattern for managing multiple payment schemes.
 * Critical for extensibility to escrow-deferred and private-escrow-deferred.
 */

import { expect } from "chai";
import { describe, it } from "mocha";
import { StrategyRegistry } from "../../seller/strategies/StrategyRegistry.js";
import { ExactStrategy } from "../../seller/strategies/ExactStrategy.js";

describe("StrategyRegistry (Seller)", () => {
	describe("register()", () => {
		it("should register a strategy and auto-extract scheme name", () => {
			const registry = new StrategyRegistry();
			const strategy = new ExactStrategy(
				"http://localhost:4023",
				"0.01",
				"10000",
				6
			);

			registry.register(strategy); // Note: no manual scheme param
			const retrieved = registry.get("x402-exact");

			expect(retrieved).to.equal(strategy);
			expect(retrieved?.scheme).to.equal("x402-exact");
		});

		it("should support has() for scheme checking", () => {
			const registry = new StrategyRegistry();
			const strategy = new ExactStrategy(
				"http://localhost:4023",
				"0.01",
				"10000",
				6
			);

			expect(registry.has("x402-exact")).to.be.false;
			registry.register(strategy);
			expect(registry.has("x402-exact")).to.be.true;
		});
	});

	describe("get()", () => {
		it("should return undefined for unregistered scheme", () => {
			const registry = new StrategyRegistry();
			const retrieved = registry.get("nonexistent");
			expect(retrieved).to.be.undefined;
		});
	});

	describe("getSchemes()", () => {
		it("should return empty array for new registry", () => {
			const registry = new StrategyRegistry();
			expect(registry.getSchemes()).to.deep.equal([]);
		});

		it("should return all registered scheme names", () => {
			const registry = new StrategyRegistry();
			const exact = new ExactStrategy(
				"http://localhost:4023",
				"0.01",
				"10000",
				6
			);

			registry.register(exact);

			const schemes = registry.getSchemes();
			expect(schemes).to.be.an("array");
			expect(schemes).to.include("x402-exact");
			expect(schemes.length).to.equal(1);
		});

		it("should support multiple schemes (preparing for escrow-deferred)", () => {
			const registry = new StrategyRegistry();
			const exact = new ExactStrategy(
				"http://localhost:4023",
				"0.01",
				"10000",
				6
			);

			registry.register(exact);
			// Future: registry.register(escrowDeferredStrategy);

			expect(registry.getSchemes().length).to.be.at.least(1);
		});
	});
});

