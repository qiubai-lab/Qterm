use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufReader, Cursor},
    path::{Path, PathBuf},
};

use glob::glob;
use ssh2_config_rs::{ParseRule, SshConfig};

const MAX_CONFIG_FILE_BYTES: u64 = 512 * 1024;
const MAX_CONFIG_TOTAL_BYTES: u64 = 2 * 1024 * 1024;
const MAX_INCLUDED_FILES: usize = 128;
const MAX_INCLUDE_DEPTH: usize = 8;
const MAX_PRIVATE_KEY_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SshConfigImportError {
    NotFound,
    Unreadable,
    TooLarge,
    Invalid,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IdentityFileStatus {
    Available,
    Unavailable,
    TooLarge,
    DynamicPath,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdentityFileCandidate {
    pub index: usize,
    pub path: PathBuf,
    pub file_name: String,
    pub status: IdentityFileStatus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SshConfigCandidate {
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub identity_files: Vec<IdentityFileCandidate>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SshConfigImportPreview {
    pub candidates: Vec<SshConfigCandidate>,
    pub warnings: Vec<String>,
}

#[derive(Default)]
struct ExpansionState {
    bytes: u64,
    files: usize,
    stack: HashSet<PathBuf>,
    in_match: bool,
    saw_match: bool,
}

pub fn parse_ssh_config(
    config_path: &Path,
    home: &Path,
) -> Result<SshConfigImportPreview, SshConfigImportError> {
    if !config_path.exists() {
        return Err(SshConfigImportError::NotFound);
    }
    let mut expanded = String::new();
    let mut state = ExpansionState::default();
    expand_file(config_path, home, 0, &mut state, &mut expanded)?;

    let mut reader = BufReader::new(Cursor::new(expanded.as_bytes()));
    let config = SshConfig::default()
        .parse(
            &mut reader,
            ParseRule::ALLOW_UNKNOWN_FIELDS | ParseRule::ALLOW_UNSUPPORTED_FIELDS,
        )
        .map_err(|_| SshConfigImportError::Invalid)?;

    let mut aliases = Vec::new();
    let mut seen = HashSet::new();
    for host in config.get_hosts().iter().skip(1) {
        for clause in &host.pattern {
            if clause.negated || !is_literal_alias(&clause.pattern) {
                continue;
            }
            if seen.insert(clause.pattern.clone()) {
                aliases.push(clause.pattern.clone());
            }
        }
    }

    let local_username = local_username();
    let mut candidates = Vec::with_capacity(aliases.len());
    for alias in aliases {
        let params = config.query(&alias);
        let mut warnings = Vec::new();
        let host = resolve_host_name(params.host_name.as_deref(), &alias, &mut warnings);
        let username = params
            .user
            .clone()
            .unwrap_or_else(|| local_username.clone());
        if username.is_empty() {
            warnings.push("未找到 User，也无法确定当前系统用户名".into());
        }
        if params.proxy_jump.is_some() || params.unsupported_fields.contains_key("proxycommand") {
            warnings.push("包含 ProxyJump 或 ProxyCommand，导入后不会配置跳板连接".into());
        }
        if state.saw_match {
            warnings.push("配置包含 Match；条件块已忽略".into());
        }
        let identity_files = params
            .identity_file
            .unwrap_or_default()
            .into_iter()
            .enumerate()
            .map(|(index, path)| inspect_identity_path(index, path, home))
            .collect();
        candidates.push(SshConfigCandidate {
            alias,
            host,
            port: params.port.unwrap_or(22),
            username,
            identity_files,
            warnings,
        });
    }

    let warnings = if state.saw_match {
        vec![
            "检测到 Match 条件块；为避免错误套用或执行 Match exec，本次导入已忽略这些条件块".into(),
        ]
    } else {
        Vec::new()
    };
    Ok(SshConfigImportPreview {
        candidates,
        warnings,
    })
}

fn expand_file(
    path: &Path,
    home: &Path,
    depth: usize,
    state: &mut ExpansionState,
    output: &mut String,
) -> Result<(), SshConfigImportError> {
    if depth > MAX_INCLUDE_DEPTH || state.files >= MAX_INCLUDED_FILES {
        return Err(SshConfigImportError::TooLarge);
    }
    let canonical = dunce::canonicalize(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            SshConfigImportError::NotFound
        } else {
            SshConfigImportError::Unreadable
        }
    })?;
    if !state.stack.insert(canonical.clone()) {
        return Err(SshConfigImportError::Invalid);
    }
    let metadata = fs::metadata(&canonical).map_err(|_| SshConfigImportError::Unreadable)?;
    if !metadata.is_file() || metadata.len() > MAX_CONFIG_FILE_BYTES {
        state.stack.remove(&canonical);
        return Err(SshConfigImportError::TooLarge);
    }
    state.files += 1;
    state.bytes = state
        .bytes
        .checked_add(metadata.len())
        .ok_or(SshConfigImportError::TooLarge)?;
    if state.bytes > MAX_CONFIG_TOTAL_BYTES {
        state.stack.remove(&canonical);
        return Err(SshConfigImportError::TooLarge);
    }
    let contents = fs::read_to_string(&canonical).map_err(|_| SshConfigImportError::Unreadable)?;
    for raw_line in contents.lines() {
        let line = strip_comment(raw_line);
        let Some((directive, arguments)) = split_directive(&line) else {
            continue;
        };
        if directive.eq_ignore_ascii_case("match") {
            state.in_match = true;
            state.saw_match = true;
            continue;
        }
        if directive.eq_ignore_ascii_case("host") {
            state.in_match = false;
            output.push_str(raw_line);
            output.push('\n');
            continue;
        }
        if state.in_match {
            continue;
        }
        if directive.eq_ignore_ascii_case("include") {
            for pattern in split_words(arguments) {
                let resolved =
                    resolve_include_pattern(&pattern, home, canonical.parent().unwrap_or(home));
                let mut included = glob(&resolved)
                    .map_err(|_| SshConfigImportError::Invalid)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|_| SshConfigImportError::Unreadable)?;
                included.sort();
                for included_path in included {
                    expand_file(&included_path, home, depth + 1, state, output)?;
                }
            }
            continue;
        }
        output.push_str(raw_line);
        output.push('\n');
    }
    state.stack.remove(&canonical);
    Ok(())
}

fn strip_comment(line: &str) -> String {
    let mut quoted = false;
    for (index, character) in line.char_indices() {
        if character == '"' {
            quoted = !quoted;
        } else if character == '#' && !quoted {
            return line[..index].trim().to_owned();
        }
    }
    line.trim().to_owned()
}

fn split_directive(line: &str) -> Option<(&str, &str)> {
    if line.is_empty() {
        return None;
    }
    if let Some((directive, arguments)) = line.split_once('=') {
        let directive = directive.trim();
        if !directive.chars().any(char::is_whitespace) {
            return Some((directive, arguments.trim()));
        }
    }
    let end = line.find(char::is_whitespace).unwrap_or(line.len());
    let directive = &line[..end];
    let arguments = line[end..].trim();
    Some((directive, arguments))
}

fn split_words(value: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for character in value.chars() {
        match character {
            '"' => quoted = !quoted,
            character if character.is_whitespace() && !quoted => {
                if !current.is_empty() {
                    words.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

fn resolve_include_pattern(pattern: &str, home: &Path, config_directory: &Path) -> String {
    let path = if let Some(rest) = pattern.strip_prefix("~/") {
        home.join(rest)
    } else if Path::new(pattern).is_absolute() {
        PathBuf::from(pattern)
    } else {
        config_directory.join(pattern)
    };
    path.to_string_lossy().into_owned()
}

fn is_literal_alias(pattern: &str) -> bool {
    !pattern.is_empty()
        && pattern != "*"
        && !pattern
            .chars()
            .any(|character| matches!(character, '*' | '?' | '[' | ']'))
}

fn resolve_host_name(value: Option<&str>, alias: &str, warnings: &mut Vec<String>) -> String {
    let Some(value) = value else {
        return alias.to_owned();
    };
    let expanded = value.replace("%h", alias);
    if expanded.contains('%') {
        warnings.push("HostName 包含未支持的动态 token，已回退到 Host 别名".into());
        alias.to_owned()
    } else {
        expanded
    }
}

fn inspect_identity_path(index: usize, path: PathBuf, home: &Path) -> IdentityFileCandidate {
    let dynamic = path.to_string_lossy().contains('%');
    let path = if path.is_relative() {
        home.join(path)
    } else {
        path
    };
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("私钥文件")
        .to_owned();
    let status = if dynamic {
        IdentityFileStatus::DynamicPath
    } else {
        match fs::metadata(&path) {
            Ok(metadata) if metadata.is_file() && metadata.len() <= MAX_PRIVATE_KEY_BYTES => {
                IdentityFileStatus::Available
            }
            Ok(metadata) if metadata.len() > MAX_PRIVATE_KEY_BYTES => IdentityFileStatus::TooLarge,
            _ => IdentityFileStatus::Unavailable,
        }
    };
    IdentityFileCandidate {
        index,
        path,
        file_name,
        status,
    }
}

fn local_username() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default()
}

pub fn candidates_by_alias(preview: SshConfigImportPreview) -> HashMap<String, SshConfigCandidate> {
    preview
        .candidates
        .into_iter()
        .map(|candidate| (candidate.alias.clone(), candidate))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{IdentityFileStatus, SshConfigImportError, parse_ssh_config};

    #[test]
    fn parses_literal_aliases_defaults_includes_and_identity_metadata() {
        let root = tempdir().expect("root");
        let home = root.path();
        let ssh = home.join(".ssh");
        fs::create_dir_all(ssh.join("config.d")).expect("ssh dir");
        fs::write(ssh.join("id_ed25519"), "fixture key metadata only").expect("key");
        fs::write(
            ssh.join("config.d/work.conf"),
            "Host work\n  HostName 10.0.0.8\n  IdentityFile .ssh/id_ed25519\n",
        )
        .expect("include");
        fs::write(
            ssh.join("config"),
            "Include config.d/*.conf\nHost prod prod-alt\n  HostName prod.example.com\n  Port 2202\nHost *.internal !blocked.internal\n  User wildcard\nHost *\n  User deploy\n",
        )
        .expect("config");

        let preview = parse_ssh_config(&ssh.join("config"), home).expect("preview");

        let aliases = preview
            .candidates
            .iter()
            .map(|candidate| candidate.alias.as_str())
            .collect::<Vec<_>>();
        assert_eq!(aliases, vec!["work", "prod", "prod-alt"]);
        let work = &preview.candidates[0];
        assert_eq!(
            (&work.host, work.port, &work.username),
            (&"10.0.0.8".into(), 22, &"deploy".into())
        );
        assert_eq!(work.identity_files[0].file_name, "id_ed25519");
        assert_eq!(work.identity_files[0].status, IdentityFileStatus::Available);
        assert_eq!(preview.candidates[1].port, 2202);
    }

    #[test]
    fn ignores_match_blocks_without_executing_or_leaking_their_values() {
        let root = tempdir().expect("root");
        let ssh = root.path().join(".ssh");
        fs::create_dir_all(&ssh).expect("ssh dir");
        fs::write(
            ssh.join("config"),
            "Host safe\n  HostName safe.example\nMatch exec \"touch /tmp/never\"\n  HostName poisoned.example\nHost next\n  HostName next.example\n",
        )
        .expect("config");

        let preview = parse_ssh_config(&ssh.join("config"), root.path()).expect("preview");

        assert_eq!(preview.candidates[0].host, "safe.example");
        assert_eq!(preview.candidates[1].host, "next.example");
        assert!(!preview.warnings.is_empty());
    }

    #[test]
    fn rejects_recursive_includes() {
        let root = tempdir().expect("root");
        let ssh = root.path().join(".ssh");
        fs::create_dir_all(&ssh).expect("ssh dir");
        fs::write(ssh.join("config"), "Include config\n").expect("config");

        assert_eq!(
            parse_ssh_config(&ssh.join("config"), root.path()),
            Err(SshConfigImportError::Invalid)
        );
    }

    #[test]
    fn accepts_equals_syntax_with_surrounding_whitespace() {
        let root = tempdir().expect("root");
        let ssh = root.path().join(".ssh");
        fs::create_dir_all(&ssh).expect("ssh dir");
        fs::write(
            ssh.join("config"),
            "Host = equals\n  HostName = equals.example\n  Port = 2222\n  User = deploy\n",
        )
        .expect("config");

        let preview = parse_ssh_config(&ssh.join("config"), root.path()).expect("preview");
        assert_eq!(preview.candidates[0].host, "equals.example");
        assert_eq!(preview.candidates[0].port, 2222);
        assert_eq!(preview.candidates[0].username, "deploy");
    }

    #[test]
    fn resolves_relative_includes_beside_a_user_selected_config() {
        let root = tempdir().expect("root");
        let selected = root.path().join("custom");
        fs::create_dir_all(&selected).expect("config dir");
        fs::write(
            selected.join("hosts.conf"),
            "Host custom\n  HostName custom.example\n",
        )
        .expect("include");
        fs::write(selected.join("selected-config"), "Include hosts.conf\n").expect("config");

        let preview = parse_ssh_config(&selected.join("selected-config"), root.path())
            .expect("preview selected config");

        assert_eq!(preview.candidates[0].alias, "custom");
        assert_eq!(preview.candidates[0].host, "custom.example");
    }
}
