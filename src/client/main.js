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

// Fish entities 
const fishEntities = new Map(); // Map of fishId to fish data and mesh
const fishChunkGroups = new Map(); // Map of "chunkX,chunkZ" keys to THREE.Group objects for fish

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
        // Position the camera to see the player clearly - higher and further back
        camera.position.set(0, 10, 15);
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
        
        // Add some ambient objects to make the scene more visible
        const seaFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshStandardMaterial({ color: 0x004466 })
        );
        seaFloor.rotation.x = -Math.PI / 2;
        seaFloor.position.y = -5.1;
        scene.add(seaFloor);

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

        // Add debug position display
        const debugInfo = document.createElement('div');
        debugInfo.id = 'debugInfo';
        debugInfo.style.position = 'absolute';
        debugInfo.style.top = '10px';
        debugInfo.style.left = '10px';
        debugInfo.style.padding = '5px 10px';
        debugInfo.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        debugInfo.style.color = 'white';
        debugInfo.style.fontFamily = 'Arial, sans-serif';
        debugInfo.style.fontSize = '12px';
        debugInfo.style.borderRadius = '3px';
        debugInfo.style.zIndex = '1000';
        debugInfo.textContent = 'Position: 0, 0, 0';
        document.body.appendChild(debugInfo);

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
    try {
        requestAnimationFrame(animate);
        
        // Skip animation if player or scene isn't initialized yet
        if (!player || !scene || !camera || !renderer) {
            console.warn("Animation loop running but game objects not initialized yet");
            return;
        }
        
        // Calculate time delta for physics
        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;
        
        // Update physics world
        physicsWorld.step(fixedTimeStep, deltaTime, 3);
        
        // Update player mesh position from physics body
        player.position.copy(playerBody.position);
        player.quaternion.copy(playerBody.quaternion);
        
        // Log player position occasionally (every 100 frames)
        if (Math.floor(time / 1000) % 5 === 0 && Math.floor(time * 10) % 10 === 0) {
            console.log(`Player position: x=${player.position.x.toFixed(2)}, y=${player.position.y.toFixed(2)}, z=${player.position.z.toFixed(2)}`);
            console.log(`Camera position: x=${camera.position.x.toFixed(2)}, y=${camera.position.y.toFixed(2)}, z=${camera.position.z.toFixed(2)}`);
        }
        
        // Update debug position display
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo) {
            debugInfo.textContent = `Position: x=${player.position.x.toFixed(2)}, y=${player.position.y.toFixed(2)}, z=${player.position.z.toFixed(2)}`;
        }
        
        // Check if player has moved to a new chunk
        const playerChunkX = Math.floor(player.position.x / CHUNK_SIZE);
        const playerChunkZ = Math.floor(player.position.z / CHUNK_SIZE);
        
        if (playerChunkX !== currentPlayerChunk.x || playerChunkZ !== currentPlayerChunk.z) {
            currentPlayerChunk.x = playerChunkX;
            currentPlayerChunk.z = playerChunkZ;
            updateChunks();
        }
        
        // Periodically check for fish that should be removed (every second based on animation time)
        if (Math.floor(time) % 1000 < 20) {
            cleanupOutOfRangeFish();
        }
        
        // Send position update to server (throttled to every 10 frames to reduce network traffic)
        if (time % 10 < 1 && socket && socket.readyState === WebSocket.OPEN) {
            sendPositionUpdate();
        }
        
        // Render scene
        renderer.render(scene, camera);
    } catch (error) {
        console.error("Error in animation loop:", error);
    }
}

