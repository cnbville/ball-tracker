use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager, State,
};

const ESPN_BASE: &str = "https://site.api.espn.com/apis/site/v2/sports/football/";
const LEAGUES: [&str; 2] = ["college-football", "nfl"];
const ENDPOINTS: [&str; 2] = ["scoreboard", "summary"];

struct Http(reqwest::Client);
struct Tray(TrayIcon);

/// Fetches one ESPN feed. Only the scoreboard and summary endpoints of the two
/// football leagues are allowed, so the webview can't use this as an open proxy.
#[tauri::command]
async fn espn(
    http: State<'_, Http>,
    league: String,
    endpoint: String,
    query: Vec<(String, String)>,
) -> Result<serde_json::Value, String> {
    if !LEAGUES.contains(&league.as_str()) || !ENDPOINTS.contains(&endpoint.as_str()) {
        return Err(format!("unsupported feed {league}/{endpoint}"));
    }
    let url = format!("{ESPN_BASE}{league}/{endpoint}");
    let res = http
        .0
        .get(url)
        .query(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("ESPN answered {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

/// Shows text next to the menu bar icon, e.g. "OSU 24 PSU 21 · Q4 5:58".
/// An empty string clears it.
#[tauri::command]
fn set_menu_bar_score(tray: State<'_, Tray>, text: String) -> Result<(), String> {
    let title = if text.is_empty() { None } else { Some(text) };
    tray.0.set_title(title).map_err(|e| e.to_string())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("GridironLive/0.1")
        .build()
        .expect("http client");

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(Http(client))
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open Gridiron Live", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let tray = TrayIconBuilder::with_id("score")
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .icon_as_template(false)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            app.manage(Tray(tray));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![espn, set_menu_bar_score])
        .run(tauri::generate_context!())
        .expect("error while running Gridiron Live");
}
