/**
 * ChatView — переиспользуемый компонент панели чата/заметок.
 *
 * Не знает ничего про WebSocket, маркеры и т.п.
 * Все действия отдаёт наружу через колбэки.
 *
 * Использование:
 *   const view = new ChatView(rootEl, {
 *       currentUserId, currentRole, userIdToNick,
 *       onSendMessage:      (text, visibility) => {},
 *       onUpdateText:       (messageId, text) => {},
 *       onUpdateVisibility: (messageId, visibility) => {},
 *       onDeleteMessage:    (messageId) => {},
 *       onEditDescription:  (text) => {},
 *   });
 *   view.open(entity);
 *   view.setProjectContext(projectId, shareToken); // для внутренних ссылок
 * Зависит от глобальных URL, apiRequest, t(), escapeHtml из config/i18n/common.
 */
class ChatView {
    constructor(rootEl, options = {}) {
        this.root = rootEl;

        this.currentUserId  = options.currentUserId ?? null;
        this.currentRole    = options.currentRole   ?? 'READ_ONLY';
        this.userIdToNick   = options.userIdToNick  ?? new Map();

        this.onSendMessage       = options.onSendMessage       || (() => {});
        this.onUpdateText        = options.onUpdateText        || (() => {});
        this.onUpdateVisibility  = options.onUpdateVisibility  || (() => {});
        this.onDeleteMessage     = options.onDeleteMessage     || (() => {});
        this.onEditDescription   = options.onEditDescription   || (() => {});

        // Контекст проекта — для внутренних ссылок
        this.projectId  = options.projectId  ?? null;
        this.shareToken = options.shareToken ?? null;

        this.entity = null;
        this.newMessageVisibility = true;
        this.readOnly = false;
        this.showInputArea = true;

        this.staticFormatToolbar = null;
        this.formatToolbar = null;
        this._floatingTarget = null;
        this._lastFormatTarget = null;

        // Кэш списков карт/заметок проекта
        this._mapsCache = null;   // null = не загружено
        this._notesCache = null;
        this._mapsLoading = false;
        this._notesLoading = false;

        // ---- linkDialog ----
        this.linkDialog      = document.getElementById('linkDialog');
        this.linkDialogTitle = document.getElementById('linkDialogTitle');
        this.linkDialogUrl   = document.getElementById('linkDialogUrl');
        this.linkDialogText  = document.getElementById('linkDialogText');
        this.linkDialogOk    = document.getElementById('linkDialogOk');
        this.linkDialogCancel= document.getElementById('linkDialogCancel');
        this.linkDialogTabs  = this.linkDialog?.querySelectorAll('.link-dialog-tab');
        this.linkDialogPanes = this.linkDialog?.querySelectorAll('.link-dialog-pane');
        this.linkMapFilter   = document.getElementById('linkMapFilter');
        this.linkNoteFilter  = document.getElementById('linkNoteFilter');
        this.linkMapList     = document.getElementById('linkMapList');
        this.linkNoteList    = document.getElementById('linkNoteList');

        // Состояние диалога
        this._linkDialogTab = 'url';          // 'url' | 'map' | 'note'
        this._linkSavedRange = null;
        this._linkSelectedMap = null;         // { id, title }
        this._linkSelectedNote = null;

        // ---- imageDialog ----
        this.imageDialog            = document.getElementById('imageUploadDialog');
        this.imageDialogTabs        = this.imageDialog?.querySelectorAll('.image-upload-tab');
        this.imageDialogPanes       = this.imageDialog?.querySelectorAll('.image-upload-pane');
        this.imageDialogUrl         = document.getElementById('imageUploadUrl');
        this.imageDialogFile        = document.getElementById('imageUploadFile');
        this.imageDialogPreviewWrap = document.getElementById('imageUploadPreviewWrap');
        this.imageDialogPreview     = document.getElementById('imageUploadPreview');
        this.imageDialogInfo        = document.getElementById('imageUploadInfo');
        this.imageDialogError       = document.getElementById('imageUploadError');
        this.imageDialogOk          = document.getElementById('imageUploadOk');
        this.imageDialogCancel      = document.getElementById('imageUploadCancel');

        this._imageDialogMode   = 'url';
        this._imageUploadFile   = null;
        this._imageUploadBusy   = false;
        this._imageSavedRange   = null;

        this._initDom();
        this._initEvents();
    }

    /* ============================ DOM ============================ */

    _initDom() {
        this.chatMessages  = this.root.querySelector('#chatMessages');
        this.chatInput     = this.root.querySelector('#chatInput');
        this.chatInputArea = this.root.querySelector('#chatInputArea');
        this.sendChatBtn   = this.root.querySelector('#sendChatBtn');
        this.visChatBtn    = this.root.querySelector('#visChatBtn');
        this.titleEl       = this.root.querySelector('#viewModalTitle');
        this.editBtn       = this.root.querySelector('#editViewModal');
        this.expandBtn     = this.root.querySelector('#expandViewModal');
        this.closeBtn      = this.root.querySelector('#closeViewModal');

        this.staticFormatToolbar = this.root.querySelector('#staticFormatToolbar');
        this.formatToolbar = document.getElementById('formatToolbar');

        this.messageMenu = document.createElement('div');
        this.messageMenu.className = 'context-menu note hidden';
        document.body.appendChild(this.messageMenu);
    }

