function measureResumeSlice(options) {
  function visible(element) {
    const bounds = element.getBoundingClientRect();
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return bounds.width > 0 && bounds.height > 0 &&
      style.display !== "none" && style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0;
  }
  function findCanvases(doc, depth = 0, collected = []) {
    if (depth > 8) return collected;
    for (const canvas of doc.querySelectorAll("div#resume canvas#resume")) {
      if (visible(canvas)) {
        collected.push({
          canvas,
          frameUrl: doc.defaultView?.location?.href || doc.URL || ""
        });
      }
    }
    for (const frame of doc.querySelectorAll("iframe")) {
      try {
        if (!visible(frame) || !frame.contentDocument) continue;
        findCanvases(frame.contentDocument, depth + 1, collected);
      } catch {}
    }
    return collected;
  }
  function offset(doc) {
    let left = 0;
    let top = 0;
    while (doc !== document) {
      const frame = doc.defaultView.frameElement;
      if (!frame) throw new Error("RESUME_FRAME_NOT_ACCESSIBLE");
      const bounds = frame.getBoundingClientRect();
      if (Math.abs(bounds.width - frame.offsetWidth) > 2 ||
          Math.abs(bounds.height - frame.offsetHeight) > 2) {
        throw new Error("RESUME_FRAME_SCALED");
      }
      left += bounds.left + frame.clientLeft;
      top += bounds.top + frame.clientTop;
      doc = frame.ownerDocument;
    }
    return { left, top };
  }
  function globalBounds(element) {
    const bounds = element.getBoundingClientRect();
    const origin = offset(element.ownerDocument);
    return {
      left: origin.left + bounds.left,
      top: origin.top + bounds.top,
      right: origin.left + bounds.right,
      bottom: origin.top + bounds.bottom,
      width: bounds.width,
      height: bounds.height
    };
  }
  function viewportArea(element) {
    try {
      const bounds = globalBounds(element);
      const left = Math.max(0, bounds.left);
      const top = Math.max(0, bounds.top);
      const right = Math.min(window.innerWidth, bounds.right);
      const bottom = Math.min(window.innerHeight, bounds.bottom);
      return Math.max(0, right - left) * Math.max(0, bottom - top);
    } catch {
      return 0;
    }
  }
  const candidates = findCanvases(document)
    .filter(({ canvas }) => canvas.width > 0 && canvas.height > 0);
  if (!candidates.length) return { ok: false, code: "RESUME_CANVAS_NOT_FOUND" };
  const selected = candidates.reduce((best, item) =>
    viewportArea(item.canvas) > viewportArea(best.canvas) ? item : best
  );
  const { canvas } = selected;
  const root = canvas.closest("div#resume");
  const ancestors = [];
  let ancestor = canvas.parentElement;
  while (ancestor) {
    ancestors.push(ancestor);
    ancestor = ancestor.parentElement || ancestor.ownerDocument.defaultView.frameElement;
  }
  const scrollerIndex = Number.isInteger(options.scrollerIndex) && options.scrollerIndex >= 0 ? options.scrollerIndex : ancestors.findIndex((element) => {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return element.scrollHeight > element.clientHeight + 1 &&
      (/auto|scroll|overlay/.test(style.overflowY) ||
        element === element.ownerDocument.scrollingElement);
  });
  const scroller = ancestors[scrollerIndex];
  let viewportAdjustment = null;
  if (options.action === "restore" && scroller && Array.isArray(options.viewportAdjustments)) {
    for (const adjustment of options.viewportAdjustments) {
      for (const property of adjustment.properties) {
        if (property.value) scroller.style.setProperty(property.name, property.value, property.priority);
        else scroller.style.removeProperty(property.name);
      }
    }
  }
  let scrollInput = null;
  if ((options.action === "scroll" || options.action === "restore") && scroller) {
    if (options.action === "restore") {
      const deltaY = options.scrollTop - scroller.scrollTop;
      if (Math.abs(deltaY) >= 1) {
        const bounds = globalBounds(scroller);
        scrollInput = {
          reason: "restore",
          x: Math.round(Math.max(1, Math.min(window.innerWidth - 1, bounds.left + bounds.width / 2))),
          y: Math.round(Math.max(1, Math.min(window.innerHeight - 1, bounds.top + bounds.height / 2))),
          fromScrollTop: scroller.scrollTop,
          toScrollTop: options.scrollTop,
          deltaY
        };
      }
    }
  }
  if (options.action === "makeBottomReachable" && scroller) {
    const style = scroller.ownerDocument.defaultView.getComputedStyle(scroller);
    const bounds = globalBounds(scroller);
    const innerTop = bounds.top + scroller.clientTop;
    const innerBottom = innerTop + scroller.clientHeight;
    let visibleBottom = Math.min(innerBottom, window.innerHeight);
    for (const element of ancestors.slice(scrollerIndex + 1)) {
      const outerStyle = element.ownerDocument.defaultView.getComputedStyle(element);
      if (element.tagName !== "IFRAME" && !/auto|scroll|hidden|clip|overlay/.test(outerStyle.overflowY)) continue;
      const outerBounds = globalBounds(element);
      visibleBottom = Math.min(visibleBottom, outerBounds.top + element.clientTop + element.clientHeight);
    }
    const boxExtras = style.boxSizing === "border-box" ? 0 :
      [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth]
        .reduce((total, value) => total + (parseFloat(value) || 0), 0);
    const clippedBelow = Math.max(0, innerBottom - visibleBottom);
    const requestedReduction = Math.max(0, Number(options.remainingHeight) || 0);
    const reduction = Math.max(clippedBelow, requestedReduction);
    if (reduction >= 1) {
      if (options.strategy === "padding") {
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        viewportAdjustment = {
          strategy: "padding",
          properties: ["padding-bottom"].map((name) => ({
            name,
            value: scroller.style.getPropertyValue(name),
            priority: scroller.style.getPropertyPriority(name)
          })),
          previousHeight: scroller.clientHeight,
          visibleHeight: Math.max(0, visibleBottom - innerTop),
          reduction: Math.ceil(requestedReduction)
        };
        scroller.style.setProperty(
          "padding-bottom",
          `${paddingBottom + Math.ceil(requestedReduction)}px`,
          "important"
        );
      } else {
        const maxHeight = Math.max(120, Math.floor(bounds.height - reduction - boxExtras));
        viewportAdjustment = {
          strategy: "compact",
          properties: ["max-height", "min-height"].map((name) => ({
            name,
            value: scroller.style.getPropertyValue(name),
            priority: scroller.style.getPropertyPriority(name)
          })),
          previousHeight: scroller.clientHeight,
          visibleHeight: Math.max(0, visibleBottom - innerTop),
          reduction
        };
        scroller.style.setProperty("min-height", "0px", "important");
        scroller.style.setProperty("max-height", `${maxHeight}px`, "important");
      }
    }
  }
  if (options.action === "scroll" && scroller) {
    const bounds = globalBounds(scroller);
    const innerTop = bounds.top + scroller.clientTop;
    const innerBottom = innerTop + scroller.clientHeight;
    let visibleTop = Math.max(innerTop, 0);
    let visibleBottom = Math.min(innerBottom, window.innerHeight);
    for (const element of ancestors.slice(scrollerIndex + 1)) {
      const style = element.ownerDocument.defaultView.getComputedStyle(element);
      if (element.tagName !== "IFRAME" && !/auto|scroll|hidden|clip|overlay/.test(style.overflowY)) continue;
      const outerBounds = globalBounds(element);
      visibleTop = Math.max(visibleTop, outerBounds.top + element.clientTop);
      visibleBottom = Math.min(visibleBottom, outerBounds.top + element.clientTop + element.clientHeight);
    }
    // Normal slices never resize the scroller. A compacting fallback is used only
    // when BOSS clamps scrollTop before the end of the resume.
    const scrollBounds = globalBounds(scroller);
    const rootBounds = globalBounds(root);
    const targetScrollTop = Math.max(0, scroller.scrollTop + rootBounds.top +
      options.contentOffset - scrollBounds.top - scroller.clientTop);
    const deltaY = targetScrollTop - scroller.scrollTop;
    if (Math.abs(deltaY) >= 1) {
      const inputTop = Math.max(visibleTop, bounds.top + scroller.clientTop);
      const inputBottom = Math.min(visibleBottom, bounds.bottom - scroller.clientTop);
      scrollInput = {
        reason: "slice",
        x: Math.round(Math.max(1, Math.min(window.innerWidth - 1, bounds.left + bounds.width / 2))),
        y: Math.round(Math.max(1, Math.min(window.innerHeight - 1, (inputTop + inputBottom) / 2))),
        fromScrollTop: scroller.scrollTop,
        toScrollTop: targetScrollTop,
        deltaY
      };
    }
  }
  const rootBounds = globalBounds(root);
  const canvasBounds = globalBounds(canvas);
  let left = Math.max(rootBounds.left, canvasBounds.left, 0);
  let top = Math.max(rootBounds.top, canvasBounds.top, 0);
  let right = Math.min(rootBounds.right, canvasBounds.right, window.innerWidth);
  let bottom = Math.min(rootBounds.bottom, canvasBounds.bottom, window.innerHeight);
  for (const element of ancestors) {
    const bounds = globalBounds(element);
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    const isFrame = element.tagName === "IFRAME";
    if (isFrame || /auto|scroll|hidden|clip|overlay/.test(style.overflowX)) {
      left = Math.max(left, bounds.left + element.clientLeft);
      right = Math.min(right, bounds.left + element.clientLeft + element.clientWidth);
    }
    if (isFrame || /auto|scroll|hidden|clip|overlay/.test(style.overflowY)) {
      top = Math.max(top, bounds.top + element.clientTop);
      bottom = Math.min(bottom, bounds.top + element.clientTop + element.clientHeight);
    }
  }
  const rect = {
    x: Math.ceil(left), y: Math.ceil(top),
    width: Math.floor(right) - Math.ceil(left),
    height: Math.floor(bottom) - Math.ceil(top)
  };
  const scrollInfo = {
    scrollerIndex,
    viewportAdjustment,
    scrollTop: scroller?.scrollTop || 0,
    scrollHeight: scroller?.scrollHeight || 0,
    clientHeight: scroller?.clientHeight || 0,
    scrollInput
  };
  const diagnostics = {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    candidateCount: candidates.length,
    selectedFrameUrl: selected.frameUrl,
    selectedCanvasRect: {
      left: canvasBounds.left,
      top: canvasBounds.top,
      width: canvasBounds.width,
      height: canvasBounds.height
    },
    rootBounds,
    clippedRect: rect,
    ancestors: ancestors.slice(0, 12).map((element) => {
      const bounds = globalBounds(element);
      const style = element.ownerDocument.defaultView.getComputedStyle(element);
      return {
        tag: element.tagName,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom
      };
    })
  };
  if (rect.width < 20 || rect.height < 20) {
    return { ok: false, code: "RESUME_NOT_VISIBLE", ...scrollInfo, diagnostics };
  }
  if (rect.width < Math.floor(rootBounds.width) - 2) {
    return { ok: false, code: "RESUME_WIDTH_CLIPPED", ...scrollInfo };
  }
  return {
    ok: true,
    rect,
    contentTop: Math.round(rect.y - rootBounds.top),
    totalHeight: Math.ceil(rootBounds.height),
    rootBounds,
    canvasBounds,
    viewport: diagnostics.viewport,
    scrollTop: scroller?.scrollTop || 0,
    scrollInput,
    ...scrollInfo,
    signature: JSON.stringify([
      rect, rootBounds.top, rootBounds.height, canvasBounds.top,
      canvas.width, canvas.height, scroller?.scrollTop || 0
    ])
  };
}

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const FINAL_SLICE_ROUNDING_TOLERANCE = 1;
const INITIAL_RENDER_TIMEOUT_MS = 15000;
const SLICE_RENDER_TIMEOUT_MS = 8000;
const BOSS_RESUME_SCREENSHOT_REVISION = "2026-10-28-initial-scroll-v2";

