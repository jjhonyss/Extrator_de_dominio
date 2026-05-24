# Extrator_de_dominio

Ferramenta local para extracao, revisao e consolidacao de dominios potencialmente maliciosos, com foco em gerar listas seguras para bloqueio DNS.

## Objetivo

O projeto existe para:

1. receber arquivos reais em `TXT` e `PDF`
2. extrair dominios presentes nesses documentos
3. remover ruido, duplicidades e itens invalidos
4. aplicar whitelist critica para evitar bloqueios indevidos
5. gerar uma lista final pronta para uso operacional
6. manter historico e base de aprendizado sem banco de dados

O contexto e sensivel: um erro pode bloquear servicos legitimos de provedores, bancos, orgaos publicos e plataformas essenciais. Por isso a prioridade do projeto e confiabilidade, rastreabilidade e endurecimento progressivo do motor com casos reais.

## Estrutura Atual

O nucleo do projeto fica em `dns-blocklist-extractor/`.

Arquivos principais:

1. `dns-blocklist-extractor/index.html`
   Interface principal da ferramenta.

2. `dns-blocklist-extractor/styles.css`
   Estilos da interface.

3. `dns-blocklist-extractor/app.js`
   Lida com uploads, renderizacao, comparacao, exportacoes e auditoria.

4. `dns-blocklist-extractor/extractor-engine.js`
   Motor de extracao, limpeza e validacao de dominios.

## Estrutura de Pastas

1. `dns-blocklist-extractor/fixtures/`
   Arquivos brutos de teste e treino. Aqui entram PDFs, TXTs e documentos reais recebidos.

2. `dns-blocklist-extractor/exports/`
   Resultados finais exportados pela ferramenta. Sao os arquivos `.txt` prontos para uso ou revisao operacional.

3. `dns-blocklist-extractor/audits/`
   Relatorios e auditorias das comparacoes/exportacoes. Principalmente arquivos `.json` com rastreabilidade do processamento.

4. `dns-blocklist-extractor/knowledge-base/`
   Base de aprendizado consolidado: padroes descobertos, falsos positivos, falsos negativos e observacoes uteis para evolucao da ferramenta.

## Fluxo de Uso

### Extracao Simples

1. colocar o arquivo bruto em `fixtures/`
2. abrir `dns-blocklist-extractor/index.html`
3. carregar o arquivo na plataforma
4. revisar contagens e qualidade do resultado
5. exportar o resultado final para `exports/`
6. registrar observacoes em `audits/`
7. mover aprendizado relevante para `knowledge-base/`

### Comparacao de Dominios

1. `Lista A` = base principal
2. `Lista B` = nova lista recebida
3. resultado = o que existe em `B` e nao existe em `A`
4. whitelist continua sendo aplicada no resultado final

Fluxo:

1. carregar `Lista A`
2. carregar `Lista B`
3. revisar os ineditos
4. exportar o pacote final
5. salvar o `.txt` em `exports/`
6. salvar o `.json` de auditoria em `audits/`

## Funcoes Ja Implementadas

### 1. Estruturacao do Projeto

O codigo foi separado em:

1. `index.html`
2. `styles.css`
3. `app.js`
4. `extractor-engine.js`

Isso melhorou manutencao, legibilidade e evolucao segura.

### 2. Motor de Extracao

O motor atual consegue:

1. extrair dominios de texto bruto
2. limpar entradas invalidas
3. detectar duplicados
4. tratar e-mails
5. tratar IPs locais/loopback
6. validar estrutura de dominio
7. aplicar whitelist automatica em dominios criticos

Whitelists criticas atuais incluem exemplos como:

1. governo e orgaos publicos
2. ANATEL
3. bancos
4. redes sociais essenciais

### 3. Processamento de PDF

O projeto trabalha com:

1. PDF com texto selecionavel
   Extracao por `PDF.js`

2. PDF escaneado/imagem
   OCR com `Tesseract.js`

Quando o PDF tem pouco texto nativo, a ferramenta tenta OCR.

### 4. Auditoria de Invalidos

A interface possui area para invalidos, exibindo o que foi descartado e por qual motivo.

Exemplos de motivo:

