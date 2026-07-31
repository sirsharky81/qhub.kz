/** Pick files preserving relative paths from folder inputs. */
export interface PickedShareFile {
  file: File;
  relativePath: string;
}

function normalizeRelativePath(raw: string): string {
  return raw.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function filesFromFileList(list: FileList | File[]): PickedShareFile[] {
  return Array.from(list).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return {
      file,
      relativePath: rel ? normalizeRelativePath(rel) : file.name,
    };
  });
}

export function folderInputSupported(): boolean {
  return typeof document !== "undefined";
}

export async function pickDirectoryFiles(): Promise<PickedShareFile[]> {
  if (typeof window === "undefined") return [];

  const w = window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  };

  if (w.showDirectoryPicker) {
    const dir = await w.showDirectoryPicker();
    return collectDirectoryFiles(dir, dir.name);
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.webkitdirectory = true;
    input.onchange = () => {
      resolve(input.files?.length ? filesFromFileList(input.files) : []);
    };
    input.click();
  });
}

async function collectDirectoryFiles(
  handle: FileSystemDirectoryHandle,
  basePath: string,
): Promise<PickedShareFile[]> {
  const out: PickedShareFile[] = [];
  for await (const entry of handle.values()) {
    const path = `${basePath}/${entry.name}`;
    if (entry.kind === "file") {
      const file = await (entry as FileSystemFileHandle).getFile();
      out.push({ file, relativePath: normalizeRelativePath(path) });
    } else if (entry.kind === "directory") {
      out.push(...(await collectDirectoryFiles(entry as FileSystemDirectoryHandle, path)));
    }
  }
  return out;
}

export function hasFolderStructure(files: PickedShareFile[]): boolean {
  return files.some((f) => f.relativePath.includes("/"));
}
