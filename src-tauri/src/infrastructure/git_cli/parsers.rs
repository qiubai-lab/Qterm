use super::*;

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
                    conflict_kind: None,
                    submodule: None,
                });
            } else if line.starts_with("1 ") || line.starts_with("2 ") {
                let rename = line.starts_with("2 ");
                let fields = line
                    .splitn(if rename { 10 } else { 9 }, ' ')
                    .collect::<Vec<_>>();
                let xy = fields.get(1).copied().unwrap_or("..");
                let submodule = parse_submodule_change(&fields);
                let path = fields.last().copied().unwrap_or("").to_owned();
                let original_path = if rename {
                    chunks
                        .get(index + 1)
                        .map(|value| String::from_utf8_lossy(value).into_owned())
                } else {
                    None
                };
                push_xy_changes(&mut changes, path, original_path, xy, submodule);
                if rename {
                    index += 1;
                }
            } else if line.starts_with("u ") {
                let fields = line.splitn(11, ' ').collect::<Vec<_>>();
                let xy = fields.get(1).copied().unwrap_or("..");
                let submodule = parse_submodule_change(&fields);
                let path = fields.last().copied().unwrap_or("").to_owned();
                changes.push(GitChange {
                    path,
                    original_path: None,
                    status: "!".into(),
                    staged: false,
                    conflict: true,
                    conflict_kind: Some(GitConflictKind::from_xy(xy)),
                    submodule,
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
    submodule: Option<GitSubmoduleChange>,
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
            conflict_kind: Some(GitConflictKind::from_xy(xy)),
            submodule,
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
            conflict_kind: None,
            submodule: submodule.clone(),
        });
    }
    if unstaged != '.' {
        changes.push(GitChange {
            path,
            original_path,
            status: unstaged.to_string(),
            staged: false,
            conflict: false,
            conflict_kind: None,
            submodule,
        });
    }
}

fn parse_submodule_change(fields: &[&str]) -> Option<GitSubmoduleChange> {
    let marker = fields.get(2).copied().unwrap_or("N...");
    let is_gitlink = fields.iter().skip(3).take(4).any(|mode| *mode == "160000");
    if !is_gitlink && !marker.starts_with('S') {
        return None;
    }
    let marker = marker.as_bytes();
    Some(GitSubmoduleChange {
        commit_changed: marker.get(1) == Some(&b'C'),
        tracked_modified: marker.get(2) == Some(&b'M'),
        untracked_content: marker.get(3) == Some(&b'U'),
    })
}

#[derive(Clone)]
struct GitlinkEntry {
    oid: String,
}

#[derive(Clone)]
struct SubmoduleStatusEntry {
    oid: Option<String>,
    initialized: bool,
    conflict: bool,
}

pub(crate) fn parse_submodules(
    index: &[u8],
    config: Option<&[u8]>,
    status: Option<&[u8]>,
    changes: &[GitChange],
) -> Result<Vec<GitSubmodule>, GitError> {
    let mut gitlinks = std::collections::BTreeMap::<String, GitlinkEntry>::new();
    for record in index
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let Some(tab) = record.iter().position(|byte| *byte == b'\t') else {
            continue;
        };
        let metadata = String::from_utf8_lossy(&record[..tab]);
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        if fields.first() != Some(&"160000") || fields.get(2) != Some(&"0") {
            continue;
        }
        let Some(oid) = fields.get(1) else { continue };
        let path = String::from_utf8_lossy(&record[tab + 1..]).into_owned();
        gitlinks.insert(path, GitlinkEntry { oid: (*oid).into() });
    }

    let mut configured = Vec::<(String, String)>::new();
    if let Some(config) = config {
        for record in config
            .split(|byte| *byte == 0)
            .filter(|record| !record.is_empty())
        {
            let value = String::from_utf8_lossy(record);
            let Some((key, path)) = value.split_once('\n') else {
                continue;
            };
            let Some(name) = key
                .strip_prefix("submodule.")
                .and_then(|key| key.strip_suffix(".path"))
            else {
                continue;
            };
            configured.push((name.to_owned(), path.to_owned()));
        }
    }

    let known_paths = gitlinks
        .keys()
        .chain(configured.iter().map(|(_, path)| path))
        .cloned()
        .collect::<std::collections::BTreeSet<_>>();
    if known_paths.len() > MAX_GIT_SUBMODULES {
        return Err(GitError::OutputTooLarge);
    }
    let statuses = status.map(|value| parse_submodule_status(value, &known_paths));
    let mut path_counts = std::collections::HashMap::<String, usize>::new();
    let mut name_counts = std::collections::HashMap::<String, usize>::new();
    for (name, path) in &configured {
        *path_counts.entry(path.clone()).or_default() += 1;
        *name_counts.entry(name.clone()).or_default() += 1;
    }

    let mut submodules = Vec::with_capacity(known_paths.len());
    for path in known_paths {
        let definitions = configured
            .iter()
            .filter(|(_, candidate)| candidate == &path)
            .collect::<Vec<_>>();
        let gitlink = gitlinks.get(&path);
        let state = statuses.as_ref().and_then(|entries| entries.get(&path));
        let mut change = GitSubmoduleChange::default();
        let mut conflict = state.is_some_and(|state| state.conflict);
        for item in changes.iter().filter(|change| change.path == path) {
            if let Some(item_state) = &item.submodule {
                change.commit_changed |= item_state.commit_changed;
                change.tracked_modified |= item_state.tracked_modified;
                change.untracked_content |= item_state.untracked_content;
            }
            conflict |= item.conflict;
        }
        let invalid_path = path.is_empty()
            || path.starts_with('/')
            || path.contains('\0')
            || path.chars().any(char::is_control)
            || path.split('/').any(|segment| segment == "..");
        let issue = if invalid_path {
            Some(GitSubmoduleIssue::InvalidPath)
        } else if path_counts.get(&path).copied().unwrap_or(0) > 1
            || definitions
                .iter()
                .any(|(name, _)| name_counts.get(name).copied().unwrap_or(0) > 1)
        {
            Some(GitSubmoduleIssue::DuplicatePath)
        } else if gitlink.is_none() {
            Some(GitSubmoduleIssue::MissingGitlink)
        } else if definitions.is_empty() {
            Some(GitSubmoduleIssue::MissingConfiguration)
        } else if status.is_none() || state.is_none() {
            Some(GitSubmoduleIssue::Unreadable)
        } else {
            None
        };
        let current_oid = state.and_then(|state| state.oid.clone());
        let recorded_oid = gitlink.map(|entry| entry.oid.clone());
        let initialized = state.is_some_and(|state| state.initialized);
        let commit_changed = initialized && current_oid.is_some() && current_oid != recorded_oid;
        submodules.push(GitSubmodule {
            name: definitions
                .first()
                .map(|(name, _)| name.clone())
                .unwrap_or_else(|| path.clone()),
            path,
            recorded_oid,
            current_oid,
            initialized,
            commit_changed: commit_changed || change.commit_changed,
            tracked_modified: change.tracked_modified,
            untracked_content: change.untracked_content,
            conflict,
            issue,
        });
    }
    Ok(submodules)
}

