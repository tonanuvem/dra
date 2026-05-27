# Guia de StatusTUSS — Valores, Atribuição e Impacto Financeiro

> Referência completa de todos os valores possíveis na coluna `StatusTUSS` do CSV `correlacao_endoscopia`. Para cada status: quando é atribuído, o que significa para o faturamento e exemplos reais extraídos do lote `correlacao_endoscopia_20260522_210806.csv` (5.772 registros).

---

## Visão Geral

A coluna `StatusTUSS` é preenchida **após** a correlação, durante a etapa de verificação TUSS. Ela classifica cada linha de acordo com a conformidade entre o que foi realizado (PRODUÇÃO), o que foi pago (REPASSE) e o que a tabela TUSS diz que deveria ter sido cobrado.

### Tabela resumo de todos os status

| StatusTUSS | Volume | Impacto financeiro | Entra no formulário? |
|---|:---:|---|:---:|
| `TUSS_PROC_PRINCIPAL_OK` | 844 | ✅ Nenhum — faturamento correto | Não |
| `TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL` | 4 | ✅ Nenhum — correto conforme tabela | Não |
| `TUSS_PROC_ADICIONAL_RECONHECIDO` | 957 | ✅ Nenhum — adicional já faturado | Não |
| `TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS` | 15 | ✅ Nenhum — todos os códigos presentes | Não |
| `TUSS_CODIGO_PRINCIPAL_DIVERGENTE` | 264 | ⚠️ Código errado — diferença a cobrar | **Sim** |
| `TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES` | 872 | ⚠️ Adicional ignorado — diferença a cobrar | **Sim** |
| `TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE` | 94 | ⚠️ Código separado não faturado — valor a cobrar | **Sim** |
| `TUSS_NAO_FATURADO_MAPEADO` | 2070 | 🔴 Procedimento inteiro não pago — valor integral a cobrar | **Sim** |
| `TUSS_REPASSE_SEM_PRODUCAO` | 650 | 📋 Informativo — pagamento sem registro na clínica | Não |
| `TUSS_COMBINACAO_SEM_MAPEAMENTO` | 2 | 📋 Informativo — lacuna na tabela TUSS | Não |

---

## Como o StatusTUSS é determinado

```
Cada linha do CSV passa por verificar_tuss_adicionais(), que decide:

StatusCorrelacao == NAO_FATURADO_NO_REPASSE?
  ├─ Sim → busca chave (Procedimento_Adicional) na tabela TUSS
  │         ├─ Encontrou → TUSS_NAO_FATURADO_MAPEADO
  │         └─ Não encontrou → TUSS_COMBINACAO_SEM_MAPEAMENTO
  │
StatusCorrelacao ∈ {REPASSE_NAO_IDENTIFICADO, REPASSE_DATA_FORA}?
  ├─ Sim → copia CodigoTUSS_REPASSE como esperado
  │         └─ TUSS_REPASSE_SEM_PRODUCAO
  │
StatusCorrelacao começa com CORRELACIONADO?
  └─ Sim → tem ProcedimentoAdicional?
            ├─ Não (proc simples):
            │   ├─ TipoCobrança == unico_cod_tuss_somente_proc_principal
            │   │   ├─ código pago == esperado → TUSS_PROC_PRINCIPAL_OK
            │   │   └─ código pago ≠ esperado → TUSS_CODIGO_PRINCIPAL_DIVERGENTE
            │   └─ sem match na tabela → TUSS_COMBINACAO_SEM_MAPEAMENTO
            │
            └─ Sim (tem adicional):
                ├─ TipoCobrança == unico_somente_principal
                │   └─ TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL
                ├─ TipoCobrança == unico_inclui_adicional_e_principal
                │   ├─ código pago == esperado → TUSS_PROC_ADICIONAL_RECONHECIDO
                │   └─ código pago ≠ esperado → TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES
                └─ TipoCobrança == multiplos_codigos
                    ├─ todos encontrados no repasse → TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS
                    └─ algum ausente → TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE
```

---

## Status 1 — `TUSS_PROC_PRINCIPAL_OK`

### Definição

O procedimento foi realizado **sem procedimento adicional** (ou com adicional incorporado) e o **código TUSS pago pelo convênio é exatamente o esperado** pela tabela de mapeamento. Situação de faturamento correto.

### Quando é atribuído

- `StatusCorrelacao` começa com `CORRELACIONADO`
- Não há `ProcedimentosAdicionais_PRODUCAO` (ou campo vazio/nan)
- A tabela TUSS indica `TipoCobranca = unico_cod_tuss_somente_proc_principal`
- `CodigoTUSS_REPASSE == CodigosTUSS_Esperados`

### Impacto financeiro

**Nenhum.** O faturamento está correto. Este registro não gera item no formulário de cobrança.

### Volume no lote atual: 844 registros

---

#### Exemplo 1.A — Colonoscopia simples, match direto

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/02/2025 | 01/02/2025 |
| **Paciente** | CESAR AUGUSTO MARQUES | CESAR AUGUSTO MARQUES |
| **Convênio** | BRADESCO | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Adicional** | — | — |
| **Código TUSS** | — | **40201082** |
| **Valor Liberado** | — | R$ 249,50 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.95` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_PROC_PRINCIPAL_OK` |
| `CodigosTUSS_Esperados` | `40201082` |
| `DescricaoTUSS` | `Colonoscopia (Inclui A Retossigmoidoscopia)` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA sem adicional → chave TUSS = "COLONO_"
2. Correlação: nome exato + data exata → match imediato (Método 1)
3. Tabela TUSS: "COLONO_" → TipoCobrança=unico, código=40201082
4. REPASSE pagou 40201082 == esperado 40201082 → TUSS_PROC_PRINCIPAL_OK ✓
```

---

#### Exemplo 1.B — Colonoscopia simples, convênio diferente

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/02/2025 | 01/02/2025 |
| **Paciente** | MONICA DIAS DE JESUS | MONICA DIAS DE JESUS |
| **Convênio** | PROMOVE | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Código TUSS pago** | — | **40201082** |
| **Valor Liberado** | — | R$ 631,38 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_PROC_PRINCIPAL_OK` |
| `CodigosTUSS_Esperados` | `40201082` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA sem adicional → chave "COLONO_"
2. Correlação: match exato → CORRELACIONADO
3. Tabela TUSS: código esperado = 40201082
4. Código pago = 40201082 → TUSS_PROC_PRINCIPAL_OK ✓
   (Nota: valor R$631,38 é maior que R$249,50 anterior — PROMOVE paga mais que BRADESCO)
