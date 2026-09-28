
  window.addEventListener("DOMContentLoaded", async function () {
    var query = new URLSearchParams(location.search);
    var path = query.get("path") || "";
    var displayPath = query.get("rel") || path;
    var base = query.get("base") || "";
    var token = query.get("token") || "";
    var nonce = (location.hash.match(/atelier_nonce=([\w-]+)/) || [])[1] || "";
    var host = (document.getElementById("diffHost") as HTMLDivElement);
    var pathLabel = (document.getElementById("filePath") as HTMLSpanElement);
    var layout = "unified";
    var overflow = "wrap";
    var renderer: { setOptions: (arg0: { diffStyle: string; overflow: string; themeType: string; }) => void; stats: { additions: number; deletions: number; }; } = null;
    var themeType = document.documentElement.style.colorScheme === "light" ? "light" : "dark";
    pathLabel.textContent = displayPath;
    pathLabel.title = path;

    function normalEditorUrl() {
      var ext = (path.split(".").pop() || "").toLowerCase();
      var editor = ext === "md" ? "code_editor.html" : "latex_studio.html";
      var next = new URL("/.fig_thumbs/" + editor, location.origin);
      next.searchParams.set("path", path);
      if (token) next.searchParams.set("token", token);
      if (nonce) next.hash = "atelier_nonce=" + nonce;
      return next.toString();
    }
    (document.getElementById("openFile") as HTMLButtonElement).onclick = function () { location.href = normalEditorUrl(); };

    function updateOptions() {
      if (innerWidth <= 720) layout = "unified";
      (document.getElementById("unifiedButton") as HTMLButtonElement).setAttribute("aria-pressed", String(layout === "unified"));
      (document.getElementById("splitButton") as HTMLButtonElement).setAttribute("aria-pressed", String(layout === "split"));
      (document.getElementById("wrapButton") as HTMLButtonElement).setAttribute("aria-pressed", String(overflow === "wrap"));
      (document.getElementById("wrapButton") as HTMLButtonElement).title = overflow === "wrap" ? "Disable line wrapping" : "Wrap long lines";
      if (renderer) renderer.setOptions({diffStyle: layout, overflow: overflow, themeType: themeType});
    }
    (document.getElementById("unifiedButton") as HTMLButtonElement).onclick = function () { layout = "unified"; updateOptions(); };
    (document.getElementById("splitButton") as HTMLButtonElement).onclick = function () { layout = "split"; updateOptions(); };
    (document.getElementById("wrapButton") as HTMLButtonElement).onclick = function () { overflow = overflow === "wrap" ? "scroll" : "wrap"; updateOptions(); };
    addEventListener("resize", updateOptions);
    addEventListener("atelier-theme-applied", function (event) {
      themeType = (event as CustomEvent).detail && (event as CustomEvent).detail.colorScheme === "light" ? "light" : "dark";
      updateOptions();
    });

    function jsonFetch(url: string|URL|Request) {
      return fetch(url).then(async function (response) {
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok || data.error) throw new Error(data.error || "Unable to load file");
        return data;
      });
    }
    try {
      if (!path) throw new Error("Missing file path");
      if (!base) throw new Error("Missing turn snapshot");
      var results = await Promise.allSettled([
        jsonFetch("/githead?path=" + encodeURIComponent(path) + "&base=" + encodeURIComponent(base)),
        jsonFetch("/code?path=" + encodeURIComponent(path))
      ]);
      var before = results[0].status === "fulfilled" && results[0].value.ok ? results[0].value.text : "";
      var after = results[1].status === "fulfilled" ? results[1].value.text : "";
      if (results[0].status === "rejected" && results[1].status === "rejected") throw results[1].reason;
      var name = path.split("/").pop() || path;
      renderer = AtelierCodeMirrorDiff.mount(host,
        {name: name, contents: before}, {name: name, contents: after},
        {diffStyle: layout, overflow: overflow, themeType: themeType});
      (document.getElementById("additions") as HTMLSpanElement).textContent = "+" + renderer.stats.additions;
      (document.getElementById("deletions") as HTMLSpanElement).textContent = "−" + renderer.stats.deletions;
      (document.getElementById("summary") as HTMLDivElement).textContent = "1 file changed · +" + renderer.stats.additions + " −" + renderer.stats.deletions;
      document.documentElement.dataset.diffReady = "true";
      updateOptions();
    } catch (error) {
      var errorState = document.createElement("div");
      errorState.className = "status error";
      errorState.textContent = String(error && error.message || error);
      host.replaceChildren(errorState);
      (document.getElementById("summary") as HTMLDivElement).textContent = "Diff unavailable";
      document.documentElement.dataset.diffReady = "error";
    }
  });
  