import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ASSISTANT_UI_VERSION = "0.15.18";

const SOURCE_IMPORT_OLD = `  type ForwardedRef,
  useCallback,
} from "react";`;
const SOURCE_IMPORT_NEW = `  type ForwardedRef,
  useCallback,
  useEffect,
  useRef,
} from "react";`;

const SOURCE_HOVER_OLD = `const useIsHoveringRef = () => {
  const aui = useAui();
  const message = useAuiState(() => aui.message);

  const callbackRef = useCallback(
    (el: HTMLElement) => {
      const handleMouseEnter = () => {
        message.setIsHovering(true);
      };
      const handleMouseLeave = () => {
        message.setIsHovering(false);
      };

      el.addEventListener("mouseenter", handleMouseEnter);
      el.addEventListener("mouseleave", handleMouseLeave);

      if (el.matches(":hover")) {
        // TODO this is needed for SSR to work, figure out why
        queueMicrotask(() => message.setIsHovering(true));
      }

      return () => {
        el.removeEventListener("mouseenter", handleMouseEnter);
        el.removeEventListener("mouseleave", handleMouseLeave);
        message.setIsHovering(false);
      };
    },
    [message],
  );

  return useManagedRef(callbackRef);
};`;

const SOURCE_HOVER_NEW = `const useIsHoveringRef = () => {
  const aui = useAui();
  const message = useAuiState(() => aui.message);
  const committedMessageRef = useRef<typeof message | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const callbackRef = useCallback(
    (el: HTMLElement) => {
      elementRef.current = el;
      const handleMouseEnter = () => {
        if (committedMessageRef.current === message) {
          message.setIsHovering(true);
        }
      };
      const handleMouseLeave = () => {
        if (committedMessageRef.current === message) {
          message.setIsHovering(false);
        }
      };

      el.addEventListener("mouseenter", handleMouseEnter);
      el.addEventListener("mouseleave", handleMouseLeave);

      // A ref can be replaced while the client remains committed. In that
      // case the effect below does not rerun, so synchronize this node here.
      if (committedMessageRef.current === message) {
        message.setIsHovering(el.matches(":hover"));
      }

      return () => {
        el.removeEventListener("mouseenter", handleMouseEnter);
        el.removeEventListener("mouseleave", handleMouseLeave);
        if (elementRef.current === el) elementRef.current = null;
      };
    },
    [message],
  );

  useEffect(() => {
    // AuiProvider's MountTapEffects commits tap before descendant effects.
    committedMessageRef.current = message;
    const el = elementRef.current;
    if (el) message.setIsHovering(el.matches(":hover"));

    return () => {
      // Do not dispatch during ref/passive cleanup: the tap fiber may already
      // be unmounted while React removes the DOM node.
      if (committedMessageRef.current === message) {
        committedMessageRef.current = null;
      }
    };
  }, [message]);

  return useManagedRef(callbackRef);
};`;

const DIST_IMPORT_OLD = `import { forwardRef } from "@assistant-ui/tap/react-shim";`;
const DIST_IMPORT_NEW =
  `import { forwardRef, useEffect, useRef } from "@assistant-ui/tap/react-shim";`;

const DIST_HOVER_OLD = `const useIsHoveringRef = () => {
\tconst $ = c(4);
\tconst aui = useAui();
\tlet t0;
\tif ($[0] !== aui.message) {
\t\tt0 = () => aui.message;
\t\t$[0] = aui.message;
\t\t$[1] = t0;
\t} else t0 = $[1];
\tconst message = useAuiState(t0);
\tlet t1;
\tif ($[2] !== message) {
\t\tt1 = (el) => {
\t\t\tconst handleMouseEnter = () => {
\t\t\t\tmessage.setIsHovering(true);
\t\t\t};
\t\t\tconst handleMouseLeave = () => {
\t\t\t\tmessage.setIsHovering(false);
\t\t\t};
\t\t\tel.addEventListener("mouseenter", handleMouseEnter);
\t\t\tel.addEventListener("mouseleave", handleMouseLeave);
\t\t\tif (el.matches(":hover")) queueMicrotask(() => message.setIsHovering(true));
\t\t\treturn () => {
\t\t\t\tel.removeEventListener("mouseenter", handleMouseEnter);
\t\t\t\tel.removeEventListener("mouseleave", handleMouseLeave);
\t\t\t\tmessage.setIsHovering(false);
\t\t\t};
\t\t};
\t\t$[2] = message;
\t\t$[3] = t1;
\t} else t1 = $[3];
\treturn useManagedRef(t1);
};`;

