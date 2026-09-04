// Получаем ID проекта из URL
const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

let editingMapId = null;
let uploadedFile = null; // загруженный файл
// let uploadedImageUrl = null; // URL изображения

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
            if (this.role !== 'ADMIN') {
                const addBtn = document.getElementById('addButton');
                if (addBtn) addBtn.remove();
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

// function toggleDescription() {
//     const descElement = document.getElementById('projectFullDesc');
//     const btn = document.getElementById("toggleDescBtn");
    
//     if (descElement.style.display === 'none') {
//         descElement.style.display = 'block';
//         // btn.textContent = 'ⓘ';
//         btn.title = 'Скрыть описание';
//     } else {
//         descElement.style.display = 'none';
//         // btn.textContent = 'ⓘ';
//         btn.title = 'Показать описание';
//     }
// }

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
    const addBtn = document.getElementById('addButton');
    if (addBtn) addBtn.style.display = 'flex';
}

// Переключение контекстного меню карты
function toggleMapMenu(mapId, btn) {
    event.stopPropagation();
    const menu = document.getElementById(`map-menu-${mapId}`);
    const isActive = menu.classList.contains('active');
    
    // Закрываем все другие меню
    closeAllMapMenus();
    
    if (!isActive) {
        const addBtn = document.getElementById('addButton');
        if (addBtn) addBtn.style.display = 'none';
        menu.classList.add('active');
        // Закрыть меню при клике вне его
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

// Получение данных карты из DOM
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

// Редактирование карты (из контекстного меню)
function editMapFromCard(mapId) {
    const mapData = getMapCardData(mapId);
    if (mapData) {
        editMap(mapId, mapData.title, mapData.description, mapData.imageUrl, mapData.visibility, mapData.isFile);
    }
    closeAllMapMenus();
}

// Переключение видимости карты (из контекстного меню)
async function toggleMapVisibilityFromCard(mapId) {
    closeAllMapMenus();
    
    const mapData = getMapCardData(mapId);
    if (mapData) {
        const newVisibility = !mapData.visibility;
        const fileRadio = document.querySelector('input[name="imageUploadType"][value="file"]');
        const isFile = (fileRadio && fileRadio.checked);
        await toggleMapVisibility(mapId, newVisibility);
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
            <div class="map-item${isVisible ? '' : ' invisible'}" data-map-id="${map.id}" data-map-title="${escapeHtml(map.title)}" data-map-description="${escapeHtml(map.description || '')}" data-map-imageurl="${escapeHtml(map.imageUrl || '')}" data-map-visibility="${isVisible}" data-map-isFile="${map.file}" onclick="openMap(${map.id})">
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
async function createMap(title, description, imageUrl, visibility = true, file) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps`, {
            method: 'POST',
            body: JSON.stringify({ title, description, imageUrl, visibility, file })
        });
        
        if (response.ok) {
            const map = await response.json();
            closeMapModal();
            this.project.maps.push(map);
            displayMaps(this.project.maps);
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

// Редактирование карты
async function updateMap(id, title, description, imageUrl, visibility, file) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description, imageUrl, visibility, file })
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

// Изменение видимости карты
async function toggleMapVisibility(id, visibility) {
    try {
        const response = await apiRequest(`/projects/${projectId}/maps/${id}/visibility`, {
            method: 'PUT',
            body: JSON.stringify({ visibility })
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
            if (map.visibility) showMessage('Карта видна всем', 'success');
            else showMessage('Карта скрыта', 'success');
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
    
    // Сбрасываем загрузку файлов
    // uploadedImageUrl = null;
    uploadedFile = null;
    document.getElementById('mapImageFile').value = '';
    document.getElementById('imagePreview').classList.add('hidden');
    
    // Устанавливаем вариант "По ссылке" по умолчанию
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
    
    // Сбрасываем загрузку файлов
    // uploadedImageUrl = null;
    uploadedFile = null;
    document.getElementById('mapImageFile').value = '';
    document.getElementById('imagePreview').classList.add('hidden');
    
    if (isFile) {
        document.querySelector('input[name="imageUploadType"][value="file"]').checked = true;
        document.getElementById('imageUrlGroup').classList.add('hidden');
        document.getElementById('imageFileGroup').classList.remove('hidden');
    }
    else {
        document.querySelector('input[name="imageUploadType"][value="url"]').checked = true;
        document.getElementById('imageUrlGroup').classList.remove('hidden');
        document.getElementById('imageFileGroup').classList.add('hidden');
    }
    
    document.getElementById('mapModal').classList.add('active');
}

function openMap(id) {
    window.location.href = `./map.html?mapId=${id}`;
}

function closeMapModal() {
    document.getElementById('mapModal').classList.remove('active');
    document.getElementById('mapImageFile').value = '';
    document.getElementById('imagePreview').classList.add('hidden');
}

function toggleImageUploadType() {
    const urlRadio = document.querySelector('input[name="imageUploadType"][value="url"]');
    const fileRadio = document.querySelector('input[name="imageUploadType"][value="file"]');
    const urlGroup = document.getElementById('imageUrlGroup');
    const fileGroup = document.getElementById('imageFileGroup');
    
    if (urlRadio.checked) {
        urlGroup.classList.remove('hidden');
        fileGroup.classList.add('hidden');
        // Очищаем файл
        // uploadedImageUrl = null;
        // uploadedFile = null;
        // document.getElementById('mapImageFile').value = '';
        document.getElementById('imagePreview').classList.add('hidden');
    } else if (fileRadio.checked) {
        urlGroup.classList.add('hidden');
        fileGroup.classList.remove('hidden');
    }
}

// Обработчик выбора файла
document.getElementById('mapImageFile').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Проверка размера файла (30 МБ)
    if (file.size > 30 * 1024 * 1024) {
        showMessage('Файл слишком большой. Максимальный размер: 30 МБ');
        this.value = '';
        return;
    }
    
    // Проверка типа файла - обновленные поддерживаемые форматы
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif'];
    const fileName = file.name.toLowerCase();
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.avif'];
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
        showMessage('Неподдерживаемый формат файла. Поддерживаются: PNG, JPG, JPEG, WEBP, AVIF');
        this.value = '';
        return;
    }
    
    // Применяем сжатие к загруженному файлу
    showMessage('Обработка изображения...', 'info');
    try {
        const compressedFile = await compressImage(file);
        uploadedFile = compressedFile;
        
        // Показываем превью сжатого изображения
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('imagePreview');
            const previewImg = document.getElementById('previewImage');
            previewImg.src = e.target.result;
            preview.classList.remove('hidden');
            
            // Показываем информацию о сжатии
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
        showMessage('Не удалось сжать файл. Попробуйте самостоятельно конвертировать файл в один из форматов: JPG, WEBP, AVIF');
        this.value = '';
        return;
    }
});

// Загрузка файла на сервер через POST
async function uploadImageFile(mapId, file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fileUploadRequest(`/maps/${mapId}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            // const data = await response.json();
            // uploadedImageUrl = data.url;
            showMessage('Изображение загружено успешно', 'success');
        } else {
            showMessage('Ошибка загрузки изображения');
        }
    } catch (error) {
        showMessage('Ошибка загрузки изображения');
    }
    uploadedFile = null;
}

// Удаление превью
function removeImagePreview() {
    document.getElementById('imagePreview').classList.add('hidden');
    document.getElementById('mapImageFile').value = '';
    // uploadedImageUrl = null;
    uploadedFile = null;
}

async function compressImage(file) {
    // Проверяем, нужно ли сжимать
    const fileType = file.type;
    const fileName = file.name.toLowerCase();
    
    // Если это webp или avif - сжатие не нужно
    if (fileType === 'image/webp' || fileType === 'image/avif' || 
        fileName.endsWith('.webp') || fileName.endsWith('.avif')) {
        return file;
    }
    
    try {
        // Пытаемся сжать в webp
        const webpFile = await compressToWebP(file);
        if (webpFile) {
            return webpFile;
        }
        
        // Если webp не получился, пытаемся сжать в jpg (только если не jpg)
        if (fileType !== 'image/jpeg' && fileType !== 'image/jpg' && 
            !fileName.endsWith('.jpg') && !fileName.endsWith('.jpeg')) {
            const jpgFile = await compressToJPG(file);
            if (jpgFile) {
                return jpgFile;
            }
        }
        
        // Если ничего не получилось, возвращаем исходный файл
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
                    // Создаем canvas для сжатия
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // Оптимальные размеры (по ширине/высоте)
                    let width = img.width;
                    let height = img.height;
                    const maxDimension = 10200;
                    
                    if (width > maxDimension || height > maxDimension) {
                        const ratio = Math.min(maxDimension / width, maxDimension / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    // Рисуем изображение
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Пытаемся сохранить в WebP с качеством 80%
                    const webpDataUrl = canvas.toDataURL('image/webp', 0.8);
                    
                    // Конвертируем DataURL в File
                    fetch(webpDataUrl)
                        .then(res => res.blob())
                        .then(blob => {
                            const webpFile = new File([blob], 
                                file.name.replace(/\.[^.]+$/, '.webp'), 
                                { type: 'image/webp' }
                            );
                            resolve(webpFile);
                        })
                        .catch(() => reject(new Error('Failed to convert WebP to File')));
                } catch (error) {
                    reject(error);
                }
            };
            img.onerror = function() {
                reject(new Error('Failed to load image'));
            };
            img.src = e.target.result;
        };
        reader.onerror = function() {
            reject(new Error('Failed to read file'));
        };
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
                    
                    // Оптимальные размеры (по ширине/высоте)
                    let width = img.width;
                    let height = img.height;
                    const maxDimension = 10200;
                    
                    if (width > maxDimension || height > maxDimension) {
                        const ratio = Math.min(maxDimension / width, maxDimension / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    // Рисуем изображение на белом фоне (для JPG)
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Пытаемся сохранить в JPG с качеством 85%
                    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    
                    fetch(jpgDataUrl)
                        .then(res => res.blob())
                        .then(blob => {
                            const jpgFile = new File([blob], 
                                file.name.replace(/\.[^.]+$/, '.jpg'), 
                                { type: 'image/jpeg' }
                            );
                            resolve(jpgFile);
                        })
                        .catch(() => reject(new Error('Failed to convert JPG to File')));
                } catch (error) {
                    reject(error);
                }
            };
            img.onerror = function() {
                reject(new Error('Failed to load image'));
            };
            img.src = e.target.result;
        };
        reader.onerror = function() {
            reject(new Error('Failed to read file'));
        };
        reader.readAsDataURL(file);
    });
}

// Обработчик формы
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