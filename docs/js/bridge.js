/**
 * 🌉 Script Bridge
 * Handles communication between Viewer (Web Page) and UserScript (extension context).
 * Allows Viewer to execute privileged actions (like GM_xmlhttpRequest) via UserScript.
 */

class ScriptBridge {
    constructor() {
        this.pendingRequests = new Map();
        
        // Listen for responses
        window.addEventListener('message', (event) => this.handleMessage(event));
    }

    /**
     * Checks if the bridge is connected (opener exists)
     */
    get isConnected() {
        return !!(window.opener && !window.opener.closed);
    }

    /**
     * Handles incoming messages from UserScript
     */
    handleMessage(event) {
        const { type, payload, requestId, error } = event.data;

        if (type === 'TOKI_BRIDGE_RESPONSE') {
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
    }

    /**
     * Sends a request to UserScript to fetch a URL (acting as proxy)
     * @param {string} url - Target URL
     * @param {Object} options - Fetch options (method, headers, blob, etc.)
     * @returns {Promise<any>} Response data
     */
    async fetch(url, options = {}) {
        if (!this.isConnected) {
            return null; // Graceful fallback
        }

        const requestId = this.generateId();
        
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });

            // Send Request to UserScript
            window.opener.postMessage({
                type: 'TOKI_BRIDGE_REQUEST',
                requestId: requestId,
                url: url,
                options: options
            }, '*');
            
            // Timeout safety
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.get(requestId).reject(new Error("Bridge Request Timeout"));
                    this.pendingRequests.delete(requestId);
                }
            }, 30000); // 30s timeout
        });
    }

    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
}

// Export singleton
const bridge = new ScriptBridge();
window.tokiBridge = bridge;
