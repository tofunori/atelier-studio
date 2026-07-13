import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { LinkIcon } from "lucide-react";

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
      <Card>
        <CardHeader>
          <CardTitle>Connecter ce téléphone</CardTitle>
          <CardDescription>
            Sur le Mac : Réglages → Avancé → Appareils distants → Démarrer l’appairage.
            Le jeton long terme reste sur cet appareil.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="gw">URL gateway</FieldLabel>
              <Input
            id="gw"
            value={p.gatewayUrl}
            onChange={(e) => p.onGatewayUrlChange(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            placeholder="http://127.0.0.1:18765"
          />
            </Field>
            <Field>
              <FieldLabel htmlFor="code">Code d'appairage</FieldLabel>
              <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCD2345"
            maxLength={12}
          />
            </Field>
            <Field>
              <FieldLabel htmlFor="name">Nom de l’appareil</FieldLabel>
              <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
          />
            </Field>
          </FieldGroup>
        </CardContent>
        {p.error && (
          <CardContent>
            <Alert variant="destructive"><AlertDescription>{p.error}</AlertDescription></Alert>
          </CardContent>
        )}
        <CardFooter>
          <Button
          type="button"
            className="w-full"
          disabled={p.busy || code.trim().length < 4}
          onClick={() => void p.onPair(code, name)}
        >
            {p.busy ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
          {p.busy ? "Appairage…" : "Appairer"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
