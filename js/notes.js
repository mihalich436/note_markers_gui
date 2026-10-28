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
        this.projectId  = urlParams.get('projectId');

        this.note = {
            id: this.noteId,
            title: t('note.default_title'),
            description: '',
            messages: [],
        };

        this.currentUserId = null;
        this.currentRole   = null;
        this.userIdToNick  = new Map();

        this.chatView = null;

        this.notesList          = null;
        this.notesSidebar       = null;
        this.notesSidebarToggle = null;
        this.notesSidebarOverlay= null;
        this.noteTitleTop       = null;

        this.wsClient = new WsClient(getToken(), this.shareToken, 'note', this.noteId);
        this.wsClient.onMessage(this.handleWsMessage.bind(this));

        this.init();
    }

    init() {
        this.chatView = new ChatView(document.getElementById('viewModalContent'), {
            currentUserId: null,
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

        this.noteTitleTop = document.getElementById('noteTitleTop');
        this.chatView.setTitle = (title) => {
            const defaultTitle = t('note.default_title');
            const ttl = title || defaultTitle;
            if (this.noteTitleTop) this.noteTitleTop.textContent = ttl;
            document.title = `${ttl}${t('note.title_suffix')}`;
        };

        this.notesList           = document.getElementById('notesList');
        this.notesSidebar        = document.getElementById('notesSidebar');
        this.notesSidebarToggle  = document.getElementById('notesSidebarToggle');
        this.notesSidebarOverlay = document.getElementById('notesSidebarOverlay');

        this.initSidebar();

        this.chatView.open({
            id: this.noteId,
            title: t('note.default_title'),
            description: '',
            messages: [],
        });
        this.chatView.setTitle(t('note.default_title'));

        this.loadNote().then(() => {
            this.chatView.currentUserId = this.currentUserId;
            this.chatView.currentRole   = this.currentRole;
            this.chatView.userIdToNick  = this.userIdToNick;

            this.chatView.setTitle(this.note.title || t('note.default_title'));
            this.chatView.setReadOnly(this.currentRole === 'READ_ONLY');
            this.chatView.setShowInputArea(this.currentRole !== 'READ_ONLY');

            this.renderView();

            if (this.projectId) {
                this.loadNotesList();
            }

            this.wsClient.connect();
        });
    }

    async loadNote() {
        try {
            const url = `/notes/${this.noteId}${this.shareToken ? `?share=${this.shareToken}` : ''}`;
            const response = await apiRequest(url);

            if (!response.ok) {
                this.showNotification(t('note.error_load'), 'error');
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
                title:       note.title || t('note.default_title'),
                description: note.description || '',
                messages:    note.messages || [],
            };

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
            this.showNotification(t('note.error_connection'), 'error');
        }
    }

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

    /* ==================== список заметок ==================== */

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
        this.notesList.innerHTML = `<div class="notes-list-loading">${escapeHtml(t('note.list_loading'))}</div>`;
        try {
            const response = await apiRequest(`/projects/${this.projectId}/notes${this.shareToken ? `?share=${this.shareToken}` : ''}`);
            if (!response.ok) {
                this.notesList.innerHTML = `<div class="notes-list-empty">${escapeHtml(t('note.list_error'))}</div>`;
                return;
            }
            const data = await response.json();
            const notes = data.notes || data || [];
            this.renderNotesList(notes);
        } catch (e) {
            console.error(e);
            this.notesList.innerHTML = `<div class="notes-list-empty">${escapeHtml(t('note.error_connection'))}</div>`;
        }
    }

    renderNotesList(notes) {
        if (!notes.length) {
            this.notesList.innerHTML = `<div class="notes-list-empty">${escapeHtml(t('note.list_empty'))}</div>`;
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
            title.textContent = note.title || t('note.no_title');

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

        if (!this.note.messages) this.note.messages = [];
        if (msg.id && this.note.messages.some(m => m.id === msg.id)) return;
        this.note.messages.push(msg);

        if (this._canShowMessage(msg)) {
            this.chatView.appendMessage(msg);
        }
    }

    onMessageUpdate(msg) {
        if (!msg || String(msg.noteId) !== String(this.noteId)) return;

        if (!this.note.messages) this.note.messages = [];
        const idx = this.note.messages.findIndex(m => m.id === msg.id);
        if (idx !== -1) this.note.messages[idx] = msg;

        const updatedInDom = this.chatView.updateMessage(msg);
        if (!updatedInDom && this._canShowMessage(msg)) {
            this.chatView.appendMessage(msg);
        }
    }

    onMessageDelete(data) {
        if (!data || String(data.parentId) !== String(this.noteId)) return;

        if (this.note.messages) {
            this.note.messages = this.note.messages.filter(m => m.id !== data.messageId);
        }

        this.chatView.removeMessage(data.messageId);
    }

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

window.notesApp = new NotesApp();