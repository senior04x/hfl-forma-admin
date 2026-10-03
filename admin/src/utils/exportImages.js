// html2canvas does not reliably implement object-fit. Fit the source pixels
// into the measured image box before capture, preserving the original ratio.
export async function prepareExportImages(root) {
  await document.fonts.ready;
  await Promise.all([...root.querySelectorAll('img')].map(async img => {
    try { await img.decode(); } catch { return; }
    if (getComputedStyle(img).objectFit !== 'contain' || !img.naturalWidth || !img.naturalHeight) return;
    const box = img.getBoundingClientRect();
    const ratio = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    img.style.width = `${img.naturalWidth * ratio}px`;
    img.style.height = `${img.naturalHeight * ratio}px`;
    img.style.flexShrink = '0';
  }));
}