function isScrollerAtEnd(state) {
  const scrollRange = Number(state?.scrollHeight) - Number(state?.clientHeight);
  return scrollRange > 0 &&
    Number(state.scrollTop) + Number(state.clientHeight) >=
      Number(state.scrollHeight) - FINAL_SLICE_ROUNDING_TOLERANCE;
}

function hasOnlyFinalPixelGap(state, coveredTo) {
  const remaining = Number(state?.totalHeight) - Number(coveredTo);
  return remaining > 0 &&
    remaining <= FINAL_SLICE_ROUNDING_TOLERANCE &&
    isScrollerAtEnd(state);
}

async function loadScreenshot(base64) {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  return image;
}

async function screenshotHasContent(base64) {
  const image = await loadScreenshot(base64);
  const sample = document.createElement("canvas");
  sample.width = 32;
  sample.height = 64;
  try {
    const context = sample.getContext("2d");
    if (!context) throw new Error("RESUME_STITCH_CONTEXT_UNAVAILABLE");
    context.drawImage(image, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let darkest = 255;
    let lightest = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) continue;
      const brightness = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      darkest = Math.min(darkest, brightness);
      lightest = Math.max(lightest, brightness);
    }
    return lightest - darkest > 8;
  } finally {
    sample.width = 0;
    sample.height = 0;
  }
}

