(function () {
  var currentVersion = "--";
  var latestVersion = "--";
  var updateAvailable = false;
  var updateDownloaded = false;

  function setStatus(status) {
    document.getElementById("updateStatus").textContent = status;
  }

  function showMessage(type, text) {
    var area = document.getElementById("messageArea");
    area.innerHTML = '<div class="message ' + type + '">' + text + "</div>";
    setTimeout(function () {
      area.innerHTML = "";
    }, 8000);
  }

  function setButtonState(btnId, disabled) {
    document.getElementById(btnId).disabled = disabled;
  }

  function setVersionDisplay() {
    document.getElementById("currentVersion").textContent = currentVersion;
    document.getElementById("latestVersion").textContent = latestVersion;
    if (latestVersion === currentVersion) {
      document.getElementById("latestVersion").className = "info-value";
    } else if (updateAvailable) {
      document.getElementById("latestVersion").className = "info-value outdated";
    }
  }

  window.checkForUpdates = function () {
    setButtonState("btnCheck", true);
    setStatus("Verificando...");
    window.api
      .checkForUpdates()
      .then(function (result) {
        setButtonState("btnCheck", false);
        if (result && result.updateAvailable) {
          updateAvailable = true;
          latestVersion = result.updateInfo && result.updateInfo.version ? result.updateInfo.version : "disponivel";
          document.getElementById("latestVersion").textContent = latestVersion;
          document.getElementById("latestVersion").className = "info-value outdated";
          setStatus("Nova versao disponivel!");
          setButtonState("btnDownload", false);
          showMessage("warning", "Nova versao " + latestVersion + " disponivel para download.");
        } else {
          latestVersion = currentVersion;
          document.getElementById("latestVersion").textContent = currentVersion;
          document.getElementById("latestVersion").className = "info-value";
          setStatus("Voce esta na versao mais recente.");
          setButtonState("btnDownload", true);
          showMessage("success", "Seu app ja esta atualizado.");
        }
      })
      .catch(function (err) {
        setButtonState("btnCheck", false);
        setStatus("Erro ao verificar");
        showMessage("error", "Erro ao verificar atualizacoes: " + err);
      });
  };

  window.downloadUpdate = function () {
    setButtonState("btnDownload", true);
    setButtonState("btnCheck", true);
    setStatus("Baixando atualizacao...");
    document.getElementById("downloadPanel").style.display = "block";
    document.getElementById("downloadVersion").textContent = latestVersion;

    window.api
      .downloadUpdate()
      .then(function () {
        setStatus("Download concluido!");
        showMessage("success", "Atualizacao baixada com sucesso. Clique em Reiniciar e Instalar.");
        setButtonState("btnRestart", false);
        updateDownloaded = true;
      })
      .catch(function (err) {
        setButtonState("btnDownload", false);
        setButtonState("btnCheck", false);
        setStatus("Erro no download");
        showMessage("error", "Erro ao baixar atualizacao: " + err);
      });
  };

  window.quitAndInstall = function () {
    setButtonState("btnRestart", true);
    setStatus("Instalando atualizacao...");
    showMessage("info", "Reiniciando o aplicativo para instalar a atualizacao...");
    window.api.quitAndInstall();
  };

  window.addEventListener("update-status", function (e) {
    var data = e.detail;
    if (data.status === "checking") {
      setStatus("Verificando...");
    } else if (data.status === "downloading") {
      setStatus("Baixando... " + (data.progress || 0) + "%");
      document.getElementById("progressFill").style.width = (data.progress || 0) + "%";
      document.getElementById("downloadProgress").textContent = (data.progress || 0) + "%";
    } else if (data.status === "downloaded") {
      setStatus("Download concluido!");
      updateDownloaded = true;
      setButtonState("btnRestart", false);
      showMessage("success", "Atualizacao baixada. Clique em Reiniciar e Instalar.");
    } else if (data.status === "available") {
      latestVersion = data.version;
      updateAvailable = true;
      document.getElementById("latestVersion").textContent = data.version;
      document.getElementById("latestVersion").className = "info-value outdated";
      setStatus("Nova versao disponivel!");
      setButtonState("btnDownload", false);
    } else if (data.status === "not-available") {
      latestVersion = currentVersion;
      document.getElementById("latestVersion").textContent = currentVersion;
      document.getElementById("latestVersion").className = "info-value";
      setStatus("Voce esta na versao mais recente.");
      showMessage("success", "Seu app ja esta atualizado.");
    } else if (data.status === "error") {
      setStatus("Erro");
      showMessage("error", "Erro: " + (data.message || "Erro desconhecido"));
    }
  });

  if (window.api && window.api.getAppVersion) {
    window.api
      .getAppVersion()
      .then(function (ver) {
        currentVersion = ver;
        document.getElementById("currentVersion").textContent = ver;
      })
      .catch(function () {});
  }
})();