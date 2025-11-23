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

// Display HTTP request (compact) in correct column
function displayHttpRequest(event) {
	const column = getColumnForRole(event.role);
	if (!column) return;
	
	const eventEl = document.createElement('div');
	eventEl.className = 'event http-request';
	eventEl.dataset.eventData = JSON.stringify(event);
	
	// Extract path from URL
	const urlPath = event.url.replace('http://localhost:4022', '').replace('http://localhost:4023', '').split('?')[0];
	
	let content = `<strong>📤 ${event.method}</strong><br><small>${urlPath}</small>`;
	
	eventEl.innerHTML = content;
	column.appendChild(eventEl);
}

// Display HTTP response (compact) in correct column
function displayHttpResponse(event) {
	const column = getColumnForRole(event.role);
	if (!column) return;
	
	const eventEl = document.createElement('div');
	eventEl.className = 'event http-response';
	eventEl.dataset.eventData = JSON.stringify(event);
	
	const statusEmoji = event.status === 402 ? '💰' : event.status === 200 ? '✅' : '📨';
	let content = `<strong>${statusEmoji} ${event.status}</strong> ${getStatusText(event.status)}`;
	
	// Show key details for 402
	if (event.status === 402 && event.body && event.body.PaymentRequirements) {
		const req = event.body.PaymentRequirements[0];
		if (req) {
			content += `<br><small>💵 ${req.amount} ${req.token}</small>`;
		}
	}
	
	// Show success for 200
	if (event.status === 200) {
		content += `<br><small>Content delivered</small>`;
	}
	
	eventEl.innerHTML = content;
	column.appendChild(eventEl);
}

// Display signing event in correct column
function displaySigning(event) {
	const column = getColumnForRole(event.role);
	if (!column) return;
	
	const eventEl = document.createElement('div');
	eventEl.className = 'event signing';
	eventEl.dataset.eventData = JSON.stringify(event);
	
	let content = `<strong>🔐 ${event.message}</strong>`;
	content += `<br><small>${truncateHash(event.signer)}</small>`;
	
	eventEl.innerHTML = content;
	column.appendChild(eventEl);
}

// Display transaction (with emojis) in correct column
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
	content += `<small>${truncateHash(event.hash)}</small><br>`;
	content += `<small>${statusEmoji} ${statusText}</small>`;
	if (event.gasUsed) {
		content += `<br><small>⛽ ${formatNumber(event.gasUsed)} gas</small>`;
	}
	content += `<br><a href="${event.explorer}" target="_blank" style="font-size:0.75rem">🔗 Explorer</a>`;
	
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

// Display completion
function displayComplete(event) {
	// Show metrics in control panel
	showMetrics(event.metrics);
	
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

// Show metrics
function showMetrics(metrics) {
	const metricsDiv = document.getElementById('metrics');
	metricsDiv.style.display = 'block';
	
	document.getElementById('time').textContent = metrics.totalTime || '-';
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

