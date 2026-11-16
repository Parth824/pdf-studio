"""Local-only, capability-aware conversion. No network APIs or remote URLs."""
import bz2
import csv
import gzip
import html
import importlib.util
import io
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import threading
import time
import zipfile

import pymupdf as fitz
from PIL import Image, ImageOps
from process import ROOT, office_exe, office_profile, run_local, executable, local_engine, html_pdf, text_pdf, result, process as pdf_process
from extra_engines import (CALIBRE_INPUT, CALIBRE_OUTPUT, NATIVE_ARCHIVES, OFFICE_EXPORTS,
                           office_group, sevenzip_exe, magick_exe, magick_formats, magick_decode, magick_encode)
from office_service import convert_office

CATALOG = json.loads((ROOT/'lib/conversion-formats.json').read_text())
IMAGE_INPUT = set('avif bmp gif heic heif icns ico jfif jpe jpeg jpg png ppm psd tif tiff webp'.split())
IMAGE_OUTPUT = set('avif bmp gif ico jpeg jpg png ppm tiff webp pdf'.split())
AUDIO_INPUT = set('aac ac3 aif aiff amr au caf flac m4a m4b m4r mp3 oga ogg opus voc wav wma'.split())
AUDIO_OUTPUT = set('aac ac3 aiff au caf flac m4a m4b m4r mp3 oga ogg opus wav wma'.split())
VIDEO_INPUT = set(CATALOG['Video']) - {'swf', 'cavs', 'dvr'}
VIDEO_OUTPUT = set('mp4 mov mkv webm avi m4v flv gif ogv mpeg mpg ts wmv 3gp'.split())
ARCHIVE_INPUT = set('7z zip jar rar tar tar.gz tar.bz2 tar.bz tar.xz tgz tbz tbz2 gz bz2 bz xz lzma'.split())
ARCHIVE_OUTPUT = set('7z zip rar tar tar.gz tar.bz2 tar.xz gz bz2 xz'.split())
FONT_FORMATS = {'ttf','otf','woff','woff2'}
MAX_EXPANDED = 200 * 1024 * 1024


def ffmpeg_exe():
    return executable('FFMPEG_PATH', ['ffmpeg'], [r'C:\ffmpeg\bin\ffmpeg.exe'])


def rar_exe():
    return executable('RAR_PATH', ['rar'], [r'C:\Program Files\WinRAR\Rar.exe'])


def calibre_exe():
    return executable('CALIBRE_PATH', ['ebook-convert'], [r'C:\Program Files\Calibre2\ebook-convert.exe', *local_engine('calibre', 'ebook-convert.exe'), *local_engine('c', 'ebook-convert.exe')])


def available(module):
    return importlib.util.find_spec(module) is not None


def engines():
    return {'pillow':True,'pdf':True,'ffmpeg':bool(ffmpeg_exe()),'rar':bool(rar_exe()),'sevenzip':available('py7zr'),
            'fonts':available('fontTools'),'cad':available('ezdxf'),'office':bool(office_exe()),'calibre':bool(calibre_exe()),
            'archive_native':bool(sevenzip_exe()), 'imagemagick':bool(magick_exe())}


