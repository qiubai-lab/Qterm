use std::{env, path::PathBuf, process::Command};

pub fn build() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let root = PathBuf::from("src/infrastructure/web/macos/native");
    println!("cargo:rerun-if-changed={}", root.display());
    println!("cargo:rerun-if-env-changed=SDKROOT");
    println!("cargo:rerun-if-env-changed=DEVELOPER_DIR");
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let sdk =
        env::var("SDKROOT").unwrap_or_else(|_| probe(&["--sdk", "macosx", "--show-sdk-path"]));
    let compiler = probe(&["--find", "swiftc"]);
    let toolchain = PathBuf::from(&compiler)
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("lib/swift/macosx");
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        other => panic!("Unsupported macOS architecture: {other}"),
    };
    let mut sources: Vec<_> = std::fs::read_dir(&root)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "swift")
        })
        .collect();
    sources.sort();
    let policy = output.join("WebKitPolicy.o");
    let target = format!("{arch}-apple-macosx11.0");
    let compiled = Command::new(probe(&["--find", "clang"]))
        .args(["-target", &target, "-isysroot", &sdk, "-fobjc-arc", "-c"])
        .arg(root.join("WebKitPolicy.m"))
        .arg("-o")
        .arg(&policy)
        .status()
        .expect("Xcode Clang is required for the macOS browser policy bridge");
    assert!(
        compiled.success(),
        "macOS browser policy compilation failed"
    );
    let status = Command::new(compiler)
        .args([
            "-swift-version",
            "5",
            "-parse-as-library",
            "-emit-library",
            "-static",
            "-O",
            "-module-name",
            "QtermWeb",
        ])
        .args(["-target", &format!("{arch}-apple-macosx11.0"), "-sdk", &sdk])
        .args(["-import-objc-header"])
        .arg(root.join("WebKitPolicy.h"))
        .arg(policy)
        .args(sources)
        .arg("-o")
        .arg(output.join("libQtermWeb.a"))
        .status()
        .expect("Xcode Swift compiler is required for the macOS browser adapter");
    assert!(status.success(), "macOS browser adapter compilation failed");
    println!("cargo:rustc-link-search=native={}", output.display());
    println!("cargo:rustc-link-search=native={}", toolchain.display());
    println!("cargo:rustc-link-search=native={sdk}/usr/lib/swift");
    println!("cargo:rustc-link-lib=static=QtermWeb");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}
fn probe(args: &[&str]) -> String {
    let result = Command::new("xcrun")
        .args(args)
        .output()
        .expect("xcrun is required");
    assert!(
        result.status.success(),
        "xcrun failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    String::from_utf8(result.stdout).unwrap().trim().to_owned()
}
