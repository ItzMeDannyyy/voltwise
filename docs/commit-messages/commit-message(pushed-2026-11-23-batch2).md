feat(ui,auth): redesign landing page, adopt Lucide icons, extend session

### Added
- [Landing] Complete redesign with modern design-taste system, typography, interactive telemetry fragments, and responsive layout
- [Landing] Added Terms of Service (`terms.html`) and Privacy Policy (`privacy.html`) legal documentation
- [Landing] Added standalone APK download stand-in and QR code assets
- [Landing] Interactive checksum copier and UI interaction enhancements in `main.ts`
- [App] Centralized `LucideIcons.tsx` icon component library using `lucide-react-native`

### Changed
- [App] Replaced emojis and vector icons with Lucide icons across Auth (login, register, forgot-password), Profile, and Dashboard screens
- [App] Updated EAS build configuration preview base URL to point to development server
- [Backend] Extended JWT authentication token expiry and session duration to 30 days (`30d`)

### Fixed
- [Backend] Updated JWT test assertions to validate 30-day token lifetime window cleanly

### Testing & Verification
- Backend Jest test suite: 12 test suites, 156 tests passed cleanly (`npm test` in `backend`)
- Landing page build: TypeScript type check and Vite production bundle passed (`npm run build` in `landing`)
- App type check: Expo React Native TypeScript verification passed with zero errors (`npx tsc --noEmit` in `app-voltwise`)
