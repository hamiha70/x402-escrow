/**
 * x402 Demo UI Frontend
 * WebSocket client for real-time event visualization
 */

// State
let ws = null;
let currentScheme = 'exact';
let isRunning = false;
let eventQueue = [];
let isProcessingQueue = false;

// Scheme characteristics for auto-derivation
const SCHEME_CHARACTERISTICS = {
	exact: {
		serviceBeforeSettle: false,
		batchSettle: false,
		buyerNotOnchain: false, // Buyer IS onchain (bad)
		escrowRequired: false,
		trustlessFacilitator: true,
	},
	'escrow-deferred': {
		serviceBeforeSettle: true,
		batchSettle: true,
		buyerNotOnchain: false, // Buyer still onchain for deposit
		escrowRequired: true, // Required (bad)
		trustlessFacilitator: true,
	},
	tee: {
		serviceBeforeSettle: true,
		batchSettle: true,
		buyerNotOnchain: true,
		escrowRequired: false,
		trustlessFacilitator: true,
	},
	zk: {
		serviceBeforeSettle: true,
		batchSettle: true,
		buyerNotOnchain: true,
		escrowRequired: false,
		trustlessFacilitator: true,
	},
};

// Initialize WebSocket connection
function initWebSocket() {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const wsUrl = `${protocol}//${window.location.host}`;
	
	ws = new WebSocket(wsUrl);
	
	ws.onopen = () => {
		console.log('WebSocket connected');
	};
	
ws.onmessage = (event) => {
	const data = JSON.parse(event.data);
	// Queue events for delayed display (1 second between events)
	eventQueue.push(data);
	processEventQueue();
};
	
	ws.onerror = (error) => {
		console.error('WebSocket error:', error);
	};
	
	ws.onclose = () => {
		console.log('WebSocket closed, reconnecting...');
		setTimeout(initWebSocket, 2000);
	};
}

// Process event queue with 1-second delays
async function processEventQueue() {
	if (isProcessingQueue) return;
	isProcessingQueue = true;
	
	while (eventQueue.length > 0) {
		const event = eventQueue.shift();
		handleEvent(event);
		
		// Don't delay for 'connected' or transaction updates
		const shouldDelay = event.type !== 'connected' && 
			!(event.type === 'transaction' && event.status === 'confirmed');
		
		if (shouldDelay && eventQueue.length > 0) {
			await sleep(1000); // 1 second delay between events
		}
	}
	
	isProcessingQueue = false;
}

// Sleep helper
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle incoming events (immediate, no delay here)
function handleEvent(event) {
	console.log('Event received:', event);
	
	switch (event.type) {
		case 'connected':
			console.log('Connected to server');
			break;
		case 'step':
			displayStep(event);
			break;
		case 'http-request':
			displayHttpRequest(event);
			break;
		case 'http-response':
			displayHttpResponse(event);
			break;
		case 'signing':
			displaySigning(event);
			break;
		case 'transaction':
			displayTransaction(event);
			break;
		case 'complete':
			displayComplete(event);
			break;
		case 'error':
			displayError(event);
			break;
	}
}

// Get the correct column for an event based on role
function getColumnForRole(role) {
	const columnIds = {
		'buyer': 'buyer-events',
		'facilitator': 'facilitator-events',
		'seller': 'seller-events'
	};
	return document.getElementById(columnIds[role] || 'buyer-events');
}

// Display step (with large number) in correct column
function displayStep(event) {
	const column = getColumnForRole(event.role);
	if (!column) return;
	
	const eventEl = document.createElement('div');
	eventEl.className = 'event step';
	eventEl.dataset.eventData = JSON.stringify(event);
	eventEl.dataset.step = event.step;
	
	eventEl.innerHTML = `<strong>${event.description}</strong>`;
	column.appendChild(eventEl);
}

// Display HTTP request (detailed) in correct column
function displayHttpRequest(event) {
	const column = getColumnForRole(event.role);
	if (!column) return;
	
	const eventEl = document.createElement('div');
	eventEl.className = 'event http-request';
	eventEl.dataset.eventData = JSON.stringify(event);
	
	// Clean URL path
	const urlPath = event.url;
	
	let content = `<strong>📤 ${event.method}</strong><br><small>${urlPath}</small>`;
	
	// Show x-payment header if present
	if (event.headers && event.headers['x-payment']) {
		content += `<br><small>Header: x-payment</small>`;
	}
	
	eventEl.innerHTML = content;
	column.appendChild(eventEl);
}

