import * as vscode from 'vscode';
import {
  parseIncludes,
  parsePhonyTargets,
  parseTargets,
  parseVariables
} from './make-parser';

import {
  getHiddenTargetsFromConfig,
  getStarredTargetsFromConfig,
  getMakeCommand,
  getMakefileExcludeGlob,
  getMakefileGlob,
  updateHiddenTargetsInConfig,
  updateStarredTargetsInConfig,
} from './config';

type Target = {
  target: string;
  file: vscode.Uri;
  phony: boolean
};

class TargetSection extends vscode.TreeItem {
  constructor(label: string, readonly targets: vscode.TreeItem[]) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "makeTargetSection";
  }
}

function getTargetKey(file: vscode.Uri, target: string): string {
  return `${vscode.workspace.asRelativePath(file, false)}:${target}`;
}

function createMakeTask(target: string, makefile: vscode.Uri, resolvedTarget: string): vscode.Task {
  const makeCommand = getMakeCommand();
  const cwd = vscode.Uri.joinPath(makefile, '..').fsPath;
  const definition = {
    type: 'codeMake',
    target
  };
  const execution = new vscode.ProcessExecution(makeCommand, [resolvedTarget], {
    cwd
  });
  const task = new vscode.Task(definition, vscode.TaskScope.Workspace, target, 'codeMake', execution);
  task.detail = `cd ${cwd} && ${makeCommand} ${resolvedTarget}`;
  return task;
}

function resolveIncludes(text: string, rootMakefile: vscode.Uri): vscode.Uri[] {
  return parseIncludes(text).map((name) => vscode.Uri.joinPath(rootMakefile, '..', name));
}

function createItem(target: string, key: string, isHidden: boolean, sourceFile: vscode.Uri, file: vscode.Uri, phony: boolean, isStarred: boolean): vscode.TreeItem {
  const item = new vscode.TreeItem(target, vscode.TreeItemCollapsibleState.None);
  item.id = isStarred ? `starred:${key}` : key;
  item.iconPath = isStarred ? new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow')) :
    new vscode.ThemeIcon('play', phony ? new vscode.ThemeColor('charts.blue') : undefined);
  item.contextValue = isStarred ? "starredMakeTarget" : isHidden ? "hiddenMakeTarget" : "makeTarget";
  item.description = vscode.workspace.asRelativePath(sourceFile);
  item.tooltip = `make ${target}`;
  item.command = {
    command: "codeMake.runTarget",
    title: "Run Make Target",
    arguments: [{
      target,
      makefile: file,
      file: sourceFile,
    }, ],
  };

  return item;
}

async function collectTargets(file: vscode.Uri, rootMakefile: vscode.Uri = file, visited = new Set < string > ()): Promise < Target[] > {
  const key = file.toString();
  if (visited.has(key)) return [];
  visited.add(key);
  let text: string;
  try {
    text = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
  } catch {
    return [];
  }
  const phonyTargets = parsePhonyTargets(text);
  const targets = parseTargets(text).map((target) => ({
    target,
    file,
    phony: phonyTargets.has(target)
  }));
  for (const includedFile of resolveIncludes(text, rootMakefile)) {
    targets.push(...await collectTargets(includedFile, rootMakefile, visited));
  }
  return targets;
}

async function collectVariables(file: vscode.Uri, rootMakefile: vscode.Uri = file, variables = new Map < string, string > (), visited = new Set < string > ()): Promise < Map < string, string >> {
  const key = file.toString();
  if (visited.has(key)) return variables;
  visited.add(key);
  let text: string;
  try {
    text = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
  } catch {
    return variables;
  }
  for (const [name, value] of parseVariables(text)) variables.set(name, value);
  for (const includedFile of resolveIncludes(text, rootMakefile)) {
    await collectVariables(includedFile, rootMakefile, variables, visited);
  }
  return variables;
}

async function resolveTarget(target: string, makefile: vscode.Uri): Promise < string > {
  const variables = await collectVariables(makefile, makefile);
  let resolved = target;
  for (let pass = 0; pass < 10; pass++) {
    const next = resolved.replace(/\$\(([^()]+)\)|\$\{([^{}]+)\}/g, (match, parenName, braceName) => variables.get(parenName || braceName) ?? match);
    if (next === resolved) break;
    resolved = next;
  }
  return resolved;
}

