alter table scenarios
  add column if not exists stock_allocation numeric not null default 1
  check (stock_allocation >= 0 and stock_allocation <= 1);
