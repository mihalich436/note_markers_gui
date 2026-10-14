// Получаем ID проекта из URL
const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

let editingMapId = null;
let editingNoteId = null;
let uploadedFile = null; // загруженный файл

// Текущий фильтр: 'all' | 'notes' | 'maps'
let currentFilter = 'all';

// Локальные массивы
let projectMaps = [];
let projectNotes = [];

if (!projectId) {
    window.location.href = './projects.html';
}

// ============ ЗАГРУЗКА ПРОЕКТА ============
async function loadProject() {
    try {
        const response = await apiRequest(`/projects/${projectId}${shareToken ? `?share=${shareToken}` : ''}`);
        
        if (response.ok) {
            const projectData = await response.json();
            this.role = projectData.role;
            this.project = projectData.project;
            if (this.role !== 'ADMIN') {
                const addBtn = document.getElementById('addButtonWrapper');
                if (addBtn) addBtn.remove();
            }
            displayProjectInfo(this.project);
            projectMaps = this.project.maps || [];
            projectNotes = this.project.notes || [];
            renderItems();
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
                    ❮
                </button>
                <h2> ${escapeHtml(project.title)}</h2>
            </div>
        </div>
        <div style="margin: 15px 0;">
            <div id="projectFullDesc" style="${project.description ? '' : 'display: none;'} margin-top: 10px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                ${project.description ? escapeHtml(project.description) : 'Описание отсутствует'}
            </div>
        </div>
    `;
}

// ============ ЗАГРУЗКА ДАННЫХ ============
async function loadMaps() {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps`);
        if (response.ok) {
            projectMaps = await response.json();
            renderItems();
        } else {
            showMessage('Ошибка загрузки карт');
        }
    } catch (error) {
        showMessage('Ошибка соединения с сервером');
    }
}

