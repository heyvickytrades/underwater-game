// Underwater Odyssey - Client-Side Main Script
import { WaterShader, PlanktonParticleSystem, UnderwaterFogEffect, UnderwaterSoundManager } from './waterEffect.js';

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

// Keyboard state for direct movement control
const keyState = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

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
let lastFishUpdateTime = 0; // Track when we last got fish updates from the server

// Environmental effects
let waterShaderMaterial;
let waterSurface;
let planktonParticles;
let underwaterFog;
let soundManager;
let lastUpdateTime = 0;

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
        
        // Show debug info first so the elements exist when we reference them later
        document.getElementById('gameUI').style.display = 'block';
        document.getElementById('debugInfo').style.display = 'block';
        
        // Create ThreeJS scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a121f); // Dark blue background for underwater effect

        // Create camera
        const aspectRatio = window.innerWidth / window.innerHeight;
        camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.1, 1000);
        
        // Create renderer
        renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('gameCanvas'),
            antialias: true
        });
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        
        // Create lights
        const ambientLight = new THREE.AmbientLight(0x555566, 0.6);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xaaccff, 0.8);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);
        
        // Create physics world
        physicsWorld = new CANNON.World();
        physicsWorld.gravity.set(0, 0, 0); // No gravity for underwater
        physicsWorld.defaultContactMaterial.friction = 0.0;
        physicsWorld.defaultContactMaterial.restitution = 0.3;
        
        // Create player (green cube)
        const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
        const playerMaterial = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
        player = new THREE.Mesh(playerGeometry, playerMaterial);
        player.position.set(0, 0, 0);
        scene.add(player);
        
        // Create player physics body
        const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
        playerBody = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(0, 0, 0),
            shape: playerShape
        });
        playerBody.linearDamping = 0.9; // High damping to simulate water resistance
        physicsWorld.addBody(playerBody);
        
        // Initialize camera position
        camera.position.set(0, 2, 5);
        camera.lookAt(player.position);
        
        // Create a grid as a reference for underwater ground
        const gridHelper = new THREE.GridHelper(100, 100, 0x0088ff, 0x0044aa);
        gridHelper.position.y = -10;
        scene.add(gridHelper);
        
        // Add a plane to represent the sea floor
        const floorGeometry = new THREE.PlaneGeometry(500, 500);
        const floorMaterial = new THREE.MeshLambertMaterial({
            color: 0x006688,
            side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = Math.PI / 2;
        floor.position.y = -10;
        scene.add(floor);
        
        // Create a water surface plane above
        const waterGeometry = new THREE.PlaneGeometry(500, 500, 50, 50);
        waterSurface = new THREE.Mesh(waterGeometry, waterShaderMaterial);
        waterSurface.rotation.x = Math.PI / 2;
        waterSurface.position.y = 15; // Place above the scene
        scene.add(waterSurface);
        
        // Initialize environmental effects
        
        // Initialize particle system for plankton
        initPlanktonParticles();
        
        // Initialize underwater fog
        initUnderwaterFog();
        
        // Initialize sound manager
        initSoundManager();
        
        // Start the game
        window.addEventListener('resize', onWindowResize);
        setupKeyboardControls();
        
        // Initialize first chunks
        updateChunks();
        
        // Start the animation loop
        lastTime = performance.now();
        requestAnimationFrame(animate);
        
        console.log('Game initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing game:', error);
        document.getElementById('errorMessage').textContent = error.message;
        return false;
    }
}

// Initialize plankton particle system
function initPlanktonParticles() {
    try {
        // Create particle geometry
        const particleGeometry = new THREE.BufferGeometry();
        
        // Number of particles
        const particleCount = 3000; // Increased from 2000 for better coverage
        const range = 60; // Increased from 50 for wider spread
        
        // Create positions array
        const positions = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        for (let i = 0; i < particleCount; i++) {
            // Random position within range, centered at origin (0,0,0)
            positions[i * 3] = (Math.random() - 0.5) * range;
            positions[i * 3 + 1] = (Math.random() - 0.5) * (range / 2) - 2; // More concentrated vertically, slightly below center
            positions[i * 3 + 2] = (Math.random() - 0.5) * range;
            
            // Random size variation
            sizes[i] = Math.random() * 0.5 + 0.1;
        }
        
        // Add attributes to the geometry
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // Create particle material
        const particleMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.2, // Slightly larger from 0.1 for better visibility
            transparent: true,
            opacity: 0.4, // Slightly more opaque from 0.3 for better visibility
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        // Create the particle system
        planktonParticles = new THREE.Points(particleGeometry, particleMaterial);
        planktonParticles.userData.positions = positions;
        planktonParticles.userData.sizes = sizes;
        
        // Set up initial water current
        planktonParticles.userData.current = {
            direction: new THREE.Vector3(1, 0.2, 0.5).normalize(),
            speed: 0.2
        };
        
        // Position the particle system at the player's location initially
        if (player) {
            planktonParticles.position.copy(player.position);
        }
        
        scene.add(planktonParticles);
        console.log("Plankton particle system initialized");
    } catch (error) {
        console.error('Error initializing plankton particles:', error);
    }
}

