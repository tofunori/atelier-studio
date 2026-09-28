
const codeMore = (document.getElementById("codeMore") as HTMLDetailsElement);
codeMore.addEventListener("toggle", () => codeMore.querySelector<HTMLElement>("summary").setAttribute("aria-expanded", String(codeMore.open)));
document.addEventListener("pointerdown", event => { if(!codeMore.contains(event.target as Node)) codeMore.open = false; });
codeMore.addEventListener("keydown", event => {
  if(event.key === "Escape" && codeMore.open){ event.preventDefault(); event.stopPropagation(); codeMore.open = false; codeMore.querySelector<HTMLElement>("summary").focus(); }
});
