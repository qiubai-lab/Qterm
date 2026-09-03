import { useState, type FormEvent } from "react";

import { ExactTextInput } from "../components/ExactTextInput";
import { Icon } from "../components/Icon";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";
import type { GitRepositoryHistoryEntry } from "../workspace/model";
import type { GitRuntime } from "../workspace/WorkspaceProvider";
import { GitRepositoryHistoryList } from "./GitRepositoryHistoryPopover";
import { GitRepositoryPickerDialog } from "./GitRepositoryPickerDialog";

interface GitRemoteTargetConfigProps {
  blockId: string;
  profileId: string;
  profileName: string;
  path: string;
  recentRepositories: GitRepositoryHistoryEntry[];
  sessionId: string | null;
  connectionStatus: GitRuntime["status"];
  onPathChange: (path: string) => void;
  onOpen: (path: string, reusePreparedSession: boolean) => void;
  onPrepareBrowse: () => void;
  onCancelBrowse: () => void;
  onCancel: () => void;
}

export function GitRemoteTargetConfig(props: GitRemoteTargetConfigProps) {
  const [pickerRequested, setPickerRequested] = useState(false);
  const inputId = `git-remote-path-${props.blockId}`;
  const labelId = `${inputId}-label`;
  const browseBusy = pickerRequested && (props.connectionStatus === "connecting" || props.connectionStatus === "closing");

  function submit(event: FormEvent) {
    event.preventDefault();
    const path = props.path.trim();
    if (path) props.onOpen(path, false);
  }

  return <>
    <form className="git-target-config" onSubmit={submit}>
      <Icon name="git" size={28}/>
      <strong>设置远程仓库路径</strong>
      <span>路径位于“{props.profileName}”上，不会复用终端会话。</span>
      {props.recentRepositories.length > 0 && <section className="git-target-history" aria-label="该连接的最近仓库">
        <span>最近仓库</span>
        <div className="git-target-history-scroll">
          <GitRepositoryHistoryList
            repositories={props.recentRepositories}
            currentRepository={null}
            ariaLabel="该连接的最近仓库"
            onSelect={(repository) => props.onOpen(repository.path, false)}
          />
        </div>
      </section>}
      <label id={labelId} htmlFor={inputId}><RequiredFieldLabel>远程工作目录</RequiredFieldLabel></label>
      <div className="git-target-path-group" role="group" aria-labelledby={labelId}>
        <ExactTextInput
          id={inputId}
          required
          autoFocus
          autoComplete="off"
          value={props.path}
          maxLength={4096}
          placeholder="/srv/project"
          onChange={(event) => props.onPathChange(event.target.value)}
        />
        <button
          type="button"
          className="git-target-browse"
          aria-label="浏览远程目录"
          aria-busy={browseBusy || undefined}
          disabled={browseBusy}
          onClick={() => {
            setPickerRequested(true);
            props.onPrepareBrowse();
          }}
        ><Icon name="files" size={13}/><span>{browseBusy ? "连接中" : "浏览"}</span></button>
      </div>
      <div className="git-target-actions">
        <button type="button" className="secondary" onClick={props.onCancel}>取消</button>
        <button type="submit" disabled={!props.path.trim()}>连接并打开</button>
      </div>
    </form>
    {pickerRequested && props.connectionStatus === "connected" && props.sessionId && <GitRepositoryPickerDialog
      mode="remote"
      sessionId={props.sessionId}
      profileId={props.profileId}
      initialPath={props.path.trim() || "."}
      onClose={() => {
        setPickerRequested(false);
        props.onCancelBrowse();
      }}
      onSelect={(path) => {
        setPickerRequested(false);
        props.onOpen(path, true);
      }}
    />}
  </>;
}
