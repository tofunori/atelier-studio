#!/usr/bin/env python3
# Faux script MinerU pour fixtures de parité (plan 065, vague 5, KBG-05) —
# JAMAIS le vrai script cloud (~/.claude/skills/mineru-pdf/mineru_convert.py),
# aucun appel payant réel. Reproduit juste assez du contrat observé par
# convertPdf/convert_pdf_with (sidecar/article.mjs, rust/crates/atelier-kb/
# src/article.rs) : des lignes de progression reconnues par mineruStage()
# sur stdout, puis un fichier <name>.md écrit dans /tmp (le premier des deux
# "roots" cherchés par les deux moteurs).
#
# Usage réel (spawné par convertPdf) : python3 fake-mineru-ok.py <pdf> <name>
import sys

def emit(line):
    print(line, flush=True)

path = sys.argv[1] if len(sys.argv) > 1 else "inconnu.pdf"
name = sys.argv[2] if len(sys.argv) > 2 else "fixture"

emit(f"Uploading {path}")
emit("Upload complete")
emit("Processing... (1s)")
emit("Conversion complete")
emit("Downloading result")
emit("Extracted 1 figure")
emit("Couche texte: is_ocr=False")

with open(f"/tmp/{name}.md", "w") as f:
    # Titre volontairement COURT (<20 car., parseArticleMeta) : sous le seuil
    # TITLE_MATCH_MIN de crossrefByTitle (article_meta.mjs) — jamais de vraie
    # recherche Crossref par titre, jamais de faux-positif comme un mot
    # générique matchant une notice réelle sans rapport. Aucun motif
    # \d{4,9}/... non plus (jamais interprete comme un DOI).
    f.write(
        "# MinerU Test\n\n"
        "A. Fixture and B. Faux\n\n"
        "Ceci est un texte converti par le faux MinerU (fixture kb_parity, jamais l'API cloud reelle). "
        "Les resultats confirment une baisse significative de l'albedo de surface glaciaire.\n"
    )
