#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>
#import <objc/message.h>

// Native CEF view stays in its runtime-owned parent. Only hit testing and masking
// are extended; no wrapper changes the runtime's coordinates or close ownership.
static char stateKey;
typedef void (*FocusCallback)(const char *);
static NSRect rectangle(NSDictionary *r) {
  return NSMakeRect([r[@"x"] doubleValue], [r[@"y"] doubleValue],
                    [r[@"width"] doubleValue], [r[@"height"] doubleValue]);
}
static NSView *hitTest(id self, SEL selector, NSPoint point) {
  NSDictionary *state = objc_getAssociatedObject(self, &stateKey);
  NSView *view = self;
  NSPoint local = [view convertPoint:point fromView:view.superview];
  if ([state[@"inputBlocked"] boolValue]) return nil;
  if (!view.isFlipped) local.y = view.bounds.size.height - local.y;
  for (NSDictionary *hole in state[@"occlusions"]) if (NSPointInRect(local, rectangle(hole))) return nil;
  for (NSDictionary *panel in state[@"panels"]) if (NSPointInRect(local, rectangle(panel[@"edge"]))) return nil;
  struct objc_super parent = {self, class_getSuperclass(object_getClass(self))};
  NSView *hit = ((NSView *(*)(struct objc_super *, SEL, NSPoint))objc_msgSendSuper)(&parent, selector, point);
  if (hit && (NSApp.currentEvent.type == NSEventTypeLeftMouseDown || NSApp.currentEvent.type == NSEventTypeRightMouseDown)) {
    FocusCallback callback = (FocusCallback)[state[@"callback"] pointerValue];
    if (callback) callback([state[@"label"] UTF8String]);
  }
  return hit;
}
void qterm_cef_surface(void *pointer, const char *json, const char *label, FocusCallback callback) {
  NSView *view = (__bridge NSView *)pointer;
  if (!view || !NSThread.isMainThread) return;
  NSMutableDictionary *state = [[NSJSONSerialization JSONObjectWithData:[[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding] options:NSJSONReadingMutableContainers error:nil] mutableCopy];
  if (!state) return;
  state[@"label"] = [NSString stringWithUTF8String:label];
  state[@"callback"] = [NSValue valueWithPointer:callback];
  if (!objc_getAssociatedObject(view, &stateKey)) {
    Class original = object_getClass(view);
    NSString *name = [@"QtermCef_" stringByAppendingString:NSStringFromClass(original)];
    Class subclass = NSClassFromString(name);
    if (!subclass) {
      subclass = objc_allocateClassPair(original, name.UTF8String, 0);
      Method method = class_getInstanceMethod(original, @selector(hitTest:));
      class_addMethod(subclass, @selector(hitTest:), (IMP)hitTest, method_getTypeEncoding(method));
      objc_registerClassPair(subclass);
    }
    object_setClass(view, subclass);
  }
  objc_setAssociatedObject(view, &stateKey, state, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  // Clip out the union of holes; even-odd paths expose overlapping holes.
  CGFloat scale = view.window.backingScaleFactor ?: 1;
  size_t width = MAX(1, ceil(view.bounds.size.width * scale));
  size_t height = MAX(1, ceil(view.bounds.size.height * scale));
  CGContextRef maskContext = CGBitmapContextCreate(NULL, width, height, 8, width, NULL, kCGImageAlphaOnly);
  if (!maskContext) return;
  CGContextScaleCTM(maskContext, scale, scale);
  CGContextSetGrayFillColor(maskContext, 1, 1);
  CGContextFillRect(maskContext, view.bounds);
  NSMutableArray *holes = [state[@"occlusions"] mutableCopy] ?: [NSMutableArray array];
  for (NSDictionary *panel in state[@"panels"]) [holes addObject:panel[@"edge"]];
  for (NSDictionary *hole in holes) {
    NSRect rect = rectangle(hole);
    if (!view.isFlipped) rect.origin.y = view.bounds.size.height - NSMaxY(rect);
    CGContextClearRect(maskContext, rect);
  }
  view.wantsLayer = YES;
  CGImageRef image = CGBitmapContextCreateImage(maskContext);
  CALayer *mask = [CALayer layer];
  mask.frame = view.bounds; mask.contentsScale = scale;
  mask.contents = (__bridge id)image;
  view.layer.mask = mask;
  CGImageRelease(image); CGContextRelease(maskContext);
  if ([state[@"inputBlocked"] boolValue] || ![state[@"visible"] boolValue] || [state[@"covered"] boolValue]) {
    NSResponder *responder = view.window.firstResponder;
    if ([responder isKindOfClass:NSView.class] && [(NSView *)responder isDescendantOf:view]) [view.window makeFirstResponder:nil];
  }
  for (CALayer *layer in [view.layer.sublayers copy]) if ([layer.name isEqualToString:@"qterm-rim"]) [layer removeFromSuperlayer];
  NSDictionary *frame = state[@"frame"];
  if ([frame isKindOfClass:NSDictionary.class]) {
    CGFloat stroke = [frame[@"stroke"] doubleValue];
    CGRect rect = NSInsetRect(rectangle(frame), stroke/2, stroke/2);
    if (!view.isFlipped) rect.origin.y = view.bounds.size.height - CGRectGetMaxY(rect);
    CGFloat radius = MAX(0, [frame[@"radius"] doubleValue] - stroke/2);
    CGPathRef rim = CGPathCreateWithRoundedRect(rect,radius,radius,NULL);
    CAShapeLayer *border = [CAShapeLayer layer];
    NSArray *rgba = frame[@"color"];
    border.name = @"qterm-rim"; border.path = rim; border.fillColor = nil;
    border.strokeColor = [NSColor colorWithSRGBRed:[rgba[0] doubleValue]/255 green:[rgba[1] doubleValue]/255 blue:[rgba[2] doubleValue]/255 alpha:[rgba[3] doubleValue]/255].CGColor;
    border.lineWidth = stroke; border.zPosition = 100;
    [view.layer addSublayer:border]; CGPathRelease(rim);
  }
}