export async function stitchResumeSlices(slices, totalHeight) {
  if (!slices.length) throw new Error("RESUME_SCREENSHOT_EMPTY");
  const firstImage = await loadScreenshot(slices[0].base64);
  const scale = firstImage.naturalWidth / slices[0].state.rect.width;
  const width = firstImage.naturalWidth;
  const height = Math.round(totalHeight * scale);
  if (width < 1 || height < 1 || height > 30000 || width * height > 64000000) {
    throw new Error("RESUME_SCREENSHOT_TOO_LARGE");
  }
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  try {
    const context = output.getContext("2d");
    if (!context) throw new Error("RESUME_STITCH_CONTEXT_UNAVAILABLE");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    let covered = 0;
    for (let index = 0; index < slices.length; index++) {
      const slice = slices[index];
      if (slice.from !== covered || slice.to <= slice.from || slice.to > totalHeight) {
        throw new Error("RESUME_SCREENSHOT_GAP");
      }
      const image = index === 0 ? firstImage : await loadScreenshot(slice.base64);
      if (Math.abs(image.naturalWidth - width) > 1 ||
          Math.abs(image.naturalHeight - slice.state.rect.height * scale) > 2) {
        throw new Error("RESUME_SCREENSHOT_SIZE_CHANGED");
      }
      const sourceTop = (slice.from - slice.state.contentTop) * scale;
      const sourceHeight = (slice.to - slice.from) * scale;
      if (sourceTop < 0 || sourceTop + sourceHeight > image.naturalHeight + 1) {
        throw new Error("RESUME_SCREENSHOT_INVALID_SLICE");
      }
      const destinationTop = Math.round(slice.from * scale);
      const destinationBottom = Math.round(slice.to * scale);
      context.drawImage(image, 0, sourceTop, image.naturalWidth, sourceHeight,
        0, destinationTop, width, destinationBottom - destinationTop);
      covered = slice.to;
    }
    if (covered !== totalHeight) throw new Error("RESUME_SCREENSHOT_INCOMPLETE");
    const base64 = output.toDataURL("image/png").split(",")[1];
    if (!base64) throw new Error("RESUME_STITCH_FAILED");
    return {
      base64, width, height, sliceCount: slices.length,
      bytes: Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0)
    };
  } finally {
    output.width = 0;
    output.height = 0;
  }
}

