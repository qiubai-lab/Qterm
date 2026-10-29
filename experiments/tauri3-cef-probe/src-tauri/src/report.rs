use std::io::Write;
pub fn emit(value: serde_json::Value) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "PROBE {value}");
    let _ = out.flush();
}
