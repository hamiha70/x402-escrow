/**
 * Unit tests for StrategyRegistry (Seller) and SchemeRegistry (Buyer)
 */

import { expect } from "chai";
import { describe, it } from "mocha";
import { StrategyRegistry } from "../../seller/strategies/StrategyRegistry.js";
import { ExactStrategy } from "../../seller/strategies/ExactStrategy.js";
import type { PaymentStrategy } from "../../seller/strategies/PaymentStrategy.js";

describe("StrategyRegistry (Seller)", () => {
	describe("register()", () => {
		it("should register a strategy", () => {
			const registry = new StrategyRegistry();
			const strategy = new ExactStrategy(
				"0xSeller",
				"http://localhost:4023",
				"0.01",
				"10000",
				6
			);

			registry.register("x402-exact", strategy);
			const retrieved = registry.get("x402-exact");

			expect(retrieved).to.equal(strategy);
			expect(retrieved?.scheme).to.equal("x402-exact");
		});

		it("should throw if registering duplicate scheme", () => {
			const registry = new StrategyRegistry();
			const strategy = new ExactStrategy(
				"0xSeller",
				"http://localhost:4023",
				"0.01",
				"10000",
				6
			);

			registry.register("x402-exact", strategy);

			expect(() => {
				registry.register("x402-exact", strategy);
			}).to.throw(/already registered/);
		});
	});

	describe("get()", () => {
		it("should return undefined for unregistered scheme", () => {
			const registry = new StrategyRegistry();
			const retrieved = registry.get("nonexistent");
			expect(retrieved).to.be.undefined;
		});
	});

	describe("getSupportedSchemes()", () => {
		it("should return empty array for new registry", () => {
			const registry = new StrategyRegistry();
			expect(registry.getSupportedSchemes()).to.deep.equal([]);
		});

		it("should return all registered scheme names", () => {
			const registry = new StrategyRegistry();
			const exact = new ExactStrategy(
				"0xSeller",
				"http://localhost:4023",
				"0.01",
				"10000",
				6
			);

			registry.register("x402-exact", exact);

			const schemes = registry.getSupportedSchemes();
			expect(schemes).to.be.an("array");
			expect(schemes).to.include("x402-exact");
			expect(schemes.length).to.equal(1);
		});
	});
});

