/**
 * Страница простых заметок.
 *
 * Контроллер владеет моделью (this.note.messages),
 * ChatView — только рендерит то, что ему передали.
 */
class NotesApp {
    constructor() {
        const urlParams = new URLSearchParams(window.location.search);
        this.noteId     = urlParams.get('noteId');
        this.shareToken = urlParams.get('share');
        this.projectId  = urlParams.get('projectId');   // может прийти в URL,
                                                        // иначе подтянется из loadNote

        // Модель
        this.note = {
            id: this.noteId,
            title: 'Заметка',
            description: '',
            messages: [],
        };

        // Пользователь
        this.currentUserId = null;
        this.currentRole   = null;
        this.userIdToNick  = new Map();

        // View
        this.chatView = null;

        // DOM-ссылки, заполняются в init()
        this.notesList          = null;
        this.notesSidebar       = null;
        this.notesSidebarToggle = null;
        this.notesSidebarOverlay= null;
        this.noteTitleTop       = null;

        // WS
        this.wsClient = new WsClient(getToken(), this.shareToken, 'note', this.noteId);
        this.wsClient.onMessage(this.handleWsMessage.bind(this));

        this.init();
    }

    /* ==================== init ==================== */

    init() {
        this.chatView = new ChatView(document.getElementById('viewModalContent'), {
            currentUserId: null,        // заполним после loadNote
            currentRole:   null,
            userIdToNick:  new Map(),

            onSendMessage: (text, visibility) => {
                this.wsClient.sendMessage(
                    `/notes/${this.noteId}/messages`,
                    { text, visibility }
                );
            },
            onUpdateText: (messageId, text) => {
                this.wsClient.sendMessage(
                    `/notes/${this.noteId}/messages/${messageId}/text`,
                    {  text }
                );
            },
            onUpdateVisibility: (messageId, visibility) => {
                this.wsClient.sendMessage(
                    `/notes/${this.noteId}/messages/${messageId}/visibility`,
                    { visibility }
                );
            },
            onDeleteMessage: (messageId) => {
                this.wsClient.sendMessage(
                    `/notes/${this.noteId}/messages/${messageId}/delete`,
                    { }
                );
            },
        });

        // Заголовок страницы — в шапке navbar, а не внутри ChatView
        this.noteTitleTop = document.getElementById('noteTitleTop');
        this.chatView.setTitle = (title) => {
            const t = title || 'Заметка';
            if (this.noteTitleTop) this.noteTitleTop.textContent = t;
            document.title = `${t} — The Lazy DM's Notes`;
        };

        // Сайдбар со списком заметок проекта
        this.notesList           = document.getElementById('notesList');
        this.notesSidebar        = document.getElementById('notesSidebar');
        this.notesSidebarToggle  = document.getElementById('notesSidebarToggle');
        this.notesSidebarOverlay = document.getElementById('notesSidebarOverlay');

        this.initSidebar();

        // Показываем пустой каркас сразу, чтобы не ждать сеть
        this.chatView.open({
            id: this.noteId,
            title: 'Заметка',
            description: '',
            messages: [],
        });
        this.chatView.setTitle('Заметка');

        this.loadNote().then(() => {
            // Пробрасываем в view актуальные данные о пользователе
            this.chatView.currentUserId = this.currentUserId;
            this.chatView.currentRole   = this.currentRole;
            this.chatView.userIdToNick  = this.userIdToNick;

            this.chatView.setTitle(this.note.title || 'Заметка');
            this.chatView.setReadOnly(this.currentRole === 'READ_ONLY');
            this.chatView.setShowInputArea(this.currentRole !== 'READ_ONLY');

            this.renderView();

            // Список заметок — только когда знаем projectId
            if (this.projectId) {
                this.loadNotesList();
            }

            this.wsClient.connect();
        });
    }

    /* ==================== загрузка заметки ==================== */

    async loadNote() {
        try {
            const url = `/notes/${this.noteId}${this.shareToken ? `?share=${this.shareToken}` : ''}`;
            const response = await apiRequest(url);

            if (!response.ok) {
                this.showNotification('Ошибка загрузки заметки', 'error');
                return;
            }
            const data = await response.json();
            const note = data.note || {};

            this.currentUserId = data.userId;
            this.currentRole   = data.role;
            this.userIdToNick  = new Map();
            Object.keys(data.userIdToNick || {}).forEach(k => {
                this.userIdToNick.set(Number(k), data.userIdToNick[k]);
            });

            this.note = {
                id:          note.id ?? this.noteId,
                title:       note.title || 'Заметка',
                description: note.description || '',
                messages:    note.messages || [],
            };

            // Если projectId не пришёл в URL — берём из ответа
            if (!this.projectId && note.projectId != null) {
                this.projectId = note.projectId;
            }
            const backLink = document.getElementById('backToProjectLink');
            if (backLink && this.projectId) {
                const params = new URLSearchParams();
                params.set('id', this.projectId);
                if (this.shareToken) params.set('share', this.shareToken);
                backLink.href = `project.html?${params.toString()}`;
            }
        } catch (e) {
            console.error(e);
            this.showNotification('Ошибка соединения', 'error');
        }
    }

    /* ==================== рендер заметки ==================== */

