const photoData = window.personalTrackerData;
const projectPhotoGrid = document.querySelector("#project-photo-grid");
const localPhotoGrid = document.querySelector("#local-photo-grid");
const photoInput = document.querySelector("#photo-input");

function createPhotoCard(src, label) {
  const card = document.createElement("article");
  card.className = "photo-card";
  card.innerHTML = `
    <img src="${src}" alt="${label}" />
    <div class="photo-label">${label}</div>
  `;
  return card;
}

function renderProjectPhotos() {
  if (!photoData.photos.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "当前 `photos/` 目录还没有图片。";
    projectPhotoGrid.appendChild(empty);
    return;
  }

  photoData.photos.forEach((photo) => {
    projectPhotoGrid.appendChild(createPhotoCard(photo.path, photo.name));
  });
}

photoInput.addEventListener("change", (event) => {
  localPhotoGrid.innerHTML = "";
  const files = Array.from(event.target.files || []);

  files.forEach((file) => {
    const src = URL.createObjectURL(file);
    localPhotoGrid.appendChild(createPhotoCard(src, file.name));
  });
});

renderProjectPhotos();