```

---

#### Exemplo 1.C — Colonoscopia via fallback de data, código correto

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/02/2025 | **30/01/2025** (2 dias antes) |
| **Paciente** | ROSANGELA CARA LOPES | ROSANGELA CARA LOPES |
| **Convênio** | PORTO SEGURO | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Código TUSS pago** | — | **40201082** |
| **Valor Liberado** | — | R$ 205,50 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL` |
| `StatusCorrelacao` | `CORRELACIONADO_FALLBACK_2` |
| `StatusTUSS` | `TUSS_PROC_PRINCIPAL_OK` |
| `CodigosTUSS_Esperados` | `40201082` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA em 01/02/2025 → busca por nome+data não encontra em ±1 dia
2. Fallback 4 (data ±7 dias): encontra registro de 30/01/2025 → match por nome+proc
3. StatusCorrelacao = CORRELACIONADO_FALLBACK_2 (recomendado revisão humana pela data)
4. Código pago 40201082 == esperado → TUSS_PROC_PRINCIPAL_OK ✓
   (O código está correto apesar do gap de data)
```

---

## Status 2 — `TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL`

### Definição

Existe um procedimento adicional registrado na PRODUÇÃO, mas a tabela TUSS indica que esse adicional **deve ser cobrado com o mesmo código do procedimento principal** — ou seja, não gera um código TUSS separado. O convênio já pagou corretamente ao usar o código do procedimento principal.

### Quando é atribuído

- `StatusCorrelacao` começa com `CORRELACIONADO`
- Existe `ProcedimentosAdicionais_PRODUCAO`
- Tabela TUSS indica `TipoCobranca = unico_cod_tuss_somente_proc_principal`
- Esse tipo significa: o adicional está **incluído** no procedimento principal, sem código próprio

### Impacto financeiro

**Nenhum.** O faturamento está correto — o adicional já estava embutido no código principal pago. Nenhum valor a recuperar.

### Volume no lote atual: 4 registros

---

#### Exemplo 2.A — CPRE com retirada de prótese (adicional incorporado)

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 14/10/2025 | 14/10/2025 |
| **Paciente** | MARIA VERAS DE SOUSA SILVA | MARIA VERAS DE SOUSA SILVA |
| **Convênio** | SEGUROS UNIMED | — |
| **Procedimento** | CPRE | Colangiopancreatografia Retrógrada |
| **Adicional** | RETIRADA DE PRÓTESE BILIAR | — |
| **Código TUSS pago** | — | **40201074** |
| **Valor Liberado** | — | R$ 219,96 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `1.00` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL` |
| `CodigosTUSS_Esperados` | `40201074` |
| `DescricaoTUSS` | `Colangiopancreatografia Retrógrada Endoscópica` |

**Fluxo:**
```
1. PRODUÇÃO: CPRE + RETIRADA DE PRÓTESE BILIAR
2. Chave TUSS: "CPRE_RETIRADA DE PRÓTESE BILIAR" → normalizada → busca na tabela
3. Tabela TUSS: TipoCobrança = "unico_cod_tuss_somente_proc_principal"
   → A retirada de prótese está incluída no código do CPRE (40201074)
   → Não há código adicional separado a cobrar
4. Código pago = 40201074 (correto) → TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL ✓
```

---

#### Exemplo 2.B — Colonoscopia com adicional nominal incorporado

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 03/01/2025 | 03/01/2025 |
| **Paciente** | EDSON JOSE INZONHA | EDSON JOSE INZONHA |
| **Convênio** | VIVEST | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Adicional** | `-` (traço como placeholder) | — |
| **Código TUSS pago** | — | **40201082** |
| **Valor Liberado** | — | R$ 215,00 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL` |
| `CodigosTUSS_Esperados` | `40201082` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA com adicional = "-" (traço inserido manualmente)
   O sistema detecta o traço como adicional não-vazio → entra no fluxo com PA
2. Chave TUSS: "COLONO_-" normalizada → tabela mapeia para TipoCobrança principal
3. O "-" é tratado como adicional sem significado clínico → incorporado
4. Código pago correto → TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL ✓
```

---

#### Exemplo 2.C — Endoscopia com adicional duplicado (campo preenchido igual ao principal)

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 30/05/2025 | 30/05/2025 |
| **Paciente** | ANDERSON DA SILVA CARVALHO | ANDERSON DA SILVA CARVALHO |
| **Convênio** | SUL AMERICA | — |
| **Procedimento** | ENDOSCOPIA | Endoscopia Digestiva Alta Com Biópsia E Teste De Urease |
| **Adicional** | ENDOSCOPIA (mesmo valor do principal) | — |
| **Código TUSS pago** | — | **40202615** |
| **Valor Liberado** | — | R$ 96,01 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL` |
| `CodigosTUSS_Esperados` | `40201120` |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA + adicional = "ENDOSCOPIA" (campo preenchido com o mesmo procedimento)
2. Chave normalizada: "ENDOSCOPIA_ENDOSCOPIA" → tabela retorna tipo principal
3. Adicional é redundante com o principal → incorporado automaticamente
4. Faturamento aceito → TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL ✓
```

---

## Status 3 — `TUSS_PROC_ADICIONAL_RECONHECIDO`

### Definição

O procedimento foi realizado **com um adicional** e o convênio pagou um **código TUSS único que engloba tanto o procedimento principal quanto o adicional**. O código pago é exatamente o esperado pela tabela TUSS.

### Quando é atribuído

- `StatusCorrelacao` começa com `CORRELACIONADO`
- Existe `ProcedimentosAdicionais_PRODUCAO`
- Tabela TUSS indica `TipoCobranca = unico_cod_tuss_inclui_proc_adicional_e_principal`
- `CodigoTUSS_REPASSE == CodigosTUSS_Esperados`

### Impacto financeiro

**Nenhum.** O convênio reconheceu o procedimento adicional e usou o código correto que o inclui. Nada a recuperar.

### Volume no lote atual: 957 registros

---

#### Exemplo 3.A — Endoscopia com Teste de Urease, código correto

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/02/2025 | 01/02/2025 |
| **Paciente** | CESAR AUGUSTO MARQUES | CESAR AUGUSTO MARQUES |
| **Convênio** | BRADESCO | — |
| **Procedimento** | ENDOSCOPIA | Endoscopia Digestiva Alta Com Biópsia E Teste De Urease |
| **Adicional** | TESTE DE UREASE | — |
| **Código TUSS pago** | — | **40202615** |
| **Valor Liberado** | — | R$ 184,62 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.95` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_PROC_ADICIONAL_RECONHECIDO` |
| `CodigosTUSS_Esperados` | `40202615` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)` |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA + TESTE DE UREASE → chave "ENDOSCOPIA_TESTE DE UREASE"
2. Tabela TUSS: TipoCobrança = "unico_cod_tuss_inclui_proc_adicional_e_principal"
   Código esperado único: 40202615 (inclui Endoscopia + Urease em um só código)
3. REPASSE pagou 40202615 == esperado 40202615 → TUSS_PROC_ADICIONAL_RECONHECIDO ✓
   O convênio reconheceu o adicional e usou o código composto correto
```

