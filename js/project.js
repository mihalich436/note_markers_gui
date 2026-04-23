// Получаем ID проекта из URL
const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

let editingMapId = null;

if (!projectId) {
    window.location.href = './projects.html';
}

// Загрузка информации о проекте (только метаданные, без заметок)
async function loadProject() {
    try {
        const response = await apiRequest(`/projects/${projectId}`);
        
        if (response.ok) {
            this.project = await response.json();
            console.log(this.project)
            displayProjectInfo(this.project);
            if (this.project.maps) {
                displayMaps(this.project.maps);
            }
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
async function loadMaps() {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps`);
        
        if (response.ok) {
            const maps = await response.json();
            this.project.maps = maps;
            displayMaps(maps);
        } else {
            showMessage('Ошибка загрузки заметок');
        }
    } catch (error) {
        showMessage('Ошибка соединения с сервером');
    }
}

function displayMaps(maps) {
    const container = document.getElementById('mapsList');
    
    if (maps.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center;">В этом проекте пока нет заметок</p>';
        return;
    }
    
    container.innerHTML = maps.map(map => `
        <div class="map-item">
            <div class="map-title">📌 ${escapeHtml(map.title)}</div>
            <div class="map-description">${escapeHtml(map.description || 'Нет содержания')}</div>
            <div style="margin-top: 10px; display: flex; gap: 10px;">
                <button class="expand-btn" onclick="editMap(${map.id})" style="color: #28a745;">✏️ Редактировать</button>
                <button class="expand-btn" onclick="deleteMap(${map.id})" style="color: #dc3545;">🗑️ Удалить</button>
                <button class="expand-btn" onclick="openMap(${map.id})" style="color: #28a745;">Открыть \></button>
            </div>
        </div>
    `).join('');
}

// Создание карты
async function createMap(title, description, imageUrl) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps`, {
            method: 'POST',
            body: JSON.stringify({ title, description, imageUrl })
        });
        
        if (response.ok) {
            const map = await response.json();
            closeMapModal();
            this.project.maps.push(map);
            // loadMaps(); // Перезагружаем только карты
            displayMaps(this.project.maps);
            showMessage('Карта создана успешно', 'success');
        } else {
            showMessage('Ошибка создания карты');
        }
    } catch (error) {
        showMessage('Ошибка создания карты');
    }
}

// Редактирование карты
async function updateMap(id, title, description, imageUrl) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description, imageUrl })
        });
        
        if (response.ok) {
            const map = await response.json();
            closeMapModal();
            const updatedMap = this.project.maps.find(m => map.id === m.id);
            if (updatedMap) {
                updatedMap.title = map.title;
                updatedMap.description = map.description;
                updatedMap.imageUrl = map.imageUrl;
                displayMaps(this.project.maps);
            }
            // loadMaps();
            showMessage('Карта обновлена успешно', 'success');
        } else {
            showMessage('Ошибка обновления карты');
        }
    } catch (error) {
        showMessage('Ошибка обновления карты');
    }
}

// Удаление карты
async function deleteMap(id) {
    if (confirm('Вы уверены, что хотите удалить эту карту?')) {
        try {
            const response = await apiRequest(`/projects/${projectId}/maps/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                // const mapId = await response.json();
                // const index = this.project.maps.findIndex(m => mapId === m.id);
                // if (index !== -1) {
                //     this.project.maps.splice(index, 1);
                // }
                loadMaps();
                showMessage('Карта удалена успешно', 'success');
            } else {
                showMessage('Ошибка удаления карты');
            }
        } catch (error) {
            showMessage('Ошибка удаления карты');
        }
    }
}

// Модальное окно
function showCreateMapModal() {
    editingMapId = null;
    document.getElementById('mapModalTitle').textContent = 'Создать карту';
    document.getElementById('mapTitle').value = '';
    document.getElementById('mapDescription').value = '';
    document.getElementById('mapImageUrl').value = '';
    document.getElementById('mapModal').classList.add('active');
}

function editMap(id) {
    editingMapId = id;
    const map = this.project.maps.find(m => m.id === id);
    document.getElementById('mapModalTitle').textContent = 'Редактировать карту';
    document.getElementById('mapTitle').value = map.title;
    document.getElementById('mapDescription').value = map.description;
    document.getElementById('mapImageUrl').value = map.imageUrl;
    document.getElementById('mapModal').classList.add('active');
}

function openMap(id) {
    window.location.href = `./map.html?mapId=${id}`;
}

function closeMapModal() {
    document.getElementById('mapModal').classList.remove('active');
}

// Обработчик формы
document.getElementById('mapForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('mapTitle').value;
    const description = document.getElementById('mapDescription').value;
    const imageUrl = document.getElementById('mapImageUrl').value;
    
    if (editingMapId) {
        await updateMap(editingMapId, title, description, imageUrl);
    } else {
        await createMap(title, description, imageUrl);
    }
});

// Инициализация
checkAuth();
loadUserInfo();
loadProject();
// loadMaps();