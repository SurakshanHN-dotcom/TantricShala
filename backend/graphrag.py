"""
graphrag.py – Retrieval-Augmented Generation (RAG) for the Yukta Guru Critic.

This module acts as the bridge between the Neo4j Knowledge Graph and the Gemini LLM.
It specializes in fetching "context-dense" subgraphs to ground Yukta's responses in 
real architectural facts.

Key components:
- Graph Summarization: Provides high-level codebase health stats.
- Semantic Symbol Mapping: Maps user questions to graph symbols via fuzzy matching.
- Subgraph Expansion: Builds definition-inclusive context for any mentioned function or class.
- Blast-Radius Audit: Traces transitive impact chains for code changes.
"""
from __future__ import annotations

import logging
from . import neo4j_client as db
from .prompts import CHAT_CONTEXT_TEMPLATE, AUDIT_CONTEXT_TEMPLATE

# Log RAG events for context-window debugging
logger = logging.getLogger(__name__)

# ── Response Formatting Helpers ──────────────────────────────


def _format_node(n: dict) -> str:
    """Format a node dict into a readable string."""
    return f"[{n.get('label', '?')}] {n.get('name', '?')} ({n.get('file_path', '?')}:{n.get('line_start', '?')})"


def _format_edge(e: dict) -> str:
    """Format an edge dict into a readable string."""
    return f"{e.get('source_name', '?')} --{e.get('relationship', '?')}--> {e.get('target_name', '?')}"


def build_graph_summary() -> str:
    """Get a high-level summary of the entire graph."""
    summary = db.get_graph_summary()
    graph = db.get_full_graph()

    # Collect file names
    files = sorted({n.get("file_path", "?") for n in graph["nodes"] if n.get("file_path")})

    # Count by type
    label_counts: dict[str, int] = {}
    for n in graph["nodes"]:
        lbl = n.get("label", "Unknown")
        label_counts[lbl] = label_counts.get(lbl, 0) + 1

    # Count edge types
    edge_counts: dict[str, int] = {}
    for e in graph["edges"]:
        rel = e.get("relationship", "UNKNOWN")
        edge_counts[rel] = edge_counts.get(rel, 0) + 1

    parts = [
        f"Total: {summary.get('total_nodes', 0)} nodes, {summary.get('total_edges', 0)} edges",
        f"Files: {', '.join(files)}",
        f"Node types: {', '.join(f'{k}={v}' for k, v in sorted(label_counts.items()))}",
        f"Edge types: {', '.join(f'{k}={v}' for k, v in sorted(edge_counts.items()))}",
    ]
    return "\n".join(parts)


def build_chat_context(user_question: str) -> str:
    """
    Build full prompt context for a chat question.

    1. Get graph summary
    2. Extract relevant symbols from the question
    3. Query Neo4j for their context
    4. Format into the chat context template
    """
    graph_summary = build_graph_summary()
    graph = db.get_full_graph()

    # Extract potential symbol names from the question
    # (simple word matching against known node names)
    node_names = {n["name"] for n in graph["nodes"] if n.get("name")}
    words = set(user_question.replace("(", " ").replace(")", " ").split())
    mentioned = words & node_names

    # Build subgraph context for mentioned symbols
    subgraph_lines = []
    for sym in mentioned:
        ctx = db.get_node_context(sym)
        if ctx["node"]:
            n = ctx["node"][0]
            subgraph_lines.append(f"\n### {n['name']} ({n.get('label', '?')}) in {n.get('file_path', '?')}")
            subgraph_lines.append(f"  Lines: {n.get('line_start', '?')}–{n.get('line_end', '?')}")

            if ctx["outgoing"]:
                subgraph_lines.append("  Calls/Uses:")
                for o in ctx["outgoing"]:
                    subgraph_lines.append(f"    → {o['name']} ({o.get('label', '?')}) via {o['rel']}")

            if ctx["incoming"]:
                subgraph_lines.append("  Called/Used by:")
                for i in ctx["incoming"]:
                    subgraph_lines.append(f"    ← {i['name']} ({i.get('label', '?')}) via {i['rel']}")

    # If no specific symbols mentioned, provide the full graph overview
    if not subgraph_lines:
        subgraph_lines.append("No specific symbols mentioned. Full graph overview:")
        for n in graph["nodes"][:30]:  # Cap at 30 for context window
            subgraph_lines.append(f"  {_format_node(n)}")
        subgraph_lines.append(f"\nKey relationships:")
        for e in graph["edges"][:30]:
            subgraph_lines.append(f"  {_format_edge(e)}")

    return CHAT_CONTEXT_TEMPLATE.format(
        graph_summary=graph_summary,
        subgraph_context="\n".join(subgraph_lines),
        user_question=user_question,
    )


def build_audit_context(
    changed_symbols: list[str],
    diff: str,
) -> str:
    """
    Build full prompt context for a blast-radius audit.

    1. Query Neo4j for the blast radius of changed symbols
    2. Format affected nodes and edges
    3. Include the diff
    """
    blast = db.query_blast_radius(changed_symbols)

    affected_lines = []
    for n in blast["affected_nodes"]:
        hop = n.get("hop_distance", "?")
        affected_lines.append(
            f"  [{n.get('label', '?')}] {n.get('name', '?')} in {n.get('file_path', '?')} (hop {hop})"
        )

    edge_lines = []
    for e in blast["affected_edges"]:
        edge_lines.append(f"  {_format_edge(e)}")

    return AUDIT_CONTEXT_TEMPLATE.format(
        changed_symbols=", ".join(changed_symbols),
        affected_nodes="\n".join(affected_lines) or "  (none found)",
        affected_edges="\n".join(edge_lines) or "  (none found)",
        diff=diff or "(no diff provided)",
    )
