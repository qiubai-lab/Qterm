//! Shell startup payloads travel in SSH exec requests, never in terminal input.
mod scripts;
#[cfg(test)]
mod tests;

use crate::domain::{session::InitialDirectory, shell_integration::RemoteShell};
use base64::{Engine, engine::general_purpose::STANDARD};

pub(super) fn command(shell: RemoteShell, directory: Option<&InitialDirectory>) -> String {
    let init = initialization(shell, directory);
    match shell {
        RemoteShell::Bash => {
            let script = format!("{}\n{init}\n", scripts::BASH_LOGIN);
            let launch = concat!(
                "QTERM_ENV_SET=${ENV+x} QTERM_ENV=${ENV-} ",
                "QTERM_HISTFILE_SET=${HISTFILE+x} ",
                "HISTFILE=${HISTFILE-$HOME/.bash_history} ENV=$qterm_dir/init ",
                "exec \"$SHELL\" --posix --login -i"
            );
            posix_bootstrap(shell, &[("init", script)], launch)
        }
        RemoteShell::Zsh => {
            let mut files = Vec::new();
            for name in [".zshenv", ".zprofile", ".zshrc", ".zlogin"] {
                let mut script = String::new();
                if name == ".zshenv" {
                    script.push_str(scripts::ZSH_ENV);
                }
                script.push_str(&format!(
                    "if [[ $__qterm_zdotdir_set == x ]]; then ZDOTDIR=$__qterm_zdotdir; else builtin unset ZDOTDIR; fi\n[[ -o rcs && -r ${{ZDOTDIR-$HOME}}/{name} ]] && builtin source \"${{ZDOTDIR-$HOME}}/{name}\"\n__qterm_zdotdir=${{ZDOTDIR-$HOME}}\n__qterm_zdotdir_set=${{ZDOTDIR+x}}\n"
                ));
                if name == ".zlogin" {
                    script.push_str(scripts::ZSH_FINISH);
                    script.push_str(&init);
                } else {
                    script.push_str("ZDOTDIR=$__qterm_startup_dir\n");
                }
                files.push((name, script));
            }
            posix_bootstrap(
                shell,
                &files,
                "QTERM_ZDOTDIR=${ZDOTDIR-$HOME} QTERM_ZDOTDIR_SET=${ZDOTDIR+x} ZDOTDIR=$qterm_dir exec \"$SHELL\" -il",
            )
        }
        RemoteShell::Fish => format!(
            "exec $SHELL --login --interactive --init-command {}",
            fish_literal(&init)
        ),
        RemoteShell::PowerShell => {
            let bytes: Vec<u8> = init.encode_utf16().flat_map(u16::to_le_bytes).collect();
            format!(
                "& (Get-Process -Id $PID).Path -NoExit -EncodedCommand {}",
                STANDARD.encode(bytes)
            )
        }
    }
}

fn posix_bootstrap(shell: RemoteShell, files: &[(&str, String)], launch: &str) -> String {
    // Fixed /tmp root prevents shell expansion of a user-controlled ENV filename.
    // umask is changed only in the mkdir/write subshell, never in the login shell.
    let mut script = format!(
        "case \"${{SHELL##*/}}\" in {}) ;; *) exec \"$SHELL\" -l;; esac\nqterm_dir=$(umask 077; mktemp -d /tmp/qterm-shell.XXXXXXXXXX) || exec \"$SHELL\" -l\nif (umask 077\n",
        shell.as_str()
    );
    for (name, contents) in files {
        script.push_str(&format!(
            "printf '%s' {} > \"$qterm_dir/{name}\" || exit 1\n",
            posix_literal(contents)
        ));
    }
    script.push_str(&format!("); then\n{launch}\nfi\n"));
    for (name, _) in files {
        script.push_str(&format!("rm -f -- \"$qterm_dir/{name}\"\n"));
    }
    script.push_str("rmdir -- \"$qterm_dir\" 2>/dev/null\nexec \"$SHELL\" -l\n");
    format!("exec /bin/sh -c {}", posix_literal(&script))
}

fn initialization(shell: RemoteShell, directory: Option<&InitialDirectory>) -> String {
    let cd = directory.map_or_else(String::new, |directory| match shell {
        RemoteShell::Bash | RemoteShell::Zsh => format!(
            "builtin cd -- {} 2>/dev/null || true\n",
            posix_literal(directory.as_str())
        ),
        RemoteShell::Fish => format!(
            "builtin cd -- {} 2>/dev/null; or true\n",
            fish_literal(directory.as_str())
        ),
        RemoteShell::PowerShell => format!(
            "Set-Location -LiteralPath '{}' -ErrorAction SilentlyContinue\n",
            directory.as_str().replace('\'', "''")
        ),
    });
    format!(
        "{cd}{}",
        match shell {
            RemoteShell::Bash => scripts::BASH_HOOK,
            RemoteShell::Zsh => scripts::ZSH_HOOK,
            RemoteShell::Fish => scripts::FISH_HOOK,
            RemoteShell::PowerShell => scripts::POWERSHELL_HOOK,
        }
    )
}

fn posix_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn fish_literal(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"))
}
