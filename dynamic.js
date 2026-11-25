
/* STAYGO DYNAMIC ENGINE 1.0 */

(async function () {

  const cover = document.getElementById("dynamicCover");

  if (!cover) return;

  const seasons = {
    winter: [
      "Dolomites winter snow",
      "Swiss Alps winter",
      "Norway snowy mountains",
      "Lapland winter landscape"
    ],
    spring: [
      "Tuscany landscape",
      "Japan cherry blossoms",
      "Madeira landscape",
      "Amsterdam spring"
    ],
    summer: [
      "Amalfi Coast",
      "Sardinia beaches",
      "Greek islands landscape",
      "Mallorca coast"
    ],
    autumn: [
      "Scotland Highlands autumn",
      "Canadian Rockies autumn",
      "Dolomites autumn",
      "Bavaria autumn landscape"
    ]
  };

  const now = new Date();
  const month = now.getMonth() + 1;
  const day = Math.floor(Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ) / 86400000);

  const season =
    month === 12 || month <= 2 ? "winter" :
    month <= 5 ? "spring" :
    month <= 8 ? "summer" : "autumn";

  const destinations = seasons[season];
  const destination =
    destinations[day % destinations.length];

  const clean = value => {
    const doc = new DOMParser().parseFromString(
      value || "", "text/html"
    );
    return doc.body.textContent.trim();
  };

  try {

    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: destination + " filetype:bitmap",
      gsrnamespace: "6",
      gsrlimit: "30",
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

    if (!response.ok) return;

    const data = await response.json();

    const photos = Object.values(
      data.query?.pages || {}
    ).map(page => page.imageinfo?.[0])
     .filter(info => {
       if (!info) return false;

       const meta = info.extmetadata || {};
       const license = meta.LicenseShortName?.value || "";
       const licenseUrl = meta.LicenseUrl?.value || "";

       return (
         ["CC BY 4.0", "CC BY-SA 4.0", "CC0"]
           .includes(license) &&
         licenseUrl.startsWith("https://creativecommons.org/") &&
         info.mime === "image/jpeg" &&
         info.width >= 1600 &&
         info.width > info.height &&
         info.thumburl &&
         info.descriptionurl &&
         clean(meta.Artist?.value) &&
         !meta.Restrictions?.value
       );
     });

    if (!photos.length) return;

    photos.sort((a, b) =>
      a.descriptionurl.localeCompare(b.descriptionurl)
    );

    const photo = photos[day % photos.length];
    const meta = photo.extmetadata;

    const preview = new Image();

    preview.onload = () => {

      const credit = document.createElement("div");

      credit.style.cssText =
        "font-size:10px;padding:8px 12px;" +
        "background:#14151A;color:#A6A8B2;" +
        "line-height:1.5;";

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

      const section = cover.closest("section");

      if (!section) return;

      section.after(credit);

      cover.src = photo.thumburl;
      cover.alt = "Ispirazione di viaggio: " + destination;

    };

    preview.src = photo.thumburl;

  } catch (error) {

    console.warn("STAYGO Dynamic Engine:", error);

  }

})();
