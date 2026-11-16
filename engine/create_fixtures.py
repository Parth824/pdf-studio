from pathlib import Path
import pymupdf as fitz
import zipfile

directory=Path(__file__).resolve().parent.parent/'test-output'
directory.mkdir(exist_ok=True)
for filename, count, label in [('sample.pdf',3,'Project brief'),('appendix.pdf',2,'Appendix')]:
    doc=fitz.open()
    for i in range(count):
        page=doc.new_page()
        page.draw_rect(fitz.Rect(0,0,595,12),color=None,fill=(0.9,0.25,0.26))
        page.insert_text((52,82),f'{label} - page {i+1}',fontsize=26,color=(.15,.15,.2))
        page.insert_text((52,125),'PDF Studio test document',fontsize=13,color=(.5,.5,.55))
        page.insert_text((52,185),'Confidential account 12345. This project makes PDF work simpler.',fontsize=12)
        page.insert_text((52,213),'Merge, split, protect and edit documents with a single workspace.',fontsize=12)
        page.insert_text((52,760),f'{i+1} / {count}',fontsize=10)
    doc.save(directory/filename)
    if filename=='sample.pdf':
        doc[0].get_pixmap(dpi=120).save(directory/'scan.png')
    doc.close()
print('Created test-output/sample.pdf, appendix.pdf and scan.png')
with zipfile.ZipFile(directory/'sample.zip','w') as archive:
    archive.writestr('notes.txt','ZIP to RAR browser conversion test.')
    archive.writestr('folder/data.csv','name,value\nlocal,42\n')
print('Created test-output/sample.zip')