async function loadNotes() {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes`);
        if (response.ok) {
            projectNotes = await response.json();
            renderItems();
        } else {
            showMessage('Ошибка загрузки заметок');
        }
    } catch (error) {
        showMessage('Ошибка соединения с сервером');
    }
}

// ============ ФИЛЬТРЫ ============
function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderItems();
}

// ============ РЕНДЕР СПИСКА ============
function renderItems() {
    const container = document.getElementById('itemsList');
    
    let items = [];
    if (currentFilter === 'all') {
        items = [
            ...projectNotes.map(n => ({ type: 'note', data: n })),
            ...projectMaps.map(m => ({ type: 'map', data: m }))
        ];
    } else if (currentFilter === 'notes') {
        items = projectNotes.map(n => ({ type: 'note', data: n }));
    } else {
        items = projectMaps.map(m => ({ type: 'map', data: m }));
    }
    
    if (items.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center;">Здесь пока ничего нет</p>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        if (item.type === 'note') return renderNoteItem(item.data);
        return renderMapItem(item.data);
    }).join('');
}

// ============ РЕНДЕР КАРТЫ ============
function renderMapItem(map) {
    const isVisible = map.visibility !== false;
    const menuDiv = this.role !== 'ADMIN' ? '' : `
        <div class="map-menu-container">
            <button class="menu-trigger-btn" onclick="event.stopPropagation(); toggleItemMenu('map', ${map.id}, this)">⋮</button>
            <div id="map-menu-${map.id}" class="map-context-menu">
                <div class="menu-item" onclick="event.stopPropagation(); toggleMapVisibilityFromCard(${map.id})">
                    ${isVisible ? '🔒 Скрыть' : '👁️ Показать'}
                </div>
                <div class="menu-item" onclick="event.stopPropagation(); editMapFromCard(${map.id})">✏️ Редактировать</div>
                <div class="menu-item menu-item-danger" onclick="event.stopPropagation(); deleteMapFromCard(${map.id})">🗑️ Удалить</div>
            </div>
        </div>`;
    
    return `
        <div class="map-item${isVisible ? '' : ' invisible'}" data-type="map" data-map-id="${map.id}"
             data-map-title="${escapeHtml(map.title)}" data-map-description="${escapeHtml(map.description || '')}"
             data-map-imageurl="${escapeHtml(map.imageUrl || '')}" data-map-visibility="${isVisible}" data-map-isFile="${map.file}"
             onclick="openMap(${map.id})">
            <div class="map-item-header">
                <div class="map-title${isVisible ? '' : ' invisible'}">
                    🗺️ ${escapeHtml(map.title)}
                </div>
                ${menuDiv}
            </div>
            <button class="expand-btn" onclick="event.stopPropagation(); toggleItemDescription('map', ${map.id})">
                ► Описание
            </button>
            <div id="map-desc-${map.id}" class="map-description hidden">
                ${map.description ? escapeHtml(map.description) : 'Описание отсутствует'}
            </div>
        </div>
    `;
}

// ============ РЕНДЕР ЗАМЕТКИ ============
function renderNoteItem(note) {
    const isVisible = note.visibility !== false;
    const menuDiv = this.role !== 'ADMIN' ? '' : `
        <div class="map-menu-container">
            <button class="menu-trigger-btn" onclick="event.stopPropagation(); toggleItemMenu('note', ${note.id}, this)">⋮</button>
            <div id="note-menu-${note.id}" class="map-context-menu">
                <div class="menu-item" onclick="event.stopPropagation(); toggleNoteVisibilityFromCard(${note.id})">
                    ${isVisible ? '🔒 Скрыть' : '👁️ Показать'}
                </div>
                <div class="menu-item" onclick="event.stopPropagation(); editNoteFromCard(${note.id})">✏️ Редактировать</div>
                <div class="menu-item menu-item-danger" onclick="event.stopPropagation(); deleteNoteFromCard(${note.id})">🗑️ Удалить</div>
            </div>
        </div>`;
    
    return `
        <div class="map-item note-item${isVisible ? '' : ' invisible'}" data-type="note" data-note-id="${note.id}"
             data-note-title="${escapeHtml(note.title)}" data-note-description="${escapeHtml(note.description || '')}"
             data-note-visibility="${isVisible}"
             onclick="openNote(${note.id})">
            <div class="map-item-header">
                <div class="map-title${isVisible ? '' : ' invisible'}">
                    📝 ${escapeHtml(note.title)}
                </div>
                ${menuDiv}
            </div>
            <button class="expand-btn" onclick="event.stopPropagation(); toggleItemDescription('note', ${note.id})">
                ► Описание
            </button>
            <div id="note-desc-${note.id}" class="map-description hidden">
                ${note.description ? escapeHtml(note.description) : 'Описание отсутствует'}
            </div>
        </div>
    `;
}

// ============ СВОРАЧИВАНИЕ ОПИСАНИЯ ============
function toggleItemDescription(type, id) {
    event.stopPropagation();
    const prefix = type === 'map' ? 'map' : 'note';
    const descElement = document.getElementById(`${prefix}-desc-${id}`);
    const btn = descElement.previousElementSibling;
    
    if (descElement.classList.contains('hidden')) {
        descElement.classList.remove('hidden');
        btn.textContent = '▼ Описание';
    } else {
        descElement.classList.add('hidden');
        btn.textContent = '► Описание';
    }
}

// ============ КОНТЕКСТНЫЕ МЕНЮ ============
function closeAllItemMenus() {
    document.querySelectorAll('.map-context-menu.active').forEach(menu => menu.classList.remove('active'));
    const wrapper = document.getElementById('addButtonWrapper');
    if (wrapper) wrapper.style.display = 'flex';
}

function toggleItemMenu(type, id, btn) {
    event.stopPropagation();
    const menu = document.getElementById(`${type}-menu-${id}`);
    const isActive = menu.classList.contains('active');
    
    closeAllItemMenus();
    
    if (!isActive) {
        const wrapper = document.getElementById('addButtonWrapper');
        if (wrapper) wrapper.style.display = 'none';
        menu.classList.add('active');
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target !== btn) {
                    menu.classList.remove('active');
                    document.removeEventListener('click', closeMenu);
                    const w = document.getElementById('addButtonWrapper');
                    if (w) w.style.display = 'flex';
                }
            });
        }, 0);
    }
}

// ============ ПОЛУЧЕНИЕ ДАННЫХ ИЗ DOM ============
function getMapCardData(mapId) {
    const card = document.querySelector(`.map-item[data-map-id="${mapId}"]`);
    if (card) {
        return {
            id: mapId,
            title: card.getAttribute('data-map-title'),
            description: card.getAttribute('data-map-description'),
            imageUrl: card.getAttribute('data-map-imageurl'),
            visibility: card.getAttribute('data-map-visibility') === 'true',
            isFile: card.getAttribute('data-map-isFile') === 'true'
        };
    }
    return null;
}

function getNoteCardData(noteId) {
    const card = document.querySelector(`.map-item[data-note-id="${noteId}"]`);
    if (card) {
        return {
            id: noteId,
            title: card.getAttribute('data-note-title'),
            description: card.getAttribute('data-note-description'),
            visibility: card.getAttribute('data-note-visibility') === 'true'
        };
    }
    return null;
}

// ============ ДЕЙСТВИЯ С КАРТАМИ ============
function editMapFromCard(mapId) {
    const mapData = getMapCardData(mapId);
    if (mapData) {
        editMap(mapId, mapData.title, mapData.description, mapData.imageUrl, mapData.visibility, mapData.isFile);
    }
    closeAllItemMenus();
}

async function toggleMapVisibilityFromCard(mapId) {
    closeAllItemMenus();
    const mapData = getMapCardData(mapId);
    if (mapData) {
        await toggleMapVisibility(mapId, !mapData.visibility);
    }
}

function deleteMapFromCard(mapId) {
    closeAllItemMenus();
    deleteMap(mapId);
}

// ============ ДЕЙСТВИЯ С ЗАМЕТКАМИ ============
function editNoteFromCard(noteId) {
    const noteData = getNoteCardData(noteId);
    if (noteData) {
        editNote(noteId, noteData.title, noteData.description, noteData.visibility);
    }
    closeAllItemMenus();
}

async function toggleNoteVisibilityFromCard(noteId) {
    closeAllItemMenus();
    const noteData = getNoteCardData(noteId);
    if (noteData) {
        await toggleNoteVisibility(noteId, !noteData.visibility);
    }
}

function deleteNoteFromCard(noteId) {
    closeAllItemMenus();
    deleteNote(noteId);
}

// ============ CRUD КАРТ ============
async function createMap(title, description, imageUrl, visibility = true, file) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps`, {
            method: 'POST',
            body: JSON.stringify({ title, description, imageUrl, visibility, file })
        });
        if (response.ok) {
            const map = await response.json();
            closeMapModal();
            projectMaps.push(map);
            renderItems();
            showMessage('Карта создана успешно', 'success');
            return map.id;
        } else {
            showMessage('Ошибка создания карты');
        }
    } catch (error) {
        showMessage('Ошибка создания карты');
    }
    return null;
}