const DIST_HOVER_NEW = `const useIsHoveringRef = () => {
\tconst $ = c(4);
\tconst aui = useAui();
\tlet t0;
\tif ($[0] !== aui.message) {
\t\tt0 = () => aui.message;
\t\t$[0] = aui.message;
\t\t$[1] = t0;
\t} else t0 = $[1];
\tconst message = useAuiState(t0);
\tconst committedMessageRef = useRef(null);
\tconst elementRef = useRef(null);
\tlet t1;
\tif ($[2] !== message) {
\t\tt1 = (el) => {
\t\t\telementRef.current = el;
\t\t\tconst handleMouseEnter = () => {
\t\t\t\tif (committedMessageRef.current === message) message.setIsHovering(true);
\t\t\t};
\t\t\tconst handleMouseLeave = () => {
\t\t\t\tif (committedMessageRef.current === message) message.setIsHovering(false);
\t\t\t};
\t\t\tel.addEventListener("mouseenter", handleMouseEnter);
\t\t\tel.addEventListener("mouseleave", handleMouseLeave);
\t\t\tif (committedMessageRef.current === message) {
\t\t\t\tmessage.setIsHovering(el.matches(":hover"));
\t\t\t}
\t\t\treturn () => {
\t\t\t\tel.removeEventListener("mouseenter", handleMouseEnter);
\t\t\t\tel.removeEventListener("mouseleave", handleMouseLeave);
\t\t\t\tif (elementRef.current === el) elementRef.current = null;
\t\t\t};
\t\t};
\t\t$[2] = message;
\t\t$[3] = t1;
\t} else t1 = $[3];
\tuseEffect(() => {
\t\tcommittedMessageRef.current = message;
\t\tconst el = elementRef.current;
\t\tif (el) message.setIsHovering(el.matches(":hover"));
\t\treturn () => {
\t\t\tif (committedMessageRef.current === message) committedMessageRef.current = null;
\t\t};
\t}, [message]);
\treturn useManagedRef(t1);
};`;

const replaceOnce = (text, before, after, label) => {
  if (text.includes(after)) return { text, changed: false };
  const first = text.indexOf(before);
  if (first < 0 || first !== text.lastIndexOf(before)) {
    throw new Error(`assistant-ui hover patch: expected one ${label} block`);
  }
  return {
    text: text.slice(0, first) + after + text.slice(first + before.length),
    changed: true,
  };
};

const patchSource = (source) => {
  let result = replaceOnce(
    source,
    SOURCE_IMPORT_OLD,
    SOURCE_IMPORT_NEW,
    "source import",
  );
  result = replaceOnce(
    result.text,
    SOURCE_HOVER_OLD,
    SOURCE_HOVER_NEW,
    "source hover",
  );
  return { text: result.text, changed: result.changed };
};

const patchDist = (dist) => {
  let result = replaceOnce(
    dist,
    DIST_IMPORT_OLD,
    DIST_IMPORT_NEW,
    "dist import",
  );
  result = replaceOnce(
    result.text,
    DIST_HOVER_OLD,
    DIST_HOVER_NEW,
    "dist hover",
  );
  return { text: result.text, changed: result.changed };
};

const packageRootFrom = (projectRoot) =>
  path.join(projectRoot, "node_modules", "@assistant-ui", "react");

/** Apply the exact-version patch to a package root. */
export const applyAssistantUiHoverPatch = (packageRoot) => {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (packageJson.version !== ASSISTANT_UI_VERSION) {
    throw new Error(
      `assistant-ui hover patch supports @assistant-ui/react ${ASSISTANT_UI_VERSION}; found ${packageJson.version ?? "unknown"}`,
    );
  }

  const sourcePath = path.join(packageRoot, "src/primitives/message/MessageRoot.tsx");
  const distPath = path.join(packageRoot, "dist/primitives/message/MessageRoot.js");
  const sourceResult = patchSource(fs.readFileSync(sourcePath, "utf8"));
  const distResult = patchDist(fs.readFileSync(distPath, "utf8"));

  if (sourceResult.changed) fs.writeFileSync(sourcePath, sourceResult.text);
  if (distResult.changed) fs.writeFileSync(distPath, distResult.text);

  const mapPath = `${distPath}.map`;
  if (fs.existsSync(mapPath)) {
    const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    if (Array.isArray(map.sourcesContent)) {
      let mapChanged = false;
      map.sourcesContent = map.sourcesContent.map((content) => {
        if (typeof content !== "string" || !content.includes(SOURCE_HOVER_OLD)) {
          return content;
        }
        const result = patchSource(content);
        mapChanged ||= result.changed;
        return result.text;
      });
      if (mapChanged) {
        fs.writeFileSync(mapPath, `${JSON.stringify(map)}\n`);
      }
    }
  }

  return {
    changed: sourceResult.changed || distResult.changed,
    packageRoot,
  };
};

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const projectRoot = process.env.INIT_CWD || process.cwd();
  const packageRoot = packageRootFrom(projectRoot);
  const result = applyAssistantUiHoverPatch(packageRoot);
  if (result.changed) {
    console.log(`Patched @assistant-ui/react ${ASSISTANT_UI_VERSION} hover lifecycle.`);
  }
}
