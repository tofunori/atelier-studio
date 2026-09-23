"""Ragdoc adapter executed over SSH; JSON stdin/stdout, diagnostics on stderr.

Uses Ragdoc's canonical library, retrieval and targeted indexers. No server or
database copy is installed by Atelier. Read operations never import documents.
"""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def safe_source(source):
    if not isinstance(source, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*\.md", source):
        raise ValueError("Nom de document Ragdoc invalide")
    return source


def tool(server, name, **kwargs):
    target = getattr(server, name)
    result = getattr(target, "fn", target)(**kwargs)
    return result.model_dump() if hasattr(result, "model_dump") else result


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".atelier-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def document(server, source):
    collection = server._ready_collection()
    data = server._fetch_document_chunks(collection, source)
    if not data["documents"]:
        raise ValueError("Document absent de l’index Ragdoc : " + source)
    metadata = data["metadatas"][0]
    digest = metadata.get("canonical_sha256")
    if digest:
        markdown = server.Library(server.LIBRARY_PATH).read(digest)
        if hashlib.sha256(markdown.encode()).hexdigest() != digest:
            raise ValueError("Le texte canonique ne correspond pas à son empreinte")
    else:
        # Older records remain readable, with the same limitation as Ragdoc's
        # own reader. Never describe overlapping reconstructed chunks as exact.
        ordered = sorted(zip(data["documents"], data["metadatas"]), key=lambda pair: pair[1].get("chunk_index", 0))
        markdown = "> Document ancien : texte reconstruit à partir de fragments, avec répétitions possibles. Les pages et le texte intégral ne sont pas vérifiés.\n\n" + "\n\n".join(text for text, _ in ordered)
    pages = []
    pages_complete = False
    source_path = Path(source)
    if source_path.name == source:
        try:
            sidecar = json.loads((Path.cwd() / "articles_markdown" / source_path.with_suffix(".metadata.json")).read_text())
            if digest and sidecar.get("content_sha256") == digest and metadata.get("metadata_sha256") == hashlib.sha256(json.dumps(sidecar, sort_keys=True, ensure_ascii=False).encode()).hexdigest():
                pages = [{"page": span["page"], "text": markdown[span["start"]:span["end"]]}
                         for span in sidecar.get("page_spans", [])]
                cursor = 0
                pages_complete = bool(pages)
                for span in sidecar.get("page_spans", []):
                    if not cursor <= span["start"] < span["end"] <= len(markdown) or markdown[cursor:span["start"]].strip():
                        pages_complete = False
                    cursor = span["end"]
                if markdown[cursor:].strip():
                    pages_complete = False
        except (OSError, ValueError, KeyError, TypeError):
            pass
    server._assert_revision(collection)
    return {"ok": True, "pages": pages, "pagesComplete": pages_complete, "slug": source, "source": source, "markdown": markdown,
            "chars": len(markdown), "title": metadata.get("title") or source,
            "metadataSha256": metadata.get("metadata_sha256"), "contentSha256": digest, "canonicalVerified": bool(digest), "chunks": len(data["documents"]),
            "sourcePdf": server.provenance(metadata)["source_pdf"], "kind": "ragdoc"}


def execute(request, root, server):
    operation = request["operation"]
    if operation == "status":
        collection = server._ready_collection()
        result = tool(server, "get_server_status")
        result["chunks"] = collection.count()
        result["documents"] = tool(server, "search_documents", query="", offset=0, limit=1)["total"]
        server._assert_revision(collection)
        return {"ok": True, "index": result}
    if operation == "list":
        result = tool(server, "search_documents", query=request.get("query", ""),
                      offset=request.get("offset", 0), limit=request.get("limit", 100))
        return {"ok": True, "total": result["total"], "nextOffset": result["next_offset"],
                "articles": [{"slug": p["source"], "title": p["bibliography"]["title"] or p["source"],
                              "type": "ragdoc", "date": str(p["bibliography"]["year"] or "")}
                             for p in result["documents"]]}
    if operation == "search":
        result = tool(server, "search_evidence", query=request["query"],
                      top_k=request.get("limit", 12), max_per_document=1)
        return {"ok": True, "query": request["query"], "warnings": result["warnings"],
                "results": [{"slug": h["provenance"]["source"], "snippet": h["excerpt"],
                             "title": h["provenance"]["bibliography"]["title"],
                             "page": h["provenance"]["location"]["page_start"],
                             "chunkId": h["chunk_id"], "provenance": h["provenance"],
                             "excerptTruncated": h["excerpt_truncated"]} for h in result["hits"]]}
    if operation == "read":
        return document(server, request["source"])
    if operation == "passage":
        result = tool(server, "get_passage", chunk_id=request["chunkId"],
                      expected_content_sha256=request.get("contentSha256"))
        from urllib.parse import urlencode
        params = {"source": result["provenance"]["source"], "quote": result["text"]}
        page = result["provenance"]["location"].get("page_start")
        if page is not None:
            params["page"] = page
        result["markdownLink"] = "[Lire le passage dans Ragdoc](#atelier-ragdoc-passage?" + urlencode(params) + ")"
        return result
    if operation == "pdf_status":
        fingerprints = set(request.get("fingerprints", []))
        if len(fingerprints) > 20000 or any(not isinstance(f, str) or not re.fullmatch(r"[a-f0-9]{64}", f) for f in fingerprints):
            raise ValueError("Empreintes PDF invalides")
        collection = server._ready_collection()
        matches = {}
        for path in (root / "articles_markdown").glob("*.metadata.json"):
            try:
                meta = json.loads(path.read_text())
            except (OSError, ValueError):
                continue
            fingerprint = meta.get("pdf_sha256")
            if fingerprint not in fingerprints:
                continue
            source = path.name.removesuffix(".metadata.json") + ".md"
            indexed = collection.get(where={"source": source}, include=["metadatas"], limit=1)
            expected = hashlib.sha256(json.dumps(meta, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            if indexed["ids"] and indexed["metadatas"][0].get("metadata_sha256") == expected:
                matches[fingerprint] = source
        server._assert_revision(collection)
        return {"ok": True, "matches": matches}
    if operation == "probe":
        collection = server._ready_collection()
        source = request.get("source", "")
        matches = collection.get(where={"source": source}, include=[])["ids"] if source else []
        duplicates = []
        fingerprint = request.get("fingerprint")
        if fingerprint:
            for path in (root / "articles_markdown").glob("*.metadata.json"):
                try:
                    meta = json.loads(path.read_text())
                except (OSError, ValueError):
                    continue
                if meta.get("pdf_sha256") != fingerprint:
                    continue
                candidate = path.name.removesuffix(".metadata.json") + ".md"
                if collection.get(where={"source": candidate}, include=[])["ids"]:
                    duplicates.append({"slug": candidate, "why": "pdf", "snippet": meta.get("title", candidate)})
        server._assert_revision(collection)
        return {"ok": True, "exists": bool(matches), "duplicates": duplicates}
    if operation != "write":
        raise ValueError("Opération Ragdoc inconnue")

    # Only the explicit approval path may enter this branch. A retry is
    # idempotent; changing another document under the same name is refused.
    import fcntl
    source = safe_source(request["source"])
    markdown = request["markdown"]
    body = markdown.encode()
    digest = hashlib.sha256(body).hexdigest()
    metadata = dict(request.get("metadata", {}))
    metadata["content_sha256"] = digest
    destination = root / "articles_markdown" / source
    with (root / ".atelier-import.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if destination.exists() and destination.read_bytes() != body:
            raise ValueError("Ce nom contient déjà un autre texte. Choisissez un nouveau nom pour conserver l’original.")
        # Validate every artifact before creating any remote file.
        files = []
        for item in request.get("artifacts", []):
            relative = Path(item["path"])
            if relative.is_absolute() or ".." in relative.parts or not relative.parts:
                raise ValueError("Chemin d’illustration invalide")
            files.append((relative, bytes.fromhex(item["hex"])))
        expected_artifacts = []
        if files:
            contents = {str(path): content for path, content in files}
            manifest = json.loads(contents["manifest.json"])
            if manifest.get("source") != source:
                raise ValueError("Le manifeste appartient à un autre document")
            expected_artifacts = manifest.get("artifacts", [])
            for item in expected_artifacts:
                if item.get("image") and item["image"] not in contents:
                    raise ValueError("Illustration manquante : " + item["image"])
        artifact_root = root / "ragdoc_artifacts" / source.removesuffix(".md")
        for relative, content in files:
            target = artifact_root / relative
            if not target.resolve().is_relative_to(artifact_root.resolve()):
                raise ValueError("Illustration hors du dossier prévu")
            atomic_write(target, content)
        atomic_write(destination.with_suffix(".metadata.json"), json.dumps(metadata, ensure_ascii=False).encode())
        atomic_write(destination, body)
        for script in ("index_incremental.py", "index_artifacts.py"):
            subprocess.run([sys.executable, str(root / "scripts" / script), "--source", source],
                           cwd=root, check=True, stdout=sys.stderr, timeout=3300)
        artifact_index = server.ArtifactIndex(server.ARTIFACTS_PATH)
        for item in expected_artifacts:
            indexed = artifact_index.get(item["artifact_id"])
            if not indexed or indexed.get("source") != source:
                raise ValueError("Illustration non indexée : " + item["artifact_id"])
        result = document(server, source)
        if result["contentSha256"] != digest or result["chunks"] < 1 or result["metadataSha256"] != hashlib.sha256(json.dumps(metadata, sort_keys=True, ensure_ascii=False).encode()).hexdigest():
            raise ValueError("Indexation non vérifiée ; le brouillon est conservé")
        return {"ok": True, "written": True, "slug": source, "updated": False,
                "ragdoc": {"ok": True, "verified": True, "chunks": result["chunks"],
                           "contentSha256": digest}}


def main():
    root = Path.cwd().resolve()
    os.environ.update(CHROMA_DB_PATH=str(root / "chroma_db_new"),
                      RAGDOC_LIBRARY_DIR=str(root / "ragdoc_library/ragdoc_contextualized_v1"),
                      COLLECTION_NAME="ragdoc_contextualized_v1", RAGDOC_CHROMA_MODE="persistent")
    from dotenv import load_dotenv
    load_dotenv(root / ".env")
    import chromadb
    client = chromadb.PersistentClient(path=os.environ["CHROMA_DB_PATH"])
    collection = client.get_collection("ragdoc_contextualized_v1")
    model = (collection.metadata or {}).get("embedding_model")
    if not model:
        raise ValueError("Modèle de l’index Ragdoc inconnu")
    os.environ["RAGDOC_EMBEDDING_MODEL"] = model
    from src import server
    server.chroma_client = client
    request = json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        result = execute(request, root, server)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        sys.exit(1)