// Initialize underwater fog
function initUnderwaterFog() {
    try {
        // Add exponential fog for a more realistic underwater look
        scene.fog = new THREE.FogExp2(0x0a4a9e, 0.02);
    } catch (error) {
        console.error('Error initializing underwater fog:', error);
    }
}

// Initialize sound manager
function initSoundManager() {
    try {
        console.log("Initializing sound manager...");
        
        // Create an audio listener and add it to the camera
        const listener = new THREE.AudioListener();
        camera.add(listener);
        
        // Create ambient underwater sound
        const ambientSound = new THREE.Audio(listener);
        
        // Create sound manager object
        soundManager = {
            listener: listener,
            sounds: {
                ambient: ambientSound,
                bubbles: null,
                whale: null
            },
            initialized: false,  // Will be set to true once sounds are loaded
            play: function(name) {
                if (this.sounds[name] && !this.sounds[name].isPlaying) {
                    console.log(`Playing sound: ${name}`);
                    this.sounds[name].play();
                } else if (!this.sounds[name]) {
                    console.warn(`Sound not found: ${name}`);
                } else {
                    console.log(`Sound already playing: ${name}`);
                }
            },
            stop: function(name) {
                if (this.sounds[name] && this.sounds[name].isPlaying) {
                    console.log(`Stopping sound: ${name}`);
                    this.sounds[name].stop();
                }
            }
        };
        
        // Load ambient underwater sound
        const audioLoader = new THREE.AudioLoader();
        
        console.log("Loading ambient sound...");
        audioLoader.load('sounds/underwater_ambient.mp3', 
            // onLoad callback
            function(buffer) {
                console.log("Ambient sound loaded successfully");
                ambientSound.setBuffer(buffer);
                ambientSound.setLoop(true);
                ambientSound.setVolume(0.5);
                soundManager.initialized = true;
                
                // Don't autoplay - we'll play it after user interaction
                console.log("Sound manager ready");
            }, 
            // onProgress
            function(xhr) {
                console.log('Sound loading: ' + (xhr.loaded / xhr.total * 100).toFixed(1) + '% loaded');
            }, 
            // onError
            function(error) {
                console.error('Error loading sound:', error);
            }
        );
        
        // Also load bubble sounds
        const bubblesSound = new THREE.Audio(listener);
        audioLoader.load('sounds/bubbles.mp3',
            function(buffer) {
                console.log("Bubbles sound loaded successfully");
                bubblesSound.setBuffer(buffer);
                bubblesSound.setLoop(false);
                bubblesSound.setVolume(0.3);
                soundManager.sounds.bubbles = bubblesSound;
            },
            null,
            function(error) {
                console.error('Error loading bubbles sound:', error);
            }
        );
        
        // Also load whale sounds
        const whaleSound = new THREE.Audio(listener);
        audioLoader.load('sounds/whale.mp3',
            function(buffer) {
                console.log("Whale sound loaded successfully");
                whaleSound.setBuffer(buffer);
                whaleSound.setLoop(false);
                whaleSound.setVolume(0.4);
                soundManager.sounds.whale = whaleSound;
            },
            null,
            function(error) {
                console.error('Error loading whale sound:', error);
            }
        );
        
    } catch (error) {
        console.error('Error initializing sound manager:', error);
        soundManager = { initialized: false, sounds: {} };
    }
}

// Handle window resize
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    renderer.setSize(width, height);
}

