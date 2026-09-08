#!/usr/bin/env python3
"""Download a research PDF atomically; never replace an existing destination."""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def validate_pdf(path: Path, expected_doi: str | None = None) -> None:
    with path.open("rb") as stream:
        if not stream.read(1024).lstrip().startswith(b"%PDF-"):
            raise ValueError("Le fichier reçu n'est pas un PDF (page HTML ou blocage possible).")
    subprocess.run(["pdfinfo", str(path)], check=True, capture_output=True, timeout=30)
    if expected_doi:
        result = subprocess.run(["pdftotext", "-f", "1", "-l", "3", str(path), "-"],
                                check=True, capture_output=True, timeout=30)
        text = result.stdout.decode("utf-8", errors="replace")
        doi = re.sub(r"\s+", "", expected_doi)
        pattern = r"(?<![\w/])" + r"\s*".join(re.escape(char) for char in doi) + r"(?=$|\s|[<>\"']|[.,;:)](?:\s|$))"
        if not re.search(pattern, text, re.IGNORECASE):
            raise ValueError("Le DOI attendu est absent des trois premières pages; vérifier la référence.")


def download(url: str, destination: Path, expected_doi: str | None = None) -> None:
    if urlparse(url).scheme not in {"https", "http"}:
        raise ValueError("Une URL HTTP(S) est requise.")
    for tool in ["pdfinfo"] + (["pdftotext"] if expected_doi else []):
        if not shutil.which(tool):
            raise ValueError(f"{tool} est requis pour valider le PDF avant téléchargement.")
    if destination.exists():
        raise FileExistsError(f"Destination existante conservée : {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".part", delete=False) as out:
        temporary = Path(out.name)
        try:
            with urlopen(Request(url, headers={"User-Agent": "Atelier-PDF-Verification/1.0"}), timeout=30) as response:
                size = 0
                while chunk := response.read(65536):
                    size += len(chunk)
                    if size > 100 * 1024 * 1024:
                        raise ValueError("Téléchargement supérieur à 100 Mio; validation manuelle requise.")
                    out.write(chunk)
            out.flush()
            validate_pdf(temporary, expected_doi)
            # Same-volume link publishes the complete file and fails if a concurrent writer won.
            os.link(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("destination", type=Path)
    parser.add_argument("--expected-doi")
    args = parser.parse_args()
    try:
        download(args.url, args.destination, args.expected_doi)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f"PDF refusé : {error}\n")
    print(f"PDF validé : {args.destination}")
