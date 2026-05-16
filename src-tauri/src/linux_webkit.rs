#[cfg(target_os = "linux")]
use std::env;

#[cfg(target_os = "linux")]
const OPT_OUT_ENV: &str = "AQBOT_DISABLE_LINUX_WEBKIT_WORKAROUNDS";
#[cfg(target_os = "linux")]
const DMABUF_ENV: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
#[cfg(target_os = "linux")]
const COMPOSITING_ENV: &str = "WEBKIT_DISABLE_COMPOSITING_MODE";
#[cfg(target_os = "linux")]
const XDG_SESSION_TYPE_ENV: &str = "XDG_SESSION_TYPE";

#[derive(Debug, PartialEq, Eq)]
enum WorkaroundDecision {
    DisableDmabufRenderer,
    Skip(SkipReason),
}

#[derive(Debug, PartialEq, Eq)]
enum SkipReason {
    OptedOut,
    UserConfiguredDmabuf,
    UserConfiguredCompositing,
    NotWayland,
}

#[cfg(target_os = "linux")]
pub fn apply_startup_workarounds() {
    let opt_out = env::var(OPT_OUT_ENV).ok();
    let user_configured_dmabuf = env::var_os(DMABUF_ENV).is_some();
    let user_configured_compositing = env::var_os(COMPOSITING_ENV).is_some();
    let session_type = env::var(XDG_SESSION_TYPE_ENV).ok();
    tracing::info!(
        opt_out = opt_out.as_deref().unwrap_or("<unset>"),
        user_configured_dmabuf,
        user_configured_compositing,
        session_type = session_type.as_deref().unwrap_or("<unset>"),
        "Evaluating Linux WebKitGTK startup workaround"
    );

    let decision = decide_workaround(
        opt_out.as_deref(),
        user_configured_dmabuf,
        user_configured_compositing,
        session_type.as_deref(),
    );

    match decision {
        WorkaroundDecision::DisableDmabufRenderer => {
            // This runs at process startup, before Tauri/WebKit initializes or
            // application threads are spawned.
            unsafe {
                env::set_var(DMABUF_ENV, "1");
            }
            tracing::info!("Enabled Linux WebKitGTK Wayland workaround: {DMABUF_ENV}=1");
        }
        WorkaroundDecision::Skip(reason) => {
            tracing::debug!("Skipped Linux WebKitGTK startup workaround: {reason:?}");
        }
    }
}

fn decide_workaround(
    opt_out: Option<&str>,
    user_configured_dmabuf: bool,
    user_configured_compositing: bool,
    session_type: Option<&str>,
) -> WorkaroundDecision {
    if opt_out.map(is_truthy).unwrap_or(false) {
        return WorkaroundDecision::Skip(SkipReason::OptedOut);
    }

    if user_configured_dmabuf {
        return WorkaroundDecision::Skip(SkipReason::UserConfiguredDmabuf);
    }

    if user_configured_compositing {
        return WorkaroundDecision::Skip(SkipReason::UserConfiguredCompositing);
    }

    if !session_type
        .map(|value| value.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
    {
        return WorkaroundDecision::Skip(SkipReason::NotWayland);
    }

    WorkaroundDecision::DisableDmabufRenderer
}

fn is_truthy(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

#[cfg(test)]
mod tests {
    use super::{decide_workaround, SkipReason, WorkaroundDecision};

    #[test]
    fn enables_dmabuf_workaround_for_wayland_by_default() {
        assert_eq!(
            decide_workaround(None, false, false, Some("wayland")),
            WorkaroundDecision::DisableDmabufRenderer
        );
    }

    #[test]
    fn keeps_existing_user_webkit_configuration() {
        assert_eq!(
            decide_workaround(None, true, false, Some("wayland")),
            WorkaroundDecision::Skip(SkipReason::UserConfiguredDmabuf)
        );
        assert_eq!(
            decide_workaround(None, false, true, Some("wayland")),
            WorkaroundDecision::Skip(SkipReason::UserConfiguredCompositing)
        );
    }

    #[test]
    fn supports_explicit_opt_out() {
        assert_eq!(
            decide_workaround(Some("1"), false, false, Some("wayland")),
            WorkaroundDecision::Skip(SkipReason::OptedOut)
        );
        assert_eq!(
            decide_workaround(Some("true"), false, false, Some("wayland")),
            WorkaroundDecision::Skip(SkipReason::OptedOut)
        );
    }

    #[test]
    fn skips_non_wayland_sessions() {
        assert_eq!(
            decide_workaround(None, false, false, Some("x11")),
            WorkaroundDecision::Skip(SkipReason::NotWayland)
        );
        assert_eq!(
            decide_workaround(None, false, false, None),
            WorkaroundDecision::Skip(SkipReason::NotWayland)
        );
    }
}
