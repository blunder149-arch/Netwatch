from flask import Flask, jsonify, request
from flask_cors import CORS
import subprocess
import socket
import uuid
import ctypes
import sys
import requests
import re
import json
import os
from datetime import datetime, timedelta
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

app = Flask(__name__)
CORS(app)

# ─── In-Memory State ────────────────────────────────────────────────────────
device_history = {}
alerts = []
tor_exit_nodes = set()
tor_last_fetched = None
TOR_CACHE_MINUTES = 30
HISTORY_FILE = os.path.join(os.path.dirname(__file__), "device_history.json")

# ─── Load persisted history ──────────────────────────────────────────────────
def load_history():
    global device_history
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r") as f:
                device_history = json.load(f)
    except Exception:
        device_history = {}

def save_history():
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(device_history, f, indent=2)
    except Exception:
        pass

# ─── Utility Functions ───────────────────────────────────────────────────────
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        return False

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "192.168.1.1"

def get_network_prefix():
    local_ip = get_local_ip()
    return ".".join(local_ip.split(".")[:3])

# ─── Parallel Ping Sweep ─────────────────────────────────────────────────────
def ping_single(ip):
    """Ping one IP silently"""
    try:
        subprocess.run(
            ["ping", "-n", "1", "-w", "150", ip],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=1
        )
    except Exception:
        pass

def ping_sweep(network_prefix):
    """Parallel ping sweep across /24 network"""
    ips = [f"{network_prefix}.{i}" for i in range(1, 255)]
    with ThreadPoolExecutor(max_workers=50) as executor:
        executor.map(ping_single, ips)
    time.sleep(0.5)  # Let ARP table settle

# ─── mDNS Unicast Query ───────────────────────────────────────────────────────
def _build_mdns_ptr_query(ip):
    """Build raw DNS PTR query packet for reverse IP lookup"""
    import struct
    parts = ip.split('.')
    name = f"{parts[3]}.{parts[2]}.{parts[1]}.{parts[0]}.in-addr.arpa"
    header = struct.pack('>HHHHHH', 0, 0, 1, 0, 0, 0)
    encoded = b''.join(
        bytes([len(label)]) + label.encode()
        for label in name.split('.')
    ) + b'\x00'
    question = encoded + struct.pack('>HH', 12, 1)  # PTR, IN
    return header + question

def _parse_dns_name(data, offset):
    """Parse DNS name (handles compression pointers)"""
    labels, visited = [], set()
    while offset < len(data):
        if offset in visited:
            break
        visited.add(offset)
        length = data[offset]
        if length == 0:
            offset += 1
            break
        elif (length & 0xC0) == 0xC0:
            ptr = ((length & 0x3F) << 8) | data[offset + 1]
            sub, _ = _parse_dns_name(data, ptr)
            labels.append(sub)
            offset += 2
            break
        else:
            offset += 1
            labels.append(data[offset:offset + length].decode('ascii', errors='ignore'))
            offset += length
    return '.'.join(labels), offset

def query_mdns_unicast(ip, timeout=1.2):
    """Send mDNS PTR query directly to device on port 5353 and parse PTR response"""
    import struct
    try:
        packet = _build_mdns_ptr_query(ip)
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        sock.sendto(packet, (ip, 5353))

        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                data, addr = sock.recvfrom(4096)
                if len(data) < 12:
                    continue
                ancount = struct.unpack('>H', data[6:8])[0]
                if ancount == 0:
                    continue

                # Skip header + question section
                offset = 12
                while offset < len(data) and data[offset] != 0:
                    if (data[offset] & 0xC0) == 0xC0:
                        offset += 2
                        break
                    offset += data[offset] + 1
                else:
                    offset += 1
                offset += 4  # skip qtype + qclass

                # Parse first answer record
                if offset + 10 >= len(data):
                    continue
                _, offset = _parse_dns_name(data, offset)
                rtype = struct.unpack('>H', data[offset:offset + 2])[0]
                offset += 10  # skip type, class, ttl, rdlen

                if rtype == 12 and offset < len(data):  # PTR
                    ptr_name, _ = _parse_dns_name(data, offset)
                    ptr_name = ptr_name.strip('.')
                    # Strip .local suffix
                    if ptr_name.lower().endswith('.local'):
                        ptr_name = ptr_name[:-6]
                    if ptr_name:
                        return ptr_name
            except socket.timeout:
                break
    except Exception:
        pass
    finally:
        try:
            sock.close()
        except Exception:
            pass
    return None

