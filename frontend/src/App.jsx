import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

const LOCAL_API = "http://localhost:5000/api";

// ── Demo Data ─────────────────────────────────────────────────────────────────
const DEMO_DEVICES = [
  { ip: "192.168.1.1",   mac: "50:2B:73:A9:41:F0", hostname: "Router / Gateway",   device_type: "router",  status: "online", first_seen: "08:32:11", threat_level: "LOW"  },
  { ip: "192.168.1.100", mac: "A4:83:E7:22:BC:91", hostname: "DESKTOP-PC",          device_type: "laptop",  status: "online", first_seen: "08:32:14", threat_level: "LOW"  },
  { ip: "192.168.1.101", mac: "C6:13:B5:83:71:33", hostname: "iPhone (Demo User)",  device_type: "mobile",  status: "online", first_seen: "08:32:18", threat_level: "LOW"  },
  { ip: "192.168.1.102", mac: "B8:27:EB:44:56:78", hostname: "Samsung Galaxy",      device_type: "mobile",  status: "online", first_seen: "08:32:21", threat_level: "LOW"  },
  { ip: "192.168.1.103", mac: "00:17:88:AA:BB:CC", hostname: "Philips-Hue-Bridge",  device_type: "iot",     status: "online", first_seen: "08:33:05", threat_level: "LOW"  },
  { ip: "192.168.1.104", mac: "8C:79:F5:11:22:33", hostname: "Samsung-Smart-TV",    device_type: "tv",      status: "online", first_seen: "08:33:18", threat_level: "LOW"  },
];

