const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');
const urlFolderId = urlParams.get('folder');

let editingMapId = null;
let editingNoteId = null;
let editingFolderId = null;
let uploadedFile = null;
let currentFilter = 'all';

let projectFolders = [];
let projectMaps = [];
let projectNotes = [];

let currentFolderId = null; // null = корень проекта
let pendingDeleteFolderId = null;

const MAX_FOLDER_DEPTH = 5; // корень = 0, максимум 5 уровней папок

if (!projectId) {
    window.location.href = './projects.html';
}

// ============ УТИЛИТЫ ПАПОК ============
function findFolder(id) {
    if (id == null) return null;
    return projectFolders.find(f => f.id === id) || null;
}

function getFolderDepth(folderId) {
    let depth = 0;
    let current = findFolder(folderId);
    const guard = new Set();
    while (current && !guard.has(current.id)) {
        guard.add(current.id);
        depth++;
        current = current.parentId != null ? findFolder(current.parentId) : null;
    }
    return depth;
}

function isFolderDescendant(candidateId, ancestorId) {
    let current = findFolder(candidateId);
    const guard = new Set();
    while (current && !guard.has(current.id)) {
        guard.add(current.id);
        if (current.id === ancestorId) return true;
        current = current.parentId != null ? findFolder(current.parentId) : null;
    }
    return false;
}

function isFolderVisibleForCurrentUser(folder) {
    if (window.currentRole === 'ADMIN') return true;
    return folder.visibility !== false;
}

// ============ URL / НАВИГАЦИЯ ПО ПАПКАМ ============
function buildProjectUrl(folderId) {
    const params = new URLSearchParams();
    params.set('id', projectId);
    if (folderId != null) params.set('folder', folderId);
    if (shareToken) params.set('share', shareToken);
    return `./project.html?${params.toString()}`;
}

function syncUrlWithFolder(folderId, replace) {
    if (window.location.protocol === 'file:') return;
    const url = buildProjectUrl(folderId);
    try {
        if (replace) {
            history.replaceState({ folderId }, '', url);
        } else {
            history.pushState({ folderId }, '', url);
        }
    } catch (e) { /* noop */ }
}

function resolveInitialFolder(folderIdFromUrl) {
    if (folderIdFromUrl == null || folderIdFromUrl === '') return null;
    const fid = Number(folderIdFromUrl);
    if (!Number.isFinite(fid)) return null;
    const folder = findFolder(fid);
    if (!folder) return null;
    if (!isFolderVisibleForCurrentUser(folder)) {
        showMessage(t('project.error_folder_no_access'));
        return null;
    }
    return fid;
}

function openFolder(folderId) {
    if (folderId === currentFolderId) return;
    currentFolderId = folderId;
    syncUrlWithFolder(folderId, false);
    renderBreadcrumbs();
    renderItems();
}

function goToRoot() {
    openFolder(null);
}

window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const fidParam = params.get('folder');
    const fid = fidParam ? Number(fidParam) : null;
    const folder = fid != null ? findFolder(fid) : null;
    currentFolderId = folder ? folder.id : null;
    renderBreadcrumbs();
    renderItems();
});

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
            // displayProjectInfo(window.currentProject);
            projectFolders = window.currentProject.folders || [];
            projectMaps = window.currentProject.maps || [];
            projectNotes = window.currentProject.notes || [];

            currentFolderId = resolveInitialFolder(urlFolderId);
            syncUrlWithFolder(currentFolderId, true);

            renderBreadcrumbs();
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

