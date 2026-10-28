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
        this.touchStartDistance = 0;
        this.touchStartZoom = 1;
        this.lastTouchDistance = 0;
        this.isPinching = false;
        this.touchStartPositions = [];

        // Режим перемещения маркера
        this.movingMarkerId = null;
        this.copyMarker = false;

        // Настройки маркеров
        this.markerSettings = {
            defaultShape: 'circle',
            defaultColor: '#ef4444',
            defaultSize: 36,
            showNotes: true,
            defaultVisibility: false,
            minZoomForLabels: 1
        };

        // Хранилище для копии изображения
        this.imageData = null;

        const urlParams = new URLSearchParams(window.location.search);
        this.mapId = urlParams.get('mapId');
        this.shareToken = urlParams.get('share');

        // ChatView создаётся позже — после получения userId/currentRole/userIdToNick
        this.chatView = null;

        this.wsClient = new WsClient(getToken(), this.shareToken, 'map', this.mapId);
        this.wsClient.onMessage(this.responseSaveMarker.bind(this));
        this.wsClient.onMessage(this.responseUpdateMarker.bind(this));
        this.wsClient.onMessage(this.responseDeleteMarker.bind(this));
        this.wsClient.onMessage(this.responseMoveMarker.bind(this));

        this.wsClient.onMessage(this.responseSaveMessage.bind(this));
        this.wsClient.onMessage(this.responseUpdateMessage.bind(this));
        this.wsClient.onMessage(this.responseDeleteMessage.bind(this));

        this.init();
    }

    // Хелпер: дефолтное имя маркера с локализованным префиксом
    markerDefaultTitle(id) {
        return t('map.default_marker_title', { id: id.toString().slice(-4) });
    }

    init() {
        // DOM элементы - основные
        this.mainImage = document.getElementById('mainImage');
        this.transformContainer = document.getElementById('transform-container');
        this.imageContainer = document.getElementById('imageContainer');
        this.markersLayer = document.getElementById('markersLayer');
        this.tooltip = document.getElementById('tooltip');
        this.markerNumber = document.getElementById('markerNumber');
        this.markerTitle = document.getElementById('markerTitle');
        this.noteText = document.getElementById('noteText');
        this.descriptionText = document.getElementById('descriptionText');
        this.saveNoteBtn = document.getElementById('saveNote');
        this.cancelNoteBtn = document.getElementById('cancelNote');
        this.markersList = document.getElementById('markersList');
        this.zoomInBtn = document.getElementById('zoomIn');
        this.zoomOutBtn = document.getElementById('zoomOut');
        this.resetZoomBtn = document.getElementById('resetZoom');

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
        this.defaultVisibility = document.getElementById('defaultVisibility');
        this.customColor = document.getElementById('customColor');
        this.saveDefaultSettings = document.getElementById('saveDefaultSettings');
        this.resetMarkerSettings = document.getElementById('resetMarkerSettings');

        // Панели
        this.editPanel = document.getElementById('editPanel');
        this.markersPanel = document.getElementById('markersPanel');
        this.closeEditPanel = document.getElementById('closeEditPanel');
        this.closeMarkersPanel = document.getElementById('closeMarkersPanel');

        // Кнопка "редактировать маркер" в шапке viewModal
        this.editViewModal = document.getElementById('editViewModal');
        this.editViewModal.addEventListener('click', this.openEditMarkerView.bind(this));

        // Контекстное меню (для маркеров и карты)
        this.createContextMenu();

        // Состояние
        this.tempMarker = null;
        this.isAddingNote = false;

        // Загружаем настройки
        this.loadMarkerSettings();

        // События
        const ro = new ResizeObserver(() => {
            this.countZoomLimits();
        });
        ro.observe(this.imageContainer);

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

        // События для touch
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

        // this.loadImageBtn.addEventListener('click', () => this.showImageUploadForm());
        this.fileLoader.addEventListener('change', this.handleFileLoad.bind(this));

        // Закрытие меню при клике вне
        document.addEventListener('click', (e) => {
            if (this.fileMenu && !this.fileMenu.contains(e.target) && !this.fileMenuBtn.contains(e.target)) {
                this.fileMenu.classList.add('hidden');
            }
            this.closeContextMenu();
        });

        // Закрытие панелей/модалок по ESC
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
                    this.copyMarker = false;
                    this.imageContainer.style.cursor = 'default';
                    this.showTooltip(t('map.notification_move_cancelled'), 1000);
                }
            }
        });

        // Закрытие панелей
        this.closeEditPanel.addEventListener('click', () => {
            this.editPanel.classList.add('hidden');
            if (this.tempMarker) {
                this.cancelNote();
            } else {
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
            this.fileMenu.classList.add('hidden');
            this.markerSettingsModal.style.display = 'block';
            this.loadSettingsToModal();
        });

        this.closeSettingsBtn.addEventListener('click', () => {
            this.markerSettingsModal.style.display = 'none';
        });

        this.markerSizeDefault.addEventListener('input', (e) => {
            this.sizeValueDefault.textContent = e.target.value + 'px';
        });

        this.markerSize.addEventListener('input', (e) => {
            this.sizeValue.textContent = e.target.value + 'px';
        });

        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const color = e.target.dataset.color;
                this.customColor.value = color;
                document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });

        this.saveDefaultSettings.addEventListener('click', () => {
            this.saveMarkerSettingsAsDefault();
        });

        this.resetMarkerSettings.addEventListener('click', () => {
            this.resetMarkerSettingsToDefault();
        });

        // Окно загрузки изображения
        this.initImageUpload();

        // Загрузка карты (внутри создастся ChatView)
        this.loadMap();

        // Убеждаемся, что панели скрыты при загрузке
        this.editPanel.classList.add('hidden');
        this.markersPanel.classList.add('hidden');

        window.addEventListener('beforeunload', () => {
            this.wsClient.disconnect();
        });
        this.wsClient.connect();
    }

    /* ================= ChatView ================= */

    initChatView() {
        this.chatView = new ChatView(document.getElementById('viewModalContent'), {
            currentUserId: this.userId,
            currentRole: this.currentRole,
            userIdToNick: this.userIdToNick,
            onSendMessage: (text, visibility) => {
                if (!this.selectedMarkerId) return;
                this.wsClient.sendMessage(
                    `/map/${this.mapId}/markers/${this.selectedMarkerId}/messages`,
                    { text, visibility }
                );
            },
            onUpdateText: (messageId, text) => {
                if (!this.selectedMarkerId) return;
                this.wsClient.sendMessage(
                    `/map/${this.mapId}/markers/${this.selectedMarkerId}/messages/${messageId}/text`,
                    { text }
                );
            },
            onUpdateVisibility: (messageId, visibility) => {
                if (!this.selectedMarkerId) return;
                this.wsClient.sendMessage(
                    `/map/${this.mapId}/markers/${this.selectedMarkerId}/messages/${messageId}/visibility`,
                    { visibility }
                );
            },
            onDeleteMessage: (messageId) => {
                if (!this.selectedMarkerId) return;
                this.wsClient.sendMessage(
                    `/map/${this.mapId}/markers/${this.selectedMarkerId}/messages/${messageId}/delete`,
                    {}
                );
            },
        });

        // Закрытие панели чата
        this.chatView.onClose = () => {
            document.getElementById('viewModalContent').classList.add('hidden');
            this.editGeneralInfo = false;
            if (!this.editPanel.classList.contains('hidden')) return;
            const marker = this.markers.find(m => m.id === this.selectedMarkerId);
            this.selectedMarkerId = null;
            if (marker) {
                marker.isUpdated = true;
                this.drawMarker(marker, false, true);
            }
        };

        // Видимость кнопки "редактировать"
        if (this.currentRole && (this.currentRole === 'EDITOR' || this.currentRole === 'ADMIN')) {
            this.editViewModal.classList.remove('hidden');
        } else {
            this.editViewModal.classList.add('hidden');
        }

        if (this.currentRole === 'READ_ONLY') {
            this.chatView.setReadOnly(true);
        } else {
            this.chatView.setReadOnly(false);
        }
    }

    /* ================= Контекстное меню карты/маркеров ================= */

    createContextMenu() {
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu hidden';
        document.body.appendChild(this.contextMenu);

        document.addEventListener('click', () => {
            this.closeContextMenu();
        });
    }

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

        const rect = this.contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.contextMenu.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            this.contextMenu.style.top = (y - rect.height) + 'px';
        }
    }

    closeContextMenu() {
        if (this.contextMenu) this.contextMenu.classList.add('hidden');
    }

    /* ================= Сообщения (WS-обработчики) ================= */

    responseSaveMessage(response) {
        if (!response || response.entityType !== 'message' || response.action !== 'add') return;
        const message = response.object;
        if (!message || !message.markerId) return;

        const marker = this.markers.find(m => m.id === message.markerId);
        if (!marker) return;
        if (!marker.messages) marker.messages = [];
        if (message.id && marker.messages.some(m => m.id === message.id)) return;
        marker.messages.push(message);

        if (this.selectedMarkerId === marker.id &&
            this.chatView &&
            !document.getElementById('viewModalContent').classList.contains('hidden')) {
            if (this._canShowMessage(message)) {
                this.chatView.appendMessage(message);
            }
        }
    }

    _canShowMessage(msg) {
        if (msg.visibility) return true;
        if (this.currentRole === 'ADMIN') return true;
        return msg.userId === this.userId;
    }

    responseUpdateMessage(response) {
        if (!response || response.entityType !== 'message' || response.action !== 'upd') return;
        const updated = response.object;
        if (!updated || !updated.markerId) return;

        const marker = this.markers.find(m => m.id === updated.markerId);
        if (!marker || !marker.messages) return;

        const idx = marker.messages.findIndex(m => m.id === updated.id);
        if (idx !== -1) marker.messages[idx] = updated;

        if (this.selectedMarkerId !== marker.id || !this.chatView) return;

        const updatedInDom = this.chatView.updateMessage(updated);
        if (!updatedInDom && this._canShowMessage(updated)) {
            this.chatView.appendMessage(updated);
        }
    }

    responseDeleteMessage(response) {
        if (!response || response.entityType !== 'message' || response.action !== 'del') return;
        const data = response.object || {};
        const parentId  = data.parentId;
        const messageId = data.messageId;
        if (!parentId || !messageId) return;

        const marker = this.markers.find(m => m.id === parentId);
        if (!marker || !marker.messages) return;
        marker.messages = marker.messages.filter(m => m.id !== messageId);

        if (this.selectedMarkerId === parentId && this.chatView) {
            this.chatView.removeMessage(messageId);
        }
    }

    /* ================= Открытие/закрытие viewModal ================= */

    openViewModal(markerId) {
        if (!this.chatView) return;

        if (markerId === null) {
            if (this.editGeneralInfo) {
                const marker = this.markers.find(m => m.id === this.selectedMarkerId);
                this.selectedMarkerId = null;
                if (marker) {
                    marker.isUpdated = true;
                    this.drawMarker(marker, false, true);
                }
                this.chatView.open(this.generalInfo);
                this.chatView.setTitle(t('map.general_info_title'));
                this.chatView.setShowInputArea(false);
                document.getElementById('viewModalContent').classList.remove('hidden');
            }
        } else {
            this.editGeneralInfo = false;
            const marker = this.markers.find(m => m.id === markerId);
            if (!marker) return;

            const visibleMessages = (marker.messages || []).filter(m => this._canShowMessage(m));
            const viewModel = {
                id: marker.id,
                title: marker.title,
                description: marker.description,
                messages: visibleMessages,
            };

            this.chatView.open(viewModel);

            this.chatView.setTitle(marker.title || this.markerDefaultTitle(marker.id));
            this.chatView.setReadOnly(this.currentRole === 'READ_ONLY');
            this.chatView.setShowInputArea(this.currentRole !== 'READ_ONLY');
            document.getElementById('viewModalContent').classList.remove('hidden');
        }
    }

    closeViewModal() {
        if (this.chatView) this.chatView.close();
        else document.getElementById('viewModalContent').classList.add('hidden');
    }

    /* ================= Уведомления ================= */

    showTooltip(text, duration = 1500) {
        this.tooltip.textContent = text;
        this.tooltip.classList.remove('hidden');

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

    /* ================= Редактирование маркера ================= */

    openEditMarkerView() {
        this.openEditMarkerViewImpl(this.selectedMarkerId);
    }

    openEditMarkerViewImpl(markerId) {
        this.removeTempMarker();
        if (this.selectedMarkerId) {
            const oldMarker = this.markers.find(m => m.id === this.selectedMarkerId);
            if (oldMarker) oldMarker.isUpdated = true;
        }
        this.selectedMarkerId = markerId;
        const marker = this.markers.find(m => m.id === markerId);
        if (marker) {
            marker.isUpdated = true;
            this.markerNumber.value = marker.number || '';
            this.markerTitle.value = marker.title || '';
            this.noteText.value = marker.note || '';
            this.descriptionText.value = marker.description || '';
            this.isAddingNote = true;

            if (marker.visibility || this.currentRole !== 'ADMIN') {
                this.changeMarkerVisibility.textContent = '👁️';
                this.changeMarkerVisibility.title = t('map.notification_visibility_all');
            } else {
                this.changeMarkerVisibility.textContent = '🚫';
                this.changeMarkerVisibility.title = t('map.notification_visibility_me');
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

    handleContextMenu(e) {
        e.preventDefault();

        if (!(this.currentRole && (this.currentRole == 'EDITOR' || this.currentRole == 'ADMIN'))) return;
        if (this.movingMarkerId !== null) return;
        if (!this.mainImage.src || this.mainImage.src === '#') return;

        const markerElement = e.target.closest('.marker');

        if (markerElement) {
            const markerId = parseInt(markerElement.id.replace('marker-', ''));
            const marker = this.markers.find(m => m.id === markerId);

            if (marker) {
                this.showContextMenu(e.clientX, e.clientY, [
                    {
                        icon: '✏️',
                        text: t('common.edit'),
                        action: () => {
                            this.openEditMarkerViewImpl(markerId);
                        }
                    },
                    {
                        icon: '🖱️',
                        text: t('map.context_move'),
                        action: () => {
                            this.movingMarkerId = markerId;
                            this.imageContainer.style.cursor = 'crosshair';
                            this.showTooltip(t('map.notification_click_new_place'), 2000);
                        }
                    },
                    {
                        icon: '➕',
                        text: t('map.context_copy'),
                        action: () => {
                            this.movingMarkerId = markerId;
                            this.copyMarker = true;
                            this.imageContainer.style.cursor = 'crosshair';
                            this.showTooltip(t('map.notification_click_new_place'), 2000);
                        }
                    },
                    {
                        icon: '🗑️',
                        text: t('common.delete'),
                        action: () => {
                            this.deleteMarker(markerId, e);
                        }
                    }
                ]);
            }
        } else if (e.target === this.imageContainer || e.target === this.mainImage) {
            if (this.mainImage.complete && this.mainImage.naturalWidth > 0) {
                this.showContextMenu(e.clientX, e.clientY, [
                    {
                        icon: '➕',
                        text: t('map.context_add'),
                        action: () => {
                            this.addMarkerAtPosition(e);
                        }
                    }
                ]);
            } else {
                this.showContextMenu(e.clientX, e.clientY, [
                    {
                        icon: '📤',
                        text: t('map.upload_image'),
                        action: () => {
                            this.showImageUploadForm();
                        }
                    },
                    {
                        icon: '📂',
                        text: t('map.context_load_file'),
                        action: () => {
                            this.fileLoader.click();
                        }
                    }
                ]);
            }
        }
    }

    /* ================= Загрузка изображения ================= */

    initImageUpload() {
        this.imageUploadPanel = document.getElementById('imageUploadModal');
        this.imageUploadInput = document.getElementById('imageSourceInput');
        this.imageUploadSaveBtn = document.getElementById('imageSourceSaveBtn');
        this.imageUploadCloseBtn = document.getElementById('closeImageSource');

        this.imageUploadCloseBtn.addEventListener('click', this.closeImageUploadPanel.bind(this));
        this.imageUploadInput.addEventListener('click', this.uploadImageFromUrl.bind(this));
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

    async loadImageByUrl() {
        const url = this.imageUrlInput.value.trim();
        if (!url) {
            this.showNotification(t('map.image_source_empty'), 'error');
            return;
        }
        const img = new Image();
        img.onload = function() {
            document.getElementById('mainImage').src = url;
        };
        img.onerror = function() {
            this.showNotification(t('map.image_source_error'), 'error');
        };
        img.src = url;
    }

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.imageData = e.target.result;
                this.mainImage.src = this.imageData;
                this.mainImage.style.display = 'block';
                this.mainImage.onload = () => {
                    this.countZoomLimits();
                    this.resetZoom();
                    this.imagePosition = { x: 0, y: 0 };
                    this.updateImageTransform();
                    this.showTooltip(t('map.image_source_loaded'), 1500);
                };
                if (this.markers && this.markers.length) {
                    if (!confirm(t('map.confirm_save_markers'))) {
                        this.clearMarkers();
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    }

    /* ================= Маркеры: добавление/сохранение ================= */

    addMarkerAtPosition(e) {
        if (!this.mainImage.src || this.mainImage.src === '#') return;

        const mousePos = this.getRelativeMousePosition(e);

        if (mousePos.x >= 0 && mousePos.x <= 100 &&
            mousePos.y >= 0 && mousePos.y <= 100) {

            this.tempMarker = {
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

            this.markerNumber.value = '';
            this.markerTitle.value = '';
            this.noteText.value = '';
            this.descriptionText.value = '';

            if (this.markerSettings.defaultVisibility || this.currentRole !== 'ADMIN') {
                this.changeMarkerVisibility.textContent = '👁️';
                this.changeMarkerVisibility.title = t('map.notification_visibility_all');
            } else {
                this.changeMarkerVisibility.textContent = '🚫';
                this.changeMarkerVisibility.title = t('map.notification_visibility_me');
            }

            this.currentMarkerColor.value = this.markerSettings.defaultColor;
            this.currentMarkerShape.value = this.markerSettings.defaultShape;
            this.markerSize.value = this.markerSettings.defaultSize;
            this.sizeValue.textContent = this.markerSettings.defaultSize + 'px';

            this.showEditPanel();
            this.markerTitle.focus();

            this.updateButtonsState();
            this.renderMarkers();

            this.showTooltip(t('map.notification_new_marker'), 1000);
        }
    }

    saveNote() {
        if (this.tempMarker) {
            const title = this.markerTitle.value.trim() || this.markerDefaultTitle(this.tempMarker.id);
            const note = this.noteText.value.trim();
            const description = this.descriptionText.value.trim();

            this.tempMarker.number = this.markerNumber.value.trim().slice(0, 3);
            this.tempMarker.title = title;
            this.tempMarker.note = note;
            this.tempMarker.description = description;
            this.tempMarker.updatedAt = new Date().toLocaleString();

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
                    number: this.markerNumber.value.trim().slice(0, 3),
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
        this.markerNumber.value = '';
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
            if (oldMarker) oldMarker.isUpdated = true;
        }
        this.selectedMarkerId = markerId;
        const marker = this.markers.find(m => m.id === markerId);
        if (marker) {
            marker.isUpdated = true;

            if (this.editPanel.classList.contains('hidden')) {
                this.editGeneralInfo = false;
                this.openViewModal(markerId);
            }
        }
        this.renderMarkers();
    }

    centerOnMarker(marker) {
        const containerRect = this.markersLayer.getBoundingClientRect();

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
            this.markerNumber.value = '';
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
        if (e) e.stopPropagation();
        if (confirm(t('map.confirm_delete_marker'))) {
            this.requestDeleteMarker(markerId);
        }
    }

    responseDeleteMarker(response) {
        if (!response || response.entityType !== 'marker' || response.action !== 'del') return;
        const markerId = response.object;
        this.deleteMarkerImpl(markerId);
        this.showTooltip(t('map.notification_marker_deleted'), 1500);
    }

    async requestMoveMarker(marker, x, y) {
        this.wsClient.sendMessage(
            `/map/${this.mapId}/markers/${marker.id}/move`,
            { x, y }
        );
    }

    async requestCopyMarker(marker, x, y) {
        this.wsClient.sendMessage(
            `/map/${this.mapId}/markers/${marker.id}/copy`,
            { x, y }
        );
    }

    async requestDeleteMarker(markerId) {
        this.wsClient.sendMessage(
            `/map/${this.mapId}/markers/${markerId}/delete`,
            {}
        );
    }

    async requestUpdateMarker(markerId, markerDto) {
        this.wsClient.sendMessage(
            `/map/${this.mapId}/markers/${markerId}`,
            markerDto
        );
    }

    responseMoveMarker(response) {
        if (!response || response.entityType !== 'marker' || response.action !== 'move') return;
        const markerRes = response.object;
        const marker = this.markers.find(m => m.id === markerRes.id);
        if (!marker) return;
        marker.x = markerRes.x;
        marker.y = markerRes.y;
        marker.isUpdated = true;

        this.renderMarkers();
        this.showTooltip(t('map.notification_marker_moved'), 1500);
    }

    responseSaveMarker(response) {
        if (!response || response.entityType !== 'marker' || response.action !== 'add') return;
        const marker = response.object;
        if (!marker.visibility && this.currentRole !== 'ADMIN') return;
        if (marker) this.markers.push(marker);

        this.removeTempMarker();
        this.isAddingNote = false;
        this.selectedMarkerId = null;

        this.markerNumber.value = '';
        this.markerTitle.value = '';
        this.noteText.value = '';
        this.descriptionText.value = '';

        this.updateButtonsState();
        this.editPanel.classList.add('hidden');
        this.renderMarkers();

        this.showTooltip(t('map.notification_marker_added'), 1500);
    }

    async requestSaveMarker(marker) {
        try {
            if (!this.wsClient.sendMessage(`/map/${this.mapId}/markers`, this.getMarkerDTO(marker))) {
                this.showTooltip(t('map.notification_error_update'), 1500);
            }
        } catch (error) {
            this.showTooltip(t('map.notification_error_save'), 1500);
        }
    }

    getMarkerDTO(marker) {
        return {
            x: marker.x,
            y: marker.y,
            number: marker.number,
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
        if (!response || response.entityType !== 'marker' || response.action !== 'upd') return;
        const markerRes = response.object;
        if (!markerRes) return;
        const marker = this.markers.find(m => m.id === markerRes.id);
        if (marker) {
            if (!markerRes.visibility && this.currentRole !== 'ADMIN') {
                this.deleteMarkerImpl(markerRes.id);
            }
            marker.isUpdated = true;
            marker.number = markerRes.number;
            marker.title = markerRes.title;
            marker.note = markerRes.note;
            marker.description = markerRes.description;
            marker.updatedAt = markerRes.updatedAt;
            marker.visibility = markerRes.visibility;
            marker.color = markerRes.color;
            marker.shape = markerRes.shape;
            marker.size = markerRes.size;
        } else {
            markerRes.isUpdated = true;
            this.markers.push(markerRes);
            this.renderMarkers();
            this.showTooltip(t('map.notification_marker_appeared'), 1500);
        }

        this.selectedMarkerId = null;
        this.isAddingNote = false;

        this.markerNumber.value = '';
        this.markerTitle.value = '';
        this.noteText.value = '';
        this.descriptionText.value = '';

        this.updateButtonsState();
        this.editPanel.classList.add('hidden');
        this.renderMarkers();

        this.showTooltip(t('map.notification_marker_updated'), 1500);
    }

    toggleMarkerVisibility() {
        if (this.currentRole !== 'ADMIN') return;
        if (this.changeMarkerVisibility.textContent === '🚫') {
            this.changeMarkerVisibility.textContent = '👁️';
            this.changeMarkerVisibility.title = t('map.notification_visibility_all');
        } else {
            this.changeMarkerVisibility.textContent = '🚫';
            this.changeMarkerVisibility.title = t('map.notification_visibility_me');
        }
    }

    updateButtonsState() {
        this.changeMarkerVisibility.disabled = !this.isAddingNote;
        this.saveNoteBtn.disabled = !this.isAddingNote;
        this.cancelNoteBtn.disabled = !this.isAddingNote;

        if (this.selectedMarkerId && this.markers.find(m => m.id === this.selectedMarkerId)) {
            this.saveNoteBtn.textContent = t('map.update_button');
        } else {
            this.saveNoteBtn.textContent = t('map.save_button');
        }
    }

    /* ================= Рендер маркеров ================= */

    renderMarkers(updateShowLabels = false) {
        if (!this.mainImage.src || this.mainImage.src === '#') return;

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

            if (shape === 'circle' || shape === 'square') {
                markerDiv.style.background = color;
            } else if (shape === 'triangle' || shape === 'star') {
                markerDiv.style.color = color;
            }

            markerDiv.style.width = size + 'px';
            markerDiv.style.height = size + 'px';

            if (shape === 'circle' || shape === 'square') {
                markerDiv.style.fontSize = `${size/3}px`;
            } else if (shape === 'triangle' || shape === 'star') {
                markerDiv.style.fontSize = size + 'px';
            }

            if (shape === 'circle' || shape === 'square') {
                const firstChar = marker.title ? marker.title.charAt(0).toUpperCase() : '#';
                const p = document.createElement('p');
                p.textContent = marker.number || firstChar;
                markerDiv.appendChild(p);
            }

            markerDiv.style.left = `${marker.x}%`;
            markerDiv.style.top = `${marker.y}%`;

            markerDiv.dataset.markerId = marker.id;
            markerDiv.dataset.markerNumber = marker.number || '';
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
                if (marker.title) {
                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'marker-label-title';
                    titleSpan.textContent = marker.title || this.markerDefaultTitle(marker.id);
                    titleSpan.style.color = marker.color || this.markerSettings.defaultColor;
                    titleSpan.style.fontWeight = 'bold';
                    labelDiv.appendChild(titleSpan);
                }
                if (marker.note) {
                    const noteSpan = document.createElement('span');
                    noteSpan.className = 'marker-label-note';
                    noteSpan.textContent = `: ${marker.note.substring(0, 20)}${marker.note.length > 20 ? '...' : ''}`;
                    labelDiv.appendChild(noteSpan);
                }
                markerDiv.appendChild(labelDiv);
            } else {
                markerDiv.replaceChildren();
                if (shape === 'circle' || shape === 'square') {
                    const firstChar = marker.title ? marker.title.charAt(0).toUpperCase() : '#';
                    const p = document.createElement('p');
                    p.textContent = marker.number || firstChar;
                    markerDiv.appendChild(p);
                }
            }
            this.markersLayer.appendChild(markerDiv);
        }

        markerDiv.style.transform = `translate(-50%, -50%) scale(${1 / this.currentZoom})`;
    }

    showMarkerTooltip(marker, event) {
        if ((this.currentZoom < this.markerSettings.minZoomForLabels || !this.markerSettings.showNotes) && (marker.title || marker.note)) {
            const markerDiv = document.getElementById(`marker-${marker.id}`);
            const existingLabels = markerDiv.querySelector('.marker-label');
            if (existingLabels) return;
            this.tooltipMarkerDiv = markerDiv;
            const size = marker.size || this.markerSettings.defaultSize;
            const labelDiv = document.createElement('div');
            labelDiv.className = `marker-label ${marker.id === this.selectedMarkerId ? 'selected-label' : ''}`;
            labelDiv.style.left = `${size + 1}px`;
            if (marker.title) {
                const titleSpan = document.createElement('span');
                titleSpan.className = 'marker-label-title';
                titleSpan.textContent = marker.title || this.markerDefaultTitle(marker.id);
                titleSpan.style.color = marker.color || this.markerSettings.defaultColor;
                titleSpan.style.fontWeight = 'bold';
                labelDiv.appendChild(titleSpan);
            }
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
            this.markersList.innerHTML = `<p style="color: #868e96; text-align: center;">${escapeHtml(t('map.no_markers'))}</p>`;
            return;
        }

        this.markersList.innerHTML = this.markers.map(marker => `
            <div class="marker-item ${marker.id === this.selectedMarkerId ? 'selected-item' : ''}" 
                 onclick="app.selectMarker(${marker.id})">
                <span class="delete-marker" onclick="app.deleteMarker(${marker.id}, event)">✖</span>
                <div class="marker-title">${escapeHtml(marker.title || this.markerDefaultTitle(marker.id))}</div>
                ${marker.note ? `<div class="marker-note-preview">📝 ${escapeHtml(marker.note)}</div>` : ''}
                <div style="display: flex; gap: 5px; margin-top: 5px;">
                    <span style="display: inline-block; width: 12px; height: 12px; background: ${marker.color || '#ef4444'}; border-radius: 2px;"></span>
                    <span style="font-size: 10px; color: #868e96;">${escapeHtml(marker.shape || 'circle')}</span>
                </div>
                <div class="marker-meta">
                    <span>🕒 ${escapeHtml(marker.updatedAt || marker.createdAt || '')}</span>
                    <span>📍 ${Math.round(marker.x)}, ${Math.round(marker.y)}</span>
                </div>
            </div>
        `).join('');
    }

    /* ================= Зум и панорамирование ================= */

    getShowLabels() {
        return (this.currentZoom > this.minZoom * this.markerSettings.minZoomForLabels) && this.markerSettings.showNotes;
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

            this.showLabels = this.getShowLabels();
            const updateShowLabels = (this.showLabels != showLabelsOld);

            this.renderMarkers(updateShowLabels);

            if (!this.showLabels && updateShowLabels) {
                this.showTooltip(t('map.notification_labels_hidden_zoom'), 1000);
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

        const minX = Math.min(leftDist, rightDist);
        const maxX = Math.max(leftDist, rightDist);
        const minY = Math.min(upDist, downDist);
        const maxY = Math.max(upDist, downDist);

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

    handleContainerClick(e) {
        if (this.movingMarkerId) {
            const marker = this.markers.find(m => m.id === this.movingMarkerId);
            this.imageContainer.style.cursor = 'default';
            this.movingMarkerId = null;
            if (marker) {
                const mousePos = this.getRelativeMousePosition(e);
                if (mousePos.x >= 0 && mousePos.x <= 100 &&
                    mousePos.y >= 0 && mousePos.y <= 100) {
                    if (this.copyMarker) this.requestCopyMarker(marker, mousePos.x, mousePos.y);
                    else this.requestMoveMarker(marker, mousePos.x, mousePos.y);
                    this.copyMarker = false;
                }
            }
            return;
        }

        if (!this.editPanel.classList.contains('hidden') ||
            !document.getElementById('viewModalContent').classList.contains('hidden')) return;

        const marker = this.markers.find(m => m.id === this.selectedMarkerId);
        this.selectedMarkerId = null;
        if (marker) {
            this.drawMarker(marker, false, true);
        }

        this.clickStarted = false;
    }

    /* ================= Touch ================= */

    handleTouchStart(e) {
        if (!this.mainImage.src || this.mainImage.src === '#') return;

        const touches = e.touches;
        this.touchStartPositions = [];

        for (let i = 0; i < touches.length; i++) {
            this.touchStartPositions.push({
                x: touches[i].clientX,
                y: touches[i].clientY
            });
        }

        if (touches.length === 1) {
            this.isDragging = true;
            this.clickStarted = true;
            this.dragStart.x = touches[0].clientX - this.imagePosition.x;
            this.dragStart.y = touches[0].clientY - this.imagePosition.y;
            this.imageContainer.style.cursor = 'grabbing';
        } else if (touches.length === 2) {
            this.isPinching = true;
            this.isDragging = false;

            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            this.touchStartDistance = Math.sqrt(dx * dx + dy * dy);
            this.touchStartZoom = this.currentZoom;

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
            const touch = touches[0];
            this.imagePosition.x = touch.clientX - this.dragStart.x;
            this.imagePosition.y = touch.clientY - this.dragStart.y;

            this.constrainImagePosition();
            this.updateImageTransform();
            this.renderMarkers();

        } else if (touches.length === 2 && this.isPinching) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);

            if (this.touchStartDistance > 0) {
                const scale = currentDistance / this.touchStartDistance;
                const newZoom = Math.min(
                    Math.max(this.touchStartZoom * scale, this.minZoom),
                    this.maxZoom
                );

                if (Math.abs(newZoom - this.currentZoom) > 0.01) {
                    const containerRect = this.imageContainer.getBoundingClientRect();
                    const centerX = (touches[0].clientX + touches[1].clientX) / 2 - containerRect.left;
                    const centerY = (touches[0].clientY + touches[1].clientY) / 2 - containerRect.top;

                    const zoomStep = newZoom / this.currentZoom;

                    this.imagePosition.x = this.imagePosition.x + (centerX - containerRect.width/2) * (1 - zoomStep);
                    this.imagePosition.y = this.imagePosition.y + (centerY - containerRect.height/2) * (1 - zoomStep);

                    this.currentZoom = newZoom;

                    this.constrainImagePosition();
                    this.updateImageTransform();

                    const showLabelsOld = this.showLabels;
                    this.showLabels = this.getShowLabels();
                    const updateShowLabels = (this.showLabels != showLabelsOld);

                    this.renderMarkers(updateShowLabels);

                    if (!this.showLabels && updateShowLabels) {
                        this.showTooltip(t('map.notification_labels_hidden_touch'), 1000);
                    }
                }
            }

            if (this.touchStartPositions.length === 2) {
                const currentCenter = {
                    x: (touches[0].clientX + touches[1].clientX) / 2,
                    y: (touches[0].clientY + touches[1].clientY) / 2
                };

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
        this.isDragging = false;
        this.isPinching = false;
        this.imageContainer.style.cursor = 'default';
        this.lastTouchCenter = null;
        this.touchStartDistance = 0;
        this.touchStartPositions = [];
    }

    /* ================= Кнопки зума ================= */

    zoomIn() {
        this.zoomAtPoint(0, 0, 0.25);
    }

    zoomOut() {
        this.zoomAtPoint(0, 0, -0.25);
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

            this.showLabels = this.getShowLabels();
            const updateShowLabels = (this.showLabels != showLabelsOld);
            this.renderMarkers(updateShowLabels);
        }
    }

    resetZoom() {
        const showLabelsOld = this.showLabels;
        this.currentZoom = this.minZoom;
        this.showLabels = this.getShowLabels();
        const updateShowLabels = (this.showLabels != showLabelsOld);
        this.imagePosition = { x: 0, y: 0 };
        this.updateImageTransform();
        this.renderMarkers(updateShowLabels);

        this.showTooltip(t('map.zoom_reset_done'), 1500);
    }

    countZoomLimits() {
        this.imagePosition = { x: 0, y: 0 };
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
        this.markerNumber.value = '';
        this.markerTitle.value = '';
        this.noteText.value = '';
        this.descriptionText.value = '';
        this.updateButtonsState();
        this.markersLayer.innerHTML = '';
        this.renderMarkers();

        this.editPanel.classList.add('hidden');
        this.closeViewModal();
    }

    /* ================= Панели ================= */

    toggleMarkersPanel() {
        this.fileMenu.classList.add('hidden');
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

    /* ================= Файлы ================= */

    toggleFileMenu(e) {
        e.stopPropagation();
        this.fileMenu.classList.toggle('hidden');
    }

    openHelp() {
        this.helpModal.classList.remove('hidden');
        this.fileMenu.classList.add('hidden');
    }

    closeHelp() {
        this.helpModal.classList.add('hidden');
    }

    saveToFile() {
        if (!this.mainImage.src || this.mainImage.src === '#' || !this.imageData) {
            this.showNotification(t('map.notification_no_image_link'), 'error');
            return;
        }

        const data = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            imageData: this.imageData,
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

        this.showNotification(t('map.notification_project_saved'));
        this.fileMenu.classList.add('hidden');
    }

    handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (data.imageData) {
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
                        this.showNotification(t('map.notification_project_loaded'));
                    };
                } else if (Array.isArray(data)) {
                    this.clearMarkers();
                    this.markers = data;
                    this.renderMarkers();
                    this.showNotification(t('map.notification_markers_imported'));
                } else {
                    throw new Error('Unknown file format');
                }
            } catch (error) {
                console.error('File load error:', error);
                this.showNotification(t('map.notification_file_error'), 'error');
            }
        };
        reader.readAsText(file);

        this.fileLoader.value = '';
        this.fileMenu.classList.add('hidden');
        this.markers.forEach(m => m.isUpdated = false);
    }

    exportMarkers() {
        if (this.markers.length === 0) {
            this.showNotification(t('map.notification_no_markers_export'), 'error');
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

        this.showNotification(t('map.notification_markers_exported'));
        this.fileMenu.classList.add('hidden');
    }

    clearLocalStorage() {
        if (confirm(t('map.confirm_clear_storage'))) {
            localStorage.removeItem('markerApp');
            localStorage.removeItem('markerAppSettings');
            this.clearMarkers();
            this.imageData = null;
            this.mainImage.src = '#';
            this.mainImage.style.display = 'none';
            this.countZoomLimits();
            this.renderMarkers();
            this.showNotification(t('map.notification_storage_cleared'));
            this.fileMenu.classList.add('hidden');

            this.editPanel.classList.add('hidden');
            this.markersPanel.classList.add('hidden');
            this.closeViewModal();
        }
    }

    /* ================= Настройки маркеров ================= */

    loadMarkerSettings() {
        const saved = localStorage.getItem('markerAppSettings');
        if (saved) {
            try {
                this.markerSettings = JSON.parse(saved);
            } catch (e) {
                console.error('Error loading settings', e);
            }
        }
    }

    saveMarkerSettings() {
        localStorage.setItem('markerAppSettings', JSON.stringify(this.markerSettings));
    }

    loadSettingsToModal() {
        const shapeRadios = document.querySelectorAll('input[name="markerShape"]');
        shapeRadios.forEach(radio => {
            if (radio.value === this.markerSettings.defaultShape) {
                radio.checked = true;
            }
        });

        this.customColor.value = this.markerSettings.defaultColor;
        this.markerSizeDefault.value = this.markerSettings.defaultSize;
        this.sizeValueDefault.textContent = this.markerSettings.defaultSize + 'px';
        this.showNotes.checked = this.markerSettings.showNotes;
        this.defaultVisibility.checked = this.markerSettings.defaultVisibility;

        document.querySelectorAll('.color-preset').forEach(btn => {
            if (btn.dataset.color === this.markerSettings.defaultColor) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

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

    saveMarkerSettingsAsDefault() {
        this.markerSettings.defaultShape = document.querySelector('input[name="markerShape"]:checked')?.value || 'circle';
        this.markerSettings.defaultColor = this.customColor.value;
        this.markerSettings.defaultSize = parseInt(this.markerSizeDefault.value);
        this.markerSettings.showNotes = this.showNotes.checked;
        this.markerSettings.defaultVisibility = this.defaultVisibility.checked;

        const minZoomForLabels = document.getElementById('minZoomForLabels');
        if (minZoomForLabels) {
            this.markerSettings.minZoomForLabels = parseFloat(minZoomForLabels.value);
        }

        this.saveMarkerSettings();
        this.showNotification(t('map.settings_saved'));
    }

    resetMarkerSettingsToDefault() {
        this.markerSettings = {
            defaultShape: 'circle',
            defaultColor: '#ef4444',
            defaultSize: 36,
            showNotes: true,
            defaultVisibility: false,
            minZoomForLabels: 2
        };
        this.saveMarkerSettings();
        this.loadSettingsToModal();
        this.showNotification(t('map.settings_reset'));
    }

    /* ================= Загрузка карты ================= */

    saveToStorage() {
        if (this.mainImage.src && this.mainImage.src !== '#' && this.imageData) {
            const data = {
                imageUrl: this.imageUrl,
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
            const response = await apiRequest(`/maps/${this.mapId}${this.shareToken ? `?share=${this.shareToken}` : ''}`);

            if (response.ok) {
                const data = await response.json();
                const map = data.map;
                this.currentRole = data.role;
                this.userId = data.userId;
                this.userIdToNick = new Map();
                Object.keys(data.userIdToNick).forEach(key => {
                    this.userIdToNick.set(Number(key), data.userIdToNick[key]);
                });

                this.initChatView();

                if (map.file && map.fileName) {
                    map.imageUrl = URL + map.imageUrl;
                }
                if (map.imageUrl) {
                    const url = map.imageUrl;
                    if (!url) {
                        this.showNotification(t('map.notification_no_image_link'), 'error');
                        return;
                    }
                    const img = new Image();

                    img.onload = () => {
                        this.mainImage.src = url;
                        this.mainImage.onload = () => {
                            this.countZoomLimits();
                            this.generalInfo = map.description ? { description: map.description } : {};
                            this.markers = map.markers || [];
                            this.currentZoom = map.zoom || this.minZoom;
                            this.imagePosition = map.position || { x: 0, y: 0 };
                            this.updateImageTransform();
                            this.showLabels = this.getShowLabels();

                            this.renderMarkers();

                            setTimeout(() => {
                                this.showTooltip(t('map.notification_data_loaded'), 1500);
                            }, 500);
                        };
                    };

                    img.onerror = () => {
                        this.showNotification(t('map.image_source_error'), 'error');
                    };

                    img.src = url;
                    this.mainImage.style.display = 'block';
                }
            } else {
                this.showNotification(t('map.notification_error_map_load'), 'error');
            }
        } catch (error) {
            console.log(error);
            this.showNotification(t('common.error_connection'), 'error');
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
                        this.showLabels = this.getShowLabels();

                        this.renderMarkers();

                        setTimeout(() => {
                            this.showTooltip(t('map.notification_data_loaded'), 1500);
                        }, 500);
                    };
                }
            } catch (e) {
                console.error('Error loading from localStorage', e);
            }
        }
    }
}

// Инициализация после того, как i18n готов (map.js подключается динамически из map.html)
const app = new MarkerApp();
window.app = app;