// Send player position update to server
function sendPositionUpdate() {
    // Only send if we have a valid socket connection and player exists
    if (socket && socket.readyState === WebSocket.OPEN && player) {
        const positionMessage = {
            type: 'movement',
            position: {
                x: player.position.x,
                y: player.position.y,
                z: player.position.z
            },
            velocity: {
                x: playerBody.velocity.x,
                y: playerBody.velocity.y,
                z: playerBody.velocity.z
            }
        };
        
        socket.send(JSON.stringify(positionMessage));
    }
    
    // Schedule the next update
    setTimeout(sendPositionUpdate, 50); // Send position updates 20 times per second
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
        document.getElementById('connectionStatus').textContent = 'Connected';
        document.getElementById('connectionStatus').style.color = 'green';
        
        // Start sending position updates
        sendPositionUpdate();
    });

    // Handle messages from server
    socket.addEventListener('message', (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Received:', message);

            // Handle welcome message
            if (message.type === 'welcome') {
                clientId = message.id;
                console.log(`Assigned client ID: ${clientId}`);
                document.getElementById('clientId').textContent = clientId;
            }
            
            // Handle fish initialization
            else if (message.type === 'fishInit') {
                console.log('Received fish initialization data:', message.fish);
                // Initialize all fish entities
                for (const fishId in message.fish) {
                    const fish = message.fish[fishId];
                    createFishEntity(fish);
                }
            }
            
            // Handle fish spawn
            else if (message.type === 'fishSpawn') {
                console.log('Fish spawned:', message.fish);
                createFishEntity(message.fish);
            }

            // Handle game state updates
            else if (message.type === 'gameState') {
                // Update player positions based on server data
                updatePlayerPositions(message.data.players);
                
                // Update fish positions based on server data
                updateFishPositions(message.data.fish);
            }

            // Handle chunk updates
            else if (message.type === 'chunkUpdate') {
                console.log(`Chunk update: (${message.chunkX}, ${message.chunkZ})`);
                currentPlayerChunk = { x: message.chunkX, z: message.chunkZ };
                updateChunks();
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    // Socket closed event
    socket.addEventListener('close', (event) => {
        console.log('Connection closed');
        document.getElementById('connectionStatus').textContent = 'Disconnected';
        document.getElementById('connectionStatus').style.color = 'red';
        
        // Attempt to reconnect after 2 seconds
        setTimeout(connectToServer, 2000);
    });

    // Socket error event
    socket.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        document.getElementById('connectionStatus').textContent = 'Error';
        document.getElementById('connectionStatus').style.color = 'red';
    });
}

// Helper function to send messages to the server
function sendMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        // For structured messages, we can use objects
        socket.send(JSON.stringify(message));
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
            if (!keys[event.key]) { // Only send message if state changes
                keys[event.key] = true;
                // Send key press event to server
                sendMessage({
                    type: 'keyPress',
                    key: event.key,
                    pressed: true
                });
            }
        }
    });
    
    window.addEventListener('keyup', (event) => {
        if (keys.hasOwnProperty(event.key)) {
            keys[event.key] = false;
            // Send key release event to server
            sendMessage({
                type: 'keyPress',
                key: event.key,
                pressed: false
            });
        }
    });
    
    // Apply forces based on key presses
    function updateMovement() {
        // Reset velocity first for better control
        playerBody.velocity.x = 0;
        playerBody.velocity.z = 0;
        
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
        
        // Apply damping for smooth underwater movement
        playerBody.linearDamping = 0.9;
        
        requestAnimationFrame(updateMovement);
    }
    
    // Start the movement update loop
    updateMovement();
}

