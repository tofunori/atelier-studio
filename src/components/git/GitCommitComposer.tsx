import { AlertCircleIcon, ChevronRightIcon, FileTextIcon, SparklesIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import { Alert, AlertDescription } from "../shadcn/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../shadcn/collapsible";
import { Field, FieldGroup, FieldLabel } from "../shadcn/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../shadcn/input-group";
import { Spinner } from "../shadcn/spinner";
import { Textarea } from "../shadcn/textarea";
import { Button } from "../ui/Button";
import type { GitSurfaceController } from "./useGitSurfaceController";

export function GitCommitComposer({ controller }: { controller: GitSurfaceController }) {
  const {
    stagedCount,
    files,
    status,
    commitMsg,
    commitDescription,
    generationScope,
    generating,
    commitBusy,
    commitAndPush,
    showDescription,
    syncNote,
    commitError,
  } = controller;
  const disabled = !commitMsg.trim() || files.length === 0 || commitBusy || generating;

  return (
    <form className="git-commit-zone" onSubmit={(event) => {
      event.preventDefault();
      controller.createCommit(false);
    }}>
      <div className="git-commit-ready">
        <FileTextIcon />
        {stagedCount > 0
          ? t("git.ready-n", { n: stagedCount, plural: stagedCount > 1 ? "s" : "" })
          : files.length > 0
            ? t("git.ready-auto", { n: files.length, plural: files.length > 1 ? "s" : "" })
            : t("git.ready-n", { n: 0, plural: "" })}
      </div>

      <FieldGroup className="git-commit-fields">
        <Field>
          <FieldLabel className="tw:sr-only" htmlFor="git-commit-summary">{t("git.commit-placeholder")}</FieldLabel>
          <InputGroup className="git-summary-group">
            <InputGroupInput
              ref={controller.commitInputRef}
              id="git-commit-summary"
              className="git-commit-input"
              value={commitMsg}
              onChange={(event) => controller.editCommitMessage(event.target.value)}
              placeholder={t("git.commit-placeholder")}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                className="git-generate-btn"
                aria-busy={generating || undefined}
                disabled={!generationScope || generating || commitBusy}
                onClick={controller.generateCommitMessage}
              >
                {generating
                  ? <Spinner data-icon="inline-start" aria-hidden role={undefined} aria-label={undefined} />
                  : <SparklesIcon data-icon="inline-start" />}
                {generating ? t("git.generating-ai") : t("git.generate-ai")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>

        <Collapsible open={showDescription} onOpenChange={controller.setShowDescription}>
          <CollapsibleTrigger render={
            <Button variant="ghost" className="git-description-toggle">
              <ChevronRightIcon data-icon="inline-start" className={showDescription ? "git-chev-open" : ""} />
              {showDescription ? t("git.hide-description") : t("git.add-description")}
            </Button>
          } />
          <CollapsibleContent>
            <Field className="git-description-field">
              <FieldLabel className="tw:sr-only" htmlFor="git-commit-description">{t("git.description-placeholder")}</FieldLabel>
              <Textarea
                id="git-commit-description"
                className="git-commit-description"
                value={commitDescription}
                onChange={(event) => controller.setCommitDescription(event.target.value)}
                placeholder={t("git.description-placeholder")}
              />
            </Field>
          </CollapsibleContent>
        </Collapsible>
      </FieldGroup>

      {generating && <div className="git-generation-note" role="status" aria-live="polite">{t("git.generation-note")}</div>}

      <div className="git-commit-actions">
        <span className="git-commit-scope">
          {stagedCount > 0 ? t("git.commit-scope-staged") : t("git.commit-scope-all")}
        </span>
        <span className="git-commit-buttons">
          <Button variant="primary" type="submit" loading={commitBusy && !commitAndPush} disabled={disabled}>
            {t("git.commit-branch", { branch: status?.branch ?? t("git.branch-fallback") })}
          </Button>
          <Button variant="secondary" loading={commitBusy && commitAndPush} disabled={disabled} onClick={() => controller.createCommit(true)}>
            {t("git.commit-push")}
          </Button>
        </span>
      </div>

      {syncNote && <div className="git-syncnote" role="status">{syncNote}</div>}
      {commitError && (
        <Alert variant="destructive" className="git-commit-error">
          <AlertCircleIcon />
          <AlertDescription>{commitError}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
