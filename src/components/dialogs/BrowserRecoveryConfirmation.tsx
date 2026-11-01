import { useState } from "react";
import { Button } from "../Button";

interface Props {
  download: () => Promise<void>;
  onSavedChange: (saved: boolean) => void;
}

/** Browsers cannot attest that a download was saved; require a separate acknowledgement. */
export function BrowserRecoveryConfirmation({ download, onSavedChange }: Props) {
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function prepare() {
    setBusy(true);
    setError("");
    onSavedChange(false);
    setDownloaded(false);
    try {
      await download();
      setDownloaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "恢复文件下载失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="master-password-form">
    <Button loading={busy} onClick={() => void prepare()}>下载恢复密钥</Button>
    {downloaded && <label>
      <input type="checkbox" onChange={event => onSavedChange(event.target.checked)}/>
      我已保存恢复密钥，并确认可以访问该文件
    </label>}
    {error && <p role="alert" className="inline-message">{error}</p>}
  </div>;
}
