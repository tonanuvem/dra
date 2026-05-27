# Guia de Revisão Humana — Registros que Exigem Atenção Manual

> Este documento identifica quais registros do CSV `correlacao_endoscopia` precisam de verificação humana antes de qualquer ação (cobrança, contestação ou arquivamento), descreve os filtros exatos a aplicar em cada coluna e ilustra o raciocínio com exemplos reais extraídos dos dados.

---

## 1. Por que alguns registros precisam de revisão humana?

O motor de correlação trabalha em cascata: quando o método mais preciso (nome completo + data exata) não encontra correspondência, ele tenta métodos progressivamente mais tolerantes — nome parecido (fuzzy), data flexível, número de atendimento. Cada tolerância adicional introduz a possibilidade de um **falso positivo**: o sistema declara que encontrou o mesmo paciente/procedimento quando na verdade pode ter encontrado outro.

Adicionalmente, mesmo quando o match é correto, pode haver **divergências de codificação TUSS** que precisam de julgamento clínico, ou **anomalias de valor** que devem ser confirmadas antes de emitir uma cobrança ao hospital.

A tabela abaixo resume os grupos de risco e o volume encontrado no lote atual:

| Prioridade | Filtro | Volume atual | Risco principal |
|:---:|---|:---:|---|
| 🔴 Alta | `StatusCorrelacao = CORRELACIONADO_PROCEDIMENTO_DIVERGENTE` | 16 | Match falso — procedimentos anatomicamente opostos |
| 🔴 Alta | `MetodoMatch = 3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA` | 8 | Nome diferente — pode ser outro paciente |
| 🟠 Média | `MetodoMatch = 4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL` | 50 | Data com gap de 2 a 7 dias |
| 🟠 Média | `MetodoMatch = 2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO` | 203 | Nome divergente entre PRODUÇÃO e REPASSE |
| 🟡 Baixa | `StatusCorrelacao = REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO` | 8 | Faturamento tardio de período anterior |
| 🟡 Baixa | `StatusTUSS = TUSS_COMBINACAO_SEM_MAPEAMENTO` (em NAO_FATURADO) | 675 | Combinação ausente da tabela TUSS — lacuna de mapeamento |

---

## 2. Grupos de revisão e filtros de coluna

### 2.1 🔴 Procedimento anatomicamente divergente

**Coluna-chave:** `StatusCorrelacao`  
**Valor a filtrar:** `CORRELACIONADO_PROCEDIMENTO_DIVERGENTE`

**O que aconteceu:** O sistema encontrou paciente e data coincidindo, mas a similaridade de texto fez o procedimento da PRODUÇÃO ("ENDOSCOPIA") cruzar com um procedimento do REPASSE de região anatômica diferente ("Colonoscopia"). O sistema sinaliza o problema mas **não bloqueia o match**, pois não tem como saber se foi um erro de cadastro ou se de fato são exames diferentes.

**Colunas a verificar na revisão:**

| Coluna | O que checar |
|---|---|
| `Procedimento_PRODUCAO` | Qual exame foi realizado pela clínica |
| `Procedimento_REPASSE` | Qual exame o hospital registrou e pagou |
| `CodigoTUSS_REPASSE` | Código efetivamente pago — é coerente com o procedimento do REPASSE? |
| `SimilaridadeProcedimento` | Valores entre 0,50 e 0,80 são os mais suspeitos |
| `ValorLiberado_REPASSE` | Um valor de colonoscopia pago para uma endoscopia é sinal claro de erro |

**Ação esperada:** Confirmar se os dois exames são do mesmo paciente/episódio, ou se houve troca de registro. Se forem exames distintos, desvincular manualmente e registrar ambos separadamente.

---

### 2.2 🔴 Match por nome parecido (fuzzy , nome parcial)

**Coluna-chave:** `MetodoMatch`  
**Valor a filtrar:** `3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA`  
**StatusCorrelacao correspondente:** `CORRELACIONADO_FALLBACK_1`

**O que aconteceu:** O nome completo do paciente não encontrou match exato. O sistema extraiu até 4 tokens significativos do nome (ex.: "MICHELE KAYRES FERNANDES") e os procurou no REPASSE de forma fuzzy. O risco é alto porque nomes com sobrenomes compostos podem cruzar com pacientes distintos que compartilham parte do nome.

**Colunas a verificar na revisão:**

