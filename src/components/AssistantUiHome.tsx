import type { ResearchHomeBundle } from "./ResearchHome";
import { t } from "../lib/i18n";
import { ThreadWelcome } from "./assistant-ui/elements/thread.aui";
import { Button } from "./assistant-ui/primitives/button";
import { FileTextIcon, FolderOpenIcon, HistoryIcon, SearchIcon } from "lucide-react";

/** Native navigation callbacks inside the official thread's Welcome slot. */
export function AssistantUiHome({ home }: { home: ResearchHomeBundle }) {
  const { model, actions } = home;
  if (model.state === "no-project") {
    return <div data-slot="assistant-ui-home" className="tw:flex tw:flex-col tw:items-center tw:gap-3">
      <ThreadWelcome title={t("home.no-project-title")} />
      <Button variant="ghost" onClick={actions.onOpenProject}><FolderOpenIcon />{t("action.open-project")}</Button>
    </div>;
  }
  const continued = model.continueItem;
  return <div data-slot="assistant-ui-home" className="tw:mx-auto tw:flex tw:w-full tw:max-w-xl tw:flex-col tw:gap-4 tw:px-4">
    <ThreadWelcome title={model.projectName} />
    <div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-2">
      <Button variant="ghost" onClick={actions.onNewChat}>{t("home.start")}</Button>
      <Button variant="ghost" onClick={actions.onOpenGallery}><FolderOpenIcon />{t("home.open-gallery")}</Button>
      <Button variant="ghost" onClick={actions.onOpenPalette}><SearchIcon />{t("home.search-file")}</Button>
      <Button variant="ghost" onClick={actions.onResumeSession}><HistoryIcon />{t("action.resume-session")}</Button>
    </div>
    {continued && <Button variant="ghost" className="tw:h-auto tw:justify-start tw:whitespace-normal tw:text-left" onClick={() => actions.onResume(continued.threadId, continued.projectRoot)}>
      <HistoryIcon />{t("home.resume")} · {continued.title}
    </Button>}
    {model.artefacts.length > 0 && <section aria-label={t("home.artefacts")} className="tw:flex tw:flex-col tw:gap-1">
      <p className="tw:px-3 tw:text-xs tw:text-muted-foreground">{t("home.artefacts")}</p>
      {model.artefacts.map(file => <Button key={file.rel} variant="ghost" className="tw:justify-start" title={file.rel} onClick={() => actions.onOpenArtefact(file.rel)}>
        <FileTextIcon /><span className="tw:truncate">{file.name}</span>
      </Button>)}
    </section>}
  </div>;
}
