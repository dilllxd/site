const viewerRoots = document.querySelectorAll("[data-photo-viewer]");

for (const viewer of viewerRoots) {
  const mode = viewer.dataset.photoViewerMode || "inline";
  const trigger = viewer.querySelector("[data-photo-viewer-trigger]");
  const overlay = viewer.querySelector("[data-photo-viewer-overlay]");
  const viewport = viewer.querySelector("[data-photo-viewer-viewport]");
  const image = viewer.querySelector("[data-photo-viewer-image]");
  const zoomInButton = viewer.querySelector("[data-photo-viewer-zoom-in]");
  const zoomOutButton = viewer.querySelector("[data-photo-viewer-zoom-out]");
  const zoomResetButton = viewer.querySelector("[data-photo-viewer-zoom-reset]");
  const closeButton = viewer.querySelector("[data-photo-viewer-close]");

  if (!viewport || !image) {
    continue;
  }

  const minZoom = 1;
  const maxZoom = 4;
  const zoomStep = 0.25;

  let lastFocus = null;
  let wasVisible = false;
  let previewZoom = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let movedDuringDrag = false;

  const upgradeToFull = () => {
    const full = image.dataset.fullSrc;
    if (!full || image.dataset.fullLoaded) return;
    image.dataset.fullLoaded = "1";
    const picture = image.closest("picture");
    picture?.querySelectorAll("source").forEach((s) => s.remove());
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.src = full;
  };

  const applyTransform = () => {
    image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${previewZoom})`;
  };

  let lockY = 0;
  let lockX = 0;
  let locked = false;
  const root = document.documentElement;
  let savedRootStyle = "";
  let savedBodyStyle = "";
  const lockScroll = () => {
    if (locked) return;
    locked = true;
    lockX = window.scrollX;
    lockY = window.scrollY;
    const pageWidth = root.clientWidth;
    savedRootStyle = root.style.cssText;
    savedBodyStyle = document.body.style.cssText;
    root.style.overflow = "hidden";
    root.style.scrollbarGutter = "auto";
    // Preserve the pre-lock layout width instead of compensating twice.
    Object.assign(document.body.style, { overflow: "hidden", position: "fixed", top: -lockY + "px", left: -lockX + "px", right: "auto", width: pageWidth + "px" });
  };
  const unlockScroll = () => {
    if (!locked) return;
    locked = false;
    root.style.cssText = savedRootStyle;
    document.body.style.cssText = savedBodyStyle;
    const prev = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(lockX, lockY);
    root.style.scrollBehavior = prev;
  };

  const setVisible = (nextVisible) => {
    if (mode !== "overlay") {
      return;
    }

    viewer.classList.toggle("is-photo-preview-visible", nextVisible);
    if (nextVisible) upgradeToFull();
    if (overlay) {
      overlay.setAttribute("aria-hidden", nextVisible ? "false" : "true");
      overlay.toggleAttribute("inert", !nextVisible);
    }
    if (mode === "overlay") {
      if (nextVisible) lockScroll(); else unlockScroll();
    }
    if (nextVisible && !wasVisible) {
      const active = document.activeElement;
      lastFocus = active && active !== document.body && active.matches("button, a[href]") ? active : viewer.querySelector("[data-photo-viewer-open]");
      closeButton?.focus({ preventScroll: true });
    } else if (!nextVisible && wasVisible) {
      lastFocus?.focus?.({ preventScroll: true });
    }
    wasVisible = nextVisible;
  };

  const resetPan = () => {
    panX = 0;
    panY = 0;
    applyTransform();
  };

  const updateZoomControls = () => {
    if (zoomResetButton) {
      zoomResetButton.textContent = `${Math.round(previewZoom * 100)}%`;
    }
    if (zoomOutButton) {
      zoomOutButton.disabled = previewZoom <= minZoom;
    }
    if (zoomInButton) {
      zoomInButton.disabled = previewZoom >= maxZoom;
    }

    viewer.classList.toggle("is-zoomed", previewZoom > 1);
  };

  const updateZoom = (nextZoom) => {
    previewZoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
    if (previewZoom > 1) upgradeToFull();
    if (previewZoom <= 1) {
      resetPan();
    } else {
      applyTransform();
    }
    updateZoomControls();
  };

  const keepOpen = () => {
    if (mode !== "overlay") {
      return;
    }

    setVisible(true);
  };

  const closeViewer = () => {
    setVisible(false);
    viewer.classList.remove("is-panning");
    isDragging = false;
    movedDuringDrag = false;
    updateZoom(1);
  };

  if (mode === "overlay" && overlay) {
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("inert", "");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Photo viewer");
    const openers = viewer.querySelectorAll("[data-photo-viewer-open]");
    for (const opener of openers) {
      opener.addEventListener("click", () => {
        setVisible(true);
      });
    }
    trigger?.addEventListener("click", () => setVisible(true));
    overlay.addEventListener("touchmove", (event) => {
      if (event.touches.length > 1) return;
      if (viewport.contains(event.target) && previewZoom > 1) return;
      event.preventDefault();
    }, { passive: false });
    document.addEventListener("keydown", (event) => {
      if (!wasVisible || event.key !== "Tab") return;
      const items = [...overlay.querySelectorAll("button:not(:disabled), a[href]")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!overlay.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true }); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  if (overlay) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeViewer();
      }
    });
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeViewer);
  }

  if (zoomInButton) {
    zoomInButton.addEventListener("click", () => {
      keepOpen();
      updateZoom(previewZoom + zoomStep);
    });
  }

  if (zoomOutButton) {
    zoomOutButton.addEventListener("click", () => {
      keepOpen();
      updateZoom(previewZoom - zoomStep);
    });
  }

  if (zoomResetButton) {
    zoomResetButton.addEventListener("click", () => {
      keepOpen();
      updateZoom(1);
    });
  }

  viewport.addEventListener("pointerdown", (event) => {
    if (previewZoom <= 1) {
      return;
    }

    event.preventDefault();
    keepOpen();
    isDragging = true;
    movedDuringDrag = false;
    dragStartX = event.clientX - panX;
    dragStartY = event.clientY - panY;
    viewer.classList.add("is-panning");
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!isDragging || previewZoom <= 1) {
      return;
    }

    panX = event.clientX - dragStartX;
    panY = event.clientY - dragStartY;
    movedDuringDrag = true;
    applyTransform();
  });

  const stopDragging = (event) => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    viewer.classList.remove("is-panning");
    if (typeof event.pointerId === "number") {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
  viewport.addEventListener("lostpointercapture", () => {
    isDragging = false;
    viewer.classList.remove("is-panning");
  });

  viewport.addEventListener(
    "wheel",
    (event) => {
      if (mode === "overlay" && !viewer.classList.contains("is-photo-preview-visible")) {
        return;
      }

      event.preventDefault();
      keepOpen();
      updateZoom(previewZoom + (event.deltaY < 0 ? zoomStep : -zoomStep));
    },
    { passive: false },
  );

  viewport.addEventListener("click", () => {
    if (movedDuringDrag) {
      movedDuringDrag = false;
      return;
    }

    keepOpen();
    if (previewZoom > 1) {
      updateZoom(1);
    } else {
      updateZoom(2);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mode === "overlay" && viewer.classList.contains("is-photo-preview-visible")) {
      closeViewer();
    }
  });

  image.style.transformOrigin = "center center";
  image.style.willChange = "transform";
  updateZoom(1);
}