def routes(source, caps):
    outputs = set()
    image_reads, image_writes = magick_formats() if caps.get('imagemagick') else ({}, {})
    if source in IMAGE_INPUT or source in image_reads:
        outputs |= IMAGE_OUTPUT | set(image_writes)
    if source in AUDIO_INPUT and caps['ffmpeg']:
        outputs |= AUDIO_OUTPUT
    if source in VIDEO_INPUT and caps['ffmpeg']:
        outputs |= VIDEO_OUTPUT | AUDIO_OUTPUT
    if (source in ARCHIVE_INPUT or (source in NATIVE_ARCHIVES and caps.get('archive_native'))) and (source != 'rar' or caps['rar']) and (source != '7z' or caps['sevenzip']):
        outputs |= ARCHIVE_OUTPUT - ({'rar'} if not caps['rar'] else set()) - ({'7z'} if not caps['sevenzip'] else set())
    if source in FONT_FORMATS and caps['fonts']:
        outputs |= ({'woff','woff2'} if source in ('ttf','otf') else FONT_FORMATS)
    if source == 'dxf' and caps['cad']:
        outputs |= {'svg','pdf','png'}
    if source in {'svg','svgz'}:
        outputs |= {'pdf','png','jpg','webp'}
    if source == 'pdf':
        outputs |= {'docx','pptx','xlsx','png','jpg','webp','tiff','svg','txt','html','md'}
    if source in {'txt','md','html','htm','epub','fb2','cbz'}:
        outputs |= {'pdf','txt','html','epub'}
    if source in {'docx','pptx','xlsx'}:
        outputs.add('pdf')
    if source == 'docx':
        outputs |= {'txt','html','epub'}
    if source in {'csv','tsv','xlsx'}:
        outputs |= {'csv','tsv','xlsx','pdf','html'}
    group = office_group(source)
    if caps['office'] and group:
        outputs |= set(OFFICE_EXPORTS[group])
    if caps['calibre'] and source in CALIBRE_INPUT:
        outputs |= CALIBRE_OUTPUT
    return sorted(outputs - {source})


def catalog():
    caps = engines()
    formats = sorted({fmt for group in CATALOG.values() for fmt in group})
    return {'engines':caps,'categories':CATALOG,'routes':{fmt:routes(fmt,caps) for fmt in formats},'localOnly':True}


def run(command, cwd=None, timeout=150, env=None):
    return run_local(command,cwd=cwd,timeout=timeout,env=env)


def checked_name(name):
    clean=name.replace('\\','/')
    parts=PurePosixPath(clean).parts
    if not clean or clean.startswith('/') or ':' in clean or any(p in ('..','') for p in parts):
        raise ValueError('Archive contains an unsafe path.')
    return clean


def bounded_copy(source, destination, remaining):
    written=0
    with open(destination,'wb') as target:
        while True:
            chunk=source.read(1024*1024)
            if not chunk:break
            written+=len(chunk)
            if written>remaining:raise ValueError('Expanded archive exceeds the 200 MB limit.')
            target.write(chunk)
    return written


def native_archive_extract(source, folder):
    """Read each member via stdout; never let a native extractor write file paths."""
    exe=sevenzip_exe()
    listing=subprocess.run([str(exe),'l','-slt','-ba','-sccUTF-8','--',str(source)],capture_output=True,timeout=30,
                           creationflags=0x08000000 if os.name=='nt' else 0)
    if listing.returncode:raise ValueError('7-Zip could not read this archive.')
    entries=[]
    for block in re.split(r'\r?\n\s*\r?\n',listing.stdout.decode('utf-8',errors='strict').strip()):
        fields=dict(line.split(' = ',1) for line in block.splitlines() if ' = ' in line)
        if 'Path' in fields:entries.append(fields)
    if len(entries)>2000:raise ValueError('Archives may contain at most 2,000 entries.')
    total=0
    deadline=time.monotonic()+120
    for entry in entries:
        name=checked_name(entry['Path'])
        if any(entry.get(key) for key in ('Symbolic Link','Hard Link')) or re.search(r'(?:^|\s)l[rwx-]{9}',entry.get('Attributes','')):
            raise ValueError('Archive links are not supported.')
        if entry.get('Encrypted')=='+':raise ValueError('Unlock the encrypted archive before conversion.')
        target=folder/name
        if entry.get('Folder')=='+' or entry.get('Attributes','').startswith('D'):
            target.mkdir(parents=True,exist_ok=True);continue
        size=int(entry.get('Size','0') or '0')
        if size<0 or size>MAX_EXPANDED-total:raise ValueError('Expanded archive exceeds the 200 MB limit.')
        target.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryFile() as errors:
            worker=subprocess.Popen([str(exe),'x','-so','-y','-spd','--',str(source),entry['Path']],
                                    stdout=subprocess.PIPE,stderr=errors,stdin=subprocess.DEVNULL,
                                    creationflags=0x08000000 if os.name=='nt' else 0)
            remaining=deadline-time.monotonic()
            if remaining<=0:
                worker.kill();worker.wait();worker.stdout.close()
                raise ValueError('Archive extraction exceeded its time limit.')
            timer=threading.Timer(remaining,worker.kill);timer.start()
            try:
                total+=bounded_copy(worker.stdout,target,MAX_EXPANDED-total)
                if worker.wait(timeout=5):raise ValueError('7-Zip could not extract this archive entry.')
            finally:
                timer.cancel()
                if worker.poll() is None:worker.kill();worker.wait()
                worker.stdout.close()


