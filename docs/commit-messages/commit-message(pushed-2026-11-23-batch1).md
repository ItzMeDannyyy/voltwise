feat(iot,app): add ST7789 240x240 TFT LCD dashboard and point app to dev server

### Added
- [IoT / Display] Added 7-pin 1.3" ST7789 240x240 IPS TFT SPI LCD support (`CS=5`, `DC=23`, `RST=4`, `SDA=19`, `SCL=18`) with Adafruit GFX and ST7789 libraries in `iot-voltwise/platformio.ini` and `iot-voltwise/src/main.cpp`
- [IoT / UI Screens] Implemented full-color boot splash screen, Wi-Fi/AP setup connection screen, staggered power restoration countdown screen with progress bar, and real-time live power telemetry dashboard (Watts/kW, Voltage, Current, Energy kWh, Power Factor, AC sensing state, and 1st/2nd Line relay badges)
- [IoT / Provisioning] Added `ProvisioningServer::getApSsid()` helper in `iot-voltwise/src/provisioning_server.h` to expose the dynamic MAC-suffixed AP SSID on the TFT setup screen

### Changed
- [Mobile App / API] Updated `EXPO_PUBLIC_BASE_URL` in `app-voltwise/eas.json` and fallback production URL in `app-voltwise/lib/api.ts` to `https://voltwise-dev-server.onrender.com/api`

### Testing & Verification
- [TypeScript] Verified `app-voltwise` TypeScript compilation via `npx tsc --noEmit` (0 errors)
- [Pre-Push Gate] Executed automated pre-push validation checks on `development` branch
