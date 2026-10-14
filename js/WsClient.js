const WS_REQ_PREFIX = '/app';
const WS_URL = URL + '/ws';

class WsClient {
    /**
     * @param {string} token       JWT пользователя
     * @param {string} shareToken  токен шаринга (если есть)
     * @param {string} topic       тип топика: 'map' | 'note'
     * @param {string|number} entityId  id сущности (mapId / noteId)
     */
    constructor(token, shareToken, topic, entityId) {
        this.token = token;
        this.shareToken = shareToken;
        this.topic = topic;
        this.entityId = entityId;
        this.stompClient = null;
        this.messageHandlers = [];
        this.connectionStatusHandlers = [];
    }

    connect() {
        const socket = new SockJS(WS_URL);
        this.stompClient = Stomp.over(socket);
        this.stompClient.debug = () => {};

        const headers = {};
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        else if (this.shareToken) headers['X-Share-Token'] = this.shareToken;

        this.stompClient.connect(
            headers,
            this.onConnected.bind(this),
            this.onError.bind(this)
        );
    }

    onConnected() {
        console.log(`Connected to WebSocket (${this.topic}/${this.entityId})`);
        this.stompClient.subscribe(
            `/topic/${this.topic}/${this.entityId}`,
            this.onMessageReceived.bind(this)
        );
        this.updateConnectionStatus(true);
    }

    onError(error) {
        console.error('WebSocket error:', error);
        this.updateConnectionStatus(false);
        setTimeout(() => {
            if (!this.stompClient || !this.stompClient.connected) {
                console.log('Reconnecting...');
                this.connect();
            }
        }, 5000);
    }

    onMessageReceived(message) {
        const content = JSON.parse(message.body);
        this.messageHandlers.forEach(handler => handler(content));
    }

    sendMessage(destination, message) {
        if (!this.stompClient || !this.stompClient.connected) {
            console.error('Not connected to WebSocket');
            return false;
        }
        this.stompClient.send(
            WS_REQ_PREFIX + destination,
            {},
            JSON.stringify(message)
        );
        return true;
    }

    disconnect() {
        if (this.stompClient && this.stompClient.connected) {
            this.stompClient.disconnect(() => {
                console.log('Disconnected from WebSocket');
                this.updateConnectionStatus(false);
            });
        }
    }

    onMessage(handler) { this.messageHandlers.push(handler); }
    onConnectionStatus(handler) { this.connectionStatusHandlers.push(handler); }
    updateConnectionStatus(isConnected) {
        this.connectionStatusHandlers.forEach(handler => handler(isConnected));
    }
}