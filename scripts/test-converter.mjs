import {spawnSync} from 'node:child_process';
import path from 'node:path';
const python=process.env.PYTHON_PATH||path.join(process.cwd(),'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const result=spawnSync(python,['engine/test_converter.py'],{stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
