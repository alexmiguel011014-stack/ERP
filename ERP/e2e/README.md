# Testes e2e (Playwright + Electron)

Testam o app **de verdade**: lançam `electron .` (o processo real, com IPC/SQLCipher/
window.api reais) via a API `_electron` do Playwright — não um browser solto apontado pro
`next dev`, que não teria `window.api` disponível (só existe via `contextBridge` dentro do
Electron) e não exercitaria a integração real entre o frontend novo e o backend.

## Isolamento

Cada run usa um diretório temporário (`fs.mkdtempSync`) como `userData`, passado via
`ERP_TEST_USERDATA_DIR` (lido em `main.js`, só tem efeito com essa env var setada — nunca
toca no banco real). Num banco vazio, o primeiro login digitado na tela de signin vira o
admin automaticamente (`db/usuarios.js`, passo "bootstrap") — não precisa de setup extra.

## Rodando

```powershell
cd frontend; npm run build; cd ..   # precisa de frontend/out atualizado
npx playwright test                  # roda tudo em e2e/
npx playwright test --headed         # com janela visível, útil pra debugar
```

`ERP_SPIKE_FRONTEND=1` é setado pelo próprio teste (`e2e/*.spec.ts`), não precisa exportar
manualmente.
