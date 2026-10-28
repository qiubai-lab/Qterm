import AppKit
import WebKit

// AppKit selection is supplied deterministically; the panel presentation,
// delegate callback and WebKit's file read remain real.
final class UploadFixturePanel: NSOpenPanel {
    var selection: [URL] = []
    override var urls: [URL] { selection }
}

@available(macOS 14.0, *) @MainActor
private func requestUploadPanel(_ guest: BrowserGuest) {
    // WebKit can defer evaluation completion until the open-panel request ends.
    guest.web.evaluateJavaScript("document.getElementById('upload-button').click(); true", completionHandler: nil)
}

@available(macOS 14.0, *) @MainActor
func uploadPanel(_ guest: BrowserGuest) async throws -> NSOpenPanel {
    requestUploadPanel(guest)
    for _ in 0..<50 {
        if let panel = guest.window?.attachedSheet as? NSOpenPanel { return panel }
        await pause()
    }
    throw BrowserError("File input did not open a native picker")
}

@available(macOS 14.0, *) @MainActor
func fileUploadSmoke(_ source: BrowserGuest, _ origin: String) async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appendingPathComponent("upload-proof.txt")
    try Data("Qterm upload proof".utf8).write(to: file)
    let window = source.window!
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    let guest = BrowserGuest(id: "upload-fixture", config: config, window: window,
                             appOrigin: source.appOrigin, store: source.store,
                             fileUpload: BrowserFileUpload(makePanel: {
                                 let panel = UploadFixturePanel()
                                 panel.selection = [file]
                                 return panel
                             }))
    defer { guest.dispose() }
    try guest.sync(["x": 10.0, "y": 20.0, "width": 600.0, "height": 400.0, "visible": true])
    try guest.action(["action": "navigate", "url": origin + "/upload-fixture"])
    await pause(); try await loaded(guest)
    let fixture = """
    document.body.innerHTML='<button id="upload-button">Choose file</button><input id="upload-input" type="file" hidden multiple>';
    window.uploadChanges=0; window.uploadProof='';
    document.getElementById('upload-button').onclick=()=>document.getElementById('upload-input').click();
    document.getElementById('upload-input').onchange=async event=>{
      window.uploadChanges++; const file=event.target.files[0];
      window.uploadProof=file ? file.name+':'+await file.text() : '';
    }; true
    """
    _ = try await js(guest, fixture)
    let panel = try await uploadPanel(guest)
    try check(panel.allowsMultipleSelection && panel.canChooseFiles && !panel.canChooseDirectories,
              "hidden multiple file input opens a native file picker")
    window.endSheet(panel, returnCode: .OK)
    await pause(0.3)
    try check(guest.window?.attachedSheet == nil, "file picker accepts fixture selection")
    for _ in 0..<50 {
        if try await js(guest, "window.uploadProof") as? String == "upload-proof.txt:Qterm upload proof" { break }
        await pause()
    }
    try check(try await js(guest, "window.uploadProof") as? String == "upload-proof.txt:Qterm upload proof",
              "selected file name and bytes reach the page through WebKit")
    let canceled = try await uploadPanel(guest)
    canceled.cancel(nil)
    await pause(0.3)
    try check(try await js(guest, "window.uploadChanges") as? Int == 1, "cancel does not emit a new file change")
    _ = try await js(guest, "document.getElementById('upload-input').multiple=false; true")
    let single = try await uploadPanel(guest)
    try check(!single.allowsMultipleSelection, "single file input disallows multiple selection")
    single.cancel(nil)
    await pause(0.3)
    _ = try await js(guest, "document.getElementById('upload-input').setAttribute('webkitdirectory',''); true")
    let folder = try await uploadPanel(guest)
    try check(folder.canChooseDirectories, "directory input permits directory selection")
    folder.cancel(nil)
    await pause(0.3)
    _ = try await uploadPanel(guest)
    try guest.action(["action": "navigate", "url": origin + "/upload-after-navigation"])
    await pause(); try await loaded(guest)
    try check(guest.window?.attachedSheet == nil, "navigation dismisses stale file picker")
    _ = try await js(guest, fixture)
    _ = try await uploadPanel(guest)
    guest.fileUpload.cancel()
    guest.fileUpload.cancel()
    await pause(0.3)
    try check(guest.window?.attachedSheet == nil, "picker cleanup is idempotent and permits reopening")
    _ = try await uploadPanel(guest)
    try guest.sync(["x": 10.0, "y": 20.0, "width": 600.0, "height": 400.0, "visible": false])
    await pause(0.3)
    try check(window.attachedSheet == nil, "hiding a guest dismisses its picker")
    try guest.sync(["x": 10.0, "y": 20.0, "width": 600.0, "height": 400.0, "visible": true])
    _ = try await uploadPanel(guest)
    guest.dispose()
    await pause(0.3)
    try check(window.attachedSheet == nil, "closing a guest dismisses its picker")
    _ = try await js(source, fixture)
    let nativePanel = try await uploadPanel(source)
    try check(!(nativePanel is UploadFixturePanel), "default guest presents the system file picker")
    nativePanel.cancel(nil)
    await pause(0.3)
    try check(window.attachedSheet == nil, "system file picker can be canceled")
}
