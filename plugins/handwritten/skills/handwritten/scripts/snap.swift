// PNG-снимок листа через системный WebKit (macOS), без внешних браузеров.
// snap <file.html> <out.png> [scale] [preview-dir]
// Ждёт body[data-ready], берёт размер листа из body[data-w|data-h], печатает JSON с размером и warn.
// preview-dir: для длинного листа (выше 1300px) ещё и куски по 1000px в масштабе 1 - их удобно смотреть глазами.
import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: snap <file.html> <out.png> [scale]\n".data(using: .utf8)!)
    exit(2)
}
let src = URL(fileURLWithPath: args[1]).standardizedFileURL
let out = URL(fileURLWithPath: args[2])
let scale = args.count > 3 ? CGFloat(Double(args[3]) ?? 2) : 2
let previewDir = args.count > 4 ? URL(fileURLWithPath: args[4]) : nil

func fail(_ m: String) -> Never {
    FileHandle.standardError.write((m + "\n").data(using: .utf8)!)
    exit(1)
}

final class Snapper: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    let window: NSWindow
    let web: WKWebView
    var started = Date()

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.addUserScript(WKUserScript(
            source: "document.documentElement.classList.add('render')",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // ошибки страницы -> stderr, чтобы было видно, почему движок не дошёл до конца
        cfg.userContentController.addUserScript(WKUserScript(
            source: """
            (() => { const post = (m) => { try { webkit.messageHandlers.log.postMessage(String(m)); } catch (e) {} };
              addEventListener('error', (e) => post('error: ' + (e.message || (e.target && (e.target.src || e.target.href)) || e)), true);
              addEventListener('unhandledrejection', (e) => post('rejection: ' + e.reason));
              const w = console.warn; console.warn = (...a) => { post('warn: ' + a.join(' ')); w.apply(console, a); }; })();
            """,
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let frame = NSRect(x: 0, y: 0, width: 2400, height: 1600)
        web = WKWebView(frame: frame, configuration: cfg)
        window = NSWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
        super.init()
        cfg.userContentController.add(self, name: "log")
        window.contentView = web
        window.setFrameOrigin(NSPoint(x: -30000, y: -30000))
        window.orderBack(nil)
        web.navigationDelegate = self
        web.loadFileURL(src, allowingReadAccessTo: src.deletingLastPathComponent())
    }

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        FileHandle.standardError.write("[page] \(m.body)\n".data(using: .utf8)!)
    }

    func webView(_ w: WKWebView, didFinish navigation: WKNavigation!) { started = Date(); poll() }
    func webView(_ w: WKWebView, didFail navigation: WKNavigation!, withError e: Error) { fail("load: \(e)") }
    func webView(_ w: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError e: Error) { fail("load: \(e)") }

    func poll() {
        web.evaluateJavaScript("document.body && document.body.dataset.ready ? JSON.stringify(document.body.dataset) : ''") { res, _ in
            guard let s = res as? String, !s.isEmpty,
                  let d = try? JSONSerialization.jsonObject(with: s.data(using: .utf8)!) as? [String: String],
                  let w = Double(d["w"] ?? ""), let h = Double(d["h"] ?? "") else {
                if Date().timeIntervalSince(self.started) > 40 {
                    self.web.evaluateJavaScript("JSON.stringify({state: document.readyState, rough: !!window.rough, notation: !!window.RoughNotation, fonts: document.fonts.status})") { r, _ in
                        fail("timeout: движок не выставил data-ready \(r ?? "")")
                    }
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.poll() }
                return
            }
            FileHandle.standardError.write("[snap] sheet \(Int(w))x\(Int(h))\n".data(using: .utf8)!)
            if w * h > 40_000_000 { fail("лист слишком большой: \(Int(w))x\(Int(h)) css px - скорее всего что-то в разметке растянулось") }
            self.shoot(w: w, h: h, warn: d["warn"] ?? "")
        }
    }

    func shoot(w: Double, h: Double, warn: String) {
        let size = NSSize(width: w, height: h)
        window.setContentSize(size)
        web.setFrameSize(size)
        // даём WebKit перерисоваться в новом размере
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            let conf = WKSnapshotConfiguration()
            conf.rect = NSRect(origin: .zero, size: size)
            conf.snapshotWidth = NSNumber(value: w * Double(scale) / Double(self.window.backingScaleFactor))
            self.web.takeSnapshot(with: conf) { img, err in
                guard let img = img, let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fail("snapshot: \(String(describing: err))") }
                let rep = NSBitmapImageRep(cgImage: cg)
                guard let data = rep.representation(using: .png, properties: [:]) else { fail("png encode") }
                do { try data.write(to: out) } catch { fail("write: \(error)") }
                self.tiles(w: w, h: h) { paths in
                    let info: [String: Any] = ["png": out.path, "w": Int(w), "h": Int(h), "px_w": cg.width, "px_h": cg.height, "warn": warn, "tiles": paths]
                    let json = try! JSONSerialization.data(withJSONObject: info)
                    print(String(data: json, encoding: .utf8)!)
                    exit(0)
                }
            }
        }
    }

    func tiles(w: Double, h: Double, done: @escaping ([String]) -> Void) {
        guard let dir = previewDir, h > 1300 || w > 1800 else { done([]); return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let stem = out.deletingPathExtension().lastPathComponent
        // сетка кусков: по высоте 1000, по ширине 1600 (широкий board режем и по горизонтали)
        let th = 1000.0, tw = w > 1800 ? 1600.0 : w, overlap = 60.0
        func starts(_ total: Double, _ size: Double) -> [Double] {
            var v: [Double] = [], p = 0.0
            while true { v.append(p); if p + size >= total { break }; p += size - overlap }
            return v
        }
        var rects: [NSRect] = []
        for y in starts(h, th) { for x in starts(w, tw) { rects.append(NSRect(x: x, y: y, width: min(tw, w - x), height: min(th, h - y))) } }
        var paths: [String] = []
        func next(_ i: Int) {
            if i >= rects.count { done(paths); return }
            let conf = WKSnapshotConfiguration()
            conf.rect = rects[i]
            conf.snapshotWidth = NSNumber(value: Double(rects[i].width) / Double(window.backingScaleFactor))
            web.takeSnapshot(with: conf) { img, _ in
                if let cg = img?.cgImage(forProposedRect: nil, context: nil, hints: nil),
                   let data = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]) {
                    let u = dir.appendingPathComponent("\(stem)-\(i + 1).png")
                    if (try? data.write(to: u)) != nil { paths.append(u.path) }
                }
                next(i + 1)
            }
        }
        next(0)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let snapper = Snapper()
DispatchQueue.main.asyncAfter(deadline: .now() + 90) { fail("global timeout") }
app.run()
