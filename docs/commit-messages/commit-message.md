feat(alerts,ui): decouple master cutoff, add custom alert actions, and polish UI

### Added
- [Backend] `prisma/seed-test-alerts.ts`: Diverse test suite with 9 realistic alerts across critical, warning, and info categories for user 1 testing
- [Backend] `prisma/clear-test-alerts.ts`: Clean rollback script to delete seeded test alerts with optional `--all` reset flag
- [Backend] Added `npm run seed:alerts` and `npm run clear:alerts` scripts to `backend/package.json`
- [UI] `AlertDetailModal` in `alerts.tsx`: Diagnostic sheet for alert inspection with severity tags, recommendations, and direct contextual actions
- [UI] Direct tariff configuration action button in `AlertDetailModal` linking to `units-settings.tsx`
- [UI] Standalone Lucide SVG vector icon library in `LucideIcons.tsx` replacing emojis and external bundle dependencies
- [Auth] `credential-storage.ts`: Secure local credential storage supporting session restoration

### Changed
- [Backend] `auth.service.ts` & `seed-user.ts`: Reclassified "Electricity tariff not set" from `WARNING` to `INFO` (System Notice)
- [UI] `app/(tabs)/alerts.tsx`: Eliminated automatic 3-second master power countdown on tapping alerts in the log; historical items now open safely for inspection
- [UI] `components/AnomalyModal.tsx`: Confined auto-countdown and "Cut master power" button strictly to active critical electrical hazards; warnings and notices never threaten power cutoff
- [UI] Redesigned `login.tsx`, `register.tsx`, `devices.tsx`, `alerts.tsx`, `analytics.tsx`, and `dashboard.tsx` with professional typography and high-contrast UI
- [Firmware] Synchronized relay threshold and remote command defaults in `iot-voltwise/src/main.cpp`

### Fixed
- Fixed critical bug where tapping "Electricity tariff not set" or historical warnings started an auto-shutdown countdown that disconnected master power relays
- Fixed Metro bundler export errors by resolving pure render hooks and React Compiler warnings

### Testing & Verification
- Backend Jest tests: 12/12 test suites passed (156/156 tests)
- Backend & Mobile TypeScript compilation: `npx tsc --noEmit` verified with 0 errors across both projects
- Deployed live backend updates to Azure VM (`20.255.50.101`) verified via HTTPS health check
- Published EAS OTA preview updates (IDs: `136e3089-705d-42e2-9e8a-0063d50f792b` and `1601b0fe-2e43-47f5-bfb7-c66295f76a4b`)
