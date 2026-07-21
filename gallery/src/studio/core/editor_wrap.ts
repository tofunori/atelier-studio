import type {StudioEditor} from "./editor_contract";

export interface EditorWrapOptions {
  getEditor(): StudioEditor | null;
  select?: HTMLSelectElement | null;
  customInput?: HTMLInputElement | null;
  storage?: Pick<Storage, "getItem" | "setItem">;
  document?: Document;
  window?: Window;
  storageKey?: string;
  defaultValue?: string;
}

export interface EditorWrapController {
  current(): string;
  apply(value: string): void;
  refresh(): void;
  setControlVisible(visible: boolean): void;
}

export function createEditorWrapController(options: EditorWrapOptions): EditorWrapController {
  const doc = options.document || document;
  const win = options.window || window;
  const storage = options.storage || win.localStorage;
  const storageKey = options.storageKey || "cmWrap";
  const defaultValue = options.defaultValue || "win";
  const select = options.select || null;
  const customInput = options.customInput || null;
  const current = (): string => storage.getItem(storageKey) || defaultValue;
  const hasOption = (value: string): boolean => Boolean(select
    && Array.from(select.options).some((option) => option.value === value));
  const ensureOption = (value: string): void => {
    if (!select || !/^\d+$/.test(value) || hasOption(value)) return;
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = `Wrap: ${value}`;
    const customOption = Array.from(select.options).find((item) => item.value === "custom");
    select.insertBefore(option, customOption || null);
  };
  const apply = (value: string): void => {
    storage.setItem(storageKey, value);
    const fixed = /^\d+$/.test(value);
    const editor = options.getEditor();
    if (editor) {
      const wrapper = editor.getWrapperElement();
      wrapper.style.maxWidth = fixed ? `calc(${value}ch + 70px)` : "";
      wrapper.style.borderRight = fixed ? "1px solid #33384a" : "";
      editor.setOption("lineWrapping", value !== "off");
      editor.refresh();
    }
    if (select) {
      ensureOption(value);
      select.value = hasOption(value) ? value : defaultValue;
    }
  };
  const closeCustom = (): void => {
    if (!select || !customInput) return;
    customInput.style.display = "none";
    select.style.display = "";
  };
  const commitCustom = (): void => {
    if (!select || !customInput) return;
    closeCustom();
    const numeric = Number.parseInt(customInput.value, 10);
    if (numeric > 0) apply(String(numeric));
    else select.value = current();
  };
  if (select) {
    ensureOption(current());
    select.value = hasOption(current()) ? current() : defaultValue;
    select.onchange = () => {
      if (select.value !== "custom" || !customInput) {
        apply(select.value);
        return;
      }
      select.style.display = "none";
      customInput.style.display = "";
      customInput.value = /^\d+$/.test(current()) ? current() : "";
      customInput.focus();
      customInput.select();
    };
  }
  if (customInput && select) {
    customInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") commitCustom();
      else if (event.key === "Escape") {
        closeCustom();
        select.value = hasOption(current()) ? current() : defaultValue;
      }
    });
    customInput.addEventListener("blur", commitCustom);
  }
  return {
    current,
    apply,
    refresh: () => apply(current()),
    setControlVisible: (visible: boolean) => {
      if (select) select.style.display = visible ? "" : "none";
      if (!visible && customInput) customInput.style.display = "none";
    },
  };
}
