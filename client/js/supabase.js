// Supabase Configuration
const SUPABASE_URL = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDM1NTEsImV4cCI6MjA5ODY3OTU1MX0.8KPZxd060ps2pc3oeDzBA9UG3fdHj_lPjnLhq0Q5eaM';

// Initialize Supabase Client
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * SmartImage Compressor
 * Compresses an image file using the Canvas API to a max dimension of 600x600 and JPEG quality 0.6.
 * Ideal for keeping file sizes < 100KB for large datasets.
 */
async function compressImage(file, maxWidth = 600, maxHeight = 600, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                // 1x1 Center Crop Logic
                const minDim = Math.min(img.width, img.height);
                const sx = (img.width - minDim) / 2;
                const sy = (img.height - minDim) / 2;

                // Max target size is maxWidth (e.g. 600px)
                const targetSize = Math.min(minDim, Math.max(maxWidth, maxHeight));

                const canvas = document.createElement('canvas');
                canvas.width = targetSize;
                canvas.height = targetSize;
                const ctx = canvas.getContext('2d');
                
                // Draw center cropped image to canvas
                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Canvas to Blob conversion failed'));
                        return;
                    }
                    const newFileName = file.name.replace(/\.[^/.]+$/, "") + "_compressed.webp";
                    const compressedFile = new File([blob], newFileName, {
                        type: 'image/webp',
                        lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                }, 'image/webp', 0.8);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}
