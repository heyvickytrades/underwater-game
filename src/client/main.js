// Underwater Odyssey - Client-Side Main Script
console.log('Underwater Odyssey client loaded!');

// ThreeJS variables
let scene, camera, renderer;
let player, playerBody;
let physicsWorld;
let lastTime = 0;
const fixedTimeStep = 1.0 / 60.0; // 60 fps physics

// WebSocket setup
let socket;
let clientId = null;

// Chunk system variables
const CHUNK_SIZE = 16; // Size of each chunk in world units
const LOAD_RADIUS = 2; // Number of chunks to load in each direction
const loadedChunks = new Map(); // Map of loaded chunks, key is "x,z" string
let currentPlayerChunk = { x: 0, z: 0 }; // Current chunk the player is in

// Other players' representations (will be created as needed)
const otherPlayers = new Map(); // Map of clientId to player mesh

// Initialize ThreeJS and Cannon.js
function initializeGame() {
    try {
        console.log('Starting game initialization...');
        
        // Verify libraries are loaded
        if (typeof THREE === 'undefined') {
            throw new Error('THREE is not defined! Make sure Three.js is loaded properly.');
        }
        
        if (typeof CANNON === 'undefined') {
            throw new Error('CANNON is not defined! Make sure Cannon.js is loaded properly.');
        }
        
        console.log('Libraries loaded successfully');
        
        // Create ThreeJS scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a121f); // Dark blue background for underwater effect

        // Create camera
        const aspectRatio = window.innerWidth / window.innerHeight;
        camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.1, 1000);
        camera.position.set(0, 5, 10); // Position slightly above and behind origin
        camera.lookAt(0, 0, 0);

        // Create renderer
        renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
        scene.add(ambientLight);

        // Add directional light for better visibility
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 10, 5);
        scene.add(directionalLight);

        // Initialize Cannon.js physics world
        physicsWorld = new CANNON.World();
        physicsWorld.gravity.set(0, 0, 0); // Zero gravity for underwater environment
        physicsWorld.defaultContactMaterial.friction = 0.0;
        physicsWorld.defaultContactMaterial.restitution = 0.3; // Slight bounciness

        // Create player model (a green cube)
        const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
        const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Green color
        player = new THREE.Mesh(playerGeometry, playerMaterial);
        scene.add(player);

        // Create player physics body
        const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)); // Half-extents
        playerBody = new CANNON.Body({
            mass: 5, // Mass for physics interactions
            position: new CANNON.Vec3(0, 0, 0)
        });
        playerBody.addShape(playerShape);
        playerBody.linearDamping = 0.9; // High damping for underwater effect
        physicsWorld.addBody(playerBody);

        // Add underwater grid for reference (ocean floor)
        const gridHelper = new THREE.GridHelper(50, 50, 0x0088ff, 0x0044aa);
        gridHelper.position.y = -5;
        scene.add(gridHelper);

        // Set up keyboard controls for movement
        setupKeyboardControls();

        // Handle window resize
        window.addEventListener('resize', onWindowResize);

        // Initialize the first chunks
        updateChunks();

        // Hide loading screen
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }

        // Start animation loop
        animate(0);
        
        console.log('Game initialization complete');
        return true;
    } catch (error) {
        console.error('Game initialization failed:', error);
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
            errorMessage.textContent = 'Error initializing game: ' + error.message;
        }
        return false;
    }
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate(time) {
    requestAnimationFrame(animate);
    
    // Calculate time delta for physics
    const deltaTime = (time - lastTime) / 1000;
    lastTime = time;
    
    // Update physics world
    physicsWorld.step(fixedTimeStep, deltaTime, 3);
    
    // Update player mesh position from physics body
    player.position.copy(playerBody.position);
    player.quaternion.copy(playerBody.quaternion);
    
    // Check if player has moved to a new chunk
    const playerChunkX = Math.floor(player.position.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.position.z / CHUNK_SIZE);
    
    if (playerChunkX !== currentPlayerChunk.x || playerChunkZ !== currentPlayerChunk.z) {
        currentPlayerChunk.x = playerChunkX;
        currentPlayerChunk.z = playerChunkZ;
        updateChunks();
    }
    
    // Send position update to server (throttled to every 10 frames to reduce network traffic)
    if (time % 10 < 1 && socket && socket.readyState === WebSocket.OPEN) {
        sendPositionUpdate();
    }
    
    // Render scene
    renderer.render(scene, camera);
}

// Send player position update to server
function sendPositionUpdate() {
    const positionMessage = {
        type: 'movement',
        position: {
            x: player.position.x,
            y: player.position.y,
            z: player.position.z
        }
    };
    
    socket.send(JSON.stringify(positionMessage));
}

