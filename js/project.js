const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

let editingMapId = null;
let editingNoteId = null;
let uploadedFile = null;
let currentFilter = 'all';

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
            window.currentRole = projectData.role;
            window.currentProject = projectData.project;

            if (window.currentRole !== 'ADMIN') {
                const addBtn = document.getElementById('addButtonWrapper');
                if (addBtn) addBtn.remove();
            }
            displayProjectInfo(window.currentProject);
            projectMaps = window.currentProject.maps || [];
            projectNotes = window.currentProject.notes || [];
            renderItems();
        } else if (response.status === 403) {
            showMessage(t('project.error_no_access'));
            setTimeout(() => { window.location.href = './projects.html'; }, 2000);
        } else {
            showMessage(t('project.error_load_project'));
        }
    } catch (error) {
        showMessage(t('common.error_connection'));
    }
}

function displayProjectInfo(project) {
    const container = document.getElementById('projectInfo');
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; justify-content: center; align-items: center;">
                <button onclick="window.location.href='./projects.html'" class="menu-trigger-btn" aria-label="${escapeHtml(t('common.back'))}">
                    ❮
                </button>
                <h2>${escapeHtml(project.title)}</h2>
            </div>
        </div>
        <div style="margin: 15px 0;">
            <div id="projectFullDesc" style="${project.description ? '' : 'display: none;'} margin-top: 10px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                ${project.description ? escapeHtml(project.description) : escapeHtml(t('common.description_missing'))}
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
            showMessage(t('project.error_load_maps'));
        }
    } catch (error) {
        showMessage(t('common.error_connection'));
    }
}

