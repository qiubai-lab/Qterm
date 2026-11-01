//! Bounded, cancellable directory export. Never follows links or opens devices.
use crate::{
    error::{ApiError, Result},
    transfer_lifecycle::Operation,
    transfers::MAX_TRANSFER_BYTES,
};
use std::{
    io::{self, Write},
    path::Path,
};

struct BoundedWriter<'a> {
    file: std::fs::File,
    bytes: u64,
    operation: &'a Operation,
}
impl Write for BoundedWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.operation
            .check()
            .map_err(|_| io::Error::other("transfer cancelled"))?;
        if self.bytes + bytes.len() as u64 > MAX_TRANSFER_BYTES {
            return Err(io::Error::other("目录归档超过 128 MiB"));
        }
        let written = self.file.write(bytes)?;
        self.bytes += written as u64;
        Ok(written)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}
pub fn pack(root: &Path, output: &Path, operation: &Operation) -> Result<()> {
    let writer = BoundedWriter {
        file: std::fs::File::create(output).map_err(|_| ApiError::storage())?,
        bytes: 0,
        operation,
    };
    let mut archive = tar::Builder::new(writer);
    archive.follow_symlinks(false);
    let mut pending = vec![(root.to_owned(), std::path::PathBuf::from("files"), 0)];
    let mut count = 0;
    while let Some((path, name, depth)) = pending.pop() {
        operation.check()?;
        count += 1;
        if count > 10000 || depth > 64 {
            return Err(ApiError::invalid());
        }
        let meta = std::fs::symlink_metadata(&path).map_err(|_| ApiError::storage())?;
        if meta.is_symlink() {
            continue;
        }
        if meta.is_dir() {
            archive
                .append_dir(&name, &path)
                .map_err(|_| ApiError::storage())?;
            for entry in std::fs::read_dir(&path).map_err(|_| ApiError::storage())? {
                let entry = entry.map_err(|_| ApiError::storage())?;
                if pending.len() + count >= 10000 {
                    return Err(ApiError::invalid());
                }
                pending.push((entry.path(), name.join(entry.file_name()), depth + 1));
            }
        } else if meta.is_file() {
            archive.append_path_with_name(&path, &name).map_err(|_| {
                ApiError::new(
                    axum::http::StatusCode::BAD_REQUEST,
                    "archiveFailed",
                    "目录归档失败、已取消或超过 128 MiB",
                )
            })?;
        }
    }
    archive.finish().map_err(|_| ApiError::storage())
}