const DEMO_ALERTS = [
  { id: "d1", type: "NEW_DEVICE", message: "New device: Samsung-Smart-TV (192.168.1.104)",  time: "08:33:18", severity: "warning" },
  { id: "d2", type: "NEW_DEVICE", message: "New device: Philips-Hue-Bridge (192.168.1.103)",time: "08:33:05", severity: "warning" },
  { id: "d3", type: "NEW_DEVICE", message: "New device: Samsung Galaxy (192.168.1.102)",    time: "08:32:21", severity: "warning" },
  { id: "d4", type: "INFO",       message: "Network scan complete — 6 devices found",        time: "08:32:11", severity: "info"    },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const DEVICE_ICONS = {
  mobile:  "📱",
  laptop:  "💻",
  router:  "📡",
  tv:      "📺",
  printer: "🖨️",
  apple:   "🍎",
  iot:     "🔌",
  unknown: "❓",
};

// ── Sub-components ────────────────────────────────────────────────────────────
function DeviceIcon({ type }) {
  return <span className="device-icon">{DEVICE_ICONS[type] || "❓"}</span>;
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value text-${accent}`}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function AlertItem({ alert }) {
  const icon = alert.type === "NEW_DEVICE" ? "🔌" : alert.type === "INFO" ? "ℹ️" : "⚠️";
  return (
    <div className={`alert-item sev-${alert.severity}`}>
      <span>{icon} {alert.message}</span>
      <span className="alert-time">🕐 {alert.time}</span>
    </div>
  );
}

// ── IP Reputation via freeipapi.com (HTTPS, CORS-enabled, free) ───────────────
async function fetchIpInfoDirect(ip) {
  const res = await fetch(`https://freeipapi.com/api/json/${ip}`);
  if (!res.ok) throw new Error("API error");
  const d = await res.json();
  const isProxy = d.isProxy === true;
  return {
    ip,
    tor_vpn:    { is_tor: false },
    reputation: {
      country:      d.countryName  || "Unknown",
      country_code: d.countryCode  || "",
      city:         d.cityName     || "Unknown",
      isp:          d.ipType       || "Unknown",
      is_proxy:     isProxy,
      is_hosting:   false,
      is_suspicious: isProxy,
      threat_level:  isProxy ? "HIGH" : "LOW",
    },
  };
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [demoMode,        setDemoMode]        = useState(false);
  const [devices,         setDevices]         = useState([]);
  const [alerts,          setAlerts]          = useState([]);
  const [scanning,        setScanning]        = useState(false);
  const [lastScan,        setLastScan]        = useState(null);
  const [myIp,            setMyIp]            = useState(null);
  const [backendOnline,   setBackendOnline]   = useState(false);
  const [isAdmin,         setIsAdmin]         = useState(false);
  const [autoRefresh,     setAutoRefresh]     = useState(false);
  const [selectedDevice,  setSelectedDevice]  = useState(null);
  const [ipQuery,         setIpQuery]         = useState("");
  const [ipResult,        setIpResult]        = useState(null);
  const [ipLoading,       setIpLoading]       = useState(false);
  const [filter,          setFilter]          = useState("all");
  const [scanned,         setScanned]         = useState(false);
  const timerRef = useRef(null);

  // ── On mount: try backend, fallback to demo ──────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    fetch(`${LOCAL_API}/status`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        clearTimeout(timeout);
        setMyIp(d);
        setBackendOnline(true);
        setIsAdmin(d.is_admin);
        setDemoMode(false);
      })
      .catch(() => {
        clearTimeout(timeout);
        setBackendOnline(false);
        setDemoMode(true);
        // Pre-load demo status info
        setMyIp({ local_ip: "192.168.1.100", hostname: "DESKTOP-DEMO", network: "192.168.1.0/24" });
      });

    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);

  // ── Scan function ────────────────────────────────────────────────────────
  const scanNetwork = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    setSelectedDevice(null);

    if (demoMode) {
      // Simulate a realistic scan delay
      await new Promise(r => setTimeout(r, 2500));
      setDevices(DEMO_DEVICES);
      setAlerts(DEMO_ALERTS);
      setLastScan(new Date().toLocaleTimeString("en-GB", { hour12: false }));
      setScanned(true);
    } else {
      try {
        const [scanRes, alertRes] = await Promise.all([
          fetch(`${LOCAL_API}/scan`).then(r => r.json()),
          fetch(`${LOCAL_API}/alerts`).then(r => r.json()),
        ]);
        if (scanRes.success) {
          setDevices(scanRes.devices);
          setLastScan(scanRes.scan_time);
          setIsAdmin(scanRes.is_admin ?? isAdmin);
          setBackendOnline(true);
          setScanned(true);
        }
        if (alertRes.success) setAlerts(alertRes.alerts);
      } catch {
        setBackendOnline(false);
        setAlerts(prev => [{
          id: Date.now(),
          type: "ERROR",
          message: "Cannot reach backend — run app.py as Administrator!",
          time: new Date().toLocaleTimeString(),
          severity: "danger",
        }, ...prev.slice(0, 29)]);
      }
    }

    setScanning(false);
  }, [scanning, demoMode, isAdmin]);

  // ── Auto-refresh ─────────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    if (autoRefresh) timerRef.current = setInterval(scanNetwork, 30000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, scanNetwork]);

  // ── IP Checker ───────────────────────────────────────────────────────────
  const checkIp = useCallback(async (overrideIp) => {
    const target = (overrideIp ?? ipQuery).trim();
    if (!target) return;
    setIpLoading(true);
    setIpResult(null);
    if (overrideIp) setIpQuery(overrideIp);

    try {
      if (!demoMode && backendOnline) {
        const res = await fetch(`${LOCAL_API}/ip-info/${target}`).then(r => r.json());
        setIpResult(res);
      } else {
        // Direct HTTPS call — works on Vercel too
        const res = await fetchIpInfoDirect(target);
        setIpResult(res);
      }
    } catch {
      setIpResult({ error: "Could not fetch IP info. Check the IP and try again." });
    }
    setIpLoading(false);
  }, [ipQuery, demoMode, backendOnline]);

  const clearAlerts = async () => {
    if (!demoMode) {
      await fetch(`${LOCAL_API}/clear-alerts`, { method: "POST" }).catch(() => {});
    }
    setAlerts([]);
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const suspiciousCount = devices.filter(d => d.threat_level === "HIGH").length;
  const newCount        = alerts.filter(a => a.type === "NEW_DEVICE").length;
  const uniqueTypes     = ["all", ...new Set(devices.map(d => d.device_type))];
  const filteredDevices = filter === "all" ? devices : devices.filter(d => d.device_type === filter);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="scanline" />
      <div className="grid-bg" />

      <div className="app">
        {/* ── Header ── */}
        <header className="header">
          <div className="logo">
            🛡️ NET<span className="logo-accent">WATCH</span>
            <div className="logo-sub">NETWORK THREAT MONITOR</div>
          </div>

          <div className="header-right">
            {demoMode && (
              <div className="demo-badge">⚡ DEMO MODE</div>
            )}
            {!isAdmin && backendOnline && (
              <div className="warn-badge">! NOT ADMIN — scan limited</div>
            )}
            <div className="pill">
              <span className={`dot ${demoMode ? "yellow" : backendOnline ? "green" : "red"}`} />
              {demoMode ? "DEMO" : backendOnline ? "BACKEND ONLINE" : "BACKEND OFFLINE"}
            </div>
            {lastScan && <div className="pill">LAST SCAN: {lastScan}</div>}
            <button
              className={`btn ${autoRefresh ? "btn-active" : ""}`}
              onClick={() => setAutoRefresh(v => !v)}
            >
              ⟳ AUTO {autoRefresh ? "ON" : "OFF"}
            </button>
          </div>
        </header>

        {/* ── Stats ── */}
        <section className="stats-grid">
          <StatCard label="Total Devices"    value={devices.length}  sub="on your network"  accent="green"  />
          <StatCard label="Threats Detected" value={suspiciousCount} sub="suspicious IPs"   accent="red"    />
          <StatCard label="New Devices"      value={newCount}        sub="since monitoring" accent="yellow" />
          <StatCard label="Alerts"           value={alerts.length}   sub="total alerts"     accent="blue"   />
        </section>

        {/* ── Main Layout ── */}
        <div className="main-grid">

          {/* ── Left Column ── */}
          <div className="left-col">

            {/* Devices Panel */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">CONNECTED DEVICES</span>
                <div className="panel-actions">
                  {uniqueTypes.map(t => (
                    <button
                      key={t}
                      className={`chip ${filter === t ? "chip-active" : ""}`}
                      onClick={() => setFilter(t)}
                    >
                      {t === "all" ? "ALL" : (DEVICE_ICONS[t] || "?") + " " + t.toUpperCase()}
                    </button>
                  ))}
                  <button
                    className={`btn ${scanning ? "btn-scanning" : ""}`}
                    onClick={scanNetwork}
                    disabled={scanning}
                  >
                    {scanning ? "◉ SCANNING…" : "▶ SCAN"}
                  </button>
                </div>
              </div>

              {scanning && <div className="loading-bar" />}

              {/* Demo mode subtle notice */}
              {demoMode && scanned && (
                <div className="demo-notice">
                  ⚡ Showing demo data — run the app locally to scan your real network
                </div>
              )}

              {filteredDevices.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📡</div>
                  <p>{devices.length === 0 ? "No scan yet — click SCAN to start" : "No devices match filter"}</p>
                  {devices.length === 0 && (
                    <button className="btn-big" onClick={scanNetwork} disabled={scanning}>
                      {scanning ? "SCANNING…" : demoMode ? "▶ START DEMO SCAN" : "▶ START SCAN"}
                    </button>
                  )}
                  {!backendOnline && !demoMode && (
                    <p className="text-red small">⚠️ Run: python app.py (as Administrator)</p>
                  )}
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="device-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>TYPE</th>
                        <th>IP ADDRESS</th>
                        <th>MAC ADDRESS</th>
                        <th>HOSTNAME</th>
                        <th>FIRST SEEN</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDevices.map((device, i) => (
                        <tr
                          key={device.ip}
                          className={selectedDevice?.ip === device.ip ? "row-selected" : ""}
                          onClick={() => setSelectedDevice(prev => prev?.ip === device.ip ? null : device)}
                        >
                          <td className="text-dim">{String(i + 1).padStart(2, "0")}</td>
                          <td><DeviceIcon type={device.device_type} /></td>
                          <td className="text-green mono">{device.ip}</td>
                          <td className="text-dim mono small">{device.mac}</td>
                          <td className="hostname">{device.hostname}</td>
                          <td className="text-dim small">{device.first_seen}</td>
                          <td>
                            <button
                              className="btn-link"
                              onClick={e => { e.stopPropagation(); checkIp(device.ip); }}
                            >
                              CHECK IP →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Device Detail Drawer */}
              {selectedDevice && (
                <div className="device-detail">
                  <div className="detail-title">DEVICE DETAILS</div>
                  <div className="detail-grid">
                    <div className="detail-row"><span>📡 IP</span><span className="text-green">{selectedDevice.ip}</span></div>
                    <div className="detail-row"><span>🔢 MAC</span><span className="text-green mono">{selectedDevice.mac}</span></div>
                    <div className="detail-row"><span>📛 Hostname</span><span className="text-green">{selectedDevice.hostname}</span></div>
                    <div className="detail-row"><span>📱 Type</span><span>{DEVICE_ICONS[selectedDevice.device_type]} {selectedDevice.device_type}</span></div>
                    <div className="detail-row"><span>🕐 First Seen</span><span className="text-green">{selectedDevice.first_seen}</span></div>
                  </div>
                  <button className="btn" style={{ marginTop: 10 }} onClick={() => checkIp(selectedDevice.ip)}>
                    CHECK IP REPUTATION →
                  </button>
                </div>
              )}

              {/* My IP Footer */}
              {myIp && (
                <div className="myip-bar">
                  <span className="myip-item">MY IP: <b>{myIp.local_ip}</b></span>
                  <span className="myip-item">HOST: <b>{myIp.hostname}</b></span>
                  <span className="myip-item">NET: <b>{myIp.network}</b></span>
                </div>
              )}
            </div>

            {/* IP Reputation Checker */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">🔍 IP REPUTATION CHECKER</span>
                {demoMode && <span className="text-dim small">powered by freeipapi.com</span>}
              </div>
              <div className="ip-checker-row">
                <input
                  className="ip-input"
                  placeholder="Enter any IP address (e.g. 8.8.8.8)"
                  value={ipQuery}
                  onChange={e => setIpQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && checkIp()}
                />
                <button className="btn" onClick={() => checkIp()} disabled={ipLoading}>
                  {ipLoading ? "CHECKING…" : "CHECK"}
                </button>
              </div>

              {ipResult && (
                <div className="ip-result">
                  {ipResult.error ? (
                    <div className="text-red">❌ {ipResult.error}</div>
                  ) : (
                    <div className="result-grid">
                      <div className="result-row"><span>🌐 IP</span><span className="text-green">{ipResult.ip}</span></div>
                      <div className="result-row"><span>📍 Location</span><span className="text-green">{ipResult.reputation?.city}, {ipResult.reputation?.country}</span></div>
                      <div className="result-row"><span>🏢 ISP</span><span className="text-green">{ipResult.reputation?.isp}</span></div>
                      <div className="result-row"><span>🧅 Tor Node</span>
                        <span className={ipResult.tor_vpn?.is_tor ? "text-red" : "text-green"}>
                          {ipResult.tor_vpn?.is_tor ? "⚠ YES — TOR EXIT NODE" : "NO"}
                        </span>
                      </div>
                      <div className="result-row"><span>🔒 Proxy/VPN</span>
                        <span className={ipResult.reputation?.is_proxy ? "text-red" : "text-green"}>
                          {ipResult.reputation?.is_proxy ? "⚠ YES" : "NO"}
                        </span>
                      </div>
                      <div className="result-row"><span>⚡ Threat Level</span>
                        <span className={`badge badge-${(ipResult.reputation?.threat_level || "UNKNOWN").toLowerCase()}`}>
                          {ipResult.reputation?.threat_level}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column: Alerts ── */}
          <aside className="panel alerts-panel">
            <div className="panel-header">
              <span className="panel-title">⚠ LIVE ALERTS</span>
              <button className="btn btn-red" onClick={clearAlerts}>CLEAR</button>
            </div>

            <div className="alerts-list">
              {alerts.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px 20px" }}>
                  <div className="empty-icon">✅</div>
                  <p>No alerts</p>
                </div>
              ) : (
                alerts.map(a => <AlertItem key={a.id} alert={a} />)
              )}
            </div>

            <div className="tips-box">
              <div className="tips-title">QUICK TIPS</div>
              {demoMode ? (
                <>
                  <div>▸ This is a DEMO — data is simulated</div>
                  <div>▸ IP Checker uses real API data</div>
                  <div>▸ Clone repo & run locally for real scan</div>
                  <div>▸ Needs Python + Node.js installed</div>
                  <div>▸ Run backend as Administrator</div>
                </>
              ) : (
                <>
                  <div>▸ Run as Admin for full ARP scan</div>
                  <div>▸ Enable Auto for live monitoring</div>
                  <div>▸ Click a device row for details</div>
                  <div>▸ Filter by device type with chips</div>
                  <div>▸ HIGH threat = Proxy/VPN/Tor found</div>
                </>
              )}
            </div>
          </aside>
        </div>

        <footer className="footer">
          NETWATCH v1.0 — NETWORK THREAT MONITOR — EDUCATIONAL USE ONLY
          {demoMode && " — DEMO MODE"}
        </footer>
      </div>
    </>
  );
}
