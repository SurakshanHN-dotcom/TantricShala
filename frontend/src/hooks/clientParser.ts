// clientParser.ts — Browser-side heuristic AST extractor
// Mirrors parser_lambda/ast_extractor.py but runs entirely in the browser.
// Uses regex patterns (no tree-sitter needed).

import type { GraphNode, GraphEdge, NodeLabel, EdgeType } from '../types';

interface ParseResult {
    nodes: GraphNode[];
    edges: GraphEdge[];
    errors: string[];
}

const LANG_MAP: Record<string, string> = {
    py: 'python', js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    java: 'java', go: 'go', rs: 'rust', rb: 'ruby',
    cpp: 'cpp', c: 'c', h: 'c',
};

// ── Python patterns ─────────────────────────────────────────
const PY_FN = /^(\s*)def\s+(\w+)\s*\(/gm;
const PY_CLASS = /^(\s*)class\s+(\w+)\s*(?:\(([^)]*)\))?/gm;
const PY_IMPORT = /^(?:from\s+([\w.]+)\s+)?import\s+(.+)/gm;
const PY_CALL = /(?<!\w)(\w+)\s*\(/g;

// ── JS/TS patterns ──────────────────────────────────────────
const JS_FN = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\(|=>))/gm;
const JS_CLASS = /class\s+(\w+)(?:\s+extends\s+(\w+))?/gm;
const JS_IMPORT = /import\s+(?:(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['"]([\w./@-]+)['"]/gm;
const JS_EXPORT_FN = /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm;
const JS_ARROW = /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/gm;
const JS_CALL = /(?<!\w)(\w+)\s*\(/g;

// ── Java patterns ───────────────────────────────────────────
const JAVA_CLASS = /(?:public|private|protected)?\s*class\s+(\w+)(?:\s+extends\s+(\w+))?/gm;
const JAVA_FN = /(?:public|private|protected)\s+(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/gm;

// Built-in names to ignore in call extraction
const BUILTINS = new Set([
    'if', 'else', 'for', 'while', 'return', 'print', 'len', 'range', 'str',
    'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'type', 'super',
    'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr', 'property',
    'staticmethod', 'classmethod', 'open', 'map', 'filter', 'zip', 'enumerate',
    'sorted', 'reversed', 'min', 'max', 'sum', 'abs', 'round', 'any', 'all',
    'console', 'require', 'setTimeout', 'setInterval', 'Promise', 'Array',
    'Object', 'String', 'Number', 'Boolean', 'Math', 'Date', 'JSON',
    'Error', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol',
    'parseInt', 'parseFloat', 'fetch', 'alert', 'confirm',
]);

function makeId(filePath: string, name: string): string {
    return `${filePath}::${name}`;
}

function detectLang(filePath: string): string | null {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    return LANG_MAP[ext] ?? null;
}

function extractPython(filePath: string, source: string, nodes: GraphNode[], edges: GraphEdge[]): void {
    const lines = source.split('\n');

    // Functions
    let match: RegExpExecArray | null;
    PY_FN.lastIndex = 0;
    while ((match = PY_FN.exec(source)) !== null) {
        const indent = match[1].length;
        const name = match[2];
        const lineNum = source.substring(0, match.index).split('\n').length;
        const label: NodeLabel = indent > 0 ? 'Function' : 'Function';
        nodes.push({
            id: makeId(filePath, name), name, label, file_path: filePath,
            line_start: lineNum, line_end: lineNum + 5, version_id: 'v1', language: 'python',
        });
        // DEFINES edge from module
        edges.push({
            source_id: makeId(filePath, '__module__'), source_name: filePath,
            relationship: 'DEFINES', target_id: makeId(filePath, name),
            target_name: name, file_path: filePath, line: lineNum,
        });
    }

    // Classes
    PY_CLASS.lastIndex = 0;
    while ((match = PY_CLASS.exec(source)) !== null) {
        const name = match[2];
        const parent = match[3]?.trim();
        const lineNum = source.substring(0, match.index).split('\n').length;
        nodes.push({
            id: makeId(filePath, name), name, label: 'Class', file_path: filePath,
            line_start: lineNum, line_end: lineNum + 10, version_id: 'v1', language: 'python',
        });
        edges.push({
            source_id: makeId(filePath, '__module__'), source_name: filePath,
            relationship: 'DEFINES', target_id: makeId(filePath, name),
            target_name: name, file_path: filePath, line: lineNum,
        });
        if (parent && parent !== 'object') {
            edges.push({
                source_id: makeId(filePath, name), source_name: name,
                relationship: 'INHERITS', target_id: `__unresolved__::${parent}`,
                target_name: parent, file_path: filePath, line: lineNum,
            });
        }
    }

    // Imports
    PY_IMPORT.lastIndex = 0;
    while ((match = PY_IMPORT.exec(source)) !== null) {
        const fromModule = match[1];
        const imported = match[2];
        const lineNum = source.substring(0, match.index).split('\n').length;
        const target = fromModule || imported.split(',')[0].trim().split(' ')[0];
        edges.push({
            source_id: makeId(filePath, '__module__'), source_name: filePath,
            relationship: 'IMPORTS', target_id: `__unresolved__::${target}`,
            target_name: target, file_path: filePath, line: lineNum,
        });
    }

    // Calls (scan inside function bodies)
    const definedNames = new Set(nodes.filter(n => n.file_path === filePath).map(n => n.name));
    PY_CALL.lastIndex = 0;
    while ((match = PY_CALL.exec(source)) !== null) {
        const callee = match[1];
        if (BUILTINS.has(callee) || callee.startsWith('_') || callee === 'self') continue;
        const lineNum = source.substring(0, match.index).split('\n').length;
        // Find which function this call is inside
        let caller = '__module__';
        for (const n of nodes) {
            if (n.file_path === filePath && n.label === 'Function' && lineNum >= n.line_start && lineNum <= n.line_end) {
                caller = n.name;
            }
        }
        if (callee !== caller) {
            edges.push({
                source_id: makeId(filePath, caller), source_name: caller,
                relationship: 'CALLS', target_id: `__unresolved__::${callee}`,
                target_name: callee, file_path: filePath, line: lineNum,
            });
        }
    }
}

function extractJavaScript(filePath: string, source: string, nodes: GraphNode[], edges: GraphEdge[]): void {
    const lang = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : 'javascript';
    let match: RegExpExecArray | null;

    // Functions
    JS_FN.lastIndex = 0;
    while ((match = JS_FN.exec(source)) !== null) {
        const name = match[1] || match[2];
        if (!name) continue;
        const lineNum = source.substring(0, match.index).split('\n').length;
        nodes.push({
            id: makeId(filePath, name), name, label: 'Function', file_path: filePath,
            line_start: lineNum, line_end: lineNum + 5, version_id: 'v1', language: lang,
        });
        edges.push({
            source_id: makeId(filePath, '__module__'), source_name: filePath,
            relationship: 'DEFINES', target_id: makeId(filePath, name),
            target_name: name, file_path: filePath, line: lineNum,
        });
    }

    // Export functions
    JS_EXPORT_FN.lastIndex = 0;
    while ((match = JS_EXPORT_FN.exec(source)) !== null) {
        const name = match[1];
        if (nodes.some(n => n.id === makeId(filePath, name))) continue;
        const lineNum = source.substring(0, match.index).split('\n').length;
        nodes.push({
            id: makeId(filePath, name), name, label: 'Function', file_path: filePath,
            line_start: lineNum, line_end: lineNum + 5, version_id: 'v1', language: lang,
        });
        edges.push({
            source_id: makeId(filePath, '__module__'), source_name: filePath,
            relationship: 'DEFINES', target_id: makeId(filePath, name),
            target_name: name, file_path: filePath, line: lineNum,
        });
    }

    // Arrow functions
    JS_ARROW.lastIndex = 0;
    while ((match = JS_ARROW.exec(source)) !== null) {
        const name = match[1];
        if (nodes.some(n => n.id === makeId(filePath, name))) continue;
        const lineNum = source.substring(0, match.index).split('\n').length;
        nodes.push({
            id: makeId(filePath, name), name, label: 'Function', file_path: filePath,
            line_start: lineNum, line_end: lineNum + 5, version_id: 'v1', language: lang,
        });
        edges.push({
            source_id: makeId(filePath, '__module__'), source_name: filePath,
            relationship: 'DEFINES', target_id: makeId(filePath, name),
            target_name: name, file_path: filePath, line: lineNum,
        });
    }

    // Classes
    JS_CLASS.lastIndex = 0;
    while ((match = JS_CLASS.exec(source)) !== null) {
        const name = match[1];
        const parent = match[2];
        const lineNum = source.substring(0, match.index).split('\n').length;
        nodes.push({
            id: makeId(filePath, name), name, label: 'Class', file_path: filePath,
            line_start: lineNum, line_end: lineNum + 10, version_id: 'v1', language: lang,
        });
        edges.push({
            source_id: makeId(filePath, '__module__'), source_name: filePath,
            relationship: 'DEFINES', target_id: makeId(filePath, name),
            target_name: name, file_path: filePath, line: lineNum,
        });
        if (parent) {
            edges.push({
                source_id: makeId(filePath, name), source_name: name,
                relationship: 'INHERITS', target_id: `__unresolved__::${parent}`,
                target_name: parent, file_path: filePath, line: lineNum,
            });
        }
    }

    // Imports
    JS_IMPORT.lastIndex = 0;
    while ((match = JS_IMPORT.exec(source)) !== null) {
        const target = match[1];
        const lineNum = source.substring(0, match.index).split('\n').length;
        edges.push({
            source_id: makeId(filePath, '__module__'), source_name: filePath,
            relationship: 'IMPORTS', target_id: `__unresolved__::${target}`,
            target_name: target, file_path: filePath, line: lineNum,
        });
    }

    // Calls
    JS_CALL.lastIndex = 0;
    while ((match = JS_CALL.exec(source)) !== null) {
        const callee = match[1];
        if (BUILTINS.has(callee)) continue;
        const lineNum = source.substring(0, match.index).split('\n').length;
        let caller = '__module__';
        for (const n of nodes) {
            if (n.file_path === filePath && n.label === 'Function' && lineNum >= n.line_start && lineNum <= n.line_end) {
                caller = n.name;
            }
        }
        if (callee !== caller) {
            edges.push({
                source_id: makeId(filePath, caller), source_name: caller,
                relationship: 'CALLS', target_id: `__unresolved__::${callee}`,
                target_name: callee, file_path: filePath, line: lineNum,
            });
        }
    }
}

function extractJava(filePath: string, source: string, nodes: GraphNode[], edges: GraphEdge[]): void {
    let match: RegExpExecArray | null;
    JAVA_CLASS.lastIndex = 0;
    while ((match = JAVA_CLASS.exec(source)) !== null) {
        const name = match[1];
        const parent = match[2];
        const lineNum = source.substring(0, match.index).split('\n').length;
        nodes.push({
            id: makeId(filePath, name), name, label: 'Class', file_path: filePath,
            line_start: lineNum, line_end: lineNum + 10, version_id: 'v1', language: 'java',
        });
        if (parent) {
            edges.push({
                source_id: makeId(filePath, name), source_name: name,
                relationship: 'INHERITS', target_id: `__unresolved__::${parent}`,
                target_name: parent, file_path: filePath, line: lineNum,
            });
        }
    }
    JAVA_FN.lastIndex = 0;
    while ((match = JAVA_FN.exec(source)) !== null) {
        const name = match[1];
        const lineNum = source.substring(0, match.index).split('\n').length;
        nodes.push({
            id: makeId(filePath, name), name, label: 'Function', file_path: filePath,
            line_start: lineNum, line_end: lineNum + 5, version_id: 'v1', language: 'java',
        });
    }
}

/**
 * Resolve unresolved edge targets to real nodes where possible.
 */
function resolveEdges(nodes: GraphNode[], edges: GraphEdge[]): void {
    const nodeByName = new Map<string, GraphNode>();
    for (const n of nodes) {
        if (!nodeByName.has(n.name)) nodeByName.set(n.name, n);
    }

    for (const e of edges) {
        if (e.target_id.startsWith('__unresolved__::')) {
            const targetName = e.target_name;
            const resolved = nodeByName.get(targetName);
            if (resolved) {
                e.target_id = resolved.id;
            }
        }
        if (e.source_id.startsWith('__unresolved__::')) {
            const resolved = nodeByName.get(e.source_name);
            if (resolved) {
                e.source_id = resolved.id;
            }
        }
    }
}

/**
 * Deduplicate edges (same source → target → relationship).
 */
function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
    const seen = new Set<string>();
    return edges.filter((e) => {
        const key = `${e.source_id}→${e.target_id}→${e.relationship}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Parse a map of { filePath: fileContent } into nodes and edges.
 */
export function parseRepository(files: Map<string, string>): ParseResult {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const errors: string[] = [];

    for (const [filePath, source] of files) {
        const lang = detectLang(filePath);
        if (!lang) { errors.push(`Skipped unsupported: ${filePath}`); continue; }

        // Module node
        nodes.push({
            id: makeId(filePath, '__module__'), name: filePath, label: 'Module',
            file_path: filePath, line_start: 1, line_end: source.split('\n').length,
            version_id: 'v1', language: lang,
        });

        try {
            if (lang === 'python') {
                extractPython(filePath, source, nodes, edges);
            } else if (lang === 'javascript' || lang === 'typescript') {
                extractJavaScript(filePath, source, nodes, edges);
            } else if (lang === 'java') {
                extractJava(filePath, source, nodes, edges);
            }
            // Other langs: only module node is created
        } catch (err) {
            errors.push(`Parse error in ${filePath}: ${String(err)}`);
        }
    }

    // Resolve symbolic references
    resolveEdges(nodes, edges);

    // Remove edges pointing to unresolved nodes (they have no visual target)
    const nodeIds = new Set(nodes.map(n => n.id));
    const validEdges = dedupeEdges(
        edges.filter(e => nodeIds.has(e.source_id) && nodeIds.has(e.target_id))
    );

    return { nodes, edges: validEdges, errors };
}
