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
    int n = WiFi.scanNetworks(false, true); // Synchronous scan
    JsonDocument doc;
    JsonArray networks = doc.to<JsonArray>();

    if (n > 0)
    {
      for (int i = 0; i < n && i < 30; ++i)
      {
        String ssid = WiFi.SSID(i);
        if (ssid.length() == 0)
          continue; // Skip unnamed / hidden networks from list
        JsonObject net = networks.add<JsonObject>();
        net["ssid"] = ssid;
        net["rssi"] = WiFi.RSSI(i);
        net["secure"] = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
      }
    }

    WiFi.scanDelete();

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
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>VoltWise Wi-Fi Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0b1120; color: #f8fafc; padding: 16px; display: flex; justify-content: center; min-height: 100vh; }
    .card { background: #1e293b; border-radius: 16px; padding: 22px; width: 100%; max-width: 440px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #334155; }
    .header { text-align: center; margin-bottom: 18px; }
    h1 { font-size: 22px; color: #38bdf8; margin-bottom: 4px; }
    p.sub { color: #94a3b8; font-size: 13px; }
    .badge { display: inline-block; background: #0369a1; color: #bae6fd; font-size: 11px; padding: 3px 10px; border-radius: 12px; margin-top: 6px; font-weight: 600; }
    
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; margin-top: 14px; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #cbd5e1; }
    .btn-rescan { background: transparent; border: 1px solid #475569; color: #38bdf8; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
    .btn-rescan:hover { background: #334155; border-color: #38bdf8; }

    /* Network list */
    .net-list { display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 2px; margin-bottom: 12px; }
    .net-item { display: flex; align-items: center; justify-content: space-between; background: #0f172a; border: 1px solid #334155; padding: 11px 14px; border-radius: 10px; cursor: pointer; transition: all 0.15s; user-select: none; }
    .net-item:hover { border-color: #38bdf8; background: #1e293b; }
    .net-item.selected { border-color: #38bdf8; background: #0c4a6e44; box-shadow: 0 0 0 1px #38bdf8; }
    .net-left { display: flex; align-items: center; gap: 10px; overflow: hidden; }
    .net-ssid { font-size: 14px; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 230px; }
    .net-right { display: flex; align-items: center; gap: 8px; color: #94a3b8; }
    
    .loading-box { text-align: center; padding: 22px; color: #94a3b8; font-size: 13px; background: #0f172a; border-radius: 10px; border: 1px dashed #334155; margin-bottom: 12px; }
    .spinner { display: inline-block; width: 20px; height: 20px; border: 3px solid rgba(56,189,248,0.2); border-radius: 50%; border-top-color: #38bdf8; animation: spin 0.8s linear infinite; margin-bottom: 6px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Hidden network toggle */
    .btn-hidden-toggle { width: 100%; background: transparent; border: 1px dashed #475569; color: #94a3b8; padding: 10px; border-radius: 8px; font-size: 13px; cursor: pointer; margin-bottom: 14px; transition: all 0.2s; }
    .btn-hidden-toggle:hover { color: #38bdf8; border-color: #38bdf8; background: #0f172a; }

    /* Form container */
    .form-box { background: #0f172a; border-radius: 12px; padding: 16px; border: 1px solid #334155; }
    .selected-banner { display: flex; align-items: center; justify-content: space-between; background: #0c4a6e55; border: 1px solid #0284c7; padding: 8px 12px; border-radius: 8px; margin-bottom: 14px; font-size: 13px; color: #e0f2fe; }
    .selected-banner strong { color: #38bdf8; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: middle; }

    label { font-size: 12px; font-weight: 600; color: #94a3b8; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .input-wrap { position: relative; margin-bottom: 14px; }
    input { width: 100%; padding: 11px 12px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #fff; font-size: 14px; }
    input:focus { outline: none; border-color: #38bdf8; }
    .toggle-pwd { position: absolute; right: 10px; top: 10px; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 15px; padding: 2px 6px; }
    
    .advanced-toggle { font-size: 12px; color: #64748b; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 14px; user-select: none; }
    .advanced-toggle:hover { color: #94a3b8; }
    .advanced-fields { display: none; margin-bottom: 14px; }

    .btn-connect { width: 100%; background: #0284c7; color: white; border: none; padding: 13px; border-radius: 8px; font-weight: bold; font-size: 15px; cursor: pointer; transition: background 0.2s; }
    .btn-connect:hover { background: #0369a1; }
    .btn-connect:disabled { opacity: 0.6; cursor: not-allowed; }
    
    .status { text-align: center; font-size: 13px; margin-top: 14px; padding: 12px; border-radius: 8px; display: none; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>⚡ VoltWise Setup</h1>
      <p class="sub">Connect VoltWise IoT to your home Wi-Fi</p>
      <span class="badge">2.4 GHz Only</span>
    </div>

    <!-- Scanned networks section -->
    <div id="scan-view">
      <div class="section-header">
        <span class="section-title">Available Networks</span>
        <button type="button" class="btn-rescan" id="btn-rescan" onclick="startScan()">
          ↻ Rescan
        </button>
      </div>

      <div id="scan-loading" class="loading-box" style="display:none;">
        <div class="spinner"></div>
        <div>Scanning for nearby networks...</div>
      </div>

      <div id="net-list" class="net-list"></div>

      <button type="button" class="btn-hidden-toggle" id="btn-hidden" onclick="showHiddenMode()">
        🔒 Connect to Hidden / Other Network
      </button>
    </div>

    <!-- Connection Form -->
    <form id="form">
      <div class="form-box">
        <!-- Hidden mode SSID input (visible in hidden mode) -->
        <div id="manual-ssid-box" style="display:none;">
          <div class="section-header" style="margin-top:0;">
            <span class="section-title">Hidden Network</span>
            <button type="button" class="btn-rescan" onclick="showScanMode()">
              ← Back to List
            </button>
          </div>
          <label for="ssid">Network Name (SSID)</label>
          <div class="input-wrap">
            <input type="text" id="ssid" placeholder="Enter hidden Wi-Fi SSID" autocomplete="off" autocorrect="off" autocapitalize="none" />
          </div>
        </div>

        <!-- Selected Network Banner (visible in list mode) -->
        <div id="selected-banner" class="selected-banner" style="display:none;">
          <div>Selected: <strong id="selected-ssid-text">None</strong></div>
          <span id="selected-security" style="font-size:11px; color:#bae6fd;"></span>
        </div>

        <!-- Password input -->
        <label for="pass">Wi-Fi Password</label>
        <div class="input-wrap">
          <input type="password" id="pass" placeholder="Enter password (leave blank if open)" autocomplete="current-password" />
          <button type="button" class="toggle-pwd" onclick="togglePassword()" title="Show/Hide Password">👁️</button>
        </div>

        <!-- Advanced Toggle (Device UID) -->
        <div class="advanced-toggle" onclick="toggleAdvanced()">
          <span id="adv-arrow">▶</span> Advanced (Device UID)
        </div>
        <div class="advanced-fields" id="adv-fields">
          <label for="uid">Device Sensor UID</label>
          <div class="input-wrap">
            <input type="text" id="uid" placeholder="e.g. esp32-01" />
          </div>
        </div>

        <button type="submit" class="btn-connect" id="btn-submit">
          Connect to Wi-Fi
        </button>
      </div>

      <div id="status" class="status"></div>
    </form>
  </div>

  <script>
    let isManualMode = false;
    let selectedNetwork = null;

    function renderSignalIcon(rssi) {
      const bars = rssi >= -60 ? 4 : rssi >= -70 ? 3 : rssi >= -80 ? 2 : 1;
      return '<svg width="18" height="15" viewBox="0 0 18 15" style="display:block">' +
        '<rect x="0" y="11" width="3" height="4" rx="1" fill="#38bdf8" opacity="' + (bars>=1?'1':'0.2') + '"/>' +
        '<rect x="5" y="7" width="3" height="8" rx="1" fill="#38bdf8" opacity="' + (bars>=2?'1':'0.2') + '"/>' +
        '<rect x="10" y="3" width="3" height="12" rx="1" fill="#38bdf8" opacity="' + (bars>=3?'1':'0.2') + '"/>' +
        '<rect x="15" y="0" width="3" height="15" rx="1" fill="#38bdf8" opacity="' + (bars>=4?'1':'0.2') + '"/>' +
      '</svg>';
    }

    function renderLockIcon(secure) {
      if (!secure) return '<span style="font-size:11px;color:#10b981;font-weight:600">Open</span>';
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">' +
        '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
        '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>' +
      '</svg>';
    }

    function selectNetwork(net) {
      isManualMode = false;
      selectedNetwork = net;
      document.getElementById('ssid').value = net.ssid;
      document.getElementById('selected-ssid-text').innerText = net.ssid;
      document.getElementById('selected-security').innerText = net.secure ? '🔒 WPA/WPA2' : '🔓 Open';
      document.getElementById('selected-banner').style.display = 'flex';
      document.getElementById('manual-ssid-box').style.display = 'none';

      document.querySelectorAll('.net-item').forEach(el => {
        el.classList.toggle('selected', el.getAttribute('data-ssid') === net.ssid);
      });

      const passField = document.getElementById('pass');
      if (net.secure) {
        passField.focus();
      } else {
        passField.value = '';
      }
    }

    function showHiddenMode() {
      isManualMode = true;
      selectedNetwork = null;
      document.getElementById('scan-view').style.display = 'none';
      document.getElementById('manual-ssid-box').style.display = 'block';
      document.getElementById('selected-banner').style.display = 'none';
      document.getElementById('ssid').value = '';
      document.getElementById('ssid').focus();
    }

    function showScanMode() {
      isManualMode = false;
      document.getElementById('scan-view').style.display = 'block';
      document.getElementById('manual-ssid-box').style.display = 'none';
      if (selectedNetwork) {
        document.getElementById('selected-banner').style.display = 'flex';
      }
    }

    function togglePassword() {
      const p = document.getElementById('pass');
      p.type = (p.type === 'password') ? 'text' : 'password';
    }

    function toggleAdvanced() {
      const fields = document.getElementById('adv-fields');
      const arrow = document.getElementById('adv-arrow');
      const isHidden = (fields.style.display !== 'block');
      fields.style.display = isHidden ? 'block' : 'none';
      arrow.innerText = isHidden ? '▼' : '▶';
    }

    let networkListCache = [];

    async function startScan() {
      const loading = document.getElementById('scan-loading');
      const list = document.getElementById('net-list');
      const btnRescan = document.getElementById('btn-rescan');
      
      loading.style.display = 'block';
      list.innerHTML = '';
      btnRescan.disabled = true;

      try {
        const res = await fetch('/api/scan');
        const networks = await res.json();
        loading.style.display = 'none';
        btnRescan.disabled = false;

        // Deduplicate SSIDs, keeping highest RSSI
        const map = new Map();
        (networks || []).forEach(n => {
          if (!n.ssid || !n.ssid.trim()) return;
          if (!map.has(n.ssid) || map.get(n.ssid).rssi < n.rssi) {
            map.set(n.ssid, n);
          }
        });
        const uniqueNets = Array.from(map.values()).sort((a,b) => b.rssi - a.rssi);
        networkListCache = uniqueNets;

        if (uniqueNets.length === 0) {
          list.innerHTML = '<div class="loading-box" style="border-style:solid;color:#94a3b8;">' +
            'No visible Wi-Fi networks found.<br>' +
            '<span style="font-size:11px;color:#64748b;">Make sure your 2.4 GHz router is nearby or use Hidden Network below.</span>' +
          '</div>';
          return;
        }

        list.innerHTML = uniqueNets.map((net, idx) => {
          const isSel = selectedNetwork && selectedNetwork.ssid === net.ssid;
          return '<div class="net-item ' + (isSel ? 'selected' : '') + '" data-ssid="' + net.ssid.replace(/"/g, '&quot;') + '" onclick="selectNetworkByIndex(' + idx + ')">' +
            '<div class="net-left">' +
              renderSignalIcon(net.rssi) +
              '<span class="net-ssid">' + net.ssid + '</span>' +
            '</div>' +
            '<div class="net-right">' +
              renderLockIcon(net.secure) +
            '</div>' +
          '</div>';
        }).join('');

        if (!selectedNetwork && !isManualMode && uniqueNets.length > 0) {
          selectNetwork(uniqueNets[0]);
        }
      } catch (e) {
        loading.style.display = 'none';
        btnRescan.disabled = false;
        list.innerHTML = '<div class="loading-box" style="color:#ef4444;border-color:#ef444455;">' +
          'Scan failed. <a href="#" onclick="startScan();return false;" style="color:#38bdf8;">Retry</a>' +
        '</div>';
      }
    }

    window.selectNetworkByIndex = function(idx) {
      if (networkListCache[idx]) {
        selectNetwork(networkListCache[idx]);
      }
    };

    fetch('/api/status').then(r=>r.json()).then(data=>{
      if(data.deviceUid) document.getElementById('uid').value = data.deviceUid;
    }).catch(()=>{});

    startScan();

    document.getElementById('form').onsubmit = async (e) => {
      e.preventDefault();
      const ssid = document.getElementById('ssid').value.trim();
      if (!ssid) {
        alert('Please select or enter a Wi-Fi network.');
        return;
      }

      const btn = document.getElementById('btn-submit');
      const status = document.getElementById('status');
      btn.disabled = true;
      btn.innerText = 'Connecting...';
      status.style.display = 'block';
      status.style.background = '#0369a1';
      status.style.color = '#e0f2fe';
      status.innerText = 'Sending configuration to VoltWise...';

      try {
        const res = await fetch('/api/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ssid: ssid,
            password: document.getElementById('pass').value,
            deviceUid: document.getElementById('uid').value.trim()
          })
        });
        const json = await res.json();
        if (json.success) {
          status.style.background = '#065f46';
          status.style.color = '#a7f3d0';
          status.innerHTML = '<strong>Success!</strong> VoltWise is connecting to <strong>' + ssid + '</strong>.<br><span style="font-size:12px;">You can now disconnect from this hotspot and return to your home Wi-Fi.</span>';
        } else {
          throw new Error(json.error || 'Provisioning failed');
        }
      } catch (err) {
        status.style.background = '#7f1d1d';
        status.style.color = '#fecaca';
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

    // Halt any active STA station connection and channel sweeping
    WiFi.disconnect(true);
    delay(50);

    // Switch to AP+STA so it can broadcast setup AP and scan Wi-Fi
    WiFi.mode(WIFI_AP_STA);
    IPAddress apIP(192, 168, 4, 1);
    IPAddress gateway(192, 168, 4, 1);
    IPAddress subnet(255, 255, 255, 0);
    WiFi.softAPConfig(apIP, gateway, subnet);
    WiFi.softAP(apSsid.c_str(), nullptr, 1); // Channel 1, open
    WiFi.setTxPower(WIFI_POWER_15dBm);

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
