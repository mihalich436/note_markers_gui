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
 */
class ChatView {
    constructor(rootEl, options = {}) {
        this.root = rootEl;

        // Данные о пользователе
        this.currentUserId  = options.currentUserId ?? null;
        this.currentRole    = options.currentRole   ?? 'READ_ONLY';
        this.userIdToNick   = options.userIdToNick  ?? new Map();

        // Колбэки
        this.onSendMessage       = options.onSendMessage       || (() => {});
        this.onUpdateText        = options.onUpdateText        || (() => {});
        this.onUpdateVisibility  = options.onUpdateVisibility  || (() => {});
        this.onDeleteMessage     = options.onDeleteMessage     || (() => {});
        this.onEditDescription   = options.onEditDescription   || (() => {});

        // Текущая сущность (маркер / заметка)
        this.entity = null;

        // Видимость нового сообщения
        this.newMessageVisibility = true;

        // Флаги
        this.readOnly = false;
        this.showInputArea = true;

        // Статичный тулбар (внутри chatInputArea) — для нового сообщения
        this.staticFormatToolbar = null;

        // Всплывающий тулбар — только для редактируемых сообщений
        this.formatToolbar = null;

        // Цель всплывающего тулбара (конкретный .chat-text)
        this._floatingTarget = null;

        // Последняя активная цель форматирования (chatInput или редактируемый .chat-text).
        // Статичный тулбар применяет формат именно сюда.
        this._lastFormatTarget = null;

        // Диалог вставки ссылки/картинки
        this.linkDialog      = document.getElementById('linkDialog');
        this.linkDialogTitle = document.getElementById('linkDialogTitle');
        this.linkDialogUrl   = document.getElementById('linkDialogUrl');
        this.linkDialogText  = document.getElementById('linkDialogText');
        this.linkDialogOk    = document.getElementById('linkDialogOk');
        this.linkDialogCancel= document.getElementById('linkDialogCancel');

        // Диалог загрузки изображения
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

        // Состояние диалога загрузки
        this._imageDialogMode   = 'url';   // 'url' | 'file'
        this._imageUploadFile   = null;    // сжатый File
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

        // Статичный тулбар — внутри chatInputArea
        this.staticFormatToolbar = this.root.querySelector('#staticFormatToolbar');

        // Всплывающий тулбар — глобальный, лежит в body
        this.formatToolbar = document.getElementById('formatToolbar');

        // Контекстное меню сообщений
        this.messageMenu = document.createElement('div');
        this.messageMenu.className = 'context-menu note hidden';
        document.body.appendChild(this.messageMenu);
    }

    _initEvents() {
        this.sendChatBtn.addEventListener('click', () => this.send());
        this.visChatBtn.addEventListener('click', () => this._toggleNewMessageVisibility());
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }
        if (this.expandBtn) {
            this.expandBtn.addEventListener('click', () => this._toggleSize());
        }

