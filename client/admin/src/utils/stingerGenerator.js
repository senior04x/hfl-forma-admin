/**
 * Generates a 2-second broadcast-quality transparent WebM Stinger Transition:
 * Features Diagonal Speed Slash Wipes & Smooth 3D Logo Glide (Sports TV Style)
 */
export async function generateStingerWebM({
  logoUrl,
  text = '',
  durationMs = 2000,
  fps = 60
}) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = logoUrl || '/logo-for-jadval.png';

    img.onerror = () => {
      if (img.src !== '/logo.png') {
        img.src = '/logo.png';
      } else {
        createCanvasAnimation();
      }
    };

    img.onload = () => {
      createCanvasAnimation();
    };

    function createCanvasAnimation() {
      const stream = canvas.captureStream(fps);
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8000000
      });

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      };

      recorder.start();

      const startTime = performance.now();

      function renderFrame(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        // 1. Clear transparent canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 2. Draw Diagonal Speed Slash Bars (Wipe Effect)
        ctx.save();
        let slashX = 0;
        if (progress < 0.5) {
          const p = progress / 0.5;
          slashX = -1200 + p * 3120;
        } else {
          const p = (progress - 0.5) / 0.5;
          slashX = 720 + p * 2400;
        }

        // Draw dynamic angled speed bar
        ctx.translate(slashX, 0);
        ctx.skewX = -0.35;

        const barGrad = ctx.createLinearGradient(0, 0, 350, 0);
        barGrad.addColorStop(0, 'rgba(124, 58, 237, 0)');
        barGrad.addColorStop(0.3, 'rgba(124, 58, 237, 0.85)');
        barGrad.addColorStop(0.5, 'rgba(59, 130, 246, 0.95)');
        barGrad.addColorStop(0.7, 'rgba(124, 58, 237, 0.85)');
        barGrad.addColorStop(1, 'rgba(124, 58, 237, 0)');

        ctx.fillStyle = barGrad;
        ctx.fillRect(-200, 0, 450, 1080);
        ctx.restore();

        // 3. Draw Center Logo Glide & Fade
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);

        let logoX = 0;
        let scale = 1;
        let opacity = 0;

        if (progress < 0.35) {
          const p = progress / 0.35;
          const easeOut = Math.sin((p * Math.PI) / 2);
          logoX = (1 - easeOut) * -350;
          opacity = easeOut;
          scale = 0.8 + easeOut * 0.25;
        } else if (progress < 0.65) {
          const p = (progress - 0.35) / 0.3;
          logoX = 0;
          opacity = 1;
          scale = 1.05 - p * 0.03;
        } else {
          const p = (progress - 0.65) / 0.35;
          const easeIn = Math.sin((p * Math.PI) / 2);
          logoX = easeIn * 350;
          opacity = 1 - easeIn;
          scale = 1.02 + easeIn * 0.15;
        }

        ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        ctx.translate(logoX, 0);
        ctx.scale(scale, scale);

        // Draw clean logo image
        if (img.complete && img.naturalWidth !== 0) {
          const size = 420;
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 80px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text || 'AMATORA', 0, 0);
        }

        ctx.restore();

        if (progress < 1) {
          requestAnimationFrame(renderFrame);
        } else {
          setTimeout(() => {
            recorder.stop();
          }, 100);
        }
      }

      requestAnimationFrame(renderFrame);
    }
  });
}

export function downloadBlob(blob, filename = 'stinger.webm') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
