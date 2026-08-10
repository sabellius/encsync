export class TAbstractFile {
  path = "";
}

export class TFile extends TAbstractFile {
  stat: { mtime: number; size: number } = { mtime: 0, size: 0 };
  basename = "";
  extension = "";
  parent: TFolder | null = null;

  constructor(path = "", stat?: { mtime: number; size: number }) {
    super();
    this.path = path;
    if (stat) this.stat = stat;
    const slash = path.lastIndexOf("/");
    const filename = slash >= 0 ? path.slice(slash + 1) : path;
    const dot = filename.lastIndexOf(".");
    this.basename = dot > 0 ? filename.slice(0, dot) : filename;
    this.extension = dot > 0 ? filename.slice(dot + 1) : "";
  }
}

export class TFolder extends TAbstractFile {
  children: (TFile | TFolder)[] = [];
  parent: TFolder | null = null;

  constructor(path = "") {
    super();
    this.path = path;
  }
}
