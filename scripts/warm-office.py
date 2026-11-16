"""Initialize a document-free LibreOffice profile for fast isolated job copies."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'engine'))
from process import office_exe,run_local

profile=ROOT/'.runtime'/'office-template'
if (profile/'.ready').exists():
    print('LibreOffice profile template is ready.',flush=True)
else:
    executable=office_exe()
    if not executable:raise RuntimeError('Install LibreOffice before initializing its profile.')
    print('Initializing LibreOffice extension registry once; no documents are opened.',flush=True)
    run_local([executable,f'-env:UserInstallation={profile.as_uri()}',
               '--headless','--norestore','--nodefault','--terminate_after_init'],timeout=600)
    if not (profile/'user'/'registrymodifications.xcu').exists():
        raise RuntimeError('LibreOffice did not create a complete profile.')
    (profile/'.ready').write_text('Initialized without documents.',encoding='utf-8')
    print('LibreOffice profile template is ready.',flush=True)