---

#### Exemplo 3.B — Colonoscopia com Anátomo Patológico

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/03/2025 | 28/02/2025 (1 dia antes) |
| **Paciente** | JANDYRA HIPOLITO | JANDYRA HIPOLITO |
| **Convênio** | CABESP | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia Com Biópsia E/Ou Citologia |
| **Adicional** | ANÁTOMO PATOLÓGICO | — |
| **Código TUSS pago** | — | **40202666** |
| **Valor Liberado** | — | R$ 623,29 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.95` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_PROC_ADICIONAL_RECONHECIDO` |
| `CodigosTUSS_Esperados` | `40202666` |
| `DescricaoTUSS` | `Colonoscopia Com Biópsia E/Ou Citologia` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA + ANÁTOMO PATOLÓGICO → chave "COLONO_ANATOMO PATOLOGICO"
2. Tabela TUSS: código único 40202666 (Colonoscopia com Biópsia) já inclui o Anátomo
3. REPASSE pagou 40202666 == esperado → TUSS_PROC_ADICIONAL_RECONHECIDO ✓
   (Data com 1 dia de antecedência — dentro da tolerância normal)
```

---

#### Exemplo 3.C — Endoscopia com Urease Positivo (variação de texto)

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/03/2025 | 01/03/2025 |
| **Paciente** | KLEBER ENDRIGO DE REZENDE | KLEBER ENDRIGO DE REZENDE |
| **Convênio** | CAIXA | — |
| **Procedimento** | ENDOSCOPIA | Endoscopia Digestiva Alta Com Biópsia E Teste De Urease |
| **Adicional** | TESTE UREASE - POSITIVO | — |
| **Código TUSS pago** | — | **40202615** |
| **Valor Liberado** | — | R$ 163,69 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_PROC_ADICIONAL_RECONHECIDO` |
| `CodigosTUSS_Esperados` | `40202615` |

**Fluxo:**
```
1. PRODUÇÃO: adicional = "TESTE UREASE - POSITIVO" (variação do texto padrão)
2. Normalização remove acentos e pontuação → casa com entrada da tabela
3. Código esperado: 40202615 | pago: 40202615 → TUSS_PROC_ADICIONAL_RECONHECIDO ✓
   (O resultado do teste — positivo/negativo — não altera o código TUSS a cobrar)
```

---

## Status 4 — `TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS`

### Definição

O procedimento tem adicional que gera **múltiplos códigos TUSS separados** (cada um deve aparecer individualmente no repasse), e o sistema verificou que **todos esses códigos foram encontrados** no repasse do mesmo episódio.

### Quando é atribuído

- `StatusCorrelacao` começa com `CORRELACIONADO`
- Existe `ProcedimentosAdicionais_PRODUCAO`
- Tabela TUSS indica `TipoCobranca = multiplos_cod_tuss_proced_adicional`
- Todos os códigos adicionais esperados foram encontrados no índice do repasse (Paciente + Data ±1 dia + Código)

### Impacto financeiro

**Nenhum.** Todos os procedimentos adicionais foram faturados individualmente e estão presentes no repasse. Situação ideal para procedimentos complexos.

### Volume no lote atual: 15 registros

---

#### Exemplo 4.A — Colonoscopia com Urease, ambos os códigos presentes

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 02/07/2025 | 02/07/2025 |
| **Paciente** | ALEXSANDRA DA SILVA | ALEXSANDRA DA SILVA |
| **Convênio** | BRADESCO | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Adicional** | TESTE DE UREASE | — |
| **Código TUSS pago** | — | **40201082** |
| **Valor Liberado** | — | R$ 249,50 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS` |
| `CodigosTUSS_Esperados` | `40202615` |
| `DescricaoTUSS` | `Colonoscopia + Teste De Urease Para Pesquisa De Helicobacter Pylori` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA + TESTE DE UREASE → tabela indica múltiplos códigos
2. Tabela TUSS: código base 40201082 (Colonoscopia) + código adicional 40202615 (Urease)
3. Sistema verifica no índice do repasse: (ALEXSANDRA, 02/07/2025, 40202615) → encontrado ✓
4. Todos os códigos adicionais presentes → TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS ✓
```

---

#### Exemplo 4.B — Endoscopia com Urease e Polipectomia, múltiplos códigos todos presentes

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 03/09/2025 | 03/09/2025 |
| **Paciente** | SAMUEL DE SOUZA SILVA | SAMUEL DE SOUZA SILVA |
| **Convênio** | BRADESCO | — |
| **Procedimento** | ENDOSCOPIA | Endoscopia Digestiva Alta Com Biópsia E Teste De Urease |
| **Adicional** | TESTE DE UREASE / ANÁTOMO / POLIPECTOMIA | — |
| **Código TUSS pago** | — | **40202615** |
| **Valor Liberado** | — | R$ 184,62 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS` |
| `CodigosTUSS_Esperados` | `40202615, 40202550` |
| `DescricaoTUSS` | `Endoscopia Alta Com Urease E Polipectomia` |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA + TESTE DE UREASE / ANÁTOMO / POLIPECTOMIA → múltiplos códigos
2. Tabela TUSS: códigos adicionais esperados = [40202615, 40202550]
3. Verifica no índice do repasse:
   - (SAMUEL, 03/09/2025, 40202615) → encontrado ✓
   - (SAMUEL, 03/09/2025, 40202550) → encontrado ✓
4. Todos presentes → TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS ✓
```

---

#### Exemplo 4.C — Colonoscopia com Urease, código superior já engloba o adicional

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 05/04/2025 | 05/04/2025 |
| **Paciente** | MARLY PESEL RODRIGUES | MARLY PESEL RODRIGUES |
| **Convênio** | AMIL | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia Com Biópsia E/Ou Citologia |
| **Adicional** | TESTE DE UREASE - NEGATIVO | — |
| **Código TUSS pago** | — | **40202666** |
| **Valor Liberado** | — | R$ 495,00 |

