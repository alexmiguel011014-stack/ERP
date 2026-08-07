# Atalhos e Lançadores do ERP

## Atalho na Área de Trabalho

Um atalho **"Alga ERP"** foi criado automaticamente na área de trabalho durante a primeira execução.

### Criar/Recriar o Atalho

#### Modo Desenvolvimento (npm start)
Abra PowerShell ou Git Bash na pasta do projeto e execute:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/criar-atalho.ps1 -Dev
```

Ou use o script batch:
```bash
scripts\criar-atalho.bat dev
```

#### Modo Produção (executável compilado)
Após compilar com `npm run build`, execute:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/criar-atalho.ps1
```

Ou use o script batch:
```bash
scripts\criar-atalho.bat
```

## Lançadores

### Windows

#### ERP_Launcher.bat
Script batch silencioso que inicia o app. Ideal para agendador de tarefas.

```cmd
ERP_Launcher.bat
```

#### ERP_Launcher.vbs
Script silencioso (sem console) para iniciar via agendador ou automação.

```vbs
wscript.exe ERP_Launcher.vbs
```

### Linux / macOS

Para sistemas Unix-like, use:

```bash
npm start
```

## Localização dos Atalhos

| Tipo | Caminho |
|------|---------|
| Atalho Desktop | `C:\Users\[Usuario]\Desktop\Alga ERP.lnk` |
| Launcher Batch | `./ERP_Launcher.bat` |
| Launcher VBS | `./ERP_Launcher.vbs` |
| Script PowerShell | `./scripts/criar-atalho.ps1` |
| Script Batch | `./scripts/criar-atalho.bat` |

## Dicas

- O ícone do atalho é automaticamente configurado para `build/icon.ico`
- O executável será procurado em `dist/` após `npm run build`
- Em modo DEV, o PowerShell se mantém aberto para ver logs
- O atalho pode ser personalizado clicando com botão direito → Propriedades

## Próximos Passos

1. **Desenvolvimento**: Use o atalho com `-Dev` para rodar `npm start`
2. **Build**: Execute `npm run build` para gerar o .exe
3. **Produção**: Recrie o atalho sem flags para apontar ao executável compilado
