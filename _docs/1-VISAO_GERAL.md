# Visão Geral do Sistema — Endoscopia Correlação

> Documento de negócio descrevendo o fluxo completo do `app.py`, os pontos de decisão do motor de correlação e os possíveis valores de cada coluna-chave do CSV de saída.

---

## 1. Propósito do Sistema

O sistema recebe dois arquivos periódicos produzidos por fontes distintas e os **correlaciona automaticamente** para identificar discrepâncias de faturamento:

| Arquivo | Quem produz | O que contém |
|---|---|---|
| **PRODUÇÃO** (CSV) | Equipe de enfermagem / clínica | Todos os procedimentos realizados: data, paciente, procedimento, médico |
| **REPASSE** (CSV) | Hospital / convênio | Todos os procedimentos **pagos**: código TUSS, valor liberado, NrAtendimento |

O objetivo é descobrir:
- Procedimentos realizados que **não foram pagos** (NAO_FATURADO)
- Procedimentos pagos com o **código TUSS errado** (divergência de código)
- Procedimentos adicionais **não faturados separadamente** (código ausente)
- Pagamentos do hospital **sem correspondência** na produção da clínica (REPASSE_NAO_IDENTIFICADO)

O resultado final é um **CSV de correlação** e, opcionalmente, um **formulário XLSX** para solicitar revisão de valores ao hospital.

---

## 2. Fluxo Geral

```
┌─────────────┐     ┌─────────────┐
│  PRODUÇÃO   │     │   REPASSE   │
│    (CSV)    │     │    (CSV)    │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └────────┬──────────┘
                ▼
      ┌─────────────────┐
      │  Normalização   │  Detecta formato (2025_LEGADO/2025_NOVO/2026)
      │  e padronização │  Normaliza nomes, datas, procedimentos
      └────────┬────────┘
               ▼
      ┌─────────────────┐
      │ Motor de        │  6 métodos de match (ver §3)
      │ Correlação      │  Preenche MetodoMatch e StatusCorrelacao
      └────────┬────────┘
               ▼
      ┌─────────────────┐
      │ Verificação     │  Consulta tabela TUSS (152 combinações)
      │ TUSS            │  Preenche StatusTUSS, CodigosTUSS_Esperados,
      └────────┬────────┘  CodigosTUSS_Ausentes, DescricaoTUSS
               ▼
      ┌─────────────────┐
      │ Enriquecimento  │  Busca ValorEstimado_TUSS por convênio
      │ de Valores      │  Refina GLOSA_PARCIAL por comparação de valores
      └────────┬────────┘
               ▼
      ┌─────────────────┐
      │  CSV de saída   │  correlacao_endoscopia_AAAA_YYYYMMDD_HHMMSS.csv
      │  (46 colunas)   │
      └────────┬────────┘
               ▼
      ┌─────────────────┐
      │ Formulário XLSX │  Gerado sob demanda na aba "Cobrança"
      │ (opcional)      │  Apenas casos com valor a recuperar
      └─────────────────┘
```

---

## 3. Motor de Correlação — `MetodoMatch`

A correlação parte da **PRODUÇÃO** e tenta encontrar um registro correspondente no **REPASSE** usando 6 métodos em cascata, do mais preciso ao mais tolerante.

### 3.1 Métodos de match (ordem de aplicação)

