//! One-time save destinations. Bounded chunks are staged beside the destination;
//! cancellation drops the staging file and never truncates an existing file.
use std::{collections::HashMap, path::PathBuf};
use tokio::io::AsyncWriteExt;

#[derive(Default)]
pub struct Downloads(tokio::sync::Mutex<HashMap<String, Sink>>);
struct Sink {
    destination: PathBuf,
    temporary: tempfile::NamedTempFile,
    file: tokio::fs::File,
}
impl Downloads {
    pub async fn select(&self, destination: PathBuf) -> Result<String, String> {
        let mut sinks = self.0.lock().await;
        if sinks.len() >= 16 {
            return Err("待保存的下载过多".into());
        }
        let sink = tokio::task::spawn_blocking(move || {
            let parent = destination.parent().ok_or("无效的保存位置")?;
            let temporary =
                tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建下载临时文件")?;
            let file =
                tokio::fs::File::from_std(temporary.reopen().map_err(|_| "无法打开下载临时文件")?);
            Ok::<_, String>(Sink {
                destination,
                temporary,
                file,
            })
        })
        .await
        .map_err(|_| "无法准备下载")??;
        let id = uuid::Uuid::new_v4().to_string();
        sinks.insert(id.clone(), sink);
        Ok(id)
    }
    pub async fn write(&self, id: &str, bytes: &[u8]) -> Result<(), String> {
        if bytes.len() > 256 * 1024 {
            return Err("下载分块过大".into());
        }
        let mut sinks = self.0.lock().await;
        let sink = sinks.get_mut(id).ok_or("下载已取消或已结束")?;
        sink.file
            .write_all(bytes)
            .await
            .map_err(|_| "写入下载文件失败".into())
    }
    pub async fn finish(&self, id: &str) -> Result<(), String> {
        let mut sinks = self.0.lock().await;
        let mut sink = sinks.remove(id).ok_or("下载已取消或已结束")?;
        sink.file.flush().await.map_err(|_| "保存下载文件失败")?;
        drop(sink.file);
        tokio::task::spawn_blocking(move || {
            sink.temporary
                .persist(sink.destination)
                .map(|_| ())
                .map_err(|_| "保存下载文件失败".to_string())
        })
        .await
        .map_err(|_| "保存下载文件失败")?
    }
    pub async fn cancel(&self, id: &str) {
        self.0.lock().await.remove(id);
    }
    pub async fn clear(&self) {
        self.0.lock().await.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn cancel_preserves_existing_destination_and_removes_partial_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("file");
        std::fs::write(&path, b"original").unwrap();
        let downloads = Downloads::default();
        let id = downloads.select(path.clone()).await.unwrap();
        downloads.write(&id, b"partial").await.unwrap();
        downloads.cancel(&id).await;
        assert!(downloads.finish(&id).await.is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[tokio::test]
    async fn streams_chunks_and_commits_only_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("file");
        let downloads = Downloads::default();
        let id = downloads.select(path.clone()).await.unwrap();
        assert!(
            downloads
                .write(&id, &vec![0; 256 * 1024 + 1])
                .await
                .is_err()
        );
        downloads.write(&id, b"one").await.unwrap();
        downloads.write(&id, b"two").await.unwrap();
        assert!(!path.exists());
        downloads.finish(&id).await.unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"onetwo");
        assert!(downloads.write(&id, b"late").await.is_err());
    }
}
