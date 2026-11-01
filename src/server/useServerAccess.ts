import { useCallback, useEffect, useRef, useState } from "react";
import { bootstrapAppTheme } from "../app/theme/AppThemeProvider";
import { accessProof, rememberAccess } from "./accessIdentity";
import { openAccessPresence } from "./accessPresence";
import { api, AUTH_EXPIRED, message } from "./http";
import { closeAllSessions } from "./sessionTransport";

type Admission = {authenticated:true;accessKey:string} | {authenticated:false;takeoverTicket:string};
type Phase = "checking" | "login" | "occupied" | "workspace" | "replaced";
export function useServerAccess() {
  const [phase,setPhase] = useState<Phase>("checking");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const ticket = useRef("");
  const epoch = useRef(0);
  const invalidate = useCallback(() => { epoch.current++; },[]);
  const stopPresence = useRef<(() => void) | undefined>(undefined);
  const leave = useCallback(() => { stopPresence.current?.();stopPresence.current=undefined;closeAllSessions(); },[]);
  const admit = useCallback((result: Admission, generation: number) => {
    if (generation !== epoch.current) return;
    if (!result.authenticated) {
      ticket.current=result.takeoverTicket;setPhase("occupied");return;
    }
    rememberAccess(result.accessKey);ticket.current="";setPhase("checking");
    stopPresence.current?.();
    stopPresence.current=openAccessPresence(() => {
      void bootstrapAppTheme().then(() => {
        if (generation===epoch.current) {setPhase("workspace");setError("");}
      }).catch(reason => {if(generation===epoch.current){setError(message(reason));setPhase("login");leave();}});
    },() => {if(generation===epoch.current){closeAllSessions();setPhase("checking");setError("连接中断，正在重新连接…");}});
  },[leave]);
  useEffect(() => {
    const generation=++epoch.current;
    const expire = (event: Event) => {
      const replaced = (event as CustomEvent).detail === "sessionReplaced";
      epoch.current++;leave();rememberAccess("");ticket.current="";setBusy(false);
      // Keep the mounted workbench until acknowledgment. Late failed requests
      // must not dismiss this notice or restore the revoked connection.
      setPhase(current => current === "replaced" || (replaced && current === "workspace") ? "replaced" : "login");
      setError(replaced ? "连接已被其他会话接管。后台任务继续运行。" : "登录已失效，请重新登录");
    };
    window.addEventListener(AUTH_EXPIRED,expire);
    const restorePage=(event:PageTransitionEvent)=>{if(event.persisted)window.location.reload();};
    window.addEventListener("pageshow",restorePage);
    window.addEventListener("pagehide",leave);
    void (async()=>{
      if(!accessProof().accessKey){if(generation===epoch.current)setPhase("login");return;}
      try {
        // Refresh can arrive just before the old presence close frame. Give it time
        // to detach; a copied tab with a live owner still gets the takeover dialog.
        for(let attempt=0;attempt<4;attempt++){
          const result=await api<Admission>("/access/resume","POST",accessProof());
          if(generation!==epoch.current)return;
          if(result.authenticated || attempt===3){admit(result,generation);return;}
          await new Promise(resolve=>window.setTimeout(resolve,250));
        }
      } catch(reason) {if(generation===epoch.current){rememberAccess("");setPhase("login");setError(message(reason));}}
    })();
    return()=>{invalidate();leave();window.removeEventListener(AUTH_EXPIRED,expire);window.removeEventListener("pageshow",restorePage);window.removeEventListener("pagehide",leave);};
  },[admit,invalidate,leave]);
  async function submit(path:string,body:unknown) {
    const generation=++epoch.current;setBusy(true);setError("");
    try {admit(await api<Admission>(path,"POST",body),generation);}
    catch(reason){if(generation===epoch.current){setError(message(reason));setPhase("login");ticket.current="";}}
    finally{if(generation===epoch.current)setBusy(false);}
  }
  async function logout() {
    await api("/logout","POST");epoch.current++;leave();rememberAccess("");setPhase("login");setError("");
  }
  function cancel() {epoch.current++;ticket.current="";rememberAccess("");setPhase("login");setError("");}
  function acknowledgeReplaced() {epoch.current++;setPhase("login");setError("");}
  return {phase,busy,error,logout,cancel,acknowledgeReplaced,
    login:(password:string)=>submit("/login",{password,clientId:accessProof().clientId}),
    takeover:()=>submit("/access/takeover",{ticket:ticket.current,clientId:accessProof().clientId}),
  };
}
