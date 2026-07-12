import { useState } from "react";

type Props = {
  gatewayUrl: string;
  onGatewayUrlChange: (url: string) => void;
  onPair: (code: string, deviceName: string) => Promise<void>;
  busy: boolean;
  error: string | null;
};

export function PairingScreen(p: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("iPhone");

  return (
    <div className="screen">
      <h1 className="screen-title">Appairage</h1>
      <p className="screen-sub">
        Sur le Mac : Réglages → Avancé → Appareils distants → Démarrer l'appairage.
        Entrez le code court ici. Le jeton long terme reste sur cet appareil.
      </p>
      <div className="card stack">
        <div className="field">
          <label htmlFor="gw">URL gateway</label>
          <input
            id="gw"
            value={p.gatewayUrl}
            onChange={(e) => p.onGatewayUrlChange(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            placeholder="http://127.0.0.1:18765"
          />
        </div>
        <div className="field">
          <label htmlFor="code">Code d'appairage</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCD2345"
            maxLength={12}
          />
        </div>
        <div className="field">
          <label htmlFor="name">Nom de l'appareil</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
          />
        </div>
        {p.error && (
          <div role="alert" style={{ color: "var(--status-error)", fontSize: "var(--fs-m)" }}>
            {p.error}
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={p.busy || code.trim().length < 4}
          onClick={() => void p.onPair(code, name)}
        >
          {p.busy ? "Appairage…" : "Appairer"}
        </button>
      </div>
    </div>
  );
}
