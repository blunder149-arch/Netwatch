import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

const API = "http://localhost:5000/api";

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
  const icon = alert.type === "NEW_DEVICE" ? "🔌" : "⚠️";
  return (
    <div className={`alert-item sev-${alert.severity}`}>
      <span>{icon} {alert.message}</span>
      <span className="alert-time">🕐 {alert.time}</span>
    </div>
  );
}

export default function App() {
  const [devices, setDevices]           = useState([]);
  const [alerts, setAlerts]             = useState([]);
  const [scanning, setScanning]         = useState(false);
  const [lastScan, setLastScan]         = useState(null);
  const [myIp, setMyIp]                 = useState(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [isAdmin, setIsAdmin]           = useState(false);
  const [autoRefresh, setAutoRefresh]   = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [ipQuery, setIpQuery]           = useState("");
  const [ipResult, setIpResult]         = useState(null);
  const [ipLoading, setIpLoading]       = useState(false);
  const [filter, setFilter]             = useState("all");
  const timerRef = useRef(null);

  // ── Check backend on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/status`)
      .then(r => r.json())
      .then(d => {
        setMyIp(d);
        setBackendOnline(true);
        setIsAdmin(d.is_admin);
      })
      .catch(() => setBackendOnline(false));
  }, []);

  // ── Core scan function ──────────────────────────────────────────────────
  const scanNetwork = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const [scanRes, alertRes] = await Promise.all([
        fetch(`${API}/scan`).then(r => r.json()),
        fetch(`${API}/alerts`).then(r => r.json()),
      ]);
      if (scanRes.success) {
        setDevices(scanRes.devices);
        setLastScan(scanRes.scan_time);
        setIsAdmin(scanRes.is_admin ?? isAdmin);
        setBackendOnline(true);
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
    setScanning(false);
  }, [scanning, isAdmin]);

  // ── Auto-refresh every 30s ──────────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(scanNetwork, 30000);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, scanNetwork]);

  // ── IP Checker ──────────────────────────────────────────────────────────
  const checkIp = useCallback(async (overrideIp) => {
    const target = (overrideIp ?? ipQuery).trim();
    if (!target) return;
    setIpLoading(true);
    setIpResult(null);
    if (overrideIp) setIpQuery(overrideIp);
    try {
      const res = await fetch(`${API}/ip-info/${target}`).then(r => r.json());
      setIpResult(res);
    } catch {
      setIpResult({ error: "Backend offline or invalid IP." });
    }
    setIpLoading(false);
  }, [ipQuery]);

  const clearAlerts = async () => {
    await fetch(`${API}/clear-alerts`, { method: "POST" }).catch(() => {});
    setAlerts([]);
  };

  // ── Derived stats ────────────────────────────────────────────────────────
  const suspiciousCount = devices.filter(d => d.threat_level === "HIGH").length;
  const newCount = alerts.filter(a => a.type === "NEW_DEVICE").length;

  const filteredDevices = filter === "all"
    ? devices
    : devices.filter(d => d.device_type === filter);

  const uniqueTypes = ["all", ...new Set(devices.map(d => d.device_type))];

  // ── Render ───────────────────────────────────────────────────────────────
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
            {!isAdmin && backendOnline && (
              <div className="warn-badge">! NOT ADMIN — scan limited</div>
            )}
            <div className="pill">
              <span className={`dot ${backendOnline ? "green" : "red"}`} />
              {backendOnline ? "BACKEND ONLINE" : "BACKEND OFFLINE"}
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
          <StatCard label="Total Devices"    value={devices.length}  sub="on your network"   accent="green"  />
          <StatCard label="Threats Detected" value={suspiciousCount} sub="suspicious IPs"    accent="red"    />
          <StatCard label="New Devices"      value={newCount}        sub="since monitoring"  accent="yellow" />
          <StatCard label="Alerts"           value={alerts.length}   sub="total alerts"      accent="blue"   />
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
                  {/* Filter chips */}
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

              {filteredDevices.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📡</div>
                  <p>{devices.length === 0 ? "No scan yet — click SCAN to start" : "No devices match filter"}</p>
                  {devices.length === 0 && (
                    <button className="btn-big" onClick={scanNetwork} disabled={scanning}>
                      {scanning ? "SCANNING…" : "START SCAN"}
                    </button>
                  )}
                  {!backendOnline && (
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
              <div>▸ Run as Admin for full ARP scan</div>
              <div>▸ Enable Auto for live monitoring</div>
              <div>▸ Click a device row for details</div>
              <div>▸ Filter by device type with chips</div>
              <div>▸ HIGH threat = Proxy/VPN/Tor found</div>
            </div>
          </aside>
        </div>

        <footer className="footer">
          NETWATCH v1.0 — NETWORK THREAT MONITOR — EDUCATIONAL USE ONLY
        </footer>
      </div>
    </>
  );
}