// Animation loop
function animate(time) {
    requestAnimationFrame(animate);
    
    try {
        // Check if essential components are initialized
        if (!player || !playerBody || !scene || !camera || !renderer) {
            console.warn("Essential game components not initialized yet, skipping animation frame");
            return;
        }
        
        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;
        
        // Apply movement from keyboard state
        applyKeyboardMovement();
        
        // Update physics world with a fixed time step
        physicsWorld.step(fixedTimeStep);
        
        // Update player position from physics body
        player.position.copy(playerBody.position);
        player.quaternion.copy(playerBody.quaternion);
        
        // Position camera behind player
        const cameraOffset = new THREE.Vector3(0, 2, 5);
        cameraOffset.applyQuaternion(player.quaternion);
        camera.position.copy(player.position).add(cameraOffset);
        camera.lookAt(player.position);
        
        // Update UI with position and direction
        updateUI();
        
        // Check if chunks need to be updated
        const newChunkX = Math.floor(player.position.x / CHUNK_SIZE);
        const newChunkZ = Math.floor(player.position.z / CHUNK_SIZE);
        
        if (newChunkX !== currentPlayerChunk.x || newChunkZ !== currentPlayerChunk.z) {
            currentPlayerChunk.x = newChunkX;
            currentPlayerChunk.z = newChunkZ;
            updateChunks();
        }
        
        // Update fish positions locally between server updates
        updateLocalFishPositions(deltaTime);
        
        // Update environmental effects
        
        // Update water shader with time
        if (waterShaderMaterial) {
            waterShaderMaterial.uniforms.time.value = time * 0.001;
        }
        
        // Subtle wave motion for the water surface
        if (waterSurface && waterSurface.geometry && waterSurface.geometry.attributes.position) {
            const vertices = waterSurface.geometry.attributes.position.array;
            for (let i = 0; i < vertices.length; i += 3) {
                const x = vertices[i];
                const z = vertices[i+2];
                vertices[i+1] = 
                    Math.sin(time * 0.001 + x * 0.05) * 0.5 + 
                    Math.cos(time * 0.0015 + z * 0.05) * 0.5;
            }
            waterSurface.geometry.attributes.position.needsUpdate = true;
        }
        
        // Update plankton particles
        updatePlanktonParticles(deltaTime, time);
        
        // Update fog based on depth
        if (underwaterFog) {
            const depth = Math.abs(player.position.y);
            underwaterFog.updateWithDepth(depth);
        }
        
        // Update UI depth display
        const depthElement = document.getElementById('environmentInfo');
        if (depthElement) {
            const depth = Math.abs(player.position.y).toFixed(1);
            
            // Determine biome based on depth
            let biome = 'Coral Reef';
            if (depth > 10) {
                biome = 'Deep Sea';
            } else if (depth > 5) {
                biome = 'Mid-Ocean';
            }
            
            depthElement.textContent = `Depth: ${depth}m | Biome: ${biome}`;
        }
        
        // Render the scene
        renderer.render(scene, camera);
    } catch (error) {
        console.error('Error in animation loop:', error);
    }
}

// Update plankton particles
function updatePlanktonParticles(deltaTime, time) {
    if (!planktonParticles || !planktonParticles.userData || !player) return;
    
    const positions = planktonParticles.geometry.attributes.position.array;
    const current = planktonParticles.userData.current;
    
    // Occasionally update the current direction to make it feel more dynamic
    if (time - lastUpdateTime > 5000) { // Every 5 seconds
        const angle = Math.random() * Math.PI * 2;
        current.direction = new THREE.Vector3(
            Math.cos(angle),
            (Math.random() - 0.5) * 0.2,
            Math.sin(angle)
        ).normalize();
        current.speed = 0.1 + Math.random() * 0.2;
        lastUpdateTime = time;
    }
    
    // Apply current to player for subtle drift
    if (playerBody) {
        playerBody.velocity.x += current.direction.x * current.speed * deltaTime * 0.05;
        playerBody.velocity.y += current.direction.y * current.speed * deltaTime * 0.05;
        playerBody.velocity.z += current.direction.z * current.speed * deltaTime * 0.05;
    }
    
    // Move the entire particle system with the player
    planktonParticles.position.copy(player.position);
    
    // Update particles based on current and random motion
    for (let i = 0; i < positions.length; i += 3) {
        // Apply water current movement (now relative to the system's position)
        positions[i] += current.direction.x * current.speed * deltaTime;
        positions[i + 1] += current.direction.y * current.speed * deltaTime;
        positions[i + 2] += current.direction.z * current.speed * deltaTime;
        
        // Add a bit of random movement
        positions[i] += (Math.random() - 0.5) * 0.01;
        positions[i + 1] += (Math.random() - 0.5) * 0.01;
        positions[i + 2] += (Math.random() - 0.5) * 0.01;
        
        // Wrap particles around the center (not player position, since the system moves with player)
        const range = 50;
        
        if (Math.abs(positions[i]) > range / 2) {
            positions[i] = (positions[i] > 0 ? -1 : 1) * (range / 2) * 0.9;
        }
        
        if (Math.abs(positions[i + 1]) > range / 4) {
            positions[i + 1] = (positions[i + 1] > 0 ? -1 : 1) * (range / 4) * 0.9;
        }
        
        if (Math.abs(positions[i + 2]) > range / 2) {
            positions[i + 2] = (positions[i + 2] > 0 ? -1 : 1) * (range / 2) * 0.9;
        }
    }
    
    // Mark attributes as needing update
    planktonParticles.geometry.attributes.position.needsUpdate = true;
}

