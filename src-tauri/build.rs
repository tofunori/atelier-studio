fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=native/dictation.m");
        println!("cargo:rerun-if-changed=native/dictation_meter.h");
        cc::Build::new()
            .file("native/dictation.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("atelier_dictation");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=Speech");
    }
    tauri_build::build()
}
