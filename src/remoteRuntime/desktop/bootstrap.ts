import { reportWorkbenchPointer } from "./framePointer";
import { configureRuntimeApi } from "../../server/http";
import { pauseData } from "../../server/dataAccess";
import { framePort } from "./frame";
export function bootstrapRemoteMember() {
  pauseData();
  document.documentElement.dataset.theme = window.parent.document.documentElement.dataset.theme ?? "dark";
  configureRuntimeApi(framePort!.apiBase);
  document.documentElement.dataset.runtimeMember = "true";
  window.addEventListener("pointerdown", reportWorkbenchPointer, true);
  window.addEventListener("keydown", framePort!.shortcut, true);
}
