//! Remember file identity without holding an OS handle for every item in a directory drop.
use std::{fs::File, io, path::PathBuf, time::SystemTime};

pub(super) struct Source {
    path: PathBuf,
    identity: (u64, u64),
    modified: Option<SystemTime>,
    pub size: u64,
}

#[cfg(windows)]
fn identity(file: &File) -> io::Result<(u64, u64)> {
    let info = winapi_util::file::information(file)?;
    Ok((info.volume_serial_number(), info.file_index()))
}
#[cfg(unix)]
fn identity(file: &File) -> io::Result<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    let meta = file.metadata()?;
    Ok((meta.dev(), meta.ino()))
}

impl Source {
    pub fn capture(path: PathBuf) -> io::Result<Self> {
        let file = File::open(&path)?;
        let meta = file.metadata()?;
        Ok(Self {
            path,
            size: meta.len(),
            identity: identity(&file)?,
            modified: meta.modified().ok(),
        })
    }
    pub fn open(&self) -> Result<File, &'static str> {
        let meta = std::fs::symlink_metadata(&self.path).map_err(|_| "无法读取拖放文件")?;
        if !meta.is_file() {
            return Err("拖放文件已改变，请重新拖入");
        }
        let file = File::open(&self.path).map_err(|_| "无法打开拖放文件")?;
        let meta = file.metadata().map_err(|_| "无法读取文件信息")?;
        if identity(&file).ok() != Some(self.identity)
            || meta.len() != self.size
            || meta.modified().ok() != self.modified
        {
            return Err("拖放文件已改变，请重新拖入");
        }
        Ok(file)
    }
}
