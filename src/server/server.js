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
const FISH_PER_CHUNK = 5; // Number of fish to spawn per chunk
let nextFishId = 0;

// Track player positions, velocities, and their current chunks
const playerPositions = new Map(); // Map of client ID to {x, y, z} position
const playerVelocities = new Map(); // Map of client ID to {x, y, z} velocity
const playerChunks = new Map(); // Map of client ID to {x, z} chunk coordinates
const playerKeys = new Map(); // Map of client ID to key states {ArrowUp, ArrowDown, ArrowLeft, ArrowRight}

// Track fish entities
const fishEntities = new Map(); // Map of fish ID to fish data {id, chunkX, chunkZ, position, velocity}
const loadedChunks = new Set(); // Set of loaded chunk keys in the format "x,z"

// Handle WebSocket connections
wss.on('connection', (ws) => {
    // Assign a unique ID to the client
    const clientId = nextClientId++;
    clients.set(ws, clientId);
    
    // Set player's initial position and chunk
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
    
    // Spawn initial fish in the area around the starting position (5x5 grid)
    const startingChunkX = 0;
    const startingChunkZ = 0;
    
    // Check if we need to load new chunks (and spawn fish) for starting area
    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            const newChunkX = startingChunkX + dx;
            const newChunkZ = startingChunkZ + dz;
            const chunkKey = `${newChunkX},${newChunkZ}`;
            
            // If this chunk is not already loaded, spawn fish for it
            if (!loadedChunks.has(chunkKey)) {
                loadedChunks.add(chunkKey);
                spawnFishForChunk(newChunkX, newChunkZ);
            }
        }
    }
    
    // Handle messages from the client
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
                    
                    // Check if we need to load new chunks (and spawn fish)
                    for (let dx = -2; dx <= 2; dx++) {
                        for (let dz = -2; dz <= 2; dz++) {
                            const newChunkX = chunkX + dx;
                            const newChunkZ = chunkZ + dz;
                            const chunkKey = `${newChunkX},${newChunkZ}`;
                            
                            // If this chunk is not already loaded, spawn fish for it
                            if (!loadedChunks.has(chunkKey)) {
                                loadedChunks.add(chunkKey);
                                spawnFishForChunk(newChunkX, newChunkZ);
                            }
                        }
                    }
                    
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
    
    // Send current fish data
    const fishData = {};
    for (const [fishId, fish] of fishEntities.entries()) {
        fishData[fishId] = fish;
    }
    if (Object.keys(fishData).length > 0) {
        ws.send(JSON.stringify({
            type: 'fishInit',
            fish: fishData
        }));
    }
});

// Spawn fish for a given chunk
function spawnFishForChunk(chunkX, chunkZ) {
    console.log(`Spawning fish for chunk ${chunkX},${chunkZ}`);
    
    // Reduce the number of fish per chunk to 10% of previous amount
    const fishPerChunk = 1; // Reduced from 15 to 1 (about 10% of original)
    
    // Spawn fishPerChunk fish in random positions within the chunk
    for (let i = 0; i < fishPerChunk; i++) {
        const fishId = nextFishId++;
        
        // Random position within the chunk
        const x = chunkX * CHUNK_SIZE + Math.random() * CHUNK_SIZE;
        const y = -3 + Math.random() * 2; // Random height between -3 and -1
        const z = chunkZ * CHUNK_SIZE + Math.random() * CHUNK_SIZE;
        
        // Generate random initial velocity
        const vx = (Math.random() * 2 - 1) * 2; // Random velocity between -2 and 2
        const vy = (Math.random() * 2 - 1) * 0.5; // Smaller vertical movement
        const vz = (Math.random() * 2 - 1) * 2; // Random velocity between -2 and 2
        
        // Create fish entity
        const fish = {
            id: fishId,
            chunkX: chunkX,
            chunkZ: chunkZ,
            position: { x, y, z },
            velocity: { x: vx, y: vy, z: vz },
            lastDirectionChange: Date.now()
        };
        
        // Add to fish entities map
        fishEntities.set(fishId, fish);
        
        // Broadcast fish creation to all clients
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'fishSpawn',
                    fish: fish
                }));
            }
        });
    }
}

// Update fish positions with simple AI behavior
function updateFishPositions() {
    const now = Date.now();
    
    for (const [fishId, fish] of fishEntities.entries()) {
        // Change direction randomly every ~3 seconds
        if (now - fish.lastDirectionChange > 3000 || Math.random() < 0.01) {
            fish.velocity = {
                x: (Math.random() * 2 - 1) * 2, // Random velocity between -2 and 2
                y: (Math.random() * 2 - 1) * 0.5, // Smaller vertical movement
                z: (Math.random() * 2 - 1) * 2
            };
            fish.lastDirectionChange = now;
        }
        
        // Update position based on velocity
        fish.position.x += fish.velocity.x * 0.02; // Scale by time factor
        fish.position.y += fish.velocity.y * 0.02;
        fish.position.z += fish.velocity.z * 0.02;
        
        // Keep fish within their chunk boundaries (with some margin)
        const chunkMinX = fish.chunkX * CHUNK_SIZE + 2;
        const chunkMaxX = (fish.chunkX + 1) * CHUNK_SIZE - 2;
        const chunkMinZ = fish.chunkZ * CHUNK_SIZE + 2;
        const chunkMaxZ = (fish.chunkZ + 1) * CHUNK_SIZE - 2;
        
        // Keep the fish within vertical boundaries
        const minY = -4.5;
        const maxY = -1;
        
        // If fish is trying to leave the chunk, reverse its direction
        if (fish.position.x < chunkMinX || fish.position.x > chunkMaxX) {
            fish.velocity.x *= -1;
            fish.position.x = Math.max(chunkMinX, Math.min(chunkMaxX, fish.position.x));
        }
        
        if (fish.position.z < chunkMinZ || fish.position.z > chunkMaxZ) {
            fish.velocity.z *= -1;
            fish.position.z = Math.max(chunkMinZ, Math.min(chunkMaxZ, fish.position.z));
        }
        
        if (fish.position.y < minY || fish.position.y > maxY) {
            fish.velocity.y *= -1;
            fish.position.y = Math.max(minY, Math.min(maxY, fish.position.y));
        }
    }
}

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

// Game state (will be expanded in future steps)
const gameState = {
    timestamp: Date.now(),
    players: {}, // Will contain player positions for broadcasting
    fish: {} // Will contain fish positions for broadcasting
};

// Game loop - runs every 100ms
const gameLoop = setInterval(() => {
    // Update player positions based on key states
    updatePlayerPositions();
    
    // Update fish positions with AI movement
    updateFishPositions();
    
    // Update game state
    gameState.timestamp = Date.now();
    
    // Update player positions in game state
    gameState.players = {};
    for (const [clientId, position] of playerPositions.entries()) {
        gameState.players[clientId] = position;
    }
    
    // Update fish positions in game state
    gameState.fish = {};
    for (const [fishId, fish] of fishEntities.entries()) {
        gameState.fish[fishId] = {
            id: fish.id,
            position: fish.position,
            velocity: fish.velocity,
            chunkX: fish.chunkX,
            chunkZ: fish.chunkZ
        };
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