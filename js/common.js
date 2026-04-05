// Конфигурация
const API_URL = 'http://localhost:8080/api'; // Замените на ваш URL

// Общие функции
function getToken() {
    return localStorage.getItem('token');
}

function isAuthenticated() {
    return !!getToken();
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = './login.html';
}

async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        }
    });
    
    if (response.status === 401) {
        logout();
        throw new Error('Неавторизован');
    }
    
    return response;
}

function showMessage(message, type = 'error') {
    const container = document.querySelector('.container');
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'error' ? 'error-message' : 'success-message';
    messageDiv.textContent = message;
    container.prepend(messageDiv);
    setTimeout(() => messageDiv.remove(), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Проверка авторизации при загрузке страницы
function checkAuth() {
    if (!isAuthenticated() && !window.location.pathname.includes('login') && 
        !window.location.pathname.includes('register') && !window.location.pathname.includes('invite')) {
        window.location.href = './login.html';
    }
}

// Загрузка информации о пользователе
async function loadUserInfo() {
    const username = localStorage.getItem('username');
    if (username) {
        document.getElementById('username').textContent = username;
    } else {
        // Можно загрузить из JWT или отдельного запроса
        try {
            const token = getToken();
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                document.getElementById('username').textContent = payload.sub;
                localStorage.setItem('username', payload.sub);
            }
        } catch (e) {}
    }
}