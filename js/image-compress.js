/**
 * Утилиты для валидации и сжатия изображений.
 * Используется в диалогах загрузки картинок.
 *
 * Экспортирует в глобальную область:
 *   - validateImageFile(file)  → { ok: true } | { ok: false, message: string }
 *   - compressImage(file)      → Promise<File>
 */

const IMAGE_MAX_SIZE = 30 * 1024 * 1024; // 30 MB
const IMAGE_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif'];
const IMAGE_ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif'];

function validateImageFile(file) {
    if (!file) return { ok: false, message: 'Файл не выбран' };

    if (file.size > IMAGE_MAX_SIZE) {
        return { ok: false, message: 'Файл слишком большой. Максимальный размер: 30 МБ' };
    }

    const fileName = file.name.toLowerCase();
    const hasValidExtension = IMAGE_ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));

    if (!IMAGE_ALLOWED_TYPES.includes(file.type) && !hasValidExtension) {
        return {
            ok: false,
            message: 'Неподдерживаемый формат файла. Поддерживаются: PNG, JPG, JPEG, WEBP, AVIF'
        };
    }

    return { ok: true };
}

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
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
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
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
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