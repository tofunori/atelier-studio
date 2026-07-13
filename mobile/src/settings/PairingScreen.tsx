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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { ChevronDownIcon, LinkIcon } from "lucide-react";

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
      <h1 className="screen-title">Connecter au Mac</h1>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Code de connexion</CardTitle>
          <CardDescription>
            Dans Atelier sur le Mac, ouvrez Réglages → Appareils distants, puis choisissez « Connecter un iPhone ».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="code">Code affiché sur le Mac</FieldLabel>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoComplete="one-time-code"
                autoCorrect="off"
                spellCheck={false}
                placeholder="ABCD2345"
                maxLength={12}
                className="font-mono uppercase tracking-widest"
              />
            </Field>
            <Collapsible>
              <CollapsibleTrigger
                render={<Button type="button" variant="ghost" size="sm" className="w-full justify-between" />}
              >
                Options avancées
                <ChevronDownIcon data-icon="inline-end" className="transition-transform in-aria-expanded:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="gw">Adresse du Mac</FieldLabel>
                    <Input
                      id="gw"
                      value={p.gatewayUrl}
                      onChange={(e) => p.onGatewayUrlChange(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="url"
                      placeholder="https://mon-mac.ts.net:8443"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="name">Nom de l’appareil</FieldLabel>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
                  </Field>
                </FieldGroup>
              </CollapsibleContent>
            </Collapsible>
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
          {p.busy ? "Connexion…" : "Connecter l’iPhone"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
