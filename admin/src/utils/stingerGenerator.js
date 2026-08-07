/**
 * Generates a 2-second transparent WebM Stinger Transition video with smooth Fade In -> Hold -> Fade Out animation (No rotation, No backdrop glow/shadow)
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
      // Fallback try logo.png if logo-for-jadval fails
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

        // Clear 100% transparent canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);

        let scale = 1;
        let opacity = 0;

        if (progress < 0.35) {
          // Phase 1: Smooth Fade In (0.0s - 0.7s) with subtle scale up
          const p = progress / 0.35;
          const easeOut = Math.sin((p * Math.PI) / 2);
          opacity = easeOut;
          scale = 0.85 + easeOut * 0.2; // 0.85 -> 1.05
        } else if (progress < 0.65) {
          // Phase 2: Full Hold & Cut Point (0.7s - 1.3s)
          opacity = 1;
          const p = (progress - 0.35) / 0.3;
          scale = 1.05 - p * 0.05; // 1.05 -> 1.0
        } else {
          // Phase 3: Smooth Fade Out (1.3s - 2.0s) with subtle scale out
          const p = (progress - 0.65) / 0.35;
          const easeIn = Math.sin((p * Math.PI) / 2);
          opacity = 1 - easeIn;
          scale = 1.0 + easeIn * 0.15; // 1.0 -> 1.15
        }

        ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        ctx.scale(scale, scale);

        // Clean draw of logo image (NO SHADOW / NO BACKDROP GLOW)
        if (img.complete && img.naturalWidth !== 0) {
          const size = 420;
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
        } else {
          // Fallback text logo
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
