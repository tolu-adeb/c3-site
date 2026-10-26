import { connectTooltip, enhanceTables } from "./components.js";

enhanceTables();
document.querySelectorAll(".theme-preview").forEach((preview) => {
  const values = getComputedStyle(preview);
  preview.querySelectorAll("[data-token-value]").forEach((el) => {
    el.textContent = values.getPropertyValue(el.dataset.tokenValue).trim();
  });
  connectTooltip(preview.querySelectorAll("[data-tooltip]"));

  const figure = preview.querySelector(".fig");
  const slider = figure.querySelector("input[type=range]");
  slider.disabled = false;
  const output = figure.querySelector("output");
  const play = figure.querySelector("[data-play]");
  const bars = [...figure.querySelectorAll("[data-bar]")];
  const candles = [...figure.querySelectorAll(".candle")];
  let timer;
  const reduced = () => document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  function paint() {
    const index = Number(slider.value), row = bars[index];
    output.textContent = `Bar ${index + 1} of ${bars.length} · ${row.dataset.readout}`;
    slider.setAttribute("aria-valuetext", output.textContent);
    candles.forEach((candle, n) => {
      candle.hidden = n > index;
      // SVG uses display rather than the HTML hidden presentation hint.
      candle.style.display = n > index ? "none" : "";
      candle.setAttribute("tabindex", n > index ? "-1" : "0");
    });
  }
  function pause() {
    clearInterval(timer);
    timer = null;
    play.textContent = "Play";
    play.setAttribute("aria-pressed", "false");
  }
  slider.addEventListener("input", () => { pause(); paint(); });
  figure.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => {
    pause();
    slider.value = Math.max(0, Math.min(bars.length - 1, Number(slider.value) + Number(button.dataset.step)));
    paint();
  }));
  play.addEventListener("click", () => {
    if (timer) { pause(); return; }
    if (reduced()) { slider.value = slider.max; paint(); return; }
    if (slider.value === slider.max) slider.value = "0";
    paint();
    play.textContent = "Pause";
    play.setAttribute("aria-pressed", "true");
    timer = setInterval(() => {
      slider.value = Number(slider.value) + 1;
      paint();
      if (slider.value === slider.max) pause();
    }, 500);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  document.addEventListener("c3:motion", pause);
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", pause);
  paint();
});
