CHAPTERS = [
    {
        "num": "01",
        "title": "App Installation & QR Code Setup",
        "who": "Homeowners & Users",
        "prereq": "Android smartphone (Android 10+) or modern browser",
        "time": "2 minutes",
        "desc": "Get the official VoltWise application installed on your Android device using the live web portal or instant QR code scanner.",
        "steps": [
            (
                "Visit the official VoltWise web portal at https://voltwise-orcin.vercel.app/ or scroll down to the Install section.",
                "docs/manual/images/app-installation/01-install-qr.png",
                "The QR code card highlights the signed Android APK package.",
                "The 'Scan the QR code to install VoltWise on Android' banner displaying the QR card and connection requirements."
            ),
            (
                "Point your phone camera or QR scanner directly at the on-screen QR code.",
                None,
                None,
                "A download prompt appears on your device screen linking directly to the signed APK."
            ),
            (
                "Tap download and permit installation from your browser if prompted by Android security.",
                None,
                None,
                "The VoltWise app icon installs onto your device home screen."
            ),
            (
                "Launch VoltWise to complete initial application setup.",
                None,
                None,
                "The VoltWise themed splash screen loading cleanly into the Sign In screen."
            )
        ],
        "troubleshoot": [
            ("QR code will not scan", "Increase device monitor brightness, minimize glare, or tap 'Save the QR code (SVG)'."),
            ("Android blocks installation", "Enable 'Install Unknown Apps' under Android Settings > Apps > Special App Access."),
            ("Application fails to launch", "Verify device is running Android 10 or newer with active internet.")
        ]
    },
    {
        "num": "02",
        "title": "Account Registration & Sign In",
        "who": "Homeowners & Family Members",
        "prereq": "Valid email address, secure password",
        "time": "2 minutes",
        "desc": "Set up your personal VoltWise account to securely link with your home's smart meter and receive personalized electrical safety alerts.",
        "steps": [
            (
                "Open VoltWise to view the authentication portal.",
                "docs/manual/images/account-auth/01-login-screen.png",
                "Clean sign-in interface with email and password fields.",
                "The Sign In screen with fields for Email, Password, and 'Keep me signed in'."
            ),
            (
                "Tap 'Create an Account' if you are a first-time user.",
                "docs/manual/images/account-auth/02-register-screen.png",
                "Registration form capturing user credentials.",
                "The registration form displaying real-time password requirements."
            ),
            (
                "Submit registration to access your energy monitoring dashboard.",
                None,
                None,
                "Instant verification checkmark and transition to the main dashboard."
            ),
            (
                "Use 'Forgot Password?' if recovery is ever required.",
                "docs/manual/images/account-auth/03-forgot-password.png",
                "Password recovery prompt with one-touch code delivery.",
                "Instructional screen guiding verification code input."
            )
        ],
        "troubleshoot": [
            ("Invalid credentials error", "Check for accidental leading/trailing spaces in your email. Tap the eye icon to verify password text."),
            ("Verification code delayed", "Check spam folder or wait 60 seconds before requesting a new code.")
        ]
    },
    {
        "num": "03",
        "title": "Real-Time Energy Monitoring",
        "who": "Homeowners",
        "prereq": "Paired ESP32 sensor node",
        "time": "Continuous",
        "desc": "Monitor your household's real-time electricity consumption, line voltage, and current load to spot power waste instantly.",
        "steps": [
            (
                "Navigate to the Dashboard tab in the bottom bar.",
                "docs/manual/images/dashboard-monitoring/01-dashboard.png",
                "Live primary wattage gauge and daily kWh accumulation.",
                "Real-time wattage draw and daily energy totals updated continuously."
            ),
            (
                "Inspect multi-metric telemetry across individual circuits.",
                "docs/manual/images/dashboard-monitoring/02-telemetry-live.png",
                "Real-time voltage, current, and active loads across circuit lines.",
                "Continuous live telemetry streaming at 1–3 second intervals from the PZEM-004T sensor."
            ),
            (
                "Perform a pull-to-refresh to verify cloud sync.",
                None,
                None,
                "Subtle refresh indicator confirming active broker link."
            )
        ],
        "troubleshoot": [
            ("Dashboard shows 0W", "Verify ESP32 is powered and the Wi-Fi LED is solid blue."),
            ("Unusual load spike", "Check high-draw loads (air conditioners, heaters, electric ovens).")
        ]
    },
    {
        "num": "04",
        "title": "Emergency Power & Breaker Control",
        "who": "Homeowner / Operator",
        "prereq": "Relay module wired to electrical panel",
        "time": "10 seconds",
        "desc": "Remotely shut down electrical circuits or restore power to protect home appliances during severe voltage fluctuations or overloads.",
        "steps": [
            (
                "Tap the center Power button in the navigation bar to open Power Control.",
                None,
                None,
                "Power Control Modal appearing with Line 1 (10A) and Line 2 (30A) switches."
            ),
            (
                "Verify relay status and circuit health indicators.",
                "docs/manual/images/power-breaker-control/02-relay-architecture.png",
                "Dual-relay configuration: 1st line 10A and 2nd line 30A with staggered power-up.",
                "Clear ON/OFF status badges for both high-current lines."
            ),
            (
                "Trigger 'Cut Power (Emergency)' during hazardous spikes.",
                None,
                None,
                "Relay tripping within 3 seconds, isolating household appliances."
            ),
            (
                "Restore power with automatic 3-second staggered reboot delay.",
                None,
                None,
                "Voltage stabilizing safely without inrush current shock."
            )
        ],
        "troubleshoot": [
            ("Relay fails to switch", "Check MQTT broker connection in IoT Settings."),
            ("Relay immediately re-trips", "An appliance has a direct short; unplug appliances before resetting.")
        ]
    },
    {
        "num": "05",
        "title": "Connected Appliances & Device Management",
        "who": "Homeowners",
        "prereq": "Configured appliances",
        "time": "3 minutes",
        "desc": "Organize your household electrical devices by room, monitor individual appliance wattage, and track vampire loads.",
        "steps": [
            (
                "Select the Devices tab to view the appliance registry.",
                "docs/manual/images/appliance-management/01-devices-list.png",
                "Categorized appliance cards with live wattage indicators.",
                "List of appliances organized by room with operational statuses."
            ),
            (
                "Tap any device card to view detailed historical load.",
                None,
                None,
                "Detailed drawer with runtime hours and daily kilowatt-hours."
            ),
            (
                "Tap '+ Add Device' to register new electrical equipment.",
                None,
                None,
                "Modal dialog requesting name, rated wattage, and assigned circuit line."
            )
        ],
        "troubleshoot": [
            ("Appliance reads 0W while active", "Ensure device is on the circuit monitored by the CT sensor clamp."),
            ("Appliance list empty", "Tap '+ Add Device' or pair hardware in IoT Provisioning.")
        ]
    },
    {
        "num": "06",
        "title": "IoT Hardware Provisioning",
        "who": "Homeowner / Installer",
        "prereq": "VoltWise ESP32 Energy Monitor & 2.4 GHz Wi-Fi",
        "time": "5 minutes",
        "desc": "Connect your VoltWise IoT hardware module to your home's Wi-Fi network and link it to your cloud account.",
        "steps": [
            (
                "Power on the ESP32 module near the main distribution breaker.",
                None,
                None,
                "ST7789 display lights up and broadcasts 'VoltWise-Setup' Wi-Fi."
            ),
            (
                "Open Settings > IoT Provisioning in the VoltWise mobile app.",
                "docs/manual/images/iot-provisioning/01-iot-provision.png",
                "Guided Wi-Fi softAP connection assistant.",
                "Screen directing user to connect to 192.168.4.1 setup hotspot."
            ),
            (
                "Select your home Wi-Fi network and enter password.",
                None,
                None,
                "Hardware switches to 'Paired & Streaming' state."
            ),
            (
                "Confirm your unique DEVICE_UID in IoT Settings.",
                "docs/manual/images/iot-provisioning/02-iot-settings.png",
                "Hardware parameters, MQTT server, and sampling telemetry rates.",
                "Active connection badge indicating green TLS telemetry stream."
            )
        ],
        "troubleshoot": [
            ("'VoltWise-Setup' SSID not found", "Hold ESP32 reset button for 5 seconds to reset pairing mode."),
            ("Wi-Fi connection fails", "Ensure you are connecting to a 2.4 GHz network (5 GHz is unsupported).")
        ]
    },
    {
        "num": "07",
        "title": "Consumption Analytics & Bill Estimation",
        "who": "Homeowners",
        "prereq": "48+ hours of recorded telemetry",
        "time": "2 minutes",
        "desc": "Gain visibility into your electricity spending, peak consumption hours, and forecast your end-of-month utility bill using machine learning models.",
        "steps": [
            (
                "Open the Analytics tab to view historical consumption.",
                "docs/manual/images/analytics-billing/01-analytics.png",
                "Energy usage velocity charts and utility tariff forecasts.",
                "Bar and area charts comparing daily, weekly, and monthly consumption."
            ),
            (
                "Examine the 'Projected Monthly Bill' estimate card.",
                None,
                None,
                "Estimated monetary forecast calculated from telemetry velocity."
            ),
            (
                "Review Peak Hours to identify time windows for tariff reduction.",
                None,
                None,
                "Color-coded timeline showing peak load hours (e.g., 6:00 PM – 10:00 PM)."
            )
        ],
        "troubleshoot": [
            ("Insufficient data banner", "Allow at least 48 hours of continuous sensor telemetry for ML billing."),
            ("Tariff rate incorrect", "Update kilowatt-hour pricing under Settings > Billing & Tariff.")
        ]
    },
    {
        "num": "08",
        "title": "Automated Safety Alerts & Interventions",
        "who": "Homeowners",
        "prereq": "Enabled push notifications",
        "time": "Immediate",
        "desc": "Protect your home against electrical fires, appliance damage from voltage spikes, and energy theft through automated anomaly detection.",
        "steps": [
            (
                "Tap Alerts to review the prioritized notification feed.",
                "docs/manual/images/safety-alerts/01-alerts-list.png",
                "Real-time alert cards: Overload, Voltage Surge, and Vampire Drain.",
                "Chronological feed categorized into Warning, Critical, and Info levels."
            ),
            (
                "Observe automated emergency cutoff during severe anomalies.",
                "docs/manual/images/safety-alerts/02-safety-cut.png",
                "Rapid emergency intervention tripping circuit in under 3 seconds.",
                "Visual countdown prompt allowing user acknowledgment or override."
            ),
            (
                "Acknowledge or dismiss resolved warnings.",
                None,
                None,
                "Alert moves to resolved history and unread badge count clears."
            )
        ],
        "troubleshoot": [
            ("False overload alarms", "Increase circuit breaker rating under Settings > Alert Thresholds."),
            ("Alerts muted at night", "Ensure Critical Safety alerts are exempt from Quiet Hours.")
        ]
    },
    {
        "num": "09",
        "title": "App Preferences & Settings",
        "who": "Homeowners",
        "prereq": "Configured app",
        "time": "2 minutes",
        "desc": "Customize notification sounds, configure quiet hours, set power measurement units, and manage your account profile.",
        "steps": [
            (
                "Open the Settings screen from the app drawer.",
                "docs/manual/images/settings-preferences/01-settings.png",
                "Centralized configuration menu for alerts, units, and hardware.",
                "Structured sections for Account, Notifications, Display, and Hardware."
            ),
            (
                "Adjust notification triggers and audio feedback in Notification Settings.",
                "docs/manual/images/settings-preferences/02-notifications.png",
                "Sound effects, vibration haptics, and quiet hours configuration.",
                "Toggle switches for warning beeps and quiet hours intervals."
            ),
            (
                "Set preferred power units (kW vs. W) and local currency symbol.",
                None,
                None,
                "Immediate formatting updates applied across all dashboard gauges."
            )
        ],
        "troubleshoot": [
            ("Settings fail to persist", "Verify device has active network connection to synchronize cloud profile."),
            ("Vibrations inactive", "Check system vibration settings in Android OS Settings > Accessibility.")
        ]
    }
]
