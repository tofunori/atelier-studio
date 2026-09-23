"""Offline contract checks: no SSH, embedding API, or canonical index writes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("ragdoc_remote", Path(__file__).parents[1] / "src/ragdoc_remote.py")
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)


def fake_server(text="document", canonical=True):
    digest = hashlib.sha256(text.encode()).hexdigest()
    metadata = {"canonical_sha256": digest, "metadata_sha256": hashlib.sha256(json.dumps({"content_sha256":digest},sort_keys=True,ensure_ascii=False).encode()).hexdigest()} if canonical else {}
    return SimpleNamespace(
        _ready_collection=lambda: object(),
        _fetch_document_chunks=lambda collection, source: {"documents": [text], "metadatas": [metadata]},
        _assert_revision=lambda collection: None,
        Library=lambda path: SimpleNamespace(read=lambda key: text), LIBRARY_PATH="unused",
        provenance=lambda meta: {"source_pdf": "/original.pdf"},
        ArtifactIndex=lambda root: SimpleNamespace(get=lambda key: None), ARTIFACTS_PATH="unused",
    )


class RagdocRemoteTests(unittest.TestCase):
    def test_canonical_read_retains_hash_and_pdf_identity(self):
        value = adapter.document(fake_server(), "source.md")
        self.assertTrue(value["canonicalVerified"])
        self.assertEqual(value["sourcePdf"], "/original.pdf")
        self.assertEqual(value["contentSha256"], hashlib.sha256(b"document").hexdigest())

    def test_partial_page_spans_do_not_claim_exhaustive_coverage(self):
        text = "prefix page one suffix"
        for spans, complete in [
            ([{"page": 1, "start": 7, "end": 15}], False),
            ([{"page": 1, "start": 0, "end": len(text)}], True),
        ]:
            with self.subTest(spans=spans), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "articles_markdown").mkdir()
                sidecar = {"content_sha256": hashlib.sha256(text.encode()).hexdigest(), "page_spans": spans}
                (root / "articles_markdown/source.metadata.json").write_text(json.dumps(sidecar))
                server = fake_server(text=text)
                data = server._fetch_document_chunks(None, None)
                data["metadatas"][0]["metadata_sha256"] = hashlib.sha256(json.dumps(sidecar, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                server._fetch_document_chunks = lambda *_: data
                with patch.object(adapter.Path, "cwd", return_value=root):
                    value = adapter.document(server, "source.md")
                self.assertEqual(value["pagesComplete"], complete)
                self.assertEqual(value["markdown"], text)

    def test_legacy_read_is_explicitly_unverified(self):
        value = adapter.document(fake_server(canonical=False), "source.md")
        self.assertFalse(value["canonicalVerified"])
        self.assertIsNone(value["contentSha256"])
        self.assertIn("texte reconstruit", value["markdown"])
        self.assertEqual(value["pages"], [])

    def test_refuses_overwrite_before_indexing(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(adapter.subprocess, "run") as run:
            root = Path(directory)
            (root / "articles_markdown").mkdir()
            original = root / "articles_markdown/source.md"
            original.write_text("original")
            with self.assertRaisesRegex(ValueError, "autre texte"):
                adapter.execute({"operation": "write", "source": "source.md", "markdown": "changed"}, root, fake_server())
            self.assertEqual(original.read_text(), "original")
            run.assert_not_called()

    def test_refuses_missing_figure_before_publishing_markdown(self):
        manifest = {"source": "source.md", "artifacts": [{"artifact_id": "figure-1", "image": "missing.png"}]}
        request = {"operation": "write", "source": "source.md", "markdown": "text", "artifacts": [
            {"path": "manifest.json", "hex": json.dumps(manifest).encode().hex()}]}
        with tempfile.TemporaryDirectory() as directory, patch.object(adapter.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "Illustration manquante"):
                adapter.execute(request, Path(directory), fake_server())
            self.assertFalse((Path(directory) / "articles_markdown/source.md").exists())
            run.assert_not_called()

    def test_success_requires_indexed_canonical_hash(self):
        request = {"operation": "write", "source": "source.md", "markdown": "new text"}
        with tempfile.TemporaryDirectory() as directory, patch.object(adapter.subprocess, "run"):
            with self.assertRaisesRegex(ValueError, "non vérifiée"):
                adapter.execute(request, Path(directory), fake_server(text="old text"))

    def test_success_is_verified_and_targeted(self):
        request = {"operation": "write", "source": "source.md", "markdown": "document"}
        with tempfile.TemporaryDirectory() as directory, patch.object(adapter.subprocess, "run") as run:
            result = adapter.execute(request, Path(directory), fake_server())
            self.assertTrue(result["ragdoc"]["verified"])
            self.assertEqual(run.call_count, 2)
            for call in run.call_args_list:
                self.assertEqual(call.args[0][-2:], ["--source", "source.md"])

    def test_pdf_status_requires_indexed_metadata_identity(self):
        fingerprint = "a" * 64
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "articles_markdown").mkdir()
            meta = {"pdf_sha256": fingerprint, "title": "Same title"}
            (root / "articles_markdown/paper.metadata.json").write_text(json.dumps(meta))
            digest = hashlib.sha256(json.dumps(meta, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            for ids, stored_hash, expected in [([], digest, {}), (["chunk"], "stale", {}), (["chunk"], digest, {fingerprint:"paper.md"})]:
                with self.subTest(ids=ids, stored_hash=stored_hash):
                    server = fake_server()
                    server._ready_collection = lambda: SimpleNamespace(get=lambda **kwargs: {"ids":ids, "metadatas":[{"metadata_sha256":stored_hash}]})
                    result = adapter.execute({"operation":"pdf_status", "fingerprints":[fingerprint, "b"*64]}, root, server)
                    self.assertEqual(result["matches"], expected)

    def test_pdf_status_propagates_index_failures(self):
        server = fake_server()
        server._ready_collection = lambda: (_ for _ in ()).throw(ValueError("offline"))
        with self.assertRaisesRegex(ValueError, "offline"):
            adapter.execute({"operation":"pdf_status", "fingerprints":["a"*64]}, Path("unused"), server)

    def test_source_name_cannot_escape_library(self):
        for source in ("../a.md", "/tmp/a.md", "a/b.md", "a.md\n", ".hidden.md"):
            with self.subTest(source=source), self.assertRaises(ValueError):
                adapter.safe_source(source)


if __name__ == "__main__":
    unittest.main()
