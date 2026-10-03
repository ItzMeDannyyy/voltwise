#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "secrets.h"

struct DeviceConfig {
  String wifiSsid;
  String wifiPassword;
  String deviceUid;
  bool isConfigured;
};

class ConfigManager {
private:
  static Preferences prefs;
  static const char* NAMESPACE_NAME;

public:
  static void begin() {
    prefs.begin(NAMESPACE_NAME, false);
  }

  static bool hasSavedConfig() {
    return prefs.isKey("wifi_ssid") && prefs.getString("wifi_ssid", "").length() > 0;
  }

  static String getWifiSsid() {
    String ssid = prefs.getString("wifi_ssid", "");
    if (ssid.length() == 0) {
#ifdef WIFI_SSID
      return String(WIFI_SSID);
#else
      return "";
#endif
    }
    return ssid;
  }

  static String getWifiPassword() {
    String pass = prefs.getString("wifi_pass", "");
    if (pass.length() == 0) {
#ifdef WIFI_PASSWORD
      return String(WIFI_PASSWORD);
#else
      return "";
#endif
    }
    return pass;
  }

  static String getDeviceUid() {
    String uid = prefs.getString("dev_uid", "");
    if (uid.length() == 0) {
#ifdef DEVICE_UID
      return String(DEVICE_UID);
#else
      return "esp32-01";
#endif
    }
    return uid;
  }

  static DeviceConfig loadConfig() {
    DeviceConfig config;
    config.wifiSsid = getWifiSsid();
    config.wifiPassword = getWifiPassword();
    config.deviceUid = getDeviceUid();
    config.isConfigured = hasSavedConfig();
    return config;
  }

  static bool saveWifi(const String& ssid, const String& password, const String& uid = "") {
    if (ssid.length() == 0) return false;
    prefs.putString("wifi_ssid", ssid);
    prefs.putString("wifi_pass", password);
    if (uid.length() > 0) {
      prefs.putString("dev_uid", uid);
    }
    return true;
  }

  static void clearConfig() {
    prefs.clear();
  }
};

__attribute__((weak)) Preferences ConfigManager::prefs;
__attribute__((weak)) const char* ConfigManager::NAMESPACE_NAME = "voltwise";
