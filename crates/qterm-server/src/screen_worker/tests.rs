use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::path::PathBuf;

fn worker() -> ScreenWorker {
    ScreenWorker {
        config: Config {
            worker: PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../src/server/screen/worker.mjs"),
            ..Default::default()
        },
        ..Default::default()
    }
}
fn write(worker: &ScreenWorker, id: &str, data: &[u8]) -> Value {
    worker
        .call(json!({"op":"write","id":id,"data":STANDARD.encode(data)}))
        .unwrap()
}
fn snapshot(worker: &ScreenWorker, id: &str) -> Value {
    worker.call(json!({"op":"snapshot","id":id})).unwrap()
}
fn kill(worker: &ScreenWorker) {
    worker
        .state
        .lock()
        .unwrap()
        .process
        .as_mut()
        .unwrap()
        .kill();
}

#[test]
fn crash_recovers_all_screens_checkpoint_tail_dimensions_cwd_and_partial_sequences() {
    let worker = worker();
    create(&worker, "first", 80, 24, None).unwrap();
    create(&worker, "second", 80, 24, None).unwrap();
    write(
        &worker,
        "first",
        "history\r\n\x1b[?1049h\x1b[2J\x1b[3;8H\x1b[31m中文 CLI\x1b[0m\x1b]7;file:///work\x07"
            .as_bytes(),
    );
    // Force a periodic checkpoint while an ANSI prefix is incomplete.
    for _ in 0..126 {
        write(&worker, "first", b"");
    }
    write(&worker, "first", b"\x1b[32");
    assert_eq!(
        worker.state.lock().unwrap().screens["first"].restore()["op"],
        "restore"
    );
    worker
        .call(json!({"op":"resize","id":"second","columns":100,"rows":30}))
        .unwrap();
    write(&worker, "second", b"other terminal");
    let first = snapshot(&worker, "first");
    let second = snapshot(&worker, "second");
    kill(&worker);
    assert_eq!(snapshot(&worker, "first"), first);
    assert_eq!(snapshot(&worker, "second"), second);
    write(&worker, "first", b"mGREEN");
    assert!(
        snapshot(&worker, "first")["data"]
            .as_str()
            .unwrap()
            .contains("GREEN")
    );
    let utf8 = "文".as_bytes();
    write(&worker, "second", &utf8[..2]);
    kill(&worker);
    write(&worker, "second", &utf8[2..]);
    assert!(
        snapshot(&worker, "second")["data"]
            .as_str()
            .unwrap()
            .contains("文")
    );
}

#[test]
fn rejected_request_and_repeated_destroy_do_not_poison_other_screens() {
    let worker = worker();
    create(&worker, "live", 80, 24, None).unwrap();
    write(&worker, "live", b"keep");
    assert!(
        worker
            .call(json!({"op":"snapshot","id":"missing"}))
            .is_err()
    );
    assert!(worker.call(json!({"op":"invalid","id":"live"})).is_err());
    for _ in 0..2 {
        worker.call(json!({"op":"destroy","id":"missing"})).unwrap();
    }
    assert!(
        snapshot(&worker, "live")["data"]
            .as_str()
            .unwrap()
            .contains("keep")
    );
    create(&worker, "new", 80, 24, None).unwrap();
}