| Coluna | O que checar |
|---|---|
| `Paciente_PRODUCAO` | Nome conforme a planilha da clínica |
| `Paciente_REPASSE` | Nome conforme o sistema do hospital |
| `Data_PRODUCAO` vs `Data_REPASSE` | Datas coincidindo valida o episódio; diferença de ±1 dia é aceitável |
| `Procedimento_PRODUCAO` vs `Procedimento_REPASSE` | Coerência clínica do match |
| `SimilaridadeProcedimento` | Acima de 0,90 é seguro; abaixo de 0,70 requer atenção especial |

**Ação esperada:** Confirmar que os dois nomes se referem ao mesmo paciente (erro de digitação, abreviação, nome social vs. nome completo). Se forem pessoas diferentes, o registro deve ser desmarcado e tratado como `NAO_FATURADO_NO_REPASSE`.

---

### 2.3 🟠 Match com data flexível (gap ≥ 2 dias)

**Coluna-chave:** `MetodoMatch`  
**Valor a filtrar:** `4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL`  
**StatusCorrelacao correspondente:** `CORRELACIONADO_FALLBACK_2`

**O que aconteceu:** O nome do paciente foi encontrado no REPASSE, mas a data difere em 2 a 7 dias em relação à PRODUÇÃO. Isso pode representar atraso de lançamento pelo hospital, ou — em casos raros — dois exames diferentes realizados na mesma semana pelo mesmo paciente.

**Colunas a verificar na revisão:**

| Coluna | O que checar |
|---|---|
| `Data_PRODUCAO` vs `Data_REPASSE` | Quantos dias de diferença? Acima de 3 dias, aumenta o risco |
| `Procedimento_PRODUCAO` vs `Procedimento_REPASSE` | Mesmo tipo de exame valida o match |
| `Convenio_PRODUCAO` vs `Convenio_REPASSE` | Convênio coincidindo é forte evidência de mesmo episódio |
| `NrAtendimento_REPASSE` | Verificar se coincide com `NrAtendimento_PRODUCAO` |

**Ação esperada:** Se o procedimento e convênio coincidem, o match provavelmente é correto (atraso administrativo). Se o exame é diferente, pode ser uma consulta distinta da mesma semana e o registro deve ser separado.

---

### 2.4 🟠 Match por número de atendimento (nomes divergentes)

**Coluna-chave:** `MetodoMatch`  
**Valor a filtrar:** `2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO`  
**StatusCorrelacao correspondente:** `CORRELACIONADO_VIA_NR_ATENDIMENTO`

**O que aconteceu:** O nome do paciente não gerou match; o sistema recorreu ao número de atendimento (NrAtendimento) como chave de cruzamento. **100% dos 203 registros nesta categoria apresentam divergência entre o nome registrado na PRODUÇÃO e o nome no REPASSE** — o que é esperado, pois foi justamente por isso que o nome falhou como chave.

A divergência costuma ser ortográfica (VERDUCO vs. VERDUGO, DOS vs. DO), mas pode também indicar nome social, nome de solteira vs. casada, ou — raramente — número de atendimento duplicado para paciente diferente.

**Colunas a verificar na revisão:**

| Coluna | O que checar |
|---|---|
| `Paciente_PRODUCAO` vs `Paciente_REPASSE` | A diferença é ortográfica ou são nomes completamente distintos? |
| `NrAtendimento_PRODUCAO` vs `NrAtendimento_REPASSE` | Devem coincidir — se não coincidirem, o match está errado |
| `Data_PRODUCAO` vs `Data_REPASSE` | Data é um validador secundário |
| `Procedimento_PRODUCAO` vs `Procedimento_REPASSE` | Coerência clínica |

**Ação esperada:** Se a diferença de nome for ortográfica/editorial e os demais campos coincidirem, o match é válido. Atualizar o cadastro do paciente em um dos sistemas para evitar recorrência. Se o nome for completamente diferente, investigar se o NrAtendimento foi reaproveitado pelo hospital.

---

### 2.5 🟡 Repasse de período anterior

**Coluna-chave:** `StatusCorrelacao`  
**Valor a filtrar:** `REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO`

**O que aconteceu:** O hospital processou um pagamento com data anterior ao período coberto pelo arquivo de PRODUÇÃO enviado (com buffer de 30 dias). Pode ser faturamento retroativo legítimo ou erro de lote.

**Colunas a verificar na revisão:**

