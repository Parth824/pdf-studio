import base64
import io
import json
from pathlib import Path
import tempfile
import unittest
import unicodedata
import zipfile
from unittest.mock import patch

import pymupdf as fitz
from PIL import Image
from process import process, pages


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.pdf = self.root / 'source.pdf'
        doc = fitz.open()
        for index in range(3):
            page = doc.new_page()
            page.insert_text((60, 100), f'Page {index+1}. Confidential account 12345. This document explains the project.', fontsize=12)
            page.insert_text((60, 135), 'The project delivers useful PDF tools. These tools save time for everyone.', fontsize=12)
        doc.save(self.pdf)
        doc.close()
        self.image = self.root / 'photo.png'
        Image.new('RGB', (640, 480), '#d65a51').save(self.image)
        self.count = 0

    def tearDown(self):
        self.temp.cleanup()

    def job(self, tool, options=None, files=None):
        self.count += 1
        directory = self.root / f'job-{self.count}'
        directory.mkdir()
        result = process({'tool':tool, 'options':options or {}, 'directory':str(directory), 'files':[{'path':str(p),'name':p.name} for p in (files if files is not None else [self.pdf])]})
        if 'path' in result:
            self.assertTrue(Path(result['path']).is_file())
            self.assertGreater(result['size'], 0)
        return result

    def document(self, result):
        return fitz.open(result['path'])

    def test_page_ranges(self):
        self.assertEqual(pages('3,1-2',3), [2,0,1])
        self.assertEqual(pages('3-1',3), [2,1,0])
        for value in ['0','4','abc','1,,2']:
            with self.assertRaises(ValueError):
                pages(value,3)

    def test_inspect(self):
        result = self.job('inspect')
        self.assertEqual(result['pages'],3)
        self.assertTrue(base64.b64decode(result['thumbnails'][0]['image']).startswith(b'\x89PNG'))

    def test_merge_order(self):
        result=self.job('merge',files=[self.pdf,self.pdf])
        with self.document(result) as doc:
            self.assertEqual(len(doc),6)
            self.assertIn('Page 1',doc[3].get_text())

    def test_split_zip(self):
        result=self.job('split',{'pages':'1,3'})
        with zipfile.ZipFile(result['path']) as archive:
            self.assertEqual(archive.namelist(),['page-1.pdf','page-3.pdf'])
            with fitz.open('pdf',archive.read('page-3.pdf')) as doc:
                self.assertEqual(len(doc),1)
                self.assertIn('Page 3',doc[0].get_text())

    def test_organize_extract_remove(self):
        for tool,options,expected in [('organize',{'pages':'3,1'},[3,1]),('extract',{'pages':'2'},[2]),('remove',{'pages':'1,3'},[2]),('split',{'pages':'1-2','splitMode':'range'},[1,2])]:
            with self.subTest(tool=tool):
                with self.document(self.job(tool,options)) as doc:
                    self.assertEqual(len(doc),len(expected))
                    for page,n in zip(doc,expected):
                        self.assertIn(f'Page {n}',page.get_text())
        with self.assertRaises(ValueError):self.job('remove',{'pages':'1-3'})

    def test_compression_retains_content(self):
        result=self.job('compress')
        self.assertLessEqual(result['size'],self.pdf.stat().st_size)
        with self.document(result) as doc:
            self.assertEqual(len(doc),3)
            self.assertIn('Confidential',doc[0].get_text())
        with self.document(self.job('compress',{'compression':'strong'})) as doc:
            self.assertEqual(len(doc),3)

    def test_rotation(self):
        with self.document(self.job('rotate',{'pages':'2','angle':90})) as doc:
            self.assertEqual([p.rotation for p in doc],[0,90,0])

    def test_annotations(self):
        for tool in ['watermark','edit','sign']:
            with self.subTest(tool=tool):
                with self.document(self.job(tool,{'text':'APPROVED','fontSize':20})) as doc:
                    self.assertIn('APPROVED',doc[0].get_text())
        with self.document(self.job('page-numbers')) as doc:
            self.assertIn('1 / 3',doc[0].get_text())
        with self.document(self.job('edit',{'editMode':'rectangle'})) as doc:
            self.assertGreater(len(doc[0].get_drawings()),0)
        picture='data:image/png;base64,'+base64.b64encode(self.image.read_bytes()).decode()
        with self.document(self.job('edit',{'editMode':'image','image':picture})) as doc:
            self.assertGreater(len(doc[0].get_images()),0)
        with self.document(self.job('sign',{'signature':picture})) as doc:
            self.assertGreater(len(doc[0].get_images()),0)

    def test_redaction_is_permanent(self):
        with self.document(self.job('redact',{'text':'12345'})) as doc:
            self.assertNotIn('12345',''.join(p.get_text() for p in doc))
            self.assertIn('Confidential',doc[0].get_text())

    def test_crop(self):
        with self.document(self.job('crop',{'margin':24})) as doc:
            self.assertEqual(doc[0].cropbox.x0,24)
            self.assertEqual(doc[0].rect.width,547)

    def test_password_roundtrip(self):
        result=self.job('protect',{'newPassword':'test-secret'})
        protected=Path(result['path'])
        with self.document(result) as doc:
            self.assertTrue(doc.needs_pass)
            self.assertFalse(doc.authenticate('wrong'))
            self.assertTrue(doc.authenticate('test-secret'))
        with self.assertRaises(ValueError):self.job('unlock',{'password':'wrong'},[protected])
        with self.document(self.job('unlock',{'password':'test-secret'},[protected])) as doc:
            self.assertFalse(doc.needs_pass)
            self.assertIn('Confidential',doc[0].get_text())

    def test_repair(self):
        with self.document(self.job('repair')) as doc:self.assertEqual(len(doc),3)

    def test_pdf_images_roundtrip(self):
        result=self.job('pdf-jpg',{'pages':'2'})
        with zipfile.ZipFile(result['path']) as archive:
            self.assertEqual(archive.namelist(),['page-2.jpg'])
            image=Image.open(io.BytesIO(archive.read('page-2.jpg')))
            self.assertGreater(image.width,500)
        for tool in ['jpg-pdf','scan']:
            with self.document(self.job(tool,files=[self.image,self.image])) as doc:
                self.assertEqual(len(doc),2)
                self.assertTrue(doc[0].get_images())

    def test_word_output_and_input(self):
        from docx import Document
        result=self.job('pdf-word')
        word=Document(result['path'])
        self.assertIn('Confidential',' '.join(p.text for p in word.paragraphs))
        with self.document(self.job('word-pdf',files=[Path(result['path'])])) as doc:
            self.assertIn('Confidential',unicodedata.normalize('NFKC',''.join(p.get_text() for p in doc)))

    def test_powerpoint_output_and_input(self):
        from pptx import Presentation
        from pptx.util import Inches
        result=self.job('pdf-powerpoint')
        presentation=Presentation(result['path'])
        self.assertEqual(len(presentation.slides),3)
        self.assertEqual(len(presentation.slides[0].shapes),1)
        sample=Presentation()
        slide=sample.slides.add_slide(sample.slide_layouts[6])
        slide.shapes.add_textbox(Inches(1),Inches(1),Inches(5),Inches(1)).text='Presentation content'
        file=self.root/'slides.pptx'
        sample.save(file)
        with self.document(self.job('powerpoint-pdf',files=[file])) as doc:
            self.assertIn('Presentation content',''.join(p.get_text() for p in doc))

    def test_excel_output_and_input(self):
        from openpyxl import load_workbook
        result=self.job('pdf-excel')
        workbook=load_workbook(result['path'])
        self.assertEqual(len(workbook.sheetnames),3)
        self.assertIn('Confidential',workbook.active['A1'].value)
        workbook.close()
        with self.document(self.job('excel-pdf',files=[Path(result['path'])])) as doc:
            self.assertGreater(len(doc),0)

    def test_html_and_text_tools(self):
        with self.document(self.job('html-pdf',{'html':'<h1>Sample heading</h1><p>Hello PDF</p><script>alert(1)</script>'},[])) as doc:
            text=doc[0].get_text()
            self.assertIn('Hello PDF',text)
            self.assertNotIn('alert',text)
        for tool in ['markdown','summarize']:
            result=self.job(tool)
            self.assertIn('project',Path(result['path']).read_text(encoding='utf-8'))

    def test_comparison(self):
        result=self.job('compare',files=[self.pdf,self.pdf])
        self.assertIn('No text changes',Path(result['path']).read_text())
        changed=self.job('edit',{'text':'NEW CONTENT'})
        result=self.job('compare',files=[self.pdf,Path(changed['path'])])
        self.assertIn('+NEW CONTENT',Path(result['path']).read_text())

    def test_form_create_fill(self):
        created=self.job('forms',{'formMode':'create','fieldName':'Full name'})
        inspected=self.job('inspect',files=[Path(created['path'])])
        self.assertEqual(inspected['fields'][0]['name'],'Full name')
        filled=self.job('forms',{'fields':{'Full name':'Jane Doe'}},[Path(created['path'])])
        with self.document(filled) as doc:
            self.assertEqual(next(doc[0].widgets()).field_value,'Jane Doe')

    def test_ocr(self):
        from process import ROOT
        if not (ROOT/'.runtime/tessdata/eng.traineddata').exists():
            self.skipTest('English OCR language data not installed')
        raster=self.root/'raster.pdf'
        with fitz.open(self.pdf) as original:
            doc=fitz.open()
            page=doc.new_page()
            page.insert_image(page.rect,stream=original[0].get_pixmap(dpi=150).tobytes('png'))
            doc.save(raster)
            doc.close()
        with self.document(self.job('ocr',files=[raster])) as doc:
            self.assertIn('Confidential',doc[0].get_text())

    def test_missing_optional_dependencies_are_errors(self):
        with patch('process.gs_exe',return_value=None):
            with self.assertRaisesRegex(ValueError,'Ghostscript'):self.job('pdfa')
        with patch.dict('os.environ',{'TRANSLATE_URL':''}):
            with self.assertRaisesRegex(ValueError,'LibreTranslate'):self.job('translate')

    def test_remote_translation_is_rejected(self):
        with patch.dict('os.environ',{'TRANSLATE_URL':'https://external.example'}), patch('urllib.request.urlopen') as network:
            with self.assertRaisesRegex(ValueError,'External uploads are disabled'):self.job('translate')
            network.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