    _initEvents() {
        this.sendChatBtn.addEventListener('click', () => this.send());
        this.visChatBtn.addEventListener('click', () => this._toggleNewMessageVisibility());
        if (this.closeBtn)  this.closeBtn.addEventListener('click', () => this.close());
        if (this.expandBtn) this.expandBtn.addEventListener('click', () => this._toggleSize());

        // Клик по картинке — открыть в новой вкладке
        this.chatMessages.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                window.open(e.target.src, '_blank', 'noopener');
            }
        });

        // Клик по кнопке-ссылке на карту/заметку
        this.chatMessages.addEventListener('click', (e) => {
            const btn = e.target.closest('.app-link-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            this._openAppLink(btn);
        });

        // Контекстное меню сообщений
        this.chatMessages.addEventListener('contextmenu', (e) => {
            const messageEl = e.target.closest('.chat-message');
            if (!messageEl) return;
            if (messageEl.querySelector('.chat-message-div')?.classList.contains('editing')) return;
            e.preventDefault();
            e.stopPropagation();
            this._showMessageMenu(
                e.clientX, e.clientY,
                messageEl.dataset.messageId,
                messageEl.dataset.markerId
            );
        });

        document.addEventListener('click', () => {
            this._closeMessageMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this._closeMessageMenu();
                this._closeLinkDialog();
                this._closeImageDialog();
                this._hideFormatToolbar();
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                const active = document.activeElement;
                if (!active) return;
                const isEditable = active === this.chatInput || active.classList.contains('chat-text');
                if (!isEditable) return;
                if (e.key === 'b' || e.key === 'B') { e.preventDefault(); document.execCommand('bold'); }
                if (e.key === 'i' || e.key === 'I') { e.preventDefault(); document.execCommand('italic'); }
                if (e.key === 'u' || e.key === 'U') { e.preventDefault(); document.execCommand('underline'); }
            }
        });

        const handlePaste = (e) => {
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');
            if (html) document.execCommand('insertHTML', false, this.sanitizeHtml(html));
            else      document.execCommand('insertHTML', false, this.linkify(text));
        };
        this.chatInput.addEventListener('paste', handlePaste);
        this.chatMessages.addEventListener('paste', handlePaste);

        // Статичный тулбар
        if (this.staticFormatToolbar) {
            this.staticFormatToolbar.querySelectorAll('.format-btn').forEach(btn => {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._applyFormat(btn.dataset.format);
                });
            });
        }

        // Всплывающий тулбар
        if (this.formatToolbar) {
            this.formatToolbar.querySelectorAll('.format-btn').forEach(btn => {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._applyFormat(btn.dataset.format, this._floatingTarget);
                });
            });
        }

        document.addEventListener('selectionchange', () => this._handleSelectionChange());

        document.addEventListener('focusin', (e) => {
            const t = e.target;
            if (!t) return;
            if (t === this.chatInput) {
                this._lastFormatTarget = this.chatInput;
                return;
            }
            if (t.classList?.contains('chat-text') && t.contentEditable === 'true') {
                this._lastFormatTarget = t;
            }
        });

        // ===== linkDialog =====
        if (this.linkDialog) {
            this.linkDialogTabs?.forEach(tab => {
                tab.addEventListener('click', () => this._switchLinkTab(tab.dataset.linkTab));
            });

            this.linkDialogUrl.addEventListener('input', () => this._updateLinkOkState());
            this.linkDialogText.addEventListener('input', () => this._updateLinkOkState());

            this.linkMapFilter.addEventListener('input', () => this._renderLinkList('map'));
            this.linkNoteFilter.addEventListener('input', () => this._renderLinkList('note'));

            this.linkDialogOk.addEventListener('click', () => this._confirmLinkDialog());
            this.linkDialogCancel.addEventListener('click', () => this._closeLinkDialog());

            this.linkDialogUrl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !this.linkDialogOk.disabled) this._confirmLinkDialog();
                if (e.key === 'Escape') this._closeLinkDialog();
            });
            this.linkDialogText.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !this.linkDialogOk.disabled) this._confirmLinkDialog();
                if (e.key === 'Escape') this._closeLinkDialog();
            });

            this.linkDialog.addEventListener('mousedown', (e) => {
                if (e.target === this.linkDialog) this._closeLinkDialog();
            });
        }

        // ===== imageDialog =====
        if (this.imageDialog) {
            this.imageDialogTabs.forEach(tab => {
                tab.addEventListener('click', () => this._switchImageTab(tab.dataset.tab));
            });

            this.imageDialogUrl.addEventListener('input', () => this._updateImageOkState());

            this.imageDialogFile.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                await this._handleImageFileSelected(file);
            });

            this.imageDialogOk.addEventListener('click', () => this._confirmImageDialog());
            this.imageDialogCancel.addEventListener('click', () => this._closeImageDialog());

            this.imageDialogUrl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !this.imageDialogOk.disabled) {
                    this._confirmImageDialog();
                }
                if (e.key === 'Escape') this._closeImageDialog();
            });

            this.imageDialog.addEventListener('mousedown', (e) => {
                if (e.target === this.imageDialog && !this._imageUploadBusy) {
                    this._closeImageDialog();
                }
            });
        }
    }

    /* ======================== Публичное API ====================== */

    /**
     * Устанавливает контекст проекта для внутренних ссылок.
     * Можно вызывать повторно — при смене проекта кэш сбрасывается.
     */
    setProjectContext(projectId, shareToken) {
        const changed = (this.projectId !== projectId) || (this.shareToken !== shareToken);
        this.projectId  = projectId ?? null;
        this.shareToken = shareToken ?? null;
        if (changed) {
            this._mapsCache = null;
            this._notesCache = null;
        }
    }

    open(entity) {
        this.entity = entity;
        this.setTitle(entity.title || '');
        this.renderMessages();
    }

    close() {
        this._hideFormatToolbar();
        this._closeMessageMenu();
        this._closeLinkDialog();
        this._closeImageDialog(true);
        if (typeof this.onClose === 'function') this.onClose();
        else this.root.classList.add('hidden');
    }

    setTitle(title) {
        if (this.titleEl) this.titleEl.textContent = title || t('chat.default_title');
    }

    setReadOnly(readOnly) {
        this.readOnly = !!readOnly;
        if (this.chatInputArea) this.chatInputArea.classList.toggle('hidden', this.readOnly);
        if (this.editBtn)       this.editBtn.classList.toggle('hidden', this.readOnly);
    }

    setShowInputArea(show) {
        this.showInputArea = !!show;
        if (this.chatInputArea) this.chatInputArea.classList.toggle('hidden', !show);
    }

    setNewMessageVisibility(visible) {
        this.newMessageVisibility = !!visible;
        this._updateVisBtn();
    }

    renderMessages() {
        if (!this.chatMessages) return;
        this.chatMessages.innerHTML = '';
        const entity = this.entity;
        if (!entity) return;
        if (entity.description) this._appendDescription(entity.description);
        if (!entity.messages || entity.messages.length === 0) {
            if (!entity.description) {
                this.chatMessages.innerHTML = `<div class="chat-empty">${escapeHtml(t('chat.empty'))}</div>`;
            }
            return;
        }
        entity.messages.forEach(m => this._appendMessage(m));
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    hasMessage(messageId) {
        return !!this.chatMessages.querySelector(`.chat-message[data-message-id="${messageId}"]`);
    }

    appendMessage(msg) {
        if (!this.chatMessages) return;
        if (msg.id && this.chatMessages.querySelector(`.chat-message[data-message-id="${msg.id}"]`)) return;
        const empty = this.chatMessages.querySelector('.chat-empty');
        if (empty) empty.remove();
        this._appendMessage(msg);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        this._clearInput();
    }

    updateMessage(msg) {
        if (!this.chatMessages) return false;
        const messageEl = this.chatMessages.querySelector(`.chat-message[data-message-id="${msg.id}"]`);
        if (!messageEl) return false;
        const messageDiv = messageEl.querySelector('.chat-message-div');
        if (!messageDiv) return false;
        const textSpan = messageDiv.querySelector('.chat-text');
        if (!textSpan) return false;

        messageDiv.classList.remove('editing');
        messageDiv.classList.toggle('invisible', !msg.visibility);
        textSpan.classList.toggle('invisible', !msg.visibility);

        const btnsContainer = messageEl.querySelector('.message-edit-buttons-container');
        if (btnsContainer) btnsContainer.remove();

        textSpan.contentEditable = 'false';
        textSpan.innerHTML = this.linkify(msg.text);

        if (this._lastFormatTarget === textSpan) {
            this._lastFormatTarget = this.chatInput;
        }

        const bottom = messageDiv.querySelector('.chat-bottom');
        if (bottom) {
            const authorSpan = bottom.querySelector('.chat-author, .chat-author-me');
            if (authorSpan) {
                const author = this.userIdToNick.get(msg.userId);
                authorSpan.textContent = author || '';
                authorSpan.className = `chat-author${msg.userId === this.currentUserId ? '-me' : ''}`;
            }
            const timeSpan = bottom.querySelector('.chat-time');
            if (timeSpan) timeSpan.textContent = msg.createdAt || '';
        }

        const msgEntity = this.entity?.messages?.find(m => String(m.id) === String(msg.id));
        if (msgEntity) {
            msgEntity.visibility = msg.visibility;
            msgEntity.text = msg.text;
        }
        return true;
    }

    removeMessage(messageId) {
        const el = this.chatMessages.querySelector(`.chat-message[data-message-id="${messageId}"]`);
        if (el) el.remove();
        this.entity.messages = this.entity.messages.filter(m => m.id !== messageId);
        if (this.chatMessages.children.length === 0) {
            this.chatMessages.innerHTML = `<div class="chat-empty">${escapeHtml(t('chat.empty'))}</div>`;
        }
    }

    focusInput() {
        if (this.chatInput) {
            this.chatInput.focus();
            this._lastFormatTarget = this.chatInput;
        }
    }

    /* ====================== Отправка ====================== */

    send() {
        if (!this.chatInput || this.readOnly) return;
        const raw = this.chatInput.innerHTML.trim();
        if (!raw) return;
        const text = this.sanitizeHtml(raw);
        if (!this._hasMeaningfulContent(text)) return;

        this.onSendMessage(text, this.newMessageVisibility);
        this._clearInput();
        this._hideFormatToolbar();
        this._lastFormatTarget = this.chatInput;
    }

    _hasMeaningfulContent(html) {
        // пусто, если после удаления пустых абзацев/br/nbsp/zero-width ничего нет
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        // кнопки-ссылки считаем содержимым
        if (tmp.querySelector('.app-link-btn')) return true;
        const text = tmp.textContent.replace(/[\s\u200B]/g, '');
        return text.length > 0;
    }

    _clearInput() {
        if (this.chatInput) this.chatInput.innerHTML = '';
    }

    /* ====================== Рендер ====================== */

    _appendDescription(html) {
        const div = document.createElement('div');
        div.className = 'chat-message';
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message-div';
        const textSpan = document.createElement('span');
        textSpan.className = 'chat-text';
        textSpan.innerHTML = this.linkify(html);
        messageDiv.appendChild(textSpan);
        div.appendChild(messageDiv);
        this.chatMessages.appendChild(div);
    }

    _appendMessage(msg) {
        if (!this._isMessageVisible(msg)) return;
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.setAttribute('data-message-id', msg.id);
        div.setAttribute('data-marker-id', this.entity?.id ?? '');

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message-div${msg.visibility ? '' : ' invisible'}`;

        const textSpan = document.createElement('span');
        textSpan.className = `chat-text${msg.visibility ? '' : ' invisible'}`;
        textSpan.innerHTML = this.linkify(msg.text);
        messageDiv.appendChild(textSpan);

        const bottom = document.createElement('div');
        bottom.className = 'chat-bottom';

        const author = this.userIdToNick.get(msg.userId);
        const authorSpan = document.createElement('span');
        authorSpan.className = `chat-author${msg.userId === this.currentUserId ? '-me' : ''}`;
        authorSpan.textContent = author || '';
        bottom.appendChild(authorSpan);

        const timeSpan = document.createElement('div');
        timeSpan.className = 'chat-time';
        timeSpan.textContent = msg.createdAt || '';
        bottom.appendChild(timeSpan);

        messageDiv.appendChild(bottom);
        div.appendChild(messageDiv);
        this.chatMessages.appendChild(div);

        this.entity.messages.push(msg);
    }

    _isMessageVisible(msg) {
        if (msg.visibility) return true;
        if (this.currentRole === 'ADMIN') return true;
        return msg.userId === this.currentUserId;
    }

    /* ================= Контекстное меню ================= */

    _showMessageMenu(x, y, messageId, markerId) {
        const msg = this.entity?.messages?.find(m => String(m.id) === String(messageId));
        if (!msg) return;
        if (msg.userId !== this.currentUserId && this.currentRole !== 'ADMIN') return;

        this.messageMenu.innerHTML = '';
        this.messageMenu.style.left = x + 'px';
        this.messageMenu.style.top  = y + 'px';
        this.messageMenu.classList.remove('hidden');

        const items = [
            { icon: '✏️', text: t('chat.menu_edit'),   action: () => this._editMessage(msg.id, markerId) },
            {
                icon: msg.visibility ? '🚫' : '👁️',
                text: msg.visibility ? t('chat.menu_hide') : t('chat.menu_show'),
                action: () => this.onUpdateVisibility(msg.id, !msg.visibility),
            },
            { icon: '🗑️', text: t('chat.menu_delete'), action: () => this.onDeleteMessage(msg.id) },
        ];

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'context-menu-item';
            el.innerHTML = `<span>${item.icon || ''}</span> ${escapeHtml(item.text)}`;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                item.action();
                this._closeMessageMenu();
            });
            this.messageMenu.appendChild(el);
        });

        const rect = this.messageMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth)  this.messageMenu.style.left = (x - rect.width) + 'px';
        if (rect.bottom > window.innerHeight) this.messageMenu.style.top  = (y - rect.height) + 'px';
    }

    _closeMessageMenu() {
        if (this.messageMenu) this.messageMenu.classList.add('hidden');
    }

    _editMessage(messageId, markerId) {
        const messageEl = this.chatMessages.querySelector(`.chat-message[data-message-id="${messageId}"]`);
        if (!messageEl) return;
        const messageDiv = messageEl.querySelector('.chat-message-div');
        if (!messageDiv) return;
        const msg = this.entity?.messages?.find(m => m.id === messageId);
        if (!msg) return;
        const textSpan = messageDiv.querySelector('.chat-text');
        if (!textSpan) return;

        messageDiv.classList.add('editing');

        const btnsContainer = document.createElement('div');
        btnsContainer.className = 'message-edit-buttons-container';
        const btns = document.createElement('div');
        btns.className = 'message-edit-buttons';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'message-edit-cancel';
        cancelBtn.textContent = '✖';
        cancelBtn.title = t('chat.edit_cancel_title');

        const saveBtn = document.createElement('button');
        saveBtn.className = 'message-edit-save';
        saveBtn.textContent = '✔';
        saveBtn.title = t('chat.edit_save_title');

        const prevText = textSpan.innerHTML;
        textSpan.contentEditable = 'true';
        textSpan.innerHTML = msg.text + '\u200B';

        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._hideFormatToolbar();
            this._removeEditBtns(messageId, prevText);
        });

        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._hideFormatToolbar();
            const newHtml = this.sanitizeHtml(textSpan.innerHTML).trim();
            if (!newHtml) { this._removeEditBtns(messageId, prevText); return; }
            this.onUpdateText(messageId, newHtml);
        });

        btns.appendChild(cancelBtn);
        btns.appendChild(saveBtn);
        btnsContainer.appendChild(btns);
        messageEl.appendChild(btnsContainer);

        textSpan.focus();
        this._lastFormatTarget = textSpan;
    }

    _removeEditBtns(messageId, prevText) {
        const messageEl = this.chatMessages.querySelector(`.chat-message[data-message-id="${messageId}"]`);
        if (!messageEl) return;
        const messageDiv = messageEl.querySelector('.chat-message-div');
        if (messageDiv) messageDiv.classList.remove('editing');
        const btnsContainer = messageEl.querySelector('.message-edit-buttons-container');
        if (btnsContainer) btnsContainer.remove();
        const textSpan = messageDiv?.querySelector('.chat-text');
        if (!textSpan) return;
        textSpan.contentEditable = 'false';
        textSpan.innerHTML = prevText;

        if (this._lastFormatTarget === textSpan) {
            this._lastFormatTarget = this.chatInput;
        }
    }

    /* =============== Кнопка видимости нового =============== */

    _toggleNewMessageVisibility() {
        this.newMessageVisibility = !this.newMessageVisibility;
        this._updateVisBtn();
    }

    _updateVisBtn() {
        if (!this.visChatBtn) return;
        this.visChatBtn.className = this.newMessageVisibility
            ? 'visible-message-btn'
            : 'invisible-message-btn';
        this.visChatBtn.title = this.newMessageVisibility
            ? t('chat.visibility_all_title')
            : t('chat.visibility_me_title');
    }

    /* ================== Форматирование ================== */

    _handleSelectionChange() {
        if (!this.formatToolbar) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
            this._hideFormatToolbar();
            return;
        }
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const el = container.nodeType === 3 ? container.parentElement : container;

        const editingText = el.closest?.('.chat-text[contenteditable="true"]');
        if (!editingText || editingText === this.chatInput) {
            this._hideFormatToolbar();
            return;
        }

        this._floatingTarget = editingText;

        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) {
            this._hideFormatToolbar();
            return;
        }

        this.formatToolbar.classList.remove('hidden');
        const tbRect = this.formatToolbar.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - tbRect.width / 2;
        let top  = rect.top - tbRect.height - 8;
        left = Math.max(8, Math.min(left, window.innerWidth - tbRect.width - 8));
        if (top < 8) top = rect.bottom + 8;
        this.formatToolbar.style.left = left + 'px';
        this.formatToolbar.style.top  = top + 'px';
    }

    _hideFormatToolbar() {
        if (this.formatToolbar) this.formatToolbar.classList.add('hidden');
        this._floatingTarget = null;
    }

    _applyFormat(format, target) {
        if (!target) {
            target = this._lastFormatTarget;
            if (
                !target ||
                (target !== this.chatInput &&
                    (!target.isConnected || target.contentEditable !== 'true'))
            ) {
                target = this.chatInput;
            }
            this._lastFormatTarget = target;
        }
        if (!target) return;
        target.focus();

        switch (format) {
            case 'bold':      document.execCommand('bold'); break;
            case 'italic':    document.execCommand('italic'); break;
            case 'underline': document.execCommand('underline'); break;
            case 'link':  this._openLinkDialog(); return;
            case 'image': this._openImageDialog(); return;
            case 'copy':  document.execCommand('copy'); this._hideFormatToolbar(); return;
            case 'cut':   document.execCommand('cut');  this._hideFormatToolbar(); return;
            case 'paste':
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText()
                        .then(text => document.execCommand('insertText', false, text))
                        .catch(() => {});
                }
                return;
            case 'clear': document.execCommand('removeFormat'); break;
        }
        this._hideFormatToolbar();
    }

    /* ================ Диалог ссылки (3 вкладки) ================ */

    _openLinkDialog() {
        const sel = window.getSelection();
        let selectedText = '';
        if (sel && sel.rangeCount > 0) {
            this._linkSavedRange = sel.getRangeAt(0).cloneRange();
            selectedText = sel.toString().trim();
        } else {
            this._linkSavedRange = null;
        }

        this._linkSelectedMap  = null;
        this._linkSelectedNote = null;

        if (this.linkDialogUrl)  this.linkDialogUrl.value  = '';
        if (this.linkDialogText) this.linkDialogText.value = selectedText;  // ← вернули
        if (this.linkMapFilter)  this.linkMapFilter.value  = '';
        if (this.linkNoteFilter) this.linkNoteFilter.value = '';

        this._switchLinkTab('url');
        this.linkDialog.classList.remove('hidden');
        this._hideFormatToolbar();
        setTimeout(() => {
            this.linkDialogUrl?.focus();
        }, 50);
    }

    _switchLinkTab(tab) {
        this._linkDialogTab = tab;

        this.linkDialogTabs?.forEach(t => {
            t.classList.toggle('active', t.dataset.linkTab === tab);
        });
        this.linkDialogPanes?.forEach(p => {
            p.classList.toggle('hidden', p.dataset.linkPane !== tab);
        });

        if (tab === 'map') {
            this._ensureAppList('map').then(() => this._renderLinkList('map'));
            setTimeout(() => this.linkMapFilter?.focus(), 30);
        } else if (tab === 'note') {
            this._ensureAppList('note').then(() => this._renderLinkList('note'));
            setTimeout(() => this.linkNoteFilter?.focus(), 30);
        } else {
            setTimeout(() => this.linkDialogUrl?.focus(), 30);
        }

        this._updateLinkOkState();
    }

    _updateLinkOkState() {
        if (!this.linkDialogOk) return;
        let enabled = false;
        if (this._linkDialogTab === 'url') {
            enabled = !!this.linkDialogUrl.value.trim();
        } else if (this._linkDialogTab === 'map') {
            enabled = !!this._linkSelectedMap;
        } else if (this._linkDialogTab === 'note') {
            enabled = !!this._linkSelectedNote;
        }
        this.linkDialogOk.disabled = !enabled;
    }

    /* ---------- загрузка списков карт/заметок ---------- */

    _ensureAppList(type) {
        if (!this.projectId) {
            // Нет контекста проекта — считаем список пустым
            return Promise.resolve([]);
        }
        if (type === 'map') {
            if (this._mapsCache) return Promise.resolve(this._mapsCache);
            if (this._mapsLoading) return this._mapsPromise || Promise.resolve([]);
        } else if (type === 'note') {
            if (this._notesCache) return Promise.resolve(this._notesCache);
            if (this._notesLoading) return this._notesPromise || Promise.resolve([]);
        }

        const endpoint = type === 'map'
            ? `/projects/${this.projectId}/maps`
            : `/projects/${this.projectId}/notes`;
        const url = endpoint + (this.shareToken ? `?share=${this.shareToken}` : '');

        if (type === 'map') this._mapsLoading = true;
        else                this._notesLoading = true;

        const p = apiRequest(url)
            .then(res => {
                if (!res.ok) throw new Error('bad response');
                return res.json();
            })
            .then(data => {
                // Терпимо к разным форматам: массив, { maps }, { notes }
                let list = [];
                if (Array.isArray(data)) list = data;
                else if (Array.isArray(data.maps))  list = data.maps;
                else if (Array.isArray(data.notes)) list = data.notes;

                const normalized = list.map(x => ({
                    id: x.id,
                    title: x.title || ''
                }));

                if (type === 'map') this._mapsCache = normalized;
                else                this._notesCache = normalized;
                return normalized;
            })
            .catch(err => {
                console.error('Failed to load app list:', err);
                if (type === 'map') this._mapsCache = [];
                else                this._notesCache = [];
                return [];
            })
            .finally(() => {
                if (type === 'map') this._mapsLoading = false;
                else                this._notesLoading = false;
            });

        if (type === 'map') this._mapsPromise = p;
        else                this._notesPromise = p;
        return p;
    }

    _renderLinkList(type) {
        const listEl   = type === 'map' ? this.linkMapList  : this.linkNoteList;
        const filterEl = type === 'map' ? this.linkMapFilter : this.linkNoteFilter;
        if (!listEl) return;

        const cache = type === 'map' ? this._mapsCache : this._notesCache;
        const loading = type === 'map' ? this._mapsLoading : this._notesLoading;

        if (loading || cache === null) {
            listEl.innerHTML = `<div class="link-dialog-list-empty">${escapeHtml(t('chat.link_loading'))}</div>`;
            return;
        }
        if (!cache || cache.length === 0) {
            listEl.innerHTML = `<div class="link-dialog-list-empty">${
                escapeHtml(t(type === 'map' ? 'chat.link_map_empty' : 'chat.link_note_empty'))
            }</div>`;
            return;
        }

        const q = (filterEl?.value || '').trim().toLowerCase();
        const filtered = q
            ? cache.filter(item => (item.title || '').toLowerCase().includes(q))
            : cache;

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="link-dialog-list-empty">${escapeHtml(t('chat.link_map_empty'))}</div>`;
            return;
        }

        const selected = type === 'map' ? this._linkSelectedMap : this._linkSelectedNote;

        listEl.innerHTML = '';
        filtered.forEach(item => {
            const row = document.createElement('div');
            row.className = 'link-dialog-item';
            if (selected && selected.id === item.id) row.classList.add('selected');
            row.textContent = item.title || (type === 'map'
                ? t('chat.app_link_map_default',  { id: item.id })
                : t('chat.app_link_note_default', { id: item.id })
            );
            row.title = row.textContent;
            row.addEventListener('click', () => {
                if (type === 'map') this._linkSelectedMap  = item;
                else                this._linkSelectedNote = item;
                this._renderLinkList(type);
                this._updateLinkOkState();
            });
            listEl.appendChild(row);
        });
    }

    /* ---------- вставка ---------- */

    _confirmLinkDialog() {
        if (this._linkDialogTab === 'url') {
            const url = this.linkDialogUrl.value.trim();
            if (!url) return;
            const text = this.linkDialogText.value.trim() || url;
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = text;
            this._insertNodeAtLinkRange(a);
        } else if (this._linkDialogTab === 'map' && this._linkSelectedMap) {
            this._insertAppLinkButton('map', this._linkSelectedMap);
        } else if (this._linkDialogTab === 'note' && this._linkSelectedNote) {
            this._insertAppLinkButton('note', this._linkSelectedNote);
        } else {
            return;
        }
        this._closeLinkDialog();
    }

    _insertAppLinkButton(type, item) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app-link-btn';
        btn.dataset.appType = type;
        btn.dataset.appId   = String(item.id);
        btn.setAttribute('contenteditable', 'false');

        const custom = (this.linkDialogText.value || '').trim();
        const fallback = item.title || (type === 'map'
            ? t('chat.app_link_map_default',  { id: item.id })
            : t('chat.app_link_note_default', { id: item.id })
        );
        btn.textContent = custom || fallback;

        this._insertNodeAtLinkRange(btn);
    }

    _insertNodeAtLinkRange(node) {
        // Пытаемся вставить в сохранённый range
        const range = this._linkSavedRange;
        if (range) {
            try {
                if (range.startContainer.isConnected) {
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                    range.deleteContents();
                    range.insertNode(node);

                    // Ставим курсор после вставленного узла
                    const after = document.createTextNode('\u200B');
                    if (node.parentNode) {
                        node.parentNode.insertBefore(after, node.nextSibling);
                        const newRange = document.createRange();
                        newRange.setStartAfter(after);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    }
                    return;
                }
            } catch (e) {
                console.warn('Failed to insert at saved link range:', e);
            }
        }

        // Fallback — в последнюю активную цель или chatInput
        const target = (this._lastFormatTarget &&
            this._lastFormatTarget.isConnected &&
            (this._lastFormatTarget === this.chatInput ||
             this._lastFormatTarget.contentEditable === 'true'))
            ? this._lastFormatTarget
            : this.chatInput;

        if (target) {
            target.focus();
            target.appendChild(node);
            target.appendChild(document.createTextNode('\u200B'));
        }
    }

    _closeLinkDialog() {
        if (this.linkDialog) this.linkDialog.classList.add('hidden');
        this._linkSavedRange = null;
        this._linkSelectedMap = null;
        this._linkSelectedNote = null;
        this._linkDialogTab = 'url';
        if (this.linkDialogUrl)  this.linkDialogUrl.value  = '';
        if (this.linkDialogText) this.linkDialogText.value = '';
        if (this.linkMapFilter)  this.linkMapFilter.value  = '';
        if (this.linkNoteFilter) this.linkNoteFilter.value = '';
    }

    /* ================== Кнопки-ссылки на карту/заметку ================== */

    _buildAppUrl(type, id) {
        const params = new URLSearchParams();
        params.set(type === 'map' ? 'mapId' : 'noteId', id);
        if (this.shareToken) params.set('share', this.shareToken);
        // URL — глобальная переменная из config.js
        return `./${type}.html?${params.toString()}`;
    }

    _openAppLink(btn) {
        const type = btn.dataset.appType;
        const id   = Number(btn.dataset.appId);
        if (!type || !id || (type !== 'map' && type !== 'note')) return;
        const href = this._buildAppUrl(type, id);
        window.open(href, '_blank', 'noopener');
    }

    /* =============== Диалог загрузки изображения =============== */

    _openImageDialog() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            this._imageSavedRange = sel.getRangeAt(0).cloneRange();
        } else {
            this._imageSavedRange = null;
        }

        this._imageDialogMode = 'url';
        this._imageUploadFile = null;
        this._imageUploadBusy = false;

        this.imageDialogUrl.value = '';
        this.imageDialogFile.value = '';
        this.imageDialogPreviewWrap.classList.add('hidden');
        this.imageDialogPreview.src = '';
        this.imageDialogInfo.textContent = '';
        this.imageDialogError.classList.add('hidden');
        this.imageDialogError.textContent = '';
        this.imageDialogCancel.disabled = false;

        this._switchImageTab('url');
        this._updateImageOkState();

        this.imageDialog.classList.remove('hidden');
        this._hideFormatToolbar();
        setTimeout(() => this.imageDialogUrl.focus(), 50);
    }

    _switchImageTab(tab) {
        this._imageDialogMode = tab;

        this.imageDialogTabs.forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        this.imageDialogPanes.forEach(p => {
            p.classList.toggle('hidden', p.dataset.pane !== tab);
        });

        this._updateImageOkState();

        if (tab === 'url') {
            setTimeout(() => this.imageDialogUrl.focus(), 30);
        }
    }

    _updateImageOkState() {
        if (this._imageUploadBusy) return;

        let enabled = false;
        if (this._imageDialogMode === 'url') {
            enabled = this.imageDialogUrl.value.trim().length > 0;
        } else {
            enabled = !!this._imageUploadFile;
        }
        this.imageDialogOk.disabled = !enabled;
        this.imageDialogOk.textContent = t('chat.image_dialog_ok');
    }

    async _handleImageFileSelected(file) {
        this._imageUploadFile = null;
        this.imageDialogPreviewWrap.classList.add('hidden');
        this.imageDialogInfo.textContent = '';
        this._hideImageError();
        this._updateImageOkState();

        if (!file) return;

        const check = validateImageFile(file);
        if (!check.ok) {
            this._showImageError(check.message);
            this.imageDialogFile.value = '';
            return;
        }

        this.imageDialogOk.disabled = true;
        this.imageDialogInfo.textContent = t('chat.image_processing');
        this.imageDialogPreviewWrap.classList.remove('hidden');

        try {
            const compressed = await compressImage(file);
            this._imageUploadFile = compressed;

            const reader = new FileReader();
            reader.onload = (e) => {
                this.imageDialogPreview.src = e.target.result;
                if (compressed !== file) {
                    const reduction = ((file.size - compressed.size) / file.size * 100).toFixed(1);
                    const orig = (file.size / (1024 * 1024)).toFixed(2);
                    const comp = (compressed.size / (1024 * 1024)).toFixed(2);
                    this.imageDialogInfo.textContent = t('chat.image_compressed', {
                        from: orig,
                        to: comp,
                        percent: reduction
                    });
                } else {
                    this.imageDialogInfo.textContent = t('chat.image_size', {
                        size: (compressed.size / (1024 * 1024)).toFixed(2)
                    });
                }
                this._updateImageOkState();
            };
            reader.readAsDataURL(compressed);
        } catch (err) {
            console.error(err);
            this._showImageError(t('chat.image_process_failed'));
            this.imageDialogFile.value = '';
            this._imageUploadFile = null;
            this.imageDialogPreviewWrap.classList.add('hidden');
            this._updateImageOkState();
        }
    }

    _showImageError(msg) {
        this.imageDialogError.textContent = msg;
        this.imageDialogError.classList.remove('hidden');
    }

    _hideImageError() {
        this.imageDialogError.classList.add('hidden');
        this.imageDialogError.textContent = '';
    }

    async _confirmImageDialog() {
        if (this._imageUploadBusy) return;
        this._hideImageError();

        if (this._imageDialogMode === 'url') {
            const url = this.imageDialogUrl.value.trim();
            if (!url) return;
            this._insertImageAtSavedRange(url);
            this._closeImageDialog();
            return;
        }

        if (!this._imageUploadFile) return;

        this._imageUploadBusy = true;
        this.imageDialogOk.disabled = true;
        this.imageDialogCancel.disabled = true;
        this.imageDialogOk.textContent = t('chat.image_dialog_uploading');

        try {
            const formData = new FormData();
            formData.append('file', this._imageUploadFile);

            const response = await fileUploadRequest('/messages/images', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                let msg = t('chat.image_upload_failed');
                try {
                    const text = await response.text();
                    if (text) msg = text;
                } catch (_) { /* ignore */ }
                throw new Error(msg);
            }

            const raw = await response.text();
            const imageUrl = (raw || '').trim();
            if (!imageUrl) throw new Error(t('chat.image_server_no_url'));

            const finalUrl = URL + imageUrl;
            if (!/^https?:\/\//i.test(finalUrl)) {
                throw new Error(t('chat.image_server_bad_url', { url: imageUrl }));
            }

            this._insertImageAtSavedRange(finalUrl);
            this._imageUploadBusy = false;
            this._closeImageDialog();
        } catch (err) {
            console.error(err);
            this._showImageError(t('chat.image_upload_failed_details', {
                message: err.message || t('chat.image_unknown_error')
            }));
        } finally {
            this._imageUploadBusy = false;
            this.imageDialogCancel.disabled = false;
            this.imageDialogOk.textContent = t('chat.image_dialog_ok');
            this._updateImageOkState();
        }
    }

    _closeImageDialog(force = false) {
        if (this._imageUploadBusy && !force) return;
        this._imageUploadBusy = false;
        if (this.imageDialog) this.imageDialog.classList.add('hidden');
        this._imageUploadFile = null;
        this._imageSavedRange = null;
        this._hideImageError();
    }

    _insertImageAtSavedRange(src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '🖼';
        img.loading = 'lazy';

        let inserted = false;
        const range = this._imageSavedRange;

        if (range) {
            try {
                if (range.startContainer.isConnected) {
                    const insertRange = range.cloneRange();
                    insertRange.collapse(false);
                    insertRange.insertNode(img);

                    const after = document.createTextNode('\u200B');
                    if (img.parentNode) {
                        img.parentNode.insertBefore(after, img.nextSibling);
                        const sel = window.getSelection();
                        const newRange = document.createRange();
                        newRange.setStartAfter(after);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    }
                    inserted = true;
                }
            } catch (e) {
                console.warn('Failed to insert at saved range:', e);
            }
        }

        if (!inserted) {
            const target = (this._lastFormatTarget &&
                this._lastFormatTarget.isConnected &&
                (this._lastFormatTarget === this.chatInput ||
                 this._lastFormatTarget.contentEditable === 'true'))
                ? this._lastFormatTarget
                : this.chatInput;

            if (target) {
                target.focus();
                target.appendChild(img);
                target.appendChild(document.createTextNode('\u200B'));
            }
        }
    }

    /* =================== sanitize / linkify =================== */

    sanitizeHtml(html) {
        const allowed = {
            'B': [], 'STRONG': [], 'I': [], 'EM': [], 'U': [], 'BR': [],
            'A': ['href', 'target', 'rel'],
            'IMG': ['src', 'alt'],
            'BUTTON': ['type', 'class', 'data-app-type', 'data-app-id'],
        };
        const blockTags = new Set(['DIV', 'P']);

        const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
        const root = doc.body.firstChild;

        const walk = (node) => {
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (child.nodeType === 3) continue;
                if (child.nodeType !== 1) { child.remove(); continue; }

                const tag = child.tagName;
                if (blockTags.has(tag)) {
                    const isFirst = (child === node.firstChild) && (node === root);
                    walk(child);
                    const frag = doc.createDocumentFragment();
                    if (!isFirst) frag.appendChild(doc.createElement('br'));
                    while (child.firstChild) frag.appendChild(child.firstChild);
                    child.replaceWith(frag);
                    continue;
                }
                if (!allowed[tag]) {
                    child.replaceWith(doc.createTextNode(child.textContent));
                    continue;
                }
                for (const attr of Array.from(child.attributes)) {
                    if (!allowed[tag].includes(attr.name.toLowerCase())) child.removeAttribute(attr.name);
                }
                if (tag === 'A') {
                    const href = child.getAttribute('href') || '';
                    if (!/^https?:\/\//i.test(href)) child.removeAttribute('href');
                    else { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
                }
                if (tag === 'IMG') {
                    const src = child.getAttribute('src') || '';
                    if (!/^https?:\/\//i.test(src)) { child.remove(); continue; }
                }
                if (tag === 'BUTTON') {
                    const appType = child.getAttribute('data-app-type') || '';
                    const appId   = child.getAttribute('data-app-id')   || '';
                    const validType = (appType === 'map' || appType === 'note');
                    const validId   = /^\d+$/.test(appId);
                    if (!validType || !validId) {
                        child.replaceWith(doc.createTextNode(child.textContent || ''));
                        continue;
                    }
                    const text = (child.textContent || '').replace(/\s+/g, ' ').trim();
                    const newBtn = doc.createElement('button');
                    newBtn.setAttribute('type', 'button');
                    newBtn.setAttribute('class', 'app-link-btn');
                    newBtn.setAttribute('data-app-type', appType);
                    newBtn.setAttribute('data-app-id', appId);
                    newBtn.setAttribute('contenteditable', 'false');
                    newBtn.textContent = text;
                    child.replaceWith(newBtn);
                    continue;
                }
                walk(child);
            }
        };
        walk(root);

        let prevBr = false;
        const cleanup = (node) => {
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (child.nodeType === 1 && child.tagName === 'BR') {
                    if (prevBr) child.remove(); else prevBr = true;
                } else if (child.nodeType === 1) {
                    prevBr = false; cleanup(child); prevBr = false;
                } else if (child.nodeType === 3) {
                    if (child.textContent.replace(/[\s\n\r]+/g, '').length > 0) prevBr = false;
                }
            }
        };
        cleanup(root);

        // Удаляем zero-width space
        const stripZeroWidth = (node) => {
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (child.nodeType === 3) {
                    if (child.textContent.includes('\u200B')) {
                        child.textContent = child.textContent.replace(/\u200B/g, '');
                        if (child.textContent === '') child.remove();
                    }
                } else if (child.nodeType === 1) {
                    stripZeroWidth(child);
                }
            }
        };
        stripZeroWidth(root);

        return root.innerHTML;
    }

    linkify(text) {
        const hasHtml = /<(b|strong|i|em|u|a|br|img|button)\b/i.test(text);
        let result;
        if (hasHtml) {
            result = text;
        } else {
            const escaped = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const urlRegex = /(https?:\/\/[^\s<]+)/g;
            result = escaped.replace(urlRegex, (url) =>
                `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
            );
            result = result.replace(/\r?\n/g, '<br>');
        }
        return this.sanitizeHtml(result);
    }

    /* ====================== Размер ====================== */

    _toggleSize() {
        this.root.classList.toggle('expanded');
        if (this.expandBtn) {
            const expanded = this.root.classList.contains('expanded');
            this.expandBtn.textContent = expanded ? '-' : '⤢';
            this.expandBtn.title = expanded
                ? t('chat.collapse_title')
                : t('chat.expand_title');
        }
    }
}