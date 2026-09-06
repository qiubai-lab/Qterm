// Enter through ENV in a real interactive login Bash. Restore normal Bash mode
// before reading profiles; --rcfile alone would lose login_shell/.bash_logout.
pub(super) const BASH_LOGIN: &str = r#"__qterm_startup_file=$ENV
if [[ ${QTERM_ENV_SET-} == x ]]; then export ENV=$QTERM_ENV; else builtin unset ENV; fi
if [[ ${QTERM_HISTFILE_SET-} != x ]]; then builtin export -n HISTFILE; fi
builtin unset QTERM_ENV QTERM_ENV_SET QTERM_HISTFILE_SET
builtin set +o posix
builtin shopt -u inherit_errexit 2>/dev/null || true
command rm -f -- "$__qterm_startup_file"
command rmdir -- "${__qterm_startup_file%/*}" 2>/dev/null
builtin unset __qterm_startup_file
if [[ -r /etc/profile ]]; then builtin source /etc/profile; fi
if [[ -r $HOME/.bash_profile ]]; then builtin source "$HOME/.bash_profile"
elif [[ -r $HOME/.bash_login ]]; then builtin source "$HOME/.bash_login"
elif [[ -r $HOME/.profile ]]; then builtin source "$HOME/.profile"
fi
"#;

pub(super) const BASH_HOOK: &str = r#"__qterm_osc7() {
    builtin local qterm_status=$? LC_ALL=C path= char hex i
    for ((i=0; i<${#PWD}; i++)); do
        char=${PWD:i:1}
        case $char in
            [a-zA-Z0-9/._~-]) path+=$char ;;
            *) builtin printf -v hex '%%%02X' "'$char"; path+=$hex ;;
        esac
    done
    builtin printf '\033]7;file://%s%s\007' "${HOSTNAME:-localhost}" "$path"
    return "$qterm_status"
}
if [[ ${__qterm_osc7_installed-} != 1 ]]; then
    PROMPT_COMMAND=(__qterm_osc7 "${PROMPT_COMMAND[@]}")
    __qterm_osc7_installed=1
fi
"#;

pub(super) const ZSH_ENV: &str = r#"__qterm_startup_dir=$ZDOTDIR
__qterm_zdotdir=$QTERM_ZDOTDIR
__qterm_zdotdir_set=$QTERM_ZDOTDIR_SET
builtin unset QTERM_ZDOTDIR QTERM_ZDOTDIR_SET
"#;

pub(super) const ZSH_FINISH: &str = r#"command rm -f -- "$__qterm_startup_dir/.zshenv" "$__qterm_startup_dir/.zprofile" "$__qterm_startup_dir/.zshrc" "$__qterm_startup_dir/.zlogin"
command rmdir -- "$__qterm_startup_dir" 2>/dev/null
if [[ $__qterm_zdotdir_set != x ]]; then builtin unset ZDOTDIR; fi
builtin unset __qterm_startup_dir __qterm_zdotdir __qterm_zdotdir_set
"#;

pub(super) const ZSH_HOOK: &str = r#"__qterm_osc7() {
    local qterm_status=$? LC_ALL=C qterm_path= char hex i
    for ((i=1; i<=${#PWD}; i++)); do
        char=$PWD[i]
        case $char in
            [a-zA-Z0-9/._~-]) qterm_path+=$char ;;
            *) builtin printf -v hex '%%%02X' "'$char"; qterm_path+=$hex ;;
        esac
    done
    builtin printf '\033]7;file://%s%s\007' "${HOST:-localhost}" "$qterm_path"
    return "$qterm_status"
}
autoload -Uz add-zsh-hook
add-zsh-hook -d precmd __qterm_osc7 2>/dev/null
add-zsh-hook precmd __qterm_osc7
"#;

pub(super) const FISH_HOOK: &str = r#"function __qterm_osc7 --on-event fish_prompt
    set -l qterm_status $status
    printf '\e]7;file://%s%s\a' $hostname (string escape --style=url -- $PWD | string replace -a '%2F' '/')
    return $qterm_status
end
"#;

pub(super) const POWERSHELL_HOOK: &str = r#"if (-not $global:__QtermOriginalPrompt) {
    $global:__QtermOriginalPrompt=$function:prompt
    function global:prompt {
        $qtermPrompt = & $global:__QtermOriginalPrompt
        $qtermExit=$global:LASTEXITCODE
        $qtermPath=(Get-Location).Path.Replace('\','/')
        if (-not $qtermPath.StartsWith('/')) { $qtermPath='/'+$qtermPath }
        $qtermPath=($qtermPath.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
        [Console]::Write(([char]27)+']7;file://'+[System.Net.Dns]::GetHostName()+$qtermPath+([char]7))
        $global:LASTEXITCODE=$qtermExit
        $qtermPrompt
    }
}
"#;
