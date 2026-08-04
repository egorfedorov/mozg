-- Promo codes for plan purchases: either a percentage off or a free month.
-- Codes are operator-minted; a redemption row per use makes "uses left" a
-- count, not a mutable counter that races.
create table promo_codes (
  code text primary key,
  -- 1-100. 100 = the free month.
  percent_off int not null check (percent_off between 1 and 100),
  max_uses int not null default 1 check (max_uses >= 1),
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table promo_redemptions (
  code text not null references promo_codes(code) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  plan text not null,
  discount_cents int not null,
  created_at timestamptz not null default now(),
  -- One use per person per code: a reusable code is max_uses, not one
  -- account hammering it monthly.
  primary key (code, user_id)
);
