"""
ast_parser.py – Heuristic Source Code Analysis for Yuktham.

This module uses robust regular expressions to perform static analysis on source files.
It extracts:
- Structural Nodes: Modules, Classes, and Functions.
- Relational Edges: CALLS (function invocation), IMPORTS (module dependencies), 
  INHERITS (class hierarchy), and DEFINES (module-to-symbol ownership).

Performance: Uses pre-compiled regex for fast O(N) traversal of codebases.
Supported: Python, JavaScript, TypeScript, Java (generic), and others via base Module node.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

# Setup logging for parse-time diagnostic reports
logger = logging.getLogger(__name__)

# ── Language & Symbol configuration ──────────────────────────

# ── Language detection ───────────────────────────────────────

LANG_MAP = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".java": "java", ".go": "go", ".rs": "rust",
    ".rb": "ruby", ".cpp": "cpp", ".c": "c", ".h": "c",
}

SUPPORTED_EXTENSIONS = set(LANG_MAP.keys())

BUILTINS = {
    "if", "else", "for", "while", "return", "print", "len", "range",
    "str", "int", "float", "bool", "list", "dict", "set", "tuple",
    "type", "super", "isinstance", "hasattr", "getattr", "setattr",
    "property", "staticmethod", "classmethod", "open", "map", "filter",
    "zip", "enumerate", "sorted", "reversed", "min", "max", "sum",
    "abs", "round", "any", "all", "self", "cls",
    "console", "require", "setTimeout", "setInterval", "Promise",
    "Array", "Object", "String", "Number", "Boolean", "Math",
    "Date", "JSON", "Error", "RegExp", "fetch", "alert", "confirm",
}


def detect_language(file_path: str) -> str | None:
    ext = Path(file_path).suffix.lower()
    return LANG_MAP.get(ext)


def _make_id(file_path: str, name: str) -> str:
    return f"{file_path}::{name}"


def _line_at(source: str, index: int) -> int:
    return source[:index].count("\n") + 1


# ── Python extractor ─────────────────────────────────────────

PY_FN = re.compile(r"^(\s*)def\s+(\w+)\s*\(", re.MULTILINE)
PY_CLASS = re.compile(r"^(\s*)class\s+(\w+)\s*(?:\(([^)]*)\))?", re.MULTILINE)
PY_IMPORT = re.compile(r"^(?:from\s+([\w.]+)\s+)?import\s+(.+)", re.MULTILINE)
PY_CALL = re.compile(r"(?<!\w)(\w+)\s*\(")


def _extract_python(file_path: str, source: str, nodes: list, edges: list):
    lines = source.split("\n")

    # Functions
    for m in PY_FN.finditer(source):
        name = m.group(2)
        line = _line_at(source, m.start())
        # Estimate end by looking for next def/class at same or lesser indent
        indent = len(m.group(1))
        end_line = line
        for i in range(line, min(line + 50, len(lines))):
            stripped = lines[i].rstrip() if i < len(lines) else ""
            if i > line and stripped and not stripped.startswith(" " * (indent + 1)):
                end_line = i
                break
            end_line = i + 1

        nodes.append({
            "id": _make_id(file_path, name), "name": name,
            "label": "Function", "file_path": file_path,
            "line_start": line, "line_end": end_line,
            "version_id": "v1", "language": "python",
        })
        edges.append({
            "source_id": _make_id(file_path, "__module__"),
            "target_id": _make_id(file_path, name),
            "relationship": "DEFINES",
            "source_name": file_path, "target_name": name,
            "file_path": file_path, "line": line,
        })

    # Classes
    for m in PY_CLASS.finditer(source):
        name = m.group(2)
        parent = (m.group(3) or "").strip()
        line = _line_at(source, m.start())
        nodes.append({
            "id": _make_id(file_path, name), "name": name,
            "label": "Class", "file_path": file_path,
            "line_start": line, "line_end": line + 20,
            "version_id": "v1", "language": "python",
        })
        edges.append({
            "source_id": _make_id(file_path, "__module__"),
            "target_id": _make_id(file_path, name),
            "relationship": "DEFINES",
            "source_name": file_path, "target_name": name,
            "file_path": file_path, "line": line,
        })
        if parent and parent not in ("object", ""):
            edges.append({
                "source_id": _make_id(file_path, name),
                "target_id": f"__unresolved__::{parent}",
                "relationship": "INHERITS",
                "source_name": name, "target_name": parent,
                "file_path": file_path, "line": line,
            })

    # Imports
    for m in PY_IMPORT.finditer(source):
        from_mod = m.group(1)
        imported = m.group(2)
        line = _line_at(source, m.start())
        target = from_mod or imported.split(",")[0].strip().split(" ")[0]
        edges.append({
            "source_id": _make_id(file_path, "__module__"),
            "target_id": f"__unresolved__::{target}",
            "relationship": "IMPORTS",
            "source_name": file_path, "target_name": target,
            "file_path": file_path, "line": line,
        })

    # Calls
    defined = {n["name"] for n in nodes if n["file_path"] == file_path}
    for m in PY_CALL.finditer(source):
        callee = m.group(1)
        if callee in BUILTINS or callee.startswith("_"):
            continue
        line = _line_at(source, m.start())
        caller = "__module__"
        for n in nodes:
            if (n["file_path"] == file_path and n["label"] == "Function"
                    and n["line_start"] <= line <= n["line_end"]):
                caller = n["name"]
        if callee != caller:
            edges.append({
                "source_id": _make_id(file_path, caller),
                "target_id": f"__unresolved__::{callee}",
                "relationship": "CALLS",
                "source_name": caller, "target_name": callee,
                "file_path": file_path, "line": line,
            })


# ── JavaScript/TypeScript extractor ──────────────────────────

JS_FN = re.compile(
    r"(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\(|=>))",
    re.MULTILINE,
)
JS_EXPORT_FN = re.compile(r"export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)", re.MULTILINE)
JS_CLASS = re.compile(r"class\s+(\w+)(?:\s+extends\s+(\w+))?", re.MULTILINE)
JS_IMPORT = re.compile(r"import\s+(?:(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['\"]([\\w./@-]+)['\"]", re.MULTILINE)
JS_CALL = re.compile(r"(?<!\w)(\w+)\s*\(")


def _extract_js(file_path: str, source: str, nodes: list, edges: list):
    lang = "typescript" if file_path.endswith((".ts", ".tsx")) else "javascript"
    seen_ids = {n["id"] for n in nodes}

    for pattern in (JS_FN, JS_EXPORT_FN):
        for m in pattern.finditer(source):
            name = m.group(1) or (m.group(2) if m.lastindex >= 2 else None)
            if not name:
                continue
            nid = _make_id(file_path, name)
            if nid in seen_ids:
                continue
            seen_ids.add(nid)
            line = _line_at(source, m.start())
            nodes.append({
                "id": nid, "name": name, "label": "Function",
                "file_path": file_path, "line_start": line, "line_end": line + 10,
                "version_id": "v1", "language": lang,
            })
            edges.append({
                "source_id": _make_id(file_path, "__module__"),
                "target_id": nid, "relationship": "DEFINES",
                "source_name": file_path, "target_name": name,
                "file_path": file_path, "line": line,
            })

    for m in JS_CLASS.finditer(source):
        name, parent = m.group(1), m.group(2)
        line = _line_at(source, m.start())
        nodes.append({
            "id": _make_id(file_path, name), "name": name, "label": "Class",
            "file_path": file_path, "line_start": line, "line_end": line + 20,
            "version_id": "v1", "language": lang,
        })
        if parent:
            edges.append({
                "source_id": _make_id(file_path, name),
                "target_id": f"__unresolved__::{parent}",
                "relationship": "INHERITS",
                "source_name": name, "target_name": parent,
                "file_path": file_path, "line": line,
            })

    for m in JS_IMPORT.finditer(source):
        target = m.group(1)
        line = _line_at(source, m.start())
        edges.append({
            "source_id": _make_id(file_path, "__module__"),
            "target_id": f"__unresolved__::{target}",
            "relationship": "IMPORTS",
            "source_name": file_path, "target_name": target,
            "file_path": file_path, "line": line,
        })

    for m in JS_CALL.finditer(source):
        callee = m.group(1)
        if callee in BUILTINS:
            continue
        line = _line_at(source, m.start())
        edges.append({
            "source_id": _make_id(file_path, "__module__"),
            "target_id": f"__unresolved__::{callee}",
            "relationship": "CALLS",
            "source_name": file_path, "target_name": callee,
            "file_path": file_path, "line": line,
        })


# ── Main API ─────────────────────────────────────────────────

def parse_files(files: dict[str, str]) -> dict:
    """
    Parse a dict of {file_path: source_code} into nodes and edges.

    Returns:
        {"nodes": [...], "edges": [...], "errors": [...], "stats": {...}}
    """
    nodes: list[dict] = []
    edges: list[dict] = []
    errors: list[str] = []

    for file_path, source in files.items():
        lang = detect_language(file_path)
        if not lang:
            errors.append(f"Unsupported: {file_path}")
            continue

        # Module node
        nodes.append({
            "id": _make_id(file_path, "__module__"), "name": file_path,
            "label": "Module", "file_path": file_path,
            "line_start": 1, "line_end": source.count("\n") + 1,
            "version_id": "v1", "language": lang,
        })

        try:
            if lang == "python":
                _extract_python(file_path, source, nodes, edges)
            elif lang in ("javascript", "typescript"):
                _extract_js(file_path, source, nodes, edges)
            # Other languages: only module node for now
        except Exception as e:
            errors.append(f"Parse error in {file_path}: {e}")
            logger.error(f"Parse error in {file_path}", exc_info=True)

    # ── Resolve symbolic references ──────────────────────────
    node_by_name: dict[str, dict] = {}
    for n in nodes:
        if n["name"] not in node_by_name:
            node_by_name[n["name"]] = n

    for e in edges:
        if e["target_id"].startswith("__unresolved__::"):
            resolved = node_by_name.get(e["target_name"])
            if resolved:
                e["target_id"] = resolved["id"]
        if e["source_id"].startswith("__unresolved__::"):
            resolved = node_by_name.get(e["source_name"])
            if resolved:
                e["source_id"] = resolved["id"]

    # Filter out edges with unresolved endpoints
    node_ids = {n["id"] for n in nodes}
    valid_edges = []
    seen_edges = set()
    for e in edges:
        if e["source_id"] in node_ids and e["target_id"] in node_ids:
            key = f"{e['source_id']}→{e['target_id']}→{e['relationship']}"
            if key not in seen_edges:
                seen_edges.add(key)
                valid_edges.append(e)

    total_lines = sum(s.count("\n") + 1 for s in files.values())
    stats = {
        "files_parsed": len(files),
        "total_lines": total_lines,
        "nodes_extracted": len(nodes),
        "edges_extracted": len(valid_edges),
        "errors": len(errors),
    }

    logger.info(f"Parsed {stats['files_parsed']} files → {stats['nodes_extracted']} nodes, {stats['edges_extracted']} edges")
    return {"nodes": nodes, "edges": valid_edges, "errors": errors, "stats": stats}
