import AppKit
import WebKit
import QuartzCore

@available(macOS 14.0, *)
final class BrowserSurface: NSView {
    weak var owner: BrowserGuest?
    var inputBlocked = false
    var holes: [NSBezierPath] = []
    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? {
        let local = convert(point, from: superview)
        guard !isHidden, !inputBlocked, bounds.contains(local), !holes.contains(where: { $0.contains(local) }) else { return nil }
        if let event = NSApp.currentEvent, [.leftMouseDown, .rightMouseDown].contains(event.type), let owner = owner {
            emit("web-guest-focused", owner.id)
        }
        return super.hitTest(point)
    }
}

func rectangle(_ input: [String: Any]) -> CGRect {
    CGRect(x: input["x"] as? Double ?? 0, y: input["y"] as? Double ?? 0,
           width: input["width"] as? Double ?? 1, height: input["height"] as? Double ?? 1)
}

@available(macOS 14.0, *)
extension BrowserGuest {
    func sync(_ bounds: [String: Any]) throws {
        guard let parent = surface.superview else { throw BrowserError("网页已关闭") }
        let rect = rectangle(bounds)
        let y = parent.isFlipped ? rect.minY : parent.bounds.height - rect.maxY
        surface.frame = NSRect(x: rect.minX, y: y, width: rect.width, height: rect.height)
        web.frame = surface.bounds
        let blocked = bounds["inputBlocked"] as? Bool ?? false
        let hidden = !(bounds["visible"] as? Bool ?? false) || (bounds["covered"] as? Bool ?? false)
        if blocked || hidden { fileUpload.cancel() }
        if blocked || hidden, let responder = window?.firstResponder as? NSView,
           responder === web || responder.isDescendant(of: web) {
            // Main Tauri WKWebView is a sibling under the window content view.
            func hostWebView(_ view: NSView) -> NSView? {
                if view is BrowserSurface { return nil }
                if view is WKWebView { return view }
                return view.subviews.lazy.compactMap { hostWebView($0) }.first
            }
            let host = hostWebView(parent)
            window?.makeFirstResponder(host)
        }
        surface.inputBlocked = blocked
        surface.isHidden = hidden
        var mask = CGPath(rect: surface.bounds, transform: nil)
        surface.holes.removeAll()
        for hole in bounds["occlusions"] as? [[String: Any]] ?? [] {
            let rect = rectangle(hole)
            mask = mask.subtracting(CGPath(rect: rect, transform: nil))
            surface.holes.append(NSBezierPath(rect: rect))
        }
        for panel in bounds["panels"] as? [[String: Any]] ?? [] {
            guard let edge = panel["edge"] as? [String: Any] else { continue }
            let rect = rectangle(edge); let radius = edge["radius"] as? Double ?? 0
            mask = mask.subtracting(CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil))
            surface.holes.append(NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius))
        }
        surface.wantsLayer = true
        let layer = CAShapeLayer(); layer.path = mask; layer.fillColor = NSColor.white.cgColor
        surface.layer?.mask = layer
        // The host's rounded panels are revealed directly by their native mask.
        if let frame = bounds["frame"] as? [String: Any] {
            let border = CAShapeLayer()
            let stroke = frame["stroke"] as? Double ?? 0
            let radius = frame["radius"] as? Double ?? 0
            border.path = CGPath(roundedRect: rectangle(frame).insetBy(dx: stroke / 2, dy: stroke / 2),
                                 cornerWidth: max(0, radius - stroke / 2), cornerHeight: max(0, radius - stroke / 2), transform: nil)
            let rgba = frame["color"] as? [Double] ?? [0, 0, 0, 0]
            border.strokeColor = NSColor(srgbRed: rgba[0] / 255, green: rgba[1] / 255, blue: rgba[2] / 255, alpha: rgba[3] / 255).cgColor
            border.fillColor = nil; border.lineWidth = stroke; border.zPosition = 100
            surface.layer?.sublayers?.filter { $0.name == "qterm-rim" }.forEach { $0.removeFromSuperlayer() }
            border.name = "qterm-rim"; surface.layer?.addSublayer(border)
        } else { surface.layer?.sublayers?.filter { $0.name == "qterm-rim" }.forEach { $0.removeFromSuperlayer() } }
    }
}
