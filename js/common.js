// Конфигурация
const API_URL = URL + '/api';
const shareToken = new URLSearchParams(window.location.search).get('share');

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

async function fileUploadRequest(endpoint, options = {}) {
    const token = getToken();
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        }
    });
    
    if (response.status === 401) {
        // logout();
        throw new Error('Неавторизован');
    }
    
    return response;
}

function showMessage(message, type = 'error') {
    const container = document.querySelector('.system-message-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'error' ? 'error-message' : 'success-message';
    messageDiv.textContent = message;
    container.appendChild(messageDiv);
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
        try {
            const token = getToken();
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const usernameFromToken = payload.sub;
                localStorage.setItem('username', usernameFromToken);
                updateUserAvatar(usernameFromToken);
                return;
            }
        } catch (e) {}
        updateUserAvatar(null); // гость
    }
}

// Обновление аватарки и выпадающего меню
function updateUserAvatar(username) {
    const avatarLetterElement = document.getElementById('avatarLetter');
    const userNameSpan = document.getElementById('userNameSpan');
    const userNameItem = userNameSpan ? userNameSpan.parentElement : null;
    const actionsContainer = document.getElementById('userDropdownActions');

    const isGuest = !isAuthenticated() || !username;

    if (avatarLetterElement) {
        avatarLetterElement.textContent = isGuest ? '👤' : username.charAt(0).toUpperCase();
    }

    if (userNameItem) {
        userNameItem.style.display = isGuest ? 'none' : 'block';
    }
    if (userNameSpan && !isGuest) {
        userNameSpan.textContent = username;
    }

    if (actionsContainer) {
        if (isGuest) {
            const shareParam = shareToken ? `?share=${encodeURIComponent(shareToken)}` : '';
            actionsContainer.innerHTML = `
                <div class="user-dropdown-login"
                     onclick="window.location.href='./login.html${shareParam}'; event.stopPropagation();">
                    Войти
                </div>
                <div class="user-dropdown-register"
                     onclick="window.location.href='./register.html${shareParam}'; event.stopPropagation();">
                    Зарегистрироваться
                </div>
            `;
        } else {
            actionsContainer.innerHTML = `
                <div class="user-dropdown-logout"
                     onclick="logout(); event.stopPropagation();">
                    Выйти
                </div>
            `;
        }
    }
}

// Переключение выпадающего меню (работает и для гостя)
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