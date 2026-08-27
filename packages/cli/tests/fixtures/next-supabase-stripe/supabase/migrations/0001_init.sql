create table if not exists customers (
  id uuid primary key,
  email text
);

create table if not exists orders (
  id uuid primary key,
  customer_id uuid references customers(id),
  total integer
);

create table if not exists widgets (
  id uuid primary key,
  name text
);