| Coluna CSV | Valor |
|---|---|
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS` |
| `CodigosTUSS_Esperados` | `40202615` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA + TESTE DE UREASE - NEGATIVO
2. Código adicional esperado: 40202615 (Colonoscopia + Urease)
3. Repasse pagou 40202666 (Colonoscopia com Biópsia) — código diferente do principal (40201082)
   mas no índice o 40202615 foi encontrado para o mesmo paciente/data
4. Todos os códigos adicionais verificados estão presentes → TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS ✓
```

---

## Status 5 — `TUSS_CODIGO_PRINCIPAL_DIVERGENTE`

### Definição

O procedimento foi correlacionado com o REPASSE, mas o **código TUSS pago pelo convênio é diferente do código esperado** pela tabela de mapeamento para o procedimento principal. Pode indicar erro de lançamento pelo hospital ou uso de um código mais genérico/específico sem justificativa.

### Quando é atribuído

- `StatusCorrelacao` começa com `CORRELACIONADO`
- Não há `ProcedimentosAdicionais_PRODUCAO` (proc simples)
- Tabela TUSS indica `TipoCobranca = unico_cod_tuss_somente_proc_principal`
- `CodigoTUSS_REPASSE ≠ CodigosTUSS_Esperados`

### Impacto financeiro

⚠️ **Gera item no formulário de cobrança.** O valor estimado (`ValorEstimado_TUSS`) representa o valor do código correto. A diferença `ValorEstimado_TUSS − ValorLiberado_REPASSE` pode ser positiva (a cobrar) ou negativa (convênio pagou mais pelo código errado — sem ação financeira). Requer análise clínica para confirmar qual código é de fato correto.

### Volume no lote atual: 264 registros

---

#### Exemplo 5.A — Colonoscopia simples cobrada como Colonoscopia com Biópsia (código mais valorizado pago)

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/08/2025 | 31/07/2025 (1 dia antes) |
| **Paciente** | JOSMAR CLEITON CARNAVALE | JOSMAR CLEITON CARNAVALE |
| **Convênio** | CENTRAL NACIONAL | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia Com Biópsia E/Ou Citologia |
| **Adicional** | — | — |
| **Código TUSS pago** | — | **40202666** |
| **Código esperado** | — | **40201082** |
| **Valor Liberado** | — | R$ 560,00 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.95` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_CODIGO_PRINCIPAL_DIVERGENTE` |
| `CodigosTUSS_Esperados` | `40201082` |
| `DescricaoTUSS` | `Colonoscopia (Inclui A Retossigmoidoscopia)` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA sem adicional → chave "COLONO_"
2. Tabela TUSS: código esperado = 40201082 (Colonoscopia simples)
3. REPASSE pagou 40202666 (Colonoscopia com Biópsia) ≠ 40201082
4. StatusTUSS = TUSS_CODIGO_PRINCIPAL_DIVERGENTE ⚠️
   Análise: o hospital pagou código mais complexo (R$560) para proc simples
   → Convênio pagou mais → VALOR no formulário provavelmente negativo (sem ação)
   → Mas pode indicar que o Anátomo Patológico foi realizado e não registrado na PRODUÇÃO
```

---

#### Exemplo 5.B — Endoscopia simples cobrada como Endoscopia com Urease

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/12/2025 | 01/12/2025 |
| **Paciente** | WILTON JOSE LEMOS DA SILVA | WILTON JOSE LEMOS DA SILVA |
| **Convênio** | PROMOVE | — |
| **Procedimento** | ENDOSCOPIA | Endoscopia Digestiva Alta Com Biópsia E Teste De Urease |
| **Adicional** | — | — |
| **Código TUSS pago** | — | **40202615** |
| **Código esperado** | — | **40201120** |
| **Valor Liberado** | — | R$ 471,79 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.95` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_CODIGO_PRINCIPAL_DIVERGENTE` |
| `CodigosTUSS_Esperados` | `40201120` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta` |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA sem adicional → chave "ENDOSCOPIA_"
2. Tabela TUSS: código esperado = 40201120 (Endoscopia simples)
3. REPASSE pagou 40202615 (Endoscopia + Urease) ≠ 40201120
4. StatusTUSS = TUSS_CODIGO_PRINCIPAL_DIVERGENTE ⚠️
   Análise: se realmente não houve Urease, o hospital faturou código mais rico
   → Convênio pagou mais que o devido (R$471,79 vs ~R$150 esperado para 40201120)
   → Pode indicar Urease realizada mas não registrada na planilha de produção
```

---

#### Exemplo 5.C — Endoscopia com procedimento divergente (match anatômico suspeito)

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 02/08/2025 | 02/08/2025 |
| **Paciente** | JULIANO DE JESUS DE OLIVEIRA | JULIANO DE JESUS DE OLIVEIRA |
| **Convênio** | NOTRE DAME | — |
| **Procedimento PROD** | **ENDOSCOPIA** | **Colonoscopia** |
| **Adicional** | — | — |
| **Código TUSS pago** | — | **40201082** |
| **Código esperado** | — | **40201120** |
| **Valor Liberado** | — | R$ 273,00 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.73` |
| `StatusCorrelacao` | `CORRELACIONADO_PROCEDIMENTO_DIVERGENTE` |
| `StatusTUSS` | `TUSS_CODIGO_PRINCIPAL_DIVERGENTE` |
| `CodigosTUSS_Esperados` | `40201120` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta` |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA → match com Colonoscopia no REPASSE (mesmo paciente, mesma data)
2. Sistema detecta par anatômico incompatível → sufixo PROCEDIMENTO_DIVERGENTE
3. Tabela TUSS: ENDOSCOPIA esperaria 40201120, mas REPASSE pagou 40201082 (Colonoscopia)
4. StatusTUSS = TUSS_CODIGO_PRINCIPAL_DIVERGENTE ⚠️
   ATENÇÃO: este registro requer revisão humana prioritária (ver REVISAO_HUMANA.md)
   → Pode ser match falso: dois exames distintos no mesmo dia para o mesmo paciente
```

---

## Status 6 — `TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES`

### Definição

O procedimento foi realizado **com um adicional** que exige um código TUSS específico, mas o convênio pagou usando apenas o **código do procedimento simples** (sem o adicional), ignorando o código mais completo que deveria ter sido usado.

### Quando é atribuído

- `StatusCorrelacao` começa com `CORRELACIONADO`
- Existe `ProcedimentosAdicionais_PRODUCAO`
- Tabela TUSS indica `TipoCobranca = unico_cod_tuss_inclui_proc_adicional_e_principal`
- `CodigoTUSS_REPASSE ≠ CodigosTUSS_Esperados` (pagou o código simples em vez do composto)

