import type {StudioEditor} from "../../core/editor_contract";
import type {EditorWrapController} from "../../core/editor_wrap";

interface ParsedCsv {
  delimiter: string;
  width: number;
  rows: string[][];
}

export interface CsvToolkit {
  parse(source: string): ParsedCsv;
  classify(value: string): string;
  compare(left: string, right: string): number;
}

export interface CsvViewOptions {
  enabled: boolean;
  getEditor(): StudioEditor | null;
  wrap: EditorWrapController;
  toolkit: CsvToolkit;
  document?: Document;
  window?: Window;
  storage?: Pick<Storage, "getItem" | "setItem">;
  pageSize?: number;
}

export interface CsvViewController {
  mode(): "table" | "source";
  activate(): void;
  setMode(mode: "table" | "source"): void;
  render(resetLimit?: boolean): void;
  onDocumentChanged(): void;
}

interface CsvRow {
  cells: string[];
  index: number;
}

export function filterAndSortCsvRows(
  rows: string[][],
  query: string,
  sortColumn: number,
  sortDirection: number,
  compare: CsvToolkit["compare"],
): CsvRow[] {
  const normalized = query.trim().toLocaleLowerCase();
  let result = rows.slice(1).map((cells, index) => ({cells, index}));
  if (normalized) {
    result = result.filter((row) => row.cells.some((value) =>
      String(value).toLocaleLowerCase().includes(normalized)));
  }
  if (sortDirection && sortColumn >= 0) {
    result.sort((left, right) => sortDirection * (
      compare(left.cells[sortColumn] || "", right.cells[sortColumn] || "")
      || left.index - right.index
    ));
  }
  return result;
}

export function createCsvViewController(options: CsvViewOptions): CsvViewController {
  const doc = options.document || document;
  const win = options.window || window;
  const storage = options.storage || win.localStorage;
  const pageSize = options.pageSize || 750;
  const tools = doc.getElementById("csvTools") as HTMLElement;
  const view = doc.getElementById("csvView") as HTMLElement;
  const table = doc.getElementById("csvTable") as HTMLTableElement;
  const empty = doc.getElementById("csvEmpty") as HTMLElement;
  const tableButton = doc.getElementById("csvTableBtn") as HTMLButtonElement;
  const sourceButton = doc.getElementById("csvSourceBtn") as HTMLButtonElement;
  const search = doc.getElementById("csvSearch") as HTMLInputElement;
  const metadata = doc.getElementById("csvMeta") as HTMLElement;
  const more = doc.getElementById("csvMore") as HTMLButtonElement;
  const editorHost = doc.getElementById("ed") as HTMLElement;
  let currentMode: "table" | "source" = options.enabled
    && storage.getItem("csvViewMode") !== "source" ? "table" : "source";
  let parsed: ParsedCsv | null = null;
  let sortColumn = -1;
  let sortDirection = 0;
  let visibleRows = pageSize;
  let searchTimer: number | null = null;

  const renderCell = (cell: HTMLTableCellElement, value: string): void => {
    const kind = options.toolkit.classify(value);
    cell.className = `csv-${kind}`;
    cell.title = value;
    if (kind === "empty") {
      cell.textContent = "·";
    } else if (kind === "boolean") {
      const badge = doc.createElement("span");
      badge.className = `csvBool ${value.toLowerCase() === "true" ? "true" : "false"}`;
      badge.textContent = value.toUpperCase();
      cell.appendChild(badge);
    } else if (kind === "color") {
      const swatch = doc.createElement("span");
      swatch.className = "csvSwatch";
      swatch.style.background = value;
      cell.append(swatch, value);
    } else cell.textContent = value;
  };

  const render = (resetLimit = false): void => {
    const editor = options.getEditor();
    if (!options.enabled || !editor) return;
    if (resetLimit) visibleRows = pageSize;
    parsed = options.toolkit.parse(editor.getValue());
    const head = table.tHead;
    const body = table.tBodies[0];
    if (!head || !body) return;
    head.replaceChildren();
    body.replaceChildren();
    const headers = parsed.rows[0] || [];
    const allRows = filterAndSortCsvRows(
      parsed.rows, search.value, sortColumn, sortDirection, options.toolkit.compare,
    );
    const shown = allRows.slice(0, visibleRows);
    empty.style.display = headers.length ? "none" : "block";
    table.style.display = headers.length ? "table" : "none";
    if (headers.length) {
      const row = doc.createElement("tr");
      const corner = doc.createElement("th");
      corner.className = "csvIndex";
      corner.textContent = "#";
      row.appendChild(corner);
      headers.forEach((value, index) => {
        const header = doc.createElement("th");
        header.scope = "col";
        header.title = value || `Colonne ${index + 1}`;
        header.append(value || `Colonne ${index + 1}`);
        if (index === sortColumn && sortDirection) {
          const mark = doc.createElement("span");
          mark.className = "csvSort";
          mark.textContent = sortDirection > 0 ? "▲" : "▼";
          header.appendChild(mark);
        }
        header.onclick = () => {
          if (sortColumn !== index) {
            sortColumn = index;
            sortDirection = 1;
          } else sortDirection = sortDirection === 1 ? -1 : sortDirection === -1 ? 0 : 1;
          render(false);
        };
        row.appendChild(header);
      });
      head.appendChild(row);
    }
    const fragment = doc.createDocumentFragment();
    shown.forEach((item) => {
      const row = doc.createElement("tr");
      const index = doc.createElement("td");
      index.className = "csvIndex";
      index.textContent = String(item.index + 2);
      row.appendChild(index);
      item.cells.forEach((value) => {
        const cell = doc.createElement("td");
        renderCell(cell, value);
        row.appendChild(cell);
      });
      fragment.appendChild(row);
    });
    body.appendChild(fragment);
    const delimiter = parsed.delimiter === "\t" ? "tab" : parsed.delimiter;
    metadata.textContent = `${allRows.length.toLocaleString()} lignes × ${parsed.width} colonnes · séparateur ${delimiter}`;
    more.style.display = allRows.length > shown.length ? "block" : "none";
    more.textContent = `Afficher ${Math.min(pageSize, allRows.length - shown.length).toLocaleString()} lignes de plus`;
  };

  const setMode = (mode: "table" | "source"): void => {
    if (!options.enabled) return;
    currentMode = mode === "source" ? "source" : "table";
    storage.setItem("csvViewMode", currentMode);
    const tableMode = currentMode === "table";
    tableButton.setAttribute("aria-pressed", String(tableMode));
    sourceButton.setAttribute("aria-pressed", String(!tableMode));
    search.style.display = tableMode ? "" : "none";
    metadata.style.display = tableMode ? "" : "none";
    editorHost.style.display = tableMode ? "none" : "flex";
    view.classList.toggle("show", tableMode);
    options.wrap.setControlVisible(!tableMode);
    if (tableMode) render(true);
    else win.setTimeout(() => options.getEditor()?.refresh(), 0);
  };

  if (options.enabled) {
    tools.classList.add("show");
    tableButton.onclick = () => setMode("table");
    sourceButton.onclick = () => setMode("source");
    search.oninput = () => {
      if (searchTimer !== null) win.clearTimeout(searchTimer);
      searchTimer = win.setTimeout(() => render(true), 100);
    };
    more.onclick = () => {
      visibleRows += pageSize;
      render(false);
    };
  }
  return {
    mode: () => currentMode,
    activate: () => setMode(currentMode),
    setMode,
    render,
    onDocumentChanged: () => {
      if (options.enabled && currentMode === "table") render(true);
    },
  };
}
