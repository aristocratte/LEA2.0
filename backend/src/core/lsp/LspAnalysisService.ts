import { readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

const DEFAULT_EXCLUDES = new Set(['.git', 'node_modules', '.next', 'dist', 'coverage', 'test-results']);
const DEFAULT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export interface LspDiagnostic {
  file: string;
  line: number;
  column: number;
  code: string | number;
  category: 'error' | 'warning' | 'suggestion' | 'message';
  message: string;
}

export interface LspSymbol {
  file: string;
  name: string;
  kind: string;
  line: number;
  column: number;
  exported: boolean;
}

export interface LspQuery {
  paths?: string[];
  limit?: number;
}

function categoryName(category: ts.DiagnosticCategory): LspDiagnostic['category'] {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return 'error';
    case ts.DiagnosticCategory.Warning:
      return 'warning';
    case ts.DiagnosticCategory.Suggestion:
      return 'suggestion';
    default:
      return 'message';
  }
}

function isSupportedSource(path: string): boolean {
  return Array.from(DEFAULT_EXTENSIONS).some((extension) => path.endsWith(extension));
}

export class LspAnalysisService {
  constructor(private readonly rootDir: string = process.cwd()) {}

  async diagnostics(query: LspQuery = {}): Promise<{ files: string[]; diagnostics: LspDiagnostic[] }> {
    const files = await this.resolveFiles(query);
    if (files.length === 0) return { files: [], diagnostics: [] };

    const program = ts.createProgram(files, {
      noEmit: true,
      allowJs: true,
      checkJs: false,
      skipLibCheck: true,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    });

    const diagnostics = ts.getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.file && files.includes(diagnostic.file.fileName))
      .map((diagnostic): LspDiagnostic => {
        const file = diagnostic.file!;
        const start = diagnostic.start ?? 0;
        const pos = file.getLineAndCharacterOfPosition(start);
        return {
          file: this.toRelative(file.fileName),
          line: pos.line + 1,
          column: pos.character + 1,
          code: diagnostic.code,
          category: categoryName(diagnostic.category),
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        };
      });

    return {
      files: files.map((file) => this.toRelative(file)),
      diagnostics: diagnostics.slice(0, query.limit ?? 100),
    };
  }

  async symbols(query: LspQuery = {}): Promise<{ files: string[]; symbols: LspSymbol[] }> {
    const files = await this.resolveFiles(query);
    const symbols: LspSymbol[] = [];

    for (const fileName of files) {
      const sourceFile = ts.createSourceFile(
        fileName,
        await ts.sys.readFile(fileName) ?? '',
        ts.ScriptTarget.Latest,
        true,
      );

      const visit = (node: ts.Node) => {
        const name = this.getNodeName(node);
        if (name) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          symbols.push({
            file: this.toRelative(fileName),
            name,
            kind: ts.SyntaxKind[node.kind],
            line: pos.line + 1,
            column: pos.character + 1,
            exported: this.isExported(node),
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    return {
      files: files.map((file) => this.toRelative(file)),
      symbols: symbols.slice(0, query.limit ?? 200),
    };
  }

  private getNodeName(node: ts.Node): string | undefined {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      return node.name?.text;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    return undefined;
  }

  private isExported(node: ts.Node): boolean {
    return Boolean(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export);
  }

  private async resolveFiles(query: LspQuery): Promise<string[]> {
    const limit = Math.min(query.limit ?? 80, 200);
    const paths = query.paths?.length ? query.paths : ['.'];
    const files: string[] = [];
    for (const item of paths) {
      const absolute = this.safeResolve(item);
      await this.collectFiles(absolute, files, limit);
      if (files.length >= limit) break;
    }
    return files.slice(0, limit);
  }

  private async collectFiles(path: string, files: string[], limit: number): Promise<void> {
    if (files.length >= limit) return;

    try {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= limit) break;
        if (DEFAULT_EXCLUDES.has(entry.name)) continue;
        const child = resolve(path, entry.name);
        if (entry.isDirectory()) {
          await this.collectFiles(child, files, limit);
        } else if (entry.isFile() && isSupportedSource(child)) {
          files.push(child);
        }
      }
      return;
    } catch {
      if (isSupportedSource(path)) {
        files.push(path);
      }
    }
  }

  private safeResolve(path: string): string {
    const absolute = resolve(this.rootDir, path);
    const root = resolve(this.rootDir);
    if (absolute !== root && !absolute.startsWith(`${root}/`)) {
      throw new Error(`Path is outside the LSP root: ${path}`);
    }
    return absolute;
  }

  private toRelative(path: string): string {
    return relative(this.rootDir, path) || '.';
  }
}