| Coluna | O que checar |
|---|---|
| `Data_REPASSE` | Qual a data real do pagamento? |
| `Paciente_REPASSE` e `Procedimento_REPASSE` | O procedimento existe nos arquivos de PRODUÇÃO de períodos anteriores? |
| `ValorLiberado_REPASSE` | Valor condizente com o procedimento registrado |

**Ação esperada:** Verificar nos arquivos históricos de PRODUÇÃO anteriores se esse exame existe. Se sim, o pagamento é tardio e legítimo. Se não, pode ser erro de lote pelo hospital.

---

### 2.6 🟡 Combinação de procedimento sem mapeamento TUSS

**Coluna-chave:** `StatusTUSS`  
**Valor a filtrar:** `TUSS_COMBINACAO_SEM_MAPEAMENTO`

**O que aconteceu:** A combinação Procedimento + Adicional registrada na PRODUÇÃO não existe na tabela de mapeamento TUSS (152 entradas). O sistema não consegue indicar qual código TUSS seria o correto, portanto não gera item no formulário de cobrança. Podem ser combinações válidas que simplesmente ainda não foram cadastradas na tabela.

**Colunas a verificar na revisão:**

| Coluna | O que checar |
|---|---|
| `Procedimento_PRODUCAO` | Qual procedimento principal |
| `ProcedimentosAdicionais_PRODUCAO` | Qual adicional está faltando na tabela |
| `StatusCorrelacao` | Se for NAO_FATURADO, o valor não está sendo cobrado |

**Ação esperada:** Consultar a tabela TUSS oficial ANS e adicionar a combinação ao arquivo `tuss_lookup_table.csv`. As combinações mais frequentes não mapeadas são: "ENDOSCOPIA + TESTE DE UREASE" (241 casos), "ECOENDOSCOPIA ALTA" (85 casos) e "ENDOSCOPIA + TESTE DE UREASE - NEGATIVO" (50 casos).

---

## 3. Exemplos reais com fluxo completo

Os três exemplos abaixo foram extraídos diretamente do arquivo `correlacao_endoscopia_20260522_210806.csv`.

---

### Exemplo 1 — Match com procedimento anatomicamente divergente

**Risco: 🔴 Alto | Categoria: CORRELACIONADO_PROCEDIMENTO_DIVERGENTE**

#### Dados originais

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 02/08/2025 | 02/08/2025 |
| **Paciente** | JULIANO DE JESUS DE OLIVEIRA | JULIANO DE JESUS DE OLIVEIRA |
| **Convênio** | NOTRE DAME | — |
| **Procedimento** | **ENDOSCOPIA** | **Colonoscopia** |
| **Código TUSS** | — | 40201082 |
| **Valor Liberado** | — | R$ 273,00 |
| **Médico** | DRA. PATRICIA | — |

#### Colunas do CSV de correlação

| Coluna | Valor |
|---|---|
| `MetodoMatch` | `1_NOME_COMPLETO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.73` |
| `StatusCorrelacao` | `CORRELACIONADO_PROCEDIMENTO_DIVERGENTE` |
| `StatusTUSS` | `TUSS_CODIGO_PRINCIPAL_DIVERGENTE` |
| `CodigosTUSS_Esperados` | `40201120` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta` |

#### Fluxo percorrido

```
1. PRODUÇÃO: "ENDOSCOPIA" realizada em 02/08/2025 por JULIANO DE JESUS DE OLIVEIRA

2. Motor busca no REPASSE por (Data=02/08/2025, Paciente="JULIANO DE JESUS DE OLIVEIRA")
   → Encontra candidato: Colonoscopia em 02/08/2025, mesmo paciente

3. Calcula similaridade: "ENDOSCOPIA" ↔ "Colonoscopia" = 0.73 (≥ limiar 0,50 → aceita)

4. Verifica pares anatomicamente divergentes:
   → {ENDOSCOPIA, COLONOSCOPIA} está na lista de pares bloqueados
   → Adiciona sufixo: StatusCorrelacao = "CORRELACIONADO_PROCEDIMENTO_DIVERGENTE"

5. Verificação TUSS:
   → Tabela TUSS para "ENDOSCOPIA_" indica código esperado: 40201120
   → Código pago pelo REPASSE: 40201082 (Colonoscopia) ≠ 40201120 (Endoscopia)
   → StatusTUSS = TUSS_CODIGO_PRINCIPAL_DIVERGENTE