# ─── SSDP / UPnP Discovery ────────────────────────────────────────────────────
_ssdp_cache = {}   # ip -> friendly name
_ssdp_lock  = threading.Lock()

def ssdp_scan(timeout=3):
    """Multicast SSDP M-SEARCH to discover UPnP devices (routers, TVs, printers, etc.)"""
    global _ssdp_cache
    found = {}
    SSDP_ADDR = '239.255.255.250'
    SSDP_PORT = 1900
    msg = (
        'M-SEARCH * HTTP/1.1\r\n'
        f'HOST: {SSDP_ADDR}:{SSDP_PORT}\r\n'
        'MAN: "ssdp:discover"\r\n'
        'MX: 2\r\n'
        'ST: ssdp:all\r\n'
        '\r\n'
    ).encode()

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.settimeout(timeout)
        sock.sendto(msg, (SSDP_ADDR, SSDP_PORT))

        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                data, addr = sock.recvfrom(4096)
                ip   = addr[0]
                text = data.decode('utf-8', errors='ignore')

                # Extract SERVER or friendly name hints
                server_name = None
                for line in text.split('\r\n'):
                    ll = line.lower()
                    if ll.startswith('server:'):
                        val = line.split(':', 1)[1].strip()
                        # Skip generic OS / UPnP strings
                        skip = ['linux', 'windows', 'upnp', 'http', 'miniupnp', 'dlna']
                        if val and not any(s in val.lower() for s in skip):
                            server_name = val
                        break

                if server_name and ip not in found:
                    found[ip] = server_name
            except socket.timeout:
                break
    except Exception as e:
        print(f"[SSDP] {e}")
    finally:
        try:
            sock.close()
        except Exception:
            pass

    with _ssdp_lock:
        _ssdp_cache.update(found)
    print(f"[SSDP] Found {len(found)} UPnP device(s): {list(found.values())}")
    return found

# ─── Hostname Resolution (multi-method) ──────────────────────────────────────

def get_netbios_name(ip):
    """Try NetBIOS name resolution using nbtstat (Windows only)"""
    try:
        result = subprocess.run(
            ["nbtstat", "-A", ip],
            capture_output=True, text=True, timeout=3
        )
        for line in result.stdout.split("\n"):
            # NetBIOS name lines: "    NAME           <00>  UNIQUE  Registered"
            match = re.search(r'^\s+([A-Za-z0-9\-_]{1,15})\s+<00>\s+UNIQUE', line)
            if match:
                return match.group(1).strip()
    except Exception:
        pass
    return None

def get_mdns_name(ip):
    """Try mDNS (.local) resolution"""
    try:
        name = socket.gethostbyaddr(ip)[0]
        if name and name != ip:
            return name
    except Exception:
        pass
    return None

def get_mac_vendor_name(mac):
    """Return vendor name from MAC OUI as fallback"""
    prefix = mac[:8].upper()
    vendor = OUI_MAP.get(prefix, "")
    return f"{vendor} Device" if vendor else None

def is_randomized_mac(mac):
    """Detect locally administered / randomized MAC (bit 1 of first octet set)"""
    try:
        first_byte = int(mac.split(":")[0], 16)
        return bool(first_byte & 0x02)  # Locally administered bit
    except Exception:
        return False

def get_gateway_ip():
    """Get the default gateway IP"""
    try:
        result = subprocess.run(
            ["ipconfig"], capture_output=True, text=True, timeout=5
        )
        match = re.search(r'Default Gateway[.\s]+:\s+(\d+\.\d+\.\d+\.\d+)', result.stdout)
        if match:
            return match.group(1)
    except Exception:
        pass
    # Fallback: assume .1
    return get_network_prefix() + ".1"

