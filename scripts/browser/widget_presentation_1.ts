
(function () {
  var failed = false;
  function reportError(event: Event & {message?: string}) {
    // A deferred ResizeObserver delivery is a browser scheduling notice, not
    // an exception from the widget's interaction code.
    if (event && (event.message === "ResizeObserver loop completed with undelivered notifications." ||
        event.message === "ResizeObserver loop limit exceeded")) return;
    if (failed) return;
    failed = true;
    // No stack or user data crosses the boundary; the source view remains available.
    parent.postMessage({ source: "atelier-widget", type: "error" }, "*");
  }
  window.addEventListener("error", reportError);
  window.addEventListener("unhandledrejection", reportError);
  var scheduled = false;
  var lastHeight = -1;
  var lastViewportHeight = -1;
  var lastWidth = -1;
  function scheduleMeasure() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      // documentElement.scrollHeight is at least the viewport height: using it
      // would prevent a panel from shrinking after content is collapsed.
      var height = Math.ceil(document.body.getBoundingClientRect().height);
      var viewportHeight = window.innerHeight;
      var width = window.innerWidth;
      // Legacy fragments may contain 100vh children. A host height change
      // that produces the same content-height delta is feedback, not growth.
      var feedback = lastHeight > 0 && width === lastWidth &&
        viewportHeight !== lastViewportHeight &&
        Math.abs((height - lastHeight) - (viewportHeight - lastViewportHeight)) <= 1;
      var changed = Math.abs(height - lastHeight) > 1;
      lastHeight = height;
      lastViewportHeight = viewportHeight;
      lastWidth = width;
      if (height > 0 && changed && !feedback) {
        parent.postMessage({ source: "atelier-widget", type: "resize", height: height }, "*");
      }
    });
  }
  window.addEventListener("DOMContentLoaded", function () {
    new ResizeObserver(scheduleMeasure).observe(document.body);
    scheduleMeasure();
  });
  window.addEventListener("resize", scheduleMeasure);
  window.addEventListener("message", function (event) {
    if (event.source === parent && event.data && event.data.source === "atelier-host") scheduleMeasure();
  });
})();
