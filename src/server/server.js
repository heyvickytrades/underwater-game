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
const MOVE_SPEED = 10; // Should match client move speed

// Track player positions, velocities, and their current chunks
const playerPositions = new Map(); // Map of client ID to {x, y, z} position
const playerVelocities = new Map(); // Map of client ID to {x, y, z} velocity
const playerChunks = new Map(); // Map of client ID to {x, z} chunk coordinates
const playerKeys = new Map(); // Map of client ID to key states {ArrowUp, ArrowDown, ArrowLeft, ArrowRight}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    // Assign a unique ID to the client
    const clientId = nextClientId++;
    clients.set(ws, clientId);
    
    // Initialize player position at origin
    playerPositions.set(clientId, { x: 0, y: 0, z: 0 });
    playerVelocities.set(clientId, { x: 0, y: 0, z: 0 });
    playerChunks.set(clientId, { x: 0, z: 0 });
    playerKeys.set(clientId, { 
        ArrowUp: false, 
        ArrowDown: false, 
        ArrowLeft: false, 
        ArrowRight: false 
    });
    
    console.log(`Client ${clientId} connected`);

    // Handle WebSocket messages
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log(`Received from client ${clientId}:`, parsedMessage);
            
            // Handle key press messages
            if (parsedMessage.type === 'keyPress') {
                const keyState = playerKeys.get(clientId);
                if (keyState && parsedMessage.key in keyState) {
                    keyState[parsedMessage.key] = parsedMessage.pressed;
                    // No need to send a response, this will be reflected in the next game state update
                }
            }
            
            // Handle player movement messages
            else if (parsedMessage.type === 'movement') {
                // Update player position and velocity
                playerPositions.set(clientId, parsedMessage.position);
                if (parsedMessage.velocity) {
                    playerVelocities.set(clientId, parsedMessage.velocity);
                }
                
                // Calculate chunk coordinates
                const position = parsedMessage.position;
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
        playerVelocities.delete(clientId);
        playerChunks.delete(clientId);
        playerKeys.delete(clientId);
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

// Process player movement based on key states
function updatePlayerPositions() {
    for (const [clientId, keyState] of playerKeys.entries()) {
        // Get current position
        const position = playerPositions.get(clientId);
        if (!position) continue;
        
        // Get or initialize velocity
        let velocity = playerVelocities.get(clientId) || { x: 0, y: 0, z: 0 };
        
        // Apply movement based on keys
        velocity.x = 0;
        velocity.z = 0;
        
        if (keyState.ArrowUp) velocity.z = -MOVE_SPEED;
        if (keyState.ArrowDown) velocity.z = MOVE_SPEED;
        if (keyState.ArrowLeft) velocity.x = -MOVE_SPEED;
        if (keyState.ArrowRight) velocity.x = MOVE_SPEED;
        
        // Apply damping (simulate water resistance)
        const damping = 0.9;
        velocity.x *= damping;
        velocity.z *= damping;
        
        // Update position based on velocity
        position.x += velocity.x * 0.1; // Scale by time factor (0.1 seconds)
        position.z += velocity.z * 0.1;
        
        // Update stored values
        playerPositions.set(clientId, position);
        playerVelocities.set(clientId, velocity);
    }
}

// Game loop - runs every 100ms
const gameLoop = setInterval(() => {
    // Update player positions based on key states
    updatePlayerPositions();
    
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