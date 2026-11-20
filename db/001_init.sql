-- Phase 0: tenants + fake orders for Chai & Co.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- All data is fictional. Emails use example.com, a domain reserved for examples.

create table tenants (
  id   text primary key,              -- 'acme', 'chai': readable in SQL and logs
  name text not null
);

create table orders (
  id              bigint generated always as identity primary key,
  tenant_id       text not null references tenants(id),
  order_number    text not null,      -- what the customer types, e.g. CHAI-1001
  customer_email  text not null,      -- the bot checks this before showing an order
  status          text not null
                  check (status in ('placed', 'shipped', 'delivered', 'cancelled', 'returned')),
  items           jsonb not null,     -- [{ sku, name, qty, price_paise }]
  total_paise     integer not null check (total_paise >= 0),  -- ₹1 = 100 paise; never a float
  tracking_number text,
  placed_at       timestamptz not null default now(),
  delivered_at    timestamptz,        -- delivered_at + the return window answers "can I still return it?"
  unique (tenant_id, order_number),   -- order numbers are unique within each company, not globally
  -- an order has a delivery date exactly when it was delivered (or delivered and then returned)
  check ((delivered_at is not null) = (status in ('delivered', 'returned')))
);

-- RLS on with no policies: Supabase's public REST API (anon key) now sees nothing.
-- The Worker connects as the table owner through Hyperdrive, so it isn't affected.
-- Phase 3 adds real policies.
alter table tenants enable row level security;
alter table orders  enable row level security;

insert into tenants (id, name) values
  ('acme', 'Acme Cloud'),
  ('chai', 'Chai & Co');

-- Dates are relative to when you run this file. Chai & Co's return window is 7 days after delivery.
-- Covers: each status, inside vs outside the return window, refunds under vs over ₹500 (Phase 5),
-- and one customer with two orders.
insert into orders (tenant_id, order_number, customer_email, status, items, total_paise, tracking_number, placed_at, delivered_at) values
  ('chai', 'CHAI-1001', 'priya@example.com',  'placed',
   '[{"sku":"MASALA-250","name":"Masala Chai 250g","qty":1,"price_paise":24900}]',
   24900, null, now() - interval '1 day', null),

  ('chai', 'CHAI-1002', 'rahul@example.com',  'shipped',
   '[{"sku":"ASSAM-500","name":"Assam CTC 500g","qty":2,"price_paise":34900}]',
   69800, 'TRK-100002', now() - interval '3 days', null),

  -- delivered 2 days ago: inside the return window
  ('chai', 'CHAI-1003', 'ananya@example.com', 'delivered',
   '[{"sku":"KULHAD-6","name":"Kulhad Set of 6","qty":1,"price_paise":49900},{"sku":"GINGER-100","name":"Ginger Chai 100g","qty":1,"price_paise":14900}]',
   64800, 'TRK-100003', now() - interval '6 days', now() - interval '2 days'),

  -- delivered 5 days ago: inside the window, under ₹500
  ('chai', 'CHAI-1004', 'vikram@example.com', 'delivered',
   '[{"sku":"CARDAMOM-250","name":"Cardamom Chai 250g","qty":1,"price_paise":29900}]',
   29900, 'TRK-100004', now() - interval '9 days', now() - interval '5 days'),

  -- delivered 20 days ago: outside the window
  ('chai', 'CHAI-1005', 'meera@example.com',  'delivered',
   '[{"sku":"GIFTBOX","name":"Chai Gift Box","qty":1,"price_paise":119900}]',
   119900, 'TRK-100005', now() - interval '25 days', now() - interval '20 days'),

  -- delivered 10 days ago: just outside the window
  ('chai', 'CHAI-1006', 'arjun@example.com',  'delivered',
   '[{"sku":"GINGER-100","name":"Ginger Chai 100g","qty":3,"price_paise":14900}]',
   44700, 'TRK-100006', now() - interval '14 days', now() - interval '10 days'),

  -- priya's second order
  ('chai', 'CHAI-1007', 'priya@example.com',  'cancelled',
   '[{"sku":"ASSAM-500","name":"Assam CTC 500g","qty":1,"price_paise":34900}]',
   34900, null, now() - interval '8 days', null),

  ('chai', 'CHAI-1008', 'sana@example.com',   'returned',
   '[{"sku":"KULHAD-6","name":"Kulhad Set of 6","qty":1,"price_paise":49900}]',
   49900, 'TRK-100008', now() - interval '35 days', now() - interval '30 days'),

  -- delivered yesterday, ₹2,398: a refund this big needs human approval in Phase 5
  ('chai', 'CHAI-1009', 'rahul@example.com',  'delivered',
   '[{"sku":"GIFTBOX","name":"Chai Gift Box","qty":2,"price_paise":119900}]',
   239800, 'TRK-100009', now() - interval '4 days', now() - interval '1 day'),

  ('chai', 'CHAI-1010', 'kabir@example.com',  'shipped',
   '[{"sku":"MASALA-250","name":"Masala Chai 250g","qty":1,"price_paise":24900},{"sku":"CARDAMOM-250","name":"Cardamom Chai 250g","qty":1,"price_paise":29900}]',
   54800, 'TRK-100010', now() - interval '2 days', null);

-- Check (run separately): should show 10 rows; 3 orders are returnable (1003, 1004, 1009).
-- select order_number, status, total_paise / 100.0 as rupees,
--        delivered_at > now() - interval '7 days' as returnable
-- from orders order by order_number;
