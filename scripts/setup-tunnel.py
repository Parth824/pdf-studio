"""Install a checksum-verified, project-local Windows Cloudflare Tunnel client."""
import hashlib
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parent.parent
VERSION='2026.11.0'
SHA256='d5c1d82031da6253dcdcff64c944cd0fe063016edeb2e4fd088075fc9bd52d0a'
target=ROOT/'.runtime'/'tools'/'cloudflared.exe'
target.parent.mkdir(parents=True,exist_ok=True)
def digest(file):
    with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
if not target.exists() or digest(target)!=SHA256:
    pending=target.with_suffix('.download')
    urllib.request.urlretrieve(f'https://github.com/cloudflare/cloudflared/releases/download/{VERSION}/cloudflared-windows-amd64.exe',pending)
    if digest(pending)!=SHA256:raise SystemExit('Cloudflared checksum mismatch; not starting.')
    pending.replace(target)
print('Cloudflared download verified (SHA-256).')
