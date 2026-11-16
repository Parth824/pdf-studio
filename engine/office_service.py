"""Serialize Office conversions through a local, document-free UNO service."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from native_job import NativeJob

ROOT=Path(__file__).resolve().parent.parent
DIRECTORY=ROOT/'.runtime'/'office-service'
PIPE='pdfstudio_'+hashlib.sha256(str(ROOT).encode()).hexdigest()[:16]
CLIENT=ROOT/'engine'/'uno_client.py'
FLAGS=0x08000000 if os.name=='nt' else 0
BACKGROUND=[]

@contextmanager
def lock(name,timeout=150):
    DIRECTORY.mkdir(parents=True,exist_ok=True)
    with (DIRECTORY/name).open('a+b') as handle:
        if handle.tell()==0:handle.write(b'0');handle.flush()
        deadline=time.monotonic()+timeout
        while True:
            handle.seek(0)
            try:
                if os.name=='nt':
                    import msvcrt
                    msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
                else:
                    import fcntl
                    fcntl.flock(handle.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic()>deadline:raise ValueError('Another Office conversion is still running. Try again shortly.')
                time.sleep(.1)
        try:yield
        finally:
            handle.seek(0)
            if os.name=='nt':msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)
            else:fcntl.flock(handle.fileno(),fcntl.LOCK_UN)

def probe(python,timeout=30):
    worker=subprocess.Popen([str(python),str(CLIENT),PIPE],stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,stdin=subprocess.DEVNULL,creationflags=FLAGS)
    family=NativeJob(worker)
    try:
        worker.communicate(timeout=timeout)
        return worker.returncode==0
    except subprocess.TimeoutExpired:
        if os.name=='nt':family.terminate()
        else:worker.kill()
        worker.communicate(timeout=10)
        return False
    finally:family.close()


def daemon_running():
    try:
        with lock('daemon.lock',0):return False
    except ValueError:return True

def ensure(executable,timeout=150):
    python=Path(executable).with_name('python.exe')
    if not python.exists():return None
    deadline=time.monotonic()+timeout
    with lock('startup.lock',timeout):
        if probe(python,timeout=max(.1,min(30,deadline-time.monotonic()))):return python
        DIRECTORY.mkdir(parents=True,exist_ok=True)
        if not daemon_running():
            (DIRECTORY/'stop').unlink(missing_ok=True)
            with (DIRECTORY/'service.log').open('ab') as log:
                manager=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--serve',str(executable)],
                    stdin=subprocess.DEVNULL,stdout=log,stderr=log,cwd=ROOT,
                    creationflags=FLAGS|0x00000200 if os.name=='nt' else 0,
                    start_new_session=os.name!='nt')
                BACKGROUND.append(manager)
        while time.monotonic()<deadline:
            if probe(python,timeout=max(.1,min(30,deadline-time.monotonic()))):return python
            time.sleep(1)
        raise ValueError('The local Office service is still starting. Try again shortly.')

def convert_office(executable,source,destination,export,runner,timeout=90):
    python=Path(executable).with_name('python.exe')
    if not python.exists():return False
    with lock('conversion.lock',30):
        ensure(executable,timeout=45)
        try:
            runner([python,CLIENT,PIPE,source.resolve(),destination.resolve(),export],timeout=timeout)
        except ValueError as error:
            if 'time limit' in str(error):
                (DIRECTORY/'stop').write_text('Stop a stalled conversion.',encoding='utf-8')
                time.sleep(1)
            raise
        if not destination.is_file():raise ValueError('LibreOffice did not produce an output file.')
    return True

def serve(executable):
    # Only one manager owns the daemon. The kernel releases this lock on exit.
    with lock('daemon.lock',5):
        profile=DIRECTORY/'profile'
        if not profile.exists() and (ROOT/'.runtime'/'office-template'/'.ready').exists():
            shutil.copytree(ROOT/'.runtime'/'office-template',profile,
                            ignore=shutil.ignore_patterns('.ready','.lock','lock','*.tmp'))
        worker=subprocess.Popen([executable,f'-env:UserInstallation={profile.as_uri()}',
            '--headless','--norestore','--nodefault',f'--accept=pipe,name={PIPE};urp;StarOffice.ServiceManager'],
            stdin=subprocess.DEVNULL,creationflags=FLAGS)
        family=NativeJob(worker)
        (DIRECTORY/'service.json').write_text(json.dumps({'manager':os.getpid(),'worker':worker.pid,'pipe':PIPE}),encoding='utf-8')
        try:
            while worker.poll() is None and not (DIRECTORY/'stop').exists():
                time.sleep(.25)
        finally:
            family.close()
            worker.wait(timeout=10)

if __name__=='__main__':
    if sys.argv[1]=='--serve':serve(sys.argv[2])
    elif sys.argv[1]=='--start':
        ensure(sys.argv[2],timeout=600)
        print('Local Office conversion service is ready.',flush=True)
    elif sys.argv[1]=='--auto-start':
        from process import office_exe
        executable=office_exe()
        if executable and Path(executable).with_name('python.exe').exists():
            ensure(executable,timeout=600)
            print('Local Office conversion service is ready.',flush=True)
