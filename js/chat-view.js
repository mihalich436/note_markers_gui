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

        // Тулбар форматирования
        this.formatToolbar = document.getElementById('formatToolbar');
        this.linkDialog    = document.getElementById('linkDialog');
        this.linkDialogTitle = document.getElementById('linkDialogTitle');
        this.linkDialogUrl   = document.getElementById('linkDialogUrl');
        this.linkDialogText  = document.getElementById('linkDialogText');
        this.linkDialogOk    = document.getElementById('linkDialogOk');
        this.linkDialogCancel= document.getElementById('linkDialogCancel');

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

        // Плагиат копипастой из map.js: обработка клика по картинке
        this.chatMessages.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                window.open(e.target.src, '_blank', 'noopener');
            }
        });

        // Контекстное меню для сообщений
        this.chatMessages.addEventListener('contextmenu', (e) => {
            const messageEl = e.target.closest('.chat-message');
            if (!messageEl) return;
            if (messageEl.querySelector('.chat-message-div')?.classList.contains('editing')) return;
            e.preventDefault();
            e.stopPropagation();
            this._showMessageMenu(
                e.clientX, e.clientY,
                messageEl.dataset.messageId,
                messageEl.dataset.markerId // для заметок тут будет entity.id
            );
        });

        // Закрытие меню и тулбара по клику вне
        document.addEventListener('click', () => {
            this._closeMessageMenu();
            // тулбар закрываем только если не внутри него
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this._closeMessageMenu();
                this._closeLinkDialog();
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

        // Paste handler (одинаковый для input и редактируемого текста)
        const handlePaste = (e) => {
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');
            if (html) document.execCommand('insertHTML', false, this.sanitizeHtml(html));
            else      document.execCommand('insertHTML', false, this.linkify(text));
        };
        this.chatInput.addEventListener('paste', handlePaste);
        this.chatMessages.addEventListener('paste', handlePaste);

        // Тулбар форматирования
        document.addEventListener('selectionchange', () => this._handleSelectionChange());
        if (this.formatToolbar) {
            this.formatToolbar.querySelectorAll('.format-btn').forEach(btn => {
                btn.addEventListener('mousedown', (e) => e.preventDefault()); // не терять выделение
                btn.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    this._applyFormat(btn.dataset.format);
                });
            });
        }
        if (this.linkDialogCancel) this.linkDialogCancel.addEventListener('click', () => this._closeLinkDialog());
        if (this.linkDialogOk)     this.linkDialogOk.addEventListener('click', () => this._confirmLinkDialog());
        if (this.linkDialogUrl)    this.linkDialogUrl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._confirmLinkDialog();
            if (e.key === 'Escape') this._closeLinkDialog();
        });
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

        // Сообщения нет в DOM — view не создаёт его сам,
        // это решает контроллер (например, если сообщение стало видимым).
        if (!messageEl) return false;

        const messageDiv = messageEl.querySelector('.chat-message-div');
        if (!messageDiv) return false;

        const textSpan = messageDiv.querySelector('.chat-text');
        if (!textSpan) return false;

        // 1. Снимаем режим редактирования, если был
        messageDiv.classList.remove('editing');

        // 2. Обновляем видимость (класс на контейнере и на тексте)
        messageDiv.classList.toggle('invisible', !msg.visibility);
        textSpan.classList.toggle('invisible', !msg.visibility);

        // 3. Убираем кнопки редактирования, если они были
        const btnsContainer = messageEl.querySelector('.message-edit-buttons-container');
        if (btnsContainer) btnsContainer.remove();

        // 4. Возвращаем span в нередактируемое состояние и обновляем содержимое
        textSpan.contentEditable = 'false';
        textSpan.innerHTML = this.linkify(msg.text);

        // 5. Обновляем подпись автора и время (на случай, если они изменились —
        //    например, при переносе сообщения или редактировании системой)
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
        console.log(this.entity.messages)
        if (this.chatMessages.children.length === 0) {
            this.chatMessages.innerHTML = '<div class="chat-empty">Нет заметок</div>';
        }
    }

    focusInput() {
        if (this.chatInput) this.chatInput.focus();
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

        // Только автор или админ
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
        textSpan.innerHTML = msg.text;

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

        const editingText  = el.closest('.chat-text[contenteditable="true"]');
        const editingInput = el.closest('#chatInput');
        if (!editingText && !editingInput) { this._hideFormatToolbar(); return; }

        this._formatTarget = editingText || editingInput;

        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) { this._hideFormatToolbar(); return; }

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
    }

    _applyFormat(format) {
        const target = this._formatTarget;
        if (!target) return;
        target.focus();

        switch (format) {
            case 'bold':      document.execCommand('bold'); break;
            case 'italic':    document.execCommand('italic'); break;
            case 'underline': document.execCommand('underline'); break;
            case 'link':  this._openLinkDialog('link');  return;
            case 'image': this._openLinkDialog('image'); return;
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
            img.src = url; img.alt = ''; img.loading = 'lazy';
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

        // схлопываем подряд идущие <br>
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