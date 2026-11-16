"""Isolated PDF jobs. Input JSON on stdin; output metadata JSON on stdout.

All document paths are supplied by the server inside a temporary job directory.
No user-provided command strings are ever executed.
"""
import base64
import difflib
import html
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.request
import urllib.parse
import zipfile
from collections import Counter
from functools import lru_cache

import pymupdf as fitz
from native_job import NativeJob
from office_service import convert_office

ROOT = Path(__file__).resolve().parent.parent


@lru_cache(maxsize=16)
def local_engine(folder, name):
    directory=ROOT / '.runtime' / 'engines' / folder
    for relative in ('', 'program', 'Files/7-Zip', 'Calibre', 'Calibre Portable/Calibre'):
        candidate=directory/relative/name
        if candidate.is_file():return (candidate,)
    return tuple(directory.rglob(name))


def executable(env, names, paths=()):
    explicit = os.environ.get(env)
    if explicit and Path(explicit).is_file():
        return explicit
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    for path in paths:
        if Path(path).is_file():
            return path
    return None


def office_exe():
    return executable('SOFFICE_PATH', ['soffice.com', 'soffice', 'libreoffice'],
                      [r'C:\Program Files\LibreOffice\program\soffice.com', r'C:\Program Files\LibreOffice\program\soffice.exe',
                       *local_engine('libreoffice', 'soffice.com'), *local_engine('libreoffice', 'soffice.exe')])


def office_profile(directory):
    profile=directory/'office-profile'
    template=ROOT/'.runtime'/'office-template'
    # The template is initialized without documents. Clone its extension registry
    # to avoid registering all bundled extensions for every conversion.
    if (template/'.ready').is_file():
        shutil.copytree(template,profile,dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('.ready','.lock','lock','*.tmp'))
    return profile.as_uri()


def run_local(command, cwd=None, timeout=150, env=None):
    worker=subprocess.Popen([str(value) for value in command],cwd=cwd,env=env,
                            stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                            creationflags=0x08000000 if os.name=='nt' else 0)
    family=NativeJob(worker)
    try:
        try:
            stdout,stderr=worker.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            if os.name=='nt':family.terminate()
            else:worker.kill()
            worker.communicate(timeout=10)
            raise ValueError('The local converter exceeded its processing time limit. Try a smaller file.') from None
    finally:
        family.close()
    if worker.returncode:
        message=(stderr or stdout).decode('utf-8',errors='replace')[-1600:]
        raise ValueError('The local converter could not process this file. '+message)
    return stdout


def gs_exe():
    return executable('GHOSTSCRIPT_PATH', ['gs', 'gswin64c'], list(Path(r'C:\Program Files\gs').glob('*/bin/gswin64c.exe')))


def capabilities():
    return {'engine': True, 'office': bool(office_exe()), 'pdfa': bool(gs_exe()),
            'ocr': (ROOT / '.runtime/tessdata/eng.traineddata').exists() or bool(os.environ.get('TESSDATA_PREFIX')),
            'translate': urllib.parse.urlparse(os.environ.get('TRANSLATE_URL','')).hostname in ('localhost','127.0.0.1','::1')}


def open_pdf(path, options):
    doc = fitz.open(path)
    if not doc.is_pdf:
        doc.close()
        raise ValueError('Please upload a valid PDF document.')
    if doc.needs_pass and not doc.authenticate(str(options.get('password', ''))):
        doc.close()
        raise ValueError('This PDF is encrypted. Enter its correct password and try again.')
    if len(doc) > 500:
        doc.close()
        raise ValueError('Please use documents with 500 pages or fewer per job.')
    return doc


def pages(value, count):
    if not str(value or '').strip():
        return list(range(count))
    result = []
    for part in str(value).split(','):
        part = part.strip()
        if re.fullmatch(r'\d+', part):
            result.append(int(part) - 1)
        elif re.fullmatch(r'\d+\s*-\s*\d+', part):
            a, b = map(int, part.split('-'))
            result.extend(range(a - 1, b, 1) if a <= b else range(a - 1, b - 2, -1))
        else:
            raise ValueError('Use page numbers such as 1,3,5-8.')
    if not result or any(p < 0 or p >= count for p in result):
        raise ValueError(f'Page numbers must be between 1 and {count}.')
    if len(result) > 500:
        raise ValueError('Select no more than 500 output pages.')
    return result


