(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DATA_PATH = "data/products.json";

  let cfg = null;          // {owner, repo, branch, token}
  let data = { settings: {}, products: [] };
  let dataSha = null;
  let formImages = [];     // existing image paths kept on the product
  let newFiles = [];       // File objects waiting to be uploaded

  /* ---------- helpers ---------- */
  function msg(el, text, type) {
    el.className = "msg " + (type || "info");
    el.textContent = text;
    if (!text) el.className = "msg";
  }
  const b64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  };
  const unb64 = (s) => {
    const bin = atob(s.replace(/\n/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";

  /* ---------- GitHub API ---------- */
  function url(path) {
    return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
  }
  async function gh(path, opts = {}) {
    const res = await fetch(url(path) + (opts.method && opts.method !== "GET" ? "" : `?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`), {
      ...opts,
      headers: {
        Authorization: "Bearer " + cfg.token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message; } catch (e) {}
      const err = new Error(`GitHub error ${res.status}: ${detail}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  async function putFile(path, contentB64, message, sha) {
    return gh(path, {
      method: "PUT",
      body: JSON.stringify({ message, content: contentB64, branch: cfg.branch, ...(sha ? { sha } : {}) }),
    });
  }
  async function deleteFile(path) {
    try {
      const f = await gh(path);
      await gh(path, { method: "DELETE", body: JSON.stringify({ message: "Remove image " + path, sha: f.sha, branch: cfg.branch }) });
    } catch (e) { /* best effort */ }
  }

  async function loadData() {
    const f = await gh(DATA_PATH);
    dataSha = f.sha;
    data = JSON.parse(unb64(f.content));
    data.settings = data.settings || {};
    data.products = data.products || [];
  }
  async function saveData(message) {
    const res = await putFile(DATA_PATH, b64(JSON.stringify(data, null, 2) + "\n"), message, dataSha);
    dataSha = res.content.sha;
  }

  /* ---------- image resize ---------- */
  function resizeToBase64(file, max = 1100, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const u = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        resolve(c.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.onerror = () => reject(new Error("Could not read image: " + file.name));
      img.src = u;
    });
  }

  /* ---------- auth ---------- */
  async function signIn() {
    cfg = {
      owner: $("owner").value.trim(),
      repo: $("repo").value.trim(),
      branch: $("branch").value.trim() || "main",
      token: $("token").value.trim(),
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) return msg($("loginMsg"), "Please fill in all fields.", "err");
    msg($("loginMsg"), "Connecting...", "info");
    try {
      await loadData();
    } catch (e) {
      cfg = null;
      const hint = e.status === 401 || e.status === 403 ? " Check that the token is valid and has Contents: Read and write access to this repo."
        : e.status === 404 ? " Check the username, repo name, branch, and that data/products.json exists." : "";
      return msg($("loginMsg"), e.message + hint, "err");
    }
    try {
      const store = $("remember").checked ? localStorage : sessionStorage;
      localStorage.removeItem("nsAdmin"); sessionStorage.removeItem("nsAdmin");
      store.setItem("nsAdmin", JSON.stringify(cfg));
    } catch (e) {}
    $("token").value = "";
    msg($("loginMsg"), "");
    showDash();
  }
  function signOut() {
    cfg = null;
    try { localStorage.removeItem("nsAdmin"); sessionStorage.removeItem("nsAdmin"); } catch (e) {}
    $("dashView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
  }

  /* ---------- dashboard ---------- */
  function showDash() {
    $("loginView").classList.add("hidden");
    $("dashView").classList.remove("hidden");
    renderList();
  }
  function renderList() {
    const cur = data.settings.currency || "$";
    $("count").textContent = data.products.length;
    $("cats").innerHTML = [...new Set(data.products.map((p) => p.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join("");
    $("list").innerHTML = data.products.length
      ? data.products.map((p) => {
          const img = (p.images || [])[0];
          return `<div class="list-item">
            <div class="th">${img ? `<img src="${esc(img.startsWith("http") ? img : "https://raw.githubusercontent.com/" + cfg.owner + "/" + cfg.repo + "/" + cfg.branch + "/" + img)}" alt="">` : "🌿"}</div>
            <div class="info"><b>${esc(p.name)}</b><span>${esc(p.category || "")} · ${esc(cur)}${esc(p.price)}</span></div>
            <button class="secondary" data-edit="${esc(p.id)}">Edit</button>
            <button class="danger" data-del="${esc(p.id)}">Delete</button>
          </div>`;
        }).join("")
      : '<p class="small">No products yet. Click “Add product”.</p>';
  }

  /* ---------- product form ---------- */
  function openForm(p) {
    $("formPanel").classList.remove("hidden");
    $("settingsPanel").classList.add("hidden");
    $("formTitle").textContent = p ? "Edit product" : "Add product";
    $("pId").value = p ? p.id : "";
    $("pName").value = p ? p.name : "";
    $("pPrice").value = p ? p.price : "";
    $("pCategory").value = p ? p.category || "" : "";
    $("pDesc").value = p ? p.description || "" : "";
    $("pFiles").value = "";
    formImages = p ? [...(p.images || [])] : [];
    newFiles = [];
    msg($("formMsg"), "");
    renderPreview();
    $("formPanel").scrollIntoView({ behavior: "smooth" });
  }
  function closeForm() { $("formPanel").classList.add("hidden"); }

  function renderPreview() {
    const raw = (p) => (p.startsWith("http") ? p : `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${p}`);
    $("pPreview").innerHTML =
      formImages.map((p, i) => `<div class="pv"><img src="${esc(raw(p))}" alt=""><button class="x" data-rm-old="${i}" title="Remove">×</button></div>`).join("") +
      newFiles.map((f, i) => `<div class="pv"><img src="${URL.createObjectURL(f)}" alt=""><button class="x" data-rm-new="${i}" title="Remove">×</button></div>`).join("");
  }

  async function saveProduct() {
    const name = $("pName").value.trim();
    const price = parseFloat($("pPrice").value);
    if (!name) return msg($("formMsg"), "Name is required.", "err");
    if (isNaN(price) || price < 0) return msg($("formMsg"), "Enter a valid price.", "err");

    const btn = $("saveProduct");
    btn.disabled = true;
    try {
      const id = $("pId").value || slug(name) + "-" + Date.now().toString(36);
      const images = [...formImages];
      for (let i = 0; i < newFiles.length; i++) {
        msg($("formMsg"), `Uploading image ${i + 1} of ${newFiles.length}...`, "info");
        const content = await resizeToBase64(newFiles[i]);
        const path = `images/${slug(name)}-${Date.now().toString(36)}-${i}.jpg`;
        await putFile(path, content, "Add image for " + name);
        images.push(path);
      }
      const product = { id, name, category: $("pCategory").value.trim(), description: $("pDesc").value.trim(), price, images };

      // refresh sha in case it changed, then merge
      msg($("formMsg"), "Saving product...", "info");
      await loadData();
      const idx = data.products.findIndex((p) => p.id === id);
      if (idx >= 0) data.products[idx] = product; else data.products.push(product);
      await saveData((idx >= 0 ? "Update " : "Add ") + name);

      closeForm();
      renderList();
      msg($("globalMsg"), "Saved! The website updates in about a minute.", "ok");
    } catch (e) {
      msg($("formMsg"), e.message, "err");
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteProduct(id) {
    const p = data.products.find((x) => x.id === id);
    if (!p || !confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      msg($("globalMsg"), "Deleting...", "info");
      await loadData();
      const cur = data.products.find((x) => x.id === id);
      data.products = data.products.filter((x) => x.id !== id);
      await saveData("Delete " + p.name);
      for (const img of (cur && cur.images) || []) if (!img.startsWith("http")) await deleteFile(img);
      renderList();
      msg($("globalMsg"), "Product deleted.", "ok");
    } catch (e) {
      msg($("globalMsg"), e.message, "err");
    }
  }

  /* ---------- settings ---------- */
  function openSettings() {
    $("formPanel").classList.add("hidden");
    $("settingsPanel").classList.remove("hidden");
    $("sName").value = data.settings.shopName || "";
    $("sTagline").value = data.settings.tagline || "";
    $("sCurrency").value = data.settings.currency || "";
  }
  async function saveSettings() {
    try {
      msg($("globalMsg"), "Saving settings...", "info");
      await loadData();
      data.settings = { shopName: $("sName").value.trim(), tagline: $("sTagline").value.trim(), currency: $("sCurrency").value.trim() || "$" };
      await saveData("Update shop settings");
      $("settingsPanel").classList.add("hidden");
      renderList();
      msg($("globalMsg"), "Settings saved.", "ok");
    } catch (e) {
      msg($("globalMsg"), e.message, "err");
    }
  }

  /* ---------- events ---------- */
  $("loginBtn").onclick = signIn;
  $("logoutBtn").onclick = signOut;
  $("newBtn").onclick = () => openForm(null);
  $("cancelProduct").onclick = closeForm;
  $("saveProduct").onclick = saveProduct;
  $("settingsBtn").onclick = openSettings;
  $("closeSettings").onclick = () => $("settingsPanel").classList.add("hidden");
  $("saveSettings").onclick = saveSettings;
  $("pFiles").onchange = (e) => { newFiles.push(...e.target.files); e.target.value = ""; renderPreview(); };
  $("pPreview").addEventListener("click", (e) => {
    if (e.target.dataset.rmOld !== undefined) { formImages.splice(+e.target.dataset.rmOld, 1); renderPreview(); }
    if (e.target.dataset.rmNew !== undefined) { newFiles.splice(+e.target.dataset.rmNew, 1); renderPreview(); }
  });
  $("list").addEventListener("click", (e) => {
    if (e.target.dataset.edit) openForm(data.products.find((p) => p.id === e.target.dataset.edit));
    if (e.target.dataset.del) deleteProduct(e.target.dataset.del);
  });

  // guess owner/repo from the GitHub Pages URL (username.github.io/repo/)
  (function prefill() {
    const m = location.hostname.match(/^(.+)\.github\.io$/);
    if (m) {
      $("owner").value = m[1];
      const part = location.pathname.split("/").filter(Boolean)[0];
      if (part && !part.endsWith(".html")) $("repo").value = part;
    }
  })();

  // restore saved session
  (async function restore() {
    try {
      const saved = localStorage.getItem("nsAdmin") || sessionStorage.getItem("nsAdmin");
      if (!saved) return;
      cfg = JSON.parse(saved);
      await loadData();
      showDash();
    } catch (e) {
      cfg = null;
    }
  })();
})();
