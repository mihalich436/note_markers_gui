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
            const projectData = await response.json();
            this.role = projectData.role;
            this.project = projectData.project;
            if (this.role != 'ADMIN') {
                const addBtn = document.getElementById('addButton');
                if (addBtn) addBtn.classList.add('hidden');
            }
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
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; justify-content: center; align-items: center;">
                <button onclick="window.location.href='./projects.html'" class="menu-trigger-btn">
                    🡰
                </button>
                <h2> ${escapeHtml(project.title)}</h2>
            </div>
            <button id="toggleDescBtn" class="menu-trigger-btn" onclick="toggleDescription()" title="${project.description ? 'Скрыть описание' : 'Показать описание'}">ⓘ</button>
        </div>
        <div style="margin: 15px 0;">
            <div id="projectFullDesc" style="${project.description ? '' : 'display: none;'} margin-top: 10px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                ${project.description ? escapeHtml(project.description) : 'Описание отсутствует'}
            </div>
        </div>
    `;
}

function toggleDescription() {
    const descElement = document.getElementById('projectFullDesc');
    const btn = document.getElementById("toggleDescBtn");
    
    if (descElement.style.display === 'none') {
        descElement.style.display = 'block';
        // btn.textContent = 'ⓘ';
        btn.title = 'Скрыть описание';
    } else {
        descElement.style.display = 'none';
        // btn.textContent = 'ⓘ';
        btn.title = 'Показать описание';
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
            showMessage('Ошибка загрузки карт');
        }
    } catch (error) {
        showMessage('Ошибка соединения с сервером');
    }
}

// Закрыть все открытые меню карт
function closeAllMapMenus() {
    document.querySelectorAll('.map-context-menu.active').forEach(menu => {
        menu.classList.remove('active');
    });
}

// Переключение контекстного меню карты
function toggleMapMenu(mapId, btn) {
    event.stopPropagation();
    const menu = document.getElementById(`map-menu-${mapId}`);
    const isActive = menu.classList.contains('active');
    
    // Закрываем все другие меню
    closeAllMapMenus();
    
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

// Получение данных карты из DOM
function getMapCardData(mapId) {
    const card = document.querySelector(`.map-item[data-map-id="${mapId}"]`);
    if (card) {
        return {
            id: mapId,
            title: card.getAttribute('data-map-title'),
            description: card.getAttribute('data-map-description'),
            imageUrl: card.getAttribute('data-map-imageurl'),
            visibility: card.getAttribute('data-map-visibility') === 'true'
        };
    }
    return null;
}

// Редактирование карты (из контекстного меню)
function editMapFromCard(mapId) {
    const mapData = getMapCardData(mapId);
    if (mapData) {
        editMap(mapId, mapData.title, mapData.description, mapData.imageUrl, mapData.visibility);
    }
    closeAllMapMenus();
}

// Переключение видимости карты (из контекстного меню)
async function toggleMapVisibilityFromCard(mapId) {
    closeAllMapMenus();
    
    const mapData = getMapCardData(mapId);
    if (mapData) {
        const newVisibility = !mapData.visibility;
        await updateMap(mapId, mapData.title, mapData.description, mapData.imageUrl, newVisibility);
    }
}

// Удаление карты (из контекстного меню)
function deleteMapFromCard(mapId) {
    closeAllMapMenus();
    deleteMap(mapId);
}

function displayMaps(maps) {
    const container = document.getElementById('mapsList');
    
    if (maps.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center;">В этом проекте пока нет карт</p>';
        return;
    }
    
    container.innerHTML = maps.map(map => {
        const isVisible = map.visibility !== false; // по умолчанию true
        const menuDiv = this.role !== 'ADMIN' ? '' : `<div class="map-menu-container">
                        <button class="menu-trigger-btn" onclick="event.stopPropagation(); toggleMapMenu(${map.id}, this)">
                            ⋮
                        </button>
                        <div id="map-menu-${map.id}" class="map-context-menu">
                            <div class="menu-item" onclick="event.stopPropagation(); toggleMapVisibilityFromCard(${map.id})">
                                ${isVisible ? '🔒 Скрыть' : '👁️ Показать'}
                            </div>
                            <div class="menu-item" onclick="event.stopPropagation(); editMapFromCard(${map.id})">
                                ✏️ Редактировать
                            </div>
                            <div class="menu-item menu-item-danger" onclick="event.stopPropagation(); deleteMapFromCard(${map.id})">
                                🗑️ Удалить
                            </div>
                        </div>
                    </div>`;
        
        return `
            <div class="map-item${isVisible ? '' : ' invisible'}" data-map-id="${map.id}" data-map-title="${escapeHtml(map.title)}" data-map-description="${escapeHtml(map.description || '')}" data-map-imageurl="${escapeHtml(map.imageUrl || '')}" data-map-visibility="${isVisible}" onclick="openMap(${map.id})">
                <div class="map-item-header">
                    <div class="map-title${isVisible ? '' : ' invisible'}">
                        ${isVisible ? '🗺️' : '🔒'} ${escapeHtml(map.title)}
                    </div>
                    ${menuDiv}
                </div>
                <button class="expand-btn" onclick="event.stopPropagation(); toggleMapDescription(${map.id})">
                    ► Описание
                </button>
                <div id="map-desc-${map.id}" class="map-description hidden">
                    ${map.description ? escapeHtml(map.description) : 'Описание отсутствует'}
                </div>
            </div>
        `;
    }).join('');
}

// Функция для сворачивания/разворачивания описания карты
function toggleMapDescription(mapId) {
    event.stopPropagation();
    const descElement = document.getElementById(`map-desc-${mapId}`);
    const btn = descElement.previousElementSibling;
    
    if (descElement.classList.contains('hidden')) {
        descElement.classList.remove('hidden');
        btn.textContent = '▼ Описание';
    } else {
        descElement.classList.add('hidden');
        btn.textContent = '► Описание';
    }
}

// Создание карты
async function createMap(title, description, imageUrl, visibility = true) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps`, {
            method: 'POST',
            body: JSON.stringify({ title, description, imageUrl, visibility })
        });
        
        if (response.ok) {
            const map = await response.json();
            closeMapModal();
            this.project.maps.push(map);
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
async function updateMap(id, title, description, imageUrl, visibility) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description, imageUrl, visibility })
        });
        
        if (response.ok) {
            const map = await response.json();
            closeMapModal();
            // Обновляем карту в локальном массиве
            const mapIndex = this.project.maps.findIndex(m => m.id === map.id);
            if (mapIndex !== -1) {
                this.project.maps[mapIndex] = map;
                displayMaps(this.project.maps);
            }
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
    document.getElementById('mapVisibility').checked = true;
    document.getElementById('mapModal').classList.add('active');
}

function editMap(id, title, description, imageUrl, visibility) {
    editingMapId = id;
    document.getElementById('mapModalTitle').textContent = 'Редактировать карту';
    document.getElementById('mapTitle').value = title;
    document.getElementById('mapDescription').value = description;
    document.getElementById('mapImageUrl').value = imageUrl || '';
    document.getElementById('mapVisibility').checked = visibility !== false;
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
    const visibility = document.getElementById('mapVisibility').checked;
    
    if (editingMapId) {
        await updateMap(editingMapId, title, description, imageUrl, visibility);
    } else {
        await createMap(title, description, imageUrl, visibility);
    }
});

// Закрытие меню при нажатии ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllMapMenus();
    }
});

// Инициализация
checkAuth();
loadUserInfo();
loadProject();