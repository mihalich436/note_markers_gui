const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

let currentProject = null;
let shareTokenGenerated = null;

if (!projectId) {
    window.location.href = './projects.html';
}

async function loadProjectInfo() {
    try {
        const response = await apiRequest(`/projects/${projectId}`);

        if (response.ok) {
            const projectData = await response.json();
            currentProject = projectData.project;
            document.getElementById('projectInfo').textContent = ` ${t('share.title')}: ${currentProject.title}`;
            loadAccessUsers();
        } else if (response.status === 403) {
            showMessage(t('share.error_no_permission'));
            setTimeout(() => { window.location.href = './projects.html'; }, 2000);
        } else {
            showMessage(t('share.error_load_project'));
        }
    } catch (error) {
        showMessage(t('common.error_connection'));
    }
}

async function getShareLink() {
    try {
        const response = await apiRequest(`/projects/${projectId}/share-link`);

        if (response.ok) {
            shareTokenGenerated = await response.text();
            displayShareLink();
        } else {
            showMessage(t('share.link_load_error'));
        }
    } catch (error) {
        showMessage(t('share.link_load_error'));
    }
}

function displayShareLink() {
    const shareLinkInput = document.getElementById('shareLink');
    const revokeShareLinkBtn = document.getElementById('revokeShareLinkBtn');
    const createShareLinkBtn = document.getElementById('createShareLinkBtn');

    if (shareTokenGenerated) {
        if (shareLinkInput) shareLinkInput.value = `lazydmnotes.app/project.html?id=${projectId}&share=${shareTokenGenerated}`;
        if (revokeShareLinkBtn && createShareLinkBtn) {
            createShareLinkBtn.style.display = 'none';
            revokeShareLinkBtn.style.display = 'inline-block';
        }
    } else {
        if (shareLinkInput) shareLinkInput.value = '';
        if (revokeShareLinkBtn && createShareLinkBtn) {
            revokeShareLinkBtn.style.display = 'none';
            createShareLinkBtn.style.display = 'inline-block';
        }
    }
}

async function loadAccessUsers() {
    try {
        const response = await apiRequest(`/projects/${projectId}/access`);

        if (response.ok) {
            const users = await response.json();
            displayUsers(users);
        } else {
            showMessage(t('share.error_load_users'));
        }
    } catch (error) {
        showMessage(t('share.error_load_users'));
    }
}

function roleLabel(role) {
    switch (role) {
        case 'OWNER': return t('share.role_owner');
        case 'ADMIN': return t('share.role_admin');
        case 'CHAT': return t('share.role_chat_short');
        case 'EDITOR': return t('share.role_editor_short');
        case 'READ_ONLY':
        default: return t('share.role_reader');
    }
}