#[test]
fn temporary_startup_failure_retains_offline_output_and_delivers_queries_only_once() {
    let mut worker = worker();
    let script = worker.config.worker.clone();
    create(&worker, "first", 80, 24, None).unwrap();
    assert_eq!(
        write(&worker, "first", b"old\x1b[6n")["responses"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    kill(&worker);
    worker.config.worker = script.with_file_name("missing-worker.mjs");
    assert!(
        worker
            .call(json!({"op":"write","id":"first","data":STANDARD.encode(b"new\x1b[6n")}))
            .is_err()
    );
    worker.config.worker = script;
    worker.state.lock().unwrap().retry_at = None;
    let result = snapshot(&worker, "first");
    assert!(result["data"].as_str().unwrap().contains("oldnew"));
    assert_eq!(result["responses"].as_array().unwrap().len(), 1);
    kill(&worker);
    assert_eq!(snapshot(&worker, "first")["responses"], json!([]));
    create(&worker, "new", 80, 24, None).unwrap();
}

#[test]
fn timeout_covers_a_worker_that_stops_reading_large_requests() {
    let dir = tempfile::tempdir().unwrap();
    let script = dir.path().join("hung.mjs");
    std::fs::write(&script, "setInterval(()=>{},1000);").unwrap();
    let config = Config {
        worker: script,
        timeout: Duration::from_millis(300),
        ..Default::default()
    };
    let mut process = Process::start(&config).unwrap();
    let start = Instant::now();
    assert!(matches!(
        process.call(&json!({"data":"x".repeat(1024 * 1024)})),
        Err(Failure::Timeout)
    ));
    drop(process);
    assert!(start.elapsed() < Duration::from_secs(3));
}

#[test]
fn an_operation_completed_before_a_crash_is_replayed_exactly_once() {
    let mut worker = worker();
    let dir = tempfile::tempdir().unwrap();
    let wrapper = dir.path().join("crash.mjs");
    let marker = dir.path().join("crashed");
    let script = url::Url::from_file_path(&worker.config.worker)
        .unwrap()
        .to_string();
    std::fs::write(
        &wrapper,
        format!(
            r#"
import {{existsSync,writeFileSync}} from 'node:fs';
const original=process.stdout.write.bind(process.stdout);
let count=0;
process.stdout.write=(chunk,...args)=>{{
  if (++count===2 && !existsSync({marker})) {{ writeFileSync({marker},'once'); process.exit(23); }}
  return original(chunk,...args);
}};
await import({script});
"#,
            marker = serde_json::to_string(&marker).unwrap(),
            script = json!(script)
        ),
    )
    .unwrap();
    worker.config.worker = wrapper;
    create(&worker, "first", 80, 24, None).unwrap();
    let result = write(&worker, "first", b"once\x1b[6n");
    assert_eq!(result["responses"].as_array().unwrap().len(), 1);
    assert_eq!(
        snapshot(&worker, "first")["data"]
            .as_str()
            .unwrap()
            .matches("once")
            .count(),
        1
    );
}

#[test]
fn rejected_replay_is_isolated_to_one_screen() {
    let mut worker = worker();
    let dir = tempfile::tempdir().unwrap();
    let script = dir.path().join("reject.mjs");
    std::fs::write(&script, r#"
import readline from 'node:readline';
const screens=new Map();
for await (const line of readline.createInterface({input:process.stdin})) {
  const r=JSON.parse(line);let result={ok:true};
  if(r.op==='create')screens.set(r.id,'');
  if(r.op==='write') {
    if(r.id==='bad')result={ok:false};
    else screens.set(r.id,screens.get(r.id)+Buffer.from(r.data,'base64').toString());
  }
  if(r.op==='snapshot')result={ok:true,data:screens.get(r.id),pending:'',columns:80,rows:24,cwd:null};
  process.stdout.write(JSON.stringify(result)+'\n');
}
"#).unwrap();
    worker.config.worker = script;
    create(&worker, "bad", 80, 24, None).unwrap();
    create(&worker, "good", 80, 24, None).unwrap();
    write(&worker, "good", b"retained");
    assert!(
        worker
            .call(json!({"op":"write","id":"bad","data":"eA=="}))
            .is_err()
    );
    worker.state.lock().unwrap().retry_at = None;
    assert_eq!(snapshot(&worker, "good")["data"], "retained");
    assert_eq!(
        worker
            .call(json!({"op":"snapshot","id":"bad"}))
            .unwrap_err()
            .code,
        "screenStateLost"
    );
    create(&worker, "new", 80, 24, None).unwrap();
}
