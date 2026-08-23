import { getVersion } from "@tauri-apps/api/app";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  checkForUpdate,
  openLatestReleasePage,
  updateCheckMessage,
} from "../../lib/updateCheck";
import { Icon } from "../Icon";
import { Button, IconButton } from "../Button";
import { DialogFrame } from "./DialogFrame";
import "./aboutUpdate.css";

const PROJECT_URL = "https://github.com/qiubai-lab/Qterm";
const HOMEBREW_UPDATE_COMMAND = "brew update && brew upgrade --cask qterm";

type UpdateState =
  | { status: "checking" }
  | { status: "latest"; currentVersion: string }
  | { status: "available"; currentVersion: string; version: string }
  | { status: "error"; message: string };

interface HelpDialogProps {
  onClose: () => void;
  autoCheckOnStartup?: boolean;
  onAutoCheckOnStartupChange?: (enabled: boolean) => Promise<void>;
}

export function HelpDialog({ onClose, autoCheckOnStartup = false, onAutoCheckOnStartupChange }: HelpDialogProps) {
  const [version, setVersion] = useState<string | null>(null);
  const [versionUnavailable, setVersionUnavailable] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updatePreferenceBusy, setUpdatePreferenceBusy] = useState(false);
  const [updatePreferenceError, setUpdatePreferenceError] = useState("");

  const changeAutoCheckPreference = async () => {
    if (!onAutoCheckOnStartupChange || updatePreferenceBusy) return;
    setUpdatePreferenceBusy(true);
    setUpdatePreferenceError("");
    try {
      await onAutoCheckOnStartupChange(!autoCheckOnStartup);
    } catch {
      setUpdatePreferenceError("保存失败，请重试");
    } finally {
      setUpdatePreferenceBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    void getVersion()
      .then((value) => {
        if (active) setVersion(value);
      })
      .catch(() => {
        if (active) setVersionUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const versionLabel = versionUnavailable
    ? "开发构建"
    : version
      ? `v${version}`
      : "正在读取…";
  return (
    <>
      <DialogFrame
        title="关于 Qterm"
        subtitle="项目与版本信息"
        onClose={onClose}
        dismissible={!updateDialogOpen}
        blocking={false}
        className="about-dialog"
      >
        <div className="about-page">
          <section className="about-hero" aria-labelledby="about-product-name">
            <span className="about-product-mark">
              <Icon name="terminal" size={25} />
            </span>
            <div className="about-hero-copy">
              <div className="about-product-heading">
                <h3 id="about-product-name">Qterm</h3>
                <span aria-live="polite">{versionLabel}</span>
              </div>
              <p>轻量、安全、跨平台的 SSH 终端与远程文件工作台。</p>
            </div>
          </section>

          <dl className="about-details">
            <div><dt>项目名称</dt><dd>Qterm</dd></div>
            <div><dt>作者</dt><dd>秋白</dd></div>
            <div>
              <dt>项目地址</dt>
              <dd><a href={PROJECT_URL} target="_blank" rel="noreferrer">github.com/qiubai-lab/Qterm</a></dd>
            </div>
            <div><dt>当前版本</dt><dd>{versionLabel}</dd></div>
            <div><dt>开源许可</dt><dd>GNU GPL v3.0</dd></div>
          </dl>

          <section className="about-update" aria-labelledby="about-update-title">
            <span className="about-update-icon" aria-hidden="true">
              <Icon name="refresh" size={17} />
            </span>
            <div className="about-update-heading">
              <h4 id="about-update-title">检测更新</h4>
              <span><i />{autoCheckOnStartup ? "启动检测已开启" : "手动检测"}</span>
            </div>
            <p>启动检测仅在发现新版时提示，也可随时手动检查。</p>
            <div className="about-update-controls">
              <Button
                variant="quiet"
                size="compact"
                className="about-update-autocheck"
                role="switch"
                aria-checked={autoCheckOnStartup}
                aria-busy={updatePreferenceBusy || undefined}
                aria-label="启动时自动检测更新"
                disabled={!onAutoCheckOnStartupChange || updatePreferenceBusy}
                onClick={() => void changeAutoCheckPreference()}
              >
                <span className="about-update-switch-track" aria-hidden="true">
                  <span className="about-update-switch-thumb" />
                </span>
                <span
                  className="about-update-autocheck-label"
                  data-busy={updatePreferenceBusy ? "true" : "false"}
                  aria-hidden="true"
                >
                  <span className="about-update-autocheck-label-idle">启动时检测</span>
                  <span className="about-update-autocheck-label-busy">保存中</span>
                </span>
              </Button>
              <Button
                variant="primary"
                size="compact"
                className="about-update-action"
                onClick={() => setUpdateDialogOpen(true)}
              >
                检测更新
              </Button>
              {updatePreferenceError && <span className="about-update-preference-error" role="alert">{updatePreferenceError}</span>}
            </div>
          </section>
        </div>
      </DialogFrame>
      {updateDialogOpen && (
        <UpdateCheckDialog onClose={() => setUpdateDialogOpen(false)} />
      )}
    </>
  );
}

function UpdateCheckDialog({ onClose }: { onClose: () => void }) {
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "checking" });
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const requestIdRef = useRef(0);

  const completeUpdateCheck = useCallback(async (requestId: number) => {
    try {
      const result = await checkForUpdate();
      if (requestId !== requestIdRef.current) return;
      setUpdateState(
        result.status === "available"
          ? { status: "available", currentVersion: result.currentVersion, version: result.latestVersion }
          : { status: "latest", currentVersion: result.currentVersion },
      );
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setUpdateState({ status: "error", message: updateCheckMessage(error) });
    }
  }, []);

  const handleCheckForUpdate = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setUpdateState({ status: "checking" });
    void completeUpdateCheck(requestId);
  }, [completeUpdateCheck]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    void completeUpdateCheck(requestId);
    return () => { requestIdRef.current += 1; };
  }, [completeUpdateCheck]);

  const handleOpenReleasePage = async () => {
    try {
      await openLatestReleasePage();
    } catch {
      setUpdateState({ status: "error", message: "无法打开下载页面，请稍后重试。" });
    }
  };

  const handleCopyCommand = async () => {
    try {
      await writeClipboardText(HOMEBREW_UPDATE_COMMAND);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const statusTitle = updateState.status === "checking"
    ? "正在检测新版本"
    : updateState.status === "latest"
      ? "已是最新版本"
      : updateState.status === "available"
        ? "发现可用更新"
        : "检测失败";
  const statusDescription = updateState.status === "checking"
    ? "正在连接 GitHub Releases，请稍候…"
    : updateState.status === "latest"
      ? `当前已是最新版本 v${updateState.currentVersion}`
      : updateState.status === "available"
        ? `发现新版本 v${updateState.version}`
        : updateState.message;

  return (
    <DialogFrame
      title="检测更新"
      subtitle="检查 Qterm 最新稳定版本"
      onClose={onClose}
      compact
      className="update-check-dialog"
    >
      <div className="update-check-body">
        <section
          className="update-check-status"
          data-status={updateState.status}
          aria-live="polite"
          aria-atomic="true"
          role={updateState.status === "error" ? "alert" : undefined}
        >
          <span className={`update-check-status-icon ${updateState.status}`} aria-hidden="true">
            <Icon name={updateState.status === "latest" || updateState.status === "available" ? "check" : "refresh"} size={20} />
          </span>
          <div>
            <strong>{statusTitle}</strong>
            <p>{statusDescription}</p>
            {updateState.status === "available" && <small>当前版本 v{updateState.currentVersion}</small>}
          </div>
          {updateState.status !== "checking" && (
            <div className="update-check-status-actions">
              {updateState.status === "available" && (
                <Button variant="primary" size="compact" className="update-check-release" onClick={() => void handleOpenReleasePage()}>
                  前往 Releases
                </Button>
              )}
              <IconButton
                label="重新检测"
                variant="secondary"
                size="compact"
                className="update-check-recheck"
                title="重新检测"
                onClick={handleCheckForUpdate}
              >
                <Icon name="refresh" size={14} />
              </IconButton>
            </div>
          )}
        </section>

        <section className="update-check-homebrew" aria-labelledby="update-check-homebrew-title">
          <div>
            <strong id="update-check-homebrew-title">使用 Homebrew 更新</strong>
            <p>在终端中运行 README 推荐的升级命令。</p>
          </div>
          <div className="update-check-command">
            <code>{HOMEBREW_UPDATE_COMMAND}</code>
            <Button
              size="compact"
              className="update-check-copy"
              aria-label={copyState === "copied" ? "已复制 Homebrew 更新命令" : copyState === "error" ? "复制失败，重新复制 Homebrew 更新命令" : "复制 Homebrew 更新命令"}
              onClick={() => void handleCopyCommand()}
            >
              <Icon name={copyState === "copied" ? "check" : copyState === "error" ? "refresh" : "copy"} size={13} />
              {copyState === "copied" ? "已复制" : copyState === "error" ? "重试" : "复制"}
            </Button>
          </div>
        </section>
      </div>
    </DialogFrame>
  );
}
