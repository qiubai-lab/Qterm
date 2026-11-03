import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ServerEntry } from "./model";
export function useServerManagerMotion(initialId: string | null, entries: ServerEntry[]) {
  const listRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const generation = useRef(0), current = useRef(initialId);
  const [target, setTarget] = useState(initialId);
  const [indicator, setIndicator] = useState<{top:number;height:number}|null>(null);
  useLayoutEffect(() => {
    const container=listRef.current;
    const row=Array.from(container?.querySelectorAll<HTMLElement>("[data-server-id]") ?? []).find(node=>node.dataset.serverId===target);
    if (!container || !row) {setIndicator(null); return;}
    const measure=()=>setIndicator({top:row.offsetTop,height:row.offsetHeight});
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer=new ResizeObserver(measure);observer.observe(container);observer.observe(row);return()=>observer.disconnect();
  },[target,entries]);
  useEffect(()=>()=>{generation.current++;animation.current?.cancel();},[]);
  function select(id: string|null, commit:()=>void) {
    const epoch=++generation.current;animation.current?.cancel();setTarget(id);
    const element=stageRef.current;
    const direction=entries.findIndex(entry=>entry.id===id)<entries.findIndex(entry=>entry.id===current.current)?-1:1;
    const update=()=>{
      if(epoch!==generation.current)return;
      commit();current.current=id;
      if(element?.animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) animation.current=element.animate([{opacity:0,transform:`translateY(${direction*7}px)`},{opacity:1,transform:"translateY(0)"}],{duration:id?200:240,easing:"cubic-bezier(.33,1,.68,1)"});
    };
    if(!element?.animate || !current.current || !id || id===current.current || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){update();return;}
    const exit=element.animate([{opacity:1,transform:"translateY(0)"},{opacity:0,transform:`translateY(${-direction*7}px)`}],{duration:90,easing:"ease-in"});
    animation.current=exit;void exit.finished.then(update).catch(()=>undefined);
  }
  return {listRef,stageRef,target,indicator,select};
}