async function loadNotes() {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes`);
        if (response.ok) {
            projectNotes = await response.json();
            renderItems();
        } else {
            showMessage(t('project.error_load_notes'));
        }
    } catch (error) {
        showMessage(t('common.error_connection'));
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

// ============ РЕНДЕР ============
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
        container.innerHTML = `<p style="color: #666; text-align: center;">${escapeHtml(t('project.empty'))}</p>`;
        return;
    }

    container.innerHTML = items.map(item => {
        if (item.type === 'note') return renderNoteItem(item.data);
        return renderMapItem(item.data);
    }).join('');
}

function renderMapItem(map) {
    const isVisible = map.visibility !== false;
    const isAdmin = window.currentRole === 'ADMIN';
    const menuDiv = !isAdmin ? '' : `
        <div class="map-menu-container">
            <button class="menu-trigger-btn" onclick="event.stopPropagation(); toggleItemMenu('map', ${map.id}, this)">⋮</button>
            <div id="map-menu-${map.id}" class="map-context-menu">
                <div class="menu-item" onclick="event.stopPropagation(); toggleMapVisibilityFromCard(${map.id})">
                    ${escapeHtml(isVisible ? t('project.menu_hide_map') : t('project.menu_show_map'))}
                </div>
                <div class="menu-item" onclick="event.stopPropagation(); editMapFromCard(${map.id})">✏️ ${escapeHtml(t('common.edit'))}</div>
                <div class="menu-item menu-item-danger" onclick="event.stopPropagation(); deleteMapFromCard(${map.id})">🗑️ ${escapeHtml(t('common.delete'))}</div>
            </div>
        </div>`;

    return `
        <div class="map-item${isVisible ? '' : ' invisible'}" data-type="map" data-map-id="${map.id}"
             data-map-title="${escapeHtml(map.title)}" data-map-description="${escapeHtml(map.description || '')}"
             data-map-imageurl="${escapeHtml(map.imageUrl || '')}" data-map-visibility="${isVisible}" data-map-isFile="${map.file}"
             onclick="openMap(${map.id})">
            <div class="map-item-header">
                <div class="map-title${isVisible ? '' : ' invisible'}">🗺️ ${escapeHtml(map.title)}</div>
                ${menuDiv}
            </div>
            <button class="expand-btn" onclick="event.stopPropagation(); toggleItemDescription('map', ${map.id})">
                ${escapeHtml(t('common.description_toggle_open'))}
            </button>
            <div id="map-desc-${map.id}" class="map-description hidden">
                ${map.description ? escapeHtml(map.description) : escapeHtml(t('common.description_missing'))}
            </div>
        </div>
    `;
}

function renderNoteItem(note) {
    const isVisible = note.visibility !== false;
    const isAdmin = window.currentRole === 'ADMIN';
    const menuDiv = !isAdmin ? '' : `
        <div class="map-menu-container">
            <button class="menu-trigger-btn" onclick="event.stopPropagation(); toggleItemMenu('note', ${note.id}, this)">⋮</button>
            <div id="note-menu-${note.id}" class="map-context-menu">
                <div class="menu-item" onclick="event.stopPropagation(); toggleNoteVisibilityFromCard(${note.id})">
                    ${escapeHtml(isVisible ? t('project.menu_hide_note') : t('project.menu_show_note'))}
                </div>
                <div class="menu-item" onclick="event.stopPropagation(); editNoteFromCard(${note.id})">✏️ ${escapeHtml(t('common.edit'))}</div>
                <div class="menu-item menu-item-danger" onclick="event.stopPropagation(); deleteNoteFromCard(${note.id})">🗑️ ${escapeHtml(t('common.delete'))}</div>
            </div>
        </div>`;

    return `
        <div class="map-item note-item${isVisible ? '' : ' invisible'}" data-type="note" data-note-id="${note.id}"
             data-note-title="${escapeHtml(note.title)}" data-note-description="${escapeHtml(note.description || '')}"
             data-note-visibility="${isVisible}"
             onclick="openNote(${note.id})">
            <div class="map-item-header">
                <div class="map-title${isVisible ? '' : ' invisible'}">📝 ${escapeHtml(note.title)}</div>
                ${menuDiv}
            </div>
            <button class="expand-btn" onclick="event.stopPropagation(); toggleItemDescription('note', ${note.id})">
                ${escapeHtml(t('common.description_toggle_open'))}
            </button>
            <div id="note-desc-${note.id}" class="map-description hidden">
                ${note.description ? escapeHtml(note.description) : escapeHtml(t('common.description_missing'))}
            </div>
        </div>
    `;
}

function toggleItemDescription(type, id) {
    event.stopPropagation();
    const prefix = type === 'map' ? 'map' : 'note';
    const descElement = document.getElementById(`${prefix}-desc-${id}`);
    const btn = descElement.previousElementSibling;

    if (descElement.classList.contains('hidden')) {
        descElement.classList.remove('hidden');
        btn.textContent = t('common.description_toggle_close');
    } else {
        descElement.classList.add('hidden');
        btn.textContent = t('common.description_toggle_open');
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

// ============ ДАННЫЕ ИЗ DOM ============
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

// ============ ДЕЙСТВИЯ ============
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
            showMessage(t('project.map_created'), 'success');
            return map.id;
        } else {
            showMessage(t('project.error_create_map'));
        }
    } catch (error) {
        showMessage(t('project.error_create_map'));
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
            showMessage(t('project.map_updated'), 'success');
        } else {
            showMessage(t('project.error_update_map'));
        }
    } catch (error) {
        showMessage(t('project.error_update_map'));
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
            showMessage(map.visibility ? t('project.map_visible') : t('project.map_hidden'), 'success');
        } else {
            showMessage(t('project.error_update_map'));
        }
    } catch (error) {
        showMessage(t('project.error_update_map'));
    }
}

async function deleteMap(id) {
    if (confirm(t('common.confirm_delete_map'))) {
        try {
            const response = await apiRequest(`/projects/${projectId}/maps/${id}`, { method: 'DELETE' });
            if (response.ok) {
                loadMaps();
                showMessage(t('project.map_deleted'), 'success');
            } else {
                showMessage(t('project.error_delete_map'));
            }
        } catch (error) {
            showMessage(t('project.error_delete_map'));
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
            showMessage(t('project.note_created'), 'success');
        } else {
            showMessage(t('project.error_create_note'));
        }
    } catch (error) {
        showMessage(t('project.error_create_note'));
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
            showMessage(t('project.note_updated'), 'success');
        } else {
            showMessage(t('project.error_update_note'));
        }
    } catch (error) {
        showMessage(t('project.error_update_note'));
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
            showMessage(note.visibility ? t('project.note_visible') : t('project.note_hidden'), 'success');
        } else {
            showMessage(t('project.error_update_note'));
        }
    } catch (error) {
        showMessage(t('project.error_update_note'));
    }
}

async function deleteNote(id) {
    if (confirm(t('common.confirm_delete_note'))) {
        try {
            const response = await apiRequest(`/projects/${projectId}/notes/${id}`, { method: 'DELETE' });
            if (response.ok) {
                loadNotes();
                showMessage(t('project.note_deleted'), 'success');
            } else {
                showMessage(t('project.error_delete_note'));
            }
        } catch (error) {
            showMessage(t('project.error_delete_note'));
        }
    }
}

// ============ МОДАЛКИ ============
function showCreateMapModal() {
    closeFabMenu();
    editingMapId = null;
    document.getElementById('mapModalTitle').textContent = t('project.create_map');
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
    document.getElementById('mapModalTitle').textContent = t('project.edit_map');
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

function showCreateNoteModal() {
    closeFabMenu();
    editingNoteId = null;
    document.getElementById('noteModalTitle').textContent = t('project.create_note');
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteDescription').value = '';
    document.getElementById('noteVisibility').checked = true;
    document.getElementById('noteModal').classList.add('active');
}

function editNote(id, title, description, visibility) {
    editingNoteId = id;
    document.getElementById('noteModalTitle').textContent = t('project.edit_note');
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

// ============ FAB ============
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

// ============ ФОРМЫ ============
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
        showMessage(t('project.image_too_large'));
        this.value = '';
        return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif'];
    const fileName = file.name.toLowerCase();
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.avif'];
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
        showMessage(t('project.image_bad_format'));
        this.value = '';
        return;
    }

    showMessage(t('project.image_processing'), 'info');
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
                showMessage(t('project.image_compressed', {
                    from: originalSize,
                    to: compressedSize,
                    percent: sizeReduction
                }), 'info');
            }
        };
        reader.readAsDataURL(compressedFile);
    } catch (error) {
        console.error('Ошибка при обработке файла:', error);
        showMessage(t('project.image_compress_failed'));
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
            showMessage(t('project.image_uploaded'), 'success');
        } else {
            showMessage(t('project.error_load_image'));
        }
    } catch (error) {
        showMessage(t('project.error_load_image'));
    }
    uploadedFile = null;
}

function removeImagePreview() {
    document.getElementById('imagePreview').classList.add('hidden');
    document.getElementById('mapImageFile').value = '';
    uploadedFile = null;
}

// ============ СЖАТИЕ ============
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

// ============ КЛАВИШИ / КЛИКИ ============
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
(async () => {
    await initI18n();
    loadUserInfo();
    loadProject();
})();