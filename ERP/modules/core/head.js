(function () {
  // Reencaminha exceções não tratadas e promises rejeitadas sem catch para
  // console.error, que main.js grava em userData/erp-crash.log. Sem isso, um
  // erro fora de um try/catch simplesmente desaparecia sem deixar rastro.
  window.addEventListener("error", function (e) {
    console.error(
      "[onerror] " + (e.message || "erro desconhecido") +
      " em " + (e.filename || "?") + ":" + (e.lineno || "?") + ":" + (e.colno || "?") +
      (e.error && e.error.stack ? "\n" + e.error.stack : ""),
    );
  });
  window.addEventListener("unhandledrejection", function (e) {
    var motivo = e.reason;
    var texto = motivo && motivo.stack ? motivo.stack : String(motivo);
    console.error("[unhandledrejection] " + texto);
  });

  try {
    var tema = localStorage.getItem("tema");
    var isDark = false;
    if (tema === "dark") {
      isDark = true;
    } else if (tema === "light") {
      isDark = false;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      isDark = true;
    }
    if (isDark) {
      document.documentElement.classList.add("dark-theme");
    }
  } catch (e) {}
})();