### Impacto financeiro

⚠️ **Gera item no formulário de cobrança ("🔴 Cobrado Como Simples").** O valor a recuperar é calculado como `ValorEstimado(código_correto) − ValorEstimado(código_pago)`. **Atenção:** esse valor pode ser negativo quando o código simples tem tabela mais alta que o código composto para determinado convênio — nesses casos, não há valor a recuperar.

### Volume no lote atual: 872 registros

---

#### Exemplo 6.A — Endoscopia com Biópsia cobrada como Endoscopia simples

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/02/2025 | 30/01/2025 |
| **Paciente** | ROSANGELA CARA LOPES | ROSANGELA CARA LOPES |
| **Convênio** | PORTO SEGURO | — |
| **Procedimento** | ENDOSCOPIA | Endoscopia Digestiva Alta |
| **Adicional** | ANÁTOMO PATOLÓGICO | — |
| **Código pago** | — | **40201120** (simples) |
| **Código correto** | — | **40202038** (com biópsia) |
| **Valor Liberado** | — | R$ 98,64 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL` |
| `StatusCorrelacao` | `CORRELACIONADO_FALLBACK_2` |
| `StatusTUSS` | `TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES` |
| `CodigosTUSS_Esperados` | `40202038` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta Com Biópsia E/Ou Citologia` |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA + ANÁTOMO PATOLÓGICO → chave "ENDOSCOPIA_ANATOMO PATOLOGICO"
2. Tabela TUSS: TipoCobrança = "unico_cod_tuss_inclui_proc_adicional_e_principal"
   Código esperado: 40202038 (Endoscopia com Biópsia)
3. REPASSE pagou 40201120 (Endoscopia simples) ≠ 40202038
4. StatusTUSS = TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES ⚠️
   → O Anátomo foi ignorado; o hospital pagou como se fosse exame sem biópsia
   → Diferença: ValorEstimado(40202038) − ValorEstimado(40201120) = valor a cobrar
```

---

#### Exemplo 6.B — Colonoscopia com Polipectomia cobrada como Colonoscopia simples

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/02/2025 | 01/02/2025 |
| **Paciente** | HORACIO AUGUSTO DE SA | HORACIO AUGUSTO DE SA |
| **Convênio** | PORTO SEGURO | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Adicional** | POLIPECTOMIA | — |
| **Código pago** | — | **40201082** (colonoscopia simples) |
| **Código correto** | — | **40202542** (polipectomia de cólon) |
| **Valor Liberado** | — | R$ 211,50 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.95` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES` |
| `CodigosTUSS_Esperados` | `40202542` |
| `DescricaoTUSS` | `Polipectomia De Cólon (Independente Do Número De Pólipos)` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA + POLIPECTOMIA → tabela indica código composto 40202542
2. REPASSE pagou 40201082 (colonoscopia simples) em vez de 40202542 (com polipectomia)
3. StatusTUSS = TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES ⚠️
   → Polipectomia tem alto valor clínico e tabelado; diferença tende a ser positiva
   → Valor a cobrar: ValorEstimado(40202542) − ValorEstimado(40201082)
```

---

#### Exemplo 6.C — Colonoscopia com Mucosectomia cobrada como simples

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/04/2025 | 01/04/2025 |
| **Paciente** | SEBASTIAO ANTONIO NOGUEIRA | SEBASTIAO ANTONIO NOGUEIRA |
| **Convênio** | PETROBRAS | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Adicional** | MUCOSECTOMIA | — |
| **Código pago** | — | **40201082** (simples) |
| **Código correto** | — | **40202712** (Colonoscopia com Mucosectomia) |
| **Valor Liberado** | — | R$ 258,79 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.95` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES` |
| `CodigosTUSS_Esperados` | `40202712` |
| `DescricaoTUSS` | `Colonoscopia Com Mucosectomia` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA + MUCOSECTOMIA → código composto esperado: 40202712
2. REPASSE pagou 40201082 (simples) — não reconheceu o procedimento adicional
3. StatusTUSS = TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES ⚠️
   → Mucosectomia é procedimento de alto custo; diferença provavelmente positiva e relevante
```

---

## Status 7 — `TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE`

### Definição

O procedimento com adicional gera **múltiplos códigos TUSS separados** que devem aparecer individualmente no repasse, mas o sistema verificou que **um ou mais desses códigos estão ausentes** no repasse do episódio.

### Quando é atribuído

- `StatusCorrelacao` começa com `CORRELACIONADO`
- Existe `ProcedimentosAdicionais_PRODUCAO`
- Tabela TUSS indica `TipoCobranca = multiplos_cod_tuss_proced_adicional`
- Ao menos um código adicional **não foi encontrado** no índice do repasse para esse paciente/data

### Impacto financeiro

⚠️ **Gera item no formulário de cobrança ("🟠 Código Adicional Ausente").** O campo `CodigosTUSS_Ausentes` lista os códigos não encontrados. O `ValorEstimado_TUSS` traz o valor do primeiro código ausente. Cada código ausente representa uma cobrança separada não realizada pelo hospital.

### Volume no lote atual: 94 registros

---

#### Exemplo 7.A — Colonoscopia com Urease, código da Urease ausente no repasse

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/04/2025 | 01/04/2025 |
| **Paciente** | CRISTINA AZEVEDO DA SILVA | CRISTINA AZEVEDO DA SILVA |
| **Convênio** | GSC | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Adicional** | TESTE DE UREASE - NEGATIVO | — |
| **Código pago** | — | **40201082** (colonoscopia) |
| **Código ausente** | — | **40202615** (urease) |
| **Valor Liberado** | — | R$ 191,25 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE` |
| `CodigosTUSS_Esperados` | `40202615` |
| `CodigosTUSS_Ausentes` | `40202615` |
| `DescricaoTUSS` | `Colonoscopia + Teste De Urease Para Pesquisa De Helicobacter Pylori` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA + TESTE DE UREASE → tabela indica múltiplos códigos
   Esperados: [40201082 (base), 40202615 (urease)]
2. Código base 40201082 → encontrado no REPASSE (esse é o que está correlacionado)
3. Código adicional 40202615 → busca no índice: (CRISTINA, 01/04/2025, 40202615) → NÃO encontrado
4. StatusTUSS = TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE ⚠️
   CodigosTUSS_Ausentes = 40202615
   → O hospital pagou a Colonoscopia mas não lançou a cobrança separada da Urease
