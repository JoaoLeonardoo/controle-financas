-- Execute no Supabase: SQL Editor > New query > Run
-- Pode rodar quantas vezes quiser (também atualiza um banco já existente).

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type in ('income', 'expense')),
  kind        text,
  description text not null check (char_length(description) between 1 and 120),
  amount      numeric(12,2) not null check (amount > 0),
  date        date not null,
  months      int check (months between 1 and 600),  -- duração de lançamentos fixos; null = para sempre
  created_at  timestamptz not null default now()
);

alter table public.transactions add column if not exists months int check (months between 1 and 600);

-- Corrige o erro "transactions_kind_check": regra antiga que não aceitava renda variável
alter table public.transactions drop constraint if exists transactions_kind_check;

-- Regras de tipo:  gasto = fixed | extraordinary   entrada = fixed | variable
alter table public.transactions drop constraint if exists kind_matches_type;
update public.transactions set kind = 'variable' where type = 'income' and kind is null;
alter table public.transactions add constraint kind_matches_type check (
  (type = 'expense' and kind in ('fixed', 'extraordinary')) or
  (type = 'income'  and kind in ('fixed', 'variable'))
);
alter table public.transactions drop constraint if exists months_only_fixed;
alter table public.transactions add constraint months_only_fixed check (months is null or kind = 'fixed');

-- Categorias de gasto
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index if not exists categories_user_name_idx on public.categories (user_id, lower(name));

alter table public.transactions add column if not exists category_id uuid references public.categories(id) on delete set null;
alter table public.transactions drop constraint if exists category_only_expense;
alter table public.transactions add constraint category_only_expense check (category_id is null or type = 'expense');

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

alter table public.transactions enable row level security;
revoke all on public.transactions from anon;

drop policy if exists "ver apenas os proprios registros" on public.transactions;
drop policy if exists "inserir apenas para si" on public.transactions;
drop policy if exists "editar apenas os proprios registros" on public.transactions;
drop policy if exists "apagar apenas os proprios registros" on public.transactions;

create policy "ver apenas os proprios registros" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "inserir apenas para si" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "editar apenas os proprios registros" on public.transactions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "apagar apenas os proprios registros" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.categories enable row level security;
revoke all on public.categories from anon;

drop policy if exists "categorias: ver" on public.categories;
drop policy if exists "categorias: criar" on public.categories;
drop policy if exists "categorias: editar" on public.categories;
drop policy if exists "categorias: apagar" on public.categories;

create policy "categorias: ver" on public.categories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "categorias: criar" on public.categories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "categorias: editar" on public.categories
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categorias: apagar" on public.categories
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ===== Pagamentos, pagamento automático e caixinhas de investimento =====
alter table public.transactions add column if not exists auto_pay boolean not null default false;

-- um registro = a conta daquele mês foi paga (vale também p/ cada mês de um gasto fixo)
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  month          text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at     timestamptz not null default now(),
  unique (transaction_id, month)
);

create table if not exists public.pots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  bank       text not null default 'Outro',
  rate_mode  text not null default 'cdi' check (rate_mode in ('cdi', 'annual')),
  rate       numeric(7,2) not null default 100 check (rate >= 0),   -- % do CDI  ou  % ao ano
  balance    numeric(12,2) not null default 0 check (balance >= 0),  -- saldo inicial
  monthly    numeric(12,2) not null default 0 check (monthly >= 0),  -- aporte mensal planejado
  goal       numeric(12,2) check (goal > 0),                         -- meta (opcional)
  created_at timestamptz not null default now()
);

create table if not exists public.pot_deposits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pot_id     uuid not null references public.pots(id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  extra      boolean not null default false,
  date       date not null default current_date,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['payments', 'pots', 'pot_deposits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "somente o dono" on public.%I', t);
    execute format('create policy "somente o dono" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- ===== Credores (quem me deve), cartões de crédito, sobras e aportes automáticos =====

-- quem me deve: "amount" é o total; cada recebimento fica em "receipts"
create table if not exists public.receivables (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person      text not null check (char_length(person) between 1 and 60),
  description text not null default '' check (char_length(description) <= 120),
  amount      numeric(12,2) not null check (amount > 0),
  due_date    date,                                   -- previsão de pagamento (opcional)
  created_at  timestamptz not null default now()
);

create table if not exists public.receipts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  receivable_id uuid not null references public.receivables(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  date          date not null default current_date,
  created_at    timestamptz not null default now()
);

-- cartões: a fatura de cada mês é calculada pelo app a partir das compras
create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  closing_day  int  not null check (closing_day between 1 and 31),
  due_day      int  not null check (due_day between 1 and 31),
  credit_limit numeric(12,2) check (credit_limit > 0),
  auto_pay     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.card_purchases (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id      uuid not null references public.cards(id) on delete cascade,
  description  text not null check (char_length(description) between 1 and 120),
  amount       numeric(12,2) not null check (amount > 0),          -- valor TOTAL da compra
  installments int not null default 1 check (installments between 1 and 120),
  date         date not null,
  category_id  uuid references public.categories(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.card_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id    uuid not null references public.cards(id) on delete cascade,
  month      text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),  -- mês de vencimento da fatura
  created_at timestamptz not null default now(),
  unique (card_id, month)
);

-- sobra do mês anterior que entra como entrada no mês "month" (amount 0 = decidido, sem sobra)
create table if not exists public.carryovers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month      text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount     numeric(12,2) not null check (amount >= 0),
  source     text not null default 'auto' check (source in ('auto', 'manual')),
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create table if not exists public.user_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  auto_carry       boolean not null default true,
  auto_carry_since text not null check (auto_carry_since ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at       timestamptz not null default now()
);

-- aporte mensal confirmado: o depósito guarda de qual mês ele é (no máximo um por caixinha/mês)
alter table public.pot_deposits add column if not exists for_month text check (for_month ~ '^[0-9]{4}-[0-9]{2}$');
create unique index if not exists pot_deposits_planned_idx on public.pot_deposits (pot_id, for_month) where for_month is not null;

do $$
declare t text;
begin
  foreach t in array array['receivables', 'receipts', 'cards', 'card_purchases', 'card_payments', 'carryovers', 'user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "somente o dono" on public.%I', t);
    execute format('create policy "somente o dono" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- ===== Pagamento antecipado / com desconto =====
-- paid_amount: valor que você realmente pagou (null = valor cheio); paid_on: dia em que pagou
alter table public.payments      add column if not exists paid_amount numeric(12,2) check (paid_amount > 0);
alter table public.payments      add column if not exists paid_on date;
alter table public.card_payments add column if not exists paid_amount numeric(12,2) check (paid_amount > 0);
alter table public.card_payments add column if not exists paid_on date;