// Update UI elements
function updateUI() {
    const environmentInfo = document.getElementById('environmentInfo');
    const directionText = document.getElementById('directionText');
    const compassIndicator = document.getElementById('compassIndicator');
    
    if (environmentInfo && player) {
        // Calculate depth based on player Y position
        const depth = Math.abs(Math.min(player.position.y, 0)).toFixed(1);
        
        // Determine biome based on depth and location
        let biome = 'Coral Reef';
        if (depth > 5) {
            biome = 'Mid Ocean';
        }
        if (depth > 8) {
            biome = 'Deep Sea';
        }
        
        // Update environment info display
        environmentInfo.textContent = `Depth: ${depth}m | Biome: ${biome}`;
    }
    
    if (directionText && compassIndicator && player) {
        // Get the forward direction vector
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
        
        // Calculate angle (in radians) between the forward direction and world coordinate system
        const angle = Math.atan2(forward.x, forward.z);
        
        // Convert to degrees and ensure positive value (0-360)
        const degrees = ((angle * 180 / Math.PI) + 360) % 360;
        
        // Get the direction name
        let direction = 'North';
        if (degrees >= 22.5 && degrees < 67.5) {
            direction = 'Northeast';
        } else if (degrees >= 67.5 && degrees < 112.5) {
            direction = 'East';
        } else if (degrees >= 112.5 && degrees < 157.5) {
            direction = 'Southeast';
        } else if (degrees >= 157.5 && degrees < 202.5) {
            direction = 'South';
        } else if (degrees >= 202.5 && degrees < 247.5) {
            direction = 'Southwest';
        } else if (degrees >= 247.5 && degrees < 292.5) {
            direction = 'West';
        } else if (degrees >= 292.5 && degrees < 337.5) {
            direction = 'Northwest';
        }
        
        // Update text and rotate the compass indicator
        directionText.textContent = direction;
        compassIndicator.style.transform = `rotate(${degrees}deg)`;
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
                lastFishUpdateTime = performance.now();
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
                lastFishUpdateTime = performance.now();
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
    console.log("Setting up keyboard controls...");
    
    const moveSpeed = 10; // Movement speed
    
    // Track key presses
    window.addEventListener('keydown', (event) => {
        console.log("Key pressed:", event.key);
        if (keyState.hasOwnProperty(event.key)) {
            if (!keyState[event.key]) { // Only send message if state changes
                keyState[event.key] = true;
                console.log(`Key ${event.key} pressed, sending to server`);
                
                // Send key press event to server
                sendMessage({
                    type: 'keyPress',
                    key: event.key,
                    pressed: true
                });
                
                // Directly apply movement to player body for immediate response
                applyMovement();
            }
        }
    });
    
    window.addEventListener('keyup', (event) => {
        console.log("Key released:", event.key);
        if (keyState.hasOwnProperty(event.key)) {
            keyState[event.key] = false;
            console.log(`Key ${event.key} released, sending to server`);
            
            // Send key release event to server
            sendMessage({
                type: 'keyPress',
                key: event.key,
                pressed: false
            });
            
            // Directly apply movement to player body for immediate response
            applyMovement();
        }
    });
    
    // Apply forces based on key presses
    function applyMovement() {
        if (!playerBody) {
            console.log("Player body not initialized yet, can't apply movement");
            return;
        }
        
        // Reset velocity first for better control
        playerBody.velocity.x = 0;
        playerBody.velocity.z = 0;
        
        // Forward/backward movement
        if (keyState.ArrowUp) {
            playerBody.velocity.z = -moveSpeed;
            console.log("Moving forward");
        } else if (keyState.ArrowDown) {
            playerBody.velocity.z = moveSpeed;
            console.log("Moving backward");
        }
        
        // Left/right movement
        if (keyState.ArrowLeft) {
            playerBody.velocity.x = -moveSpeed;
            console.log("Moving left");
        } else if (keyState.ArrowRight) {
            playerBody.velocity.x = moveSpeed;
            console.log("Moving right");
        }
        
        // Apply damping for smooth underwater movement
        playerBody.linearDamping = 0.9;
    }
    
    // This function will be called each frame from animate() to ensure we're always checking keys
    function updateMovement() {
        applyMovement();
    }
    
    // Call the first application of movement
    applyMovement();
    
    // Return the applyMovement function for external use
    return { applyMovement };
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
                
                // Don't directly update mesh position - store the server position in the data
                // This allows our interpolation to work without sudden jumps
                fishEntity.data.serverPosition = {
                    x: serverFish.position.x,
                    y: serverFish.position.y,
                    z: serverFish.position.z
                };
                
                // Only if the fish is very far from its server position, teleport it
                const distanceToServer = Math.sqrt(
                    Math.pow(fishEntity.mesh.position.x - serverFish.position.x, 2) +
                    Math.pow(fishEntity.mesh.position.y - serverFish.position.y, 2) +
                    Math.pow(fishEntity.mesh.position.z - serverFish.position.z, 2)
                );
                
                // If fish is very far from its expected position (>5 units), teleport it
                if (distanceToServer > 5) {
                    fishEntity.mesh.position.x = serverFish.position.x;
                    fishEntity.mesh.position.y = serverFish.position.y;
                    fishEntity.mesh.position.z = serverFish.position.z;
                    fishEntity.data.position = { ...serverFish.position };
                }
                
                // Update the stored velocity data - our smoothing will handle the interpolation
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
    
    // Update the fish count in the UI
    const fishCountElement = document.getElementById('fishCount');
    if (fishCountElement) {
        fishCountElement.textContent = fishEntities.size;
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
    
    // Create a larger, brightly colored fish for better visibility
    const fishGeometry = new THREE.SphereGeometry(1.0, 8, 8); // Increased size from 0.3 to 1.0
    
    // Create random bright color for fish
    const fishColor = new THREE.Color(
        0.5 + Math.random() * 0.5, // Red component (0.5-1.0)
        0.5 + Math.random() * 0.5, // Green component (0.5-1.0)
        0.5 + Math.random() * 0.5  // Blue component (0.5-1.0)
    );
    
    const fishMaterial = new THREE.MeshStandardMaterial({ 
        color: fishColor,
        emissive: fishColor.clone().multiplyScalar(0.3), // Add some glow
        emissiveIntensity: 0.5
    });
    
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
    
    // Update the fish count in the UI
    const fishCountElement = document.getElementById('fishCount');
    if (fishCountElement) {
        fishCountElement.textContent = fishEntities.size;
    }
    
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

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded");
    const startButton = document.getElementById('startButton');
    const loadingScreen = document.getElementById('loadingScreen');
    const gameUI = document.getElementById('gameUI');
    const debugInfo = document.getElementById('debugInfo');
    
    if (!startButton) {
        console.error("Start button not found in DOM");
        return;
    }
    
    console.log("Setting up start button");
    
    // Show the start button once libraries are loaded
    setTimeout(() => {
        console.log("Showing start button");
        startButton.style.display = 'block';
    }, 1000);
    
    startButton.addEventListener('click', function() {
        console.log("Start button clicked");
        
        try {
            // Initialize game on button click
            const initSuccess = initializeGame();
            console.log("Game initialization result:", initSuccess);
            
            if (initSuccess) {
                // Connect to server
                connectToServer();
                
                // Hide loading screen
                loadingScreen.style.display = 'none';
                
                // Show game UI and debug info
                gameUI.style.display = 'block';
                debugInfo.style.display = 'block';
                
                // Play ambient underwater sound once user has interacted
                console.log("Sound manager state:", soundManager ? "exists" : "undefined");
                
                // Wait a bit to ensure sounds have loaded
                setTimeout(() => {
                    if (soundManager && soundManager.initialized) {
                        try {
                            console.log('Starting ambient sound via sound manager...');
                            soundManager.play('ambient');
                            
                            // Occasionally play whale sounds for atmosphere
                            setInterval(() => {
                                if (Math.random() < 0.1) { // 10% chance every 30 seconds
                                    soundManager.play('whale');
                                }
                            }, 30000);
                            
                            // Occasionally play bubble sounds
                            setInterval(() => {
                                if (Math.random() < 0.2) { // 20% chance every 15 seconds
                                    soundManager.play('bubbles');
                                }
                            }, 15000);
                        } catch (error) {
                            console.error('Error playing ambient sound:', error);
                        }
                    } else {
                        console.warn('Sound manager not ready:', soundManager);
                    }
                }, 2000);
            } else {
                console.error("Game initialization failed");
            }
        } catch (error) {
            console.error("Error during game start:", error);
        }
    });
});

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

// Apply keyboard movement directly
function applyKeyboardMovement() {
    // Check if player physics body is initialized
    if (!playerBody) {
        console.warn("Player body not initialized, can't apply movement");
        return;
    }
    
    const movementSpeed = 10;
    
    // Reset velocity to reduce drift
    playerBody.velocity.x = 0;
    playerBody.velocity.z = 0;
    
    let isMoving = false;
    
    // Apply movement based on arrow keys
    if (keyState.ArrowUp) {
        // Move forward
        const forwardVector = new THREE.Vector3(0, 0, -1);
        forwardVector.applyQuaternion(playerBody.quaternion);
        playerBody.velocity.x += forwardVector.x * movementSpeed;
        playerBody.velocity.z += forwardVector.z * movementSpeed;
        isMoving = true;
    }
    
    if (keyState.ArrowDown) {
        // Move backward
        const backwardVector = new THREE.Vector3(0, 0, 1);
        backwardVector.applyQuaternion(playerBody.quaternion);
        playerBody.velocity.x += backwardVector.x * movementSpeed;
        playerBody.velocity.z += backwardVector.z * movementSpeed;
        isMoving = true;
    }
    
    if (keyState.ArrowLeft) {
        // Rotate left
        playerBody.angularVelocity.y = 2;
        isMoving = true;
    } else if (keyState.ArrowRight) {
        // Rotate right
        playerBody.angularVelocity.y = -2;
        isMoving = true;
    } else {
        // Stop rotation
        playerBody.angularVelocity.y = 0;
    }
    
    // Play movement sound effects
    if (isMoving && soundManager && soundManager.initialized) {
        // Play bubble sounds occasionally when moving
        if (Math.random() < 0.01) { // 1% chance per frame when moving
            soundManager.play('bubbles');
        }
    }
}

// Function to update fish positions locally between server updates
function updateLocalFishPositions(deltaTime) {
    if (fishEntities.size === 0) return;
    
    // Calculate time since last server update (in seconds)
    const now = performance.now();
    const timeSinceLastUpdate = (now - lastFishUpdateTime) / 1000;
    
    // Lower multiplier for smoother, more subtle movement
    const movementMultiplier = 0.2;
    // Position interpolation factor - higher = faster catch-up to server position
    const positionLerpFactor = 0.05 * deltaTime;
    
    // Update each fish's position based on its velocity
    for (const [fishId, fishEntity] of fishEntities.entries()) {
        if (!fishEntity.data || !fishEntity.mesh) continue;
        
        // If this is a new fish without smooth velocity, initialize it
        if (!fishEntity.smoothVelocity) {
            fishEntity.smoothVelocity = {
                x: fishEntity.data.velocity.x || 0,
                y: fishEntity.data.velocity.y || 0,
                z: fishEntity.data.velocity.z || 0
            };
        }
        
        // If we have a server position, gradually move toward it (position correction)
        if (fishEntity.data.serverPosition) {
            // Gradually move toward server position
            fishEntity.mesh.position.x += (fishEntity.data.serverPosition.x - fishEntity.mesh.position.x) * positionLerpFactor;
            fishEntity.mesh.position.y += (fishEntity.data.serverPosition.y - fishEntity.mesh.position.y) * positionLerpFactor;
            fishEntity.mesh.position.z += (fishEntity.data.serverPosition.z - fishEntity.mesh.position.z) * positionLerpFactor;
        }
        
        // Smoothly interpolate velocity rather than using the raw server value
        const velocityLerpFactor = deltaTime * 1.5;
        fishEntity.smoothVelocity.x = fishEntity.smoothVelocity.x + (fishEntity.data.velocity.x - fishEntity.smoothVelocity.x) * velocityLerpFactor;
        fishEntity.smoothVelocity.y = fishEntity.smoothVelocity.y + (fishEntity.data.velocity.y - fishEntity.smoothVelocity.y) * velocityLerpFactor;
        fishEntity.smoothVelocity.z = fishEntity.smoothVelocity.z + (fishEntity.data.velocity.z - fishEntity.smoothVelocity.z) * velocityLerpFactor;
        
        // Apply smoothed velocity to position
        fishEntity.mesh.position.x += fishEntity.smoothVelocity.x * deltaTime * movementMultiplier;
        fishEntity.mesh.position.y += fishEntity.smoothVelocity.y * deltaTime * movementMultiplier;
        fishEntity.mesh.position.z += fishEntity.smoothVelocity.z * deltaTime * movementMultiplier;
        
        // Update the stored position data
        fishEntity.data.position.x = fishEntity.mesh.position.x;
        fishEntity.data.position.y = fishEntity.mesh.position.y;
        fishEntity.data.position.z = fishEntity.mesh.position.z;
        
        // Check if fish is trying to leave its chunk boundaries - bounce it back if it is
        const chunkMinX = fishEntity.data.chunkX * CHUNK_SIZE + 2;
        const chunkMaxX = (fishEntity.data.chunkX + 1) * CHUNK_SIZE - 2;
        const chunkMinZ = fishEntity.data.chunkZ * CHUNK_SIZE + 2;
        const chunkMaxZ = (fishEntity.data.chunkZ + 1) * CHUNK_SIZE - 2;
        const minY = -4.5;
        const maxY = -1;
        
        // Handle boundary collisions more gently to prevent jittery behavior
        if (fishEntity.mesh.position.x < chunkMinX) {
            fishEntity.smoothVelocity.x = Math.abs(fishEntity.smoothVelocity.x) * 0.8;
            fishEntity.data.velocity.x = Math.abs(fishEntity.data.velocity.x);
            fishEntity.mesh.position.x = chunkMinX + 0.1;
        } else if (fishEntity.mesh.position.x > chunkMaxX) {
            fishEntity.smoothVelocity.x = -Math.abs(fishEntity.smoothVelocity.x) * 0.8;
            fishEntity.data.velocity.x = -Math.abs(fishEntity.data.velocity.x);
            fishEntity.mesh.position.x = chunkMaxX - 0.1;
        }
        
        if (fishEntity.mesh.position.z < chunkMinZ) {
            fishEntity.smoothVelocity.z = Math.abs(fishEntity.smoothVelocity.z) * 0.8;
            fishEntity.data.velocity.z = Math.abs(fishEntity.data.velocity.z);
            fishEntity.mesh.position.z = chunkMinZ + 0.1;
        } else if (fishEntity.mesh.position.z > chunkMaxZ) {
            fishEntity.smoothVelocity.z = -Math.abs(fishEntity.smoothVelocity.z) * 0.8;
            fishEntity.data.velocity.z = -Math.abs(fishEntity.data.velocity.z);
            fishEntity.mesh.position.z = chunkMaxZ - 0.1;
        }
        
        if (fishEntity.mesh.position.y < minY) {
            fishEntity.smoothVelocity.y = Math.abs(fishEntity.smoothVelocity.y) * 0.8;
            fishEntity.data.velocity.y = Math.abs(fishEntity.data.velocity.y);
            fishEntity.mesh.position.y = minY + 0.1;
        } else if (fishEntity.mesh.position.y > maxY) {
            fishEntity.smoothVelocity.y = -Math.abs(fishEntity.smoothVelocity.y) * 0.8;
            fishEntity.data.velocity.y = -Math.abs(fishEntity.data.velocity.y);
            fishEntity.mesh.position.y = maxY - 0.1;
        }
        
        // Reduce the frequency of random direction changes
        if (Math.random() < 0.0001) {
            // Create more gradual direction changes
            const targetVx = (Math.random() * 2 - 1) * 1.5;
            const targetVy = (Math.random() * 2 - 1) * 0.3;
            const targetVz = (Math.random() * 2 - 1) * 1.5;
            
            // Store the new target velocity but let smooth interpolation handle the transition
            fishEntity.data.velocity.x = targetVx;
            fishEntity.data.velocity.y = targetVy;
            fishEntity.data.velocity.z = targetVz;
        }
    }
} 