```

#### Por que precisa de revisão humana

O paciente pode ter realizado **dois exames diferentes no mesmo dia** (endoscopia alta + colonoscopia), e o sistema emparelhando incorretamente. Neste caso:
- A linha ENDOSCOPIA do PROD está incorretamente linkada à Colonoscopia do REPASSE
- A ENDOSCOPIA pode estar sem pagamento (deveria ser `NAO_FATURADO_NO_REPASSE`)
- A Colonoscopia pode estar sem produção (deveria ser `REPASSE_NAO_IDENTIFICADO`)

---

### Exemplo 2 — Match por nome fuzzy com nomes distintos

**Risco: 🔴 Alto | Categoria: CORRELACIONADO_FALLBACK_1**

#### Dados originais

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 02/10/2025 | 01/10/2025 |
| **Paciente** | MICHELE KAROLINNE KAYRES FERNANDES LAIYRES | MICHELLE KAROLINNE KARYS FERNANDES LAYRE **GUERREIRO** |
| **Procedimento** | ENDOSCOPIA | Endoscopia Digestiva Alta |
| **Código TUSS** | — | 40201120 |
| **Valor Liberado** | — | R$ 96,78 |

#### Colunas do CSV de correlação

| Coluna | Valor |
|---|---|
| `MetodoMatch` | `3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA` |
| `SimilaridadeProcedimento` | `0.95` |
| `StatusCorrelacao` | `CORRELACIONADO_FALLBACK_1` |
| `StatusTUSS` | `TUSS_PROC_PRINCIPAL_OK` |
| `CodigosTUSS_Esperados` | `40201120` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta` |

#### Fluxo percorrido

```
1. PRODUÇÃO: "ENDOSCOPIA" em 02/10/2025 para "MICHELE KAROLINNE KAYRES FERNANDES LAIYRES"

2. Motor tenta match principal (Método 1):
   → Chave (02/10/2025, "MICHELE KAROLINNE KAYRES FERNANDES LAIYRES") — não encontra no índice do REPASSE

3. Motor tenta tolerância ±1 dia (ainda Método 1):
   → Tenta (01/10/2025, ...) e (03/10/2025, ...) — nenhum match exato de nome

4. Fallback 1 (Método 3 — nome parcial fuzzy):
   → Extrai tokens: ["MICHELE", "KAROLINNE", "KAYRES", "FERNANDES"]
   → Procura no REPASSE de 02/10/2025 entradas que contenham ≥ 2 desses tokens
   → Encontra "MICHELLE KAROLINNE KARYS FERNANDES LAYRE GUERREIRO" (tokens comuns: KAROLINNE, FERNANDES)
   → Similaridade de procedimento: "ENDOSCOPIA" ↔ "Endoscopia Digestiva Alta" = 0.95 ✓
   → StatusCorrelacao = "CORRELACIONADO_FALLBACK_1"

5. Verificação TUSS:
   → ENDOSCOPIA simples → código esperado: 40201120
   → Código pago: 40201120 ✓ → StatusTUSS = TUSS_PROC_PRINCIPAL_OK
```

#### Por que precisa de revisão humana

O sobrenome **GUERREIRO** aparece no REPASSE mas não existe na PRODUÇÃO — e a grafia diverge em múltiplos pontos (MICHELL**E** vs MICHELL, KAYRES vs KARYS, LAIYRES vs LAYRE). Pode ser:
- **A mesma pessoa** com nome incompleto na planilha da clínica e nome completo no sistema do hospital
- **Outra paciente** com nome parcialmente similar

Adicionalmente, a data difere em 1 dia (02/10 vs 01/10), o que é dentro do limiar, mas combina com os outros sinais de alerta.

---

### Exemplo 3 — Match por número de atendimento com grafia divergente

**Risco: 🟠 Médio | Categoria: CORRELACIONADO_VIA_NR_ATENDIMENTO**

#### Dados originais

| Campo | PRODUÇÃO | REPASSE |
|---|---|---|
| **Data** | 01/04/2025 | 01/04/2025 |
| **Paciente** | JESSICA VERDUCO MIYAMATSU | JESSICA VERDUGO MIYAMATSU |
| **Convênio** | GSC | — |
| **Procedimento** | ENDOSCOPIA | Endoscopia Digestiva Alta Com Biópsia E Teste De Urease |
| **Adicional** | TESTE DE UREASE - NEGATIVO | — |
| **Código TUSS** | — | 40202615 |
| **Valor Liberado** | — | R$ 141,75 |
| **Médico** | DRA JÚLIA | — |

