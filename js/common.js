// Конфигурация
const API_URL = URL + '/api';

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
        updateUserAvatar(username);
    } else {
        // Можно загрузить из JWT или отдельного запроса
        try {
            const token = getToken();
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const usernameFromToken = payload.sub;
                localStorage.setItem('username', usernameFromToken);
                updateUserAvatar(usernameFromToken);
            }
        } catch (e) {}
    }
}

// Обновление аватарки пользователя
function updateUserAvatar(username) {
    const avatarElement = document.getElementById('userAvatar');
    const avatarLetterElement = document.getElementById('avatarLetter');
    const userNameSpan = document.getElementById('userNameSpan');
    
    if (avatarLetterElement && username) {
        avatarLetterElement.textContent = username.charAt(0).toUpperCase();
    }
    
    if (userNameSpan && username) {
        userNameSpan.textContent = username;
    }
}

// Переключение выпадающего меню пользователя
function toggleUserMenu() {
    const menu = document.getElementById('userDropdownMenu');
    if (menu) {
        menu.classList.toggle('active');
    }
}

// Закрытие выпадающего меню при клике вне его
document.addEventListener('click', function(event) {
    const userInfo = document.querySelector('.user-info');
    const menu = document.getElementById('userDropdownMenu');
    
    if (userInfo && menu && !userInfo.contains(event.target)) {
        menu.classList.remove('active');
    }
});