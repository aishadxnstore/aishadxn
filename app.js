(function () {
  const $ = (id) => document.getElementById(id);
  let products = [];
  let currency = "$";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function load() {
    try {
      const res = await fetch("data/products.json?t=" + Date.now());
      const data = await res.json();
      const s = data.settings || {};
      currency = s.currency || "$";
      if (s.shopName) {
        $("shopName").textContent = s.shopName;
        $("footName").textContent = s.shopName;
        document.title = s.shopName;
      }
      $("tagline").textContent = s.tagline || "";
      products = data.products || [];
    } catch (e) {
      products = [];
    }
    $("year").textContent = new Date().getFullYear();
    fillCategories();
    render();
  }

  function fillCategories() {
    const cats = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
    $("category").innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join("");
  }

  function card(p) {
    const imgs = (p.images || []).filter(Boolean);
    const main = imgs.length ? `<img src="${esc(imgs[0])}" alt="${esc(p.name)}" loading="lazy">` : "🌿";
    const thumbs = imgs.length > 1
      ? `<div class="thumbs">${imgs.map((src, i) => `<img src="${esc(src)}" alt="" data-src="${esc(src)}" class="${i === 0 ? "active" : ""}">`).join("")}</div>`
      : "";
    return `<article class="card">
      <div class="main">${main}</div>${thumbs}
      <div class="body">
        ${p.category ? `<div class="cat">${esc(p.category)}</div>` : ""}
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description)}</p>
        <div class="price">${esc(currency)}${esc(p.price)}</div>
      </div>
    </article>`;
  }

  function render() {
    const q = $("search").value.trim().toLowerCase();
    const cat = $("category").value;
    const list = products.filter((p) =>
      (!cat || p.category === cat) &&
      (!q || (p.name + " " + p.description + " " + (p.category || "")).toLowerCase().includes(q))
    );
    $("grid").innerHTML = list.map(card).join("");
    $("empty").classList.toggle("hidden", list.length > 0);
  }

  // thumbnail switching
  $("grid").addEventListener("click", (e) => {
    const t = e.target.closest(".thumbs img");
    if (!t) return;
    const c = t.closest(".card");
    c.querySelector(".main img").src = t.dataset.src;
    c.querySelectorAll(".thumbs img").forEach((i) => i.classList.toggle("active", i === t));
  });

  $("search").addEventListener("input", render);
  $("category").addEventListener("change", render);
  load();
})();
