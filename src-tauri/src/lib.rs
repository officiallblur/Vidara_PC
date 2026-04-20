use std::{
    collections::HashMap,
    fs::File,
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    net::{TcpListener, TcpStream},
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
};

struct StreamState {
    port: u16,
    next_id: AtomicU64,
    paths: Mutex<HashMap<String, String>>,
}

static STREAM_STATE: OnceLock<Arc<StreamState>> = OnceLock::new();

fn detect_mime(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| v.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("m3u8") => "application/vnd.apple.mpegurl",
        Some("mpd") => "application/dash+xml",
        _ => "application/octet-stream",
    }
}

fn write_response_head(
    stream: &mut TcpStream,
    code: u16,
    reason: &str,
    headers: &[(&str, String)],
) -> std::io::Result<()> {
    write!(stream, "HTTP/1.1 {} {}\r\n", code, reason)?;
    write!(stream, "Connection: close\r\n")?;
    write!(stream, "Access-Control-Allow-Origin: *\r\n")?;
    write!(stream, "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n")?;
    write!(stream, "Access-Control-Allow-Headers: Range, Content-Type\r\n")?;
    write!(stream, "Access-Control-Expose-Headers: Accept-Ranges, Content-Length, Content-Range, Content-Type\r\n")?;
    for (k, v) in headers {
        write!(stream, "{}: {}\r\n", k, v)?;
    }
    write!(stream, "\r\n")?;
    Ok(())
}

fn write_text_response(
    stream: &mut TcpStream,
    code: u16,
    reason: &str,
    body: &str,
) -> std::io::Result<()> {
    write_response_head(
        stream,
        code,
        reason,
        &[
            ("Content-Type", "text/plain; charset=utf-8".to_string()),
            ("Content-Length", body.len().to_string()),
        ],
    )?;
    stream.write_all(body.as_bytes())
}

fn parse_range(header: &str, size: u64) -> Option<(u64, u64)> {
    let trimmed = header.trim();
    if !trimmed.starts_with("bytes=") {
        return None;
    }
    let range = &trimmed[6..];
    let (start_raw, end_raw) = range.split_once('-')?;

    if start_raw.is_empty() {
        let suffix_len: u64 = end_raw.parse().ok()?;
        if suffix_len == 0 || suffix_len > size {
            return None;
        }
        let start = size.saturating_sub(suffix_len);
        return Some((start, size.saturating_sub(1)));
    }

    let start: u64 = start_raw.parse().ok()?;
    if start >= size {
        return None;
    }

    if end_raw.is_empty() {
        return Some((start, size.saturating_sub(1)));
    }

    let end: u64 = end_raw.parse().ok()?;
    if end < start {
        return None;
    }

    Some((start, end.min(size.saturating_sub(1))))
}

fn stream_file_range(
    stream: &mut TcpStream,
    path: &str,
    start: u64,
    end: u64,
    total_size: u64,
) -> std::io::Result<()> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(start))?;
    let content_len = end.saturating_sub(start).saturating_add(1);

    write_response_head(
        stream,
        206,
        "Partial Content",
        &[
            ("Content-Type", detect_mime(path).to_string()),
            ("Accept-Ranges", "bytes".to_string()),
            ("Content-Length", content_len.to_string()),
            (
                "Content-Range",
                format!("bytes {}-{}/{}", start, end, total_size),
            ),
        ],
    )?;

    let mut remaining = content_len;
    let mut buffer = vec![0u8; 128 * 1024];
    while remaining > 0 {
        let chunk = remaining.min(buffer.len() as u64) as usize;
        let read = file.read(&mut buffer[..chunk])?;
        if read == 0 {
            break;
        }
        stream.write_all(&buffer[..read])?;
        remaining = remaining.saturating_sub(read as u64);
    }

    Ok(())
}

fn stream_file_full(stream: &mut TcpStream, path: &str, total_size: u64) -> std::io::Result<()> {
    let mut file = File::open(path)?;
    write_response_head(
        stream,
        200,
        "OK",
        &[
            ("Content-Type", detect_mime(path).to_string()),
            ("Accept-Ranges", "bytes".to_string()),
            ("Content-Length", total_size.to_string()),
        ],
    )?;

    let mut buffer = vec![0u8; 128 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        stream.write_all(&buffer[..read])?;
    }

    Ok(())
}

fn handle_stream_request(mut stream: TcpStream, state: Arc<StreamState>) {
    let mut reader = match stream.try_clone() {
        Ok(clone) => BufReader::new(clone),
        Err(_) => return,
    };

    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() || request_line.is_empty() {
        return;
    }

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();

    let mut range_header: Option<String> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).is_err() {
            return;
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((name, value)) = trimmed.split_once(':') {
            if name.eq_ignore_ascii_case("range") {
                range_header = Some(value.trim().to_string());
            }
        }
    }

    if method != "GET" {
        let _ = write_text_response(&mut stream, 405, "Method Not Allowed", "method not allowed");
        return;
    }

    if !path.starts_with("/video/") {
        let _ = write_text_response(&mut stream, 404, "Not Found", "not found");
        return;
    }

    let id = path.trim_start_matches("/video/").split('?').next().unwrap_or_default();
    if id.is_empty() {
        let _ = write_text_response(&mut stream, 400, "Bad Request", "missing id");
        return;
    }

    let local_path = {
        let map = state.paths.lock().ok();
        map.and_then(|m| m.get(id).cloned())
    };

    let Some(local_path) = local_path else {
        let _ = write_text_response(&mut stream, 404, "Not Found", "unknown video id");
        return;
    };

    let Ok(meta) = std::fs::metadata(&local_path) else {
        let _ = write_text_response(&mut stream, 404, "Not Found", "file not found");
        return;
    };
    let size = meta.len();

    if let Some(range_value) = range_header {
        if let Some((start, end)) = parse_range(&range_value, size) {
            let _ = stream_file_range(&mut stream, &local_path, start, end, size);
            return;
        }
        let _ = write_response_head(
            &mut stream,
            416,
            "Range Not Satisfiable",
            &[("Content-Range", format!("bytes */{}", size))],
        );
        return;
    }

    let _ = stream_file_full(&mut stream, &local_path, size);
}

fn ensure_stream_server() -> Result<Arc<StreamState>, String> {
    if let Some(existing) = STREAM_STATE.get() {
        return Ok(existing.clone());
    }

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("bind failed: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("addr failed: {e}"))?
        .port();

    let state = Arc::new(StreamState {
        port,
        next_id: AtomicU64::new(1),
        paths: Mutex::new(HashMap::new()),
    });

    let thread_state = state.clone();
    thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(stream) = incoming else {
                continue;
            };
            let per_request_state = thread_state.clone();
            thread::spawn(move || handle_stream_request(stream, per_request_state));
        }
    });

    let _ = STREAM_STATE.set(state.clone());
    Ok(state)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn log_player_error(payload: String) {
    println!("[player-error] {}", payload);
}

#[tauri::command]
fn get_local_stream_url(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("path is empty".into());
    }

    let state = ensure_stream_server()?;
    let id = state.next_id.fetch_add(1, Ordering::Relaxed).to_string();

    {
        let mut map = state
            .paths
            .lock()
            .map_err(|_| "failed to lock stream map".to_string())?;
        map.insert(id.clone(), path);
    }

    Ok(format!("http://127.0.0.1:{}/video/{}", state.port, id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            log_player_error,
            get_local_stream_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
