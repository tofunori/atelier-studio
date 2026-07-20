import { AlertCircleIcon, ChevronRightIcon, FileTextIcon, SparklesIcon } from "lucide-react";
import { t } from "../../lib/i18n";
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
  const disabled = !commitMsg.trim() || stagedCount === 0 || commitBusy || generating;
  const hasCommitDetails = Boolean(commitMsg.trim() || commitDescription.trim());
  const statusText = commitError
    ?? (generating
      ? t("git.generation-note")
      : syncNote || (stagedCount > 0 ? t("git.commit-scope-staged") : t("git.commit-scope-required")));
  const generateLabel = generating
    ? t("git.generating-ai")
    : hasCommitDetails
      ? t("git.regenerate-ai")
      : t("git.generate-ai");

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
            ? t("git.ready-stage-required")
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
              readOnly={generating || commitBusy}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                className="git-generate-btn"
                aria-busy={generating || undefined}
                aria-label={generateLabel}
                title={generateLabel}
                disabled={!generationScope || generating || commitBusy}
                onClick={controller.generateCommitMessage}
              >
                {generating
                  ? <Spinner data-icon="inline-start" aria-hidden role={undefined} aria-label={undefined} />
                  : <SparklesIcon data-icon="inline-start" />}
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
                readOnly={generating || commitBusy}
              />
            </Field>
          </CollapsibleContent>
        </Collapsible>
      </FieldGroup>

      <div className="git-commit-actions">
        <span
          className={`git-commit-status${commitError ? " is-error" : ""}`}
          role={commitError ? "alert" : "status"}
          aria-live={commitError ? "assertive" : "polite"}
        >
          {commitError && <AlertCircleIcon aria-hidden="true" />}
          <span>{statusText}</span>
        </span>
        <span className="git-commit-buttons">
          <Button
            variant="primary"
            type="submit"
            loading={commitBusy && !commitAndPush}
            disabled={disabled}
            aria-label={t("git.commit-branch", { branch: status?.branch ?? t("git.branch-fallback") })}
            title={t("git.commit-branch", { branch: status?.branch ?? t("git.branch-fallback") })}
          >
            {t("action.commit")}
          </Button>
          <Button variant="secondary" loading={commitBusy && commitAndPush} disabled={disabled} onClick={() => controller.createCommit(true)}>
            {t("git.commit-push")}
          </Button>
        </span>
      </div>
    </form>
  );
}
