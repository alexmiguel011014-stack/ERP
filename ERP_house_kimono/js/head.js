(function () {
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