_gateway_ip = None
def get_cached_gateway():
    global _gateway_ip
    if _gateway_ip is None:
        _gateway_ip = get_gateway_ip()
    return _gateway_ip

def resolve_hostname(ip, mac):
    """Smart hostname resolution:
    DNS → NetBIOS → mDNS unicast → SSDP cache → MAC-hint → fallback
    """
    # Gateway / Router detection (fast path)
    if ip == get_cached_gateway() or ip.endswith(".1"):
        with _ssdp_lock:
            ssdp_name = _ssdp_cache.get(ip)
        if ssdp_name:
            return f"Router — {ssdp_name}"
        return "Router / Gateway"

    # 1. DNS / reverse lookup
    try:
        name = socket.gethostbyaddr(ip)[0]
        if name and name != ip and not name.endswith(".arpa") and not name.endswith(".0"):
            return name
    except Exception:
        pass

    # 2. NetBIOS (Windows PCs, some Android)
    nb = get_netbios_name(ip)
    if nb:
        return nb

    # 3. mDNS unicast (iPhones, Macs, Linux, some Android with .local names)
    mdns = query_mdns_unicast(ip)
    if mdns:
        return mdns

    # 4. SSDP cache (routers, smart TVs, printers from M-SEARCH)
    with _ssdp_lock:
        ssdp_name = _ssdp_cache.get(ip)
    if ssdp_name:
        return ssdp_name

    # 5. Randomized MAC → privacy MAC phone/tablet
    if is_randomized_mac(mac):
        return "Mobile Device (private MAC)"

    # 6. MAC vendor label
    prefix = mac[:8].upper()
    vendor = OUI_MAP.get(prefix, "")
    if vendor:
        return f"{vendor} Device"

    # 7. Honest fallback
    return f"Device ({ip})"

# ─── ARP Table Reader ─────────────────────────────────────────────────────────
def read_arp_table(network_prefix):
    """Parse ARP table for devices on our subnet"""
    devices = []
    try:
        result = subprocess.run(
            ["arp", "-a"],
            capture_output=True, text=True, timeout=10
        )
        seen_ips = set()
        raw_entries = []

        for line in result.stdout.split("\n"):
            ip_match = re.search(r'(\d+\.\d+\.\d+\.\d+)', line)
            mac_match = re.search(r'([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}', line)

            if ip_match and mac_match:
                ip = ip_match.group(0)
                mac = mac_match.group(0).upper().replace("-", ":")

                if not ip.startswith(network_prefix):
                    continue
                if ip.endswith(".255") or ip.startswith("224.") or ip.startswith("239."):
                    continue
                if "ff:ff:ff:ff:ff:ff" in mac.lower():
                    continue
                if ip in seen_ips:
                    continue

                seen_ips.add(ip)
                raw_entries.append((ip, mac))

        # Resolve hostnames in parallel (faster)
        def resolve_entry(entry):
            ip, mac = entry
            hostname = resolve_hostname(ip, mac)
            return {
                "ip": ip,
                "mac": mac,
                "hostname": hostname,
                "device_type": detect_device_type(mac, hostname),
                "status": "online"
            }

        with ThreadPoolExecutor(max_workers=20) as executor:
            devices = list(executor.map(resolve_entry, raw_entries))

    except Exception as e:
        print(f"[ARP ERROR] {e}")
    return devices

