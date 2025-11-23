/**
 * x402 Demo UI Server
 * 
 * Serves static frontend and provides WebSocket + REST APIs
 * for orchestrating payment flows in real-time
 */

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../shared/logger.js";
import { getNetworkConfig, getAvailableNetworks } from "./networks.js";
import { runExactFlow, runEscrowDeferredFlow } from "./orchestrator.js";
import type { DemoEvent } from "./orchestrator.js";

dotenv.config();

const logger = createLogger("demo-server");

// ES module dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.DEMO_PORT || 3000;

// Create Express app
const app = express();
app.use(express.json());

// Disable caching for development
app.use((req, res, next) => {
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
	res.setHeader("Pragma", "no-cache");
	res.setHeader("Expires", "0");
	next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active WebSocket connections
const clients = new Set<any>();

wss.on("connection", (ws) => {
	logger.info("New WebSocket connection established");
	clients.add(ws);

	ws.on("close", () => {
		logger.info("WebSocket connection closed");
		clients.delete(ws);
	});

	ws.on("error", (error) => {
		logger.error("WebSocket error:", error);
		clients.delete(ws);
	});

	// Send welcome message
	ws.send(
		JSON.stringify({
			type: "connected",
			message: "Connected to x402 demo server",
			timestamp: Date.now(),
		})
	);
});

/**
 * Broadcast event to all connected WebSocket clients
 */
function broadcast(event: DemoEvent): void {
	const message = JSON.stringify(event);
	clients.forEach((client) => {
		if (client.readyState === 1) {
			// OPEN
			client.send(message);
		}
	});
}

/**
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
	res.json({
		status: "healthy",
		service: "x402-demo-ui",
		timestamp: Date.now(),
		connections: clients.size,
	});
});

/**
 * Get available networks
 */
app.get("/api/networks", (req, res) => {
	try {
		const networks = getAvailableNetworks();
		res.json({
			networks: networks.map((n) => ({
				slug: n.slug,
				name: n.name,
				chainId: n.chainId,
				hasVault: !!n.vaultAddress,
			})),
		});
	} catch (error: any) {
		logger.error("Error fetching networks:", error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * Run x402-exact flow
 */
app.post("/api/run-exact", async (req, res) => {
	const { network } = req.body;

	if (!network) {
		return res.status(400).json({ error: "Network slug required" });
	}

	logger.info(`Starting x402-exact flow on ${network}`);

	// Send immediate response
	res.json({ success: true, message: "Flow started", network });

	// Run flow in background and broadcast events
	try {
		const networkConfig = getNetworkConfig(network);
		await runExactFlow(networkConfig, broadcast);
		logger.info("x402-exact flow completed successfully");
	} catch (error: any) {
		logger.error("Error in x402-exact flow:", error);
		broadcast({
			type: "error",
			message: error.message || "Unknown error occurred",
			timestamp: Date.now(),
		});
	}
});

/**
 * Run x402-escrow-deferred flow
 */
app.post("/api/run-escrow-deferred", async (req, res) => {
	const { network } = req.body;

	if (!network) {
		return res.status(400).json({ error: "Network slug required" });
	}

	logger.info(`Starting x402-escrow-deferred flow on ${network}`);

	// Send immediate response
	res.json({ success: true, message: "Flow started", network });

	// Run flow in background and broadcast events
	try {
		const networkConfig = getNetworkConfig(network);

		// Check if vault is deployed
		if (!networkConfig.vaultAddress) {
			throw new Error(
				`Vault not deployed on ${networkConfig.name}. Deploy with: npm run deploy:vault:${network}`
			);
		}

		await runEscrowDeferredFlow(networkConfig, broadcast);
		logger.info("x402-escrow-deferred flow completed successfully");
	} catch (error: any) {
		logger.error("Error in x402-escrow-deferred flow:", error);
		broadcast({
			type: "error",
			message: error.message || "Unknown error occurred",
			timestamp: Date.now(),
		});
	}
});

/**
 * Settle batch of pending payments
 */
app.post("/api/settle-batch", async (req, res) => {
	const { network } = req.body;

	if (!network) {
		return res.status(400).json({ error: "Network slug required" });
	}

	logger.info(`Triggering batch settlement for ${network}`);

	// Send immediate response
	res.json({ success: true, message: "Batch settlement started", network });

	// Run batch settlement in background and broadcast events
	try {
		const networkConfig = getNetworkConfig(network);
		const { runBatchSettlement } = await import("./orchestrator.js");
		await runBatchSettlement(networkConfig, broadcast);
		logger.info("Batch settlement completed successfully");
	} catch (error: any) {
		logger.error("Error in batch settlement:", error);
		broadcast({
			type: "error",
			message: error.message || "Unknown error occurred",
			timestamp: Date.now(),
		});
	}
});

/**
 * Fallback route - serve index.html for all non-API routes
 */
app.get("*", (req, res) => {
	if (!req.path.startsWith("/api")) {
		res.sendFile(path.join(__dirname, "public", "index.html"));
	} else {
		res.status(404).json({ error: "Endpoint not found" });
	}
});

// Start server
server.listen(PORT, () => {
	logger.info(`x402 Demo UI server running on http://localhost:${PORT}`);
	logger.info(`WebSocket available at ws://localhost:${PORT}`);
	logger.info(`Open your browser to http://localhost:${PORT} to view the demo`);
});

// Graceful shutdown
process.on("SIGINT", () => {
	logger.info("Shutting down demo server...");
	server.close(() => {
		logger.info("Server closed");
		process.exit(0);
	});
});

