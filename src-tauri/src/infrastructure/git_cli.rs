use std::{
    ffi::{OsStr, OsString},
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use crate::{
    domain::git::{
        GitBranch, GitBranchKind, GitChange, GitCommit, GitCommitFile, GitError, GitHead,
        GitSnapshot, find_tracking_local_branch, validate_branch_source_ref,
        validate_local_branch_ref, validate_remote_branch_ref, validate_remote_name,
    },
    ports::git_executor::GitExecutor,
};

const READ_TIMEOUT: Duration = Duration::from_secs(10);
const MUTATION_TIMEOUT: Duration = Duration::from_secs(60);
const FETCH_TIMEOUT: Duration = Duration::from_secs(120);
const OUTPUT_LIMIT: usize = 8 * 1024 * 1024;

pub struct SystemGitExecutor {
    executable: Option<PathBuf>,
}

struct ProcessOutput {
    stdout: Vec<u8>,
}

impl SystemGitExecutor {
    pub fn discover() -> Self {
        let executable = candidates().into_iter().find(|candidate| {
            run_process(candidate, [OsStr::new("--version")], Duration::from_secs(2)).is_ok()
        });
        Self { executable }
    }

    #[cfg(test)]
    fn with_executable(executable: PathBuf) -> Self {
        Self {
            executable: Some(executable),
        }
    }

    fn git<I, S>(&self, args: I, timeout: Duration) -> Result<ProcessOutput, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let executable = self.executable.as_ref().ok_or(GitError::Missing)?;
        run_process(executable, args, timeout)
    }

    fn repository_root(&self, path: &Path) -> Result<PathBuf, GitError> {
        if !path.is_dir() {
            return Err(GitError::InvalidPath);
        }
        let output = self.git(
            [
                OsString::from("-C"),
                path.as_os_str().to_owned(),
                OsString::from("rev-parse"),
                OsString::from("--show-toplevel"),
            ],
            READ_TIMEOUT,
        )?;
        let root = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        if root.is_empty() {
            return Err(GitError::NotRepository);
        }
        Ok(PathBuf::from(root))
    }

    fn mutate<I, S>(&self, repository: &Path, args: I) -> Result<GitSnapshot, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = vec![OsString::from("-C"), repository.as_os_str().to_owned()];
        command.extend(args.into_iter().map(|value| value.as_ref().to_owned()));
        self.git(command, MUTATION_TIMEOUT)?;
        self.snapshot(repository)
    }

    fn network_mutate<I, S>(&self, repository: &Path, args: I) -> Result<GitSnapshot, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let repository = self.repository_root(repository)?;
        let mut command = vec![OsString::from("-C"), repository.as_os_str().to_owned()];
        command.extend(args.into_iter().map(|value| value.as_ref().to_owned()));
        self.git(command, FETCH_TIMEOUT)?;
        self.snapshot(&repository)
    }

    fn has_head(&self, repository: &Path) -> bool {
        self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("rev-parse"),
                OsString::from("--verify"),
                OsString::from("HEAD"),
            ],
            READ_TIMEOUT,
        )
        .is_ok()
    }
}

impl GitExecutor for SystemGitExecutor {
    fn available(&self) -> bool {
        self.executable.is_some()
    }

