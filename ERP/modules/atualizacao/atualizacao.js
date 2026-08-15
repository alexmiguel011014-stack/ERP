(function () {
  "use strict";
  var win = window;
  var currentVersion = "--";
  var updateAvailable = false;
  var downloading = false;
  var downloaded = false;

  function setStatus(text, colorClass) {
    var el = document.getElementById("updateStatus");
    el.textContent = text;
    el.className = colorClass || "";
  }

  function setVersion(v) {
    currentVersion = v;
    document.getElementById("currentVersion").textContent = v;
  }

  function showMessage(type, text) {
    var area = document.getElementById("messageArea");
    area.innerHTML = '<p class="msg ' + type + '">' + text + "</p>";
    setTimeout(function () {
      area.innerHTML = "";
    }, 8000);
  }

  function setDownloadProgress(p) {
    var pct = Math.round(p || 0);
    document.getElementById("progressBar").style.display = "block";
    document.getElementById("progressText").style.display = "block";
    document.getElementById("progressFill").style.width = pct + "%";
    document.getElementById("progressText").textContent = pct + "%";
  }

  function resetDownload() {
    document.getElementById("progressBar").style.display = "none";
    document.getElementById("progressText").style.display = "none";
    document.getElementById("progressFill").style.width = "0%";
  }

  function setButton(disabled) {
    document.getElementById("btnAtualizar").disabled = !!disabled;
  }

  function enableButton() {
    setButton(false);
  }

  win.atualizacaoApp = {
    check: function () {
      if (win.api && win.api.checkForUpdates) {
        setStatus("Verificando...", "");
        win.api.checkForUpdates().catch(function () {});
      }
    },
    download: function () {
      if (win.api && win.api.downloadUpdate) {
        downloading = true;
        resetDownload();
        setButton(true);
        setStatus("Baixando atualização...", "");
        win.api.downloadUpdate().then(function () {
          downloading = false;
          setStatus("Download concluído. Clique para instalar.", "");
          showMessage("success", "Atualização baixada com sucesso.");
          enableButton();
        }).catch(function (err) {
          downloading = false;
          var msg = "Erro ao baixar. Verifique sua conexão.";
          if (err && err.indexOf && err.indexOf("latest.yml") !== -1) msg = "Nenhuma atualização encontrada.";
          setButton(false);
          setStatus("Erro no download", "header-vermelho");
          showMessage("error", msg);
        });
      }
    },
    install: function () {
      if (win.api && win.api.quitAndInstall) {
        win.api.quitAndInstall().catch(function(){});
      }
    }
  };

  window.addEventListener("update-status", function (e) {
    var data = e.detail || {};
    var s = data.status;

    if (s === "checking") {
      if (!downloading) setStatus("Verificando...", "");
    } else if (s === "available") {
      updateAvailable = true;
      downloaded = false;
      resetDownload();
      setStatus("Nova versão disponível para atualizar", "header-vermelho");
      showMessage("warning", "Nova versão disponível. Clique em Atualizar.");
      enableButton();
    } else if (s === "not-available") {
      updateAvailable = false;
      downloaded = false;
      resetDownload();
      setStatus("Aplicativo atualizado", "header-verde");
      showMessage("success", "Seu aplicativo está atualizado.");
      setButton(false);
    } else if (s === "download-progress") {
      downloading = true;
      setStatus("Baixando... " + Math.round(data.progress || 0) + "%", "");
      setButton(true);
      setDownloadProgress(data.progress);
    } else if (s === "update-downloaded") {
      downloading = false;
      downloaded = true;
      setStatus("Download concluído. Clique para instalar.", "");
      showMessage("success", "Atualização pronta. Clique em Atualizar para instalar.");
      enableButton();
    } else if (s === "error") {
      downloading = false;
      resetDownload();
      setButton(false);
      setStatus("Erro", "header-vermelho");
      showMessage("error", "Erro na atualização: " + (data.message || "desconhecido"));
    }
  });

  document.getElementById("btnAtualizar").addEventListener("click", function () {
    if (downloading) return;
    if (downloaded) {
      downloaded = false;
      win.atualizacaoApp.install();
    } else if (updateAvailable) {
      win.atualizacaoApp.download();
    } else {
      win.atualizacaoApp.check();
    }
  });

  if (win.api && win.api.getAppVersion) {
    win.api.getAppVersion().then(setVersion).catch(function () {
      setStatus("Versão não identificada", "header-vermelho");
    });
  }

  win.atualizacaoApp.check();
})();
