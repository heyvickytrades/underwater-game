// Underwater Odyssey - Server-Side Script
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client')));

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Track connected clients with their IDs
const clients = new Map();
let nextClientId = 0;

// Handle WebSocket connections
wss.on('connection', (ws) => {
    // Assign a unique ID to the client
    const clientId = nextClientId++;
    clients.set(ws, clientId);
    
    console.log(`Client ${clientId} connected`);

    // Handle WebSocket messages
    ws.on('message', (message) => {
        console.log(`Received from client ${clientId}: ${message}`);
        
        // Here we would process game-related messages
        // For now, we're just logging them
    });

    // Handle WebSocket disconnections
    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected`);
        clients.delete(ws);
    });
    
    // Send welcome message with client ID
    ws.send(JSON.stringify({
        type: 'welcome',
        id: clientId
    }));
});

// Game state (will be expanded in future steps)
const gameState = {
    timestamp: Date.now()
};

// Game loop - runs every 100ms
const gameLoop = setInterval(() => {
    // Update game state
    gameState.timestamp = Date.now();
    
    // Log a simple message to show game loop is working
    console.log(`Game loop tick at ${new Date().toISOString()}`);
    
    // In future steps, we would:
    // 1. Update positions of game entities
    // 2. Handle game logic
    // 3. Broadcast the updated state to all clients
    
    // For now, just broadcast a simple update to all connected clients
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'gameState',
                data: gameState
            }));
        }
    });
}, 100);

// Cleanup on server shutdown
process.on('SIGINT', () => {
    clearInterval(gameLoop);
    process.exit();
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}); 