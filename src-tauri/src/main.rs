// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Le renderer DMABUF de WebKitGTK casse-t-il sur cette machine ?
///
/// WebKitGTK copie chaque frame au compositeur via DMABUF quand la pile le
/// permet (Mesa sur AMD/Intel). Sur NVIDIA et dans les VM sans GPU hôte, ce
/// chemin produit des fenêtres blanches ou des crashs EGL sous Wayland : c'est
/// pour eux que le portage Linux livrait `WEBKIT_DISABLE_DMABUF_RENDERER=1` à
/// tout le monde, au prix du chemin rapide sur le matériel sain.
#[cfg(target_os = "linux")]
fn webkit_needs_dmabuf_workaround() -> bool {
    vendor_is_nvidia() || runs_in_virtual_machine()
}

/// Une carte graphique NVIDIA est présente (le vendor PCI est `0x10de`).
#[cfg(target_os = "linux")]
fn vendor_is_nvidia() -> bool {
    let Ok(entries) = std::fs::read_dir("/sys/class/drm") else {
        return false;
    };
    entries.flatten().any(|entry| {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // `card0`, `card1`… mais pas les connecteurs `card0-DP-1`.
        if !name.starts_with("card") || name.contains('-') {
            return false;
        }
        std::fs::read_to_string(entry.path().join("device/vendor"))
            .map(|vendor| vendor.trim().eq_ignore_ascii_case("0x10de"))
            .unwrap_or(false)
    })
}

/// VM sans GPU hôte (QEMU/KVM, VMware, VirtualBox, Parallels, bhyve) : le
/// renderer n'a que VirGL ou du logiciel derrière lui.
#[cfg(target_os = "linux")]
fn runs_in_virtual_machine() -> bool {
    let dmi = |name: &str| {
        std::fs::read_to_string(format!("/sys/class/dmi/id/{name}"))
            .unwrap_or_default()
            .to_lowercase()
    };
    let sys_vendor = dmi("sys_vendor");
    let product = dmi("product_name");
    ["qemu", "kvm", "vmware", "innotek", "parallels", "bhyve"]
        .iter()
        .any(|marker| sys_vendor.contains(marker))
        || product.contains("virtual machine")
        || product.contains("virtualbox")
}

fn main() {
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        && webkit_needs_dmabuf_workaround()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    // Lancée depuis le Finder, l'app hérite de `maxfiles 256` (launchd GUI) ;
    // les CLIs agents spawnes en héritent et finissent en EMFILE. À relever
    // avant tout spawn — les serveurs bundlés le refont pour leurs propres
    // lancements standalone.
    atelier_fdlimit::raise_nofile_limit();
    tauri_app_lib::run()
}
