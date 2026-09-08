import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("verified_pdf", Path(__file__).with_name("download-verified-pdf.py"))
pdf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pdf)


class VerifiedPdfTests(unittest.TestCase):
    def test_html_success_response_is_not_published(self):
        with tempfile.TemporaryDirectory() as root:
            destination = Path(root) / "paper.pdf"
            with patch.object(pdf, "urlopen", return_value=io.BytesIO(b"<html>Just a moment...</html>")), patch.object(pdf.shutil, "which", return_value="/usr/bin/pdfinfo"):
                with self.assertRaises(ValueError):
                    pdf.download("https://example.org/paper.pdf", destination)
            self.assertEqual(list(Path(root).iterdir()), [])

    def test_existing_destination_is_preserved_without_request(self):
        with tempfile.TemporaryDirectory() as root:
            destination = Path(root) / "paper.pdf"
            destination.write_bytes(b"original")
            with patch.object(pdf, "urlopen") as request, patch.object(pdf.shutil, "which", return_value="pdfinfo"):
                with self.assertRaises(FileExistsError):
                    pdf.download("https://example.org/paper.pdf", destination)
                request.assert_not_called()
            self.assertEqual(destination.read_bytes(), b"original")

    def test_doi_comparison_rejects_prefix_and_suffix(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "paper.pdf"
            source.write_bytes(b"%PDF-1.7\n")
            result = subprocess.CompletedProcess([], 0, stdout=b"RESEARCH ARTICLE\n10.1029/2025JF008740\nKey Points")
            with patch.object(pdf.subprocess, "run", return_value=result):
                pdf.validate_pdf(source, "10.1029/2025JF008740")
                for wrong in ["10.1029/2025JF00874", "10.1029/2025JF0087400"]:
                    with self.assertRaises(ValueError):
                        pdf.validate_pdf(source, wrong)

    def test_parser_failure_rejects_pdf_header_alone(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "paper.pdf"
            source.write_bytes(b"%PDF-1.7\nbroken")
            with patch.object(pdf.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "pdfinfo")):
                with self.assertRaises(subprocess.CalledProcessError):
                    pdf.validate_pdf(source)


if __name__ == "__main__":
    unittest.main()