    fn snapshot(&self, path: &Path) -> Result<GitSnapshot, GitError> {
        let repository = self.repository_root(path)?;
        let status = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("status"),
                OsString::from("--porcelain=v2"),
                OsString::from("-z"),
                OsString::from("--branch"),
                OsString::from("--untracked-files=all"),
            ],
            READ_TIMEOUT,
        )?;
        let branches = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("for-each-ref"),
                OsString::from(
                    "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(upstream)%00%(symref)",
                ),
                OsString::from("refs/heads/"),
                OsString::from("refs/remotes/"),
            ],
            READ_TIMEOUT,
        )?;
        let remotes = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("remote"),
            ],
            READ_TIMEOUT,
        )?;
        let log = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("log"),
                OsString::from("--all"),
                OsString::from("--topo-order"),
                OsString::from("--decorate=short"),
                OsString::from("-n"),
                OsString::from("100"),
                OsString::from("--format=%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%at%x1f%b%x1e"),
            ],
            READ_TIMEOUT,
        );
        let (head, changes) = parse_status(&status.stdout)?;
        let commits = match log {
            Ok(output) => parse_commits(&output.stdout),
            Err(GitError::CommandFailed(_)) if head.unborn => Vec::new(),
            Err(error) => return Err(error),
        };
        let repository_path = repository.to_string_lossy().into_owned();
        let repository_name = repository
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or(&repository_path)
            .to_owned();
        Ok(GitSnapshot {
            repository_path,
            repository_name,
            head,
            changes,
            branches: parse_branches(&branches.stdout),
            remotes: parse_remotes(&remotes.stdout),
            commits,
        })
    }

    fn initialize(&self, path: &Path) -> Result<GitSnapshot, GitError> {
        if !path.is_dir() {
            return Err(GitError::InvalidPath);
        }
        self.git(
            [
                OsString::from("-C"),
                path.as_os_str().to_owned(),
                OsString::from("init"),
            ],
            MUTATION_TIMEOUT,
        )?;
        self.snapshot(path)
    }

    fn stage(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError> {
        let mut args = vec![OsString::from("add"), OsString::from("--")];
        args.extend(paths.iter().map(OsString::from));
        self.mutate(repository, args)
    }

    fn stage_all(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        self.mutate(repository, ["add", "-A", "--"])
    }

    fn unstage(&self, repository: &Path, paths: &[String]) -> Result<GitSnapshot, GitError> {
        let mut args = if self.has_head(repository) {
            vec![
                OsString::from("reset"),
                OsString::from("-q"),
                OsString::from("HEAD"),
                OsString::from("--"),
            ]
        } else {
            vec![
                OsString::from("rm"),
                OsString::from("--cached"),
                OsString::from("-q"),
                OsString::from("--"),
            ]
        };
        args.extend(paths.iter().map(OsString::from));
        self.mutate(repository, args)
    }

    fn unstage_all(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        if self.has_head(repository) {
            self.mutate(repository, ["reset", "-q", "HEAD", "--"])
        } else {
            self.mutate(repository, ["rm", "--cached", "-r", "-q", "--", "."])
        }
    }

    fn commit(&self, repository: &Path, message: &str) -> Result<GitSnapshot, GitError> {
        self.mutate(
            repository,
            [OsStr::new("commit"), OsStr::new("-m"), OsStr::new(message)],
        )
    }

    fn commit_files(&self, repository: &Path, oid: &str) -> Result<Vec<GitCommitFile>, GitError> {
        let output = self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("diff-tree"),
                OsString::from("--root"),
                OsString::from("--first-parent"),
                OsString::from("--no-commit-id"),
                OsString::from("--name-status"),
                OsString::from("-r"),
                OsString::from("-z"),
                OsString::from("-M"),
                OsString::from("-C"),
                OsString::from(oid),
            ],
            READ_TIMEOUT,
        )?;
        Ok(parse_commit_files(&output.stdout))
    }

    fn create_branch(&self, repository: &Path, name: &str) -> Result<GitSnapshot, GitError> {
        self.mutate(
            repository,
            [OsStr::new("switch"), OsStr::new("-c"), OsStr::new(name)],
        )
    }

    fn create_branch_from(
        &self,
        repository: &Path,
        name: &str,
        source_ref: &str,
    ) -> Result<GitSnapshot, GitError> {
        validate_branch_source_ref(source_ref)?;
        let current = self.snapshot(repository)?;
        if !current
            .branches
            .iter()
            .any(|branch| branch.ref_name == source_ref)
        {
            return Err(GitError::InvalidInput);
        }
        self.mutate(
            repository,
            [
                OsStr::new("switch"),
                OsStr::new("--no-track"),
                OsStr::new("-c"),
                OsStr::new(name),
                OsStr::new(source_ref),
            ],
        )
    }

    fn rename_branch(
        &self,
        repository: &Path,
        ref_name: &str,
        new_name: &str,
    ) -> Result<GitSnapshot, GitError> {
        validate_local_branch_ref(ref_name)?;
        let current = self.snapshot(repository)?;
        let old_name = local_branch(&current, ref_name)?.name.clone();
        self.mutate(
            repository,
            [
                OsStr::new("branch"),
                OsStr::new("-m"),
                OsStr::new(&old_name),
                OsStr::new(new_name),
            ],
        )
    }

    fn delete_branch(&self, repository: &Path, ref_name: &str) -> Result<GitSnapshot, GitError> {
        validate_local_branch_ref(ref_name)?;
        let current = self.snapshot(repository)?;
        let branch = local_branch(&current, ref_name)?;
        if branch.current {
            return Err(GitError::Conflict("不能删除当前分支".into()));
        }
        let name = branch.name.clone();
        self.mutate(
            repository,
            [OsStr::new("branch"), OsStr::new("-d"), OsStr::new(&name)],
        )
    }

    fn switch_branch(&self, repository: &Path, name: &str) -> Result<GitSnapshot, GitError> {
        self.mutate(repository, [OsStr::new("switch"), OsStr::new(name)])
    }

    fn fetch(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        let repository = self.repository_root(repository)?;
        self.git(
            [
                OsString::from("-C"),
                repository.as_os_str().to_owned(),
                OsString::from("fetch"),
                OsString::from("--all"),
                OsString::from("--prune"),
                OsString::from("--no-recurse-submodules"),
            ],
            FETCH_TIMEOUT,
        )?;
        self.snapshot(&repository)
    }

    fn pull(&self, repository: &Path) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        let (_, remote, target_ref) = current_tracking(&current)?;
        self.network_mutate(
            repository,
            [
                OsStr::new("pull"),
                OsStr::new("--ff-only"),
                OsStr::new("--no-rebase"),
                OsStr::new("--no-recurse-submodules"),
                OsStr::new(&remote),
                OsStr::new(&target_ref),
            ],
        )
    }

    fn push(&self, repository: &Path, remote: Option<&str>) -> Result<GitSnapshot, GitError> {
        let current = self.snapshot(repository)?;
        let branch = current_local_branch(&current)?;
        let local_ref = branch.ref_name.clone();
        let (remote, target_ref, publish) = if let Some(remote) = remote {
            validate_remote_name(remote)?;
            if !current.remotes.iter().any(|candidate| candidate == remote) {
                return Err(GitError::InvalidInput);
            }
            (remote.to_owned(), local_ref.clone(), true)
        } else {
            let (_, remote, target_ref) = current_tracking(&current)?;
            (remote, target_ref, false)
        };
        let refspec = format!("{local_ref}:{target_ref}");
        if publish {
            self.network_mutate(
                repository,
                [
                    OsStr::new("push"),
                    OsStr::new("--set-upstream"),
                    OsStr::new(&remote),
                    OsStr::new(&refspec),
                ],
            )
        } else {
            self.network_mutate(
                repository,
                [
                    OsStr::new("push"),
                    OsStr::new(&remote),
                    OsStr::new(&refspec),
                ],
            )
        }
    }

    fn track_remote_branch(
        &self,
        repository: &Path,
        ref_name: &str,
    ) -> Result<GitSnapshot, GitError> {
        validate_remote_branch_ref(ref_name)?;
        let snapshot = self.snapshot(repository)?;
        if let Some(local) = find_tracking_local_branch(&snapshot.branches, ref_name) {
            return self.switch_branch(repository, &local.name);
        }
        let remote_name = snapshot
            .branches
            .iter()
            .find(|branch| branch.kind == GitBranchKind::Remote && branch.ref_name == ref_name)
            .map(|branch| branch.name.clone())
            .ok_or(GitError::InvalidInput)?;
        self.mutate(
            repository,
            [
                OsStr::new("switch"),
                OsStr::new("--track"),
                OsStr::new(&remote_name),
            ],
        )
    }
}

