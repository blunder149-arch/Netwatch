# 🛡️ NETWATCH — Network Threat Monitor

A real-time **network security dashboard** built with Python Flask + React. Scan your WiFi network, detect devices, identify threats, and monitor live alerts.

![NETWATCH Dashboard](https://img.shields.io/badge/NETWATCH-v1.0-00ff88?style=for-the-badge&logo=shield&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.8+-blue?style=for-the-badge&logo=python)
![React](https://img.shields.io/badge/React-Vite-61DAFB?style=for-the-badge&logo=react)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📡 **Network Scan** | ARP + parallel ping sweep to find all connected devices |
| 🏷️ **Device Names** | DNS, NetBIOS, mDNS unicast, SSDP/UPnP multi-method resolution |
| 📱 **Device Type** | Router / PC / Mobile / Smart TV / Printer detection |
| 🔍 **IP Reputation** | Check any IP via ip-api.com (free, no key needed) |
| 🧅 **Tor Detection** | Check if IP is a Tor exit node |
| ⚠️ **Live Alerts** | Alert when a new device joins your network |
| 🔄 **Auto Refresh** | Live monitoring every 30 seconds |
| 📱 **Responsive UI** | Works on mobile, tablet, and desktop |

---

## 🖥️ Screenshots

> Cyberpunk-themed dark dashboard with real-time network data

---

## 📁 Project Structure

```
netwatch/
├── backend/
│   ├── app.py              ← Flask API server
│   └── requirements.txt    ← Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx         ← React Dashboard
│   │   └── App.css         ← Cyberpunk styles
│   ├── index.html
│   └── package.json
└── start.bat               ← One-click launcher (Windows)
```

---

## ⚙️ Setup & Run

### Prerequisites
- Python 3.8+
- Node.js 18+

### 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

**Run as Administrator** (required for ARP scan):
```bash
python app.py
```

Backend starts at: `http://localhost:5000`

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend starts at: `http://localhost:5173`

### ⚡ One-Click Launch (Windows)

Right-click `start.bat` → **Run as Administrator**

This opens both backend and frontend automatically.

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scan` | GET | Scan network, return all devices |
| `/api/alerts` | GET | Get live alerts |
| `/api/ip-info/<ip>` | GET | IP reputation + Tor check |
| `/api/status` | GET | Backend health check |
| `/api/clear-alerts` | POST | Clear all alerts |

---

## 🧠 How Device Names Work

NETWATCH uses a multi-method approach:

1. **DNS** — Reverse DNS lookup
2. **NetBIOS** — `nbtstat -A` (Windows PCs)
3. **mDNS Unicast** — Direct query to port 5353 (iPhones, Macs)
4. **SSDP/UPnP** — Multicast discovery (Smart TVs, Routers)
5. **MAC OUI** — Vendor identification from MAC prefix
6. **Randomized MAC** — Detected as "Mobile Device (private MAC)"

---

## ⚠️ Important Notes

- **Use only on your own network** — unauthorized scanning is illegal
- **Admin/root required** for full ARP scan on Windows
- **Educational purpose** — not for production security use

---

## 🛠️ Tech Stack

- **Backend**: Python, Flask, Flask-CORS
- **Frontend**: React, Vite, Vanilla CSS
- **APIs**: ip-api.com (IP reputation), Tor Project (exit nodes)
- **Protocols**: ARP, NetBIOS, mDNS, SSDP/UPnP

---

## 📄 License

MIT License — Free for educational use.

---

> Made with 🛡️ for network security awareness
