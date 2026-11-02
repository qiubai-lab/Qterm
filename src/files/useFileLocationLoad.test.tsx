import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WorkbenchActivity } from "../workspace/workbenchActivity";
import { useFileLocationLoad } from "./useFileLocationLoad";

it("pauses directory loading and refreshes the existing location once after unlock",async()=>{
  let active=false;
  const load=vi.fn().mockResolvedValue(true);
  const refs={roots:{current:false},runtime:{current:"local:"},path:{current:"/work"},inputPath:{current:"/work"}};
  const view=renderHook(()=>useFileLocationLoad("local:","/work",refs,load),{wrapper:({children}:{children:ReactNode})=><WorkbenchActivity value={active}>{children}</WorkbenchActivity>});
  expect(load).not.toHaveBeenCalled();
  active=true;view.rerender();await waitFor(()=>expect(load).toHaveBeenCalledOnce());
  view.rerender();expect(load).toHaveBeenCalledOnce();
  active=false;view.rerender();expect(load).toHaveBeenCalledOnce();
  active=true;await act(async()=>view.rerender());await waitFor(()=>expect(load).toHaveBeenCalledTimes(2));
});
