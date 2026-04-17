export interface FSFile {
  kind: 'file';
  name: string;
  path: string;
  content: string;
}

export interface FSFolder {
  kind: 'folder';
  name: string;
  path: string;
  children: FSNode[];
}

export type FSNode = FSFile | FSFolder;

export interface FSState {
  tree: FSNode[];
}
