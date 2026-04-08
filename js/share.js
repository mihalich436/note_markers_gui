const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

let currentProject = null;

if (!projectId) {
    window.location.href = './projects.html';
}

// Загрузка информации о проекте
async function loadProjectInfo() {
    try {
        const response = await apiRequest(`/projects/${projectId}`);
        
        if (response.ok) {
            currentProject = await response.json();
            document.getElementById('projectInfo').innerHTML = `
                <div style="padding: 15px; background: #e8f0fe; border-radius: 8px; border-left: 4px solid #667eea;">
                    <strong style="font-size: 18px;">📄 ${escapeHtml(currentProject.title)}</strong>
                    ${currentProject.description ? `<p style="margin-top: 8px; color: #666;">${escapeHtml(currentProject.description)}</p>` : ''}
                    <p style="margin-top: 8px; font-size: 14px; color: #888;">
                        Владелец: ${escapeHtml(currentProject.owner?.username || 'Unknown')}
                    </p>
                </div>
            `;
            loadAccessUsers();
        } else if (response.status === 403) {
            showMessage('У вас нет прав на управление доступом к этому проекту');
            setTimeout(() => {
                window.location.href = './projects.html';
            }, 2000);
        } else {
            showMessage('Ошибка загрузки проекта');
        }
    } catch (error) {
        showMessage('Ошибка соединения с сервером');
    }
}

// Загрузка списка пользователей с доступом
async function loadAccessUsers() {
    try {
        const response = await apiRequest(`/projects/${projectId}/access`);
        
        if (response.ok) {
            const users = await response.json();
            displayUsers(users);
        } else {
            showMessage('Ошибка загрузки пользователей');
        }
    } catch (error) {
        showMessage('Ошибка загрузки пользователей');
    }
}

// Отображение пользователей
function displayUsers(users) {
    const container = document.getElementById('usersList');
    const currentUsername = localStorage.getItem('username');
    
    if (users.length === 0) {
        container.innerHTML = '<tr><td colspan="4" style="text-align: center;">Нет участников</td></tr>';
        return;
    }

    const isCurrentUserOwner = (users[0].username === currentUsername);
    console.log("Am Owner: " + isCurrentUserOwner)
    
    container.innerHTML = users.map(user => {
        const isOwner = user.role === 'OWNER';
        const canEdit = isCurrentUserOwner && !isOwner;
        
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(user.username)}</strong>
                    ${isOwner ? '<span style="display: inline-block; margin-left: 8px; padding: 2px 8px; background: #667eea; color: white; border-radius: 4px; font-size: 12px;">Владелец</span>' : ''}
                    ${user.username === currentUsername ? '<span style="display: inline-block; margin-left: 8px; padding: 2px 8px; background: #6c757d; color: white; border-radius: 4px; font-size: 12px;">Вы</span>' : ''}
                </td>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.nickname)}</td>
                <td>
                    ${canEdit ? `
                        <select id="role-${user.id}" onchange="updateRole(${user.id}, this.value)" style="padding: 6px 10px; border: 2px solid #e0e0e0; border-radius: 6px;">
                            <option value="READ_ONLY" ${user.role === 'READ_ONLY' ? 'selected' : ''}>📖 Только чтение</option>
                            <option value="CHAT" ${user.role === 'CHAT' ? 'selected' : ''}>💬 Чат</option>
                            <option value="EDITOR" ${user.role === 'EDITOR' ? 'selected' : ''}>✏️ Редактирование</option>
                            <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>✨ Мастер</option>
                        </select>
                    ` : `
                        <span style="display: inline-block; padding: 6px 12px; background: #f0f0f0; border-radius: 6px;">
                            ${user.role === 'OWNER' ? '👑 Владелец' : 
                              user.role === 'ADMIN' ? '✨ Мастер' :
                              user.role === 'CHAT' ? '💬 Чат' :
                              user.role === 'EDITOR' ? '✏️ Редактор' : '📖 Читатель'}
                        </span>
                    `}
                </td>
                <td>
                    ${canEdit ? `
                        <button onclick="removeUser(${user.id})" class="expand-btn" style="color: #dc3545;">
                            🗑️ Удалить
                        </button>
                    ` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

// Добавить пользователя
async function addUser() {
    const email = document.getElementById('inviteEmail').value;
    const role = document.getElementById('roleSelect').value;
    const nickname = document.getElementById('nickname').value;
    const messageDiv = document.getElementById('inviteMessage');
    
    if (!email) {
        messageDiv.innerHTML = '<span style="color: #dc3545;">❌ Введите email пользователя</span>';
        setTimeout(() => messageDiv.innerHTML = '', 3000);
        return;
    }
    
    // Простая валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        messageDiv.innerHTML = '<span style="color: #dc3545;">❌ Введите корректный email</span>';
        setTimeout(() => messageDiv.innerHTML = '', 3000);
        return;
    }
    
    messageDiv.innerHTML = '<span style="color: #667eea;">⏳ Отправка...</span>';
    
    try {
        const response = await apiRequest(`/projects/${projectId}/access`, {
            method: 'POST',
            body: JSON.stringify({ email, role, nickname })
        });
        
        if (response.ok) {
            const message = await response.text();
            messageDiv.innerHTML = `<span style="color: #28a745;">✅ ${message}</span>`;
            document.getElementById('inviteEmail').value = '';
            loadAccessUsers();
            setTimeout(() => messageDiv.innerHTML = '', 3000);
        } else {
            const error = await response.text();
            messageDiv.innerHTML = `<span style="color: #dc3545;">❌ ${error}</span>`;
            setTimeout(() => messageDiv.innerHTML = '', 3000);
        }
    } catch (error) {
        messageDiv.innerHTML = '<span style="color: #dc3545;">❌ Ошибка добавления пользователя</span>';
        setTimeout(() => messageDiv.innerHTML = '', 3000);
    }
}

// Обновить роль пользователя
async function updateRole(userId, newRole) {
    try {
        const response = await apiRequest(`/projects/${projectId}/access/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ role: newRole })
        });
        
        if (response.ok) {
            const message = await response.text();
            showMessage(message, 'success');
            loadAccessUsers();
        } else {
            const error = await response.text();
            showMessage(error);
        }
    } catch (error) {
        showMessage('Ошибка обновления роли');
    }
}

// Удалить пользователя
async function removeUser(userId) {
    if (confirm('Вы уверены, что хотите удалить этого пользователя из проекта?')) {
        try {
            const response = await apiRequest(`/projects/${projectId}/access/${userId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                const message = await response.text();
                showMessage(message, 'success');
                loadAccessUsers();
            } else {
                const error = await response.text();
                showMessage(error);
            }
        } catch (error) {
            showMessage('Ошибка удаления пользователя');
        }
    }
}

// Инициализация страницы
checkAuth();
loadUserInfo();
loadProjectInfo();

// Делаем функции глобальными для доступа из onclick
window.addUser = addUser;
window.updateRole = updateRole;
window.removeUser = removeUser;