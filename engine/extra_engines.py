"""Local native engines and their explicitly supported conversion routes."""
from functools import lru_cache
import os
from pathlib import Path
import re
import subprocess
from process import ROOT, executable, local_engine

CALIBRE_INPUT = set('azw azw3 azw4 cbz cbr cb7 cbc chm djvu docx epub fb2 html htm htmlz lit lrf mobi odt pdf prc pdb pml rb rtf snb tcr txt'.split())
CALIBRE_OUTPUT = set('azw3 epub docx fb2 htmlz lit lrf mobi pdb rb pdf rtf snb tcr txt'.split())
NATIVE_ARCHIVES = set('arj cab cpio deb dmg img iso lha rpm z tar.z tz'.split())
RAW_IMAGES = set('3fr arw cr2 cr3 crw dcr dng erf k25 kdc mos mrw nef nrw orf pef raf raw rw2 rwl sr2 srf srw x3f'.split())
MAGICK_INPUT = RAW_IMAGES | {'xcf', 'jps'}
MAGICK_OUTPUT = {'psd', 'icns', 'heic', 'heif', 'tif', 'jpe', 'jfif', 'jps', 'eps'}
OFFICE_GROUPS = {
    'document': set('abw doc docm docx dot dotx html htm hwp lwp md odt pages rtf sdw txt wpd wps zabw'.split()),
    'presentation': set('dps key odp pot potx pps ppsx ppt pptm pptx'.split()),
    'spreadsheet': set('csv numbers ods sdc tsv xls xlsm xlsx'.split()),
    'drawing': {'cdr', 'cgm', 'emf', 'vsd', 'wmf'},
}
OFFICE_EXPORTS = {
    'document': {'pdf': 'writer_pdf_Export', 'doc': 'MS Word 97', 'docx': 'Office Open XML Text',
                 'odt': 'writer8', 'rtf': 'Rich Text Format', 'txt': 'Text (encoded)',
                 'html': 'HTML (StarWriter)', 'epub': 'EPUB', 'md': 'Markdown', 'dotx': 'Office Open XML Text Template'},
    'presentation': {'pdf': 'impress_pdf_Export', 'ppt': 'MS PowerPoint 97',
                     'pptx': 'Impress Office Open XML', 'odp': 'impress8',
                     'pps': 'MS PowerPoint 97 AutoPlay', 'ppsx': 'Impress Office Open XML AutoPlay',
                     'pot': 'MS PowerPoint 97 Vorlage', 'potx': 'Impress Office Open XML Template'},
    'spreadsheet': {'pdf': 'calc_pdf_Export', 'xls': 'MS Excel 97', 'xlsx': 'Calc Office Open XML',
                    'ods': 'calc8', 'csv': 'Text - txt - csv (StarCalc)', 'html': 'HTML (StarCalc)'},
    'drawing': {'pdf': 'draw_pdf_Export', 'svg': 'draw_svg_Export', 'png': 'draw_png_Export'},
}

def office_group(source):
    return next((key for key, extensions in OFFICE_GROUPS.items() if source in extensions), None)

def sevenzip_exe():
    return executable('SEVENZIP_PATH', ['7z', '7zz'], [r'C:\Program Files\7-Zip\7z.exe', *local_engine('7zip', '7z.exe')])

def magick_exe():
    return executable('MAGICK_PATH', ['magick'], local_engine('imagemagick', 'magick.exe'))

def magick_environment():
    return {**os.environ, 'MAGICK_CONFIGURE_PATH': str(ROOT / 'engine' / 'imagemagick'), 'MAGICK_THREAD_LIMIT': '2'}

@lru_cache(maxsize=1)
def magick_formats():
    if not magick_exe():
        return {}, {}
    output = subprocess.run([str(magick_exe()), '-list', 'format'], capture_output=True, timeout=20,
                            env=magick_environment(), creationflags=0x08000000 if os.name == 'nt' else 0)
    modes = {}
    for line in output.stdout.decode('utf-8', errors='replace').splitlines():
        match = re.match(r'\s*(\w+)\*?\s+(?:\S+\s+)?([r-][w-][+-])\s', line)
        if match:
            modes[match[1].lower()] = match[2]
    aliases = {'jps': 'jpeg', 'jpe': 'jpeg', 'jfif': 'jpeg', 'tif': 'tiff', 'heif': 'heic'}
    readable = {fmt: aliases.get(fmt, fmt) for fmt in MAGICK_INPUT if modes.get(aliases.get(fmt, fmt), '--').startswith('r')}
    writable = {fmt: aliases.get(fmt, fmt) for fmt in MAGICK_OUTPUT if 'w' in modes.get(aliases.get(fmt, fmt), '--')}
    version = subprocess.run([str(magick_exe()), '-version'], capture_output=True, timeout=20,
                             creationflags=0x08000000 if os.name == 'nt' else 0).stdout.decode('utf-8', errors='replace')
    # External dcraw delegates are deliberately disabled; require linked LibRaw.
    if not re.search(r'Delegates[^\n]*\braw\b', version):
        readable = {fmt: decoder for fmt, decoder in readable.items() if fmt not in RAW_IMAGES}
    return readable, writable

def magick_decode(source, dest, fmt):
    decoder = magick_formats()[0][fmt]
    completed = subprocess.run([str(magick_exe()), f'{decoder}:{source}[0]', str(dest)],
                               capture_output=True, timeout=150, env=magick_environment(),
                               creationflags=0x08000000 if os.name == 'nt' else 0)
    if completed.returncode or not dest.exists():
        raise ValueError('ImageMagick could not decode this image. ' + completed.stderr.decode('utf-8', errors='replace')[-800:])

def magick_encode(source, dest, fmt, quality):
    encoder = magick_formats()[1][fmt]
    completed = subprocess.run([str(magick_exe()), str(source), '-quality', str(quality), f'{encoder}:{dest}'],
                               capture_output=True, timeout=150, env=magick_environment(),
                               creationflags=0x08000000 if os.name == 'nt' else 0)
    if completed.returncode or not dest.exists():
        raise ValueError('ImageMagick could not encode this image. ' + completed.stderr.decode('utf-8', errors='replace')[-800:])
