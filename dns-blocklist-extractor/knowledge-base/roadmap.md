# Evolucao Tecnica

Este arquivo serve como registro vivo da evolucao tecnica do projeto.

O objetivo nao e guardar historico minucioso de cada pequena alteracao, mas manter contexto suficiente para que qualquer pessoa consiga entender:

1. o que ja foi endurecido
2. quais problemas reais motivaram mudancas
3. o que ainda precisa evoluir
4. quais cuidados devem ser tomados antes de mexer no motor

## Como Usar Este Arquivo

Sempre que houver uma mudanca importante no projeto, atualizar este documento com:

1. o problema observado
2. a decisao tomada
3. o impacto esperado
4. o que ainda ficou pendente

Formato recomendado para futuras atualizacoes:

```md
## AAAA-MM-DD - Titulo Curto

### Problema
...

### Decisao
...

### Impacto
...

### Pendencias
...
```

## Estado Atual Consolidado

### Objetivo Tecnico do Projeto

O projeto existe para extrair, revisar e consolidar dominios potencialmente maliciosos a partir de `TXT` e `PDF`, gerando uma lista final de bloqueio DNS com o menor risco possivel de falso positivo.

### Principios Atuais

1. bloquear menos e com mais seguranca vale mais do que extrair mais e errar
2. toda contagem importante precisa ser interpretavel
3. consolidacao e comparacao sao fluxos diferentes
4. whitelist critica precisa ser automatica
5. casos duvidosos devem ir para revisao, nao para bloqueio silencioso

## O Que Ja Foi Endurecido

### 1. Consolidacao Incremental de Multiplos Arquivos

Hoje a extracao principal trabalha com consolidacao incremental.

Comportamento esperado:

1. o primeiro arquivo cria a base consolidada
2. arquivos seguintes adicionam apenas o que ainda nao existe na consolidacao
3. o resultado final nao deve depender da ordem de carregamento

### 2. Separacao Entre Comparador e Extracao Principal

O comparador continua sendo uma ferramenta de validacao entre duas listas.

Regra atual:

1. `TXT` no comparador e tratado literalmente linha a linha
2. a extracao principal continua sendo um fluxo de consolidacao com limpeza e whitelist

Isso e importante porque o comparador serve como referencia de diferenca entre listas, enquanto a extracao principal serve para consolidacao operacional.

### 3. Estrutura Interna Mais Robusta

O projeto passou a usar uma estrutura interna mais segura para sessao e consolidacao.

Melhorias importantes:

1. identidade interna de arquivo por `fileId`
2. deduplicacao de upload por `fingerprint`
3. separacao interna entre `reviewItems` e `auditItems`
4. indice de agregacao para itens de revisao

Isso reduziu acoplamento por nome de arquivo e melhorou a capacidade de evoluir o app sem quebrar o fluxo principal.

### 4. Revisao Unificada

A interface trabalha hoje com uma unica aba de `Revisao`.

Essa aba concentra:

1. itens duvidosos com sugestao de dominio
2. duplicados relevantes para revisao
3. registros de auditoria que ajudam a explicar descartes

Filtros por contexto foram adicionados para evitar poluicao visual.

### 5. Duplicados Mais Claros

Duplicados passaram a ter tratamento mais util para o operador.

Comportamento atual:

1. duplicados importantes podem aparecer na revisao com motivo claro
2. duplicados repetidos sao agregados com ocorrencias
3. duplicados de dominios que ja caem em whitelist automatica nao devem poluir a fila de revisao

### 6. Contagens Mais Coerentes

As metricas da interface foram ajustadas para ficarem mais proximas da semantica operacional esperada.

Estado atual:

1. `Dominios Lidos` representa candidatos reconhecidos como dominio
2. cada arquivo deve deixar claro quanto foi para whitelist, revisao e bloqueio
3. a contagem do topo nao deve mais depender de uma soma ambigua de validos com duplicados

### 7. Remocao de Estrutura Node Inconsistente

Arquivos gerados sem uso real no projeto foram removidos.

Removidos:

1. `node_modules/`
2. `package-lock.json` inconsistente

Node continua sendo opcional para o futuro, preferencialmente apenas para testes e scripts de validacao.

## Problemas Reais Ja Identificados

Casos que ja se mostraram relevantes durante a evolucao:

1. falsos positivos vindos de OCR e PDFs assinados
2. diferencas entre consolidacao principal e comparador literal
3. contagens pouco claras em listas muito grandes
4. duplicados internos sendo mal interpretados pelo operador
5. domínios com porta, caminho ou ruido contextual exigindo decisao melhor entre consolidar, revisar ou auditar

## Pendencias Tecnicas Atuais

### Alta Prioridade

1. criar testes automatizados do motor com casos reais
2. consolidar uma base de regressao confiavel em `fixtures/` e `knowledge-base/`
3. continuar reduzindo ruido na aba de revisao

### Media Prioridade

1. melhorar a explicacao por motivo de descarte e revisao
2. avaliar exportacao de auditoria mais detalhada por dominio
3. revisar continuamente a semantica das metricas exibidas na interface

### Futuro

1. adocao minima de Node para testes e scripts
2. automacao de comparacoes de regressao entre versoes do motor
3. possivel refinamento do OCR ou pre-processamento de PDF

## Cuidados Antes de Mexer No Motor

Antes de alterar a extracao ou a consolidacao:

1. validar o caso real que motivou a mudanca
2. confirmar se o problema e do motor, da contagem ou da interpretacao da interface
3. evitar mudar comparador e consolidacao como se fossem a mesma coisa
4. nao introduzir bypass silencioso para aceitar entradas duvidosas na lista final
5. priorizar sempre a reducao de falso positivo

## Direcao Recomendada Para o Projeto

Ordem de evolucao mais segura:

1. continuar endurecendo com casos reais
2. transformar casos importantes em referencia permanente
3. criar testes de regressao do motor
4. melhorar a revisao humana sem poluir a interface
5. so depois adicionar automacoes maiores

## Observacao Final

Este arquivo deve ser mantido curto, objetivo e atualizado. Ele existe para evitar perda de contexto tecnico entre sessoes, entre IAs e entre pessoas diferentes tocando o projeto.
