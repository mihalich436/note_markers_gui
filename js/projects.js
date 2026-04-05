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

// Отображение проектов
function displayProjects(projects) {
    const container = document.getElementById('projectsList');
    
    if (projects.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666;">У вас пока нет проектов. Создайте первый!</p>';
        return;
    }
    
    container.innerHTML = projects.map(project => `
        <div class="project-card" onclick="openProject(${project.id})">
            <div class="project-title">📄 ${escapeHtml(project.title)}</div>
            <button class="expand-btn" onclick="event.stopPropagation(); toggleDescription(${project.id})">
                📖 Показать описание
            </button>
            <div id="desc-${project.id}" class="project-description hidden">
                ${project.description ? escapeHtml(project.description) : 'Описание отсутствует'}
            </div>
            <div style="margin-top: 15px; display: flex; gap: 10px;">
                <button class="expand-btn" onclick="event.stopPropagation(); editProject(${project.id}, '${escapeHtml(project.title)}', ${JSON.stringify(escapeHtml(project.description || ''))})" style="color: #28a745;">✏️ Редактировать</button>
                <button class="expand-btn" onclick="event.stopPropagation(); shareProject(${project.id})" style="color: #667eea;">👥 Поделиться</button>
                <button class="expand-btn" onclick="event.stopPropagation(); deleteProject(${project.id})" style="color: #dc3545;">🗑️ Удалить</button>
            </div>
        </div>
    `).join('');
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
    // Переходим на страницу заметок, передавая ID проекта в URL
    window.location.href = `./project.html?id=${projectId}`;
}

// Управление доступом
function shareProject(projectId) {
    window.location.href = `/share.html?id=${projectId}`;
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
            // loadProjects(); // Перезагружаем только список проектов
            const project = await response.json();
            console.log(project)
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
            showMessage('Проект обновлен успешно', 'success');
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
                showMessage('Проект удален успешно', 'success');
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

// Инициализация
checkAuth();
loadUserInfo();
loadProjects();