    /**
     * Готовит view-model (что должен отрисовать ChatView)
     * и передаёт его в open(). View не знает про приватность —
     * фильтрует контроллер.
     */
    renderView() {
        const visible = (this.note.messages || []).filter(m => this._canShowMessage(m));
        const viewModel = {
            id:          this.note.id,
            title:       this.note.title,
            description: this.note.description,
            messages:    visible,
        };
        this.chatView.open(viewModel);
    }

    _canShowMessage(msg) {
        if (msg.visibility) return true;
        if (this.currentRole === 'ADMIN') return true;
        return msg.userId === this.currentUserId;
    }

    /* ==================== список заметок проекта ==================== */

    initSidebar() {
        if (!this.notesSidebarToggle || !this.notesSidebar) return;

        this.notesSidebarToggle.addEventListener('click', () => {
            this.notesSidebar.classList.toggle('open');
            this.notesSidebarOverlay.classList.toggle(
                'hidden',
                !this.notesSidebar.classList.contains('open')
            );
        });

        this.notesSidebarOverlay.addEventListener('click', () => {
            this.closeSidebarOnMobile();
        });
    }

    async loadNotesList() {
        if (!this.notesList) return;
        this.notesList.innerHTML = '<div class="notes-list-loading">Загрузка...</div>';
        try {
            const response = await apiRequest(`/projects/${this.projectId}/notes${this.shareToken ? `?share=${this.shareToken}` : ''}`);
            if (!response.ok) {
                this.notesList.innerHTML = '<div class="notes-list-empty">Не удалось загрузить список</div>';
                return;
            }
            const data = await response.json();
            const notes = data.notes || data || [];
            this.renderNotesList(notes);
        } catch (e) {
            console.error(e);
            this.notesList.innerHTML = '<div class="notes-list-empty">Ошибка соединения</div>';
        }
    }

    renderNotesList(notes) {
        if (!notes.length) {
            this.notesList.innerHTML = '<div class="notes-list-empty">Нет заметок</div>';
            return;
        }

        this.notesList.innerHTML = '';
        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-list-item';
            if (String(note.id) === String(this.noteId)) item.classList.add('active');
            if (note.visibility === false) item.classList.add('invisible');

            const title = document.createElement('div');
            title.className = 'note-list-item-title';
            title.textContent = note.title || 'Без названия';

            const preview = document.createElement('div');
            preview.className = 'note-list-item-preview';
            preview.textContent = note.lastMessagePreview || note.description || '';

            const meta = document.createElement('div');
            meta.className = 'note-list-item-meta';
            const dateSpan = document.createElement('span');
            dateSpan.textContent = note.updatedAt || note.createdAt || '';
            meta.appendChild(dateSpan);

            item.append(title, preview, meta);

            item.addEventListener('click', () => {
                if (String(note.id) === String(this.noteId)) {
                    this.closeSidebarOnMobile();
                    return;
                }
                // Каждая заметка — отдельная страница со своим WS-каналом
                const params = new URLSearchParams();
                params.set('noteId', note.id);
                if (this.shareToken) params.set('share', this.shareToken);
                window.location.href = `note.html?${params.toString()}`;
            });

            this.notesList.appendChild(item);
        });
    }

    closeSidebarOnMobile() {
        if (!this.notesSidebar) return;
        this.notesSidebar.classList.remove('open');
        this.notesSidebarOverlay.classList.add('hidden');
    }

    /* ==================== WS ==================== */

    handleWsMessage(response) {
        if (!response || response.entityType !== 'message') return;

        switch (response.action) {
            case 'add': return this.onMessageAdd(response.object);
            case 'upd': return this.onMessageUpdate(response.object);
            case 'del': return this.onMessageDelete(response.object);
        }
    }

    onMessageAdd(msg) {
        if (!msg || String(msg.noteId) !== String(this.noteId)) return;

        // 1. Всегда пишем в модель
        if (!this.note.messages) this.note.messages = [];
        if (msg.id && this.note.messages.some(m => m.id === msg.id)) return;
        this.note.messages.push(msg);

        // 2. Рендерим только если пользователь может видеть сообщение
        if (this._canShowMessage(msg)) {
            this.chatView.appendMessage(msg);
        }
    }

    onMessageUpdate(msg) {
        if (!msg || String(msg.noteId) !== String(this.noteId)) return;

        // 1. Обновляем модель
        if (!this.note.messages) this.note.messages = [];
        const idx = this.note.messages.findIndex(m => m.id === msg.id);
        if (idx !== -1) this.note.messages[idx] = msg;

        // 2. Пробуем обновить DOM.
        //    Если сообщения в DOM нет, а оно стало видимым — дорисуем.
        const updatedInDom = this.chatView.updateMessage(msg);
        if (!updatedInDom && this._canShowMessage(msg)) {
            this.chatView.appendMessage(msg);
        }
    }

    onMessageDelete(data) {
        if (!data || String(data.parentId) !== String(this.noteId)) return;

        // 1. Убираем из модели
        if (this.note.messages) {
            this.note.messages = this.note.messages.filter(m => m.id !== data.messageId);
        }

        // 2. Убираем из DOM
        this.chatView.removeMessage(data.messageId);
    }

    /* ==================== утилиты ==================== */

    showNotification(message, type = 'success') {
        const n = document.createElement('div');
        n.className = `notification ${type}`;
        n.textContent = message;
        document.body.appendChild(n);
        setTimeout(() => {
            n.classList.add('fade-out');
            setTimeout(() => n.remove(), 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.notesApp = new NotesApp();
});