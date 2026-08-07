/**
 * Generates a 2-second transparent WebM Stinger Transition video using HTML5 Canvas & MediaRecorder
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
    img.src = logoUrl || '/logo.PNG';

    img.onerror = () => {
      createCanvasAnimation();
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

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);

        let scale = 0;
        let rotation = 0;
        let opacity = 1;

        if (progress < 0.4) {
          const p = progress / 0.4;
          scale = p * 1.1;
          rotation = (1 - p) * -Math.PI;
          opacity = p;
        } else if (progress < 0.6) {
          scale = 1.1;
          rotation = 0;
          opacity = 1;
        } else {
          const p = (progress - 0.6) / 0.4;
          scale = 1.1 + p * 1.2;
          rotation = p * Math.PI;
          opacity = 1 - p;
        }

        ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        ctx.scale(scale, scale);
        ctx.rotate(rotation);

        const gradient = ctx.createRadialGradient(0, 0, 50, 0, 0, 350);
        gradient.addColorStop(0, 'rgba(124, 58, 237, 0.8)');
        gradient.addColorStop(0.5, 'rgba(37, 99, 235, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 350, 0, Math.PI * 2);
        ctx.fill();

        if (img.complete && img.naturalWidth !== 0) {
          const size = 320;
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 72px sans-serif';
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
