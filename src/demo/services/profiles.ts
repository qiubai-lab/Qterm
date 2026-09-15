import type * as Desktop from "../../lib/tauri/profiles";
import { demoProfiles } from "../fixtures";

export const listProfiles: typeof Desktop.listProfiles = async () => structuredClone(demoProfiles);
export const listProfileGroups: typeof Desktop.listProfileGroups = async () => [{ id: "demo-servers", name: "演示服务器" }];