| Valor em `MetodoMatch` | Descrição | Chave usada |
|---|---|---|
| `1_NOME_COMPLETO_DATA_PROCEDIMENTO` | **Match principal** — nome completo normalizado + data exata + similaridade de procedimento ≥ limiar | (Data, Paciente) exato ou ±1 dia |
| `2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO` | **Fallback por número de atendimento** — quando o nome não encontra match, tenta pela chave (Data, NrAtendimento) | (Data, NrAtendimento) exato ou ±1 dia |
| `3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA` | **Fallback fuzzy** — combina subconjuntos de tokens do nome com similaridade Levenshtein, data exata | Tokens parciais do nome |
| `4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL` | **Fallback data ampla** — nome exato + procedimento similar, mas data com tolerância de ±7 dias | (Paciente, Procedimento, Data±7d) |
| `5_FALLBACK_PROCEDIMENTO_ADICIONAL_PROCEDIMENTO_ADICIONAL` | **ENRIQUECIMENTO DOS DADOS COM PROCEDIMENTO_ADICIONAL** — entrada do REPASSE é um procedimento adicional (ex.: Urease isolada) cujo procedimento principal já foi correlacionado no mesmo episódio | Paciente + Data±1d no índice de correlacionados |
| `SEM_MATCH` | Nenhum método encontrou correspondência | — |

> **Nota de rastreabilidade:** Quando o match é encontrado por fallback, o sufixo `_FALLBACK_1`, `_FALLBACK_2` ou `_VIA_NR_ATENDIMENTO` é adicionado ao `StatusCorrelacao` para sinalizar que o match foi menos preciso e pode requerer revisão humana.

### 3.2 Normalização de nomes

Antes de qualquer comparação, todos os nomes de pacientes passam por:
1. Remoção de acentos (NFKD)
2. Conversão para maiúsculas
3. Remoção de partículas (`DE`, `DA`, `DO`, `DOS`, `DAS`, `E`)
4. Colapso de espaços duplos

### 3.3 Similaridade de procedimento

Usa a métrica **SequenceMatcher** (biblioteca `difflib`) para comparar os textos dos procedimentos. O limiar padrão é configurável (default: 0,5). Procedimentos **anatomicamente divergentes** (ex.: "Endoscopia Alta" vs. "Colonoscopia") são bloqueados por uma lista de pares incompatíveis mesmo que a string seja similar.

---

## 4. StatusCorrelacao — Todos os valores possíveis

A coluna `StatusCorrelacao` registra o resultado da tentativa de correlação entre uma linha da PRODUÇÃO e o REPASSE.

### 4.1 Linhas originadas da PRODUÇÃO

| Status | Significado de negócio |
|---|---|
| `CORRELACIONADO` | Procedimento encontrado no repasse com valor liberado > 0. Situação normal. |
| `CORRELACIONADO_COM_GLOSA_TOTAL` | Encontrado no repasse, mas o valor liberado é **zero** (glosa total pelo convênio). |
| `CORRELACIONADO_COM_GLOSA_PARCIAL` | Encontrado no repasse, mas o valor pago é **inferior ao estimado pela tabela TUSS** (diferença > 5%). |
| `NAO_FATURADO_NO_REPASSE` | Procedimento consta na produção, mas **não foi encontrado** em nenhum método de match no repasse. O convênio não pagou. |

> **Sufixos de rastreabilidade** aplicados quando o match usa fallback:

| Sufixo | Indica |
|---|---|
| `_FALLBACK_1` | Match obtido via Fallback 3 (nome parcial fuzzy) |
| `_FALLBACK_2` | Match obtido via Fallback 4 (data flexível ±7 dias) |
| `_VIA_NR_ATENDIMENTO` | Match obtido via Fallback 2 (número de atendimento) |
| `_PROCEDIMENTO_DIVERGENTE` | O procedimento do REPASSE é anatomicamente incompatível com o da PRODUÇÃO — requer revisão humana |

### 4.2 Linhas originadas do REPASSE (sem correspondência na produção)

| Status | Significado de negócio |
|---|---|
| `REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO` | O hospital pagou um procedimento que **não consta na planilha de produção** da clínica. |
| `REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO` | O repasse tem data anterior ao período coberto pela produção enviada (faturamento tardio de exames antigos). |
| `CORRELACIONADO_PROCEDIMENTO_ADICIONAL` | Entrada do repasse é um  PROCEDIMENTO_ADICIONAL (ex.: Urease, Anátomo Patológico isolado) cujo procedimento principal **já foi correlacionado** no mesmo episódio (Fallback 5). |