// Update fish positions based on server data
function updateFishPositions(fishData) {
    if (!fishData) return;
    
    // Get the currently loaded chunk keys for validation
    const loadedChunkKeys = new Set(loadedChunks.keys());
    
    // Update existing fish entities and create new ones only if in loaded chunks
    for (const fishId in fishData) {
        const serverFish = fishData[fishId];
        const fishIdInt = parseInt(serverFish.id);
        
        // Calculate the fish's chunk key
        const fishChunkX = serverFish.chunkX !== undefined ? serverFish.chunkX : Math.floor(serverFish.position.x / CHUNK_SIZE);
        const fishChunkZ = serverFish.chunkZ !== undefined ? serverFish.chunkZ : Math.floor(serverFish.position.z / CHUNK_SIZE);
        const fishChunkKey = `${fishChunkX},${fishChunkZ}`;
        
        // Only process fish that are in loaded chunks
        if (loadedChunkKeys.has(fishChunkKey)) {
            // If this fish exists in our local entities, update it
            if (fishEntities.has(fishIdInt)) {
                const fishEntity = fishEntities.get(fishIdInt);
                
                // Update the mesh position
                fishEntity.mesh.position.x = serverFish.position.x;
                fishEntity.mesh.position.y = serverFish.position.y;
                fishEntity.mesh.position.z = serverFish.position.z;
                
                // Update the stored data including chunk information
                fishEntity.data.position = serverFish.position;
                fishEntity.data.velocity = serverFish.velocity;
                
                // Check if fish has moved to a new chunk
                if (serverFish.chunkX !== undefined && serverFish.chunkZ !== undefined) {
                    const newChunkKey = `${serverFish.chunkX},${serverFish.chunkZ}`;
                    
                    // If fish changed chunks, and the new chunk is loaded, move it
                    if (fishEntity.chunkKey !== newChunkKey && loadedChunkKeys.has(newChunkKey)) {
                        // Remove from old chunk group
                        if (fishChunkGroups.has(fishEntity.chunkKey)) {
                            const oldGroup = fishChunkGroups.get(fishEntity.chunkKey);
                            oldGroup.remove(fishEntity.mesh);
                        }
                        
                        // Create new chunk group if it doesn't exist
                        if (!fishChunkGroups.has(newChunkKey)) {
                            const fishGroup = new THREE.Group();
                            fishGroup.name = `fish_chunk_${newChunkKey}`;
                            scene.add(fishGroup);
                            fishChunkGroups.set(newChunkKey, fishGroup);
                        }
                        
                        // Add to new chunk group
                        const newGroup = fishChunkGroups.get(newChunkKey);
                        newGroup.add(fishEntity.mesh);
                        
                        // Update fish data
                        fishEntity.data.chunkX = serverFish.chunkX;
                        fishEntity.data.chunkZ = serverFish.chunkZ;
                        fishEntity.chunkKey = newChunkKey;
                    }
                    // If fish changed to an unloaded chunk, remove it
                    else if (fishEntity.chunkKey !== newChunkKey && !loadedChunkKeys.has(newChunkKey)) {
                        // Remove fish from its current group
                        if (fishChunkGroups.has(fishEntity.chunkKey)) {
                            const oldGroup = fishChunkGroups.get(fishEntity.chunkKey);
                            oldGroup.remove(fishEntity.mesh);
                        }
                        // Remove from entities map
                        fishEntities.delete(fishIdInt);
                        console.log(`Removed fish ${fishIdInt} that moved to unloaded chunk ${newChunkKey}`);
                    }
                }
            } else if (serverFish.id !== undefined) {
                // If we don't have this fish yet and it's in a loaded chunk, create it
                console.log(`Creating new fish with ID ${serverFish.id} from game state update in chunk ${fishChunkKey}`);
                createFishEntity(serverFish);
            }
        } else {
            // Fish is in an unloaded chunk - make sure it's not in our local entities
            if (fishEntities.has(fishIdInt)) {
                const fishEntity = fishEntities.get(fishIdInt);
                
                // Remove from scene group if it exists
                if (fishChunkGroups.has(fishEntity.chunkKey)) {
                    const group = fishChunkGroups.get(fishEntity.chunkKey);
                    group.remove(fishEntity.mesh);
                }
                
                // Remove from entities map
                fishEntities.delete(fishIdInt);
                console.log(`Removed out-of-range fish ${fishIdInt} from unloaded chunk ${fishChunkKey}`);
            }
        }
    }
    
    // Debug logging to check fish entities
    if (Math.random() < 0.01) { // Only log occasionally to avoid console spam
        console.log(`Current fish count: ${fishEntities.size}`);
        console.log(`Current fish chunk groups: ${fishChunkGroups.size}`);
        console.log(`Loaded chunks: ${loadedChunks.size}`);
    }
}

// Create a fish entity and its visual representation
function createFishEntity(fishData) {
    // Skip if we already have this fish
    const fishIdInt = parseInt(fishData.id);
    if (fishEntities.has(fishIdInt)) {
        console.log(`Fish ${fishData.id} already exists, skipping creation`);
        return;
    }
    
    // Make sure we have a properly formatted data object with chunk info
    const fishDataComplete = {
        id: fishIdInt,
        chunkX: fishData.chunkX !== undefined ? fishData.chunkX : Math.floor(fishData.position.x / CHUNK_SIZE),
        chunkZ: fishData.chunkZ !== undefined ? fishData.chunkZ : Math.floor(fishData.position.z / CHUNK_SIZE),
        position: { ...fishData.position },
        velocity: fishData.velocity || { x: 0, y: 0, z: 0 }
    };
    
    // Get or create the fish chunk group for this fish's chunk
    const chunkKey = `${fishDataComplete.chunkX},${fishDataComplete.chunkZ}`;
    
    // Only create fish if the chunk is loaded
    if (!loadedChunks.has(chunkKey)) {
        console.log(`Skipping fish creation for unloaded chunk ${chunkKey}`);
        return;
    }
    
    // Create a red sphere for the fish
    const fishGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const fishMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red color
    const fishMesh = new THREE.Mesh(fishGeometry, fishMaterial);
    
    // Set fish position based on server data
    fishMesh.position.set(
        fishData.position.x, 
        fishData.position.y, 
        fishData.position.z
    );
    
    // Create or get fish chunk group
    if (!fishChunkGroups.has(chunkKey)) {
        // Create a new group for this chunk if it doesn't exist
        const fishGroup = new THREE.Group();
        fishGroup.name = `fish_chunk_${chunkKey}`;
        scene.add(fishGroup);
        fishChunkGroups.set(chunkKey, fishGroup);
    }
    
    // Add the fish to its chunk group
    const fishGroup = fishChunkGroups.get(chunkKey);
    fishGroup.add(fishMesh);
    
    // Store fish data and mesh together
    fishEntities.set(fishIdInt, {
        data: fishDataComplete,
        mesh: fishMesh,
        chunkKey: chunkKey
    });
    
    console.log(`Created fish with ID ${fishData.id} at position:`, fishData.position, 
                `in chunk (${fishDataComplete.chunkX}, ${fishDataComplete.chunkZ})`);
}

