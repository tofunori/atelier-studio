(function(){
    var token: string = null;
    try { token = new URLSearchParams(location.search).get("token"); } catch (_) {}
    if (!token) return;
    var originalFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      try {
        var url = new URL(typeof input === "string" ? input : (input as Request).url, location.href);
        if (url.origin === location.origin && !url.searchParams.has("token")) {
          url.searchParams.set("token", token);
          input = typeof input === "string" ? url.pathname + url.search : new Request(url, input as Request);
        }
      } catch (_) {}
      return originalFetch(input, init);
    };
  })();