//! Service macOS « Envoyer à Atelier » (Atelier partout, lot 1).
//!
//! Info.plist déclare deux services sur le même message `sendToAtelier` :
//! l'un pour les fichiers et dossiers (Finder), l'autre pour le texte
//! sélectionné dans n'importe quelle app ; `NSUserData` dit lequel a servi.
//! Ce module ne fait que lire le presse-papiers que macOS nous tend et le
//! remettre à `on_send` ; la validation et la file vivent dans le crate
//! `atelier-inbox`, testé sous Linux.
//!
//! Le menu n'apparaît qu'après l'enregistrement du bundle par macOS (au
//! premier lancement d'Atelier.app depuis ~/Applications) ; pour forcer la
//! relecture : `/System/Library/CoreServices/pbs -update`.

use atelier_inbox::Payload;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject, NSObjectProtocol};
use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSPasteboard, NSPasteboardTypeFileURL, NSPasteboardTypeString, NSWorkspace,
};
use objc2_foundation::{NSArray, NSString};
use std::path::PathBuf;

/// Ce que le service remet à l'app : l'app d'origine (« Finder »,
/// « Safari »…) et le contenu validé.
pub type OnSend = Box<dyn Fn(Option<String>, Payload) + 'static>;

pub struct Ivars {
    on_send: OnSend,
}

define_class!(
    // SAFETY: NSObject n'impose rien de plus à une sous-classe ; on ne
    // surcharge pas `dealloc`.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "AtelierServicesProvider"]
    #[ivars = Ivars]
    pub struct ServicesProvider;

    unsafe impl NSObjectProtocol for ServicesProvider {}

    impl ServicesProvider {
        /// `- (void)sendToAtelier:(NSPasteboard *)pboard userData:(NSString *)userData error:(NSString **)error`
        #[unsafe(method(sendToAtelier:userData:error:))]
        fn send_to_atelier(&self, pboard: &NSPasteboard, user_data: Option<&NSString>, _error: *mut *mut NSString) {
            // Une panique ne doit jamais traverser la frontière Objective-C :
            // elle ferait avorter l'app entière.
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let wants = user_data.map(|value| value.to_string()).unwrap_or_default();
                let Some(payload) = read_payload(pboard, &wants) else { return };
                // Au moment de l'appel, l'app au premier plan est celle d'où
                // vient l'envoi : Atelier ne s'active qu'ensuite.
                let source = NSWorkspace::sharedWorkspace()
                    .frontmostApplication()
                    .and_then(|app| app.localizedName())
                    .map(|name| name.to_string());
                (self.ivars().on_send)(source, payload);
            }));
        }
    }
);

impl ServicesProvider {
    fn new(mtm: MainThreadMarker, on_send: OnSend) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(Ivars { on_send });
        // SAFETY: `init` de NSObject, sur une instance tout juste allouée.
        unsafe { msg_send![super(this), init] }
    }
}

fn read_payload(pboard: &NSPasteboard, wants: &str) -> Option<Payload> {
    let files = || atelier_inbox::files(file_paths(pboard));
    let text = || {
        // SAFETY: constante AppKit, valable toute la vie du processus.
        let string = pboard.stringForType(unsafe { NSPasteboardTypeString })?;
        atelier_inbox::text(&string.to_string(), None)
    };
    match wants {
        "text" => text(),
        "files" => files(),
        _ => files().or_else(text),
    }
}

/// Chemins posés par le Finder : un `public.file-url` par élément, et à
/// défaut l'ancienne liste `NSFilenamesPboardType`.
fn file_paths(pboard: &NSPasteboard) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(items) = pboard.pasteboardItems() {
        for item in items.iter() {
            // SAFETY: constante AppKit, valable toute la vie du processus.
            let Some(value) = item.stringForType(unsafe { NSPasteboardTypeFileURL }) else {
                continue;
            };
            if let Some(path) = url::Url::parse(&value.to_string())
                .ok()
                .and_then(|url| url.to_file_path().ok())
            {
                paths.push(path);
            }
        }
    }
    if paths.is_empty() {
        let legacy = NSString::from_str("NSFilenamesPboardType");
        if let Some(list) = pboard
            .propertyListForType(&legacy)
            .and_then(|value| value.downcast::<NSArray>().ok())
        {
            for entry in list.iter() {
                if let Some(name) = entry.downcast_ref::<NSString>() {
                    paths.push(PathBuf::from(name.to_string()));
                }
            }
        }
    }
    paths
}

/// Branche le fournisseur sur NSApp. À appeler une fois, sur le fil
/// principal (le `setup` de Tauri), avant que macOS ne livre un appel en
/// attente (lancement à froid par le service).
pub fn install(on_send: OnSend) {
    let Some(mtm) = MainThreadMarker::new() else {
        eprintln!("[services] install hors du fil principal : service non branché");
        return;
    };
    let provider = ServicesProvider::new(mtm, on_send);
    let object: &AnyObject = &provider;
    // SAFETY: le fournisseur répond au sélecteur que déclare Info.plist.
    unsafe { NSApplication::sharedApplication(mtm).setServicesProvider(Some(object)) };
    // NSApp ne retient pas son fournisseur : il doit vivre autant que l'app.
    std::mem::forget(provider);
}
