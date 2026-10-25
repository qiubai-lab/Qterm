# Browser environments

Browser tabs are page instances, not storage owners. `WebTabs` retains each page while selecting one visible guest. `WebHost` owns connection environments; a validated SSH session supplies the immutable connection ID and route host/port/account snapshot. Same-identity pages across blocks share an environment. Identity changes select another environment; they never reuse another target's site data.

Each environment has a stable loopback gateway for this app lifetime. Guests on the same SSH session reuse one SOCKS listener; it is retired only after that session's final page closes. Removing one guest removes its gateway registration, and remaining guests continue through authenticated routes. The gateway never opens a remote socket directly. Closing/disconnecting an SSH session can interrupt in-flight requests or WebSockets carried by that session, even in another block sharing the environment; subsequent requests use surviving routes, but TCP streams cannot migrate. The existing global native-page limit remains 16; empty tabs do not allocate a native guest.

`cache/web-profiles/<opaque UUID>/profile.json` maps identity to browser-owned `data/`. The directory name never uses untrusted host/profile strings. Native browser storage persists after pages close. Metadata creation is staged before directory publication; old temporary browsing sessions are not migrated. Cookies/site data are not exported through IPC or configuration synchronization. This is native WebView2 protection, not whole-directory encryption. Cache directories may contain login-bearing site data.

The address-field popover offers resource cache, cookies and DOM storage. Resource cache is selected initially. Clearing serializes with guest lifecycle, pauses every current document in the selected environment, waits for blank documents, invokes the native profile API and restores their URLs even on failure. It reloads pages and can discard unsaved form data. Websites can create new cache/cookies after reload. App history, bookmarks and other connection environments are not cleared. No recursive profile deletion is used.

## Future master-password protection boundary

The persisted `BrowserProtection` mode is `native` today. `masterPassword` is reserved and rejected before opening the data directory; no switch is exposed until implemented. A future adapter must replace the storage resolver rather than teaching tabs or IPC how to read credentials.

Required transitions: available → quiescing → locked; locked → unlocking → available; available/locked → migrating → available/locked, with a recoverable failed state. All labels sharing the identity participate, including hidden tabs and other blocks. Close native views and wait for browser file release before sealing or moving files. Do not declare success while cleartext runtime data remains unintentionally accessible.

Enabling/disabling protection requires a transactional migration manifest and rollback to the last committed format. Never silently downgrade a protected profile to native mode, and never store keys or passwords in the manifest, URLs, logs or frontend state. Cookie-only encryption cannot claim to protect tokens in LocalStorage/IndexedDB. Unlock, OS-account/process threats, crash recovery and residual runtime files require a separate security design and native tests before this option is enabled.

Tab lists are not restored across app restarts in this change; persistent site data and tab restoration are separate features. Existing new-window blocking and guest IPC restrictions remain.
