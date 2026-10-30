/**
 * BOSS 推荐牛人：控制台长简历滚动截图脚本。
 *
 * 使用前先手动打开需要测试的候选人详情。
 *
 * 在 BOSS 推荐牛人页面 Console 粘贴执行后，页面右下角会出现“开始长简历截图”按钮。
 * Firefox 必须点击这个按钮，才能获得 getDisplayMedia 所需的用户激活并弹出共享框。
 * i快招 Electron 的 BOSS tab 会优先使用 captureTab/frameSubscription。
 * 脚本只负责当前详情内的滚动、分片截图和拼接，不点击候选人、不打开或关闭详情。
 * 最终结果：window.__bossResumeCaptureResult.base64
 * 停止：window.bossResumeCaptureStop()
 */
(() => {
  "use strict";

  const CONFIG = {
    overlap: 80,
    maxSlices: 80,
    settleMs: 450,
    scrollTimeoutMs: 2500,
    downloadImage: true,
    copyBase64: false,
    maxOutputPixels: 64000000,
    maxOutputHeight: 30000,
  };
  const FINAL_SLICE_ROUNDING_TOLERANCE = 20;

  const LOG_PREFIX = "[BOSS简历控制台截图]";
  const runtime = {
    running: false,
    stopped: false,
    native: null,
    captureBackend: null,
    displayStream: null,
    displayVideo: null,
    originalScrollTop: null,
    styleRestores: [],
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = (message, details) => {
    if (details === undefined) console.log(`${LOG_PREFIX} ${message}`);
    else console.log(`${LOG_PREFIX} ${message}`, details);
  };
  const warn = (message, details) => {
    if (details === undefined) console.warn(`${LOG_PREFIX} ${message}`);
    else console.warn(`${LOG_PREFIX} ${message}`, details);
  };
  const fail = (code, message, details) => {
    const error = new Error(message);
    error.code = code;
    if (details !== undefined) error.details = details;
    throw error;
  };
  const assertRunning = () => {
    if (runtime.stopped) fail("TASK_STOPPED", "用户已停止长简历截图");
  };
  function visible(element) {
    if (!element?.isConnected) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const win = element.ownerDocument.defaultView || window;
    const style = win.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0
    );
  }

  function scanDocuments() {
    const docs = [];
    const seen = new Set();
    const walk = (doc, path, depth) => {
      if (!doc || seen.has(doc) || depth > 8) return;
      seen.add(doc);
      docs.push({ doc, path, depth });
      for (const frame of doc.querySelectorAll("iframe")) {
        try {
          if (frame.contentDocument) {
            walk(
              frame.contentDocument,
              `${path} > ${frame.src || `iframe[${depth}]`}`,
              depth + 1
            );
          }
        } catch {
          // Some BOSS versions include inaccessible third-party frames.
        }
      }
    };
    walk(document, "mainFrame", 0);
    return docs;
  }

  function frameOffset(doc) {
    let left = 0;
    let top = 0;
    let current = doc;
    while (current && current !== document) {
      const frame = current.defaultView?.frameElement;
      if (!frame) fail("FRAME_NOT_ACCESSIBLE", "无法读取简历 iframe 的宿主位置");
      const rect = frame.getBoundingClientRect();
      left += rect.left + frame.clientLeft;
      top += rect.top + frame.clientTop;
      current = frame.ownerDocument;
    }
    return { left, top };
  }

  function globalBounds(element) {
    const rect = element.getBoundingClientRect();
    const origin = frameOffset(element.ownerDocument);
    return {
      left: origin.left + rect.left,
      top: origin.top + rect.top,
      right: origin.left + rect.right,
      bottom: origin.top + rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }

  function collectAncestors(element) {
    const ancestors = [];
    let current = element.parentElement;
    while (current) {
      ancestors.push(current);
      current =
        current.parentElement ||
        current.ownerDocument.defaultView?.frameElement ||
        null;
    }
    return ancestors;
  }

  function isScrollable(element) {
    if (!element) return false;
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return (
      element.scrollHeight > element.clientHeight + 1 &&
      (/auto|scroll|overlay/.test(style.overflowY) ||
        element === element.ownerDocument.scrollingElement)
    );
  }

  function chooseScroller(ancestors) {
    const detailIndex = ancestors.findIndex((element) =>
      element.classList?.contains("resume-detail-wrap")
    );
    if (detailIndex >= 0 && isScrollable(ancestors[detailIndex])) {
      return { scroller: ancestors[detailIndex], scrollerIndex: detailIndex };
    }
    const index = ancestors.findIndex(isScrollable);
    return {
      scroller: index >= 0 ? ancestors[index] : null,
      scrollerIndex: index,
    };
  }

  function clippedRect(root, canvas, ancestors) {
    const rootBounds = globalBounds(root);
    const canvasBounds = globalBounds(canvas);
    let left = Math.max(rootBounds.left, canvasBounds.left, 0);
    let top = Math.max(rootBounds.top, canvasBounds.top, 0);
    let right = Math.min(
      rootBounds.right,
      canvasBounds.right,
      window.innerWidth
    );
    let bottom = Math.min(
      rootBounds.bottom,
      canvasBounds.bottom,
      window.innerHeight
    );

    for (const element of ancestors) {
      const bounds = globalBounds(element);
      const style = element.ownerDocument.defaultView.getComputedStyle(element);
      const isFrame = element.tagName === "IFRAME";
      if (isFrame || /auto|scroll|hidden|clip|overlay/.test(style.overflowX)) {
        left = Math.max(left, bounds.left + element.clientLeft);
        right = Math.min(
          right,
          bounds.left + element.clientLeft + element.clientWidth
        );
      }
      if (isFrame || /auto|scroll|hidden|clip|overlay/.test(style.overflowY)) {
        top = Math.max(top, bounds.top + element.clientTop);
        bottom = Math.min(
          bottom,
          bounds.top + element.clientTop + element.clientHeight
        );
      }
    }

    return {
      x: Math.ceil(left),
      y: Math.ceil(top),
      width: Math.max(0, Math.floor(right) - Math.ceil(left)),
      height: Math.max(0, Math.floor(bottom) - Math.ceil(top)),
      rootBounds,
      canvasBounds,
    };
  }

  function findResumeTarget() {
    const targets = [];
    for (const { doc, path } of scanDocuments()) {
      const canvases = doc.querySelectorAll(
        "div#resume canvas#resume, canvas#resume"
      );
      for (const canvas of canvases) {
        if (!visible(canvas)) continue;
        const root =
          canvas.closest("div#resume") ||
          canvas.closest(".lib-standard-resume") ||
          canvas.parentElement;
        if (!root || !visible(root)) continue;
        const ancestors = collectAncestors(canvas);
        const selected = chooseScroller(ancestors);
        const bounds = clippedRect(root, canvas, ancestors);
        targets.push({
          doc,
          path,
          root,
          canvas,
          ancestors,
          scroller: selected.scroller,
          scrollerIndex: selected.scrollerIndex,
          score: bounds.width * bounds.height,
          initialBounds: bounds,
          frameUrl: doc.URL,
        });
      }
    }
    targets.sort((a, b) => b.score - a.score);
    return targets[0] || null;
  }

  function targetSummary(target) {
    if (!target) return null;
    return {
      frame: target.path,
      frameUrl: target.frameUrl,
      canvasBitmap: {
        width: target.canvas.width,
        height: target.canvas.height,
      },
      rect: target.initialBounds,
      scrollerIndex: target.scrollerIndex,
      scroller: target.scroller
        ? {
            tag: target.scroller.tagName,
            className: String(target.scroller.className || ""),
            clientHeight: target.scroller.clientHeight,
            scrollHeight: target.scroller.scrollHeight,
            scrollTop: target.scroller.scrollTop,
          }
        : null,
      ancestors: target.ancestors.map((element) => {
        const bounds = globalBounds(element);
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        return {
          tag: element.tagName,
          className: String(element.className || "").slice(0, 160),
          overflowY: style.overflowY,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          scrollTop: element.scrollTop,
          top: bounds.top,
          bottom: bounds.bottom,
        };
      }),
    };
  }

  async function prepareNativeBackend() {
    const automation = window.api?.automation;
    if (
      !automation ||
      typeof automation.getActiveTab !== "function" ||
      typeof automation.captureTab !== "function"
    ) {
      return null;
    }
    const active = await automation.getActiveTab();
    if (!active?.tabId) return null;
    runtime.native = {
      automation,
      tabId: active.tabId,
      activeUrl: active.url || "",
    };
    runtime.captureBackend = { kind: "native" };
    log("截图通道已就绪：Electron captureTab/frameSubscription", runtime.native);
    return runtime.captureBackend;
  }

  async function requireCurrentDetail() {
    let target = findResumeTarget();
    if (!target) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000) {
        assertRunning();
        await sleep(250);
        target = findResumeTarget();
        if (target) break;
      }
    }
    if (!target) {
      fail(
        "DETAIL_NOT_OPEN",
        "没有检测到已打开的候选人详情，请先手动打开长简历详情再执行脚本"
      );
    }
    log("已定位当前打开的长简历详情", targetSummary(target));
    return target;
  }

  function stopDisplayCapture() {
    if (runtime.displayStream) {
      for (const track of runtime.displayStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore cleanup failures.
        }
      }
    }
    try {
      runtime.displayVideo?.remove();
    } catch {
      // Ignore cleanup failures.
    }
    runtime.displayStream = null;
    runtime.displayVideo = null;
  }

  async function prepareDisplayBackend() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      fail(
        "DISPLAY_CAPTURE_UNSUPPORTED",
        "当前浏览器不支持 getDisplayMedia，请在 i快招客户端中执行"
      );
    }
    log("普通浏览器模式：请在共享弹窗中选择当前 BOSS 标签页");
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: true,
      });
    } catch (error) {
      fail(
        "DISPLAY_PERMISSION_DENIED",
        "Firefox 未弹出共享框或共享被取消。请点击页面右下角的按钮重新开始",
        {
          name: error?.name,
          message: error?.message || String(error),
        }
      );
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.style.cssText =
      "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;pointer-events:none;";
    video.srcObject = stream;
    document.documentElement.appendChild(video);
    await video.play();
    if (!video.videoWidth || !video.videoHeight) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("共享画面初始化超时")),
          5000
        );
        video.addEventListener(
          "loadedmetadata",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true }
        );
      });
    }
    const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
    runtime.displayStream = stream;
    runtime.displayVideo = video;
    runtime.captureBackend = { kind: "display" };
    if (settings.displaySurface && settings.displaySurface !== "browser") {
      fail(
        "WRONG_CAPTURE_SURFACE",
        `请选择“当前标签页”，当前选择的是 ${settings.displaySurface}`,
        settings
      );
    }
    log("浏览器截图通道已就绪", {
      displaySurface: settings.displaySurface || "unknown",
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
  }

  async function prepareCaptureBackend() {
    const automation = window.api?.automation;
    if (!automation) {
      await prepareDisplayBackend();
      return;
    }
    const native = await prepareNativeBackend();
    if (!native) await prepareDisplayBackend();
  }

  async function waitForVideoFrame() {
    const video = runtime.displayVideo;
    if (!video) fail("DISPLAY_VIDEO_MISSING", "共享视频尚未初始化");
    if (typeof video.requestVideoFrameCallback !== "function") {
      await sleep(120);
      return;
    }
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 500);
      video.requestVideoFrameCallback(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async function captureDisplaySlice(rect) {
    const video = runtime.displayVideo;
    if (!video?.videoWidth || !video?.videoHeight) {
      fail("DISPLAY_CAPTURE_NOT_READY", "共享视频画面不可用");
    }
    await waitForVideoFrame();
    const full = document.createElement("canvas");
    full.width = video.videoWidth;
    full.height = video.videoHeight;
    const fullContext = full.getContext("2d");
    if (!fullContext) fail("CANVAS_CONTEXT_FAILED", "无法创建共享画面画布");
    fullContext.drawImage(video, 0, 0, full.width, full.height);

    const scaleX = full.width / window.innerWidth;
    const scaleY = full.height / window.innerHeight;
    const sourceX = Math.max(0, Math.round(rect.x * scaleX));
    const sourceY = Math.max(0, Math.round(rect.y * scaleY));
    const sourceWidth = Math.min(
      full.width - sourceX,
      Math.round(rect.width * scaleX)
    );
    const sourceHeight = Math.min(
      full.height - sourceY,
      Math.round(rect.height * scaleY)
    );
    if (sourceWidth < 1 || sourceHeight < 1) {
      fail("DISPLAY_CROP_EMPTY", "当前标签页截图的裁剪区域为空", { rect });
    }
    const output = document.createElement("canvas");
    output.width = sourceWidth;
    output.height = sourceHeight;
    const context = output.getContext("2d");
    if (!context) fail("CANVAS_CONTEXT_FAILED", "无法创建分片画布");
    context.drawImage(
      full,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );
    const dataUrl = output.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    output.width = 0;
    output.height = 0;
    full.width = 0;
    full.height = 0;
    if (!base64) fail("CAPTURE_EMPTY", "浏览器共享截图返回空数据");
    return {
      base64,
      width: sourceWidth,
      height: sourceHeight,
      captureMode: "getDisplayMedia",
      foundRect: rect,
    };
  }

  async function captureNativeSlice(rect) {
    if (!runtime.native) fail("NATIVE_CAPTURE_NOT_READY", "Electron 截图通道未初始化");
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      assertRunning();
      try {
        const response = await runtime.native.automation.captureTab({
          tabId: runtime.native.tabId,
          rect,
          captureMode: "frameSubscription",
          rawFrame: true,
        });
        if (!response?.ok || !response.data?.base64) {
          fail(
            response?.error?.code || "NATIVE_CAPTURE_FAILED",
            response?.error?.message || "Electron captureTab 返回空数据"
          );
        }
        return await cropNativeFrame(response.data, rect);
      } catch (error) {
        lastError = error;
        warn(`Electron 截图第 ${attempt}/3 次失败`, {
          message: error?.message || String(error),
          rect,
        });
        if (attempt < 3) await sleep(350);
      }
    }
    throw lastError || new Error("Electron captureTab 失败");
  }

  async function captureSlice(rect) {
    if (runtime.captureBackend?.kind === "native") {
      return captureNativeSlice(rect);
    }
    return captureDisplaySlice(rect);
  }

  function readState(target) {
    if (!target.root?.isConnected || !target.canvas?.isConnected) {
      fail("RESUME_DETAIL_CLOSED", "简历详情在截图过程中被关闭");
    }
    if (!target.scroller?.isConnected) {
      fail("RESUME_SCROLLER_CLOSED", "简历滚动器在截图过程中被移除");
    }
    const bounds = clippedRect(target.root, target.canvas, target.ancestors);
    const rect = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    if (rect.width < 20 || rect.height < 20) {
      fail("RESUME_NOT_VISIBLE", "简历可见区域为空或过小", {
        rect,
        rootBounds: bounds.rootBounds,
      });
    }
    const totalHeight = Math.ceil(bounds.rootBounds.height);
    const contentTop = Math.round(rect.y - bounds.rootBounds.top);
    const result = {
      rect,
      contentTop,
      totalHeight,
      rootBounds: bounds.rootBounds,
      canvasBounds: bounds.canvasBounds,
      scrollTop: Number(target.scroller.scrollTop) || 0,
      scrollHeight: target.scroller.scrollHeight,
      clientHeight: target.scroller.clientHeight,
      scrollRange: Math.max(
        0,
        target.scroller.scrollHeight - target.scroller.clientHeight
      ),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      frameUrl: target.frameUrl,
      scrollerClass: String(target.scroller.className || ""),
    };
    result.signature = JSON.stringify([
      result.rect,
      result.contentTop,
      result.totalHeight,
      result.scrollTop,
      result.scrollHeight,
      result.clientHeight,
    ]);
    return result;
  }

  async function waitForScrollStable(scroller, timeoutMs) {
    const startedAt = Date.now();
    let previous = Number(scroller.scrollTop) || 0;
    let stableCount = 0;
    while (Date.now() - startedAt < timeoutMs) {
      assertRunning();
      await sleep(90);
      const current = Number(scroller.scrollTop) || 0;
      if (Math.abs(current - previous) < 0.5) stableCount += 1;
      else stableCount = 0;
      previous = current;
      if (stableCount >= 4) return current;
    }
    return Number(scroller.scrollTop) || 0;
  }

  async function scrollToContentOffset(target, contentOffset, reason) {
    const before = readState(target);
    const scroller = target.scroller;
    const scrollerBounds = globalBounds(scroller);
    const rootBounds = globalBounds(target.root);
    const scrollerTop = scrollerBounds.top + scroller.clientTop;
    const requested =
      before.scrollTop + rootBounds.top + contentOffset - scrollerTop;
    const maxScrollTop = Math.max(
      0,
      scroller.scrollHeight - scroller.clientHeight
    );
    const targetScrollTop = Math.max(0, Math.min(maxScrollTop, requested));
    const previousBehavior = scroller.style.getPropertyValue("scroll-behavior");
    const previousPriority = scroller.style.getPropertyPriority("scroll-behavior");
    scroller.style.setProperty("scroll-behavior", "auto", "important");
    scroller.scrollTop = targetScrollTop;
    const actual = await waitForScrollStable(scroller, CONFIG.scrollTimeoutMs);
    if (previousBehavior) {
      scroller.style.setProperty(
        "scroll-behavior",
        previousBehavior,
        previousPriority
      );
    } else {
      scroller.style.removeProperty("scroll-behavior");
    }
    const after = readState(target);
    log(`${reason}滚动完成`, {
      requestedContentOffset: contentOffset,
      requestedScrollTop: targetScrollTop,
      fromScrollTop: before.scrollTop,
      toScrollTop: actual,
      contentTop: after.contentTop,
      scrollRange: after.scrollRange,
    });
    return after;
  }

  function isAtEnd(result) {
    return (
      result.scrollTop + result.clientHeight >=
      result.scrollHeight - FINAL_SLICE_ROUNDING_TOLERANCE
    );
  }

  function isDomScrollerAtEnd(target) {
    const scroller = target?.scroller;
    if (!scroller?.isConnected) return false;
    const range = Number(scroller.scrollHeight) - Number(scroller.clientHeight);
    return (
      range > 0 &&
      Number(scroller.scrollTop) + Number(scroller.clientHeight) >=
        Number(scroller.scrollHeight) - FINAL_SLICE_ROUNDING_TOLERANCE
    );
  }

  function hasOnlyFinalGap(result, coveredTo) {
    const remaining = Number(result.totalHeight) - Number(coveredTo);
    return (
      remaining > 0 &&
      remaining <= FINAL_SLICE_ROUNDING_TOLERANCE &&
      isAtEnd(result)
    );
  }

  function makeBottomReachable(target) {
    const scroller = target.scroller;
    const style = scroller.ownerDocument.defaultView.getComputedStyle(scroller);
    const bounds = globalBounds(scroller);
    const innerTop = bounds.top + scroller.clientTop;
    const innerBottom = innerTop + scroller.clientHeight;
    let visibleBottom = Math.min(innerBottom, window.innerHeight);
    const scrollerIndex = Math.max(0, Number(target.scrollerIndex) || 0);
    for (const element of target.ancestors.slice(scrollerIndex + 1)) {
      const outerStyle =
        element.ownerDocument.defaultView.getComputedStyle(element);
      if (
        element.tagName !== "IFRAME" &&
        !/auto|scroll|hidden|clip|overlay/.test(outerStyle.overflowY)
      ) {
        continue;
      }
      const outerBounds = globalBounds(element);
      visibleBottom = Math.min(
        visibleBottom,
        outerBounds.top + element.clientTop + element.clientHeight
      );
    }
    const boxExtras =
      style.boxSizing === "border-box"
        ? 0
        : [
            style.paddingTop,
            style.paddingBottom,
            style.borderTopWidth,
            style.borderBottomWidth,
          ].reduce((total, value) => total + (parseFloat(value) || 0), 0);
    const visibleHeight = Math.max(0, visibleBottom - innerTop);
    const maxHeight = Math.max(1, Math.floor(visibleHeight - boxExtras));
    const previousHeight = scroller.clientHeight;
    const reduction = Math.max(0, previousHeight - maxHeight);
    if (reduction < 1) return false;
    for (const property of ["min-height", "max-height"]) {
      runtime.styleRestores.push({
        element: scroller,
        property,
        value: scroller.style.getPropertyValue(property),
        priority: scroller.style.getPropertyPriority(property),
      });
    }
    scroller.style.setProperty("min-height", "0px", "important");
    scroller.style.setProperty("max-height", `${maxHeight}px`, "important");
    log("末屏单次压缩可视容器", {
      strategy: "compact",
      previousHeight,
      visibleHeight,
      maxHeight,
      reduction,
    });
    return true;
  }

  async function captureStableSlice(target, phaseLabel) {
    let lastState = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      assertRunning();
      await sleep(CONFIG.settleMs);
      const before = readState(target);
      lastState = before;
      const startedAt = Date.now();
      const shot = await captureSlice(before.rect);
      await sleep(100);
      const after = readState(target);
      if (before.signature === after.signature) {
        log(`${phaseLabel}截图完成`, {
          attempt,
          elapsedMs: Date.now() - startedAt,
          captureMode: shot.captureMode,
          requestedRect: before.rect,
          output: {
            width: shot.width,
            height: shot.height,
            bytes: shot.bytes,
          },
          scrollTop: before.scrollTop,
          scrollHeight: before.scrollHeight,
          clientHeight: before.clientHeight,
          contentTop: before.contentTop,
          totalHeight: before.totalHeight,
        });
        return { state: before, shot };
      }
      warn(`${phaseLabel}截图期间页面发生变化，重新截图`, { attempt });
    }
    fail("CAPTURE_UNSTABLE", `${phaseLabel}连续 3 次截图期间页面发生变化`, {
      state: lastState,
    });
  }

  function decodeImage(base64) {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    return image.decode().then(() => image);
  }

  async function cropNativeFrame(shot, rect) {
    if (!shot?.rawFrame) return shot;
    const viewport = shot.sourceViewport;
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
      fail("SCREENSHOT_VIEWPORT_MISSING", "完整截图缺少页面视口尺寸", shot);
    }
    const image = await decodeImage(shot.base64);
    const scaleX = image.naturalWidth / viewport.width;
    const scaleY = image.naturalHeight / viewport.height;
    const sourceX = Math.max(0, Math.round(rect.x * scaleX));
    const sourceY = Math.max(0, Math.round(rect.y * scaleY));
    const sourceWidth = Math.min(
      image.naturalWidth - sourceX,
      Math.max(1, Math.round(rect.width * scaleX))
    );
    const sourceHeight = Math.min(
      image.naturalHeight - sourceY,
      Math.max(1, Math.round(rect.height * scaleY))
    );
    if (sourceWidth < 1 || sourceHeight < 1) {
      fail("SCREENSHOT_CROP_EMPTY", "完整截图的裁剪区域为空", {
        rect,
        viewport,
        image: { width: image.naturalWidth, height: image.naturalHeight },
      });
    }
    const output = document.createElement("canvas");
    const outputWidth = Math.max(1, Math.round(rect.width * scaleX));
    const outputHeight = Math.max(1, Math.round(rect.height * scaleX));
    output.width = outputWidth;
    output.height = outputHeight;
    const context = output.getContext("2d");
    if (!context) fail("CANVAS_CONTEXT_FAILED", "无法创建原生长图裁剪画布");
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );
    const base64 = output.toDataURL("image/png").split(",")[1];
    output.width = 0;
    output.height = 0;
    if (!base64) fail("SCREENSHOT_CROP_FAILED", "原生长图裁剪返回空数据");
    log("Electron 完整帧已按页面视口裁切", {
      requestedRect: rect,
      sourceFrame: {
        width: image.naturalWidth,
        height: image.naturalHeight,
        viewport,
        scaleX,
        scaleY,
        sourceRect: {
          x: sourceX,
          y: sourceY,
          width: sourceWidth,
          height: sourceHeight,
        },
      },
      output: { width: outputWidth, height: outputHeight },
    });
    return {
      ...shot,
      base64,
      width: outputWidth,
      height: outputHeight,
      bytes:
        Math.floor((base64.length * 3) / 4) -
        (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0),
      croppedInRenderer: true,
    };
  }

  async function stitchSlices(slices, totalHeight) {
    if (!slices.length) fail("SCREENSHOT_EMPTY", "没有任何分片可以拼接");
    const firstImage = await decodeImage(slices[0].shot.base64);
    const scale = firstImage.naturalWidth / slices[0].state.rect.width;
    const width = firstImage.naturalWidth;
    const height = Math.round(totalHeight * scale);
    if (
      width < 1 ||
      height < 1 ||
      height > CONFIG.maxOutputHeight ||
      width * height > CONFIG.maxOutputPixels
    ) {
      fail("SCREENSHOT_TOO_LARGE", "拼接图片超过浏览器画布限制", {
        width,
        height,
        pixels: width * height,
      });
    }
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) fail("CANVAS_CONTEXT_FAILED", "无法创建长图画布");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);

    let covered = 0;
    for (let index = 0; index < slices.length; index++) {
      assertRunning();
      const slice = slices[index];
      if (slice.from !== covered || slice.to <= slice.from) {
        fail("SCREENSHOT_GAP", "分片之间不连续", {
          index,
          covered,
          from: slice.from,
          to: slice.to,
        });
      }
      const image =
        index === 0 ? firstImage : await decodeImage(slice.shot.base64);
      const sliceScale = image.naturalWidth / slice.state.rect.width;
      const expectedHeight = slice.state.rect.height * sliceScale;
      if (Math.abs(image.naturalHeight - expectedHeight) > 3) {
        fail("SCREENSHOT_SIZE_CHANGED", "分片图片尺寸与 DOM 裁切区域不一致", {
          index,
          naturalHeight: image.naturalHeight,
          rect: slice.state.rect,
          expectedHeight,
        });
      }
      const sourceTop =
        (slice.from - slice.state.contentTop) * sliceScale;
      const sourceHeight = (slice.to - slice.from) * sliceScale;
      if (
        sourceTop < -1 ||
        sourceTop + sourceHeight > image.naturalHeight + 2
      ) {
        fail("SCREENSHOT_INVALID_SLICE", "分片源区域超出图片范围", {
          index,
          sourceTop,
          sourceHeight,
          naturalHeight: image.naturalHeight,
          contentTop: slice.state.contentTop,
          from: slice.from,
          to: slice.to,
        });
      }
      const destinationTop = Math.round(slice.from * scale);
      const destinationBottom = Math.round(slice.to * scale);
      context.drawImage(
        image,
        0,
        Math.max(0, sourceTop),
        image.naturalWidth,
        sourceHeight,
        0,
        destinationTop,
        width,
        destinationBottom - destinationTop
      );
      covered = slice.to;
      log(`分片拼接完成 ${index + 1}/${slices.length}`, {
        from: slice.from,
        to: slice.to,
        sourceTop,
        sourceHeight,
        destinationTop,
        destinationBottom,
      });
    }
    if (covered < totalHeight - FINAL_SLICE_ROUNDING_TOLERANCE) {
      fail("SCREENSHOT_INCOMPLETE", "长图没有覆盖完整简历", {
        covered,
        totalHeight,
        missing: totalHeight - covered,
      });
    }
    const dataUrl = output.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    output.width = 0;
    output.height = 0;
    if (!base64) fail("SCREENSHOT_ENCODE_FAILED", "长图 base64 生成失败");
    const bytes =
      Math.floor((base64.length * 3) / 4) -
      (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
    return { dataUrl, base64, width, height, bytes };
  }

  function restoreStyles() {
    for (let index = runtime.styleRestores.length - 1; index >= 0; index--) {
      const restore = runtime.styleRestores[index];
      if (!restore.element?.isConnected) continue;
      if (restore.value) {
        restore.element.style.setProperty(
          restore.property,
          restore.value,
          restore.priority
        );
      } else {
        restore.element.style.removeProperty(restore.property);
      }
    }
    runtime.styleRestores = [];
  }

  function downloadDataUrl(dataUrl, width, height) {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `boss-long-resume-${Date.now()}-${width}x${height}.png`;
    anchor.style.display = "none";
    document.documentElement.appendChild(anchor);
    anchor.click();
    anchor.remove();
    log("长图下载已触发", { fileName: anchor.download, width, height });
  }

  async function captureLongResume(target) {
    if (!target.scroller) fail("SCROLLER_NOT_FOUND", "没有找到简历详情滚动器");
    const initialState = readState(target);
    runtime.originalScrollTop =
      runtime.originalScrollTop === null
        ? initialState.scrollTop
        : runtime.originalScrollTop;
    log("开始长图截图", {
      config: CONFIG,
      target: targetSummary(target),
      initialState,
    });
    await scrollToContentOffset(target, 0, "回简历顶部");
    const firstState = readState(target);
    const totalHeight = firstState.totalHeight;
    let covered = 0;
    let bottomRepairAttempted = false;
    const slices = [];

    async function finishPartialCapture(reason, state, details = {}) {
      if (!slices.length) {
        fail("SCREENSHOT_EMPTY", "简历无法继续覆盖，且没有可拼接的分片");
      }
      const stitched = await stitchSlices(slices, covered);
      warn("无法继续覆盖，拼接已获取分片", {
        reason,
        sliceCount: slices.length,
        capturedHeight: covered,
        totalHeight,
        missingHeight: Math.max(0, totalHeight - covered),
        width: stitched.width,
        height: stitched.height,
        scrollTop: state?.scrollTop,
        scrollHeight: state?.scrollHeight,
        clientHeight: state?.clientHeight,
        ...details,
      });
      return {
        ok: true,
        source: "boss-recommend-console-capture",
        frameUrl: target.frameUrl,
        scrollerClass: String(target.scroller.className || ""),
        captureMode: runtime.captureBackend?.kind || "unknown",
        width: stitched.width,
        height: stitched.height,
        bytes: stitched.bytes,
        totalHeight,
        covered,
        incomplete: covered < totalHeight,
        capturedHeight: covered,
        partialReason: reason,
        sliceCount: slices.length,
        base64: stitched.base64,
        dataUrl: stitched.dataUrl,
        slices: slices.map((slice) => ({
          from: slice.from,
          to: slice.to,
          contentTop: slice.state.contentTop,
          scrollTop: slice.state.scrollTop,
          rect: slice.state.rect,
          output: {
            width: slice.shot.width,
            height: slice.shot.height,
          },
        })),
      };
    }

    for (let index = 0; index < CONFIG.maxSlices; index++) {
      assertRunning();
      let before;
      try {
        before = readState(target);
      } catch (error) {
        if (
          bottomRepairAttempted &&
          slices.length &&
          isDomScrollerAtEnd(target)
        ) {
          return await finishPartialCapture(
            "resume-post-compact-unreachable",
            null,
            { errorCode: error?.code || null, errorMessage: error?.message || String(error) }
          );
        }
        throw error;
      }
      let bottom = Math.min(
        totalHeight,
        before.contentTop + before.rect.height
      );
      if (
        totalHeight - bottom > 2 &&
        isAtEnd(before) &&
        !bottomRepairAttempted
      ) {
        bottomRepairAttempted = true;
        makeBottomReachable(target);
        before = await scrollToContentOffset(
          target,
          Math.max(0, covered - CONFIG.overlap),
          "末屏修正"
        );
        bottom = Math.min(
          totalHeight,
          before.contentTop + before.rect.height
        );
      }
      if (before.contentTop > covered + 2) {
        fail("SCREENSHOT_GAP", "下一页截图起点晚于已覆盖区域", {
          covered,
          contentTop: before.contentTop,
          rect: before.rect,
        });
      }
      if (bottom <= covered) {
        if (slices.length && isAtEnd(before)) {
          return await finishPartialCapture(
            "resume-bottom-unreachable",
            before,
            { covered, bottom, contentTop: before.contentTop }
          );
        }
        fail("SCREENSHOT_NOT_ADVANCING", "分片没有增加新的覆盖高度", {
          covered,
          bottom,
          contentTop: before.contentTop,
          rect: before.rect,
        });
      }
      const phaseLabel = `分片 ${index + 1}`;
      let captured;
      try {
        captured = await captureStableSlice(target, phaseLabel);
      } catch (error) {
        if (bottomRepairAttempted && slices.length && isDomScrollerAtEnd(target)) {
          return await finishPartialCapture(
            "resume-post-compact-unreachable",
            null,
            { phaseLabel, errorCode: error?.code || null, errorMessage: error?.message || String(error) }
          );
        }
        throw error;
      }
      const sliceBottom = Math.min(
        totalHeight,
        captured.state.contentTop + captured.state.rect.height
      );
      if (sliceBottom <= covered) {
        if (slices.length && isAtEnd(captured.state)) {
          return await finishPartialCapture(
            "resume-bottom-unreachable",
            captured.state,
            { covered, sliceBottom, contentTop: captured.state.contentTop }
          );
        }
        fail("SCREENSHOT_NOT_ADVANCING", "稳定截图后的分片没有新增内容", {
          covered,
          sliceBottom,
          state: captured.state,
        });
      }
      slices.push({
        from: covered,
        to: sliceBottom,
        state: captured.state,
        shot: captured.shot,
      });
      const previousCovered = covered;
      covered = sliceBottom;
      let compactApplied = false;
      log("分片已入库", {
        slice: slices.length,
        from: previousCovered,
        to: covered,
        addedHeight: covered - previousCovered,
        totalHeight,
        rect: captured.state.rect,
        contentTop: captured.state.contentTop,
        scrollTop: captured.state.scrollTop,
        scrollHeight: captured.state.scrollHeight,
        clientHeight: captured.state.clientHeight,
      });
      if (hasOnlyFinalGap(captured.state, covered)) {
        log("末屏存在滚动条取整误差，按实际截取高度拼接", {
          totalHeight,
          coveredTo: covered,
          remainingHeight: totalHeight - covered,
          tolerance: FINAL_SLICE_ROUNDING_TOLERANCE,
          scrollTop: captured.state.scrollTop,
          scrollHeight: captured.state.scrollHeight,
          clientHeight: captured.state.clientHeight,
        });
        break;
      }
      if (totalHeight - covered > 2) {
        const nextContentOffset = Math.max(0, covered - CONFIG.overlap);
        const currentMaxScrollTop = Math.max(
          0,
          captured.state.scrollHeight - captured.state.clientHeight
        );
        const finalContentOffsetNeeded = Math.max(
          0,
          totalHeight - captured.state.rect.height
        );
        const reachableContentOffset = Math.min(
          nextContentOffset,
          finalContentOffsetNeeded
        );
        const missingScrollRange = reachableContentOffset - currentMaxScrollTop;
        if (missingScrollRange > 1 && !bottomRepairAttempted) {
          bottomRepairAttempted = true;
          compactApplied = makeBottomReachable(target);
          if (compactApplied) {
            log("预判末屏滚动不足，提前压缩可视容器", {
              nextContentOffset,
              reachableContentOffset,
              currentMaxScrollTop,
              missingScrollRange,
            });
          }
        }
      }
      if (isAtEnd(captured.state) && totalHeight - covered > 2) {
        if (!bottomRepairAttempted) {
          bottomRepairAttempted = true;
          compactApplied = makeBottomReachable(target);
        }
        if (!compactApplied) {
          return await finishPartialCapture(
            "resume-bottom-unreachable",
            captured.state,
            { covered, missingHeight: totalHeight - covered }
          );
        }
      }
      try {
        await scrollToContentOffset(
          target,
          Math.max(0, covered - CONFIG.overlap),
          phaseLabel
        );
      } catch (error) {
        if (bottomRepairAttempted && slices.length && isDomScrollerAtEnd(target)) {
          return await finishPartialCapture(
            "resume-post-compact-unreachable",
            null,
            { phaseLabel, errorCode: error?.code || null, errorMessage: error?.message || String(error) }
          );
        }
        throw error;
      }
    }
    if (covered < totalHeight - FINAL_SLICE_ROUNDING_TOLERANCE) {
      return await finishPartialCapture(
        "max-resume-slices",
        slices[slices.length - 1]?.state,
        { maxSlices: CONFIG.maxSlices }
      );
    }
    const stitched = await stitchSlices(slices, covered);
    return {
      ok: true,
      source: "boss-recommend-console-capture",
      frameUrl: target.frameUrl,
      scrollerClass: String(target.scroller.className || ""),
      captureMode: runtime.captureBackend?.kind || "unknown",
      width: stitched.width,
      height: stitched.height,
      bytes: stitched.bytes,
      totalHeight,
      covered,
      sliceCount: slices.length,
      base64: stitched.base64,
      dataUrl: stitched.dataUrl,
      slices: slices.map((slice) => ({
        from: slice.from,
        to: slice.to,
        contentTop: slice.state.contentTop,
        scrollTop: slice.state.scrollTop,
        rect: slice.state.rect,
        output: {
          width: slice.shot.width,
          height: slice.shot.height,
        },
      })),
    };
  }

  async function restoreOriginalScroll(target) {
    if (!target?.scroller?.isConnected || runtime.originalScrollTop === null) {
      return;
    }
    try {
      target.scroller.scrollTop = runtime.originalScrollTop;
      await waitForScrollStable(target.scroller, 1200);
      log("简历滚动位置已恢复", {
        expected: runtime.originalScrollTop,
        actual: target.scroller.scrollTop,
      });
    } catch (error) {
      warn("恢复简历滚动位置失败", {
        message: error?.message || String(error),
      });
    }
  }

  window.bossResumeCaptureStop = () => {
    runtime.stopped = true;
    warn("已请求停止，当前等待或截图结束后会退出");
  };

  window.bossResumeCapture = async (options = {}) => {
    if (runtime.running) {
      fail(
        "CAPTURE_ALREADY_RUNNING",
        "长简历截图正在执行，请等待或调用 bossResumeCaptureStop()"
      );
    }
    if (window.top !== window) {
      fail("WRONG_CONSOLE_CONTEXT", "请在 BOSS 页面 top frame 的控制台执行本脚本");
    }
    if (!/(^|\.)zhipin\.com$/i.test(location.hostname)) {
      fail("NOT_ON_BOSS", `当前页面不是 BOSS 直聘：${location.hostname}`);
    }

    Object.assign(CONFIG, options || {});
    runtime.running = true;
    runtime.stopped = false;
    runtime.originalScrollTop = null;
    runtime.styleRestores = [];
    let target = null;
    const startedAt = Date.now();

    try {
      console.group(`${LOG_PREFIX} 开始`);
      log("运行配置", CONFIG);
      log("页面信息", {
        url: location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        devicePixelRatio: window.devicePixelRatio,
      });
      await prepareCaptureBackend();
      target = await requireCurrentDetail();
      const result = await captureLongResume(target);
      window.__bossResumeCaptureResult = result;
      window.__bossResumeCaptureError = null;
      log("长图截图完成 ✓", {
        captureMode: result.captureMode,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        sliceCount: result.sliceCount,
        elapsedMs: Date.now() - startedAt,
      });
      console.log(`${LOG_PREFIX} 最终 base64：`, result.base64);
      log("完整结果对象：window.__bossResumeCaptureResult");
      if (CONFIG.downloadImage) {
        downloadDataUrl(result.dataUrl, result.width, result.height);
      }
      if (CONFIG.copyBase64 && typeof copy === "function") {
        copy(result.base64);
        log("最终 base64 已复制到剪贴板");
      }
      return result;
    } catch (error) {
      window.__bossResumeCaptureError = error;
      console.error(`${LOG_PREFIX} 长图截图失败 ✗`, {
        code: error?.code || "UNKNOWN",
        message: error?.message || String(error),
        details: error?.details,
        elapsedMs: Date.now() - startedAt,
      });
      throw error;
    } finally {
      await restoreOriginalScroll(target);
      restoreStyles();
      stopDisplayCapture();
      runtime.running = false;
      console.groupEnd();
    }
  };

  function mountStartButton() {
    document.getElementById("boss-resume-console-capture-start")?.remove();
    const button = document.createElement("button");
    button.id = "boss-resume-console-capture-start";
    button.type = "button";
    button.textContent = "开始长简历截图";
    button.style.cssText = [
      "position:fixed",
      "right:24px",
      "bottom:24px",
      "z-index:2147483647",
      "padding:10px 16px",
      "border:0",
      "border-radius:6px",
      "background:#1677ff",
      "color:#fff",
      "font-size:14px",
      "line-height:20px",
      "cursor:pointer",
      "box-shadow:0 4px 16px rgba(0,0,0,.24)",
    ].join(";");
    button.addEventListener("click", async () => {
      if (runtime.running) return;
      button.disabled = true;
      button.style.display = "none";
      try {
        await window.bossResumeCapture();
        button.remove();
      } catch {
        button.disabled = false;
        button.style.display = "block";
      }
    });
    document.documentElement.appendChild(button);
  }

  window.bossResumeCaptureStart = () => window.bossResumeCapture();
  mountStartButton();
  console.info(
    `${LOG_PREFIX} 脚本已加载，请点击页面右下角“开始长简历截图”按钮。` +
      "Firefox 必须在这次点击后弹出的共享框中选择 BOSS 标签页。" +
      "结果：window.__bossResumeCaptureResult?.base64"
  );
})();
