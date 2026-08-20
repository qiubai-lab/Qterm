import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

import { Icon } from "../Icon";
import { DialogFrame } from "./DialogFrame";

const PROJECT_URL = "https://github.com/qiubai-lab/Qterm";

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState<string | null>(null);
  const [versionUnavailable, setVersionUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void getVersion()
      .then((value) => { if (active) setVersion(value); })
      .catch(() => { if (active) setVersionUnavailable(true); });
    return () => { active = false; };
  }, []);

  const versionLabel = versionUnavailable ? "开发构建" : version ? `v${version}` : "正在读取…";

  return <DialogFrame title="关于 Qterm" subtitle="项目与版本信息" onClose={onClose} className="about-dialog">
    <div className="about-page">
      <section className="about-hero" aria-labelledby="about-product-name">
        <span className="about-product-mark"><Icon name="terminal" size={25}/></span>
        <div className="about-hero-copy">
          <div className="about-product-heading"><h3 id="about-product-name">Qterm</h3><span aria-live="polite">{versionLabel}</span></div>
          <p>轻量、安全、跨平台的 SSH 终端与远程文件工作台。</p>
        </div>
      </section>

      <dl className="about-details">
        <div><dt>项目名称</dt><dd>Qterm</dd></div>
        <div><dt>作者</dt><dd>Qterm contributors</dd></div>
        <div><dt>项目地址</dt><dd><a href={PROJECT_URL} target="_blank" rel="noreferrer">github.com/qiubai-lab/Qterm</a></dd></div>
        <div><dt>当前版本</dt><dd>{versionLabel}</dd></div>
        <div><dt>开源许可</dt><dd>GNU GPL v3.0</dd></div>
      </dl>

      <section className="about-update" aria-labelledby="about-update-title">
        <div className="about-update-copy">
          <span className="about-update-icon"><Icon name="refresh" size={17}/></span>
          <div><div className="about-update-heading"><h4 id="about-update-title">更新检测</h4><span><i/>功能规划中</span></div><p>自动检测与应用内更新将在后续版本提供。</p></div>
        </div>
      </section>
    </div>
  </DialogFrame>;
}
