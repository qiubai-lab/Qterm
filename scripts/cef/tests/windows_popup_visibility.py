"""Observe native occlusion, not just a loaded document or WS_VISIBLE."""
import time


def listen(app):
    return app.evaluate('main', "window.windowsPopupPages=[];return await window.__TAURI_INTERNALS__.invoke('plugin:event|listen',{event:'web-page-state',target:{kind:'Any'},handler:window.__TAURI_INTERNALS__.transformCallback(e=>windowsPopupPages.push(e.payload))})")


def verify(app, root, add, listener):
    def until(read, predicate):
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            value=read()
            if predicate(value):return value
            time.sleep(.05)
        raise RuntimeError(f'native popup visibility timed out: {value!r}')
    label=until(lambda:app.evaluate('main', "return windowsPopupPages.find(p=>p.url.endsWith('/echo?ui-tab') && !p.loading)?.label"),bool)
    def native(label):
        app.send(op='windows-inspect',id=label.removeprefix('web-'))
        return app.wait('windows-info')['info']
    def visible(label):
        return until(lambda:native(label),lambda n:n['visible'] and n['enabled'] and n['unoccluded'])
    info=visible(label)
    add('selected popup is actually above the full-window main UI',True,info)
    app.evaluate('main',"document.querySelectorAll('[aria-label=网页标签] [role=tab]')[0].click();return true")
    original=visible(root)
    hidden=until(lambda:native(label),lambda n:not n['visible'])
    add('switching to opener hides popup and exposes opener HWND',not hidden['visible'] and original['unoccluded'])
    app.evaluate('main',"document.querySelectorAll('[aria-label=网页标签] [role=tab]')[1].click();return true")
    info=visible(label)
    add('switching back restores popup above main UI',True,info)
    app.send(op='windows-focus',id=label.removeprefix('web-'))
    app.wait('windows-info')
    info=visible(label)
    add('native popup focus preserves its visible stacking order',True,info)
    app.evaluate('main', "return window.__TAURI_INTERNALS__.invoke('plugin:event|unlisten',{event:'web-page-state',eventId:"+str(listener)+"})")
