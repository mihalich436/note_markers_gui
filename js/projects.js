let editingProjectId = null;

// Загрузка проектов (только метаданные, без заметок!)
async function loadProjects() {
    try {
        const response = await apiRequest('/projects');
        console.log(response)
        
        if (response.ok) {
            const projects = await response.json();
            this.projects = projects;
            console.log(projects)
            displayProjects(projects);
        } else {
            showMessage('Ошибка загрузки проектов');
        }
    } catch (error) {
        console.log(error)
        showMessage('Ошибка соединения с сервером');
    }
}

function getProjectContextDiv(project) {
    return project.owner ? `<div class="project-menu-container">
                    <button class="menu-trigger-btn" onclick="event.stopPropagation(); toggleProjectMenu(${project.id}, this)">
                        ⋮
                    </button>
                    <div id="menu-${project.id}" class="project-context-menu">
                        <div class="menu-item" onclick="event.stopPropagation(); editProjectFromCard(${project.id})">
                            ✏️ Редактировать
                        </div>
                        <div class="menu-item" onclick="event.stopPropagation(); shareProject(${project.id})">
                            👥 Поделиться
                        </div>
                        <div class="menu-item menu-item-danger" onclick="event.stopPropagation(); deleteProjectFromCard(${project.id})">
                            🗑️ Удалить
                        </div>
                    </div>
                </div>` : '';
}

// Отображение проектов
function displayProjects(projects) {
    const container = document.getElementById('projectsList');
    
    if (projects.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666;">У вас пока нет проектов. Создайте первый!</p>';
        return;
    }
    
    container.innerHTML = projects.map(project => `
        <div class="project-card" data-project-id="${project.id}" data-project-title="${escapeHtml(project.title)}" data-project-description="${escapeHtml(project.description || '')}" onclick="openProject(${project.id})">
            <div class="project-card-header">
                <div class="project-title">📁 ${escapeHtml(project.title)}</div>
                ${getProjectContextDiv(project)}
            </div>
            <button class="expand-btn" onclick="event.stopPropagation(); toggleDescription(${project.id})">
                📖 Показать описание
            </button>
            <div id="desc-${project.id}" class="project-description hidden">
                ${project.description ? escapeHtml(project.description) : 'Описание отсутствует'}
            </div>
        </div>
    `).join('');
}

// Закрыть все открытые меню
function closeAllMenus() {
    document.querySelectorAll('.project-context-menu.active').forEach(menu => {
        menu.classList.remove('active');
    });
}

// Переключение контекстного меню
function toggleProjectMenu(projectId, btn) {
    event.stopPropagation();
    const menu = document.getElementById(`menu-${projectId}`);
    const isActive = menu.classList.contains('active');
    
    // Закрываем все другие меню
    closeAllMenus();
    
    if (!isActive) {
        menu.classList.add('active');
        // Закрыть меню при клике вне его
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target !== btn) {
                    menu.classList.remove('active');
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 0);
    }
}

// Получение данных проекта из карточки
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

// Редактирование проекта (из контекстного меню)
function editProjectFromCard(projectId) {
    const projectData = getProjectCardData(projectId);
    if (projectData) {
        editProject(projectId, projectData.title, projectData.description);
    }
    closeAllMenus();
}

// Удаление проекта (из контекстного меню)
function deleteProjectFromCard(projectId) {
    closeAllMenus();
    deleteProject(projectId);
}

function toggleDescription(projectId) {
    const descElement = document.getElementById(`desc-${projectId}`);
    const btn = descElement.previousElementSibling;
    
    if (descElement.classList.contains('hidden')) {
        descElement.classList.remove('hidden');
        btn.textContent = '📘 Скрыть описание';
    } else {
        descElement.classList.add('hidden');
        btn.textContent = '📖 Показать описание';
    }
}

// Открытие проекта - переход на отдельную страницу с заметками
function openProject(projectId) {
    window.location.href = `./project.html?id=${projectId}`;
}

// Управление доступом
function shareProject(projectId) {
    closeAllMenus();
    window.location.href = `./share.html?id=${projectId}`;
}

// Создание проекта
async function createProject(title, description) {
    try {
        const response = await apiRequest('/projects', {
            method: 'POST',
            body: JSON.stringify({ title, description })
        });
        console.log(response)
        
        if (response.ok) {
            closeProjectModal();
            const project = await response.json();
            this.projects.push(project);
            displayProjects(this.projects);
            showMessage('Проект создан успешно', 'success');
        } else {
            showMessage('Ошибка создания проекта');
        }
    } catch (error) {
        showMessage('Ошибка создания проекта');
    }
}

// Редактирование проекта
async function updateProject(id, title, description) {
    try {
        const response = await apiRequest(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description })
        });
        
        if (response.ok) {
            closeProjectModal();
            loadProjects();
            showMessage('Проект обновлён успешно', 'success');
        } else {
            showMessage('Ошибка обновления проекта');
        }
    } catch (error) {
        showMessage('Ошибка обновления проекта');
    }
}

// Удаление проекта
async function deleteProject(id) {
    if (confirm('Вы уверены, что хотите удалить этот проект? Все заметки также будут удалены.')) {
        try {
            const response = await apiRequest(`/projects/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                loadProjects();
                showMessage('Проект удалён успешно', 'success');
            } else {
                showMessage('Ошибка удаления проекта');
            }
        } catch (error) {
            showMessage('Ошибка удаления проекта');
        }
    }
}

// Модальное окно
function showCreateProjectModal() {
    editingProjectId = null;
    document.getElementById('projectModalTitle').textContent = 'Создать проект';
    document.getElementById('projectTitle').value = '';
    document.getElementById('projectDescription').value = '';
    document.getElementById('projectModal').classList.add('active');
}

function editProject(id, title, description) {
    editingProjectId = id;
    document.getElementById('projectModalTitle').textContent = 'Редактировать проект';
    document.getElementById('projectTitle').value = title;
    document.getElementById('projectDescription').value = description;
    document.getElementById('projectModal').classList.add('active');
}

function closeProjectModal() {
    document.getElementById('projectModal').classList.remove('active');
}

// Обработчики форм
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

// Закрытие меню при нажатии ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllMenus();
    }
});

// Инициализация
checkAuth();
loadUserInfo();
loadProjects();