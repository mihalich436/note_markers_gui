const WS_REQ_PREFIX = '/app';
const WS_URL = 'http://localhost:8080/ws';

class WsClient {
    constructor(token, mapId) {
        this.token = token;
        this.mapId = mapId;
        this.stompClient = null;
        this.messageHandlers = [];
        this.connectionStatusHandlers = [];
    }
    
    // Подключение к WebSocket
    connect() {
        // Используем SockJS для надежности (работает везде)
        const socket = new SockJS(WS_URL/*, connectHeaders: {'Authorization': `Bearer ${this.token}`}*/);
        this.stompClient = Stomp.over(socket);

        // this.stompClient.connectHeaders = {'Authorization': `Bearer ${this.token}`};
        
        // Отключаем отладочный вывод (опционально)
        this.stompClient.debug = () => {};
        
        this.stompClient.connect(
            {'Authorization': `Bearer ${this.token}`},  // headers
            this.onConnected.bind(this),
            this.onError.bind(this)
        );
    }
    
    // Обработка успешного подключения
    onConnected() {
        console.log('Connected to WebSocket');
        
        // Подписываемся на комнату чата
        this.stompClient.subscribe(
            `/topic/map/${this.mapId}`,
            this.onMessageReceived.bind(this)
        );
        
        this.updateConnectionStatus(true);
    }
    
    // Обработка ошибки подключения
    onError(error) {
        console.error('WebSocket error:', error);
        this.updateConnectionStatus(false);
        
        // Пытаемся переподключиться через 5 секунд
        setTimeout(() => {
            if (!this.stompClient || !this.stompClient.connected) {
                console.log('Reconnecting...');
                this.connect();
            }
        }, 5000);
    }
    
    // Получение сообщения
    onMessageReceived(message) {
        console.log('ws message received')
        const content = JSON.parse(message.body);
        console.log(content)
        this.messageHandlers.forEach(handler => handler(content));
    }
    
    // Отправка сообщения
    sendMessage(destination, message) {
        if (!this.stompClient || !this.stompClient.connected) {
            console.error('Not connected to WebSocket');
            return false;
        }
        
        // const message = {
        //     content: content,
        //     type: 'CHAT',
        //     timestamp: new Date().toISOString()
        // };
        
        this.stompClient.send(
            WS_REQ_PREFIX + destination,
            {},
            JSON.stringify(message)
        );
        
        return true;
    }
    
    // Отключение
    disconnect() {
        if (this.stompClient && this.stompClient.connected) {
            this.stompClient.disconnect(() => {
                console.log('Disconnected from WebSocket');
                this.updateConnectionStatus(false);
            });
        }
    }
    
    // Регистрация обработчика сообщений
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    
    // Регистрация обработчика статуса соединения
    onConnectionStatus(handler) {
        this.connectionStatusHandlers.push(handler);
    }
    
    updateConnectionStatus(isConnected) {
        this.connectionStatusHandlers.forEach(handler => handler(isConnected));
    }
}