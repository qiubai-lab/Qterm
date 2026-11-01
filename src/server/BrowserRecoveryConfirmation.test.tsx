import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BrowserRecoveryConfirmation } from "../components/dialogs/BrowserRecoveryConfirmation";

it("requires a separate acknowledgement after download, and invalidates it on retry", async () => {
  const download = vi.fn().mockResolvedValue(undefined);
  const onSavedChange = vi.fn();
  render(<BrowserRecoveryConfirmation download={download} onSavedChange={onSavedChange}/>);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"下载恢复密钥"}));
  await screen.findByRole("checkbox");
  expect(onSavedChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(onSavedChange).toHaveBeenLastCalledWith(true);
  download.mockRejectedValueOnce(new Error("下载失败"));
  fireEvent.click(screen.getByRole("button", {name:"下载恢复密钥"}));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("下载失败"));
  expect(onSavedChange).toHaveBeenLastCalledWith(false);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
