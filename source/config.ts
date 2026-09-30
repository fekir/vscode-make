import * as vscode from 'vscode';

const HIDDEN_TARGETS_KEY = 'hiddenTargets';
export function getHiddenTargetsFromConfig(): Set < string > {
  const configured = vscode.workspace.getConfiguration('codeMake').get < string[] > (HIDDEN_TARGETS_KEY, [])
  return new Set(configured);
}
export function updateHiddenTargetsInConfig(values: string[]): Thenable < void > {
  return vscode.workspace.getConfiguration('codeMake').update(HIDDEN_TARGETS_KEY, values, vscode.ConfigurationTarget.Workspace);
}

export function getMakeCommand(): string {
  return vscode.workspace.getConfiguration('codeMake').get('makePath', 'make');
}

export function getMakefileExcludeGlob(): string {
  const patterns = vscode.workspace.getConfiguration('codeMake').get < string[] > ('exclude', []).filter(Boolean);

  return patterns.length > 0 ?
    `{${patterns.join(',')}}` :
    '';
}

const MAKEFILE_NAMES = ['Makefile', 'makefile', 'GNUmakefile'];
export function getMakefileGlob(): string {
  const configuredDepth = vscode.workspace.getConfiguration('codeMake').get('maxDepth', 1);
  const maxDepth = Number.isInteger(configuredDepth) && configuredDepth >= 0 ? configuredDepth : 2;
  const patterns: string[] = [];
  for (let depth = 0; depth <= maxDepth; depth++) {
    const prefix = '*/'.repeat(depth);
    for (const name of MAKEFILE_NAMES) patterns.push(`${prefix}${name}`);
  }
  return `{${patterns.join(',')}}`;
}
