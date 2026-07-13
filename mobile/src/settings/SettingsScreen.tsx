import { useState } from "react";
import type { ConnectionPhase, DeviceCredentials } from "../transport/types.ts";
import {
  ensureNotificationPermission,
  loadNotifPrefs,
  saveNotifPrefs,
  type NotificationPrefs,
} from "../native/notifications.ts";
import { getBadgeCount, clearBadge } from "../native/badge.ts";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardAction,
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
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { BellIcon, ChevronDownIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";

type Props = {
  phase: ConnectionPhase;
  credentials: DeviceCredentials | null;
  gatewayUrl: string;
  onOpenPairing: () => void;
  onOpenDiagnostics: () => void;
  onRevokeLocal: () => void;
  onRefresh: () => void;
};

export function SettingsScreen(p: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotifPrefs());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [badgeCount, setBadgeCount] = useState(() => getBadgeCount());
  const connection = connectionLabel(p.phase);

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveNotifPrefs(next);
  };

  const enableNotifs = async () => {
    setBusy(true);
    setMsg(null);
    // Permission only on first enable (contextual need)
    const perm = await ensureNotificationPermission();
    if (perm === "granted") {
      update({ enabled: true, permission: perm });
      setMsg("Notifications activées");
    } else if (perm === "unsupported") {
      update({ enabled: false, permission: perm });
      setMsg("Notifications non supportées sur cette plateforme");
    } else {
      update({ enabled: false, permission: perm });
      setMsg("Permission refusée — activez-la dans Réglages iOS");
    }
    setBusy(false);
  };

  return (
    <div className="screen">
      <h1 className="screen-title">Réglages</h1>
      <p className="screen-sub">Connexion, notifications et confidentialité.</p>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Mac Atelier</CardTitle>
          <CardDescription>{p.credentials?.name ?? "Aucun Mac connecté"}</CardDescription>
          <CardAction>
            <Badge variant={connection.ready ? "default" : "secondary"}>{connection.label}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{connection.detail}</p>
          <Collapsible>
            <CollapsibleTrigger
              render={<Button type="button" variant="ghost" size="sm" className="w-full justify-between" />}
            >
              Détails techniques
              <ChevronDownIcon data-icon="inline-end" className="transition-transform in-aria-expanded:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <FieldGroup className="gap-3">
                <Field>
                  <FieldTitle>Adresse</FieldTitle>
                  <FieldDescription className="break-all">
                    {p.credentials?.gatewayBaseUrl ?? p.gatewayUrl}
                  </FieldDescription>
                </Field>
                {p.credentials && (
                  <Field>
                    <FieldTitle>Identifiant de l’iPhone</FieldTitle>
                    <FieldDescription className="break-all">{p.credentials.deviceId}</FieldDescription>
                  </Field>
                )}
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={p.onRefresh}>
            <RefreshCwIcon data-icon="inline-start" />
            Rafraîchir
          </Button>
          <Button type="button" variant={p.credentials ? "outline" : "default"} size="sm" onClick={p.onOpenPairing}>
            {p.credentials ? "Reconnecter" : "Connecter"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={p.onOpenDiagnostics}>
            Diagnostics
          </Button>
          {p.credentials && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                <UnplugIcon data-icon="inline-start" />
                Oublier
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Oublier cet appareil ?</AlertDialogTitle>
                  <AlertDialogDescription>Une nouvelle procédure d’appairage sera nécessaire pour reconnecter l’iPhone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={p.onRevokeLocal}>Oublier</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardFooter>
      </Card>

      <Card size="sm" className="mt-4">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Contenu minimal sur l’écran verrouillé, sans prompt ni données scientifiques.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        {!prefs.enabled ? (
            <Button type="button" disabled={busy} onClick={() => void enableNotifs()}>
              {busy ? <Spinner data-icon="inline-start" /> : <BellIcon data-icon="inline-start" />}
              {busy ? "Activation…" : "Activer les notifications"}
            </Button>
        ) : (
            <Button
            type="button"
              variant="outline"
            onClick={() => update({ enabled: false })}
          >
            Désactiver
            </Button>
        )}
          <FieldSet>
            <FieldLegend variant="label">M’avertir lorsque</FieldLegend>
            <FieldGroup className="gap-3">
              <NotificationOption id="notif-done" label="Tour terminé" checked={prefs.onDone} disabled={!prefs.enabled} onChange={(checked) => update({ onDone: checked })} />
              <NotificationOption id="notif-error" label="Erreur" checked={prefs.onError} disabled={!prefs.enabled} onChange={(checked) => update({ onError: checked })} />
              <NotificationOption id="notif-interaction" label="Action requise" checked={prefs.onInteraction} disabled={!prefs.enabled} onChange={(checked) => update({ onInteraction: checked })} />
              <NotificationOption id="notif-title" label="Afficher le titre du fil" description="Jamais le prompt." checked={prefs.showThreadTitle} disabled={!prefs.enabled} onChange={(checked) => update({ showThreadTitle: checked })} />
            </FieldGroup>
          </FieldSet>
          {msg && <Alert role="status"><AlertDescription>{msg}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <span className="text-sm text-muted-foreground">Badge : {badgeCount}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => { clearBadge(); setBadgeCount(0); }}>
            Réinitialiser
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function connectionLabel(phase: ConnectionPhase): { label: string; detail: string; ready: boolean } {
  switch (phase) {
    case "ready":
      return { label: "Connecté", detail: "Les chats et les fichiers sont synchronisés avec le Mac.", ready: true };
    case "connecting":
      return { label: "Connexion…", detail: "Atelier cherche le Mac et rétablit la session.", ready: false };
    case "offline":
      return { label: "Hors ligne", detail: "Le Mac est indisponible. La reconnexion sera automatique.", ready: false };
    case "tailscale_missing":
      return { label: "Tailscale requis", detail: "Ouvrez Tailscale sur l’iPhone pour joindre le Mac.", ready: false };
    case "auth_expired":
      return { label: "À reconnecter", detail: "L’autorisation a expiré. Reconnectez cet iPhone au Mac.", ready: false };
    case "version_incompatible":
      return { label: "Mise à jour requise", detail: "L’app iOS et Atelier Mac doivent être mis à jour.", ready: false };
    default:
      return { label: "Non connecté", detail: "Connectez cet iPhone une seule fois à Atelier sur le Mac.", ready: false };
  }
}

function NotificationOption(p: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal" data-disabled={p.disabled || undefined}>
      <Checkbox
        id={p.id}
        checked={p.checked}
        disabled={p.disabled}
        onCheckedChange={p.onChange}
      />
      <FieldContent>
        <FieldLabel htmlFor={p.id}>{p.label}</FieldLabel>
        {p.description && <FieldDescription>{p.description}</FieldDescription>}
      </FieldContent>
    </Field>
  );
}
