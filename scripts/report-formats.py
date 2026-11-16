"""Write the actual local format matrix for review."""
from pathlib import Path
import json
import sys
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'engine'))
from converter import catalog

data=catalog()
report={
    'localOnly':data['localOnly'],
    'engines':data['engines'],
    'availableInputFormats':sum(bool(outputs) for outputs in data['routes'].values()),
    'catalogueInputFormats':len(data['routes']),
    'conversionPairs':sum(len(outputs) for outputs in data['routes'].values()),
    'unavailableInputs':{category:[fmt for fmt in formats if not data['routes'][fmt]] for category,formats in data['categories'].items()},
    'routes':data['routes'],
}
directory=ROOT/'test-output';directory.mkdir(exist_ok=True)
(directory/'conversion-coverage.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({key:value for key,value in report.items() if key!='routes'},indent=2))
