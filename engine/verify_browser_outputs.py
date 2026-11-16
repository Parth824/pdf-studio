from pathlib import Path
import pymupdf as fitz
import zipfile
import rarfile
from PIL import Image

directory=Path(__file__).resolve().parent.parent/'test-output'
with fitz.open(directory/'merged-browser.pdf') as doc:
    assert len(doc)==5, 'Merged browser download must contain five pages'
    assert 'Project brief' in doc[0].get_text()
    assert 'Appendix' in doc[3].get_text()
    doc[0].get_pixmap(dpi=90).save(directory/'merged-page.png')
with fitz.open(directory/'protected-browser.pdf') as doc:
    assert doc.needs_pass, 'Protected browser download must be encrypted'
    assert not doc.authenticate('wrong-password')
    assert doc.authenticate('browser-secret')
    assert len(doc)==3
print('PASS: Browser downloads have the correct page order, content, and encryption.')
rarfile.UNRAR_TOOL=r'C:\Program Files\WinRAR\UnRAR.exe'
with rarfile.RarFile(directory/'browser-archive.rar') as archive:
    assert archive.read('notes.txt')==b'ZIP to RAR browser conversion test.'
with zipfile.ZipFile(directory/'browser-bundle.zip') as archive:
    assert archive.testzip() is None
    assert archive.read(archive.namelist()[0]).startswith(b'Rar!')
with Image.open(directory/'browser-image.webp') as image:
    assert image.format=='WEBP'
    assert image.width==320
print('PASS: Browser archive, batch ZIP checksum, and resized WebP outputs are valid.')