// Connect to WebSocket server
function connectToServer() {
    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;
    
    console.log(`Connecting to WebSocket server at ${wsUrl}`);
    
    // Create WebSocket connection
    socket = new WebSocket(wsUrl);
    
    // Connection opened
    socket.addEventListener('open', (event) => {
        console.log('Connected to WebSocket server');
        
        // Send a test message to the server
        sendMessage('Hello from client!');
    });
    
    // Listen for messages
    socket.addEventListener('message', (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Message from server:', message);
            
            // Handle welcome message with client ID
            if (message.type === 'welcome') {
                clientId = message.id;
                console.log(`Assigned client ID: ${clientId}`);
            }
            
            // Handle game state updates
            if (message.type === 'gameState') {
                // Update player positions from server data
                updatePlayerPositions(message.data.players);
            }
            
            // Handle chunk updates from server
            if (message.type === 'chunkUpdate') {
                console.log(`Server confirmed chunk update to: ${message.chunkX}, ${message.chunkZ}`);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    // Connection closed
    socket.addEventListener('close', (event) => {
        console.log('Disconnected from server');
        
        // Try to reconnect after a delay
        setTimeout(connectToServer, 3000);
    });
    
    // Connection error
    socket.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
    });
}

// Helper function to send messages to the server
function sendMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        // For structured messages, we can use objects
        const messageObj = {
            type: 'message',
            content: message,
            timestamp: Date.now()
        };
        
        socket.send(JSON.stringify(messageObj));
    } else {
        console.warn('Cannot send message, WebSocket is not connected');
    }
}

// Setup keyboard controls for player movement
function setupKeyboardControls() {
    const keys = {
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false
    };
    
    const moveSpeed = 10; // Movement speed
    
    // Track key presses
    window.addEventListener('keydown', (event) => {
        if (keys.hasOwnProperty(event.key)) {
            keys[event.key] = true;
        }
    });
    
    window.addEventListener('keyup', (event) => {
        if (keys.hasOwnProperty(event.key)) {
            keys[event.key] = false;
        }
    });
    
    // Apply forces based on key presses
    function updateMovement() {
        // Reset velocity first
        playerBody.velocity.set(0, 0, 0);
        
        // Forward/backward movement
        if (keys.ArrowUp) {
            playerBody.velocity.z = -moveSpeed;
        } else if (keys.ArrowDown) {
            playerBody.velocity.z = moveSpeed;
        }
        
        // Left/right movement
        if (keys.ArrowLeft) {
            playerBody.velocity.x = -moveSpeed;
        } else if (keys.ArrowRight) {
            playerBody.velocity.x = moveSpeed;
        }
        
        requestAnimationFrame(updateMovement);
    }
    
    // Start the movement update loop
    updateMovement();
}

// Perlin noise implementation (simplified for this context)
// This is a basic implementation that provides a deterministic noise function
function noise(x, z) {
    // Simple hash function for pseudo-random values
    function hash(x) {
        x = ((x >> 16) ^ x) * 0x45d9f3b;
        x = ((x >> 16) ^ x) * 0x45d9f3b;
        x = (x >> 16) ^ x;
        return x;
    }
    
    // Generate 2D noise
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    
    // Hash coordinates for corners
    const h00 = hash(xi + hash(zi)) % 1000 / 1000;
    const h01 = hash(xi + hash(zi + 1)) % 1000 / 1000;
    const h10 = hash((xi + 1) + hash(zi)) % 1000 / 1000;
    const h11 = hash((xi + 1) + hash(zi + 1)) % 1000 / 1000;
    
    // Smoothing function
    const sx = 3 * Math.pow(xf, 2) - 2 * Math.pow(xf, 3);
    const sz = 3 * Math.pow(zf, 2) - 2 * Math.pow(zf, 3);
    
    // Interpolate
    const v1 = h00 + sx * (h10 - h00);
    const v2 = h01 + sx * (h11 - h01);
    return v1 + sz * (v2 - v1);
}

// Create a single chunk at the specified chunk coordinates
function createChunk(chunkX, chunkZ) {
    const chunkGroup = new THREE.Group();
    chunkGroup.name = `chunk_${chunkX}_${chunkZ}`;
    
    const coralGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const coralMaterial = new THREE.MeshStandardMaterial({ color: 0x00aa44 }); // Coral green color
    
    // Calculate the world coordinates of the chunk origin
    const worldX = chunkX * CHUNK_SIZE;
    const worldZ = chunkZ * CHUNK_SIZE;
    
    // Place corals based on noise
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            // Sample noise at this position (using multiple octaves for more natural look)
            const noiseValue = 
                noise((worldX + x) * 0.1, (worldZ + z) * 0.1) * 0.5 + 
                noise((worldX + x) * 0.2, (worldZ + z) * 0.2) * 0.3 + 
                noise((worldX + x) * 0.4, (worldZ + z) * 0.4) * 0.2;
            
            // Use the noise value to determine if we should place a coral
            if (noiseValue > 0.7) { // Only place corals above this threshold
                const coral = new THREE.Mesh(coralGeometry, coralMaterial);
                
                // Position the coral with some random variation in height
                coral.position.set(
                    worldX + x + (Math.random() * 0.5 - 0.25), 
                    -5 + (noiseValue - 0.7) * 3,  // Height based on noise value
                    worldZ + z + (Math.random() * 0.5 - 0.25)
                );
                
                // Slightly randomize scale for variety
                const scale = 0.8 + Math.random() * 0.4;
                coral.scale.set(scale, scale, scale);
                
                // Randomly rotate for more natural look
                coral.rotation.y = Math.random() * Math.PI * 2;
                
                chunkGroup.add(coral);
            }
        }
    }
    
    scene.add(chunkGroup);
    return chunkGroup;
}

