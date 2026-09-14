#!/usr/bin/env python3
# Variante en échec du faux script MinerU (KBG-05) : imprime une étape puis
# échoue avec un message reconnu par mineruFailure()/mineru_failure() (motif
# "quota"), sans jamais écrire de markdown produit — force le repli sur
# l'extraction locale (pdftotext) côté convertPdf/convert_pdf_with, avec un
# warning documentant la tentative ratée.
import sys

print("Uploading fixture.pdf", flush=True)
print("Error: quota exceeded (fixture MinerU factice)", file=sys.stderr, flush=True)
sys.exit(1)
