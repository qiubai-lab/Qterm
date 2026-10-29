#import "Registration.h"
#import <objc/runtime.h>

static BOOL (*originalHandles)(id, SEL, NSString *);
static BOOL probeHandles(id object, SEL command, NSString *scheme) {
    if ([scheme isEqualToString:@"http"]) return NO;
    return originalHandles(object, command, scheme);
}

BOOL ProbeRegisterHTTPHandler(WKWebViewConfiguration *config, id<WKURLSchemeHandler> handler) {
    NSCAssert(NSThread.isMainThread, @"Registration belongs to the main thread");
    Method method = class_getClassMethod(WKWebView.class, @selector(handlesURLScheme:));
    if (!method) return NO;
    originalHandles = (void *)method_setImplementation(method, (IMP)probeHandles);
    BOOL registered = NO;
    @try {
        [config setURLSchemeHandler:handler forURLScheme:@"http"];
        registered = YES;
    } @finally {
        method_setImplementation(method, (IMP)originalHandles);
    }
    return registered;
}