export async function captureBossResumeLongScreenshot(tabId, { shouldAbort } = {}) {
  const captureStartedAt = Date.now();
  console.info(`[任务流程] [BOSS简历长图] capture revision=${BOSS_RESUME_SCREENSHOT_REVISION} tabId=${tabId}`);
  const automation = window.api?.automation;
  if (!automation?.sendCdp || !automation?.evalOnTab || !automation?.captureTab) {
    throw new Error("当前客户端版本不支持简历分片截图");
  }
  const checkStopped = () => {
    if (shouldAbort?.()) {
      const error = new Error("任务已停止，取消简历分片截图");
      error.code = "TASK_STOPPED";
      throw error;
    }
  };
  let scrollerIndex = null;
  const viewportAdjustments = [];
  // Every CDP command below is scoped to the target BOSS tabId; never dispatch it to the app view.
  const sendCdp = async (method, params) => {
    checkStopped();
    const result = await automation.sendCdp({ tabId, method, params });
    if (!result?.ok) {
      throw new Error(result?.error?.message || `CDP_COMMAND_FAILED ${method}`);
    }
    return result.result;
  };
  const read = async (options = {}) => {
    checkStopped();
    const result = await automation.evalOnTab({
      tabId, code: `(${measureResumeSlice.toString()})(${JSON.stringify({ scrollerIndex, ...options })})`,
      awaitPromise: true
    });
    if (!result?.ok) throw new Error(result?.error?.message || "RESUME_MEASURE_FAILED");
    if (Number.isInteger(result.result?.scrollerIndex) && result.result.scrollerIndex >= 0) {
      scrollerIndex = result.result.scrollerIndex;
    }
    if (result.result?.viewportAdjustment) {
      viewportAdjustments.push(result.result.viewportAdjustment);
      console.log("[任务流程] [BOSS简历长图] 末片扩大滚动范围", {
        strategy: result.result.viewportAdjustment.strategy,
        previousHeight: result.result.viewportAdjustment.previousHeight,
        reduction: result.result.viewportAdjustment.reduction,
        clientHeight: result.result.clientHeight
      });
    }
    if (result.result?.scrollInput) {
      const { x, y, deltaY } = result.result.scrollInput;
      await sendCdp("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
        button: "none"
      });
      await sendCdp("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x,
        y,
        deltaX: 0,
        deltaY
      });
      console.log("[任务流程] [BOSS简历长图] CDP 原生滚轮滚动 >>>", {
        ...result.result.scrollInput,
        scrollerIndex,
        scrollHeight: result.result.scrollHeight,
        clientHeight: result.result.clientHeight,
        inputMode: "cdp"
      });
    }
    return result.result;
  };
  const stateSummary = (state) => ({
    ok: !!state?.ok,
    code: state?.code,
    rect: state?.rect,
    viewport: state?.viewport || state?.diagnostics?.viewport,
    contentTop: state?.contentTop,
    totalHeight: state?.totalHeight,
    scrollTop: state?.scrollTop,
    scrollHeight: state?.scrollHeight,
    clientHeight: state?.clientHeight,
    scrollerIndex: state?.scrollerIndex,
    candidateCount: state?.diagnostics?.candidateCount,
    selectedFrameUrl: state?.diagnostics?.selectedFrameUrl,
    selectedCanvasRect: state?.diagnostics?.selectedCanvasRect || state?.canvasBounds,
    rootBounds: state?.diagnostics?.rootBounds || state?.rootBounds,
    clippedRect: state?.diagnostics?.clippedRect
  });
  const captureSlice = async (rect, phaseLabel) => {
    // The main process captures only the target BOSS webContents. Active tabs use
    // capturePage; background tabs use frame subscription so capture never promotes
    // the obscured BOSS view into the shell's compositor. Scrolling remains via CDP.
    let lastError;
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      try {
        const result = await automation.captureTab({ tabId, rect });
        if (!result?.ok || !result.data?.base64) {
          throw new Error(result?.error?.message || "RESUME_CAPTURE_EMPTY");
        }
        return result.data;
      } catch (error) {
        lastError = error;
        console.warn("[任务流程] [BOSS简历长图] 截图请求失败", {
          phaseLabel,
          attempt: attempt + 1,
          maxAttempts: 3,
          rect,
          message: error?.message || String(error)
        });
        if (attempt < 2) await sleep(400);
      }
    }
    throw lastError || new Error("RESUME_CAPTURE_FAILED");
  };
  const captureStableSlice = async (
    timeoutMs = SLICE_RENDER_TIMEOUT_MS,
    phaseLabel = "分片"
  ) => {
    const waitStartedAt = Date.now();
    await sleep(750);
    const deadline = Date.now() + timeoutMs;
    let lastCode = "RESUME_CANVAS_NOT_READY";
    let lastFailureSignature = "";
    let attempts = 0;
    while (Date.now() < deadline) {
      attempts++;
      const state = await read();
      if (!state?.ok) {
        lastCode = state?.code || lastCode;
        const failureSignature = JSON.stringify(state || {});
        if (failureSignature !== lastFailureSignature) {
          lastFailureSignature = failureSignature;
          console.warn("[任务流程] [BOSS简历长图] 截图区域尚不可用", {
            phaseLabel,
            attempts,
            waitedMs: Date.now() - waitStartedAt,
            ...stateSummary(state)
          });
        }
        await sleep(250);
        continue;
      }
      checkStopped();
      const shot = await captureSlice(state.rect, phaseLabel);
      const { base64 } = shot;
      console.log("[任务流程] [BOSS简历长图] 分片截图返回", {
        phaseLabel,
        captureMode: shot.captureMode || "unknown",
        requestedRect: state.rect,
        output: { width: shot.width, height: shot.height, bytes: shot.bytes },
        scrollTop: state.scrollTop,
        scrollHeight: state.scrollHeight,
        clientHeight: state.clientHeight
      });
      const after = await read();
      if (after?.signature === state.signature) {
        const hasContent = await screenshotHasContent(base64);
        if (hasContent) {
          console.log("[任务流程] [BOSS简历长图] 截图区域已稳定就绪 ✓", {
            phaseLabel,
            attempts,
            waitedMs: Date.now() - waitStartedAt,
            ...stateSummary(state)
          });
          return { state, base64 };
        }
        lastCode = "RESUME_CANVAS_BLANK";
        console.warn("[任务流程] [BOSS简历长图] 截图内容为空，继续等待", {
          phaseLabel,
          attempts,
          rect: state.rect,
          scrollTop: state.scrollTop
        });
      } else {
        console.warn("[任务流程] [BOSS简历长图] 截图期间区域发生变化，重试", {
          phaseLabel,
          attempts,
          before: stateSummary(state),
          after: stateSummary(after)
        });
      }
      await sleep(300);
    }
    console.warn("[任务流程] [BOSS简历长图] 截图区域就绪等待超时", {
      phaseLabel,
      attempts,
      waitedMs: Date.now() - waitStartedAt,
      timeoutMs,
      lastCode
    });
    throw new Error(`简历 canvas 未完成渲染: ${lastCode}`);
  };
  const slices = [];
  let initialScrollTop = null;
  let covered = 0;
  let bottomAdjustAttempt = 0;
  try {
    // 先记录调用前位置，再把滚动容器恢复到顶部，保证第一条带从内容 0 开始；
    // 结束时仍恢复用户原来的位置。
    // 详情刚打开时，BOSS 可能保留了上一次的滚动位置，甚至在首帧内
    // #resume 完全位于可见区域外。旧逻辑先等待 captureStableSlice 成功，
    // 再判断 scrollTop，结果永远走不到“回到顶部”：首屏直接以
    // RESUME_NOT_VISIBLE 超时并被关闭。这里先探测并记录原滚动位置，
    // 若首屏不可见就主动通过 CDP 滚回内容顶部，再等待真实渲染。
    const initialProbe = await read();
    initialScrollTop = Number.isFinite(initialProbe?.scrollTop)
      ? initialProbe.scrollTop
      : null;
    console.log("[任务流程] [BOSS简历长图] 首屏探测完成", {
      savedScrollTop: initialScrollTop,
      ...stateSummary(initialProbe)
    });
    if (!initialProbe?.ok &&
        (initialProbe?.code === "RESUME_NOT_VISIBLE" ||
          initialProbe?.code === "RESUME_WIDTH_CLIPPED")) {
      console.warn("[任务流程] [BOSS简历长图] 首屏不可见，先滚动到简历顶部", stateSummary(initialProbe));
      await read({ action: "scroll", contentOffset: 0 });
    }
    const initial = await captureStableSlice(INITIAL_RENDER_TIMEOUT_MS, "首屏");
    if (initialScrollTop === null) initialScrollTop = initial.state.scrollTop;
    if (initialScrollTop > 0) {
      console.log(`[任务流程] [BOSS简历长图] 恢复首屏起点前先回到顶部 scrollTop=${initialScrollTop}`);
      await read({ action: "scroll", contentOffset: 0 });
      await captureStableSlice(INITIAL_RENDER_TIMEOUT_MS, "首屏重置后");
    }
    for (let index = 0; index < 80; index++) {
      const phaseLabel = `分片 ${index + 1}`;
      console.log("[任务流程] [BOSS简历长图] 准备滚动并截图", {
        phaseLabel,
        covered,
        nextContentOffset: Math.max(0, covered - 80),
        initialScrollTop
      });
      await read({ action: "scroll", contentOffset: Math.max(0, covered - 80) });
      let slice = await captureStableSlice(SLICE_RENDER_TIMEOUT_MS, phaseLabel);
      let state = slice.state;
      let bottom = Math.min(state.totalHeight, state.contentTop + state.rect.height);
      const finalPixelGap = hasOnlyFinalPixelGap(state, bottom);
      const targetHeight = finalPixelGap ? bottom : state.totalHeight;
      if (finalPixelGap) {
        console.log("[任务流程] [BOSS简历长图] 末屏存在 1px 亚像素取整误差，按实际截取高度拼接", {
          totalHeight: state.totalHeight,
          coveredTo: bottom,
          scrollTop: state.scrollTop,
          scrollHeight: state.scrollHeight,
          clientHeight: state.clientHeight
        });
      }
      const strategies = ["padding", "compact"];
      while ((state.contentTop > covered || bottom <= covered) &&
             bottomAdjustAttempt < strategies.length &&
             targetHeight > bottom) {
        const remainingHeight = state.totalHeight - bottom;
        const adjusted = await read({
          action: "makeBottomReachable",
          remainingHeight,
          strategy: strategies[bottomAdjustAttempt]
        });
        if (!adjusted?.viewportAdjustment) break;
        bottomAdjustAttempt++;
        await read({ action: "scroll", contentOffset: Math.max(0, covered - 80) });
        slice = await captureStableSlice(SLICE_RENDER_TIMEOUT_MS, `${phaseLabel} 回退修正后`);
        state = slice.state;
        bottom = Math.min(state.totalHeight, state.contentTop + state.rect.height);
      }
      const coveredByFinalPixel = hasOnlyFinalPixelGap(state, bottom) && bottom <= covered;
      if (state.contentTop > covered || (bottom <= covered && !coveredByFinalPixel)) {
        console.warn("[任务流程] [BOSS简历长图] 分片无法连续覆盖", {
          covered, bottom, contentTop: state.contentTop, totalHeight: state.totalHeight,
          scrollTop: state.scrollTop, scrollHeight: state.scrollHeight,
          clientHeight: state.clientHeight, rect: state.rect,
          bottomAdjustAttempt
        });
        throw new Error("简历滚动后存在缺片或未前进，已取消上传不完整截图");
      }
      if (slices.length && state.rect.width !== slices[0].state.rect.width) {
        throw new Error("简历截图期间窗口宽度发生变化，请重试");
      }
      if (bottom > covered) {
        slices.push({ ...slice, from: covered, to: bottom });
        covered = bottom;
        console.log("[任务流程] [BOSS简历长图] 分片已入库", {
          slice: slices.length,
          phaseLabel,
          from: slices[slices.length - 1].from,
          to: slices[slices.length - 1].to,
          covered,
          targetHeight,
          scrollTop: state.scrollTop,
          scrollHeight: state.scrollHeight,
          clientHeight: state.clientHeight,
          rect: state.rect
        });
      }
      if (covered >= targetHeight) {
        await sleep(1000);
        const last = await read();
        if (!last?.ok) throw new Error(last?.code || "RESUME_DETAIL_CLOSED");
        const lastFinalPixelGap = hasOnlyFinalPixelGap(last, covered);
        if (last.totalHeight > covered && !lastFinalPixelGap) continue;
        if (last.totalHeight !== covered && !lastFinalPixelGap) {
          throw new Error("RESUME_HEIGHT_CHANGED");
        }
        checkStopped();
        const result = await stitchResumeSlices(slices, covered);
        checkStopped();
        console.log("[任务流程] [BOSS简历长图] 拼接完成 ✓", {
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          slices: result.sliceCount,
          initialScrollTop,
          finalScrollTop: last.scrollTop,
          totalElapsedMs: Date.now() - captureStartedAt
        });
        return result;
      }
    }
    throw new Error("简历分片超过安全上限，已取消上传不完整截图");
  } catch (error) {
    console.warn("[任务流程] [BOSS简历长图] 截图流程失败 ✗", {
      tabId,
      elapsedMs: Date.now() - captureStartedAt,
      covered,
      slices: slices.length,
      initialScrollTop,
      scrollerIndex,
      code: error?.code,
      message: error?.message || String(error)
    });
    throw error;
  } finally {
    if (initialScrollTop !== null) {
      const restoreStartedAt = Date.now();
      try {
        await read({
          action: "restore", scrollTop: initialScrollTop, scrollerIndex, viewportAdjustments
        });
        console.log("[任务流程] [BOSS简历长图] 原始滚动位置已恢复", {
          scrollTop: initialScrollTop,
          elapsedMs: Date.now() - restoreStartedAt
        });
      } catch (error) {
        console.warn("[任务流程] [BOSS简历长图] 恢复原始滚动位置失败", {
          scrollTop: initialScrollTop,
          elapsedMs: Date.now() - restoreStartedAt,
          message: error?.message || String(error)
        });
      }
    }
  }
}
