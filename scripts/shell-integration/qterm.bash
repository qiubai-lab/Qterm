# Source in the current interactive Bash session; does not edit startup files.
[[ $- == *i* ]] || return 0
[[ ${__qterm_commands_loaded-} != 1 ]] || return 0
# PS0 was introduced in Bash 4.4. Do not replace a user's DEBUG trap.
if (( BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 4) )); then
  printf '%s\n' 'Qterm command navigation requires Bash 4.4 or newer.' >&2
  return
fi
if [[ $(declare -p PS0 PS1 PROMPT_COMMAND 2>/dev/null) =~ declare[[:space:]]+-[^[:space:]]*r ]]; then
  printf '%s\n' 'Qterm command navigation: prompt variables are readonly.' >&2
  return
fi
__qterm_commands_loaded=1
__qterm_command_end() {
  local code=$?
  builtin printf '\033]133;D;%s\007' "$code"
  return "$code"
}
if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
  PROMPT_COMMAND=(__qterm_command_end "${PROMPT_COMMAND[@]}")
else
  PROMPT_COMMAND="__qterm_command_end${PROMPT_COMMAND:+;${PROMPT_COMMAND}}"
fi
PS0="${PS0-}"$'\033]133;C\007'
PS1='\[\e]133;A\a\]'"${PS1-}"'\[\e]133;B\a\]'
