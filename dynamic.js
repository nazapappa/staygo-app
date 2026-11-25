
/* STAYGO DYNAMIC ENGINE 2.0 */

(async function () {

  const now = new Date();
  const month = now.getMonth() + 1;
  const day = Math.floor(Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ) / 86400000);

  const seasons = {
    winter: [
      "Dolomites snowy mountains",
      "Swiss Alps winter landscape",
      "Norway winter fjord",
      "Lapland snowy landscape"
    ],
    spring: [
      "Tuscany hills spring",
      "Japan cherry blossoms landscape",
      "Madeira coastal landscape",
      "Provence spring landscape"
    ],
    summer: [
      "Amalfi Coast panorama",
      "Sardinia turquoise sea",
      "Santorini landscape",
      "Mallorca coastline"
    ],
    autumn: [
      "Dolomites autumn landscape",
      "Scotland Highlands landscape",
      "Canadian Rockies autumn lake",
      "Bavaria autumn mountains"
    ]
  };

  const moods = {
    liberta: [
      "Pacific Coast scenic landscape",
      "Iceland open landscape",
      "Portugal ocean cliffs",
      "Norway fjord panorama"
    ],
    romanticismo: [
      "Venice Grand Canal sunset",
      "Paris sunset cityscape",
      "Santorini sunset",
      "Lake Como landscape"
    ],
    avventura: [
      "Dolomites mountain peaks",
      "Patagonia mountains",
      "Iceland waterfalls",
      "Swiss Alps landscape"
    ],
    esclusivita: [
      "Monaco panoramic coastline",
      "Capri coastal landscape",
      "French Riviera panorama",
      "Lake Como historic villas landscape"
    ],
    relax: [
      "Maldives tropical beach",
      "Seychelles beach landscape",
      "Bali rice terraces",
      "Sardinia turquoise beach"
    ]
  };

  const season =
    month === 12 || month <= 2 ? "winter" :
    month <= 5 ? "spring" :
    month <= 8 ? "summer" : "autumn";

  const clean = value => {
    const doc = new DOMParser().parseFromString(
      value || "", "text/html"
    );

    return doc.body.textContent.trim();
  };

  const usedPhotos = new Set();

  async function loadPhoto(queries, offset) {

    const destination =
      queries[(day + offset) % queries.length];

    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: destination + " filetype:bitmap",
      gsrnamespace: "6",
      gsrlimit: "50",
      prop: "imageinfo",
      iiprop: "url|extmetadata|size|mime",
      iiurlwidth: "1600",
      format: "json",
      origin: "*"
    });

    const response = await fetch(
      "https://commons.wikimedia.org/w/api.php?" +
      params.toString()
    );

    if (!response.ok) return null;

    const data = await response.json();

    const photos = Object.values(
      data.query?.pages || {}
    )
    .map(page => page.imageinfo?.[0])
    .filter(info => {

      if (!info) return false;

      const meta = info.extmetadata || {};

      const license =
        meta.LicenseShortName?.value || "";

      const licenseUrl =
        meta.LicenseUrl?.value || "";

      return (
        ["CC BY 4.0", "CC BY-SA 4.0", "CC0"]
          .includes(license) &&
        licenseUrl.startsWith(
          "https://creativecommons.org/"
        ) &&
        info.mime === "image/jpeg" &&
        info.width >= 2400 &&
        info.height >= 1400 &&
        info.width / info.height >= 1.3 &&
        info.width / info.height <= 2.2 &&
        info.thumburl &&
        info.descriptionurl &&
        clean(meta.Artist?.value) &&
        !meta.Restrictions?.value &&
        !usedPhotos.has(info.descriptionurl)
      );

    });

    if (!photos.length) return null;

    photos.sort((a, b) =>
      a.descriptionurl.localeCompare(b.descriptionurl)
    );

    const photo =
      photos[(day + offset) % photos.length];

    usedPhotos.add(photo.descriptionurl);

    return { photo, destination };

  }

  function createCredit(photo) {

    const meta = photo.extmetadata;

    const credit = document.createElement("div");

    credit.style.cssText =
      "font-size:10px;padding:7px 4px;" +
      "color:#A6A8B2;line-height:1.5;";

    const source = document.createElement("a");

    source.href = photo.descriptionurl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.style.color = "#E6D9FF";

    source.textContent =
      clean(meta.ObjectName?.value) ||
      "Fotografia originale";

    const license = document.createElement("a");

    license.href = meta.LicenseUrl.value;
    license.target = "_blank";
    license.rel = "noopener noreferrer";
    license.style.color = "#E6D9FF";
    license.textContent = meta.LicenseShortName.value;

    credit.append(
      source,
      " — " + clean(meta.Artist.value) + " · ",
      license,
      " · Wikimedia Commons · Immagine ritagliata"
    );

    return credit;

  }

  async function updateImage(img, queries, offset, isCover) {

    try {

      const result = await loadPhoto(queries, offset);

      if (!result) return;

      const { photo, destination } = result;

      const preview = new Image();

      await new Promise((resolve, reject) => {
        preview.onload = resolve;
        preview.onerror = reject;
        preview.src = photo.thumburl;
      });

      const credit = createCredit(photo);

      if (isCover) {

        const section = img.closest("section");

        if (!section) return;

        section.after(credit);

      } else {

        const card = img.closest(".mood");

        if (!card) return;

        const group = card.closest(".atmospheres");

        if (!group) return;

        let credits = document.getElementById(
          "atmosphereCredits"
        );

        if (!credits) {

          credits = document.createElement("div");

          credits.id = "atmosphereCredits";

          credits.style.cssText =
            "margin-top:12px;padding:0 4px;";

          group.after(credits);

        }

        const name = document.createElement("strong");

        name.textContent =
          (card.querySelector("strong")?.textContent ||
          img.dataset.mood) + " ";

        credit.prepend(name);

        credits.append(credit);

      }

      img.src = photo.thumburl;

      img.alt = "Ispirazione di viaggio: " + destination;

    } catch (error) {

      console.warn("STAYGO Dynamic Engine:", error);

    }

  }

  const cover = document.getElementById("dynamicCover");

  if (cover) {

    await updateImage(
      cover,
      seasons[season],
      0,
      true
    );

  }

  const images = document.querySelectorAll(
    ".atmospheres img[data-mood]"
  );

  let offset = 1;

  for (const img of images) {

    const mood = img.dataset.mood;

    if (moods[mood]) {

      await updateImage(
        img,
        moods[mood],
        offset,
        false
      );

    }

    offset++;

  }

})();