// Update loaded chunks based on player position
function updateChunks() {
    console.log(`Updating chunks for player position: ${player.position.x}, ${player.position.z}`);
    
    // Determine which chunks should be loaded
    const chunksToLoad = new Set();
    
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
            const chunkX = currentPlayerChunk.x + dx;
            const chunkZ = currentPlayerChunk.z + dz;
            const chunkKey = `${chunkX},${chunkZ}`;
            
            chunksToLoad.add(chunkKey);
            
            // If chunk isn't already loaded, create it
            if (!loadedChunks.has(chunkKey)) {
                console.log(`Loading chunk ${chunkKey}`);
                loadedChunks.set(chunkKey, createChunk(chunkX, chunkZ));
            }
        }
    }
    
    // Unload chunks that are too far away
    for (const [chunkKey, chunkGroup] of loadedChunks.entries()) {
        if (!chunksToLoad.has(chunkKey)) {
            console.log(`Unloading chunk ${chunkKey}`);
            scene.remove(chunkGroup);
            loadedChunks.delete(chunkKey);
        }
    }
}

// Update positions of other players based on server data
function updatePlayerPositions(players) {
    // Skip if there's no player data
    if (!players) return;
    
    // Loop through all players from server data
    for (const [playerId, position] of Object.entries(players)) {
        // Skip our own player
        if (playerId == clientId) continue;
        
        // If we don't have a mesh for this player yet, create one
        if (!otherPlayers.has(playerId)) {
            const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
            const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Same green color
            const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
            scene.add(playerMesh);
            otherPlayers.set(playerId, playerMesh);
        }
        
        // Update the player's position
        const playerMesh = otherPlayers.get(playerId);
        playerMesh.position.set(position.x, position.y, position.z);
    }
    
    // Remove players that are no longer in the game
    for (const [playerId, playerMesh] of otherPlayers.entries()) {
        if (!players[playerId]) {
            scene.remove(playerMesh);
            otherPlayers.delete(playerId);
        }
    }
}

// Wait for both the DOM and libraries to be ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded, setting up game');
    
    // Make sure THREE and CANNON are globally available
    if (typeof THREE === 'undefined' || typeof CANNON === 'undefined') {
        console.error('Libraries not loaded yet. Wait for them to load.');
        document.getElementById('errorMessage').textContent = 
            typeof THREE === 'undefined' ? 'Waiting for Three.js to load...' : 'Waiting for Cannon.js to load...';
            
        // Check again after a short delay
        const checkLibraries = setInterval(() => {
            if (typeof THREE !== 'undefined' && typeof CANNON !== 'undefined') {
                console.log('Libraries now available!');
                clearInterval(checkLibraries);
                setupGame();
            }
        }, 500);
    } else {
        // Libraries already available
        setupGame();
    }
});

// Setup game after libraries are loaded
function setupGame() {
    // Connect to the server
    connectToServer();
    
    // Add status indicator
    const statusIndicator = document.createElement('div');
    statusIndicator.style.position = 'absolute';
    statusIndicator.style.bottom = '10px';
    statusIndicator.style.left = '10px';
    statusIndicator.style.padding = '5px 10px';
    statusIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    statusIndicator.style.color = 'white';
    statusIndicator.style.fontFamily = 'Arial, sans-serif';
    statusIndicator.style.fontSize = '12px';
    statusIndicator.style.borderRadius = '3px';
    statusIndicator.style.zIndex = '1000';
    statusIndicator.textContent = 'Connecting...';
    document.body.appendChild(statusIndicator);
    
    // Update status indicator when connection status changes
    socket.addEventListener('open', () => {
        statusIndicator.textContent = 'Connected';
        statusIndicator.style.backgroundColor = 'rgba(0, 128, 0, 0.5)';
        
        // Initialize the game once connected
        document.getElementById('startButton').style.display = 'block';
        document.getElementById('startButton').addEventListener('click', () => {
            if (initializeGame()) {
                // If game initialized successfully, hide the button
                document.getElementById('startButton').style.display = 'none';
            }
        });
    });
    
    socket.addEventListener('close', () => {
        statusIndicator.textContent = 'Disconnected';
        statusIndicator.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
    });
    
    // Add test button to send messages
    const testButton = document.createElement('button');
    testButton.textContent = 'Send Test Message';
    testButton.style.position = 'absolute';
    testButton.style.bottom = '10px';
    testButton.style.right = '10px';
    testButton.style.padding = '5px 10px';
    testButton.style.backgroundColor = '#0088ff';
    testButton.style.color = 'white';
    testButton.style.border = 'none';
    testButton.style.borderRadius = '3px';
    testButton.style.fontFamily = 'Arial, sans-serif';
    testButton.style.fontSize = '12px';
    testButton.style.cursor = 'pointer';
    testButton.style.zIndex = '1000';
    
    testButton.addEventListener('click', () => {
        sendMessage('Test button clicked!');
    });
    
    document.body.appendChild(testButton);
} 