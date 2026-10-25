#import <WebKit/WebKit.h>
// WebRTC has no public per-view proxy policy. Remote views must disable native peer connections.
BOOL QtermPeerPolicyAvailable(void);
BOOL QtermRestrictPeerConnections(WKPreferences * _Nonnull preferences);