// Display HTTP response (detailed) in correct column
function displayHttpResponse(event) {
	const column = getColumnForRole(event.role);
	if (!column) return;
	
	const eventEl = document.createElement('div');
	eventEl.className = 'event http-response';
	eventEl.dataset.eventData = JSON.stringify(event);
	
	const statusEmoji = event.status === 402 ? '💰' : event.status === 200 ? '✅' : '📨';
	let content = `<strong>${statusEmoji} ${event.status}</strong> ${getStatusText(event.status)}`;
	
	// Show detailed info for 402
	if (event.status === 402 && event.body && event.body.PaymentRequirements) {
		const req = event.body.PaymentRequirements[0];
		if (req) {
			content += `<br><small>Headers:</small>`;
			if (event.headers && event.headers['x-payment-request']) {
				content += `<br><small>  x-payment-request</small>`;
			}
			content += `<br><small>${req.amount} ${req.token}</small>`;
		}
	}
	
	// Show success for 200
	if (event.status === 200) {
		content += `<br><small>Content delivered</small>`;
	}
	
	eventEl.innerHTML = content;
	column.appendChild(eventEl);
}

// Display signing event (detailed) in correct column
function displaySigning(event) {
	const column = getColumnForRole(event.role);
	if (!column) return;
	
	const eventEl = document.createElement('div');
	eventEl.className = 'event signing';
	eventEl.dataset.eventData = JSON.stringify(event);
	
	let content = `<strong>🔐 ${event.message}</strong>`;
	content += `<br><small>Signed by: ${truncateHash(event.signer)}</small>`;
	
	eventEl.innerHTML = content;
	column.appendChild(eventEl);
}

// Display transaction (detailed) in correct column
function displayTransaction(event) {
	const column = getColumnForRole(event.role);
	if (!column) return;
	
	// Check if transaction event already exists (for updates)
	const existingTx = Array.from(column.children).find(
		el => el.dataset.txHash === event.hash
	);
	
	const statusEmoji = event.status === 'pending' ? '⏳' : '✅';
	const statusText = event.status === 'pending' ? 'Pending' : 'Confirmed';
	
	let content = `<strong>📡 Blockchain Tx</strong><br>`;
	
	// Show facilitator details
	if (event.facilitatorAddress) {
		content += `<small>Facilitator: ${truncateHash(event.facilitatorAddress)}</small><br>`;
	}
	if (event.contractCall) {
		content += `<small>Calls: ${event.contractCall}</small><br>`;
	}
	
	content += `<small>Tx: ${truncateHash(event.hash)}</small><br>`;
	content += `<small>${statusEmoji} ${statusText}</small>`;
	
	if (event.gasUsed) {
		content += `<br><small>⛽ ${formatNumber(event.gasUsed)} gas</small>`;
	}
	if (event.explorer) {
		content += `<br><a href="${event.explorer}" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem">🔗 Explorer</a>`;
	}
	
	if (existingTx) {
		// Update existing transaction status
		existingTx.innerHTML = content;
		existingTx.dataset.eventData = JSON.stringify(event);
	} else {
		// Create new transaction event
		const eventEl = document.createElement('div');
		eventEl.className = 'event transaction';
		eventEl.dataset.txHash = event.hash;
		eventEl.dataset.eventData = JSON.stringify(event);
		eventEl.innerHTML = content;
		column.appendChild(eventEl);
	}
}

// Update flow characteristics based on scheme
function updateCharacteristics(scheme) {
	const chars = SCHEME_CHARACTERISTICS[scheme];
	if (!chars) return;
	
	// Service < Settle
	updateCharacteristic('char-service-settle', chars.serviceBeforeSettle, true);
	
	// Batch Settle
	updateCharacteristic('char-batch', chars.batchSettle, true);
	
	// Buyer not Onchain (good when true, bad when false)
	updateCharacteristic('char-buyer-onchain', chars.buyerNotOnchain, true);
	
	// Escrow Required (BAD when true)
	updateCharacteristic('char-escrow', chars.escrowRequired, false);
	
	// Trustless Facilitator
	updateCharacteristic('char-trustless', chars.trustlessFacilitator, true);
}