fn parse_submodule_status(
    bytes: &[u8],
    known_paths: &std::collections::BTreeSet<String>,
) -> std::collections::HashMap<String, SubmoduleStatusEntry> {
    let mut result = std::collections::HashMap::new();
    for line in String::from_utf8_lossy(bytes).lines() {
        let mut chars = line.chars();
        let Some(prefix) = chars.next() else { continue };
        if !matches!(prefix, ' ' | '-' | '+' | 'U') {
            continue;
        }
        let remainder = chars.as_str();
        let Some(space) = remainder.find(' ') else {
            continue;
        };
        let oid = &remainder[..space];
        if !matches!(oid.len(), 40 | 64) || !oid.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            continue;
        }
        let tail = &remainder[space + 1..];
        let quoted_path = parse_git_quoted_path(tail);
        let path = quoted_path
            .as_ref()
            .and_then(|path| known_paths.get(path))
            .or_else(|| {
                known_paths
                    .iter()
                    .filter(|path| {
                        tail == path.as_str()
                            || tail
                                .strip_prefix(path.as_str())
                                .is_some_and(|suffix| suffix.starts_with(" ("))
                    })
                    .max_by_key(|path| path.len())
            });
        if let Some(path) = path {
            result.insert(
                path.clone(),
                SubmoduleStatusEntry {
                    oid: (prefix != '-').then(|| oid.to_owned()),
                    initialized: prefix != '-',
                    conflict: prefix == 'U',
                },
            );
        }
    }
    result
}

fn parse_git_quoted_path(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    if bytes.first() != Some(&b'"') {
        return None;
    }
    let mut result = Vec::new();
    let mut index = 1;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => {
                let suffix = &value[index + 1..];
                return (suffix.is_empty() || suffix.starts_with(" ("))
                    .then(|| String::from_utf8_lossy(&result).into_owned());
            }
            b'\\' => {
                index += 1;
                let escaped = *bytes.get(index)?;
                if escaped.is_ascii_digit() && escaped < b'8' {
                    let digits = bytes.get(index..index + 3)?;
                    if digits.iter().all(|digit| (b'0'..=b'7').contains(digit)) {
                        let octal = u16::from(digits[0] - b'0') * 64
                            + u16::from(digits[1] - b'0') * 8
                            + u16::from(digits[2] - b'0');
                        result.push(u8::try_from(octal).ok()?);
                        index += 3;
                        continue;
                    }
                }
                result.push(match escaped {
                    b'a' => 0x07,
                    b'b' => 0x08,
                    b't' => b'\t',
                    b'n' => b'\n',
                    b'v' => 0x0b,
                    b'f' => 0x0c,
                    b'r' => b'\r',
                    b'\\' => b'\\',
                    b'"' => b'"',
                    _ => return None,
                });
            }
            byte => result.push(byte),
        }
        index += 1;
    }
    None
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
