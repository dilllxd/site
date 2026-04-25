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
  const hoverDelayMs = 450;
  const hoverLeaveDelayMs = 140;

  let hoverTimer = null;
  let leaveTimer = null;
  let previewZoom = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let movedDuringDrag = false;

  const applyTransform = () => {
    image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${previewZoom})`;
  };

  const setVisible = (nextVisible) => {
    if (mode !== "overlay") {
      return;
    }

    viewer.classList.toggle("is-photo-preview-visible", nextVisible);
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

    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    setVisible(true);
  };

  const closeViewer = () => {
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    setVisible(false);
    viewer.classList.remove("is-panning");
    isDragging = false;
    movedDuringDrag = false;
    updateZoom(1);
  };

  const startHoverOpen = () => {
    if (mode !== "overlay") {
      return;
    }

    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    hoverTimer = window.setTimeout(() => {
      setVisible(true);
    }, hoverDelayMs);
  };

  const startHoverClose = () => {
    if (mode !== "overlay") {
      return;
    }

    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      closeViewer();
    }, hoverLeaveDelayMs);
  };

  if (trigger) {
    trigger.addEventListener("mouseenter", startHoverOpen);
    trigger.addEventListener("mouseleave", startHoverClose);
    trigger.addEventListener("focus", startHoverOpen);
    trigger.addEventListener("blur", startHoverClose);
  }

  if (overlay) {
    overlay.addEventListener("mouseenter", keepOpen);
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
    if (event.key === "Escape" && mode === "overlay") {
      closeViewer();
    }
  });

  image.style.transformOrigin = "center center";
  image.style.willChange = "transform";
  updateZoom(1);
}
