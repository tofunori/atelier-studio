// Dédoublonnage des blocs de raisonnement d'un même tour (2026-08-22).
//
// Le réducteur recolle les morceaux de pensée d'un tour sur un bloc ANTÉRIEUR
// (règle Grok : un flux continu tranché tous les ~100 caractères) pendant que
// le bloc vivant garde déjà sa copie. On se retrouve donc avec « T1 », « T1+T2 »
// et « T2 » dans le même fil — trois « Réflexion » qui racontent deux fois la
// même chose (capture Thierry 2026-08-22). Comparer des textes EXACTS ne voit
// rien : « T1+T2 » n'est égal ni à « T1 » ni à « T2 ».
//
// D'où le raisonnement par INCLUSION : un bloc dont le texte est entièrement
// contenu dans un autre bloc du MÊME tour n'apprend rien de plus — on ne garde
// que le plus complet. La comparaison ne franchit jamais une frontière de tour
// (`user`/`done`) : deux tours peuvent légitimement penser la même chose.
import type { AgentEvent } from "../ws";

type Bloc = { idx: number; texte: string };

/** Indices des événements de pensée à NE PAS rendre (redites d'un autre bloc
 * du même tour). Le bloc conservé est le plus long ; à texte égal, le premier
 * — sa place logique, avant la réponse qu'il a servi à écrire. */
export function doublonsDePensee(events: AgentEvent[]): Set<number> {
  const aSauter = new Set<number>();
  let blocs: Bloc[] = [];

  const trancherLeTour = () => {
    for (const bloc of blocs) {
      const couvert = blocs.some((autre) => (
        autre !== bloc
        && autre.texte.includes(bloc.texte)
        && (autre.texte.length > bloc.texte.length || autre.idx < bloc.idx)
      ));
      if (couvert) aSauter.add(bloc.idx);
    }
    blocs = [];
  };

  events.forEach((event, idx) => {
    if (event.kind === "user" || event.kind === "done") {
      trancherLeTour();
      return;
    }
    if (event.kind !== "thinking" && event.kind !== "thinking_live") return;
    const texte = event.text.trim();
    if (texte) blocs.push({ idx, texte });
  });
  trancherLeTour();
  return aSauter;
}