async function loadFolders() {
    try {
        const response = await apiRequest(`/projects/${projectId}/folders`);
        if (response.ok) {
            projectFolders = await response.json();
            renderBreadcrumbs();
            renderItems();
        } else {
            showMessage(t('project.error_load_folders'));
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

// ============ СОРТИРОВКА ============
function sortByName(a, b) {
    const an = (a.title || '').toString();
    const bn = (b.title || '').toString();
    const cmp = an.localeCompare(bn, undefined, { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return (a.id || 0) - (b.id || 0);
}

// ============ КРОШКИ ============
function buildBreadcrumbs() {
    const project = window.currentProject;
    if (!project) return '';

    const chain = [];
    let current = findFolder(currentFolderId);
    const guard = new Set();
    while (current && !guard.has(current.id)) {
        guard.add(current.id);
        chain.unshift(current);
        current = current.parentId != null ? findFolder(current.parentId) : null;
    }

    const parts = [];

    // Название проекта: в корне — некликабельный текущий узел, иначе — ссылка в корень
    if (chain.length === 0) {
        parts.push(`<span class="breadcrumb-current" aria-current="page">${escapeHtml(project.title)}</span>`);
    } else {
        parts.push(`<button type="button" class="breadcrumb-link" onclick="goToRoot()" title="${escapeHtml(t('project.breadcrumb_root'))}">${escapeHtml(project.title)}</button>`);
    }

    chain.forEach((folder, idx) => {
        parts.push(`<span class="breadcrumb-sep">›</span>`);
        const isLast = idx === chain.length - 1;
        if (isLast) {
            parts.push(`<span class="breadcrumb-current" aria-current="page">${escapeHtml(folder.title)}</span>`);
        } else {
            parts.push(`<button type="button" class="breadcrumb-link" onclick="openFolder(${folder.id})">${escapeHtml(folder.title)}</button>`);
        }
    });

    return `<nav class="breadcrumbs" aria-label="${escapeHtml(t('project.breadcrumbs_aria'))}">${parts.join('')}</nav>`;
}

function renderBreadcrumbs() {
    const container = document.getElementById('breadcrumbs');
    if (!container) return;
    container.innerHTML = buildBreadcrumbs();
    const current = container.querySelector('.breadcrumb-current');
    if (current && current.scrollIntoView) {
        try {
            current.scrollIntoView({ inline: 'end', block: 'nearest' });
        } catch (e) { /* noop */ }
    }
}

// ============ РЕНДЕР ЭЛЕМЕНТОВ ============
function getVisibleFoldersInCurrent() {
    const list = projectFolders.filter(f => {
        const p = f.parentId != null ? f.parentId : null;
        return p === currentFolderId;
    });
    return list
        .filter(f => window.currentRole === 'ADMIN' || isFolderVisibleForCurrentUser(f))
        .sort(sortByName);
}

function getMapsForCurrent() {
    if (currentFilter === 'notes') return [];
    return projectMaps
        .filter(m => (m.parentId != null ? m.parentId : null) === currentFolderId)
        .sort(sortByName);
}

function getNotesForCurrent() {
    if (currentFilter === 'maps') return [];
    return projectNotes
        .filter(n => (n.parentId != null ? n.parentId : null) === currentFolderId)
        .sort(sortByName);
}

function renderItems() {
    const container = document.getElementById('itemsList');
    if (!container) return;

    const folders = getVisibleFoldersInCurrent();
    const maps = getMapsForCurrent();
    const notes = getNotesForCurrent();

    const total = folders.length + maps.length + notes.length;

    if (total === 0) {
        container.innerHTML = `<p style="color: #666; text-align: center;">${escapeHtml(t('project.empty'))}</p>`;
        return;
    }

    const parts = [];
    notes.forEach(n => parts.push(renderNoteItem(n)));
    maps.forEach(m => parts.push(renderMapItem(m)));
    folders.forEach(f => parts.push(renderFolderItem(f)));

    container.innerHTML = parts.join('');
}

function renderFolderItem(folder) {
    const isVisible = folder.visibility !== false;
    const isAdmin = window.currentRole === 'ADMIN';

    const menuDiv = !isAdmin ? '' : `
        <div class="map-menu-container">
            <button class="menu-trigger-btn" onclick="event.stopPropagation(); toggleItemMenu('folder', ${folder.id}, this)">⋮</button>
            <div id="folder-menu-${folder.id}" class="map-context-menu">
                <div class="menu-item" onclick="event.stopPropagation(); toggleFolderVisibilityFromCard(${folder.id})">
                    ${escapeHtml(isVisible ? t('project.menu_hide_folder') : t('project.menu_show_folder'))}
                </div>
                <div class="menu-item" onclick="event.stopPropagation(); editFolderFromCard(${folder.id})">✏️ ${escapeHtml(t('common.edit'))}</div>
                <div class="menu-item menu-item-danger" onclick="event.stopPropagation(); deleteFolderFromCard(${folder.id})">🗑️ ${escapeHtml(t('common.delete'))}</div>
            </div>
        </div>`;

    return `
        <div class="map-item folder-item${isVisible ? '' : ' invisible'}" data-type="folder" data-folder-id="${folder.id}"
             onclick="openFolder(${folder.id})">
            <div class="map-item-header">
                <div class="map-title${isVisible ? '' : ' invisible'}">📁 ${escapeHtml(folder.title)}</div>
                ${menuDiv}
            </div>
            <button class="expand-btn" onclick="event.stopPropagation(); toggleItemDescription('folder', ${folder.id})">
                ${escapeHtml(t('common.description_toggle_open'))}
            </button>
            <div id="folder-desc-${folder.id}" class="map-description hidden">
                ${folder.description ? escapeHtml(folder.description) : escapeHtml(t('common.description_missing'))}
            </div>
        </div>
    `;
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
    const prefixMap = { map: 'map', note: 'note', folder: 'folder' };
    const prefix = prefixMap[type] || type;
    const descElement = document.getElementById(`${prefix}-desc-${id}`);
    if (!descElement) return;
    const btn = descElement.previousElementSibling;

    if (descElement.classList.contains('hidden')) {
        descElement.classList.remove('hidden');
        if (btn) btn.textContent = t('common.description_toggle_close');
    } else {
        descElement.classList.add('hidden');
        if (btn) btn.textContent = t('common.description_toggle_open');
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
    if (!menu) return;
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

// ============ ДАННЫЕ ИЗ МАССИВОВ ============
function getMapDataById(mapId) {
    const m = projectMaps.find(x => x.id === mapId);
    if (!m) return null;
    return {
        id: m.id,
        title: m.title,
        description: m.description || '',
        imageUrl: m.imageUrl || '',
        visibility: m.visibility !== false,
        isFile: !!m.file,
        parentId: m.parentId != null ? m.parentId : null
    };
}

function getNoteDataById(noteId) {
    const n = projectNotes.find(x => x.id === noteId);
    if (!n) return null;
    return {
        id: n.id,
        title: n.title,
        description: n.description || '',
        visibility: n.visibility !== false,
        parentId: n.parentId != null ? n.parentId : null
    };
}

function getFolderDataById(folderId) {
    const f = findFolder(folderId);
    if (!f) return null;
    return {
        id: f.id,
        title: f.title,
        description: f.description || '',
        parentId: f.parentId != null ? f.parentId : null,
        visibility: f.visibility !== false
    };
}

// ============ ДЕЙСТВИЯ ИЗ КАРТОЧЕК ============
function editMapFromCard(mapId) {
    const data = getMapDataById(mapId);
    if (data) {
        editMap(data.id, data.title, data.description, data.imageUrl, data.visibility, data.isFile, data.parentId);
    }
    closeAllItemMenus();
}

async function toggleMapVisibilityFromCard(mapId) {
    closeAllItemMenus();
    const data = getMapDataById(mapId);
    if (data) await toggleMapVisibility(mapId, !data.visibility);
}

function deleteMapFromCard(mapId) {
    closeAllItemMenus();
    deleteMap(mapId);
}

function editNoteFromCard(noteId) {
    const data = getNoteDataById(noteId);
    if (data) {
        editNote(data.id, data.title, data.description, data.visibility, data.parentId);
    }
    closeAllItemMenus();
}

async function toggleNoteVisibilityFromCard(noteId) {
    closeAllItemMenus();
    const data = getNoteDataById(noteId);
    if (data) await toggleNoteVisibility(noteId, !data.visibility);
}

function deleteNoteFromCard(noteId) {
    closeAllItemMenus();
    deleteNote(noteId);
}

function editFolderFromCard(folderId) {
    const data = getFolderDataById(folderId);
    if (data) {
        editFolder(data.id, data.title, data.description, data.parentId, data.visibility);
    }
    closeAllItemMenus();
}

async function toggleFolderVisibilityFromCard(folderId) {
    closeAllItemMenus();
    const data = getFolderDataById(folderId);
    if (data) await toggleFolderVisibility(folderId, !data.visibility);
}

function deleteFolderFromCard(folderId) {
    closeAllItemMenus();
    openDeleteFolderModal(folderId);
}

// ============ CRUD КАРТ ============
async function createMap(title, description, imageUrl, visibility, file, parentId) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps`, {
            method: 'POST',
            body: JSON.stringify({ title, description, imageUrl, visibility, file, parentId })
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

async function updateMap(id, title, description, imageUrl, visibility, file, parentId) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description, imageUrl, visibility, file, parentId })
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
async function createNote(title, description, visibility, parentId) {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes`, {
            method: 'POST',
            body: JSON.stringify({ title, description, visibility, parentId })
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

async function updateNote(id, title, description, visibility, parentId) {
    try {
        const response = await apiRequest(`/projects/${projectId}/notes/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description, visibility, parentId })
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

// ============ CRUD ПАПОК ============
async function createFolder(title, description, parentId, visibility) {
    try {
        const response = await apiRequest(`/projects/${projectId}/folders`, {
            method: 'POST',
            body: JSON.stringify({ title, description, parentId, visibility })
        });
        if (response.ok) {
            const folder = await response.json();
            closeFolderModal();
            projectFolders.push(folder);
            renderItems();
            showMessage(t('project.folder_created'), 'success');
        } else {
            showMessage(t('project.error_create_folder'));
        }
    } catch (error) {
        showMessage(t('project.error_create_folder'));
    }
}

async function updateFolder(id, title, description, parentId, visibility) {
    try {
        const response = await apiRequest(`/projects/${projectId}/folders/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description, parentId, visibility })
        });
        if (response.ok) {
            const folder = await response.json();
            closeFolderModal();
            const idx = projectFolders.findIndex(f => f.id === folder.id);
            if (idx !== -1) projectFolders[idx] = folder;
            renderBreadcrumbs();
            renderItems();
            showMessage(t('project.folder_updated'), 'success');
        } else {
            showMessage(t('project.error_update_folder'));
        }
    } catch (error) {
        showMessage(t('project.error_update_folder'));
    }
}

async function toggleFolderVisibility(id, visibility) {
    try {
        const response = await apiRequest(`/projects/${projectId}/folders/${id}/visibility`, {
            method: 'PUT',
            body: JSON.stringify({ visibility })
        });
        if (response.ok) {
            const folder = await response.json();
            const idx = projectFolders.findIndex(f => f.id === folder.id);
            if (idx !== -1) {
                projectFolders[idx] = folder;
                renderItems();
            }
            showMessage(folder.visibility ? t('project.folder_visible') : t('project.folder_hidden'), 'success');
        } else {
            showMessage(t('project.error_update_folder'));
        }
    } catch (error) {
        showMessage(t('project.error_update_folder'));
    }
}

async function deleteFolder(id, mode) {
    try {
        const response = await apiRequest(`/projects/${projectId}/folders/${id}?mode=${mode}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            closeDeleteFolderModal();
            if (currentFolderId === id) {
                currentFolderId = null;
                syncUrlWithFolder(null, true);
            }
            await loadProject();
            showMessage(mode === 'delete' ? t('project.folder_deleted_cascade') : t('project.folder_deleted_move'), 'success');
        } else {
            showMessage(t('project.error_delete_folder'));
        }
    } catch (error) {
        showMessage(t('project.error_delete_folder'));
    }
}

// ============ FOLDER PICKER ============
function buildFolderTreeOrdered() {
    // Возвращает плоский список папок в порядке обхода дерева с полем depth
    const byParent = new Map();
    projectFolders.forEach(f => {
        const p = f.parentId != null ? f.parentId : null;
        if (!byParent.has(p)) byParent.set(p, []);
        byParent.get(p).push(f);
    });
    byParent.forEach(list => list.sort(sortByName));

    const result = [];
    const walk = (parentId, depth, guard) => {
        const list = byParent.get(parentId) || [];
        list.forEach(f => {
            if (guard.has(f.id)) return;
            guard.add(f.id);
            result.push({ folder: f, depth });
            walk(f.id, depth + 1, guard);
        });
    };
    walk(null, 1, new Set());
    return result;
}

/**
 * Строит HTML для селектора папок.
 * @param {Object} opts
 * @param {number|null} opts.selectedId — текущий выбранный parentId
 * @param {number|null} opts.excludeId — id редактируемой папки (нельзя выбрать её саму и её потомков)
 * @param {boolean} opts.includeRoot — добавлять пункт «Корень проекта»
 */
function renderFolderPickerOptions(opts) {
    const selectedId = opts && opts.selectedId != null ? opts.selectedId : null;
    const excludeId = opts && opts.excludeId != null ? opts.excludeId : null;
    const includeRoot = !opts || opts.includeRoot !== false;

    const parts = [];
    if (includeRoot) {
        const sel = selectedId == null ? ' selected' : '';
        parts.push(`<option value=""${sel}>${escapeHtml(t('project.folder_picker_root'))}</option>`);
    }

    const flat = buildFolderTreeOrdered();
    flat.forEach(({ folder, depth }) => {
        // Пропускаем саму редактируемую папку и её потомков
        if (excludeId != null && isFolderDescendant(folder.id, excludeId)) return;

        // Дизейбл: если папка на максимальной глубине — нельзя класть внутрь
        const disabled = depth >= MAX_FOLDER_DEPTH;
        const sel = (selectedId != null && folder.id === selectedId) ? ' selected' : '';
        const dis = disabled ? ' disabled' : '';
        const titleAttr = disabled
            ? ` title="${escapeHtml(t('project.folder_max_depth_hint'))}"`
            : '';
        const indent = '\u00A0\u00A0'.repeat(Math.max(0, depth - 1));
        parts.push(`<option value="${folder.id}"${sel}${dis}${titleAttr}>${indent}${escapeHtml(folder.title)}</option>`);
    });

    return parts.join('');
}

// ============ МОДАЛКИ КАРТ ============
function showCreateMapModal() {
    closeFabMenu();
    editingMapId = null;
    document.getElementById('mapModalTitle').textContent = t('project.create_map');
    document.getElementById('mapTitle').value = '';
    document.getElementById('mapDescription').value = '';
    document.getElementById('mapImageUrl').value = '';
    document.getElementById('mapVisibility').checked = true;

    // Селектор папки: по умолчанию — текущая папка
    const picker = document.getElementById('mapFolderPicker');
    if (picker) {
        picker.innerHTML = renderFolderPickerOptions({ selectedId: currentFolderId, excludeId: null, includeRoot: true });
        picker.value = currentFolderId != null ? String(currentFolderId) : '';
    }

    uploadedFile = null;
    document.getElementById('mapImageFile').value = '';
    document.getElementById('imagePreview').classList.add('hidden');

    document.querySelector('input[name="imageUploadType"][value="url"]').checked = true;
    document.getElementById('imageUrlGroup').classList.remove('hidden');
    document.getElementById('imageFileGroup').classList.add('hidden');

    document.getElementById('mapModal').classList.add('active');
}

function editMap(id, title, description, imageUrl, visibility, isFile, parentId) {
    editingMapId = id;
    document.getElementById('mapModalTitle').textContent = t('project.edit_map');
    document.getElementById('mapTitle').value = title;
    document.getElementById('mapDescription').value = description;
    document.getElementById('mapImageUrl').value = imageUrl || '';
    document.getElementById('mapVisibility').checked = visibility !== false;

    const picker = document.getElementById('mapFolderPicker');
    if (picker) {
        picker.innerHTML = renderFolderPickerOptions({ selectedId: parentId != null ? parentId : null, excludeId: null, includeRoot: true });
        picker.value = parentId != null ? String(parentId) : '';
    }

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

// ============ МОДАЛКИ ЗАМЕТОК ============
function showCreateNoteModal() {
    closeFabMenu();
    editingNoteId = null;
    document.getElementById('noteModalTitle').textContent = t('project.create_note');
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteDescription').value = '';
    document.getElementById('noteVisibility').checked = true;

    const picker = document.getElementById('noteFolderPicker');
    if (picker) {
        picker.innerHTML = renderFolderPickerOptions({ selectedId: currentFolderId, excludeId: null, includeRoot: true });
        picker.value = currentFolderId != null ? String(currentFolderId) : '';
    }

    document.getElementById('noteModal').classList.add('active');
}

function editNote(id, title, description, visibility, parentId) {
    editingNoteId = id;
    document.getElementById('noteModalTitle').textContent = t('project.edit_note');
    document.getElementById('noteTitle').value = title;
    document.getElementById('noteDescription').value = description;
    document.getElementById('noteVisibility').checked = visibility !== false;

    const picker = document.getElementById('noteFolderPicker');
    if (picker) {
        picker.innerHTML = renderFolderPickerOptions({ selectedId: parentId != null ? parentId : null, excludeId: null, includeRoot: true });
        picker.value = parentId != null ? String(parentId) : '';
    }

    document.getElementById('noteModal').classList.add('active');
}

function openNote(id) {
    window.location.href = `./note.html?noteId=${id}${shareToken ? `&share=${shareToken}` : ''}`;
}

function closeNoteModal() {
    document.getElementById('noteModal').classList.remove('active');
}

// ============ МОДАЛКИ ПАПОК ============
function showCreateFolderModal() {
    closeFabMenu();
    if (currentFolderId != null && getFolderDepth(currentFolderId) >= MAX_FOLDER_DEPTH) {
        showMessage(t('project.folder_max_depth_reached'));
        return;
    }

    editingFolderId = null;
    document.getElementById('folderModalTitle').textContent = t('project.create_folder');
    document.getElementById('folderTitle').value = '';
    document.getElementById('folderDescription').value = '';
    document.getElementById('folderVisibility').checked = true;

    const picker = document.getElementById('folderParentPicker');
    if (picker) {
        picker.innerHTML = renderFolderPickerOptions({ selectedId: currentFolderId, excludeId: null, includeRoot: true });
        picker.value = currentFolderId != null ? String(currentFolderId) : '';
    }

    document.getElementById('folderModal').classList.add('active');
}

function editFolder(id, title, description, parentId, visibility) {
    editingFolderId = id;
    document.getElementById('folderModalTitle').textContent = t('project.edit_folder');
    document.getElementById('folderTitle').value = title;
    document.getElementById('folderDescription').value = description || '';
    document.getElementById('folderVisibility').checked = visibility !== false;

    const picker = document.getElementById('folderParentPicker');
    if (picker) {
        picker.innerHTML = renderFolderPickerOptions({
            selectedId: parentId != null ? parentId : null,
            excludeId: id,
            includeRoot: true
        });
        picker.value = parentId != null ? String(parentId) : '';
    }

    document.getElementById('folderModal').classList.add('active');
}

function closeFolderModal() {
    document.getElementById('folderModal').classList.remove('active');
}

// ============ МОДАЛКА УДАЛЕНИЯ ПАПКИ ============
function openDeleteFolderModal(folderId) {
    pendingDeleteFolderId = folderId;
    document.getElementById('deleteFolderModal').classList.add('active');
}

function closeDeleteFolderModal() {
    pendingDeleteFolderId = null;
    document.getElementById('deleteFolderModal').classList.remove('active');
}

async function confirmDeleteFolderMove() {
    if (pendingDeleteFolderId == null) return;
    const id = pendingDeleteFolderId;
    closeDeleteFolderModal();
    await deleteFolder(id, 'move');
}

async function confirmDeleteFolderCascade() {
    if (pendingDeleteFolderId == null) return;
    const id = pendingDeleteFolderId;
    closeDeleteFolderModal();
    await deleteFolder(id, 'delete');
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

    const picker = document.getElementById('mapFolderPicker');
    const parentId = picker && picker.value !== '' ? Number(picker.value) : null;

    let mapId = editingMapId;
    const fileRadio = document.querySelector('input[name="imageUploadType"][value="file"]');
    const isFile = (fileRadio && fileRadio.checked);

    if (editingMapId) {
        await updateMap(editingMapId, title, description, imageUrl, visibility, isFile, parentId);
    } else {
        mapId = await createMap(title, description, imageUrl, visibility, isFile, parentId);
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

    const picker = document.getElementById('noteFolderPicker');
    const parentId = picker && picker.value !== '' ? Number(picker.value) : null;

    if (editingNoteId) {
        await updateNote(editingNoteId, title, description, visibility, parentId);
    } else {
        await createNote(title, description, visibility, parentId);
    }
});

document.getElementById('folderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('folderTitle').value;
    const description = document.getElementById('folderDescription').value;
    const visibility = document.getElementById('folderVisibility').checked;

    const picker = document.getElementById('folderParentPicker');
    const parentId = picker && picker.value !== '' ? Number(picker.value) : null;

    if (editingFolderId) {
        await updateFolder(editingFolderId, title, description, parentId, visibility);
    } else {
        await createFolder(title, description, parentId, visibility);
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
        closeDeleteFolderModal();
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