1. e-mail descartado
2. estrutura invalida
3. linha vazia
4. comentario removido
5. identificador processual/judicial descartado

### 5. Comparador de Dominios

Foi implementado comparador entre duas listas.

Comportamento atual:

1. `TXT` e comparado literalmente linha a linha
2. `PDF` e outros formatos continuam dependendo da extracao
3. o comparador calcula totais, repetidos, ineditos e whitelist excluida
4. existe busca, paginacao e exclusao manual da lista resultante

### 6. Correcao do Comparador

Foi corrigido um erro importante:

1. antes, o comparador passava `TXT` pelo motor de extracao
2. isso distorcia a diferenca real entre listas
3. agora `TXT` e comparado literalmente

### 7. Exportacoes Padronizadas

Extracao simples:

1. `resultado-<origem>-<datahora>.txt`

Comparacao final:

1. `arquivo_master-<datahora>.txt`
2. `arquivo_master_auditoria-<datahora>.json`

O JSON de auditoria traz:

1. nome dos arquivos A e B
2. tipo de entrada
3. regras ativas
4. contagens
5. diferencas `onlyInA`
6. diferencas `onlyInB`
7. whitelist excluida
8. dominios finais

### 8. Endurecimento do Motor

Durante os testes com PDFs assinados, foram encontrados problemas reais.

Problemas detectados:

1. numeros processuais sendo capturados como dominio
2. truncamentos de OCR/PDF assinado
3. falsos positivos em assinaturas
4. dominios parcialmente corrompidos

Correcoes aplicadas:

1. descarte de identificadores processuais/judiciais
   Exemplos:
   `0090923-98.2024.8.17.2001`
   `2024.0269.000110-70`

2. correcao automatica de TLD truncado por OCR
   Exemplos:
   `.inf` -> `.info`
   `.onli` -> `.online`

3. preservacao de TLDs longos legitimos
   Exemplos:
   `cuevana3.accountants`
   `cuevana3.photography`

## Casos Ja Validados

Ja foram testados varios padroes reais.

Casos estaveis ate o momento:

1. PDF de planilha com texto selecionavel
2. PDF em colunas com contexto repetitivo como `MARCA PIRATA`
3. documentos com listas maiores
4. PDFs assinados apos endurecimento parcial do motor

Confirmacoes relevantes:

1. `MARCA PIRATA` nao entrou como dominio
2. listas em colunas puderam ser tratadas
3. ruido de assinatura foi reduzido
4. numeros juridicos passaram a cair como invalidos

## Regras Operacionais Importantes

1. nem todo documento deve ser tratado igual; `TXT` e `PDF/OCR` tem comportamento diferente
2. o comparador entra depois da extracao, nao no lugar dela
3. `fixtures/` guarda arquivo bruto
4. `exports/` guarda saida final
5. `audits/` guarda explicacao do processamento
6. `knowledge-base/` guarda o aprendizado consolidado

## Limitacoes Atuais

1. a ferramenta roda no navegador e nao grava automaticamente nas pastas do projeto sem acao do usuario
2. OCR ruim ainda pode gerar perdas ou leituras parciais
3. se a imagem entregar apenas `youtube.com`, a ferramenta nao consegue reconstruir sozinha um prefixo perdido como `funny-youtube.com`
4. ainda nao existe uma camada formal de confianca por dominio extraido

## Direcao Atual

O projeto esta em fase de endurecimento orientado por casos reais.

Estrategia:

1. adicionar arquivos reais em `fixtures/`
2. rodar extracao
3. observar metricas e problemas
4. ajustar o motor
5. repetir o processo
6. consolidar o aprendizado em `knowledge-base/`

## Resumo Curto

Esta ferramenta local extrai dominios de PDFs e TXT, limpa ruido, aplica whitelist critica, compara listas antigas e novas e gera arquivos finais prontos para bloqueio DNS. O projeto foi estruturado para trabalhar sem banco de dados, usando pastas locais para testes, exportacoes, auditorias e base de conhecimento. O foco principal e reduzir falsos positivos e falsos negativos em documentos reais, especialmente PDFs assinados e OCR, porque qualquer erro pode impactar diretamente ambientes de provedores e servicos legitimos.
