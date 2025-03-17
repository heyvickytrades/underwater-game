// Underwater Odyssey - Water Effects
// This file contains shaders, particle systems, and current effects for the underwater environment

// Water shader implementation
const WaterShader = {
    // Vertex shader
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;

        void main() {
            vUv = uv;
            vPosition = position;
            
            // Calculate world position for caustics calculation
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    // Fragment shader
    fragmentShader: `
        uniform float time;
        uniform vec3 waterColor;
        uniform float causticsIntensity;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        
        // Simple noise function
        float noise(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        // Simplex-like noise function
        float snoise(vec2 p) {
            vec2 ip = floor(p);
            vec2 fp = fract(p);
            
            float a = noise(ip);
            float b = noise(ip + vec2(1.0, 0.0));
            float c = noise(ip + vec2(0.0, 1.0));
            float d = noise(ip + vec2(1.0, 1.0));
            
            vec2 u = fp * fp * (3.0 - 2.0 * fp);
            
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        
        // Caustics pattern
        float caustics(vec2 position, float time) {
            float speed = 0.05;
            
            // Combine multiple noise scales for more interesting pattern
            float pattern1 = snoise(position * 0.3 + time * speed);
            float pattern2 = snoise(position * 0.5 - time * speed);
            float pattern3 = snoise(position * 0.7 + time * speed * 0.5);
            
            // Combine patterns
            float causticPattern = pattern1 * pattern2 * pattern3 * 2.0;
            return clamp(causticPattern, 0.0, 1.0);
        }
        
        void main() {
            // Base water color (deep blue)
            vec3 color = waterColor;
            
            // Add caustics effect
            float causticsPattern = caustics(vWorldPosition.xz, time);
            color += causticsPattern * causticsIntensity;
            
            // Add subtle depth-based color variation
            float depthFactor = clamp(1.0 - (vWorldPosition.y + 2.0) / 4.0, 0.0, 1.0);
            color = mix(color, waterColor * 0.7, depthFactor);
            
            gl_FragColor = vec4(color, 0.8);
        }
    `,
    
    uniforms: {
        time: { value: 0 },
        waterColor: { value: new THREE.Color(0x0a4a9e) },
        causticsIntensity: { value: 0.3 }
    }
};

// Plankton particle system
class PlanktonParticleSystem {
    constructor(scene, count = 2000, range = 50) {
        this.scene = scene;
        this.count = count;
        this.range = range;
        this.particles = null;
        this.particleSystem = null;
        this.currents = {
            direction: new THREE.Vector3(1, 0.2, 0.5).normalize(),
            speed: 0.2
        };
    }
    
    init() {
        // Create particle geometry
        this.particles = new THREE.BufferGeometry();
        
        // Create positions array
        const positions = new Float32Array(this.count * 3);
        const sizes = new Float32Array(this.count);
        const randomFactors = new Float32Array(this.count);
        
        for (let i = 0; i < this.count; i++) {
            // Random position within range
            positions[i * 3] = (Math.random() - 0.5) * this.range;
            positions[i * 3 + 1] = (Math.random() - 0.5) * (this.range / 2) - 2; // More concentrated vertically, slightly below player
            positions[i * 3 + 2] = (Math.random() - 0.5) * this.range;
            
            // Random size variation
            sizes[i] = Math.random() * 0.5 + 0.1;
            
            // Random movement factor
            randomFactors[i] = Math.random();
        }
        
        // Add attributes to the geometry
        this.particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        this.particles.setAttribute('randomFactor', new THREE.BufferAttribute(randomFactors, 1));
        
        // Create particle material
        const particleMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.1,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: false
        });
        
        // Create the particle system
        this.particleSystem = new THREE.Points(this.particles, particleMaterial);
        this.scene.add(this.particleSystem);
    }
    
    update(playerPosition, deltaTime) {
        if (!this.particleSystem) return;
        
        const positions = this.particles.attributes.position.array;
        const randomFactors = this.particles.attributes.randomFactor.array;
        
        // Update particles based on current and random motion
        for (let i = 0; i < this.count; i++) {
            // Apply water current movement
            positions[i * 3] += this.currents.direction.x * this.currents.speed * deltaTime * (0.5 + randomFactors[i] * 0.5);
            positions[i * 3 + 1] += this.currents.direction.y * this.currents.speed * deltaTime * (0.5 + randomFactors[i] * 0.5);
            positions[i * 3 + 2] += this.currents.direction.z * this.currents.speed * deltaTime * (0.5 + randomFactors[i] * 0.5);
            
            // Add a bit of random movement
            positions[i * 3] += (Math.random() - 0.5) * 0.01;
            positions[i * 3 + 1] += (Math.random() - 0.5) * 0.01;
            positions[i * 3 + 2] += (Math.random() - 0.5) * 0.01;
            
            // Wrap particles around the player to create an infinite effect
            const offsetX = positions[i * 3] - playerPosition.x;
            const offsetY = positions[i * 3 + 1] - playerPosition.y;
            const offsetZ = positions[i * 3 + 2] - playerPosition.z;
            
            if (Math.abs(offsetX) > this.range / 2) {
                positions[i * 3] = playerPosition.x + (offsetX > 0 ? -this.range / 2 : this.range / 2);
            }
            
            if (Math.abs(offsetY) > this.range / 4) {
                positions[i * 3 + 1] = playerPosition.y + (offsetY > 0 ? -this.range / 4 : this.range / 4);
            }
            
            if (Math.abs(offsetZ) > this.range / 2) {
                positions[i * 3 + 2] = playerPosition.z + (offsetZ > 0 ? -this.range / 2 : this.range / 2);
            }
        }
        
        // Mark attributes as needing update
        this.particles.attributes.position.needsUpdate = true;
    }
    
    // Change the current direction and intensity
    setCurrent(direction, speed) {
        this.currents.direction.copy(direction.normalize());
        this.currents.speed = speed;
    }
    
    // Function to apply current forces to objects like fish and players
    applyCurrentToObject(object, deltaTime, factor = 1.0) {
        if (!object || !object.velocity) return;
        
        // Apply current force to the object
        object.velocity.x += this.currents.direction.x * this.currents.speed * deltaTime * factor;
        object.velocity.y += this.currents.direction.y * this.currents.speed * deltaTime * factor;
        object.velocity.z += this.currents.direction.z * this.currents.speed * deltaTime * factor;
    }
}