```

---

#### Exemplo 7.B — Colonoscopia com Biópsia e Polipectomia, ambos os códigos ausentes

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/08/2025 | 31/07/2025 |
| **Paciente** | FERNANDA DE ANDRADE POVOAÇÃO CHINELATO | FERNANDA DE ANDRADE POVOACAO CHINELATO |
| **Convênio** | BRADESCO | — |
| **Procedimento** | COLONOSCOPIA | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Adicional** | ANÁTOMO PATOLÓGICO/POLIPECTOMIA | — |
| **Código pago** | — | **40201082** (colonoscopia simples) |
| **Códigos ausentes** | — | **40202666, 40202542** |
| **Valor Liberado** | — | R$ 249,50 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE` |
| `CodigosTUSS_Esperados` | `40202666, 40202542` |
| `CodigosTUSS_Ausentes` | `40202666, 40202542` |
| `DescricaoTUSS` | `Colonoscopia Com Biópsia E Polipectomia` |

**Fluxo:**
```
1. PRODUÇÃO: COLONOSCOPIA + ANÁTOMO PATOLÓGICO/POLIPECTOMIA → múltiplos códigos
   Esperados: [40201082 (base), 40202666 (colonoscopia c/ biópsia), 40202542 (polipectomia)]
2. Verifica cada código adicional no índice do repasse:
   - 40202666 → NÃO encontrado ✗
   - 40202542 → NÃO encontrado ✗
3. StatusTUSS = TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE ⚠️
   CodigosTUSS_Ausentes = 40202666, 40202542
   → O hospital pagou apenas a colonoscopia base; dois procedimentos adicionais foram omitidos
   → Impacto financeiro alto: dois códigos de alto valor não cobrados
```

---

#### Exemplo 7.C — Endoscopia com Urease, Biópsia e Polipectomia — apenas polipectomia ausente

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/10/2025 | 01/10/2025 |
| **Paciente** | JOSE NEVES RINALDIN | JOSE NEVES RINALDIN |
| **Convênio** | BRADESCO | — |
| **Procedimento** | ENDOSCOPIA | Endoscopia Digestiva Alta Com Biópsia E Teste De Urease |
| **Adicional** | TESTE DE UREASE + ANÁTOMO + POLIPECTOMIA | — |
| **Código pago** | — | **40202615** (urease + endoscopia) |
| **Código ausente** | — | **40202550** (polipectomia) |
| **Valor Liberado** | — | R$ 184,62 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `StatusCorrelacao` | `CORRELACIONADO` |
| `StatusTUSS` | `TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE` |
| `CodigosTUSS_Esperados` | `40202615, 40202550` |
| `CodigosTUSS_Ausentes` | `40202550` |
| `DescricaoTUSS` | `Endoscopia Alta Com Urease E Polipectomia` |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA + UREASE + ANÁTOMO + POLIPECTOMIA → múltiplos códigos esperados
   Esperados: [40202615 (urease), 40202550 (polipectomia de esôfago/estômago)]
2. Verifica no índice:
   - 40202615 → encontrado ✓ (o que foi correlacionado)
   - 40202550 → NÃO encontrado ✗
3. StatusTUSS = TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE ⚠️
   CodigosTUSS_Ausentes = 40202550
   → Urease paga corretamente; apenas a Polipectomia está ausente no repasse
```

---

## Status 8 — `TUSS_NAO_FATURADO_MAPEADO`

### Definição

O procedimento consta na PRODUÇÃO mas **não foi encontrado em nenhum método de correlação** no REPASSE (o convênio não pagou). A combinação de procedimento + adicional foi localizada na tabela TUSS, portanto o sistema consegue indicar qual código deveria ter sido cobrado.

### Quando é atribuído

- `StatusCorrelacao = NAO_FATURADO_NO_REPASSE`
- `MetodoMatch = SEM_MATCH`
- A chave `Procedimento_Adicional` existe na tabela TUSS

### Impacto financeiro

🔴 **Gera item no formulário de cobrança ("❌ Procedimento Não Faturado").** O `ValorEstimado_TUSS` traz o valor integral do procedimento (não é uma diferença — é o valor total não recebido). Representa o impacto financeiro mais alto por registro, pois o procedimento inteiro está ausente do repasse.

### Volume no lote atual: 2.070 registros (maior grupo)

---

#### Exemplo 8.A — Endoscopia simples completamente ausente do repasse

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/02/2025 | — |
| **Paciente** | JOSE RODRIGUES DE OLIVEIRA | — |
| **Convênio** | BRADESCO | — |
| **Procedimento** | ENDOSCOPIA | (ausente) |
| **Adicional** | — | — |
| **Código esperado** | — | **40201120** |
| **Valor Liberado** | — | R$ 0,00 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `SEM_MATCH` |
| `StatusCorrelacao` | `NAO_FATURADO_NO_REPASSE` |
| `StatusTUSS` | `TUSS_NAO_FATURADO_MAPEADO` |
| `CodigosTUSS_Esperados` | `40201120` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta` |
| `ValorEstimado_TUSS` | `149.70` (valor histórico BRADESCO) |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA sem adicional → sistema tenta todos os 4 métodos de match
   - Método 1 (nome+data): não encontra → tenta ±1 dia → nada
   - Método 2 (NrAtendimento): não encontra
   - Fallback 1 (fuzzy): nenhum candidato com similaridade ≥ limiar
   - Fallback 2 (data ±7 dias): nenhum match
2. StatusCorrelacao = NAO_FATURADO_NO_REPASSE | MetodoMatch = SEM_MATCH
3. Verificação TUSS Branch A: chave "ENDOSCOPIA_" → encontra na tabela
   → código esperado: 40201120
   → StatusTUSS = TUSS_NAO_FATURADO_MAPEADO ⚠️
4. Enriquecimento: busca valor histórico de 40201120 para BRADESCO → R$149,70
   → ValorEstimado_TUSS = 149.70 (valor integral a cobrar)
```

---

#### Exemplo 8.B — Endoscopia com Anátomo Patológico, ausente do repasse

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/02/2025 | — |
| **Paciente** | VICTORIA CRISTINA DOS SANTOS PONTES | — |
| **Convênio** | BRADESCO | — |
| **Procedimento** | ENDOSCOPIA | (ausente) |
| **Adicional** | ANÁTOMO PATOLÓGICO | — |
| **Código esperado** | — | **40202038** |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `SEM_MATCH` |
| `StatusCorrelacao` | `NAO_FATURADO_NO_REPASSE` |
| `StatusTUSS` | `TUSS_NAO_FATURADO_MAPEADO` |
| `CodigosTUSS_Esperados` | `40202038` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta Com Biópsia E/Ou Citologia` |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA + ANÁTOMO PATOLÓGICO → todos os métodos falham → SEM_MATCH
2. Branch A: chave "ENDOSCOPIA_ANATOMO PATOLOGICO" → encontra na tabela
   → código composto esperado: 40202038 (Endoscopia com Biópsia)
   → StatusTUSS = TUSS_NAO_FATURADO_MAPEADO ⚠️
