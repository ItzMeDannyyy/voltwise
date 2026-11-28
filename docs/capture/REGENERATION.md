# VoltWise Documentation Regeneration Guide

This documentation was automatically generated using **love-me-love-my-docs**. All screenshots and flow captures are executable build artifacts produced directly from the live application.

## One-Command Manual Regeneration

To regenerate all screenshots and rebuild the manual:

```bash
# 1. Start the Expo web application (if not already running)
npm run dev:app

# 2. Run the capture harness (takes real screenshots using Playwright)
python docs/capture/run_all.py

# 3. Build or serve the MkDocs Material site
mkdocs build --strict
# Or serve locally:
mkdocs serve
```

## Directory Structure

```
docs/
├── capture/                  # Automation scaffolding (never shown to readers)
│   ├── run_all.py            # Automated capture runner across all chapters
│   └── smoke_capture.py      # Thin-slice smoke test capture script
└── manual/                   # Reader-facing manual chapters
    ├── index.md              # Overview and quick-start roadmap
    ├── app-installation.md   # Step 1: Web & QR Code APK Installation
    ├── account-auth.md       # Step 2: Account creation & sign-in
    ├── dashboard-monitoring.md # Step 3: Real-time telemetry monitoring
    ├── power-breaker-control.md # Step 4: Remote relay and breaker cutoff
    ├── appliance-management.md  # Step 5: Appliance cards and load tracking
    ├── iot-provisioning.md   # Step 6: ESP32 Wi-Fi setup & MQTT pairing
    ├── analytics-billing.md  # Step 7: ML billing forecast & peak hours
    ├── safety-alerts.md      # Step 8: Anomaly detection & emergency trips
    ├── settings-preferences.md # Step 9: Notification rules & units
    └── images/               # Committed, reproducible screenshots
```

## Rot Pre-Mortem & Stability Checks

- **Base URLs & Viewports:** Centralized in `docs/capture/run_all.py` (`DESKTOP_VIEWPORT: 1280x860`, `MOBILE_VIEWPORT: 390x844`).
- **Web Host:** The production web host is pinned to `https://voltwise-orcin.vercel.app/`.
- **Selector Policy:** Uses structural section IDs (`#install`, `#monitor`, `#features`, `#statement`) and direct route loading (`/(auth)/login`, `/(tabs)/dashboard`, etc.) to prevent fragile selector drift.
