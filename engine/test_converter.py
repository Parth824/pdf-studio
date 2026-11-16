import io
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import time
import tarfile
import tempfile
import unittest
import wave
import zipfile
import pymupdf as fitz
from PIL import Image
from converter import convert,catalog,ffmpeg_exe,rar_exe,calibre_exe,office_exe
from extra_engines import sevenzip_exe,magick_exe,magick_formats
from process import run_local

class ConverterTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.index=0
        self.zip=self.root/'sample.zip'
        with zipfile.ZipFile(self.zip,'w') as archive:
            archive.writestr('notes.txt','Local conversion works.')
            archive.writestr('folder/data.csv','name,value\nexample,42\n')
        self.png=self.root/'image.png';Image.new('RGBA',(80,60),(200,80,60,130)).save(self.png)
    def tearDown(self):self.temp.cleanup()
    def job(self,path,src,target,**options):
        self.index+=1;directory=self.root/f'job-{self.index}';directory.mkdir()
        result=convert({'tool':'convert','options':{'inputFormat':src,'outputFormat':target,**options},'directory':str(directory),'files':[{'path':str(path),'name':path.name}]})
        self.assertGreater(Path(result['path']).stat().st_size,0)
        return Path(result['path'])
    def test_catalog_and_unavailable_routes(self):
        info=catalog();self.assertTrue(info['localOnly']);self.assertIn('png',info['routes']['jpg']);self.assertEqual(info['routes']['dwg'],[])
        with self.assertRaises(ValueError):self.job(self.png,'png','rar')
    @unittest.skipUnless(os.name=='nt','Windows launcher regression')
    def test_native_timeout_stops_child_processes(self):
        started=time.monotonic()
        code="import subprocess,sys,time; subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)']); time.sleep(30)"
        with self.assertRaisesRegex(ValueError,'time limit'):
            run_local([sys.executable,'-c',code],timeout=1)
        self.assertLess(time.monotonic()-started,15)
    def test_native_office_roundtrips(self):
        if not office_exe():self.skipTest('LibreOffice not installed')
        from docx import Document
        from openpyxl import Workbook,load_workbook
        from pptx import Presentation
        from pptx.util import Inches
        document=Document();document.add_paragraph('Native Office conversion preserves this sentence.')
        source=self.root/'letter.docx';document.save(source)
        legacy=self.job(source,'docx','doc')
        output=self.job(legacy,'doc','pdf')
        with fitz.open(output) as pdf:self.assertIn('preserves this sentence',pdf[0].get_text())
        workbook=Workbook();workbook.active['A1']='Round trip';workbook.active['B1']=42
        source=self.root/'table.xlsx';workbook.save(source)
        legacy=self.job(source,'xlsx','xls')
        output=self.job(legacy,'xls','xlsx')
        loaded=load_workbook(output);self.assertEqual(loaded.active['B1'].value,42);loaded.close()
        slides=Presentation();slide=slides.slides.add_slide(slides.slide_layouts[6])
        slide.shapes.add_textbox(Inches(1),Inches(1),Inches(7),Inches(1)).text='Presentation round trip'
        source=self.root/'slides.pptx';slides.save(source)
        legacy=self.job(source,'pptx','ppt')
        output=self.job(legacy,'ppt','pdf')
        with fitz.open(output) as pdf:self.assertIn('Presentation round trip',pdf[0].get_text())
    def test_native_ebook_roundtrips(self):
        if not calibre_exe():self.skipTest('Calibre not installed')
        source=self.root/'book.txt';source.write_text('Local ebook conversion retains this sentence.\nAnother paragraph.',encoding='utf-8')
        for fmt in ('mobi','azw3','fb2','lrf'):
            with self.subTest(fmt=fmt):
                output=self.job(source,'txt',fmt)
                back=self.job(output,fmt,'txt')
                self.assertIn('retains this sentence',back.read_text('utf-8-sig'))
        pdf=self.root/'text.pdf'
        with fitz.open() as document:
            document.new_page().insert_text((72,72),'PDF to EPUB local conversion test.')
            document.save(pdf)
        ebook=self.job(pdf,'pdf','epub')
        with zipfile.ZipFile(ebook) as archive:self.assertEqual(archive.read('mimetype'),b'application/epub+zip')
    def test_native_archive_cpio_and_links(self):
        if not sevenzip_exe():self.skipTest('7-Zip not installed')
        def entry(name,data,mode=0o100644):
            filename=name.encode()+b'\0'
            fields=[1,mode,0,0,1,0,len(data),0,0,0,0,len(filename),0]
            header=b'070701'+''.join(f'{value:08x}' for value in fields).encode()
            named=header+filename
            return named+b'\0'*((-len(named))%4)+data+b'\0'*((-len(data))%4)
        source=self.root/'sample.cpio'
        source.write_bytes(entry('notes.txt',b'Archive content')+entry('TRAILER!!!',b''))
        output=self.job(source,'cpio','zip')
        with zipfile.ZipFile(output) as archive:self.assertEqual(archive.read('notes.txt'),b'Archive content')
        source.write_bytes(entry('../outside.txt',b'bad')+entry('TRAILER!!!',b''))
        with self.assertRaises(ValueError):self.job(source,'cpio','zip')
        source.write_bytes(entry('link',b'../outside',0o120777)+entry('TRAILER!!!',b''))
        with self.assertRaises(ValueError):self.job(source,'cpio','zip')
    def test_native_image_exports(self):
        if not magick_exe():self.skipTest('ImageMagick not installed')
        self.assertIn('psd',magick_formats()[1],'Installed ImageMagick formats must be detected')
        for fmt in ('psd','heic','icns','eps','jpe','tif','jps'):
            if fmt not in magick_formats()[1]:continue
            with self.subTest(fmt=fmt):
                output=self.job(self.png,'png',fmt,width=32)
                if fmt in ('psd','heic','icns','jpe','tif','jps'):
                    back=self.job(output,fmt,'png')
                    with Image.open(back) as image:self.assertLessEqual(image.width,32)
    def test_archive_tar_roundtrip(self):
        for fmt in ['tar','tar.gz','tar.bz2','tar.xz']:
            with self.subTest(fmt=fmt):
                result=self.job(self.zip,'zip',fmt)
                back=self.job(result,fmt,'zip')
                with zipfile.ZipFile(back) as archive:self.assertEqual(archive.read('notes.txt'),b'Local conversion works.')
    def test_zip_to_rar_roundtrip(self):
        if not rar_exe():self.skipTest('RAR not installed')
        rar=self.job(self.zip,'zip','rar')
        self.assertTrue(rar.read_bytes().startswith(b'Rar!'))
        back=self.job(rar,'rar','zip')
        with zipfile.ZipFile(back) as archive:self.assertEqual(archive.read('folder/data.csv'),b'name,value\nexample,42\n')
    def test_sevenzip_roundtrip(self):
        archive=self.job(self.zip,'zip','7z')
        back=self.job(archive,'7z','zip')
        with zipfile.ZipFile(back) as result:self.assertEqual(set(result.namelist()),{'notes.txt','folder/data.csv'})
    def test_single_file_compression(self):
        single=self.root/'single.zip'
        with zipfile.ZipFile(single,'w') as archive:archive.writestr('hello.txt','Hello')
        for fmt in ['gz','bz2','xz']:
            compressed=self.job(single,'zip',fmt)
            back=self.job(compressed,fmt,'zip')
            with zipfile.ZipFile(back) as archive:self.assertEqual(archive.read('content'),b'Hello')
        with self.assertRaises(ValueError):self.job(self.zip,'zip','gz')
    def test_archive_traversal_is_rejected(self):
        evil=self.root/'evil.zip'
        with zipfile.ZipFile(evil,'w') as archive:archive.writestr('../escape.txt','bad')
        with self.assertRaisesRegex(ValueError,'unsafe'):self.job(evil,'zip','tar')
        self.assertFalse((self.root/'escape.txt').exists())
        symlink=self.root/'link.tar'
        with tarfile.open(symlink,'w') as archive:
            entry=tarfile.TarInfo('link');entry.type=tarfile.SYMTYPE;entry.linkname='/tmp/escape';archive.addfile(entry)
        with self.assertRaisesRegex(ValueError,'links'):self.job(symlink,'tar','zip')
    def test_image_formats_and_resize(self):
        for fmt in ['jpg','webp','avif','gif','bmp','tiff','ico','pdf']:
            with self.subTest(fmt=fmt):
                result=self.job(self.png,'png',fmt,width=40)
                if fmt=='pdf':
                    with fitz.open(result) as doc:self.assertEqual(len(doc),1)
                else:
                    with Image.open(result) as im:self.assertLessEqual(im.width,40)
    def test_audio_conversion(self):
        if not ffmpeg_exe():self.skipTest('FFmpeg not installed')
        source=self.root/'tone.wav'
        with wave.open(str(source),'wb') as wav:
            wav.setparams((1,2,16000,16000,'NONE','not compressed'))
            wav.writeframes(b''.join(struct.pack('<h',int(10000*math.sin(2*math.pi*440*i/16000))) for i in range(16000)))
        mp3=self.job(source,'wav','mp3')
        output=self.job(mp3,'mp3','wav')
        with wave.open(str(output)) as wav:self.assertGreater(wav.getnframes(),14000)
    def test_video_conversion(self):
        if not ffmpeg_exe():self.skipTest('FFmpeg not installed')
        source=self.root/'sample.mp4'
        subprocess.run([ffmpeg_exe(),'-hide_banner','-loglevel','error','-nostdin','-y','-f','lavfi','-i','color=c=red:s=64x64:d=1','-c:v','libx264','-pix_fmt','yuv420p',str(source)],check=True,timeout=30)
        output=self.job(source,'mp4','webm')
        self.assertEqual(output.read_bytes()[:4],b'\x1aE\xdf\xa3')
    def test_epub_roundtrip(self):
        text=self.root/'book.txt';text.write_text('Hello reader.\nThis is a local ebook.',encoding='utf-8')
        epub=self.job(text,'txt','epub')
        with zipfile.ZipFile(epub) as archive:self.assertEqual(archive.read('mimetype'),b'application/epub+zip')
        output=self.job(epub,'epub','pdf')
        with fitz.open(output) as doc:self.assertIn('Hello reader',''.join(p.get_text() for p in doc))
    def test_spreadsheet_roundtrip(self):
        source=self.root/'data.csv';source.write_text('name,value\nzero,0\nquoted,"hello, world"\nformula,=1+1\n',encoding='utf-8')
        xlsx=self.job(source,'csv','xlsx')
        from openpyxl import load_workbook
        workbook=load_workbook(xlsx);workbook.active['B2']=0;workbook.save(xlsx);workbook.close()
        back=self.job(xlsx,'xlsx','csv')
        data=back.read_text('utf-8-sig')
        self.assertIn('zero,0',data);self.assertIn("'=1+1",data)
    def test_font_roundtrip(self):
        source=Path('C:/Windows/Fonts/arial.ttf')
        if not source.exists():self.skipTest('Test font not installed')
        woff=self.job(source,'ttf','woff2');self.assertTrue(woff.read_bytes().startswith(b'wOF2'))
        ttf=self.job(woff,'woff2','ttf');self.assertEqual(ttf.read_bytes()[:4],b'\0\1\0\0')
        with self.assertRaises(ValueError):self.job(source,'ttf','otf')
    def test_dxf_conversion(self):
        import ezdxf
        drawing=ezdxf.new();drawing.modelspace().add_line((0,0),(10,10));drawing.modelspace().add_circle((5,5),2)
        source=self.root/'drawing.dxf';drawing.saveas(source)
        svg=self.job(source,'dxf','svg');self.assertIn('<svg',svg.read_text())
        pdf=self.job(source,'dxf','pdf')
        with fitz.open(pdf) as doc:self.assertGreater(len(doc[0].get_drawings()),0)
    def test_svg_conversion(self):
        source=self.root/'shape.svg';source.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>')
        result=self.job(source,'svg','png')
        with Image.open(result) as image:self.assertGreater(image.width,100)

if __name__=='__main__':unittest.main(verbosity=2)