3. O código 40202038 vale mais que o simples 40201120 — impacto maior por ser exame com biópsia
```

---

#### Exemplo 8.C — Endoscopia sem convênio identificado (data ausente, sem dados)

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | — (ausente) | — |
| **Paciente** | ANDERSON PEIXOTO SANTOS | — |
| **Procedimento** | ENDOSCOPIA | (ausente) |
| **Adicional** | — | — |
| **Código esperado** | — | **40201120** |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `SEM_MATCH` |
| `StatusCorrelacao` | `NAO_FATURADO_NO_REPASSE` |
| `StatusTUSS` | `TUSS_NAO_FATURADO_MAPEADO` |
| `CodigosTUSS_Esperados` | `40201120` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta` |

**Fluxo:**
```
1. PRODUÇÃO: linha com data ausente → impossível buscar por (Data, Paciente)
   → Todos os métodos de match falham → SEM_MATCH
2. Branch A: chave "ENDOSCOPIA_" → tabela TUSS encontra código 40201120
   → StatusTUSS = TUSS_NAO_FATURADO_MAPEADO ⚠️
3. Sem convênio identificado: busca fallback GERAL na base de valores
   → ValorEstimado_TUSS preenchido com média geral do código 40201120
```

---

## Status 9 — `TUSS_REPASSE_SEM_PRODUCAO`

### Definição

Uma entrada do REPASSE (pagamento feito pelo hospital) **não encontrou correspondência** na planilha de PRODUÇÃO da clínica. O sistema registra o código TUSS pago como `CodigosTUSS_Esperados` para documentação, mas não pode avaliar se o pagamento está correto sem saber o que foi realizado.

### Quando é atribuído

- `StatusCorrelacao ∈ {REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO, REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO}`
- O sistema copia `CodigoTUSS_REPASSE` para `CodigosTUSS_Esperados`

### Impacto financeiro

📋 **Informativo — não gera item no formulário de cobrança.** Pode indicar: procedimento realizado em outra clínica, erro de lote, procedimento de período anterior, ou procedimento não registrado na planilha de produção. Requer conferência manual.

### Volume no lote atual: 650 registros

---

#### Exemplo 9.A — Colonoscopia paga sem produção correspondente

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | — | 01/03/2025 |
| **Paciente** | — | KLEBER ENDRIGO DE REZENDE |
| **Procedimento** | — | Colonoscopia (Inclui A Retossigmoidoscopia) |
| **Código TUSS** | — | **40201082** |
| **Valor Liberado** | — | R$ 221,20 |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | *(vazio)* |
| `StatusCorrelacao` | `REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO` |
| `StatusTUSS` | `TUSS_REPASSE_SEM_PRODUCAO` |
| `CodigosTUSS_Esperados` | `40201082` |
| `DescricaoTUSS` | `Colonoscopia (Inclui A Retossigmoidoscopia)` |

**Fluxo:**
```
1. REPASSE: colonoscopia paga para KLEBER ENDRIGO DE REZENDE em 01/03/2025
2. Sistema percorre linhas não-matcheadas do REPASSE (linha não foi consumida por nenhuma PRODUÇÃO)
3. Fallback 5 (companion): não é procedimento companion → não aplica
4. Fallback 6 (data fora do período): data dentro do período → não aplica
5. StatusCorrelacao = REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO
6. Branch B: copia CodigoTUSS_REPASSE → CodigosTUSS_Esperados = 40201082
   StatusTUSS = TUSS_REPASSE_SEM_PRODUCAO 📋
   → Verificar se a colonoscopia foi realizada pela clínica ou em outro estabelecimento
```

---

#### Exemplo 9.B — Retirada de corpo estranho paga sem produção

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | — | 01/04/2025 |
| **Paciente** | — | MAURICIO ROBERTO BUENO DE CAMPOS |
| **Procedimento** | — | Retirada De Corpo Estranho Do Esôfago, Estômago Ou Duodeno |
| **Código TUSS** | — | **40202577** |
| **Valor Liberado** | — | R$ 162,78 |

| Coluna CSV | Valor |
|---|---|
| `StatusCorrelacao` | `REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO` |
| `StatusTUSS` | `TUSS_REPASSE_SEM_PRODUCAO` |
| `CodigosTUSS_Esperados` | `40202577` |
| `DescricaoTUSS` | `Retirada de corpo estranho do esôfago, estômago ou duodeno` |

**Fluxo:**
```
1. REPASSE: procedimento de urgência pago (Retirada de corpo estranho) — pode não ter sido
   registrado na planilha de produção por ser emergência ou por erro de lançamento
2. StatusCorrelacao = REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO
3. StatusTUSS = TUSS_REPASSE_SEM_PRODUCAO 📋
   → Verificar se o procedimento foi realizado na clínica e incluir na próxima produção
```

---

#### Exemplo 9.C — Faturamento tardio de período anterior

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | — | **02/03/2024** (anterior ao período) |
| **Paciente** | — | ROSA MARIA COSTA |
| **Procedimento** | — | Colonoscopia Com Biópsia E/Ou Citologia |
| **Código TUSS** | — | **40202666** |
| **Valor Liberado** | — | R$ 300,53 |

| Coluna CSV | Valor |
|---|---|
| `StatusCorrelacao` | `REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO` |
| `StatusTUSS` | `TUSS_REPASSE_SEM_PRODUCAO` |
| `CodigosTUSS_Esperados` | `40202666` |
| `DescricaoTUSS` | `Colonoscopia Com Biópsia E Polipectomia` |

**Fluxo:**
```
1. REPASSE: pagamento de março/2024 — o arquivo de PRODUÇÃO cobre de janeiro/2025 em diante
2. Data mínima da PRODUÇÃO calculada: ~dezembro/2024 (com buffer de 30 dias)
3. Fallback 6: 02/03/2024 < data_mínima → StatusCorrelacao = REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO
4. StatusTUSS = TUSS_REPASSE_SEM_PRODUCAO 📋
   → Faturamento tardio legítimo: proceder ao arquivo de PRODUÇÃO de 2024 para confirmar
```

---

## Status 10 — `TUSS_COMBINACAO_SEM_MAPEAMENTO`