// Water fog effect
class UnderwaterFogEffect {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.fog = null;
    }
    
    init(color = 0x0a4a9e, near = 10, far = 50) {
        // Add exponential fog for a more realistic underwater look
        this.fog = new THREE.FogExp2(color, 0.02);
        this.scene.fog = this.fog;
    }
    
    // Update fog based on depth
    updateWithDepth(depth) {
        if (!this.fog) return;
        
        // Deeper = denser fog
        const normalizedDepth = Math.abs(depth) / 10;
        this.fog.density = 0.02 + normalizedDepth * 0.01;
    }
}

// Create sound manager for underwater ambient sounds
class UnderwaterSoundManager {
    constructor() {
        this.sounds = {};
        this.listener = null;
        this.initialized = false;
    }
    
    init(camera) {
        // Create an audio listener and add it to the camera
        this.listener = new THREE.AudioListener();
        camera.add(this.listener);
        
        // Create and load ambient underwater sound
        this.loadAmbientSound();
        
        this.initialized = true;
    }
    
    loadAmbientSound() {
        // Create ambient underwater sound
        const ambient = new THREE.Audio(this.listener);
        
        // Load a sound and set it as the Audio object's buffer
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load('/sounds/underwater_ambient.mp3', (buffer) => {
            ambient.setBuffer(buffer);
            ambient.setLoop(true);
            ambient.setVolume(0.5);
            this.sounds.ambient = ambient;
        });
    }
    
    addPositionalSound(name, position, url, volume = 0.5, loop = false, refDistance = 10) {
        if (!this.listener) return;
        
        // Create positional audio source
        const sound = new THREE.PositionalAudio(this.listener);
        
        // Load sound
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load(url, (buffer) => {
            sound.setBuffer(buffer);
            sound.setRefDistance(refDistance);
            sound.setLoop(loop);
            sound.setVolume(volume);
            this.sounds[name] = sound;
        });
        
        // Set position
        sound.position.copy(position);
        
        return sound;
    }
    
    playSound(name) {
        if (this.sounds[name] && !this.sounds[name].isPlaying) {
            this.sounds[name].play();
        }
    }
    
    stopSound(name) {
        if (this.sounds[name] && this.sounds[name].isPlaying) {
            this.sounds[name].stop();
        }
    }
    
    updateListener(position) {
        if (this.listener) {
            // Listener position is already updated by being attached to the camera
        }
    }
}

// Export components
export { WaterShader, PlanktonParticleSystem, UnderwaterFogEffect, UnderwaterSoundManager }; 