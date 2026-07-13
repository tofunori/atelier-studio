import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function FilesPlaceholder() {
  return (
    <div className="screen">
      <h1 className="screen-title">Fichiers</h1>
      <p className="screen-sub">
        Navigateur borné et viewers PDF/PNG/LaTeX — jalon G. Aucun chemin arbitraire
        n'est accepté par la gateway.
      </p>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Bientôt disponible</EmptyTitle>
          <EmptyDescription>Le navigateur de fichiers sera accessible ici.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