### Definição

A combinação `Procedimento_PRODUCAO + ProcedimentosAdicionais_PRODUCAO` **não existe** na tabela de mapeamento TUSS (152 entradas). O sistema não consegue indicar qual código TUSS deveria ser cobrado, portanto o registro não entra no formulário de cobrança.

### Quando é atribuído

**Para linhas CORRELACIONADO:**
- Existe `ProcedimentosAdicionais_PRODUCAO`
- A chave normalizada não existe na tabela TUSS
- Ou a entrada existe mas `TipoCobranca = sem_mapeamento_tuss`

**Para linhas NAO_FATURADO:**
- Nenhum dos métodos de match encontrou correspondência
- A chave `Procedimento_Adicional` não existe na tabela TUSS

### Impacto financeiro

📋 **Informativo — não gera item no formulário.** Representa uma **lacuna na tabela de mapeamento**. As combinações mais frequentes sem mapeamento (ex.: "ENDOSCOPIA + TESTE DE UREASE" com variações de grafia, "ECOENDOSCOPIA ALTA") devem ser cadastradas no arquivo `tuss_lookup_table.csv` para que o sistema passe a processar esses casos automaticamente.

### Volume no lote atual: 2 registros (no CSV atual; em outros lotes pode ser significativamente maior)

---

#### Exemplo 10.A — NAO_FATURADO sem procedimento principal registrado

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 02/12/2025 | — |
| **Paciente** | GABRIELLE ARAUJO ARAO DOS SANTOS | — |
| **Convênio** | AMIL | — |
| **Procedimento** | *(vazio)* | — |
| **Adicional** | *(vazio)* | — |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `SEM_MATCH` |
| `StatusCorrelacao` | `NAO_FATURADO_NO_REPASSE` |
| `StatusTUSS` | `TUSS_COMBINACAO_SEM_MAPEAMENTO` |

**Fluxo:**
```
1. PRODUÇÃO: linha com Procedimento_PRODUCAO vazio → chave TUSS = "_"
2. SEM_MATCH em todos os métodos → NAO_FATURADO_NO_REPASSE
3. Branch A: chave "_" → não existe na tabela TUSS
4. StatusTUSS = TUSS_COMBINACAO_SEM_MAPEAMENTO 📋
   → Ação: verificar o dado de origem; o procedimento não foi registrado na planilha
   → Corrigir a linha de produção com o procedimento correto e reprocessar
```

---

#### Exemplo 10.B — NAO_FATURADO com adicional mas sem procedimento principal

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 04/12/2025 | — |
| **Paciente** | LEONARDO GOMES DA SILVA | — |
| **Convênio** | BRADESCO | — |
| **Procedimento** | *(vazio)* | — |
| **Adicional** | ANÁTOMO PATOLÓGICO | — |

| Coluna CSV | Valor |
|---|---|
| `MetodoMatch` | `SEM_MATCH` |
| `StatusCorrelacao` | `NAO_FATURADO_NO_REPASSE` |
| `StatusTUSS` | `TUSS_COMBINACAO_SEM_MAPEAMENTO` |

**Fluxo:**
```
1. PRODUÇÃO: linha com Procedimento_PRODUCAO vazio mas com adicional preenchido
   → Chave normalizada: "_ANATOMO PATOLOGICO" → não existe na tabela (precisa do principal)
2. SEM_MATCH → NAO_FATURADO_NO_REPASSE
3. Branch A: chave "_ANATOMO PATOLOGICO" → não encontra na tabela
4. StatusTUSS = TUSS_COMBINACAO_SEM_MAPEAMENTO 📋
   → Ação: identificar qual foi o procedimento principal realizado nesse dia
   → Sem o procedimento principal, o sistema não pode determinar o código TUSS correto
```

---

#### Exemplo 10.C — Contexto de lote maior: combinações frequentes sem mapeamento

> Este exemplo não tem linha individual no CSV atual, mas documenta o padrão sistêmico identificado em análises anteriores do sistema.

| Combinação | Ocorrências (estimado) | Código TUSS sugerido |
|---|:---:|---|
| `ENDOSCOPIA + TESTE DE UREASE` (variações diversas) | ~241 | A mapear na tabela |
| `ECOENDOSCOPIA ALTA` (sem adicional) | ~85 | A mapear na tabela |
| `ENDOSCOPIA + TESTE DE UREASE - NEGATIVO` | ~50 | A mapear na tabela |
| `COLONOSCOPIA + ANÁTOMO PATOLÓGICO` (grafia alternativa) | ~25 | A mapear na tabela |

**Fluxo:**
```
1. PRODUÇÃO: ENDOSCOPIA + TESTE DE UREASE (grafia: "TESTE UREASE" sem "DE")
2. Chave normalizada: "ENDOSCOPIA_TESTE UREASE" → não existe na tabela
   (tabela tem "ENDOSCOPIA_TESTE DE UREASE" — partícula "DE" faz diferença na chave)
3. StatusTUSS = TUSS_COMBINACAO_SEM_MAPEAMENTO 📋
   → Ação: adicionar variações de grafia no tuss_lookup_table.csv
   → Ou normalizar a chave para ignorar partículas (melhoria no código de normalização)
```

---

## Referência rápida — Qual ação tomar por StatusTUSS

| StatusTUSS | Ação recomendada |
|---|---|
| `TUSS_PROC_PRINCIPAL_OK` | ✅ Nenhuma — arquivo |
| `TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL` | ✅ Nenhuma — arquivo |
| `TUSS_PROC_ADICIONAL_RECONHECIDO` | ✅ Nenhuma — arquivo |
| `TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS` | ✅ Nenhuma — arquivo |
| `TUSS_CODIGO_PRINCIPAL_DIVERGENTE` | ⚠️ Incluir no formulário se VALOR > 0; revisar se < 0 |
| `TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES` | ⚠️ Incluir no formulário se VALOR > 0; descartar se < 0 |
| `TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE` | ⚠️ Incluir no formulário — valor do código ausente |
| `TUSS_NAO_FATURADO_MAPEADO` | 🔴 Incluir no formulário — valor integral a cobrar |
| `TUSS_REPASSE_SEM_PRODUCAO` | 📋 Verificar nos registros históricos de produção |
| `TUSS_COMBINACAO_SEM_MAPEAMENTO` | 📋 Atualizar `tuss_lookup_table.csv` com a combinação |

---

*Documento gerado em 23/05/2026. Baseado na análise do lote `correlacao_endoscopia_20260522_210806.csv` e do código-fonte `app.py` (5.256 linhas).*