// Update chunks based on player position
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
            
            // Extract chunk coordinates from the key
            const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
            
            // Remove fish chunk group if it exists for this chunk
            if (fishChunkGroups.has(chunkKey)) {
                const fishGroup = fishChunkGroups.get(chunkKey);
                console.log(`Removing fish group for chunk ${chunkKey} containing ${fishGroup.children.length} fish`);
                
                // Remove fish from entities map
                for (const [fishId, fishEntity] of fishEntities.entries()) {
                    if (fishEntity.chunkKey === chunkKey) {
                        fishEntities.delete(fishId);
                    }
                }
                
                // Remove the fish group from the scene
                scene.remove(fishGroup);
                fishChunkGroups.delete(chunkKey);
            }
            
            // Remove the chunk from the scene
            scene.remove(chunkGroup);
            // Remove from the map
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
        // Convert playerId to number for correct comparison
        const pid = Number(playerId);
        
        // Skip our own player - server's position is authoritative, but we use client-side prediction
        if (pid === clientId) {
            // If server position is very different from our position, we might need to sync
            const serverPos = new THREE.Vector3(position.x, position.y, position.z);
            const localPos = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
            
            // If server and client positions differ by more than 5 units, sync with server
            if (serverPos.distanceTo(localPos) > 5) {
                console.log("Server correction: large position difference detected");
                player.position.copy(serverPos);
                playerBody.position.copy(new CANNON.Vec3(position.x, position.y, position.z));
            }
            
            continue;
        }
        
        // If we don't have a mesh for this player yet, create one
        if (!otherPlayers.has(pid)) {
            console.log(`Creating new player representation for player ${pid}`);
            const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
            const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Same green color
            const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
            scene.add(playerMesh);
            otherPlayers.set(pid, playerMesh);
        }
        
        // Update the player's position
        const playerMesh = otherPlayers.get(pid);
        if (playerMesh) {
            playerMesh.position.set(position.x, position.y, position.z);
        }
    }
    
    // Remove players that are no longer in the game
    for (const [playerId, playerMesh] of otherPlayers.entries()) {
        if (!players[playerId]) {
            console.log(`Removing player ${playerId} who left the game`);
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
        
        // Auto-initialize game without waiting for button click
        if (initializeGame()) {
            console.log("Game initialized successfully");
            // Hide the start button as we're auto-starting
            const startButton = document.getElementById('startButton');
            if (startButton) {
                startButton.style.display = 'none';
            }
        } else {
            console.error("Game initialization failed");
            document.getElementById('startButton').style.display = 'block';
            document.getElementById('startButton').addEventListener('click', () => {
                if (initializeGame()) {
                    // If game initialized successfully, hide the button
                    document.getElementById('startButton').style.display = 'none';
                }
            });
        }
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
        sendMessage({
            type: 'message',
            content: 'Test button clicked!'
        });
    });
    
    document.body.appendChild(testButton);
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

// Check if a fish should be visible based on current loaded chunks
function isChunkLoaded(chunkX, chunkZ) {
    return loadedChunks.has(`${chunkX},${chunkZ}`);
}

// Modify cleanupOutOfRangeFish function to more aggressively clean up fish
function cleanupOutOfRangeFish() {
    // Get set of currently loaded chunk keys
    const loadedChunkKeys = new Set(loadedChunks.keys());
    
    // Clean up fish chunk groups for unloaded chunks
    for (const [chunkKey, fishGroup] of fishChunkGroups.entries()) {
        if (!loadedChunkKeys.has(chunkKey)) {
            console.log(`Removing out-of-range fish group for chunk ${chunkKey}`);
            
            // Remove fish from entities map
            for (const [fishId, fishEntity] of fishEntities.entries()) {
                if (fishEntity.chunkKey === chunkKey) {
                    fishEntities.delete(fishId);
                }
            }
            
            // Remove the fish group from the scene and clear its children
            scene.remove(fishGroup);
            while (fishGroup.children.length > 0) {
                fishGroup.remove(fishGroup.children[0]);
            }
            fishChunkGroups.delete(chunkKey);
        }
    }
    
    // Additionally check all fish to make sure none are in unloaded chunks
    for (const [fishId, fishEntity] of fishEntities.entries()) {
        if (!loadedChunkKeys.has(fishEntity.chunkKey)) {
            console.log(`Cleaning up stray fish ${fishId} from unloaded chunk ${fishEntity.chunkKey}`);
            fishEntities.delete(fishId);
        }
    }
    
    console.log(`After cleanup: ${fishEntities.size} fish remain in ${fishChunkGroups.size} chunk groups`);
} 