# ─── Device Type Detection ────────────────────────────────────────────────────
# MAC OUI prefix → vendor mapping
OUI_MAP = {
    "00:1A:2B": "Apple", "A4:C3:F0": "Apple", "F0:18:98": "Apple",
    "3C:15:C2": "Apple", "AC:BC:32": "Apple", "B8:27:EB": "Raspberry Pi",
    "DC:A6:32": "Raspberry Pi", "00:50:56": "VMware", "08:00:27": "VirtualBox",
    "00:1B:63": "Apple", "00:1C:B3": "Apple", "00:1D:4F": "Apple",
    "18:65:90": "Apple", "28:CF:E9": "Apple", "3C:D0:F8": "Apple",
    "00:1E:C2": "Apple", "00:26:B9": "Dell", "00:14:22": "Dell",
    "EC:F4:BB": "Xiaomi", "28:6C:07": "Xiaomi", "AC:C1:EE": "Xiaomi",
    "04:CF:8C": "Huawei", "F4:C7:14": "Huawei", "48:00:31": "Huawei",
    "00:90:F5": "TP-Link", "80:EA:96": "TP-Link", "C0:4A:00": "TP-Link",
    "00:18:E7": "Netgear", "10:DA:43": "Netgear", "28:80:88": "Netgear",
    "00:1A:70": "Cisco", "00:1B:54": "Cisco", "00:1C:57": "Cisco",
}

def detect_device_type(mac, hostname):
    h = hostname.lower()
    if any(x in h for x in ['phone', 'android', 'iphone', 'mobile', 'oneplus', 'pixel']):
        return "mobile"
    if any(x in h for x in ['laptop', 'pc', 'desktop', 'computer', 'workstation']):
        return "laptop"
    if any(x in h for x in ['router', 'gateway', 'modem', 'ap-', 'access']):
        return "router"
    if any(x in h for x in ['tv', 'smart', 'firetv', 'roku', 'chromecast']):
        return "tv"
    if any(x in h for x in ['printer', 'print', 'epson', 'hp-', 'canon']):
        return "printer"

    prefix = mac[:8]
    vendor = OUI_MAP.get(prefix, "")
    if vendor in ("Apple",):
        return "apple"
    if "Raspberry" in vendor:
        return "iot"
    if vendor in ("TP-Link", "Netgear", "Cisco", "Huawei"):
        return "router"
    if vendor in ("VMware", "VirtualBox"):
        return "laptop"

    return "unknown"

# ─── Tor Exit Node Cache ──────────────────────────────────────────────────────
def refresh_tor_nodes():
    global tor_exit_nodes, tor_last_fetched
    try:
        r = requests.get(
            "https://check.torproject.org/torbulkexitlist",
            timeout=5
        )
        tor_exit_nodes = set(line.strip() for line in r.text.split('\n') if line.strip())
        tor_last_fetched = datetime.now()
        print(f"[TOR] Fetched {len(tor_exit_nodes)} exit nodes")
    except Exception as e:
        print(f"[TOR] Fetch failed: {e}")

def get_tor_nodes():
    global tor_last_fetched
    if tor_last_fetched is None or \
       datetime.now() - tor_last_fetched > timedelta(minutes=TOR_CACHE_MINUTES):
        threading.Thread(target=refresh_tor_nodes, daemon=True).start()
    return tor_exit_nodes

# ─── IP Reputation ────────────────────────────────────────────────────────────
def check_ip_reputation(ip):
    try:
        r = requests.get(
            f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,city,isp,proxy,hosting,query",
            timeout=4
        )
        d = r.json()
        is_suspicious = d.get('proxy', False) or d.get('hosting', False)
        return {
            "country": d.get('country', 'Unknown'),
            "country_code": d.get('countryCode', ''),
            "city": d.get('city', 'Unknown'),
            "isp": d.get('isp', 'Unknown'),
            "is_proxy": d.get('proxy', False),
            "is_hosting": d.get('hosting', False),
            "is_suspicious": is_suspicious,
            "threat_level": "HIGH" if is_suspicious else "LOW"
        }
    except Exception:
        return {
            "country": "Unknown", "country_code": "", "city": "Unknown",
            "isp": "Unknown", "is_proxy": False, "is_hosting": False,
            "is_suspicious": False, "threat_level": "UNKNOWN"
        }