fn local_branch<'a>(snapshot: &'a GitSnapshot, ref_name: &str) -> Result<&'a GitBranch, GitError> {
    snapshot
        .branches
        .iter()
        .find(|branch| branch.kind == GitBranchKind::Local && branch.ref_name == ref_name)
        .ok_or(GitError::InvalidInput)
}

fn current_local_branch(snapshot: &GitSnapshot) -> Result<&GitBranch, GitError> {
    if snapshot.head.detached || snapshot.head.unborn {
        return Err(GitError::Conflict(
            "当前 HEAD 未指向可同步的本地分支".into(),
        ));
    }
    snapshot
        .branches
        .iter()
        .find(|branch| branch.kind == GitBranchKind::Local && branch.current)
        .ok_or_else(|| GitError::Conflict("当前 HEAD 未指向可同步的本地分支".into()))
}

fn current_tracking(snapshot: &GitSnapshot) -> Result<(String, String, String), GitError> {
    let branch = current_local_branch(snapshot)?;
    let upstream_ref = branch
        .upstream_ref
        .as_deref()
        .ok_or_else(|| GitError::Conflict("当前分支尚未设置 upstream".into()))?;
    let mut remotes = snapshot.remotes.iter().collect::<Vec<_>>();
    remotes.sort_by_key(|remote| std::cmp::Reverse(remote.len()));
    for remote in remotes {
        let prefix = format!("refs/remotes/{remote}/");
        if let Some(target) = upstream_ref.strip_prefix(&prefix) {
            validate_remote_name(remote)?;
            crate::domain::git::validate_branch_name(target)?;
            return Ok((
                branch.ref_name.clone(),
                remote.clone(),
                format!("refs/heads/{target}"),
            ));
        }
    }
    Err(GitError::Conflict("当前分支的 upstream 无法解析".into()))
}

fn parse_remotes(bytes: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .filter(|name| validate_remote_name(name).is_ok())
        .map(str::to_owned)
        .collect()
}

fn candidates() -> Vec<PathBuf> {
    let mut values = Vec::new();
    if let Some(configured) = std::env::var_os("QTERM_GIT_PATH") {
        values.push(PathBuf::from(configured));
    }
    values.push(PathBuf::from(if cfg!(windows) { "git.exe" } else { "git" }));
    if cfg!(windows) {
        for variable in [
            "ProgramW6432",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "LocalAppData",
        ] {
            if let Some(root) = std::env::var_os(variable) {
                let root = PathBuf::from(root);
                values.push(if variable == "LocalAppData" {
                    root.join("Programs/Git/cmd/git.exe")
                } else {
                    root.join("Git/cmd/git.exe")
                });
            }
        }
    } else {
        values.extend(
            [
                "/usr/bin/git",
                "/usr/local/bin/git",
                "/opt/homebrew/bin/git",
            ]
            .map(PathBuf::from),
        );
    }
    values
}

fn run_process<I, S>(
    executable: &Path,
    args: I,
    timeout: Duration,
) -> Result<ProcessOutput, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut child = Command::new(executable)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .env("GIT_PAGER", "cat")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GitError::Missing
            } else {
                GitError::Io
            }
        })?;
    let stdout = child.stdout.take().ok_or(GitError::Io)?;
    let stderr = child.stderr.take().ok_or(GitError::Io)?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout));
    let stderr_reader = thread::spawn(move || read_bounded(stderr));
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait().map_err(|_| GitError::Io)? {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(GitError::Timeout);
            }
            None => thread::sleep(Duration::from_millis(10)),
        }
    };
    let stdout = stdout_reader.join().map_err(|_| GitError::Io)??;
    let stderr = stderr_reader.join().map_err(|_| GitError::Io)??;
    if !status.success() {
        return Err(classify_failure(&stderr));
    }
    Ok(ProcessOutput { stdout })
}

fn read_bounded(mut reader: impl Read) -> Result<Vec<u8>, GitError> {
    let mut result = Vec::new();
    let mut buffer = [0_u8; 8192];
    let mut exceeded = false;
    loop {
        let read = reader.read(&mut buffer).map_err(|_| GitError::Io)?;
        if read == 0 {
            break;
        }
        if result.len() + read <= OUTPUT_LIMIT {
            result.extend_from_slice(&buffer[..read]);
        } else {
            exceeded = true;
        }
    }
    if exceeded {
        Err(GitError::OutputTooLarge)
    } else {
        Ok(result)
    }
}

pub(crate) fn classify_failure(stderr: &[u8]) -> GitError {
    let raw = String::from_utf8_lossy(stderr);
    let sanitized = redact_url_userinfo(raw.trim());
    let detail = sanitized.chars().take(1200).collect::<String>();
    let lower = detail.to_ascii_lowercase();
    if lower.contains("not a git repository") {
        GitError::NotRepository
    } else if lower.contains("dubious ownership") || lower.contains("safe.directory") {
        GitError::Conflict("仓库所有权未被 Git 信任，请先在终端配置 safe.directory".into())
    } else if lower.contains("would be overwritten")
        || lower.contains("resolve your current index first")
    {
        GitError::Conflict(detail)
    } else {
        GitError::CommandFailed(detail)
    }
}