class TargetsProvider {
  private readonly changeEmitter = new vscode.EventEmitter();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private showHiddenTargets = false;

  getIsShowingHiddenTargets(): boolean {
    return this.showHiddenTargets;
  }

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  toggleHiddenTargets(): void {
    this.showHiddenTargets = !this.showHiddenTargets;
    this.refresh();
  }

  watchFiles(files: vscode.Uri[]): void {
    for (const watcher of this.fileWatchers) watcher.dispose();
    this.fileWatchers = [];
    for (const file of files) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);
      if (!workspaceFolder) continue;
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, vscode.workspace.asRelativePath(file, false)));
      watcher.onDidChange(() => this.refresh());
      watcher.onDidCreate(() => this.refresh());
      watcher.onDidDelete(() => this.refresh());
      this.fileWatchers.push(watcher);
    }
  }

  dispose(): void {
    for (const watcher of this.fileWatchers) watcher.dispose();
    this.fileWatchers = [];
    this.changeEmitter.dispose();
  }

  getTreeItem(element: any): any {
    return element;
  }

  async getChildren(element ? : TargetSection): Promise < vscode.TreeItem[] > {
    if (element instanceof TargetSection) return element.targets;

    const files = await vscode.workspace.findFiles(getMakefileGlob(), getMakefileExcludeGlob(), 50);
    files.sort((a: vscode.Uri, b: vscode.Uri) => a.fsPath.localeCompare(b.fsPath));
    const items: vscode.TreeItem[] = [];
    const starredItems: vscode.TreeItem[] = [];
    const watchedFiles: vscode.Uri[] = [];
    const showHidden = this.getIsShowingHiddenTargets();
    const hiddenTargets = getHiddenTargetsFromConfig(); // returns empty if !this.showHiddenTargets
    const starredTargets = getStarredTargetsFromConfig();
    for (const file of files) {
      for (const targetRecord of await collectTargets(file)) {
        const {
          target,
          file: sourceFile,
          phony
        } = targetRecord;
        const key = getTargetKey(sourceFile, target);
        const isHidden = hiddenTargets.has(key);
        const isStarred = starredTargets.has(key);
        watchedFiles.push(sourceFile);
        if (!isHidden || showHidden) {
          items.push(createItem(target, key, isHidden, sourceFile, file, phony, false));
        }
        if (isStarred) {
          starredItems.push(createItem(target, key, isHidden, sourceFile, file, phony, isStarred));
        }
      }
      watchedFiles.push(file);
    }
    //if(vscode.workspace.workspaceFile){
    //  watchedFiles.push(vscode.workspace.workspaceFile)
    //}
    this.watchFiles([...new Map(watchedFiles.map((file) => [file.toString(), file])).values()]);
    const sortByLabel = (a: vscode.TreeItem, b: vscode.TreeItem) => String(a.label).localeCompare(String(b.label));
    items.sort(sortByLabel)
    starredItems.sort(sortByLabel)
    if (starredItems.length) {
      items.unshift(new TargetSection("Starred", starredItems));
    }
    if (items.length) return items;
    const empty = new vscode.TreeItem('No visible Makefile targets found');
    empty.iconPath = new vscode.ThemeIcon('info');
    return [empty];
  }
}

class MakeTaskProvider {
  private getHiddenTargets(): Set < string > {
    return getHiddenTargetsFromConfig();
  }

  async provideTasks(): Promise < vscode.Task[] > {
    const files = await vscode.workspace.findFiles(getMakefileGlob(), getMakefileExcludeGlob(), 50);
    const tasks: vscode.Task[] = [];
    const hiddenTargets = this.getHiddenTargets();
    for (const file of files) {
      for (const targetRecord of await collectTargets(file)) {
        const {
          target,
          file: sourceFile
        } = targetRecord;
        if (hiddenTargets.has(target)) continue;
        const resolvedTarget = await resolveTarget(target, file);
        tasks.push(createMakeTask(target, file, resolvedTarget));
      }
    }
    return tasks;
  }

  resolveTask(task: any): any {
    return task;
  }
}

async function runTarget(arg: any): Promise < void > {
  const spec = arg?.command ? arg.command.arguments[0] : arg;
  if (!spec?.target) return;
  const resolvedTarget = await resolveTarget(spec.target, spec.makefile);
  await vscode.tasks.executeTask(createMakeTask(spec.target, spec.makefile, resolvedTarget));
}