        // Клик по картинке — открыть в новой вкладке
        this.chatMessages.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                window.open(e.target.src, '_blank', 'noopener');
            }
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

        // Закрытие меню по клику вне
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

        // Paste handler
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

        // Показ/скрытие всплывающего тулбара
        document.addEventListener('selectionchange', () => this._handleSelectionChange());

        // Запоминаем последнюю цель форматирования
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

        if (this.linkDialogCancel) this.linkDialogCancel.addEventListener('click', () => this._closeLinkDialog());
        if (this.linkDialogOk)     this.linkDialogOk.addEventListener('click', () => this._confirmLinkDialog());
        if (this.linkDialogUrl)    this.linkDialogUrl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._confirmLinkDialog();
            if (e.key === 'Escape') this._closeLinkDialog();
        });

        // ===== Диалог загрузки изображения =====
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

    open(entity) {
        this.entity = entity;
        this.setTitle(entity.title || '');
        this.renderMessages();
    }

    close() {
        this._hideFormatToolbar();
        this._closeMessageMenu();
        this._closeImageDialog(true);
        if (typeof this.onClose === 'function') this.onClose();
        else this.root.classList.add('hidden');
    }

    setTitle(title) {
        if (this.titleEl) this.titleEl.textContent = title || 'Заметки';
    }

    setReadOnly(readOnly) {
        this.readOnly = !!readOnly;
        if (this.chatInputArea) {
            this.chatInputArea.classList.toggle('hidden', this.readOnly);
        }
        if (this.editBtn) this.editBtn.classList.toggle('hidden', this.readOnly);
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
                this.chatMessages.innerHTML = '<div class="chat-empty">Нет заметок</div>';
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

        const messageEl = this.chatMessages.querySelector(
            `.chat-message[data-message-id="${msg.id}"]`
        );
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

        // Если это сообщение было целью статичного тулбара — сбрасываем цель
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
            if (timeSpan) {
                timeSpan.textContent = msg.createdAt || '';
            }
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
            this.chatMessages.innerHTML = '<div class="chat-empty">Нет заметок</div>';
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
        if (!text.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, '').trim()) return;

        this.onSendMessage(text, this.newMessageVisibility);
        this._clearInput();
        this._hideFormatToolbar();
        this._lastFormatTarget = this.chatInput;
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
            { icon: '✏️', text: 'Редактировать', action: () => this._editMessage(msg.id, markerId) },
            {
                icon: msg.visibility ? '🚫' : '👁️',
                text: msg.visibility ? 'Скрыть от участников' : 'Сделать видимым',
                action: () => this.onUpdateVisibility(msg.id, !msg.visibility),
            },
            { icon: '🗑️', text: 'Удалить', action: () => this.onDeleteMessage(msg.id) },
        ];

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'context-menu-item';
            el.innerHTML = `<span>${item.icon || ''}</span> ${item.text}`;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                item.action();
                this._closeMessageMenu();
            });
            this.messageMenu.appendChild(el);
        });

        const rect = this.messageMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) this.messageMenu.style.left = (x - rect.width) + 'px';
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
        cancelBtn.title = 'Отменить редактирование';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'message-edit-save';
        saveBtn.textContent = '✔';
        saveBtn.title = 'Сохранить изменения';

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
            ? 'Заметка будет видна всем'
            : 'Только вы будете видеть заметку';
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
            case 'link':  this._openLinkDialog('link');  return;
            case 'image': this._openImageDialog();       return;
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

    /* ============== Старый диалог вставки ссылки ============== */

    _openLinkDialog(mode) {
        const sel = window.getSelection();
        let selectedText = '';
        if (sel && sel.rangeCount > 0) {
            this._savedRange = sel.getRangeAt(0).cloneRange();
            selectedText = sel.toString().trim();
        } else {
            this._savedRange = null;
        }
        this._linkDialogMode = mode;
        this.linkDialogTitle.textContent = mode === 'link' ? 'Вставить ссылку' : 'Вставить картинку';
        this.linkDialogUrl.value  = '';
        this.linkDialogText.value = selectedText;
        this.linkDialogText.style.display = mode === 'link' ? 'block' : 'none';
        this.linkDialog.classList.remove('hidden');
        this._hideFormatToolbar();
        setTimeout(() => this.linkDialogUrl.focus(), 50);
    }

    _closeLinkDialog() {
        if (this.linkDialog) this.linkDialog.classList.add('hidden');
        this._linkDialogMode = null;
        this._savedRange = null;
    }

    _confirmLinkDialog() {
        const url = this.linkDialogUrl.value.trim();
        if (!url) return;
        const range = this._savedRange;
        if (!range) { this._closeLinkDialog(); return; }

        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        if (this._linkDialogMode === 'link') {
            const text = this.linkDialogText.value.trim() || url;
            const a = document.createElement('a');
            a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.textContent = text;
            range.deleteContents();
            range.insertNode(a);
            range.setStartAfter(a);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } else if (this._linkDialogMode === 'image') {
            const img = document.createElement('img');
            img.src = url; img.alt = '🖼'; img.loading = 'lazy';
            const insertRange = range.cloneRange();
            insertRange.collapse(false);
            range.insertNode(img);
            insertRange.insertNode(img);
            insertRange.setStartAfter(img);
            insertRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(insertRange);
        }
        this._closeLinkDialog();
    }

    /* =============== Диалог загрузки изображения =============== */

    _openImageDialog() {
        // Запоминаем текущий range — куда вставлять
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            this._imageSavedRange = sel.getRangeAt(0).cloneRange();
        } else {
            this._imageSavedRange = null;
        }

        // Сброс состояния
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
        this.imageDialogOk.textContent = 'Вставить';
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
        this.imageDialogInfo.textContent = 'Обработка изображения...';
        this.imageDialogPreviewWrap.classList.remove('hidden');

        try {
            const compressed = await compressImage(file);
            this._imageUploadFile = compressed;

            // Превью
            const reader = new FileReader();
            reader.onload = (e) => {
                this.imageDialogPreview.src = e.target.result;
                if (compressed !== file) {
                    const reduction = ((file.size - compressed.size) / file.size * 100).toFixed(1);
                    const orig = (file.size / (1024 * 1024)).toFixed(2);
                    const comp = (compressed.size / (1024 * 1024)).toFixed(2);
                    this.imageDialogInfo.textContent =
                        `Сжато: ${orig} МБ → ${comp} МБ (−${reduction}%)`;
                } else {
                    this.imageDialogInfo.textContent =
                        `${(compressed.size / (1024 * 1024)).toFixed(2)} МБ`;
                }
                this._updateImageOkState();
            };
            reader.readAsDataURL(compressed);
        } catch (err) {
            console.error(err);
            this._showImageError('Не удалось обработать файл. Попробуйте JPG/WEBP/AVIF');
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

        // ---- Режим URL ----
        if (this._imageDialogMode === 'url') {
            const url = this.imageDialogUrl.value.trim();
            if (!url) return;
            this._closeImageDialog();
            this._insertImageAtSavedRange(url);
            return;
        }

        // ---- Режим файла ----
        if (!this._imageUploadFile) return;

        this._imageUploadBusy = true;
        this.imageDialogOk.disabled = true;
        this.imageDialogCancel.disabled = true;
        this.imageDialogOk.textContent = 'Загрузка...';

        try {
            const formData = new FormData();
            formData.append('file', this._imageUploadFile);

            const response = await fileUploadRequest('/messages/images', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                // Сервер может вернуть текст ошибки (NotImageUploadedException)
                let msg = 'Ошибка загрузки изображения';
                try {
                    const text = await response.text();
                    if (text) msg = text;
                } catch (_) { /* ignore */ }
                throw new Error(msg);
            }

            // Сервер возвращает plain text — URL картинки
            const raw = await response.text();
            const imageUrl = (raw || '').trim();
            if (!imageUrl) {
                throw new Error('Сервер не вернул URL изображения');
            }

            const finalUrl = URL + imageUrl;

            // Проверка, что получился валидный http(s) URL
            if (!/^https?:\/\//i.test(finalUrl)) {
                throw new Error('Сервер вернул некорректный URL: ' + imageUrl);
            }

            this._insertImageAtSavedRange(finalUrl);
            this._imageUploadBusy = false;
            this._closeImageDialog();
        } catch (err) {
            console.error(err);
            this._showImageError('Ошибка загрузки: ' + (err.message || 'неизвестно'));
        } finally {
            this._imageUploadBusy = false;
            this.imageDialogCancel.disabled = false;
            this.imageDialogOk.textContent = 'Вставить';
            this._updateImageOkState();
        }
    }

    /**
     * @param {boolean} force — если true, закрывает даже во время загрузки
     */
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

                    // Ставим курсор после картинки, чтобы можно было продолжить печатать
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
                console.warn('Не удалось вставить в сохранённый range:', e);
            }
        }

        // Fallback — вставляем в последнюю активную цель или chatInput
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

        // Удаляем zero-width space (\u200B) — нужен только как якорь
        // для курсора в contenteditable
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
        const hasHtml = /<(b|strong|i|em|u|a|br|img)\b/i.test(text);
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
            this.expandBtn.textContent = this.root.classList.contains('expanded') ? '-' : '⤢';
        }
    }
}