#[cfg(target_os = "macos")]
use core::ptr::NonNull;
#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2::{ffi::NSInteger, runtime::Bool, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::NSApplication;
#[cfg(target_os = "macos")]
use objc2_foundation::NSError;
#[cfg(target_os = "macos")]
use objc2_user_notifications::{
    UNAuthorizationOptions, UNNotificationSettings, UNUserNotificationCenter,
};

pub fn request_badge_authorization_native() {
    #[cfg(target_os = "macos")]
    {
        if let Some(mtm) = MainThreadMarker::new() {
            let app = NSApplication::sharedApplication(mtm);
            app.registerForRemoteNotifications();
        } else {
            eprintln!("atelier badge authorization skipped remote registration: not on main thread");
        }

        let center = UNUserNotificationCenter::currentNotificationCenter();
        let settings_block = RcBlock::new(|settings: NonNull<UNNotificationSettings>| {
            let settings = unsafe { settings.as_ref() };
            eprintln!(
                "atelier notification settings authorization={:?} badge={:?}",
                settings.authorizationStatus(),
                settings.badgeSetting()
            );
        });
        center.getNotificationSettingsWithCompletionHandler(&settings_block);

        let block = RcBlock::new(|granted: Bool, error: *mut NSError| {
            if let Some(error) = unsafe { error.as_ref() } {
                eprintln!("atelier badge authorization error: {error:?}");
            } else {
                eprintln!("atelier badge authorization granted={}", granted.as_bool());
            }
        });
        center.requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert | UNAuthorizationOptions::Badge | UNAuthorizationOptions::Sound,
            &block,
        );
    }
}

#[tauri::command]
pub fn request_badge_authorization() -> Result<(), String> {
    request_badge_authorization_native();
    Ok(())
}

#[tauri::command]
pub fn set_badge_count(count: i64) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let value: NSInteger = count.max(0).try_into().unwrap_or(NSInteger::MAX);
        let center = UNUserNotificationCenter::currentNotificationCenter();
        center.setBadgeCount_withCompletionHandler(value, None);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = count;

    Ok(())
}