#### Colunas do CSV de correlação

| Coluna | Valor |
|---|---|
| `MetodoMatch` | `2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO` |
| `SimilaridadeProcedimento` | `0.95` |
| `StatusCorrelacao` | `CORRELACIONADO_VIA_NR_ATENDIMENTO` |
| `StatusTUSS` | `TUSS_PROC_ADICIONAL_RECONHECIDO` |
| `CodigosTUSS_Esperados` | `40202615` |
| `DescricaoTUSS` | `Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)` |

#### Fluxo percorrido

```
1. PRODUÇÃO: "ENDOSCOPIA + TESTE DE UREASE - NEGATIVO" em 01/04/2025
   Paciente: "JESSICA VERDUCO MIYAMATSU"

2. Motor tenta match principal (Método 1):
   → Chave (01/04/2025, "JESSICA VERDUCO MIYAMATSU") — não encontra no REPASSE
   → A grafia "VERDUCO" ≠ "VERDUGO" impede o match exato

3. Fallback por NrAtendimento (Método 2):
   → Busca pelo NrAtendimento da PRODUÇÃO na data 01/04/2025
   → Encontra entrada no REPASSE com o mesmo NrAtendimento
   → Procedimento do REPASSE: Endoscopia com Biópsia e Urease → similaridade 0.95 ✓
   → StatusCorrelacao = "CORRELACIONADO_VIA_NR_ATENDIMENTO"

4. Verificação TUSS:
   → Combinação: ENDOSCOPIA + TESTE DE UREASE
   → Tabela TUSS indica: tipo "unico_cod_tuss_inclui_proc_adicional_e_principal"
   → Código esperado: 40202615 (Endoscopia + Urease)
   → Código pago: 40202615 ✓ → StatusTUSS = TUSS_PROC_ADICIONAL_RECONHECIDO
```

#### Por que precisa de revisão humana

A diferença **VERDUCO vs VERDUGO** é um erro de digitação clássico (troca de 'o' por 'g'). O match é quase certamente correto — mesma data, mesmo convênio, mesmo exame, mesmo número de atendimento.

A revisão aqui é mais **cadastral do que de negócio**: confirmar que é a mesma pessoa e corrigir a grafia em um dos sistemas para evitar que esta paciente continue gerando fallback em lotes futuros. Sem a correção, toda vez que JESSICA for atendida, o sistema precisará recorrer ao NrAtendimento em vez de encontrá-la pelo nome.

---

## 4. Filtros prontos para aplicação no CSV

Para isolar rapidamente os registros que precisam de revisão, aplique os filtros abaixo na ferramenta de análise de sua preferência (Excel, Python, etc.):

```
StatusCorrelacao IN (
  'CORRELACIONADO_PROCEDIMENTO_DIVERGENTE',
  'CORRELACIONADO_FALLBACK_1',
  'CORRELACIONADO_FALLBACK_2',
  'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO'
)

OR MetodoMatch IN (
  '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO',
  '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA',
  '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL'
)

OR StatusTUSS = 'TUSS_COMBINACAO_SEM_MAPEAMENTO'
```

**Volume total de registros para revisão no lote atual:** 277 de 5.772 (4,8%)

---

## 5. Checklist de revisão por registro

Para cada registro identificado, responda:

- [ ] O **nome do paciente** na PRODUÇÃO e no REPASSE se refere à mesma pessoa?
- [ ] A **data** é compatível com o mesmo episódio de atendimento?
- [ ] O **procedimento** realizado (PRODUÇÃO) é coerente com o procedimento pago (REPASSE)?
- [ ] O **convênio** coincide entre os dois arquivos?
- [ ] O **NrAtendimento** (quando disponível) confirma o cruzamento?
- [ ] O **valor liberado** é compatível com o procedimento registrado?

Se a resposta for **NÃO** para qualquer item: o registro deve ser desmarcado e retratado conforme a situação real (criar linha NAO_FATURADO, ou criar linha REPASSE_NAO_IDENTIFICADO separada).

---

*Documento gerado em 23/05/2026. Baseado no lote `correlacao_endoscopia_20260522_210806.csv` (5.772 registros).*
