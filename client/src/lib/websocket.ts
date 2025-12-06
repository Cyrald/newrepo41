type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageHandlers: Set<MessageHandler> = new Set();
  private userId: string | null = null;
  private accessToken: string | null = null;

  /**
   * Get the WebSocket URL safely - works on VPS and development environments
   */
  private getWebSocketUrl(token: string): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    
    // Use window.location.host which includes both hostname and port
    // If host is empty (shouldn't happen), fallback to localhost:5000
    const host = window.location.host || "localhost:5000";
    
    const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;
    console.log('[WebSocket] Connecting to:', wsUrl.replace(token, '[REDACTED]'));
    return wsUrl;
  }

  connect(userId: string, accessToken: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    this.userId = userId;
    this.accessToken = accessToken;
    
    try {
      const wsUrl = this.getWebSocketUrl(accessToken);
      console.log('[WebSocket] Creating connection');
      
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        
        this.reconnectAttempts = 0;
      };
      
      this.socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocket] Message:', message.type);
          
          if (message.type === 'auth_success') {
            console.log('[WebSocket] Authenticated successfully');
          }
          
          if (message.type === 'rate_limit') {
            console.warn('[WebSocket] Rate limit exceeded:', message.message);
          }
          
          this.messageHandlers.forEach(handler => {
            try {
              handler(message);
            } catch (error) {
              console.error('[WebSocket] Handler error:', error);
            }
          });
        } catch (error) {
          console.error('[WebSocket] Parse error:', error);
        }
      };
      
      this.socket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
      
      this.socket.onclose = (event) => {
        console.log('[WebSocket] Disconnected', event.code, event.reason);
        this.socket = null;
        
        if (event.code === 1008) {
          console.error('[WebSocket] Auth failed or rate limit exceeded');
          return;
        }
        
        if (this.reconnectAttempts < this.maxReconnectAttempts && this.userId && this.accessToken) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          this.reconnectTimeout = setTimeout(() => {
            console.log('[WebSocket] Attempting reconnection...');
            this.connect(this.userId!, this.accessToken!);
          }, delay);
        } else if (!this.accessToken) {
          console.warn('[WebSocket] Cannot reconnect - missing access token. Please reconnect manually.');
        }
      };
    } catch (error) {
      console.error('[WebSocket] Creation error:', error);
    }
  }
  
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.userId = null;
    this.accessToken = null;
    this.reconnectAttempts = 0;
  }
  
  send(data: WebSocketMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.warn('[WebSocket] Not connected, cannot send:', data.type);
    }
  }
  
  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(handler);
    };
  }
  
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WebSocketClient();