---

## 5. Verificação TUSS — `StatusTUSS`

Após a correlação, cada linha é avaliada contra a **tabela de mapeamento TUSS** (152 combinações Procedimento → Código TUSS) para verificar se os códigos cobrados estão corretos.

### 5.1 Lógica de decisão por grupo

```
┌─────────────────────────────────────────┐
│ StatusCorrelacao                        │
├──────────────┬──────────────────────────┤
│ NAO_FATURADO │ Busca combinação na      │→ TUSS_NAO_FATURADO_MAPEADO
│ _NO_REPASSE  │ tabela TUSS              │→ TUSS_COMBINACAO_SEM_MAPEAMENTO
├──────────────┼──────────────────────────┤
│ REPASSE_NAO  │ Copia CodigoTUSS_REPASSE │→ TUSS_REPASSE_SEM_PRODUCAO
│ _IDENTIFICADO│ como código esperado     │
├──────────────┼──────────────────────────┤
│ CORRELACIONADO│ Verifica código pago    │→ Ver §5.2
│ (todos tipos)│ vs. código esperado TUSS │
└──────────────┴──────────────────────────┘
```

### 5.2 StatusTUSS — Todos os valores possíveis

| Valor em `StatusTUSS` | Quando é atribuído | Impacto financeiro |
|---|---|---|
| `TUSS_PROC_PRINCIPAL_OK` | Procedimento simples (sem adicional) e o código pago no repasse **é exatamente** o esperado pela tabela TUSS | Nenhum — faturamento correto |
| `TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL` | Existe procedimento adicional, mas a tabela TUSS indica que ele deve ser cobrado **com o mesmo código** do principal (não gera linha separada) | Nenhum — correto conforme tabela |
| `TUSS_PROC_ADICIONAL_RECONHECIDO` | Procedimento adicional com código único, e esse código **foi encontrado** no repasse do mesmo episódio | Nenhum — adicional faturado corretamente |
| `TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS` | Múltiplos códigos adicionais esperados, e **todos foram encontrados** no repasse | Nenhum — completo |
| `TUSS_CODIGO_PRINCIPAL_DIVERGENTE` | O código pago no repasse **difere** do esperado para o procedimento principal (ex.: cobrou 40201120 mas deveria ser 40202038) | ⚠️ Gera item no formulário de cobrança |
| `TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES` | Existe adicional, mas o convênio usou apenas o código simples, ignorando o adicional (downgrade de código) | ⚠️ Gera item no formulário |
| `TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE` | Múltiplos códigos esperados, mas **um ou mais** não foram encontrados no repasse do episódio | ⚠️ Gera item no formulário |
| `TUSS_NAO_FATURADO_MAPEADO` | Procedimento não faturado (`NAO_FATURADO_NO_REPASSE`) e a combinação **existe** na tabela TUSS | ⚠️ Gera item no formulário (valor integral) |
| `TUSS_REPASSE_SEM_PRODUCAO` | Entrada do repasse sem correspondência na produção | 📋 Informativo — para conferência |
| `TUSS_COMBINACAO_SEM_MAPEAMENTO` | A combinação Procedimento + Adicional **não existe** na tabela de mapeamento TUSS (ex.: "Endoscopia + Teste de Urease") | 📋 Informativo — tabela incompleta |

---

## 6. Colunas de detalhe TUSS

### 6.1 `CodigosTUSS_Esperados`

Código(s) TUSS que a tabela de mapeamento indica como **correto(s)** para a combinação de procedimento realizado.

- **Preenchido quando:** StatusTUSS diferente de `TUSS_PROC_PRINCIPAL_OK`, `TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL` e `TUSS_COMBINACAO_SEM_MAPEAMENTO`
- **Formato:** código único (`40202038`) ou lista separada por vírgula (`40202038, 40202186`)
- **Vazio quando:** não há mapeamento TUSS ou o faturamento está correto e sem divergência

