type Props = {
  text: string;
  onCopy: () => void;
  copied: boolean;
};

export function DiagnosticsScreen(p: Props) {
  return (
    <div className="screen">
      <h1 className="screen-title">Diagnostics</h1>
      <p className="screen-sub">
        Copiable sans secret — le jeton appareil n'apparaît jamais en clair.
      </p>
      <div className="stack">
        <pre className="diag-pre" aria-label="Diagnostics">
          {p.text}
        </pre>
        <button type="button" className="btn btn-ghost" onClick={p.onCopy}>
          {p.copied ? "Copié" : "Copier"}
        </button>
      </div>
    </div>
  );
}
