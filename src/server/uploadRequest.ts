import { dataLease, pauseData } from "./dataAccess";
import { accessHeaders, accessProof } from "./accessIdentity";
import { API, AUTH_EXPIRED, api, RequestError } from "./http";

/** Both legs count equally: browser -> service, then service -> destination. */
export function uploadRequest<T>(path: string, body: FormData, taskId: string, bytes: number, signal: AbortSignal, progress: (bytes: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const lease = dataLease();
    signal = AbortSignal.any([signal, lease.signal]);
    signal.throwIfAborted();
    const xhr = new XMLHttpRequest(), proof = accessProof().accessKey;
    const polling = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, finished = false, sent = 0;
    const report = (value: number) => {
      if (finished) return;
      sent = Math.max(sent, Math.min(Math.floor(bytes * 0.99), Math.floor(value)));
      progress(sent);
    };
    const cleanup = () => { finished = true; clearTimeout(timer); polling.abort(); signal.removeEventListener("abort", abort); };
    const fail = (error: unknown) => { if (!finished) { cleanup(); reject(error); xhr.abort(); } };
    const abort = () => fail(lease.signal.aborted ? lease.signal.reason : new DOMException("上传已取消", "AbortError"));
    async function poll() {
      try {
        const value = await api<{transferredBytes:number}>(`/transfers/${taskId}/progress`, "GET", undefined, polling.signal);
        if (value.transferredBytes > 0) report(bytes / 2 + Math.min(bytes, value.transferredBytes) / 2);
      } catch (error) {
        if (error instanceof RequestError && error.status === 401) fail(error);
        // Registration can lag the first request; a progress failure must not restart an upload.
      }
      if (!finished) timer = setTimeout(() => void poll(), 250);
    }
    xhr.open("POST", `${API}${path}`);
    xhr.withCredentials = true;
    xhr.timeout = 660000;
    for (const [key, value] of Object.entries(accessHeaders())) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = event => { if (event.lengthComputable) report(bytes * event.loaded / event.total / 2); };
    xhr.upload.onload = () => { report(bytes / 2); void poll(); };
    xhr.onload = () => {
      if (finished) return;
      let value: T & {code?:string;message?:string};
      try { value = JSON.parse(xhr.responseText); } catch { fail(new Error("服务端返回了无效的上传结果")); return; }
      if (value.code === "terminalLocked") pauseData();
      if (xhr.status < 200 || xhr.status >= 300) {
        if (xhr.status === 401 && proof === accessProof().accessKey) window.dispatchEvent(new CustomEvent(AUTH_EXPIRED,{detail:value.code}));
        fail(new RequestError(value.code ?? "uploadFailed", value.message ?? "上传失败", xhr.status)); return;
      }
      progress(bytes); cleanup(); resolve(value);
    };
    xhr.onerror = () => fail(new Error("上传连接中断，请重试"));
    xhr.ontimeout = () => fail(new Error("上传超时，请重试"));
    xhr.onabort = abort;
    signal.addEventListener("abort", abort, {once:true});
    xhr.send(body);
  });
}