// Update individual characteristic
function updateCharacteristic(elementId, applies, isGoodWhenTrue) {
	const el = document.getElementById(elementId);
	if (!el) return;
	
	el.className = 'characteristic';
	
	if (applies) {
		// Applies - show in bold with colored symbol
		el.classList.add('applies');
		if (isGoodWhenTrue) {
			el.classList.add('good');
		} else {
			el.classList.add('bad');
		}
	} else {
		// Doesn't apply - show in grey thin
		el.classList.add('not-applies');
	}
}

// Display completion
function displayComplete(event) {
	// Show metrics and characteristics in control panel
	showMetrics(event);
	
	// Show characteristics after short delay (let user see final events first)
	setTimeout(() => {
		updateCharacteristics(currentScheme);
	}, 500);
	
	// Reset running state
	isRunning = false;
	
	// Update button states
	document.querySelectorAll('.scheme-btn').forEach(b => {
		b.classList.remove('running');
	});
}

// Display error (show in buyer column)
function displayError(event) {
	const column = document.getElementById('buyer-events');
	if (!column) return;
	
	const eventEl = document.createElement('div');
	eventEl.className = 'event error';
	
	eventEl.innerHTML = `<strong>✗ Error</strong><br><small>${event.message}</small>`;
	
	column.appendChild(eventEl);
	
	// Reset state
	isRunning = false;
	document.querySelectorAll('.scheme-btn').forEach(b => {
		b.classList.remove('running');
	});
}

// Show metrics and characteristics
function showMetrics(event) {
	const metrics = event.metrics || {};
	const timing = event.timing || {};
	
	// For escrow-deferred, show queue panel instead of metrics initially
	if (currentScheme === 'escrow-deferred' && timing.requestToPay === 'Deferred') {
		showQueuePanel(event);
	} else {
		const metricsDiv = document.getElementById('metrics');
		metricsDiv.style.display = 'block';
		
		// Update timing
		const requestToService = timing.requestToService 
			? `${timing.requestToService.toFixed(2)}s`
			: '-';
		const requestToPay = typeof timing.requestToPay === 'string' 
			? timing.requestToPay 
			: `${timing.requestToPay.toFixed(2)}s`;
		
		document.getElementById('time').textContent = requestToService;
		document.getElementById('time-to-pay').textContent = requestToPay;
		document.getElementById('gas').textContent = formatNumber(metrics.gasUsed) || '-';
		
		const txLink = document.getElementById('tx-link');
		if (metrics.explorerUrl) {
			txLink.href = metrics.explorerUrl;
			txLink.textContent = 'View on Explorer';
			txLink.style.display = 'inline';
		} else {
			txLink.style.display = 'none';
		}
	}
	
	// Update characteristics
	updateCharacteristics(currentScheme);
}

// Show queue panel for escrow-deferred
function showQueuePanel(event) {
	const queuePanel = document.getElementById('queue-panel');
	const metricsDiv = document.getElementById('metrics');
	
	queuePanel.style.display = 'block';
	metricsDiv.style.display = 'block';
	
	const metrics = event.metrics || {};
	const timing = event.timing || {};
	
	// Update queue info
	document.getElementById('queue-pending').textContent = '1 payment';
	document.getElementById('queue-value').textContent = '0.01 USDC';
	document.getElementById('queue-chain').textContent = document.getElementById('network').options[document.getElementById('network').selectedIndex].text;
	
	// Update metrics
	const requestToService = timing.requestToService 
		? `${timing.requestToService.toFixed(2)}s`
		: '-';
	
	document.getElementById('time').textContent = requestToService;
	document.getElementById('time-to-pay').textContent = 'Deferred';
	document.getElementById('gas').textContent = '0';
	document.getElementById('tx-link').style.display = 'none';
}

// Clear events from all columns
function clearEvents() {
	// Clear event queue
	eventQueue = [];
	isProcessingQueue = false;
	
	// Clear columns
	['buyer-events', 'facilitator-events', 'seller-events'].forEach(id => {
		const column = document.getElementById(id);
		if (column) column.innerHTML = '';
	});
	
	const metricsDiv = document.getElementById('metrics');
	if (metricsDiv) metricsDiv.style.display = 'none';
}