function displayUsers(users) {
    const container = document.getElementById('usersList');
    const currentUsername = localStorage.getItem('username');

    if (users.length === 0) {
        container.innerHTML = `<tr><td colspan="5" style="text-align: center;">${escapeHtml(t('share.no_members'))}</td></tr>`;
        return;
    }

    const isCurrentUserOwner = (users[0].username === currentUsername);

    container.innerHTML = users.map(user => {
        const isOwner = user.role === 'OWNER';
        const canEdit = isCurrentUserOwner && !isOwner;
        const username = escapeHtml(user.username);

        return `
            <tr>
                <td>
                    <strong>${username}</strong>
                    ${isOwner ? `<span style="display: inline-block; margin-left: 8px; padding: 2px 8px; background: #667eea; color: white; border-radius: 4px; font-size: 12px;">${escapeHtml(t('common.owner'))}</span>` : ''}
                    ${user.username === currentUsername ? `<span style="display: inline-block; margin-left: 8px; padding: 2px 8px; background: #6c757d; color: white; border-radius: 4px; font-size: 12px;">${escapeHtml(t('common.you'))}</span>` : ''}
                </td>
                <td>${escapeHtml(user.email)}</td>
                <td><input type="text" id="nickname-${user.id}" oninput="onUpdateUser(${user.id})" placeholder="${username}" title="${escapeHtml(t('share.nickname_title'))}" class="nickname-input" value="${escapeHtml(user.nickname)}"></td>
                <td>
                    ${canEdit ? `
                        <select id="role-${user.id}" onchange="onUpdateUser(${user.id})" class="role-select">
                            <option value="READ_ONLY" ${user.role === 'READ_ONLY' ? 'selected' : ''}>${escapeHtml(t('share.role_readonly'))}</option>
                            <option value="CHAT" ${user.role === 'CHAT' ? 'selected' : ''}>${escapeHtml(t('share.role_chat'))}</option>
                            <option value="EDITOR" ${user.role === 'EDITOR' ? 'selected' : ''}>${escapeHtml(t('share.role_editor'))}</option>
                            <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>${escapeHtml(t('share.role_admin'))}</option>
                        </select>
                    ` : `
                        <span style="display: inline-block; padding: 6px 12px; background: #f0f0f0; border-radius: 6px;">
                            ${escapeHtml(roleLabel(user.role))}
                        </span>
                    `}
                </td>
                <td>
                    ${canEdit ? `
                        <button id="save-${user.id}" onclick="saveRoleAndNickname(${user.id})" class="save-row-btn" style="display: none;"></button>
                        <button id="remove-${user.id}" onclick="removeUser(${user.id})" class="remove-row-btn"></button>
                    ` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

async function addUser() {
    const email = document.getElementById('inviteEmail').value;
    const role = document.getElementById('roleSelect').value;
    const nickname = document.getElementById('nickname').value;
    const messageDiv = document.getElementById('inviteMessage');

    if (!email) {
        messageDiv.innerHTML = `<span style="color: #dc3545;">${escapeHtml(t('share.invite_email_required'))}</span>`;
        setTimeout(() => messageDiv.innerHTML = '', 3000);
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        messageDiv.innerHTML = `<span style="color: #dc3545;">${escapeHtml(t('share.invite_email_invalid'))}</span>`;
        setTimeout(() => messageDiv.innerHTML = '', 3000);
        return;
    }

    messageDiv.innerHTML = `<span style="color: #667eea;">${escapeHtml(t('share.invite_sending'))}</span>`;

    try {
        const response = await apiRequest(`/projects/${projectId}/access`, {
            method: 'POST',
            body: JSON.stringify({ email, role, nickname })
        });

        if (response.ok) {
            const message = await response.text();
            messageDiv.innerHTML = `<span style="color: #28a745;">${escapeHtml(t('share.invite_success', { message }))}</span>`;
            document.getElementById('inviteEmail').value = '';
            loadAccessUsers();
            setTimeout(() => messageDiv.innerHTML = '', 3000);
        } else {
            const error = await response.text();
            messageDiv.innerHTML = `<span style="color: #dc3545;">${escapeHtml(t('share.invite_error_msg', { message: error }))}</span>`;
            setTimeout(() => messageDiv.innerHTML = '', 3000);
        }
    } catch (error) {
        messageDiv.innerHTML = `<span style="color: #dc3545;">${escapeHtml(t('share.invite_error'))}</span>`;
        setTimeout(() => messageDiv.innerHTML = '', 3000);
    }
}

function onUpdateUser(userId) {
    const removeBtn = document.getElementById(`remove-${userId}`);
    const saveBtn = document.getElementById(`save-${userId}`);
    if (removeBtn && saveBtn) {
        removeBtn.style.display = 'none';
        saveBtn.style.display = 'inline-block';
    }
}

function onSaveUser(userId) {
    const removeBtn = document.getElementById(`remove-${userId}`);
    const saveBtn = document.getElementById(`save-${userId}`);
    if (removeBtn && saveBtn) {
        removeBtn.style.display = 'inline-block';
        saveBtn.style.display = 'none';
    }
}

async function saveRoleAndNickname(userId) {
    const newRole = document.getElementById(`role-${userId}`);
    const newNick = document.getElementById(`nickname-${userId}`);
    try {
        const response = await apiRequest(`/projects/${projectId}/access/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ role: newRole.value, nickname: newNick.value })
        });

        if (response.ok) {
            const message = await response.text();
            showMessage(message, 'success');
            onSaveUser(userId);
        } else {
            const error = await response.text();
            showMessage(error);
        }
    } catch (error) {
        showMessage(t('share.update_error'));
    }
}

async function removeUser(userId) {
    if (confirm(t('common.confirm_remove_user'))) {
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
            showMessage(t('share.user_remove_error'));
        }
    }
}

async function createShareLink() {
    try {
        const response = await apiRequest(`/projects/${projectId}/share-link`, {
            method: 'POST',
            body: ""
        });

        if (response.ok) {
            shareTokenGenerated = await response.text();
            displayShareLink();
            showMessage(t('share.link_created'), 'success');
        } else {
            const error = await response.text();
            showMessage(error);
        }
    } catch (error) {
        showMessage(t('share.link_create_error'));
    }
}

async function revokeShareLink() {
    if (confirm(t('common.confirm_revoke_link'))) {
        try {
            const response = await apiRequest(`/projects/${projectId}/share-link`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const message = await response.text();
                showMessage(message, 'success');
                shareTokenGenerated = null;
                displayShareLink();
            } else {
                const error = await response.text();
                showMessage(error);
            }
        } catch (error) {
            showMessage(t('share.link_revoke_error'));
        }
    }
}

// Инициализация после i18n
(async () => {
    await initI18n();
    checkAuth();
    loadUserInfo();
    loadProjectInfo();
    getShareLink();
})();

window.addUser = addUser;
window.onUpdateUser = onUpdateUser;
window.removeUser = removeUser;