import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:5000/api";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #010b13;
    color: #00ff88;
    font-family: 'Share Tech Mono', monospace;
    min-height: 100vh;
    overflow-x: hidden;
  }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #010b13; }
  ::-webkit-scrollbar-thumb { background: #00ff88; border-radius: 2px; }

  .scanline {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,255,136,0.015) 2px,
      rgba(0,255,136,0.015) 4px
    );
    pointer-events: none;
    z-index: 9999;
  }

  .grid-bg {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: 
      linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  .app { position: relative; z-index: 1; padding: 20px; max-width: 1400px; margin: 0 auto; }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(0,255,136,0.3);
    padding-bottom: 16px;
    margin-bottom: 24px;
  }

  .logo {
    font-family: 'Orbitron', sans-serif;
    font-size: 22px;
    font-weight: 900;
    color: #00ff88;
    text-shadow: 0 0 20px rgba(0,255,136,0.5);
    letter-spacing: 3px;
  }

  .logo span { color: #ff3860; }

  .status-bar {
    display: flex;
    gap: 20px;
    align-items: center;
    font-size: 11px;
    color: rgba(0,255,136,0.6);
  }

  .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #00ff88;
    box-shadow: 0 0 8px #00ff88;
    animation: pulse 1.5s infinite;
  }

  .dot.red { background: #ff3860; box-shadow: 0 0 8px #ff3860; }
  .dot.yellow { background: #ffdd57; box-shadow: 0 0 8px #ffdd57; }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: rgba(0,255,136,0.04);
    border: 1px solid rgba(0,255,136,0.2);
    border-radius: 4px;
    padding: 20px;
    position: relative;
    overflow: hidden;
    transition: all 0.3s;
  }

  .stat-card:hover {
    border-color: rgba(0,255,136,0.5);
    background: rgba(0,255,136,0.07);
    transform: translateY(-2px);
  }

  .stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, #00ff88, transparent);
  }

  .stat-card.red::before { background: linear-gradient(90deg, transparent, #ff3860, transparent); }
  .stat-card.yellow::before { background: linear-gradient(90deg, transparent, #ffdd57, transparent); }
  .stat-card.blue::before { background: linear-gradient(90deg, transparent, #3273dc, transparent); }

  .stat-label { font-size: 10px; color: rgba(0,255,136,0.5); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
  .stat-value { font-family: 'Orbitron', sans-serif; font-size: 32px; font-weight: 700; color: #00ff88; }
  .stat-value.red { color: #ff3860; text-shadow: 0 0 10px rgba(255,56,96,0.5); }
  .stat-value.yellow { color: #ffdd57; }
  .stat-value.blue { color: #3273dc; }
  .stat-sub { font-size: 10px; color: rgba(0,255,136,0.4); margin-top: 4px; }

  .main-grid {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 20px;
  }

  .panel {
    background: rgba(0,255,136,0.03);
    border: 1px solid rgba(0,255,136,0.15);
    border-radius: 4px;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-bottom: 1px solid rgba(0,255,136,0.15);
    background: rgba(0,255,136,0.05);
  }

  .panel-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 11px;
    letter-spacing: 2px;
    color: #00ff88;
  }

  .btn {
    background: transparent;
    border: 1px solid rgba(0,255,136,0.4);
    color: #00ff88;
    padding: 6px 14px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    cursor: pointer;
    border-radius: 2px;
    transition: all 0.2s;
    letter-spacing: 1px;
  }

  .btn:hover { background: rgba(0,255,136,0.1); border-color: #00ff88; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn.scanning { border-color: #ffdd57; color: #ffdd57; animation: borderPulse 1s infinite; }
  .btn.red { border-color: rgba(255,56,96,0.4); color: #ff3860; }
  .btn.red:hover { background: rgba(255,56,96,0.1); border-color: #ff3860; }

  @keyframes borderPulse {
    0%, 100% { box-shadow: 0 0 0 rgba(255,221,87,0); }
    50% { box-shadow: 0 0 10px rgba(255,221,87,0.3); }
  }

  .device-table { width: 100%; }

  .device-row {
    display: grid;
    grid-template-columns: 40px 130px 160px 1fr 120px 100px;
    gap: 12px;
    align-items: center;
    padding: 14px 20px;
    border-bottom: 1px solid rgba(0,255,136,0.06);
    transition: all 0.2s;
    font-size: 12px;
  }

  .device-row:hover { background: rgba(0,255,136,0.05); cursor: pointer; }
  .device-row.header { color: rgba(0,255,136,0.4); font-size: 10px; letter-spacing: 1px; border-bottom: 1px solid rgba(0,255,136,0.15); }
  .device-row.new { background: rgba(255,221,87,0.05); border-left: 2px solid #ffdd57; }

  .badge {
    padding: 3px 8px;
    border-radius: 2px;
    font-size: 10px;
    letter-spacing: 1px;
    text-align: center;
  }

  .badge.online { background: rgba(0,255,136,0.15); color: #00ff88; border: 1px solid rgba(0,255,136,0.3); }
  .badge.threat-low { background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.2); }
  .badge.threat-high { background: rgba(255,56,96,0.15); color: #ff3860; border: 1px solid rgba(255,56,96,0.3); }
  .badge.threat-unknown { background: rgba(255,221,87,0.1); color: #ffdd57; border: 1px solid rgba(255,221,87,0.2); }
  .badge.new-device { background: rgba(255,221,87,0.15); color: #ffdd57; border: 1px solid rgba(255,221,87,0.3); }

  .alerts-panel { display: flex; flex-direction: column; }
  .alerts-list { padding: 12px; display: flex; flex-direction: column; gap: 8px; max-height: 500px; overflow-y: auto; }

  .alert-item {
    padding: 12px;
    border-radius: 3px;
    font-size: 11px;
    line-height: 1.5;
    border-left: 3px solid;
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .alert-item.warning { background: rgba(255,221,87,0.08); border-color: #ffdd57; color: #ffdd57; }
  .alert-item.danger { background: rgba(255,56,96,0.08); border-color: #ff3860; color: #ff3860; }
  .alert-item.info { background: rgba(0,255,136,0.08); border-color: #00ff88; color: #00ff88; }

  .alert-time { font-size: 10px; opacity: 0.6; margin-top: 4px; }

  .no-data {
    padding: 40px;
    text-align: center;
    color: rgba(0,255,136,0.3);
    font-size: 13px;
  }

  .scan-btn-big {
    background: transparent;
    border: 2px solid #00ff88;
    color: #00ff88;
    padding: 12px 32px;
    font-family: 'Orbitron', sans-serif;
    font-size: 13px;
    cursor: pointer;
    border-radius: 3px;
    letter-spacing: 3px;
    transition: all 0.3s;
    box-shadow: 0 0 20px rgba(0,255,136,0.1);
  }

  .scan-btn-big:hover {
    background: rgba(0,255,136,0.1);
    box-shadow: 0 0 30px rgba(0,255,136,0.3);
    transform: translateY(-2px);
  }

  .scan-btn-big:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  .ip-checker {
    padding: 16px 20px;
    border-top: 1px solid rgba(0,255,136,0.15);
    display: flex;
    gap: 8px;
  }

  .ip-input {
    flex: 1;
    background: rgba(0,255,136,0.05);
    border: 1px solid rgba(0,255,136,0.2);
    color: #00ff88;
    padding: 8px 12px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    border-radius: 2px;
    outline: none;
  }

  .ip-input:focus { border-color: rgba(0,255,136,0.5); background: rgba(0,255,136,0.08); }
  .ip-input::placeholder { color: rgba(0,255,136,0.3); }

  .ip-result {
    margin: 0 20px 16px;
    padding: 12px;
    background: rgba(0,255,136,0.05);
    border: 1px solid rgba(0,255,136,0.15);
    border-radius: 3px;
    font-size: 11px;
    line-height: 1.8;
  }

  .my-ip-bar {
    padding: 10px 20px;
    background: rgba(0,255,136,0.04);
    border-top: 1px solid rgba(0,255,136,0.1);
    font-size: 11px;
    color: rgba(0,255,136,0.5);
    display: flex;
    gap: 24px;
  }

  .my-ip-bar span { color: #00ff88; }

  .loading-bar {
    height: 2px;
    background: linear-gradient(90deg, transparent, #00ff88, transparent);
    animation: loading 1.5s infinite;
  }

  @keyframes loading {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .footer {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid rgba(0,255,136,0.1);
    font-size: 10px;
    color: rgba(0,255,136,0.3);
    text-align: center;
    letter-spacing: 2px;
  }

  @media (max-width: 1100px) {
    .main-grid { grid-template-columns: 1fr; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .device-row { grid-template-columns: 40px 120px 1fr 80px; }
    .device-row > *:nth-child(3),
    .device-row > *:nth-child(5) { display: none; }
  }
`;

export default function NetworkMonitor() {
    const [devices, setDevices] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [lastScan, setLastScan] = useState(null);
    const [myIp, setMyIp] = useState(null);
    const [ipQuery, setIpQuery] = useState("");
    const [ipResult, setIpResult] = useState(null);
    const [ipLoading, setIpLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [backendOnline, setBackendOnline] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);

    // Check backend status
    useEffect(() => {
        fetch(`${API}/myip`)
            .then(r => r.json())
            .then(d => { setMyIp(d); setBackendOnline(true); })
            .catch(() => setBackendOnline(false));
    }, []);

    const scanNetwork = useCallback(async () => {
        setScanning(true);
        try {
            const [scanRes, alertRes] = await Promise.all([
                fetch(`${API}/scan`).then(r => r.json()),
                fetch(`${API}/alerts`).then(r => r.json())
            ]);
            if (scanRes.success) {
                setDevices(scanRes.devices);
                setLastScan(scanRes.scan_time);
            }
            if (alertRes.success) setAlerts(alertRes.alerts);
        } catch (e) {
            setAlerts(prev => [{
                id: Date.now(),
                type: "ERROR",
                message: "Backend offline! Run app.py as Administrator first.",
                time: new Date().toLocaleTimeString(),
                severity: "danger"
            }, ...prev.slice(0, 19)]);
        }
        setScanning(false);
    }, []);

    // Auto refresh every 30s
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(scanNetwork, 30000);
        return () => clearInterval(interval);
    }, [autoRefresh, scanNetwork]);

    const checkIp = async () => {
        if (!ipQuery.trim()) return;
        setIpLoading(true);
        setIpResult(null);
        try {
            const res = await fetch(`${API}/ip-info/${ipQuery.trim()}`).then(r => r.json());
            setIpResult(res);
        } catch {
            setIpResult({ error: "Could not fetch IP info. Backend offline?" });
        }
        setIpLoading(false);
    };

    const clearAlerts = async () => {
        await fetch(`${API}/clear-alerts`, { method: 'POST' }).catch(() => { });
        setAlerts([]);
    };

    const suspiciousCount = devices.filter(d => d.threat_level === "HIGH").length;
    const newDevices = alerts.filter(a => a.type === "NEW_DEVICE").length;

    return (
        <>
            <style>{styles}</style>
            <div className="scanline" />
            <div className="grid-bg" />

            <div className="app">
                {/* Header */}
                <div className="header">
                    <div className="logo">
                        🛡️ NET<span>WATCH</span>
                        <div style={{ fontSize: 10, color: 'rgba(0,255,136,0.4)', letterSpacing: 4, marginTop: 2 }}>
                            NETWORK THREAT MONITOR
                        </div>
                    </div>
                    <div className="status-bar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className={`dot ${backendOnline ? '' : 'red'}`} />
                            {backendOnline ? 'BACKEND ONLINE' : 'BACKEND OFFLINE'}
                        </div>
                        {lastScan && <span>LAST SCAN: {lastScan}</span>}
                        <button
                            className={`btn ${autoRefresh ? 'scanning' : ''}`}
                            onClick={() => setAutoRefresh(!autoRefresh)}
                        >
                            {autoRefresh ? '⟳ AUTO ON' : '⟳ AUTO OFF'}
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-label">Total Devices</div>
                        <div className="stat-value">{devices.length}</div>
                        <div className="stat-sub">on your network</div>
                    </div>
                    <div className="stat-card red">
                        <div className="stat-label">Threats Detected</div>
                        <div className="stat-value red">{suspiciousCount}</div>
                        <div className="stat-sub">suspicious IPs</div>
                    </div>
                    <div className="stat-card yellow">
                        <div className="stat-label">New Devices</div>
                        <div className="stat-value yellow">{newDevices}</div>
                        <div className="stat-sub">since monitoring</div>
                    </div>
                    <div className="stat-card blue">
                        <div className="stat-label">Alerts</div>
                        <div className="stat-value blue">{alerts.length}</div>
                        <div className="stat-sub">total alerts</div>
                    </div>
                </div>

                {/* Main Grid */}
                <div className="main-grid">
                    {/* Devices Panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="panel">
                            <div className="panel-header">
                                <div className="panel-title">CONNECTED DEVICES</div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className={`btn ${scanning ? 'scanning' : ''}`} onClick={scanNetwork} disabled={scanning}>
                                        {scanning ? '◉ SCANNING...' : '▶ SCAN NETWORK'}
                                    </button>
                                </div>
                            </div>

                            {scanning && <div className="loading-bar" />}

                            {devices.length === 0 ? (
                                <div className="no-data">
                                    <div style={{ marginBottom: 20, fontSize: 40 }}>📡</div>
                                    <div style={{ marginBottom: 16, color: 'rgba(0,255,136,0.5)' }}>
                                        No devices scanned yet
                                    </div>
                                    <button className="scan-btn-big" onClick={scanNetwork} disabled={scanning}>
                                        {scanning ? 'SCANNING...' : 'START SCAN'}
                                    </button>
                                    {!backendOnline && (
                                        <div style={{ marginTop: 16, color: '#ff3860', fontSize: 11 }}>
                                            ⚠️ Backend offline! Run: python app.py (as Administrator)
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="device-table">
                                    <div className="device-row header">
                                        <div>#</div>
                                        <div>IP ADDRESS</div>
                                        <div>MAC ADDRESS</div>
                                        <div>HOSTNAME</div>
                                        <div>TYPE</div>
                                        <div>STATUS</div>
                                    </div>
                                    {devices.map((device, i) => (
                                        <div
                                            key={device.ip}
                                            className={`device-row ${selectedDevice?.ip === device.ip ? 'new' : ''}`}
                                            onClick={() => setSelectedDevice(device === selectedDevice ? null : device)}
                                        >
                                            <div style={{ color: 'rgba(0,255,136,0.4)' }}>{String(i + 1).padStart(2, '0')}</div>
                                            <div style={{ color: '#00ff88' }}>{device.ip}</div>
                                            <div style={{ color: 'rgba(0,255,136,0.6)', fontSize: 11 }}>{device.mac}</div>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {device.hostname}
                                            </div>
                                            <div style={{ fontSize: 11 }}>{device.device_type}</div>
                                            <div><span className="badge online">ONLINE</span></div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Selected Device Detail */}
                            {selectedDevice && (
                                <div style={{
                                    margin: '0 20px 16px',
                                    padding: 14,
                                    background: 'rgba(0,255,136,0.04)',
                                    border: '1px solid rgba(0,255,136,0.2)',
                                    borderRadius: 3,
                                    fontSize: 12,
                                    lineHeight: 1.8
                                }}>
                                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10, letterSpacing: 2, marginBottom: 10, color: 'rgba(0,255,136,0.6)' }}>
                                        DEVICE DETAILS
                                    </div>
                                    <div>📡 IP: <span style={{ color: '#00ff88' }}>{selectedDevice.ip}</span></div>
                                    <div>🔢 MAC: <span style={{ color: '#00ff88' }}>{selectedDevice.mac}</span></div>
                                    <div>📛 Host: <span style={{ color: '#00ff88' }}>{selectedDevice.hostname}</span></div>
                                    <div>{selectedDevice.device_type}</div>
                                    <div>🕐 First Seen: <span style={{ color: '#00ff88' }}>{selectedDevice.first_seen}</span></div>
                                    <button
                                        className="btn"
                                        style={{ marginTop: 10, fontSize: 10 }}
                                        onClick={() => { setIpQuery(selectedDevice.ip); checkIp(); }}
                                    >
                                        CHECK IP REPUTATION →
                                    </button>
                                </div>
                            )}

                            {/* My IP Bar */}
                            {myIp && (
                                <div className="my-ip-bar">
                                    <div>MY IP: <span>{myIp.local_ip}</span></div>
                                    <div>HOST: <span>{myIp.hostname}</span></div>
                                    <div>NETWORK: <span>{myIp.network}</span></div>
                                </div>
                            )}
                        </div>

                        {/* IP Checker */}
                        <div className="panel">
                            <div className="panel-header">
                                <div className="panel-title">IP REPUTATION CHECKER</div>
                            </div>
                            <div className="ip-checker">
                                <input
                                    className="ip-input"
                                    placeholder="Enter IP address (e.g. 192.168.1.1)"
                                    value={ipQuery}
                                    onChange={e => setIpQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && checkIp()}
                                />
                                <button className="btn" onClick={checkIp} disabled={ipLoading}>
                                    {ipLoading ? 'CHECKING...' : 'CHECK'}
                                </button>
                            </div>
                            {ipResult && (
                                <div className="ip-result">
                                    {ipResult.error ? (
                                        <div style={{ color: '#ff3860' }}>❌ {ipResult.error}</div>
                                    ) : (
                                        <>
                                            <div>🌐 IP: <span style={{ color: '#00ff88' }}>{ipResult.ip}</span></div>
                                            <div>📍 Location: <span style={{ color: '#00ff88' }}>{ipResult.reputation?.city}, {ipResult.reputation?.country}</span></div>
                                            <div>🏢 ISP: <span style={{ color: '#00ff88' }}>{ipResult.reputation?.isp}</span></div>
                                            <div>🧅 Tor: <span style={{ color: ipResult.tor_vpn?.is_tor ? '#ff3860' : '#00ff88' }}>{ipResult.tor_vpn?.is_tor ? '⚠️ YES — TOR EXIT NODE' : 'NO'}</span></div>
                                            <div>🔒 Proxy/VPN: <span style={{ color: ipResult.reputation?.is_proxy ? '#ff3860' : '#00ff88' }}>{ipResult.reputation?.is_proxy ? '⚠️ YES' : 'NO'}</span></div>
                                            <div>⚡ Threat Level: <span className={`badge threat-${ipResult.reputation?.threat_level?.toLowerCase()}`}>{ipResult.reputation?.threat_level}</span></div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Alerts Panel */}
                    <div className="panel alerts-panel">
                        <div className="panel-header">
                            <div className="panel-title">⚠ ALERTS</div>
                            <button className="btn red" onClick={clearAlerts}>CLEAR</button>
                        </div>
                        <div className="alerts-list">
                            {alerts.length === 0 ? (
                                <div className="no-data" style={{ padding: 30 }}>
                                    <div style={{ fontSize: 30, marginBottom: 10 }}>✅</div>
                                    No alerts yet
                                </div>
                            ) : (
                                alerts.map(alert => (
                                    <div key={alert.id} className={`alert-item ${alert.severity}`}>
                                        <div>{alert.type === 'NEW_DEVICE' ? '🔌' : '⚠️'} {alert.message}</div>
                                        <div className="alert-time">🕐 {alert.time}</div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Quick Tips */}
                        <div style={{
                            padding: '16px',
                            borderTop: '1px solid rgba(0,255,136,0.1)',
                            fontSize: 10,
                            color: 'rgba(0,255,136,0.35)',
                            lineHeight: 1.8
                        }}>
                            <div style={{ letterSpacing: 2, marginBottom: 8, color: 'rgba(0,255,136,0.5)' }}>QUICK TIPS</div>
                            <div>▸ Run as Admin for full scan</div>
                            <div>▸ Enable Auto Refresh for live monitoring</div>
                            <div>▸ Click device to see details</div>
                            <div>▸ Check suspicious IPs in reputation checker</div>
                            <div>▸ High threat = Proxy/VPN/Tor detected</div>
                        </div>
                    </div>
                </div>

                <div className="footer">
                    NETWATCH v1.0 — NETWORK THREAT MONITOR — FOR EDUCATIONAL USE ONLY
                </div>
            </div>
        </>
    );
}