# ─── API Endpoints ────────────────────────────────────────────────────────────
@app.route('/api/scan', methods=['GET'])
def scan_network():
    global alerts
    network_prefix = get_network_prefix()
    current_time = datetime.now().strftime("%H:%M:%S")

    # Run SSDP + ping sweep in parallel, then read ARP
    ssdp_thread = threading.Thread(target=ssdp_scan, args=(3,), daemon=True)
    ssdp_thread.start()
    ping_sweep(network_prefix)
    ssdp_thread.join(timeout=4)   # Wait up to 4s for SSDP results
    devices = read_arp_table(network_prefix)


    new_alert_count = 0
    for device in devices:
        ip = device['ip']
        fresh_hostname = device['hostname']

        if ip not in device_history:
            new_alert_count += 1
            alerts.insert(0, {
                "id": str(uuid.uuid4()),
                "type": "NEW_DEVICE",
                "message": f"New device: {fresh_hostname} ({ip})",
                "device_type": device['device_type'],
                "time": current_time,
                "severity": "warning"
            })
            device_history[ip] = {
                "first_seen": current_time,
                "hostname": fresh_hostname,
                "mac": device['mac']
            }
        else:
            # Update hostname if new scan found a better name
            old_hostname = device_history[ip].get("hostname", "")
            is_better = (
                fresh_hostname not in ("", "Unknown", f"Device ({ip})")
                and old_hostname in ("", "Unknown", f"Device ({ip})")
            )
            if is_better:
                device_history[ip]["hostname"] = fresh_hostname
            # Always show fresh hostname (never stale)
            device['hostname'] = fresh_hostname

        device['first_seen'] = device_history.get(ip, {}).get('first_seen', current_time)

    alerts = alerts[:30]
    save_history()


    return jsonify({
        "success": True,
        "devices": devices,
        "total": len(devices),
        "local_ip": get_local_ip(),
        "scan_time": current_time,
        "network": network_prefix + ".0/24",
        "new_devices": new_alert_count,
        "is_admin": is_admin()
    })

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    return jsonify({"success": True, "alerts": alerts, "count": len(alerts)})

@app.route('/api/ip-info/<ip>', methods=['GET'])
def get_ip_info(ip):
    rep = check_ip_reputation(ip)
    tor_nodes = get_tor_nodes()
    is_tor = ip in tor_nodes
    if is_tor and rep["threat_level"] != "HIGH":
        rep["threat_level"] = "HIGH"
        rep["is_suspicious"] = True
    return jsonify({
        "success": True,
        "ip": ip,
        "reputation": rep,
        "tor_vpn": {"is_tor": is_tor, "is_vpn": rep.get("is_proxy", False)}
    })

@app.route('/api/myip', methods=['GET'])
def get_my_ip():
    local_ip = get_local_ip()
    return jsonify({
        "success": True,
        "local_ip": local_ip,
        "network": get_network_prefix() + ".0/24",
        "hostname": socket.gethostname(),
        "is_admin": is_admin()
    })

@app.route('/api/clear-alerts', methods=['POST'])
def clear_alerts_ep():
    global alerts
    alerts = []
    return jsonify({"success": True})

@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({
        "success": True,
        "status": "online",
        "is_admin": is_admin(),
        "local_ip": get_local_ip(),
        "network": get_network_prefix() + ".0/24",
        "hostname": socket.gethostname(),
        "tor_nodes_cached": len(tor_exit_nodes),
        "known_devices": len(device_history)
    })

# ─── Startup ─────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    load_history()
    print("=" * 50)
    print("  NETWATCH -- Network Threat Monitor")
    print("=" * 50)
    print(f"  Local IP  : {get_local_ip()}")
    print(f"  Network   : {get_network_prefix()}.0/24")
    print(f"  Hostname  : {socket.gethostname()}")
    print(f"  Admin Mode: {'YES' if is_admin() else 'NO (run as Administrator for full scan)'}")
    print(f"  Known IPs : {len(device_history)}")
    print("  Server    : http://localhost:5000")
    print("=" * 50)
    threading.Thread(target=refresh_tor_nodes, daemon=True).start()
    app.run(debug=False, host='0.0.0.0', port=5000)