def number(options, key, default, low, high):
    value = float(options.get(key, default))
    if not low <= value <= high:
        raise ValueError(f'{key} must be between {low} and {high}.')
    return value


def rgb(options):
    value = str(options.get('color', '#222222')).lstrip('#')
    if not re.fullmatch('[0-9a-fA-F]{6}', value):
        raise ValueError('Choose a valid color.')
    return tuple(int(value[i:i+2], 16) / 255 for i in (0, 2, 4))


def save(doc, dest, **kwargs):
    if not len(doc):
        raise ValueError('The result must contain at least one page.')
    doc.save(dest, garbage=4, deflate=True, **kwargs)
    return dest


def html_pdf(markup, dest):
    # Strip active content and remote/local resource references. Story needs no browser.
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(markup, 'html.parser')
    for node in soup(['script', 'iframe', 'object', 'embed', 'link', 'style', 'img', 'base']):
        node.decompose()
    for node in soup.find_all(True):
        for attr in list(node.attrs):
            if attr.lower().startswith('on') or attr.lower() in ('src', 'href', 'style'):
                del node[attr]
    story = fitz.Story(html=str(soup), user_css='body { font-family: sans-serif; font-size: 11pt; } table { border-collapse:collapse; } td, th { border: 1px solid #ccc; padding: 5px; } h1 { color:#222; }', em=11)
    writer = fitz.DocumentWriter(str(dest))
    rect = fitz.Rect(0, 0, 595, 842)
    more = True
    n = 0
    while more:
        device = writer.begin_page(rect)
        more, _ = story.place(rect + (42, 42, -42, -42))
        story.draw(device)
        writer.end_page()
        n += 1
        if n >= 500:
            writer.close()
            raise ValueError('Document exceeds the 500-page output limit.')
    writer.close()
    return dest


def text_pdf(text, dest, heading=''):
    return html_pdf(f'<h1>{html.escape(heading)}</h1>' + ''.join(f'<p>{html.escape(p)}</p>' for p in text.split('\n')), dest)


def office_pdf(path, dest, tool):
    if path.suffix.lower() in ('.docx', '.pptx', '.xlsx'):
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 10000 or sum(entry.file_size for entry in entries) > 200 * 1024 * 1024:
                raise ValueError('The expanded Office document is too large. Use a smaller file.')
    exe = office_exe()
    fallback_note = ''
    if exe:
        export={'word-pdf':'writer_pdf_Export','excel-pdf':'calc_pdf_Export','powerpoint-pdf':'impress_pdf_Export'}[tool]
        try:
            if convert_office(exe,path,dest,export,run_local,timeout=90):
                return dest,''
            profile = office_profile(dest.parent)
            run_local([exe, f'-env:UserInstallation={profile}', '--headless', '--norestore', '--nodefault', '--convert-to', 'pdf:'+export, '--outdir', dest.parent, path],timeout=90)
            generated = dest.parent / (path.stem + '.pdf')
            if not generated.exists():
                raise ValueError('LibreOffice could not convert this file. Check that it opens correctly.')
            generated.replace(dest)
            return dest, ''
        except ValueError:
            if path.suffix.lower() not in ('.docx','.pptx','.xlsx'):raise
            fallback_note = 'LibreOffice could not finish this document. The local fallback preserved text and tables with reflowed layout; original layout and images may differ.'
    markup = ''
    if tool == 'word-pdf' and path.suffix.lower() == '.docx':
        from docx import Document
        doc = Document(path)
        markup = ''.join(f'<p>{html.escape(p.text)}</p>' for p in doc.paragraphs)
        for table in doc.tables:
            markup += '<table>' + ''.join('<tr>' + ''.join(f'<td>{html.escape(c.text)}</td>' for c in row.cells) + '</tr>' for row in table.rows) + '</table>'
    elif tool == 'powerpoint-pdf' and path.suffix.lower() == '.pptx':
        from pptx import Presentation
        presentation = Presentation(path)
        markup = ''.join(f'<h1>Slide {i+1}</h1>' + ''.join(f'<p>{html.escape(s.text)}</p>' for s in slide.shapes if s.has_text_frame) for i, slide in enumerate(presentation.slides))
    elif tool == 'excel-pdf' and path.suffix.lower() == '.xlsx':
        from openpyxl import load_workbook
        wb = load_workbook(path, read_only=True, data_only=True)
        for sheet in wb:
            markup += f'<h1>{html.escape(sheet.title)}</h1><table>'
            for row in sheet.iter_rows(max_row=min(sheet.max_row, 10000), max_col=min(sheet.max_column, 50), values_only=True):
                markup += '<tr>' + ''.join(f'<td>{html.escape(str(v if v is not None else ""))}</td>' for v in row) + '</tr>'
            markup += '</table>'
        wb.close()
    else:
        raise ValueError('This legacy Office format requires LibreOffice. Install it or upload DOCX, PPTX, or XLSX.')
    return html_pdf(markup, dest), fallback_note or 'Content-based conversion: text and tables are reflowed. Install LibreOffice for original Office layout and images.'


