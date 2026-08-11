import {  io, Socket} from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:4000';

let socket: Socket | null = null;

export const wsService = {
    async connect(): Promise<Socket> { 
        if (socket?.connected) return socket;
        const token = await SecureStore.getItemAsync('glimms_access_token');
        socket = io(WS_URL, {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10,
        });
        return socket;
    },
    getSocket: () => socket,
    disconnect: () => { socket?.disconnect(); socket = null}
}