pub(crate) fn redact_url_userinfo(value: &str) -> String {
    let mut result = value.to_owned();
    let mut search_from = 0;
    loop {
        let lower = result.to_ascii_lowercase();
        let match_index = ["https://", "http://", "ssh://"]
            .iter()
            .filter_map(|scheme| {
                lower[search_from..]
                    .find(scheme)
                    .map(|index| search_from + index)
            })
            .min();
        let Some(scheme_start) = match_index else {
            break;
        };
        let authority_start = result[scheme_start..]
            .find("://")
            .map(|index| scheme_start + index + 3)
            .unwrap_or(result.len());
        let authority_end = result[authority_start..]
            .find(|character: char| {
                character == '/'
                    || character.is_whitespace()
                    || matches!(character, '\'' | '"' | ')' | ']')
            })
            .map(|index| authority_start + index)
            .unwrap_or(result.len());
        let userinfo_end = result[authority_start..authority_end]
            .rfind('@')
            .map(|index| authority_start + index);
        if let Some(userinfo_end) = userinfo_end {
            result.replace_range(authority_start..=userinfo_end, "***@");
            search_from = authority_start + 4;
        } else {
            search_from = authority_end.max(authority_start + 1);
        }
        if search_from >= result.len() {
            break;
        }
    }
    result
}

pub(crate) fn parse_status(bytes: &[u8]) -> Result<(GitHead, Vec<GitChange>), GitError> {
    let mut head = GitHead {
        name: None,
        oid: None,
        detached: false,
        unborn: false,
        upstream: None,
        ahead: 0,
        behind: 0,
    };
    let mut changes = Vec::new();
    let chunks = bytes.split(|byte| *byte == 0).collect::<Vec<_>>();
    let mut index = 0;
    while index < chunks.len() {
        let line = String::from_utf8_lossy(chunks[index]);
        if !line.is_empty() {
            if line.starts_with("# ") {
                parse_status_header(&mut head, &line);
            } else if let Some(path) = line.strip_prefix("? ") {
                changes.push(GitChange {
                    path: path.into(),
                    original_path: None,
                    status: "U".into(),
                    staged: false,
                    conflict: false,
                });
            } else if line.starts_with("1 ") || line.starts_with("2 ") {
                let rename = line.starts_with("2 ");
                let fields = line
                    .splitn(if rename { 10 } else { 9 }, ' ')
                    .collect::<Vec<_>>();
                let xy = fields.get(1).copied().unwrap_or("..");
                let path = fields.last().copied().unwrap_or("").to_owned();
                let original_path = if rename {
                    chunks
                        .get(index + 1)
                        .map(|value| String::from_utf8_lossy(value).into_owned())
                } else {
                    None
                };
                push_xy_changes(&mut changes, path, original_path, xy);
                if rename {
                    index += 1;
                }
            } else if line.starts_with("u ") {
                let fields = line.splitn(11, ' ').collect::<Vec<_>>();
                let path = fields.last().copied().unwrap_or("").to_owned();
                changes.push(GitChange {
                    path,
                    original_path: None,
                    status: "!".into(),
                    staged: false,
                    conflict: true,
                });
            }
        }
        index += 1;
    }
    Ok((head, changes))
}

fn parse_status_header(head: &mut GitHead, line: &str) {
    if let Some(value) = line.strip_prefix("# branch.oid ") {
        if value == "(initial)" {
            head.unborn = true;
        } else {
            head.oid = Some(value.into());
        }
    } else if let Some(value) = line.strip_prefix("# branch.head ") {
        if value == "(detached)" {
            head.detached = true;
        } else {
            head.name = Some(value.into());
        }
    } else if let Some(value) = line.strip_prefix("# branch.upstream ") {
        head.upstream = Some(value.into());
    } else if let Some(value) = line.strip_prefix("# branch.ab ") {
        for part in value.split_whitespace() {
            if let Some(value) = part.strip_prefix('+') {
                head.ahead = value.parse().unwrap_or(0);
            }
            if let Some(value) = part.strip_prefix('-') {
                head.behind = value.parse().unwrap_or(0);
            }
        }
    }
}

fn push_xy_changes(
    changes: &mut Vec<GitChange>,
    path: String,
    original_path: Option<String>,
    xy: &str,
) {
    let mut values = xy.chars();
    let staged = values.next().unwrap_or('.');
    let unstaged = values.next().unwrap_or('.');
    let conflict = matches!(
        (staged, unstaged),
        ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D')
    );
    if conflict {
        changes.push(GitChange {
            path,
            original_path,
            status: "!".into(),
            staged: false,
            conflict: true,
        });
        return;
    }
    if staged != '.' {
        changes.push(GitChange {
            path: path.clone(),
            original_path: original_path.clone(),
            status: staged.to_string(),
            staged: true,
            conflict: false,
        });
    }
    if unstaged != '.' {
        changes.push(GitChange {
            path,
            original_path,
            status: unstaged.to_string(),
            staged: false,
            conflict: false,
        });
    }
}

pub(crate) fn parse_branches(bytes: &[u8]) -> Vec<GitBranch> {
    String::from_utf8_lossy(bytes)
        .lines()
        .filter_map(|line| {
            let fields = line.split('\0').collect::<Vec<_>>();
            let ref_name = fields.first()?.trim();
            let (kind, name) = if let Some(name) = ref_name.strip_prefix("refs/heads/") {
                (GitBranchKind::Local, name)
            } else {
                let name = ref_name.strip_prefix("refs/remotes/")?;
                (GitBranchKind::Remote, name)
            };
            if name.is_empty() || fields.get(6).is_some_and(|value| !value.trim().is_empty()) {
                return None;
            }
            Some(GitBranch {
                ref_name: ref_name.into(),
                name: name.into(),
                kind,
                oid: fields.get(2).unwrap_or(&"").to_string(),
                current: kind == GitBranchKind::Local
                    && fields.get(3).is_some_and(|value| value.trim() == "*"),
                upstream: fields
                    .get(4)
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| value.trim().into()),
                upstream_ref: fields
                    .get(5)
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| value.trim().into()),
            })
        })
        .collect()
}

