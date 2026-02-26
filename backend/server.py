"""
server.py – FastAPI backend for Yuktham.

Endpoints:
  POST /api/upload     — Upload source files, parse AST, ingest into Neo4j
  GET  /api/graph      — Get full graph for D3 visualization
  POST /api/chat       — Chat with Yukta (GraphRAG + Gemini)
  POST /api/audit      — Run blast-radius audit (GraphRAG + Gemini)
  GET  /api/health     — Health check
"""
from __future__ import annotations

import logging
import os
import tempfile
import zipfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import neo4j_client as db
from .ast_parser import parse_files, SUPPORTED_EXTENSIONS
from . import graphrag
from . import gemini_client as gemini

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Yuktham API",
    description="Architectural Blast-Radius Sentinel — Local Backend",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup ──────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    try:
        db.get_driver()
        db.ensure_indexes()
        logger.info("Backend started — Neo4j connected, indexes ensured")
    except Exception as e:
        logger.error(f"Neo4j connection failed: {e}")
        logger.warning("Backend started WITHOUT Neo4j. Upload will fail.")


@app.on_event("shutdown")
async def shutdown():
    db.close_driver()
    logger.info("Backend shutdown — Neo4j driver closed")


# ── Health ───────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    try:
        summary = db.get_graph_summary()
        return {
            "status": "ok",
            "neo4j": "connected",
            "graph": summary,
        }
    except Exception as e:
        return {"status": "degraded", "neo4j": str(e)}


# ── Upload & Parse ───────────────────────────────────────────

@app.post("/api/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    """
    Upload source files. Accepts individual files or a .zip archive.
    Parses AST and ingests into Neo4j.
    """
    file_map: dict[str, str] = {}

    for upload in files:
        content = await upload.read()
        filename = upload.filename or "unknown"

        if filename.endswith(".zip"):
            # Extract zip
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name

            try:
                with zipfile.ZipFile(tmp_path, "r") as zf:
                    for name in zf.namelist():
                        if name.endswith("/"):
                            continue
                        ext = Path(name).suffix.lower()
                        if ext in SUPPORTED_EXTENSIONS:
                            try:
                                file_map[name] = zf.read(name).decode("utf-8", errors="replace")
                            except Exception:
                                pass
            finally:
                os.unlink(tmp_path)
        else:
            ext = Path(filename).suffix.lower()
            if ext in SUPPORTED_EXTENSIONS:
                file_map[filename] = content.decode("utf-8", errors="replace")

    if not file_map:
        raise HTTPException(400, f"No supported source files. Supported: {', '.join(SUPPORTED_EXTENSIONS)}")

    # Parse AST
    result = parse_files(file_map)

    # Write to Neo4j
    try:
        write_result = db.write_graph(result["nodes"], result["edges"])
    except Exception as e:
        logger.error(f"Neo4j write failed: {e}", exc_info=True)
        raise HTTPException(500, f"Neo4j write failed: {e}")

    return {
        "status": "ok",
        "parse_stats": result["stats"],
        "neo4j": write_result,
        "errors": result["errors"],
    }


class FolderUpload(BaseModel):
    """For uploading file contents as JSON (used by frontend folder upload)."""
    files: dict[str, str]  # {file_path: source_code}


@app.post("/api/upload-folder")
async def upload_folder(payload: FolderUpload):
    """Upload files as a JSON map {path: content}. Used for folder uploads from the browser."""
    if not payload.files:
        raise HTTPException(400, "No files provided")

    # Filter to supported extensions
    file_map = {}
    for path, content in payload.files.items():
        ext = Path(path).suffix.lower()
        if ext in SUPPORTED_EXTENSIONS:
            file_map[path] = content

    if not file_map:
        raise HTTPException(400, f"No supported source files. Supported: {', '.join(SUPPORTED_EXTENSIONS)}")

    result = parse_files(file_map)

    try:
        write_result = db.write_graph(result["nodes"], result["edges"])
    except Exception as e:
        raise HTTPException(500, f"Neo4j write failed: {e}")

    return {
        "status": "ok",
        "parse_stats": result["stats"],
        "neo4j": write_result,
        "errors": result["errors"],
    }


# ── Graph ────────────────────────────────────────────────────

@app.get("/api/graph")
async def get_graph():
    """Return the full graph for D3 visualization."""
    try:
        return db.get_full_graph()
    except Exception as e:
        raise HTTPException(500, f"Graph query failed: {e}")


# ── Chat (Yukta) ─────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None


class ChatResponse(BaseModel):
    response: str
    context_used: str | None = None


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Chat with Yukta — answers are grounded in the codebase graph."""
    if not req.message.strip():
        raise HTTPException(400, "Empty message")

    try:
        # Build GraphRAG context
        context = graphrag.build_chat_context(req.message)

        # Call Gemini with Yukta persona
        response = gemini.chat(context, req.history)

        return ChatResponse(response=response, context_used=context[:500])

    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(500, f"Yukta error: {e}")


# ── Audit ────────────────────────────────────────────────────

class AuditRequest(BaseModel):
    changed_symbols: list[str]
    diff: str = ""


@app.post("/api/audit")
async def audit(req: AuditRequest):
    """Run a blast-radius audit on proposed code changes."""
    if not req.changed_symbols:
        raise HTTPException(400, "No changed symbols provided")

    try:
        # Build audit context from graph
        context = graphrag.build_audit_context(req.changed_symbols, req.diff)

        # Call Gemini for structured audit
        audit_result = gemini.audit(context)

        # Get blast radius stats
        blast = db.query_blast_radius(req.changed_symbols)

        return {
            "audit": audit_result,
            "blast_radius_summary": {
                "changed_nodes": len(blast["changed_nodes"]),
                "affected_nodes": len(blast["affected_nodes"]),
                "total_edges": len(blast["affected_edges"]),
                "max_hop_distance": blast["max_hop_distance"],
                "symbols_queried": req.changed_symbols,
            },
            "version_id": "v1",
        }

    except Exception as e:
        logger.error(f"Audit error: {e}", exc_info=True)
        raise HTTPException(500, f"Audit error: {e}")
