use std::{env, path::PathBuf, process::Command};
pub fn build() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let source = "src/infrastructure/web_cef/surface.m";
    println!("cargo:rerun-if-changed={source}");
    println!("cargo:rerun-if-env-changed=SDKROOT");
    let sdk =
        env::var("SDKROOT").unwrap_or_else(|_| probe(&["--sdk", "macosx", "--show-sdk-path"]));
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        _ => panic!("unsupported architecture"),
    };
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("cef_surface.o");
    assert!(
        Command::new(probe(&["--find", "clang"]))
            .args([
                "-target",
                &format!("{arch}-apple-macosx11.0"),
                "-isysroot",
                &sdk,
                "-fobjc-arc",
                "-c",
                source,
                "-o"
            ])
            .arg(&output)
            .status()
            .expect("compile CEF surface")
            .success()
    );
    println!("cargo:rustc-link-arg={}", output.display());
    println!("cargo:rustc-link-lib=framework=QuartzCore");
}
fn probe(args: &[&str]) -> String {
    let result = Command::new("xcrun")
        .args(args)
        .output()
        .expect("Xcode tools");
    assert!(result.status.success(), "xcrun failed");
    String::from_utf8(result.stdout).unwrap().trim().into()
}
