"""Connect the development simulator to the running Mac gateway without clipboard transfer."""
import json
import socket
import subprocess
import sys
import urllib.parse
from pathlib import Path

simulator = sys.argv[1]
root = Path.home() / 'Library/Application Support/atelier-studio/remote'
with socket.socket(socket.AF_UNIX) as channel:
    channel.settimeout(5)
    channel.connect(str(root / 'pair.sock'))
    channel.sendall(b'pair\n')
    chunks = []
    while chunk := channel.recv(4096):
        chunks.append(chunk)
pair = json.loads(b''.join(chunks))
status = json.loads(subprocess.check_output(['/Applications/Tailscale.app/Contents/MacOS/Tailscale', 'status', '--json']))
address = 'https://' + status['Self']['DNSName'].rstrip('.') + ':8443'
link = 'atelier-native://pair?' + urllib.parse.urlencode({'address': address, 'code': pair['code']})
subprocess.run(['xcrun', 'simctl', 'terminate', simulator, 'com.tofunori.atelier.swiftui.preview'], capture_output=True)
subprocess.run(['xcrun', 'simctl', 'launch', simulator, 'com.tofunori.atelier.swiftui.preview', '--pair-link', link], check=True, capture_output=True)
print('Association envoyée au simulateur.')
