#!/bin/bash

# Test script to verify demo UI can start successfully
# This doesn't run a full flow, just checks that the server starts

echo "🧪 Testing x402 Demo UI Startup..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "   Copy example.env to .env and configure it"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "⚠️  node_modules not found, running npm install..."
    npm install
fi

# Check if ws is installed
if ! grep -q '"ws"' package.json; then
    echo "❌ Error: ws package not found in package.json"
    exit 1
fi

echo "✅ Dependencies verified"
echo ""
echo "📦 Starting demo server..."
echo "   (Will auto-close after 5 seconds for testing)"
echo ""

# Start server in background
timeout 5s npm run demo:ui &
SERVER_PID=$!

# Wait a bit for server to start
sleep 2

# Check if server is running
if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "✅ Demo server started successfully!"
    echo ""
    echo "🌐 Server would be available at: http://localhost:3000"
    echo ""
    
    # Try to connect to check if port is open
    if command -v curl &> /dev/null; then
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            echo "✅ Health endpoint responding"
        else
            echo "⚠️  Health endpoint not responding yet (may need more time)"
        fi
    fi
    
    # Kill the server
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
    
    echo ""
    echo "✅ Startup test passed!"
    echo ""
    echo "To run the demo:"
    echo "  npm run demo:ui"
    echo ""
    exit 0
else
    echo "❌ Server failed to start"
    echo "   Check the error messages above"
    exit 1
fi

