// Underwater Odyssey - Client-Side Main Script
console.log('Underwater Odyssey client loaded!');

// WebSocket setup
let socket;
let clientId = null;

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
                // In future steps, we'll update the game state here
                // For now, just log the timestamp
                console.log(`Received game state update, timestamp: ${new Date(message.data.timestamp).toISOString()}`);
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

// Start the connection when the page loads
connectToServer();

// Add a simple UI button to send test messages (for testing purposes)
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    
    // Create a simple button for testing
    const testButton = document.createElement('button');
    testButton.textContent = 'Send Test Message';
    testButton.style.position = 'absolute';
    testButton.style.top = '10px';
    testButton.style.left = '10px';
    testButton.style.zIndex = '1000';
    testButton.addEventListener('click', () => {
        sendMessage(`Test message from client ${clientId || 'unknown'}`);
    });
    
    // Add button to DOM
    document.body.appendChild(testButton);
}); 