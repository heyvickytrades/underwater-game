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

// Game world constants
const CHUNK_SIZE = 16;

// Track player positions and their current chunks
const playerPositions = new Map(); // Map of client ID to {x, y, z} position
const playerChunks = new Map(); // Map of client ID to {x, z} chunk coordinates

// Handle WebSocket connections
wss.on('connection', (ws) => {
    // Assign a unique ID to the client
    const clientId = nextClientId++;
    clients.set(ws, clientId);
    
    // Initialize player position at origin
    playerPositions.set(clientId, { x: 0, y: 0, z: 0 });
    playerChunks.set(clientId, { x: 0, z: 0 });
    
    console.log(`Client ${clientId} connected`);

    // Handle WebSocket messages
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log(`Received from client ${clientId}:`, parsedMessage);
            
            // Handle player movement messages
            if (parsedMessage.type === 'movement') {
                // Update player position
                const position = parsedMessage.position;
                playerPositions.set(clientId, position);
                
                // Calculate chunk coordinates
                const chunkX = Math.floor(position.x / CHUNK_SIZE);
                const chunkZ = Math.floor(position.z / CHUNK_SIZE);
                
                // Check if player moved to a new chunk
                const currentChunk = playerChunks.get(clientId);
                if (chunkX !== currentChunk.x || chunkZ !== currentChunk.z) {
                    // Update player's chunk
                    playerChunks.set(clientId, { x: chunkX, z: chunkZ });
                    
                    // Notify client about chunk change
                    ws.send(JSON.stringify({
                        type: 'chunkUpdate',
                        chunkX: chunkX,
                        chunkZ: chunkZ
                    }));
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    // Handle WebSocket disconnections
    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected`);
        clients.delete(ws);
        playerPositions.delete(clientId);
        playerChunks.delete(clientId);
    });
    
    // Send welcome message with client ID
    ws.send(JSON.stringify({
        type: 'welcome',
        id: clientId
    }));
});

// Game state (will be expanded in future steps)
const gameState = {
    timestamp: Date.now(),
    players: {} // Will contain player positions for broadcasting
};

// Game loop - runs every 100ms
const gameLoop = setInterval(() => {
    // Update game state
    gameState.timestamp = Date.now();
    
    // Update player positions in game state
    gameState.players = {};
    for (const [clientId, position] of playerPositions.entries()) {
        gameState.players[clientId] = position;
    }
    
    // Log a simple message to show game loop is working
    console.log(`Game loop tick at ${new Date().toISOString()}`);
    
    // Broadcast the updated state to all clients
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