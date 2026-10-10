# Source in the current interactive Zsh session; does not edit startup files.
[[ -o interactive ]] || return 0
[[ ${__qterm_commands_loaded-} != 1 ]] || return 0
autoload -Uz add-zsh-hook
__qterm_commands_loaded=1
__qterm_command_end() {
  local code=$?
  printf '\033]133;D;%s\007' "$code"
  # Zsh restores the initial $? for each hook; failure here skips later hooks.
  return 0
}
__qterm_command_start() { printf '\033]133;C\007'; }
# End output before other array hooks render prompt decorations.
precmd_functions=(__qterm_command_end ${precmd_functions:#__qterm_command_end})
add-zsh-hook preexec __qterm_command_start
PS1=$'%{\e]133;A\a%}'"$PS1"$'%{\e]133;B\a%}'
