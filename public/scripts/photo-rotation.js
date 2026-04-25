const photoSection = document.querySelector("[data-photo-rotation]");

if (photoSection) {
  const photoLink = photoSection.querySelector("[data-photo-link]");
  const photoImage = photoSection.querySelector("[data-photo-image]");
  const photoPreviewImage = photoSection.querySelector("[data-photo-preview-image]");
  const photoTitle = photoSection.querySelector("[data-photo-title]");
  const photoCaption = photoSection.querySelector("[data-photo-caption]");
  const photoPreviewTitle = photoSection.querySelector("[data-photo-preview-title]");
  const photoPreviewCaption = photoSection.querySelector("[data-photo-preview-caption]");
  const photoPreviewLink = photoSection.querySelector("[data-photo-preview-link]");
  const photoPreviewFull = photoSection.querySelector("[data-photo-preview-full]");
  const lastPhotoStorageKey = "homepage-last-photo-id";

  try {
    const photos = JSON.parse(photoSection.dataset.photoRotation || "[]");

    if (Array.isArray(photos) && photos.length > 0 && photoImage && photoTitle && photoCaption) {
      const now = Date.now();
      const within24Hours = 24 * 60 * 60 * 1000;
      const newestPhoto = photos[0];
      const newestPhotoTime = Date.parse(newestPhoto.date);

      let chosenPhoto = newestPhoto;

      if (!Number.isNaN(newestPhotoTime) && now - newestPhotoTime > within24Hours) {
        const lastPhotoId = localStorage.getItem(lastPhotoStorageKey);
        const availablePhotos =
          photos.length > 1 ? photos.filter((photo) => photo.id !== lastPhotoId) : photos;
        const randomIndex = Math.floor(Math.random() * availablePhotos.length);
        chosenPhoto = availablePhotos[randomIndex];
      }

      photoImage.src = chosenPhoto.image;
      photoImage.alt = chosenPhoto.alt;

      if (photoPreviewImage) {
        photoPreviewImage.src = chosenPhoto.image;
        photoPreviewImage.alt = chosenPhoto.alt;
      }

      photoTitle.textContent = chosenPhoto.title;
      photoCaption.textContent = chosenPhoto.caption;

      if (photoPreviewTitle) {
        photoPreviewTitle.textContent = chosenPhoto.title;
      }

      if (photoPreviewCaption) {
        photoPreviewCaption.textContent = chosenPhoto.caption;
      }

      if (photoLink && chosenPhoto.id) {
        photoLink.href = `/photos/${chosenPhoto.id}/`;
      }

      if (photoPreviewLink && chosenPhoto.id) {
        photoPreviewLink.href = `/photos/${chosenPhoto.id}/`;
        photoPreviewLink.setAttribute("aria-label", `Open ${chosenPhoto.title}`);
      }

      if (photoPreviewFull) {
        photoPreviewFull.href = chosenPhoto.image;
      }

      if (chosenPhoto.id) {
        localStorage.setItem(lastPhotoStorageKey, chosenPhoto.id);
      }
    }
  } catch (error) {
    console.warn("[photo-rotation] unable to rotate homepage photo", error);
  }
}
