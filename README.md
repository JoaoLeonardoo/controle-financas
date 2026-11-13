# 💰 Controle de Finanças

App de finanças pessoais: **React + Vite** (frontend estático no GitHub Pages) e **Supabase** (Auth + PostgreSQL).
Cadastre entradas e gastos (fixos ou extraordinários), filtre por mês e veja o saldo.

## Como a segurança funciona

- **Isolamento por usuário no banco:** a tabela `transactions` tem *Row Level Security* (RLS). Cada consulta só enxerga/altera linhas onde `user_id = auth.uid()`. Mesmo que alguém abra o DevTools e tente consultar dados de outro usuário, o Postgres bloqueia.
- **Chaves:** o frontend usa apenas a chave **anon (public)** do Supabase, que é pública por design — a proteção real é o RLS. A chave **`service_role` nunca deve entrar no projeto** (ela ignora o RLS).
- **Variáveis de ambiente:** URL e anon key ficam no `.env` (fora do Git) localmente e em *GitHub Secrets* na publicação.
- Em app 100% estático, qualquer valor embutido no build é visível no navegador. Por isso o modelo é: chave pública + RLS.

## 1. Configurar o Supabase

1. Crie um projeto em <https://supabase.com>.
2. Abra **SQL Editor → New query**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e execute.
3. Em **Project Settings → API**, copie **Project URL** e a chave **anon public**.
4. Em **Authentication → Providers → Email**, mantenha e-mail/senha ativo. A confirmação por e-mail vem ligada por padrão (recomendado).
5. Depois de publicar, em **Authentication → URL Configuration**, defina:
   - **Site URL:** `https://SEU-USUARIO.github.io/NOME-DO-REPO/`
   - **Redirect URLs:** a mesma URL (para o link de confirmação de e-mail voltar ao site).

## 2. Rodar localmente

```bash
npm install
cp .env.example .env     # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

## 3. Publicar no GitHub Pages

### 3.1 `base` do Vite

O site fica em `https://usuario.github.io/NOME-DO-REPO/`, então os assets precisam desse prefixo. O [`vite.config.js`](vite.config.js) lê `VITE_BASE_PATH`:

- local: `/`
- produção: `/NOME-DO-REPO/` (o workflow já calcula isso sozinho)

Se for publicar em `usuario.github.io` (repositório com esse nome), use `/`.

### 3.2 Roteamento (React Router)

O GitHub Pages não faz *fallback* para `index.html`, então rotas normais dão **404 ao recarregar**. A solução adotada é o **`HashRouter`** (em `src/main.jsx`): as rotas ficam depois do `#` (ex.: `/NOME-DO-REPO/#/login`) e funcionam sem configuração extra.

> Prefere URLs sem `#`? Troque por `<BrowserRouter basename={import.meta.env.BASE_URL}>` e copie `dist/index.html` para `dist/404.html` no build (truque do SPA no Pages). O HashRouter é mais simples e menos frágil.

### 3.3 Deploy automático

1. Crie o repositório no GitHub e envie o código para a branch `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. A cada `push` na `main`, o workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) faz o build e publica.

## Estrutura

```
supabase/schema.sql          tabela + RLS
src/lib/supabase.js          cliente Supabase (lê o .env)
src/context/AuthContext.jsx  sessão, login, cadastro, logout
src/components/              ProtectedRoute, TransactionForm, TransactionList
src/pages/                   Login, Dashboard
.github/workflows/deploy.yml build + deploy no Pages
```

## Funcionalidades

- **Editar tudo:** lançamentos (✎), recebimentos, depósitos das caixinhas, caixinhas, dívidas, cartões e compras. Em lançamento fixo, a edição vale para todos os meses.
- **Credores:** quem te deve. O que falta receber entra no patrimônio; "Recebi" lança uma entrada no mês.
- **Cartões de crédito:** fechamento, vencimento, limite, compras parceladas. A fatura aparece no mês do vencimento e só sai da carteira quando paga.
- **Aporte das caixinhas:** com aporte mensal, aparece todo mês nos lançamentos em destaque (amarelo/listrado) até você confirmar com "Coloquei ✓", que lança o depósito na caixinha.
- **Pagar antecipado / com desconto:** em qualquer gasto ou fatura, o botão "Pagar…" (ou "Pagar com desconto / antecipar" no cartão) deixa informar o valor realmente pago e o dia. O desconto (ou juros) aparece e é usado nos totais e no patrimônio. Dá para corrigir depois em "Pagamento".
- **Compras do cartão:** "Todas as compras do cartão" lista tudo, com ✎ para corrigir valor, parcelas, data e categoria, e × para excluir.
- **Gráficos por categoria:** você escolhe o tipo (rosca, pizza, barras, barras horizontais, linhas, empilhadas), o período (1 a 12 meses) e quais categorias entram; também dá para ver como tabela.
- **Patrimônio total:** carteira + caixinhas + a receber − contas vencidas não pagas, considerando a data de hoje.
- **Sobra do mês:** passa sozinha como entrada do mês seguinte ao virar o mês (pode desligar) ou pelo botão no card principal.

> Depois de atualizar o código, rode de novo o `supabase/schema.sql` no SQL Editor (ele cria as tabelas novas).