pub(crate) fn parse_commits(bytes: &[u8]) -> Vec<GitCommit> {
    String::from_utf8_lossy(bytes)
        .split('\u{1e}')
        .filter_map(|record| {
            let fields = record
                .trim_matches('\n')
                .split('\u{1f}')
                .collect::<Vec<_>>();
            if fields.len() < 6 || fields[0].is_empty() {
                return None;
            }
            Some(GitCommit {
                oid: fields[0].into(),
                parents: fields[1].split_whitespace().map(str::to_owned).collect(),
                decorations: fields[2]
                    .split(',')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned)
                    .collect(),
                subject: fields[3].into(),
                author: fields[4].into(),
                timestamp: fields[5].parse().unwrap_or(0),
                body: fields
                    .get(6..)
                    .map(|parts| parts.join("\u{1f}").trim_end_matches('\n').to_owned())
                    .unwrap_or_default(),
            })
        })
        .collect()
}

pub(crate) fn parse_commit_files(bytes: &[u8]) -> Vec<GitCommitFile> {
    let fields = bytes
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let status = String::from_utf8_lossy(fields[index])
            .trim_matches(['\r', '\n'])
            .to_owned();
        index += 1;
        if status.is_empty() {
            continue;
        }
        let renamed_or_copied = matches!(status.as_bytes().first(), Some(b'R' | b'C'));
        let original_path = if renamed_or_copied {
            let Some(field) = fields.get(index) else {
                break;
            };
            index += 1;
            Some(String::from_utf8_lossy(field).into_owned())
        } else {
            None
        };
        let Some(field) = fields.get(index) else {
            break;
        };
        index += 1;
        let path = String::from_utf8_lossy(field).into_owned();
        if path.is_empty() {
            continue;
        }
        files.push(GitCommitFile {
            path,
            original_path,
            status,
        });
    }
    files
}

#[cfg(test)]
mod tests {
    use super::{
        OUTPUT_LIMIT, SystemGitExecutor, classify_failure, parse_branches, parse_commit_files,
        parse_commits, parse_status, read_bounded, run_process,
    };
    use crate::domain::git::{GitBranchKind, GitError, find_tracking_local_branch};
    use crate::ports::git_executor::GitExecutor;
    use std::{fs, io::Cursor, process::Command};
    use tempfile::tempdir;

    #[test]
    fn parses_porcelain_v2_headers_and_dual_staged_worktree_changes() {
        let fixture = b"# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0\x31 MM N... 100644 100644 100644 a b file.txt\0? new.txt\0";
        let (head, changes) = parse_status(fixture).expect("status");
        assert_eq!(head.name.as_deref(), Some("main"));
        assert_eq!((head.ahead, head.behind), (2, 1));
        assert_eq!(changes.len(), 3);
        assert!(
            changes
                .iter()
                .any(|change| change.path == "file.txt" && change.staged)
        );
        assert!(
            changes
                .iter()
                .any(|change| change.path == "file.txt" && !change.staged)
        );
    }

    #[test]
    fn parses_renames_conflicts_branches_and_merge_metadata() {
        let fixture = b"# branch.oid abc\0# branch.head feature/test\0\x32 R. N... 100644 100644 100644 a b R100 renamed.txt\0old.txt\0u UU N... 100644 100644 100644 100644 a b c conflict.txt\0? -leading \xe4\xb8\xad\xe6\x96\x87.txt\0";
        let (_, changes) = parse_status(fixture).expect("status");
        assert!(changes.iter().any(|change| {
            change.path == "renamed.txt"
                && change.original_path.as_deref() == Some("old.txt")
                && change.staged
        }));
        assert!(
            changes
                .iter()
                .any(|change| change.path == "conflict.txt" && change.conflict)
        );
        assert!(
            changes
                .iter()
                .any(|change| change.path == "-leading 中文.txt")
        );

        let branches = parse_branches(
            b"refs/heads/main\0main\0abc\0*\0origin/main\0refs/remotes/origin/main\0\n\
refs/heads/origin/main\0origin/main\0local\0 \0\0\0\n\
refs/remotes/origin/main\0origin/main\0abc\0 \0\0\0\n\
refs/remotes/origin/HEAD\0origin/HEAD\0abc\0 \0\0\0refs/remotes/origin/main\n",
        );
        assert_eq!(branches.len(), 3);
        assert_eq!(branches[0].ref_name, "refs/heads/main");
        assert_eq!(branches[0].kind, GitBranchKind::Local);
        assert!(branches[0].current);
        assert_eq!(branches[0].upstream.as_deref(), Some("origin/main"));
        assert_eq!(
            branches[0].upstream_ref.as_deref(),
            Some("refs/remotes/origin/main")
        );
        assert_eq!(branches[1].name, branches[2].name);
        assert_ne!(branches[1].ref_name, branches[2].ref_name);
        assert_eq!(branches[2].kind, GitBranchKind::Remote);
        assert_eq!(
            find_tracking_local_branch(&branches, "refs/remotes/origin/main")
                .map(|branch| branch.ref_name.as_str()),
            Some("refs/heads/main")
        );

        let commits = parse_commits(b"merge\x1fleft right\x1fHEAD -> main, tag: v1\x1fmerge subject\x1fQterm\x1f1700000000\x1fFirst paragraph.\n\n- detail one\n- detail two\n\x1e");
        assert_eq!(commits[0].parents, ["left", "right"]);
        assert_eq!(commits[0].decorations, ["HEAD -> main", "tag: v1"]);
        assert_eq!(
            commits[0].body,
            "First paragraph.\n\n- detail one\n- detail two"
        );
    }

    #[test]
    fn parses_nul_delimited_commit_files_and_preserves_rename_sources() {
        let files = parse_commit_files(b"A\0src/new.ts\0M\0README.md\0R100\0old name.txt\0new name.txt\0C075\0base.txt\0copy.txt\0");
        assert_eq!(files.len(), 4);
        assert_eq!(files[0].status, "A");
        assert_eq!(files[0].path, "src/new.ts");
        assert_eq!(files[2].status, "R100");
        assert_eq!(files[2].original_path.as_deref(), Some("old name.txt"));
        assert_eq!(files[2].path, "new name.txt");
        assert_eq!(files[3].original_path.as_deref(), Some("base.txt"));
        assert_eq!(files[3].path, "copy.txt");
    }

