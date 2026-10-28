let editingProjectId = null;
let currentProjects = [];

async function loadProjects() {
    try {
        const response = await apiRequest('/projects');
        if (response.ok) {
            currentProjects = await response.json();
            displayProjects(currentProjects);
        } else {
            showMessage(t('projects.error_load'));
        }
    } catch (error) {
        showMessage(t('common.error_connection'));
    }
}

function getProjectContextDiv(project) {
    return project.owner ? `
        <div class="project-menu-container">
            <button class="menu-trigger-btn" onclick="event.stopPropagation(); toggleProjectMenu(${project.id}, this)">
                ⋮
            </button>
            <div id="menu-${project.id}" class="project-context-menu">
                <div class="menu-item" onclick="event.stopPropagation(); editProjectFromCard(${project.id})">
                    ✏️ ${escapeHtml(t('common.edit'))}
                </div>
                <div class="menu-item" onclick="event.stopPropagation(); shareProject(${project.id})">
                    👥 ${escapeHtml(t('common.share'))}
                </div>
                <div class="menu-item menu-item-danger" onclick="event.stopPropagation(); deleteProjectFromCard(${project.id})">
                    🗑️ ${escapeHtml(t('common.delete'))}
                </div>
            </div>
        </div>` : '';
}

function displayProjects(projects) {
    const container = document.getElementById('projectsList');

    if (projects.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #666;">${escapeHtml(t('projects.empty'))}</p>`;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="project-card" data-project-id="${project.id}" data-project-title="${escapeHtml(project.title)}" data-project-description="${escapeHtml(project.description || '')}" onclick="openProject(${project.id})">
            <div class="project-card-header">
                <div class="project-title">📁 ${escapeHtml(project.title)}</div>
                ${getProjectContextDiv(project)}
            </div>
            <button class="expand-btn" onclick="event.stopPropagation(); toggleDescription(${project.id})">
                ${escapeHtml(t('projects.description_toggle'))}
            </button>
            <div id="desc-${project.id}" class="project-description hidden">
                ${project.description ? escapeHtml(project.description) : escapeHtml(t('common.description_missing'))}
            </div>
        </div>
    `).join('');
}

function closeAllMenus() {
    document.querySelectorAll('.project-context-menu.active').forEach(menu => {
        menu.classList.remove('active');
    });
    const addBtn = document.getElementById('addButton');
    if (addBtn) addBtn.style.display = 'flex';
}

function toggleProjectMenu(projectId, btn) {
    event.stopPropagation();
    const menu = document.getElementById(`menu-${projectId}`);
    const isActive = menu.classList.contains('active');

    closeAllMenus();

    if (!isActive) {
        const addBtn = document.getElementById('addButton');
        if (addBtn) addBtn.style.display = 'none';
        menu.classList.add('active');
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target !== btn) {
                    menu.classList.remove('active');
                    document.removeEventListener('click', closeMenu);
                    const addBtn = document.getElementById('addButton');
                    if (addBtn) addBtn.style.display = 'flex';
                }
            });
        }, 0);
    }
}

function getProjectCardData(projectId) {
    const card = document.querySelector(`.project-card[data-project-id="${projectId}"]`);
    if (card) {
        return {
            title: card.getAttribute('data-project-title'),
            description: card.getAttribute('data-project-description')
        };
    }
    return null;
}

function editProjectFromCard(projectId) {
    const projectData = getProjectCardData(projectId);
    if (projectData) {
        editProject(projectId, projectData.title, projectData.description);
    }
    closeAllMenus();
}

function deleteProjectFromCard(projectId) {
    closeAllMenus();
    deleteProject(projectId);
}

function toggleDescription(projectId) {
    const descElement = document.getElementById(`desc-${projectId}`);
    const btn = descElement.previousElementSibling;

    if (descElement.classList.contains('hidden')) {
        descElement.classList.remove('hidden');
        btn.textContent = t('common.description_toggle_close');
    } else {
        descElement.classList.add('hidden');
        btn.textContent = t('projects.description_toggle');
    }
}

function openProject(projectId) {
    window.location.href = `./project.html?id=${projectId}`;
}

function shareProject(projectId) {
    closeAllMenus();
    window.location.href = `./share.html?id=${projectId}`;
}

async function createProject(title, description) {
    try {
        const response = await apiRequest('/projects', {
            method: 'POST',
            body: JSON.stringify({ title, description })
        });

        if (response.ok) {
            closeProjectModal();
            const project = await response.json();
            currentProjects.push(project);
            displayProjects(currentProjects);
            showMessage(t('projects.created'), 'success');
        } else {
            showMessage(t('projects.error_create'));
        }
    } catch (error) {
        showMessage(t('projects.error_create'));
    }
}

async function updateProject(id, title, description) {
    try {
        const response = await apiRequest(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description })
        });

        if (response.ok) {
            closeProjectModal();
            loadProjects();
            showMessage(t('projects.updated'), 'success');
        } else {
            showMessage(t('projects.error_update'));
        }
    } catch (error) {
        showMessage(t('projects.error_update'));
    }
}

async function deleteProject(id) {
    if (confirm(t('common.confirm_delete_project'))) {
        try {
            const response = await apiRequest(`/projects/${id}`, { method: 'DELETE' });

            if (response.ok) {
                loadProjects();
                showMessage(t('projects.deleted'), 'success');
            } else {
                showMessage(t('projects.error_delete'));
            }
        } catch (error) {
            showMessage(t('projects.error_delete'));
        }
    }
}

function showCreateProjectModal() {
    editingProjectId = null;
    document.getElementById('projectModalTitle').textContent = t('projects.create_title');
    document.getElementById('projectTitle').value = '';
    document.getElementById('projectDescription').value = '';
    document.getElementById('projectModal').classList.add('active');
}

function editProject(id, title, description) {
    editingProjectId = id;
    document.getElementById('projectModalTitle').textContent = t('projects.edit_title');
    document.getElementById('projectTitle').value = title;
    document.getElementById('projectDescription').value = description;
    document.getElementById('projectModal').classList.add('active');
}

function closeProjectModal() {
    document.getElementById('projectModal').classList.remove('active');
}

document.getElementById('projectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('projectTitle').value;
    const description = document.getElementById('projectDescription').value;

    if (editingProjectId) {
        await updateProject(editingProjectId, title, description);
    } else {
        await createProject(title, description);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllMenus();
});

// Инициализация: дождаться i18n, потом загружать данные
(async () => {
    await initI18n();
    loadUserInfo();
    loadProjects();
})();