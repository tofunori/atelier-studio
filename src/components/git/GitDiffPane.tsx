import { lazy, Suspense } from "react";
import { Columns2Icon, EyeIcon, FileTextIcon, Rows3Icon } from "lucide-react";
import { t } from "../../lib/i18n";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../shadcn/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../shadcn/sheet";
import { Skeleton } from "../shadcn/skeleton";
import { Button } from "../ui/Button";
import { SegmentedControl } from "../ui/SegmentedControl";
import { diffClass } from "./gitSurfaceModel";
import type { GitSurfaceController } from "./useGitSurfaceController";

const AtelierDiffView = lazy(() => import("../AtelierDiffView"));

function DiffEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <Empty className="git-diff-empty">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileTextIcon /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

function DiffLoading() {
  return (
    <div className="git-diff-loading" role="status" aria-label={t("git.diff-loading")}>
      <Skeleton className="tw:h-4 tw:w-2/5" />
      <Skeleton className="tw:h-4 tw:w-4/5" />
      <Skeleton className="tw:h-4 tw:w-3/5" />
      <Skeleton className="tw:h-4 tw:w-11/12" />
    </div>
  );
}

function DiffBody({ controller }: { controller: GitSurfaceController }) {
  const { selected, diffLoading, diff, diffContents, splitView } = controller;
  if (!selected) return <DiffEmpty title={t("git.select-file")} description={t("git.select-file-help")} />;
  if (diffLoading) return <DiffLoading />;
  if (!diff && !diffContents) return <DiffEmpty title={t("git.diff-empty")} />;
  if (diffContents?.binary) return <DiffEmpty title={t("git.binary-changed")} />;
  if (diffContents) {
    return (
      <Suspense fallback={<DiffLoading />}>
        <AtelierDiffView
          before={diffContents.before}
          after={diffContents.after}
          path={selected.path}
          layout={splitView ? "split" : "unified"}
        />
      </Suspense>
    );
  }
  return (
    <pre className="git-diff git-diff-pane-content">
      {diff.split("\n").map((line, index) => (
        <span key={`${index}-${line}`} className={diffClass(line)}>{line || " "}</span>
      ))}
    </pre>
  );
}

function DiffHeader({ controller }: { controller: GitSurfaceController }) {
  return (
    <div className="git-diff-pane-head">
      <span className="git-diff-path">{controller.selected?.path ?? t("git.select-file")}</span>
      <SegmentedControl
        label={t("git.diff-view")}
        value={controller.splitView ? "split" : "unified"}
        onChange={(value) => controller.setSplitView(value === "split")}
        options={[
          {
            value: "unified",
            label: <Rows3Icon aria-hidden="true" />,
            ariaLabel: t("git.unified"),
            title: t("git.unified"),
          },
          {
            value: "split",
            label: <Columns2Icon aria-hidden="true" />,
            ariaLabel: t("git.split"),
            title: t("git.split"),
          },
        ]}
      />
    </div>
  );
}

export function GitDiffPane({ controller }: { controller: GitSurfaceController }) {
  return (
    <section className="git-diff-pane" aria-label={t("git.diff-pane")}>
      <DiffHeader controller={controller} />
      <div className="git-diff-pane-body"><DiffBody controller={controller} /></div>
    </section>
  );
}

export function GitMobileDiffSheet({ controller }: { controller: GitSurfaceController }) {
  return (
    <Sheet>
      <SheetTrigger
        disabled={!controller.selected}
        render={
          <Button variant="secondary" className="git-mobile-diff-trigger">
            <EyeIcon data-icon="inline-start" />
            {t("git.inspect-diff")}
          </Button>
        }
      />
      <SheetContent side="right" className="git-diff-sheet tw:w-[min(94vw,760px)] tw:max-w-none tw:gap-0">
        <SheetHeader className="tw:sr-only">
          <SheetTitle>{t("git.diff-pane")}</SheetTitle>
          <SheetDescription>{controller.selected?.path ?? t("git.select-file")}</SheetDescription>
        </SheetHeader>
        <DiffHeader controller={controller} />
        <div className="git-diff-pane-body"><DiffBody controller={controller} /></div>
      </SheetContent>
    </Sheet>
  );
}
