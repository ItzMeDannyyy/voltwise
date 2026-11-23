// VoltWise landing page interactive enhancements
import './index.css';

document.addEventListener('DOMContentLoaded', () => {
  // Checksum copy helper
  const copyBtn = document.querySelector('[data-copy-checksum]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const code = document.querySelector('[data-checksum-val]')?.textContent;
      if (code) {
        await navigator.clipboard.writeText(code.trim());
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 2000);
      }
    });
  }
});