def process(job):
    tool = job['tool']
    options = job.get('options', {})
    paths = [Path(f['path']) for f in job.get('files', [])]
    out = Path(job['directory'])
    dest = out / 'result.pdf'
    note = ''
    if tool == 'capabilities':
        return capabilities()
    if tool == 'html-pdf':
        markup = options.get('html', '') or (paths[0].read_text('utf-8', errors='replace') if paths else '')
        if not markup.strip():
            raise ValueError('Upload an HTML file or paste some HTML first.')
        return result(html_pdf(markup, dest), 'converted.pdf')
    if not paths:
        raise ValueError('Choose a file first.')
    if tool in ('word-pdf', 'powerpoint-pdf', 'excel-pdf'):
        path, note = office_pdf(paths[0], dest, tool)
        return result(path, 'converted.pdf', note)
    if tool in ('jpg-pdf', 'scan'):
        from PIL import Image, ImageOps, ImageEnhance
        doc = fitz.open()
        margin = number(options, 'margin', 24, 0, 150)
        for path in paths:
            im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
            if im.width * im.height > 40_000_000:
                raise ValueError('Images must be smaller than 40 megapixels.')
            if tool == 'scan':
                im = ImageEnhance.Contrast(ImageOps.grayscale(im)).enhance(1.5).convert('RGB')
            stream = io.BytesIO()
            im.save(stream, format='JPEG', quality=92)
            width, height = (842, 595) if options.get('orientation') == 'landscape' else (595, 842)
            page = doc.new_page(width=width, height=height)
            page.insert_image(fitz.Rect(margin, margin, width-margin, height-margin), stream=stream.getvalue())
        return result(save(doc, dest), 'images.pdf')
    doc = open_pdf(paths[0], options)
    selected = pages(options.get('pages'), len(doc))
    if tool == 'inspect':
        thumbs = []
        for index in range(min(len(doc), 60)):
            page = doc[index]
            pix = page.get_pixmap(matrix=fitz.Matrix(0.22, 0.22), alpha=False)
            thumbs.append({'page': index+1, 'image': base64.b64encode(pix.tobytes('png')).decode(), 'width': page.rect.width, 'height': page.rect.height})
        fields = [{'name': w.field_name, 'value': w.field_value, 'type': w.field_type_string} for page in doc for w in (page.widgets() or [])]
        return {'pages': len(doc), 'thumbnails': thumbs, 'fields': fields, 'metadata': doc.metadata}
    if tool == 'merge':
        if len(paths) < 2:
            raise ValueError('Choose at least two PDF files to merge.')
        merged = fitz.open()
        for path in paths:
            with open_pdf(path, options) as source:
                merged.insert_pdf(source, widgets=True)
        if len(merged) > 500:
            raise ValueError('Merged documents may contain no more than 500 pages.')
        return result(save(merged, dest), 'merged.pdf')
    if tool in ('split', 'extract', 'remove', 'organize'):
        if tool == 'remove':
            if not str(options.get('pages', '')).strip():
                raise ValueError('Enter the pages you want to remove.')
            selected = [p for p in range(len(doc)) if p not in selected]
        if tool == 'split' and options.get('splitMode', 'each') == 'each':
            dest = out / 'pages.zip'
            with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as archive:
                for index in selected:
                    part = fitz.open()
                    part.insert_pdf(doc, from_page=index, to_page=index, widgets=True)
                    archive.writestr(f'page-{index+1}.pdf', part.tobytes(garbage=4, deflate=True))
                    part.close()
            return result(dest, 'split-pages.zip')
        if not selected:
            raise ValueError('Keep at least one page in the output PDF.')
        doc.select(selected)
    elif tool == 'compress':
        if options.get('compression') == 'strong':
            compressed = fitz.open()
            for page in doc:
                pix = page.get_pixmap(dpi=100, alpha=False)
                new_page = compressed.new_page(width=page.rect.width, height=page.rect.height)
                new_page.insert_image(new_page.rect, stream=pix.tobytes('jpeg', jpg_quality=55))
            doc = compressed
            note = 'Strong compression rasterizes pages. Text, links, form fields, and accessibility tags are not preserved.'
        save(doc, dest)
        if dest.stat().st_size >= paths[0].stat().st_size:
            shutil.copyfile(paths[0], dest)
            note = 'Your PDF is already well optimized. The original file is returned because compression did not reduce its size.'
        return result(dest, 'compressed.pdf', note)
    elif tool == 'rotate':
        angle = int(number(options, 'angle', 90, 0, 270))
        if angle not in (0, 90, 180, 270):
            raise ValueError('Choose 90, 180, or 270 degrees.')
        for i in selected:
            doc[i].set_rotation((doc[i].rotation + angle) % 360)
    elif tool in ('watermark', 'edit', 'sign', 'page-numbers'):
        text = str(options.get('text', '')).strip()
        size = number(options, 'fontSize', 36 if tool == 'watermark' else 16, 6, 144)
        opacity = number(options, 'opacity', 0.25 if tool == 'watermark' else 1, 0.05, 1)
        x = number(options, 'x', 48, 0, 2000)
        y = number(options, 'y', 72, 0, 2000)
        if tool != 'page-numbers' and not text and not options.get('signature') and options.get('editMode') not in ('image', 'rectangle'):
            raise ValueError('Enter text or draw a signature first.')
        for i in selected:
            page = doc[i]
            if tool == 'page-numbers':
                label = f'{i + int(options.get("start", 1))} / {len(doc)}'
                page.insert_textbox(fitz.Rect(20, page.rect.height-35, page.rect.width-20, page.rect.height-10), label, fontsize=11, align=1, color=rgb(options))
            elif tool == 'watermark':
                box = fitz.Rect(20, page.rect.height/2 - size, page.rect.width-20, page.rect.height/2 + size*2)
                if page.insert_textbox(box, text, fontsize=size, align=1, color=rgb(options), fill_opacity=opacity) < 0:
                    raise ValueError('Watermark text is too long. Reduce the font size or shorten the text.')
            elif (tool == 'sign' and options.get('signature')) or (tool == 'edit' and options.get('editMode') == 'image'):
                source = options.get('signature') if tool == 'sign' else options.get('image')
                if not source:
                    raise ValueError('Choose an image first.')
                raw = base64.b64decode(source.split(',')[-1], validate=True)
                width = number(options, 'width', 180, 10, 1000)
                height = number(options, 'height', 70, 10, 1000)
                page.insert_image(fitz.Rect(x, y, x+width, y+height), stream=raw)
            elif tool == 'edit' and options.get('editMode') == 'rectangle':
                width = number(options, 'width', 180, 10, 1000)
                height = number(options, 'height', 70, 10, 1000)
                page.draw_rect(fitz.Rect(x, y, x+width, y+height), color=rgb(options), width=2)
            else:
                if x >= page.rect.width or y >= page.rect.height:
                    raise ValueError('Text position is outside the page. Use smaller X and Y coordinates.')
                page.insert_text((x, y), text, fontsize=size, fontname='heit' if tool == 'sign' else 'helv', color=rgb(options))
    elif tool == 'crop':
        margin = number(options, 'margin', 24, 0, 500)
        for i in selected:
            page = doc[i]
            rect = page.cropbox + (margin, margin, -margin, -margin)
            if rect.is_empty:
                raise ValueError('The margin is too large for this page.')
            page.set_cropbox(rect)
    elif tool == 'redact':
        words = [t.strip() for t in str(options.get('text', '')).split('\n') if t.strip()]
        if not words:
            raise ValueError('Enter the words or phrases to remove, one per line.')
        count = 0
        for i in selected:
            page = doc[i]
            for word in words:
                for rect in page.search_for(word):
                    page.add_redact_annot(rect, fill=(0, 0, 0))
                    count += 1
            page.apply_redactions(images=2, graphics=1, text=0)
        if count == 0:
            raise ValueError('No matching text was found. Scanned documents need OCR first.')
        doc.set_metadata({})
        doc.del_xml_metadata()
        for name in doc.embfile_names():
            doc.embfile_del(name)
        note = f'Removed {count} matching areas. Review the output for any remaining sensitive content.'
    elif tool == 'protect':
        password = str(options.get('newPassword', ''))
        if len(password) < 6:
            raise ValueError('Use a password with at least 6 characters.')
        return result(save(doc, dest, encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw=password, user_pw=password), 'protected.pdf')
    elif tool == 'unlock':
        return result(save(doc, dest, encryption=fitz.PDF_ENCRYPT_NONE), 'unlocked.pdf')
    elif tool == 'repair':
        note = 'Rebuilt the PDF structure from recoverable content. Review all recovered pages.'
    elif tool == 'pdf-jpg':
        dest = out / 'images.zip'
        with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as archive:
            total = 0
            for i in selected:
                if options.get('imageMode') == 'extract':
                    for j, image in enumerate(doc[i].get_images(full=True)):
                        info = doc.extract_image(image[0])
                        archive.writestr(f'page-{i+1}-image-{j+1}.{info["ext"]}', info['image'])
                        total += 1
                else:
                    pix = doc[i].get_pixmap(dpi=int(number(options, 'dpi', 150, 72, 200)), alpha=False)
                    archive.writestr(f'page-{i+1}.jpg', pix.tobytes('jpeg', jpg_quality=90))
                    total += 1
            if not total:
                raise ValueError('No embedded images were found. Choose Render pages instead.')
        return result(dest, 'pdf-images.zip')
    elif tool == 'pdf-word':
        from docx import Document
        from docx.shared import Inches
        word = Document()
        for index, i in enumerate(selected):
            if index:
                word.add_page_break()
            text = doc[i].get_text('text', sort=True)
            if text.strip():
                for paragraph in text.split('\n'):
                    word.add_paragraph(paragraph)
            else:
                word.add_picture(io.BytesIO(doc[i].get_pixmap(dpi=120).tobytes('png')), width=Inches(6))
        dest = out / 'result.docx'
        word.save(dest)
        return result(dest, 'converted.docx', 'Text is editable. Scanned pages are embedded as images; run OCR first to extract their text. Complex layouts are reflowed.')
    elif tool == 'pdf-powerpoint':
        from pptx import Presentation
        presentation = Presentation()
        first = doc[selected[0]].rect
        presentation.slide_width = int(first.width * 12700)
        presentation.slide_height = int(first.height * 12700)
        for i in selected:
            slide = presentation.slides.add_slide(presentation.slide_layouts[6])
            picture = io.BytesIO(doc[i].get_pixmap(dpi=120).tobytes('png'))
            slide.shapes.add_picture(picture, 0, 0, width=presentation.slide_width, height=presentation.slide_height)
        dest = out / 'result.pptx'
        presentation.save(dest)
        return result(dest, 'converted.pptx', 'Pages are preserved as slide images. Individual text elements are not editable.')
    elif tool == 'pdf-excel':
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
        wb = Workbook()
        wb.remove(wb.active)
        for i in selected:
            sheet = wb.create_sheet(f'Page {i+1}')
            tables = doc[i].find_tables().tables
            rows = [row for table in tables for row in table.extract()] if tables else [[line] for line in doc[i].get_text(sort=True).splitlines()]
            for row in rows:
                sheet.append([str(value or '') for value in row])
            for row in sheet:
                for cell in row:
                    cell.data_type = 's'  # Never execute formulas extracted from untrusted PDFs.
            for cell in sheet[1]:
                cell.font = Font(bold=True, color='FFFFFF')
                cell.fill = PatternFill('solid', fgColor='29976B')
            sheet.column_dimensions['A'].width = 60
        dest = out / 'result.xlsx'
        wb.save(dest)
        return result(dest, 'converted.xlsx', 'Detected tables are extracted. Pages without tables are exported as text rows.')
    elif tool == 'ocr':
        tessdata = os.environ.get('TESSDATA_PREFIX', str(ROOT / '.runtime/tessdata'))
        if not Path(tessdata, 'eng.traineddata').exists():
            raise ValueError('English OCR data is missing. Run npm run setup:engine.')
        ocrdoc = fitz.open()
        for i in range(len(doc)):
            if i in selected:
                pix = doc[i].get_pixmap(dpi=150, colorspace=fitz.csRGB, alpha=False)
                pdfbytes = pix.pdfocr_tobytes(language='eng', tessdata=tessdata, compress=True)
                with fitz.open('pdf', pdfbytes) as part:
                    ocrdoc.insert_pdf(part)
            else:
                ocrdoc.insert_pdf(doc, from_page=i, to_page=i)
        doc = ocrdoc
        note = 'English OCR completed. Recognition accuracy depends on scan quality.'
    elif tool == 'compare':
        if len(paths) != 2:
            raise ValueError('Choose exactly two PDF files to compare.')
        other = open_pdf(paths[1], options)
        original = '\n'.join(f'--- Page {i+1} ---\n{p.get_text(sort=True)}' for i, p in enumerate(doc))
        changed = '\n'.join(f'--- Page {i+1} ---\n{p.get_text(sort=True)}' for i, p in enumerate(other))
        diff = '\n'.join(difflib.unified_diff(original.splitlines(), changed.splitlines(), fromfile='Original', tofile='Revised', lineterm=''))
        dest = out / 'comparison.txt'
        dest.write_text(diff or 'No text changes detected. Visual changes are not compared.', encoding='utf-8')
        return result(dest, 'comparison.txt')
    elif tool == 'forms':
        values = options.get('fields', {})
        if options.get('formMode', 'fill') == 'create':
            field = fitz.Widget()
            field.field_name = str(options.get('fieldName', 'New field')).strip()
            if not field.field_name:
                raise ValueError('Enter a field name.')
            existing = [w.field_name for page in doc for w in (page.widgets() or [])]
            if field.field_name in existing:
                raise ValueError('A field with that name already exists.')
            field.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX if options.get('fieldType') == 'checkbox' else fitz.PDF_WIDGET_TYPE_TEXT
            x, y = number(options, 'x', 48, 0, 2000), number(options, 'y', 72, 0, 2000)
            width = 20 if options.get('fieldType') == 'checkbox' else 220
            field.rect = fitz.Rect(x, y, x+width, y+24)
            field.text_fontsize = 12
            field.border_width = 1
            field.border_color = (0.5, 0.5, 0.5)
            doc[selected[0]].add_widget(field)
        else:
            count = 0
            for page in doc:
                for field in page.widgets() or []:
                    if field.field_name in values:
                        field.field_value = str(values[field.field_name])
                        field.update()
                        count += 1
            if not count:
                raise ValueError('No existing form fields to fill. Switch to Create field to add one.')
    elif tool in ('markdown', 'summarize', 'translate'):
        text = '\n\n'.join(doc[i].get_text(sort=True) for i in selected)
        if not text.strip():
            raise ValueError('This PDF has no extractable text. Run OCR first.')
        if tool == 'markdown':
            dest = out / 'result.md'
            dest.write_text('\n\n'.join(f'## Page {i+1}\n\n{doc[i].get_text(sort=True)}' for i in selected), encoding='utf-8')
            return result(dest, 'document.md', 'Plain text is grouped by page. Complex tables and heading hierarchy may need adjustment.')
        if tool == 'summarize':
            sentences = re.split(r'(?<=[.!?])\s+|\n\s*\n', text)
            stop = set('the a an and or but is are was were to of in for with on at as by it this that from be has have not'.split())
            counts = Counter(w for w in re.findall(r'\b[a-z]{3,}\b', text.lower()) if w not in stop)
            ranked = sorted(range(len(sentences)), key=lambda i: sum(counts[w] for w in re.findall(r'\b[a-z]{3,}\b', sentences[i].lower())) / max(len(sentences[i].split()) ** 0.6, 1), reverse=True)
            chosen = sorted(ranked[:int(number(options, 'sentences', 5, 1, 20))])
            summary = '# Document summary\n\n' + '\n\n'.join('- ' + sentences[i].strip().replace('\n', ' ') for i in chosen)
            dest = out / 'summary.md'
            dest.write_text(summary, encoding='utf-8')
            return result(dest, 'summary.md', 'Extractive summary: sentences are selected from the document, not generated by AI.')
        endpoint = os.environ.get('TRANSLATE_URL')
        if not endpoint:
            raise ValueError('Translation needs a LibreTranslate service. Set TRANSLATE_URL on the server and restart.')
        if urllib.parse.urlparse(endpoint).hostname not in ('localhost','127.0.0.1','::1'):
            raise ValueError('Only a LibreTranslate service on this computer is allowed. External uploads are disabled.')
        if len(text) > 50000:
            raise ValueError('Translate up to 50,000 characters per job. Select fewer pages.')
        payload = {'q': text, 'source': 'auto', 'target': options.get('language', 'es'), 'format': 'text'}
        if os.environ.get('TRANSLATE_API_KEY'):
            payload['api_key'] = os.environ['TRANSLATE_API_KEY']
        req = urllib.request.Request(endpoint.rstrip('/') + '/translate', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=60) as response:
            translated = json.load(response)['translatedText']
        return result(text_pdf(translated, dest, 'Translated document'), 'translated.pdf', 'Translated text is reflowed into a new document.')
    elif tool == 'pdfa':
        exe = gs_exe()
        if not exe:
            raise ValueError('PDF/A needs Ghostscript. Install it and set GHOSTSCRIPT_PATH if it is not on PATH.')
        # Ghostscript locates its bundled PDFA_def.ps / ICC profile via its resource path.
        args = [str(exe), '-dPDFA=2', '-dBATCH', '-dNOPAUSE', '-dSAFER', '-sDEVICE=pdfwrite', '-sColorConversionStrategy=RGB', '-dPDFACompatibilityPolicy=1', f'-sOutputFile={dest}', str(paths[0])]
        completed = subprocess.run(args, capture_output=True, timeout=100)
        if completed.returncode or not dest.exists():
            raise ValueError('Ghostscript could not create PDF/A from this document.')
        return result(dest, 'archive.pdf', 'Converted with Ghostscript PDF/A-2 settings. Run veraPDF to verify conformance for your archival requirements.')
    else:
        raise ValueError('Unknown PDF operation.')
    return result(save(doc, dest), f'{tool}.pdf', note)


def result(path, name, note=''):
    return {'path': str(path), 'name': name, 'note': note, 'size': path.stat().st_size}


if __name__ == '__main__':
    try:
        job = json.load(sys.stdin)
        answer = process(job)
        print(json.dumps({'ok': True, **answer}))
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc) or 'Unable to process this document.'}))
        sys.exit(1)
