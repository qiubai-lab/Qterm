import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

import {
  checkForUpdate,
  openLatestReleasePage,
  updateCheckMessage,
} from "../../lib/updateCheck";
import { Icon } from "../Icon";
import { DialogFrame } from "./DialogFrame";
import "./aboutUpdate.css";

const PROJECT_URL = "https://github.com/qiubai-lab/Qterm";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "latest" }
  | { status: "available"; version: string }
  | { status: "error"; message: string };

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState<string | null>(null);
  const [versionUnavailable, setVersionUnavailable] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });

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
  const updateStatusLabel = {
    idle: "手动检查",
    checking: "检查中",
    latest: "已是最新",
    available: "发现更新",
    error: "检查失败",
  }[updateState.status];
  const updateDescription =
    updateState.status === "checking"
      ? "正在连接 GitHub Releases…"
      : updateState.status === "latest"
        ? "当前已是最新版本。"
        : updateState.status === "available"
          ? `发现新版本 v${updateState.version}`
          : updateState.status === "error"
            ? updateState.message
            : "检查 GitHub 上最新发布的稳定版本。";

  const handleCheckForUpdate = async () => {
    if (updateState.status === "checking") return;
    setUpdateState({ status: "checking" });
    try {
      const result = await checkForUpdate();
      setUpdateState(
        result.status === "available"
          ? { status: "available", version: result.latestVersion }
          : { status: "latest" },
      );
    } catch (error) {
      setUpdateState({ status: "error", message: updateCheckMessage(error) });
    }
  };

  const handleOpenReleasePage = async () => {
    try {
      await openLatestReleasePage();
    } catch {
      setUpdateState({
        status: "error",
        message: "无法打开下载页面，请稍后重试。",
      });
    }
  };

  return (
    <DialogFrame
      title="关于 Qterm"
      subtitle="项目与版本信息"
      onClose={onClose}
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

        <section
          className="about-update"
          aria-labelledby="about-update-title"
          data-status={updateState.status}
        >
          <span className="about-update-icon" aria-hidden="true">
            <Icon name="refresh" size={17} />
          </span>
          <div className="about-update-heading">
            <h4 id="about-update-title">更新检测</h4>
            <span><i />{updateStatusLabel}</span>
          </div>
          <p
            aria-live="polite"
            role={updateState.status === "error" ? "alert" : undefined}
          >
            {updateDescription}
          </p>
          {updateState.status === "available" ? (
            <button
              type="button"
              className="about-update-action is-primary"
              onClick={() => void handleOpenReleasePage()}
            >
              前往下载
            </button>
          ) : (
            <button
              type="button"
              className="about-update-action"
              disabled={updateState.status === "checking"}
              onClick={() => void handleCheckForUpdate()}
            >
              {updateState.status === "checking"
                ? "正在检查…"
                : updateState.status === "error"
                  ? "重新检查"
                  : "检查更新"}
            </button>
          )}
        </section>
      </div>
    </DialogFrame>
  );
}
