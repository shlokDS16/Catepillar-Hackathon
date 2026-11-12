/* Mockup helper: draws our own unbranded excavator line drawing and a few placeholder icons.
   Production would use lucide-react for UI icons and a React <MachineDrawing> component. */
(() => {
  const P = (d) => `<path d="${d}"/>`;
  const I = {
    home: P("M3 11 12 3l9 8v10h-6v-6H9v6H3z"),
    task: P("M8 4h8v3H8z") + P("M6 5H4v16h16V5h-2") + P("M8 12h8M8 16h5"),
    shield: P("M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z") + P("M12 8v5M12 16v.5"),
    cap: P("M2 9l10-5 10 5-10 5z") + P("M6 11v5c3 2 9 2 12 0v-5"),
    ask: P("M4 5h16v11H9l-5 4z") + P("M10 9.5a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1M12 14v.5"),
    globe: P("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z") + P("M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"),
    tri: P("M12 3 2 20h20z") + P("M12 9v5M12 17v.5"),
    check: P("M4 12l5 5L20 6"),
    play: P("M7 4v16l13-8z"),
    speak: P("M4 9h4l5-4v14l-5-4H4z") + P("M16 9c1.5 1.5 1.5 4.5 0 6M18.5 6.5c3 3 3 8 0 11"),
    map: P("M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z") + P("M9 3v15M15 6v15"),
    chart: P("M4 20V4M4 20h16") + P("M8 16v-5M12 16V8M16 16v-3"),
    ledger: P("M5 3h11l3 3v15H5z") + P("M9 8h6M9 12h6M9 16h4"),
    inbox: P("M3 13l3-9h12l3 9v7H3z") + P("M3 13h5l1 3h6l1-3h5"),
    sync: P("M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2") + P("M20 4v5h-5M4 20v-5h5"),
    clock: P("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z") + P("M12 7v5l3 2"),
    heat: P("M10 4a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z") + P("M12 9v6"),
    person: P("M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z") + P("M6 21v-5a6 6 0 0 1 12 0v5"),
    truck: P("M2 6h11v10H2zM13 9h5l3 4v3h-8") + P("M6 18a2 2 0 1 0 0-.1M17 18a2 2 0 1 0 0-.1"),
    x: P("M5 5l14 14M19 5 5 19"),
    chev: P("M9 5l7 7-7 7"),
    belt: P("M8 3h3v6H8z") + P("M7 21v-8l2-4h4l1 4v8") + P("M7 10l9 9"),
    sos: P("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z") + P("M12 7v6M12 16v.5"),
    lock: P("M6 11h12v10H6z") + P("M8 11V7a4 4 0 0 1 8 0v4"),
    link: P("M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"),
    eye: P("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z") + P("M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"),
    wrench: P("M15 4a5 5 0 0 0-5 6l-7 7 4 4 7-7a5 5 0 0 0 6-5l-3 2-3-3z"),
    fleet: P("M3 17h7v-4H5l-2 2zM14 17h7v-4h-5l-2 2z") + P("M5 19a1 1 0 1 0 0-.1M19 19a1 1 0 1 0 0-.1"),
    moon: P("M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"),
    off: P("M3 3l18 18") + P("M8 8a6 6 0 0 0 8 8M5 12a7 7 0 0 1 2-4.5M12 5a7 7 0 0 1 7 7"),
  };
  document.querySelectorAll("i[data-i]").forEach((el) => {
    el.outerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[el.dataset.i] || ""}</svg>`;
  });

  const W = 640, H = 360;
  function drawing(hl, tier) {
    const c = (id, base) => `class="${base}${id === hl ? " hl " + tier : ""}"`;
    const hatch = Array.from({ length: 36 }, (_, k) => `<line class="m-hatch" x1="${40 + k * 16}" y1="326" x2="${30 + k * 16}" y2="340"/>`).join("");
    const rollers = [170, 215, 260, 305, 340].map((x) => `<circle class="m-part" cx="${x}" cy="291" r="10"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Excavator side view">
      <line class="m-ground" x1="30" y1="323" x2="620" y2="323"/>${hatch}
      <g ${c("tracks", "m-dark")}><rect x="96" y="262" width="308" height="58" rx="29"/></g>
      <rect class="m-part" x="132" y="278" width="236" height="26" rx="6"/>
      <circle class="m-part" cx="125" cy="291" r="19"/><circle class="m-part" cx="375" cy="291" r="19"/>${rollers}
      <rect class="m-dark" x="190" y="248" width="140" height="14"/>
      <path ${c("house", "m-part")} d="M84 248V206q0-22 22-22h162v64z"/>
      <path class="m-line" d="M118 200h96M118 208h96M118 216h96"/>
      <rect ${c("sensor", "m-part")} x="74" y="194" width="14" height="22"/>
      <path ${c("cab", "m-part")} d="M268 248V120q0-8 8-8h54l22 44v92z"/>
      <path class="m-glass" d="M280 124h46l16 34v42h-62z"/>
      <path ${c("belt", "m-dark")} d="M292 197v-29q0-6 6-6h6v24h18v11z"/>
      <path class="m-line" d="M296 168l24 24" style="stroke-width:3"/>
      <path ${c("boom", "m-part")} d="M346 224l20-20q54-84 120-120l18 20q-58 36-120 128z"/>
      <path ${c("ram", "m-dark")} d="M325.4 244.4l-10.8-8.8 52-64 10.8 8.8z"/>
      <path class="m-line" d="M372 176l28-34" style="stroke-width:5"/>
      <path class="m-line" d="M428 132l50-52" style="stroke-width:7"/>
      <path ${c("stick", "m-part")} d="M480 82l26 2 54 152-20 8z"/>
      <path ${c("bucket", "m-part")} d="M536 236l36-6 12 40q-18 30-56 22l-8-26z"/>
      <path class="m-line" d="M526 292l-10 8M538 294l-8 9M550 293l-5 9"/>
      <circle class="m-part" cx="366" cy="214" r="6"/><circle class="m-part" cx="494" cy="92" r="6"/><circle class="m-part" cx="550" cy="240" r="6"/>
      <g class="leaders"></g>
    </svg>`;
  }
  document.querySelectorAll(".mach").forEach((m) => {
    const stage = m.querySelector(".draw") || m;
    stage.insertAdjacentHTML("afterbegin", drawing(m.dataset.hl, m.dataset.tier));
    const g = stage.querySelector(".leaders");
    m.querySelectorAll(".tag[data-ax]").forEach((t) => {
      const ax = +t.dataset.ax, ay = +t.dataset.ay, tx = +t.dataset.tx, ty = +t.dataset.ty;
      t.style.left = (tx / W) * 100 + "%";
      t.style.top = (ty / H) * 100 + "%";
      if (getComputedStyle(t).display === "none") return;
      g.insertAdjacentHTML("beforeend", `<line class="m-leader" x1="${ax}" y1="${ay}" x2="${tx}" y2="${ty}"/><circle class="m-anchor" cx="${ax}" cy="${ay}" r="7"/>`);
    });
  });
})();
