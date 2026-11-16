"""Runs under LibreOffice's bundled Python, over a local named pipe only."""
import json
import sys
import traceback
import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.document.MacroExecMode import NEVER_EXECUTE
from com.sun.star.document.UpdateDocMode import NO_UPDATE
from com.sun.star.lang import DisposedException

def properties(**values):
    result=[]
    for name,value in values.items():
        item=PropertyValue();item.Name=name;item.Value=value;result.append(item)
    return tuple(result)

try:
    local=uno.getComponentContext()
    resolver=local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',local)
    context=resolver.resolve('uno:pipe,name='+sys.argv[1]+';urp;StarOffice.ComponentContext')
    desktop=context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',context)
    # Keep one empty hidden document open so closing an exported file does not
    # shut down LibreOffice's last frame and disconnect the local UNO bridge.
    keepalive_title='PDF Studio local conversion service'
    components=desktop.getComponents().createEnumeration()
    keepalive=None
    while components.hasMoreElements():
        component=components.nextElement()
        try:
            if component.getTitle()==keepalive_title:
                keepalive=component
                break
        except Exception:pass
    # Start Center is also a desktop component, but does not keep the last
    # document frame alive. Look for our specific blank document instead.
    if keepalive is None:
        keepalive=desktop.loadComponentFromURL('private:factory/swriter','_blank',0,properties(Hidden=True,PickListEntry=False))
        keepalive.setTitle(keepalive_title)
    # LibreOffice can reuse an unmodified empty Writer model for the next
    # opened document, even when the model is hidden. Keep it non-empty.
    keepalive.getText().setString('Local conversion service')
    keepalive.setModified(True)
    if len(sys.argv)>2:
        document=desktop.loadComponentFromURL(uno.systemPathToFileUrl(sys.argv[2]),'_blank',0,
            properties(Hidden=True,ReadOnly=True,Silent=True,PickListEntry=False,MacroExecutionMode=NEVER_EXECUTE,UpdateDocMode=NO_UPDATE))
        if document is None:raise RuntimeError('LibreOffice could not open the document.')
        try:
            document.storeToURL(uno.systemPathToFileUrl(sys.argv[3]),properties(FilterName=sys.argv[4],Overwrite=True))
        finally:
            try:document.close(True)
            except DisposedException:pass
            except Exception:
                try:document.dispose()
                except Exception:pass
    print(json.dumps({'ok':True}))
except Exception as error:
    traceback.print_exc()
    print(json.dumps({'ok':False,'error':str(error)}))
    sys.exit(1)