    #[test]
    fn bounds_process_output_and_classifies_recoverable_failures() {
        assert_eq!(
            read_bounded(Cursor::new(vec![b'x'; OUTPUT_LIMIT + 1])),
            Err(GitError::OutputTooLarge)
        );
        assert!(matches!(
            classify_failure(b"fatal: detected dubious ownership; add safe.directory"),
            GitError::Conflict(_)
        ));
        assert_eq!(
            classify_failure(b"fatal: not a git repository"),
            GitError::NotRepository
        );
        let GitError::CommandFailed(detail) = classify_failure(
            b"fatal: unable to access 'https://alice:p%40ss@example.com/repo.git/': denied",
        ) else {
            panic!("expected command failure");
        };
        assert!(!detail.contains("alice"));
        assert!(!detail.contains("p%40ss"));
        assert!(detail.contains("https://***@example.com/repo.git/"));
    }

    #[test]
    fn timed_out_process_is_terminated() {
        let result = if cfg!(windows) {
            run_process(
                std::path::Path::new("cmd.exe"),
                ["/C", "ping -n 10 127.0.0.1 > nul"],
                std::time::Duration::from_millis(50),
            )
        } else {
            run_process(
                std::path::Path::new("sh"),
                ["-c", "sleep 5"],
                std::time::Duration::from_millis(50),
            )
        };
        assert!(matches!(result, Err(GitError::Timeout)));
    }

