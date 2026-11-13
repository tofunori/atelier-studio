// « Proposer » de l'éditeur Word : la carte du message envoyé lit l'enveloppe
// de replyPrompt (gallery/src/browser/docx_studio.ts).
import { describe, expect, it } from "vitest";
import { docxReplyAsk } from "./docxReplyAsk";
import { userBubbleAttachmentFields } from "./turnPayload";

const PATH = "/Users/t/These/Chapitre1 revCK.docx";
const ask = (head: string, rest = "") => `${PATH} (${head}) — Christophe Kinnard sur « 0,6 retenu ici » : Pourquoi 0,6 et pas 0,5 ?\nUne courte analyse serait la bienvenue.${rest}\n\n`
  + "Propose-moi une réponse à Christophe : courte, en français, que je relirai et enverrai sous mon nom. "
  + "Pose-la avec atelier_docx action=draft_reply (comment=7), jamais reply.";

describe("docxReplyAsk", () => {
  it("auteur, paragraphe et commentaire (multiligne) ; les réponses du fil restent hors de la carte", () => {
    expect(docxReplyAsk(ask("commentaire c7, p17"))).toEqual({
      author: "Christophe Kinnard",
      comment: "Pourquoi 0,6 et pas 0,5 ?\nUne courte analyse serait la bienvenue.",
      where: "¶ 17",
    });
    const threaded = docxReplyAsk(ask("commentaire c7, p17", "\n  ↳ Thierry : je regarde"));
    expect(threaded?.comment).toBe("Pourquoi 0,6 et pas 0,5 ?\nUne courte analyse serait la bienvenue.");
  });

  it("sans paragraphe, ou paragraphe de note : pas de repère", () => {
    expect(docxReplyAsk(ask("commentaire c7"))).toEqual({
      author: "Christophe Kinnard", comment: "Pourquoi 0,6 et pas 0,5 ?\nUne courte analyse serait la bienvenue.",
    });
    expect(docxReplyAsk(ask("commentaire c7, n3.p0"))?.where).toBeUndefined();
  });

  it("« Vérifier dans le chat » sur son propre commentaire : check, sans les réponses", () => {
    const check = `${PATH} (commentaire c121, p2) — mon commentaire sur « compromis » : Seuil justifié en 2.3.\n  ↳ Thierry : vu\n\n`
      + "Vérifie mon commentaire contre le document (atelier_docx action=read) : chiffres, unités, renvois et ce qu'il dit du texte. "
      + "Termine toujours par atelier_docx action=checked (comment=121), corrigé ou non.";
    expect(docxReplyAsk(check)).toEqual({ check: true, author: "mon commentaire", comment: "Seuil justifié en 2.3.", where: "¶ 2" });
    expect(docxReplyAsk(ask("commentaire c7, p17"))?.check).toBeUndefined();
  });

  it("toute autre pièce jointe : null", () => {
    expect(docxReplyAsk(`${PATH} (p12) : « passage »\nCommentaire : note`)).toBeNull();
    expect(docxReplyAsk("/a/chapitre1.tex (L3-5) : « x »")).toBeNull();
    // sans la consigne finale, ce n'est pas une demande « Proposer »
    expect(docxReplyAsk(`${PATH} (commentaire c7, p17) — C sur « q » : texte`)).toBeNull();
  });

  it("la bulle garde le chemin et porte la citation", () => {
    const fields = userBubbleAttachmentFields([{ name: "Chapitre1 revCK.docx", lines: null, text: ask("commentaire c7, p17"), path: PATH, kind: "file" }]);
    expect(fields.files).toEqual([{
      name: "Chapitre1 revCK.docx", path: PATH, kind: "file",
      reply: { author: "Christophe Kinnard", comment: "Pourquoi 0,6 et pas 0,5 ?\nUne courte analyse serait la bienvenue.", where: "¶ 17" },
    }]);
    const plain = userBubbleAttachmentFields([{ name: "a.docx", lines: null, text: "/x/a.docx", path: "/x/a.docx", kind: "file" }]);
    expect(plain.files?.[0]).not.toHaveProperty("reply");
  });
});
