/**
 * x402 Demo UI Frontend
 * WebSocket client for real-time event visualization
 */

// State
let ws = null;
let currentScheme = 'exact';
let isRunning = false;

// Scheme info for control panel
const SCHEME_INFO = {
	exact: {
		title: 'x402-exact',
		description: 'Reference Implementation',
		badges: ['⏱️ ~9s', '⛽ ~85k', '🔒 None']
	},
	'escrow-deferred': {
		title: 'Escrow-Deferred',
		description: 'Instant Delivery',
		badges: ['⏱️ <100ms', '⛽ ~3k*', '🔒 None']
	},
	tee: {
		title: 'TEE',
		description: 'Privacy-Preserving',
		badges: ['⏱️ <100ms', '⛽ ~10k*', '🔒 Full']
	},
	zk: {
		title: 'ZK Private',
		description: 'Zero-Knowledge',
		badges: ['⏱️ <200ms', '⛽ ~15k*', '🔒 Full']
	}
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
		handleEvent(data);
	};
	
	ws.onerror = (error) => {
		console.error('WebSocket error:', error);
	};
	
	ws.onclose = () => {
		console.log('WebSocket closed, reconnecting...');
		setTimeout(initWebSocket, 2000);
	};
}

// Handle incoming events
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

// Display step (with emoji)
function displayStep(event) {
	const eventsDiv = document.getElementById('events');
	const eventEl = document.createElement('div');
	eventEl.className = 'event step';
	
	const stepEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
	const emoji = stepEmojis[event.step - 1] || '▶️';
	
	eventEl.innerHTML = `<strong>${emoji} Step ${event.step}:</strong> ${event.description}`;
	eventsDiv.appendChild(eventEl);
	scrollToBottom();
}

// Display HTTP request (compact)
function displayHttpRequest(event) {
	const eventsDiv = document.getElementById('events');
	const eventEl = document.createElement('div');
	eventEl.className = 'event http-request';
	
	// Extract path from URL
	const urlPath = event.url.replace('http://localhost:4022', '').replace('http://localhost:4023', '');
	
	let content = `<strong>📤 ${event.method}</strong> ${urlPath}`;
	
	eventEl.innerHTML = content;
	eventsDiv.appendChild(eventEl);
	scrollToBottom();
}

// Display HTTP response (compact)
function displayHttpResponse(event) {
	const eventsDiv = document.getElementById('events');
	const eventEl = document.createElement('div');
	eventEl.className = 'event http-response';
	
	const statusEmoji = event.status === 402 ? '💰' : event.status === 200 ? '✅' : '📨';
	let content = `<strong>${statusEmoji} ${event.status}</strong> ${getStatusText(event.status)}`;
	
	// Show key details for 402
	if (event.status === 402 && event.body && event.body.PaymentRequirements) {
		const req = event.body.PaymentRequirements[0];
		if (req) {
			content += `<br><small>💵 Amount: ${req.amount} ${req.token}</small>`;
			if (req.seller) {
				content += `<br><small>🔗 Seller: ${truncateHash(req.seller)}</small>`;
			}
		}
	}
	
	eventEl.innerHTML = content;
	eventsDiv.appendChild(eventEl);
	scrollToBottom();
}

// Display signing event
function displaySigning(event) {
	const eventsDiv = document.getElementById('events');
	const eventEl = document.createElement('div');
	eventEl.className = 'event signing';
	
	let content = `<strong>🔐 Signing:</strong> ${event.message}`;
	content += `<br><small>Signer: ${event.signer}</small>`;
	
	if (event.data) {
		content += `<pre>${JSON.stringify(event.data, null, 2)}</pre>`;
	}
	
	eventEl.innerHTML = content;
	eventsDiv.appendChild(eventEl);
	scrollToBottom();
}

