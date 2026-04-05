// Получаем ID проекта из URL (поддержка нескольких окон)
const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

let editingNoteId = null;

if (!projectId) {
    window.location.href = './projects.html';
}

// Загрузка информации о проекте (только метаданные, без заметок)
async function loadProject() {
    try {
        const response = await apiRequest(`/projects/${projectId}`);
        
        if (response.ok) {
            const project = await response.json();
            displayProjectInfo(project);
        } else if (response.status === 403) {
            showMessage('У вас нет доступа к этому проекту');
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

function displayProjectInfo(project) {
    const container = document.getElementById('projectInfo');
    container.innerHTML = `
        <h2>📄 ${escapeHtml(project.title)}</h2>
        <div style="margin: 15px 0;">
            <button class="expand-btn" onclick="toggleDescription()">
                📖 ${project.description ? 'Скрыть описание' : 'Показать описание'}
            </button>
            <div id="projectFullDesc" style="${project.description ? '' : 'display: none;'} margin-top: 10px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                ${project.description ? escapeHtml(project.description) : 'Описание отсутствует'}
            </div>
        </div>
    `;
}

function toggleDescription() {
    const descElement = document.getElementById('projectFullDesc');
    const btn = descElement.previousElementSibling;
    
    if (descElement.style.display === 'none') {
        descElement.style.display = 'block';
        btn.textContent = '📘 Скрыть описание';
    } else {
        descElement.style.display = 'none';
        btn.textContent = '📖 Показать описание';
    }
}

// Загрузка заметок (отдельный запрос, только для этого проекта)
async function loadNotes() {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes`);
        
        if (response.ok) {
            const notes = await response.json();
            displayNotes(notes);
        } else {
            showMessage('Ошибка загрузки заметок');
        }
    } catch (error) {
        showMessage('Ошибка соединения с сервером');
    }
}

function displayNotes(notes) {
    const container = document.getElementById('notesList');
    
    if (notes.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center;">В этом проекте пока нет заметок</p>';
        return;
    }
    
    container.innerHTML = notes.map(note => `
        <div class="note-item">
            <div class="note-title">📌 ${escapeHtml(note.title)}</div>
            <div class="note-content">${escapeHtml(note.content || 'Нет содержания')}</div>
            <div style="margin-top: 10px; display: flex; gap: 10px;">
                <button class="expand-btn" onclick="editNote(${note.id}, '${escapeHtml(note.title)}', ${JSON.stringify(escapeHtml(note.content || ''))})" style="color: #28a745;">✏️ Редактировать</button>
                <button class="expand-btn" onclick="deleteNote(${note.id})" style="color: #dc3545;">🗑️ Удалить</button>
            </div>
        </div>
    `).join('');
}

// Создание заметки
async function createNote(title, content) {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes`, {
            method: 'POST',
            body: JSON.stringify({ title, content })
        });
        
        if (response.ok) {
            closeNoteModal();
            loadNotes(); // Перезагружаем только заметки
            showMessage('Заметка создана успешно', 'success');
        } else {
            showMessage('Ошибка создания заметки');
        }
    } catch (error) {
        showMessage('Ошибка создания заметки');
    }
}

// Редактирование заметки
async function updateNote(id, title, content) {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, content })
        });
        
        if (response.ok) {
            closeNoteModal();
            loadNotes();
            showMessage('Заметка обновлена успешно', 'success');
        } else {
            showMessage('Ошибка обновления заметки');
        }
    } catch (error) {
        showMessage('Ошибка обновления заметки');
    }
}

// Удаление заметки
async function deleteNote(id) {
    if (confirm('Вы уверены, что хотите удалить эту заметку?')) {
        try {
            const response = await apiRequest(`/projects/${projectId}/notes/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                loadNotes();
                showMessage('Заметка удалена успешно', 'success');
            } else {
                showMessage('Ошибка удаления заметки');
            }
        } catch (error) {
            showMessage('Ошибка удаления заметки');
        }
    }
}

// Модальное окно
function showCreateNoteModal() {
    editingNoteId = null;
    document.getElementById('noteModalTitle').textContent = 'Создать заметку';
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteModal').classList.add('active');
}

function editNote(id, title, content) {
    editingNoteId = id;
    document.getElementById('noteModalTitle').textContent = 'Редактировать заметку';
    document.getElementById('noteTitle').value = title;
    document.getElementById('noteContent').value = content;
    document.getElementById('noteModal').classList.add('active');
}

function closeNoteModal() {
    document.getElementById('noteModal').classList.remove('active');
}

// Обработчик формы
document.getElementById('noteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('noteTitle').value;
    const content = document.getElementById('noteContent').value;
    
    if (editingNoteId) {
        await updateNote(editingNoteId, title, content);
    } else {
        await createNote(title, content);
    }
});

// Инициализация
checkAuth();
loadUserInfo();
loadProject();
loadNotes();