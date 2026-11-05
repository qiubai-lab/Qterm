import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BlockNotice } from "./BlockNotice";
const forget = vi.hoisted(() => vi.fn());
vi.mock("@qterm/services/sessions", () => ({ forgetHostKey: forget }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const change = { type: "hostKeyChanged" as const, node: { profileId: "jump", name: "跳板", host: "jump.example", port: 2222, index: 0, total: 2, role: "jump" as const }, trustedFingerprint: "SHA256:old", presentedFingerprint: "SHA256:new" };
it("confirms the exact failed endpoint before clearing and reconnecting", async () => {
  const reconnect = vi.fn(); forget.mockResolvedValue(undefined);
  render(<BlockNotice message="主机密钥已变化" hostKeyChange={change} onReconnect={reconnect}/>);
  fireEvent.click(screen.getByRole("button", { name: "删除旧密钥" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("jump.example:2222");
  expect(screen.getByRole("dialog")).toHaveTextContent("SHA256:old");
  expect(screen.getByRole("dialog")).toHaveTextContent("SHA256:new");
  expect(forget).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(forget).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "删除旧密钥" }));
  fireEvent.click(screen.getByRole("button", { name: "清理并重新连接" }));
  await waitFor(() => expect(reconnect).toHaveBeenCalledOnce());
  expect(forget).toHaveBeenCalledExactlyOnceWith({ host: "jump.example", port: 2222, trustedFingerprint: "SHA256:old" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("keeps errors visible and does not reconnect when clearing fails", async () => {
  const reconnect = vi.fn(); forget.mockRejectedValue(new Error("记录已更新"));
  render(<BlockNotice message="主机密钥已变化" hostKeyChange={change} onReconnect={reconnect}/>);
  fireEvent.click(screen.getByRole("button", { name: "删除旧密钥" }));
  fireEvent.click(screen.getByRole("button", { name: "清理并重新连接" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("记录已更新"));
  expect(reconnect).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "清理并重新连接" })).toBeEnabled();
});
it("does not offer key deletion for unrelated failures", () => {
  render(<BlockNotice message="连接超时"/>);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