// Run demo flow
async function runDemoFlow() {
	if (isRunning) return;
	
	isRunning = true;
	clearEvents();
	
	const network = document.getElementById('network').value;
	const scheme = currentScheme;
	
	try {
		const response = await fetch(`/api/run-${scheme}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ network })
		});
		
		const data = await response.json();
		
		if (!response.ok) {
			throw new Error(data.error || 'Failed to start flow');
		}
		
		console.log('Flow started:', data);
	} catch (error) {
		console.error('Error starting flow:', error);
		displayError({
			type: 'error',
			message: error.message,
			timestamp: Date.now()
		});
		
		isRunning = false;
		// Reset button states
		document.querySelectorAll('.scheme-btn').forEach(b => {
			b.classList.remove('running');
		});
	}
}


// Helper functions
function truncateHash(hash) {
	if (!hash || hash.length < 10) return hash;
	return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatNumber(num) {
	if (!num) return '0';
	return parseInt(num).toLocaleString();
}

function getStatusText(status) {
	const statusTexts = {
		200: 'OK',
		402: 'Payment Required',
		400: 'Bad Request',
		500: 'Server Error'
	};
	return statusTexts[status] || '';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
	// Initialize WebSocket
	initWebSocket();
	
	// Scheme buttons - click to run
	document.querySelectorAll('.scheme-btn').forEach(btn => {
		btn.addEventListener('click', async () => {
			const scheme = btn.dataset.scheme;
			
			// Check if scheme is implemented
			if (scheme !== 'exact' && scheme !== 'escrow-deferred') {
				alert(`${scheme.toUpperCase()} scheme coming soon!`);
				return;
			}
			
			// Show setup button for escrow-deferred
			const setupBtn = document.getElementById('setup-escrow-btn');
			if (scheme === 'escrow-deferred') {
				setupBtn.style.display = 'block';
			} else {
				setupBtn.style.display = 'none';
			}
			
			// Update active state
			document.querySelectorAll('.scheme-btn').forEach(b => {
				b.classList.remove('running');
				b.classList.add('completed');
			});
			btn.classList.remove('completed');
			btn.classList.add('running');
			
			// Run the flow
			currentScheme = scheme;
			await runDemoFlow();
			
			// Update state after completion
			btn.classList.remove('running');
		});
	});
	
	// Setup escrow button - deposit to vault
	const setupEscrowBtn = document.getElementById('setup-escrow-btn');
	if (setupEscrowBtn) {
		setupEscrowBtn.addEventListener('click', async () => {
			if (isRunning) return;
			
			isRunning = true;
			setupEscrowBtn.disabled = true;
			setupEscrowBtn.textContent = '⏳ Depositing...';
			
			const network = document.getElementById('network').value;
			
			try {
				const response = await fetch('/api/setup-escrow', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ network })
				});
				
				const data = await response.json();
				
				if (!response.ok) {
					throw new Error(data.error || 'Failed to setup escrow');
				}
				
				setupEscrowBtn.textContent = '✅ Escrow Ready';
				setTimeout(() => {
					setupEscrowBtn.style.display = 'none';
				}, 2000);
			} catch (error) {
				console.error('Error setting up escrow:', error);
				alert(error.message);
				setupEscrowBtn.disabled = false;
				setupEscrowBtn.textContent = '💰 Setup Escrow (Deposit)';
			} finally {
				isRunning = false;
			}
		});
	}
	
	// Settle batch button
	const settleBatchBtn = document.getElementById('settle-batch-btn');
	if (settleBatchBtn) {
		settleBatchBtn.addEventListener('click', async () => {
			if (isRunning) return;
			
			isRunning = true;
			settleBatchBtn.disabled = true;
			settleBatchBtn.textContent = '⏳ Settling...';
			
			const network = document.getElementById('network').value;
			
			try {
				const response = await fetch('/api/settle-batch', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ network })
				});
				
				const data = await response.json();
				
				if (!response.ok) {
					throw new Error(data.error || 'Failed to settle batch');
				}
				
				// Hide queue panel
				document.getElementById('queue-panel').style.display = 'none';
				
				console.log('Batch settlement started:', data);
			} catch (error) {
				console.error('Error settling batch:', error);
				alert(error.message);
				settleBatchBtn.disabled = false;
				settleBatchBtn.textContent = '⚡ Settle Batch Now';
				isRunning = false;
			}
		});
	}
	
	// Show default characteristics after 5 seconds if idle
	setTimeout(() => {
		if (!isRunning) {
			updateCharacteristics('exact');
		}
	}, 5000);
});

// Handle page visibility (pause/resume WebSocket)
document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		console.log('Page hidden, WebSocket will continue...');
	} else {
		console.log('Page visible');
		// Reconnect if disconnected
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			initWebSocket();
		}
	}
});