def archive_convert(source, dest, fmt, src=None):
    folder=dest.parent/'extracted'
    folder.mkdir()
    total=0
    if src in NATIVE_ARCHIVES or (src=='7z' and sevenzip_exe()):
        native_archive_extract(source,folder)
    elif zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as archive:
            if len(archive.infolist())>2000:raise ValueError('Archives may contain at most 2,000 entries.')
            for entry in archive.infolist():
                name=checked_name(entry.filename)
                if ((entry.external_attr>>16)&0o170000)==0o120000:raise ValueError('Archive links are not supported.')
                target=folder/name
                if entry.is_dir():target.mkdir(parents=True,exist_ok=True);continue
                target.parent.mkdir(parents=True,exist_ok=True)
                with archive.open(entry) as content:total+=bounded_copy(content,target,MAX_EXPANDED-total)
    elif tarfile.is_tarfile(source):
        with tarfile.open(source) as archive:
            for i,entry in enumerate(archive):
                if i>=2000:raise ValueError('Archives may contain at most 2,000 entries.')
                name=checked_name(entry.name)
                target=folder/name
                if entry.isdir():target.mkdir(parents=True,exist_ok=True);continue
                if not entry.isfile():raise ValueError('Archive links and special files are not supported.')
                target.parent.mkdir(parents=True,exist_ok=True)
                with archive.extractfile(entry) as content:total+=bounded_copy(content,target,MAX_EXPANDED-total)
    elif source.suffix.lower()=='.rar':
        import rarfile
        unrar=executable('UNRAR_PATH',['unrar'],[r'C:\Program Files\WinRAR\UnRAR.exe'])
        if not unrar:raise ValueError('RAR extraction requires the local UnRAR program.')
        rarfile.UNRAR_TOOL=str(unrar)
        with rarfile.RarFile(source) as archive:
            if len(archive.infolist())>2000:raise ValueError('Too many archive entries.')
            for entry in archive.infolist():
                name=checked_name(entry.filename)
                if entry.is_symlink():raise ValueError('Archive links are not supported.')
                target=folder/name
                if entry.isdir():target.mkdir(parents=True,exist_ok=True);continue
                target.parent.mkdir(parents=True,exist_ok=True)
                with archive.open(entry) as content:total+=bounded_copy(content,target,MAX_EXPANDED-total)
    elif source.suffix.lower()=='.7z':
        import py7zr
        with py7zr.SevenZipFile(source,'r') as archive:
            entries=archive.list()
            if len(entries)>2000 or sum(e.uncompressed or 0 for e in entries)>MAX_EXPANDED:raise ValueError('Expanded archive is too large.')
            for entry in archive.files:
                checked_name(entry.filename)
                if entry.is_symlink or entry.is_junction:raise ValueError('Archive links are not supported.')
            archive.extractall(folder)
    else:
        opener=gzip.open if source.suffix=='.gz' else bz2.open if source.suffix in ('.bz','.bz2') else lzma.open
        with opener(source,'rb') as content:bounded_copy(content,folder/'content',MAX_EXPANDED)
    files=[p for p in folder.rglob('*') if p.is_file()]
    if not files:raise ValueError('The archive has no files to convert.')
    if src in ('tar.z','tz'):
        if len(files)!=1 or not tarfile.is_tarfile(files[0]):raise ValueError('The compressed TAR does not contain a valid TAR file.')
        nested=dest.parent/'nested-tar';nested.mkdir()
        packed=nested/dest.name
        archive_convert(files[0],packed,fmt,'tar')
        packed.replace(dest)
        return ''
    if fmt=='zip':
        with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as archive:
            for file in files:archive.write(file,file.relative_to(folder).as_posix())
    elif fmt=='7z':
        import py7zr
        with py7zr.SevenZipFile(dest,'w') as archive:
            for file in files:archive.write(file,file.relative_to(folder).as_posix())
    elif fmt=='rar':
        exe=rar_exe()
        if not exe:raise ValueError('RAR creation needs an installed, properly licensed WinRAR / RAR executable.')
        run([exe,'a','-idq','-r','-ep1','-y',dest,'.'],cwd=folder)
    elif fmt.startswith('tar'):
        mode={'tar':'w','tar.gz':'w:gz','tar.bz2':'w:bz2','tar.xz':'w:xz'}[fmt]
        with tarfile.open(dest,mode) as archive:
            for file in files:archive.add(file,arcname=file.relative_to(folder).as_posix(),recursive=False)
    else:
        if len(files)!=1:raise ValueError('GZ, BZ2 and XZ hold one file. Choose TAR.GZ, TAR.BZ2 or TAR.XZ for multiple files.')
        opener={'gz':gzip.open,'bz2':bz2.open,'xz':lzma.open}[fmt]
        with files[0].open('rb') as source_stream, opener(dest,'wb') as target:shutil.copyfileobj(source_stream,target)
    return ''