### 6.2 `DescricaoTUSS`

Descrição oficial do código TUSS esperado, preenchida em duas etapas:

1. **Etapa 1 — verificar_tuss_adicionais:** usa o campo `Descricao_REPASSE` da tabela de mapeamento
2. **Etapa 2 — _enriquecer_com_valores_tuss:** complementa via `desc_lookup` (tabela `tuss_valores.csv`) quando a descrição ainda está vazia

- **Preenchido quando:** `CodigosTUSS_Esperados` está preenchido (independente do StatusTUSS)
- **Vazio quando:** sem código esperado ou combinação sem mapeamento

### 6.3 `CodigosTUSS_Ausentes`

Lista dos códigos TUSS que **deveriam** ter sido faturados separadamente, mas estão **ausentes** no repasse.

- **Preenchido apenas quando:** `StatusTUSS = TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE`
- **Formato:** código(s) separados por vírgula
- **Lógica:** O sistema verifica cada código adicional esperado no índice do repasse (por paciente + data ±1 dia + código). Os não encontrados vão para esta coluna.

### 6.4 `ValorEstimado_TUSS`

Valor de referência (R$) para o código esperado, consultado na base histórica `tuss_valores.csv` por convênio.

**Regra de preenchimento:**

| StatusTUSS | ValorEstimado_TUSS preenchido? | Representa |
|---|---|---|
| `TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES` | ✅ Sim | Valor esperado pelo código correto |
| `TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE` | ✅ Sim | Valor do código ausente |
| `TUSS_CODIGO_PRINCIPAL_DIVERGENTE` | ✅ Sim | Valor esperado pelo código correto |
| `TUSS_NAO_FATURADO_MAPEADO` (NAO_FATURADO) | ✅ Sim | Valor integral do procedimento não pago |
| `TUSS_PROC_PRINCIPAL_OK` | ❌ Não | Faturamento correto, sem necessidade |
| `TUSS_PROC_ADICIONAL_RECONHECIDO` | ❌ Não | Adicional já reconhecido corretamente |
| `TUSS_COMBINACAO_SEM_MAPEAMENTO` | ❌ Não | Sem referência na tabela |

**Prioridade de busca do valor:**
1. `UltimoValor` por convênio específico (mais preciso)
2. `Media` por convênio específico
3. `UltimoValor` GERAL (todos convênios)
4. Vazio (sem histórico disponível)

---

## 7. Geração do Formulário XLSX

### 7.1 Propósito

O formulário (aba **"Cobrança"** do app) é o **instrumento formal** de solicitação de revisão ao hospital. É gerado sob demanda a partir do CSV de correlação e consolida apenas os casos em que há valor a recuperar.

### 7.2 Quais linhas entram no formulário

O usuário pode ativar/desativar três categorias via checkbox:

| Categoria | StatusTUSS filtrado | Tipo de cobrança |
|---|---|---|
| 🔴 **Cobrado Como Simples** | `TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES` | Diferença entre código correto e código pago |
| 🟠 **Código Adicional Ausente** | `TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE` | Valor do código adicional não faturado |
| ❌ **Procedimento Não Faturado** | `NAO_FATURADO_NO_REPASSE` com mapeamento TUSS | Valor integral do procedimento não pago |

### 7.3 Cálculo da coluna VALOR (coluna J do XLSX)

O comportamento varia por categoria:

#### Categoria "🔴 Cobrado Como Simples" (downgrade)

```
VALOR = ValorEstimado(código_correto) − ValorEstimado(código_pago)
```

Busca o valor histórico do código correto e subtrai o valor do código que o convênio efetivamente pagou (pelo convênio específico, ou GERAL como fallback).

