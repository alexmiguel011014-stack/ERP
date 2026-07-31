# Controle de Consumo de Tokens

## O que e este sistema

Este projeto acompanha o consumo de tokens a cada interacao com o modelo de IA.
O objetivo e manter um registro acumulado do gasto de tokens ao longo do tempo,
especialmente porque o modelo possui uma janela de contexto limitada e os tokens
toda vez que sao processados (entrada + saida).

## Arquivos envolvidos

| Arquivo | Funcao |
|---|---|
| `token_tracker.txt` | Arquivo de contagem acumulada com entrada, saida e total por turno |
| `TOKEN_TRACKING.md` | Este documento — explica as regras e procedimentos |

## Procedimento padrao (após cada uso)

1. **Identifique o turno.** Anote qual foi a solicitacao do usuario e a resposta da IA.
2. **Estime os tokens de entrada.** O tamanho da mensagem do usuario em tokens
   (aproximadamente: numero de caracteres / 4 para texto em portugues).
3. **Estime os tokens de saida.** O tamanho da resposta da IA em tokens
   (aproximadamente: numero de caracteres / 4).
4. **Some os dois valores.** Entrada + Saída = Total do turno.
5. **Some o total do turno ao acumulado anterior.**
6. **Registre tudo no `token_tracker.txt`** no formato padrao (veja exemplo abaixo).
7. **Salve o arquivo.**

## Format o do token_tracker.txt

```txt
 ==========================================
  TOKEN TRACKER - ERP Jiu-Jitsu
  Ultima atualizacao: YYYY-MM-DD
 ==========================================

 CONTAGEM ACUMULADA: X tokens

 ------------------------------------------
 ENTRADA N - Descricao do turno
 ------------------------------------------
  Entrada (user):   ~X tokens
  Saida (assistant): ~X tokens
  Total turno:      ~X tokens

 ------------------------------------------
 BASE INICIAL (conversa limpa): 0 tokens
 ------------------------------------------
 Acumulado ate agora: X tokens
```

## Tratamento de reset de memoria

> **ATENCAO:** Se ao iniciar uma nova sessao (ou novo contexto) o valor acumulado
> aparecer muito menor que o valor registrado anteriormente (por exemplo, estava em
> 180.000 tokens e do nada aparece em 20.000 tokens), isso indica que a memoria
> do contexto foi reiniciada e o valor anterior foi perdido.

### O que fazer quando isso acontecer

1. **Nao ignore o spike.** Mesmo que o numero tenha "caido", aqueles tokens foram
   consumidos e devem ser contabilizados.
2. **Some a diferena ao acumulado atual.**
   - Exemplo: acumulado anterior era 180.000. Na nova sessao o arquivo mostra 20.000.
   - Diferenca a atribuir: **180.000 - 20.000 = 160.000 tokens**.
3. **Registre a entrada de compensacao** no token_tracker.txt:
   ```txt
   ------------------------------------------
   ENTRADA COMPENSATORIA - Reset de memoria
   ------------------------------------------
   Nota: Contexto reiniciado. Valor anterior
         (180.000) nao carregado no novo contexto.
   Compensacao adicionada: 160.000 tokens
   ```
4. **Atualize o acumulado:** some os 160.000 tokens compensatorios ao valor
   atual da nova sesao (20.000), resultando em 180.000 novamente.
5. **Continuando a soma normal** a partir dali.

## Resumo das regras

- Tokens gastos = sempre contabilizados, nunca zerados.
- Reset de memoria = diferenca entre o valor antigo e o novo valor aparece
  no arquivo como "compensacao".
- Sempre que a IA gerar uma resposta longa, o texto completo deve ser avaliado
  para estimativa de tokens de saida.
- Mensagens do usuario tbm contam e devem ser registradas como entrada.
- A contagem e acumulativa: o valor **nunca** deve diminuir, exceto quando ha
  reset de memoria (nesse caso a compensacao garante que o total nunca seja menor
  que o valor real gasto).