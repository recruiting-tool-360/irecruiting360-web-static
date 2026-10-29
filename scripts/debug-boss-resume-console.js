(async () => {
  const WAIT_MS = 8000;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const CANVAS_SELECTOR = "div#resume canvas#resume, canvas#resume";
  const ROOT_SELECTOR =
    ".lib-standard-resume.with-right-side, .lib-standard-resume, div#resume";
  const visible = (el) => {
    const rect = el?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0;
  };
  const scan = () => {
    const docs = [];
    const walk = (doc, path, depth) => {
      docs.push({ doc, path, depth });
      if (depth >= 8) return;
      for (const frame of doc.querySelectorAll("iframe")) {
        try {
          if (frame.contentDocument) {
            walk(frame.contentDocument, `${path} > ${frame.src}`, depth + 1);
          }
        } catch {}
      }
    };
    walk(document, "mainFrame", 0);
    return docs;
  };

  let docs = scan();
  const startedAt = Date.now();
  while (!docs.some(({ doc }) => doc.querySelector(`${CANVAS_SELECTOR}, ${ROOT_SELECTOR}`)) &&
         Date.now() - startedAt < WAIT_MS) {
    await sleep(250);
    docs = scan();
  }

  const iframes = docs.flatMap(({ doc, path }) =>
    [...doc.querySelectorAll("iframe")].map((frame) => ({
      parentFrame: path,
      src: frame.src,
      styleHeight: frame.style.height,
      rectHeight: Math.round(frame.getBoundingClientRect().height),
      clientHeight: frame.clientHeight,
      scrollHeight: frame.scrollHeight,
      contentHeight: frame.contentDocument?.documentElement?.scrollHeight ?? null,
      accessible: !!frame.contentDocument,
      contentUrl: frame.contentDocument?.URL ?? "",
      contentRootCount: frame.contentDocument?.querySelectorAll(ROOT_SELECTOR).length ?? null,
      contentCanvasCount: frame.contentDocument?.querySelectorAll(CANVAS_SELECTOR).length ?? null
    }))
  );

  const documents = docs.map(({ doc, path, depth }) => ({
    frame: path,
    depth,
    url: doc.URL,
    title: String(doc.title || "").slice(0, 120),
    iframeCount: doc.querySelectorAll("iframe").length,
    canvasCount: doc.querySelectorAll(CANVAS_SELECTOR).length,
    rootCount: doc.querySelectorAll(ROOT_SELECTOR).length,
    bodyTextLength: String(doc.body?.innerText || "").length
  }));

  const resumes = docs.flatMap(({ doc, path }) =>
    [...doc.querySelectorAll(CANVAS_SELECTOR)].map((canvas) => {
      const root = canvas.closest("div#resume");
      const canvasRect = canvas.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const viewportHeight = doc.defaultView.innerHeight;
      const visibleHeight = Math.max(
        0,
        Math.min(canvasRect.bottom, rootRect.bottom, viewportHeight) -
          Math.max(canvasRect.top, rootRect.top, 0)
      );
      const ancestors = [];
      let current = canvas.parentElement;
      while (current) {
        const style = current.ownerDocument.defaultView.getComputedStyle(current);
        ancestors.push({
          tag: current.tagName,
          className: String(current.className || "").slice(0, 100),
          overflowY: style.overflowY,
          clientHeight: current.clientHeight,
          scrollHeight: current.scrollHeight,
          scrollTop: current.scrollTop
        });
        current = current.parentElement || current.ownerDocument.defaultView.frameElement;
      }
      const scrollableIndex = ancestors.findIndex((item) =>
        item.scrollHeight > item.clientHeight + 1 &&
        /auto|scroll|overlay/.test(item.overflowY)
      );
      const preferredScrollerIndex = ancestors.findIndex((item) =>
        item.scrollHeight > item.clientHeight + 1 &&
        /auto|scroll|overlay/.test(item.overflowY) &&
        String(item.className || "").split(/\s+/).includes("resume-detail-wrap")
      );
      const scrollerIndex = preferredScrollerIndex >= 0
        ? preferredScrollerIndex
        : scrollableIndex;
      const outerRoot = doc.querySelector(
        ".lib-standard-resume.with-right-side, .lib-standard-resume"
      );
      return {
        frame: path,
        frameUrl: doc.URL,
        canvas: `${canvas.width}x${canvas.height}`,
        rootHeight: Math.round(rootRect.height),
        visibleHeight: Math.round(visibleHeight),
        ready: canvas.width >= 200 && canvas.height >= 100 &&
          visibleHeight >= Math.min(120, Math.ceil(rootRect.height)),
        scrollerIndex,
        scroller: ancestors[scrollerIndex] || null,
        textSample: String(outerRoot?.innerText || root.innerText || "")
          .replace(/\s+/g, " ").trim().slice(0, 2000),
        ancestors
      };
    })
  );

  const domRoots = docs.flatMap(({ doc, path }) =>
    [...doc.querySelectorAll(ROOT_SELECTOR)].filter(visible).map((root) => {
      const rect = root.getBoundingClientRect();
      const ancestors = [];
      let current = root.parentElement;
      while (current) {
        const style = current.ownerDocument.defaultView.getComputedStyle(current);
        ancestors.push({
          tag: current.tagName,
          className: String(current.className || "").slice(0, 100),
          overflowY: style.overflowY,
          clientHeight: current.clientHeight,
          scrollHeight: current.scrollHeight,
          scrollTop: current.scrollTop
        });
        current = current.parentElement || current.ownerDocument.defaultView.frameElement;
      }
      const scrollableIndex = ancestors.findIndex((item) =>
        item.scrollHeight > item.clientHeight + 1 &&
        /auto|scroll|overlay/.test(item.overflowY)
      );
      const preferredScrollerIndex = ancestors.findIndex((item) =>
        item.scrollHeight > item.clientHeight + 1 &&
        /auto|scroll|overlay/.test(item.overflowY) &&
        String(item.className || "").split(/\s+/).includes("resume-detail-wrap")
      );
      const scrollerIndex = preferredScrollerIndex >= 0
        ? preferredScrollerIndex
        : scrollableIndex;
      return {
        frame: path,
        frameUrl: doc.URL,
        tag: root.tagName,
        className: String(root.className || "").slice(0, 160),
        height: Math.round(rect.height),
        visibleHeight: Math.round(Math.max(0, Math.min(rect.bottom, doc.defaultView.innerHeight) - Math.max(rect.top, 0))),
        hasResumeCanvas: !!root.querySelector("canvas#resume"),
        scrollerIndex,
        scroller: ancestors[scrollerIndex] || null,
        textSample: String(root.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2000)
      };
    })
  );

  const result = {
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    frameCount: docs.length,
    documents,
    iframes,
    resumes,
    domRoots
  };
  const sampleCanvas = (canvas) => {
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return { readable: false, error: "2D context unavailable" };
      const points = [
        [1, 1],
        [canvas.width >> 1, canvas.height >> 1],
        [Math.max(1, canvas.width - 2), Math.max(1, canvas.height - 2)]
      ];
      return {
        readable: true,
        colors: points.map(([x, y]) =>
          Array.from(context.getImageData(x, y, 1, 1).data)
        )
      };
    } catch (error) {
      return { readable: false, error: String(error?.message || error) };
    }
  };
  window.__bossResumeScrollTest = async (delta = null) => {
    for (const { doc, path } of scan()) {
      const canvas = doc.querySelector(CANVAS_SELECTOR);
      if (!canvas) continue;
      const ancestors = [];
      let current = canvas.parentElement;
      while (current) {
        const style = current.ownerDocument.defaultView.getComputedStyle(current);
        ancestors.push({ element: current, overflowY: style.overflowY });
        current = current.parentElement || current.ownerDocument.defaultView.frameElement;
      }
      const scrollable = ancestors.filter(({ element, overflowY }) =>
        element.scrollHeight > element.clientHeight + 1 &&
        /auto|scroll|overlay/.test(overflowY)
      );
      const scroller = (scrollable.find(({ element }) =>
        String(element.className || "").split(/\s+/).includes("resume-detail-wrap")
      ) || scrollable[0])?.element;
      if (!scroller) return { ok: false, code: "SCROLLER_NOT_FOUND", frame: path };
      const before = scroller.scrollTop;
      const pixelBefore = sampleCanvas(canvas);
      const scrollRange = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const step = Number.isFinite(delta)
        ? delta
        : Math.max(120, Math.floor(scroller.clientHeight * 0.7));
      scroller.scrollTop = Math.min(scrollRange, before + step);
      await sleep(500);
      const after = scroller.scrollTop;
      const pixelAfter = sampleCanvas(canvas);
      scroller.scrollTop = before;
      return {
        ok: after !== before,
        frame: path,
        scrollerClass: String(scroller.className || ""),
        before,
        after,
        scrollRange,
        canvasPixelsChanged:
          JSON.stringify(pixelBefore) !== JSON.stringify(pixelAfter),
        pixelBefore,
        pixelAfter
      };
    }
    return { ok: false, code: "RESUME_CANVAS_NOT_FOUND" };
  };
  window.__bossResumeDebug = result;
  console.table(documents);
  console.table(resumes.map(({ ancestors, textSample, ...row }) => row));
  if (!resumes.length) console.table(domRoots.map(({ textSample, ...row }) => row));
  console.log("完整结果：window.__bossResumeDebug", result);
  console.log("滚动自测：await window.__bossResumeScrollTest()");
  if (typeof copy === "function") copy(result);
  return result;
})();
