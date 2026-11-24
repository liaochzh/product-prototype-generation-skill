import UIKit

// 一次性探针（scene 生命周期）：取 UIScreen / 安全区 / 状态栏 / reserved region（含 division 折痕带）
// 输出单行 `PROBE {json}` 并落 Documents/probe.json，随后自行退出。

@objc class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        w.rootViewController = UIViewController()
        w.makeKeyAndVisible()
        window = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.dump(ws) }
    }

    private func rect(_ r: CGRect) -> [String: Double] {
        ["x": Double(r.origin.x), "y": Double(r.origin.y),
         "w": Double(r.size.width), "h": Double(r.size.height)]
    }

    private func dump(_ scene: UIWindowScene) {
        var out: [String: Any] = [:]
        let screen = scene.screen
        out["screen.bounds"] = rect(screen.bounds)
        out["screen.nativeBounds"] = rect(screen.nativeBounds)
        out["screen.scale"] = Double(screen.scale)
        out["screen.nativeScale"] = Double(screen.nativeScale)
        out["scene.coordinateSpace.bounds"] = rect(scene.coordinateSpace.bounds)
        if let sb = scene.statusBarManager { out["scene.statusBarFrame"] = rect(sb.statusBarFrame) }
        out["scene.interfaceOrientation"] = scene.interfaceOrientation.rawValue
        out["scene.hCompact"] = scene.traitCollection.horizontalSizeClass == .compact
        out["scene.vCompact"] = scene.traitCollection.verticalSizeClass == .compact
        out["device.model"] = UIDevice.current.model
        out["device.systemVersion"] = UIDevice.current.systemVersion

        // 全部屏幕（折叠机的内屏可能是独立 UIScreen）
        var allScreens: [[String: Any]] = []
        for s in UIScreen.screens {
            var d: [String: Any] = [
                "bounds": rect(s.bounds),
                "nativeBounds": rect(s.nativeBounds),
                "scale": Double(s.scale),
                "nativeScale": Double(s.nativeScale),
                "fps": s.maximumFramesPerSecond,
                "mirrored": s.mirrored != nil,
                "isMain": s == scene.screen,
            ]
            if let m = s.mirrored { d["mirroredBounds"] = rect(m.bounds) }
            allScreens.append(d)
        }
        out["screens"] = allScreens
        out["screens.count"] = UIScreen.screens.count
        out["app.windows"] = UIApplication.shared.windows.map { rect($0.bounds) }
        out["app.connectedScenes"] = UIApplication.shared.connectedScenes.map { sc -> [String: Any] in
            var d: [String: Any] = ["activation": sc.activationState.rawValue]
            if let ws = sc as? UIWindowScene {
                d["bounds"] = rect(ws.coordinateSpace.bounds)
                d["screenBounds"] = rect(ws.screen.bounds)
                d["orientation"] = ws.interfaceOrientation.rawValue
            }
            return d
        }
        out["app.openSessions"] = UIApplication.shared.openSessions.map { s -> [String: Any] in
            ["role": s.role.rawValue]
        }

        if let win = window {
            out["window.bounds"] = rect(win.bounds)
            out["window.safeAreaInsets"] = [
                "top": Double(win.safeAreaInsets.top), "left": Double(win.safeAreaInsets.left),
                "bottom": Double(win.safeAreaInsets.bottom), "right": Double(win.safeAreaInsets.right),
            ]
            out["window.safeAreaLayoutGuide.frame"] = rect(win.safeAreaLayoutGuide.layoutFrame)

            // reserved region：division（折痕/分割带）与 occlusion，各取 active 与全量两种口径
            let selActive = NSSelectorFromString("reservedRegionsOfKind:")
            let selAll = NSSelectorFromString("reservedRegionsOfKind:options:")
            if win.responds(to: selActive) && win.responds(to: selAll),
               let kindCls = NSClassFromString("UIViewReservedRegionKind") as? NSObject.Type {
                for (name, kindSel) in [("division", "divisionRegionKind"), ("occlusion", "occlusionRegionKind")] {
                    guard let kind = kindCls.perform(NSSelectorFromString(kindSel))?.takeUnretainedValue() as? NSObject else { continue }
                    var collected: [String: [[String: Any]]] = [:]
                    for (tag, s) in [("active", selActive), ("all", selAll)] {
                        var regions: [AnyObject] = []
                        if tag == "active" {
                            regions = (win.perform(s, with: kind)?.takeUnretainedValue() as? [AnyObject]) ?? []
                        } else {
                            regions = (win.perform(s, with: kind, with: UInt(1))?.takeUnretainedValue() as? [AnyObject]) ?? []
                        }
                        var list: [[String: Any]] = []
                        for r in regions {
                            var d: [String: Any] = [:]
                            if let f = r.value(forKey: "frame") as? CGRect { d["frame"] = rect(f) }
                            if let m = r.value(forKey: "margins") as? UIEdgeInsets {
                                d["margins"] = ["top": Double(m.top), "left": Double(m.left),
                                                "bottom": Double(m.bottom), "right": Double(m.right)]
                            }
                            if let a = r.value(forKey: "active") as? Bool { d["active"] = a }
                            list.append(d)
                        }
                        collected[tag] = list
                    }
                    out["reserved.\(name)"] = collected
                }
            }
        }

        if let data = try? JSONSerialization.data(withJSONObject: out, options: [.sortedKeys]),
           let json = String(data: data, encoding: .utf8) {
            print("PROBE \(json)")
            fflush(stdout)
            if let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                try? json.write(to: dir.appendingPathComponent("probe.json"), atomically: true, encoding: .utf8)
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { exit(0) }
    }
}

@objc class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        true
    }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))