//! Build script to embed the version at build time.

fn main() {
    let version = std::process::Command::new("../scripts/get-version.sh")
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|s| s.trim().to_owned())
        .unwrap_or_else(|| "unknown".to_owned());

    println!("cargo:rustc-env=GIT_VERSION={version}");
}
