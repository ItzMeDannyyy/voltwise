feat(iot,backend,ml): mitigate idle power reading via firmware tare and noise filtering

### Added
- [Firmware] `IOT_PARASITIC_OFFSET_WATTS` (3.7W) tare and `IDLE_CUTOFF_WATTS` (4.5W) deadband in `iot-voltwise/src/main.cpp`
- [Firmware] Explicit HardwareSerial 2 initialization for PZEM UART and robust boot power fallback
- [UI] Fallback to latest REST readings in `dashboard.tsx` when live MQTT feed is idle

### Changed
- [Backend] Raised negligible appliance threshold in `backend/src/lib/mqtt.ts` and `mlService.ts` from 3.0W to 5.0W
- [ML] Updated `NILMEventDisaggregator` noise deadband and isolated dataset filter from 3.0W to 5.0W in `ml-voltwise/nilm_disaggregator.py`
- [Config] Added presentation files and build artifacts to `.gitignore`

### Fixed
- Fixed issue where idle parasitic draw of the IoT device (3.6W–3.8W) was misrecognized as a low-power appliance (e.g. phone charger or light bulb)
- Fixed firmware power readings to zero-clamp idle fluctuations and subtract baseline offset during active loads

### Testing & Verification
- Tested and verified firmware upload to ESP32 over COM3 via PlatformIO (`pio run -t upload`)
- Verified backend Jest test suites: 12/12 passed (156/156 tests)
- Verified backend and mobile app TypeScript compilation: `npx tsc --noEmit` passed with 0 errors across both projects
- Deployed updated backend and ML disaggregator modules to Azure VM (`20.255.50.101`) and verified health check via HTTPS
