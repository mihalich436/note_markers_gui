class MarkerApp {
    constructor() {
        this.markers = [];
        this.generalInfo = {};
        this.selectedMarkerId = null;
        this.currentZoom = 1;
        this.minZoom = 0.5;
        this.maxZoom = 5;
        this.imagePosition = { x: 0, y: 0 };
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.clickStarted = false;

        // Свойства для touch
        this.touchStartDistance = 0; // Расстояние между пальцами при начале жеста
        this.touchStartZoom = 1; // Масштаб в начале жеста
        this.lastTouchDistance = 0; // Последнее расстояние между пальцами
        this.isPinching = false; // Флаг для определения pinch-жеста
        this.touchStartPositions = []; // Позиции пальцев
        
        // Режим перемещения маркера
        this.movingMarkerId = null;
        
        // Настройки маркеров
        this.markerSettings = {
            defaultVisibility: false,
            defaultShape: 'circle',
            defaultColor: '#ef4444',
            defaultSize: 36,
            showNotes: true,
            minZoomForLabels: 1 // Минимальный масштаб для отображения всех подписей
        };
        
        // Хранилище для копии изображения
        this.imageData = null;

        const urlParams = new URLSearchParams(window.location.search);
        this.mapId = urlParams.get('mapId');

        this.wsClient = new WsClient(getToken(), this.mapId);
        this.wsClient.onMessage(this.responseSaveMarker.bind(this));
        this.wsClient.onMessage(this.responseUpdateMarker.bind(this));
        this.wsClient.onMessage(this.responseDeleteMarker.bind(this));
        this.wsClient.onMessage(this.responseMoveMarker.bind(this));
        
        this.init();
    }

    init() {
        // DOM элементы - основные
        // this.imageUpload = document.getElementById('imageUpload');
        this.mainImage = document.getElementById('mainImage');
        this.transformContainer = document.getElementById('transform-container');
        this.imageContainer = document.getElementById('imageContainer');
        this.markersLayer = document.getElementById('markersLayer');
        this.tooltip = document.getElementById('tooltip');
        this.markerTitle = document.getElementById('markerTitle');
        this.noteText = document.getElementById('noteText');
        this.descriptionText = document.getElementById('descriptionText');
        this.saveNoteBtn = document.getElementById('saveNote');
        this.cancelNoteBtn = document.getElementById('cancelNote');
        this.markersList = document.getElementById('markersList');
        this.zoomInBtn = document.getElementById('zoomIn');
        this.zoomOutBtn = document.getElementById('zoomOut');
        this.resetZoomBtn = document.getElementById('resetZoom');
        this.modeIndicator = document.getElementById('modeIndicator');

        // Элементы для работы с файлами
        this.fileMenuBtn = document.getElementById('fileMenuBtn');
        this.helpBtn = document.getElementById('helpBtn');
        this.showMarkersListBtn = document.getElementById('showMarkersListBtn');
        this.generalInfoBtn = document.getElementById('generalInfoBtn');
        this.fileMenu = document.getElementById('fileMenu');
        this.helpModal = document.getElementById('helpModal');
        this.closeHelpBtn = document.getElementById('close-help');
        this.fileLoader = document.getElementById('fileLoader');
        
        // Кнопки действий с файлами
        this.loadImageBtn = document.getElementById('loadImageBtn');
        this.saveToFileBtn = document.getElementById('saveToFileBtn');
        this.loadFromFileBtn = document.getElementById('loadFromFileBtn');
        this.exportMarkersBtn = document.getElementById('exportMarkersBtn');
        this.importMarkersBtn = document.getElementById('importMarkersBtn');
        this.clearLocalStorageBtn = document.getElementById('clearLocalStorageBtn');

        // Элементы настроек маркеров
        this.markerSettingsBtn = document.getElementById('markerSettingsBtn');
        this.markerSettingsModal = document.getElementById('markerSettingsModal');
        this.closeSettingsBtn = document.querySelector('.close-settings');
        this.changeMarkerVisibility = document.getElementById('changeMarkerVisibility');
        this.currentMarkerColor = document.getElementById('currentMarkerColor');
        this.currentMarkerShape = document.getElementById('currentMarkerShape');
        this.markerSize = document.getElementById('markerSize');
        this.sizeValue = document.getElementById('sizeValue');
        this.markerSizeDefault = document.getElementById('markerSizeDefault');
        this.sizeValueDefault = document.getElementById('sizeValueDefault');
        this.showNotes = document.getElementById('showNotes');
        this.customColor = document.getElementById('customColor');
        this.applyMarkerSettings = document.getElementById('applyMarkerSettings');
        this.saveDefaultSettings = document.getElementById('saveDefaultSettings');
        this.resetMarkerSettings = document.getElementById('resetMarkerSettings');

        // Панели
        this.editPanel = document.getElementById('editPanel');
        this.markersPanel = document.getElementById('markersPanel');
        this.closeEditPanel = document.getElementById('closeEditPanel');
        this.closeMarkersPanel = document.getElementById('closeMarkersPanel');

        // Контекстное меню
        this.createContextMenu();

        // Состояние
        this.tempMarker = null;
        this.isAddingNote = false;

        // Загружаем настройки
        this.loadMarkerSettings();

        // События
        const ro = new ResizeObserver(entries => {
            this.countZoomLimits();
        });
        ro.observe(this.imageContainer);
        // this.imageUpload.addEventListener('change', this.handleImageUpload.bind(this));
        this.changeMarkerVisibility.addEventListener('click', this.toggleMarkerVisibility.bind(this));
        this.saveNoteBtn.addEventListener('click', this.saveNote.bind(this));
        this.cancelNoteBtn.addEventListener('click', this.cancelNote.bind(this));
        this.zoomInBtn.addEventListener('click', this.zoomIn.bind(this));
        this.zoomOutBtn.addEventListener('click', this.zoomOut.bind(this));
        this.resetZoomBtn.addEventListener('click', this.resetZoom.bind(this));
        
        this.customColor.addEventListener('click', this.customColorChanged.bind(this));
        this.markerSizeDefault.addEventListener('click', this.markerSizeChanged.bind(this));
        const shapeRadios = document.querySelectorAll('input[name="markerShape"]');
        shapeRadios.forEach(radio => {
            radio.addEventListener('click', this.shapeChanged.bind(this));
        });
        
        // Подсветка выбранного цвета
        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', this.customColorChanged.bind(this));
        });

        // События для мыши
        this.imageContainer.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this.imageContainer.addEventListener('mousedown', this.startDrag.bind(this));
        this.imageContainer.addEventListener('mousemove', this.drag.bind(this));
        this.imageContainer.addEventListener('mouseup', this.stopDrag.bind(this));
        this.imageContainer.addEventListener('mouseleave', this.stopDrag.bind(this));
        this.imageContainer.addEventListener('click', this.handleContainerClick.bind(this));
        this.imageContainer.addEventListener('contextmenu', this.handleContextMenu.bind(this));

        // События для touch (мобильные устройства)
        this.imageContainer.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.imageContainer.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.imageContainer.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.imageContainer.addEventListener('touchcancel', this.handleTouchEnd.bind(this));

        // События для работы с файлами
        this.fileMenuBtn.addEventListener('click', this.toggleFileMenu.bind(this));
        this.helpBtn.addEventListener('click', this.openHelp.bind(this));
        this.showMarkersListBtn.addEventListener('click', this.toggleMarkersPanel.bind(this));
        this.generalInfoBtn.addEventListener('click', this.toggleGeneralInfoPanel.bind(this));
        this.closeHelpBtn.addEventListener('click', this.closeHelp.bind(this));
        
        // this.loadImageBtn.addEventListener('click', () => this.imageUpload.click());
        this.loadImageBtn.addEventListener('click', () => this.showImageUploadForm());
        this.saveToFileBtn.addEventListener('click', this.saveToFile.bind(this));
        this.loadFromFileBtn.addEventListener('click', () => this.fileLoader.click());
        this.exportMarkersBtn.addEventListener('click', this.exportMarkers.bind(this));
        this.importMarkersBtn.addEventListener('click', () => {
            this.fileLoader.accept = '.json';
            this.fileLoader.click();
        });
        this.clearLocalStorageBtn.addEventListener('click', this.clearLocalStorage.bind(this));
        
        // Событие загрузки файла
        this.fileLoader.addEventListener('change', this.handleFileLoad.bind(this));
        
        // Закрытие меню при клике вне
        document.addEventListener('click', (e) => {
            if (this.fileMenu && !this.fileMenu.contains(e.target) && !this.fileMenuBtn.contains(e.target)) {
                this.fileMenu.classList.add('hidden');
            }
            this.closeContextMenu();
        });
        
        // Закрытие справки по ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeHelp();
                this.fileMenu.classList.add('hidden');
                this.markerSettingsModal.style.display = 'none';
                this.closeEditPanel.click();
                this.closeMarkersPanel.click();
                this.closeViewModal();
                this.closeContextMenu();
                if (this.movingMarkerId) {
                    this.movingMarkerId = null;
                    this.imageContainer.style.cursor = 'default';
                    this.showTooltip('Перемещение отменено', 1000);
                }
            }
        });

        // Закрытие панелей
        this.closeEditPanel.addEventListener('click', () => {
            this.editPanel.classList.add('hidden');
            if (this.tempMarker) {
                this.cancelNote();
            }
            else {
                const marker = this.markers.find(m => m.id === this.selectedMarkerId);
                this.selectedMarkerId = null;
                if (marker) {
                    this.drawMarker(marker, false, true);
                }
            }
        });

        this.closeMarkersPanel.addEventListener('click', () => {
            this.markersPanel.classList.add('hidden');
        });

        // События настроек маркеров
        this.markerSettingsBtn.addEventListener('click', () => {
            this.markerSettingsModal.style.display = 'block';
            this.loadSettingsToModal();
        });

        this.closeSettingsBtn.addEventListener('click', () => {
            this.markerSettingsModal.style.display = 'none';
        });

        // Обновление значения размера
        this.markerSizeDefault.addEventListener('input', (e) => {
            this.sizeValueDefault.textContent = e.target.value + 'px';
        });

        this.markerSize.addEventListener('input', (e) => {
            this.sizeValue.textContent = e.target.value + 'px';
        });

        // Выбор цвета из пресетов
        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const color = e.target.dataset.color;
                this.customColor.value = color;
                document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });

        // Применить настройки
        this.applyMarkerSettings.addEventListener('click', () => {
            this.applyMarkerSettingsToAll();
        });

        this.saveDefaultSettings.addEventListener('click', () => {
            this.saveMarkerSettingsAsDefault();
        });

        this.resetMarkerSettings.addEventListener('click', () => {
            this.resetMarkerSettingsToDefault();
        });

        // Создаем модальное окно просмотра
        this.initViewModal();

        //Инициализация окна загрузки изображения
        this.initImageUpload();

        // Загрузка из localStorage
        // this.loadFromStorage();
        this.loadMap();
        
        // Убеждаемся, что панели скрыты при загрузке
        this.editPanel.classList.add('hidden');
        this.markersPanel.classList.add('hidden');

        window.addEventListener('beforeunload', () => {
            this.wsClient.disconnect();
        });
        this.wsClient.connect();
    }

    createContextMenu() {
        // Создаем контекстное меню
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu hidden';
        document.body.appendChild(this.contextMenu);

        // Добавляем обработчик закрытия при клике вне меню
        document.addEventListener('click', () => {
            this.closeContextMenu();
        });
    }

    initViewModal() {
        this.viewModal = document.getElementById('viewModalContent');

        // Элементы модального окна
        this.viewModal = document.getElementById('viewModalContent');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendChatBtn = document.getElementById('sendChatBtn');
        this.viewModalTitle = document.getElementById('viewModalTitle');
        this.expandViewModal = document.getElementById('expandViewModal');
        this.closeViewModalBtn = document.getElementById('closeViewModal');

        // События модального окна
        // this.sendChatBtn.addEventListener('click', this.sendChatMessage.bind(this)); //> return when ready
        // this.viewModalSaveBtn.addEventListener('click', this.saveViewModalChanges.bind(this));
        // this.viewModalCancelBtn.addEventListener('click', this.closeViewModal.bind(this));
        this.expandViewModal.addEventListener('click', this.toggleViewModalSize.bind(this));
        this.closeViewModalBtn.addEventListener('click', this.closeViewModal.bind(this));

        // Режим редактирования общей информации
        this.editGeneralInfo = false;
    }

    initImageUpload() {
        this.imageUploadPanel = document.getElementById('imageUploadModal');
        this.imageUploadInput = document.getElementById('imageSourceInput');
        this.imageUploadSaveBtn = document.getElementById('imageSourceSaveBtn');
        this.imageUploadCloseBtn = document.getElementById('closeImageSource');

        this.imageUploadCloseBtn.addEventListener('click', this.closeImageUploadPanel.bind(this));
        this.imageUploadInput.addEventListener('click', this.uploadImageFromUrl.bind(this));
    }

    //> return when ready
    /*sendChatMessage() {
        const text = this.chatInput.value.trim();
        if (this.editGeneralInfo) {
            if (!text) return;
            if (!this.generalInfo.messages) this.generalInfo.messages = [];
            this.generalInfo.messages.push({
                id: Date.now(), //> + random? in future get from server?
                author: 'User',
                text: text,
                timestamp: new Date().toLocaleString()
            });
            this.renderChatMessages(this.generalInfo);
            this.chatInput.value = '';
        }
        else {
            if (!text || !this.selectedMarkerId) return;
            const marker = this.markers.find(m => m.id === this.selectedMarkerId);
            if (!marker) return;
            if (!marker.messages) marker.messages = [];
            marker.messages.push({
                author: 'User',
                text: text,
                timestamp: new Date().toLocaleString()
            });
            marker.isUpdated = true;
            this.renderChatMessages(marker);
            this.chatInput.value = '';
        }
        
    }*/

    renderChatMessages(entity) {
        if (!this.chatMessages) return;
        this.chatMessages.innerHTML = '';
        if (entity.description) this.appendMessageToChat({text: entity.description});
        if (!entity.messages || entity.messages.length === 0) {
            if (!entity.description) this.chatMessages.innerHTML = '<div class="chat-empty">Нет заметок</div>';
            return;
        }
        entity.messages.forEach(msg => this.appendMessageToChat(msg));
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    appendMessageToChat(msg) {
            const div = document.createElement('div');
            div.className = 'chat-message';
            const authorSpan = document.createElement('span');
            authorSpan.className = 'chat-author';
            authorSpan.textContent = msg.author ? (msg.author + ': ') : '';
            const textSpan = document.createElement('span');
            textSpan.className = 'chat-text';
            textSpan.innerHTML = this.linkify(msg.text);
            div.appendChild(authorSpan);
            div.appendChild(textSpan);
            const timeSpan = document.createElement('div');
            timeSpan.className = 'chat-time';
            timeSpan.textContent = msg.timestamp || '';
            div.appendChild(timeSpan);
            this.chatMessages.appendChild(div);
        }

    linkify(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlText = text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
        const newLineRegex = /(\r?\n)/g;
        return urlText.replace(newLineRegex, (newLine) => '<br>');
    }

    toggleViewModalSize() {
        this.viewModal.classList.toggle('expanded');
        this.expandViewModal.textContent = this.viewModal.classList.contains('expanded') ? '⤓' : '⤢';
    }

    openViewModal(markerId) {
        if (markerId === null) {
            if (this.editGeneralInfo) {
                this.currentViewMarkerId = null;
                const marker = this.markers.find(m => m.id === this.selectedMarkerId);
                this.selectedMarkerId = null;
                if (marker) {
                    marker.isUpdated = true;
                    this.drawMarker(marker, false, true);
                }
                // this.viewModalMarkerTitle.value = this.generalInfo.title || '';
                // this.viewModalNoteText.value = this.generalInfo.note || '';
                // this.viewModalDescriptionText.value = this.generalInfo.description || '';
                this.viewModalTitle.textContent = 'Общая информация';
                this.renderChatMessages(this.generalInfo);
            }
        }
        else {
            this.editGeneralInfo = false;
            const marker = this.markers.find(m => m.id === markerId);
            if (!marker) return;

            // this.currentViewMarkerId = markerId;
            // this.viewModalMarkerTitle.value = marker.title || '';
            // this.viewModalNoteText.value = marker.note || '';
            // this.viewModalDescriptionText.value = marker.description || '';
            this.viewModalTitle.textContent = marker.title || 'Просмотр маркера';
            this.renderChatMessages(marker);
        }

        this.viewModal.classList.remove('hidden');
    }

    closeViewModal() {
        this.viewModal.classList.add('hidden');
        this.editGeneralInfo = false;
        this.currentViewMarkerId = null;
        if (!this.editPanel.classList.contains('hidden')) return;
        const marker = this.markers.find(m => m.id === this.selectedMarkerId);
        this.selectedMarkerId = null;
        if (marker) {
            marker.isUpdated = true;
            this.drawMarker(marker, false, true);
        }
    }
/*
    saveViewModalChanges() {
        if (this.editGeneralInfo) {
            this.editGeneralInfo = false;
            this.generalInfo.title = this.viewModalMarkerTitle.value.trim() || marker.title;
            this.generalInfo.note = this.viewModalNoteText.value.trim();
            this.generalInfo.description = this.viewModalDescriptionText.value.trim();
            this.closeViewModal();
            return;
        }
        if (!this.currentViewMarkerId) return;

        const marker = this.markers.find(m => m.id === this.currentViewMarkerId);
        if (marker) {
            marker.isUpdated = true;
            marker.title = this.viewModalMarkerTitle.value.trim() || marker.title;
            marker.note = this.viewModalNoteText.value.trim();
            marker.description = this.viewModalDescriptionText.value.trim();
            marker.updatedAt = new Date().toLocaleString();

            // Обновляем форму редактирования, если она открыта
            if (this.selectedMarkerId === this.currentViewMarkerId) {
                this.markerTitle.value = marker.title;
                this.noteText.value = marker.note;
                this.descriptionText.value = marker.description;
            }

            this.renderMarkers();
            this.closeViewModal();
            this.showTooltip('Маркер обновлен', 1500);
        }
        else {
            this.closeViewModal();
        }
    }
*/
    showContextMenu(x, y, items) {
        this.contextMenu.innerHTML = '';
        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
        this.contextMenu.classList.remove('hidden');

        items.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.innerHTML = `<span>${item.icon || ''}</span> ${item.text}`;
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                item.action();
                this.closeContextMenu();
            });
            this.contextMenu.appendChild(menuItem);
        });
    }

    closeContextMenu() {
        this.contextMenu.classList.add('hidden');
    }

    handleContextMenu(e) {
        e.preventDefault();

        if (!(this.currentRole && (this.currentRole == 'EDITOR' || this.currentRole == 'ADMIN'))) return;
        if (this.movingMarkerId !== null) return;
        if (!this.mainImage.src || this.mainImage.src === '#') return;

        // Проверяем, кликнули ли на маркер
        const markerElement = e.target.closest('.marker');
        
        if (markerElement) {
            // Контекстное меню для маркера
            const markerId = parseInt(markerElement.id.replace('marker-', ''));
            const marker = this.markers.find(m => m.id === markerId);
            
            if (marker) {
                this.showContextMenu(e.clientX, e.clientY, [
                    { 
                        icon: '✏️', 
                        text: 'Редактировать', 
                        action: () => {
                            this.removeTempMarker();
                            if (this.selectedMarkerId) {
                                const oldMarker = this.markers.find(m => m.id === this.selectedMarkerId);
                                if (oldMarker) {
                                    oldMarker.isUpdated = true;
                                }
                            }
                            this.selectedMarkerId = markerId;
                            const marker = this.markers.find(m => m.id === markerId);
                            if (marker) {
                                marker.isUpdated = true;
                                this.markerTitle.value = marker.title || '';
                                this.noteText.value = marker.note || '';
                                this.descriptionText.value = marker.description || '';
                                this.isAddingNote = true;
                                
                                // Устанавливаем цвет и форму текущего маркера
                                if (marker.visibility) {
                                    this.changeMarkerVisibility.textContent = '👁️';
                                    this.changeMarkerVisibility.title = 'Маркер будет виден всем';
                                }
                                else {
                                    this.changeMarkerVisibility.textContent = '🚫';
                                    this.changeMarkerVisibility.title = 'Маркер будет виден только вам';
                                }
                                if (marker.color) this.currentMarkerColor.value = marker.color;
                                if (marker.shape) this.currentMarkerShape.value = marker.shape;
                                if (marker.size) {
                                    this.markerSize.value = marker.size;
                                    this.sizeValue.textContent = marker.size + 'px';
                                }
                                
                                this.centerOnMarker(marker);
                                this.showEditPanel();
                                this.closeViewModal();
                                
                            }
                            this.updateButtonsState();
                            this.renderMarkers();
                        }
                    },
                    { 
                        icon: '🖱️', 
                        text: 'Двигать', 
                        action: () => {
                            this.movingMarkerId = markerId;
                            this.imageContainer.style.cursor = 'crosshair';
                            this.showTooltip('Кликните на новое место для маркера', 2000);
                        }
                    },
                    { 
                        icon: '🗑️', 
                        text: 'Удалить', 
                        action: () => {
                            this.deleteMarker(markerId, e);
                        }
                    }
                ]);
            }
        } else if (e.target === this.imageContainer || e.target === this.mainImage) {
            if (this.mainImage.complete && this.mainImage.naturalWidth > 0) {
                // Контекстное меню для добавления маркера
                this.showContextMenu(e.clientX, e.clientY, [
                    { 
                        icon: '➕', 
                        text: 'Добавить', 
                        action: () => {
                            this.addMarkerAtPosition(e);
                        }
                    }
                ]);
            }
            else {
                // Контекстное меню для загрузки изображения
                this.showContextMenu(e.clientX, e.clientY, [
                    { 
                        icon: '📤', 
                        text: 'Загрузить изображение', 
                        action: () => {
                            // this.imageUpload.click();
                             this.showImageUploadForm();
                        }
                    },
                    { 
                        icon: '📂', 
                        text: 'Загрузить из файла', 
                        action: () => {
                            this.fileLoader.click();
                        }
                    }
                ]);
            }
            
        }
    }

    showImageUploadForm() {
        this.imageUploadPanel.classList.remove('hidden');
        this.imageUploadInput.value = this.imageUrl || '';

    }

    closeImageUploadPanel() {
        this.imageUploadPanel.classList.add('hidden');
    }

    uploadImageFromUrl() {
        //> try to load new image by link
        //> if success, send request to change map's imageUrl
    }

    addMarkerAtPosition(e) {
        if (!this.mainImage.src || this.mainImage.src === '#') return;

        const containerRect = this.imageContainer.getBoundingClientRect();
        const mousePos = this.getRelativeMousePosition(e);
        
        if (mousePos.x >= 0 && mousePos.x <= 100 && 
            mousePos.y >= 0 && mousePos.y <= 100) {
            
            this.tempMarker = {
                // id: Date.now(),
                x: mousePos.x,
                y: mousePos.y,
                title: '',
                note: '',
                description: '',
                createdAt: new Date().toLocaleString()
            };

            this.closeViewModal();
            this.selectedMarkerId = this.tempMarker.id;
            this.isAddingNote = true;
            
            this.markerTitle.value = '';
            this.noteText.value = '';
            this.descriptionText.value = '';
            
            // Устанавливаем цвет и форму по умолчанию
            if (this.markerSettings.defaultVisibility) {
                this.changeMarkerVisibility.textContent = '👁️';
                this.changeMarkerVisibility.title = 'Маркер будет виден всем';
            }
            else {
                this.changeMarkerVisibility.textContent = '🚫';
                this.changeMarkerVisibility.title = 'Маркер будет виден только вам';
            }
            
            this.currentMarkerColor.value = this.markerSettings.defaultColor;
            this.currentMarkerShape.value = this.markerSettings.defaultShape;
            this.markerSize.value = this.markerSettings.defaultSize;
            this.sizeValue.textContent = this.markerSettings.defaultSize + 'px';
            
            this.showEditPanel();
            this.markerTitle.focus();
            
            this.updateButtonsState();
            this.renderMarkers();
            
            this.showTooltip('Новый маркер', 1000);
        }
    }

    handleTouchStart(e) {
        // e.preventDefault();
        
        if (!this.mainImage.src || this.mainImage.src === '#') return;
        
        const touches = e.touches;
        this.touchStartPositions = [];
        
        for (let i = 0; i < touches.length; i++) {
            const rect = this.imageContainer.getBoundingClientRect();
            this.touchStartPositions.push({
                x: touches[i].clientX,
                y: touches[i].clientY
            });
        }
        
        if (touches.length === 1) {
            // Один палец - начало перемещения
            this.isDragging = true;
            this.clickStarted = true;
            this.dragStart.x = touches[0].clientX - this.imagePosition.x;
            this.dragStart.y = touches[0].clientY - this.imagePosition.y;
            this.imageContainer.style.cursor = 'grabbing';
        } else if (touches.length === 2) {
            // Два пальца - начало масштабирования
            this.isPinching = true;
            this.isDragging = false;
            
            // Вычисляем начальное расстояние между пальцами
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            this.touchStartDistance = Math.sqrt(dx * dx + dy * dy);
            this.touchStartZoom = this.currentZoom;
            
            // Сохраняем центр касания для масштабирования относительно него
            const centerX = (touches[0].clientX + touches[1].clientX) / 2;
            const centerY = (touches[0].clientY + touches[1].clientY) / 2;
            
            const containerRect = this.imageContainer.getBoundingClientRect();
            this.pinchCenter = {
                x: centerX - containerRect.left,
                y: centerY - containerRect.top
            };
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        
        if (!this.mainImage.src || this.mainImage.src === '#') return;
        
        const touches = e.touches;
        
        if (touches.length === 1 && this.isDragging && !this.isPinching) {
            // Перемещение одним пальцем
            const touch = touches[0];
            this.imagePosition.x = touch.clientX - this.dragStart.x;
            this.imagePosition.y = touch.clientY - this.dragStart.y;
            
            this.constrainImagePosition();
            this.updateImageTransform();
            this.renderMarkers();
            
        } else if (touches.length === 2 && this.isPinching) {
            // Масштабирование двумя пальцами
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            
            if (this.touchStartDistance > 0) {
                // Вычисляем новый масштаб
                const scale = currentDistance / this.touchStartDistance;
                const newZoom = Math.min(
                    Math.max(this.touchStartZoom * scale, this.minZoom), 
                    this.maxZoom
                );
                
                if (Math.abs(newZoom - this.currentZoom) > 0.01) {
                    // Масштабируем относительно центра касания
                    const containerRect = this.imageContainer.getBoundingClientRect();
                    const centerX = (touches[0].clientX + touches[1].clientX) / 2 - containerRect.left;
                    const centerY = (touches[0].clientY + touches[1].clientY) / 2 - containerRect.top;
                    
                    const zoomStep = newZoom / this.currentZoom;
                    
                    // Корректируем позицию для масштабирования относительно центра
                    this.imagePosition.x = this.imagePosition.x + (centerX - containerRect.width/2) * (1 - zoomStep);
                    this.imagePosition.y = this.imagePosition.y + (centerY - containerRect.height/2) * (1 - zoomStep);
                    
                    this.currentZoom = newZoom;
                    
                    this.constrainImagePosition();
                    this.updateImageTransform();
                    
                    // Обновляем отображение подписей в зависимости от масштаба
                    const showLabelsOld = this.showLabels;
                    this.showLabels = (this.currentZoom > this.markerSettings.minZoomForLabels);
                    const updateShowLabels = (this.showLabels != showLabelsOld);
                    
                    this.renderMarkers(updateShowLabels);
                    
                    // Показываем подсказку при первом скрытии подписей
                    if (!this.showLabels && updateShowLabels) {
                        this.showTooltip('Подписи скрыты, коснитесь маркера для просмотра', 1000);
                    }
                }
            }
            
            // Также позволяем перемещать изображение двумя пальцами
            if (this.touchStartPositions.length === 2) {
                const currentCenter = {
                    x: (touches[0].clientX + touches[1].clientX) / 2,
                    y: (touches[0].clientY + touches[1].clientY) / 2
                };
                
                const startCenter = {
                    x: (this.touchStartPositions[0].x + this.touchStartPositions[1].x) / 2,
                    y: (this.touchStartPositions[0].y + this.touchStartPositions[1].y) / 2
                };
                
                // Перемещаем изображение пропорционально смещению центра
                if (this.lastTouchCenter) {
                    const dx = currentCenter.x - this.lastTouchCenter.x;
                    const dy = currentCenter.y - this.lastTouchCenter.y;
                    
                    this.imagePosition.x += dx;
                    this.imagePosition.y += dy;
                    
                    this.constrainImagePosition();
                    this.updateImageTransform();
                    this.renderMarkers();
                }
                
                this.lastTouchCenter = currentCenter;
            }
        }
    }

    handleTouchEnd(e) {
        // e.preventDefault();
        
        // Сбрасываем состояния
        this.isDragging = false;
        this.isPinching = false;
        this.imageContainer.style.cursor = 'default';
        this.lastTouchCenter = null;
        this.touchStartDistance = 0;
        /*
        // Проверяем, был ли это клик (тап) по маркеру
        if (this.clickStarted && e.touches.length === 0) {
            // Эмулируем клик для выбора маркера
            const touch = e.changedTouches[0];
            if (touch) {
                const element = document.elementFromPoint(touch.clientX, touch.clientY);
                if (element && element.classList.contains('marker')) {
                    const markerId = parseInt(element.id.replace('marker-', ''));
                    this.selectMarker(markerId);
                }
            }
            this.clickStarted = false;
        }
        */
        // Сбрасываем позиции для следующего жеста
        this.touchStartPositions = [];
    }

    customColorChanged() {
        this.customColorIsChanged = true;
    }
    
    markerSizeChanged() {
        this.markerSizeIsChanged = true;
    }
    
    shapeChanged() {
        this.shapeIsChanged = true;
    }

    toggleMarkersPanel() {
        this.markersPanel.classList.toggle('hidden');
        if (!this.markersPanel.classList.contains('hidden')) {
            this.editPanel.classList.add('hidden');
            if (this.tempMarker) {
                this.cancelNote();
            }
            this.renderMarkersList();
        }
    }

    toggleGeneralInfoPanel() {
        this.editGeneralInfo = true;
        this.openViewModal(null);
    }

    showEditPanel() {
        this.editPanel.classList.remove('hidden');
        this.markersPanel.classList.add('hidden');
    }

    // Вспомогательный метод для показа подсказок
    showTooltip(text, duration = 1500) {
        this.tooltip.textContent = text;
        this.tooltip.classList.remove('hidden');
        
        // Позиционируем подсказку в центре
        const rect = this.imageContainer.getBoundingClientRect();
        this.tooltip.style.left = rect.left + rect.width / 2 + 'px';
        this.tooltip.style.top = rect.top + 50 + 'px';
        
        setTimeout(() => {
            this.tooltip.classList.add('hidden');
        }, duration);
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Загрузка изображения по ссылке
    async loadImageByUrl() {
        const url = this.imageUrlInput.value.trim();
        if (!url) {
            this.showNotification('Введите ссылку на изображение', 'error');
            return;
        }
        const img = new Image();
            
        img.onload = function() {
            // Изображение успешно загружено
            document.getElementById('mainImage').src = url;
        };
        
        img.onerror = function() {
            this.showNotification('Не удалось загрузить изображение. Проверьте ссылку.', 'error');
        };
        
        img.src = url;
        // try {
        //     const response = await fetch(url);
        //     if (!response.ok) throw new Error('Ошибка загрузки');
        //     const blob = await response.blob();
        //     const reader = new FileReader();
        //     reader.onload = (e) => {
        //         this.imageData = e.target.result;
        //         this.imageUrl = url;
        //         this.mainImage.src = this.imageData;
        //         this.mainImage.style.display = 'block';
        //         this.mainImage.onload = () => {
        //             this.countZoomLimits();
        //             this.resetZoom();
        //             this.imagePosition = { x: 0, y: 0 };
        //             this.updateImageTransform();
        //             this.showTooltip('Изображение загружено по ссылке', 1500);
        //         };
        //         if (this.markers && this.markers.length) {
        //             if (!confirm('Сохранить маркеры?')) this.clearMarkers();
        //         }
        //     };
        //     reader.readAsDataURL(blob);
        // } catch (err) {
        //     this.showNotification('Не удалось загрузить изображение', 'error');
        //     console.error(err);
        // }
    }

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Сохраняем копию изображения
                this.imageData = e.target.result;
                this.mainImage.src = this.imageData;
                this.mainImage.style.display = 'block';
                this.mainImage.onload = () => {
                    this.countZoomLimits();
                    this.resetZoom();
                    this.imagePosition = { x: 0, y: 0 };
                    this.updateImageTransform();
                    
                    this.showTooltip('Изображение загружено', 1500);
                };
                if (this.markers && this.markers.length) {
                    if (!confirm('Сохранить маркеры?')) {
                        this.clearMarkers();
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    }

    handleWheel(e) {
        e.preventDefault();
        
        if (!this.mainImage.src || this.mainImage.src === '#') return;

        const rect = this.transformContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.min(Math.max(this.currentZoom + delta, this.minZoom), this.maxZoom);

        if (newZoom !== this.currentZoom) {
            const zoomStep = newZoom / this.currentZoom;
            
            const showLabelsOld = this.showLabels;

            this.currentZoom = newZoom;

            this.imagePosition.x = this.imagePosition.x + (mouseX - rect.width/2) * (1 - zoomStep);
            this.imagePosition.y = this.imagePosition.y + (mouseY - rect.height/2) * (1 - zoomStep);

            this.constrainImagePosition(zoomStep);
            
            this.updateImageTransform();
            
            this.showLabels = (this.currentZoom > this.markerSettings.minZoomForLabels);
            const updateShowLabels = (this.showLabels != showLabelsOld);
            
            this.renderMarkers(updateShowLabels);
            
            // Показываем подсказку о текущем режиме отображения
            if (!this.showLabels && updateShowLabels) {
                this.showTooltip('Подписи скрыты, наведите на маркер для просмотра', 1000);
            }
        }
    }

    startDrag(e) {
        if (e.button !== 0 || this.movingMarkerId !== null) return;
        
        if (e.target === this.mainImage || e.target === this.markersLayer || e.target === this.imageContainer) {
            this.isDragging = true;
            this.clickStarted = true;
            this.dragStart.x = e.clientX - this.imagePosition.x;
            this.dragStart.y = e.clientY - this.imagePosition.y;
            this.imageContainer.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }

    drag(e) {
        if (!this.isDragging) return;
        
        e.preventDefault();
        
        this.imagePosition.x = e.clientX - this.dragStart.x;
        this.imagePosition.y = e.clientY - this.dragStart.y;

        this.constrainImagePosition();
        
        this.updateImageTransform();
        this.renderMarkers();
    }

    stopDrag(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.imageContainer.style.cursor = 'default';
            
            if (this.clickStarted) {
                const mouseMoveThreshold = 5;
                const movedX = Math.abs(e.clientX - this.dragStart.x - this.imagePosition.x);
                const movedY = Math.abs(e.clientY - this.dragStart.y - this.imagePosition.y);
                
                if (movedX > mouseMoveThreshold || movedY > mouseMoveThreshold) {
                    this.clickStarted = false;
                }
            }
        }
    }

    constrainImagePosition(zoomStep = 1) {
        if (!this.mainImage.src || this.mainImage.src === '#') return;

        const containerRect = this.imageContainer.getBoundingClientRect();
        const transformRect = this.transformContainer.getBoundingClientRect();
        const leftDist = (transformRect.width * zoomStep - containerRect.width) / 2;
        const rightDist = (containerRect.width - transformRect.width * zoomStep) / 2;
        const upDist = (transformRect.height * zoomStep - containerRect.height) / 2;
        const downDist = (containerRect.height - transformRect.height * zoomStep) / 2;

        const minX = Math.min (leftDist, rightDist);
        const maxX = Math.max (leftDist, rightDist);
        const minY = Math.min (upDist, downDist);
        const maxY = Math.max (upDist, downDist);

        this.imagePosition.x = Math.min(Math.max(this.imagePosition.x, minX), maxX);
        this.imagePosition.y = Math.min(Math.max(this.imagePosition.y, minY), maxY);
    }

    updateImageTransform() {
        this.transformContainer.style.transform = `translate(${this.imagePosition.x}px, ${this.imagePosition.y}px) scale(${this.currentZoom})`;
    }

    getRelativeMousePosition(e) {
        const rect = this.markersLayer.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * 100,
            y: (e.clientY - rect.top) / rect.height * 100
        };
    }

    responseMoveMarker(response) {
        if (!response || response.entityType != 'marker' || response.action != 'move') return;
        console.log('response move marker')
        const markerRes = response.object;
        const marker = this.markers.find(m => m.id === markerRes.id);
        marker.x = markerRes.x;
        marker.y = markerRes.y;
        marker.isUpdated = true;
        
        this.renderMarkers();
        this.showTooltip('Маркер перемещен', 1500);
    }

    async requestMoveMarker(marker, x, y) {
        try {
            if (!this.wsClient.sendMessage(`/markers/${marker.id}/move`, {x: x, y: y})) {
                this.showTooltip('Ошибка обновления маркера', 1500);
            }
        } catch (error) {
            this.showTooltip('Ошибка обновления маркера', 1500);
        }
    }

    handleContainerClick(e) {
        // Проверяем режим перемещения маркера
        if (this.movingMarkerId) {
            const marker = this.markers.find(m => m.id === this.movingMarkerId);
            this.imageContainer.style.cursor = 'default';
            this.movingMarkerId = null;
            if (marker) {
                const mousePos = this.getRelativeMousePosition(e);
                
                if (mousePos.x >= 0 && mousePos.x <= 100 && 
                    mousePos.y >= 0 && mousePos.y <= 100) {
                    this.requestMoveMarker(marker, mousePos.x, mousePos.y);
                }
            }
            return;
        }
        
        if (!this.editPanel.classList.contains('hidden') || !this.viewModal.classList.contains('hidden')) return;

        const marker = this.markers.find(m => m.id === this.selectedMarkerId);
        this.selectedMarkerId = null;
        if (marker) {
            this.drawMarker(marker, false, true);
        }
        
        this.clickStarted = false;
    }

    responseSaveMarker(response) {
        if (!response || response.entityType != 'marker' || response.action != 'add') return;
        console.log('response save marker')
        const marker = response.object;
        console.log(marker)
        if (marker) this.markers.push(marker);

        this.removeTempMarker();
        this.isAddingNote = false;
        this.selectedMarkerId = null;
        
        this.markerTitle.value = '';
        this.noteText.value = '';
        this.descriptionText.value = '';
        
        this.updateButtonsState();
        
        this.editPanel.classList.add('hidden');
        
        this.renderMarkers();
        
        this.showTooltip('Добавлен маркер', 1500);
    }

    async requestSaveMarker(marker) {
        console.log('requestSaveMarker')
        try {
            if (!this.wsClient.sendMessage(`/map/${this.mapId}/markers`, this.getMarkerDTO(marker))) {
                this.showTooltip('Ошибка обновления маркера', 1500);
            }
        } catch (error) {
            this.showTooltip('Ошибка сохранения маркера', 1500);
        }
    }

    getMarkerDTO(marker) {
        return {
            x: marker.x,
            y: marker.y,
            title: marker.title,
            note: marker.note,
            description: marker.description,
            color: marker.color,
            shape: marker.shape,
            size: marker.size,
            visibility: marker.visibility
        };
    }

    responseUpdateMarker(response) {
        if (!response || response.entityType != 'marker' || response.action != 'upd') return;
        console.log('response update marker')
        const markerRes = response.object;
        console.log(markerRes)
        if (!markerRes) return;
        const marker = this.markers.find(m => m.id === markerRes.id);
        if (marker) {
            if (!markerRes.visibility && this.currentRole !== 'ADMIN') {
                this.deleteMarkerImpl(markerRes.id);
            }
            marker.isUpdated = true;
            marker.title = markerRes.title;
            marker.note = markerRes.note;
            marker.description = markerRes.description;
            marker.updatedAt = markerRes.updatedAt;
            marker.visibility = markerRes.visibility;
            marker.color = markerRes.color;
            marker.shape = markerRes.shape;
            marker.size = markerRes.size;
        }
        else {
            markerRes.isUpdated = true;
            this.markers.push(markerRes);
            this.renderMarkers();
            this.showTooltip('Появился маркер', 1500);
        }

        this.selectedMarkerId = null;
        this.isAddingNote = false;
        
        this.markerTitle.value = '';
        this.noteText.value = '';
        this.descriptionText.value = '';
        
        this.updateButtonsState();
        
        this.editPanel.classList.add('hidden');
        
        this.renderMarkers();
        
        this.showTooltip('Маркер обновлен', 1500);
    }

    async requestUpdateMarker(markerId, markerDto) {
        try {
            if (!this.wsClient.sendMessage(`/markers/${markerId}`, markerDto)) {
                this.showTooltip('Ошибка обновления маркера', 1500);
            }
        } catch (error) {
            this.showTooltip('Ошибка обновления маркера', 1500);
        }
    }

    toggleMarkerVisibility() {
        if (this.changeMarkerVisibility.textContent === '🚫') {
            this.changeMarkerVisibility.textContent = '👁️';
            this.changeMarkerVisibility.title = 'Маркер будет виден всем';
        }
        else {
            this.changeMarkerVisibility.textContent = '🚫';
            this.changeMarkerVisibility.title = 'Маркер будет виден только вам';
        }
    }

    saveNote() {
        if (this.tempMarker) {
            const title = this.markerTitle.value.trim() || `Маркер #${this.tempMarker.id.toString().slice(-4)}`;
            const note = this.noteText.value.trim();
            const description = this.descriptionText.value.trim();
            
            this.tempMarker.title = title;
            this.tempMarker.note = note;
            this.tempMarker.description = description;
            this.tempMarker.updatedAt = new Date().toLocaleString();
            
            // Добавляем цвет и форму для нового маркера
            this.tempMarker.visibility = this.changeMarkerVisibility.textContent === '👁️';
            this.tempMarker.color = this.currentMarkerColor.value || this.markerSettings.defaultColor;
            this.tempMarker.shape = this.currentMarkerShape.value || this.markerSettings.defaultShape;
            this.tempMarker.size = this.markerSize.value || this.markerSettings.defaultSize;
            this.tempMarker.isUpdated = true;

            this.requestSaveMarker(this.tempMarker);
        } else if (this.selectedMarkerId) {
            const marker = this.markers.find(m => m.id === this.selectedMarkerId);
            if (marker) {
                const markerDto = this.getMarkerDTO({
                    x: marker.x,
                    y: marker.y,
                    title: this.markerTitle.value.trim() || marker.title,
                    note: this.noteText.value.trim(),
                    description: this.descriptionText.value.trim(),
                    color: this.currentMarkerColor.value || marker.color,
                    shape: this.currentMarkerShape.value || marker.shape,
                    size: this.markerSize.value || marker.size,
                    visibility: this.changeMarkerVisibility.textContent === '👁️'
                });

                this.requestUpdateMarker(marker.id, markerDto);
            }
        }
    }

    cancelNote() {
        this.removeTempMarker();
        this.isAddingNote = false;
        if (this.selectedMarkerId) {
            const marker = this.markers.find(m => m.id === this.selectedMarkerId);
            this.selectedMarkerId = null;
            if (marker) {
                marker.isUpdated = true;
                this.drawMarker(marker, false, true);
            }
        }
        this.markerTitle.value = '';
        this.noteText.value = '';
        this.descriptionText.value = '';
        this.updateButtonsState();
        
        this.editPanel.classList.add('hidden');
    }
    
    removeTempMarker() {
        if (this.tempMarker) {
            const tempMarkerDiv = document.getElementById(`marker-${this.tempMarker.id}`);
            if (tempMarkerDiv) {
                tempMarkerDiv.remove();
            }
        }
        this.tempMarker = null;
    }

    selectMarker(markerId) {
        this.closeContextMenu();
        this.removeTempMarker();
        if (this.selectedMarkerId) {
            const oldMarker = this.markers.find(m => m.id === this.selectedMarkerId);
            if (oldMarker) {
                oldMarker.isUpdated = true;
            }
        }
        this.selectedMarkerId = markerId;
        const marker = this.markers.find(m => m.id === markerId);
        if (marker) {
            marker.isUpdated = true;
            this.markerTitle.value = marker.title || '';
            this.noteText.value = marker.note || '';
            this.descriptionText.value = marker.description || '';
            this.isAddingNote = true;
            
            // Устанавливаем цвет и форму текущего маркера
            if (marker.visibility) {
                this.changeMarkerVisibility.textContent = '👁️';
                this.changeMarkerVisibility.title = 'Маркер будет виден всем';
            }
            else {
                this.changeMarkerVisibility.textContent = '🚫';
                this.changeMarkerVisibility.title = 'Маркер будет виден только вам';
            }
            if (marker.color) this.currentMarkerColor.value = marker.color;
            if (marker.shape) this.currentMarkerShape.value = marker.shape;
            if (marker.size) {
                this.markerSize.value = marker.size;
                this.sizeValue.textContent = marker.size + 'px';
            }
            
            this.centerOnMarker(marker);
            // this.showEditPanel();
            if (this.editPanel.classList.contains('hidden')) {
                this.editGeneralInfo = false;
                this.openViewModal(markerId);
            }
        }
        // this.updateButtonsState();
        this.renderMarkers();
    }

    centerOnMarker(marker) {
        const containerRect = this.markersLayer.getBoundingClientRect();
        
        // Центрируем маркер, оставляя место для подписи справа
        const targetX = (containerRect.width / 2) - (marker.x * containerRect.width / 100) - 50;
        const targetY = (containerRect.height / 2) - (marker.y * containerRect.height / 100);
        
        this.imagePosition.x = targetX;
        this.imagePosition.y = targetY;
        
        this.constrainImagePosition();
        
        this.updateImageTransform();
        this.renderMarkers();
    }

    deleteMarkerImpl(markerId) {
        const markerDiv = document.getElementById(`marker-${markerId}`);
        if (markerDiv) markerDiv.remove();
        this.markers = this.markers.filter(m => m.id !== markerId);
        
        if (this.selectedMarkerId === markerId) {
            this.selectedMarkerId = null;
            this.isAddingNote = false;
            this.markerTitle.value = '';
            this.noteText.value = '';
            this.descriptionText.value = '';
            this.updateButtonsState();
            
            this.editPanel.classList.add('hidden');
            this.closeViewModal();
        }
        
        this.renderMarkers();
    }

    deleteMarker(markerId, e) {
        e.stopPropagation();
        if (confirm('Удалить маркер?')) {
            this.requestDeleteMarker(markerId);
            // this.deleteMarkerImpl(markerId);
            // this.showTooltip('Маркер удален', 1500);
        }
    }

    responseDeleteMarker(response) {
        if (!response || response.entityType != 'marker' || response.action != 'del') return;
        console.log('response delete marker')
        const markerId = response.object;
        this.deleteMarkerImpl(markerId);
        this.showTooltip('Маркер удален', 1500);
    }

    async requestDeleteMarker(markerId) {
        try {
            if (!this.wsClient.sendMessage(`/markers/${markerId}/delete`, {})) {
                this.showTooltip('Ошибка удаления маркера', 1500);
            }
        } catch (error) {
            this.showTooltip('Ошибка удаления маркера', 1500);
        }
    }

    // async requestDeleteMarker(markerId) {
    //     try {
    //         const response = await apiRequest(`/markers/${markerId}`, {
    //             method: 'DELETE'
    //             // body: JSON.stringify(getMarkerDTO(marker))
    //         });            
    //         if (response.ok) {
    //             const markerId = await response.json();
    //             this.deleteMarkerImpl(markerId);
    //             this.showTooltip('Маркер удален', 1500);
    //         } else {
    //             this.showTooltip('Ошибка удаления маркера', 1500);
    //         }
    //     } catch (error) {
    //         this.showTooltip('Ошибка удаления маркера', 1500);
    //     }
    // }

    updateButtonsState() {
        this.changeMarkerVisibility.disabled = !this.isAddingNote;
        this.saveNoteBtn.disabled = !this.isAddingNote;
        this.cancelNoteBtn.disabled = !this.isAddingNote;
        
        if (this.selectedMarkerId && this.markers.find(m => m.id === this.selectedMarkerId)) {
            this.saveNoteBtn.textContent = '✏️ Обновить';
        } else {
            this.saveNoteBtn.textContent = '💾 Сохранить';
        }
    }

    renderMarkers(updateShowLabels = false) {        
        if (!this.mainImage.src || this.mainImage.src === '#') return;

        // Сначала отрисовываем все маркеры
        this.markers.forEach(marker => {
            this.drawMarker(marker, marker.id === this.selectedMarkerId, updateShowLabels);
        });

        if (this.tempMarker) {
            this.drawMarker(this.tempMarker, true, updateShowLabels);
        }

        if (!this.markersPanel.classList.contains('hidden')) {
            this.renderMarkersList();
        }
    }

    drawMarker(marker, isSelected = false, updateShowLabels = false) {
        const existingMarkerDiv = document.getElementById(`marker-${marker.id}`);
        const isUpdated = ((!existingMarkerDiv) || (marker.isUpdated) || updateShowLabels) ? true : false;
        marker.isUpdated = false;
        const markerDiv = isUpdated ? document.createElement('div') : existingMarkerDiv;
        if (isUpdated && existingMarkerDiv) {
            existingMarkerDiv.remove();
        }
        const shape = marker.shape || this.markerSettings.defaultShape;
        const color = marker.color || this.markerSettings.defaultColor;
        const size = marker.size || this.markerSettings.defaultSize;

        if (isUpdated) {
            let className = `marker ${shape}`;
            if (isSelected) className += ' selected';
            if (marker.description) className += ' has-description';
            if (!marker.visibility) className += ' invisible';
            
            markerDiv.className = className;
            markerDiv.id = `marker-${marker.id}`;
        
            // Применяем цвет
            if (shape === 'circle' || shape === 'square') {
                markerDiv.style.background = color;
            } else if (shape === 'triangle') {
                markerDiv.style.borderBottomColor = color;
            } else if (shape === 'star') {
                markerDiv.style.color = color;
            }
            
            // Применяем размер
            if (shape === 'circle' || shape === 'square') {
                markerDiv.style.width = size + 'px';
                markerDiv.style.height = size + 'px';
                markerDiv.style.lineHeight = size + 'px';
                markerDiv.style.fontSize = `${size/3}px`;
            } else if (shape === 'triangle') {
                markerDiv.style.borderLeftWidth = (size/2) + 'px';
                markerDiv.style.borderRightWidth = (size/2) + 'px';
                markerDiv.style.borderBottomWidth = (size * 0.86) + 'px';
            } else if (shape === 'star') {
                markerDiv.style.fontSize = size + 'px';
            }
            
            // Первая буква названия для круга и квадрата
            if (shape === 'circle' || shape === 'square') {
                const firstChar = marker.title ? marker.title.charAt(0).toUpperCase() : '#';
                // markerDiv.textContent = firstChar;
                const p = document.createElement('p');
                p.textContent = firstChar;
                markerDiv.appendChild(p);
            }
            
            markerDiv.style.left = `${marker.x}%`;
            markerDiv.style.top = `${marker.y}%`;

            // Добавляем атрибуты для хранения информации о маркере
            markerDiv.dataset.markerId = marker.id;
            markerDiv.dataset.markerTitle = marker.title || '';
            markerDiv.dataset.markerNote = marker.note || '';
            markerDiv.dataset.markerColor = color;

            markerDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectMarker(marker.id);
            });

            markerDiv.addEventListener('mouseenter', (e) => {
                this.showMarkerTooltip(marker, e);
            });

            markerDiv.addEventListener('mouseleave', () => {
                this.hideMarkerTooltip();
            });
        
            if ((this.showLabels || isSelected) && (marker.title || marker.note)) {
                const labelDiv = document.createElement('div');
                labelDiv.className = `marker-label ${isSelected ? 'selected-label' : ''}`;
                labelDiv.style.left = `${size + 1}px`;
                labelDiv.style.top = `${size/2}px`;
                if (marker.title) {
                    // Имя маркера всегда отображаем
                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'marker-label-title';
                    titleSpan.textContent = marker.title || `Маркер #${marker.id.toString().slice(-4)}`;
                    titleSpan.style.color = marker.color || this.markerSettings.defaultColor;
                    titleSpan.style.fontWeight = 'bold';
                    labelDiv.appendChild(titleSpan);
                }
                    
                // Если есть краткая заметка, добавляем её
                if (marker.note) {
                    const noteSpan = document.createElement('span');
                    noteSpan.className = 'marker-label-note';
                    noteSpan.textContent = `: ${marker.note.substring(0, 20)}${marker.note.length > 20 ? '...' : ''}`;
                    labelDiv.appendChild(noteSpan);
                }

                markerDiv.appendChild(labelDiv);
            }
            else {
                markerDiv.replaceChildren();
                // Первая буква названия для круга и квадрата
                if (shape === 'circle' || shape === 'square') {
                    const firstChar = marker.title ? marker.title.charAt(0).toUpperCase() : '#';
                    // markerDiv.textContent = firstChar;
                    const p = document.createElement('p');
                    p.textContent = firstChar;
                    markerDiv.appendChild(p);
                }
            }
            this.markersLayer.appendChild(markerDiv);
        }
        
        markerDiv.style.transform = `translate(-50%, -50%) scale(${1 / this.currentZoom})`;
    }

    showMarkerTooltip(marker, event) {
        // Показываем полную информацию при наведении, если подпись скрыта
        if ((this.currentZoom < this.markerSettings.minZoomForLabels || !this.markerSettings.showNotes) && (marker.title || marker.note)) {
            const markerDiv = document.getElementById(`marker-${marker.id}`);
            const existingLabels = markerDiv.querySelector('.marker-label');
            if (existingLabels) return;
            this.tooltipMarkerDiv = markerDiv;
            const size = marker.size || this.markerSettings.defaultSize;
            const labelDiv = document.createElement('div');
            labelDiv.className = `marker-label ${marker.id === this.selectedMarkerId ? 'selected-label' : ''}`;
            labelDiv.style.left = `${size + 1}px`;
            labelDiv.style.top = `${size/2}px`;
            if (marker.title) {
                // Имя маркера всегда отображаем
                const titleSpan = document.createElement('span');
                titleSpan.className = 'marker-label-title';
                titleSpan.textContent = marker.title || `Маркер #${marker.id.toString().slice(-4)}`;
                titleSpan.style.color = marker.color || this.markerSettings.defaultColor;
                titleSpan.style.fontWeight = 'bold';
                labelDiv.appendChild(titleSpan);
            }
                
            // Если есть краткая заметка, добавляем её
            if (marker.note) {
                const noteSpan = document.createElement('span');
                noteSpan.className = 'marker-label-note';
                noteSpan.textContent = `: ${marker.note.substring(0, 20)}${marker.note.length > 20 ? '...' : ''}`;
                labelDiv.appendChild(noteSpan);
            }

            markerDiv.appendChild(labelDiv);
        }
    }

    hideMarkerTooltip() {
        if (!this.showLabels && this.tooltipMarkerDiv) {
            this.tooltipMarkerDiv.querySelectorAll('.marker-label').forEach(lbl => lbl.remove());
        }
    }

    renderMarkersList() {
        if (this.markers.length === 0) {
            this.markersList.innerHTML = '<p style="color: #868e96; text-align: center;">Нет маркеров</p>';
            return;
        }

        this.markersList.innerHTML = this.markers.map(marker => `
            <div class="marker-item ${marker.id === this.selectedMarkerId ? 'selected-item' : ''}" 
                 onclick="app.selectMarker(${marker.id})">
                <span class="delete-marker" onclick="app.deleteMarker(${marker.id}, event)">✖</span>
                <div class="marker-title">${marker.title || `Маркер #${marker.id.toString().slice(-4)}`}</div>
                ${marker.note ? `<div class="marker-note-preview">📝 ${marker.note}</div>` : ''}
                <div style="display: flex; gap: 5px; margin-top: 5px;">
                    <span style="display: inline-block; width: 12px; height: 12px; background: ${marker.color || '#ef4444'}; border-radius: 2px;"></span>
                    <span style="font-size: 10px; color: #868e96;">${marker.shape || 'circle'}</span>
                </div>
                <div class="marker-meta">
                    <span>🕒 ${marker.updatedAt || marker.createdAt || ''}</span>
                    <span>📍 ${Math.round(marker.x)}, ${Math.round(marker.y)}</span>
                </div>
            </div>
        `).join('');
    }

    zoomIn() {
        const centerX = 0;
        const centerY = 0;
        this.zoomAtPoint(centerX, centerY, 0.25);
    }

    zoomOut() {
        const centerX = 0;
        const centerY = 0;
        this.zoomAtPoint(centerX, centerY, -0.25);
    }

    zoomAtPoint(pointX, pointY, delta) {
        if (!this.mainImage.src || this.mainImage.src === '#') return;
        
        const showLabelsOld = this.showLabels;
        const newZoom = Math.min(Math.max(this.currentZoom + delta, this.minZoom), this.maxZoom);
        
        if (newZoom !== this.currentZoom) {
            const imageX = (pointX - this.imagePosition.x) / this.currentZoom;
            const imageY = (pointY - this.imagePosition.y) / this.currentZoom;

            this.currentZoom = newZoom;

            this.imagePosition.x = pointX - imageX * this.currentZoom;
            this.imagePosition.y = pointY - imageY * this.currentZoom;

            this.constrainImagePosition();
            
            this.updateImageTransform();
            this.showLabels = (this.currentZoom > this.markerSettings.minZoomForLabels);
            const updateShowLabels = (this.showLabels != showLabelsOld);
            this.renderMarkers(updateShowLabels);
        }
    }

    resetZoom() {
        const showLabelsOld = this.showLabels;
        this.currentZoom = this.minZoom;
        this.showLabels = (this.currentZoom > this.markerSettings.minZoomForLabels);
        const updateShowLabels = (this.showLabels != showLabelsOld);
        this.imagePosition = { x: 0, y: 0 };
        this.updateImageTransform();
        this.renderMarkers(updateShowLabels);
        
        this.showTooltip('Масштаб сброшен', 1500);
    }

    countZoomLimits() {
        this.imagePosition = {x: 0, y: 0};
        this.currentZoom = 1;
        this.updateImageTransform();
        if (!this.mainImage.src || this.mainImage.src === '#') {
            this.minZoom = 1;
            this.maxZoom = 1;
            return;
        }
        const containerRect = this.imageContainer.getBoundingClientRect();
        const transformRect = this.transformContainer.getBoundingClientRect();
        const resX = containerRect.width / transformRect.width;
        const resY = containerRect.height / transformRect.height;

        this.minZoom = Math.min(resX, resY);
        this.maxZoom = this.minZoom + 5;
        this.resetZoom();
    }

    clearMarkers() {
        this.generalInfo = {};
        this.markers = [];
        this.tempMarker = null;
        this.selectedMarkerId = null;
        this.isAddingNote = false;
        this.markerTitle.value = '';
        this.noteText.value = '';
        this.descriptionText.value = '';
        this.updateButtonsState();
        this.markersLayer.innerHTML = '';
        this.renderMarkers();
        
        this.editPanel.classList.add('hidden');
        this.closeViewModal();
    }

    // Методы для работы с файлами
    toggleFileMenu(e) {
        e.stopPropagation();
        this.fileMenu.classList.toggle('hidden');
    }

    openHelp() {
        this.helpModal.classList.remove('hidden');
    }

    closeHelp() {
        this.helpModal.classList.add('hidden');
    }

    saveToFile() {
        if (!this.mainImage.src || this.mainImage.src === '#' || !this.imageData) {
            this.showNotification('Сначала загрузите изображение', 'error');
            return;
        }
        
        const data = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            imageData: this.imageData, // Сохраняем копию изображения
            generalInfo: this.generalInfo,
            markers: this.markers,
            zoom: this.currentZoom,
            position: this.imagePosition,
            settings: this.markerSettings
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `markers_${new Date().toISOString().slice(0,10)}.markerapp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('Проект сохранен в файл');
        this.fileMenu.classList.add('hidden');
    }

    handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                // Проверяем формат файла
                if (data.imageData) {
                    // Полный проект с изображением
                    this.imageData = data.imageData;
                    this.mainImage.src = this.imageData;
                    this.mainImage.style.display = 'block';
                    this.mainImage.onload = () => {
                        this.clearMarkers();
                        this.generalInfo = data.generalInfo || {};
                        this.markers = data.markers || [];
                        this.countZoomLimits();
                        this.currentZoom = data.zoom || this.minZoom;
                        this.imagePosition = data.position || { x: 0, y: 0 };
                        if (data.settings) this.markerSettings = data.settings;
                        this.updateImageTransform();
                        this.renderMarkers();
                        this.showNotification('Проект успешно загружен');
                    };
                } else if (Array.isArray(data)) {
                    // Только маркеры
                    this.clearMarkers();
                    this.markers = data;
                    this.renderMarkers();
                    this.showNotification('Маркеры импортированы');
                } else {
                    throw new Error('Неизвестный формат файла');
                }
            } catch (error) {
                console.error('Ошибка загрузки файла:', error);
                this.showNotification('Ошибка загрузки файла', 'error');
            }
        };
        reader.readAsText(file);
        
        // Сбрасываем input
        this.fileLoader.value = '';
        this.fileMenu.classList.add('hidden');
        this.markers.forEach(m => m.isUpdated = false);
    }

    exportMarkers() {
        if (this.markers.length === 0) {
            this.showNotification('Нет маркеров для экспорта', 'error');
            return;
        }
        
        const blob = new Blob([JSON.stringify(this.markers, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `markers_export_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('Маркеры экспортированы');
        this.fileMenu.classList.add('hidden');
    }

    clearLocalStorage() {
        if (confirm('Очистить все сохраненные данные? Это действие нельзя отменить.')) {
            localStorage.removeItem('markerApp');
            localStorage.removeItem('markerAppSettings');
            this.clearMarkers();
            this.imageData = null;
            this.mainImage.src = '#';
            this.mainImage.style.display = 'none';
            this.countZoomLimits();
            this.renderMarkers();
            this.showNotification('localStorage очищен');
            this.fileMenu.classList.add('hidden');
            
            this.editPanel.classList.add('hidden');
            this.markersPanel.classList.add('hidden');
            this.closeViewModal();
        }
    }

    // Методы для настроек маркеров
    loadMarkerSettings() {
        const saved = localStorage.getItem('markerAppSettings');
        if (saved) {
            try {
                this.markerSettings = JSON.parse(saved);
            } catch (e) {
                console.error('Ошибка загрузки настроек', e);
            }
        }
    }

    saveMarkerSettings() {
        localStorage.setItem('markerAppSettings', JSON.stringify(this.markerSettings));
    }

    loadSettingsToModal() {
        // Устанавливаем значения в модальном окне
        const shapeRadios = document.querySelectorAll('input[name="markerShape"]');
        shapeRadios.forEach(radio => {
            if (radio.value === this.markerSettings.defaultShape) {
                radio.checked = true;
            }
        });
        
        //> add button for default marker visibility
        this.customColor.value = this.markerSettings.defaultColor;
        this.markerSizeDefault.value = this.markerSettings.defaultSize;
        this.sizeValueDefault.textContent = this.markerSettings.defaultSize + 'px';
        this.showNotes.checked = this.markerSettings.showNotes;
        
        // Подсветка выбранного цвета
        document.querySelectorAll('.color-preset').forEach(btn => {
            if (btn.dataset.color === this.markerSettings.defaultColor) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        // Устанавливаем значение для ползунка масштаба подписей, если он есть
        const minZoomForLabels = document.getElementById('minZoomForLabels');
        const zoomValue = document.getElementById('zoomValue');
        if (minZoomForLabels && zoomValue) {
            minZoomForLabels.value = this.markerSettings.minZoomForLabels;
            zoomValue.textContent = this.markerSettings.minZoomForLabels + 'x';
            
            minZoomForLabels.addEventListener('input', (e) => {
                zoomValue.textContent = e.target.value + 'x';
            });
        }
        
        this.customColorIsChanged = false;
        this.markerSizeIsChanged = false;
        this.shapeIsChanged = false;
    }

    applyMarkerSettingsToAll() {
        const shape = document.querySelector('input[name="markerShape"]:checked')?.value || 'circle';
        const color = this.customColor.value;
        const size = parseInt(this.markerSizeDefault.value);
        const showNotes = this.showNotes.checked;
        
        this.markers.forEach(marker => {
            if (this.shapeIsChanged) marker.shape = shape;
            if (this.customColorIsChanged) marker.color = color;
            if (this.markerSizeIsChanged) marker.size = size;
        });
        
        this.markerSettings.showNotes = showNotes;
        this.markers.forEach(m => m.isUpdated = true);
        
        this.renderMarkers();
        
        this.markerSettingsModal.style.display = 'none';
        
        this.customColorIsChanged = false;
        this.markerSizeIsChanged = false;
        this.shapeIsChanged = false;
        
        this.showNotification('Настройки применены ко всем маркерам');
    }

    saveMarkerSettingsAsDefault() {
        this.markerSettings.defaultShape = document.querySelector('input[name="markerShape"]:checked')?.value || 'circle';
        this.markerSettings.defaultColor = this.customColor.value;
        this.markerSettings.defaultSize = parseInt(this.markerSizeDefault.value);
        this.markerSettings.showNotes = this.showNotes.checked;
        
        // Сохраняем значение ползунка масштаба подписей, если он есть
        const minZoomForLabels = document.getElementById('minZoomForLabels');
        if (minZoomForLabels) {
            this.markerSettings.minZoomForLabels = parseFloat(minZoomForLabels.value);
        }
        
        this.saveMarkerSettings();
        this.showNotification('Настройки сохранены как default');
    }

    resetMarkerSettingsToDefault() {
        this.markerSettings = {
            defaultShape: 'circle',
            defaultColor: '#ef4444',
            defaultSize: 36,
            showNotes: true,
            minZoomForLabels: 2
        };
        this.saveMarkerSettings();
        this.loadSettingsToModal();
        this.showNotification('Настройки сброшены');
    }

    //> to remove
    saveToStorage() {
        if (this.mainImage.src && this.mainImage.src !== '#' && this.imageData) {
            const data = {
                imageUrl: this.imageUrl, // Сохраняем ссылку изображения
                generalInfo: this.generalInfo,
                markers: this.markers,
                zoom: this.currentZoom,
                position: this.imagePosition
            };
            localStorage.setItem('markerApp', JSON.stringify(data));
        }
    }

    async loadMap() {
        try {
            const response = await apiRequest(`/maps/${this.mapId}`);
            console.log(response)
            
            if (response.ok) {
                const data = await response.json();
                const map = data.map;
                this.currentRole = data.role;
                console.log(map)
                console.log(this.currentRole)
                if (map.imageUrl) {
                    const url = map.imageUrl;
                    if (!url) {
                        this.showNotification('Нет ссылки на изображение', 'error');
                        return;
                    }
                    const img = new Image();
                        
                    img.onload = () => {
                        // Изображение успешно загружено
                        this.mainImage.src = url;
                        this.mainImage.onload = () => {
                            this.countZoomLimits();
                            this.generalInfo = map.description ? {description: map.description} : {}; //> temp
                            this.markers = map.markers || [];
                            this.currentZoom = map.zoom || this.minZoom;
                            this.imagePosition = map.position || { x: 0, y: 0 };
                            this.updateImageTransform();
                            this.showLabels = (this.currentZoom > this.markerSettings.minZoomForLabels);

                            this.renderMarkers();
                            
                            setTimeout(() => {
                                this.showTooltip('Данные загружены', 1500);
                            }, 500);
                        };
                    };
                    
                    img.onerror = () => {
                        this.showNotification('Не удалось загрузить изображение. Проверьте ссылку.', 'error');
                    };
                    
                    img.src = url;
                    this.mainImage.style.display = 'block';
                    
                }
            } else {
                this.showNotification('Ошибка загрузки карты', 'error');
            }
        } catch (error) {
            console.log(error)
            this.showNotification('Ошибка соединения с сервером', 'error');
        }
    }

    loadFromStorage() {
        const saved = localStorage.getItem('markerApp');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.imageData) {
                    this.imageData = data.imageData;
                    this.mainImage.src = this.imageData;
                    this.mainImage.style.display = 'block';
                    this.mainImage.onload = () => {
                        this.countZoomLimits();
                        this.generalInfo = data.generalInfo || {};
                        this.markers = data.markers || [];
                        this.currentZoom = data.zoom || this.minZoom;
                        this.imagePosition = data.position || { x: 0, y: 0 };
                        this.updateImageTransform();
                        this.showLabels = (this.currentZoom > this.markerSettings.minZoomForLabels);

                        this.renderMarkers();
                        
                        setTimeout(() => {
                            this.showTooltip('Данные загружены', 1500);
                        }, 500);
                    };
                }
            } catch (e) {
                console.error('Ошибка загрузки из localStorage', e);
            }
        }
    }
}

// Инициализация приложения
const app = new MarkerApp();
window.app = app;