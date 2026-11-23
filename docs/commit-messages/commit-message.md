feat(landing): replace static QR code with vector SVG linking to EAS APK

### Added
- [Landing] Vector SVG QR code pointing to official EAS APK artifact (`https://expo.dev/artifacts/eas/zljijb4Un6dG7LLdp7qwexPdtMsSNrVsSGw1rCAmp2I.apk`)
- [Landing] Saved standalone vector QR asset to `landing/public/qr-code.svg`

### Changed
- [Landing] Embedded inline SVG QR code in `landing/index.html` and `landing/src/App.tsx` for zero-latency, crisp rendering
- [Landing] Updated "Download APK" button to link directly to EAS APK download artifact

### Removed
- [Landing] Deleted outdated static image `landing/public/qr-code.png`

### Testing & Verification
- Landing production build: `npm run build` completed cleanly with Vite
- Backend Jest tests: 12 test suites, 156 tests passed cleanly
- Mobile App typecheck: `npx tsc --noEmit` verified with 0 errors