async function updateMap(id, title, description, imageUrl, visibility, file) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description, imageUrl, visibility, file })
        });
        if (response.ok) {
            const map = await response.json();
            closeMapModal();
            const idx = projectMaps.findIndex(m => m.id === map.id);
            if (idx !== -1) {
                projectMaps[idx] = map;
                renderItems();
            }
            showMessage('Карта обновлена успешно', 'success');
        } else {
            showMessage('Ошибка обновления карты');
        }
    } catch (error) {
        showMessage('Ошибка обновления карты');
    }
}

async function toggleMapVisibility(id, visibility) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps/${id}/visibility`, {
            method: 'PUT',
            body: JSON.stringify({ visibility })
        });
        if (response.ok) {
            const map = await response.json();
            const idx = projectMaps.findIndex(m => m.id === map.id);
            if (idx !== -1) {
                projectMaps[idx] = map;
                renderItems();
            }
            showMessage(map.visibility ? 'Карта видна всем' : 'Карта скрыта', 'success');
        } else {
            showMessage('Ошибка обновления карты');
        }
    } catch (error) {
        showMessage('Ошибка обновления карты');
    }
}

async function deleteMap(id) {
    if (confirm('Вы уверены, что хотите удалить эту карту?')) {
        try {
            const response = await apiRequest(`/projects/${projectId}/maps/${id}`, { method: 'DELETE' });
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

// ============ CRUD ЗАМЕТОК ============
async function createNote(title, description, visibility = true) {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes`, {
            method: 'POST',
            body: JSON.stringify({ title, description, visibility })
        });
        if (response.ok) {
            const note = await response.json();
            closeNoteModal();
            projectNotes.push(note);
            renderItems();
            showMessage('Заметка создана успешно', 'success');
        } else {
            showMessage('Ошибка создания заметки');
        }
    } catch (error) {
        showMessage('Ошибка создания заметки');
    }
}

