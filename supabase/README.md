# Supabase — Setup do Banco de Dados

Este diretório contém os scripts SQL que preparam o Supabase para o projeto de
Auditoria de Faturamento de Endoscopia.  
Execute-os **na ordem indicada abaixo** usando o **SQL Editor** do Supabase
(`https://supabase.com/dashboard → seu projeto → SQL Editor`).

---

## Ordem de execução

```
1. rbac-migration.sql
2. tuss-lookup-migration.sql   ← pode rodar junto com o passo 3
3. correlacao-migration.sql    ← pode rodar junto com o passo 2
4. rollback-migration.sql      ← obrigatoriamente após o passo 3
```

> **Todos os scripts são idempotentes** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
> Rodá-los mais de uma vez não cria duplicatas nem quebra dados existentes.

---

## Passo 1 — `rbac-migration.sql`

**Pré-requisito:** nenhum.

O que cria:

| Objeto | Descrição |
|---|---|
| Tabela `public.profiles` | Perfis de acesso dos usuários (role, ativo, nome) |
| Função `get_my_role()` | Retorna o role do usuário logado — usada em todas as RLS policies |
| Trigger `on_auth_user_created` | Cria um profile automático ao registrar novo usuário |
| Trigger `profiles_updated_at` | Mantém `atualizado_em` sempre atual |
| View `user_profiles_view` | Expõe dados de `auth.users` + `profiles` para o painel admin |
| Usuário admin inicial | `contato@dracharliana.com` / senha `Admin123` |
| RLS policies | Self-read, self-update (só `nome`), admin full access |

> **Após executar:** troque a senha do admin inicial no primeiro acesso.

---

## Passo 2 — `tuss-lookup-migration.sql`

**Pré-requisito:** passo 1 (`get_my_role()` deve existir).

O que cria:

| Objeto | Descrição |
|---|---|
| Tabela `public.tuss_lookup_table` | Mapeamento de combinações PRODUCAO → códigos TUSS oficiais |
| Índices de performance | Por `Proc_PRODUCAO_raw` e `TipoCobranca` |
| 152 registros seed | Extraídos da tabela interna do `app.py` |
| RLS policies | Todos os autenticados leem; editor/admin escrevem |

---

## Passo 3 — `correlacao-migration.sql`

**Pré-requisito:** passo 1 (`get_my_role()` deve existir).

O que cria:

| Objeto | Descrição |
|---|---|
| Extensão `pg_trgm` | Habilita busca ilike `%termo%` via índice GIN |
| Tabela `public.correlacao_endoscopia` | Tabela principal com ~55 colunas (dados PRODUCAO + REPASSE + TUSS + auditoria) |
| UNIQUE `(lote_processamento, hash_conteudo)` | Garante deduplicação intra-lote |
| 10 índices de performance | Para triggers, auditoria, dashboard e busca por nome |
| RLS policies | Leitura para todos; insert/update para editor/admin; delete para admin |
| Trigger `correlacao_enrich_on_insert` | **BEFORE INSERT:** calcula `hash_conteudo` (MD5/11 campos), detecta duplicatas cross-lote, faz carry-over de `decisao_humana` |
| Trigger `correlacao_audit_touch` | **BEFORE UPDATE:** preenche `revisado_em` quando o auditor toma uma decisão |

> **Responsabilidades por campo:**
>
> O `app.py` envia apenas `lote_processamento` + os 46 campos do CSV.  
> O banco calcula automaticamente: `id`, `hash_conteudo`, `is_duplicata`,
> `id_original`, `criado_em`, `decisao_humana` (carry-over),
> `revisado_em`, `notas_revisor`.

---

## Passo 4 — `rollback-migration.sql`

**Pré-requisito:** passos 1 e 3 (adiciona colunas em `correlacao_endoscopia` e
depende de `get_my_role()`).

O que cria/modifica:

| Objeto | Descrição |
|---|---|
| Colunas `ativo`, `desativado_em`, `desativado_por`, `motivo_desativacao`, `rollback_operacao_id` | Soft delete em `correlacao_endoscopia` — nenhum registro é deletado fisicamente |
| Tabela `public.operacoes_rollback` | Livro imutável de cada invalidação manual de carga |
| Tabela `public.lotes_carga` | Registro central de cada execução de carga (status `ativo` / `invalidado`) |
| 7 índices recriados | Todos os índices relevantes ganham o filtro `AND ativo = true` |
| Novo índice `corr_chave_ativo_nao_dup_idx` | Suporta o novo bloco D do trigger |
| Trigger `correlacao_enrich_on_insert` atualizado | Blocos B e C: `AND ativo = true`; bloco D (novo): desativa versão anterior do mesmo `ChaveCorrelacao` quando o conteúdo muda entre lotes |
| RLS policies | Para `operacoes_rollback` e `lotes_carga` |
| Backfill automático | Popula `lotes_carga` com os lotes que já existiam em `correlacao_endoscopia` |

> **Princípio de ciclo de vida dos registros após este passo:**
>
> - O `app.py` **nunca mais executa DELETE** — apenas insere.
> - O trigger desativa versões anteriores do mesmo registro quando o conteúdo muda.
> - Invalidações manuais (via frontend, menu *Carregamentos*) são rastreadas em
>   `operacoes_rollback` e marcam `ativo = false` em todos os registros do lote.
> - Todas as queries operacionais (auditoria, dashboard, faturamento) filtram
>   `ativo = true AND is_duplicata = false`.

---

## Resumo das dependências

```
rbac-migration.sql
│
├── tuss-lookup-migration.sql
│   └── (sem dependentes)
│
└── correlacao-migration.sql
    └── rollback-migration.sql
```

---

## Tabelas criadas (visão geral)

| Tabela | Script | Finalidade |
|---|---|---|
| `public.profiles` | rbac | Perfis e roles dos usuários |
| `public.tuss_lookup_table` | tuss-lookup | Mapeamento PRODUCAO → TUSS |
| `public.correlacao_endoscopia` | correlacao | Resultado do motor de correlação Python |
| `public.operacoes_rollback` | rollback | Log imutável de invalidações de carga |
| `public.lotes_carga` | rollback | Registro central por lote de carga |

---

## Como verificar se a instalação está correta

Cada script termina com um bloco `DO $$ ... $$` que emite `RAISE NOTICE` com
o resultado de cada verificação. Após executar cada arquivo, veja a aba
**Results** no SQL Editor — todas as linhas devem terminar com `OK ✓`.

Exemplo de saída esperada do passo 4:

```
=== Rollback Migration Check ===
Coluna ativo .............. OK ✓
Coluna rollback_op_id ..... OK ✓
Tabela operacoes_rollback . OK ✓
Tabela lotes_carga ........ OK ✓
Trigger enrich ............ OK ✓
Índice hash (ativo=true) .. OK ✓
Índice chave_ativo ........ OK ✓
Lotes backfillados ........ 0
================================
```

> `Lotes backfillados = 0` é esperado na primeira instalação (banco vazio).
> Será maior que zero se o passo 4 for executado após o banco já ter dados.
