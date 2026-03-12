/**
 * 🌉 Script Bridge
 * Handles communication between Viewer (Web Page) and UserScript (Tampermonkey).
 * Uses CustomEvent for same-page communication.
 */

class ScriptBridge {
    constructor() {
        this.pendingRequests = new Map();
        
        // Listen for responses from Tampermonkey
        window.addEventListener('MYLIB_BRIDGE_RESPONSE', (event) => this.handleMessage(event));
    }

    /**
     * Checks if the bridge is connected (Tampermonkey loaded)
     */
    get isConnected() {
        return !!window._mylibBridgeReady;
    }

    /**
     * Handles incoming responses from Tampermonkey
     */
    handleMessage(event) {
        const { requestId, payload, error } = event.detail || {};

        if (!requestId) return;

        const resolver = this.pendingRequests.get(requestId);
        if (resolver) {
            if (error) {
                resolver.reject(new Error(error));
            } else {
                resolver.resolve(payload);
            }
            this.pendingRequests.delete(requestId);
        }
    }

    /**
     * Sends a fetch request to Tampermonkey (CORS bypass)
     * @param {string} url - Target URL
     * @param {Object} options - { responseType: 'arraybuffer'|'text', headers: {} }
     * @returns {Promise<Uint8Array|string>} Response data
     */
    async fetch(url, options = {}) {
        if (!this.isConnected) {
            console.warn('🌉 Bridge not connected');
            return null;
        }

        const requestId = this.generateId();
        
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });

            // Send request to Tampermonkey via CustomEvent
            window.dispatchEvent(new CustomEvent('MYLIB_BRIDGE_REQUEST', {
                detail: {
                    requestId: requestId,
                    url: url,
                    options: options
                }
            }));
            
            // Timeout safety
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.get(requestId).reject(new Error('Bridge Request Timeout'));
                    this.pendingRequests.delete(requestId);
                }
            }, 120000); // 120s timeout (large files)
        });
    }

    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
}

// Export singleton
const bridge = new ScriptBridge();
window.mylibBridge = bridge;

console.log('✅ Script Bridge loaded');
