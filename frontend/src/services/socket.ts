import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';

class SocketService {
  private socket: WebSocket | null = null;
  private userId: string | null = null;
  private token: string | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(userId: string, token: string) {
    this.userId = userId;
    this.token = token;
    
    const wsUrl = API_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    this.socket = new WebSocket(`${wsUrl}/ws/${userId}?token=${token}`);
    
    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const listeners = this.listeners.get(data.type);
        if (listeners) {
          listeners.forEach(callback => callback(data));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => {
          if (this.userId && this.token) {
            this.connect(this.userId, this.token);
          }
        }, 2000 * this.reconnectAttempts);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.userId = null;
    this.token = null;
  }

  send(type: string, data: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, ...data }));
    }
  }

  sendMessage(receiverId: string, content: string, messageType: string = 'text', groupId?: string) {
    this.send('message', {
      data: {
        receiver_id: receiverId,
        content,
        message_type: messageType,
        group_id: groupId
      }
    });
  }

  sendTyping(receiverId: string) {
    this.send('typing', { receiver_id: receiverId });
  }

  sendCallRequest(targetId: string, callType: 'voice' | 'video') {
    this.send('call_request', { target_id: targetId, call_type: callType });
  }

  sendCallResponse(targetId: string, accepted: boolean) {
    this.send('call_response', { target_id: targetId, accepted });
  }

  sendCallSignal(targetId: string, signal: any) {
    this.send('call_signal', { target_id: targetId, signal });
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: any) => void) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }
}

export const socketService = new SocketService();
