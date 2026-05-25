# Extrator_de_dominio

Ferramenta local para extracao, revisao e consolidacao de dominios potencialmente maliciosos, com foco em gerar listas seguras para bloqueio DNS.

## Visao Geral

O projeto foi criado para apoiar operacoes de bloqueio DNS a partir de arquivos reais recebidos em `TXT` e `PDF`.

O objetivo principal nao e apenas extrair dominios, mas fazer isso com seguranca operacional:

1. reconhecer dominios presentes no material recebido
2. reduzir ruido e falsos positivos
3. aplicar whitelist critica automaticamente
4. consolidar multiplos arquivos em uma lista final unica
5. manter rastreabilidade para revisao humana

O contexto do projeto e sensivel. Um erro pode levar ao bloqueio de servicos legitimos, bancos, orgaos publicos, provedores e plataformas essenciais. Por isso o foco real do projeto e confiabilidade, clareza de contagem e evolucao guiada por casos reais.

## Onde Esta o Projeto

O nucleo da ferramenta fica em `dns-blocklist-extractor/`.

Arquivos principais:

1. `dns-blocklist-extractor/index.html`
   Interface principal da ferramenta.

2. `dns-blocklist-extractor/styles.css`
   Estilos da interface.

3. `dns-blocklist-extractor/app.js`
   Controla uploads, consolidacao, revisao, comparador, exportacoes e estatisticas.

4. `dns-blocklist-extractor/extractor-engine.js`
   Motor de extracao, limpeza, validacao e classificacao inicial dos dominios.

## Estrutura de Pastas

1. `dns-blocklist-extractor/fixtures/`
   Arquivos brutos de teste e casos reais usados para evolucao do motor.

2. `dns-blocklist-extractor/exports/`
   Saidas exportadas pela ferramenta, normalmente listas finais em `.txt`.

3. `dns-blocklist-extractor/audits/`
   Auditorias e rastreabilidade, principalmente de comparacoes e validacoes.

4. `dns-blocklist-extractor/knowledge-base/`
   Base de estudo do projeto: resultados de referencia, casos importantes, observacoes e material util para endurecimento futuro.

## Como a Ferramenta Funciona Hoje

### Extracao Principal

Ao carregar um ou mais arquivos, a ferramenta:

1. extrai o texto do arquivo
2. reconhece candidatos a dominio
3. limpa entradas invalidas e ruido basico
4. detecta duplicados no proprio arquivo
5. aplica whitelist critica automatica
6. consolida os dominios validos em uma unica lista final

O comportamento esperado para multiplos arquivos e incremental:

1. o primeiro arquivo cria a base consolidada
2. os proximos arquivos acrescentam apenas o que ainda nao esta consolidado
3. o resultado final nao deve depender da ordem de carregamento

### Comparador de Dominios

Existe um comparador separado para validar diferencas entre duas listas.

Regras atuais:

1. `TXT` e comparado literalmente linha a linha
2. `PDF` continua dependendo da extracao do motor
3. o comparador calcula repetidos, ineditos e whitelist excluida
4. o resultado final pode ser exportado junto com auditoria JSON

Esse comparador e usado como referencia importante para validacao de casos reais.

### Revisao

A interface possui uma aba unica de `Revisao`.

Ela concentra:

1. itens duvidosos que precisam de decisao humana
2. duplicados relevantes para revisao
3. registros de auditoria que ajudam a entender por que algo nao entrou diretamente na lista final

O objetivo da revisao nao e poluir a interface, mas permitir que o operador entenda:

1. o que foi aceito diretamente
2. o que foi para whitelist
3. o que ficou pendente de revisao
4. o que foi descartado por regra ou contexto

## Regras Importantes do Projeto

1. nem todo arquivo deve ser tratado igual
   `TXT` e `PDF` tem comportamentos diferentes

2. whitelist critica e obrigatoria
   dominios de governo, seguranca publica, ANATEL, bancos e servicos essenciais nao devem ir para bloqueio por engano

3. consolidacao e diferente de comparacao
   a extracao principal consolida varios arquivos; o comparador existe para analise dirigida entre duas listas

4. contagem precisa ser interpretavel
   a interface deve deixar claro quantos dominios foram lidos, quantos foram para whitelist, revisao e bloqueio

5. revisao humana continua importante
   principalmente para OCR ruim, ruido de PDF, dominios com contexto parcial e casos duvidosos

## Estado Atual do Projeto

O projeto ja passou por uma fase de endurecimento estrutural importante.

Hoje ele ja possui:

1. consolidacao incremental de multiplos arquivos
2. separacao interna entre itens de revisao e auditoria
3. contagem mais coerente por arquivo
4. revisao com filtro por contexto
5. comparador funcional para validacao de listas
6. tratamento de whitelist automatica

Ainda assim, o projeto deve ser entendido como uma ferramenta em evolucao guiada por casos reais, nao como motor fechado.

## Como Tocar o Projeto Para Frente

A melhor forma de evoluir este projeto e por casos reais e validacao incremental.

Fluxo recomendado:

1. adicionar novos arquivos em `fixtures/`
2. rodar a extracao pela interface
3. observar os numeros de `Dominios Lidos`, `Whitelist`, `Revisao` e `Bloqueio`
4. comparar o resultado final com a expectativa operacional
5. usar `knowledge-base/` para guardar casos de referencia importantes
6. usar `audits/` para guardar explicacoes e validacoes do comportamento
7. ajustar o motor apenas com evidencias claras

Ao evoluir o projeto, priorize sempre:

1. reducao de falso positivo
2. clareza de contagem
3. rastreabilidade
4. performance em listas grandes
5. menor quantidade possivel de comportamento oculto

## O Que Ainda Vale Evoluir

Direcoes naturais de continuidade:

1. criar testes automatizados do motor com casos reais
2. aumentar a base de regressao usando `fixtures/` e `knowledge-base/`
3. melhorar a classificacao de itens duvidosos
4. aprimorar o tratamento de OCR e PDFs assinados
5. adicionar auditorias mais detalhadas por dominio quando necessario

Se no futuro houver uso de Node, a recomendacao e usar apenas para:

1. testes automatizados
2. scripts de validacao
3. auditoria de regressao

O fluxo principal da ferramenta hoje continua sendo local, simples e baseado em navegador.

## Resumo

Este projeto extrai dominios de `TXT` e `PDF`, aplica regras de limpeza, whitelist critica, consolidacao incremental e revisao humana para gerar listas finais de bloqueio DNS com menor risco operacional. O foco do projeto nao e apenas extrair bastante, mas extrair com controle, explicacao e seguranca suficiente para que outra pessoa consiga continuar a evolucao sem ficar perdida.
