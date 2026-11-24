feat(ml,backend,ui): implement event-based NILM disaggregation and power plane cluster map

### Added
- [ML] `nilm_disaggregator.py`: First-order finite difference step detector (delta P, delta Q) with noise deadband threshold, settling buffer, and Euclidean distance centroid classifier
- [ML] Per-appliance centroid extraction in `train.py` exporting `artifacts/nilm_centroids.json` with isolated state centroids and tolerance radii
- [ML] `POST /disaggregate` and `GET /power-plane` endpoints in FastAPI for interactive disaggregation and centroid inspection
- [UI] `PowerPlaneClusterMap.tsx`: Vector SVG cluster map displaying the 2D power plane, appliance tolerance ellipses, live event markers, and candidate distance formula cards

### Changed
- [ML] `POST /telemetry` in `app/main.py` updated to process incoming readings through the NILM event disaggregator and attach `nilm_event`
- [Backend] `src/lib/mlService.ts`: Added NILM event interfaces, transition tracking (ON/OFF), and disambiguated appliance matching
- [Backend] `src/lib/mqtt.ts`: Broadcasts live `power_plane_event` over MQTT when appliance step transitions occur
- [UI] `app/(tabs)/dashboard.tsx`: Integrated the PowerPlaneClusterMap component and subscribed to live MQTT power plane events

### Fixed
- [ML/Backend] Fixed model hallucination where charging a 10W phone triggered the Light Bulb due to steady-state cluster overlap and greedy backend substring matching

### Testing & Verification
- Tested phone charger step event (7.5W, 9.6 VAR): accurately matched Phone Charger (d=0.08) over Light Bulb (d=0.60)
- Tested simultaneous parallel switching events using delta P / delta Q isolation
- Executed backend Jest test suites: 12/12 passed (156/156 tests)
- Validated mobile app TypeScript compilation: `npx tsc --noEmit` passed with 0 errors
- Verified live deployment and health checks on Azure VM (20.255.50.101)