def image_convert(source,dest,fmt,options):
    if available('pillow_heif'):
        import pillow_heif
        pillow_heif.register_heif_opener()
    with Image.open(source) as original:
        if original.width*original.height>40_000_000:raise ValueError('Images may contain at most 40 megapixels.')
        image=ImageOps.exif_transpose(original)
        width=int(options.get('width') or 0);height=int(options.get('height') or 0)
        if width or height:
            width=width or round(image.width*height/image.height)
            height=height or round(image.height*width/image.width)
            if width<1 or height<1 or width*height>40_000_000:raise ValueError('Choose smaller image dimensions.')
            image.thumbnail((width,height),Image.Resampling.LANCZOS)
        if fmt in ('jpg','jpeg','bmp','ppm','pdf'):
            background=Image.new('RGB',image.size,'white')
            if 'A' in image.getbands():background.paste(image,mask=image.getchannel('A'))
            else:background.paste(image.convert('RGB'))
            image=background
        quality=max(1,min(100,int(options.get('quality',90))))
        image.save(dest,format={'jpg':'JPEG','jpeg':'JPEG','tiff':'TIFF'}.get(fmt,fmt.upper()),quality=quality)
        return 'Animated and multipage images export their first frame in image mode.' if getattr(original,'n_frames',1)>1 else ''


def media_convert(source,dest,fmt,options):
    exe=ffmpeg_exe()
    if not exe:raise ValueError('Install FFmpeg to enable local audio and video conversion.')
    args=[exe,'-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-i',source,'-threads','2']
    start=float(options.get('start') or 0);duration=float(options.get('duration') or 0)
    if start<0 or duration<0:raise ValueError('Trim times must be positive.')
    if start:args+=['-ss',str(start)]
    if duration:args+=['-t',str(duration)]
    bitrate=int(options.get('bitrate',192))
    if bitrate not in (64,96,128,192,256,320):raise ValueError('Choose a supported audio bitrate.')
    if fmt in AUDIO_OUTPUT:
        codecs={'aac':'aac','ac3':'ac3','aiff':'pcm_s16be','au':'pcm_s16be','caf':'pcm_s16le','flac':'flac','m4a':'aac','m4b':'aac','m4r':'aac','mp3':'libmp3lame','oga':'libvorbis','ogg':'libvorbis','opus':'libopus','wav':'pcm_s16le','wma':'wmav2'}
        args+=['-vn','-c:a',codecs[fmt]]
        if fmt not in ('aiff','au','caf','flac','wav'):args+=['-b:a',f'{bitrate}k']
        if fmt in ('m4b','m4r'):args+=['-f','ipod']
    else:
        size=options.get('resolution','original')
        if size not in ('original','480','720','1080'):raise ValueError('Choose a supported video resolution.')
        if fmt=='gif':
            args+=['-an','-vf',f'fps=12,scale=-2:{size if size!="original" else "480"}']
        else:
            codecs={'webm':('libvpx-vp9','libopus'),'ogv':('libtheora','libvorbis'),'wmv':('wmv2','wmav2'),'avi':('mpeg4','libmp3lame'),'mpeg':('mpeg2video','mp2'),'mpg':('mpeg2video','mp2')}
            video,audio=codecs.get(fmt,('libx264','aac'))
            args+=['-c:v',video,'-c:a',audio,'-pix_fmt','yuv420p']
            if video=='libx264':args+=['-preset','fast','-crf','23']
            if size!='original':args+=['-vf',f'scale=-2:{size}']
            else:args+=['-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2']
            if fmt in ('mp4','mov','m4v'):args+=['-movflags','+faststart']
    args += ['-fs',str(MAX_EXPANDED),dest]
    run(args)
    if dest.stat().st_size>=MAX_EXPANDED:raise ValueError('Output is too large. Trim the media or choose a lower resolution.')
    return ''