async function openTargetSource(arg: any): Promise < void > {
  const spec = parseTreeItemTarget(arg);
  if (!spec?.target || !spec?.file) return;
  const editor = await vscode.window.showTextDocument(spec.file, {
    preview: true,
    viewColumn: vscode.ViewColumn.Active
  });
  const lines = new TextDecoder().decode(await vscode.workspace.fs.readFile(spec.file)).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('\t')) continue;
    const matches = parseTargets(lines[i]);
    if (matches.includes(spec.target)) {
      const position = new vscode.Position(i, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      return;
    }
  }
}

function parseTreeItemTarget(item: any): {
  target: string;file: any
} | undefined {
  if (!item) return undefined;
  if (item.command?.arguments?.[0]?.target) {
    return {
      target: item.command.arguments[0].target,
      file: item.command.arguments[0].file ?? item.command.arguments[0].makefile
    };
  }
  if (typeof item.id === 'string' && item.id.includes(':')) {
    const splitAt = item.id.lastIndexOf(':');
    const filePart = item.id.slice(0, splitAt);
    const target = item.id.slice(splitAt + 1);
    if (filePart && target) return {
      target,
      file: vscode.Uri.parse(filePart)
    };
  }
  if (typeof item.label === 'string' && item.description) {
    return {
      target: item.label,
      file: vscode.Uri.file(item.description)
    };
  }
  return undefined;
}

async function toggleTargetHidden(provider: TargetsProvider, arg: any, hide: boolean): Promise < void > {
  const spec = parseTreeItemTarget(arg);
  if (!spec?.target || !spec?.file) return;
  const hiddenTargets = getHiddenTargetsFromConfig();
  const key = getTargetKey(spec.file, spec.target);
  let update = false;
  if (hide) {
    update = !hiddenTargets.has(key);
    hiddenTargets.add(key);
  } else {
    update = hiddenTargets.delete(key);
  }
  if (update) {
    await updateHiddenTargetsInConfig([...hiddenTargets]);
  }
  provider.refresh();
}

async function toggleTargetStar(provider: TargetsProvider, arg: any, star: boolean): Promise < void > {
  const spec = parseTreeItemTarget(arg);
  if (!spec?.target || !spec?.file) return;
  const starredTargets = getStarredTargetsFromConfig();
  const key = getTargetKey(spec.file, spec.target);
  let update = false;
  if (star) {
    update = !starredTargets.has(key);
    starredTargets.add(key);
  } else {
    update = starredTargets.delete(key);
  }
  if (update) {
    await updateStarredTargetsInConfig([...starredTargets]);
  }
  provider.refresh();
}

function toggleHiddenTargets(provider: TargetsProvider): void {
  provider.toggleHiddenTargets();
  vscode.commands.executeCommand('setContext', 'codeMake.showingHiddenTargets', provider.getIsShowingHiddenTargets());
}

export function activate(context: any): void {
  const provider = new TargetsProvider();
  const taskProvider = new MakeTaskProvider();
  vscode.commands.executeCommand('setContext', 'codeMake.showingHiddenTargets', false);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('codeMakeTargets', provider),
    vscode.tasks.registerTaskProvider('codeMake', taskProvider),
    vscode.commands.registerCommand('codeMake.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('codeMake.runTarget', runTarget),
    vscode.commands.registerCommand('codeMake.openTargetSource', openTargetSource),
    vscode.commands.registerCommand('codeMake.hideTarget', (arg: any) => toggleTargetHidden(provider, arg, true)),
    vscode.commands.registerCommand('codeMake.unhideTarget', (arg: any) => toggleTargetHidden(provider, arg, false)),
    vscode.commands.registerCommand('codeMake.starTarget', (arg: any) => toggleTargetStar(provider, arg, true)),
    vscode.commands.registerCommand('codeMake.unstarTarget', (arg: any) => toggleTargetStar(provider, arg, false)),
    vscode.commands.registerCommand('codeMake.clearHiddenTargets', () => toggleHiddenTargets(provider)),
    vscode.commands.registerCommand('codeMake.hideShownTargets', () => toggleHiddenTargets(provider)), {
      dispose: () => provider.dispose()
    }
  );
}

export function deactivate(): void {}