// Display transaction (with emojis)
function displayTransaction(event) {
	const eventsDiv = document.getElementById('events');
	
	// Check if transaction event already exists (for updates)
	const existingTx = Array.from(eventsDiv.children).find(
		el => el.dataset.txHash === event.hash
	);
	
	const statusEmoji = event.status === 'pending' ? '⏳' : '✅';
	const statusText = event.status === 'pending' ? 'Pending...' : 'Confirmed';
	
	let content = `<strong>📡 Tx:</strong> <a href="${event.explorer}" target="_blank">${truncateHash(event.hash)}</a>`;
	content += ` <span class="status-${event.status}">${statusEmoji} ${statusText}</span>`;
	if (event.gasUsed) {
		content += `<br><small>⛽ Gas used: ${formatNumber(event.gasUsed)}</small>`;
	}
	
	if (existingTx) {
		// Update existing transaction status
		existingTx.innerHTML = content;
	} else {
		// Create new transaction event
		const eventEl = document.createElement('div');
		eventEl.className = 'event transaction';
		eventEl.dataset.txHash = event.hash;
		eventEl.innerHTML = content;
		eventsDiv.appendChild(eventEl);
	}
	
	scrollToBottom();
}

// Display completion
function displayComplete(event) {
	const eventsDiv = document.getElementById('events');
	const eventEl = document.createElement('div');
	eventEl.className = 'event complete';
	
	eventEl.innerHTML = `<strong>🎉 Complete!</strong> Payment flow finished successfully`;
	
	if (event.metrics && event.metrics.totalTime) {
		eventEl.innerHTML += `<br><small>Total time: ${event.metrics.totalTime}</small>`;
	}
	
	eventsDiv.appendChild(eventEl);
	scrollToBottom();
	
	// Show metrics in control panel
	showMetrics(event.metrics);
	
	// Re-enable run button
	const runBtn = document.getElementById('run-btn');
	runBtn.disabled = false;
	runBtn.classList.remove('loading');
	isRunning = false;
}

// Display error
function displayError(event) {
	const eventsDiv = document.getElementById('events');
	const eventEl = document.createElement('div');
	eventEl.className = 'event error';
	
	eventEl.innerHTML = `<strong>✗ Error:</strong> ${event.message}`;
	
	eventsDiv.appendChild(eventEl);
	scrollToBottom();
	
	// Re-enable run button
	const runBtn = document.getElementById('run-btn');
	runBtn.disabled = false;
	runBtn.classList.remove('loading');
	isRunning = false;
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

// Clear events
function clearEvents() {
	const eventsDiv = document.getElementById('events');
	eventsDiv.innerHTML = '';
	
	const metricsDiv = document.getElementById('metrics');
	metricsDiv.style.display = 'none';
}

// Run demo flow
async function runDemoFlow() {
	if (isRunning) return;
	
	isRunning = true;
	const runBtn = document.getElementById('run-btn');
	runBtn.disabled = true;
	runBtn.classList.add('loading');
	
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
		
		runBtn.disabled = false;
		runBtn.classList.remove('loading');
		isRunning = false;
	}
}

// Update scheme info in control panel
function updateSchemeInfo(scheme) {
	const infoDiv = document.getElementById('scheme-info');
	const schemeData = SCHEME_INFO[scheme];
	
	if (!schemeData) return;
	
	let html = `<h3>${schemeData.title}</h3>`;
	html += `<p class="scheme-desc">${schemeData.description}</p>`;
	
	if (schemeData.badges && schemeData.badges.length > 0) {
		html += '<div class="metrics-badges">';
		schemeData.badges.forEach(badge => {
			html += `<span class="badge">${badge}</span>`;
		});
		html += '</div>';
	}
	
	infoDiv.innerHTML = html;
}

// Helper functions
function scrollToBottom() {
	const eventsDiv = document.getElementById('events');
	eventsDiv.scrollTop = eventsDiv.scrollHeight;
}

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
	
	// Run button
	document.getElementById('run-btn').addEventListener('click', runDemoFlow);
	
	// Scheme tabs
	document.querySelectorAll('.tab:not(.disabled)').forEach(tab => {
		tab.addEventListener('click', () => {
			// Update active tab
			document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
			tab.classList.add('active');
			
			// Update current scheme
			currentScheme = tab.dataset.scheme;
			
			// Update scheme info
			updateSchemeInfo(currentScheme);
			
			// Clear events
			clearEvents();
		});
	});
	
	// Initialize with exact scheme
	updateSchemeInfo('exact');
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

