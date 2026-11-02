use super::model::{Event, now};
use std::{
    collections::VecDeque,
    fs::{self, File, OpenOptions},
    io::{self, BufRead, BufReader, Write},
    path::PathBuf,
};

const DAY: u64 = 86_400_000;
pub(super) const RETENTION: u64 = 30 * DAY;
const SEGMENT_BYTES: u64 = 5 * 1024 * 1024;
const TOTAL_BYTES: u64 = 50 * 1024 * 1024;

pub struct Storage {
    directory: PathBuf,
    current: Option<(PathBuf, File, u64, u64)>,
    pruned: bool,
    sequence: u64,
}
impl Storage {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            current: None,
            pruned: false,
            sequence: 0,
        }
    }
    fn prepare(&self) -> io::Result<()> {
        fs::create_dir_all(&self.directory)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.directory, fs::Permissions::from_mode(0o700))?;
        }
        Ok(())
    }
    fn segments(&self) -> io::Result<Vec<(PathBuf, u64, u64)>> {
        let mut files = Vec::new();
        for entry in fs::read_dir(&self.directory)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if !entry.file_type()?.is_file()
                || !name.starts_with("access-")
                || !name.ends_with(".jsonl")
            {
                continue;
            }
            let Some(created) = name
                .split('-')
                .nth(1)
                .and_then(|value| value.parse::<u64>().ok())
            else {
                continue;
            };
            files.push((entry.path(), created, entry.metadata()?.len()));
        }
        files.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(files)
    }
    pub fn load(&mut self) -> io::Result<(VecDeque<Event>, u64)> {
        self.prepare()?;
        self.prune(0)?;
        let mut events = VecDeque::new();
        let mut damaged = 0;
        for (path, _, _) in self.segments()? {
            if let Some(sequence) = path
                .file_name()
                .and_then(|name| name.to_str())
                .and_then(|name| name.split('-').nth(2))
                .and_then(|part| part.parse::<u64>().ok())
            {
                self.sequence = self.sequence.max(sequence);
            }
            // Segments are bounded; a truncated last record never joins a later append.
            let file = File::open(path)?;
            for line in BufReader::new(file).lines() {
                match line
                    .ok()
                    .and_then(|line| serde_json::from_str::<Event>(&line).ok())
                {
                    Some(event) if event.timestamp >= now().saturating_sub(RETENTION) => {
                        events.push_back(event)
                    }
                    Some(_) => {}
                    None => damaged += 1,
                }
            }
        }
        Ok((events, damaged))
    }
    pub fn append(&mut self, event: &Event) -> io::Result<()> {
        let mut bytes = serde_json::to_vec(event)?;
        bytes.push(b'\n');
        self.prepare()?;
        let timestamp = event.timestamp;
        if self.current.as_ref().is_none_or(|(_, _, size, day)| {
            size + bytes.len() as u64 > SEGMENT_BYTES || *day != timestamp / DAY
        }) {
            self.current = None;
            self.sequence += 1;
            let path = self.directory.join(format!(
                "access-{timestamp:020}-{:020}-{}.jsonl",
                self.sequence,
                uuid::Uuid::new_v4()
            ));
            let mut options = OpenOptions::new();
            options.create_new(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let file = options.open(&path)?;
            self.current = Some((path, file, 0, timestamp / DAY));
        }
        self.prune(bytes.len() as u64)?;
        let (_, file, size, _) = self.current.as_mut().unwrap();
        if let Err(error) = file.write_all(&bytes).and_then(|_| file.sync_data()) {
            // Never append after a possibly partial record.
            self.current = None;
            return Err(error);
        }
        *size += bytes.len() as u64;
        Ok(())
    }
    pub fn take_pruned(&mut self) -> bool {
        std::mem::take(&mut self.pruned)
    }
    pub fn prune(&mut self, incoming: u64) -> io::Result<()> {
        let files = self.segments()?;
        let mut total: u64 = files.iter().map(|(_, _, size)| size).sum::<u64>() + incoming;

        for (path, created, size) in files {
            let active = self
                .current
                .as_ref()
                .is_some_and(|(current, _, _, _)| *current == path);
            if created < now().saturating_sub(RETENTION) || (!active && total > TOTAL_BYTES) {
                if active {
                    self.current = None;
                }
                fs::remove_file(path)?;
                total = total.saturating_sub(size);
                self.pruned = true;
            }
        }
        Ok(())
    }
}
