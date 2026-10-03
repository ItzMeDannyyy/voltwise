#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ArduinoJson.h>
#include "config_manager.h"

class ProvisioningServer
{
private:
  static WebServer server;
  static DNSServer dnsServer;
  static bool isRunning;
  static bool shouldRestart;
  static unsigned long restartTime;
  static String apSsid;

  static void sendCorsHeaders()
  {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  static void handleOptions()
  {
    sendCorsHeaders();
    server.send(204);
  }

  static void handleStatus()
  {
    sendCorsHeaders();
    JsonDocument doc;
    doc["deviceUid"] = ConfigManager::getDeviceUid();
    doc["mac"] = WiFi.macAddress();
    doc["configured"] = ConfigManager::hasSavedConfig();
    doc["apSsid"] = apSsid;
    doc["ip"] = WiFi.softAPIP().toString();

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  }

  static void handleScan()
  {
    sendCorsHeaders();
    int n = WiFi.scanNetworks(false, true); // Synchronous scan, show hidden: false
    JsonDocument doc;
    JsonArray networks = doc.to<JsonArray>();

    if (n > 0)
    {
      for (int i = 0; i < n && i < 20; ++i)
      {
        String ssid = WiFi.SSID(i);
        if (ssid.length() == 0)
          continue; // Skip unnamed networks
        JsonObject net = networks.add<JsonObject>();
        net["ssid"] = ssid;
        net["rssi"] = WiFi.RSSI(i);
        net["secure"] = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
      }
    }

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  }

  static void handleProvision()
  {
    sendCorsHeaders();
    if (!server.hasArg("plain"))
    {
      server.send(400, "application/json", "{\"error\":\"Missing body\"}");
      return;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, server.arg("plain"));
    if (error)
    {
      server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      return;
    }

    const char *ssid = doc["ssid"];
    const char *password = doc["password"] | "";
    const char *uid = doc["deviceUid"] | "";

    if (!ssid || strlen(ssid) == 0)
    {
      server.send(400, "application/json", "{\"error\":\"SSID is required\"}");
      return;
    }

    Serial.println();
    Serial.println("==================================================");
    Serial.println(">>> RECEIVED WI-FI PROVISIONING VIA LOCAL API <<<");
    Serial.printf("  SSID:       %s\n", ssid);
    Serial.printf("  Device UID: %s\n", strlen(uid) > 0 ? uid : ConfigManager::getDeviceUid().c_str());
    Serial.println("==================================================");

    ConfigManager::saveWifi(String(ssid), String(password), String(uid));

    JsonDocument res;
    res["success"] = true;
    res["message"] = "Credentials saved. Connecting to Wi-Fi...";
    String resStr;
    serializeJson(res, resStr);
    server.send(200, "application/json", resStr);

    shouldRestart = true;
    restartTime = millis();
  }

  static void handleReset()
  {
    sendCorsHeaders();
    ConfigManager::clearConfig();
    Serial.println("[PROVISION] Wi-Fi config cleared via API.");
    server.send(200, "application/json", "{\"success\":true,\"message\":\"Config cleared\"}");
  }

  static void handleRoot()
  {
    String html = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VoltWise Wi-Fi Setup</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; display: flex; justify-content: center; }
    .card { background: #1e293b; border-radius: 16px; padding: 28px; width: 100%; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { font-size: 24px; margin-top: 0; margin-bottom: 8px; color: #38bdf8; text-align: center; }
    p { color: #94a3b8; font-size: 14px; text-align: center; margin-bottom: 24px; }
    label { font-size: 13px; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 6px; }
    input, select { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; font-size: 15px; margin-bottom: 16px; }
    input:focus, select:focus { outline: none; border-color: #38bdf8; }
    button { width: 100%; background: #0284c7; color: white; border: none; padding: 14px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #0369a1; }
    .badge { display: inline-block; background: #0369a1; color: #bae6fd; font-size: 11px; padding: 3px 8px; border-radius: 12px; margin-bottom: 16px; }
    .status { text-align: center; font-size: 14px; margin-top: 16px; padding: 10px; border-radius: 8px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1> VoltWise Setup</h1>
    <p>Connect your Voltwise Device to your home Wi-Fi</p>
    <div style="text-align: center;"><span class="badge">2.4 GHz Only</span></div>
    <form id="form">
      <label for="ssid">Wi-Fi Network (SSID)</label>
      <input type="text" id="ssid" placeholder="Enter Wi-Fi network name" required />

      <label for="pass">Wi-Fi Password</label>
      <input type="password" id="pass" placeholder="Enter password (if any)" />

      <label for="uid">Device Sensor UID (Optional)</label>
      <input type="text" id="uid" placeholder="e.g. esp32-01" />

      <button type="submit" id="btn">Save & Connect</button>
      <div id="status" class="status"></div>
    </form>
  </div>
  <script>
    fetch('/api/status').then(r=>r.json()).then(data=>{
      if(data.deviceUid) document.getElementById('uid').value = data.deviceUid;
    }).catch(()=>{});

    document.getElementById('form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn');
      const status = document.getElementById('status');
      btn.disabled = true;
      btn.innerText = 'Connecting...';
      status.style.display = 'block';
      status.style.background = '#0369a1';
      status.innerText = 'Transmitting configuration to VoltWise...';

      try {
        const res = await fetch('/api/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ssid: document.getElementById('ssid').value,
            password: document.getElementById('pass').value,
            deviceUid: document.getElementById('uid').value
          })
        });
        const json = await res.json();
        if (json.success) {
          status.style.background = '#059669';
          status.innerText = 'Success! VoltWise is connecting to Wi-Fi. You may reconnect to your home Wi-Fi.';
        } else {
          throw new Error(json.error || 'Failed');
        }
      } catch (err) {
        status.style.background = '#dc2626';
        status.innerText = 'Error: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'Retry';
      }
    };
  </script>
</body>
</html>)rawliteral";
    server.send(200, "text/html", html);
  }

  static void handleNotFound()
  {
    if (isRunning)
    {
      // Captive portal redirect
      server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
      server.send(302, "text/plain", "");
    }
    else
    {
      server.send(404, "text/plain", "Not Found");
    }
  }

public:
  static void start()
  {
    if (isRunning)
      return;

    // Use last 4 hex characters of MAC address for a unique setup AP name
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    String suffix = mac.substring(mac.length() - 4);
    apSsid = "VoltWise-Setup-" + suffix;

    Serial.println();
    Serial.println("==================================================");
    Serial.println(">>> STARTING PROVISIONING ACCESS POINT & SERVER <<<");
    Serial.println("==================================================");
    Serial.printf("  Hotspot SSID: %s\n", apSsid.c_str());
    Serial.println("  Security:     OPEN (No password)");
    Serial.println("  IP Address:   192.168.4.1");
    Serial.println("  Web Portal:   http://192.168.4.1/");
    Serial.println("==================================================");

    // Switch to AP+STA so it can broadcast setup AP and scan Wi-Fi
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(apSsid.c_str());
    IPAddress apIP = WiFi.softAPIP();

    // DNS server redirects all requests to 192.168.4.1 for captive portal
    dnsServer.start(53, "*", apIP);

    // API Routes
    server.on("/api/status", HTTP_OPTIONS, handleOptions);
    server.on("/api/status", HTTP_GET, handleStatus);

    server.on("/api/scan", HTTP_OPTIONS, handleOptions);
    server.on("/api/scan", HTTP_GET, handleScan);

    server.on("/api/provision", HTTP_OPTIONS, handleOptions);
    server.on("/api/provision", HTTP_POST, handleProvision);

    server.on("/api/reset", HTTP_OPTIONS, handleOptions);
    server.on("/api/reset", HTTP_POST, handleReset);

    // Captive Portal Routes
    server.on("/", HTTP_GET, handleRoot);
    server.on("/generate_204", HTTP_GET, handleRoot);        // Android captive portal
    server.on("/hotspot-detect.html", HTTP_GET, handleRoot); // Apple captive portal
    server.on("/ncsi.txt", HTTP_GET, handleRoot);            // Windows captive portal
    server.onNotFound(handleNotFound);

    server.begin();
    isRunning = true;
    shouldRestart = false;
  }

  static void stop()
  {
    if (!isRunning)
      return;
    server.stop();
    dnsServer.stop();
    WiFi.softAPdisconnect(true);
    isRunning = false;
    Serial.println("[PROVISION] Provisioning server stopped.");
  }

  static bool active()
  {
    return isRunning;
  }

  static String getApSsid()
  {
    return apSsid;
  }

  static void handleClient()
  {
    if (!isRunning)
      return;

    dnsServer.processNextRequest();
    server.handleClient();

    if (shouldRestart && (millis() - restartTime >= 1200))
    {
      Serial.println("[PROVISION] Restarting ESP32 to apply Wi-Fi configuration...");
      delay(100);
      ESP.restart();
    }
  }
};

__attribute__((weak)) WebServer ProvisioningServer::server(80);
__attribute__((weak)) DNSServer ProvisioningServer::dnsServer;
__attribute__((weak)) bool ProvisioningServer::isRunning = false;
__attribute__((weak)) bool ProvisioningServer::shouldRestart = false;
__attribute__((weak)) unsigned long ProvisioningServer::restartTime = 0;
__attribute__((weak)) String ProvisioningServer::apSsid = "VoltWise-Setup";
