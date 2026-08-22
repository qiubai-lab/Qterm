export function ConfigurationPaths({ rootDirectory }: { rootDirectory: string }) {
  const paths = [
    { title: "核心数据", description: "连接、网络规则与加密凭证", path: joinPath(rootDirectory, "data") },
    { title: "设备数据", description: "系统设置、主机信任与 Workspace", path: joinPath(rootDirectory, "device") },
    { title: "缓存", description: "可安全重新生成的运行数据", path: joinPath(rootDirectory, "cache") },
  ];

  return <section className="settings-paths-card" role="group" aria-label="配置路径">
    <div className="settings-card-heading">
      <span><strong>配置路径</strong><small>随配置目录整体切换</small></span>
    </div>
    <div className="settings-path-list">
      {paths.map((item) => <div className="settings-path-row" key={item.title}>
        <span><strong>{item.title}</strong><small>{item.description}</small></span>
        <code title={item.path}>{item.path}</code>
      </div>)}
    </div>
  </section>;
}

function joinPath(root: string, child: string) {
  const normalized = root.trim().replace(/[\\/]+$/, "");
  if (!normalized) return child;
  const separator = normalized.includes("\\") && !normalized.includes("/") ? "\\" : "/";
  return `${normalized}${separator}${child}`;
}