    #[test]
    fn real_git_repository_supports_init_stage_commit_and_branch_snapshot() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git);
        let directory = tempdir().expect("repo");
        let first = executor.initialize(directory.path()).expect("init");
        assert!(first.head.unborn);
        fs::write(directory.path().join("hello world.txt"), b"hello").expect("fixture");
        let staged = executor.stage_all(directory.path()).expect("stage");
        assert!(staged.changes.iter().any(|change| change.staged));
        let unstaged = executor
            .unstage(directory.path(), &["hello world.txt".into()])
            .expect("unstage unborn file");
        assert!(unstaged.changes.iter().all(|change| !change.staged));
        executor
            .stage(directory.path(), &["hello world.txt".into()])
            .expect("stage one path");
        Command::new(executor.executable.as_ref().expect("git"))
            .args([
                "-C",
                directory.path().to_str().expect("path"),
                "config",
                "user.name",
                "Qterm Test",
            ])
            .status()
            .expect("name");
        Command::new(executor.executable.as_ref().expect("git"))
            .args([
                "-C",
                directory.path().to_str().expect("path"),
                "config",
                "user.email",
                "qterm@example.invalid",
            ])
            .status()
            .expect("email");
        let committed = executor
            .commit(directory.path(), "feat: initial")
            .expect("commit");
        assert_eq!(committed.commits.len(), 1);
        let commit_files = executor
            .commit_files(
                directory.path(),
                committed.head.oid.as_deref().expect("commit oid"),
            )
            .expect("commit files");
        assert_eq!(commit_files.len(), 1);
        assert_eq!(commit_files[0].path, "hello world.txt");
        assert_eq!(commit_files[0].status, "A");
        let base_branch = committed.head.name.clone().expect("base branch");
        let branched = executor
            .create_branch(directory.path(), "feature/test")
            .expect("branch");
        assert_eq!(branched.head.name.as_deref(), Some("feature/test"));
        fs::write(directory.path().join("hello world.txt"), b"feature").expect("branch change");
        executor.stage_all(directory.path()).expect("stage branch");
        executor
            .commit(directory.path(), "feat: branch change")
            .expect("branch commit");
        executor
            .switch_branch(directory.path(), &base_branch)
            .expect("switch base");
        fs::write(directory.path().join("hello world.txt"), b"local").expect("local change");
        assert!(matches!(
            executor.switch_branch(directory.path(), "feature/test"),
            Err(GitError::Conflict(_))
        ));
        let unchanged = executor
            .snapshot(directory.path())
            .expect("unchanged branch");
        assert_eq!(unchanged.head.name.as_deref(), Some(base_branch.as_str()));
        assert!(!unchanged.changes.is_empty());

        fs::write(directory.path().join(".git/index.lock"), b"locked").expect("index lock");
        assert!(matches!(
            executor.stage_all(directory.path()),
            Err(GitError::CommandFailed(_))
        ));
        fs::remove_file(directory.path().join(".git/index.lock")).expect("remove lock");
    }

    #[test]
    fn real_git_fetch_lists_tracks_and_prunes_remote_branches_without_changing_the_worktree() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("remote fixture");
        let bare = directory.path().join("origin.git");
        let seed = directory.path().join("seed");
        let local = directory.path().join("local");

        run_git_test(&git, ["init", "--bare", path(&bare)]);
        run_git_test(&git, ["init", path(&seed)]);
        run_git_test(
            &git,
            ["-C", path(&seed), "config", "user.name", "Qterm Test"],
        );
        run_git_test(
            &git,
            [
                "-C",
                path(&seed),
                "config",
                "user.email",
                "qterm@example.invalid",
            ],
        );
        fs::write(seed.join("main.txt"), b"initial\n").expect("initial file");
        run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "initial"]);
        run_git_test(&git, ["-C", path(&seed), "branch", "-M", "main"]);
        run_git_test(
            &git,
            ["-C", path(&seed), "remote", "add", "origin", path(&bare)],
        );
        run_git_test(&git, ["-C", path(&seed), "push", "-u", "origin", "main"]);
        run_git_test(
            &git,
            ["-C", path(&bare), "symbolic-ref", "HEAD", "refs/heads/main"],
        );
        run_git_test(&git, ["clone", path(&bare), path(&local)]);

        run_git_test(&git, ["-C", path(&seed), "switch", "-c", "feature/remote"]);
        fs::write(seed.join("feature.txt"), b"feature\n").expect("feature file");
        run_git_test(&git, ["-C", path(&seed), "add", "feature.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "feature"]);
        run_git_test(
            &git,
            ["-C", path(&seed), "push", "-u", "origin", "feature/remote"],
        );
        run_git_test(&git, ["-C", path(&seed), "switch", "main"]);

        let stale = executor.snapshot(&local).expect("snapshot before fetch");
        assert!(
            stale
                .branches
                .iter()
                .all(|branch| branch.ref_name != "refs/remotes/origin/feature/remote")
        );
        let fetched = executor.fetch(&local).expect("fetch new remote branch");
        assert!(fetched.branches.iter().any(|branch| {
            branch.ref_name == "refs/remotes/origin/feature/remote"
                && branch.kind == GitBranchKind::Remote
        }));
        assert!(
            fetched
                .branches
                .iter()
                .all(|branch| branch.name != "origin/HEAD")
        );

        run_git_test(&git, ["-C", path(&local), "branch", "feature/remote"]);
        assert!(matches!(
            executor.track_remote_branch(&local, "refs/remotes/origin/feature/remote"),
            Err(GitError::CommandFailed(_))
        ));
        assert_eq!(
            executor
                .snapshot(&local)
                .expect("snapshot after collision")
                .head
                .name
                .as_deref(),
            Some("main")
        );
        run_git_test(&git, ["-C", path(&local), "branch", "-D", "feature/remote"]);

        run_git_test(
            &git,
            [
                "-C",
                path(&local),
                "branch",
                "--track",
                "review",
                "origin/feature/remote",
            ],
        );
        let reused = executor
            .track_remote_branch(&local, "refs/remotes/origin/feature/remote")
            .expect("reuse tracking branch");
        assert_eq!(reused.head.name.as_deref(), Some("review"));
        executor.switch_branch(&local, "main").expect("switch main");
        run_git_test(&git, ["-C", path(&local), "branch", "-D", "review"]);
        let created = executor
            .track_remote_branch(&local, "refs/remotes/origin/feature/remote")
            .expect("create tracking branch");
        assert_eq!(created.head.name.as_deref(), Some("feature/remote"));
        assert_eq!(
            created.head.upstream.as_deref(),
            Some("origin/feature/remote")
        );
        executor.switch_branch(&local, "main").expect("return main");

        run_git_test(
            &git,
            [
                "-C",
                path(&seed),
                "push",
                "origin",
                "--delete",
                "feature/remote",
            ],
        );
        fs::write(seed.join("main.txt"), b"initial\nremote update\n").expect("remote update");
        run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "remote update"]);
        run_git_test(&git, ["-C", path(&seed), "push", "origin", "main"]);

        let pruned = executor.fetch(&local).expect("fetch and prune");
        assert!(
            pruned
                .branches
                .iter()
                .all(|branch| branch.ref_name != "refs/remotes/origin/feature/remote")
        );
        assert_eq!(pruned.head.behind, 1);
        assert_eq!(
            fs::read_to_string(local.join("main.txt")).expect("worktree"),
            "initial\n"
        );
    }

    #[test]
    fn real_git_p0_lifecycle_publish_push_and_ff_only_pull_are_safe() {
        let git = which_git();
        let executor = SystemGitExecutor::with_executable(git.clone());
        let directory = tempdir().expect("p0 fixture");
        let bare = directory.path().join("origin.git");
        let seed = directory.path().join("seed");
        let local = directory.path().join("local");

        run_git_test(&git, ["init", "--bare", path(&bare)]);
        run_git_test(&git, ["init", path(&seed)]);
        configure_identity(&git, &seed);
        fs::write(seed.join("main.txt"), b"initial\n").expect("initial file");
        run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "initial"]);
        run_git_test(&git, ["-C", path(&seed), "branch", "-M", "main"]);
        run_git_test(
            &git,
            ["-C", path(&seed), "remote", "add", "origin", path(&bare)],
        );
        run_git_test(&git, ["-C", path(&seed), "push", "-u", "origin", "main"]);
        run_git_test(
            &git,
            ["-C", path(&bare), "symbolic-ref", "HEAD", "refs/heads/main"],
        );
        run_git_test(&git, ["clone", path(&bare), path(&local)]);
        configure_identity(&git, &local);
        run_git_test(
            &git,
            ["-C", path(&local), "config", "push.default", "nothing"],
        );
        run_git_test(&git, ["-C", path(&local), "config", "pull.rebase", "true"]);

        let initial = executor.snapshot(&local).expect("initial snapshot");
        assert_eq!(initial.remotes, ["origin"]);
        let created = executor
            .create_branch_from(&local, "feature/from-remote", "refs/remotes/origin/main")
            .expect("create from remote");
        assert_eq!(created.head.name.as_deref(), Some("feature/from-remote"));
        assert_eq!(created.head.upstream, None);
        executor.switch_branch(&local, "main").expect("switch main");
        let renamed = executor
            .rename_branch(&local, "refs/heads/feature/from-remote", "feature/renamed")
            .expect("rename local branch");
        assert!(
            renamed
                .branches
                .iter()
                .any(|branch| branch.name == "feature/renamed")
        );
        let deleted = executor
            .delete_branch(&local, "refs/heads/feature/renamed")
            .expect("delete merged branch");
        assert!(
            deleted
                .branches
                .iter()
                .all(|branch| branch.name != "feature/renamed")
        );
        assert!(matches!(
            executor.delete_branch(&local, "refs/heads/main"),
            Err(GitError::Conflict(_))
        ));

        executor
            .create_branch(&local, "feature/publish")
            .expect("new branch");
        fs::write(local.join("published.txt"), b"published\n").expect("publish file");
        executor.stage_all(&local).expect("stage publish");
        let published_commit = executor
            .commit(&local, "feat: publish")
            .expect("publish commit");
        let published = executor
            .push(&local, Some("origin"))
            .expect("publish branch");
        assert_eq!(
            published.head.upstream.as_deref(),
            Some("origin/feature/publish")
        );
        assert_eq!(
            rev_parse(&git, &bare, "refs/heads/feature/publish"),
            published_commit.head.oid.expect("published oid")
        );
        let renamed_published = executor
            .rename_branch(
                &local,
                "refs/heads/feature/publish",
                "feature/published-renamed",
            )
            .expect("rename published branch");
        assert_eq!(
            renamed_published.head.name.as_deref(),
            Some("feature/published-renamed")
        );
        assert_eq!(
            renamed_published.head.upstream.as_deref(),
            Some("origin/feature/publish")
        );
        fs::write(local.join("published.txt"), b"published\nsecond\n").expect("second file");
        executor.stage_all(&local).expect("stage second");
        let pushed_commit = executor.commit(&local, "feat: push").expect("push commit");
        executor.push(&local, None).expect("tracked push");
        assert_eq!(
            rev_parse(&git, &bare, "refs/heads/feature/publish"),
            pushed_commit.head.oid.expect("pushed oid")
        );
        assert!(matches!(
            executor.push(&local, Some("missing")),
            Err(GitError::InvalidInput)
        ));

        executor.switch_branch(&local, "main").expect("return main");
        fs::write(seed.join("main.txt"), b"initial\nremote\n").expect("remote update");
        run_git_test(&git, ["-C", path(&seed), "add", "main.txt"]);
        run_git_test(&git, ["-C", path(&seed), "commit", "-m", "remote update"]);
        run_git_test(&git, ["-C", path(&seed), "push", "origin", "main"]);
        let pulled = executor.pull(&local).expect("ff-only pull");
        assert_eq!(
            pulled.head.oid.as_deref(),
            Some(rev_parse(&git, &bare, "refs/heads/main").as_str())
        );

        fs::write(local.join("local-only.txt"), b"local\n").expect("local divergence");
        executor.stage_all(&local).expect("stage divergence");
        let local_diverged = executor
            .commit(&local, "local divergence")
            .expect("local commit");
        fs::write(seed.join("remote-only.txt"), b"remote\n").expect("remote divergence");
        run_git_test(&git, ["-C", path(&seed), "add", "remote-only.txt"]);
        run_git_test(
            &git,
            ["-C", path(&seed), "commit", "-m", "remote divergence"],
        );
        run_git_test(&git, ["-C", path(&seed), "push", "origin", "main"]);
        assert!(matches!(
            executor.pull(&local),
            Err(GitError::CommandFailed(_) | GitError::Conflict(_))
        ));
        assert_eq!(
            executor
                .snapshot(&local)
                .expect("diverged snapshot")
                .head
                .oid,
            local_diverged.head.oid
        );

        executor
            .create_branch(&local, "feature/unmerged")
            .expect("unmerged branch");
        fs::write(local.join("unmerged.txt"), b"unmerged\n").expect("unmerged file");
        executor.stage_all(&local).expect("stage unmerged");
        executor
            .commit(&local, "unmerged commit")
            .expect("commit unmerged");
        executor
            .switch_branch(&local, "main")
            .expect("leave unmerged");
        assert!(matches!(
            executor.delete_branch(&local, "refs/heads/feature/unmerged"),
            Err(GitError::CommandFailed(_))
        ));
        assert!(
            executor
                .snapshot(&local)
                .expect("safe delete refusal")
                .branches
                .iter()
                .any(|branch| branch.name == "feature/unmerged")
        );
    }

    #[test]
    fn failed_commit_does_not_create_history() {
        let executor = SystemGitExecutor::with_executable(which_git());
        let directory = tempdir().expect("repo");
        executor.initialize(directory.path()).expect("init");
        fs::write(directory.path().join("staged.txt"), b"staged").expect("fixture");
        executor.stage_all(directory.path()).expect("stage");
        for key in ["user.name", "user.email"] {
            Command::new(executor.executable.as_ref().expect("git"))
                .args([
                    "-C",
                    directory.path().to_str().expect("path"),
                    "config",
                    key,
                    "",
                ])
                .status()
                .expect("empty identity");
        }
        assert!(matches!(
            executor.commit(directory.path(), "feat: should fail"),
            Err(GitError::CommandFailed(_))
        ));
        let snapshot = executor.snapshot(directory.path()).expect("snapshot");
        assert!(snapshot.head.unborn);
        assert!(snapshot.changes.iter().any(|change| change.staged));
    }

    fn which_git() -> std::path::PathBuf {
        let output = Command::new(if cfg!(windows) { "where" } else { "which" })
            .arg("git")
            .output()
            .expect("find git");
        std::path::PathBuf::from(
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .expect("git path"),
        )
    }

    fn run_git_test<I, S>(git: &std::path::Path, args: I)
    where
        I: IntoIterator<Item = S>,
        S: AsRef<std::ffi::OsStr>,
    {
        let output = Command::new(git)
            .args(args)
            .output()
            .expect("run Git fixture");
        assert!(
            output.status.success(),
            "Git fixture failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn configure_identity(git: &std::path::Path, repository: &std::path::Path) {
        run_git_test(
            git,
            ["-C", path(repository), "config", "user.name", "Qterm Test"],
        );
        run_git_test(
            git,
            [
                "-C",
                path(repository),
                "config",
                "user.email",
                "qterm@example.invalid",
            ],
        );
    }

    fn rev_parse(git: &std::path::Path, repository: &std::path::Path, reference: &str) -> String {
        let output = Command::new(git)
            .args(["-C", path(repository), "rev-parse", reference])
            .output()
            .expect("rev-parse");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_owned()
    }

    fn path(value: &std::path::Path) -> &str {
        value.to_str().expect("UTF-8 fixture path")
    }
}
