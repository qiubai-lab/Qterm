export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  modifiedAt: number | null;
  permissionMode: number | null;
}

export interface FileDocument {
  content: string;
  revision: string;
  modifiedAt: number | null;
  size: number;
}

export interface DirectoryListing {
  path: string;
  entries: FileEntry[];
}

export interface LocalRoot {
  name: string;
  path: string;
}