def extract_text(source,fmt):
    if fmt in ('txt','md'):return source.read_text('utf-8',errors='replace')
    if fmt in ('html','htm'):
        from bs4 import BeautifulSoup
        return BeautifulSoup(source.read_text('utf-8',errors='replace'),'html.parser').get_text('\n')
    if fmt=='docx':
        from docx import Document
        return '\n'.join(p.text for p in Document(source).paragraphs)
    with fitz.open(source) as doc:return '\n\n'.join(p.get_text(sort=True) for p in doc)


def write_epub(text,dest,title):
    body='<html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+html.escape(title)+'</title></head><body>'+''.join('<p>'+html.escape(p)+'</p>' for p in text.splitlines())+'</body></html>'
    with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('mimetype','application/epub+zip',compress_type=zipfile.ZIP_STORED)
        archive.writestr('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        archive.writestr('content.opf','<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:pdf-studio:local-document</dc:identifier><dc:title>'+html.escape(title)+'</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="content"/></spine></package>')
        archive.writestr('content.xhtml',body)
        archive.writestr('nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="content.xhtml">Document</a></li></ol></nav></body></html>')


def spreadsheet(source,dest,src,fmt):
    from openpyxl import Workbook,load_workbook
    if src=='xlsx':
        book=load_workbook(source,read_only=True,data_only=True)
        rows=list(book.active.iter_rows(max_row=min(book.active.max_row,10000),max_col=min(book.active.max_column,100),values_only=True))
        book.close()
    else:
        with source.open(encoding='utf-8-sig',errors='replace',newline='') as file:
            rows=[]
            for i,row in enumerate(csv.reader(file,delimiter='\t' if src=='tsv' else ',')):
                if i>=10000:raise ValueError('Spreadsheet conversion supports up to 10,000 rows.')
                rows.append(row[:100])
    if fmt=='xlsx':
        book=Workbook()
        for row in rows:book.active.append([str(v) if v is not None else '' for v in row])
        for row in book.active:
            for cell in row:cell.data_type='s'
        book.save(dest)
    elif fmt in ('csv','tsv'):
        with dest.open('w',encoding='utf-8-sig',newline='') as file:
            writer=csv.writer(file,delimiter='\t' if fmt=='tsv' else ',')
            for row in rows:writer.writerow([("'"+str(v)) if str(v or '').startswith(('=','+','-','@')) else v for v in row])
    else:
        markup='<table>'+''.join('<tr>'+''.join('<td>'+html.escape(str(v) if v is not None else '')+'</td>' for v in row)+'</tr>' for row in rows)+'</table>'
        if fmt=='html':dest.write_text(markup,encoding='utf-8')
        else:html_pdf(markup,dest)
    return 'Exports the first worksheet, up to 10,000 rows and 100 columns. Formulas are exported as values.' if src=='xlsx' else ''


def convert(job):
    if job['tool']=='converter-catalog':return catalog()
    options=job.get('options',{})
    src=str(options.get('inputFormat','')).lower()
    fmt=str(options.get('outputFormat','')).lower()
    if fmt not in routes(src,engines()):raise ValueError('This conversion is not available with the installed local engines. Check the format requirements.')
    if len(job.get('files',[]))!=1:raise ValueError('Convert one file per request. Batch files run sequentially in the browser.')
    source=Path(job['files'][0]['path'])
    stem=re.sub(r'[^a-zA-Z0-9 _-]','_',Path(job['files'][0]['name']).name[:-len(src)-1])[:80] or 'converted'
    dest=Path(job['directory'])/('converted.'+fmt)
    note=''
    local_text = src in {'txt','md','html','htm','epub','fb2','cbz'} and fmt in {'pdf','txt','html','epub'}
    if src in ARCHIVE_INPUT or src in NATIVE_ARCHIVES:
        note=archive_convert(source,dest,fmt,src)
    elif src in FONT_FORMATS:
        from fontTools.ttLib import TTFont
        font=TTFont(source)
        if fmt=='ttf' and 'glyf' not in font:raise ValueError('This font has CFF outlines. Export OTF, WOFF or WOFF2; changing outlines requires FontForge.')
        if fmt=='otf' and 'glyf' in font:raise ValueError('This font has TrueType outlines. Export TTF, WOFF or WOFF2; changing outlines requires FontForge.')
        font.flavor=fmt if fmt in ('woff','woff2') else None
        font.save(dest)
        font.close()
    elif src=='dxf':
        import ezdxf
        from ezdxf.addons.drawing import RenderContext,Frontend,layout,svg,pymupdf
        doc=ezdxf.readfile(source)
        backend=svg.SVGBackend() if fmt=='svg' else pymupdf.PyMuPdfBackend()
        Frontend(RenderContext(doc),backend).draw_layout(doc.modelspace())
        if fmt=='svg':dest.write_text(backend.get_string(layout.Page(0,0)),encoding='utf-8')
        elif fmt=='pdf':dest.write_bytes(backend.get_pdf_bytes(layout.Page(0,0)))
        else:dest.write_bytes(backend.get_pixmap_bytes(layout.Page(0,0),fmt='png',dpi=150))
        note='DXF is rendered as a 2D top view. 3D solids and proprietary entities are not supported.'
    elif src in {'svg','svgz'}:
        svg=source.read_bytes() if src=='svg' else gzip.decompress(source.read_bytes())
        with fitz.open(stream=svg,filetype='svg') as image:
            data=image.convert_to_pdf()
        with fitz.open('pdf',data) as doc:
            if fmt=='pdf':doc.save(dest)
            else:
                pix=doc[0].get_pixmap(dpi=150,alpha=fmt!='jpg')
                im=Image.open(io.BytesIO(pix.tobytes('png')))
                im.save(dest,format='JPEG' if fmt=='jpg' else fmt.upper())
    elif src in ('docx','pptx','xlsx') and fmt=='pdf':
        response=pdf_process({**job,'tool':{'docx':'word-pdf','pptx':'powerpoint-pdf','xlsx':'excel-pdf'}[src]})
        response['name']=stem+'.pdf'
        return response
    elif not local_text and office_exe() and office_group(src) and fmt in OFFICE_EXPORTS[office_group(src)] and not (src in ('csv','tsv','xlsx') and fmt in ('csv','tsv','xlsx','html')):
        group=office_group(src)
        export=OFFICE_EXPORTS[group][fmt]
        if not convert_office(office_exe(),source,dest,export,run_local):
            run([office_exe(),f'-env:UserInstallation={office_profile(dest.parent)}',
                 '--headless','--norestore','--nodefault','--convert-to',fmt+':'+export,'--outdir',dest.parent,source])
            made=dest.parent/(source.stem+'.'+fmt)
            if not made.exists():raise ValueError('LibreOffice could not produce this format from the selected document.')
            made.replace(dest)
        if group=='drawing' and fmt in ('svg','png'):note='Drawing export uses the first page.'
        elif fmt=='csv':note='CSV stores the active sheet as plain values; workbook formatting is not preserved.'
    elif not local_text and calibre_exe() and src in CALIBRE_INPUT and fmt in CALIBRE_OUTPUT and not (src=='pdf' and fmt in ('docx','txt')):
        run([calibre_exe(),source,dest],env={**os.environ,
            'CALIBRE_CONFIG_DIRECTORY':str(dest.parent/'calibre-config'),
            'CALIBRE_CACHE_DIRECTORY':str(dest.parent/'calibre-cache'),
            'http_proxy':'http://127.0.0.1:9','https_proxy':'http://127.0.0.1:9',
            'HTTP_PROXY':'http://127.0.0.1:9','HTTPS_PROXY':'http://127.0.0.1:9','NO_PROXY':'','no_proxy':''})
        note='Converted locally with Calibre. DRM-protected ebooks are not supported; layout may reflow.'
    elif src=='pdf':
        if fmt in ('docx','pptx','xlsx','md'):
            mapping={'docx':'pdf-word','pptx':'pdf-powerpoint','xlsx':'pdf-excel','md':'markdown'}
            response=pdf_process({**job,'tool':mapping[fmt]})
            response['name']=stem+'.'+fmt
            return response
        with fitz.open(source) as doc:
            if doc.needs_pass:raise ValueError('Unlock the PDF with its password before converting it.')
            if len(doc)>500:raise ValueError('PDFs may contain at most 500 pages.')
            if fmt in ('txt','html'):
                text='\n\n'.join(p.get_text(sort=True) for p in doc)
                dest.write_text(text if fmt=='txt' else '<pre>'+html.escape(text)+'</pre>',encoding='utf-8')
            else:
                outputs=[]
                for i,page in enumerate(doc):
                    part=dest.parent/f'page-{i+1}.{fmt}'
                    if fmt=='svg':part.write_text(page.get_svg_image(),encoding='utf-8')
                    else:
                        im=Image.open(io.BytesIO(page.get_pixmap(dpi=150,alpha=False).tobytes('png')))
                        im.save(part,format='JPEG' if fmt=='jpg' else fmt.upper())
                    outputs.append(part)
                if len(outputs)==1:shutil.move(outputs[0],dest)
                else:
                    dest=dest.with_suffix('.zip')
                    with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as archive:
                        for part in outputs:archive.write(part,part.name)
                    fmt='zip';note='Each PDF page is included as a separate file in the ZIP.'
    elif (src in IMAGE_INPUT or src in magick_formats()[0]) and (fmt in IMAGE_OUTPUT or fmt in magick_formats()[1]):
        actual=source
        if src in magick_formats()[0]:
            actual=dest.parent/'decoded.png'
            magick_decode(source,actual,src)
        if fmt in IMAGE_OUTPUT:
            note=image_convert(actual,dest,fmt,options)
        else:
            normalized=dest.parent/'normalized.png'
            note=image_convert(actual,normalized,'png',options)
            magick_encode(normalized,dest,fmt,max(1,min(100,int(options.get('quality',90)))))
    elif (src in AUDIO_INPUT or src in VIDEO_INPUT) and fmt in AUDIO_OUTPUT|VIDEO_OUTPUT:
        note=media_convert(source,dest,fmt,options)
    elif src in ('csv','tsv','xlsx') and fmt in ('csv','tsv','xlsx','html','pdf'):
        note=spreadsheet(source,dest,src,fmt)
    else:
        text=extract_text(source,src)
        if fmt=='txt':dest.write_text(text,encoding='utf-8')
        elif fmt=='html':dest.write_text('<!doctype html><meta charset="utf-8"><pre>'+html.escape(text)+'</pre>',encoding='utf-8')
        elif fmt=='pdf':
            if src in ('epub','fb2','cbz'):
                with fitz.open(source) as doc:dest.write_bytes(doc.convert_to_pdf())
            elif src in ('html','htm'):html_pdf(source.read_text('utf-8',errors='replace'),dest)
            else:text_pdf(text,dest,stem)
        elif fmt=='epub':write_epub(text,dest,stem)
        else:raise ValueError('Install a local conversion engine for this format pair.')
        note='Text conversion reflows content; complex layouts may differ from the source.'
    if not dest.exists() or dest.stat().st_size==0:raise ValueError('The engine did not produce a valid output file.')
    if dest.stat().st_size>MAX_EXPANDED:raise ValueError('The output exceeds the 200 MB limit.')
    return result(dest,stem+'.'+fmt,note)


if __name__=='__main__':
    import sys
    try:
        answer=convert(json.load(sys.stdin))
        print(json.dumps({'ok':True,**answer}))
    except Exception as exc:
        print(json.dumps({'ok':False,'error':str(exc) or 'Conversion failed.'}))
        sys.exit(1)
