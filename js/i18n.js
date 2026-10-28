/**
 * Минималистичный i18n-модуль.
 * Загружает словари из /locales/{lang}.json, умеет:
 *   - t(key, vars) — получить строку с подстановкой {var}
 *   - applyTranslations(root) — пройтись по data-i18n* и заполнить
 *   - setLanguage(lang) — сменить язык + сохранить
 *   - initI18n() — авто-детект + загрузка
 *   - renderLangSwitcher(container) — компактный переключатель без флагов
 *
 * Требует, чтобы этот скрипт был подключён ДО page-скриптов.
 */

const I18N_SUPPORTED = ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ro'];
const I18N_FALLBACK = 'en';
const I18N_LOCALES_PATH = './locales';

// Эндонимы — названия языков на самих этих языках.
// Флаги намеренно не используются: у большинства языков нет «правильной» страны.
const LANG_META = {
    en: { label: 'English' },
    ru: { label: 'Русский' },
    es: { label: 'Español' },
    fr: { label: 'Français' },
    de: { label: 'Deutsch' },
    pt: { label: 'Português' },
    ro: { label: 'Română' },
};

const _i18nCache = new Map();
let _i18nCurrent = I18N_FALLBACK;
let _i18nDict = {};
let _i18nFallbackDict = {};
let _i18nReady = false;

function detectLang() {
    // 1. ?lang= в URL
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    if (urlLang && I18N_SUPPORTED.includes(urlLang)) return urlLang;

    // 2. localStorage
    const stored = localStorage.getItem('lang');
    if (stored && I18N_SUPPORTED.includes(stored)) return stored;

    // 3. Язык браузера (первые 2 символа)
    const navLang = (navigator.language || I18N_FALLBACK).slice(0, 2).toLowerCase();
    if (I18N_SUPPORTED.includes(navLang)) return navLang;

    // 4. Fallback
    return I18N_FALLBACK;
}

async function loadLocale(lang) {
    if (_i18nCache.has(lang)) return _i18nCache.get(lang);
    try {
        const res = await fetch(`${I18N_LOCALES_PATH}/${lang}.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Failed to load locale: ${lang}`);
        const data = await res.json();
        _i18nCache.set(lang, data);
        return data;
    } catch (e) {
        console.error('[i18n]', e);
        return {};
    }
}

function _resolve(dict, key) {
    if (!dict) return undefined;
    const parts = key.split('.');
    let cur = dict;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return typeof cur === 'string' ? cur : undefined;
}

/**
 * Получить перевод.
 * @param {string} key  Например: "project.tab_all"
 * @param {object} [vars]  Подстановки для {name}
 * @param {string} [fallbackText]  Что вернуть, если ключ не найден
 */
function t(key, vars, fallbackText) {
    let val = _resolve(_i18nDict, key);
    if (val === undefined) {
        val = _resolve(_i18nFallbackDict, key);
        if (val === undefined) {
            console.warn('[i18n] Missing key:', key);
            return fallbackText !== undefined ? fallbackText : key;
        }
    }
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            val = val.replaceAll(`{${k}}`, String(v));
        }
    }
    return val;
}

/**
 * Применить переводы к элементам в root.
 * Поддерживаемые атрибуты:
 *   data-i18n              → textContent
 *   data-i18n-html         → innerHTML (осторожно!)
 *   data-i18n-placeholder  → placeholder
 *   data-i18n-title        → title
 *   data-i18n-aria-label   → aria-label
 */
function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
        el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
    // Обновляем <html lang>
    document.documentElement.setAttribute('lang', _i18nCurrent);
    // Обновляем кастомный переключатель (если он есть на странице)
    if (typeof window.updateLangSwitcher === 'function') {
        window.updateLangSwitcher(_i18nCurrent);
    }
}

async function setLanguage(lang) {
    if (!I18N_SUPPORTED.includes(lang)) lang = I18N_FALLBACK;
    localStorage.setItem('lang', lang);

    _i18nCurrent = lang;
    _i18nDict = await loadLocale(lang);
    _i18nFallbackDict = await loadLocale(I18N_FALLBACK);

    applyTranslations(document);

    // Даём странице перерисовать динамический контент
    if (typeof window.onLanguageChanged === 'function') {
        window.onLanguageChanged(lang);
    } else {
        // По умолчанию — перезагрузка, чтобы весь JS-рендер пересобрался
        window.location.reload();
    }
}

async function initI18n() {
    if (_i18nReady) return;
    _i18nCurrent = detectLang();
    _i18nDict = await loadLocale(_i18nCurrent);
    _i18nFallbackDict = await loadLocale(I18N_FALLBACK);
    _i18nReady = true;
    applyTranslations(document);

    // Рендерим кастомный переключатель, если контейнер присутствует
    const switcherEl = document.getElementById('langSwitcher');
    if (switcherEl) {
        renderLangSwitcher(switcherEl);
        updateLangSwitcher(_i18nCurrent);
    }
}

function getCurrentLang() {
    return _i18nCurrent;
}

/* ============ Компактный переключатель языка (без флагов) ============ */

function renderLangSwitcher(container) {
    if (!container) return;

    container.classList.add('lang-switcher');
    container.innerHTML = `
        <button type="button" class="lang-switcher__btn" aria-haspopup="listbox" aria-expanded="false">
            <span class="lang-switcher__code"></span>
            <span class="lang-switcher__chev">▾</span>
        </button>
        <div class="lang-switcher__menu" role="listbox"></div>
    `;

    const btn  = container.querySelector('.lang-switcher__btn');
    const menu = container.querySelector('.lang-switcher__menu');

    menu.innerHTML = I18N_SUPPORTED.map(lang => {
        const meta = LANG_META[lang] || { label: lang };
        return `
            <button type="button" class="lang-switcher__item" role="option" data-lang="${lang}">
                <span class="lang-switcher__label">${meta.label}</span>
                <span class="lang-switcher__code" style="margin-left:auto;opacity:.6;">${lang.toUpperCase()}</span>
            </button>`;
    }).join('');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.classList.toggle('open');
        btn.setAttribute('aria-expanded', container.classList.contains('open'));
    });

    menu.querySelectorAll('.lang-switcher__item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            container.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            const lang = item.dataset.lang;
            if (lang && lang !== getCurrentLang()) setLanguage(lang);
        });
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            container.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && container.classList.contains('open')) {
            container.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
    });
}

function updateLangSwitcher(lang) {
    const container = document.getElementById('langSwitcher');
    if (!container) return;

    const btn = container.querySelector('.lang-switcher__btn');
    if (!btn) return;

    const codeEl = btn.querySelector('.lang-switcher__code');
    if (codeEl) codeEl.textContent = lang.toUpperCase();

    container.querySelectorAll('.lang-switcher__item').forEach(item => {
        const isActive = item.dataset.lang === lang;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
}

/* ============ Экспорт в глобал для inline-обработчиков ============ */

window.t = t;
window.setLanguage = setLanguage;
window.applyTranslations = applyTranslations;
window.getCurrentLang = getCurrentLang;
window.renderLangSwitcher = renderLangSwitcher;
window.updateLangSwitcher = updateLangSwitcher;