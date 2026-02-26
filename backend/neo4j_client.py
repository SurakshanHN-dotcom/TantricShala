"""
neo4j_client.py – Core Database Layer for Yuktham.

This module manages all interactions with the local Neo4j Community Edition instance.
Key Responsibilities:
- Lifecycle management of the Neo4j driver and sessions.
- Schema integrity enforcement (Cypher RANGE indexes).
- Atomic graph ingestion using MERGE (upserts).
- Complex graph traversals for Blast Radius analysis and GraphRAG context retrieval.
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any

from neo4j import GraphDatabase

# Configure structured logging for production traceability
logger = logging.getLogger(__name__)

# Environment configuration with production-ready defaults
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "yuktham2026")

# Singleton driver instance to minimize connection overhead
_driver = None


def get_driver():
    """Lazy-init the Neo4j driver singleton."""
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        _driver.verify_connectivity()
        logger.info(f"Connected to Neo4j at {NEO4J_URI}")
    return _driver


def close_driver():
    """Close the Neo4j driver."""
    global _driver
    if _driver:
        _driver.close()
        _driver = None


@contextmanager
def get_session():
    """Context manager for a Neo4j session."""
    driver = get_driver()
    session = driver.session()
    try:
        yield session
    finally:
        session.close()


# ── Schema setup ─────────────────────────────────────────────

def ensure_indexes():
    """Create indexes for fast lookups."""
    queries = [
        "CREATE INDEX IF NOT EXISTS FOR (n:Function) ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:Class) ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:Module) ON (n.id)",
        "CREATE INDEX IF NOT EXISTS FOR (n:Variable) ON (n.id)",
    ]
    with get_session() as session:
        for q in queries:
            session.run(q)
    logger.info("Neo4j indexes ensured")


# ── Write operations ─────────────────────────────────────────

def clear_graph():
    """Delete all nodes and edges. Used before re-ingesting a codebase."""
    with get_session() as session:
        session.run("MATCH (n) DETACH DELETE n")
    logger.info("Neo4j graph cleared")


def write_nodes(nodes: list[dict]) -> int:
    """
    MERGE nodes into Neo4j. Each node dict must have:
    id, name, label, file_path, line_start, line_end, version_id, language
    """
    count = 0
    with get_session() as session:
        for node in nodes:
            label = node["label"]
            # Use MERGE to upsert
            query = f"""
            MERGE (n:{label} {{id: $id}})
            SET n.name = $name,
                n.file_path = $file_path,
                n.line_start = $line_start,
                n.line_end = $line_end,
                n.version_id = $version_id,
                n.language = $language
            """
            session.run(query, **node)
            count += 1
    logger.info(f"Wrote {count} nodes to Neo4j")
    return count


def write_edges(edges: list[dict]) -> int:
    """
    MERGE edges into Neo4j. Each edge dict must have:
    source_id, target_id, relationship, source_name, target_name, file_path, line
    """
    count = 0
    with get_session() as session:
        for edge in edges:
            rel = edge["relationship"]
            query = f"""
            MATCH (a {{id: $source_id}})
            MATCH (b {{id: $target_id}})
            MERGE (a)-[r:{rel}]->(b)
            SET r.file_path = $file_path,
                r.line = $line,
                r.source_name = $source_name,
                r.target_name = $target_name
            """
            session.run(
                query,
                source_id=edge["source_id"],
                target_id=edge["target_id"],
                file_path=edge["file_path"],
                line=edge["line"],
                source_name=edge["source_name"],
                target_name=edge["target_name"],
            )
            count += 1
    logger.info(f"Wrote {count} edges to Neo4j")
    return count


def write_graph(nodes: list[dict], edges: list[dict]) -> dict:
    """Full pipeline: clear → indexes → write nodes → write edges."""
    clear_graph()
    ensure_indexes()
    n_count = write_nodes(nodes)
    e_count = write_edges(edges)
    return {"nodes_written": n_count, "edges_written": e_count}


# ── Read operations ──────────────────────────────────────────

def get_full_graph() -> dict:
    """Return all nodes and edges for visualization."""
    with get_session() as session:
        # Nodes
        node_result = session.run("""
            MATCH (n)
            WHERE n.id IS NOT NULL
            RETURN n.id AS id, n.name AS name, labels(n)[0] AS label,
                   n.file_path AS file_path, n.line_start AS line_start,
                   n.line_end AS line_end, n.version_id AS version_id,
                   n.language AS language
        """)
        nodes = [dict(record) for record in node_result]

        # Edges
        edge_result = session.run("""
            MATCH (a)-[r]->(b)
            WHERE a.id IS NOT NULL AND b.id IS NOT NULL
            RETURN a.id AS source_id, a.name AS source_name,
                   type(r) AS relationship,
                   b.id AS target_id, b.name AS target_name,
                   r.file_path AS file_path, r.line AS line
        """)
        edges = [dict(record) for record in edge_result]

    return {"nodes": nodes, "edges": edges}


def query_blast_radius(symbols: list[str], max_hops: int = 5) -> dict:
    """
    Find all nodes transitively affected by changes to the given symbols.
    Uses variable-length path matching up to max_hops.
    """
    with get_session() as session:
        # Find the changed nodes
        changed_result = session.run("""
            MATCH (n)
            WHERE n.name IN $symbols AND n.id IS NOT NULL
            RETURN n.id AS id, n.name AS name, labels(n)[0] AS label,
                   n.file_path AS file_path, n.line_start AS line_start
        """, symbols=symbols)
        changed_nodes = [dict(r) for r in changed_result]

        if not changed_nodes:
            return {
                "changed_nodes": [],
                "affected_nodes": [],
                "affected_edges": [],
                "max_hop_distance": 0,
            }

        # Multi-hop blast radius (who depends on these symbols?)
        affected_result = session.run(f"""
            MATCH (changed)
            WHERE changed.name IN $symbols AND changed.id IS NOT NULL
            MATCH path = (upstream)-[:CALLS|IMPORTS|INHERITS*1..{max_hops}]->(changed)
            RETURN DISTINCT
                upstream.id AS id, upstream.name AS name,
                labels(upstream)[0] AS label,
                upstream.file_path AS file_path,
                upstream.line_start AS line_start,
                length(path) AS hop_distance
            ORDER BY hop_distance ASC
        """, symbols=symbols)
        affected_nodes = [dict(r) for r in affected_result]

        # Get edges in the blast radius subgraph
        all_ids = [n["id"] for n in changed_nodes] + [n["id"] for n in affected_nodes]
        edge_result = session.run("""
            MATCH (a)-[r]->(b)
            WHERE a.id IN $ids AND b.id IN $ids
            RETURN a.id AS source_id, a.name AS source_name,
                   type(r) AS relationship,
                   b.id AS target_id, b.name AS target_name,
                   r.file_path AS file_path, r.line AS line
        """, ids=all_ids)
        affected_edges = [dict(r) for r in edge_result]

        max_hop = max((n.get("hop_distance", 0) for n in affected_nodes), default=0)

    return {
        "changed_nodes": changed_nodes,
        "affected_nodes": affected_nodes,
        "affected_edges": affected_edges,
        "max_hop_distance": max_hop,
    }


def get_node_context(node_name: str) -> dict:
    """
    Get detailed context for a specific node — its definition,
    what it calls, what calls it, and what it imports/inherits.
    Used by GraphRAG to build LLM context.
    """
    with get_session() as session:
        # The node itself
        node_result = session.run("""
            MATCH (n)
            WHERE n.name = $name AND n.id IS NOT NULL
            RETURN n.id AS id, n.name AS name, labels(n)[0] AS label,
                   n.file_path AS file_path, n.line_start AS line_start,
                   n.line_end AS line_end
        """, name=node_name)
        node = [dict(r) for r in node_result]

        # Outgoing (what does it call/import?)
        out_result = session.run("""
            MATCH (n)-[r]->(target)
            WHERE n.name = $name AND n.id IS NOT NULL
            RETURN type(r) AS rel, target.name AS name,
                   target.file_path AS file_path, labels(target)[0] AS label
        """, name=node_name)
        outgoing = [dict(r) for r in out_result]

        # Incoming (what calls/imports it?)
        in_result = session.run("""
            MATCH (source)-[r]->(n)
            WHERE n.name = $name AND n.id IS NOT NULL
            RETURN type(r) AS rel, source.name AS name,
                   source.file_path AS file_path, labels(source)[0] AS label
        """, name=node_name)
        incoming = [dict(r) for r in in_result]

    return {"node": node, "outgoing": outgoing, "incoming": incoming}


def get_graph_summary() -> dict:
    """High-level stats about the current graph."""
    with get_session() as session:
        stats = session.run("""
            MATCH (n)
            WHERE n.id IS NOT NULL
            WITH count(n) AS total_nodes, collect(DISTINCT labels(n)[0]) AS labels
            OPTIONAL MATCH ()-[r]->()
            RETURN total_nodes, count(r) AS total_edges, labels
        """)
        record = stats.single()
        if not record:
            return {"total_nodes": 0, "total_edges": 0, "labels": []}
        return dict(record)