async function updateNote(id, title, description, visibility) {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description, visibility })
        });
        if (response.ok) {
            const note = await response.json();
            closeNoteModal();
            const idx = projectNotes.findIndex(n => n.id === note.id);
            if (idx !== -1) {
                projectNotes[idx] = note;
                renderItems();
            }
            showMessage('Заметка обновлена успешно', 'success');
        } else {
            showMessage('Ошибка обновления заметки');
        }
    } catch (error) {
        showMessage('Ошибка обновления заметки');
    }
}

async function toggleNoteVisibility(id, visibility) {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes/${id}/visibility`, {
            method: 'PUT',
            body: JSON.stringify({ visibility })
        });
        if (response.ok) {
            const note = await response.json();
            const idx = projectNotes.findIndex(n => n.id === note.id);
            if (idx !== -1) {
                projectNotes[idx] = note;
                renderItems();
            }
            showMessage(note.visibility ? 'Заметка видна всем' : 'Заметка скрыта', 'success');
        } else {
            showMessage('Ошибка обновления заметки');
        }
    } catch (error) {
        showMessage('Ошибка обновления заметки');
    }
}

async function deleteNote(id) {
    if (confirm('Вы уверены, что хотите удалить эту заметку?')) {
        try {
            const response = await apiRequest(`/projects/${projectId}/notes/${id}`, { method: 'DELETE' });
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

// ============ МОДАЛЬНОЕ ОКНО КАРТЫ ============
function showCreateMapModal() {
    closeFabMenu();
    editingMapId = null;
    document.getElementById('mapModalTitle').textContent = 'Создать карту';
    document.getElementById('mapTitle').value = '';
    document.getElementById('mapDescription').value = '';
    document.getElementById('mapImageUrl').value = '';
    document.getElementById('mapVisibility').checked = true;
    
    uploadedFile = null;
    document.getElementById('mapImageFile').value = '';
    document.getElementById('imagePreview').classList.add('hidden');
    
    document.querySelector('input[name="imageUploadType"][value="url"]').checked = true;
    document.getElementById('imageUrlGroup').classList.remove('hidden');
    document.getElementById('imageFileGroup').classList.add('hidden');
    
    document.getElementById('mapModal').classList.add('active');
}

function editMap(id, title, description, imageUrl, visibility, isFile) {
    editingMapId = id;
    document.getElementById('mapModalTitle').textContent = 'Редактировать карту';
    document.getElementById('mapTitle').value = title;
    document.getElementById('mapDescription').value = description;
    document.getElementById('mapImageUrl').value = imageUrl || '';
    document.getElementById('mapVisibility').checked = visibility !== false;
    
    uploadedFile = null;
    document.getElementById('mapImageFile').value = '';
    document.getElementById('imagePreview').classList.add('hidden');
    
    if (isFile) {
        document.querySelector('input[name="imageUploadType"][value="file"]').checked = true;
        document.getElementById('imageUrlGroup').classList.add('hidden');
        document.getElementById('imageFileGroup').classList.remove('hidden');
    } else {
        document.querySelector('input[name="imageUploadType"][value="url"]').checked = true;
        document.getElementById('imageUrlGroup').classList.remove('hidden');
        document.getElementById('imageFileGroup').classList.add('hidden');
    }
    
    document.getElementById('mapModal').classList.add('active');
}

function openMap(id) {
    window.location.href = `./map.html?mapId=${id}${shareToken ? `&share=${shareToken}` : ''}`;
}

function closeMapModal() {
    document.getElementById('mapModal').classList.remove('active');
    document.getElementById('mapImageFile').value = '';
    document.getElementById('imagePreview').classList.add('hidden');
}

function toggleImageUploadType() {
    const urlRadio = document.querySelector('input[name="imageUploadType"][value="url"]');
    const urlGroup = document.getElementById('imageUrlGroup');
    const fileGroup = document.getElementById('imageFileGroup');
    
    if (urlRadio.checked) {
        urlGroup.classList.remove('hidden');
        fileGroup.classList.add('hidden');
        document.getElementById('imagePreview').classList.add('hidden');
    } else {
        urlGroup.classList.add('hidden');
        fileGroup.classList.remove('hidden');
    }
}

// ============ МОДАЛЬНОЕ ОКНО ЗАМЕТКИ ============
function showCreateNoteModal() {
    closeFabMenu();
    editingNoteId = null;
    document.getElementById('noteModalTitle').textContent = 'Создать заметку';
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteDescription').value = '';
    document.getElementById('noteVisibility').checked = true;
    document.getElementById('noteModal').classList.add('active');
}

function editNote(id, title, description, visibility) {
    editingNoteId = id;
    document.getElementById('noteModalTitle').textContent = 'Редактировать заметку';
    document.getElementById('noteTitle').value = title;
    document.getElementById('noteDescription').value = description;
    document.getElementById('noteVisibility').checked = visibility !== false;
    document.getElementById('noteModal').classList.add('active');
}

function openNote(id) {
    window.location.href = `./note.html?noteId=${id}${shareToken ? `&share=${shareToken}` : ''}`;
}

function closeNoteModal() {
    document.getElementById('noteModal').classList.remove('active');
}

// ============ FAB МЕНЮ ============
function toggleFabMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('fabMenu');
    const btn = document.getElementById('addButton');
    const isActive = menu.classList.contains('active');
    
    if (isActive) {
        closeFabMenu();
    } else {
        menu.classList.add('active');
        btn.classList.add('active');
    }
}

function closeFabMenu() {
    const menu = document.getElementById('fabMenu');
    const btn = document.getElementById('addButton');
    if (menu) menu.classList.remove('active');
    if (btn) btn.classList.remove('active');
}

// ============ ОБРАБОТЧИКИ ФОРМ ============
document.getElementById('mapForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('mapTitle').value;
    const description = document.getElementById('mapDescription').value;
    const imageUrl = document.getElementById('mapImageUrl').value;
    const visibility = document.getElementById('mapVisibility').checked;
    let mapId = editingMapId;
    const fileRadio = document.querySelector('input[name="imageUploadType"][value="file"]');
    const isFile = (fileRadio && fileRadio.checked);
    
    if (editingMapId) {
        await updateMap(editingMapId, title, description, imageUrl, visibility, isFile);
    } else {
        mapId = await createMap(title, description, imageUrl, visibility, isFile);
    }

    if (isFile && mapId && uploadedFile) {
        uploadImageFile(mapId, uploadedFile);
    } 
});

document.getElementById('noteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('noteTitle').value;
    const description = document.getElementById('noteDescription').value;
    const visibility = document.getElementById('noteVisibility').checked;
    
    if (editingNoteId) {
        await updateNote(editingNoteId, title, description, visibility);
    } else {
        await createNote(title, description, visibility);
    }
});

// ============ ЗАГРУЗКА ФАЙЛА ============
document.getElementById('mapImageFile').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 30 * 1024 * 1024) {
        showMessage('Файл слишком большой. Максимальный размер: 30 МБ');
        this.value = '';
        return;
    }
    
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif'];
    const fileName = file.name.toLowerCase();
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.avif'];
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
        showMessage('Неподдерживаемый формат файла. Поддерживаются: PNG, JPG, JPEG, WEBP, AVIF');
        this.value = '';
        return;
    }
    
    showMessage('Обработка изображения...', 'info');
    try {
        const compressedFile = await compressImage(file);
        uploadedFile = compressedFile;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('imagePreview');
            const previewImg = document.getElementById('previewImage');
            previewImg.src = e.target.result;
            preview.classList.remove('hidden');
            
            if (compressedFile !== file) {
                const sizeReduction = ((file.size - compressedFile.size) / file.size * 100).toFixed(1);
                const originalSize = (file.size / (1024 * 1024)).toFixed(2);
                const compressedSize = (compressedFile.size / (1024 * 1024)).toFixed(2);
                showMessage(`Изображение сжато: ${originalSize}MB → ${compressedSize}MB (${sizeReduction}% меньше)`, 'info');
            }
        };
        reader.readAsDataURL(compressedFile);
    } catch (error) {
        console.error('Ошибка при обработке файла:', error);
        showMessage('Не удалось сжать файл. Попробуйте конвертировать в JPG, WEBP, AVIF');
        this.value = '';
    }
});

async function uploadImageFile(mapId, file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fileUploadRequest(`/maps/${mapId}/upload`, {
            method: 'POST',
            body: formData
        });
        if (response.ok) {
            showMessage('Изображение загружено успешно', 'success');
        } else {
            showMessage('Ошибка загрузки изображения');
        }
    } catch (error) {
        showMessage('Ошибка загрузки изображения');
    }
    uploadedFile = null;
}

function removeImagePreview() {
    document.getElementById('imagePreview').classList.add('hidden');
    document.getElementById('mapImageFile').value = '';
    uploadedFile = null;
}

// ============ СЖАТИЕ ИЗОБРАЖЕНИЙ ============
async function compressImage(file) {
    const fileType = file.type;
    const fileName = file.name.toLowerCase();
    
    if (fileType === 'image/webp' || fileType === 'image/avif' || 
        fileName.endsWith('.webp') || fileName.endsWith('.avif')) {
        return file;
    }
    
    try {
        const webpFile = await compressToWebP(file);
        if (webpFile) return webpFile;
        
        if (fileType !== 'image/jpeg' && fileType !== 'image/jpg' && 
            !fileName.endsWith('.jpg') && !fileName.endsWith('.jpeg')) {
            const jpgFile = await compressToJPG(file);
            if (jpgFile) return jpgFile;
        }
        return file;
    } catch (error) {
        console.error('Ошибка при сжатии изображения:', error);
        return file;
    }
}

function compressToWebP(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let width = img.width, height = img.height;
                    const maxDimension = 8192;
                    
                    if (width > maxDimension || height > maxDimension) {
                        const ratio = Math.min(maxDimension / width, maxDimension / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const webpDataUrl = canvas.toDataURL('image/webp', 0.8);
                    fetch(webpDataUrl)
                        .then(res => res.blob())
                        .then(blob => {
                            const webpFile = new File([blob], 
                                file.name.replace(/\.[^.]+$/, '.webp'), 
                                { type: 'image/webp' });
                            resolve(webpFile);
                        })
                        .catch(() => reject(new Error('Failed to convert WebP to File')));
                } catch (error) {
                    reject(error);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function compressToJPG(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let width = img.width, height = img.height;
                    const maxDimension = 8192;
                    
                    if (width > maxDimension || height > maxDimension) {
                        const ratio = Math.min(maxDimension / width, maxDimension / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    fetch(jpgDataUrl)
                        .then(res => res.blob())
                        .then(blob => {
                            const jpgFile = new File([blob], 
                                file.name.replace(/\.[^.]+$/, '.jpg'), 
                                { type: 'image/jpeg' });
                            resolve(jpgFile);
                        })
                        .catch(() => reject(new Error('Failed to convert JPG to File')));
                } catch (error) {
                    reject(error);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// ============ ЗАКРЫТИЕ МЕНЮ ПО ESC / КЛИКУ ВНЕ ============
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllItemMenus();
        closeFabMenu();
    }
});

document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('addButtonWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        closeFabMenu();
    }
});

// ============ ИНИЦИАЛИЗАЦИЯ ============
loadUserInfo();
loadProject();