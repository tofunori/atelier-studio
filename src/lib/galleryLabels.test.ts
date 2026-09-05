import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const template = readFileSync(join(__dirname, "../../gallery/assets/gallery_template.html"), "utf8");
const escapeSource = template.match(/^function esc\(s\).+$/m)![0];
const labelSource = template.match(/function fileNameLabel\(name\)\{[\s\S]*?\n\}/)![0];
// Exercise the template's actual renderer, including its escaping, in jsdom.
const renderName = new Function(`${escapeSource}\n${labelSource}\nreturn fileNameLabel;`)() as (name: string) => string;

describe("gallery filenames", () => {
  it.each([
    "bayes_REGION_C_student_t_vs_normal.png",
    "évolution_albédo_glacier_sensibilité_finale.pdf",
    "a.txt",
    "README",
    "<img src=x onerror=alert(1)>_final.svg",
  ])("preserves the full name and extension without creating markup: %s", (name) => {
    const label = document.createElement("div");
    label.innerHTML = renderName(name);
    expect(label.textContent).toBe(name);
    expect(label.querySelector("img")).toBeNull();
    if (name.includes(".")) expect(label.querySelector(".nm-ext")?.textContent).toBe(name.slice(name.lastIndexOf(".")));
  });
});
