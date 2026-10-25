#import "WebKitPolicy.h"
@interface WKPreferences (QtermPeerPolicy)
- (void)_setPeerConnectionEnabled:(BOOL)enabled;
- (BOOL)_peerConnectionEnabled;
@end

BOOL QtermPeerPolicyAvailable(void) {
    return [WKPreferences instancesRespondToSelector:@selector(_setPeerConnectionEnabled:)] &&
           [WKPreferences instancesRespondToSelector:@selector(_peerConnectionEnabled)];
}

BOOL QtermRestrictPeerConnections(WKPreferences *preferences) {
    if (![preferences respondsToSelector:@selector(_setPeerConnectionEnabled:)] ||
        ![preferences respondsToSelector:@selector(_peerConnectionEnabled)]) return NO;
    [preferences _setPeerConnectionEnabled:NO];
    return ![preferences _peerConnectionEnabled];
}
