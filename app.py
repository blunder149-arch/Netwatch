from flask import Flask, jsonify
from flask_cors import CORS
import subprocess
import socket
import uuid
import platform
import requests
import re
from datetime import datetime
import threading
import time

app = Flask(__name__)
CORS(app)

# Store device history
device_history = {}
alerts = []

def get_local_ip():
    """Get local machine IP"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "192.168.1.1"

def get_network_prefix():
    """Get network prefix like 192.168.1"""
    local_ip = get_local_ip()
    parts = local_ip.split(".")
    return ".".join(parts[:3])

def arp_scan_windows():
    """Scan network using ARP on Windows"""
    devices = []
    try:
        network_prefix = get_network_prefix()
        
        # Ping sweep to populate ARP table
        for i in range(1, 255):
            ip = f"{network_prefix}.{i}"
            subprocess.Popen(
                ["ping", "-n", "1", "-w", "100", ip],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        
        time.sleep(2)
        
        # Read ARP table
        result = subprocess.run(
            ["arp", "-a"],
            capture_output=True,
            text=True
        )
        
        lines = result.stdout.split("\n")
        for line in lines:
            # Match IP and MAC pattern
            ip_match = re.search(r'(\d+\.\d+\.\d+\.\d+)', line)
            mac_match = re.search(r'([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})', line)
            
            if ip_match and mac_match:
                ip = ip_match.group(0)
                mac = mac_match.group(0)
                
                # Skip broadcast and multicast
                if ip.endswith('.255') or ip.startswith('224.') or ip.startswith('239.'):
                    continue
                
                # Try to get hostname
                try:
                    hostname = socket.gethostbyaddr(ip)[0]
                except:
                    hostname = "Unknown Device"
                
                # Detect device type from MAC
                device_type = detect_device_type(mac, hostname)
                
                devices.append({
                    "ip": ip,
                    "mac": mac.upper(),
                    "hostname": hostname,
                    "device_type": device_type,
                    "status": "online"
                })
        
    except Exception as e:
        print(f"Scan error: {e}")
    
    return devices

def detect_device_type(mac, hostname):
    """Detect device type from MAC prefix or hostname"""
    hostname_lower = hostname.lower()
    
    if any(x in hostname_lower for x in ['phone', 'android', 'iphone', 'mobile']):
        return "📱 Mobile"
    elif any(x in hostname_lower for x in ['laptop', 'pc', 'desktop', 'computer']):
        return "💻 PC/Laptop"
    elif any(x in hostname_lower for x in ['router', 'gateway', 'modem']):
        return "📡 Router"
    elif any(x in hostname_lower for x in ['tv', 'smart', 'samsung', 'lg']):
        return "📺 Smart TV"
    elif any(x in hostname_lower for x in ['printer', 'print']):
        return "🖨️ Printer"
    
    # MAC prefix detection (first 3 bytes = OUI)
    mac_prefix = mac.upper().replace('-', ':')[:8]
    
    apple_prefixes = ['00:1A:2B', 'A4:C3:F0', 'F0:18:98', '3C:15:C2', 'AC:BC:32']
    if any(mac_prefix.startswith(p) for p in apple_prefixes):
        return "🍎 Apple Device"
    
    return "🔌 Unknown Device"

def check_ip_reputation(ip):
    """Check IP reputation using ip-api.com (free)"""
    try:
        response = requests.get(f"http://ip-api.com/json/{ip}?fields=status,country,city,isp,proxy,hosting", timeout=3)
        data = response.json()
        
        is_suspicious = data.get('proxy', False) or data.get('hosting', False)
        
        return {
            "country": data.get('country', 'Unknown'),
            "city": data.get('city', 'Unknown'),
            "isp": data.get('isp', 'Unknown'),
            "is_proxy": data.get('proxy', False),
            "is_hosting": data.get('hosting', False),
            "is_suspicious": is_suspicious,
            "threat_level": "HIGH" if is_suspicious else "LOW"
        }
    except:
        return {
            "country": "Unknown",
            "city": "Unknown", 
            "isp": "Unknown",
            "is_proxy": False,
            "is_hosting": False,
            "is_suspicious": False,
            "threat_level": "UNKNOWN"
        }

def check_tor_vpn(ip):
    """Check if IP is Tor exit node or VPN"""
    try:
        # Check Tor exit node list
        tor_response = requests.get(
            f"https://check.torproject.org/torbulkexitlist",
            timeout=3
        )
        tor_ips = tor_response.text.split('\n')
        is_tor = ip in tor_ips
        return {"is_tor": is_tor, "is_vpn": False}
    except:
        return {"is_tor": False, "is_vpn": False}

@app.route('/api/scan', methods=['GET'])
def scan_network():
    """Main network scan endpoint"""
    global device_history, alerts
    
    devices = arp_scan_windows()
    current_time = datetime.now().strftime("%H:%M:%S")
    
    # Check for new devices and generate alerts
    for device in devices:
        ip = device['ip']
        if ip not in device_history:
            # New device detected!
            alerts.insert(0, {
                "id": str(uuid.uuid4()),
                "type": "NEW_DEVICE",
                "message": f"New device connected: {device['hostname']} ({ip})",
                "time": current_time,
                "severity": "warning"
            })
            device_history[ip] = {
                "first_seen": current_time,
                "hostname": device['hostname']
            }
        
        device['first_seen'] = device_history.get(ip, {}).get('first_seen', current_time)
    
    # Keep only last 20 alerts
    alerts = alerts[:20]
    
    return jsonify({
        "success": True,
        "devices": devices,
        "total": len(devices),
        "local_ip": get_local_ip(),
        "scan_time": current_time,
        "network": get_network_prefix() + ".0/24"
    })

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    """Get all alerts"""
    return jsonify({
        "success": True,
        "alerts": alerts
    })

@app.route('/api/ip-info/<ip>', methods=['GET'])
def get_ip_info(ip):
    """Get detailed IP information"""
    reputation = check_ip_reputation(ip)
    tor_vpn = check_tor_vpn(ip)
    
    return jsonify({
        "success": True,
        "ip": ip,
        "reputation": reputation,
        "tor_vpn": tor_vpn
    })

@app.route('/api/myip', methods=['GET'])
def get_my_ip():
    """Get current machine network info"""
    local_ip = get_local_ip()
    reputation = check_ip_reputation(local_ip)
    
    return jsonify({
        "success": True,
        "local_ip": local_ip,
        "network": get_network_prefix() + ".0/24",
        "hostname": socket.gethostname(),
        "reputation": reputation
    })

@app.route('/api/clear-alerts', methods=['POST'])
def clear_alerts():
    """Clear all alerts"""
    global alerts
    alerts = []
    return jsonify({"success": True, "message": "Alerts cleared"})

if __name__ == '__main__':
    print("🛡️  Network Threat Monitor Backend Starting...")
    print(f"📡 Local IP: {get_local_ip()}")
    print(f"🌐 Network: {get_network_prefix()}.0/24")
    print("⚠️  Run as Administrator for full scanning!")
    print("🚀 Server running on http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
