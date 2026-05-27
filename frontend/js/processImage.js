// processImage.js
const MAX_DIM = 3840;
const MAX_SIZE = 2_000_000;   // 2 MB

/**
 * Process an image blob: resize down if needed, compress to JPEG ≤ MAX_SIZE.
 * @param {Blob} blob - The input image blob (any format)
 * @returns {Promise<Blob>} - Processed JPEG blob
 */
function processImage(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            // 1. Resize to fit within MAX_DIM while keeping aspect ratio
            if (width > MAX_DIM || height > MAX_DIM) {
                const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // 2. Compress to JPEG, adjusting quality until under MAX_SIZE
            const tryCompress = (quality) => {
                canvas.toBlob((compressed) => {
                    if (compressed.size <= MAX_SIZE || quality <= 20) {
                        resolve(compressed);
                    } else {
                        tryCompress(quality - 5);
                    }
                }, 'image/jpeg', quality / 100);
            };
            tryCompress(85);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
    });
}