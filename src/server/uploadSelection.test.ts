import { expect, it } from "vitest";
import { registerUpload, takeUpload, collectDrop, registerUploadError } from "./uploadSelection";
it("retains relative names and empty directories, and consumes handles once", () => {
  const entries = [{path:"folder/empty"}, {path:"folder/a.txt",file:new File(["a"],"a.txt")}];
  const id = registerUpload(entries);
  expect(takeUpload(id)).toEqual(entries);
  expect(()=>takeUpload(id)).toThrow("重新选择");
});
it("accepts a large file and a batch whose combined size exceeds 128 MiB", () => {
  const files = [160, 80, 80].map((mib, index) => {
    const file = new File([], index + ".bin");
    Object.defineProperty(file, "size", { value: mib * 1024 ** 2 });
    return { path: file.name, file };
  });
  for (const entries of [files.slice(0, 1), files.slice(1)]) {
    expect(takeUpload(registerUpload(entries))).toEqual(entries);
  }
});
it("rejects traversal and Windows path separators before uploading", () => {
  for (const path of ["../a","/a","C:/a","a\\b","a//b"]) expect(()=>registerUpload([{path}])).toThrow("无效路径");
});
it("accepts browser file drops without exposing client filesystem paths", async () => {
  const files = [new File(["x"],"x.txt")];
  const ids = await collectDrop({files,items:[]} as unknown as DataTransfer);
  expect(takeUpload(ids[0])[0].path).toBe("x.txt");
});
it("preserves a drop scanning failure for the receiving file pane", () => {
  const id = registerUploadError(new Error("一次上传最多 10,000 项"));
  expect(()=>takeUpload(id)).toThrow("10,000 项");
  expect(()=>takeUpload(id)).toThrow("重新选择");
});