**⚠️ Pode ser negativo quando:** o código correto (mais completo) tem valor tabelado *menor* que o código simples pago pelo convênio. Isso ocorre por variação nas tabelas de cada plano — alguns planos remuneram mais o código simples. Nesses casos, não há valor a recuperar.

#### Categoria "🟠 Código Adicional Ausente" (ausente)

```
VALOR = ValorEstimado(código_ausente)
```

Valor integral do código adicional que deveria ter sido faturado separadamente. **Sempre positivo** (ou nulo quando não há histórico).

#### Categoria "❌ Procedimento Não Faturado" (não faturado)

```
VALOR = ValorEstimado(código_do_procedimento)
```

Valor integral do procedimento não encontrado no repasse. **Sempre positivo** (ou nulo quando não há histórico).

### 7.4 Confiança do valor estimado

Cada valor estimado recebe uma classificação de **confiança** baseada no histórico disponível:

| Confiança | Critério | Destaque no XLSX |
|---|---|---|
| **Alta** | ≥ 5 registros históricos, desvio padrão ≤ 5% da média | Sem destaque |
| **Boa** | ≥ 5 registros, desvio ≤ 20% | Sem destaque |
| **Moderada** | ≥ 2 registros | Sem destaque |
| **Baixa** | Apenas 1 registro | 🟡 Célula amarela |
| **Sem dados** | Nenhum registro histórico | 🟡 Célula amarela |

### 7.5 Por que existem valores negativos no formulário

Os valores negativos são **exclusivamente** da categoria "🔴 Cobrado Como Simples" e indicam que, para aquele convênio específico, o preço tabelado do código correto (mais completo) é **inferior** ao preço que o convênio pagou pelo código mais simples.

**Exemplo real identificado:**
- Convênio pagou R$ 188,40 pelo código `40201120` (Endoscopia Simples)
- Código correto seria `40202038` (Endoscopia com Biópsia) → estimativa: R$ 176,80
- VALOR = 176,80 − 188,40 = **−11,60** (sem recuperação possível neste caso)

**Plano de correção:** filtrar do formulário itens com `VALOR < 0` antes de incluí-los, pois não representam valores a reclamar.

---

## 8. Resumo dos principais pontos de decisão

```
1. Existe match no REPASSE?
   ├─ Não → NAO_FATURADO_NO_REPASSE
   └─ Sim  → qual método? → MetodoMatch
              └─ valor liberado?
                 ├─ 0 → CORRELACIONADO_COM_GLOSA_TOTAL
                 └─ > 0 → CORRELACIONADO
                            └─ após enriquecimento TUSS:
                               se ValorLiberado < 95% ValorEstimado
                               → CORRELACIONADO_COM_GLOSA_PARCIAL

2. Para cada linha CORRELACIONADO: existe procedimento adicional (PA)?
   ├─ Não → verifica código principal → TUSS_PROC_PRINCIPAL_OK ou TUSS_CODIGO_PRINCIPAL_DIVERGENTE
   └─ Sim → qual TipoCobrança na tabela TUSS?
             ├─ unico_somente_principal → TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL
             ├─ unico_inclui_PA        → TUSS_PROC_ADICIONAL_RECONHECIDO ou COBRADO_COMO_SIMPLES
             └─ multiplos_codigos      → TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS ou AUSENTE_NO_REPASSE

3. Para cada linha NAO_FATURADO: existe combinação na tabela TUSS?
   ├─ Sim → TUSS_NAO_FATURADO_MAPEADO (entra no formulário)
   └─ Não → TUSS_COMBINACAO_SEM_MAPEAMENTO (informativo)

4. Para cada linha REPASSE_NAO_IDENTIFICADO:
   → TUSS_REPASSE_SEM_PRODUCAO (CodigosTUSS_Esperados = código do repasse)
```

---

*Documento gerado em 23/05/2026 com base na versão atual do `app.py` (5.256 linhas).*
