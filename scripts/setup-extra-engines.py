"""Install additional local converters inside this project; no document uploads."""
from pathlib import Path
import hashlib
import os
import subprocess
import urllib.request
import re
import time
import sys
import py7zr

ROOT = Path(__file__).resolve().parent.parent
PACKAGES = ROOT / '.runtime' / 'downloads'
ENGINES = ROOT / '.runtime' / 'engines'
PACKAGES.mkdir(parents=True, exist_ok=True)
ENGINES.mkdir(parents=True, exist_ok=True)
FLAGS = 0x08000000 if os.name == 'nt' else 0

def download(url, filename, sha256=None):
    target = PACKAGES / filename
    if not target.exists():
        print('Downloading ' + filename, flush=True)
        temporary = target.with_suffix(target.suffix + '.part')
        offset=temporary.stat().st_size if temporary.exists() else 0
        total=None
        while total is None or offset < total:
            end=offset + 8*1024*1024 - 1
            for attempt in range(3):
                try:
                    request=urllib.request.Request(url, headers={'Range':f'bytes={offset}-{end}', 'User-Agent':'PDF-Studio-Local-Setup'})
                    with urllib.request.urlopen(request,timeout=45) as response:
                        match=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',response.headers.get('Content-Range',''))
                        if not match or int(match[1])!=offset:
                            raise RuntimeError('Server did not return the requested download range.')
                        total=int(match[3]);expected=int(match[2])-offset+1
                        data=response.read(expected+1)
                        if len(data)!=expected:raise RuntimeError('Incomplete download segment.')
                    with temporary.open('ab') as output:output.write(data)
                    offset+=len(data)
                    print(f'{filename}: {offset//(1024*1024)} / {total//(1024*1024)} MB',flush=True)
                    break
                except Exception:
                    if attempt==2:raise
                    time.sleep(2)
        temporary.replace(target)
    if sha256 and hashlib.file_digest(target.open('rb'), 'sha256').hexdigest() != sha256:
        raise RuntimeError('Downloaded package checksum mismatch: ' + filename)
    return target

def extract_msi(package, name, executable):
    destination = ENGINES / name
    if any(destination.rglob(executable)):
        print(name + ' already present.', flush=True)
        return
    print('Extracting ' + name + ' locally (no system installation).', flush=True)
    completed = subprocess.run(['msiexec.exe', '/a', str(package), '/qn',
                                'TARGETDIR=' + str(destination), '/L*v',
                                str(PACKAGES / (name + '-extract.log'))],
                               creationflags=FLAGS, timeout=600)
    if completed.returncode not in (0, 3010) or not any(destination.rglob(executable)):
        raise RuntimeError(f'{name} extraction failed ({completed.returncode}); see .runtime/downloads/{name}-extract.log')
    print(name + ' ready.', flush=True)

if __name__ == '__main__':
    package = download('https://mirror.freedif.org/TDF/libreoffice/stable/26.8.3/win/x86_64/LibreOffice_26.8.3_Win_x86-64.msi',
                       'LibreOffice_26.8.3_Win_x86-64.msi', '0e6918c273eabbdbbd800ee0dacbbf130a14c13c2e4cec861b06dd59e015bf94')
    extract_msi(package, 'libreoffice', 'soffice.exe')
    package = download('https://github.com/ip7z/7zip/releases/download/26.06/7z2606-x64.msi', '7z2606-x64.msi')
    extract_msi(package, '7zip', '7z.exe')
    package = download('https://download.calibre-ebook.com/9.18.0/calibre-portable-installer-9.18.0.exe',
                       'calibre-portable-installer-9.18.0.exe')
    # Calibre Portable enforces a short installation path on Windows.
    calibre_directory = ENGINES / 'c'
    calibre_directory.mkdir(parents=True, exist_ok=True)
    if not any(calibre_directory.rglob('ebook-convert.exe')):
        print('Extracting Calibre portable.', flush=True)
        subprocess.run([str(package), str(calibre_directory)], creationflags=FLAGS, check=True, timeout=600)
    if not any(calibre_directory.rglob('ebook-convert.exe')):
        raise RuntimeError('Calibre portable executable not found.')
    print('Calibre ready.', flush=True)
    package = download('https://download.imagemagick.org/archive/binaries/ImageMagick-7.1.2-35-portable-Q16-x64.7z',
                       'ImageMagick-7.1.2-35-portable-Q16-x64.7z')
    if not (ENGINES / 'imagemagick' / '.ready').exists():
        print('Extracting ImageMagick portable.', flush=True)
        sevenzip=next((ENGINES/'7zip').rglob('7z.exe'))
        subprocess.run([str(sevenzip),'x','-y','-bso0','-bsp0',f'-o{ENGINES / "imagemagick"}',str(package)],
                       creationflags=FLAGS,check=True,timeout=300)
        (ENGINES / 'imagemagick' / '.ready').write_text('ImageMagick 7.1.2-35',encoding='utf-8')
    print('All additional engines are installed locally.', flush=True)
    subprocess.run([sys.executable,str(ROOT/'scripts'/'warm-office.py')],check=True,creationflags=FLAGS,timeout=660)
    office=next((ENGINES/'libreoffice').rglob('soffice.com'))
    subprocess.run([sys.executable,str(ROOT/'engine'/'office_service.py'),'--start',str(office)],check=True,creationflags=FLAGS,timeout=660)
