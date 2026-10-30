"""Drive the real React Block and IPC adoption, not a synthetic frontend stub."""
import json
import time


def run(app, origin, add, pooled_baseline=0, native_visibility=False):
    def until(script, predicate, timeout=15):
        deadline=time.monotonic()+timeout
        value=None
        while time.monotonic()<deadline:
            value=app.evaluate('main',script)
            if predicate(value):return value
            time.sleep(.05)
        raise RuntimeError(f'UI condition timed out: {value!r}')
    app.evaluate('main',"document.querySelector('[data-onboarding=rail-browser]').click();return true")
    until("return !!document.querySelector('input[aria-label=网页地址]')",bool)
    url=f'http://127.0.0.1:{origin.server_port}/'
    app.evaluate('main',"const input=document.querySelector('input[aria-label=网页地址]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,"+json.dumps(url)+");input.dispatchEvent(new Event('input',{bubbles:true}));return true")
    time.sleep(.1)
    app.evaluate('main',"document.querySelector('.web-address-bar').requestSubmit();return true")
    loaded=app.wait('loaded',url=url)
    root=loaded['id']
    if native_visibility:
        from windows_popup_visibility import listen, verify
        # Remove the first-run floating guide so the center has no intentional overlay.
        until("const guide=document.querySelector('[role=dialog][aria-label=使用引导]');if(guide){[...guide.querySelectorAll('button')].find(b=>b.textContent==='跳过')?.click();}return !document.querySelector('[role=dialog][aria-label=使用引导]')",bool)
        visibility_listener=listen(app)
    app.send(op='eval',id=root,tag='ui-popup',gesture=True,script="window.uiPopup=window.open('/echo?ui-tab','ui-popup');return !!uiPopup")
    app.wait('result',id=root)
    tabs=until("return [...document.querySelectorAll('[aria-label=网页标签] [role=tab]')].map(t=>({text:t.innerText,selected:t.getAttribute('aria-selected')}))",lambda tabs:len(tabs)==2 and tabs[1]['selected']=='true' and 'echo' in tabs[1]['text'])
    add('real React Browser Block automatically adopts popup as selected new tab',len(tabs)==2,tabs)
    address=until("return [...document.querySelectorAll('.web-tab-page:not([hidden]) input[aria-label=网页地址]')].map(i=>i.value)",lambda values:len(values)==1 and 'echo?ui-tab' in values[0])
    add('adopted Block tab receives its own URL metadata',address==[url+'echo?ui-tab'],address)
    if native_visibility:
        verify(app,root,add,visibility_listener)
    # User-facing close button must close the actual browser and reveal source.
    app.evaluate('main',"document.querySelector('.web-tab[data-selected=true] .web-tab-close').click();return true")
    until("return document.querySelectorAll('[aria-label=网页标签] [role=tab]').length",lambda count:count==1)
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        closed=app.evaluate(root,'return uiPopup.closed')
        if closed:break
        time.sleep(.05)
    add('real tab close button releases popup and keeps original page alive',closed)
    app.evaluate('main',"document.querySelector('.web-tab[data-selected=true] .web-tab-close').click();return true")
    # Last-tab replacement is blank; wait for its predecessor's native teardown.
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        app.send(op='counts');counts=app.wait('counts')
        if counts['guests']==counts['environments']==0:break
        time.sleep(.05)
    add('closing real UI tabs releases the local environment',counts['guests']==counts['environments']==0 and counts['pooledContexts']==pooled_baseline,counts)
