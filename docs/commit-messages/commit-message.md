chore(workspace): remove unused files, assets, and dead functions across monorepo

### Changed / Updated
- [Root & Git] Removed dummy test files (`landing-page.js`, `new-feature.js`, `preview_page1.png`, `skills-lock.json`), untracked Python `.pyc` cache files, and added `__pycache__/` and `*.py[cod]` to `.gitignore`
- [Mobile App (`app-voltwise`)] Removed unused components (`AlertDetailModal.tsx`, `ThemedText.tsx`, `ThemedView.tsx`), 10 unused Expo template image assets, and dead functions/variables (`thinLabels`, `axisLabelStep`, `clearBillingCycle`, `formatCostOf`, `DEMO_CURRENT_WATTS`, `LOCK_AVAILABILITY_LABELS`, `EXCLUDED_KEYS`, `originalsRef`, and dead countdown state in `data-collection.tsx`)
- [Backend (`backend`)] Removed `yaml.txt`, obsolete `scripts/testPrisma.ts`, and `scripts/createModule.js`; cleaned unused `checkMlHealth`, `AlertType`, `dateAtHour`, dropped `icon` seed fields, and unused DTO interfaces
- [Landing (`landing`)] Removed unused Vite starter assets (`App.css`, `src/assets/*`, `public/icons.svg`), unused `.glow-*` CSS classes, and unused `isVoltwisePositive` row properties
- [ML & IoT (`ml-voltwise`, `iot-voltwise`)] Removed duplicate comparison PNG in `ml-voltwise/docs/`, unused `PredictionResponse` schema, duplicate startup `load_model_artifacts()` call, PlatformIO boilerplate READMEs, and dead C++ relay/config helpers (`setRelay`, `getRelayOnState`, `getRelayOffState`, `loadConfig`, `getApSsid`)

### Testing & Verification
- [Backend Unit & Integration Tests] Verified 12/12 Jest test suites (156/156 tests passed)
- [Mobile App TypeCheck] Verified `npx tsc --noEmit` in `app-voltwise` with 0 errors
- [Landing Build] Verified `npm run build --prefix landing` (`tsc -b && vite build`) with 0 errors
