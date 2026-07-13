import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { CheckIcon, CopyIcon } from "lucide-react";

type Props = {
  text: string;
  onCopy: () => void;
  copied: boolean;
};

export function DiagnosticsScreen(p: Props) {
  return (
    <div className="screen">
      <h1 className="screen-title">Diagnostics</h1>
      <Card>
        <CardHeader>
          <CardTitle>État technique</CardTitle>
          <CardDescription>
            Copiable sans secret : le jeton appareil n’apparaît jamais en clair.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="diag-pre" aria-label="Diagnostics">{p.text}</pre>
        </CardContent>
        <CardFooter>
          <Button type="button" variant="outline" onClick={p.onCopy}>
            {p.copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {p.copied ? "Copié" : "Copier"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
